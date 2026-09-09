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
      import AddSubscription from './components/AddSubscription';
      import SubscriptionLogo from './components/SubscriptionLogo';
      function Harness() {
        const [saved, setSaved] = useState(null);
        const [logo, setLogo] = useState('/missing.png');
        return <><AddSubscription savedCards={[]} onCancel={() => {}} onSave={setSaved} />
          <pre id="saved" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(saved)}</pre>
          <div id="recovery"><SubscriptionLogo name="Recovered" logoUrl={logo} /></div>
          <button id="repair" onClick={() => setLogo('/logo.png')}>Repair fixture logo</button>
        </>;
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
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'); }
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
  await waitFor(`Boolean(document.querySelector('[role="combobox"]'))`);
  await fill('input[type="number"]', '22.50');
  await fill('[role="combobox"]', 'spot');
  await waitFor(`document.querySelector('[role="option"]')?.textContent.includes('Spotify')`);
  await key('ArrowDown'); await key('Enter');
  assert.equal(await evaluate(`document.querySelector('[role="combobox"]').value`), 'Spotify');
  await waitFor(`document.querySelector('form img')?.src.includes('/service-logos/spotify.com.') && document.querySelector('form img').naturalWidth > 0`);
  assert.equal(await evaluate(`document.querySelector('input[type="number"]').value`), '22.50');
  await evaluate(`document.querySelector('button[type="submit"]').click()`);
  await waitFor(`JSON.parse(document.getElementById('saved').textContent)?.name === 'Spotify'`);
  const saved = JSON.parse(await evaluate(`document.getElementById('saved').textContent`));
  assert.equal(saved.serviceId, 'spotify--spotify-com');
  assert.equal(saved.category, 'Music');
  assert.equal(saved.price, 22.5);
  assert.equal(saved.currency, 'SGD');

  await fill('[role="combobox"]', 'My neighborhood gym');
  await key('Escape');
  await evaluate(`document.querySelector('button[type="submit"]').click()`);
  await waitFor(`JSON.parse(document.getElementById('saved').textContent)?.name === 'My neighborhood gym'`);
  assert.equal(JSON.parse(await evaluate(`document.getElementById('saved').textContent`)).serviceId, undefined);
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.startsWith('Browse all')).click()`);
  await waitFor(`document.querySelector('dialog').open`);
  assert.equal(await evaluate(`document.querySelectorAll('dialog img').length`), 40);
  await fill('input[aria-label="Search all services"]', 'sooka');
  await waitFor(`document.querySelectorAll('dialog img').length === 1`);
  await evaluate(`[...document.querySelectorAll('dialog button')].find(button => button.textContent.includes('sooka')).click()`);
  await waitFor(`!document.querySelector('dialog').open`);
  assert.equal(await evaluate(`document.querySelector('[role="combobox"]').value`), 'sooka');
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= 390`), 'mobile form must not overflow');

  await evaluate(`document.getElementById('recovery').scrollIntoView()`);
  await waitFor(`document.querySelector('#recovery img').src.startsWith('data:image/svg+xml')`);
  await evaluate(`document.getElementById('repair').click()`);
  await waitFor(`document.querySelector('#recovery img').src.endsWith('/logo.png') && document.querySelector('#recovery img').complete`);
  assert.ok(await evaluate(`document.querySelector('#recovery img').naturalWidth > 0`));
  assert.deepEqual(exceptions, []);
  await evaluate(`window.scrollTo(0, 0)`);
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  if (process.env.CATALOG_SCREENSHOT_PATH) writeFileSync(process.env.CATALOG_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
  console.log('Browser checks passed: keyboard selection, price preservation, service ID saving, custom services, browsing, regional search, mobile layout, and logo failure recovery.');
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
