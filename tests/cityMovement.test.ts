import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StreetNetwork } from '../components/city3d/streets';
import { BuildingVisits, type BuildingEntrance } from '../components/city3d/buildingVisits';
import { Traffic } from '../components/city3d/traffic';
import { TrafficSignals } from '../components/city3d/trafficSignals';
import { Pedestrians } from '../components/city3d/people';
import { PERSONAL_SPACE, PedestrianCrowd } from '../components/city3d/pedestrianCrowd';
import { pavementRects, PAVEMENT_SURFACE, surfaceHeight } from '../components/city3d/pavement';

const world = (index: number) => new THREE.Vector3(index % 100 - 50 + 0.5, 0, Math.floor(index / 100) - 50 + 0.5);
const at = (x: number, z: number) => z * 100 + x;
const roads = () => new Set(Array.from({ length: 9 }, (_, i) => at(50, 46 + i)));
const network = () => { const streets = new StreetNetwork(world); streets.setRoads(roads(), [at(50, 50)]); return streets; };
const seconds = (streets: StreetNetwork, amount: number) => { for (let i = 0; i < amount * 20; i++) streets.update(0.05, true); };
const entrance = (id: string, x: number, z: number, streets: StreetNetwork, isPublic = false): BuildingEntrance => {
  const door = at(50, z), threshold = world(at(x, z)); threshold.y = 0.065;
  return { id, type: isPublic ? 'market' : 'cottage', door, threshold, curb: streets.curb(door, threshold), online: true, public: isPublic };
};

test('pavements include flush corner pieces at bends and junctions, without overlapping top faces', () => {
  const index = at(50, 50), neighbours = [-101, -100, -99, -1, 1, 99, 100, 101];
  for (let mask = 0; mask < 256; mask++) {
    const roadSet = new Set([index, ...neighbours.filter((_, bit) => mask & 1 << bit).map(n => index + n)]);
    const rects = pavementRects(roadSet, index), centre = world(index);
    for (const [i, a] of rects.entries()) {
      assert.equal(surfaceHeight(roadSet, centre.x + a.x, centre.z + a.z), PAVEMENT_SURFACE);
      for (const b of rects.slice(i + 1)) {
        const x = Math.min(a.x + a.width / 2, b.x + b.width / 2) - Math.max(a.x - a.width / 2, b.x - b.width / 2);
        const z = Math.min(a.z + a.depth / 2, b.z + b.depth / 2) - Math.max(a.z - a.depth / 2, b.z - b.depth / 2);
        assert.ok(x < 0.000001 || z < 0.000001, `overlapping brick faces for neighbours ${mask}`);
      }
    }
  }
  const bend = new Set([index, index + 1, index - 100]), centre = world(index);
  assert.equal(surfaceHeight(bend, centre.x + 0.4, centre.z - 0.4), PAVEMENT_SURFACE, 'the highlighted corner must have bricks underfoot');
  assert.ok(pavementRects(bend, index).some(r => r.x > 0 && r.z < 0 && r.width === r.depth));
});

test('walkers queue behind a stationary person and keep their gap when the queue moves', () => {
  const crowd = new PedestrianCrowd(), lead = new THREE.Vector3(0.3, 0, 0), follower = new THREE.Vector3(0, 0, 0);
  crowd.begin([{ id: 1, position: lead }, { id: 2, position: follower }]);
  for (let frame = 0; frame < 500; frame++) {
    if (frame >= 100) crowd.move(1, lead, new THREE.Vector3(2, 0, 0), 0.05, 0.2, () => true);
    crowd.move(2, follower, new THREE.Vector3(1.7, 0, 0), 0.05, 0.2, () => true);
    assert.ok(lead.distanceTo(follower) >= PERSONAL_SPACE - 0.00001);
    if (frame === 99) assert.ok(follower.x < 0.23, 'the follower must wait instead of walking through the leader');
  }
  assert.ok(follower.x > 1.6 && lead.x > 1.9);
  assert.equal(crowd.spawn(3, lead.clone()), false, 'new residents wait indoors if the doorway is occupied');
});

test('opposing walkers pass on separate pavement lanes and both reach their destinations', () => {
  const streets = network(), a = streets.nodes.get(at(50, 46) * 4)!.position.clone(), b = streets.nodes.get(at(50, 54) * 4 + 3)!.position.clone();
  const goalA = b.clone(), goalB = a.clone(); let arrivedA = false, arrivedB = false;
  streets.crowd.begin([{ id: 'a', position: a }, { id: 'b', position: b }]);
  for (let i = 0; i < 1600 && (!arrivedA || !arrivedB); i++) {
    streets.update(0.05, true);
    if (!arrivedA) arrivedA = streets.walk('a', a, goalA, 0.05).arrived;
    if (!arrivedB) arrivedB = streets.walk('b', b, goalB, 0.05).arrived;
    assert.ok(a.distanceTo(b) >= PERSONAL_SPACE - 0.00001);
    assert.equal(surfaceHeight(roads(), a.x, a.z), PAVEMENT_SURFACE);
    assert.equal(surfaceHeight(roads(), b.x, b.z), PAVEMENT_SURFACE);
  }
  assert.ok(arrivedA && arrivedB, 'oncoming pedestrians must be able to pass each other');
});

test('sidewalk paths cross live road arms only on signal-controlled edges and do not jump road islands', () => {
  const streets = network(), center = world(at(50, 50));
  const start = center.clone().add(new THREE.Vector3(-0.43, 0.079, -0.43));
  const end = center.clone().add(new THREE.Vector3(0.43, 0.079, -0.43));
  const route = streets.route(start, end)!; assert.ok(route.length > 1);
  assert.equal(streets.nodes.get(route[0])!.links.find(e => e.to === route[1])!.crossing, at(50, 50));
  for (const node of streets.nodes.values()) for (const edge of node.links) if (edge.crossing !== null) assert.ok(streets.crossings.has(edge.crossing));
  assert.ok([...streets.crossings.values()].every(a => [...streets.crossings.values()].every(b => a === b || a.position.distanceTo(b.position) >= 2.6)));
  streets.setRoads(new Set([...roads(), at(70, 70)]), [at(50, 50)]);
  assert.equal(streets.route(start, world(at(70, 70))), null);
});

test('a crossing waits for committed cars to clear before allowing pedestrians off the curb', () => {
  const streets = network(), c = [...streets.crossings.values()][0], center = c.position;
  const p = center.clone().add(new THREE.Vector3(-0.43, 0.079, -0.43)), target = center.clone().add(new THREE.Vector3(0.43, 0.079, -0.43));
  for (let i = 0; i < 20; i++) streets.walk('resident', p, target, 0.05);
  assert.equal(c.waiting.size, 1); assert.ok(p.x < center.x - 0.3, 'the walker stays on the starting pavement while red');
  streets.setVehicles([{ id: 1, position: center.clone() }]); seconds(streets, 10);
  assert.equal(c.phase, 'all-red'); assert.equal(c.active.size, 0);
  assert.equal(streets.canDrive(1, center.clone(), center.clone().add(new THREE.Vector3(0, 0, 0.1))), true, 'committed vehicle must drain the junction');
  assert.equal(streets.canDrive(2, center.clone().add(new THREE.Vector3(0, 0, -0.85)), center.clone().add(new THREE.Vector3(0, 0, -0.74))), false);
  streets.setVehicles([]); seconds(streets, 0.1); assert.equal(c.phase, 'walk');
  let crossed = false;
  for (let i = 0; i < 200; i++) { streets.update(0.05, true); if (streets.walk('resident', p, target, 0.05, 0.05).arrived) { crossed = true; break; } }
  assert.equal(c.phase, 'clearance'); assert.equal(c.active.size, 1, 'a slow walker holds red beyond the WALK timer'); assert.equal(crossed, false);
  for (let i = 0; i < 300; i++) { streets.update(0.05, true); if (streets.walk('resident', p, target, 0.05, 0.15).arrived) { crossed = true; break; } }
  assert.ok(crossed); assert.equal(c.active.size, 0); assert.equal(streets.completedCrossings, 1);
  seconds(streets, 1.1); assert.equal(c.phase, 'cars');
});

test('cars yield to people in their swept path while allowing safe pavement walkers and opposite lanes', () => {
  const streets = network(), p = world(at(50, 50));
  streets.setPedestrians([p.clone().add(new THREE.Vector3(-0.2, 0, 0.24))]);
  assert.equal(streets.canDrive(1, p.clone().add(new THREE.Vector3(-0.2, 0, 0)), p.clone().add(new THREE.Vector3(-0.2, 0, 0.05))), false);
  streets.setPedestrians([p.clone().add(new THREE.Vector3(-0.43, 0, 0.24))]);
  assert.equal(streets.canDrive(1, p.clone().add(new THREE.Vector3(-0.2, 0, 0)), p.clone().add(new THREE.Vector3(-0.2, 0, 0.05))), true);
  streets.setPedestrians([]); streets.setVehicles([{ id: 2, position: p.clone().add(new THREE.Vector3(-0.2, 0, 0.45)) }]);
  assert.equal(streets.canDrive(1, p.clone().add(new THREE.Vector3(-0.2, 0, 0)), p.clone().add(new THREE.Vector3(-0.2, 0, 0.05))), false, 'same-lane queue');
  assert.equal(streets.canDrive(1, p.clone().add(new THREE.Vector3(0.2, 0, 0)), p.clone().add(new THREE.Vector3(0.2, 0, 0.05))), true, 'opposite lane remains open');
});

test('rendered cars stop at red and resume after crossing clearance', () => {
  const streets = network(), scene = new THREE.Scene(), traffic = new Traffic(scene, 1, world, streets);
  traffic.setRoads(roads()); traffic.setCount(1);
  const cars = (traffic as unknown as { cars: Array<{ from: number; to: number; t: number; speed: number }> }).cars;
  cars[0] = { from: at(50, 48), to: at(50, 49), t: 0, speed: 0.8 };
  const crossing = [...streets.crossings.values()][0]; crossing.phase = 'walk'; crossing.elapsed = 0;
  for (let i = 0; i < 100; i++) traffic.update(0.05, true);
  const before = new THREE.Matrix4(); traffic.meshes[0].getMatrixAt(0, before);
  assert.ok(Math.abs(before.elements[14] - crossing.position.z) - 0.225 > 0.46 + 0.032, 'the front bumper must remain clear of the outer walking lane');
  for (let i = 0; i < 40; i++) traffic.update(0.05, true);
  const stopped = new THREE.Matrix4(); traffic.meshes[0].getMatrixAt(0, stopped); assert.deepEqual(stopped.elements, before.elements);
  crossing.phase = 'cars'; for (let i = 0; i < 20; i++) traffic.update(0.05, true);
  const after = new THREE.Matrix4(); traffic.meshes[0].getMatrixAt(0, after); assert.notDeepEqual(after.elements, before.elements);
  traffic.setRoads(new Set()); traffic.setCount(5); traffic.update(0.05, true); assert.equal(traffic.meshes[0].count, 0);
  traffic.dispose(); assert.equal(scene.children.length, 0);
});

test('residents visibly enter markets, disappear indoors, exit, and return home through connected pavements', () => {
  const streets = network(), home = entrance('home', 49, 48, streets), market = entrance('market', 51, 52, streets, true);
  const released: number[] = [], visits = new BuildingVisits(streets, id => released.push(id)); visits.setPlaces([home, market]);
  const residents = [{ id: 0, home: 'home', work: 'market', position: home.curb.clone() }];
  const phases = new Set<string>(); let hidden = false;
  for (let i = 0; i < 5000 && !released.length; i++) {
    streets.update(0.05, true); visits.update(0.05, true, residents);
    const visit = visits.visits.get(0); if (visit) { phases.add(visit.phase); hidden ||= visits.pose(0)?.visible === false; }
  }
  for (const phase of ['departing', 'outbound', 'entering', 'inside', 'leaving', 'returning', 'home']) assert.ok(phases.has(phase), phase);
  assert.ok(hidden); assert.ok(released.length); assert.ok(visits.entered > 0); assert.ok(visits.exited > 0); assert.ok(streets.completedCrossings > 0);
});

test('building movement freezes with motion off; moving, demolishing, disconnecting or removing a resident cancels safely', () => {
  for (const change of ['move', 'demolish', 'roads', 'resident']) {
    const streets = network(), home = entrance('home', 49, 48, streets), market = entrance('market', 51, 52, streets, true);
    const visits = new BuildingVisits(streets, () => {}); visits.setPlaces([home, market]);
    const residents = [{ id: 0, home: 'home', work: null, position: home.curb.clone() }]; visits.update(0.05, true, residents);
    const snapshot = JSON.stringify([...visits.visits]); for (let i = 0; i < 50; i++) visits.update(1, false, residents); assert.equal(JSON.stringify([...visits.visits]), snapshot);
    if (change === 'move') visits.setPlaces([home, { ...market, threshold: market.threshold.clone().add(new THREE.Vector3(1, 0, 0)) }]);
    if (change === 'demolish') visits.setPlaces([home]);
    if (change === 'roads') { streets.setRoads(new Set()); visits.roadsChanged(); }
    if (change === 'resident') visits.update(0.05, true, []);
    assert.equal(visits.visits.size, 0); assert.ok([...streets.crossings.values()].every(c => c.active.size === 0));
  }
});

test('people and signal rendering reuse the resident population and dispose all meshes', () => {
  const streets = network(), scene = new THREE.Scene(), signals = new TrafficSignals(scene, streets), camera = new THREE.PerspectiveCamera(); camera.position.copy(world(at(50, 50))).add(new THREE.Vector3(0, 3, 4));
  signals.rebuild(); const lamps = scene.getObjectByName('city-traffic-signals') as THREE.InstancedMesh; assert.equal(lamps.count, streets.crossings.size * 10);
  const people = new Pedestrians(scene, 20, world, world(at(50, 50)), streets); people.setRoads(roads());
  const home = entrance('home', 49, 48, streets), market = entrance('market', 51, 52, streets, true);
  people.setCity([{ id: 'home', residents: 12, door: home.door }], [{ id: 'market', staff: 6, door: market.door }]); people.setEntrances([home, market]);
  for (let i = 0; i < 2500; i++) { streets.update(0.05, true); people.update(0.05, 0, true, camera); signals.update(); assert.ok((people.buildings?.visits.size || 0) + people.recreation.visits.size <= 12); }
  const status = JSON.stringify({ entered: people.buildings!.entered, exited: people.buildings!.exited, visits: [...people.buildings!.visits.values()].map(v => [v.resident, v.phase, v.position.toArray()]) });
  assert.ok(people.buildings!.entered > 0, status); assert.ok(people.buildings!.exited > 0, status);
  const states = [...streets.crossings.values()].map(c => [c.phase, c.elapsed]); for (let i = 0; i < 100; i++) streets.update(1, false); assert.deepEqual([...streets.crossings.values()].map(c => [c.phase, c.elapsed]), states);
  people.dispose(); signals.dispose(); assert.equal(scene.children.length, 0);
});

test('a busy simulation completes crossings without cars overlapping residents, and traffic does not deadlock', () => {
  const streets = network(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); camera.position.copy(world(at(50, 50))).add(new THREE.Vector3(0, 3, 4));
  const junctionRoads = roads(); for (let x = 46; x <= 54; x++) junctionRoads.add(at(x, 50)); streets.setRoads(junctionRoads, [at(50, 50)]);
  const people = new Pedestrians(scene, 60, world, world(at(50, 50)), streets), traffic = new Traffic(scene, 12, world, streets);
  people.setRoads(junctionRoads); traffic.setRoads(junctionRoads);
  const home = entrance('home', 49, 48, streets), market = entrance('market', 51, 52, streets, true);
  people.setCity([{ id: 'home', residents: 40, door: home.door }], [{ id: 'market', staff: 20, door: market.door }]); people.setEntrances([home, market]);
  const matrix = new THREE.Matrix4(); let stops = 0, greenAfterWalk = false, sawWalk = false;
  for (let frame = 0; frame < 4000; frame++) {
    traffic.setCount(10); streets.update(0.05, true); people.update(0.05, 0, true, camera); traffic.update(0.05, true);
    stops += streets.stoppedCars;
    const phases = [...streets.crossings.values()].map(c => c.phase); sawWalk ||= phases.includes('walk'); greenAfterWalk ||= sawWalk && phases.includes('cars');
    const buckets = (streets as unknown as { pedestrianBuckets: Map<string, THREE.Vector3[]> }).pedestrianBuckets;
    const walkers = [...buckets.values()].flat();
    for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) assert.ok(Math.hypot(walkers[i].x - walkers[j].x, walkers[i].z - walkers[j].z) >= PERSONAL_SPACE - 0.00001, `frame ${frame}: two visible residents overlapped`);
    for (let i = 0; i < traffic.meshes[0].count; i++) {
      traffic.meshes[0].getMatrixAt(i, matrix); const e = matrix.elements;
      for (const p of walkers) {
        const dx = p.x - e[12], dz = p.z - e[14], forward = dx * e[8] + dz * e[10], side = Math.abs(dx * e[10] - dz * e[8]);
        assert.ok(!(Math.abs(forward) < 0.24 && side < 0.115), `frame ${frame}: car ${i} overlapped a pedestrian (${forward},${side})`);
      }
    }
  }
  const state = JSON.stringify({ stops, crossings: streets.completedCrossings, greenAfterWalk, entered: people.buildings!.entered, exited: people.buildings!.exited, phases: [...streets.crossings.values()].map(c => [c.phase, c.waiting.size, c.active.size]), visits: [...people.buildings!.visits.values()].map(v => [v.resident, v.phase, v.position.toArray()]) });
  assert.ok(stops > 0, state); assert.ok(streets.completedCrossings > 5, state); assert.ok(greenAfterWalk, state);
  assert.ok(people.buildings!.entered > 0, state); assert.ok(people.buildings!.exited > 0, state);
  people.dispose(); traffic.dispose();
});
