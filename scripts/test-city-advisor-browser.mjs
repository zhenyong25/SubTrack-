import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable) throw new Error('A Chromium browser is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-advisor-browser-'));
let server, browser, socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, milliseconds = 30000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) { const value = await check(); if (value) return value; await delay(100); }
  throw new Error('Timed out: ' + label);
}
try {
  const bundle = await build({ entryPoints: ["tests/agent-office-browser-fixture.tsx"], bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": JSON.stringify("production") } });
  const cssFile = readdirSync('dist/assets').filter(name => name.endsWith('.css')).map(name => path.join('dist/assets', name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  server = createServer((request, response) => {
    if (request.url === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle.outputFiles[0].contents); }
    else if (request.url === '/styles.css') { response.setHeader('Content-Type', 'text/css'); response.end(readFileSync(cssFile)); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body style="background:#edf4f3"><div id="root"></div><pre id="result">RUNNING</pre><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  mkdirSync('artifacts', { recursive: true });
  browser = spawn(executable, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${directory}`, '--window-size=1440,1050', '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const portFile = path.join(directory, 'DevToolsActivePort');
  await until(() => existsSync(portFile), 'debugging port');
  const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map(); let sequence = 0;
  socket.onmessage = event => { const message = JSON.parse(event.data); const job = pending.get(message.id); if (job) { pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); } };
  const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const value = await command('Runtime.evaluate', { expression, returnByValue: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result.value;
  };
  await command('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  const result = await until(async () => { const text = await evaluate('document.getElementById("result")?.textContent'); return text && text !== 'RUNNING' ? text : false; }, 'browser checks');
  assert.ok(result?.startsWith('PASS:'), result || 'No browser result.');
  writeFileSync('artifacts/city-advisor-office.png', Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await until(async () => (await evaluate('document.querySelector("canvas")?.dataset.activity')) === 'Checking a folder', 'live walking and shelf activity', 40000);
  await delay(1800);
  await evaluate(`document.querySelector('[aria-label="Pause office animation"]').click()`);
  await until(() => evaluate(`!!document.querySelector('[aria-label="Resume office animation"]')`), 'paused screenshot');
  writeFileSync('artifacts/city-advisor-walking.png', Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await delay(500);
  assert.ok(await evaluate('document.querySelector("dialog").scrollWidth <= document.querySelector("dialog").clientWidth + 1'), 'mobile dialog overflows horizontally');
  writeFileSync('artifacts/city-advisor-mobile.png', Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log(result);
  console.log('PASS: real-time animation reaches the shelves; room and activity screenshots saved');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) browser.kill();
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-advisor-browser-')) throw new Error('Unexpected browser directory');
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Chromium may retain the temporary profile briefly. */ }
}
