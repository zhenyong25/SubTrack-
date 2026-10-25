import type { CryptoExchange, CryptoSource } from '../types';
import type { RawBalance, ScanResult } from './cryptoScanService';

// Exchange accounts, read with a READ-ONLY API key. The key is kept in this browser only (never in
// the database): each sync sends it to the app's server route (server/cryptoExchanges.ts), which
// signs the request to the exchange and returns balances without storing it.

export interface ExchangeInfo {
  id: CryptoExchange;
  name: string;
  domain: string;
  color: string;
  needsPassphrase?: boolean;
  secretLabel: string;
  keyHelp: string; // where to create a read-only key
}

export const EXCHANGES: Record<CryptoExchange, ExchangeInfo> = {
  binance: { id: 'binance', name: 'Binance', domain: 'binance.com', color: '#f0b90b', secretLabel: 'Secret key', keyHelp: 'Profile → API Management → Create API → System generated. Leave only "Enable Reading" ticked.' },
  coinbase: { id: 'coinbase', name: 'Coinbase', domain: 'coinbase.com', color: '#0052ff', secretLabel: 'Private key', keyHelp: 'Coinbase Developer Platform → API keys → Create. Give it "View" permission only. Paste the key name and the private key.' },
  okx: { id: 'okx', name: 'OKX', domain: 'okx.com', color: '#0f172a', needsPassphrase: true, secretLabel: 'Secret key', keyHelp: 'Profile → API keys → Create API key with "Read" permission only. Keep the passphrase you choose.' },
  bybit: { id: 'bybit', name: 'Bybit', domain: 'bybit.com', color: '#f7a600', secretLabel: 'API secret', keyHelp: 'Account → API → Create new key → System-generated, "Read-Only".' },
  kraken: { id: 'kraken', name: 'Kraken', domain: 'kraken.com', color: '#5741d9', secretLabel: 'Private key', keyHelp: 'Settings → API → Create API key with only "Query Funds" permission.' },
};

export const exchangeLogo = (exchange: CryptoExchange) => `https://www.google.com/s2/favicons?domain=${EXCHANGES[exchange].domain}&sz=64`;

// ------------------------------------------------------------------------------- device keys

export interface ExchangeKeys {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

const KEYS_STORAGE = 'subtrack_crypto_exchange_keys_v1';

const readKeys = (): Record<string, ExchangeKeys> => {
  try { return JSON.parse(localStorage.getItem(KEYS_STORAGE) || '{}') || {}; } catch { return {}; }
};

export const getExchangeKeys = (sourceId: string): ExchangeKeys | undefined => readKeys()[sourceId];

export const setExchangeKeys = (sourceId: string, keys: ExchangeKeys | null) => {
  const all = readKeys();
  if (keys) all[sourceId] = keys;
  else delete all[sourceId];
  try { localStorage.setItem(KEYS_STORAGE, JSON.stringify(all)); } catch { /* storage blocked */ }
};

// ------------------------------------------------------------------------------- pricing keys

// Exchange balances are tickers, not contracts. Well-known ones are priced live from DefiLlama by
// CoinGecko id (same as wallets); anything else uses the exchange's own price from the last sync.
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana', XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin',
  TRX: 'tron', TON: 'the-open-network', AVAX: 'avalanche-2', LINK: 'chainlink', DOT: 'polkadot', POL: 'polygon-ecosystem-token',
  MATIC: 'matic-network', LTC: 'litecoin', BCH: 'bitcoin-cash', SHIB: 'shiba-inu', UNI: 'uniswap', ATOM: 'cosmos', NEAR: 'near',
  APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', SUI: 'sui', PEPE: 'pepe', USDT: 'tether', USDC: 'usd-coin', FDUSD: 'first-digital-usd',
  DAI: 'dai', XLM: 'stellar', ETC: 'ethereum-classic', FIL: 'filecoin', HBAR: 'hedera-hashgraph', ICP: 'internet-computer',
  INJ: 'injective-protocol', SEI: 'sei-network', TIA: 'celestia', WLD: 'worldcoin-wld', ENA: 'ethena', AAVE: 'aave', MKR: 'maker',
  RENDER: 'render-token', FET: 'fetch-ai', ONDO: 'ondo-finance', JUP: 'jupiter-exchange-solana', WIF: 'dogwifcoin', BONK: 'bonk',
  CRO: 'crypto-com-chain', OKB: 'okb', KAS: 'kaspa', XMR: 'monero', ALGO: 'algorand', VET: 'vechain', SAND: 'the-sandbox',
  MANA: 'decentraland', AXS: 'axie-infinity', MNT: 'mantle', PYUSD: 'paypal-usd', USDE: 'ethena-usde', WBTC: 'wrapped-bitcoin',
};

export const exchangePriceKey = (asset: string) => (COINGECKO_IDS[asset.toUpperCase()] ? `coingecko:${COINGECKO_IDS[asset.toUpperCase()]}` : `cex:${asset.toUpperCase()}`);

// "0.00123" -> base units at 18 decimals, so exchange amounts flow through the same maths as wallets.
export const decimalToRaw = (amount: string, decimals = 18): string => {
  const match = String(amount).trim().match(/^(\d*)(?:\.(\d*))?$/);
  if (!match) {
    const number = Number(amount);
    return Number.isFinite(number) && number > 0 ? decimalToRaw(number.toFixed(decimals), decimals) : '0';
  }
  const whole = match[1] || '0';
  const fraction = (match[2] || '').slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole + fraction).toString();
};

// -------------------------------------------------------------------------------------- scan

interface ServerBalance { asset: string; amount: string; wallet: string; priceUsd?: number; change24h?: number }

export const scanExchange = async (source: CryptoSource, signal?: AbortSignal): Promise<ScanResult> => {
  if (source.kind !== 'exchange' || !source.exchange) return { balances: [], errors: [] };
  const keys = getExchangeKeys(source.id);
  if (!keys) return { balances: [], errors: ['No API key on this device - edit the exchange to add it'] };
  const response = await fetch('/api/crypto/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exchange: source.exchange, ...keys }),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `${EXCHANGES[source.exchange].name} sync failed (${response.status})`);
  const balances: RawBalance[] = (data?.balances || []).map((balance: ServerBalance) => ({
    priceKey: exchangePriceKey(balance.asset),
    rawAmount: decimalToRaw(balance.amount),
    decimals: 18,
    symbol: balance.asset.toUpperCase(),
    wallet: balance.wallet,
    priceUsd: balance.priceUsd,
    change24h: balance.change24h,
  }));
  return { balances, errors: data?.errors || [] };
};
