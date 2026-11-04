import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, type CityState } from '../services/cityGameService';

// Cottages and cafés turned to each of the four directions, left to right.
const today = '2026-11-05', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 1_000_000 };
const errors: string[] = [];
for (let rotation = 0; rotation < 4; rotation++) for (const [type, x] of [['cottage', 41 + rotation], ['cafe', 52 + rotation]] as const) {
  const result = build(initial, type, x, 52, now, today, `${type}-${rotation}`, rotation); if (result.error) errors.push(result.error); else initial = result.state!;
}
function Fixture() {
  const [city] = useState(initial), [focus, setFocus] = useState<{ x: number; z: number; key: number } | null>(null);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Rotation 0-3</h1>
    <div className="flex flex-wrap gap-3"><button id="view-cottages" onClick={() => setFocus({ x: 42.5, z: 52.5, key: Date.now() })}>cottages</button><button id="view-cafes" onClick={() => setFocus({ x: 53.5, z: 52.5, key: Date.now() })}>cafes</button></div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
setTimeout(() => { document.getElementById('result')!.textContent = errors.length ? `FAIL: ${errors.join('; ')}` : 'PASS: rotations rendered'; }, 4000);
