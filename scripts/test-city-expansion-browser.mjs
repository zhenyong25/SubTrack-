import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('Set CHROME_PATH to Chromium.');
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-city-expansion-'));
let browser, socket, server;
const gallery = process.argv.includes('--gallery');
const recreation = process.argv.includes('--recreation');
const movement = process.argv.includes('--movement');
const activities = process.argv.includes('--activities');
const vehicles = process.argv.includes('--vehicles');
const animalsMode = process.argv.includes('--animals');
const ambienceMode = process.argv.includes('--ambience');
const incidentsMode = process.argv.includes('--incidents');
const aviationMode = process.argv.includes('--aviation');
const terrainMode = process.argv.includes('--terrain');
const upgradesMode = process.argv.includes('--upgrades');
const stopsMode = process.argv.includes('--stops');
const windowsMode = process.argv.includes('--windows');
const rotationMode = process.argv.includes('--rotation');
const boats = process.argv.includes('--boats');
const roadsideMode = process.argv.includes('--roadside');
const replayPath = process.env.CITY_REPLAY_PATH;
const graphicsFlags = process.env.CITY_BROWSER_GPU === 'hardware'
  ? (process.platform === 'win32' ? ['--use-angle=d3d11'] : [])
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
try {
  const replayDefinitions = { '__CITY_REPLAY__': replayPath ? JSON.stringify(JSON.parse(readFileSync(replayPath, 'utf8'))) : 'null' };
  const bundle = await build({ entryPoints: [incidentsMode ? 'tests/city-incidents-browser-fixture.tsx' : ambienceMode ? 'tests/city-ambience-browser-fixture.tsx' : gallery ? 'tests/city-building-gallery.ts' : rotationMode ? 'tests/city-rotation-browser-fixture.tsx' : windowsMode ? 'tests/city-windows-browser-fixture.tsx' : stopsMode ? 'tests/city-stops-browser-fixture.tsx' : upgradesMode ? 'tests/city-upgrades-browser-fixture.tsx' : terrainMode ? 'tests/city-terrain-browser-fixture.tsx' : aviationMode ? 'tests/city-aviation-browser-fixture.tsx' : roadsideMode ? 'tests/city-roadside-browser-fixture.tsx' : animalsMode ? 'tests/city-animals-browser-fixture.tsx' : vehicles ? 'tests/city-vehicles-browser-fixture.tsx' : boats ? 'tests/city-boats-browser-fixture.tsx' : activities ? 'tests/city-activities-browser-fixture.tsx' : movement ? 'tests/city-movement-browser-fixture.tsx' : recreation ? 'tests/city-recreation-browser-fixture.tsx' : 'tests/city-expansion-browser-fixture.tsx'], bundle: true, write: false, format: 'iife', define: { ...replayDefinitions, 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' } });
  const css = readFileSync(path.join('dist/assets', readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.css'))));
  server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root" style="padding:16px"></div><pre id="result">RUNNING</pre><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(executable, ['--headless=new', ...graphicsFlags, '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000); browser.on('error', reject); browser.stderr.on('data', data => { const match = data.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); });
  const target = await (await fetch(`http://${new URL(url).host}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); let id = 0; const errors = [];
  const scripts = new Map(); let pausedFrame = null;
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.method === 'Debugger.scriptParsed') scripts.set(data.params.scriptId, data.params); if (data.method === 'Debugger.paused') pausedFrame = data.params.callFrames[0]; if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text); const p = pending.get(data.id); if (p) { pending.delete(data.id); data.error ? p.reject(data.error) : p.resolve(data.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  await send('Runtime.enable');
  if (incidentsMode) await send('Debugger.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: activities || boats || roadsideMode ? 960 : 1440, height: activities || boats || roadsideMode ? 720 : 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  if (incidentsMode) {
    for (let i = 0; i < 200; i++) { if (await evaluate('Boolean(document.querySelector("canvas")?.dataset.accidents)')) break; await new Promise(resolve => setTimeout(resolve, 50)); }
    const script = [...scripts.values()].find(s => s.url.endsWith('/app.js')); assert.ok(script, 'City bundle was loaded');
    const source = (await send('Debugger.getScriptSource', { scriptId: script.scriptId })).scriptSource;
    const at = source.indexOf('traffic.update(dt, motion);'); assert.ok(at >= 0);
    const lineNumber = source.slice(0, at).split('\n').length - 1;
    const bp = await send('Debugger.setBreakpoint', { location: { scriptId: script.scriptId, lineNumber } });
    for (let i = 0; i < 200 && !pausedFrame; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(pausedFrame, 'Paused before the traffic physics step');
    // Isolated test city only: arrange a real rear-end impact and disable background fleet
    // growth. The normal physics, collision detector and emergency routing then run unchanged.
    const setup = await send('Debugger.evaluateOnCallFrame', { callFrameId: pausedFrame.callFrameId, expression: `(() => {
      const cars = traffic.cars; if (cars.length < 2) throw new Error('Not enough test cars');
      traffic.cars = cars.slice(0, 2); traffic.setCount = () => {};
      Object.assign(traffic.cars[0], { from: 5351, to: 5451, previous: 5251, next: 5551, after: 5651, t: .1, speed: 1, model: 'sedan', dwell: 0, skid: 1.5, target: undefined });
      Object.assign(traffic.cars[1], { from: 5351, to: 5451, previous: 5251, next: 5551, after: 5651, t: .8, speed: .7, model: 'hatchback', dwell: 200, target: undefined });
      incidents.previous = []; weather.setChoice('sunny'); return true;
    })()`, returnByValue: true });
    assert.equal(setup.exceptionDetails, undefined, JSON.stringify(setup.exceptionDetails));
    await send('Debugger.removeBreakpoint', { breakpointId: bp.breakpointId }); await send('Debugger.resume'); await send('Debugger.disable');
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
  }
  let result;
  const incidentScreenshots = new Set();
  const boatScreenshots = new Set();
  for (let i = 0; i < (activities || movement || boats || roadsideMode || vehicles || animalsMode || aviationMode || ambienceMode || incidentsMode || stopsMode ? 3600 : recreation ? 1400 : 400); i++) {
    result = await evaluate('document.getElementById("result")?.textContent'); if (result && result !== 'RUNNING') break;
    assert.deepEqual(errors, [], 'Browser runtime errors');
    if (incidentsMode) {
      const scenes = JSON.parse(await evaluate('document.querySelector("canvas")?.dataset.emergencyScenes || "[]"'));
      if (i > 0 && i % 200 === 0) console.log('Response progress: ' + JSON.stringify(scenes));
      for (const phase of ['controlling', 'loading', 'recovering']) if (!incidentScreenshots.has(phase) && scenes.some(s => s.stage === phase)) {
        await evaluate(`document.querySelector('[data-testid="road-incident-status"] button')?.click()`);
        if (!incidentScreenshots.size) for (let zoom = 0; zoom < 6; zoom++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
        await new Promise(resolve => setTimeout(resolve, 200)); mkdirSync('artifacts/city-expansion', { recursive: true });
        writeFileSync(`artifacts/city-expansion/accident-${phase}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); incidentScreenshots.add(phase);
      }
    }
    if (boats) {
      const voyages = JSON.parse(await evaluate('document.querySelector("canvas")?.dataset.boatVoyages || "[]"'));
      for (const phase of replayPath ? ['sightseeing'] : ['fishing', 'sightseeing']) if (!boatScreenshots.has(phase) && voyages.some(v => v.phase === phase && v.passengers > 0)) {
        await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click();document.getElementById('view-${phase}').click()`);
        if (!boatScreenshots.size) for (let zoom = 0; zoom < 8; zoom++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
        await new Promise(resolve => setTimeout(resolve, 750));
        mkdirSync('artifacts/city-expansion', { recursive: true });
        writeFileSync(`artifacts/city-expansion/boats-${replayPath ? 'saved-city' : phase}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); boatScreenshots.add(phase);
      }
    }
    if (roadsideMode && i > 0 && i % 300 === 0) console.log('Roadside progress: ' + await evaluate('JSON.stringify(document.querySelector("canvas")?.dataset)'));
    if (activities && i > 0 && i % 300 === 0) console.log('Activity progress: ' + await evaluate('JSON.stringify(document.querySelector("canvas")?.dataset)'));
    if (boats && i > 0 && i % 300 === 0) console.log('Boat progress: ' + await evaluate('document.querySelector("canvas")?.dataset.boatVoyages'));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(result?.startsWith('PASS:'), `${result}; ${errors.join('; ')}`);
  assert.deepEqual(errors, []);
  mkdirSync('artifacts/city-expansion', { recursive: true });
  if (roadsideMode) {
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    for (let zoom = 0; zoom < 7; zoom++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    for (const model of ['bus', 'taxi', 'garbage']) {
      await evaluate(`document.getElementById('view-${model}').click()`); await new Promise(resolve => setTimeout(resolve, 750));
      writeFileSync(`artifacts/city-expansion/roadside-${model}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    await evaluate(`document.getElementById('pause-roadside').click()`); await new Promise(resolve => setTimeout(resolve, 250));
    const frozen = await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`);
    await new Promise(resolve => setTimeout(resolve, 600)); assert.equal(await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`), frozen);
    await evaluate(`document.getElementById('pause-roadside').click()`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.getElementById('result').style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%'`);
    await new Promise(resolve => setTimeout(resolve, 500)); assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'));
    writeFileSync('artifacts/city-expansion/roadside-mobile.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('remove-roadside').click()`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('canvas')?.dataset.roadsideVehicles === '[]'`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.roadsideVehicles`), '[]');
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.transitRiding`), '0');
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.garbageCollectors`), '0');
    console.log(result + ' Pause, mobile layout and road removal passed.');
  } else if (incidentsMode) {
    assert.equal(incidentScreenshots.size, 3, 'Police control, loading and recovery were visible');
    for (let i = 0; i < 3; i++) await evaluate(`document.querySelector('button[aria-label="Zoom out"]').click()`);
    for (const mode of ['sunny', 'cloudy', 'rain', 'thunderstorm']) {
      await evaluate(`(() => { const select = document.querySelector('select[aria-label="City weather"]'); select.value = '${mode}'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await new Promise(resolve => setTimeout(resolve, 3500));
      assert.equal(await evaluate(`document.querySelector('canvas').dataset.weather`), mode);
      if (mode === 'rain' || mode === 'thunderstorm') assert.ok(Number(await evaluate(`document.querySelector('canvas').dataset.rainDrops`)) > 1000);
      writeFileSync(`artifacts/city-expansion/weather-${mode}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    let lightning = false;
    for (let i = 0; i < 350; i++) { if (Number(await evaluate(`document.querySelector('canvas').dataset.lightning`)) > 0) { lightning = true; break; } await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(lightning, 'Thunderstorm produces visible lightning');
    await evaluate(`document.getElementById('pause-incidents').click()`); await new Promise(resolve => setTimeout(resolve, 300));
    const frozen = await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`);
    await new Promise(resolve => setTimeout(resolve, 600)); assert.equal(await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`), frozen);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.getElementById('result').style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%'`);
    await new Promise(resolve => setTimeout(resolve, 300)); assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'));
    await evaluate(`document.getElementById('pause-incidents').click();document.getElementById('remove-incident-roads').click()`);
    await new Promise(resolve => setTimeout(resolve, 500)); assert.equal(await evaluate(`document.querySelector('canvas').dataset.emergencyScenes`), '[]');
    assert.deepEqual(errors, []); console.log(result + ' All weather modes, lightning, pause, mobile layout and road removal passed.');
  } else if (ambienceMode) {
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click();document.getElementById('view-screens').click()`);
    for (let i = 0; i < 6; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    writeFileSync('artifacts/city-expansion/billboards-day.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.querySelector('button[aria-label="Switch to night"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    writeFileSync('artifacts/city-expansion/billboards-night.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]').click();document.getElementById('view-wildlife').click()`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    writeFileSync('artifacts/city-expansion/wildlife-expanded.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('view-pond').click()`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    writeFileSync('artifacts/city-expansion/wildlife-pond.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('pause-ambience').click()`);
    await new Promise(resolve => setTimeout(resolve, 300));
    const clock = await evaluate(`document.querySelector('canvas').dataset.billboardSeconds`);
    const wildlife = await evaluate(`document.querySelector('canvas').dataset.wildlifeReactions`);
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.billboardSeconds`), clock);
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.wildlifeReactions`), wildlife);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.getElementById('result').style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%'`);
    await new Promise(resolve => setTimeout(resolve, 400)); assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'));
    await evaluate(`document.getElementById('pause-ambience').click();document.getElementById('clear-ambience').click()`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('canvas')?.dataset.digitalBillboards === '0'`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.digitalBillboards`), '0');
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.animals`), '');
    assert.deepEqual(errors, []);
    console.log(result + ' Day/night, pause, mobile layout and demolition passed.');
  } else if (gallery) {
    for (const category of ['farming', 'harbour', 'fishing', 'highrise', 'shopping', 'dining', 'recreation', 'culture', 'transport', 'civic', 'science', 'nature']) {
      await evaluate(`window.renderBuildingGallery(${JSON.stringify(category)})`);
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      writeFileSync(`artifacts/city-expansion/models-${category}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 690, scale: 1 } })).data, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log('PASS: gallery rendered all 120 individual models across 12 category sheets.');
  } else if (rotationMode) {
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    for (let i = 0; i < 6; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    for (const view of ['cottages', 'cafes']) {
      await evaluate(`document.getElementById('view-${view}').click()`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      writeFileSync(`artifacts/city-expansion/rotation-${view}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log(result + ' Screenshots in artifacts/city-expansion/rotation-*.png.');
  } else if (windowsMode) {
    // Night falls; a minute later the residents have spread out to work, home and the streets.
    // Starts in whatever the clock says; make sure it is night, without toggling twice.
    await evaluate(`document.querySelector('button[aria-label="Switch to night"]')?.click()`);
    for (let i = 0; i < 3; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    await evaluate(`document.getElementById('view-street').click()`);
    for (let shot = 0; shot < 2; shot++) {
      await new Promise(resolve => setTimeout(resolve, shot ? 30000 : 4000));
      writeFileSync(`artifacts/city-expansion/windows-night-${shot}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log('WINDOWS ' + await evaluate(`document.querySelector('canvas').dataset.windowLights`));
    console.log(result + ' Screenshots in artifacts/city-expansion/windows-night-*.png.');
  } else if (stopsMode) {
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    for (let i = 0; i < 6; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    await evaluate(`document.getElementById('view-stops').click()`);
    for (let shot = 0; shot < 3; shot++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      writeFileSync(`artifacts/city-expansion/stops-${shot}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log(result + ' Screenshots in artifacts/city-expansion/stops-*.png.');
  } else if (upgradesMode) {
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    for (let i = 0; i < 5; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    for (const view of ['cottages', 'offices']) {
      await evaluate(`document.getElementById('view-${view}').click()`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      writeFileSync(`artifacts/city-expansion/upgrades-${view}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    // And from the street side, where the planters, lamps and statues are.
    for (let i = 0; i < 4; i++) { await evaluate(`document.querySelector('button[aria-label="Rotate left"]').click()`); await new Promise(resolve => setTimeout(resolve, 600)); }
    for (const view of ['cottages', 'offices']) {
      await evaluate(`document.getElementById('view-${view}').click()`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      writeFileSync(`artifacts/city-expansion/upgrades-${view}-front.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log(result + ' Screenshots in artifacts/city-expansion/upgrades-*.png.');
  } else if (terrainMode) {
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    for (const [view, zoom] of (process.argv.includes('--rest') ? [['island', 0], ['bridge', 5]] : [['valley', 0], ['volcano', 0], ['island', 0], ['bridge', 5]])) {
      for (let i = 0; i < zoom; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
      await evaluate(`document.getElementById('view-${view}').click()`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      writeFileSync(`artifacts/city-expansion/terrain-${view}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log(result + ' Screenshots in artifacts/city-expansion/terrain-*.png.');
  } else if (aviationMode) {
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    for (let i = 0; i < 5; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    for (const [view, shots] of [['airport', 3], ['roofs', 3]]) {
      if (view === 'roofs') for (let i = 0; i < 3; i++) await evaluate(`document.querySelector('button[aria-label="Zoom out"]').click()`);
      await evaluate(`document.getElementById('view-${view}').click()`);
      for (let shot = 0; shot < shots; shot++) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        writeFileSync(`artifacts/city-expansion/aviation-${view}-${shot}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      }
    }
    assert.deepEqual(errors, []);
    console.log(result + ' Screenshots in artifacts/city-expansion/aviation-*.png.');
  } else if (animalsMode) {
    if (process.argv.includes("--rotate")) for (let i = 0; i < 4; i++) { await evaluate(`document.querySelector('button[aria-label="Rotate left"]')?.click()`); await new Promise(resolve => setTimeout(resolve, 600)); }
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    for (let i = 0; i < 8; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    for (const view of ['farm', 'barn', 'paddy', 'nature']) {
      await evaluate(`document.getElementById('view-${view}').click()`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      writeFileSync(`artifacts/city-expansion/animals-${view}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log(result + ' Screenshots in artifacts/city-expansion/animals-*.png.');
  } else if (vehicles) {
    // Close-ups of each road kind with its traffic.
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    for (let i = 0; i < 8; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    for (const view of ['tram', 'avenue', 'cobble', 'country']) {
      await evaluate(`document.getElementById('view-${view}').click()`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      writeFileSync(`artifacts/city-expansion/roads-${view}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log(result + ' Screenshots in artifacts/city-expansion/roads-*.png.');
  } else if (boats) {
    assert.equal(boatScreenshots.size, replayPath ? 1 : 2, 'Offshore activity was rendered');
    if (replayPath) {
      await evaluate(`document.getElementById('inspect-fishing-road').click()`);
      for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('[data-testid="boat-trip-status"]')?.textContent.includes('No road access')`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
      assert.ok(await evaluate(`document.querySelector('[data-testid="boat-trip-status"]').textContent.includes('No road access')`), 'The unconnected fishing boathouse explains why it cannot start');
      await evaluate(`document.getElementById('view-sightseeing').click()`);
    }
    await evaluate(`document.getElementById('pause-boats').click()`); await new Promise(resolve => setTimeout(resolve, 250));
    const frozen = await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`);
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.equal(await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`), frozen, 'Pause freezes boats and passengers');
    await evaluate(`document.getElementById('pause-boats').click()`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`JSON.stringify(document.querySelector('canvas').dataset) !== ${JSON.stringify(frozen)}`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.notEqual(await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`), frozen);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.getElementById('result').style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%'`);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), 'Mobile boats overflow');
    writeFileSync('artifacts/city-expansion/boats-mobile.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('remove-boats').click()`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('canvas')?.dataset.boatVoyages === '[]'`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.boatVoyages`), '[]', 'Removing harbours removes their boats and trips');
    console.log(result + ' Pause/resume, mobile layout and harbour removal passed.');
  } else if (movement) {
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click();document.querySelector('button[aria-label="Zoom in"]').click();document.querySelector('button[aria-label="Zoom in"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    writeFileSync('artifacts/city-expansion/movement-desktop.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('pause-movement').click()`); await new Promise(resolve => setTimeout(resolve, 250));
    const before = await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`); await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`), before, 'Pause must freeze signals, visits and traffic');
    await evaluate(`document.getElementById('pause-movement').click()`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await new Promise(resolve => setTimeout(resolve, 500));
    await evaluate(`document.getElementById('result').style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%'`);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), 'Mobile city overflows');
    writeFileSync('artifacts/city-expansion/movement-mobile.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('remove-movement').click();document.getElementById('remove-roads').click()`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('canvas')?.dataset.trafficSignals === '0'`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.trafficSignals`), '0');
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.buildingVisitors`), '0');
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.activeCrossings`), '0');
    assert.deepEqual(errors, []);
    console.log(result + ' Pause/resume, mobile layout and demolition passed.');
  } else if (activities) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    // A close look at each part of town: the lake shore, the ferry, the centre's streets.
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    for (let i = 0; i < 4; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    for (const view of ['lake', 'ferry', 'south', 'market', 'north', 'farms']) {
      await evaluate(`document.getElementById('view-${view}').click()`);
      await new Promise(resolve => setTimeout(resolve, 2500));
      writeFileSync(`artifacts/city-expansion/activities-${view}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    for (let i = 0; i < 4; i++) await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click()`);
    for (const view of ['lake', 'south', 'market', 'north', 'farms']) {
      await evaluate(`document.getElementById('view-${view}').click()`);
      await new Promise(resolve => setTimeout(resolve, 2500));
      writeFileSync(`artifacts/city-expansion/activities-${view}-close.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    }
    await evaluate(`document.getElementById('pause').click()`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const frozen = await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`);
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.equal(await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`), frozen, 'Pause freezes the activity clock, tractors, visitors and crossings');
    await evaluate(`document.getElementById('pause').click()`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`JSON.stringify(document.querySelector('canvas').dataset) !== ${JSON.stringify(frozen)}`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.notEqual(await evaluate(`JSON.stringify(document.querySelector('canvas').dataset)`), frozen, 'Resume restarts the simulation');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.getElementById('result').style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%'`);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), 'Mobile activities overflow');
    writeFileSync('artifacts/city-expansion/activities-farms-mobile.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('remove-activities').click()`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('canvas')?.dataset.farmTractors === '0'`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.farmTractors`), '0', 'Demolition removes tractors');
    assert.deepEqual(errors, []);
    console.log(result + ' Screenshots in artifacts/city-expansion/activities-*.png.');
  } else if (recreation) {
    // Move closer to the actual court users before recording the live scene.
    await evaluate(`document.querySelector('button[aria-label="Switch to day"]')?.click()`);
    await evaluate(`document.querySelector('button[aria-label="Zoom in"]').click();document.querySelector('button[aria-label="Zoom in"]').click();document.querySelector('button[aria-label="Zoom in"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    writeFileSync('artifacts/city-expansion/recreation-active.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await evaluate(`document.getElementById('pause-recreation').click()`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const count = await evaluate(`document.querySelector('canvas').dataset.recreationVisitors`);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.recreationVisitors`), count);
    await evaluate(`document.getElementById('pause-recreation').click();document.getElementById('remove-recreation').click()`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('canvas')?.dataset.recreationVisitors === '0'`)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal(await evaluate(`document.querySelector('canvas').dataset.recreationVisitors`), '0');
    assert.deepEqual(errors, []);
    console.log(result + ' Pause/resume and recreation demolition passed.');
  } else {
  writeFileSync('artifacts/city-expansion/desktop.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate(`document.querySelector('.city-building-catalogue').closest('section').scrollIntoView()`);
  writeFileSync('artifacts/city-expansion/catalogue.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await evaluate(`document.getElementById('result').style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%'`);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= 390'), 'mobile layout overflows horizontally: ' + JSON.stringify(await evaluate(`[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 391).slice(0,8).map(e => ({tag:e.tagName, class:e.className, width:e.getBoundingClientRect().width}))`)));
  writeFileSync('artifacts/city-expansion/mobile.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log(result + ' Desktop and mobile layouts passed.');
  }
} finally {
  socket?.close(); browser?.kill(); server?.close();
  if (browser && browser.exitCode === null) await Promise.race([new Promise(resolve => browser.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-city-expansion-')) throw new Error('Unexpected temporary directory');
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* Browser may briefly retain files. */ }
}
