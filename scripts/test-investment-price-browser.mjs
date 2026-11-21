import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Chromium is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-investment-price-'));
let browser, socket, server;
try {
  const bundle = await build({ entryPoints: ['tests/investment-price-browser-fixture.tsx'], bundle: true, write: false, format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' } });
  const css = readFileSync(path.join('dist/assets', readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.css'))));
  server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
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
  await until(`typeof window.setQuote === 'function' && !!document.querySelector('#root span')`, 'initial price');
  const flashing = `document.querySelector('#root span').classList.contains('investment-price-flash')`;
  assert.equal(await evaluate(flashing), false, 'Initial price stays neutral');
  await evaluate('setQuote(101)');
  await until(`document.querySelector('#root span').title.includes('increased')`, 'higher price flashes green');
  assert.ok(await evaluate(`document.querySelector('#root span').classList.contains('text-emerald-600')`));
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#root span')).animationName`), 'investment-price-flash');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#root span')).animationIterationCount`), '3', 'Blinks three times');
  await until(`document.querySelector('#root span').getAnimations().length === 0`, 'green blinking finishes');
  assert.ok(await evaluate(`document.querySelector('#root span').classList.contains('text-emerald-600')`), 'Green stays after blinking');
  await evaluate('setQuote(99)');
  await until(`document.querySelector('#root span').title.includes('decreased')`, 'lower price flashes red');
  assert.ok(await evaluate(`document.querySelector('#root span').classList.contains('text-red-600')`));
  await until(`document.querySelector('#root span').getAnimations().length === 0`, 'red blinking finishes');
  assert.ok(await evaluate(`document.querySelector('#root span').classList.contains('text-red-600')`), 'Red stays after blinking');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#root span')).opacity`), '1', 'Price stays fully visible');
  await evaluate('setQuote(99)');
  assert.ok(await evaluate(`document.querySelector('#root span').classList.contains('text-red-600')`), 'Unchanged price keeps the last color');
  assert.equal(await evaluate(`document.querySelector('#root span').getAnimations().length`), 0, 'Unchanged price does not restart blinking');
  await evaluate('setQuote(120, "HKD")');
  await until(`document.querySelector('#root span').textContent.includes('HKD')`, 'currency switch');
  assert.equal(await evaluate(flashing), false, 'Currency switch resets comparison');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evaluate('setQuote(121, "HKD")');
  await until(flashing, 'reduced motion still shows direction');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#root span')).animationName`), 'none', 'Reduced motion disables blinking');
  assert.ok(await evaluate(`document.querySelector('#root span').classList.contains('text-emerald-600')`));
  assert.deepEqual(errors, []);
  console.log('PASS: three blinks, persistent green/red colors, unchanged prices, currency switches and reduced motion.');
} finally {
  socket?.close(); if (browser?.exitCode === null) { if (process.platform === 'win32') await new Promise(r => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('close', r)); else browser.kill(); }
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-investment-price-')) throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
