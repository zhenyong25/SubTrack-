import type { CryptoChain } from '../types';

export interface AirdropInsight {
  id: string; name: string; slug: string; category: string; chains: string[];
  tvl: number; change7d?: number; listedAt?: number; website?: string;
}
export const AIRDROP_CHAIN_NAMES: Record<CryptoChain, string> = {
  bitcoin: 'Bitcoin', ethereum: 'Ethereum', base: 'Base', arbitrum: 'Arbitrum',
  optimism: 'Optimism', polygon: 'Polygon', bsc: 'Binance', solana: 'Solana', tron: 'Tron',
};
export const safeProjectUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    return url.href;
  } catch { return; }
};

// A missing token ticker is a research signal, never evidence of an announced airdrop.
export function parseAirdropInsights(data: unknown): AirdropInsight[] {
  if (!Array.isArray(data)) throw new Error('Unexpected response from DefiLlama.');
  const seen = new Set<string>();
  return data.flatMap(row => {
    if (!row || row.symbol !== '-' || row.gecko_id || row.cmcId || row.category === 'CEX' || row.category === 'Chain' || row.category === 'RWA' || row.category === 'Stablecoin Issuer' || typeof row.slug !== 'string' || !/^[a-z0-9-]+$/.test(row.slug) || typeof row.name !== 'string' || !Array.isArray(row.chains) || !Number.isFinite(row.tvl) || row.tvl <= 0 || seen.has(row.slug)) return [];
    seen.add(row.slug);
    return [{ id: row.slug, slug: row.slug, name: row.name, category: typeof row.category === 'string' ? row.category : 'DeFi', chains: row.chains.filter((chain: unknown) => typeof chain === 'string'), tvl: row.tvl, change7d: Number.isFinite(row.change_7d) ? row.change_7d : undefined, listedAt: Number.isFinite(row.listedAt) ? row.listedAt : undefined, website: safeProjectUrl(row.url) }];
  });
}

let cache: { items: AirdropInsight[]; fetchedAt: number } | undefined;
let pending: Promise<NonNullable<typeof cache>> | undefined;
export async function fetchAirdropInsights(force = false) {
  if (!force && cache && Date.now() - cache.fetchedAt < 30 * 60_000) return cache;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch('https://api.llama.fi/protocols', { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`DefiLlama is unavailable (${response.status}).`);
    const items = parseAirdropInsights(await response.json());
    cache = { items, fetchedAt: Date.now() };
    return cache;
  })();
  try { return await pending; } finally { pending = undefined; }
}
