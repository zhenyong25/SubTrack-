import type { StockCandle } from './stockQuoteService';
import { rsi, sma } from './tradingMath';

// Statistics for one ticker's detail screen, from a year of daily candles plus the live price,
// and where the price stands against the holding's average cost.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BreakEven {
  status: 'profit' | 'loss' | 'even';
  // Signed move from the current price to the average cost: what it takes to get back to even
  // when losing, or how much room there is before losing when in profit.
  movePct: number;
  movePerUnit: number;
  pnlPerUnit: number;
  pnlPct: number; // on cost
}

// A long makes money above its average cost; a short (sold at its average) makes money below it.
export const breakEven = (side: 'Long' | 'Short', price: number, averageCost: number): BreakEven | null => {
  if (!(price > 0) || !(averageCost > 0)) return null;
  const pnlPerUnit = side === 'Short' ? averageCost - price : price - averageCost;
  const relative = Math.abs(pnlPerUnit) / averageCost;
  return {
    status: relative < 1e-6 ? 'even' : pnlPerUnit > 0 ? 'profit' : 'loss',
    movePct: averageCost / price - 1,
    movePerUnit: averageCost - price,
    pnlPerUnit,
    pnlPct: pnlPerUnit / averageCost,
  };
};

export interface TickerStats {
  high52?: number;
  low52?: number;
  rangePosition?: number; // 0 at the 52-week low, 1 at the high
  previousClose?: number;
  dayChangePct?: number;
  returns: Array<{ label: string; pct: number }>;
  ma50?: number;
  ma200?: number;
  rsi14?: number;
  volatility30?: number; // annualized, from daily returns
  typicalDayMove?: number; // average absolute daily move over 30 sessions
  avgVolume30?: number;
}

const RETURN_WINDOWS: Array<{ label: string; days: number }> = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 91 },
  { label: '6M', days: 182 },
  { label: '1Y', days: 365 },
];

const lastCloseOnOrBefore = (candles: StockCandle[], timestamp: number) => {
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (candles[index].timestamp <= timestamp) return candles[index].close;
  }
  return undefined;
};

// `daily` is oldest first; its last bar is the latest (possibly still trading) session.
export const tickerStats = (
  daily: StockCandle[],
  price: number,
  extra: { fiftyTwoWeekHigh?: number | null; fiftyTwoWeekLow?: number | null } = {},
  now = Date.now(),
): TickerStats => {
  const year = daily.filter(candle => candle.timestamp >= now - 365 * DAY_MS);
  const high52 = extra.fiftyTwoWeekHigh ?? (year.length ? Math.max(...year.map(candle => candle.high)) : undefined);
  const low52 = extra.fiftyTwoWeekLow ?? (year.length ? Math.min(...year.map(candle => candle.low)) : undefined);
  const closes = daily.map(candle => candle.close);
  const previousClose = closes.at(-2);

  const returns = RETURN_WINDOWS.flatMap(window => {
    // Only when the history actually reaches that far back.
    if (!daily.length || daily[0].timestamp > now - window.days * DAY_MS) return [];
    const base = lastCloseOnOrBefore(daily, now - window.days * DAY_MS);
    return base ? [{ label: window.label, pct: price / base - 1 }] : [];
  });
  const yearStart = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  const ytdBase = daily[0]?.timestamp < yearStart ? lastCloseOnOrBefore(daily, yearStart - 1) : undefined;
  if (ytdBase) returns.splice(3, 0, { label: 'YTD', pct: price / ytdBase - 1 });

  const dailyReturns = closes.slice(1).map((close, index) => close / closes[index] - 1).slice(-30);
  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / (dailyReturns.length || 1);
  const variance = dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(dailyReturns.length - 1, 1);
  const volumes = daily.slice(-30).map(candle => candle.volume).filter((volume): volume is number => typeof volume === 'number' && volume > 0);

  return {
    high52,
    low52,
    rangePosition: high52 !== undefined && low52 !== undefined && high52 > low52 ? Math.min(1, Math.max(0, (price - low52) / (high52 - low52))) : undefined,
    previousClose,
    dayChangePct: previousClose ? price / previousClose - 1 : undefined,
    returns,
    ma50: sma(closes, 50),
    ma200: sma(closes, 200),
    rsi14: rsi(closes).at(-1),
    volatility30: dailyReturns.length >= 10 ? Math.sqrt(variance) * Math.sqrt(252) : undefined,
    typicalDayMove: dailyReturns.length >= 10 ? dailyReturns.reduce((sum, value) => sum + Math.abs(value), 0) / dailyReturns.length : undefined,
    avgVolume30: volumes.length ? volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length : undefined,
  };
};
