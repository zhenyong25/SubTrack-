import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Traffic, buildGraph } from '../components/city3d/traffic';
import { RoadsideLife, type RoadsidePoint } from '../components/city3d/roadside';
import { RecreationVisits, type RecreationPlace, type RecreationResident } from '../components/city3d/recreation';
import { vehicleGeometry } from '../components/city3d/vehicleModels';
import { StreetNetwork } from '../components/city3d/streets';

const tile = (x: number) => 5100 + x;
const world = (index: number) => new THREE.Vector3(index % 100 - 49.5, 0, Math.floor(index / 100) - 49.5);
function rig(kind: 'bus' | 'taxi' | 'garbage' = 'bus', useStreets = false) {
  const scene = new THREE.Scene(), roads = new Set(Array.from({ length: 24 }, (_, i) => tile(38 + i))), released: number[] = [];
  const type = kind === 'taxi' ? 'taxistand' : kind === 'garbage' ? 'recyclingcentre' : 'busstop';
  const place = (id: string, x: number): RecreationPlace => ({ id, type, size: 1, center: new THREE.Vector3(x - 49.5, 0, 0.5), door: tile(x), rotation: 0, online: true, serviceRole: kind === 'garbage' ? 'sanitation' : undefined });
  const a = place('a', 44), b = place('b', 56), homes = [place('home-1', 48), place('home-2', 51)].map(p => ({ ...p, type: 'cottage', serviceRole: undefined }));
  const places = kind === 'garbage' ? [a] : [a, b];
  const points: RoadsidePoint[] = [...places, ...homes].map(p => ({ id: p.id, type: p.type, center: p.center, road: p.door!, curb: world(p.door!).add(new THREE.Vector3(0, 0.07, -0.4)), online: true, waste: p.type === 'cottage' }));
  const streets = useStreets ? new StreetNetwork(world) : undefined; streets?.setRoads(roads, [tile(44)]);
  const traffic = new Traffic(scene, 8, world, streets); traffic.setRoads(roads);
  traffic.setStops({ bus: new Set(kind === 'bus' ? [a.door!, b.door!] : []), tram: new Set(), taxiRanks: new Set(kind === 'taxi' ? [a.door!, b.door!] : []), dropOffs: new Set(points.map(p => p.road)), waste: new Set(homes.map(p => p.door!)), sanitation: new Set(kind === 'garbage' ? [a.door!] : []) });
  for (let attempt = 0; attempt < 20 && !traffic.vehicleCounts[kind]; attempt++) traffic.setCount(1);
  const cars = (traffic as any).cars; cars.splice(0, cars.length, cars.find((c: any) => c.model === kind));
  Object.assign(cars[0], { from: tile(42), to: tile(43), previous: tile(41), next: tile(44), after: tile(45), t: 0, speed: 0.8 });
  const visits = new RecreationVisits(world, id => released.push(id), streets); visits.setRoads(buildGraph(roads)); visits.setPlaces(places);
  const life = new RoadsideLife(scene, traffic, visits, world, streets); life.setPlaces(points);
  const residents: RecreationResident[] = Array.from({ length: 20 }, (_, id) => ({ id, employed: false, road: tile(id % 2 ? 55 : 43), door: tile(43), position: world(tile(id % 2 ? 55 : 43)) }));
  const step = (motion = true) => {
    if (streets) { streets.crowd.begin(residents.flatMap(p => { const pose = life.pose(p.id) || visits.pose(p.id); return pose?.visible === false ? [] : [{ id: p.id, position: pose?.position || p.position }]; })); streets.update(0.05, motion); }
    traffic.update(0.05, motion); visits.update(0.05, motion, residents); life.update(0.05, motion);
  };
  return { scene, traffic, visits, life, residents, points, places, step, released };
}

test('a passenger crosses the pavement margin only at a stopped vehicle door', () => {
  const r = rig('bus', true); r.residents.splice(4);
  const p = r.places[0], position = r.points[0].curb.clone();
  for (let id = 0; id < 4; id++) r.visits.visits.set(id, { resident: id, place: p, slot: id, phase: 'playing', position: position.clone().add(new THREE.Vector3(id * 0.13, 0, 0)), route: [tile(44)], next: 0, origin: tile(44), elapsed: 0, heading: 0, duration: 35 });
  for (let i = 0; i < 2500 && r.life.stats.busBoarded < 4; i++) r.step();
  assert.ok(r.life.stats.busBoarded > 0, 'the pavement safety margin must not block the bus doorstep: ' + JSON.stringify({ riders: [...r.life.riders.values()].map(v => ({ position: v.position, phase: v.phase, step: v.waypoint })), trips: [...r.life.trips.values()].map(t => ({ stage: t.stage, elapsed: t.elapsed })), vehicles: r.traffic.serviceVehicles, visits: [...r.visits.visits.values()].map(v => ({ phase: v.phase, position: v.position })) }));
  for (let i = 0; i < 2500 && r.life.stats.alighted < 4; i++) r.step();
  assert.ok(r.life.stats.alighted >= 4, 'all passengers leave through the door one at a time');
  r.life.dispose(); r.traffic.dispose();
});

test('a collector can leave the cab, work at a real pavement bin, and get back inside', () => {
  const r = rig('garbage', true); r.residents.splice(1);
  Object.assign((r.traffic as any).cars[0], { from: tile(46), to: tile(45), previous: tile(47), next: tile(44), after: tile(43), t: 0 });
  const p = r.places[0]; r.visits.visits.set(0, { resident: 0, place: p, slot: 0, phase: 'playing', position: r.points[0].curb.clone(), route: [tile(44)], next: 0, origin: tile(44), elapsed: 0, heading: 0, duration: 35 });
  for (let i = 0; i < 2400 && !r.life.stats.collections; i++) r.step();
  assert.ok(r.life.stats.collections > 0, 'street navigation must allow a collection round');
  for (let i = 0; i < 600 && ![...r.life.riders.values()].some(v => v.phase === 'aboard'); i++) r.step();
  assert.ok([...r.life.riders.values()].some(v => v.phase === 'aboard'), 'the collector returns across the doorstep into the cab');
  r.life.dispose(); r.traffic.dispose();
});

test('service fleet slots survive temporarily blocked spawns', () => {
  const roads = new Set(Array.from({ length: 20 }, (_, i) => tile(40 + i))), traffic = new Traffic(new THREE.Scene(), 12, world);
  traffic.setRoads(roads); traffic.setStops({ bus: new Set([tile(44)]), tram: new Set(), taxiRanks: new Set([tile(46)]), dropOffs: new Set(), sanitation: new Set([tile(48)]) });
  const original = (traffic as any).spawn.bind(traffic); let blocked = true;
  (traffic as any).spawn = (model: string) => blocked && ['bus', 'taxi', 'garbage'].includes(model) ? false : original(model);
  traffic.setCount(5); blocked = false; traffic.setCount(5);
  assert.ok(traffic.vehicleCounts.bus && traffic.vehicleCounts.taxi && traffic.vehicleCounts.garbage);
  traffic.dispose();
});

test('bus and taxi passengers walk aboard real vehicles, ride hidden, and step off at another stop', () => {
  for (const kind of ['bus', 'taxi'] as const) {
    const r = rig(kind); let walking = false, aboard = false, alighting = false;
    for (let i = 0; i < 5000; i++) {
      r.step();
      for (const rider of r.life.riders.values()) {
        const pose = r.life.pose(rider.id)!;
        walking ||= rider.phase === 'boarding' && pose.walking;
        aboard ||= rider.phase === 'aboard' && pose.visible === false;
        alighting ||= rider.phase === 'alighting' && pose.visible === true;
        assert.ok(r.residents.some(p => p.id === rider.id), 'passengers are existing residents');
        assert.ok(r.visits.visits.get(rider.id)?.transporting);
      }
      if (r.life.stats.alighted > 0) break;
    }
    assert.ok(r.life.stats[kind === 'bus' ? 'busBoarded' : 'taxiBoarded'] > 0, `${kind}: nobody boarded`);
    assert.ok(walking && aboard && alighting, `${kind}: incomplete passenger animation`);
    assert.ok(r.life.stats.alighted > 0, `${kind}: nobody got off`);
    r.life.dispose(); r.traffic.dispose(); assert.equal(r.scene.children.length, 0);
  }
});

test('a garbage truck picks up an existing resident who collects waste and returns to the cab', () => {
  const r = rig('garbage'); let working = false, bag = false, crewAboard = false;
  for (let i = 0; i < 5000; i++) {
    r.step();
    for (const rider of r.life.riders.values()) { const p = r.life.pose(rider.id)!; working ||= p.shirt === '#ed8b32' && p.visible === true; bag ||= p.hold === 'trashbag'; crewAboard ||= rider.phase === 'aboard'; }
    if (r.life.stats.collections >= 2 && [...r.life.riders.values()].some(v => v.phase === 'aboard')) break;
  }
  assert.ok(working && bag && crewAboard, 'collection stages are visible: ' + JSON.stringify({ working, bag, crewAboard, stats: r.life.stats, trips: [...r.life.trips.values()].map(t => ({ stage: t.stage, target: t.target.id, travel: t.travel })), vehicles: r.traffic.serviceVehicles })); assert.ok(r.life.stats.collections >= 2, 'the truck runs a collection round');
  const geometry = vehicleGeometry('garbage'); geometry.paint.computeBoundingBox(); assert.ok(geometry.paint.boundingBox!.max.y > 0.2);
  geometry.paint.dispose(); geometry.detail.dispose(); r.life.dispose(); r.traffic.dispose();
});

test('pause freezes passengers, vehicles, bins and collection equipment together', () => {
  const r = rig('bus'); for (let i = 0; i < 2000 && !r.life.riders.size; i++) r.step(); assert.ok(r.life.riders.size);
  const snapshot = () => JSON.stringify({ riders: [...r.life.riders.values()].map(v => ({ phase: v.phase, position: v.position.toArray() })), vehicles: r.traffic.serviceVehicles, stats: r.life.stats, props: r.scene.children.filter(c => c.name.startsWith('roadside-')).map(c => { const m = c as THREE.InstancedMesh; return [m.count, ...m.instanceMatrix.array.slice(0, m.count * 16)]; }) });
  const before = snapshot(); for (let i = 0; i < 20; i++) r.step(false); assert.equal(snapshot(), before);
  r.life.dispose(); r.traffic.dispose();
});

test('removing a stop or vehicle safely cancels riders and releases its held vehicle', () => {
  for (const change of ['stop', 'vehicle', 'move', 'crash'] as const) {
    const r = rig('taxi'); for (let i = 0; i < 2500 && !r.life.riders.size; i++) r.step(); assert.ok(r.life.riders.size);
    const original = [...r.life.riders.keys()];
    if (change === 'stop') r.life.setPlaces([]);
    else if (change === 'move') r.life.setPlaces(r.points.map(p => ({ ...p, curb: p.curb.clone().addScalar(1) })));
    else if (change === 'crash') r.traffic.setCrashed(r.traffic.serviceVehicles.find(v => v.model === 'taxi')!.id, true);
    else r.traffic.setCount(0);
    r.life.update(0.05, true); assert.ok(original.every(id => !r.life.riders.has(id))); if (change !== 'move') { assert.equal(r.life.riders.size, 0); assert.equal(r.life.trips.size, 0); } assert.ok(r.released.length);
    r.life.dispose(); r.traffic.dispose();
  }
});
