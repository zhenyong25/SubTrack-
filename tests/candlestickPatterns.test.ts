import test from 'node:test';
import assert from 'node:assert/strict';
import { CANDLESTICK_PATTERNS, exampleWithContext, findPatterns, trendBefore, type Bar } from '../services/candlestickPatterns';

test('every pattern is recognised in its own drawing', () => {
  for (const pattern of CANDLESTICK_PATTERNS) {
    const bars = exampleWithContext(pattern);
    assert.ok(pattern.detect(bars, bars.length - 1), `${pattern.name} not detected in its example`);
    assert.ok(bars.every(bar => bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close)), `${pattern.name} has an impossible candle`);
  }
});

test('patterns that need a trend are not flagged without it', () => {
  for (const pattern of CANDLESTICK_PATTERNS.filter(item => item.kind === 'Reversal' && item.family !== 'Three candles')) {
    const flat: Bar[] = [0, 1, 2, 3].map(n => ({ open: 100, high: 100.8, low: 99.2, close: n % 2 ? 100.4 : 99.6 }));
    const bars = [...flat, ...pattern.example];
    assert.equal(pattern.detect(bars, bars.length - 1), false, `${pattern.name} fired without a ${pattern.trend} trend`);
  }
});

test('trend and scanning helpers', () => {
  const down: Bar[] = [104, 102, 100].map(close => ({ open: close + 1, high: close + 1.2, low: close - 0.2, close }));
  assert.equal(trendBefore(down, 3), 'down');
  assert.equal(trendBefore(down, 2), null); // needs three closes
  const hammer = CANDLESTICK_PATTERNS.find(item => item.id === 'hammer')!;
  const bars = exampleWithContext(hammer);
  const found = findPatterns(bars);
  assert.ok(found.some(match => match.patternId === 'hammer' && match.index === bars.length - 1));
  assert.ok(found.every((match, n) => n === 0 || match.index <= found[n - 1].index), 'latest first');
  assert.equal(new Set(CANDLESTICK_PATTERNS.map(item => item.id)).size, CANDLESTICK_PATTERNS.length);
});
