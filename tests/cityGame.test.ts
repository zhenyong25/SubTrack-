import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_DONE_BONUS, CHUNKS, HALL, INCOME_CAP_HOURS, LIGHT_COST, LIGHT_REFUND, MAP, ROAD_COST, ROAD_REFUND, STARTING_COINS, START_CHUNKS, TIMBER_COINS,
  addLights, build, buildRoads, buyChunk, clearTrees, household, staffRoster, canPlace, chunkAvailable, chunkCost, cityFromWorld, cityStats, claimMission, claimWeekly, collect,
  dailyMissions, demolish, demolishRefund, financeActivity, hasRoadAccess, levelForXp, levelProgress, maxChunks, move, newCity, newerCity,
  parseCity, pendingAt, planRoads, removeLight, removeRoad, treesAt, wildTrees, roadPath, starterRoads, terrainAt, terrainMap, tileIndex, upgrade, upgradeCost, type CityState,
} from '../services/cityGameService';

const HOUR = 3600000;
const T0 = Date.UTC(2026, 9, 28, 1);
const TODAY = '2026-10-28';
const ok = (result: { state?: CityState; error?: string }) => { assert.equal(result.error, undefined); return result.state!; };
// Beside the starter avenue (z = 51 is road), on the south side.
const SPOT = { x: 44, z: 52 };

test('the map: 100×100 with water, a guaranteed solid start, and the same for everyone', () => {
  const tiles = terrainMap();
  assert.equal(tiles.length, MAP * MAP);
  assert.equal(terrainAt(0, 0), 'water'); // the open sea at the corners
  assert.equal(terrainAt(-1, 5), 'water');
  for (let x = 40; x < 60; x += 1) for (let z = 40; z < 60; z += 1) assert.equal(terrainAt(x, z), 'grass');
  const water = tiles.filter(t => t === 'water').length;
  assert.ok(water > 1500 && water < 6000, `${water} water tiles`);
  assert.equal(terrainMap(), tiles);
});

test('a new city owns the centre plots and has a starter street grid around the hall', () => {
  const city = newCity(T0, TODAY);
  assert.equal(city.coins, STARTING_COINS);
  assert.deepEqual(city.chunks, START_CHUNKS);
  assert.ok(city.roads.includes(tileIndex(SPOT.x, 51)));
  assert.equal(city.roads.includes(tileIndex(HALL.x, HALL.z)), false);
  assert.equal(hasRoadAccess(new Set(starterRoads()), HALL.x, HALL.z, HALL.size), true);
});

test('building needs owned, dry, free land - and works only beside a road', () => {
  let city = newCity(T0, TODAY);
  city = ok(build(city, 'cottage', SPOT.x, SPOT.z, T0, TODAY, 'c1'));
  assert.equal(city.coins, STARTING_COINS - 40);
  assert.equal(city.xp, 10);
  assert.equal(city.daily.built, true);
  assert.match(build(city, 'cafe', SPOT.x, SPOT.z, T0, TODAY, 'x').error!, /taken/);
  assert.match(build(city, 'cafe', SPOT.x, 51, T0, TODAY, 'x').error!, /road/);
  assert.match(build(city, 'cafe', 30, 52, T0, TODAY, 'x').error!, /own/);
  assert.match(build(city, 'bank', 45, 53, T0, TODAY, 'x').error!, /level 9/);
  assert.match(build({ ...city, coins: 10 }, 'cafe', 45, 52, T0, TODAY, 'x').error!, /50 more coins/);
  // A 2×2 needs all four tiles free.
  assert.match(canPlace(city, 'powerplant', SPOT.x - 1, SPOT.z).reason!, /taken/);

  const away = ok(build(city, 'cafe', 44, 55, T0, TODAY, 'far')); // two tiles from any road
  const stats = cityStats(away, T0);
  assert.equal(stats.noRoad, 1);
  assert.equal(stats.status.get('far')!.rate, 0);
  assert.equal(stats.status.get('c1')!.road, true);
});

test('roads: an L-shaped path, priced per new tile, blocked by water, buildings and unowned land', () => {
  assert.deepEqual(roadPath({ x: 1, z: 1 }, { x: 3, z: 2 }), [tileIndex(1, 1), tileIndex(2, 1), tileIndex(3, 1), tileIndex(3, 2)]);
  let city = ok(build(newCity(T0, TODAY), 'cottage', SPOT.x, SPOT.z, T0, TODAY, 'c'));
  const plan = planRoads(city, roadPath({ x: 42, z: 52 }, { x: 46, z: 52 }));
  assert.equal(plan.blocked, 1); // the cottage
  assert.equal(plan.cost, plan.fresh.length * ROAD_COST);
  const coins = city.coins;
  city = ok(buildRoads(city, roadPath({ x: 42, z: 53 }, { x: 42, z: 56 }), T0, TODAY));
  assert.equal(city.coins, coins - 4 * ROAD_COST);
  assert.match(buildRoads(city, [tileIndex(42, 53)], T0, TODAY).error!, /already/);
  assert.match(buildRoads(city, [tileIndex(10, 10)], T0, TODAY).error!, /empty land you own/);
  city = ok(removeRoad(city, tileIndex(42, 56), T0, TODAY));
  assert.equal(city.roads.includes(tileIndex(42, 56)), false);
});

test('power and water: shortages slow everything that needs them', () => {
  let city = { ...newCity(T0, TODAY), coins: 5000, xp: 400 };
  // Eleven cottages need 11 power and 11 water; the hall supplies 10 of each.
  [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 52].forEach((x, i) => { city = ok(build(city, 'cottage', x, 52, T0, TODAY, `h${i}`)); }); // x = 51 is the avenue
  let stats = cityStats(city, T0);
  assert.deepEqual(stats.power, { supply: 10, demand: 11 });
  assert.ok(stats.status.get('h0')!.serviced < 1);
  city = ok(build(city, 'watertower', 41, 50, T0, TODAY, 'w'));
  city = ok(build(city, 'powerplant', 42, 49, T0, TODAY, 'p'));
  stats = cityStats(city, T0);
  assert.ok(stats.power.supply >= stats.power.demand);
  assert.equal(stats.status.get('h0')!.serviced, 1);
});

test('shops need workers, greenery cheers people up, income fills to a cap', () => {
  let city = ok(build({ ...newCity(T0, TODAY), coins: 1000 }, 'cafe', SPOT.x, SPOT.z, T0, TODAY, 'cafe'));
  const empty = cityStats(city, T0);
  assert.equal(empty.residents, 0); // nobody lives in a café or the hall
  assert.equal(empty.staffing, 0);
  assert.equal(empty.status.get('cafe')!.rate, 0);
  city = ok(build(city, 'cottage', SPOT.x + 1, SPOT.z, T0, TODAY, 'home'));
  const thin = cityStats(city, T0);
  assert.equal(thin.residents, 6);
  assert.equal(thin.jobs, 4);
  assert.equal(thin.staffing, 1);
  city = ok(build(city, 'tree', 44, 56, T0, TODAY, 'tree')); // trees don't need a road
  const before = thin.happiness;
  assert.equal(cityStats(city, T0).happiness, before + 2);
  const rate = cityStats(city, T0).status.get('cafe')!.rate;
  assert.ok(Math.abs(pendingAt(city, 'cafe', T0 + 2 * HOUR) - 2 * rate) < 1e-6);
  assert.ok(Math.abs(pendingAt(city, 'cafe', T0 + 30 * HOUR) - INCOME_CAP_HOURS * rate) < 1e-6);
});

test('collecting takes whole coins and keeps the fraction filling', () => {
  let city = ok(build(newCity(T0, TODAY), 'cafe', SPOT.x, SPOT.z, T0, TODAY, 'cafe'));
  city = ok(build(city, 'cottage', SPOT.x + 1, SPOT.z, T0, TODAY, 'home'));
  city = { ...city, coins: 0 };
  const waiting = pendingAt(city, 'cafe', T0 + HOUR);
  const { state, coins } = collect(city, T0 + HOUR, TODAY, 'cafe');
  assert.equal(coins, Math.floor(waiting));
  assert.ok(Math.abs(pendingAt(state, 'cafe', T0 + HOUR) - (waiting - coins)) < 1e-6);
  assert.equal(state.daily.collected, true);
  assert.equal(collect(state, T0 + HOUR, TODAY, 'cafe').coins, 0);
  const everything = collect(city, T0 + 3 * HOUR, TODAY);
  assert.equal(everything.coins, ['hall', 'cafe', 'home'].reduce((sum, id) => sum + Math.floor(pendingAt(city, id, T0 + 3 * HOUR)), 0));
});

test('upgrades, moving and removing', () => {
  let city = ok(build({ ...newCity(T0, TODAY), coins: 1000 }, 'cottage', SPOT.x, SPOT.z, T0, TODAY, 'c'));
  assert.equal(upgradeCost(city.buildings[0]), 60);
  city = ok(upgrade(city, 'c', T0, TODAY));
  city = ok(upgrade(city, 'c', T0, TODAY));
  assert.equal(upgradeCost(city.buildings[0]), null);
  city = ok(move(city, 'c', 46, 52, T0, TODAY));
  assert.deepEqual([city.buildings[0].x, city.buildings[0].z], [46, 52]);
  assert.match(move(city, 'c', 46, 51, T0, TODAY).error!, /road/);
  assert.equal(demolishRefund(city.buildings[0]), 100);
  const coins = city.coins;
  city = ok(demolish(city, 'c', T0, TODAY));
  assert.equal(city.coins, coins + 100);
});

test('land: buy plots next to yours, priced up each time, limited by level', () => {
  let city = { ...newCity(T0, TODAY), coins: 100000 };
  assert.equal(chunkAvailable(city, 43), true); // west of 44
  assert.equal(chunkAvailable(city, 0), false); // not adjacent (and all sea)
  assert.equal(chunkAvailable(city, 44), false); // already owned
  assert.equal(chunkCost(city), 250);
  assert.match(buyChunk(city, 43, T0, TODAY).error!, /level 2/);
  city = { ...city, xp: 80 }; // level 2 allows 7 plots
  assert.equal(maxChunks(2), 7);
  city = ok(buyChunk(city, 43, T0, TODAY));
  assert.equal(city.coins, 100000 - 250);
  assert.equal(chunkCost(city), Math.round(250 * 1.35));
  assert.equal(build(city, 'cottage', 35, 45, T0, TODAY, 'west').error, undefined); // inside plot 43: x 30-39, z 40-49
  assert.ok(CHUNKS * CHUNKS === 100);
});

test('daily missions follow real records, are claimed once, and reset the next day', () => {
  const activity = financeActivity(
    [{ expenseDate: '2026-10-28T09:00:00' }, { expenseDate: '2026-10-27' }] as any,
    [{ incomeDate: '2026-10-28', firstIncomeDate: '2026-01-01' }] as any,
    [{ direction: 'Withdrawal', amount: 10, entryDate: '2026-10-28' }] as any,
    TODAY,
  );
  assert.deepEqual(activity, { expensesToday: 1, incomeToday: true, savedToday: false });
  let city = newCity(T0, TODAY);
  const missions = dailyMissions(city, activity, TODAY);
  assert.deepEqual(missions.slice(0, 2).map(mission => mission.id), ['checkin', 'log1']);
  city = ok(claimMission(city, missions, 'checkin', T0, TODAY));
  assert.equal(city.coins, STARTING_COINS + 30);
  assert.match(claimMission(city, dailyMissions(city, activity, TODAY), 'checkin', T0, TODAY).error!, /Already/);
  assert.match(claimMission(city, missions, 'bonus', T0, TODAY).error!, /every mission/);
  assert.equal(dailyMissions(city, activity, '2026-10-29').find(m => m.id === 'checkin')!.claimed, false);
});

test('finishing every daily mission opens the bonus', () => {
  let city = newCity(T0, TODAY);
  const activity = { expensesToday: 5, incomeToday: true, savedToday: true };
  city = ok(buildRoads(city, [tileIndex(42, 53)], T0, TODAY)); // counts as building
  city = collect(city, T0 + HOUR, TODAY).state;
  for (const mission of dailyMissions(city, activity, TODAY)) city = ok(claimMission(city, dailyMissions(city, activity, TODAY), mission.id, T0, TODAY));
  const before = city.coins;
  city = ok(claimMission(city, dailyMissions(city, activity, TODAY), 'bonus', T0, TODAY));
  assert.equal(city.coins, before + ALL_DONE_BONUS.coins);
});

test('weekly quests pay once per week; levels from XP', () => {
  let city = newCity(T0, TODAY);
  city = ok(claimWeekly(city, 'record', true, T0, TODAY));
  assert.match(claimWeekly(city, 'record', true, T0, '2026-11-01').error!, /Already/);
  assert.equal(claimWeekly(city, 'record', true, T0, '2026-11-02').error, undefined);
  assert.equal(levelForXp(79), 1);
  assert.equal(levelForXp(80), 2);
  assert.deepEqual(levelProgress(140), { level: 2, current: 60, needed: 120, ratio: 0.5 });
  assert.equal(levelForXp(99999), 15);
});

test('saves round-trip; old small-island cities are refunded onto the new map', () => {
  const city = ok(build(newCity(T0, TODAY), 'cottage', SPOT.x, SPOT.z, T0, TODAY, 'c'));
  // Compared as stored (JSON), so optional fields that come back undefined don't matter.
  assert.deepEqual(JSON.parse(JSON.stringify(parseCity(JSON.stringify(city)))), JSON.parse(JSON.stringify(city)));
  assert.throws(() => parseCity(JSON.stringify({ version: 3 })), /could not be read/);
  const v1 = { version: 1, coins: 100, xp: 500, buildings: [{ id: 'a', type: 'cafe', x: 5, z: 5, level: 2, collectedAt: T0 }], hallCollectedAt: T0, daily: { day: TODAY, claimed: ['checkin'], collected: false, built: false }, weekly: [], lifetimeCoins: 900, updatedAt: T0 };
  const migrated = parseCity(JSON.stringify(v1))!;
  assert.equal(migrated.version, 2);
  assert.equal(migrated.coins, 100 + 60 + 90); // café plus its upgrade, refunded
  assert.equal(migrated.xp, 500);
  assert.deepEqual(migrated.buildings, []);
  assert.deepEqual(migrated.daily.claimed, ['checkin']);
  assert.ok(migrated.roads.length > 0);
  const later = { ...city, updatedAt: city.updatedAt + 1 };
  assert.equal(newerCity(city, later), later);
});

test('island progress carries over', () => {
  const island = JSON.stringify({ receipts: [{ week: '2026-10-19', quest: 'record' }, { week: '2026-10-26', quest: 'save' }], decorations: ['garden'] });
  const city = cityFromWorld(island, T0, TODAY);
  assert.equal(city.coins, STARTING_COINS + 45);
  assert.equal(city.xp, 90);
  assert.equal(city.weekly.length, 2);
});

test('residents are proportional to the homes built, even without roads or utilities', () => {
  let city = { ...newCity(T0, TODAY), coins: 10000, xp: 400 };
  assert.equal(cityStats(city, T0).residents, 0);
  city = ok(build(city, 'cottage', 44, 52, T0, TODAY, 'a'));
  assert.equal(cityStats(city, T0).residents, 6);
  city = ok(build(city, 'townhouse', 45, 52, T0, TODAY, 'b'));
  assert.equal(cityStats(city, T0).residents, 20);
  // Far from any road: still home to 6 people, but they're unhappy and it earns nothing.
  const before = cityStats(city, T0).happiness;
  city = ok(build(city, 'cottage', 44, 55, T0, TODAY, 'c'));
  const stats = cityStats(city, T0);
  assert.equal(stats.residents, 26);
  assert.equal(stats.happiness, before - 3);
  assert.equal(stats.status.get('c')!.rate, 0);
  // Upgrades scale with the level multiplier.
  city = ok(upgrade(city, 'a', T0, TODAY));
  assert.equal(cityStats(city, T0).residents, 26 - 6 + Math.round(6 * 1.7));
});

test('wild trees: cleared for timber, and cleared when built over', () => {
  let city = newCity(T0, TODAY);
  let spot: { x: number; z: number } | undefined;
  for (let x = 40; x < 60 && !spot; x += 1) for (let z = 40; z < 60 && !spot; z += 1) if (treesAt(city, x, z) > 0 && !city.roads.includes(tileIndex(x, z))) spot = { x, z };
  assert.ok(spot, 'the starting land has some trees');
  const count = treesAt(city, spot!.x, spot!.z);
  city = ok(clearTrees(city, spot!.x, spot!.z, T0, TODAY));
  assert.equal(city.coins, STARTING_COINS + count * TIMBER_COINS);
  assert.equal(treesAt(city, spot!.x, spot!.z), 0);
  assert.match(clearTrees(city, spot!.x, spot!.z, T0, TODAY).error!, /No trees/);
  assert.match(clearTrees(city, 5, 50, T0, TODAY).error!, /own/);
  assert.equal(wildTrees(0, 0), 0); // water

  // Building on a tree tile clears it and pays for the timber too.
  let treeTile: { x: number; z: number } | undefined;
  for (let x = 40; x < 60 && !treeTile; x += 1) for (let z = 40; z < 60 && !treeTile; z += 1) if (treesAt(city, x, z) > 0 && canPlace(city, 'tree', x, z).ok) treeTile = { x, z };
  const trees = treesAt(city, treeTile!.x, treeTile!.z);
  const coins = city.coins;
  city = ok(build(city, 'tree', treeTile!.x, treeTile!.z, T0, TODAY, 'grove'));
  assert.equal(city.coins, coins - 15 + trees * TIMBER_COINS);
  assert.ok(city.cleared.includes(tileIndex(treeTile!.x, treeTile!.z)));
});

test('street lights go on roads, cheer people up, and come down with their road', () => {
  let city = { ...newCity(T0, TODAY), coins: 1000 };
  const street = [41, 42, 43, 44, 45, 46, 47, 48].map(x => tileIndex(x, 51));
  const before = cityStats(city, T0).happiness;
  city = ok(addLights(city, [...street, tileIndex(44, 53)], T0, TODAY)); // the last one isn't a road
  assert.equal(city.lights.length, 8);
  assert.equal(city.coins, 1000 - 8 * LIGHT_COST);
  assert.equal(cityStats(city, T0).happiness, before + 2);
  assert.match(addLights(city, street, T0, TODAY).error!, /already lit/);
  assert.match(addLights(city, [tileIndex(44, 53)], T0, TODAY).error!, /along roads/);
  city = ok(removeLight(city, street[0], T0, TODAY));
  assert.equal(city.lights.length, 7);
  const coins = city.coins;
  city = ok(removeRoad(city, street[1], T0, TODAY));
  assert.equal(city.lights.includes(street[1]), false);
  assert.equal(city.coins, coins + ROAD_REFUND + LIGHT_REFUND);
  assert.deepEqual(parseCity(JSON.stringify(city))!.lights, city.lights);
});

test('jobs are filled by named people from the homes, and each home has a household', () => {
  let city = { ...newCity(T0, TODAY), coins: 5000, xp: 400 };
  city = ok(build(city, 'cafe', 44, 52, T0, TODAY, 'cafe'));
  city = ok(build(city, 'cottage', 45, 52, T0, TODAY, 'home'));
  let stats = cityStats(city, T0);
  assert.deepEqual([stats.status.get('cafe')!.staff, stats.status.get('cafe')!.jobs], [4, 4]);
  assert.equal(stats.status.get('home')!.residents, 6);
  // Two cafés need 8 workers; 6 residents fill three quarters of each.
  city = ok(build(city, 'cafe', 46, 52, T0, TODAY, 'cafe2'));
  stats = cityStats(city, T0);
  assert.equal(stats.status.get('cafe')!.staff, 3);
  assert.equal(stats.status.get('cafe2')!.staff, 3);
  const staff = staffRoster('cafe', 'cafe', 4);
  assert.equal(staff.length, 4);
  assert.deepEqual(staffRoster('cafe', 'cafe', 4), staff); // the same people every time
  assert.ok(staff.every(person => /^\S.* \S+$/.test(person.name) && ['Barista', 'Waiter', 'Cook', 'Café manager'].includes(person.role)));
  assert.equal(staff[0].role, 'Café manager');
  assert.notDeepEqual(staffRoster('other', 'cafe', 4).map(p => p.name), staff.map(p => p.name));
  const family = household('home', 6);
  assert.equal(family.length, 6);
  assert.equal(new Set(family.map(name => name.split(' ').at(-1))).size, 1); // one family name
});

test('people and cars stand on the road surfaces, not sunk into them', async () => {
  const { surfaceHeight, PAVEMENT_SURFACE, ROAD_SURFACE } = await import('../components/city3d/traffic');
  // A road running east-west through tiles (10..12, 20): pavement on its north and south edges,
  // and across the dead end at x = 12.
  const roads = new Set([tileIndex(10, 20), tileIndex(11, 20), tileIndex(12, 20)]);
  const at = (tx: number, tz: number, dx: number, dz: number) => surfaceHeight(roads, tx - 50 + 0.5 + dx, tz - 50 + 0.5 + dz);
  assert.equal(at(11, 20, 0, 0), ROAD_SURFACE); // the carriageway
  assert.equal(at(11, 20, 0, 0.4), PAVEMENT_SURFACE); // south pavement
  assert.equal(at(11, 20, 0, -0.4), PAVEMENT_SURFACE); // north pavement
  assert.equal(at(11, 20, 0.45, 0), ROAD_SURFACE); // the road carries on east - no kerb
  assert.equal(at(12, 20, 0.45, 0), PAVEMENT_SURFACE); // the dead end's kerb
  assert.equal(at(30, 30, 0, 0), 0); // grass
});

test('the people on the streets are exactly the residents without a job', async () => {
  const THREE = await import('three');
  const { Pedestrians } = await import('../components/city3d/people');
  const scene = new THREE.Scene();
  const toWorld = (index: number) => new THREE.Vector3((index % 100) - 49.5, 0, Math.floor(index / 100) - 49.5);
  const people = new Pedestrians(scene, 4000, toWorld, new THREE.Vector3());
  const roads = new Set([tileIndex(40, 51), tileIndex(41, 51), tileIndex(42, 51), tileIndex(43, 51)]);
  people.setRoads(roads);
  people.setCity(
    [{ id: 'a', residents: 6, door: tileIndex(41, 51) }, { id: 'b', residents: 10, door: tileIndex(42, 51) }],
    [{ id: 'cafe', staff: 4 }, { id: 'shop', staff: 6 }],
  );
  const camera = new THREE.PerspectiveCamera();
  const drawn = () => {
    const meshes = scene.children.filter((child): child is InstanceType<typeof THREE.InstancedMesh> => child instanceof THREE.InstancedMesh);
    // One torso per nearby figure plus one body per distant one.
    return meshes.filter(mesh => mesh.geometry.type === 'LatheGeometry' && (mesh.geometry as any).parameters.points.length === 8).reduce((sum, mesh) => sum + mesh.count, 0)
      + meshes.filter(mesh => mesh.geometry.type === 'CapsuleGeometry' && (mesh.geometry as any).parameters.length === 0.22).reduce((sum, mesh) => sum + mesh.count, 0);
  };
  camera.position.set(0, 2, 0);
  people.update(0.1, 1000, true, camera);
  assert.equal(drawn(), 6); // 16 residents, 10 at work
  camera.position.set(-8, 2, 1.5); // close up: the detailed figures, same count
  people.update(0.1, 2000, true, camera);
  assert.equal(drawn(), 6);
  people.setCity([{ id: 'a', residents: 6, door: tileIndex(41, 51) }, { id: 'b', residents: 10, door: tileIndex(42, 51) }], [{ id: 'cafe', staff: 4 }]);
  people.update(0.1, 3000, true, camera);
  assert.equal(drawn(), 12); // the shop closed: its 6 staff are out walking
  people.dispose();
});
