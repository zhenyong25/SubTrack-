import type { InvestmentTransaction, InvestmentTransactionType } from '../types';

// Your own trades drawn on a ticker chart: B buy, S sell, T transfer in/out, D dividend.
// Trades are logged by date only, so each sits on the first candle of its trading day.

export type TradeMarkerLetter = 'B' | 'S' | 'T' | 'D';

export const tradeMarkerLetter = (type: InvestmentTransactionType): TradeMarkerLetter | null =>
  type === 'Buy' ? 'B' : type === 'Sell' ? 'S' : type === 'Transfer In' || type === 'Transfer Out' ? 'T' : type === 'Dividend' ? 'D' : null;

export const TRADE_MARKER_COLORS: Record<TradeMarkerLetter, string> = { B: '#10b981', S: '#f43f5e', T: '#64748b', D: '#f59e0b' };

// The calendar day of a timestamp on the exchange's clock (a US session runs past midnight in Asia).
export const tradingDay = (timestamp: number, timeZone?: string | null) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp);
  }
};

// Raw candle index for each trade inside the charted period. A trade on a day with no candle
// (a weekend or holiday) moves to the next session; trades outside the period are left out.
export function placeTrades(candles: ReadonlyArray<{ timestamp: number }>, trades: readonly InvestmentTransaction[], timeZone?: string | null) {
  const placed = new Map<number, InvestmentTransaction[]>();
  if (!candles.length) return { placed, outside: trades.filter(t => tradeMarkerLetter(t.transactionType)).length };
  const days = candles.map(c => tradingDay(c.timestamp, timeZone));
  let outside = 0;
  for (const trade of trades) {
    if (!tradeMarkerLetter(trade.transactionType)) continue;
    const day = trade.tradeDate.slice(0, 10);
    const index = day < days[0] || day > days[days.length - 1] ? -1 : days.findIndex(d => d >= day);
    if (index < 0) { outside++; continue; }
    placed.set(index, [...(placed.get(index) || []), trade]);
  }
  return { placed, outside };
}
