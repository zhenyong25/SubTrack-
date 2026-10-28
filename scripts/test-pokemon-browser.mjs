import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable) throw new Error('A Chromium browser is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-pokemon-browser-'));
let browser, socket, server;
try {
  const bundle = await build({ stdin: { contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import PokemonCardPicker from './components/PokemonCardPicker';
    import PokemonCardPanel from './components/PokemonCardPanel';
    window.fetch = async (url) => {
      if (url === '/api/pokemon/market') {
        window.marketCalls = (window.marketCalls || 0) + 1;
        if (window.marketFail) return new Response('', {status:503});
        return new Response(JSON.stringify({fetchedAt:new Date().toISOString(),messages:[],quotes:[{source:'Guardian TCG',sourceId:'2929059',grade:'Raw',amount:6.48,currency:'USD',variant:'Provider default printing',updatedAt:'2026-10-19T08:42:30.255Z',url:'https://guardiantcg.app/pokemon-chn/gem-pack-6/kecleon-1107?id=2929059',basis:'Published market quote; not an individual completed sale'},{source:'Guardian TCG',sourceId:'2929059',grade:'PSA 10',amount:87,currency:'USD',variant:'Provider default printing',updatedAt:null,url:'https://guardiantcg.app/pokemon-chn/gem-pack-6/kecleon-1107?id=2929059',basis:'Cached PSA quote; provider does not supply its price date or sale sample'}]}));
      }
      if (url.includes('pokemon-species')) return new Response(JSON.stringify({names:[{language:{name:'en'},name:'Kecleon'}]}));
      if (url.includes('PTCG-CHS-Datasets') && url.endsWith('.json')) return new Response(JSON.stringify({collections:[{id:511,commodityCode:'CBB6C',name:'宝石包 VOL.6',cards:[{id:21375,name:'变隐龙',image:'img/511/76.png',details:{collectionNumber:'11 07/07',rarityText:'★★★',pokedexCode:'0352'}}]}]}));
      const language = url.includes('/ja/') ? 'Japanese' : 'English';
      const cards = [{id: 'base1-4', localId: '4', name: language + ' Charizard'}];
      return new Response(JSON.stringify(url.endsWith('/sets') ? [{id: 'base1', name: 'Base Set', cardCount: {total: 102, official: 102}}] : {id:'base1', name:'Base Set', cards}));
    };
    function Harness() {
      const [card, setCard] = useState({ id: 'test', name:'', set:'', number:'', language:'', prices:[] });
      return <><PokemonCardPicker card={card} onChange={patch => setCard(c => ({...c, ...patch}))} /><pre id="state">{JSON.stringify(card)}</pre><div id="panel"><PokemonCardPanel baseCurrency="SGD" /></div></>;
    }
    createRoot(document.getElementById('root')).render(<Harness />);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{name: 'offline-storage', setup(builder) {
    builder.onLoad({ filter: /[\\/]appDataService\.ts$/ }, () => ({ contents: 'export const getSupabaseClient = () => null;', loader: 'js' }));
  }}] });
  server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : '<div id="root"></div><script type="module" src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const browserUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Browser startup timed out')), 15000);
    browser.on('error', reject);
    browser.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  const target = await (await fetch(`http://${new URL(browserUrl).host}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); const callback = pending.get(message.id); if (callback) { pending.delete(message.id); message.error ? callback.reject(message.error) : callback.resolve(message.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description); return result.result.value; };
  const waitFor = async expression => { for (let i = 0; i < 60; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`); };
  const select = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  const fill = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  const state = () => evaluate(`JSON.parse(document.getElementById('state').textContent)`);
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await waitFor(`Boolean(document.querySelector('select'))`);
  assert.equal(await evaluate(`document.querySelector('input[placeholder^="e.g. 151"]').disabled`), true);
  await select('select', 'English');
  await waitFor(`Boolean(document.querySelector('select[aria-label] option[value="base1"]'))`);
  await select('select[aria-label]', 'base1');
  await waitFor(`!document.querySelector('input[placeholder^="e.g. 004"]').disabled`);
  await fill('input[placeholder^="e.g. 004"]', '004/102');
  await waitFor(`JSON.parse(document.getElementById('state').textContent).name === 'English Charizard'`);
  assert.equal((await state()).catalogId, 'base1-4');
  await fill('input[placeholder^="e.g. 004"]', '999');
  await waitFor(`!JSON.parse(document.getElementById('state').textContent).name`);
  assert.equal((await state()).catalogId, undefined);
  await select('select', 'Japanese');
  await waitFor(`!JSON.parse(document.getElementById('state').textContent).catalogSetId`);
  assert.equal((await state()).number, '');
  await waitFor(`Boolean(document.querySelector('select[aria-label] option[value="base1"]'))`);
  await select('select[aria-label]', 'base1');
  await waitFor(`!document.querySelector('input[placeholder^="e.g. 004"]').disabled`);
  await fill('input[placeholder^="e.g. 004"]', '4');
  await waitFor(`JSON.parse(document.getElementById('state').textContent).name === 'Japanese Charizard'`);
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Enter manually')).click()`);
  await waitFor(`!document.querySelector('input[placeholder="Enter card name"]').readOnly`);
  assert.equal((await state()).catalogId, undefined);
  await evaluate(`[...document.querySelectorAll('#panel button')].find(b => b.textContent.includes('Add card')).click()`);
  await waitFor(`Boolean(document.querySelector('#panel form'))`);
  assert.equal(await evaluate(`document.querySelector('#panel form select').value`), 'Raw');
  assert.equal(await evaluate(`Boolean(document.querySelector('#panel form input[pattern]'))`), false);
  await evaluate(`(() => { const el = [...document.querySelectorAll('#panel form select')].find(s => [...s.options].some(o => o.value === 'Simplified Chinese')); el.value = 'Simplified Chinese'; el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await waitFor(`Boolean(document.querySelector('#panel select[aria-label] option[value="CBB6C"]'))`);
  assert.ok(await evaluate(`document.querySelector('#panel select[aria-label] option[value="CBB6C"]').textContent.includes('1 catalog entries')`));
  await select('#panel form select[aria-label]', 'CBB6C');
  await waitFor(`!document.querySelector('#panel input[placeholder^="e.g. 004"]').disabled`);
  await fill('#panel input[placeholder^="e.g. 004"]', '1107/07');
  await waitFor(`document.querySelector('#panel input[placeholder="Select a set and find your card"]').value === '变隐龙'`);
  await waitFor(`document.querySelector('#panel').innerText.includes('English Pokémon name: Kecleon')`);
  await evaluate(`document.querySelector('#panel button[type="submit"]').click()`);
  await waitFor(`JSON.parse(localStorage.getItem('subtrack_pokemon_watchlist_v1:guest') || '[]').length === 1`);
  const saved = await evaluate(`JSON.parse(localStorage.getItem('subtrack_pokemon_watchlist_v1:guest'))[0]`);
  assert.equal(saved.grade, 'Raw');
  assert.equal(saved.number, '11 07/07');
  assert.equal(saved.name, '变隐龙');
  assert.equal(saved.englishSpeciesName, 'Kecleon');
  assert.equal(saved.rarity, '★★★');
  assert.equal(saved.catalogId, 'chs-511-21375');
  assert.equal(saved.catalogSetId, 'CBB6C');
  assert.equal(saved.certificate, '');
  await waitFor(`document.querySelector('#panel').innerText.includes('6.48 USD')`);
  assert.ok(await evaluate(`window.marketCalls >= 1`));
  assert.equal(await evaluate(`[...document.querySelectorAll('#panel button')].some(b => b.textContent.includes('Log price'))`), false);
  assert.ok(await evaluate(`document.querySelector('#panel').innerText.includes('87 USD')`));
  await evaluate(`window.marketFail = true; [...document.querySelectorAll('#panel button')].find(b => b.textContent.includes('Refresh market')).click()`);
  await waitFor(`document.querySelector('#panel').innerText.includes('could not be fetched')`);
  assert.ok(await evaluate(`document.querySelector('#panel').innerText.includes('6.48 USD')`), 'failed refresh preserves the last quote');
  const snapshotCount = await evaluate(`Object.keys(localStorage).filter(k => k.startsWith('subtrack_pokemon_market_v1:')).length`);
  assert.equal(snapshotCount, 1);
  console.log('Browser checks passed: exact Chinese identity, automatic raw/PSA fetching without price entry, snapshot persistence, and preserving prices on refresh failure.');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill(); await Promise.race([new Promise(resolve => browser.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2000))]); }
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-pokemon-browser-')) throw new Error('Unexpected browser directory');
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Browser may still hold its temporary profile. */ }
}
