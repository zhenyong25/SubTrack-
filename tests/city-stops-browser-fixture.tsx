import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { addStop, build, cityStats, newCity, tileIndex, type CityState } from '../services/cityGameService';

// A bus stop and a taxi stand on the pavements of the main street, with homes to fill them.
const today = '2026-11-04', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 1_000_000 };
const errors: string[] = [];
for (const [type, x, z] of [['tower', 41, 52], ['tower', 52, 52], ['fusioninstitute', 56, 52], ['waterreclamation', 54, 52]] as const) {
  const result = build(initial, type, x, z, now, today, type + x); if (result.error) errors.push(`${type}: ${result.error}`); else initial = result.state!;
}
for (const [x, kind] of [[45, 'bus'], [47, 'taxi'], [55, 'bus'], [57, 'taxi']] as const) for (let side = 0; side < 2; side++) {
  const result = addStop(initial, tileIndex(x, 51), kind, now, today); if (result.error) errors.push(`${kind}@${x}: ${result.error}`); else initial = result.state!;
}
function Fixture() {
  const [city] = useState(initial), [focus, setFocus] = useState<{ x: number; z: number; key: number } | null>(null);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Stops on the pavement</h1>
    <div className="flex flex-wrap gap-3"><button id="view-stops" onClick={() => setFocus({ x: 46, z: 51, key: Date.now() })}>stops</button></div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  if (errors.length) throw new Error('Could not build: ' + errors.join('; '));
  for (let i = 0; i < 6600; i++) {
    const boarded = JSON.parse(document.querySelector<HTMLCanvasElement>('canvas')?.dataset.transitBoarded || '{}');
    if ((boarded.busBoarded || 0) + (boarded.taxiBoarded || 0) > 0) { document.getElementById('result')!.textContent = `PASS: ${JSON.stringify(boarded)}`; return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Nobody boarded at a pavement stop: ' + document.querySelector('canvas')?.dataset.transitBoarded);
}
verify().catch(e => { document.getElementById('result')!.textContent = 'FAIL: ' + e.message; });
