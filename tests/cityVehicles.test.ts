import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ROAD_KINDS, buildRoads, levelForXp, newCity, parseCity, planRoads, removeRoad, roadKindAt, roadPath, starterRoads, tileIndex, type CityState, type RoadKind } from '../services/cityGameService';
import { StreetNetwork, vehicleOverlap } from '../components/city3d/streets';
import { Traffic } from '../components/city3d/traffic';
import { VEHICLES, vehicleGeometry, type VehicleModel } from '../components/city3d/vehicleModels';

const T0 = Date.UTC(2026, 10, 4, 1), TODAY = '2026-11-04';
const ok = (result: { state?: CityState; error?: string }) => { assert.equal(result.error, undefined); return result.state!; };
const rich = (): CityState => ({ ...newCity(T0, TODAY), coins: 10_000, xp: 100_000 });
const tile = (x: number, z: number) => z * 100 + x;
const world = (index: number) => new THREE.Vector3(index % 100 - 49.5, 0, Math.floor(index / 100) - 49.5);
function seeded(seed: number, work: () => void) {
  const previous = Math.random;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  try { work(); } finally { Math.random = previous; }
}

test('each road kind has its own price, and drawing over a road converts it', () => {
  let city = rich();
  const lane = roadPath({ x: 42, z: 53 }, { x: 42, z: 56 });
  const plan = planRoads(city, lane, 'avenue');
  assert.equal(plan.cost, 4 * ROAD_KINDS.avenue.cost);
  city = ok(buildRoads(city, lane, T0, TODAY, 'avenue'));
  assert.equal(city.coins, 10_000 - 4 * ROAD_KINDS.avenue.cost);
  assert.ok(lane.every(index => roadKindAt(city, index) === 'avenue'));
  assert.match(buildRoads(city, lane, T0, TODAY, 'avenue').error!, /already/);
  // Converting to tram rails costs the difference, less what the avenue is worth.
  const before = city.coins;
  city = ok(buildRoads(city, lane, T0, TODAY, 'tram'));
  assert.equal(before - city.coins, 4 * (ROAD_KINDS.tram.cost - ROAD_KINDS.avenue.refund));
  assert.equal(city.roads.length, rich().roads.length + 4, 'no duplicate road tiles');
  // Back to a plain street: nothing is stored for plain streets.
  city = ok(buildRoads(city, lane, T0, TODAY, 'street'));
  assert.equal(city.roadTypes, undefined);
  city = ok(buildRoads(city, lane, T0, TODAY, 'cobble'));
  const coins = city.coins;
  city = ok(removeRoad(city, lane[0], T0, TODAY));
  assert.equal(city.coins, coins + ROAD_KINDS.cobble.refund);
  assert.equal(city.roadTypes?.[lane[0]], undefined);
});

test('road kinds unlock with level and survive a save round trip', () => {
  const beginner: CityState = { ...newCity(T0, TODAY), coins: 10_000 };
  assert.equal(levelForXp(beginner.xp), 1);
  assert.match(buildRoads(beginner, [tileIndex(42, 53)], T0, TODAY, 'tram').error!, /level/);
  ok(buildRoads(beginner, [tileIndex(42, 53)], T0, TODAY, 'country'));
  let city = ok(buildRoads(rich(), [tileIndex(42, 53), tileIndex(42, 54)], T0, TODAY, 'country'));
  city = ok(buildRoads(city, [tileIndex(51, 51)], T0, TODAY, 'tram'));
  const loaded = parseCity(JSON.stringify({ ...city, roadTypes: { ...city.roadTypes, 1: 'avenue', [tileIndex(42, 53)]: 'hovercraft' } }))!;
  assert.equal(roadKindAt(loaded, tileIndex(42, 54)), 'country');
  assert.equal(roadKindAt(loaded, tileIndex(51, 51)), 'tram');
  assert.equal(roadKindAt(loaded, tileIndex(42, 53)), 'street', 'unknown kinds fall back to a street');
  assert.equal(loaded.roadTypes?.[1], undefined, 'kinds for tiles without a road are dropped');
  assert.deepEqual(parseCity(JSON.stringify(newCity(T0, TODAY)))!.roadTypes, undefined, 'old saves load unchanged');
});

test('every vehicle model builds, and longer vehicles keep their length when checking for overlap', () => {
  for (const model of Object.keys(VEHICLES) as VehicleModel[]) {
    const { paint, detail } = vehicleGeometry(model);
    paint.computeBoundingBox(); detail.computeBoundingBox();
    const box = paint.boundingBox!.union(detail.boundingBox!);
    assert.ok(Math.abs(box.max.z - box.min.z - VEHICLES[model].length) < 0.03, `${model} length`);
    assert.ok(box.max.x - box.min.x <= VEHICLES[model].width + 0.02, `${model} width`);
    assert.ok(detail.getAttribute('color'), `${model} details are coloured`);
  }
  const bus = { half: 0.4, side: 0.11 };
  const a = new THREE.Vector3(0, 0, 0), behind = new THREE.Vector3(0, 0, -0.6);
  assert.equal(vehicleOverlap(a, 0, behind, 0), false, 'two cars 6 m apart are clear');
  assert.equal(vehicleOverlap(a, 0, behind, 0, 0.005, bus), true, 'a bus reaches back 4 m');
});

test('traffic is a mix of models; buses call at stops; trams only ride the rails', () => seeded(3, () => {
  const roads = new Set(starterRoads()), kinds = new Map<number, RoadKind>();
  for (let x = 41; x <= 58; x++) kinds.set(tile(x, 51), 'tram');
  const streets = new StreetNetwork(world), traffic = new Traffic(new THREE.Scene(), 80, world, streets);
  streets.setRoads(roads); traffic.setRoads(roads, kinds);
  const busStop = tile(51, 44), tramStop = tile(45, 51);
  traffic.setStops({ bus: new Set([busStop]), tram: new Set([tramStop]), taxiRanks: new Set(), dropOffs: new Set() });
  traffic.setCount(40);
  const counts = traffic.vehicleCounts;
  assert.ok(Object.keys(counts).length >= 5, `a mix of models: ${JSON.stringify(counts)}`);
  assert.ok((counts.tram || 0) >= 1, 'a tram runs on an 18-tile line');
  const cars = (traffic as unknown as { cars: Array<{ model: string; from: number; to: number; dwell?: number; served?: number }> }).cars;
  let busCalled = false, tramCalled = false;
  for (let frame = 0; frame < 20 * 240; frame++) {
    streets.update(0.05, true); traffic.update(0.05, true);
    for (const car of cars) {
      if (car.model === 'tram') assert.ok(kinds.get(car.from) === 'tram' && kinds.get(car.to) === 'tram', 'trams stay on the tram line');
      if (car.dwell && car.dwell > 0) { busCalled ||= car.model === 'bus' && car.served === busStop; tramCalled ||= car.model === 'tram' && car.served === tramStop; }
    }
  }
  assert.ok(busCalled, 'a bus called at the bus stop');
  assert.ok(tramCalled, 'a tram called at the tram stop');
  // Removing the rails retires the trams.
  traffic.setRoads(roads, new Map()); traffic.setCount(40);
  assert.equal(traffic.vehicleCounts.tram || 0, 0);
  traffic.dispose();
}));

test('slow roads slow traffic down and avenues speed it up', () => {
  const distance = (kind: RoadKind) => {
    let travelled = 0;
    seeded(5, () => {
      const roads = new Set<number>(); for (let x = 30; x <= 70; x++) roads.add(tile(x, 50));
      const kinds = new Map<number, RoadKind>([...roads].map(index => [index, kind]));
      const traffic = new Traffic(new THREE.Scene(), 4, world); traffic.setRoads(roads, kinds); traffic.setCount(1);
      const cars = (traffic as unknown as { cars: Array<{ model: string; speed: number }> }).cars;
      cars[0].model = 'sedan'; cars[0].speed = 0.8;
      const m = new THREE.Matrix4(), last = new THREE.Vector3(), p = new THREE.Vector3();
      for (let frame = 0; frame < 60; frame++) {
        traffic.update(0.05, true); traffic.meshes[0].getMatrixAt(0, m); p.setFromMatrixPosition(m);
        if (frame) travelled += Math.min(p.distanceTo(last), 0.2); last.copy(p);
      }
      traffic.dispose();
    });
    return travelled;
  };
  const street = distance('street');
  assert.ok(distance('cobble') < street * 0.75);
  assert.ok(distance('country') < street * 0.95);
  assert.ok(distance('avenue') > street * 1.15);
});
