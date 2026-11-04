import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, type CityState } from '../services/cityGameService';

// Cottages and office blocks at levels 1 to 5, left to right.
const today = '2026-11-04', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 10_000_000, xp: 10_000_000, chunks: Array.from({ length: 100 }, (_, i) => i) };
const errors: string[] = [];
const levels = new Map<string, number>();
for (let level = 1; level <= 5; level++) {
  for (const [type, x, z] of [['cottage', 40 + level, 52], ['office', 50 + level * 2, 52]] as const) {
    const id = `${type}-${level}`, result = build(initial, type, x, z, now, today, id);
    if (result.error) errors.push(`${id}: ${result.error}`); else { initial = result.state!; levels.set(id, level); }
  }
}
initial = { ...initial, buildings: initial.buildings.map(b => ({ ...b, level: levels.get(b.id) || b.level })) };
const views: Record<string, [number, number]> = { cottages: [43.5, 52.5], offices: [56.5, 53] };
function Fixture() {
  const [city] = useState(initial), [focus, setFocus] = useState<{ x: number; z: number; key: number } | null>(null);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Upgrade levels 1-5</h1>
    <div className="flex flex-wrap gap-3">{Object.entries(views).map(([name, [x, z]]) => <button key={name} id={`view-${name}`} onClick={() => setFocus({ x, z, key: Date.now() })}>{name}</button>)}</div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
setTimeout(() => { document.getElementById('result')!.textContent = errors.length ? `FAIL: ${errors.join('; ')}` : 'PASS: upgrade levels rendered'; }, 4000);
