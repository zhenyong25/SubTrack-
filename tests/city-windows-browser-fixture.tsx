import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, type CityState } from '../services/cityGameService';

// Homes and offices along the main street, to see their windows at night.
const today = '2026-11-05', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 10_000_000, xp: 10_000_000 };
const errors: string[] = [];
for (const [type, x, z] of [
  ['tower', 41, 52], ['apartment', 43, 52], ['office', 45, 52], ['office', 45, 49], ['tower', 52, 52], ['apartment', 54, 52], ['cottage', 56, 52], ['cottage', 57, 52],
  ['fusioninstitute', 41, 49], ['waterreclamation', 43, 49], ['bank', 52, 49],
] as const) {
  const result = build(initial, type, x, z, now, today, type + x + z); if (result.error) errors.push(`${type}: ${result.error}`); else initial = result.state!;
}
function Fixture() {
  const [city] = useState(initial), [focus, setFocus] = useState<{ x: number; z: number; key: number } | null>(null);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Windows at night</h1>
    <div className="flex flex-wrap gap-3"><button id="view-street" onClick={() => setFocus({ x: 48, z: 51.5, key: Date.now() })}>street</button></div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
setTimeout(() => { document.getElementById('result')!.textContent = errors.length ? `FAIL: ${errors.join('; ')}` : 'PASS: windows rendered'; }, 4000);
