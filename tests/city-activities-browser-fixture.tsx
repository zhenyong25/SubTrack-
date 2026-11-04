import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, tileIndex, type CityState } from '../services/cityGameService';
import { activityCapacity } from '../components/city3d/activities';
import * as THREE from 'three';

// A town beside the lake east of the start: waterfront facilities on its shores, and a mix of
// dining, shopping, farming, nature, culture, transport and civic buildings in the centre.
const today = '2026-11-01', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 1_000_000, chunks: Array.from({ length: 100 }, (_, i) => i) };
const roads = new Set(initial.roads);
for (let x = 59; x <= 65; x++) roads.add(tileIndex(x, 51));
for (let z = 26; z <= 51; z++) roads.add(tileIndex(65, z));
for (let x = 66; x <= 80; x++) roads.add(tileIndex(x, 36));
for (let x = 41; x <= 60; x++) roads.add(tileIndex(x, 55));
for (let z = 59; z <= 61; z++) roads.add(tileIndex(51, z));
initial = { ...initial, roads: [...roads] };
const errors: string[] = [];
for (const [type, x, z] of [
  ['tower', 67, 37], ['tower', 76, 37], ['apartment', 41, 49], ['apartment', 43, 49], ['apartment', 45, 49], ['twintowers', 47, 46], ['fusioninstitute', 56, 49], ['waterreclamation', 58, 49],
  ['fishingjetty', 72, 35], ['sailingclub', 73, 35], ['fishingboathouse', 74, 35], ['harbourmaster', 75, 35], ['ferryterminal', 66, 27], ['lifeboatstation', 66, 30],
  ['cafe', 41, 52], ['bakery', 42, 52], ['icecreamparlour', 43, 52], ['florist', 44, 52], ['busstop', 45, 52], ['bandstand', 46, 52], ['fountain', 47, 52],
  ['park', 48, 52], ['duckpond', 49, 52], ['picnicgrove', 50, 52], ['farmersmarket', 52, 52], ['cinema', 54, 52], ['firestation', 56, 52],
  ['wheatfield', 52, 41], ['appleorchard', 52, 42], ['bikestation', 52, 44], ['school', 52, 45], ['communityhall', 52, 47],
  ['artsstudio', 50, 41], ['wetlandreserve', 49, 42], ['nursery', 50, 44], ['clocktower', 50, 45], ['publiclibrary', 49, 46],
  ['wheatfield', 41, 56], ['vegetablepatch', 43, 56], ['ricepaddy', 45, 56], ['redbarn', 47, 56], ['appleorchard', 48, 56],
  ['dairyfarm', 52, 56], ['flowerfarm', 54, 56], ['glassgreenhouse', 55, 56], ['vineyard', 57, 56], ['graincooperative', 59, 56],
  ['apartment', 49, 59], ['apartment', 52, 59],
] as const) {
  const result = build(initial, type, x, z, now, today, type + x + z);
  if (result.error) errors.push(`${type}@${x},${z}: ${result.error}`); else initial = result.state!;
}
const views: Record<string, [number, number]> = { lake: [73.5, 34.5], ferry: [67, 29], south: [46, 53], market: [54, 53], north: [51.5, 44], farms: [51, 56] };
function Fixture() {
  const [city, setCity] = useState(initial), [paused, setPaused] = useState(false), [focus, setFocus] = useState<{ x: number; z: number; key: number } | null>(null);
  const stats = useMemo(() => cityStats(city, now), [city]);
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">Things to do in My City</h1>
    <div className="flex flex-wrap gap-3"><button id="pause" onClick={() => setPaused(v => !v)}>{paused ? 'Resume' : 'Pause'}</button>
      <button id="remove-activities" onClick={() => setCity(c => ({ ...c, buildings: c.buildings.filter(b => !['wheatfield', 'redbarn', 'appleorchard', 'dairyfarm', 'vineyard', 'graincooperative'].includes(b.type)) }))}>Remove tractor farms</button>
      {Object.entries(views).map(([name, [x, z]]) => <button key={name} id={`view-${name}`} onClick={() => setFocus({ x, z, key: Date.now() })}>{name}</button>)}</div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={null} focus={focus} paused={paused} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={() => {}} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  if (errors.length) throw new Error('Could not build: ' + errors.join('; '));
  if (activityCapacity({ id: 'farm-probe', type: 'wheatfield', size: 1, center: new THREE.Vector3(), rotation: 0, online: true, door: 0 }) === 0) throw new Error('Farm activities are disabled in this browser bundle');
  const wanted = ['fishingjetty', 'sailingclub|harbourmaster|fishingboathouse|ferryterminal|lifeboatstation', 'cafe', 'farmersmarket', 'wheatfield', 'ricepaddy', 'glassgreenhouse', 'dairyfarm', 'duckpond', 'bandstand', 'busstop'];
  const seen = new Set<string>(); let tractorSeen = false;
  for (let i = 0; i < 6600; i++) {
    const data = document.querySelector<HTMLCanvasElement>('canvas')?.dataset;
    (data?.recreationActivities?.split(',').filter(Boolean) || []).forEach(type => seen.add(type));
    tractorSeen ||= Number(data?.farmTractors) > 0;
    if (tractorSeen && wanted.every(types => types.split('|').some(type => seen.has(type)))) { document.getElementById('result')!.textContent = `PASS: tractors with resident drivers and ${seen.size} kinds of activity: ${[...seen].sort().join(', ')}.`; return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Missing activities: ' + wanted.filter(types => !types.split('|').some(type => seen.has(type))).join(', ') + '; tractor seen: ' + tractorSeen + '; scene: ' + JSON.stringify(document.querySelector('canvas')?.dataset));
}
verify().catch(e => { document.getElementById('result')!.textContent = 'FAIL: ' + e.message; });
