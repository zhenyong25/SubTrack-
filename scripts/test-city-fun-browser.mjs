import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Chromium is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-city-fun-browser-'));
let browser, socket, server;
try {
  const bundle = await build({ entryPoints: ['tests/city-fun-browser-fixture.tsx'], bundle: true, write: false, format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'stub-import-model', setup(builder) { builder.onLoad({ filter: /[\\/]huggingFaceService\.ts$/ }, () => ({ loader: 'js', contents: 'export const extractPdfText = async () => ""; export const requestChatCompletion = async () => { throw new Error("Model not used in browser tests"); };' })); } }] });
  const css = readFileSync(path.join('dist/assets', readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.css'))));
  server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000); browser.on('error', reject); browser.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); });
  const target = await (await fetch(`http://${new URL(url).host}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(), errors = [];
  socket.addEventListener('message', e => { const d = JSON.parse(e.data); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); if (pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const until = async (expression, label) => { for (let i = 0; i < 180; i++) { assert.deepEqual(errors, []); if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 50)); } throw new Error('Timed out: ' + label); };
  await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await until(`document.body.textContent.includes('Daily missions')`, 'insurance loaded');
  const click = async (text, scope = 'button') => {
    assert.equal(await evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`), true, 'button: ' + text);
    await new Promise(r => setTimeout(r, 70));
  };
  const go = async section => {
    assert.equal(await evaluate(`(() => { const g = [...document.querySelectorAll('h1 button')].find(b => b.dataset.sections.split(' ').includes(${JSON.stringify(section)})); if (!g) return false; g.click(); return true; })()`), true, 'section group: ' + section);
    await new Promise(r => setTimeout(r, 70));
    await evaluate(`document.querySelector('[data-section=${JSON.stringify(section)}]')?.click()`);
    await new Promise(r => setTimeout(r, 70));
  };
  const fill = async (label, value) => {
    await evaluate(`(() => { const l = [...document.querySelectorAll('label')].find(l => l.textContent.trim().startsWith(${JSON.stringify(label)})); const el = l?.querySelector('input,select,textarea'); if (!el) throw new Error('Missing field: ' + ${JSON.stringify(label)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await new Promise(r => setTimeout(r, 50));
  };
  const stored = () => evaluate(`JSON.parse(localStorage.getItem('subtrack_city_v1:fun-browser'))`);
  const text = () => evaluate('document.body.innerText');
  const button = label => `[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)}))`;
  const press = async label => { assert.ok(await evaluate(`!!${button(label)}`), 'button: ' + label); await evaluate(`${button(label)}.click()`); await new Promise(r => setTimeout(r, 120)); };
  const coinsTile = () => evaluate(`Number(document.body.innerText.match(/Coins\n?\s*([\d,]+)/i)[1].replace(/,/g, ''))`);
  const shot = async name => { if (process.env.SHOTS) writeFileSync(`${process.env.SHOTS}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64')); };

  // 1. Welcome back after 5 hours, with what the city earned; no 8-hour cap involved.
  await until(`document.body.innerText.includes('Welcome back')`, 'welcome back');
  assert.match(await text(), /away for 5 hours/);
  await shot('city-fun-welcome');
  const before = (await stored()).coins;
  await press('Collect it all');
  await until(`!document.body.innerText.includes('Welcome back')`, 'welcome dismissed by collecting');
  assert.ok((await stored()).coins > before, 'coins collected');
  assert.equal(await evaluate(`document.querySelectorAll('.city-coin-burst').length`), 16, 'coin shower');
  // Collecting earned XP that crossed into level 5: the celebration banner says so.
  await until(`document.querySelector('.city-celebrate')?.innerText.includes('Level 5')`, 'level-up celebration');

  // 2. Streak: 2 days so far plus today's expense = 3, +20% mission coins; claiming keeps it.
  assert.match(await text(), /3-day streak/);
  assert.match(await text(), /\+20%/);
  const log = `[...document.querySelectorAll('article')].find(a => a.textContent.includes('Record an expense'))`;
  await evaluate(`[...${log}.querySelectorAll('button')].find(b => b.textContent === 'Claim').click()`);
  await until(`JSON.parse(localStorage.getItem('subtrack_city_v1:fun-browser')).streak?.count === 3`, 'streak saved');

  // 3. City event: go there, pick a response.
  await press('Go there');
  await until(`!!document.querySelector('section[aria-label="City event"] button span')`, 'event choices');
  const helpedBefore = (await stored()).events?.helped || 0;
  await evaluate(`document.querySelector('section[aria-label="City event"] button').click()`);
  await until(`document.querySelector('section[aria-label="City event"]').innerText.includes('Handled')`, 'event handled');
  assert.equal((await stored()).events.helped, helpedBefore + 1);

  // 4. Achievements: 12 buildings unlocks the first "Master builder" tier.
  await until(`document.querySelector('section[aria-label="Achievements"]').innerText.includes('ready')`, 'achievement ready');
  await evaluate(`[...document.querySelectorAll('section[aria-label="Achievements"] li')].find(li => li.textContent.includes('Master builder')).querySelector('button').click()`);
  await until(`(JSON.parse(localStorage.getItem('subtrack_city_v1:fun-browser')).achievements || []).includes('buildings:0')`, 'achievement claimed');
  await new Promise(r => setTimeout(r, 400));
  await shot('city-fun-desktop');

  // 5. Mobile layout.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise(r => setTimeout(r, 400));
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, 'mobile overflow');
  await evaluate(`document.querySelector('section[aria-label="City event"]').scrollIntoView()`);
  await shot('city-fun-mobile');
  assert.deepEqual(errors, []);
  console.log('PASS: welcome back, collect with coin shower, streak bonus and save, level-up banner, city event, achievement claim, mobile layout.');

} finally {
  socket?.close(); if (browser?.exitCode === null) { if (process.platform === 'win32') await new Promise(r => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('close', r)); else browser.kill(); }
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-city-fun-browser-')) throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
