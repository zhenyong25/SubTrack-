import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Set CHROME_PATH to Chromium.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-valuation-browser-'));
let browser, socket, server;
try {
  const result = await build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App';
      if (!localStorage.getItem('fixture')) {
        localStorage.setItem('fixture', '1');
        localStorage.setItem('subtrack_investments_v1', JSON.stringify([{ id: '00000000-0000-4000-8000-000000000001', name: 'Pokemon collection', kind: 'Pokemon Cards', units: 1, averageCost: 100, currentPrice: 100, currency: 'SGD', color: '#f59e0b', isActive: true }]));
      }
      createRoot(document.getElementById('root')).render(<App />);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', define: { 'import.meta.env': '{}', 'process.env': '{}', 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'asset-urls', setup(builder) {
      builder.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'asset-url' }));
      builder.onLoad({ filter: /.*/, namespace: 'asset-url' }, () => ({ contents: 'export default "/unused-test-worker.js";', loader: 'js' }));
    } }],
  });
  const css = readFileSync(path.join('dist/assets', readdirSync('dist/assets').find(f => f.endsWith('.css'))), 'utf8');
  server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(result.outputFiles[0].text); }
    else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else if (req.url.startsWith('/api/') || req.url.startsWith('/service-logos/')) { res.statusCode = 404; res.end(); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Browser startup timed out')), 15000);
    browser.on('error', reject); browser.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  const target = await (await fetch(`http://${new URL(url).host}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.method === 'Runtime.exceptionThrown') console.error(JSON.stringify(data.params.exceptionDetails)); const task = pending.get(data.id); if (task) { pending.delete(data.id); data.error ? task.reject(data.error) : task.resolve(data.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timed out: ${expression}; page: ${await evaluate('document.body.innerText.slice(0, 2000)')}`); };
  const click = text => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`);
  const fill = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await waitFor(`!!document.querySelector('button[aria-label="Investments"]')`);
  await evaluate(`document.querySelector('button[aria-label="Investments"]').click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Log value')`);
  await click('Log value');
  await waitFor(`!!document.querySelector('input[autofocus]') || [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Save value')`);
  // Click through the browser input path, then verify both the holding and its history persist.
  await fill('form input[type="number"]', '275');
  await click('Save value');
  await waitFor(`JSON.parse(localStorage.getItem('subtrack_investment_valuations_v1') || '[]').length === 1`);
  await waitFor(`![...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Save value')`);
  let holdings = await evaluate(`JSON.parse(localStorage.getItem('subtrack_investments_v1'))`);
  assert.equal(holdings.length, 1, 'logging a value must preserve holdings');
  assert.equal(holdings[0].currentPrice, 275, 'the new price must persist');
  await click('Log value');
  await fill('form input[type="number"]', '300');
  await click('Save value');
  await waitFor(`JSON.parse(localStorage.getItem('subtrack_investment_valuations_v1') || '[]').length === 2`);
  await send('Page.reload');
  await waitFor(`!!document.querySelector('button[aria-label="Investments"]')`);
  await evaluate(`document.querySelector('button[aria-label="Investments"]').click()`);
  await waitFor(`document.body.textContent.includes('Value history (2)')`);
  holdings = await evaluate(`JSON.parse(localStorage.getItem('subtrack_investments_v1'))`);
  assert.equal(holdings[0].currentPrice, 300);
  console.log('Passed: Pokemon value logging, updated holding persistence, same-day history, and reload.');
} finally {
  socket?.close(); browser?.kill(); server?.close();
  if (browser && browser.exitCode === null) await Promise.race([new Promise(resolve => browser.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-valuation-browser-')) throw new Error('Unexpected temporary directory');
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Chromium can briefly hold profile files. */ }
}
