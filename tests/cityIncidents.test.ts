import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Traffic, type FleetVehicle } from '../components/city3d/traffic';
import { RoadIncidents, vehicleImpacts } from '../components/city3d/incidents';
import { StreetNetwork } from '../components/city3d/streets';
import { CityWeather, type WeatherChoice } from '../components/city3d/weather';

const vehicle = (id: number, x: number, z = 0, heading = Math.PI / 2): FleetVehicle => ({ id, model: 'sedan', position: new THREE.Vector3(x, 0.03, z), heading, road: 5150, size: { half: 0.225, side: 0.09 }, stopped: false, crashed: false });
test('swept vehicle bodies detect rear-end and crossing impacts, not adjacent lanes or stationary queues', () => {
  assert.equal(vehicleImpacts([vehicle(1, -1), vehicle(2, 0)], [vehicle(1, -0.4), vehicle(2, 0)]).length, 1);
  assert.equal(vehicleImpacts([vehicle(1, -1), vehicle(2, 0, -1, 0)], [vehicle(1, 1), vehicle(2, 0, 1, 0)]).length, 1, 'detect vehicles that cross between frames');
  assert.equal(vehicleImpacts([vehicle(1, -1), vehicle(2, 0, 0.3)], [vehicle(1, 0.8), vehicle(2, 0, 0.3)]).length, 0);
  assert.equal(vehicleImpacts([vehicle(1, -0.5), vehicle(2, 0)], [vehicle(1, -0.5), vehicle(2, 0)]).length, 0);
  assert.equal(vehicleImpacts([], [vehicle(1, -0.4), vehicle(2, 0)]).length, 0, 'spawning is not an impact');
});

const world = (n: number) => new THREE.Vector3(n % 100 - 49.5, 0, Math.floor(n / 100) - 49.5);
function rig(useStreets = false) {
  const scene = new THREE.Scene(), roads = new Set(Array.from({ length: 23 }, (_, i) => 5140 + i));
  const streets = useStreets ? new StreetNetwork(world) : undefined; streets?.setRoads(roads);
  const traffic = new Traffic(scene, 24, world, streets); traffic.setRoads(roads);
  for (let attempt = 0; attempt < 10 && traffic.fleetVehicles.length < 2; attempt++) traffic.setCount(2);
  const cars = (traffic as any).cars; cars.splice(2);
  Object.assign(cars[0], { from: 5149, to: 5150, previous: 5148, next: 5151, after: 5152, t: 0.1, speed: 1, model: 'sedan', dwell: 0 });
  Object.assign(cars[1], { from: 5149, to: 5150, previous: 5148, next: 5151, after: 5152, t: 0.8, speed: 0.7, model: 'hatchback', dwell: 100 });
  const incidents = new RoadIncidents(scene, traffic); incidents.setRoads(roads); incidents.setBases([{ road: 5142, police: true, tow: true }]);
  const step = (motion = true) => { streets?.update(0.05, motion); traffic.update(0.05, motion); incidents.update(0.05, motion); };
  return { scene, roads, traffic, incidents, streets, step };
}

test('an impact freezes actual cars, dispatches police and a tow truck, loads the wreck and reopens the road', () => {
  const r = rig(); let police = false, tow = false, loaded = false;
  const stages = new Set<string>();
  for (let i = 0; i < 4600 && !r.incidents.stats.cleared; i++) {
    r.step(); for (const incident of r.incidents.active.values()) stages.add(incident.stage);
    police ||= Boolean(r.traffic.vehicleCounts.police); tow ||= Boolean(r.traffic.vehicleCounts.tow);
    loaded ||= Boolean((r.traffic as any).cars.some((c: any) => c.cargo));
  }
  assert.equal(r.incidents.stats.accidents, 1); assert.equal(r.incidents.stats.towed, 1); assert.equal(r.incidents.stats.cleared, 1);
  assert.ok(police && tow && loaded); for (const stage of ['reported', 'responding', 'controlling', 'loading', 'recovering']) assert.ok(stages.has(stage), stage);
  assert.ok(r.traffic.fleetVehicles.every(v => !v.crashed));
  r.incidents.dispose(); r.traffic.dispose(); assert.equal(r.scene.children.length, 0);
});

test('pause freezes an active response and deleting its road cancels all holds and responders', () => {
  const r = rig(); for (let i = 0; i < 1200 && !r.incidents.active.size; i++) r.step(); assert.equal(r.incidents.active.size, 1);
  const snapshot = () => JSON.stringify({ fleet: r.traffic.fleetVehicles, scenes: [...r.incidents.active], stats: r.incidents.stats });
  const before = snapshot(); for (let i = 0; i < 50; i++) r.step(false); assert.equal(snapshot(), before);
  r.incidents.setRoads(new Set()); assert.equal(r.incidents.active.size, 0); assert.ok(r.traffic.fleetVehicles.every(v => !v.crashed));
  r.incidents.dispose(); r.traffic.dispose();
});

test('the response clears a real road with vehicle spacing and junction rules enabled', () => {
  const r = rig(true); (r.traffic as any).cars[0].skid = 1;
  r.incidents.setBases([{ road: 5142, police: true, tow: false }, { road: 5148, police: false, tow: true }]);
  for (let i = 0; i < 4800 && !r.incidents.stats.cleared; i++) r.step();
  assert.equal(r.incidents.stats.accidents, 1);
  assert.equal(r.incidents.stats.cleared, 1, JSON.stringify({ incidents: [...r.incidents.active.values()], fleet: r.traffic.fleetVehicles, stats: r.incidents.stats }));
  r.incidents.dispose(); r.traffic.dispose();
});

test('wrecks cannot be crossed by the traffic deadlock escape rule', () => {
  const roads = new Set([5149, 5150, 5151]), streets = new StreetNetwork(world); streets.setRoads(roads);
  const a = vehicle(0, -0.6), b = vehicle(1, 0);
  streets.setVehicles([a, b]); streets.released.set(0, 1); streets.solidVehicles.add(1);
  assert.equal(streets.canDrive(0, a.position, new THREE.Vector3(-0.4, 0.03, 0), Math.PI / 2), false);
});

test('a police road closure makes approaching traffic take an available alternate turn', () => {
  const traffic = new Traffic(new THREE.Scene(), 4, world);
  traffic.setRoads(new Set([5149, 5150, 5151, 5050])); traffic.setCount(1);
  Object.assign((traffic as any).cars[0], { from: 5149, to: 5150, previous: 5148, next: 5151, after: 5152, t: 0.1, speed: 0, model: 'sedan' });
  traffic.setRoadClosures(new Set([5151])); traffic.update(0.05, true);
  assert.equal((traffic as any).cars[0].next, 5050); traffic.dispose();
});

test('weather changes smoothly, slows traffic in rain, produces lightning and freezes when paused', () => {
  const scene = new THREE.Scene(), weather = new CityWeather(scene), target = new THREE.Vector3();
  for (const choice of ['sunny', 'cloudy', 'rain', 'thunderstorm'] as WeatherChoice[]) {
    weather.setChoice(choice); let lightning = false;
    for (let i = 0; i < 500; i++) { weather.update(0.05, true, target, false); lightning ||= weather.flash > 0; }
    assert.equal(weather.kind, choice);
    if (choice === 'rain' || choice === 'thunderstorm') { assert.ok(weather.rainCount > 1000); assert.ok(weather.speed < 0.8); }
    if (choice === 'thunderstorm') assert.ok(lightning);
  }
  const seconds = weather.seconds; weather.update(1, false, target, false); assert.equal(weather.seconds, seconds); assert.equal(weather.flash, 0);
  weather.setChoice('auto'); for (let i = 0; i < 1450; i++) weather.update(0.05, true, target, false); assert.equal(weather.kind, 'cloudy');
  weather.dispose(); assert.equal(scene.children.length, 0);
});
