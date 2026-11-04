import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CityScene3D from '../components/CityScene3D';
import { build, cityStats, newCity, tileIndex, type CityState } from '../services/cityGameService';
import { boatKind } from '../components/city3d/activities';
declare const __CITY_REPLAY__: CityState | null;

const today = '2026-11-04', now = Date.now();
let initial: CityState = { ...newCity(now, today), coins: 1_000_000, xp: 1_000_000, chunks: Array.from({ length: 100 }, (_, i) => i) };
const roads = new Set(initial.roads);
for (let x = 59; x <= 65; x++) roads.add(tileIndex(x, 51));
for (let z = 36; z <= 51; z++) roads.add(tileIndex(65, z));
for (let x = 66; x <= 80; x++) roads.add(tileIndex(x, 36));
initial = { ...initial, roads: [...roads] };
for (const [type, x, z] of [
  ['fusioninstitute', 67, 37], ['waterreclamation', 69, 37], ['apartment', 72, 37], ['tower', 76, 37],
  ['fishingboathouse', 73, 35], ['marinaoffice', 74, 35],
] as const) {
  const result = build(initial, type, x, z, now, today, type);
  if (result.error) throw new Error(type + ': ' + result.error); initial = result.state!;
}
const replaying = typeof __CITY_REPLAY__ !== 'undefined' && Boolean(__CITY_REPLAY__);
if (replaying) initial = __CITY_REPLAY__!;
const initialStats = cityStats(initial, now);
const operatingTypes = new Set(initial.buildings.filter(b => boatKind(b.type) && initialStats.status.get(b.id)?.road && initialStats.status.get(b.id)!.serviced > 0).map(b => b.type));
interface Voyage { id: string; type: string; phase: string; passengers: number; distance: number; completed: number; fishers: number; sightseers: number; returning: number; position: [number, number]; canSail: boolean }
const voyages = (): Voyage[] => JSON.parse(document.querySelector('canvas')?.dataset.boatVoyages || '[]');
function Fixture() {
  const [city, setCity] = useState(initial), [paused, setPaused] = useState(false), [focus, setFocus] = useState({ x: 73.5, z: 33, key: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(initial.buildings.find(b => b.type === 'marinaoffice')?.id || null);
  const stats = useMemo(() => cityStats(city, now), [city]);
  const follow = (type: string) => { const boat = voyages().find(v => v.type === type); if (boat) { setSelectedId(boat.id); setFocus({ x: boat.position[0], z: boat.position[1], key: Date.now() }); } };
  return <div className="mx-auto max-w-6xl space-y-3 text-textMain">
    <h1 className="text-xl font-bold">A day out on the water</h1>
    <p className="text-sm text-secondary">Residents board at the jetty, head offshore to fish or sightsee, then return home.</p>
    <div className="flex flex-wrap gap-3">
      <button id="pause-boats" onClick={() => setPaused(v => !v)}>{paused ? 'Resume' : 'Pause'}</button>
      <button id="view-fishing" onClick={() => follow('fishingboathouse')}>Watch fishing</button>
      <button id="view-sightseeing" onClick={() => follow('marinaoffice')}>Watch sightseeing</button>
      {replaying && <button id="inspect-fishing-road" onClick={() => setSelectedId(city.buildings.find(b => b.type === 'fishingboathouse')!.id)}>Inspect fishing access</button>}
      <button id="remove-boats" onClick={() => setCity(c => ({ ...c, buildings: c.buildings.filter(b => !boatKind(b.type)) }))}>Remove harbours</button>
    </div>
    <CityScene3D city={city} residents={stats.residents} jobs={stats.jobs} status={stats.status} pending={{}} mode={{ kind: 'idle' }} selectedId={selectedId} focus={focus} paused={paused} onTile={() => {}} onRoad={() => {}} onLights={() => {}} onSelect={setSelectedId} onCollect={() => {}} onChunk={() => {}} fallback={<p>WebGL unavailable</p>} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
async function verify() {
  const seen = { boarded: false, offshore: false, fishing: false, sightseeing: false, fishingReturn: false, sightseeingReturn: false };
  const departed = new Set<string>(), returned = new Set<string>();
  for (let i = 0; i < 6000; i++) {
    for (const boat of voyages()) {
      if (!boat.canSail) throw new Error(boat.type + ' needs more clear water for this offshore test');
      if (boat.distance > 1.5 && boat.passengers > 0) departed.add(boat.type);
      if (boat.completed > 0 && boat.returning > 0) returned.add(boat.type);
      seen.boarded ||= boat.phase === 'boarding' && boat.passengers > 0;
      seen.offshore ||= boat.distance > 2 && boat.passengers > 0;
      seen.fishing ||= boat.phase === 'fishing' && boat.fishers > 0;
      seen.sightseeing ||= boat.phase === 'sightseeing' && boat.sightseers > 0;
      seen.fishingReturn ||= boat.type === 'fishingboathouse' && boat.completed > 0 && boat.returning > 0;
      seen.sightseeingReturn ||= boat.type === 'marinaoffice' && boat.completed > 0 && boat.returning > 0;
    }
    if (replaying && operatingTypes.size > 0 && [...operatingTypes].every(type => departed.has(type) && returned.has(type))) { document.getElementById('result')!.textContent = `PASS: saved city replay: ${[...operatingTypes].join(', ')} boarded residents, sailed and returned.`; return; }
    if (!replaying && Object.values(seen).every(Boolean)) { document.getElementById('result')!.textContent = 'PASS: residents boarded, sailed offshore, fished with rods, used binoculars for sightseeing and walked back from both harbours.'; return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Incomplete boat outings: ' + JSON.stringify(seen) + '; ' + JSON.stringify(voyages()));
}
verify().catch(error => { document.getElementById('result')!.textContent = 'FAIL: ' + error.message; });
