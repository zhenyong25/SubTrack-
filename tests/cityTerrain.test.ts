import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIDGE_COST, CHUNK, CHUNKS, MAP, ROAD_KINDS, START_CHUNKS, build, buildRoads, canPlace, elevationAt, isSteep, newCity, planRoads, terrainAt, terrainMap, tileIndex, type CityState,
} from '../services/cityGameService';
import { groundAt, terrainHeights } from '../components/city3d/terrainShape';

// The island as it was before the mountains and the outer islands, to prove no saved tile changed.
const hash = (x: number, z: number) => { let h = Math.imul(x * 374761393 + z * 668265263, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const smooth = (t: number) => t * t * (3 - 2 * t);
const noise = (x: number, z: number) => { const x0 = Math.floor(x), z0 = Math.floor(z), tx = smooth(x - x0), tz = smooth(z - z0), a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1); return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz; };
const fbm = (x: number, z: number) => noise(x / 14, z / 14) * 0.6 + noise(x / 6, z / 6) * 0.3 + noise(x / 3, z / 3) * 0.1;
const before = (x: number, z: number) => {
  const d = Math.hypot(x + 0.5 - 50, z + 0.5 - 50) / 50, shore = 0.82 + (fbm(x, z) - 0.5) * 0.28, riverX = 27 + Math.sin(z / 9) * 5 + Math.sin(z / 23) * 4;
  const river = Math.abs(x - riverX) < 1.6 && z > 8 && z < 94, lake = Math.hypot(x - 73, z - 28) < 6.5 + (fbm(x + 40, z) - 0.5) * 3, start = Math.abs(x + 0.5 - 50) < 13 && Math.abs(z + 0.5 - 50) < 13;
  let t = d > shore || river || lake ? 'water' : d > shore - 0.035 ? 'sand' : 'grass';
  if (!start && t === 'grass' && (Math.abs(x - riverX) < 2.6 || Math.hypot(x - 73, z - 28) < 8)) t = 'sand';
  return start ? 'grass' : t;
};
const T0 = 0, TODAY = '2026-11-04';
const rich = (): CityState => ({ ...newCity(T0, TODAY), coins: 1_000_000, xp: 1_000_000, chunks: Array.from({ length: CHUNKS * CHUNKS }, (_, i) => i) });

test('every tile of the old island is unchanged; new land only replaces open sea', () => {
  let added = 0;
  for (let z = 0; z < MAP; z++) for (let x = 0; x < MAP; x++) {
    const old = before(x, z), now = terrainAt(x, z);
    if (old !== 'water') assert.equal(now, old, `${x},${z}`); else if (now !== 'water') added++;
  }
  assert.ok(added > 250, `two islands' worth of new land (${added} tiles)`);
});

test('the two new islands are across the water, but their plots can be bought one step at a time', () => {
  const land = (x: number, z: number) => terrainAt(x, z) !== 'water';
  // Walk the main island's land from the Town Hall: it never reaches the islands without a bridge.
  const seen = new Set([tileIndex(50, 50)]), queue = [[50, 50]];
  while (queue.length) { const [x, z] = queue.pop()!; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, i = tileIndex(nx, nz); if (nx >= 0 && nz >= 0 && nx < MAP && nz < MAP && !seen.has(i) && land(nx, nz)) { seen.add(i); queue.push([nx, nz]); } } }
  for (const [x, z] of [[88, 10], [11, 89]]) { assert.ok(land(x, z), `island at ${x},${z}`); assert.equal(seen.has(tileIndex(x, z)), false, `${x},${z} is a separate island`); }
  const hasLand = (c: number) => { const cx = c % CHUNKS, cz = Math.floor(c / CHUNKS); for (let z = cz * CHUNK; z < cz * CHUNK + CHUNK; z++) for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) if (land(x, z)) return true; return false; };
  const plots = new Set(START_CHUNKS), next = [...START_CHUNKS];
  while (next.length) { const c = next.pop()!, cx = c % CHUNKS, cz = Math.floor(c / CHUNKS); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, nz = cz + dz, n = nz * CHUNKS + nx; if (nx >= 0 && nz >= 0 && nx < CHUNKS && nz < CHUNKS && !plots.has(n) && hasLand(n)) { plots.add(n); next.push(n); } } }
  assert.ok(plots.has(8) && plots.has(91), 'island plots are buyable');
});

test('mountains rise either side of the river valley; the first plots stay level', () => {
  let peak = 0;
  for (let z = 0; z <= MAP; z++) for (let x = 0; x <= MAP; x++) peak = Math.max(peak, elevationAt(x, z));
  assert.ok(peak > 3, `peaks reach ${peak.toFixed(1)}`);
  for (let z = 37; z <= 63; z++) for (let x = 37; x <= 63; x++) assert.equal(elevationAt(x, z), 0);
  // The valley floor along the river is low, the ridges beside it high.
  const riverX = 27 + Math.sin(25 / 9) * 5 + Math.sin(25 / 23) * 4;
  assert.ok(elevationAt(riverX + 0.5, 25.5) < 0.05);
  assert.ok(Math.max(...[-9, -10, 9, 10].map(dx => elevationAt(riverX + dx, 25.5))) > 1.5);
  assert.ok(elevationAt(88, 10) > 2, 'the volcano island');
});

test('mountains cannot be built on or crossed by roads; water can be bridged', () => {
  const city = rich();
  let steep: [number, number] | null = null;
  for (let z = 0; z < MAP && !steep; z++) for (let x = 0; x < MAP; x++) if (terrainAt(x, z) !== 'water' && isSteep(x, z)) { steep = [x, z]; break; }
  assert.ok(steep);
  assert.match(canPlace(city, 'cottage', steep![0], steep![1]).reason!, /steep/i);
  assert.equal(planRoads(city, [tileIndex(...steep!)]).fresh.length, 0);
  // A bridge off the main island's east coast, from the plot there out over the sea.
  const sea = [tileIndex(93, 50), tileIndex(94, 50)];
  assert.ok(sea.every(i => terrainAt(i % MAP, Math.floor(i / MAP)) === 'water'));
  assert.equal(planRoads({ ...city, chunks: [...START_CHUNKS] }, sea).fresh.length, 0, 'not from plots far away');
  const plan = planRoads({ ...city, chunks: [...START_CHUNKS, 58] }, sea);
  assert.equal(plan.fresh.length, 2, 'water beside your plot can be bridged');
  assert.equal(plan.cost, 2 * (ROAD_KINDS.street.cost + BRIDGE_COST));
  assert.equal(buildRoads(city, sea, T0, TODAY).error, undefined);
});

test('the ground is level under everything built, even where the mountains are', () => {
  let steep: [number, number] | null = null;
  for (let z = 0; z < MAP && !steep; z++) for (let x = 0; x < MAP; x++) if (terrainAt(x, z) !== 'water' && elevationAt(x + 0.5, z + 0.5) > 1.5) { steep = [x, z]; break; }
  const [x, z] = steep!;
  const open = terrainHeights(terrainMap(), new Set()), built = terrainHeights(terrainMap(), new Set([tileIndex(x, z)]));
  assert.ok(groundAt(open, x + 0.5, z + 0.5) > 1);
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) assert.equal(built[(z + dz) * (MAP + 1) + x + dx], 0);
  // A city on the start plots looks just as before.
  const city = build(rich(), 'cottage', 52, 52, T0, TODAY, 'c');
  assert.equal(city.error, undefined);
});
