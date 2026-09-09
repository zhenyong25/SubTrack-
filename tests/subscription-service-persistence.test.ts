import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSubscriptions, loadAppData } from '../services/appDataService';
import type { Subscription } from '../types';

test('service identity survives saves and reloads with and without the SQL migration', async () => {
  const target = globalThis as typeof globalThis & { __subscriptionFake: unknown };
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const local = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
  } });
  let hasMigration = true;
  let rows: Record<string, unknown>[] = [];
  const attempts: Record<string, unknown>[][] = [];
  target.__subscriptionFake = {
    from(table: string) {
      return {
        select() { return this; }, eq() { return this; }, order() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
        then(resolve: (value: unknown) => void) { resolve({ data: table === 'subscriptions' ? rows : [], error: null }); },
        async upsert(next: Record<string, unknown>[]) {
          assert.equal(table, 'subscriptions');
          attempts.push(next);
          if (!hasMigration && next.some(row => 'service_id' in row)) return { error: { code: 'PGRST204', message: "Could not find the 'service_id' column" } };
          rows = next;
          return { error: null };
        },
      };
    },
  };
  const subscription: Subscription = {
    id: 'test-subscription', name: 'My music plan', serviceId: 'spotify--spotify-com',
    price: 22.5, currency: 'SGD', billingCycle: 'Monthly', firstPaymentDate: '2026-09-01',
    nextPaymentDate: '2026-10-01', category: 'Music', cardName: 'Cash', color: '#123456', status: 'Active',
  };
  try {
    await saveSubscriptions([subscription]);
    assert.equal(rows[0].service_id, subscription.serviceId);
    assert.equal((await loadAppData()).subscriptions[0].serviceId, subscription.serviceId);
    hasMigration = false;
    attempts.length = 0;
    await saveSubscriptions([subscription]);
    assert.equal(attempts.length, 2);
    assert.equal('service_id' in rows[0], false);
    assert.equal(rows[0].logo_url, 'catalog:spotify--spotify-com');
    const restored = (await loadAppData()).subscriptions[0];
    assert.equal(restored.serviceId, subscription.serviceId);
    assert.equal(restored.name, 'My music plan');
    await saveSubscriptions([{ ...subscription, serviceId: undefined, logoUrl: 'https://example.com/custom.png' }]);
    const custom = (await loadAppData()).subscriptions[0];
    assert.equal(custom.logoUrl, 'https://example.com/custom.png');
    assert.equal(custom.serviceId, undefined);
  } finally {
    target.__subscriptionFake = null;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
