import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, type CityState } from '../services/cityGameService';

// An airport beside a cluster of towers and office blocks with rooftop helipads.
const today = '2026-11-04', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 1_000_000 };
const errors: string[] = [];
for (const [type, x, z] of [
  ['airport', 53, 52], ['tower', 41, 49], ['office', 43, 49], ['glasstower', 45, 49], ['gardenhighrise', 52, 46], ['tower', 52, 44], ['slimcondo', 50, 44],
  ['fusioninstitute', 41, 52], ['waterreclamation', 43, 52],
] as const) {
  const result = build(initial, type, x, z, now, today, type + x + z);
  if (result.error) errors.push(`${type}@${x},${z}: ${result.error}`); else initial = result.state!;
}
const views: Record<string, [number, number]> = { airport: [55, 53.5], roofs: [44, 49.5] };
function Fixture() {
  const [city] = useState(initial), [focus, setFocus] = useState<{ x: number; z: number; key: number } | null>(null);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Airport and helicopters</h1>
    <div className="flex flex-wrap gap-3">{Object.entries(views).map(([name, [x, z]]) => <button key={name} id={`view-${name}`} onClick={() => setFocus({ x, z, key: Date.now() })}>{name}</button>)}</div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  if (errors.length) throw new Error('Could not build: ' + errors.join('; '));
  let seenPlane = false, seenHeli = false;
  for (let i = 0; i < 6600; i++) {
    const aircraft = document.querySelector<HTMLCanvasElement>('canvas')?.dataset.aircraft || '';
    const [planes, helis, pads] = aircraft.split(',').map(part => part.split(':')[1]);
    seenPlane ||= planes?.startsWith('1/'); seenHeli ||= Number(helis?.split('/')[0]) > 0;
    const flights = JSON.parse(document.querySelector<HTMLCanvasElement>('canvas')?.dataset.flights || '{}');
    if (seenPlane && seenHeli && Number(pads) >= 6 && flights.heliBoarded > 0 && flights.planeBoarded > 0) { document.getElementById('result')!.textContent = `PASS: ${aircraft} ${JSON.stringify(flights)}`; return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('No air traffic: ' + document.querySelector('canvas')?.dataset.aircraft + ' ' + document.querySelector('canvas')?.dataset.flights);
}
verify().catch(e => { document.getElementById('result')!.textContent = 'FAIL: ' + e.message; });
