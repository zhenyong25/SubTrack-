import test from 'node:test';
import assert from 'node:assert/strict';
import { handleEarningsCalendar, normalizeNasdaqRow, parseEarningsTime, parseNasdaqNumber, weekDays } from '../server/earningsCalendar';
import { defaultWeekStart, earningsResult, filterEarnings, formatEps, formatMarketCap, groupEarnings, shiftWeek, type EarningsEvent } from '../services/earningsCalendarService';

test('parses Nasdaq display numbers', () => {
  assert.equal(parseNasdaqNumber('$2.98'), 2.98);
  assert.equal(parseNasdaqNumber('($7.47)'), -7.47);
  assert.equal(parseNasdaqNumber('$740,324,150,000'), 740324150000);
  assert.equal(parseNasdaqNumber('-3.2'), -3.2);
  assert.equal(parseNasdaqNumber('5.82'), 5.82);
  assert.equal(parseNasdaqNumber('N/A'), null);
  assert.equal(parseNasdaqNumber(''), null);
  assert.equal(parseNasdaqNumber(undefined), null);
});

test('maps report times', () => {
  assert.equal(parseEarningsTime('time-pre-market'), 'bmo');
  assert.equal(parseEarningsTime('time-after-hours'), 'amc');
  assert.equal(parseEarningsTime('time-not-supplied'), 'unknown');
});

test('normalizes a row and skips rows without a symbol', () => {
  const event = normalizeNasdaqRow({
    lastYearRptDt: '10/29/2025', lastYearEPS: '($7.47)', time: 'time-pre-market', symbol: 'ba', name: 'Boeing Company (The)',
    marketCap: '$148,233,896,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '($0.21)', noOfEsts: '7',
  }, '2026-10-27');
  assert.deepEqual(event, {
    date: '2026-10-27', symbol: 'BA', name: 'Boeing Company (The)', time: 'bmo', marketCap: 148233896000, fiscalQuarter: 'Sep/2026',
    epsEstimate: -0.21, estimateCount: 7, lastYearEps: -7.47, lastYearDate: '10/29/2025', eps: null, surprisePct: null,
  });
  assert.equal(normalizeNasdaqRow({ name: 'Nothing' }, '2026-10-27'), null);
});

test('weeks run Monday to Friday', () => {
  assert.deepEqual(weekDays('2026-10-28'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
  assert.deepEqual(weekDays('2026-10-25').slice(0, 1), ['2026-10-19']); // a Sunday belongs to the week before
  assert.equal(defaultWeekStart('2026-10-25'), '2026-10-26'); // weekend shows the coming week
  assert.equal(defaultWeekStart('2026-10-24'), '2026-10-26');
  assert.equal(defaultWeekStart('2026-10-30'), '2026-10-26');
  assert.equal(shiftWeek('2026-10-26', -1), '2026-10-19');
  assert.equal(shiftWeek('2026-12-28', 1), '2027-01-04');
});

const event = (symbol: string, date: string, time: EarningsEvent['time'], marketCap: number | null, extra: Partial<EarningsEvent> = {}): EarningsEvent => ({
  date, symbol, name: `${symbol} Inc.`, time, marketCap, fiscalQuarter: null, epsEstimate: 1, estimateCount: 3, lastYearEps: null, lastYearDate: null, eps: null, surprisePct: null, ...extra,
});

test('filters and groups biggest first', () => {
  const events = [event('SML', '2026-10-26', 'bmo', 1e9), event('BIG', '2026-10-26', 'bmo', 500e9), event('MID', '2026-10-26', 'amc', 20e9), event('NOCAP', '2026-10-27', 'unknown', null)];
  assert.deepEqual(filterEarnings(events, { mine: null, minMarketCap: 10e9, query: '' }).map(e => e.symbol), ['BIG', 'MID']);
  assert.deepEqual(filterEarnings(events, { mine: new Set(['SML']), minMarketCap: 0, query: '' }).map(e => e.symbol), ['SML']);
  assert.deepEqual(filterEarnings(events, { mine: null, minMarketCap: 0, query: 'mi' }).map(e => e.symbol), ['MID']);
  const groups = groupEarnings(events, weekDays('2026-10-26'));
  assert.deepEqual(groups.get('2026-10-26')!.bmo.map(e => e.symbol), ['BIG', 'SML']);
  assert.deepEqual(groups.get('2026-10-27')!.unknown.map(e => e.symbol), ['NOCAP']);
  assert.equal(groups.get('2026-10-30')!.amc.length, 0);
});

test('formats and scores results', () => {
  assert.equal(formatMarketCap(2.5e12), '$2.50T');
  assert.equal(formatMarketCap(148.2e9), '$148.2B');
  assert.equal(formatMarketCap(null), '—');
  assert.equal(formatEps(-0.21), '-$0.21');
  assert.equal(earningsResult(event('A', '2026-10-26', 'bmo', 1, { eps: 1.2 })), 'beat');
  assert.equal(earningsResult(event('A', '2026-10-26', 'bmo', 1, { eps: 0.8 })), 'miss');
  assert.equal(earningsResult(event('A', '2026-10-26', 'bmo', 1, { eps: 1 })), 'inline');
  assert.equal(earningsResult(event('A', '2026-10-26', 'bmo', 1)), 'pending');
});

test('route fetches the week and reports days that failed', async () => {
  const realFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: string) => {
    const date = new URL(input).searchParams.get('date')!;
    requested.push(date);
    if (date === '2026-10-30') return new Response('blocked', { status: 403 });
    const rows = date === '2026-10-26' ? [{ symbol: 'KO', name: 'Coca-Cola', time: 'time-pre-market', marketCap: '$410,205,061,000' }] : null;
    return Response.json({ data: { rows } });
  }) as typeof fetch;
  try {
    const response = await handleEarningsCalendar(new Request('http://localhost/api/earnings-calendar?week=2026-10-28'));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(requested.sort(), weekDays('2026-10-26'));
    assert.equal(body.weekStart, '2026-10-26');
    assert.deepEqual(body.failedDays, ['2026-10-30']);
    assert.deepEqual(body.events.map((e: EarningsEvent) => e.symbol), ['KO']);
    assert.equal((await handleEarningsCalendar(new Request('http://localhost/api/earnings-calendar?week=soon'))).status, 400);
  } finally { globalThis.fetch = realFetch; }
});
