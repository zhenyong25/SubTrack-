import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Chromium is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-tax-browser-'));
let browser, socket, server;
try {
  const bundle = await build({ entryPoints: ['tests/tax-browser-fixture.tsx'], bundle: true, write: false, format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'stub-import-model', setup(builder) { builder.onLoad({ filter: /[\\/]huggingFaceService\.ts$/ }, () => ({ loader: 'js', contents: 'export const extractPdfText = async () => ""; export const requestChatCompletion = async () => { throw new Error("Model not used in browser tests"); };' })); } }] });
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
  await until(`!!document.querySelector('h1')`, 'insurance loaded');
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
  const stored = () => evaluate(`JSON.parse(localStorage.getItem('subtrack_tax_years_v1') || '[]')`);
  const text = () => evaluate('document.body.innerText');
  const tab = async name => { await click(name, '[role=tab]'); };
  const ya = new Date().getFullYear() + 1;
  await until(`document.body.innerText.includes('Start your tax records')`, 'empty state');
  await click(`Add YA ${ya}`);
  await until(`!!document.querySelector('dialog[open]')`, 'editor open');
  assert.equal(await evaluate(`[...document.querySelectorAll('label')].find(l => l.textContent.startsWith('Employment income')).querySelector('input').value`), '108000', 'employment prefilled from income records');
  await click('Estimate from salary'); await fill('Monthly salary', 8000); await fill('Bonus in year', 12000); await click('Apply');
  await fill('Parent relief', 9000);
  await click('Save year');
  await until(`!document.querySelector('dialog[open]')`, 'saved');
  const saved = (await stored())[0];
  assert.equal(saved.ya, ya); assert.equal(saved.reliefs.cpf, 20400); assert.equal(saved.reliefs.parent, 9000); assert.equal(saved.employment, 108000);
  // 108,000 − (1,000 + 20,400 + 9,000) = 77,600 chargeable → 550 + 37,600 × 7% = 3,182
  await until(`document.body.innerText.includes('$3,182.00')`, 'estimated tax shown');
  assert.ok((await text()).includes('days left'), 'year-end deadline banner');
  await tab('Save tax');
  await until(`document.body.innerText.includes('Contribute to SRS')`, 'savings ideas');
  assert.ok((await text()).includes('Save up to $1,071'), 'SRS saving priced');
  await fill('SRS contribution', 5000);
  await until(`document.body.innerText.includes('$350.00')`, 'what-if saving');
  await tab('Learn'); await until(`document.body.innerText.includes('Resident tax rates')`, 'learn');
  await tab('Records'); await until(`document.body.innerText.includes('Income earned in')`, 'records');
  await click('Edit');
  await fill('Status', 'Assessed'); await fill('Tax assessed', 3100); await fill('Notes', 'NOA received');
  await click('Save year');
  await until(`!document.querySelector('dialog[open]') && document.body.innerText.includes('Tax assessed')`, 'assessed saved');
  assert.equal((await stored())[0].assessedTax, 3100);
  await send('Page.reload'); await until(`document.body.innerText.includes('Tax assessed')`, 'reload');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const name of ['Overview', 'Records', 'Save tax', 'Learn']) {
    await tab(name); assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, name + ' mobile overflow');
  }
  await click(`Add YA ${ya - 1}`); await until(`!!document.querySelector('dialog[open]')`, 'mobile editor');
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, 'editor mobile overflow');
  if (process.env.TAX_SHOTS) {
    const shot = async name => writeFileSync(`${process.env.TAX_SHOTS}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await shot('tax-mobile-editor');
    await evaluate(`document.querySelector('button[aria-label="Close tax form"]')?.click()`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1500, deviceScaleFactor: 1, mobile: false });
    await tab('Overview'); await new Promise(r => setTimeout(r, 200)); await shot('tax-overview');
    await tab('Save tax'); await new Promise(r => setTimeout(r, 200)); await shot('tax-save');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: add YA from income records, CPF estimate, reliefs, estimate, savings, what-if, Notice of Assessment, reload persistence and mobile layout.');

} finally {
  socket?.close(); if (browser?.exitCode === null) { if (process.platform === 'win32') await new Promise(r => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('close', r)); else browser.kill(); }
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-tax-browser-')) throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
