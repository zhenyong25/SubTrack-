import type { StockCandle, StockHistoryInterval, StockHistoryRange } from './stockQuoteService';
import { findPatterns, type PatternMatch } from './candlestickPatterns';

export const MA_PERIODS = [5, 10, 20, 50, 100, 200] as const;
export const MA_COLORS: Record<number, string> = { 5: '#d97706', 10: '#ea580c', 20: '#3b82f6', 50: '#a855f7', 100: '#db2777', 200: '#0891b2' };
export type AverageType = 'SMA' | 'EMA';
export interface ChartCandle extends StockCandle { sourceStart: number; sourceEnd: number }

// Invalid OHLC must not turn an indicator or chart scale into NaN. Later duplicates win.
export function cleanCandles(candles: readonly StockCandle[]): StockCandle[] {
  const unique = new Map<number, StockCandle>();
  for (const c of candles) if ([c.timestamp, c.open, c.high, c.low, c.close].every(Number.isFinite)
    && Math.min(c.open, c.high, c.low, c.close) > 0 && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close)) {
    unique.set(c.timestamp, c);
  }
  return [...unique.values()].sort((a, b) => a.timestamp - b.timestamp);
}

// Full-window SMA; EMA is seeded with the first full-window SMA, alpha=2/(period+1).
// Missing history stays null: never zero, a partial-window average or a future value.
export function averageSeries(closes: readonly number[], period: number, type: AverageType): Array<number | null> {
  if (!Number.isInteger(period) || period < 1) throw new Error('A moving-average period must be a positive integer.');
  const out: Array<number | null> = Array(closes.length).fill(null);
  let sum = 0, count = 0, ema: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (!Number.isFinite(closes[i])) { sum = 0; count = 0; ema = null; continue; }
    sum += closes[i]; count++;
    if (count > period) sum -= closes[i - period];
    if (count >= period) { ema = type === 'EMA' && ema !== null ? ema + 2 / (period + 1) * (closes[i] - ema) : sum / period; out[i] = ema; }
  }
  return out;
}

export function compressChartCandles(candles: readonly StockCandle[], maximum = 700): ChartCandle[] {
  const size = Math.max(1, Math.ceil(candles.length / maximum)), out: ChartCandle[] = [];
  for (let start = 0; start < candles.length; start += size) {
    const group = candles.slice(start, start + size), last = group.at(-1)!;
    out.push({ timestamp: last.timestamp, open: group[0].open, high: Math.max(...group.map(c => c.high)), low: Math.min(...group.map(c => c.low)), close: last.close, volume: group.reduce((sum, c) => sum + (Number.isFinite(c.volume) ? c.volume! : 0), 0), sourceStart: start, sourceEnd: start + group.length - 1 });
  }
  return out;
}

export const indicatorHistoryRange = (interval: StockHistoryInterval): StockHistoryRange =>
  interval === '1m' ? '5d' : interval === '5m' ? '1mo' : interval === '15m' ? '60d' : interval === '60m' ? '1y' : 'max';

export interface TickerTechnical {
  averages: Record<number, Array<number | null>>;
  matches: PatternMatch[]; // original visible candle indices, not compressed shapes
  historyCount: number;
}

export function tickerTechnical(visible: readonly StockCandle[], warmup: readonly StockCandle[], type: AverageType, patterns = true): TickerTechnical {
  const prefix = cleanCandles(warmup).filter(c => c.timestamp < (visible[0]?.timestamp ?? -Infinity));
  const all = [...prefix, ...visible], closes = all.map(c => c.close);
  const averages = Object.fromEntries(MA_PERIODS.map(period => [period, averageSeries(closes, period, type).slice(prefix.length)]));
  // Detectors need preceding context, but only matches ending in the visible interval count.
  const offset = Math.max(0, prefix.length - 20);
  const matches = patterns ? findPatterns(all.slice(offset)).map(m => ({ ...m, index: m.index + offset - prefix.length, start: m.start + offset - prefix.length })).filter(m => m.index >= 0) : [];
  return { averages, matches, historyCount: all.length };
}
