import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildGraph } from '../components/city3d/traffic';
import { RECREATION_TYPES, RecreationVisits, activityPose, type RecreationPlace, type RecreationResident } from '../components/city3d/recreation';
import { ACTIVITY_TYPES, WATER_ACTIVITY_TYPES, activityCapacity, boatKind, boatState, waterAccess } from '../components/city3d/activities';
import { BuildingVisits, type BuildingEntrance } from '../components/city3d/buildingVisits';
import { BUILDINGS, getBuilding } from '../services/cityGameService';
import { Pedestrians } from '../components/city3d/people';
import { TRACTOR_TYPES, tractorState } from '../components/city3d/farmVehicles';
import { ActivityProps } from '../components/city3d/activityProps';

const world = (index: number) => new THREE.Vector3(index % 100, 0, Math.floor(index / 100));
const graph = () => buildGraph(new Set([0, 1, 2, 3]));
// Water everywhere with z > 0.5: a straight shoreline along the back of a plot centred at z 0.
const sea = (x: number, z: number) => z > 0.5;
const place = (type: string, overrides: Partial<RecreationPlace> = {}): RecreationPlace => {
  const center = new THREE.Vector3(2, 0, 0), size = getBuilding(type)?.size || 1;
  return { id: type, type, size, door: 2, center, rotation: Math.PI, online: true, water: WATER_ACTIVITY_TYPES.has(type) ? waterAccess(center, size, sea, boatKind(type)) || undefined : undefined, ...overrides };
};
const residents = (count: number): RecreationResident[] => Array.from({ length: count }, (_, id) => ({ id, employed: false, road: 0, door: 0, position: new THREE.Vector3(0, 0.08, 0) }));

test('the whole building catalogue has an activity or an explicit home, indoor or scenery role', () => {
  const indoorOrScenery = new Set(['tree', 'postoffice', 'publictoilets']);
  const uncovered = BUILDINGS.filter(b => !b.residents && !ACTIVITY_TYPES.has(b.id) && !RECREATION_TYPES.has(b.id) && !indoorOrScenery.has(b.id));
  assert.deepEqual(uncovered.map(b => b.id), []);
});

test('every facility type with an activity is a real building and poses all its slots', () => {
  for (const type of ACTIVITY_TYPES) {
    assert.ok(getBuilding(type), `${type} is not in the building catalogue`);
    const p = place(type), slots = activityCapacity(p);
    assert.ok(slots > 0, `${type} has no activity slots`);
    for (let slot = 0; slot < slots; slot++) for (const t of [0, 3.3, 11.9, 47]) {
      const pose = activityPose(p, slot, t);
      assert.ok(pose.position.toArray().every(Number.isFinite) && Number.isFinite(pose.heading), `${type} slot ${slot} at ${t}s`);
      assert.ok(pose.position.distanceTo(p.center) < p.size * 0.75 + (WATER_ACTIVITY_TYPES.has(type) ? 8 : 0), `${type} slot ${slot} wandered off its plot`);
    }
  }
});

test('waterfront activities need water beside the building, and boats only sail on water', () => {
  assert.equal(activityCapacity(place('anglershut', { water: undefined })), 0);
  assert.equal(waterAccess(new THREE.Vector3(2, 0, -5), 1, sea), null, 'inland buildings have no jetty');
  const access = waterAccess(new THREE.Vector3(2, 0, 0), 1, sea, 'ferry')!;
  assert.deepEqual(access.out.toArray(), [0, 0, 1], 'the jetty points at the water');
  assert.ok(access.loop && access.loop.length > 10);
  for (const p of access.loop!) assert.ok(sea(p.x, p.z), 'the boat loop stays on water');
  // A narrow channel: the loop is smaller, or the boat stays moored, but never crosses land.
  const channel = (x: number, z: number) => z > 0.5 && z < 2.2;
  const narrow = waterAccess(new THREE.Vector3(2, 0, 0), 1, channel, 'sail');
  for (const p of narrow?.loop || []) assert.ok(channel(p.x, p.z));
});

test('fishers stand on the jetty facing the water, with a line out to a float', () => {
  const p = place('fishingjetty');
  for (let slot = 0; slot < activityCapacity(p); slot++) {
    const pose = activityPose(p, slot, 5);
    assert.ok(pose.rod, 'holding a rod');
    assert.ok(pose.position.z > 0.45, 'out on the jetty');
    assert.ok(pose.rod!.float.z > pose.position.z && sea(pose.rod!.float.x, pose.rod!.float.z), 'float on the water ahead');
  }
  const landed = Array.from({ length: 60 }, (_, i) => activityPose(p, 0, i * 0.5).rod!.fish);
  assert.ok(landed.includes(true) && landed.includes(false), 'now and then a fish is landed');
});

test('boat passengers board at the jetty, sail a full trip and come back ashore', () => {
  for (const type of ['sailingclub', 'harbourmaster', 'fishingboathouse', 'ferryterminal']) {
    const released: number[] = [], people = residents(20), visits = new RecreationVisits(world, id => released.push(id));
    const p = place(type); visits.setRoads(graph()); visits.setPlaces([p]);
    assert.ok(boatKind(type) && p.water?.loop);
    let farthest = 0, aboard = 0, fishing = false;
    for (let i = 0; i < 20 * 200; i++) {
      visits.update(0.05, true, people);
      const sailing = [...visits.visits.values()].filter(v => v.phase === 'playing');
      aboard = Math.max(aboard, sailing.length);
      if (sailing.length) {
        const boat = boatState(sailing[0].place, visits.seconds)!; farthest = Math.max(farthest, boat.position.distanceTo(p.water!.dock)); fishing ||= boat.fishing;
        for (const visit of sailing) assert.ok(visit.position.distanceTo(boat.position) < 0.6, `${type}: passenger left behind`);
      }
    }
    assert.ok(aboard > 0, `${type}: nobody boarded`);
    assert.ok(farthest > 1, `${type}: the boat never left the jetty`);
    assert.ok(released.length > 0, `${type}: nobody came back ashore`);
    if (type === 'fishingboathouse') assert.ok(fishing, 'fishing boats stop to fish');
  }
});

test('a boat with nobody aboard stays moored', () => {
  const p = place('marinaoffice');
  for (const t of [0, 20, 40, 60]) assert.ok(boatState(p, t, false)!.docked);
});

test('every land activity receives residents who take part and return', () => {
  for (const type of ACTIVITY_TYPES) {
    if (WATER_ACTIVITY_TYPES.has(type)) continue;
    const released: number[] = [], visits = new RecreationVisits(world, id => released.push(id)), people = residents(20);
    visits.setRoads(graph()); visits.setPlaces([place(type)]);
    let active = false;
    for (let i = 0; i < 2400; i++) { visits.update(0.05, true, people); active ||= (visits.attendance.get(type) || 0) > 0; }
    assert.ok(active, `${type}: nobody took part`);
    assert.ok(released.length, `${type}: nobody returned`);
  }
});

test('farm tractors have seated resident drivers and keep all equipment inside the rotated plot', () => {
  const scene = new THREE.Scene(), props = new ActivityProps(scene), visits = new RecreationVisits(world, () => {});
  for (const type of TRACTOR_TYPES) for (const rotation of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const p = place(type, { rotation }); visits.setRoads(graph()); visits.setPlaces([p]);
    visits.visits.set(0, { resident: 0, place: p, slot: 0, phase: 'playing', position: p.center.clone(), route: [], next: 0, origin: 0, elapsed: 0, heading: 0, duration: 35 });
    const inverse = new THREE.Matrix4().makeRotationY(-rotation).multiply(new THREE.Matrix4().makeTranslation(-p.center.x, 0, -p.center.z));
    for (let t = 0; t < 36; t += 0.5) {
      visits.seconds = t; props.update(visits);
      const tractor = tractorState(p, t)!, driver = activityPose(p, 0, t);
      assert.equal(driver.walking, false); assert.equal(driver.heading, tractor.heading);
      assert.ok(driver.position.distanceTo(tractor.position) < 0.08, 'the driver stays at the wheel');
      for (let slot = 1; slot < activityCapacity(p); slot++) {
        const delta = activityPose(p, slot, t).position.clone().sub(tractor.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -tractor.heading);
        assert.ok(Math.abs(delta.x) > 0.112 || Math.abs(delta.z) > 0.145, `${type}: farmer walks through the tractor at ${t}s`);
      }
      for (const child of scene.children) {
        const mesh = child as THREE.InstancedMesh; mesh.geometry.computeBoundingBox();
        for (let i = 0; i < mesh.count; i++) {
          const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix); matrix.premultiply(inverse);
          const bounds = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
          assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x), Math.abs(bounds.min.z), Math.abs(bounds.max.z)) <= p.size / 2 + 0.001, `${type}: tractor leaves the plot at ${t}s`);
        }
      }
    }
  }
  props.dispose(); assert.equal(scene.children.length, 0);
  assert.equal(tractorState(place('ricepaddy'), 0), null, 'tractors stay out of flooded paddies');
  assert.equal(tractorState(place('communityallotment'), 0), null, 'small allotments use hand tools');
});

test('farm activity pauses exactly, and removing or disconnecting a farm removes its tractor', () => {
  for (const change of ['remove', 'move', 'rotate', 'offline', 'roads', 'population']) {
    const scene = new THREE.Scene(), props = new ActivityProps(scene), released: number[] = [];
    const visits = new RecreationVisits(world, id => released.push(id)), people = residents(20), p = place('wheatfield');
    visits.setRoads(graph()); visits.setPlaces([p]);
    for (let i = 0; i < 500; i++) visits.update(0.05, true, people);
    assert.ok([...visits.visits.values()].some(v => v.slot === 0 && v.phase === 'playing'));
    props.update(visits);
    const snapshot = () => scene.children.map(child => { const mesh = child as THREE.InstancedMesh; return [mesh.count, ...mesh.instanceMatrix.array.slice(0, mesh.count * 16)]; });
    const frozen = snapshot(); visits.update(2, false, people); props.update(visits); assert.deepEqual(snapshot(), frozen);
    if (change === 'remove') visits.setPlaces([]);
    else if (change === 'move') visits.setPlaces([{ ...p, center: p.center.clone().addScalar(1) }]);
    else if (change === 'rotate') visits.setPlaces([{ ...p, rotation: p.rotation + Math.PI / 2 }]);
    else if (change === 'offline') visits.setPlaces([{ ...p, online: false }]);
    else if (change === 'roads') visits.setRoads(buildGraph(new Set()));
    else visits.update(0.05, true, []);
    props.update(visits);
    assert.equal(visits.visits.size, 0, change);
    assert.ok(scene.children.every(child => (child as THREE.InstancedMesh).count === 0), `${change}: abandoned tractor`);
    if (change !== 'population') assert.ok(released.length, `${change}: resident was not released`);
    props.dispose();
  }
});

test('shoppers leave with what they bought and posters arrive with a parcel', () => {
  const visits = new BuildingVisits({} as never, () => {});
  const entrance = (type: string): BuildingEntrance => ({ id: type, type, door: 0, curb: new THREE.Vector3(), threshold: new THREE.Vector3(), online: true, public: true });
  const visit = (type: string, phase: 'outbound' | 'inside' | 'leaving') => { visits.visits.set(1, { resident: 1, home: entrance('cottage'), destination: entrance(type), phase, position: new THREE.Vector3(), heading: 0, walking: true, elapsed: 0, duration: 5 }); return visits.pose(1)!; };
  assert.equal(visit('florist', 'outbound').hold, undefined);
  assert.equal(visit('florist', 'leaving').hold, 'flowers');
  assert.equal(visit('icecreamparlour', 'leaving').hold, 'icecream');
  assert.equal(visit('shop', 'leaving').hold, 'bag');
  assert.equal(visit('postoffice', 'outbound').hold, 'parcel');
  assert.equal(visit('postoffice', 'leaving').hold, undefined);
  assert.equal(visit('shop', 'inside').visible, false);
});

test('activities draw their equipment and held items only while in use', () => {
  const scene = new THREE.Scene(), people = new Pedestrians(scene, 40, world, new THREE.Vector3(), undefined);
  people.setRoads(new Set([0, 1, 2, 3])); people.setCity([{ id: 'home', residents: 30, door: 0 }], []);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(2, 2, 3);
  people.setRecreation([place('fishingjetty'), place('cafe', { id: 'cafe', center: new THREE.Vector3(1, 0, -1) })]);
  people.update(0.05, 0, true, camera);
  const props = scene.getObjectByName('activity-props-cyl') as THREE.InstancedMesh;
  assert.ok(props.count > 0, 'the jetty and its posts are always there');
  const jettyOnly = props.count;
  let fishing = false, dining = false, held = 0, furnished = 0;
  for (let i = 0; i < 20 * 60; i++) {
    people.update(0.05, i * 50, true, camera);
    const attendance = people.recreation.attendance;
    if (attendance.get('fishingjetty') && attendance.get('cafe')) { held = Math.max(held, (scene.getObjectByName('held-items-cyl') as THREE.InstancedMesh).count); furnished = Math.max(furnished, props.count); }
    fishing ||= Boolean(attendance.get('fishingjetty')); dining ||= Boolean(attendance.get('cafe'));
  }
  assert.ok(fishing && dining);
  assert.ok(held > 0, 'rods and cups are drawn');
  assert.ok(furnished > jettyOnly, 'café tables are set out');
  people.setRecreation([place('fishingjetty')]);
  people.update(0.05, 0, true, camera);
  assert.equal(props.count, jettyOnly, 'closed café tables disappear');
  people.dispose();
});
