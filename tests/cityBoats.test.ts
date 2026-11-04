import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOAT_SIZE, activityPath, activityReady, boatKind, boatSeat, boatState, boatTripDuration, waterAccess } from '../components/city3d/activities';
import { getBuilding, terrainAt } from '../services/cityGameService';
import { activityPose, RecreationVisits, type RecreationPlace, type RecreationResident } from '../components/city3d/recreation';
import { buildGraph } from '../components/city3d/traffic';
import { ActivityProps } from '../components/city3d/activityProps';

const world = (index: number) => new THREE.Vector3(index % 100, 0, Math.floor(index / 100));
const sea = (_x: number, z: number) => z > 0.5;
const people = (count: number): RecreationResident[] => Array.from({ length: count }, (_, id) => ({ id, employed: false, road: 0, door: 0, position: world(0) }));
function setup(type = 'fishingboathouse', narrow = false) {
  const center = new THREE.Vector3(2, 0, 0), released: number[] = [];
  const source: RecreationPlace = { id: type, type, size: 1, center, rotation: Math.PI, online: true, door: 2, water: waterAccess(center, 1, sea, boatKind(type))! };
  if (narrow) source.water = { ...source.water!, loop: null };
  const visits = new RecreationVisits(world, id => released.push(id)); visits.setRoads(buildGraph(new Set([0, 1, 2, 3]))); visits.setPlaces([source]);
  return { visits, source, released, place: () => visits.placeList[0] };
}
const advance = (visits: RecreationVisits, residents: RecreationResident[], seconds: number) => { for (let t = 0; t < seconds; t += 0.05) visits.update(0.05, true, residents); };

test('river harbours and jagged lake shores get routes that clear land along every segment', () => {
  const wet = (x: number, z: number) => terrainAt(Math.floor(x + 50), Math.floor(z + 50)) === 'water';
  for (const [type, x, z] of [['marinaoffice', 31, 54], ['ferryterminal', 30, 52], ['lifeboatstation', 67, 32], ['trawlerdepot', 66, 30], ['fishingboathouse', 79, 32]] as const) {
    const size = getBuilding(type)!.size, center = new THREE.Vector3(x + (size - 1) / 2 - 49.5, 0, z + (size - 1) / 2 - 49.5);
    const water = waterAccess(center, size, wet, boatKind(type))!;
    assert.ok(water?.loop, `${type} at ${x},${z}: no navigable route`);
    assert.ok(water.loop!.length > 2); assert.ok(water.loop![0].distanceTo(water.loop!.at(-1)!) < 0.00001);
    const margin = 0.22 + BOAT_SIZE[boatKind(type)!].length / 3;
    for (let i = 1; i < water.loop!.length; i++) {
      const a = water.loop![i - 1], b = water.loop![i], steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.05));
      for (let j = 0; j <= steps; j++) for (let angle = 0; angle < 8; angle++) {
        const p = a.clone().lerp(b, j / steps), t = angle * Math.PI / 4;
        assert.ok(wet(p.x + Math.cos(t) * margin, p.z + Math.sin(t) * margin), `${type}: hull clips a bank`);
      }
    }
    const p: RecreationPlace = { id: type, type, size, center, rotation: 0, online: true, door: 0, water };
    const boarding = activityPath(p, 0, 0).at(-1)!;
    assert.ok(Math.hypot(boarding.x - water.dock.x, boarding.z - water.dock.z) < 0.3, 'the boarding path follows an extended pier');
  }
});

test('water too narrow for a ferry keeps it moored instead of crossing a bank', () => {
  const water = waterAccess(new THREE.Vector3(0, 0, 0), 1, (_x, z) => z > 0.5 && z < 1.2, 'ferry');
  assert.ok(water); assert.equal(water.loop, null);
});

test('a boat waits for its first passenger and starts a fresh boarding countdown', () => {
  const { visits, place } = setup();
  advance(visits, [], 123);
  assert.equal(place().boatTrip!.elapsed, 0); assert.equal(boatState(place(), visits.seconds)!.docked, true);
  for (let i = 0; i < 1000 && !place().boatTrip!.active; i++) visits.update(0.05, true, people(1));
  assert.ok(place().boatTrip!.active, 'a resident boarded');
  assert.equal(place().boatTrip!.elapsed, 0, 'time spent empty does not count towards departure');
  advance(visits, people(1), 6);
  assert.equal(boatState(place(), visits.seconds)!.phase, 'boarding');
  advance(visits, people(1), 3);
  assert.equal(boatState(place(), visits.seconds)!.phase, 'outbound');
});

test('every kind of passenger boat completes an offshore outing with seated passengers', () => {
  for (const type of ['harbourmaster', 'oysterhatchery', 'sailingclub', 'marinaoffice', 'fishingboathouse', 'trawlerdepot', 'lifeboatstation', 'ferryterminal', 'cruiseterminal']) {
    const { visits, place, released } = setup(type), residents = people(24), phases = new Set<string>();
    let farthest = 0, stoppedPosition: THREE.Vector3 | null = null, stopObserved = false;
    for (let i = 0; i < 5000; i++) {
      visits.update(0.05, true, residents);
      const p = place(), state = boatState(p, visits.seconds)!;
      phases.add(state.phase); farthest = Math.max(farthest, state.position.distanceTo(p.water!.dock));
      const passengers = [...visits.visits.values()].filter(v => v.phase === 'playing');
      if (!state.docked) {
        assert.ok(passengers.length, `${type}: a boat sailed empty`);
        assert.ok([...visits.visits.values()].every(v => v.phase !== 'leaving'), `${type}: someone disembarked offshore`);
      }
      for (const v of passengers) {
        const pose = activityPose(p, v.slot, visits.seconds), seat = boatSeat(p, v.slot, state);
        assert.ok(Math.hypot(pose.position.x - seat.x, pose.position.z - seat.z) < 0.00001, `${type}: passenger left their seat`);
        if (state.fishing) assert.ok(pose.rod, 'anchored fishers cast their rods, including a solo skipper');
        if (state.sightseeing) assert.equal(pose.hold, 'binoculars', 'sightseers look out from their seats');
      }
      if (state.fishing || state.sightseeing) {
        if (!stopObserved && stoppedPosition) assert.ok(Math.hypot(state.position.x - stoppedPosition.x, state.position.z - stoppedPosition.z) < 0.00001, 'the boat anchors for the activity');
        stopObserved ||= Boolean(stoppedPosition); stoppedPosition = state.position.clone();
      }
      if (released.length) break;
    }
    assert.ok(farthest > 2, `${type}: the boat did not head offshore`);
    for (const phase of ['boarding', 'outbound', boatKind(type) === 'fishing' ? 'fishing' : 'sightseeing', 'returning', 'unloading']) assert.ok(phases.has(phase), `${type}: missing ${phase}`);
    assert.ok(stopObserved && released.length > 0, `${type}: the outing did not finish`);
    assert.equal(place().boatTrip!.completed, 1);
  }
});

test('late passengers wait on the jetty until the next trip', () => {
  const { visits, place } = setup(); const residents = people(12);
  for (let i = 0; i < 1000 && boatState(place(), visits.seconds)!.docked; i++) visits.update(0.05, true, residents.slice(0, 1));
  assert.equal(boatState(place(), visits.seconds)!.docked, false);
  advance(visits, residents, 20);
  assert.equal(activityReady(place(), visits.seconds), false);
  assert.ok([...visits.visits.values()].some(v => v.resident > 0 && v.phase === 'entering'), 'late residents reached the boarding area');
  assert.ok([...visits.visits.values()].filter(v => v.phase === 'playing').every(v => v.resident === 0), 'nobody boards a moving boat');
  advance(visits, residents, boatTripDuration(place()) + 30);
  assert.ok(place().boatTrip!.completed > 0);
  assert.ok([...visits.visits.values()].some(v => v.resident > 0 && v.phase === 'playing'), 'waiting residents board the next outing');
});

test('pause freezes the voyage, passengers and rendered boat; demolition cancels safely', () => {
  const { visits, place, released } = setup('sailingclub'), residents = people(12), scene = new THREE.Scene(), props = new ActivityProps(scene);
  for (let i = 0; i < 1500 && boatState(place(), visits.seconds)!.docked; i++) visits.update(0.05, true, residents);
  props.update(visits);
  const snapshot = () => JSON.stringify({ trip: place().boatTrip, state: boatState(place(), visits.seconds), poses: [...visits.visits.keys()].map(id => visits.pose(id)), meshes: scene.children.map(child => { const m = child as THREE.InstancedMesh; return [m.count, ...m.instanceMatrix.array.slice(0, m.count * 16)]; }) });
  const before = snapshot(); visits.update(10, false, residents); props.update(visits); assert.equal(snapshot(), before);
  visits.update(0.1, true, residents); props.update(visits); assert.notEqual(snapshot(), before);
  visits.setPlaces([]); props.update(visits);
  assert.equal(visits.visits.size, 0); assert.ok(released.length); assert.ok(scene.children.every(child => (child as THREE.InstancedMesh).count === 0));
  props.dispose();
});

test('refreshing other facilities preserves a voyage; moving its harbour cancels it', () => {
  const { visits, place, source, released } = setup(); advance(visits, people(12), 35);
  const trip = place().boatTrip; assert.ok(trip!.active);
  visits.setPlaces([source, { id: 'cafe', type: 'cafe', size: 1, center: new THREE.Vector3(1, 0, -1), rotation: 0, online: true, door: 1 }]);
  assert.equal(place().boatTrip, trip);
  visits.setPlaces([{ ...source, center: new THREE.Vector3(3, 0, 0) }]);
  assert.notEqual(place().boatTrip, trip); assert.equal(place().boatTrip!.active, false); assert.equal(visits.visits.size, 0); assert.ok(released.length);
});

test('a narrow waterfront stays moored and returns its passengers without an unsafe trip', () => {
  const { visits, place, released } = setup('ferryterminal', true), residents = people(20);
  for (let i = 0; i < 2400; i++) { visits.update(0.05, true, residents); assert.ok(boatState(place(), visits.seconds)!.docked); }
  assert.ok(released.length); assert.ok(place().boatTrip!.completed > 0);
});
