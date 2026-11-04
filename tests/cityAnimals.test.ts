import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ANIMAL_TYPES, CIRCLING_BIRDS, Animals, type AnimalPlace, type Species } from '../components/city3d/animals';
import { getBuilding } from '../services/cityGameService';

const place = (type: string, x = 0, rotation = 0): AnimalPlace => ({ id: `${type}-${x}`, type, size: getBuilding(type)!.size, center: new THREE.Vector3(x, 0, 0), rotation, ground: 0.04 });
type Inside = { animals: Array<{ species: string; place: AnimalPlace; mode: string; air: number }>; pose(a: unknown): { position: THREE.Vector3; heading: number } };
const inside = (animals: Animals) => animals as unknown as Inside;

test('every animal home is a building in the catalogue', () => {
  for (const type of ANIMAL_TYPES) assert.ok(getBuilding(type), type);
});

test('animals wander, graze and fly but stay on their own plot', () => {
  const scene = new THREE.Scene(), animals = new Animals(scene);
  const places = [...ANIMAL_TYPES].map((type, i) => place(type, i * 3, (i % 4) * Math.PI / 2));
  animals.setPlaces(places);
  assert.ok(animals.count > 60);
  for (const species of ['cow', 'chicken', 'sheep', 'pig', 'horse', 'goat', 'duck', 'dog', 'cat', 'rabbit', 'deer', 'panda', 'pigeon', 'gull', 'sparrow', 'crow', 'swallow', 'parrot', 'flamingo', 'peacock', 'fox', 'hedgehog', 'butterfly', 'koi'] as Species[]) assert.ok(animals.species.includes(species), species);
  const start = inside(animals).animals.map(a => inside(animals).pose(a).position.clone());
  const modes = new Set<string>();
  for (let frame = 0; frame < 20 * 120; frame++) {
    animals.update(0.05, true);
    for (const a of inside(animals).animals) {
      modes.add(a.mode);
      if (CIRCLING_BIRDS.has(a.species as Species)) continue;
      const p = inside(animals).pose(a).position, half = a.place.size / 2;
      assert.ok(Math.abs(p.x - a.place.center.x) <= half && Math.abs(p.z - a.place.center.z) <= half, `${a.species} left its ${a.place.type}`);
    }
  }
  const moved = inside(animals).animals.filter((a, i) => inside(animals).pose(a).position.distanceTo(start[i]) > 0.02).length;
  assert.ok(moved > animals.count * 0.6, `only ${moved} of ${animals.count} animals moved`);
  for (const mode of ['walk', 'graze', 'sit', 'rest', 'fly']) assert.ok(modes.has(mode), mode);
  assert.ok((scene.getObjectByName('city-animals-sphere') as THREE.InstancedMesh).count > animals.count, 'animals are drawn');
  animals.dispose();
});

test('birds take off near a resident, land in their habitat and ignore people on higher floors', () => {
  const animals = new Animals(new THREE.Scene()); animals.setPlaces([place('shop', 0, Math.PI / 2)]);
  const bird = inside(animals).animals[0], observer = inside(animals).pose(bird).position.clone().add(new THREE.Vector3(0.03, 0, 0));
  animals.update(0.05, true, [observer.clone().add(new THREE.Vector3(0, 4, 0))]);
  assert.equal(animals.stats.birdsScattered, 0, 'a rooftop visitor must not scare birds on the ground');
  animals.update(0.05, true, [observer]); assert.ok(animals.stats.birdsScattered > 0);
  let height = 0, landed = false;
  for (let i = 0; i < 300; i++) {
    animals.update(0.05, true); height = Math.max(height, bird.air);
    if (height > 0.1 && bird.mode === 'idle' && bird.air === 0) { landed = true; break; }
  }
  assert.ok(height > 0.2 && landed, 'a full takeoff and landing must be visible');
  const p = inside(animals).pose(bird).position;
  assert.ok(Math.abs(p.x) <= 0.5 && Math.abs(p.z) <= 0.5, 'land on the shop plot, not the road');
  animals.dispose();
});

test('dogs greet nearby visitors and small animals scamper without leaving a rotated park', () => {
  const animals = new Animals(new THREE.Scene()), park = place('park', 4, Math.PI / 2); animals.setPlaces([park]);
  const dog = inside(animals).animals.find(a => a.species === 'dog')!, squirrel = inside(animals).animals.find(a => a.species === 'squirrel')!;
  const visitors = [dog, squirrel].map(a => inside(animals).pose(a).position.clone().add(new THREE.Vector3(0.03, 0, 0)));
  animals.update(0.05, true, visitors);
  assert.equal(animals.stats.dogGreetings, 1); assert.ok(animals.stats.animalScampers > 0);
  const frozen = JSON.stringify({ state: inside(animals).animals, stats: animals.stats });
  animals.update(10, false, visitors); assert.equal(JSON.stringify({ state: inside(animals).animals, stats: animals.stats }), frozen);
  for (let i = 0; i < 180; i++) {
    animals.update(0.05, true, visitors);
    for (const a of [dog, squirrel]) { const p = inside(animals).pose(a).position; assert.ok(Math.abs(p.x - 4) <= 0.5 && Math.abs(p.z) <= 0.5); }
  }
  assert.equal(animals.stats.dogGreetings, 1, 'greetings have a cooldown');
  animals.setPlaces([]); animals.update(0.05, true, visitors); assert.equal(animals.reacting, 0); assert.equal(animals.count, 0);
  animals.dispose();
});

test('koi stay in the pond and butterflies keep flying and freeze with the city', () => {
  const animals = new Animals(new THREE.Scene()); animals.setPlaces([place('duckpond'), place('botanicalgarden', 3)]);
  const fish = inside(animals).animals.filter(a => a.species === 'koi'), butterflies = inside(animals).animals.filter(a => a.species === 'butterfly');
  assert.equal(fish.length, 4); assert.equal(butterflies.length, 7);
  const start = inside(animals).pose(butterflies[0]).position.clone();
  for (let i = 0; i < 800; i++) {
    animals.update(0.05, true);
    for (const a of fish) { const p = inside(animals).pose(a).position; assert.ok((p.x / 0.3) ** 2 + (p.z / 0.225) ** 2 < 1, 'fish stay in the oval water'); assert.equal(a.air, 0); }
  }
  assert.ok(inside(animals).pose(butterflies[0]).position.distanceTo(start) > 0.03);
  const before = JSON.stringify(inside(animals).animals);
  animals.update(20, false); assert.equal(JSON.stringify(inside(animals).animals), before);
  animals.dispose();
});

test('pausing freezes the animals; rebuilding the city keeps them where they are', () => {
  const animals = new Animals(new THREE.Scene()), farm = place('dairyfarm'), barn = place('redbarn', 3);
  animals.setPlaces([farm, barn]);
  for (let i = 0; i < 200; i++) animals.update(0.05, true);
  const snapshot = () => inside(animals).animals.map(a => inside(animals).pose(a).position.toArray());
  const before = snapshot();
  for (let i = 0; i < 100; i++) animals.update(1, false);
  assert.deepEqual(snapshot(), before);
  animals.setPlaces([{ ...farm, center: farm.center.clone() }, { ...barn, center: barn.center.clone() }]);
  assert.deepEqual(snapshot(), before, 'an unchanged farm keeps its herd in place');
  animals.setPlaces([farm]);
  assert.ok(inside(animals).animals.every(a => a.place.type === 'dairyfarm'), 'demolishing the barn removes its animals');
  animals.setPlaces([]); assert.equal(animals.count, 0);
  animals.dispose();
});
