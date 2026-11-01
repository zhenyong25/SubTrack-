import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { BUILDING_RECIPES } from '../components/city3d/expansionModels';
import { EXPANSION_BUILDINGS, EXPANSION_CATEGORIES } from '../services/cityBuildingExpansion';
import { BUILDINGS, MAX_LEVEL, MAP, build, canPlace, cityStats, getBuilding, levelForXp, move, newCity, parseCity, upgrade, type CityState } from '../services/cityGameService';
import { bake, buildModel, hasModel, type ModelContext } from '../components/city3d/models';

const now = Date.UTC(2026, 9, 31, 12), today = '2026-10-31';
const richCity = (): CityState => ({ ...newCity(now, today), coins: 1000000, xp: 100000, chunks: Array.from({ length: 100 }, (_, i) => i) });
test('120 new stable, unique types span 12 complete categories with usable progression', () => {
  assert.equal(EXPANSION_BUILDINGS.length, 120);
  assert.equal(EXPANSION_CATEGORIES.length, 12);
  assert.equal(new Set(BUILDINGS.map(t => t.id)).size, BUILDINGS.length);
  assert.equal(new Set(BUILDINGS.map(t => t.name)).size, BUILDINGS.length);
  for (const c of EXPANSION_CATEGORIES) assert.equal(EXPANSION_BUILDINGS.filter(b => b.category === c.id).length, 10);
  for (const b of EXPANSION_BUILDINGS) {
    assert.ok(b.unlock >= 1 && b.unlock <= MAX_LEVEL);
    assert.ok(b.cost > 0 && Number.isInteger(b.cost));
    assert.ok(b.description && b.icon && b.appearance);
    assert.ok(hasModel(b.id), b.id);
  }
  assert.equal(BUILDINGS[0].id, 'cottage', 'keep the original catalogue ordering');
});

test('all new types place, upgrade, move and survive saved-city parsing', () => {
  for (const type of EXPANSION_BUILDINGS) {
    const city = richCity();
    let spot: { x: number; z: number } | undefined;
    for (let z = 1; z < MAP - type.size && !spot; z++) for (let x = 1; x < MAP - type.size; x++) {
      if (canPlace(city, type.id, x, z).ok) { spot = { x, z }; break; }
    }
    assert.ok(spot, `find a placement for ${type.id}`);
    const result = build(city, type.id, spot.x, spot.z, now, today, `test-${type.id}`);
    assert.equal(result.error, undefined, type.id);
    let built = result.state!;
    const restored = parseCity(JSON.stringify(built))!;
    assert.equal(restored.buildings[0]?.type, type.id);
    for (let level = 2; level <= 3; level++) {
      const next = upgrade(built, `test-${type.id}`, now, today);
      assert.equal(next.error, undefined, type.id); built = next.state!;
      assert.equal(built.buildings[0].level, level);
    }
    assert.equal(move(built, `test-${type.id}`, spot.x, spot.z, now, today).error, undefined);
    assert.equal(Number.isFinite(cityStats(built, now).incomePerHour), true);
  }
});

test('harbours and fisheries enforce coastlines; level locks still apply', () => {
  const city = richCity();
  assert.match(canPlace(city, 'harbourmaster', 44, 52).reason!, /water/);
  assert.match(canPlace(city, 'fishingjetty', 44, 52).reason!, /water/);
  assert.equal(canPlace(city, 'baitshop', 44, 52).ok, true);
  assert.match(build(newCity(now, today), 'metropolisspire', 44, 52, now, today, 'locked').error!, /level/);
  assert.equal(levelForXp(city.xp), MAX_LEVEL);
});

test('high-rise homes add residents and utility providers contribute supply', () => {
  const city = richCity();
  const placed = build(city, 'loftblock', 44, 52, now, today, 'homes').state!;
  assert.equal(cityStats(placed, now).residents, getBuilding('loftblock')!.residents);
  const power = build(city, 'solarcanopy', 44, 52, now, today, 'solar').state!;
  assert.ok(cityStats(power, now).power.supply > cityStats(city, now).power.supply);
});

test('360 upgrade models bake into finite geometry within their advertised footprint', () => {
  assert.deepEqual(Object.keys(BUILDING_RECIPES).sort(), EXPANSION_BUILDINGS.map(t => t.id).sort());
  const materials: THREE.Material[] = [];
  const context: ModelContext = {
    std: (color, extra) => { const m = new THREE.MeshStandardMaterial({ color, ...extra }); materials.push(m); return m; },
    facade: style => { const m = new THREE.MeshStandardMaterial({ color: style.wall }); materials.push(m); return m; },
    textures: {} as ModelContext['textures'],
  };
  for (const type of EXPANSION_BUILDINGS) for (let level = 1; level <= 3; level++) {
    const model = buildModel(type.id, context, level, type.size);
    const bounds = new THREE.Box3().setFromObject(model, true);
    assert.ok(Number.isFinite(bounds.max.y) && bounds.max.y > 0, type.id);
    assert.ok(bounds.min.x >= -type.size / 2 - 0.01 && bounds.max.x <= type.size / 2 + 0.01, `${type.id}: x footprint`);
    assert.ok(bounds.min.z >= -type.size / 2 - 0.01 && bounds.max.z <= type.size / 2 + 0.01, `${type.id} level ${level}: z footprint ${bounds.min.z} to ${bounds.max.z}`);
    const prefab = bake(model);
    assert.ok(prefab.parts.length > 0);
    for (const part of prefab.parts) {
      assert.ok(Array.from(part.geometry.getAttribute('position').array).every(Number.isFinite), type.id);
      part.geometry.dispose();
    }
    model.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }
  materials.forEach(m => m.dispose());
});

test('all 120 buildings have different geometry, independently of colour and facade textures', () => {
  const material = new THREE.MeshStandardMaterial();
  const context: ModelContext = { std: () => material, facade: () => material, textures: {} as ModelContext['textures'] };
  const fingerprints = new Map<string, string>();
  for (const type of EXPANSION_BUILDINGS) {
    const model = buildModel(type.id, context, 1, type.size); model.updateMatrixWorld(true);
    const parts: string[] = [];
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const positions = object.geometry.getAttribute('position'); const point = new THREE.Vector3();
      const vertices: string[] = [];
      for (let i = 0; i < positions.count; i++) { point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).divideScalar(type.size); vertices.push(`${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`); }
      parts.push(vertices.sort().join(';')); object.geometry.dispose();
    });
    const fingerprint = createHash('sha256').update(parts.sort().join('|')).digest('hex');
    assert.equal(fingerprints.has(fingerprint), false, `${type.id} duplicates ${fingerprints.get(fingerprint)}`);
    fingerprints.set(fingerprint, type.id);
  }
  material.dispose();
});
