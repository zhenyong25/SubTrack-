import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { buildRoads, cityStats, newCity, roadPath, type CityState } from '../services/cityGameService';

// The whole map owned, with a road bridging the river west of the town.
const today = '2026-11-04', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 1_000_000, chunks: Array.from({ length: 100 }, (_, i) => i) };
const bridge = buildRoads(initial, roadPath({ x: 21, z: 51 }, { x: 40, z: 51 }), now, today);
const error = bridge.error; if (bridge.state) initial = bridge.state;
const views: Record<string, [number, number]> = { valley: [27, 28], volcano: [87, 11], island: [12, 88], bridge: [27, 51] };
function Fixture() {
  const [city] = useState(initial), [focus, setFocus] = useState<{ x: number; z: number; key: number } | null>(null);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Mountains, valleys and islands</h1>
    <div className="flex flex-wrap gap-3">{Object.entries(views).map(([name, [x, z]]) => <button key={name} id={`view-${name}`} onClick={() => setFocus({ x, z, key: Date.now() })}>{name}</button>)}</div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
setTimeout(() => { document.getElementById('result')!.textContent = error ? `FAIL: ${error}` : 'PASS: terrain rendered'; }, 4000);
