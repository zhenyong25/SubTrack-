import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLights, build, cityStats, claimMission, collect, currentStreak, dailyMissions, newCity, parseCity, pendingAt, pendingCoins, settle, streakBonus,
  type CityState,
} from '../services/cityGameService';
import { EVENT_WINDOW_MS, achievements, awaySummary, claimAchievement, currentEvent, resolveEvent } from '../services/cityFunService';

const HOUR = 3600000, DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 28, 1);
const TODAY = '2026-10-28';
const ok = (result: { state?: CityState; error?: string }) => { assert.equal(result.error, undefined); return result.state!; };
const SPOT = { x: 44, z: 52 }; // beside the starter avenue
const total = (state: CityState, now: number) => Object.values(pendingCoins(state, now)).reduce((s, v) => s + v, 0);
const town = () => {
  let city: CityState = { ...newCity(T0, TODAY), coins: 100000 };
  city = ok(build(city, 'cafe', SPOT.x, SPOT.z, T0, TODAY, 'cafe'));
  return ok(build(city, 'cottage', SPOT.x + 1, SPOT.z, T0, TODAY, 'home'));
};

test('income is continuous: no cap, however long the city is left', () => {
  const city = town();
  const rate = cityStats(city, T0).incomePerHour;
  for (const hours of [1, 8, 9, 72, 24 * 60]) assert.ok(Math.abs(total(city, T0 + hours * HOUR) - hours * rate) < 1e-3, `${hours}h`);
});

test('changing the city banks earnings at the old rates, so new rates never apply to time already passed', () => {
  const city = town();
  const later = T0 + 10 * DAY;
  const before = total(city, later);
  const oldRate = cityStats(city, later).incomePerHour;
  const lit = ok(addLights(city, city.roads.slice(0, 24), later, '2026-11-07')); // +6 happiness, so every rate rises
  const newRate = cityStats(lit, later).incomePerHour;
  assert.ok(newRate > oldRate);
  assert.ok(Math.abs(total(lit, later) - before) < 1e-6, 'nothing earned is lost or re-priced');
  assert.ok(Math.abs(total(lit, later + HOUR) - (before + newRate)) < 1e-6, 'the new rate applies from now on');
  // Settling twice changes nothing.
  assert.ok(Math.abs(total(settle(settle(city, later), later), later) - before) < 1e-6);
});

test('collecting takes whole coins from the bank and keeps the fraction', () => {
  const city = { ...town(), coins: 0 };
  const banked = { ...city, buildings: city.buildings.map(b => (b.id === 'cafe' ? { ...b, banked: 12.75 } : b)) };
  const waiting = pendingAt(banked, 'cafe', T0 + HOUR);
  const { state, coins } = collect(banked, T0 + HOUR, TODAY, 'cafe');
  assert.equal(coins, Math.floor(waiting));
  assert.ok(Math.abs(pendingAt(state, 'cafe', T0 + HOUR) - (waiting - coins)) < 1e-9);
  assert.equal(state.coins, coins);
  // A save with banked coins round-trips.
  assert.deepEqual(JSON.parse(JSON.stringify(parseCity(JSON.stringify(state)))), JSON.parse(JSON.stringify(state)));
});

test('habit streak counts consecutive days with an expense recorded and boosts mission coins', () => {
  const recorded = { expensesToday: 1, incomeToday: false, savedToday: false };
  const claimLog = (city: CityState, day: string, at: number) => ok(claimMission(city, dailyMissions(city, recorded, day), 'log1', at, day));
  let city = newCity(T0, TODAY);
  city = claimLog(city, '2026-10-28', T0);
  assert.equal(currentStreak(city, '2026-10-28'), 1);
  city = claimLog(city, '2026-10-29', T0 + DAY);
  city = claimLog(city, '2026-10-30', T0 + 2 * DAY);
  assert.deepEqual(city.streak, { count: 3, lastDay: '2026-10-30', best: 3 });
  // Day 4's missions are previewed with the streak it would reach: +30%.
  assert.equal(dailyMissions(city, recorded, '2026-10-31').find(m => m.id === 'log1')!.coins, Math.round(60 * 1.3));
  assert.equal(dailyMissions(city, { ...recorded, expensesToday: 0 }, '2026-10-31').find(m => m.id === 'checkin')!.coins, Math.round(30 * 1.2));
  // Missing a day ends it; the best is kept.
  assert.equal(currentStreak(city, '2026-11-02'), 0);
  city = claimLog(city, '2026-11-02', T0 + 5 * DAY);
  assert.deepEqual(city.streak, { count: 1, lastDay: '2026-11-02', best: 3 });
  assert.equal(streakBonus(1), 0); assert.equal(streakBonus(6), 0.5); assert.equal(streakBonus(40), 0.5);
});

test('city events: one per 3-hour window at a working building, paid once, scaled to income', () => {
  const empty = newCity(T0, TODAY);
  const hallEvent = currentEvent(empty, cityStats(empty, T0), T0);
  assert.equal(hallEvent.buildingId, 'hall'); assert.equal(hallEvent.kind, 'openday');
  const city = town();
  const stats = cityStats(city, T0);
  const event = currentEvent(city, stats, T0);
  assert.deepEqual(currentEvent(city, stats, T0 + HOUR), event, 'the same all window');
  assert.ok(['cafe', 'home'].includes(event.buildingId));
  assert.equal(event.endsAt % EVENT_WINDOW_MS, 0);
  assert.equal(event.choices[0].coins, Math.max(40, Math.round(stats.incomePerHour * 0.5)));
  assert.ok(event.choices[1].xp > event.choices[0].xp && event.choices[1].coins < event.choices[0].coins);
  const helped = ok(resolveEvent(city, event, 0, T0, TODAY));
  assert.equal(helped.coins, city.coins + event.choices[0].coins);
  assert.equal(helped.events!.helped, 1);
  assert.equal(currentEvent(helped, stats, T0).resolved, true);
  assert.match(resolveEvent(helped, event, 1, T0, TODAY).error!, /already/);
  assert.match(resolveEvent(city, event, 0, event.endsAt, TODAY).error!, /ended/);
  assert.match(resolveEvent(city, event, 5, T0, TODAY).error!, /Pick/);
  assert.notEqual(currentEvent(city, stats, event.endsAt).key, event.key);
});

test('achievements unlock tier by tier, once each', () => {
  let city: CityState = { ...newCity(T0, TODAY), coins: 100000 };
  const builders = () => achievements(city, cityStats(city, T0), TODAY).find(a => a.id === 'buildings')!;
  assert.equal(builders().claimable, false);
  assert.match(claimAchievement(city, cityStats(city, T0), 'buildings', T0, TODAY).error!, /Reach 10 buildings/);
  for (let i = 0; i < 10; i += 1) city = ok(build(city, 'tree', 40 + i, 56, T0, TODAY, `t${i}`));
  assert.equal(builders().claimable, true);
  const before = city.coins;
  const result = claimAchievement(city, cityStats(city, T0), 'buildings', T0, TODAY);
  city = ok(result);
  assert.equal(city.coins, before + result.reward!.coins);
  assert.deepEqual(city.achievements, ['buildings:0']);
  assert.equal(builders().tier, 1); assert.equal(builders().next, 50); assert.equal(builders().claimable, false);
  assert.match(claimAchievement(city, cityStats(city, T0), 'buildings', T0, TODAY).error!, /50 buildings/);
  assert.deepEqual(parseCity(JSON.stringify(city))!.achievements, ['buildings:0']);
});

test('welcome-back summary after an hour or more away', () => {
  const city = { ...town(), updatedAt: T0 };
  assert.equal(awaySummary(city, 500, T0 + 30 * 60000), null);
  assert.deepEqual(awaySummary(city, 500.7, T0 + 5 * HOUR), { away: 5 * HOUR, text: '5 hours', coins: 500 });
  assert.equal(awaySummary(city, 9, T0 + 3 * DAY)!.text, '3 days');
  assert.equal(awaySummary(city, 0, T0 + 3 * DAY), null);
});
