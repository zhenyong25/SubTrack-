import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Set CHROME_PATH to Chromium.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-auth-refresh-'));
let browser, socket, server;
try {
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import App from './App';
      window.__authSession={user:{id:'account-a',email:'a@example.test',user_metadata:{}},access_token:'initial'};
      window.__loadCount=0;
      window.__authClient={auth:{
        onAuthStateChange(callback){
          window.__emitAuth=(event,session)=>{window.__authSession=session;callback(event,session)};
          return {data:{subscription:{unsubscribe(){}}}};
        }
      }};
      createRoot(document.getElementById('root')).render(<App/>);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}', 'process.env': '{}', 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'test-auth-provider', setup(builder) {
      builder.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'asset-url' }));
      builder.onLoad({ filter: /.*/, namespace: 'asset-url' }, () => ({ contents: 'export default "/unused-test-worker.js";', loader: 'js' }));
      builder.onLoad({ filter: /[\\/]appDataService\.ts$/ }, args => {
        let source = readFileSync(args.path, 'utf8');
        const substitutions = [
          ['export const isSupabaseConfigured = () => Boolean(supabase);', 'export const isSupabaseConfigured = () => true;'],
          ['export const getSupabaseClient = () => supabase;', 'export const getSupabaseClient = () => (window as any).__authClient;'],
          ['export const getSupabaseSession = async () => {', 'const getLocalSession = async () => {'],
          ['export const loadAppData = async (): Promise<LoadedAppData> => {', 'const loadActualAppData = async (): Promise<LoadedAppData> => {'],
        ];
        for (const [from, to] of substitutions) { if (!source.includes(from)) throw new Error('Auth fixture anchor changed: ' + from); source = source.replace(from, to); }
        source += `\nexport const getSupabaseSession=async()=>(window as any).__authSession;\nexport const loadAppData=async()=>{(window as any).__loadCount++;await new Promise(resolve=>setTimeout(resolve,40));return loadActualAppData();};`;
        return { contents: source, loader: 'ts' };
      });
    } }],
  });
  const css = readFileSync(path.join('dist/assets', readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.css'))));
  server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
    else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else if (req.url.startsWith('/api/') || req.url.startsWith('/service-logos/')) { res.statusCode = 404; res.end(); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'); }
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
  const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timed out: ${expression}; ${exceptions.join('; ')}`); };
  await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await waitFor(`!!document.querySelector('button[aria-label="Expenses"]') && typeof window.__emitAuth === 'function'`);
  assert.equal(await evaluate('window.__loadCount'), 1);
  await evaluate(`document.querySelector('button[aria-label="Expenses"]').click()`);
  await waitFor(`!!document.querySelector('input[aria-label="Search expenses"]')`);
  await evaluate(`window.__search=document.querySelector('input[aria-label="Search expenses"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(window.__search,'keep this search');window.__search.dispatchEvent(new Event('input',{bubbles:true}));`);
  for (const event of ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED']) {
    await evaluate(`window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));window.__emitAuth(${JSON.stringify(event)},{...window.__authSession,access_token:Math.random().toString(),user:{...window.__authSession.user}})`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await evaluate('window.__loadCount'), 1, `${event} must not bootstrap all data`);
    assert.ok(await evaluate(`window.__search === document.querySelector('input[aria-label="Search expenses"]')`), 'screen was unmounted on refocus');
    assert.equal(await evaluate('window.__search.value'), 'keep this search');
  }
  await evaluate(`window.__emitAuth('SIGNED_IN',{...window.__authSession,user:{id:'account-b',email:'b@example.test',user_metadata:{}}})`);
  await waitFor('window.__loadCount === 2'); await waitFor(`!!document.querySelector('button[aria-label="Expenses"]')`);
  await evaluate(`window.__emitAuth('SIGNED_OUT',null)`);
  await waitFor(`!!document.querySelector('input[type="password"]')`);
  assert.deepEqual(exceptions, []);
  console.log('PASS: refocus auth events preserve the mounted expense screen and search; real account changes reload data and sign-out shows authentication.');
} finally {
  socket?.close(); browser?.kill(); server?.close();
  if (browser && browser.exitCode === null) await Promise.race([new Promise(resolve => browser.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-auth-refresh-')) throw new Error('Unexpected temporary directory');
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Chromium may briefly retain files. */ }
}
