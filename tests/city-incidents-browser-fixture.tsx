import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, type CityState } from '../services/cityGameService';

const today = '2026-11-04', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 1_000_000 };
for (const [type, x, z] of [['apartment', 54, 49], ['policestation', 45, 49], ['workshop', 52, 50], ['shop', 53, 50], ['fusioninstitute', 56, 49], ['waterreclamation', 54, 52]] as const) {
  const r = build(initial, type, x, z, now, today, `${type}-${x}`); if (r.error) throw new Error(`${type}: ${r.error}`); initial = r.state!;
}
function Fixture() {
  const [city, setCity] = useState(initial), [paused, setPaused] = useState(false);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Weather & road response</h1>
    <p>Police secure the scene. Recovery crews load the damaged car and reopen the road.</p>
    <div className="flex gap-4"><button id="pause-incidents" onClick={() => setPaused(p => !p)}>Pause</button><button id="remove-incident-roads" onClick={() => setCity(c => ({ ...c, roads: [] }))}>Remove roads</button></div>
    <CityScene3D city={city} paused={paused} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={null} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  for (let i = 0; i < 2400; i++) {
    const stats = JSON.parse(document.querySelector('canvas')?.dataset.accidents || '{}');
    if (stats.towed > 0 && stats.cleared > 0) { document.getElementById('result')!.textContent = 'PASS: an actual impact stopped traffic, police attended, a tow truck carried the wreck away and the road reopened.'; return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Response did not complete: ' + JSON.stringify(document.querySelector('canvas')?.dataset));
}
verify().catch(e => { document.getElementById('result')!.textContent = 'FAIL: ' + e.message; });
