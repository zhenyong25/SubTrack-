import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable) throw new Error('A Chromium browser is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-accountant-browser-'));
let server, browser;
try {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import CityAccountantOffice from './components/CityAccountantOffice';
    const rows=[
      {id:'a',name:'Coffee',expenseDate:'2026-10-28',category:'Food',amount:5,currency:'MYR'},
      {id:'b',name:'Coffee',expenseDate:'2026-10-28',category:'Food',amount:5,currency:'MYR'},
      {id:'c',name:'Notebook',expenseDate:'2026-10-27',category:'Other',amount:35,currency:'MYR'},
      {id:'d',name:'Lunch',expenseDate:'2026-10-21',category:'Food',amount:10,currency:'MYR'}
    ];
    function App(){
      const [open,setOpen]=useState(false),[report,setReport]=useState(undefined);
      return <><button id="visit" onClick={()=>setOpen(true)}>Visit Accountant</button><CityAccountantOffice open={open} expenses={rows} today="2026-10-28" report={report} onReport={next=>{window.savedReport=next;setReport(next)}} onWorking={()=>{}} onClose={()=>setOpen(false)} onOpenExpenses={()=>{window.openedExpenses=true;setOpen(false)}}/></>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
    const waitFor=async(check,label)=>{for(let n=0;n<100;n++){if(check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Timed out: '+label);};
    (async()=>{try{
      await waitFor(()=>document.getElementById('visit'),'mount');
      await waitFor(()=>window.savedReport,'automatic review');
      document.getElementById('visit').click();
      await waitFor(()=>document.querySelector('dialog[open]'),'visit office');
      if(window.savedReport.reviewed!==3)throw new Error('Incorrect expense count');
      await waitFor(()=>document.querySelector('canvas[data-scene-ready="true"]'),'3D room rendering');
      const canvas=document.querySelector('canvas[data-scene-ready="true"]');
      const gl=canvas.getContext('webgl2');
      if(!gl || gl.isContextLost())throw new Error('WebGL room unavailable');
      const desk=[...document.querySelectorAll('button')].find(button=>button.textContent.includes('desk'));
      desk.click();
      await waitFor(()=>desk.getAttribute('aria-pressed')==='true','desk camera');
      document.querySelector('[aria-label="Zoom into office"]').click();
      canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
      document.querySelector('[aria-label="Reset office camera"]').click();
      if(!document.body.textContent.includes('45.00 MYR'))throw new Error('Spending total missing');
      if(!document.body.textContent.includes('Check 2 matching Coffee entries'))throw new Error('Duplicate finding missing');
      if(!document.body.textContent.includes('1 expense to categorise'))throw new Error('Category finding missing');
      const before=window.savedReport;
      [...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Run review').click();
      await waitFor(()=>window.savedReport!==before,'manual review');
      document.querySelector('[aria-label="Close accountant office"]').click();
      await waitFor(()=>!document.querySelector('dialog'),'close');
      await waitFor(()=>gl.isContextLost(),'3D resource cleanup');
      document.getElementById('visit').click();
      await waitFor(()=>document.querySelector('dialog[open]'),'reopen');
      [...document.querySelectorAll('button')].find(button=>button.textContent.includes('Open Expenses')).click();
      await waitFor(()=>window.openedExpenses,'expense navigation');
      document.getElementById('visit').click();
      await waitFor(()=>document.querySelector('dialog[open]'),'screenshot');
      await waitFor(()=>document.querySelector('canvas[data-scene-ready="true"]'),'recreated 3D room');
      if(document.querySelectorAll('canvas').length!==1)throw new Error('Leaked render canvas');
      document.getElementById('result').textContent='PASS: WebGL interior, desk camera, zoom, keyboard orbit, resource cleanup, review and report navigation';
    }catch(error){document.getElementById('result').textContent='FAIL: '+error.message}})();
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  const cssFile = readdirSync('dist/assets').filter(name => name.endsWith('.css')).map(name => path.join('dist/assets', name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  server = createServer((request, response) => {
    if (request.url === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle.outputFiles[0].contents); }
    else if (request.url === '/styles.css') { response.setHeader('Content-Type', 'text/css'); response.end(readFileSync(cssFile)); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body style="background:#edf4f3"><div id="root"></div><pre id="result">RUNNING</pre><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  mkdirSync('artifacts', { recursive: true });
  browser = spawn(executable, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${directory}`, '--window-size=1440,1050', '--virtual-time-budget=12000', `--screenshot=${path.resolve('artifacts/city-accountant-office.png')}`, '--dump-dom', `http://127.0.0.1:${server.address().port}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  browser.stdout.on('data', data => { output += data; });
  const code = await Promise.race([new Promise(resolve => browser.once('exit', resolve)), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Browser timed out')), 45000); timer.unref(); })]);
  assert.equal(code, 0);
  const result = output.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
  assert.ok(result?.startsWith('PASS:'), result || 'No browser result.');
  console.log(result);
} finally {
  if (browser && browser.exitCode === null) browser.kill();
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-accountant-browser-')) throw new Error('Unexpected browser directory');
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Chromium may retain the temporary profile briefly. */ }
}
