import type { CryptoChain, CryptoSource } from '../types';
import { CHAINS, POPULAR_TOKENS } from './cryptoChains';

// Reads what a public wallet address holds, straight from public, keyless APIs that allow
// browser calls: mempool.space (Bitcoin), Blockscout + public JSON-RPC (EVM networks),
// Solana's public RPC and TronGrid. Amounts come back in base units; pricing happens later.

export interface RawBalance {
  chain?: CryptoChain; // absent for exchange balances
  priceKey: string; // DefiLlama key, e.g. "coingecko:bitcoin" or "base:0x833589..."
  rawAmount: string; // integer amount in the token's smallest unit
  decimals?: number; // when known here; otherwise taken from the price response
  symbol?: string;
  name?: string;
  logo?: string;
  flagged?: boolean; // the explorer marks the token as spam/scam
  unlisted?: boolean; // the explorer knows no market price for it - not worth a price lookup
  wallet?: string; // exchange balances: which part of the account (Spot, Funding, Earn...)
  priceUsd?: number; // exchange balances: the exchange's own price, used when there's no live one
  change24h?: number;
}

export interface ScanResult {
  balances: RawBalance[];
  errors: string[]; // one per network that couldn't be read; the rest still count
  failedChains?: CryptoChain[]; // those networks, so their last known balances can be kept
}

const TIMEOUT_MS = 15000;

const withTimeout = (signal?: AbortSignal) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());
  return { signal: controller.signal, done: () => clearTimeout(timer) };
};

const getJson = async (url: string, init: RequestInit = {}, signal?: AbortSignal) => {
  const timed = withTimeout(signal);
  try {
    const response = await fetch(url, { ...init, signal: timed.signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
    return await response.json();
  } finally {
    timed.done();
  }
};

const positive = (raw: string | bigint | number | null | undefined) => {
  try { return raw != null && BigInt(raw) > 0n; } catch { return false; }
};

// ------------------------------------------------------------------------------------- Bitcoin

const scanBitcoin = async (address: string, signal?: AbortSignal): Promise<RawBalance[]> => {
  const data = await getJson(`https://mempool.space/api/address/${encodeURIComponent(address)}`, {}, signal);
  if (!data) return [];
  const sats = (stats: { funded_txo_sum?: number; spent_txo_sum?: number } = {}) => BigInt(stats.funded_txo_sum || 0) - BigInt(stats.spent_txo_sum || 0);
  const total = sats(data.chain_stats) + sats(data.mempool_stats);
  return positive(total) ? [{ chain: 'bitcoin', priceKey: CHAINS.bitcoin.nativePriceKey, rawAmount: total.toString(), decimals: 8, symbol: 'BTC', name: 'Bitcoin' }] : [];
};

// ----------------------------------------------------------------------------------------- EVM

const balanceOfCall = (owner: string) => `0x70a08231${owner.slice(2).toLowerCase().padStart(64, '0')}`;

// Free public RPCs cap batch sizes differently (dRPC's free plan allows 3 calls per batch on some
// networks), so calls go in small batches, one after another - every endpoint accepts that.
const RPC_BATCH_SIZE = 3;

const rpcBatchOn = async (endpoint: string, calls: { method: string; params: unknown[] }[], signal?: AbortSignal) => {
  const results: (string | undefined)[] = [];
  for (let start = 0; start < calls.length; start += RPC_BATCH_SIZE) {
    const chunk = calls.slice(start, start + RPC_BATCH_SIZE);
    const body = JSON.stringify(chunk.map((call, offset) => ({ jsonrpc: '2.0', id: start + offset, ...call })));
    const data = await getJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, signal);
    if (!Array.isArray(data)) throw new Error(data?.error?.message || 'unexpected RPC response');
    const byId = new Map<number, { id: number; result?: string; error?: { message?: string } }>(data.map((entry: { id: number; result?: string; error?: { message?: string } }) => [entry.id, entry]));
    // The native balance can't fail for a healthy node; if it did (rate limit, plan limit), the
    // endpoint is refusing us - try the next one. A token call can fail on its own (e.g. a
    // contract that isn't deployed on this chain) without that meaning anything.
    if (start === 0 && !byId.get(0)?.result) throw new Error(byId.get(0)?.error?.message || 'RPC refused the request');
    chunk.forEach((_, offset) => results.push(byId.get(start + offset)?.result));
  }
  return results;
};

const rpcBatch = async (chain: CryptoChain, calls: { method: string; params: unknown[] }[], signal?: AbortSignal) => {
  let lastError: unknown;
  for (const endpoint of CHAINS[chain].rpc || []) {
    try {
      return await rpcBatchOn(endpoint, calls, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  // Report the cause without dumping a provider's sales pitch into the warning.
  const message = lastError instanceof Error ? lastError.message.split(/[.!]\s/)[0] : '';
  throw new Error(`no public ${CHAINS[chain].name} node answered${message ? ` (last: ${message})` : ''}`);
};

// Native coin plus a fixed list of tokens, read with small batched JSON-RPC requests.
const scanEvmRpc = async (chain: CryptoChain, address: string, extraTokens: string[], signal?: AbortSignal): Promise<RawBalance[]> => {
  const info = CHAINS[chain];
  const tokens = [...new Set([...(POPULAR_TOKENS[chain] || []), ...extraTokens].map(token => token.toLowerCase()))];
  const results = await rpcBatch(chain, [
    { method: 'eth_getBalance', params: [address, 'latest'] },
    ...tokens.map(token => ({ method: 'eth_call', params: [{ to: token, data: balanceOfCall(address) }, 'latest'] })),
  ], signal);
  const balances: RawBalance[] = [];
  if (positive(results[0])) balances.push({ chain, priceKey: info.nativePriceKey, rawAmount: BigInt(results[0]!).toString(), decimals: info.nativeDecimals, symbol: info.nativeSymbol });
  tokens.forEach((token, index) => {
    const raw = results[index + 1];
    if (raw && raw !== '0x' && positive(raw)) balances.push({ chain, priceKey: `${info.llamaChain}:${token}`, rawAmount: BigInt(raw).toString() });
  });
  return balances;
};

// Ethereum mainnet: Blockscout finds every ERC-20 the address holds.
const scanEthereumBlockscout = async (address: string, signal?: AbortSignal): Promise<RawBalance[]> => {
  const base = `https://eth.blockscout.com/api/v2/addresses/${address}`;
  const [account, tokens] = await Promise.all([getJson(base, {}, signal), getJson(`${base}/token-balances`, {}, signal)]);
  const balances: RawBalance[] = [];
  if (positive(account?.coin_balance)) balances.push({ chain: 'ethereum', priceKey: CHAINS.ethereum.nativePriceKey, rawAmount: String(account.coin_balance), decimals: 18, symbol: 'ETH', name: 'Ether' });
  (Array.isArray(tokens) ? tokens : []).forEach((entry: { value?: string; token?: { type?: string; address_hash?: string; address?: string; decimals?: string; symbol?: string; name?: string; icon_url?: string; reputation?: string; exchange_rate?: string | null } }) => {
    const token = entry.token;
    const contract = token?.address_hash || token?.address;
    if (!token || token.type !== 'ERC-20' || !contract || !positive(entry.value)) return;
    balances.push({
      chain: 'ethereum',
      priceKey: `ethereum:${contract.toLowerCase()}`,
      rawAmount: String(entry.value),
      decimals: token.decimals != null ? Number(token.decimals) : undefined,
      symbol: token.symbol || undefined,
      name: token.name || undefined,
      logo: token.icon_url || undefined,
      flagged: Boolean(token.reputation && token.reputation !== 'ok'),
      unlisted: !token.exchange_rate,
    });
  });
  return balances;
};

const scanEvm = async (chain: CryptoChain, address: string, extraTokens: string[], signal?: AbortSignal) => {
  if (chain !== 'ethereum') return scanEvmRpc(chain, address, extraTokens, signal);
  // Both at once: Blockscout finds every token but can be slow for busy wallets; the RPC read
  // of popular tokens is the fallback, ready by the time Blockscout gives up.
  const fallback = scanEvmRpc(chain, address, extraTokens, signal);
  fallback.catch(() => undefined);
  try {
    return await scanEthereumBlockscout(address, signal);
  } catch {
    return fallback;
  }
};

// -------------------------------------------------------------------------------------- Solana

// publicnode answers browsers directly. The official endpoint refuses browser requests (403) and
// some server providers, so it's only reached through the app's own server (server/solanaRpc.ts)
// as a fallback - from your own machine in local dev that relay works for every lookup.
const SOLANA_RPCS = ['https://solana-rpc.publicnode.com', '/api/crypto/solana'];
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];

const solanaCall = async (method: string, params: unknown[], signal?: AbortSignal) => {
  let lastError: unknown;
  for (const endpoint of SOLANA_RPCS) {
    try {
      const data = await getJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }, signal);
      if (data?.error) throw new Error(data.error.message || 'Solana RPC error');
      return data?.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Solana RPC unavailable');
};

const scanSolana = async (address: string, signal?: AbortSignal): Promise<RawBalance[]> => {
  const [lamports, ...programs] = await Promise.all([
    solanaCall('getBalance', [address], signal),
    ...TOKEN_PROGRAMS.map(programId => solanaCall('getTokenAccountsByOwner', [address, { programId }, { encoding: 'jsonParsed' }], signal)),
  ]);
  const balances: RawBalance[] = [];
  if (positive(lamports?.value)) balances.push({ chain: 'solana', priceKey: CHAINS.solana.nativePriceKey, rawAmount: String(lamports.value), decimals: 9, symbol: 'SOL', name: 'Solana' });
  // One mint can sit in several token accounts; add them up. Decimals 0 are NFTs - skipped.
  const byMint = new Map<string, { raw: bigint; decimals: number }>();
  programs.forEach(program => (program?.value || []).forEach((account: { account?: { data?: { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } } } } } }) => {
    const info = account.account?.data?.parsed?.info;
    const amount = info?.tokenAmount;
    if (!info?.mint || !amount?.amount || !amount.decimals || !positive(amount.amount)) return;
    const current = byMint.get(info.mint) || { raw: 0n, decimals: amount.decimals };
    byMint.set(info.mint, { raw: current.raw + BigInt(amount.amount), decimals: amount.decimals });
  }));
  byMint.forEach(({ raw, decimals }, mint) => balances.push({ chain: 'solana', priceKey: `solana:${mint}`, rawAmount: raw.toString(), decimals }));
  return balances;
};

// ---------------------------------------------------------------------------------------- Tron

const scanTron = async (address: string, signal?: AbortSignal): Promise<RawBalance[]> => {
  const data = await getJson(`https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}`, {}, signal);
  const account = data?.data?.[0];
  if (!account) return []; // never activated
  // Staked TRX (Stake 2.0) is still the owner's, so it counts towards the TRX balance.
  const staked = (account.frozenV2 || []).reduce((sum: bigint, entry: { amount?: number }) => sum + BigInt(entry.amount || 0), 0n);
  const trx = BigInt(account.balance || 0) + staked;
  const balances: RawBalance[] = [];
  if (positive(trx)) balances.push({ chain: 'tron', priceKey: CHAINS.tron.nativePriceKey, rawAmount: trx.toString(), decimals: 6, symbol: 'TRX', name: 'Tron' });
  (account.trc20 || []).forEach((entry: Record<string, string>) => Object.entries(entry).forEach(([contract, raw]) => {
    if (positive(raw)) balances.push({ chain: 'tron', priceKey: `tron:${contract}`, rawAmount: String(raw) });
  }));
  return balances;
};

// -------------------------------------------------------------------------------------- entry

const scanChain = (chain: CryptoChain, source: CryptoSource, signal?: AbortSignal) => {
  const address = source.address!.trim();
  const family = CHAINS[chain].family;
  if (family === 'bitcoin') return scanBitcoin(address, signal);
  if (family === 'solana') return scanSolana(address, signal);
  if (family === 'tron') return scanTron(address, signal);
  const extra = (source.customTokens || []).filter(token => token.chain === chain).map(token => token.contract);
  return scanEvm(chain, address, extra, signal);
};

export const scanWallet = async (source: CryptoSource, signal?: AbortSignal): Promise<ScanResult> => {
  if (source.kind !== 'wallet' || !source.address) return { balances: [], errors: [] };
  const chains = source.chains?.length ? source.chains : [];
  const results = await Promise.allSettled(chains.map(chain => scanChain(chain, source, signal)));
  const balances: RawBalance[] = [];
  const errors: string[] = [];
  const failedChains: CryptoChain[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') balances.push(...result.value);
    else failedChains.push(chains[index]);
    if (result.status === 'rejected') errors.push(`${CHAINS[chains[index]].name}: ${result.reason instanceof Error ? result.reason.message : 'could not be read'}`);
  });
  return { balances, errors, failedChains };
};
