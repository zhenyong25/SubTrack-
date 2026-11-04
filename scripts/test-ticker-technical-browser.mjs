import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Chromium is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-ticker-technical-'));
let browser, socket, server;
try {
  const bundle = await build({ entryPoints: ['tests/ticker-technical-browser-fixture.tsx'], bundle: true, write: false, format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' } });
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
  const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`);
  const screenshot = async name => { mkdirSync('artifacts/ticker-technicals', { recursive: true }); writeFileSync(`artifacts/ticker-technicals/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); };
  await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await until(`document.querySelector('[data-ma-line="200"]') && document.querySelector('[data-ma-value="200"]').textContent !== '—'`, 'warmup and MA200');
  assert.equal(await evaluate(`document.querySelectorAll('[data-ma-line]').length`), 3);
  await evaluate(`document.querySelector('[aria-label="Toggle SMA 5"]').click()`); await until(`!!document.querySelector('[data-ma-line="5"]')`, 'MA toggle');
  const sma = await evaluate(`document.querySelector('[data-ma-value="20"]').textContent`);
  await evaluate(`const type = document.querySelector('[aria-label="Moving average type"]'); type.value = 'EMA'; type.dispatchEvent(new Event('change', { bubbles: true }));`);
  await until(`document.querySelector('[data-ma-value="20"]').textContent !== ${JSON.stringify(sma)}`, 'EMA recalculation');
  await until(`Array.from(document.querySelectorAll('[data-testid="ticker-patterns"] button')).some(b => b.textContent.includes('Hammer'))`, 'pattern detection');
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="ticker-patterns"] button')).find(b => b.textContent.includes('Hammer')).click()`);
  await until(`!!document.querySelector('[data-testid="pattern-highlight"]') && !!document.querySelector('[data-testid="ticker-pattern-detail"]')`, 'pattern selection');
  await screenshot('desktop');
  await click('Pattern markers'); await until(`document.querySelectorAll('[data-pattern-marker]').length === 0`, 'hide pattern markers');
  await evaluate(`document.querySelector('[aria-label="Zoom in chart"]').click()`); await until(`document.querySelector('svg[aria-label$="candlestick price chart"]').style.width === '150%'`, 'zoom');
  await click('1Y'); await until(`document.body.textContent.includes('1 day candles') && !!document.querySelector('[data-ma-line="200"]')`, 'daily chart');
  const previous = await evaluate(`document.querySelector('[data-ma-value="20"]').textContent`);
  await evaluate(`const svg = document.querySelector('svg[aria-label$="candlestick price chart"]'); const rect = svg.getBoundingClientRect(); svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: rect.left + rect.width * .5, clientY: rect.top + 100 }));`);
  await until(`document.querySelector('[data-ma-value="20"]').textContent !== ${JSON.stringify(previous)}`, 'hover values');
  await click('MAX'); await until(`document.body.textContent.includes('Candles are grouped') && !!document.querySelector('[data-ma-line="200"]')`, 'grouped chart');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-ma-line]')).some(p => /NaN|Infinity/.test(p.getAttribute('d')))`), false);
  await click('1D'); await click('20 sec'); await until(`document.body.textContent.includes('Pattern detection needs market OHLC') && document.querySelectorAll('[data-pattern-marker]').length === 0`, 'live quotes do not claim patterns');
  await evaluate(`tickerTest.failWarmup = true`); await click('1 min');
  await until(`document.body.textContent.includes('Earlier candles could not be loaded') && document.querySelector('[data-ma-value="200"]').textContent === '—'`, 'missing history');
  await evaluate(`tickerTest.failWarmup = false; tickerTest.setSymbol('SECOND')`);
  await until(`document.querySelector('[data-ma-line="200"]') && Number(document.querySelector('[data-ma-value="200"]').textContent.replaceAll(',', '')) > 200`, 'stock switch');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise(r => setTimeout(r, 300)); assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), 'Mobile chart fits');
  await evaluate(`const legend = document.querySelector('[data-testid="ticker-moving-averages"]'); legend.style.scrollMarginTop = '72px'; legend.scrollIntoView({ block: 'start' });`);
  await new Promise(r => setTimeout(r, 100)); await screenshot('mobile');
  await evaluate(`tickerTest.empty = true; tickerTest.setSymbol('EMPTY')`);
  await until(`document.body.textContent.includes('No market candles are available') && document.querySelectorAll('[data-ma-line]').length === 0`, 'empty history');
  assert.deepEqual(errors, []);
  console.log('PASS: MA warmup, SMA/EMA, overlays, pattern markers and selection, hover, zoom, daily/grouped charts, live quotes, missing/empty history, stock switching and mobile layout.');
} finally {
  socket?.close(); if (browser?.exitCode === null) { if (process.platform === 'win32') await new Promise(r => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('close', r)); else browser.kill(); }
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-ticker-technical-')) throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
