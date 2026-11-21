import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Chromium is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-insurance-browser-'));
let browser, socket, server;
try {
  const bundle = await build({ entryPoints: ['tests/insurance-browser-fixture.tsx'], bundle: true, write: false, format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'stub-import-model', setup(builder) { builder.onLoad({ filter: /[\\/]huggingFaceService\.ts$/ }, () => ({ loader: 'js', contents: 'export const extractPdfText = async () => ""; export const requestChatCompletion = async () => { throw new Error("Model not used in browser tests"); };' })); } }] });
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
  await until(`!!document.querySelector('nav[aria-label="Insurance sections"]')`, 'insurance loaded');
  const click = async (text, scope = 'button') => {
    assert.equal(await evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`), true, 'button: ' + text);
    await new Promise(r => setTimeout(r, 70));
  };
  const fill = async (label, value) => {
    await evaluate(`(() => { const l = [...document.querySelectorAll('label')].find(l => l.textContent.trim().startsWith(${JSON.stringify(label)})); const el = l?.querySelector('input,select,textarea'); if (!el) throw new Error('Missing field: ' + ${JSON.stringify(label)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await new Promise(r => setTimeout(r, 50));
  };
  const stored = () => evaluate(`JSON.parse(localStorage.getItem('subtrack_insurance_v1')).find(p => p.id === 'medical')`);
  const text = () => evaluate('document.body.innerText');
  await click('Costs');
  await until(`document.body.innerText.includes('Premium history')`, 'costs');
  await fill('Effective date', '2025-01-01');
  await click('Add premium entry');
  await until(`JSON.parse(localStorage.getItem('subtrack_insurance_v1')).find(p => p.id === 'medical').premiumHistory?.length === 1`, 'baseline saved');
  await fill('Effective date', await evaluate('insuranceTestToday')); await fill('Premium per payment', 235); await fill('Insurer', 'Medical repricing');
  await click('Add premium entry');
  await until(`document.body.innerText.includes('+17.5%')`, 'increase displayed');
  await evaluate(`(() => { const buttons = [...document.querySelectorAll('button')].filter(b => b.textContent === 'Apply to current premium'); buttons.at(-1).click(); })()`);
  await until(`JSON.parse(localStorage.getItem('subtrack_insurance_v1')).find(p => p.id === 'medical').premium === 235`, 'current premium applied');
  await fill('Amount paid', 235); await fill('Payment reference', 'Receipt 001'); await click('Mark paid');
  await until(`JSON.parse(localStorage.getItem('subtrack_insurance_v1')).find(p => p.id === 'medical').payments?.length === 1`, 'payment saved');
  assert.equal((await stored()).payments[0].amount, 235);
  assert.notEqual((await stored()).paymentDueDate, await evaluate('insuranceTestToday'), 'payment schedule advances');
  await click('Compare');
  await evaluate(`document.querySelectorAll('label input[type=checkbox]').forEach(x => x.click())`);
  await until(`!!document.querySelector('table')`, 'comparison table');
  assert.ok((await text()).includes('Quotation')); assert.ok((await text()).includes('Not recorded'));
  await click('Simulator');
  assert.ok((await text()).includes('MYR 8,550')); assert.ok((await text()).includes('MYR 1,450'));
  await fill('Excluded / ineligible costs', 20000);
  await until(`!!document.querySelector('[role=alert]')`, 'simulator rejects invalid exclusion');
  await click('People'); assert.ok((await text()).includes('Alex')); assert.ok((await text()).includes('Sam'));
  assert.equal(await evaluate(`document.querySelectorAll('h3').length`), 2, 'quotations excluded from person coverage');
  await click('Claims'); await fill('Claim title', 'Hospital reimbursement'); await fill('Requested', 1000); await fill('Follow-up tasks', 'Send receipt'); await click('Save claim');
  await until(`JSON.parse(localStorage.getItem('subtrack_insurance_v1')).find(p => p.id === 'medical').claims?.length === 1`, 'claim saved');
  await click('Edit claim'); await fill('Status', 'Approved'); await fill('Approved', 800); await click('Save claim');
  await until(`JSON.parse(localStorage.getItem('subtrack_insurance_v1')).find(p => p.id === 'medical').claims?.[0].approved === 800`, 'claim updated');
  assert.equal((await stored()).claims.length, 1, 'editing does not duplicate claim');
  await click('Review');
  await evaluate(`document.querySelector('input[type=checkbox]').click()`); await fill('Review notes & questions', 'Ask about shared limits');
  await click('Save ' + await evaluate('insuranceTestToday.slice(0,4)') + ' review');
  await until(`Object.keys(JSON.parse(localStorage.getItem('subtrack_insurance_v1')).find(p => p.id === 'medical').reviews || {}).length === 1`, 'review saved');
  const downloads = path.join(directory, 'downloads'); mkdirSync(downloads);
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await click('Export review checklist');
  for (let i = 0; i < 100 && !readdirSync(downloads).some(f => f.endsWith('.txt')); i++) await new Promise(r => setTimeout(r, 50));
  const reviewFile = readdirSync(downloads).find(f => f.endsWith('.txt')); assert.ok(reviewFile, 'review export downloaded');
  assert.ok(readFileSync(path.join(downloads, reviewFile), 'utf8').includes('Ask about shared limits'));
  await click('Costs'); await click('Export calendar reminders');
  for (let i = 0; i < 100 && !readdirSync(downloads).some(f => f.endsWith('.ics')); i++) await new Promise(r => setTimeout(r, 50));
  const calendarFile = readdirSync(downloads).find(f => f.endsWith('.ics')); assert.ok(calendarFile, 'calendar export downloaded');
  assert.ok(readFileSync(path.join(downloads, calendarFile), 'utf8').includes('BEGIN:VALARM'));
  await click('Learn'); await until(`document.body.innerText.includes('How companies set the price')`, 'learning hub');
  await evaluate(`document.querySelector('input[type=range]').value = 200; document.querySelector('input[type=range]').dispatchEvent(new Event('input', {bubbles:true}))`);
  await click('Policies'); await click('Edit', 'article button');
  await until(`!!document.querySelector('dialog[open]')`, 'policy editor');
  await fill('Waiting period', '30 days'); await fill('Exclusions', 'Pre-existing conditions as stated'); await fill('Limit basis', 'Annual');
  await click('Deductibles & co-payments ↗'); assert.ok((await text()).includes('A deductible or excess'));
  await click('Save policy'); await until(`!document.querySelector('dialog[open]')`, 'policy edited');
  assert.equal((await stored()).limitBasis, 'Annual');
  await send('Page.reload'); await until(`!!document.querySelector('nav[aria-label="Insurance sections"]')`, 'reload');
  assert.equal((await stored()).claims[0].approved, 800); assert.equal((await stored()).payments.length, 1);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const section of ['Overview', 'Policies', 'Costs', 'Learn', 'Compare', 'Simulator', 'People', 'Claims', 'Review']) {
    await click(section); assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, section + ' mobile overflow');
  }
  mkdirSync('artifacts/insurance', { recursive: true });
  writeFileSync('artifacts/insurance/mobile-review.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  assert.deepEqual(errors, []);
  console.log('PASS: premium changes, payment advancement, quotations, comparison, simulation, people, claims, yearly reviews, calendar/review downloads, editing, reload persistence, and all mobile sections.');

} finally {
  socket?.close(); if (browser?.exitCode === null) { if (process.platform === 'win32') await new Promise(r => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('close', r)); else browser.kill(); }
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-insurance-browser-')) throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
