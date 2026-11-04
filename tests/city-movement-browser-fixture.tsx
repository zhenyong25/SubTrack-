import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, type CityState } from '../services/cityGameService';

const today = '2026-11-01', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 100000, xp: 100000 };
for (const [type, x, z] of [
  ['apartment', 45, 48], ['cottage', 47, 50], ['cottage', 52, 50], ['market', 45, 52], ['shop', 47, 52],
  ['cafe', 52, 52], ['playground', 53, 52], ['fusioninstitute', 56, 52], ['watertower', 55, 52],
] as const) {
  const result = build(initial, type, x, z, now, today, type + x);
  if (result.error) throw new Error(type + ': ' + result.error); initial = result.state!;
}
function Fixture() {
  const [city, setCity] = useState(initial), [paused, setPaused] = useState(false);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">A living neighbourhood</h1><p className="text-sm text-secondary">Residents visit the market and shops. Traffic waits for the pedestrian crossing to clear.</p>
    <div className="flex flex-wrap gap-4"><button id="pause-movement" onClick={() => setPaused(p => !p)}>Pause / resume</button><button id="remove-movement" onClick={() => setCity(c => ({ ...c, buildings: c.buildings.filter(b => !['market', 'shop', 'cafe'].includes(b.type)) }))}>Remove shops</button><button id="remove-roads" onClick={() => setCity(c => ({ ...c, roads: [] }))}>Remove roads</button></div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={{ x: 48, z: 51, key: 1 }} paused={paused} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  const seen = { waiting: false, crossing: false, stopped: false, walk: false, cars: false };
  // Software rendering in CI can run the simulation at a fraction of real time.
  for (let i = 0; i < 6600; i++) {
    const d = document.querySelector('canvas')?.dataset;
    if (d) {
      seen.waiting ||= Number(d.waitingPedestrians) > 0; seen.crossing ||= Number(d.activeCrossings) > 0;
      seen.stopped ||= Number(d.stoppedCars) > 0; seen.walk ||= d.signalPhases?.includes('walk') || false; seen.cars ||= d.signalPhases?.includes('cars') || false;
      if (Number(d.buildingEntries) > 0 && Number(d.buildingExits) > 0 && Number(d.pedestrianCrossings) > 0 && Object.values(seen).every(Boolean)) {
        document.getElementById('result')!.textContent = 'PASS: visible building entries/exits, waiting walkers, completed road crossings, traffic stopping, and live red/green signal phases.'; return;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Movement did not complete: ' + JSON.stringify(document.querySelector('canvas')?.dataset) + '; ' + JSON.stringify(seen));
}
verify().catch(error => { document.getElementById('result')!.textContent = 'FAIL: ' + error.message; });
