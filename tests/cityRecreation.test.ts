import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Pedestrians } from '../components/city3d/people';
import { buildGraph } from '../components/city3d/traffic';
import { RECREATION_TYPES, RecreationVisits, activityPose, facilityPoint, roadRoute, routesTo, type RecreationPlace, type RecreationResident } from '../components/city3d/recreation';

const world = (index: number) => new THREE.Vector3(index % 100, 0, Math.floor(index / 100));
const graph = () => buildGraph(new Set([0, 1, 2, 3]));
const place = (type = 'basketballcourt', overrides: Partial<RecreationPlace> = {}): RecreationPlace => ({ id: 'court', type, size: 2, door: 2, center: new THREE.Vector3(2, 0, -1), rotation: 0, online: true, ...overrides });
const residents = (count: number, employed = false): RecreationResident[] => Array.from({ length: count }, (_, id) => ({ id, employed, road: 0, door: 0, position: new THREE.Vector3(0, 0.08, 0) }));
const simulate = (visits: RecreationVisits, people: RecreationResident[], seconds: number) => { for (let i = 0; i < seconds * 20; i++) visits.update(0.05, true, people); };

test('route trees connect entrances through actual roads and refuse disconnected islands', () => {
  const tree = routesTo(graph(), 2);
  assert.deepEqual(roadRoute(tree, 0, 2), [0, 1, 2]);
  assert.equal(roadRoute(tree, 70, 2), null);
  assert.equal(routesTo(graph(), 70).size, 0);
});

test('every recreation type receives existing residents who enter, play and leave', () => {
  for (const type of RECREATION_TYPES) {
    const released: number[] = [], people = residents(20);
    const visits = new RecreationVisits(world, id => released.push(id)); visits.setRoads(graph()); visits.setPlaces([place(type)]);
    let playing = false, leaving = false;
    for (let i = 0; i < 1500; i++) {
      visits.update(0.05, true, people);
      playing ||= (visits.attendance.get('court') || 0) > 0;
      leaving ||= [...visits.visits.values()].some(v => v.phase === 'leaving' || v.phase === 'returning');
      assert.ok(visits.visits.size <= people.length);
      for (const visit of visits.visits.values()) assert.ok(people.some(p => p.id === visit.resident));
    }
    assert.ok(playing, `${type}: nobody played`); assert.ok(leaving, `${type}: nobody left`); assert.ok(released.length, `${type}: nobody returned`);
  }
});

test('empty, unserviced and disconnected facilities do not create visitors', () => {
  const visits = new RecreationVisits(world, () => {}); visits.setRoads(graph()); visits.setPlaces([place()]);
  simulate(visits, [], 20); assert.equal(visits.visits.size, 0);
  visits.setPlaces([place('basketballcourt', { online: false })]); simulate(visits, residents(20), 20); assert.equal(visits.visits.size, 0);
  visits.setPlaces([place('basketballcourt', { door: 99 })]); simulate(visits, residents(20), 20); assert.equal(visits.visits.size, 0);
});

test('walking visitors move continuously, and motion-off freezes bodies, clock and attendance', () => {
  const visits = new RecreationVisits(world, () => {}), people = residents(6); visits.setRoads(graph()); visits.setPlaces([place()]);
  visits.update(0.05, true, people);
  const initial = [...visits.visits.values()][0].position.clone(); visits.update(0.05, true, people);
  assert.ok([...visits.visits.values()][0].position.distanceTo(initial) <= 0.32 * 0.05 + 0.001);
  simulate(visits, people, 20);
  const snapshot = [...visits.visits].map(([id, v]) => [id, v.phase, v.position.toArray(), v.elapsed]); const time = visits.seconds;
  for (let i = 0; i < 100; i++) visits.update(1, false, people);
  assert.equal(visits.seconds, time); assert.deepEqual([...visits.visits].map(([id, v]) => [id, v.phase, v.position.toArray(), v.elapsed]), snapshot);
});

test('demolition, moving a facility and removing its roads release its visitors', () => {
  for (const change of ['delete', 'move', 'roads']) {
    const released: number[] = [], visits = new RecreationVisits(world, id => released.push(id)), people = residents(20);
    visits.setRoads(graph()); visits.setPlaces([place()]); simulate(visits, people, 20); assert.ok(visits.visits.size);
    if (change === 'delete') visits.setPlaces([]);
    else if (change === 'move') visits.setPlaces([place('basketballcourt', { center: new THREE.Vector3(3, 0, -1) })]);
    else visits.setRoads(buildGraph(new Set([0, 1])));
    assert.equal(visits.visits.size, 0); assert.ok(released.length);
  }
});

test('facility activities use the rotated/scaled model coordinates and distinct joint poses', () => {
  const rotated = place('basketballcourt', { rotation: Math.PI / 2, size: 2 });
  assert.deepEqual(facilityPoint(rotated, 0, 0.1, 0.25).toArray(), [2.5, 0.2, -1]);
  const swimmer = activityPose(place('publicpool'), 0, 2), skater = activityPose(place('skatepark'), 0, 2), tennis = activityPose(place('tennisclub'), 0, 2);
  assert.equal(swimmer.rootPitch, Math.PI / 2); assert.ok(skater.knees![0] > 0.5); assert.notDeepEqual(tennis.arms, swimmer.arms);
  assert.ok(swimmer.position.y > 0.085 * 2, 'swimmers must remain visible above the pool water surface');
  for (const type of RECREATION_TYPES) for (let t = 0; t < 12; t += 0.25) {
    const pose = activityPose(place(type), 0, t); assert.ok(pose.position.toArray().every(Number.isFinite));
    assert.ok(Number.isFinite(pose.heading));
  }
});

test('employed residents take breaks without creating a second copy; equipment follows attendance', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); camera.position.set(2, 3, 3);
  const people = new Pedestrians(scene, 50, world, new THREE.Vector3());
  people.setRoads(new Set([0, 1, 2, 3]));
  people.setCity([{ id: 'home', residents: 8, door: 0 }], [{ id: 'work', staff: 8, door: 0 }]);
  people.setRecreation([place()]);
  for (let i = 0; i < 400; i++) people.update(0.05, i * 50, true, camera);
  assert.ok(people.recreation.attendance.get('court'));
  const ball = scene.getObjectByName('recreation-ball') as THREE.InstancedMesh; assert.equal(ball.count, 1);
  const torso = scene.children.find((m): m is THREE.InstancedMesh => m instanceof THREE.InstancedMesh && m.geometry.type === 'LatheGeometry' && (m.geometry as any).parameters.points.length === 8)!;
  assert.ok(torso.count > 0 && torso.count <= 8);
  const before = new THREE.Matrix4(); ball.getMatrixAt(0, before); people.update(0.5, 50000, false, camera); const after = new THREE.Matrix4(); ball.getMatrixAt(0, after); assert.deepEqual(after.elements, before.elements);
  people.setRecreation([]); people.update(0.05, 51000, true, camera); assert.equal(ball.count, 0); assert.equal(torso.count, 0);
  people.dispose(); assert.equal(scene.children.length, 0);
});

test('multiple facilities share the visit budget instead of the first one monopolizing it', () => {
  const visits = new RecreationVisits(world, () => {}), people = residents(20); visits.setRoads(graph());
  visits.setPlaces(['tennisclub', 'playground', 'skatepark', 'publicpool'].map((type, i) => place(type, { id: `p${i}` })));
  simulate(visits, people, 1);
  assert.equal(new Set([...visits.visits.values()].map(v => v.place.id)).size, 4);
});
