import type { CryptoChain } from '../types';
import { STABLECOINS } from './cryptoChains';
import type { CoinPrice, PricePoint } from './cryptoPriceService';
import type { RawBalance } from './cryptoScanService';

// Pure crypto-portfolio maths: raw on-chain amounts -> priced balances -> totals, allocation,
// 24h change and value history. No network calls here, so it's all unit-tested.

export interface PricedBalance {
  sourceId: string;
  chain?: CryptoChain; // absent for exchange and manual balances
  priceKey?: string;
  symbol: string;
  name?: string;
  logo?: string;
  wallet?: string;
  amount: number;
  priceUsd?: number;
  valueUsd: number;
  change24h?: number; // percent
  hidden?: 'unpriced' | 'spam' | 'dust';
}

// Price lookups only for balances that can have a real price: busy wallets collect thousands
// of airdropped spam tokens the explorer has already flagged or knows no market for. Exchange-only
// tickers ("cex:") are priced by the exchange itself.
export const priceKeysFor = (raw: RawBalance[]) => [...new Set(raw.filter(b => !b.flagged && !b.unlisted && !b.priceKey.startsWith('cex:')).map(b => b.priceKey))];

const MIN_CONFIDENCE = 0.8; // DefiLlama's own score; below this the price is unreliable (often spam)
const DUST_USD = 0.01;

// Base units -> a number, without losing precision on large integers along the way.
export const toUnits = (raw: string, decimals: number): number => {
  let value: bigint;
  try { value = BigInt(raw); } catch { return 0; }
  if (decimals <= 0) return Number(value);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, '0').slice(0, 18);
  return Number(`${whole}.${fraction}`);
};

export const priceBalances = (sourceId: string, raw: RawBalance[], prices: Map<string, CoinPrice>, changes: Map<string, number>): PricedBalance[] =>
  raw.map(balance => {
    // A live price when there is one; else the price the exchange reported with the balance.
    const price = prices.get(balance.priceKey) ?? (balance.priceUsd !== undefined ? { price: balance.priceUsd } : undefined);
    const decimals = balance.decimals ?? price?.decimals;
    const symbol = (balance.symbol || price?.symbol || '?').trim() || '?';
    const amount = decimals === undefined ? 0 : toUnits(balance.rawAmount, decimals);
    const priced: PricedBalance = {
      sourceId,
      chain: balance.chain,
      priceKey: balance.priceKey,
      symbol,
      name: balance.name,
      logo: balance.logo,
      wallet: balance.wallet,
      amount,
      priceUsd: price?.price,
      valueUsd: price && decimals !== undefined ? amount * price.price : 0,
      change24h: changes.get(balance.priceKey) ?? balance.change24h,
    };
    if (balance.flagged || (price?.confidence !== undefined && price.confidence < MIN_CONFIDENCE)) priced.hidden = 'spam';
    else if (!price || decimals === undefined) priced.hidden = 'unpriced';
    else if (priced.valueUsd < DUST_USD) priced.hidden = 'dust';
    return priced;
  });

export interface AssetRow {
  key: string;
  symbol: string;
  name?: string;
  logo?: string;
  amount: number;
  priceUsd?: number;
  valueUsd: number;
  change24h?: number;
  share: number; // of the visible total
  sourceIds: string[];
  chains: CryptoChain[];
  isStable: boolean;
}

export interface CryptoSummary {
  totalUsd: number;
  change24hUsd: number;
  change24hPct?: number;
  stableUsd: number;
  assets: AssetRow[]; // biggest first
  bySource: Record<string, number>;
  byChain: Record<string, number>;
  hidden: PricedBalance[];
}

// What a balance was worth 24 hours ago, given today's value and its % change.
const valueDayAgo = (balance: PricedBalance) =>
  balance.change24h === undefined || balance.change24h <= -100 ? balance.valueUsd : balance.valueUsd / (1 + balance.change24h / 100);

export const summarize = (balances: PricedBalance[]): CryptoSummary => {
  const visible = balances.filter(balance => !balance.hidden);
  const totalUsd = visible.reduce((sum, b) => sum + b.valueUsd, 0);
  const dayAgo = visible.reduce((sum, b) => sum + valueDayAgo(b), 0);
  const groups = new Map<string, PricedBalance[]>();
  visible.forEach(balance => {
    const key = balance.symbol.toUpperCase();
    groups.set(key, [...(groups.get(key) || []), balance]);
  });
  const assets: AssetRow[] = [...groups.entries()].map(([key, members]) => {
    const amount = members.reduce((sum, b) => sum + b.amount, 0);
    const valueUsd = members.reduce((sum, b) => sum + b.valueUsd, 0);
    const before = members.reduce((sum, b) => sum + valueDayAgo(b), 0);
    const known = members.some(b => b.change24h !== undefined);
    const top = members.slice().sort((a, b) => b.valueUsd - a.valueUsd)[0];
    return {
      key,
      symbol: top.symbol,
      name: members.find(b => b.name)?.name,
      logo: members.find(b => b.logo)?.logo,
      amount,
      priceUsd: amount > 0 ? valueUsd / amount : top.priceUsd,
      valueUsd,
      change24h: known && before > 0 ? (valueUsd / before - 1) * 100 : undefined,
      share: totalUsd > 0 ? valueUsd / totalUsd : 0,
      sourceIds: [...new Set(members.map(b => b.sourceId))],
      chains: [...new Set(members.map(b => b.chain).filter((c): c is CryptoChain => Boolean(c)))],
      isStable: STABLECOINS.has(key),
    };
  }).sort((a, b) => b.valueUsd - a.valueUsd);
  const bySource: Record<string, number> = {};
  const byChain: Record<string, number> = {};
  visible.forEach(b => {
    bySource[b.sourceId] = (bySource[b.sourceId] || 0) + b.valueUsd;
    const chain = b.chain || (b.sourceId === 'manual' ? 'manual' : 'exchange');
    byChain[chain] = (byChain[chain] || 0) + b.valueUsd;
  });
  return {
    totalUsd,
    change24hUsd: totalUsd - dayAgo,
    change24hPct: dayAgo > 0 ? (totalUsd / dayAgo - 1) * 100 : undefined,
    stableUsd: assets.filter(a => a.isStable).reduce((sum, a) => sum + a.valueUsd, 0),
    assets,
    bySource,
    byChain,
    hidden: balances.filter(balance => balance.hidden),
  };
};

// What today's holdings were worth over time: each amount x that coin's historical price.
// Balances without a price history (manual holdings, unknown coins) are held at today's value.
export const valueHistory = (balances: PricedBalance[], history: Map<string, PricePoint[]>): { timestamp: number; value: number }[] => {
  const visible = balances.filter(balance => !balance.hidden);
  const timeline = [...history.values()].sort((a, b) => b.length - a.length)[0]?.map(point => point.timestamp) || [];
  if (!timeline.length) return [];
  const priceAt = (points: PricePoint[], timestamp: number) => {
    let price = points[0].price;
    for (const point of points) {
      if (point.timestamp > timestamp) break;
      price = point.price;
    }
    return price;
  };
  return timeline.map(timestamp => ({
    timestamp,
    value: visible.reduce((sum, b) => {
      const points = b.priceKey ? history.get(b.priceKey) : undefined;
      return sum + (points?.length ? b.amount * priceAt(points, timestamp) : b.valueUsd);
    }, 0),
  }));
};
