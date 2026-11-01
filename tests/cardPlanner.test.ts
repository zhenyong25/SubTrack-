import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlannerCard, calculateCardPlan, categoryGuidance, emptyCardPlan, movePlannerCard, planStorageKey, plannerCardFromMarket, readCardPlan, writeCardPlan, type CardPlan, type PlannerCard } from '../services/cardPlannerService';
import type { MarketCard } from '../services/creditCardMarketService';

const market: MarketCard = { id: 'example', name: 'Example card', issuer: 'Example bank', imageUrl: null, url: 'https://example.com/card', applyUrl: null, categories: ['Cashback'], highlights: [{ value: 'Up to 10%', label: 'Online shopping and dining' }], keyFeatures: ['Local retail and groceries'], annualFee: null, minIncome: null, minIncomeForeigner: null, interestRate: null, network: null, promotion: null, promotionEnds: null, summary: null };
const card = (id: string, values: Partial<PlannerCard> = {}): PlannerCard => ({ ...plannerCardFromMarket({ ...market, id, name: id }, 'my'), ...values });
const plan = (...cards: PlannerCard[]): CardPlan => ({ ...emptyCardPlan('my'), cards });

test('market headlines provide category mentions without inventing approved limits or reward rules', () => {
  const item = plannerCardFromMarket(market, 'my');
  assert.deepEqual(item.mentions, ['online', 'local', 'groceries', 'dining']);
  assert.equal(item.creditLimit, null); assert.equal(item.cashbackCap, null); assert.deepEqual(item.allocations, []);
  assert.equal(calculateCardPlan(plan(item)).available, 0);
  assert.deepEqual(categoryGuidance(plan(item)).map(c => c.candidates), [[], [], [], []]);
});

test('budget, existing debt and planned spending stay separate; unknown limits are excluded', () => {
  const result = calculateCardPlan({ ...plan(card('A', { creditLimit: 5000, balance: 800, allocations: [{ category: 'online', amount: 1200.12, rate: null, cap: null }] }), card('B', { allocations: [{ category: 'local', amount: 100.13, rate: null, cap: null }] })), budget: 1200 });
  assert.equal(result.planned, 1300.25); assert.equal(result.available, 4200); assert.equal(result.afterPlan, 2999.88);
  assert.equal(result.remainingBudget, -100.25); assert.equal(result.unknownLimits, 1); assert.equal(result.totalLimit, 5000);
  assert.equal(result.rewardComplete, false);
});

test('shared bank credit facilities count once and deduct both individual balances and plans', () => {
  const a = card('A', { creditGroup: ' Bank facility ', creditLimit: 6000, balance: 700, allocations: [{ category: 'online', amount: 1000, rate: null, cap: null }] });
  const b = card('B', { creditGroup: 'bank FACILITY', creditLimit: 6000, balance: 300, allocations: [{ category: 'local', amount: 800, rate: null, cap: null }] });
  const result = calculateCardPlan(plan(a, b));
  assert.equal(result.groups.length, 1); assert.equal(result.totalLimit, 6000); assert.equal(result.available, 5000); assert.equal(result.afterPlan, 3200);
  const inconsistent = calculateCardPlan(plan(a, { ...b, creditLimit: 9000 }));
  assert.equal(inconsistent.available, 0); assert.equal(inconsistent.inconsistentGroups, 1);
  const missing = calculateCardPlan(plan(a, { ...b, creditLimit: null }));
  assert.equal(missing.available, 0); assert.equal(missing.unknownLimits, 1);
});

test('zero limits are known, negative headroom warns, and cents do not create false limit breaches', () => {
  const result = calculateCardPlan(plan(card('Zero', { creditLimit: 0, allocations: [{ category: 'online', amount: 10, rate: null, cap: null }] })));
  assert.equal(result.unknownLimits, 0); assert.equal(result.afterPlan, -10); assert.equal(result.groups[0].overLimit, true);
  assert.equal(calculateCardPlan(plan(card('Cents', { creditLimit: 0.3, balance: 0.1, allocations: [{ category: 'online', amount: 0.2, rate: null, cap: null }] }))).groups[0].overLimit, false);
});

test('cashback respects category caps, total cap, minimum spend, zero rates and unknown rules', () => {
  const a = card('A', { cashbackCap: 40, minimumSpend: 500, allocations: [{ category: 'online', amount: 600, rate: 10, cap: 25 }, { category: 'dining', amount: 400, rate: 5, cap: null }] });
  assert.equal(calculateCardPlan(plan(a)).cashback, 40);
  const belowMinimum = calculateCardPlan(plan({ ...a, minimumSpend: 1200 }));
  assert.equal(belowMinimum.cashback, 0); assert.equal(belowMinimum.rows[0].minimumMet, false);
  const unknownCap = calculateCardPlan(plan({ ...a, cashbackCap: null }));
  assert.equal(unknownCap.cashback, 0); assert.equal(unknownCap.rewardComplete, false);
  assert.equal(calculateCardPlan(plan({ ...a, cashbackCap: null, uncappedCashback: true })).cashback, 45);
  assert.equal(calculateCardPlan(plan({ ...a, cashbackCap: 0 })).cashback, 0);
  assert.equal(calculateCardPlan(plan({ ...a, allocations: [{ category: 'online', amount: 600, rate: 0, cap: null }] })).rewardComplete, true);
});

test('cashback shared across paired cards is capped once, with inconsistent groups excluded', () => {
  const a = card('A', { cashbackGroup: 'paired', cashbackCap: 50, allocations: [{ category: 'online', amount: 800, rate: 5, cap: null }] });
  const b = card('B', { ...a, id: 'b', name: 'B', cashbackGroup: 'PAIRED' });
  const result = calculateCardPlan(plan(a, b));
  assert.equal(result.cashback, 50); assert.equal(result.rows[0].cashback, 40); assert.equal(result.rows[1].cashback, 10);
  assert.ok(categoryGuidance(plan(a, b))[0].candidates.every(c => c.capped));
  const mismatch = calculateCardPlan(plan(a, { ...b, cashbackCap: 60 }));
  assert.equal(mismatch.cashback, 0); assert.equal(mismatch.inconsistentRewardGroups, 1); assert.equal(mismatch.rewardComplete, false);
});

test('category guidance prioritizes usable entered rates over capped or unqualified higher rates', () => {
  const a = card('Unqualified', { cashbackCap: 50, minimumSpend: 1000, allocations: [{ category: 'online', amount: 400, rate: 10, cap: null }] });
  const b = card('Ready', { cashbackCap: 50, allocations: [{ category: 'online', amount: 400, rate: 5, cap: null }] });
  const c = card('Capped', { cashbackCap: 1, allocations: [{ category: 'online', amount: 400, rate: 20, cap: null }] });
  const d = card('No credit', { creditLimit: 100, cashbackCap: 50, allocations: [{ category: 'online', amount: 400, rate: 8, cap: null }] });
  const guide = categoryGuidance(plan(a, b, c, d)).find(c => c.category.id === 'online')!;
  assert.equal(guide.candidates[0].name, 'Ready'); assert.equal(guide.candidates[0].ready, true);
  assert.equal(guide.candidates.find(c => c.name === 'No credit')!.noCredit, true);
});

test('duplicate adds and reorder preserve all entered rules; unknown drag IDs do nothing', () => {
  const a = card('A', { balance: 200 }), b = card('B');
  const start = addPlannerCard(plan(a), b);
  assert.equal(addPlannerCard(start, a), start);
  assert.equal(addPlannerCard(start, { ...a, id: 'owned:A', source: 'My cards' }), start);
  const moved = movePlannerCard(start, b.id, a.id);
  assert.deepEqual(moved.cards.map(c => c.name), ['B', 'A']); assert.equal(moved.cards[1].balance, 200);
  assert.equal(movePlannerCard(start, 'external', a.id), start);
});

test('saved plans are isolated by account and currency, sanitized and protected against malformed data', () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  try {
    const saved = { ...plan(card('A', { imageUrl: 'javascript:alert(1)', sourceUrl: 'data:text/html,bad' })), budget: 1000 };
    writeCardPlan('alice', saved);
    assert.equal(readCardPlan('alice', 'my').budget, 1000); assert.equal(readCardPlan('alice', 'my').cards[0].imageUrl, null); assert.equal(readCardPlan('alice', 'my').cards[0].sourceUrl, null);
    assert.equal(readCardPlan('bob', 'my').cards.length, 0); assert.equal(readCardPlan('alice', 'sg').budget, null);
    assert.notEqual(planStorageKey('a:b', 'my'), planStorageKey('a', 'my'));
    for (const value of [ { ...saved, budget: -1 }, { ...saved, cards: [card('A'), card('A')] }, { ...saved, cards: [card('A', { allocations: [{ category: 'online', amount: 100, rate: 101, cap: null }] })] }, { ...saved, cards: [card('A', { balance: -10 })] }, { ...saved, cards: [card('A', { allocations: [null as never] })] } ]) {
      const raw = JSON.stringify(value); storage.set(planStorageKey('alice', 'my'), raw);
      assert.throws(() => readCardPlan('alice', 'my')); assert.equal(storage.get(planStorageKey('alice', 'my')), raw);
    }
    storage.set(planStorageKey('alice', 'my'), '{invalid'); assert.throws(() => readCardPlan('alice', 'my'));
  } finally { delete (globalThis as any).localStorage; }
});
