import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, alertHit, alertMessage, digest, dueItems, earningsItems, sgtDate, usDate } from '../worker/src/notifications';
import type { SmartReminder } from '../services/smartReminderService';
import type { EarningsEvent } from '../server/earningsCalendar';

const reminder = (kind: SmartReminder['kind'], name: string, days: number, extra: Partial<SmartReminder> = {}): SmartReminder => ({
  id: `${kind}:${name}:2026-11-0${days + 1}`, kind, sourceId: name, name, dueDate: `2026-11-0${days + 1}`, days, detail: '', ...extra,
});

test('bills, trials and debts within the lead time, each sent once and again on the day', () => {
  const reminders = [
    reminder('bill', 'Netflix', 1, { amount: 54.9, currency: 'MYR' }),
    reminder('trial', 'Notion', 3),
    reminder('debt', 'Car loan', 0, { amount: 1200, currency: 'MYR' }),
    reminder('debt', 'Mortgage', 5),
    reminder('goal', 'Holiday', 1),
  ];
  const items = dueItems(reminders, DEFAULT_PREFS, new Set());
  assert.deepEqual(items.map(item => item.line), [
    'Netflix renews tomorrow · MYR 54.90',
    'Notion trial ends in 3 days',
    'Car loan payment due today · MYR 1,200.00',
  ]);
  assert.equal(items[2].key, 'debt:Car loan:2026-11-01:today');

  // Already sent: skipped. Turned off: skipped.
  assert.deepEqual(dueItems(reminders, DEFAULT_PREFS, new Set(items.map(item => item.key))), []);
  assert.deepEqual(dueItems(reminders, { ...DEFAULT_PREFS, bills: false }, new Set()).map(item => item.line), ['Car loan payment due today · MYR 1,200.00']);
  assert.deepEqual(dueItems(reminders, { ...DEFAULT_PREFS, lead_days: 0 }, new Set()).map(item => item.key), ['debt:Car loan:2026-11-01:today']);
});

const event = (symbol: string, date: string, time: EarningsEvent['time'] = 'amc'): EarningsEvent => ({
  date, symbol, name: symbol, time, marketCap: null, fiscalQuarter: null, epsEstimate: 1.234, estimateCount: 3, lastYearEps: null, lastYearDate: null, eps: null, surprisePct: null,
});

test('earnings only for held stocks, within two US days, once', () => {
  const events = [event('FUTU', '2026-11-17', 'bmo'), event('AAPL', '2026-11-16'), event('FUTU', '2026-11-20'), event('NVDA', '2026-11-14')];
  const items = earningsItems(new Set(['FUTU', 'NVDA']), events, '2026-11-15', new Set());
  assert.deepEqual(items.map(item => item.line), ['FUTU reports Tue, Nov 17, before the US open · EPS est. 1.23']);
  assert.equal(items[0].key, 'earnings:FUTU:2026-11-17');
  assert.deepEqual(earningsItems(new Set(['FUTU']), events, '2026-11-15', new Set(['earnings:FUTU:2026-11-17'])), []);
});

test('one digest per run, capped at four lines', () => {
  assert.equal(digest([], { one: 'Coming up', many: 'things coming up' }, '/'), null);
  const one = digest([{ key: 'a', line: 'Netflix renews tomorrow' }], { one: 'Coming up', many: 'things coming up' }, '/');
  assert.deepEqual(one, { title: 'Coming up', body: 'Netflix renews tomorrow', url: '/' });
  const many = digest(Array.from({ length: 6 }, (_, index) => ({ key: String(index), line: `Item ${index}` })), { one: 'Coming up', many: 'things coming up' }, '/');
  assert.equal(many?.title, '6 things coming up');
  assert.equal(many?.body, 'Item 0\nItem 1\nItem 2\nItem 3\n+2 more');
});

test('price alerts fire on the right side of the target', () => {
  assert.equal(alertHit({ direction: 'above', target: 122.75 }, 122.75), true);
  assert.equal(alertHit({ direction: 'above', target: 122.75 }, 122.7), false);
  assert.equal(alertHit({ direction: 'below', target: 90 }, 89.5), true);
  assert.equal(alertHit({ direction: 'below', target: 90 }, Number.NaN), false);
  assert.equal(alertHit({ direction: 'above', target: '122.75' as unknown as number }, 130), true); // numeric columns arrive as strings
  assert.deepEqual(
    alertMessage({ id: '1', user_id: 'u', symbol: 'FUTU', direction: 'above', target: 122.75, label: 'break-even' }, 123.1, 'USD'),
    { title: 'FUTU rose to 123.10 USD', body: 'break-even was reached.', url: '/' },
  );
});

test('days are Singapore days for the user and New York days for earnings', () => {
  const now = new Date('2026-11-16T00:00:00Z'); // 08:00 in Singapore, 19:00 the evening before in New York
  assert.equal(sgtDate(now), '2026-11-16');
  assert.equal(usDate(now), '2026-11-15');
});
