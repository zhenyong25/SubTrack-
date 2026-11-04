import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIRPORT, Aviation, airportSchedule, planeState, type AirportPlace, type Helipad } from '../components/city3d/aviation';
import { bake, buildModel, type ModelContext } from '../components/city3d/models';
import { build, canPlace, getBuilding, newCity, type CityState } from '../services/cityGameService';

const airport: AirportPlace = { id: 'airport-1', center: new THREE.Vector3(10, 0, 4), rotation: Math.PI / 2, size: 4 };
const material = new THREE.MeshStandardMaterial();
const context: ModelContext = { std: () => material, facade: () => material, textures: {} as ModelContext['textures'] };

test('the airport is a 4×4 transport building that needs a road and a high enough level', () => {
  const type = getBuilding('airport')!;
  assert.equal(type.size, 4); assert.equal(type.category, 'transport');
  const beginner: CityState = { ...newCity(0, '2026-11-04'), coins: 100_000 };
  assert.ok(build(beginner, 'airport', 52, 52, 0, '2026-11-04', 'a').error);
  const city: CityState = { ...beginner, xp: 1_000_000 };
  assert.equal(canPlace(city, 'airport', 52, 52).ok, true);
  const built = build(city, 'airport', 52, 52, 0, '2026-11-04', 'a');
  assert.equal(built.error, undefined);
  assert.equal(canPlace(built.state!, 'cottage', 55, 55).ok, false, 'the airport fills all 16 tiles');
});

test('tall buildings have a flat helipad spot on the roof; low ones and spires do not', () => {
  for (const type of ['tower', 'office', 'glasstower', 'gardenhighrise']) {
    const prefab = bake(buildModel(type, context, 2, getBuilding(type)!.size));
    assert.ok(prefab.pad && prefab.pad.y > 1.5, `${type} roof pad`);
    assert.ok(Math.abs(prefab.pad!.x) < getBuilding(type)!.size / 2 && Math.abs(prefab.pad!.z) < getBuilding(type)!.size / 2);
  }
  for (const type of ['cottage', 'cafe', 'metropolisspire', 'clocktower']) assert.equal(bake(buildModel(type, context, 1, getBuilding(type)!.size)).pad, null, type);
});

test('a plane taxis, takes off, flies a circuit over the city, lands and returns to its gate', () => {
  const schedules = [airportSchedule(airport, 0), airportSchedule(airport, 1)];
  const ground = AIRPORT.surface * airport.size, half = airport.size / 2;
  const phases = new Set<string>(); let highest = 0, farthest = 0;
  for (let t = 0; t < schedules[0].period; t += 0.1) {
    const plane = planeState(airport, 0, t, schedules);
    phases.add(plane.phase);
    for (const [k, v] of Object.entries(plane.position)) assert.ok(Number.isFinite(v), k);
    if (plane.phase !== 'flight') {
      assert.ok(Math.abs(plane.position.y - ground) < 1e-6, `${plane.phase} on the ground`);
      assert.ok(Math.abs(plane.position.x - airport.center.x) <= half && Math.abs(plane.position.z - airport.center.z) <= half, `${plane.phase} stays on the airfield`);
    }
    highest = Math.max(highest, plane.position.y); farthest = Math.max(farthest, plane.position.distanceTo(airport.center));
  }
  assert.deepEqual([...phases].sort(), ['flight', 'gate', 'landing', 'takeoff', 'taxi']);
  assert.ok(highest > 5, 'climbs above the skyline'); assert.ok(farthest > 10, 'flies out over the city');
  const start = planeState(airport, 0, 0.5, schedules).position, end = planeState(airport, 0, schedules[0].period - 0.05, schedules).position;
  assert.ok(start.distanceTo(end) < 0.05, 'back at its gate');
});

test('the two planes take turns, so only one is ever away from its gate', () => {
  const schedules = [airportSchedule(airport, 0), airportSchedule(airport, 1)];
  let both = false, second = false;
  for (let t = 0; t < schedules[0].period * 4; t += 0.25) {
    const a = planeState(airport, 0, t, schedules), b = planeState(airport, 1, t, schedules);
    both ||= a.phase !== 'gate' && b.phase !== 'gate'; second ||= b.phase === 'flight';
  }
  assert.equal(both, false); assert.ok(second, 'the second plane flies too');
});

test('helicopters fly between rooftop helipads, land exactly on them and wait with the rotor slowing', () => {
  const aviation = new Aviation(new THREE.Scene());
  const pads: Helipad[] = [[0, 4.9, 0], [6, 2.8, -3], [-5, 3.3, 4], [3, 1.9, 7]].map(([x, y, z], i) => ({ id: `roof-${i}`, position: new THREE.Vector3(x, y, z), roof: true }));
  aviation.setPlaces([airport], pads);
  const helis = aviation.helicopters.length;
  assert.ok(helis >= 1 && helis <= 6);
  const visited = new Set<string>(); let flew = false;
  for (let frame = 0; frame < 20 * 240; frame++) {
    aviation.update(0.05, true);
    for (const h of aviation.helicopters) {
      if (h.mode === 'landed') {
        const pad = [...pads, { id: `${airport.id}:pad`, position: null }].find(p => p.id === h.pad)!;
        if (pad.position) assert.ok(h.position.distanceTo(pad.position) < 1e-3, 'sits on the pad');
        visited.add(h.pad);
      } else flew = true;
      if (h.mode === 'cruise') assert.ok(h.position.y > 4.9, 'cruises above the tallest roof');
    }
  }
  assert.ok(flew); assert.ok(visited.size >= 3, `visited ${[...visited]}`);
  const before = aviation.helicopters.map(h => h.position.toArray()), clock = aviation.seconds;
  for (let i = 0; i < 50; i++) aviation.update(1, false);
  assert.deepEqual(aviation.helicopters.map(h => h.position.toArray()), before, 'paused');
  assert.equal(aviation.seconds, clock);
  aviation.setPlaces([], []); assert.equal(aviation.helicopters.length, 0);
  aviation.dispose();
});
