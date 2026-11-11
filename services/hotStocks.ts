import type { HotQuote, HotStocksResponse } from '../server/hotStocks';

// Ranks Yahoo's most-active and mover lists for short-term trading: liquid enough to get in and
// out cleanly, and "in play" - trading more than usual, with a wide enough range to move.

export type HotSort = 'score' | 'rvol' | 'dollarVolume' | 'move' | 'range';
export type HotDirection = 'all' | 'up' | 'down';

export interface HotFilters {
  minPrice: number;
  minAvgDollarVolume: number; // average daily traded value, in USD
  minMarketCap: number;
  direction: HotDirection;
}

export const DEFAULT_HOT_FILTERS: HotFilters = { minPrice: 5, minAvgDollarVolume: 50e6, minMarketCap: 500e6, direction: 'all' };

export interface HotStock extends HotQuote {
  dollarVolume: number; // traded today
  avgDollarVolume: number; // a typical day
  rvol: number | null; // today's volume vs a typical day, pro rata while the market is open
  rangePct: number | null; // today's high-low range, as a share of the price
  gapPct: number | null; // open vs previous close
  spreadPct: number | null; // bid-ask spread vs the mid price, when both are quoted
  score: number; // 0-100
  reasons: string[];
  flags: string[];
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const NY_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// Share of the 09:30-16:00 New York session that has passed, for pro-rating today's volume.
// Only meaningful while the market is open; otherwise the whole day counts.
export const sessionProgress = (now: number, marketState: string | null) => {
  if (marketState !== 'REGULAR') return 1;
  const parts = Object.fromEntries(NY_PARTS.formatToParts(now).map(part => [part.type, part.value]));
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  // Volume bunches at the open, so don't let the first minutes inflate the ratio.
  return Math.min(1, Math.max(0.1, (minute - 570) / 390));
};

export const compactUsd = (value: number) => `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
const signedPct = (value: number, digits = 1) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;

export const scoreHotStock = (quote: HotQuote, now: number): HotStock => {
  const avgVolume = quote.avgVolume10Day ?? quote.avgVolume3Month;
  const dollarVolume = quote.price * quote.volume;
  const avgDollarVolume = quote.price * (quote.avgVolume3Month ?? quote.avgVolume10Day ?? quote.volume);
  const rvol = avgVolume ? quote.volume / (avgVolume * sessionProgress(now, quote.marketState)) : null;
  const rangePct = quote.dayHigh && quote.dayLow && quote.dayHigh >= quote.dayLow ? (quote.dayHigh - quote.dayLow) / quote.price : null;
  const gapPct = quote.open && quote.previousClose ? quote.open / quote.previousClose - 1 : null;
  // Outside the regular session the quoted bid/ask is thin pre/after-market interest, not the
  // spread you'd trade at, so it's left unknown.
  const spreadPct = quote.marketState === 'REGULAR' && quote.bid && quote.ask && quote.ask >= quote.bid ? (quote.ask - quote.bid) / ((quote.ask + quote.bid) / 2) : null;

  // Liquidity: $10M a day scores 0, $10B a day full marks (log scale).
  const liquidity = clamp01((Math.log10(Math.max(avgDollarVolume, 1)) - 7) / 3);
  // In play: 1x normal volume scores 0, 3x full marks.
  const activity = rvol === null ? 0.3 : clamp01((rvol - 1) / 2);
  const range = rangePct === null ? 0.3 : clamp01(rangePct / 0.08);
  const move = clamp01(Math.abs(quote.changePct) / 0.1);
  // A spread of 0.5% or more eats a scalp; unknown (market closed) counts as average.
  const tightness = spreadPct === null ? 0.5 : 1 - clamp01(spreadPct / 0.005);
  const score = Math.round(100 * (0.3 * liquidity + 0.3 * activity + 0.2 * range + 0.1 * move + 0.1 * tightness));

  const reasons: string[] = [];
  if (rvol !== null && rvol >= 1.5) reasons.push(`${rvol.toFixed(1)}× usual volume`);
  if (dollarVolume >= 100e6) reasons.push(`${compactUsd(dollarVolume)} traded ${quote.marketState === 'REGULAR' ? 'today' : 'last session'}`);
  if (rangePct !== null && rangePct >= 0.03) reasons.push(`${(rangePct * 100).toFixed(1)}% day range`);
  if (gapPct !== null && Math.abs(gapPct) >= 0.03) reasons.push(`Gapped ${signedPct(gapPct)}`);
  if (spreadPct !== null && spreadPct <= 0.001) reasons.push('Tight spread');

  const flags: string[] = [];
  if (quote.earningsAt !== null && Math.abs(quote.earningsAt - now) <= 1.5 * 86400000) flags.push(quote.earningsAt > now ? 'Earnings soon' : 'Just reported');
  if (spreadPct !== null && spreadPct > 0.005) flags.push(`Wide spread ${(spreadPct * 100).toFixed(1)}%`);
  if (Math.abs(quote.changePct) >= 0.2) flags.push('Extreme move - chasing risk');
  if (quote.price < 10) flags.push('Low price - big % swings');
  if (quote.marketCap !== null && quote.marketCap < 2e9) flags.push('Small cap');

  return { ...quote, dollarVolume, avgDollarVolume, rvol, rangePct, gapPct, spreadPct, score, reasons, flags };
};

const SORTS: Record<HotSort, (stock: HotStock) => number> = {
  score: stock => stock.score,
  rvol: stock => stock.rvol ?? 0,
  dollarVolume: stock => stock.dollarVolume,
  move: stock => Math.abs(stock.changePct),
  range: stock => stock.rangePct ?? 0,
};

export const rankHotStocks = (quotes: HotQuote[], filters: HotFilters, sort: HotSort, now = Date.now()): HotStock[] =>
  quotes
    .filter(quote => quote.price >= filters.minPrice
      && (quote.marketCap === null || quote.marketCap >= filters.minMarketCap)
      && (filters.direction === 'all' || (filters.direction === 'up' ? quote.changePct > 0 : quote.changePct < 0)))
    .map(quote => scoreHotStock(quote, now))
    .filter(stock => stock.avgDollarVolume >= filters.minAvgDollarVolume)
    .sort((a, b) => SORTS[sort](b) - SORTS[sort](a) || b.dollarVolume - a.dollarVolume);

// Same-origin route (server/hotStocks.ts), which reads Yahoo's screeners server-side.
export const fetchHotStocks = async (signal?: AbortSignal): Promise<HotStocksResponse> => {
  const response = await fetch('/api/hot-stocks', { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Hot stocks lookup failed (${response.status}).`);
  // A server without this route answers with the app's index.html instead.
  if (!data || !Array.isArray(data.quotes)) throw new Error('The hot stocks service isn\'t available on this server yet - restart the dev server or redeploy.');
  return data as HotStocksResponse;
};
