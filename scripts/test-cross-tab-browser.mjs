// Opens several tabs of the same browser and checks they keep each other up to date.
// Run `npm run build` first (the page uses the built stylesheet).
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Chromium is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-cross-tab-browser-'));
let browser, server; const sockets = [];
try {
  const bundle = await build({ entryPoints: ['tests/cross-tab-fixture.tsx'], bundle: true, write: false, format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' } });
  const full = await build({ entryPoints: ['tests/app-cross-tab-fixture.tsx'], bundle: true, write: false, format: 'iife', banner: { js: 'var process = { env: { NODE_ENV: "production" } };' }, loader: { '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
    // The PDF/AI service imports a Vite-only worker URL; these tests never call it.
    plugins: [{ name: 'stub-model', setup(b) { b.onLoad({ filter: /[\\/]huggingFaceService\.ts$/ }, () => ({ loader: 'js', contents: 'export const extractPdfText = async () => ""; export const extractPdfPages = async () => []; export const requestChatCompletion = async () => { throw new Error("not in tests"); }; export const parseStatementTransactions = async () => { throw new Error("not in tests"); };' })); } }], define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' } });
  const css = readFileSync(path.join('dist/assets', readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.css'))));
  server = createServer((req, res) => {
    if (req.url === '/full.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(full.outputFiles[0].contents); }
    else if (req.url?.startsWith('/full')) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/full.js"></script></body></html>'); }
    else if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const devtools = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000); browser.on('error', reject); browser.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); });

  const openTab = async (query, page = '/', ready = `!!window.syncTest && document.body.innerText.includes('Tax')`) => {
    const target = await (await fetch(`http://${new URL(devtools).host}/json/new?about:blank`, { method: 'PUT' })).json();
    const socket = new WebSocket(target.webSocketDebuggerUrl); sockets.push(socket);
    await new Promise(r => socket.addEventListener('open', r, { once: true }));
    let id = 0; const pending = new Map(), errors = [];
    socket.addEventListener('message', e => { const d = JSON.parse(e.data); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); if (pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); } });
    const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const until = async (expression, label) => { for (let i = 0; i < 160; i++) { assert.deepEqual(errors, []); if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 50)); } throw new Error('Timed out: ' + label); };
    await send('Runtime.enable');
    await send('Page.navigate', { url: `${origin}${page}?${query}` });
    await until(ready, 'tab loaded: ' + page + query);
    return { evaluate, until, errors };
  };
  const received = tab => tab.evaluate('JSON.stringify(window.syncTest.received)');
  const settle = () => new Promise(r => setTimeout(r, 700));

  // 1. Local-only mode: a record saved in one tab shows up in the other without reloading it.
  const localA = await openTab('account=&local=1'); const localB = await openTab('account=&local=1');
  await localB.until(`document.body.innerText.includes('Start your tax records')`, 'B starts empty');
  await localA.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Add YA')).click()`);
  await localA.until(`!!document.querySelector('dialog[open]')`, 'A editor');
  await localA.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save year').click()`);
  await localA.until(`!document.querySelector('dialog[open]')`, 'A saved');
  await localB.until(`document.body.innerText.includes('breakdown')`, 'B shows the year saved in A');
  assert.equal(await localB.evaluate(`document.body.innerText.includes('Start your tax records')`), false);

  // 2. Cloud mode: a write in one tab reaches same-account tabs only, and muted writes don't.
  const cloudA = await openTab('account=user-1&local=0'); const cloudB = await openTab('account=user-1&local=0'); const other = await openTab('account=user-2&local=0');
  await cloudA.evaluate(`window.syncTest.announce('expenses'); window.syncTest.announce('tax_years')`);
  await cloudB.until(`window.syncTest.received.length > 0`, 'B notified');
  assert.deepEqual(JSON.parse(await received(cloudB)), [['expenses', 'tax_years']], 'changes arrive together, after a short pause');
  assert.deepEqual(JSON.parse(await received(cloudA)), [], 'a tab ignores its own announcements');
  await settle(); assert.deepEqual(JSON.parse(await received(other)), [], 'another account ignores it');
  await cloudA.evaluate(`window.syncTest.mute(5000); window.syncTest.announce('incomes')`);
  await settle(); assert.equal(JSON.parse(await received(cloudB)).length, 1, 'muted writes (e.g. while loading) are not announced');
  // localStorage changes in cloud mode are caches and sync metadata, not a reason to reload.
  await cloudA.evaluate(`localStorage.setItem('subtrack_last_cloud_save_user-1', String(Date.now()))`);
  await settle(); assert.equal(JSON.parse(await received(cloudB)).length, 1, 'cloud tabs ignore storage events');

  // 3. Coming back to a tab after 20 seconds or more reloads everything; a quick switch doesn't.
  const visibility = (state, offset) => `(() => { const realNow = Date.now.bind(Date); Date.now = () => realNow() + ${offset}; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => '${state}' }); document.dispatchEvent(new Event('visibilitychange')); })()`;
  await cloudB.evaluate(`window.syncTest.received.length = 0`);
  await cloudB.evaluate(visibility('hidden', 0)); await cloudB.evaluate(visibility('visible', 5_000));
  await settle(); assert.deepEqual(JSON.parse(await received(cloudB)), [], 'short absence: no reload');
  await cloudB.evaluate(visibility('hidden', 0)); await cloudB.evaluate(visibility('visible', 25_000));
  await cloudB.until(`window.syncTest.received.length > 0`, 'return reload');
  assert.deepEqual(JSON.parse(await received(cloudB)), [['*']]);

  // 4. The real app: an expense saved in one tab appears in the other tab's Expenses list,
  //    and the two tabs settle instead of reloading each other.
  const appReady = `!!document.querySelector('nav[aria-label="Main navigation"]')`;
  const appA = await openTab('', '/full', appReady); const appB = await openTab('', '/full', appReady);
  await appB.evaluate(`document.querySelector('nav[aria-label="Main navigation"] button[aria-label="Expenses"]').click()`);
  await appB.until(`!document.body.innerText.includes('Cross-tab lunch')`, 'B expenses open');
  await appA.evaluate(`(() => { window.storageEvents = 0; addEventListener('storage', () => window.storageEvents++); const key = 'subtrack_expenses_v1'; const rows = JSON.parse(localStorage.getItem(key) || '[]'); rows.push({ id: crypto.randomUUID(), name: 'Cross-tab lunch', amount: 12.5, currency: 'SGD', expenseDate: new Date().toISOString().slice(0, 10), category: 'Food', color: '#f97316' }); localStorage.setItem(key, JSON.stringify(rows)); })()`);
  await appB.until(`document.body.innerText.includes('Cross-tab lunch')`, 'B shows the expense added in A');
  await new Promise(r => setTimeout(r, 2500));
  assert.ok(await appA.evaluate('window.storageEvents') <= 2, 'tabs settle after one reload');

  for (const tab of [localA, localB, cloudA, cloudB, other, appA, appB]) assert.deepEqual(tab.errors, []);
  console.log('PASS: local saves reach other tabs, cloud writes reach same-account tabs only, muting, storage noise ignored, and refresh on return; the full app picks up an expense from another tab.');
} finally {
  sockets.forEach(s => s.close());
  if (browser?.exitCode === null) { if (process.platform === 'win32') await new Promise(r => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('exit', r)); else browser.kill(); }
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-cross-tab-browser-')) throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
