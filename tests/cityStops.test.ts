import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STOP_KINDS, addStop, newCity, parseCity, removeRoad, removeStop, tileIndex, type CityState, type StreetStop } from '../services/cityGameService';
import { Traffic, buildGraph } from '../components/city3d/traffic';
import { RoadsideLife, type RoadsidePoint } from '../components/city3d/roadside';
import { RecreationVisits, type RecreationPlace, type RecreationResident } from '../components/city3d/recreation';
import { stopFrame } from '../components/city3d/streetStops';
import { PAVEMENT_SURFACE } from '../components/city3d/pavement';

const T0 = 0, TODAY = '2026-11-04';
const city = (): CityState => ({ ...newCity(T0, TODAY), coins: 10_000, xp: 1_000 });
const straight = tileIndex(44, 51); // on the starter avenue: road east and west, pavement north and south

test('a stop goes on a road tile\'s pavement, one per side, and comes away with a refund', () => {
  let state = city();
  const first = addStop(state, straight, 'bus', T0, TODAY);
  assert.equal(first.error, undefined);
  state = first.state!;
  assert.equal(state.coins, 10_000 - STOP_KINDS.bus.cost);
  const side = state.stops![0].side;
  assert.ok(side === 0 || side === 2, 'on a pavement, not across the road');
  state = addStop(state, straight, 'taxi', T0, TODAY).state!;
  assert.deepEqual(state.stops!.map(s => s.side).sort(), [0, 2], 'tapping again uses the other pavement');
  assert.match(addStop(state, straight, 'bus', T0, TODAY).error!, /already have a stop/);
  assert.match(addStop(state, tileIndex(44, 54), 'bus', T0, TODAY).error!, /beside a road/);
  assert.match(addStop({ ...city(), xp: 0 }, straight, 'bus', T0, TODAY).error!, /level 2/);
  const coins = state.coins;
  state = removeStop(state, straight, T0, TODAY).state!;
  assert.equal(state.stops!.length, 1); assert.equal(state.coins, coins + STOP_KINDS.bus.refund);
  // Taking the road up takes its stops with it.
  const before = state.coins;
  state = removeRoad(state, straight, T0, TODAY).state!;
  assert.equal(state.stops, undefined); assert.ok(state.coins > before + STOP_KINDS.taxi.refund - 1);
});

test('stops survive a save; ones without a road or pavement are dropped', () => {
  let state = addStop(city(), straight, 'taxi', T0, TODAY).state!;
  const saved = JSON.parse(JSON.stringify(state)), side = state.stops![0].side;
  saved.stops.push({ road: tileIndex(10, 10), kind: 'bus', side: 0 }, { road: straight, kind: 'bus', side: 1 }, { road: straight, kind: 'rocket', side: 2 });
  state = parseCity(JSON.stringify(saved))!;
  assert.deepEqual(state.stops, [{ road: straight, kind: 'taxi', side }]);
});

// The roadside rig from cityRoadside.test.ts, with its stops on the pavement instead of on plots.
const tile = (x: number) => 5100 + x;
const world = (index: number) => new THREE.Vector3(index % 100 - 49.5, 0, Math.floor(index / 100) - 49.5);
function rig(kind: 'bus' | 'taxi') {
  const scene = new THREE.Scene(), roads = new Set(Array.from({ length: 24 }, (_, i) => tile(38 + i)));
  // Side 2 is the kerb on the left of traffic heading east (driving on the left).
  const stops: StreetStop[] = [{ road: tile(44), kind, side: 2 }, { road: tile(56), kind, side: 2 }];
  const places: RecreationPlace[] = stops.map(stop => { const { centre, rotation } = stopFrame(world, stop); return { id: `stop:${stop.road}`, type: kind === 'bus' ? 'busstop' : 'taxistand', size: 1, door: stop.road, center: centre, rotation, online: true, pavementStop: true }; });
  const points: RoadsidePoint[] = places.map(p => ({ id: p.id, type: p.type, road: p.door!, center: p.center, curb: p.center.clone(), online: true, waste: false }));
  const traffic = new Traffic(scene, 8, world); traffic.setRoads(roads);
  traffic.setStops({ bus: new Set(kind === 'bus' ? stops.map(s => s.road) : []), tram: new Set(), taxiRanks: new Set(kind === 'taxi' ? stops.map(s => s.road) : []), dropOffs: new Set(), waste: new Set(), sanitation: new Set() });
  for (let attempt = 0; attempt < 20 && !traffic.vehicleCounts[kind]; attempt++) traffic.setCount(1);
  const cars = (traffic as any).cars; cars.splice(0, cars.length, cars.find((c: any) => c.model === kind));
  Object.assign(cars[0], { from: tile(42), to: tile(43), previous: tile(41), next: tile(44), after: tile(45), t: 0, speed: 0.8 });
  const visits = new RecreationVisits(world, () => {}); visits.setRoads(buildGraph(roads)); visits.setPlaces(places);
  const life = new RoadsideLife(scene, traffic, visits, world); life.setPlaces(points);
  const residents: RecreationResident[] = Array.from({ length: 12 }, (_, id) => ({ id, employed: false, road: tile(43), door: tile(43), position: world(tile(43)) }));
  const step = () => { traffic.update(0.05, true); visits.update(0.05, true, residents); life.update(0.05, true); };
  return { traffic, visits, life, step, places };
}

test('people queue on the pavement at a stop; the bus or taxi pulls in and they get in', () => {
  for (const kind of ['bus', 'taxi'] as const) {
    const r = rig(kind); let queued = false;
    for (let i = 0; i < 20 * 300 && !(r.life.stats.alighted > 0); i++) {
      r.step();
      for (const visit of r.visits.visits.values()) if (visit.phase === 'playing' && visit.place.pavementStop) {
        const pose = r.visits.pose(visit.resident)!;
        queued = true;
        assert.ok(Math.abs(pose.position.y - (PAVEMENT_SURFACE + 0.004)) < 0.002, 'standing on the pavement');
        assert.ok(pose.position.distanceTo(visit.place.center) < 0.2, 'at the stop');
      }
    }
    assert.ok(queued, `${kind}: nobody queued`);
    assert.ok(r.life.stats[kind === 'bus' ? 'busBoarded' : 'taxiBoarded'] > 0, `${kind}: nobody got in`);
    assert.ok(r.life.stats.alighted > 0, `${kind}: nobody got out at the next stop`);
    r.life.dispose(); r.traffic.dispose();
  }
});
