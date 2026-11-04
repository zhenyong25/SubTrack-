import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, type CityState } from '../services/cityGameService';

// Farms, parks, a forest, a bamboo grove, ponds and a fountain along the main street.
const today = '2026-11-04', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 1_000_000 };
const errors: string[] = [];
for (const [type, x, z] of [
  ['dairyfarm', 41, 52], ['redbarn', 43, 52], ['appleorchard', 44, 52], ['graincooperative', 46, 52], ['ricepaddy', 52, 52], ['vineyard', 54, 52],
  ['fountain', 56, 52], ['cottage', 57, 52], ['duckpond', 58, 52], ['park', 41, 50], ['bamboogrove', 42, 50], ['picnicgrove', 43, 50],
  ['urbanforest', 44, 49], ['wetlandreserve', 46, 49],
] as const) {
  const result = build(initial, type, x, z, now, today, type + x + z);
  if (result.error) errors.push(`${type}@${x},${z}: ${result.error}`); else initial = result.state!;
}
const views: Record<string, [number, number]> = { farm: [42, 52.2], barn: [44, 52.5], paddy: [53.5, 53], nature: [43, 50] };
function Fixture() {
  const [city] = useState(initial), [focus, setFocus] = useState<{ x: number; z: number; key: number } | null>(null), [paused, setPaused] = useState(false);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Animals in My City</h1>
    <div className="flex flex-wrap gap-3"><button id="pause" onClick={() => setPaused(p => !p)}>Pause</button>{Object.entries(views).map(([name, [x, z]]) => <button key={name} id={`view-${name}`} onClick={() => setFocus({ x, z, key: Date.now() })}>{name}</button>)}</div>
    <CityScene3D city={city} paused={paused} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  if (errors.length) throw new Error('Could not build: ' + errors.join('; '));
  for (let i = 0; i < 600; i++) {
    const animals = (document.querySelector<HTMLCanvasElement>('canvas')?.dataset.animals || '').split(',');
    if (['cow', 'chicken', 'sheep', 'pig', 'horse', 'goat', 'duck', 'panda', 'deer', 'pigeon'].every(name => animals.includes(name))) { document.getElementById('result')!.textContent = `PASS: ${animals.join(', ')}`; return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Missing animals: ' + document.querySelector('canvas')?.dataset.animals);
}
verify().catch(e => { document.getElementById('result')!.textContent = 'FAIL: ' + e.message; });
