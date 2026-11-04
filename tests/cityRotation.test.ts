import test from 'node:test';
import assert from 'node:assert/strict';
import { build, doorTile, frontQuarter, move, newCity, parseCity, rotate, tileIndex, type CityState } from '../services/cityGameService';

const T0 = 0, TODAY = '2026-11-05';
const ok = (result: { state?: CityState; error?: string }) => { assert.equal(result.error, undefined); return result.state!; };
const city = (): CityState => ({ ...newCity(T0, TODAY), coins: 100_000, xp: 100_000 });
// A cottage just south of the starter avenue (z 51): its road is to the north.
const SPOT = { x: 44, z: 52 };

test('a building faces its road until turned, and each turn is a quarter clockwise', () => {
  let state = ok(build(city(), 'cottage', SPOT.x, SPOT.z, T0, TODAY, 'c'));
  const roads = new Set(state.roads), building = () => state.buildings[0];
  assert.equal(building().rotation, undefined);
  assert.equal(frontQuarter(roads, building(), 1), 2, 'faces north, onto the avenue');
  state = ok(rotate(state, 'c', T0, TODAY));
  assert.equal(building().rotation, 3);
  for (const expected of [0, 1, 2]) { state = ok(rotate(state, 'c', T0, TODAY)); assert.equal(building().rotation, expected); }
  // Turned away from the road, its door still opens onto the road beside it.
  state = { ...state, buildings: [{ ...building(), rotation: 0 }] };
  assert.equal(doorTile(roads, building(), 1), tileIndex(44, 51));
});

test('buildings can be placed and moved already turned, and keep their turn in a save', () => {
  let state = ok(build(city(), 'cafe', SPOT.x, SPOT.z, T0, TODAY, 'cafe', 1));
  assert.equal(state.buildings[0].rotation, 1);
  state = ok(move(state, 'cafe', 46, 52, T0, TODAY, 3));
  assert.deepEqual([state.buildings[0].x, state.buildings[0].rotation], [46, 3]);
  state = ok(move(state, 'cafe', 47, 52, T0, TODAY));
  assert.equal(state.buildings[0].rotation, 3, 'moving without turning keeps the turn');
  const saved = JSON.parse(JSON.stringify(state));
  assert.equal(parseCity(JSON.stringify(saved))!.buildings[0].rotation, 3);
  saved.buildings[0].rotation = 7;
  assert.equal(parseCity(JSON.stringify(saved))!.buildings[0].rotation, undefined, 'a bad turn is dropped');
  assert.equal(build(city(), 'cafe', SPOT.x, SPOT.z, T0, TODAY, 'x', 9).state!.buildings[0].rotation, undefined);
});
