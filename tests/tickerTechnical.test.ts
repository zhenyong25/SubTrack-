import test from 'node:test';
import assert from 'node:assert/strict';
import { averageSeries, cleanCandles, compressChartCandles, indicatorHistoryRange, tickerTechnical } from '../services/tickerTechnicalService';
import { CANDLESTICK_PATTERNS, exampleWithContext, findPatterns } from '../services/candlestickPatterns';
import type { StockCandle } from '../services/stockQuoteService';
const candle = (n: number, close = n): StockCandle => ({ timestamp: n * 1000, open: close, high: close + 1, low: close - 0.5, close, volume: 10 });

test('SMA and seeded EMA use full windows and do not read future closes', () => {
  const closes = [1, 2, 3, 8, 3];
  assert.deepEqual(averageSeries(closes, 3, 'SMA'), [null, null, 2, 13 / 3, 14 / 3]);
  assert.deepEqual(averageSeries(closes, 3, 'EMA'), [null, null, 2, 5, 4]);
  assert.deepEqual(averageSeries([...closes, 900], 3, 'EMA').slice(0, 5), averageSeries(closes, 3, 'EMA'));
  assert.deepEqual(averageSeries([1, 2, NaN, 3, 4, 5], 3, 'SMA'), [null, null, null, null, null, 4]);
  assert.throws(() => averageSeries(closes, 0, 'SMA'));
});

test('historical warmup fills the first visible average without duplicates or future leakage', () => {
  const visible = [21, 22, 23].map(n => candle(n));
  const warmup = Array.from({ length: 20 }, (_, i) => candle(i + 1));
  const result = tickerTechnical(visible, [...warmup, candle(21, 800), candle(24, 900)], 'SMA');
  assert.equal(result.averages[20][0], 11.5); assert.equal(result.averages[20][2], 13.5);
  assert.equal(result.averages[50][0], null); assert.equal(result.historyCount, 23);
  assert.equal(indicatorHistoryRange('1m'), '5d'); assert.equal(indicatorHistoryRange('1d'), 'max');
});

test('long charts sample original-period averages rather than averaging grouped candle closes', () => {
  const source = Array.from({ length: 1000 }, (_, i) => candle(i + 1));
  const grouped = compressChartCandles(source, 100), technical = tickerTechnical(source, [], 'SMA');
  assert.equal(grouped.length, 100); assert.equal(grouped[0].sourceStart, 0); assert.equal(grouped[0].sourceEnd, 9);
  assert.equal(grouped[0].open, 1); assert.equal(grouped[0].close, 10); assert.equal(grouped[0].volume, 100);
  assert.equal(technical.averages[200][grouped[19].sourceEnd], 100.5);
  assert.equal(technical.averages[200][grouped.at(-1)!.sourceEnd], 900.5);
});

test('stock charts reuse the pattern library on original candles, including preceding context', () => {
  const pattern = CANDLESTICK_PATTERNS.find(p => p.id === 'hammer')!;
  const all = exampleWithContext(pattern).map((bar, index) => ({ ...bar, timestamp: (index + 1) * 1000 }));
  const result = tickerTechnical(all.slice(-1), all.slice(0, -1), 'SMA');
  assert.ok(result.matches.some(m => m.patternId === 'hammer' && m.index === 0));
  assert.deepEqual(tickerTechnical(all, [], 'SMA').matches, findPatterns(all));
  assert.equal(tickerTechnical(all, [], 'SMA', false).matches.length, 0, 'collected quotes are not candlestick pattern evidence');
});

test('invalid, unsorted and duplicate OHLC cannot poison a chart', () => {
  const latest = candle(2, 8);
  assert.deepEqual(cleanCandles([candle(2), candle(1), { ...candle(3), high: NaN }, { ...candle(4), low: 9 }, latest]), [candle(1), latest]);
  assert.equal(tickerTechnical([], [], 'SMA').historyCount, 0);
});
