import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, type CityState } from '../services/cityGameService';
import { RECREATION_TYPES } from '../components/city3d/recreation';

const today = '2026-11-01', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 100000, xp: 100000 };
for (const [type, x, z] of [
  ['loftblock', 44, 48], ['cottage', 46, 50], ['cottage', 47, 50], ['cottage', 52, 50], ['cottage', 53, 50],
  ['basketballcourt', 44, 52], ['tennisclub', 46, 52], ['skatepark', 48, 52], ['playground', 49, 52], ['publicpool', 52, 52],
  ['fusioninstitute', 56, 52], ['watertower', 55, 52],
] as const) {
  const result = build(initial, type, x, z, now, today, type + x);
  if (result.error) throw new Error(result.error); initial = result.state!;
}
function Fixture() {
  const [city, setCity] = useState(initial), [paused, setPaused] = useState(false), [focus, setFocus] = useState<{ x: number; z: number; key: number } | null>(null);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Recreation in My City</h1><p className="text-sm text-secondary">Residents walk to the courts, use equipment, and return to the city.</p>
    <div className="flex flex-wrap gap-3"><button id="pause-recreation" onClick={() => setPaused(v => !v)}>{paused ? 'Resume' : 'Pause'}</button><button id="focus-courts" onClick={() => setFocus({ x: 46.5, z: 52, key: Date.now() })}>View courts</button><button id="remove-recreation" onClick={() => setCity(c => ({ ...c, buildings: c.buildings.filter(b => !RECREATION_TYPES.has(b.type)) }))}>Remove recreation</button></div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} paused={paused} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  for (let i = 0; i < 2400; i++) {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    const activities = canvas?.dataset.recreationActivities?.split(',') || [];
    if (activities.includes('basketballcourt') && activities.includes('tennisclub') && activities.includes('skatepark')) {
      document.querySelector<HTMLButtonElement>('#focus-courts')!.click();
      document.getElementById('result')!.textContent = 'PASS: residents reached basketball, tennis and skate facilities through the city road network.'; return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('No activity at recreation facilities: ' + document.querySelector('canvas')?.dataset.recreationActivities);
}
verify().catch(e => { document.getElementById('result')!.textContent = 'FAIL: ' + e.message; });
