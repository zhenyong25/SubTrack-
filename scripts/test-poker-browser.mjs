// Uses an installed Chromium browser; no browser-test dependency is required.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(existsSync);
if (!executable) throw new Error('Set CHROME_PATH to an installed Chromium browser.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-picker-browser-'));
let browser;
let socket;
let server;
try {
  const result = await build({
    stdin: { contents: `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import InvestmentTab from './components/InvestmentTab';
const holdings = [{ id:'poker', name:'Poker bankroll', kind:'Poker (MTT)', units:1, averageCost:0, currentPrice:0, currency:'USD', color:'#22c55e', isActive:true }];
function Harness() {
const [events,setEvents]=useState([
{id:'deposit',investmentId:'poker',eventDate:'2026-08-01',eventType:'Deposit',amountUsd:400},
{id:'withdrawal',investmentId:'poker',eventDate:'2026-08-02',eventType:'Withdrawal',amountUsd:50},
{id:'adjustment',investmentId:'poker',eventDate:'2026-08-03',eventType:'Adjustment',amountUsd:10},
{id:'unrelated',investmentId:'other',eventDate:'2026-08-03',eventType:'Deposit',amountUsd:999}]);
return <div style={{maxWidth:680,margin:'0 auto'}}><InvestmentTab baseCurrency="SGD" investments={holdings} valuations={[]} transactions={[]} pokerMttTournaments={[{id:'tournament',investmentId:'poker',tournamentDate:'2026-08-04',tournamentName:'Sunday tournament',entries:1,buyInUsd:15,cashoutUsd:25.19,bountyUsd:0}]} pokerMttBankrollTransactions={events} onAddTransaction={()=>{}} onDeleteTransaction={async()=>{}} onCreateHolding={()=>{}} onAddPokerMttTournament={()=>{}} onDeletePokerMttTournament={()=>{}} onAddPokerMttBankrollTransaction={event=>setEvents(current=>[...current,event])} onDeletePokerMttBankrollTransaction={async id=>{if(window.__deleteFailure) throw new Error('Test delete failed'); setEvents(current=>current.filter(event=>event.id!==id));}} /></div>;
}
createRoot(document.getElementById('root')).render(<Harness />);
`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm',
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-catalog', setup(builder) {
      builder.onLoad({ filter: /[\\/]appDataService\.ts$/ }, () => ({ contents: 'export const getSupabaseClient = () => null;', loader: 'js' }));
    } }],
  });
  const cssFile = readdirSync('dist/assets').find(file => file.endsWith('.css'));
  const css = cssFile ? readFileSync(path.join('dist/assets', cssFile)) : '';
  server = createServer((request, response) => {
    if (/^\/service-logos\/[a-z0-9.-]+\.(png|ico)$/.test(request.url)) {
      const logoPath = path.join(process.cwd(), 'public', request.url);
      if (!existsSync(logoPath)) { response.statusCode = 404; response.end(); }
      else { response.setHeader('Content-Type', request.url.endsWith('.png') ? 'image/png' : 'image/x-icon'); response.end(readFileSync(logoPath)); }
    }
    else if (request.url === '/app.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(result.outputFiles[0].text); }
    else if (request.url === '/styles.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); }
    else if (request.url === '/logo.png') { response.setHeader('Content-Type', 'image/png'); response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')); }
    else if (request.url === '/missing.png') { response.statusCode = 404; response.end(); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const browserUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Browser startup timed out')), 15000);
    browser.on('error', reject);
    browser.stderr.on('data', data => {
      const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  const devtools = new URL(browserUrl);
  const target = await (await fetch(`http://${devtools.host}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); message.error ? callback.reject(message.error) : callback.resolve(message.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 70; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out: ${expression}`);
  };
  const fill = (selector, value) => evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const key = async value => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: value });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value });
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });

  const pokerButton = "[...document.querySelectorAll('button')].find(button => button.textContent.startsWith('Poker (MTT)'))";
  await waitFor('Boolean(' + pokerButton + ')');
  await evaluate(pokerButton + '.click()');
  await waitFor("document.body.textContent.includes('Total cash deposited')");
  assert.equal(await evaluate("document.querySelectorAll('form').length"), 0);
  await evaluate("document.querySelector('[aria-controls=poker-tournament-form]').click()");
  await waitFor("document.querySelectorAll('form').length === 1");
  assert.equal(await evaluate("document.querySelector('form h4').textContent"), 'Add Tournament');
  assert.ok(await evaluate("Boolean(document.querySelector('form').compareDocumentPosition(document.querySelector('svg.w-full')) & Node.DOCUMENT_POSITION_FOLLOWING)"));
  const cashSection = "[...document.querySelectorAll('section')].find(section => section.textContent.includes('Total cash deposited'))";
  assert.ok(await evaluate(cashSection + ".textContent.includes('400 USD')"));
  assert.ok(!await evaluate(cashSection + ".textContent.includes('999')"));
  assert.ok(await evaluate("document.body.textContent.includes('370.19 USD')"));
  assert.ok(!await evaluate("document.body.textContent.includes('Entry Flow')"));
  await evaluate("document.querySelector('[aria-controls=poker-bankroll-form]').click()");
  await waitFor("Boolean(document.querySelector('#poker-bankroll-form'))");
  assert.equal(await evaluate("document.querySelectorAll('form').length"), 1);
  await fill('#poker-bankroll-form input[type="number"]', '125.50');
  await evaluate("document.querySelector('#poker-bankroll-form button[type=submit]').click()");
  await waitFor(cashSection + ".textContent.includes('525.5 USD')");
  assert.equal(await evaluate("document.querySelectorAll('form').length"), 0);
  await evaluate("window.confirm = () => false; document.querySelector('[aria-label=\"Delete deposit of 125.5 USD\"]').click()");
  assert.ok(await evaluate(cashSection + ".textContent.includes('525.5 USD')"));
  await evaluate("window.confirm = () => true; window.__deleteFailure = true; document.querySelector('[aria-label=\"Delete deposit of 125.5 USD\"]').click()");
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('Test delete failed')");
  assert.ok(await evaluate(cashSection + ".textContent.includes('525.5 USD')"));
  await evaluate("window.__deleteFailure = false; document.querySelector('[aria-label=\"Delete deposit of 125.5 USD\"]').click()");
  await waitFor(cashSection + ".textContent.includes('400 USD') && !" + cashSection + ".textContent.includes('125.5 USD')");
  for (const label of ['Delete deposit of 400 USD', 'Delete withdrawal of 50 USD', 'Delete adjustment of 10 USD']) {
    await evaluate("document.querySelector('[aria-label=" + JSON.stringify(label) + "]').click()");
    await waitFor("!document.querySelector('[aria-label=" + JSON.stringify(label) + "]')");
  }
  await waitFor(cashSection + ".textContent.includes('No cash entries yet')");
  assert.ok(await evaluate(cashSection + ".textContent.includes('0 USD')"));
  assert.ok(await evaluate("document.body.textContent.includes('10.19 USD')"));
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Edit').click()");
  await waitFor("document.querySelector('#poker-tournament-form h4')?.textContent === 'Edit Tournament'");
  await evaluate("document.querySelector('[aria-label=\"Close tournament form\"]').click()");
  assert.equal(await evaluate("document.querySelectorAll('form').length"), 0);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 390"), 'Poker view must fit mobile width');
  await send('Emulation.setDeviceMetricsOverride', {width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate("window.scrollTo(0, 0)");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= 1280"));
  const screenshot = await send('Page.captureScreenshot', {format:'png'});
  if(process.env.POKER_SCREENSHOT_PATH) writeFileSync(process.env.POKER_SCREENSHOT_PATH, Buffer.from(screenshot.data,'base64'));
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.startsWith('All')).click()");
  await waitFor("document.body.textContent.includes('Entry Flow')");
  assert.deepEqual(exceptions, []);
  console.log('Poker browser checks passed: conditional forms, editing, cash totals, bankroll deletion, cancellation, failure preservation, final-entry deletion, mobile layout, and category switching.');

} finally {
  socket?.close();
  if (browser && browser.exitCode === null) {
    browser.kill();
    await Promise.race([new Promise(resolve => browser.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
  }
  server?.close();
  // Only the exact temporary browser profile created by mkdtemp is removed.
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-picker-browser-')) throw new Error('Unexpected temporary browser directory');
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Browser may still hold a temporary file. */ }
}
