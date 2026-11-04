import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildGraph } from '../components/city3d/traffic';
import { RecreationVisits, type RecreationPlace, type RecreationResident } from '../components/city3d/recreation';
import { Aviation, type AirportPlace, type Helipad } from '../components/city3d/aviation';
import { FlightLife } from '../components/city3d/flights';

// A street along z = 0 (tiles 0-9), two towers with rooftop helipads and an airport behind it.
const world = (index: number) => new THREE.Vector3(index % 100, 0, Math.floor(index / 100));
const graph = () => buildGraph(new Set(Array.from({ length: 10 }, (_, i) => i)));
const roof = (id: string, x: number, height: number, road: number): { pad: Helipad; place: RecreationPlace } => {
  const position = new THREE.Vector3(x, height, -1.6), hatch = new THREE.Vector3(x, height, -1.46);
  return {
    pad: { id, position, roof: true, hatch, door: new THREE.Vector3(x, 0.02, -1.25), road, curb: new THREE.Vector3(x, 0.08, -0.4) },
    place: { id: `${id}:roof`, type: 'tower', size: 1, door: road, center: new THREE.Vector3(x, 0, -1.5), rotation: 0, online: true, helipad: { pad: position, hatch } },
  };
};
const residents = (count: number): RecreationResident[] => Array.from({ length: count }, (_, id) => ({ id, employed: false, road: 0, door: 0, position: new THREE.Vector3(0, 0.08, 0) }));
function city(withAirport: boolean, withRoofs: boolean) {
  const released: Array<[number, number]> = [];
  const visits = new RecreationVisits(world, (id, road) => released.push([id, road])), aviation = new Aviation(new THREE.Scene());
  const a = roof('towerA', 1, 3, 1), b = roof('towerB', 8, 2.5, 8);
  const airport: AirportPlace = { id: 'airport', center: new THREE.Vector3(5, 0, -3), rotation: 0, size: 4, road: 5, curb: new THREE.Vector3(5, 0.08, -0.4) };
  visits.setRoads(graph());
  visits.setPlaces([...(withRoofs ? [a.place, b.place] : []), ...(withAirport ? [{ id: 'airport', type: 'airport', size: 4, door: 5, center: airport.center, rotation: 0, online: true }] : [])]);
  aviation.setPlaces(withAirport ? [airport] : [], [a.pad, b.pad]);
  const flights = new FlightLife(new THREE.Scene(), visits, aviation), people = residents(30);
  const step = () => { visits.update(0.05, true, people); flights.update(0.05, true); aviation.update(0.05, true); };
  return { visits, aviation, flights, released, step, people };
}

test('a resident takes the lift, boards a rooftop helicopter, flies to another tower and walks out at the bottom', () => {
  const { visits, aviation, flights, released, step } = city(false, true);
  let lift = false, flying = false, aboardWhileFlying = true, outOfFrontDoor = false;
  for (let frame = 0; frame < 20 * 400; frame++) {
    step();
    for (const [id, visit] of visits.visits) if (visit.place.helipad && visit.hidden && visit.hidden > 0) { lift = true; assert.equal(visits.pose(id)!.visible, false, 'out of sight in the lift'); }
    for (const [id, rider] of flights.riders) if (rider.stage === 'aboard' && rider.craft.kind === 'heli') {
      const heli = aviation.helicopters[rider.craft.index];
      if (heli.mode !== 'landed') { flying = true; aboardWhileFlying &&= flights.pose(id)!.visible === false; }
    }
    // After the lift down, passengers walk out of the front door at street level to the pavement.
    for (const [id, rider] of flights.riders) if (rider.stage === 'alighting' && rider.hidden <= 0 && rider.position.y < 0.2) {
      const pose = flights.pose(id)!;
      if (pose.visible && pose.walking && rider.position.z < -0.45) outOfFrontDoor = true;
    }
  }
  assert.ok(lift, 'went up in the lift');
  assert.ok(flights.stats.heliBoarded > 0 && flights.stats.heliLanded > 0, JSON.stringify(flights.stats));
  assert.ok(flying && aboardWhileFlying, 'rides out of sight while the helicopter flies');
  assert.ok(outOfFrontDoor, 'walks out of the front door of the building they landed on');
  // Climbing out at the other tower, they come out of its front door onto its street.
  assert.ok(released.some(([, road]) => road === 8) && released.some(([, road]) => road === 1), JSON.stringify(released.slice(0, 10)));
  aviation.dispose(); flights.dispose();
});

test('a helicopter waits on the pad until its passengers are aboard', () => {
  const { aviation, flights, step } = city(false, true);
  for (let frame = 0; frame < 20 * 300; frame++) {
    step();
    for (const rider of flights.riders.values()) if (rider.craft.kind === 'heli' && rider.stage === 'boarding') assert.equal(aviation.helicopters[rider.craft.index].mode, 'landed', 'never leaves anyone halfway');
  }
  aviation.dispose(); flights.dispose();
});

test('airport passengers walk through the terminal, up the airstairs, fly the circuit and come back out', () => {
  const { visits, aviation, flights, step } = city(true, false);
  let sawStairs = false, aboardInFlight = false, resumed = false;
  for (let frame = 0; frame < 20 * 600; frame++) {
    step();
    for (const [id, rider] of flights.riders) {
      if (rider.craft.kind !== 'plane') continue;
      if (rider.stage === 'boarding' && rider.position.y > 0.17) sawStairs = true;
      const plane = aviation.planes[rider.craft.gate];
      if (rider.stage === 'aboard' && plane.phase === 'flight') { aboardInFlight = true; assert.equal(flights.pose(id)!.visible, false); }
    }
    if (flights.stats.planeLanded > 0 && [...visits.visits.values()].some(v => v.place.id === 'airport' && v.phase === 'leaving')) resumed = true;
  }
  assert.ok(flights.stats.planeBoarded > 0, JSON.stringify(flights.stats));
  assert.ok(sawStairs, 'climbs the airstairs');
  assert.ok(aboardInFlight, 'flies aboard, out of sight');
  assert.ok(flights.stats.planeLanded > 0, 'comes back down after landing');
  assert.ok(resumed, 'leaves the airport afterwards');
  aviation.dispose(); flights.dispose();
});

test('pausing freezes passengers mid-walk', () => {
  const { visits, aviation, flights, step, people } = city(true, true);
  for (let frame = 0; frame < 20 * 120; frame++) step();
  const snapshot = () => [...flights.riders.values()].map(r => [r.id, r.stage, r.position.toArray()]);
  const before = snapshot();
  for (let i = 0; i < 40; i++) { visits.update(1, false, people); flights.update(1, false); aviation.update(1, false); }
  assert.deepEqual(snapshot(), before);
  aviation.dispose(); flights.dispose();
});
