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
  const bundle = await build({ entryPoints: ['tests/tax-browser-fixture.tsx'], bundle: true, write: false, format: 'iife', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'stub-import-model', setup(builder) { builder.onLoad({ filter: /[\\/]huggingFaceService\.ts$/ }, () => ({ loader: 'js', contents: 'export const extractPdfText = async file => (globalThis.__taxNoaTexts && file && globalThis.__taxNoaTexts[file.name]) || globalThis.__taxNoaText || ""; export const requestChatCompletion = async () => { throw new Error("Model not used in browser tests"); };' })); } }] });
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
  await tab('Projections');
  await until(`document.body.innerText.includes('Projected taxation by year')`, 'projections without saved records');
  assert.equal(await evaluate(`document.querySelector('table tbody tr').innerText.includes('108,000')`), true, 'current-year active salary and one-time bonus included');
  assert.equal(await evaluate(`document.querySelectorAll('table tbody tr')[1].innerText.includes('96,000')`), true, 'one-time bonus is not repeated');
  await fill('Annual income growth', 10);
  assert.equal(await evaluate(`document.querySelectorAll('table tbody tr')[1].innerText.includes('105,600')`), true, 'growth updates subsequent years');
  await evaluate('updateTaxSalary(9000)');
  await until(`document.querySelector('table tbody tr').innerText.includes('120,000')`, 'live active-income update');
  await evaluate('updateTaxSalary(8000)');
  assert.equal((await stored()).length, 0, 'viewing projections does not save records');
  await click('Review & save estimate');
  await until(`!!document.querySelector('dialog[open]')`, 'projection editor');
  assert.equal(await evaluate(`[...document.querySelectorAll('label')].find(l => l.textContent.startsWith('Employment income')).querySelector('input').value`), '108000');
  await evaluate(`document.querySelector('[aria-label="Close tax form"]').click()`);
  await tab('Overview');
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
  await tab('Records & NOAs'); await until(`document.body.innerText.includes('Income earned in')`, 'records');
  await click('Edit');
  await fill('Status', 'Assessed'); await fill('Tax assessed', 3100); await fill('Notes', 'NOA received');
  await click('Save year');
  await until(`!document.querySelector('dialog[open]') && document.body.innerText.includes('Tax assessed')`, 'assessed saved');
  assert.equal((await stored())[0].assessedTax, 3100);
  // NOA records: drop two notices at once - this year's (attaches to the existing record) and a
  // zero-tax YA 2024 notice in the IRAS layout (creates a new record from its line items).
  await click('Upload NOA');
  await until(`!!document.querySelector('input[aria-label="Notice of Assessment PDFs"]')`, 'NOA records');
  await evaluate(`globalThis.__taxNoaTexts = {
    'noa-current.pdf': 'Notice of Assessment YEAR OF ASSESSMENT ${ya} INCOME^ 108,000.00 DEDUCTIONS 30,400.00 CHARGEABLE INCOME 77,600.00 Tax Payable $3,182.00',
    'noa-2024.pdf': 'Tax Reference Number : Date : GXXXX000A 01 Apr 2024 Income Tax Notice of Assessment (Original) YEAR OF ASSESSMENT 2024 EMPLOYMENT 3,428.00 INCOME^ 3,428.00 ($) + RELIEFS 1,000.00 Earned Income 1,000.00 DEDUCTIONS 1,000.00 ($) - TAX COMPUTATION Tax Payable $0.00 CHARGEABLE INCOME 2,428.00 ($) =' };
    (() => { const t = new DataTransfer(); for (const name of ['noa-current.pdf', 'noa-2024.pdf']) t.items.add(new File(['%PDF-1.7 synthetic test'], name, { type: 'application/pdf' }));
      const input = document.querySelector('input[aria-label="Notice of Assessment PDFs"]'); input.files = t.files; input.dispatchEvent(new Event('change', { bubbles: true })); })();`);
  await until(`document.querySelectorAll('article[aria-label^="Review"]').length === 2 && document.querySelectorAll('article[aria-label^="Review"] input').length === 12`, 'two NOAs read');
  assert.ok((await text()).includes('Creates a YA 2024 record'), 'new year from the 2024 notice');
  assert.ok((await text()).includes(`YA ${ya}; your detailed estimate is kept`), 'existing year keeps its estimate');
  assert.equal(await evaluate(`[...document.querySelectorAll('article[aria-label^="Review"]')].filter(a => a.innerText.includes('Figures add up')).length`), 2);
  await click('Save all 2');
  await until(`JSON.parse(localStorage.getItem('subtrack_tax_years_v1') || '[]').length === 2 && !document.querySelector('article[aria-label^="Review"]')`, 'both NOAs saved');
  const current = (await stored()).find(y => y.ya === ya), first = (await stored()).find(y => y.ya === 2024);
  assert.equal(current.noaSummary.chargeable, 77600);
  assert.equal(current.employment, 108000, 'NOA import preserves detailed estimate');
  assert.equal(current.paidTax, undefined, 'NOA does not mark tax as paid');
  assert.deepEqual([first.status, first.assessedTax, first.employment, first.noaDate], ['Assessed', 0, 3428, '2024-04-01']);
  assert.equal(first.noaSummary.lines.length, 2);
  await until(`[...document.querySelectorAll('ol[aria-label="Notices by Year of Assessment"] li')].find(li => li.innerText.includes('YA 2024'))?.innerText.includes('NOA on file')`, 'timeline shows the 2024 NOA');
  await tab('Overview');
  await until(`document.body.innerText.includes('Reviewed NOA totals') && document.body.textContent.includes('Tax computation')`, 'NOA breakdown with tax computation');
  // The last notice saved (YA 2024) is shown: under $20,000 is taxed at 0%.
  assert.ok((await evaluate('document.body.textContent')).includes('Tax on the next $2,428'), 'YA 2024 computation');
  await fill('Year of Assessment', ya);
  await until(`document.body.textContent.includes('Tax on the first $40,000') && document.body.textContent.includes('Tax on the next $37,600')`, 'current-year NOA computation lines');
  await click('Calculated estimate');
  await until(`document.body.innerText.includes('Calculated estimate')`, 'switch to calculated breakdown');
  await click('Uploaded NOA');
  await send('Page.reload'); await until(`document.body.innerText.includes('Tax assessed')`, 'reload');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const name of ['Overview', 'Projections', 'Records & NOAs', 'Save tax', 'Learn']) {
    await tab(name); assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, name + ' mobile overflow');
  }
  for (const theme of ['light', 'dark']) for (const width of [320, 1440]) {
    await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`);
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
    for (const name of ['Overview', 'Projections', 'Records & NOAs']) {
      await tab(name); assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, `${name} ${theme} ${width}px overflow`);
    }
  }
  await evaluate(`document.documentElement.classList.remove('dark')`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click(`Add YA ${ya - 1}`); await until(`!!document.querySelector('dialog[open]')`, 'mobile editor');
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, 'editor mobile overflow');
  if (process.env.TAX_SHOTS) {
    const shot = async name => writeFileSync(`${process.env.TAX_SHOTS}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'));
    await shot('tax-mobile-editor');
    await evaluate(`document.querySelector('button[aria-label="Close tax form"]')?.click()`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1500, deviceScaleFactor: 1, mobile: false });
    await tab('Overview'); await new Promise(r => setTimeout(r, 200)); await shot('tax-overview');
    await tab('Projections'); await new Promise(r => setTimeout(r, 200)); await shot('tax-projections');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await new Promise(r => setTimeout(r, 200)); await shot('tax-mobile-projections');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1500, deviceScaleFactor: 1, mobile: false });
    await tab('Save tax'); await new Promise(r => setTimeout(r, 200)); await shot('tax-save');
    await tab('Records & NOAs'); await new Promise(r => setTimeout(r, 200)); await shot('tax-records');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: live active-income projections, growth and year mapping, NOA-style breakdown and tax computation, multi-file NOA records from YA 2024, assessment separation, saved-year workflows, reload persistence and mobile layouts.');

} finally {
  socket?.close(); if (browser?.exitCode === null) { if (process.platform === 'win32') await new Promise(r => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('close', r)); else browser.kill(); }
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-tax-browser-')) throw new Error('Unexpected test directory');
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
