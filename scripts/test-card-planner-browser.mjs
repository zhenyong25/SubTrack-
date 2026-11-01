import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Set CHROME_PATH to Chromium.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-card-planner-browser-'));
const artifactPath = path.resolve('artifacts/card-planner');
const key = 'subtrack_card_plan_v1:planner-browser:my';
let browser, socket, server;
try {
  const result = await build({
    stdin: { contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import CardsTab from './components/CardsTab';
      const sample=(id,name,features)=>({id,name,issuer:'Example Bank',imageUrl:null,url:'https://example.com/'+id,applyUrl:null,categories:['Cashback'],highlights:[{value:'Category benefits',label:features}],keyFeatures:[features],annualFee:null,minIncome:null,minIncomeForeigner:null,interestRate:null,network:null,promotion:null,promotionEnds:null,summary:null});
      for(const country of ['my','sg'])localStorage.setItem('subtrack_card_market_v1:'+country,JSON.stringify({country,source:'Browser fixture',sourceUrl:'https://example.com',fetchedAt:new Date().toISOString(),warnings:[],cards:[sample('online','Online Cashback','Online shopping and local retail'),sample('everyday','Everyday Rewards','Groceries, dining and petrol'),sample('travel','Travel Essentials','Travel and overseas spending')]}));
      const own=[{id:'owned-1',name:'My credit card',kind:'Credit',type:'Visa',last4Digits:'1234',color:'#3b82f6',creditLimit:5000,currentDebt:500}];
      function Fixture(){const [owner,setOwner]=useState('planner-browser');window.__setOwner=setOwner;return <main style={{padding:24,maxWidth:1500,margin:'auto'}}><CardsTab ownerKey={owner} cards={own} subscriptions={[]} expenses={[]} cardPointTransactions={[]} baseCurrency="MYR" onAddCard={()=>{}} onViewCard={()=>{}} onEditCard={()=>{}} onDeleteCard={()=>{}}/></main>};
      createRoot(document.getElementById('root')).render(<Fixture/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', define: { 'import.meta.env': '{}', 'process.env': '{}', 'process.env.NODE_ENV': '"development"' },
  });
  const css = readFileSync(path.join('dist/assets', readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.css'))));
  server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(result.outputFiles[0].text); }
    else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else if (req.url.startsWith('/api/')) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Fixture: card service unavailable' })); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000); browser.on('error', reject); browser.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); });
  const target = await (await fetch(`http://${new URL(url).host}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map(), exceptions = []; let sequence = 0;
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text); const task = pending.get(data.id); if (task) { pending.delete(data.id); data.error ? task.reject(data.error) : task.resolve(data.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timed out: ${expression}; ${exceptions.join('; ')}; page: ${await evaluate('document.body.innerText.slice(-2500)')}`); };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const byText = text => evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`);
  const fill = (label, value, type = 'HTMLInputElement') => evaluate(`(()=>{const el=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');Object.getOwnPropertyDescriptor(${type}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(${JSON.stringify(type === 'HTMLSelectElement' ? 'change' : 'input')},{bubbles:true}));})()`);
  const saved = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
  const drag = (sourceSelector, targetSelector, move = false) => evaluate(`(()=>{const from=document.querySelector(${JSON.stringify(sourceSelector)}),to=document.querySelector(${JSON.stringify(targetSelector)}),data=new DataTransfer();from.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));to.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));to.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()`);
  const screenshot = async name => { mkdirSync(artifactPath, { recursive: true }); const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(path.join(artifactPath, name + '.png'), Buffer.from(shot.data, 'base64')); };
  const board = 'section[aria-label="Card planning board"]';
  await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1480, height: 1050, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await waitFor(`document.querySelectorAll('[role="tab"]').length===4`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[role="tab"]')].map(e=>e.textContent.trim())`), ['My cards', 'Singapore cards', 'Malaysia cards', 'Card board']);
  await byText('Card board'); await waitFor(`!!document.querySelector(${JSON.stringify(board)})`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-planner-card]').length`), 0);
  await screenshot('empty-desktop');

  // Add via drag events, reject duplicate and untrusted payloads, then use the accessible Add path.
  await drag('[data-library-card="market:my:online"]', board);
  await waitFor(`document.querySelectorAll('[data-planner-card]').length===1`);
  await drag('[data-library-card="market:my:online"]', board);
  assert.equal((await saved()).cards.length, 1);
  await evaluate(`(()=>{const data=new DataTransfer();data.setData('application/x-subtrack-planner-card','external-untrusted-id');document.querySelector(${JSON.stringify(board)}).dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()`);
  assert.equal((await saved()).cards.length, 1);
  await click('[aria-label="Add Everyday Rewards to board"]'); await waitFor(`document.querySelectorAll('[data-planner-card]').length===2`);
  await fill('Monthly spending budget', '3000');
  await fill('Online Cashback credit limit', '6000'); await fill('Online Cashback outstanding balance', '500');
  await fill('Add category to Online Cashback', 'online', 'HTMLSelectElement');
  await fill('Online Cashback Online spend', '1200'); await fill('Online Cashback Online cashback %', '5');
  await fill('Everyday Rewards credit limit', '6000'); await fill('Everyday Rewards outstanding balance', '300');
  await fill('Add category to Everyday Rewards', 'groceries', 'HTMLSelectElement');
  await fill('Everyday Rewards Groceries spend', '600'); await fill('Everyday Rewards Groceries cashback %', '3');
  await evaluate(`document.querySelectorAll('[data-planner-card] > details').forEach(d=>d.open=true)`);
  await fill('Online Cashback shared credit limit group', 'shared facility'); await fill('Everyday Rewards shared credit limit group', 'shared facility');
  await fill('Online Cashback monthly cashback cap', '50'); await fill('Everyday Rewards monthly cashback cap', '30');
  await waitFor(`document.querySelector('section[aria-label="Monthly plan summary"]').textContent.includes('MYR 5,200.00')`);
  const summaryText = await evaluate(`document.querySelector('section[aria-label="Monthly plan summary"]').textContent`);
  for (const amount of ['MYR 1,800.00', 'MYR 1,200.00', 'MYR 5,200.00', 'MYR 3,400.00', 'MYR 6,000.00']) assert.ok(summaryText.includes(amount), amount);
  assert.ok(await evaluate(`document.querySelector('[aria-label="Category spending guide"]').textContent.includes('MYR 68.00')`));

  await drag('[data-planner-card="market:my:everyday"] > [draggable]', '[data-planner-card="market:my:online"]', true);
  await waitFor(`document.querySelector('[data-planner-card]').getAttribute('data-planner-card')==='market:my:everyday'`);
  await click('[aria-label="Move Everyday Rewards later"]');
  await waitFor(`document.querySelector('[data-planner-card]').getAttribute('data-planner-card')==='market:my:online'`);
  await click('[aria-label="Remove Everyday Rewards from board"]'); await waitFor(`document.querySelectorAll('[data-planner-card]').length===1`);
  await byText('Undo remove'); await waitFor(`document.querySelectorAll('[data-planner-card]').length===2`);
  assert.equal((await saved()).cards[1].allocations[0].amount, 600);
  await byText('My cards 1'); await click('[aria-label="Add My credit card to board"]');
  await waitFor(`document.querySelectorAll('[data-planner-card]').length===3`);
  const mine = (await saved()).cards.find(c => c.source === 'My cards'); assert.equal(mine.creditLimit, 5000); assert.equal(mine.balance, 500);
  await click('[aria-label="Remove My credit card from board"]');
  await byText('Market cards');
  await evaluate(`document.querySelectorAll('[data-planner-card] > details').forEach(d=>d.open=false);window.scrollTo(0,0)`);
  await screenshot('planned-desktop');

  await send('Page.reload'); await waitFor(`document.querySelectorAll('[data-planner-card]').length===2`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Monthly spending budget"]').value`), '3000');
  await fill('Board currency', 'sg', 'HTMLSelectElement'); await waitFor(`document.querySelectorAll('[data-planner-card]').length===0`);
  await fill('Monthly spending budget', '2000'); await click('[aria-label="Add Travel Essentials to board"]');
  await fill('Board currency', 'my', 'HTMLSelectElement'); await waitFor(`document.querySelectorAll('[data-planner-card]').length===2`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Monthly spending budget"]').value`), '3000');
  await evaluate(`window.__setOwner('other-account')`); await waitFor(`document.querySelectorAll('[data-planner-card]').length===0`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Monthly spending budget"]').value`), '');
  await evaluate(`window.__setOwner('planner-browser')`); await waitFor(`document.querySelectorAll('[data-planner-card]').length===2`);

  // Browser-tab refocus leaves this board mounted and its active input intact.
  await evaluate(`window.__budget=document.querySelector('[aria-label="Monthly spending budget"]');window.__budget.focus();window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))`);
  assert.equal(await evaluate(`window.__budget===document.querySelector('[aria-label="Monthly spending budget"]')`), true);

  // A narrow viewport must fit the board and all numeric inputs without horizontal page overflow.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`window.scrollTo(0,0)`); await screenshot('mobile-library');
  await evaluate(`document.querySelector('[aria-label="Monthly plan summary"]').scrollIntoView({block:'start'})`); await screenshot('mobile-plan');
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+1`), 'Mobile page overflows horizontally');
  await fill('Monthly spending budget', '1000'); await waitFor(`document.body.textContent.includes('exceeds your monthly budget')`);
  await fill('Online Cashback credit limit', '6500'); await waitFor(`document.body.textContent.includes('Inconsistent groups are excluded')`);
  await fill('Online Cashback credit limit', '6000');
  await click('[aria-label="Refresh card library"]'); await waitFor(`document.body.textContent.includes('Fixture: card service unavailable')`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-planner-card]').length`), 2, 'Fetch errors must preserve the saved board');

  // Damaged storage is shown explicitly and never silently overwritten on load or Add.
  await evaluate(`localStorage.setItem(${JSON.stringify(key)},'{invalid')`); await send('Page.reload');
  await waitFor(`document.body.textContent.includes('Reset saved board')`);
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`), '{invalid');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Add Online Cashback to board"]').disabled`), true);
  assert.deepEqual(exceptions, []);
  console.log('PASS: Card board tab, drag/add/reorder, budgets, shared limits, cashback, remove/undo, own-card values, reload, currency/account isolation, refocus, mobile fit, fetch errors, and damaged-storage protection.');
  console.log('Screenshots: ' + artifactPath);
} finally {
  socket?.close(); browser?.kill(); server?.close();
  if (browser && browser.exitCode === null) await Promise.race([new Promise(resolve => browser.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-card-planner-browser-')) throw new Error('Unexpected temporary directory');
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Chromium may briefly retain files. */ }
}
