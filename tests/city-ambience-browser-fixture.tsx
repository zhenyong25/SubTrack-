import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, type CityState } from '../services/cityGameService';

const today = '2026-11-04', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 1_000_000 };
for (const [type, x, z] of [
  ['cinema', 41, 49], ['departmentstore', 43, 49], ['citymall', 45, 49], ['metropolisspire', 52, 49], ['skyhotel', 54, 49],
  ['park', 41, 52], ['pocketgarden', 42, 52], ['bamboogrove', 43, 52], ['botanicalgarden', 44, 52], ['urbanforest', 46, 52], ['wetlandreserve', 52, 52],
  ['fusioninstitute', 56, 49], ['waterreclamation', 54, 52], ['apartment', 56, 52],
  ['shop', 58, 52], ['duckpond', 58, 50], ['fountain', 47, 50], ['townhouse', 47, 49],
] as const) {
  const r = build(initial, type, x, z, now, today, `${type}-${x}`);
  if (r.error) throw new Error(`${type}: ${r.error}`); initial = r.state!;
}
function Fixture() {
  const [city, setCity] = useState(initial), [paused, setPaused] = useState(false), [focus, setFocus] = useState({ x: 52.5, z: 50, key: 1 });
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">City lights & wildlife</h1>
    <p>Digital posters, bright nights, birds overhead and wildlife in the gardens.</p>
    <div className="flex flex-wrap gap-3">
      <button id="view-screens" onClick={() => setFocus({ x: 52.5, z: 50, key: Date.now() })}>City lights</button>
      <button id="view-wildlife" onClick={() => setFocus({ x: 45, z: 53, key: Date.now() })}>Wildlife</button>
      <button id="view-pond" onClick={() => setFocus({ x: 58, z: 50, key: Date.now() })}>Pond life</button>
      <button id="pause-ambience" onClick={() => setPaused(p => !p)}>Pause</button>
      <button id="clear-ambience" onClick={() => setCity(c => ({ ...c, buildings: [] }))}>Clear buildings</button>
    </div>
    <CityScene3D city={city} paused={paused} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  for (let i = 0; i < 1800; i++) {
    const d = document.querySelector('canvas')?.dataset;
    const reactions = JSON.parse(d?.wildlifeReactions || '{}');
    if (Number(d?.digitalBillboards) === 8 && Number(d?.billboardSeconds) > 2 && reactions.birdsScattered > 0 && ['sparrow', 'crow', 'swallow', 'parrot', 'flamingo', 'peacock', 'fox', 'hedgehog', 'butterfly', 'koi'].every(s => d?.animals?.split(',').includes(s))) {
      document.getElementById('result')!.textContent = 'PASS: eight digital screens animate, butterflies and koi render, and birds react to real residents.'; return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Missing ambience: ' + JSON.stringify(document.querySelector('canvas')?.dataset));
}
verify().catch(e => { document.getElementById('result')!.textContent = 'FAIL: ' + e.message; });
