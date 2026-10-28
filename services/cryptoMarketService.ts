import { exchangePriceKey } from './cryptoExchangeService';
import type { PricedBalance } from './cryptoPortfolio';
import { fetchChanges24h, fetchHistory, fetchPrices, type CoinPrice, type HistoryRange, type PricePoint } from './cryptoPriceService';

export interface CryptoMarket { key: string; symbol: string; name?: string; logo?: string }
export const manualCryptoPriceKey = (symbol: string) => {
  const key = exchangePriceKey(symbol.toUpperCase().replace(/[-/]?(USDT|USD)$/, '') || symbol);
  return key.startsWith('cex:') ? undefined : key;
};
export function priceManualCrypto(balances: PricedBalance[], prices: Map<string, CoinPrice>, changes: Map<string, number>) {
  return balances.map(balance => {
    const priceKey = balance.priceKey || manualCryptoPriceKey(balance.symbol);
    const quote = priceKey ? prices.get(priceKey) : undefined;
    const livePrice = quote && quote.price > 0 && (quote.confidence == null || quote.confidence >= 0.8) ? quote.price : undefined;
    return { ...balance, priceKey, priceUsd: livePrice ?? balance.priceUsd, valueUsd: livePrice == null ? balance.valueUsd : balance.amount * livePrice, change24h: priceKey ? changes.get(priceKey) ?? balance.change24h : balance.change24h };
  });
}
export function cryptoMarkets(symbol: string, balances: PricedBalance[]): CryptoMarket[] {
  const matches = balances.filter(balance => balance.symbol.toUpperCase() === symbol.toUpperCase()).sort((a, b) => b.valueUsd - a.valueUsd);
  const markets = new Map<string, CryptoMarket>();
  for (const balance of matches) {
    // Contract identity takes precedence. Never substitute a similarly named coin for a token.
    const key = balance.priceKey && !balance.priceKey.startsWith('cex:') ? balance.priceKey : !balance.chain ? manualCryptoPriceKey(balance.symbol) : undefined;
    if (key && !markets.has(key)) markets.set(key, { key, symbol: balance.symbol, name: balance.name, logo: balance.logo });
  }
  return [...markets.values()];
}
export function cleanCryptoHistory(points: PricePoint[], now = Date.now() / 1000) {
  const unique = new Map<number, PricePoint>();
  for (const point of points) if (Number.isFinite(point.timestamp) && point.timestamp > 0 && point.timestamp <= now && Number.isFinite(point.price) && point.price > 0) unique.set(point.timestamp, point);
  return [...unique.values()].sort((a, b) => a.timestamp - b.timestamp);
}
export async function fetchCryptoMarket(market: CryptoMarket, range: HistoryRange, signal?: AbortSignal) {
  const [quote, changes, history] = await Promise.allSettled([
    fetchPrices([market.key], signal), fetchChanges24h([market.key], signal), fetchHistory([market.key], range, signal),
  ]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const current = quote.status === 'fulfilled' ? quote.value.get(market.key) : undefined;
  const safeQuote = current && current.price > 0 && (current.confidence == null || current.confidence >= 0.8) ? current : undefined;
  const points = history.status === 'fulfilled' ? cleanCryptoHistory(history.value.get(market.key) || []) : [];
  if (!safeQuote && !points.length) throw new Error('Market price and history are unavailable for this asset. Please try again later.');
  return {
    price: safeQuote?.price,
    quoteTimestamp: safeQuote?.timestamp,
    change24h: changes.status === 'fulfilled' ? changes.value.get(market.key) : undefined,
    points,
    historyError: history.status === 'rejected' ? 'Price history could not be loaded. Try refreshing.' : points.length < 2 ? 'Not enough price history is available for this range.' : undefined,
    quoteError: !safeQuote ? 'Current market quote is unavailable; the chart shows historical prices only.' : undefined,
    fetchedAt: Date.now(),
  };
}
