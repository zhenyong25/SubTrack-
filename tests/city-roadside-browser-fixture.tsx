import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, type CityState } from '../services/cityGameService';

const today = '2026-11-04', now = Date.now();
let randomSeed = 7;
Math.random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 100_000 };
for (const [type, x, z] of [
  ['apartment', 41, 49], ['apartment', 56, 49], ['busstop', 44, 50], ['busstop', 54, 50],
  ['taxistand', 45, 52], ['taxistand', 55, 52], ['shop', 46, 52], ['cafe', 53, 50],
  ['fusioninstitute', 46, 47], ['waterreclamation', 52, 47], ['recyclingcentre', 56, 52],
] as const) {
  const result = build(initial, type, x, z, now, today, type + x);
  if (result.error) throw new Error(type + ': ' + result.error); initial = result.state!;
}
function Fixture() {
  const [city, setCity] = useState(initial), [paused, setPaused] = useState(false), [focus, setFocus] = useState({ x: 50, z: 51, key: 1 });
  const stats = useMemo(() => cityStats(city, now), [city]);
  const follow = (model: string) => {
    const list = JSON.parse(document.querySelector('canvas')?.dataset.roadsideVehicles || '[]');
    const v = list.find((v: any) => v.model === model && ['boarding', 'alighting', 'collecting'].includes(v.stage)) || list.find((v: any) => v.model === model);
    if (v) setFocus({ x: v.position[0], z: v.position[1], key: Date.now() });
  };
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">A city on the move</h1>
    <p className="text-sm text-secondary">Neighbours queue for buses and taxis. The collection crew clear the roadside bins.</p>
    <div className="flex flex-wrap gap-3"><button id="pause-roadside" onClick={() => setPaused(v => !v)}>{paused ? 'Resume' : 'Pause'}</button>
      {['bus', 'taxi', 'garbage'].map(model => <button id={`view-${model}`} key={model} onClick={() => follow(model)}>Watch {model}</button>)}
      <button id="remove-roadside" onClick={() => setCity(c => ({ ...c, roads: [] }))}>Remove roads</button>
    </div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} paused={paused} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  let boarding = false, riding = false, alighting = false, working = false;
  for (let i = 0; i < 6000; i++) {
    const d = document.querySelector('canvas')?.dataset, stats = JSON.parse(d?.transitBoarded || '{}');
    boarding ||= Number(d?.transitBoarding) > 0; riding ||= Number(d?.transitRiding) > 0;
    alighting ||= Number(d?.transitAlighting) > 0; working ||= Number(d?.garbageCollectors) > 0;
    if (stats.busBoarded > 0 && stats.taxiBoarded > 0 && stats.alighted > 0 && stats.collections > 0 && boarding && riding && alighting && working) {
      document.getElementById('result')!.textContent = 'PASS: real residents boarded buses and taxis, rode inside, alighted and collected rubbish with the truck.'; return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Incomplete roadside activity: ' + JSON.stringify(document.querySelector('canvas')?.dataset));
}
verify().catch(e => { document.getElementById('result')!.textContent = 'FAIL: ' + e.message; });
