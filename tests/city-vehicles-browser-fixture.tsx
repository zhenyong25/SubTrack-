import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, buildRoads, cityStats, newCity, roadPath, type CityState, type RoadKind } from '../services/cityGameService';

// Every kind of road with traffic on it: a tram line along the main street, an avenue, a
// cobbled ring round the Town Hall and a country lane, with bus and tram stops and a taxi rank.
const today = '2026-11-04', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 1_000_000, chunks: Array.from({ length: 100 }, (_, i) => i) };
const errors: string[] = [];
const road = (kind: RoadKind, from: [number, number], to: [number, number]) => {
  const result = buildRoads(initial, roadPath({ x: from[0], z: from[1] }, { x: to[0], z: to[1] }), now, today, kind);
  if (result.error) errors.push(`${kind}: ${result.error}`); else initial = result.state!;
};
road('tram', [41, 51], [58, 51]);
road('avenue', [51, 41], [51, 50]);
road('cobble', [48, 48], [51, 48]); road('cobble', [48, 48], [48, 51]);
road('country', [59, 51], [66, 51]); road('country', [66, 51], [66, 44]);
road('street', [52, 44], [58, 44]);
for (const [type, x, z] of [
  ['tower', 41, 49], ['tower', 43, 49], ['twintowers', 52, 45], ['tower', 54, 45], ['fusioninstitute', 56, 52], ['waterreclamation', 58, 52],
  ['busstop', 50, 43], ['tramstop', 45, 52], ['taxistand', 47, 52], ['cafe', 46, 52], ['shop', 44, 52], ['wheatfield', 67, 48], ['redbarn', 67, 46],
] as const) {
  const result = build(initial, type, x, z, now, today, type + x + z);
  if (result.error) errors.push(`${type}@${x},${z}: ${result.error}`); else initial = result.state!;
}
const views: Record<string, [number, number]> = { tram: [45, 51], avenue: [51, 45], cobble: [47.5, 49.5], country: [64, 51] };
function Fixture() {
  const [city] = useState(initial), [focus, setFocus] = useState<{ x: number; z: number; key: number } | null>(null);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Roads and vehicles</h1>
    <div className="flex flex-wrap gap-3">{Object.entries(views).map(([name, [x, z]]) => <button key={name} id={`view-${name}`} onClick={() => setFocus({ x, z, key: Date.now() })}>{name}</button>)}</div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  if (errors.length) throw new Error('Could not build: ' + errors.join('; '));
  for (let i = 0; i < 1200; i++) {
    const vehicles = document.querySelector<HTMLCanvasElement>('canvas')?.dataset.vehicles || '';
    const models = vehicles.split(',').filter(Boolean).map(entry => entry.split(':')[0]);
    if (models.includes('tram') && models.includes('bus') && models.includes('taxi') && models.length >= 6) { document.getElementById('result')!.textContent = `PASS: ${vehicles}`; return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Vehicle mix incomplete: ' + document.querySelector('canvas')?.dataset.vehicles);
}
verify().catch(e => { document.getElementById('result')!.textContent = 'FAIL: ' + e.message; });
