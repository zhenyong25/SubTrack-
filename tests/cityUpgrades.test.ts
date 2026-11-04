import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BUILDINGS, LEVEL_XP, MAX_BUILDING_LEVEL, MAX_LEVEL, TIER_UNLOCK, build, cityStats, levelForXp, maxChunks, newCity, upgrade, CHUNKS, type CityState } from '../services/cityGameService';
import { bake, buildModel, type ModelContext } from '../components/city3d/models';

const T0 = 0, TODAY = '2026-11-04';
const material = new THREE.MeshStandardMaterial();
const context: ModelContext = { std: () => material, facade: () => material, textures: {} as ModelContext['textures'] };

test('the city levels go up to 30, each further than the last, with land to match', () => {
  assert.equal(MAX_LEVEL, 30);
  for (let level = 2; level <= MAX_LEVEL; level++) assert.ok(LEVEL_XP[level] - LEVEL_XP[level - 1] >= LEVEL_XP[level - 1] - LEVEL_XP[level - 2], `level ${level} takes at least as long as the one before`);
  assert.equal(levelForXp(LEVEL_XP[16]), 16); assert.equal(levelForXp(10_000_000), 30);
  assert.ok(maxChunks(30) <= CHUNKS * CHUNKS);
});

test('buildings upgrade to level 5; levels 4 and 5 open at city levels 16 and 22', () => {
  assert.equal(MAX_BUILDING_LEVEL, 5);
  let city: CityState = { ...newCity(T0, TODAY), coins: 10_000_000, xp: LEVEL_XP[15] };
  city = build(city, 'cottage', 52, 52, T0, TODAY, 'home').state!;
  city = upgrade(city, 'home', T0, TODAY).state!; city = upgrade(city, 'home', T0, TODAY).state!;
  assert.match(upgrade(city, 'home', T0, TODAY).error!, /city level 16/);
  const residents = (state: CityState) => cityStats(state, T0).status.get('home')!.residents;
  const at3 = residents(city);
  city = upgrade({ ...city, xp: LEVEL_XP[TIER_UNLOCK[4]] }, 'home', T0, TODAY).state!;
  assert.equal(city.buildings[0].level, 4); assert.ok(residents(city) > at3, 'houses more people at level 4');
  assert.match(upgrade({ ...city, xp: LEVEL_XP[21] }, 'home', T0, TODAY).error!, /city level 22/);
  city = upgrade({ ...city, xp: LEVEL_XP[22] }, 'home', T0, TODAY).state!;
  assert.equal(city.buildings[0].level, 5); assert.ok(residents(city) > at3 * 1.5);
  assert.match(upgrade(city, 'home', T0, TODAY).error!, /top level/);
});

test('every building looks different at every level, and upgrades add nothing outside the plot', () => {
  let reach = 0;
  const fingerprint = (type: string, level: number, size: number) => {
    const prefab = bake(buildModel(type, context, level, size));
    let vertices = 0, sum = 0;
    for (const part of prefab.parts) {
      const position = part.geometry.getAttribute('position'); vertices += position.count;
      for (let i = 0; i < position.count; i += 7) sum += position.getX(i) * 3.1 + position.getY(i) * 5.3 + position.getZ(i) * 7.7;
      part.geometry.computeBoundingBox();
      const box = part.geometry.boundingBox!;
      const extent = Math.max(...[box.min.x, box.max.x, box.min.z, box.max.z].map(Math.abs));
      assert.ok(Number.isFinite(extent), `${type} ${level} is finite`);
      // Some original designs (a turbine's blades) reach past the plot; upgrades never do.
      if (level === 1) reach = Math.max(reach, extent); else assert.ok(extent <= Math.max(reach, size / 2 + 0.02), `${type} ${level} stays in its plot`);
      part.geometry.dispose();
    }
    return `${vertices}:${sum.toFixed(3)}`;
  };
  for (const type of BUILDINGS) {
    let previous = ''; reach = 0;
    for (let level = 1; level <= MAX_BUILDING_LEVEL; level++) {
      const print = fingerprint(type.id, level, type.size);
      assert.notEqual(print, previous, `${type.id} level ${level} looks like level ${level - 1}`);
      previous = print;
    }
  }
});
