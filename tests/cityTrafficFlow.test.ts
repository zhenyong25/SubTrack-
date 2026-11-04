import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { starterRoads } from '../services/cityGameService';
import { StreetNetwork } from '../components/city3d/streets';
import { Traffic } from '../components/city3d/traffic';
import { Pedestrians } from '../components/city3d/people';
import type { BuildingEntrance } from '../components/city3d/buildingVisits';

const tile = (x: number, z: number) => z * 100 + x;
const world = (index: number) => new THREE.Vector3(index % 100 - 49.5, 0, Math.floor(index / 100) - 49.5);
function neighbourhood() {
  const roads = new Set(starterRoads());
  for (let i = 45; i <= 55; i++) { roads.add(tile(i, 55)); roads.add(tile(55, i)); }
  return roads;
}
function seeded(seed: number, work: () => void) {
  const previous = Math.random;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  try { work(); } finally { Math.random = previous; }
}
function places(streets: StreetNetwork, roads: Set<number>) {
  const cells = [[49, 52], [50, 52], [52, 52], [53, 52], [52, 53], [54, 53], [54, 54], [49, 54], [50, 54], [47, 52], [47, 50], [52, 50], [54, 50], [56, 50], [56, 53], [53, 54]];
  const entrance = (id: string, x: number, z: number, isPublic: boolean): BuildingEntrance => {
    assert.equal(roads.has(tile(x, z)), false, 'fixture buildings must stay off the road');
    const neighbours = [[x, z + 1], [x + 1, z], [x - 1, z], [x, z - 1]];
    const adjacent = neighbours.find(([a, b]) => roads.has(tile(a, b))); assert.ok(adjacent);
    const door = tile(adjacent[0], adjacent[1]), center = world(tile(x, z)), facing = world(door).sub(center).normalize();
    return { id, type: isPublic ? 'shop' : 'cottage', door, curb: streets.curb(door, center), threshold: center.clone().addScaledVector(facing, 0.18).setY(0.065), online: true, public: isPublic };
  };
  const homes = cells.map(([x, z], i) => entrance(`home-${i}`, x, z, false));
  const shops = [[44, 52], [46, 52], [53, 56], [54, 52]].map(([x, z], i) => entrance(`shop-${i}`, x, z, true));
  return { homes, shops };
}

test('a car leaving a crossing can turn on the next tile while the previous light is red', () => {
  const roads = new Set<number>(); for (let i = 51; i <= 55; i++) { roads.add(tile(i, 55)); roads.add(tile(55, i)); }
  const streets = new StreetNetwork(world); streets.setRoads(roads, [tile(54, 55)]);
  const crossing = streets.crossings.get(tile(54, 55))!; crossing.phase = 'all-red';
  const current = new THREE.Vector3(5.47, 0, 5.3), turned = new THREE.Vector3(5.3, 0, 5.49);
  streets.setVehicles([{ id: 1, position: current }, { id: 2, position: new THREE.Vector3(4.97, 0, 5.3) }]); crossing.vehicle = 2;
  assert.equal(streets.canDrive(1, current, turned), true, 'a departing car must not be trapped by the light behind it');
});

test('cars enter a junction without a signal one at a time', () => {
  // The junction at 52,50 is too close to the signal at 50,50 to get its own.
  const roads = new Set<number>(); for (let i = 48; i <= 54; i++) roads.add(tile(i, 50)); for (let i = 48; i <= 52; i++) { roads.add(tile(50, i)); roads.add(tile(52, i)); }
  const streets = new StreetNetwork(world); streets.setRoads(roads);
  assert.equal(streets.crossings.has(tile(52, 50)), false);
  const junction = streets.junctions.find(j => j.road === tile(52, 50)); assert.ok(junction);
  const west = new THREE.Vector3(1.77, 0, 0.35), south = new THREE.Vector3(2.35, 0, -0.23);
  streets.setVehicles([{ id: 1, position: west, heading: Math.PI / 2 }, { id: 2, position: south, heading: 0 }]);
  assert.equal(streets.canDrive(1, west, new THREE.Vector3(1.79, 0, 0.35), Math.PI / 2), true);
  assert.equal(junction.vehicle, 1);
  assert.equal(streets.canDrive(2, south, new THREE.Vector3(2.35, 0, -0.21), 0), false, 'a crossing stream must wait for the car in the junction');
  assert.equal(streets.blockedVehicles.get(2)?.reason, 'junction');
  assert.equal(streets.canSpawn(new THREE.Vector3(2.65, 0, 0.6), 0), false, 'cars never appear inside a junction');
});

test('busy neighbourhood traffic continues moving through repeated pedestrian crossing phases', () => seeded(7, () => {
  const roads = neighbourhood(), scene = new THREE.Scene(), streets = new StreetNetwork(world);
  streets.setRoads(roads);
  const { homes, shops } = places(streets, roads);
  streets.setRoads(roads, [...homes, ...shops].map(p => p.door!));
  const people = new Pedestrians(scene, 200, world, world(tile(50, 50)), streets), traffic = new Traffic(scene, 100, world, streets);
  people.setRoads(roads); traffic.setRoads(roads);
  people.setCity(homes.map(p => ({ id: p.id, residents: 8, door: p.door })), shops.map(p => ({ id: p.id, staff: 12, door: p.door })));
  people.setEntrances([...homes, ...shops]); traffic.setCount(32);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(4, 5, 8);
  const count = traffic.meshes[0].count, last = Array.from({ length: count }, () => new THREE.Vector3()), movedAt = Array(count).fill(0), distance = Array(count).fill(0);
  const matrix = new THREE.Matrix4();
  let worstIdle = 0;
  for (let frame = 0; frame < 6000; frame++) {
    const now = frame * 0.05;
    streets.update(0.05, true); people.update(0.05, now * 1000, true, camera); traffic.update(0.05, true);
    for (let id = 0; id < count; id++) {
      traffic.meshes[0].getMatrixAt(id, matrix); const p = new THREE.Vector3().setFromMatrixPosition(matrix);
      const step = p.distanceTo(last[id]); if (frame > 0) distance[id] += step;
      if (step > 0.0001) movedAt[id] = now;
      last[id].copy(p); worstIdle = Math.max(worstIdle, now - movedAt[id]);
    }
  }
  const state = JSON.stringify({ blocked: [...streets.blockedVehicles].map(([id,reason])=>({id, ...reason, idle:300-movedAt[id], position:last[id]?.toArray(), car:(traffic as any).cars[id]})), worstIdle, distance, signals: [...streets.crossings.values()].map(c => ({ road: c.road, phase: c.phase, active: [...c.active].map(id=>({id, position:(streets as any).crowd.people.get(id.split(':')[1])?.position.toArray(), journey:(streets as any).journeys.get(id)})), waiting: c.waiting.size, vehicle: c.vehicle })), crossed: streets.completedCrossings });
  assert.ok(streets.completedCrossings > 10, state);
  assert.ok(worstIdle < 60, 'A queue stopped permanently: ' + state);
  assert.ok(distance.every(n => n > 8), 'Every car should make progress: ' + state);
  people.dispose(); traffic.dispose();
}));

test('cars never stay deadlocked on wide roads, road plazas or dead ends', () => seeded(7, () => {
  const layouts: Record<string, () => Set<number>> = {
    wide: () => { const r = new Set(starterRoads()); for (let i = 41; i <= 58; i++) { r.add(tile(i, 52)); r.add(tile(52, i)); } return r; },
    plaza: () => { const r = new Set(starterRoads()); for (let x = 53; x <= 55; x++) for (let z = 53; z <= 55; z++) r.add(tile(x, z)); for (let i = 51; i <= 53; i++) r.add(tile(i, 54)); return r; },
    deadends: () => { const r = new Set(starterRoads()); for (let i = 52; i <= 56; i++) { r.add(tile(i, 45)); r.add(tile(45, i)); } r.add(tile(51, 45)); for (let i = 45; i <= 50; i++) r.add(tile(53, i)); return r; },
  };
  for (const [name, make] of Object.entries(layouts)) {
    const roads = make(), streets = new StreetNetwork(world), traffic = new Traffic(new THREE.Scene(), 60, world, streets);
    streets.setRoads(roads); traffic.setRoads(roads); traffic.setCount(50);
    const count = traffic.meshes[0].count, matrix = new THREE.Matrix4(), last = Array.from({ length: count }, () => new THREE.Vector3()), movedAt = Array(count).fill(0);
    let worstIdle = 0;
    for (let frame = 0; frame < 20 * 150; frame++) {
      const now = frame * 0.05; streets.update(0.05, true); traffic.update(0.05, true);
      for (let id = 0; id < count; id++) {
        traffic.meshes[0].getMatrixAt(id, matrix); const p = new THREE.Vector3().setFromMatrixPosition(matrix);
        if (p.distanceTo(last[id]) > 0.0001) movedAt[id] = now; last[id].copy(p); worstIdle = Math.max(worstIdle, now - movedAt[id]);
      }
    }
    assert.ok(worstIdle < 45, `${name}: a car waited ${worstIdle.toFixed(1)} s`);
    traffic.dispose();
  }
}));
