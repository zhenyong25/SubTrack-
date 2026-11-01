import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Set CHROME_PATH to Chromium.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-city-expansion-'));
let browser, socket, server;
const gallery = process.argv.includes('--gallery');
const recreation = process.argv.includes('--recreation');
const movement = process.argv.includes('--movement');
try {
  const bundle = await build({ entryPoints: [gallery ? 'tests/city-building-gallery.ts' : movement ? 'tests/city-movement-browser-fixture.tsx' : recreation ? 'tests/city-recreation-browser-fixture.tsx' : 'tests/city-expansion-browser-fixture.tsx'], bundle: true, write: false, format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' } });
  const css = readFileSync(path.join('dist/assets', readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.css'))));
  server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root" style="padding:16px"></div><pre id="result">RUNNING</pre><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(executable, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000); browser.on('error', reject); browser.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); });
  const target = await (await fetch(`http://${new URL(url).host}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); let id = 0; const errors = [];
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text); const p = pending.get(data.id); if (p) { pending.delete(data.id); data.error ? p.reject(data.error) : p.resolve(data.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  let result;
  for (let i = 0; i < (recreation || movement ? 1400 : 400); i++) { result = await evaluate('document.getElementById("result")?.textContent'); if (result && result !== 'RUNNING') break; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(result?.startsWith('PASS:'), `${result}; ${errors.join('; ')}`);
  assert.deepEqual(errors, []);
  mkdirSync('artifacts/city-expansion', { recursive: true });
  if (gallery) {
    for (const category of ['farming', 'harbour', 'fishing', 'highrise', 'shopping', 'dining', 'recreation', 'culture', 'transport', 'civic', 'science', 'nature']) {
      await evaluate(`window.renderBuildingGallery(${JSON.stringify(category)})`);
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      writeFileSync(`artifacts/city-expansion/models-${category}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 690, scale: 1 } })).data, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log('PASS: gallery rendered all 120 individual models across 12 category sheets.');
  } else if (movement) {
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click();document.querySelector('button[aria-label="Zoom in"]').click();document.querySelector('button[aria-label="Zoom in"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    writeFileSync('artifacts/city-expansion/movement-desktop.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('pause-movement').click()`); await new Promise(resolve => setTimeout(resolve, 250));
    const before = await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`); await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`), before, 'Pause must freeze signals, visits and traffic');
    await evaluate(`document.getElementById('pause-movement').click()`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await new Promise(resolve => setTimeout(resolve, 500));
    await evaluate(`document.getElementById('result').style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%'`);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), 'Mobile city overflows');
    writeFileSync('artifacts/city-expansion/movement-mobile.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('remove-movement').click();document.getElementById('remove-roads').click()`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('canvas')?.dataset.trafficSignals === '0'`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.trafficSignals`), '0');
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.buildingVisitors`), '0');
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.activeCrossings`), '0');
    assert.deepEqual(errors, []);
    console.log(result + ' Pause/resume, mobile layout and demolition passed.');
  } else if (recreation) {
    // Move closer to the actual court users before recording the live scene.
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click();document.querySelector('button[aria-label="Zoom in"]').click();document.querySelector('button[aria-label="Zoom in"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    writeFileSync('artifacts/city-expansion/recreation-active.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('pause-recreation').click()`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const count = await evaluate(`document.querySelector('canvas').dataset.recreationVisitors`);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.recreationVisitors`), count);
    await evaluate(`document.getElementById('pause-recreation').click();document.getElementById('remove-recreation').click()`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('canvas')?.dataset.recreationVisitors === '0'`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.recreationVisitors`), '0');
    assert.deepEqual(errors, []);
    console.log(result + ' Pause/resume and recreation demolition passed.');
  } else {
  writeFileSync('artifacts/city-expansion/desktop.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate(`document.querySelector('.city-building-catalogue').closest('section').scrollIntoView()`);
  writeFileSync('artifacts/city-expansion/catalogue.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await evaluate(`document.getElementById('result').style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%'`);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), 'mobile layout overflows horizontally: ' + JSON.stringify(await evaluate(`[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 391).slice(0,8).map(e => ({tag:e.tagName, class:e.className, width:e.getBoundingClientRect().width}))`)));
  writeFileSync('artifacts/city-expansion/mobile.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log(result + ' Desktop and mobile layouts passed.');
  }
} finally {
  socket?.close(); browser?.kill(); server?.close();
  if (browser && browser.exitCode === null) await Promise.race([new Promise(resolve => browser.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-city-expansion-')) throw new Error('Unexpected temporary directory');
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Browser may briefly retain files. */ }
}
