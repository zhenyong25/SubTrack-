import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Chromium is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-expense-highlight-'));
let browser, socket, server;
try {
  const bundle = await build({ entryPoints: ['tests/expense-highlight-fixture.tsx'], bundle: true, write: false, format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'stub-import-model', setup(builder) { builder.onLoad({ filter: /[\\/]huggingFaceService\.ts$/ }, () => ({ loader: 'js', contents: 'export const extractPdfText = async () => ""; export const requestChatCompletion = async () => { throw new Error("Model not used in browser tests"); };' })); } }] });
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
  await until(`document.body.textContent.includes('Monthly Category Split')`, 'insurance loaded');
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
  const cell = d => `[...document.querySelectorAll('.expense-calendar [role=button]')].find(c => c.querySelector('span')?.textContent === '${d}')`;
  const legend = name => `[...document.querySelectorAll('.expense-categories button')].find(b => b.textContent.includes('${name}'))`;
  await until(`document.querySelectorAll('.expense-categories button').length === 3`, 'legend buttons');
  await evaluate(`${legend('Food')}.click()`);
  await until(`!!document.querySelector('.expense-calendar [role=status]')`, 'summary bar');
  assert.match(await evaluate(`document.querySelector('.expense-calendar [role=status]').innerText`), /Food · 2 days · 30(\.00)? SGD/);
  assert.equal(await evaluate(`${legend('Food')}.getAttribute('aria-pressed')`), 'true');
  for (const d of [3, 5]) assert.ok(await evaluate(`${cell(d)}.getAttribute('aria-label').includes('includes Food')`), `day ${d} highlighted`);
  for (const d of [1, 4, 6]) assert.ok(await evaluate(`${cell(d)}.className.includes('opacity-35')`), `day ${d} dimmed`);
  assert.equal(await evaluate(`${cell(5)}.querySelector('p').textContent`), '15.00', 'day shows the Food amount');
  await evaluate(`${legend('Food')}.click()`);
  await until(`!document.querySelector('.expense-calendar [role=status]')`, 'second click clears');
  assert.equal(await evaluate(`${cell(4)}.className.includes('opacity-35')`), false);
  // Clicking a donut slice works too (slices follow the legend order).
  await until(`document.querySelectorAll('.expense-categories .recharts-pie-sector').length === 3`, 'all slices drawn');
  const order = await evaluate(`[...document.querySelectorAll('.expense-categories button')].map(b => b.textContent)`);
  await evaluate(`(() => { const s = document.querySelectorAll('.expense-categories .recharts-pie-sector path')[${order.findIndex(text => text.startsWith('Transport'))}]; s.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
  await until(`document.querySelector('.expense-calendar [role=status]')?.innerText.includes('Transport')`, 'slice click highlights');
  await evaluate(`document.querySelector('button[aria-label="Next month"]').click()`);
  await until(`!document.querySelector('.expense-calendar [role=status]')`, 'month change clears');
  await evaluate(`document.querySelector('button[aria-label="Previous month"]').click()`);
  await evaluate(`${legend('Food')}.click()`);
  if (process.env.SHOTS) await new Promise(r => setTimeout(r, 1500));
  if (process.env.SHOTS) writeFileSync(`${process.env.SHOTS}/expense-highlight.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, 'mobile overflow');
  if (process.env.SHOTS) writeFileSync(`${process.env.SHOTS}/expense-highlight-mobile.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  assert.deepEqual(errors, []);
  console.log('PASS: legend and donut highlight category days, totals, dimming, toggle off, month change clears, mobile layout.');

} finally {
  socket?.close(); if (browser?.exitCode === null) { if (process.platform === 'win32') await new Promise(r => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('close', r)); else browser.kill(); }
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-expense-highlight-')) throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
