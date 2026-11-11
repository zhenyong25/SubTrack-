import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const audit = process.argv.includes('--audit');
const mainOnly = process.argv.includes('--main-only');
const formsOnly = process.argv.includes('--forms-only');
const widthArgument = process.argv.find(value => value.startsWith('--width='));
const widths = widthArgument ? [Number(widthArgument.split('=')[1])] : [320, 390, 768, 1024, 1440];
const output = process.argv.includes('--before') ? 'artifacts/ui-review/before' : 'artifacts/ui-review/after';
const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Set CHROME_PATH to Chromium.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-ui-'));
const tabs = ['Subscriptions', 'Cards', 'Expenses', 'Income', 'Investments', 'Trade', 'Net worth', 'Debts', 'Goals', 'Insurance', 'My City', 'Settings'];
const report = { errors: [], screens: [] };
let browser, socket, server;
try {
  const bundle = await build({
    entryPoints: ['tests/ui-browser-fixture.tsx'], bundle: true, write: false, format: 'esm',
    loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}', 'process.env': '{}', 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-worker-url', setup(builder) {
      builder.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'fixture-url' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture-url' }, () => ({ contents: 'export default "/unused-worker.js";', loader: 'js' }));
    } }],
  });
  const css = readFileSync(path.join('dist/assets', readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.css'))));
  server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles.find(f => f.path.endsWith('.js'))?.contents || bundle.outputFiles[0].contents); }
    else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else if (req.url === '/' || req.url.startsWith('/?')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000); browser.on('error', reject); browser.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); });
  const target = await (await fetch(`http://${new URL(url).host}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0; const pending = new Map();
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') report.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text); const request = pending.get(message.id); if (request) { pending.delete(message.id); message.error ? request.reject(message.error) : request.resolve(message.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const waitFor = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 75)); } throw new Error('Timed out: ' + expression + '\n' + report.errors.join('\n') + '\nFocused: ' + await evaluate('document.activeElement.outerHTML.slice(0,500)')); };
  const click = (text, scope = 'main') => evaluate(`(() => { const button = Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(b => b.textContent.trim().replace(/\\s*Beta$/i, '').trim() === ${JSON.stringify(text)}); if (!button) return false; button.click(); return true; })()`);
  const inspect = async (name, width, theme, screenshot = true) => {
    await new Promise(resolve => setTimeout(resolve, name.includes('City') ? 1000 : 450));
    const result = await evaluate(`(() => {
      const main = document.querySelector('.app-main') || document.querySelector('#root');
      const visible = e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
      const unnamed = Array.from(document.querySelectorAll('button')).filter(visible).filter(b => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title') && !b.querySelector('img[alt]')).map(b => b.outerHTML.slice(0, 260));
      const overflow = Array.from(main.querySelectorAll('*')).filter(e => visible(e) && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('svg') && !e.closest('.fixed')).filter(e => { let p = e.parentElement; while(p && p !== main) { if (['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX)) return false; p = p.parentElement; } return true; }).slice(0, 6).map(e => ({tag:e.tagName, text:e.textContent.slice(0,60), classes:e.className}));
      const navigation = document.querySelector('.app-navigation');
      const selected = navigation?.querySelector('[aria-current="page"]');
      const navBounds = navigation?.getBoundingClientRect(), selectedBounds = selected?.getBoundingClientRect();
      return { pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, overflow, unnamed, mainWidth: main.clientWidth, navOverflow: navigation ? navigation.scrollWidth > navigation.clientWidth : false, selectedNavVisible: !selected || (selectedBounds.left >= navBounds.left && selectedBounds.right <= navBounds.right) };
    })()`);
    report.screens.push({ name, width, theme, ...result });
    mkdirSync(output, { recursive: true }); writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
    if (screenshot) { mkdirSync(output, { recursive: true }); writeFileSync(`${output}/${width}-${theme}-${name.replaceAll(/[^a-z0-9]+/gi, '-')}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); }
    if (!audit) {
      assert.equal(result.pageOverflow, false, `${name} overflows at ${width}px (${theme})`);
      assert.deepEqual(result.overflow, [], `${name} has content outside its scroll containers`);
      assert.deepEqual(result.unnamed, [], `${name} has buttons without accessible names`);
      assert.equal(result.selectedNavVisible, true, `${name} selected navigation is off screen`);
    }
  };
  await send('Runtime.enable'); await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
  // Stable screenshots also verify the reduced-motion presentation.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await waitFor(`!!document.querySelector('.app-navigation')`);
  if (!audit) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await waitFor(`document.activeElement.textContent.trim() === 'Skip to content'`);
    assert.equal(await evaluate(`getComputedStyle(document.activeElement).position`), 'fixed', 'Keyboard skip link is visible');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor(`document.activeElement.id === 'main-content'`);
    const alpha = await evaluate(`(() => { const sample = document.createElement('div'); sample.className = 'bg-primary/10 border border-primary/20'; document.body.append(sample); const computed = getComputedStyle(sample); const canvas = document.createElement('canvas'), context = canvas.getContext('2d'); context.fillStyle = computed.backgroundColor; context.fillRect(0,0,1,1); const background = context.getImageData(0,0,1,1).data[3]; context.clearRect(0,0,1,1); context.fillStyle = computed.borderTopColor; context.fillRect(0,0,1,1); const border = context.getImageData(0,0,1,1).data[3]; sample.remove(); return {background,border}; })()`);
    assert.ok(alpha.background >= 25 && alpha.background <= 26, 'Theme background opacity works');
    assert.equal(alpha.border, 51, 'Theme border opacity works');
  }
  for (const width of formsOnly ? [] : widths) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`);
      await new Promise(resolve => setTimeout(resolve, 200));
      for (const tab of tabs) {
        await evaluate(`document.querySelector('.app-navigation button[aria-label="${tab === 'Trade' ? 'Trade (beta)' : tab}"]').click(); window.scrollTo(0,0);`);
        await waitFor(`!!document.querySelector('.app-main > *')`);
        await inspect(tab, width, theme, [390, 1440].includes(width));
      }
    }
    console.log(`Reviewed 12 main screens at ${width}px in light and dark mode.`);
  }
  // Secondary views have different layouts and denser controls than their parent screens.
  for (const width of mainOnly ? [] : [390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
    await evaluate(`document.documentElement.classList.remove('dark')`);
    for (const tab of formsOnly ? [] : ['Trade', 'Cards', 'Investments', 'Net worth']) {
      await evaluate(`document.querySelector('.app-navigation button[aria-label="${tab === 'Trade' ? 'Trade (beta)' : tab}"]').click(); window.scrollTo(0,0);`);
      await new Promise(resolve => setTimeout(resolve, 200));
      const options = tab === 'Trade' ? ['Hot', 'Scanner', 'Options', 'Journal', 'Rules', 'Earnings', 'Patterns'] : tab === 'Cards' ? ['Card board', 'Singapore cards', 'Malaysia cards'] : tab === 'Investments' ? ['Returns', 'Dividends', 'Tax lots'] : ['Forecast', 'Financial review'];
      for (const option of options) {
        assert.ok(await click(option), `${tab}: ${option} is available`);
        await inspect(`${tab}-${option}`, width, 'light');
      }
      if (tab === 'Investments') {
        for (const category of ['Crypto', 'Pokemon Cards', 'Poker']) {
          await evaluate(`Array.from(document.querySelectorAll('.investment-controls button')).find(b => b.textContent.trim().startsWith(${JSON.stringify(category)})).click()`);
          await inspect(`Investments-${category}`, width, 'light');
          if (category === 'Pokemon Cards') {
            for (const view of ['Shops & gyms', 'Events', 'Grading & repair', 'Scam watch']) {
              assert.ok(await click(view)); await inspect(`Pokemon-${view}`, width, 'light');
            }
          }
        }
      }
    }
    await evaluate(`document.querySelector('.app-navigation button[aria-label="Subscriptions"]').click()`);
    await waitFor(`!!document.querySelector('[aria-label="View Netflix subscription"]')`);
    await evaluate(`var tile = document.querySelector('[aria-label="View Netflix subscription"]'); tile.focus(); tile.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true}));`);
    await waitFor(`!!document.querySelector('[aria-label="Close subscription details"]')`);
    await inspect('Subscription-details', width, 'light');
    await evaluate(`document.querySelector('[aria-label="Close subscription details"]').click()`);
    await evaluate(`document.querySelector('[aria-label="Open global search"]').click()`);
    await waitFor(`!!document.querySelector('[aria-label="Search all records"]')`);
    await inspect('Global-search', width, 'light');
    await evaluate(`document.querySelector('[aria-label="Close global search"]').click()`);
    await evaluate(`document.querySelector('button[aria-label^="Smart reminders"]').click()`);
    await waitFor(`!!document.querySelector('[aria-label="Close smart reminders"]')`);
    await inspect('Smart-reminders', width, 'light');
    await evaluate(`document.querySelector('[aria-label="Close smart reminders"]').click()`);
    await evaluate(`document.querySelector('.app-navigation button[aria-label="Cards"]').click()`);
    assert.ok(await click('My cards'));
    await waitFor(`!!document.querySelector('[aria-label="Edit DBS Altitude Visa"]')`);
    await evaluate(`document.querySelector('[aria-label="Edit DBS Altitude Visa"]').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor(`!!document.querySelector('[aria-label="Back"]')`);
    await inspect('Card-edit-form', width, 'light');
    await evaluate(`document.querySelector('[aria-label="Back"]').click()`);
    // Form close controls and overflow, without saving or changing any records.
    for (const [tab, open, close] of [
      ['Subscriptions', 'Add subscription', 'Close subscription form'],
      ['Income', 'Add income', 'Close income form'],
      ['Expenses', 'Add expense', 'Close expense form'],
    ]) {
      await evaluate(`document.querySelector('.app-navigation button[aria-label="${tab}"]').click()`);
      await waitFor(`!!document.querySelector('.app-add-button')`);
      await evaluate(`document.querySelector('.app-add-button').click()`);
      await waitFor(`!!document.querySelector('form')`);
      await inspect(`${tab}-form`, width, 'light');
      if (!audit && tab !== 'Expenses') assert.equal(await evaluate(`Array.from(document.querySelectorAll('form input:not([type="checkbox"]), form select, form textarea')).filter(e => !e.getAttribute('aria-label') && !e.labels?.length).length`), 0, `${tab} fields have accessible labels`);
      await evaluate(`document.querySelector('button[aria-label="${close}"]').click()`);
      await waitFor(`!!document.querySelector('.app-navigation')`);
    }
    for (const [tab, open, close] of [
      ['Insurance', 'Add policy', 'Close insurance form'],
      ['Goals', 'New goal', 'Close'],
    ]) {
      await evaluate(`document.querySelector('.app-navigation button[aria-label="${tab}"]').click()`);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.ok(await click(open));
      await waitFor(`!!document.querySelector('dialog[open], [role="dialog"]')`);
      await inspect(`${tab}-form`, width, 'light');
      if (tab === 'Insurance') await evaluate(`document.querySelector('button[aria-label="${close}"]').click()`);
      else await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await waitFor(`!document.querySelector('dialog[open], [role="dialog"]')`);
    }
  }
  // Switching destinations restores the page to the top; resizing keeps navigation visible.
  await evaluate(`document.querySelector('.app-navigation button[aria-label="Subscriptions"]').click(); window.scrollTo(0, 900); document.querySelector('.app-navigation button[aria-label="Settings"]').click()`);
  await waitFor('window.scrollY === 0');
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 1000, deviceScaleFactor: 1, mobile: true });
  await inspect('Settings-after-resize', 320, 'light', false);
  for (const mode of mainOnly ? [] : ['empty', 'auth']) {
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?mode=${mode}` });
    await waitFor(mode === 'empty' ? `!!document.querySelector('.app-navigation')` : `!!document.querySelector('input[type="password"]')`);
    for (const width of [320, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 640 });
      if (mode === 'auth') await inspect('Authentication', width, 'dark');
      else for (const tab of tabs.filter(tab => tab !== 'My City')) {
        await evaluate(`document.querySelector('.app-navigation button[aria-label="${tab === 'Trade' ? 'Trade (beta)' : tab}"]').click()`);
        await inspect(`${tab}-empty`, width, 'light', width === 320);
      }
    }
  }
  mkdirSync(output, { recursive: true }); writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
  assert.deepEqual(report.errors, [], 'No runtime errors');
  console.log(`PASS: ${report.screens.length} UI layouts reviewed. Report: ${output}/report.json`);
} finally {
  socket?.close(); server?.close();
  if (browser?.exitCode === null) {
    if (process.platform === 'win32') await new Promise(resolve => spawn('taskkill', ['/pid', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('close', resolve));
    else browser.kill();
  }
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-ui-')) throw new Error('Unexpected temporary profile');
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
