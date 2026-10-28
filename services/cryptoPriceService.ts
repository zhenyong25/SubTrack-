// Live crypto prices from DefiLlama's free coins API (no key, browser-callable). Keys are
// "coingecko:<id>" for native coins and "<chain>:<contract>" for tokens; token responses also
// carry the symbol and decimals, which the scanners use to read raw balances.

const LLAMA = 'https://coins.llama.fi';
const BATCH = 60; // keys per request, keeps URLs a sensible length

export interface CoinPrice {
  price: number;
  timestamp?: number;
  symbol?: string;
  decimals?: number;
  confidence?: number;
}

export interface PricePoint { timestamp: number; price: number }

const chunks = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// Runs the batches a few at a time - DefiLlama rate-limits bursts, and a wallet full of airdropped
// tokens can produce dozens of batches.
const inBatches = async <T,>(items: T[][], run: (batch: T[]) => Promise<void>, concurrency = 3) => {
  const queue = items.slice();
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let batch = queue.shift(); batch; batch = queue.shift()) await run(batch);
  }));
};

const getJson = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Price lookup failed (${response.status})`);
  return response.json();
};

// DefiLlama answers token keys in whichever case it stores them; look them up case-insensitively.
const byLowerKey = <T,>(coins: Record<string, T> | undefined) => {
  const map = new Map<string, T>();
  Object.entries(coins || {}).forEach(([key, value]) => map.set(key.toLowerCase(), value));
  return map;
};

export const fetchPrices = async (keys: string[], signal?: AbortSignal): Promise<Map<string, CoinPrice>> => {
  const unique = [...new Set(keys)];
  const result = new Map<string, CoinPrice>();
  await inBatches(chunks(unique, BATCH), async batch => {
    const data = await getJson(`${LLAMA}/prices/current/${batch.map(encodeURIComponent).join(',')}`, signal);
    const coins = byLowerKey<CoinPrice>(data?.coins);
    batch.forEach(key => {
      const coin = coins.get(key.toLowerCase());
      if (coin && Number.isFinite(coin.price)) result.set(key, coin);
    });
  });
  return result;
};

// Percentage price change over the last 24 hours, e.g. -2.5 for -2.5%.
export const fetchChanges24h = async (keys: string[], signal?: AbortSignal): Promise<Map<string, number>> => {
  const unique = [...new Set(keys)];
  const result = new Map<string, number>();
  await inBatches(chunks(unique, BATCH), async batch => {
    const data = await getJson(`${LLAMA}/percentage/${batch.map(encodeURIComponent).join(',')}?period=24h`, signal);
    const coins = byLowerKey<number>(data?.coins);
    batch.forEach(key => {
      const change = coins.get(key.toLowerCase());
      if (Number.isFinite(change)) result.set(key, change!);
    });
  });
  return result;
};

export type HistoryRange = '24h' | '7d' | '30d' | '90d' | '1y';
const HISTORY: Record<HistoryRange, { seconds: number; period: string; points: number }> = {
  '24h': { seconds: 86400, period: '1h', points: 25 },
  '7d': { seconds: 7 * 86400, period: '4h', points: 43 },
  '30d': { seconds: 30 * 86400, period: '1d', points: 31 },
  '90d': { seconds: 90 * 86400, period: '2d', points: 46 },
  '1y': { seconds: 365 * 86400, period: '1w', points: 53 },
};

// Price history for each key over the range, oldest first.
export const fetchHistory = async (keys: string[], range: HistoryRange, signal?: AbortSignal): Promise<Map<string, PricePoint[]>> => {
  const { seconds, period, points } = HISTORY[range];
  const start = Math.floor(Date.now() / 1000) - seconds;
  const unique = [...new Set(keys)];
  const result = new Map<string, PricePoint[]>();
  // DefiLlama refuses a chart request over 500 data points in total (coins x points).
  await inBatches(chunks(unique, Math.max(1, Math.floor(500 / points))), async batch => {
    const data = await getJson(`${LLAMA}/chart/${batch.map(encodeURIComponent).join(',')}?start=${start}&span=${points}&period=${period}`, signal);
    const coins = byLowerKey<{ prices?: PricePoint[] }>(data?.coins);
    batch.forEach(key => {
      const prices = coins.get(key.toLowerCase())?.prices;
      if (prices?.length) result.set(key, prices.slice().sort((a, b) => a.timestamp - b.timestamp));
    });
  });
  return result;
};
