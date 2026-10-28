import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executable) throw new Error('A Chromium browser is required.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-crypto-chart-'));
let server, browser;
try {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import CryptoAssetChart from './components/CryptoAssetChart';
    let calls = [], fail = false;
    window.fetch = async url => {
      calls.push(String(url));
      if (fail) return new Response('{}', {status:503});
      const now = Math.floor(Date.now()/1000);
      return new Response(JSON.stringify({coins:{'coingecko:bitcoin':String(url).includes('/chart/') ? {prices:[{timestamp:now-7200,price:80000},{timestamp:now-3600,price:82000}]} : String(url).includes('/percentage/') ? 2.5 : {price:83000,timestamp:now-60,confidence:0.99}}}));
    };
    function App() { const [open,setOpen]=useState(true); return open ? <CryptoAssetChart markets={[{key:'coingecko:bitcoin',symbol:'BTC',name:'Bitcoin'}]} onClose={()=>setOpen(false)} /> : <p>Chart closed</p>; }
    createRoot(document.getElementById('root')).render(<App/>);
    let stage='quote';
    const waitFor = async check => { for(let n=0;n<100;n++){if(check()) return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Browser condition timed out: '+stage+'; '+document.body.textContent.slice(0,700));};
    const button = text => [...document.querySelectorAll('button')].find(item=>item.textContent.trim()===text);
    (async()=>{
      try {
        await waitFor(()=>document.body.textContent.includes('83,000'));
        if(!document.querySelector('dialog[open]')) throw new Error('Modal did not open');
        stage='chart rendering'; await waitFor(()=>document.querySelector('.recharts-surface'));
        if(!document.body.textContent.includes('+2.50%')) throw new Error('24h price change missing');
        button('24H').click();
        stage='range switch'; await waitFor(()=>calls.some(url=>url.includes('period=1h')));
        await waitFor(()=>button('Refresh') && !button('Refresh').disabled);
        fail=true; button('Refresh').click();
        stage='refresh error'; await waitFor(()=>document.querySelector('[role=alert]'));
        if(!document.body.textContent.includes('83,000')) throw new Error('Failed refresh lost the previous quote');
        document.querySelector('[aria-label="Close asset chart"]').click();
        await waitFor(()=>!document.querySelector('dialog'));
        document.getElementById('result').textContent='PASS: modal, live quote, chart, range selection, error state and closing';
      }catch(error){document.getElementById('result').textContent='FAIL: '+error.message+'; calls='+JSON.stringify(calls);}
    })();
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  server = createServer((request, response) => {
    if (request.url === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle.outputFiles[0].contents); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><style>dialog{width:850px}.h-72{height:288px}body{font:14px sans-serif}</style></head><body><div id="root"></div><pre id="result">RUNNING</pre><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${directory}`, '--window-size=1100,900', '--virtual-time-budget=15000', '--dump-dom', `http://127.0.0.1:${server.address().port}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  browser.stdout.on('data', data => { output += data; });
  const code = await Promise.race([new Promise(resolve => browser.once('exit', resolve)), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Browser timed out')), 45000); timer.unref(); })]);
  assert.equal(code, 0);
  const result = output.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
  assert.ok(result?.startsWith('PASS:'), result || 'No browser test result.');
  console.log(result);
} finally {
  if (browser && browser.exitCode === null) browser.kill();
  server?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-crypto-chart-')) throw new Error('Unexpected browser directory');
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Chromium may retain a temporary profile briefly. */ }
}
