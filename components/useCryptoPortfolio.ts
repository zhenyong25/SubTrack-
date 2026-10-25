import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CryptoSource } from '../types';
import { scanWallet, type RawBalance } from '../services/cryptoScanService';
import { scanExchange } from '../services/cryptoExchangeService';
import { fetchChanges24h, fetchPrices, type CoinPrice } from '../services/cryptoPriceService';
import { priceBalances, priceKeysFor, summarize, type PricedBalance } from '../services/cryptoPortfolio';

// Live crypto portfolio: scans each wallet's and exchange's balances (every few minutes - they change only when
// you transact) and re-prices everything often (crypto trades 24/7). The last results are kept on
// this device so the dashboard shows instantly, then refreshes.

const CACHE_KEY = 'subtrack_crypto_cache_v1';
const PRICE_EVERY_MS = 30_000;
const SCAN_EVERY_MS = 5 * 60_000;
const RETRY_AFTER_ERROR_MS = 55_000;

export interface SourceScan {
  balances: RawBalance[];
  errors: string[];
  scannedAt?: number;
  scanning?: boolean;
}

interface Cache {
  scans: Record<string, SourceScan>;
  prices: [string, CoinPrice][];
  changes: [string, number][];
  pricedAt?: number;
}

const readCache = (): Cache => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (parsed && typeof parsed === 'object') return { scans: parsed.scans || {}, prices: parsed.prices || [], changes: parsed.changes || [], pricedAt: parsed.pricedAt };
  } catch { /* unreadable cache - start fresh */ }
  return { scans: {}, prices: [], changes: [] };
};

const writeCache = (cache: Cache) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full or blocked - not essential */ }
};

const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

export const useCryptoPortfolio = (sources: CryptoSource[], manual: PricedBalance[]) => {
  const initial = useRef(readCache()).current;
  const [scans, setScans] = useState<Record<string, SourceScan>>(initial.scans);
  const [prices, setPrices] = useState(() => new Map(initial.prices));
  const [changes, setChanges] = useState(() => new Map(initial.changes));
  const [pricedAt, setPricedAt] = useState<number | undefined>(initial.pricedAt);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [pricing, setPricing] = useState(false);
  const scansRef = useRef(scans);
  scansRef.current = scans;
  // Keys that came back without a price - skipped on the quick refreshes until the next scan.
  const noPrice = useRef(new Set<string>());

  const sourceIds = sources.map(source => source.id).join('|');
  const scanSource = useCallback(async (source: CryptoSource) => {
    setScans(current => ({ ...current, [source.id]: { ...(current[source.id] || { balances: [], errors: [] }), scanning: true } }));
    try {
      const result = source.kind === 'exchange' ? await scanExchange(source) : await scanWallet(source);
      noPrice.current.clear();
      setScans(current => {
        // A network that couldn't be read this time keeps its last known balances, rather than
        // dropping out of the total because of a passing network or rate-limit hiccup.
        const kept = (current[source.id]?.balances || []).filter(balance => balance.chain && result.failedChains?.includes(balance.chain));
        return { ...current, [source.id]: { ...result, balances: [...result.balances, ...kept], scannedAt: Date.now(), scanning: false } };
      });
    } catch (error) {
      setScans(current => ({
        ...current,
        [source.id]: { ...(current[source.id] || { balances: [] }), errors: [error instanceof Error ? error.message : 'Scan failed'], scannedAt: Date.now(), scanning: false },
      }));
    }
  }, []);

  const rescan = useCallback((sourceId?: string) => {
    sources.filter(source => !sourceId || source.id === sourceId).forEach(source => void scanSource(source));
  }, [sources, scanSource]);

  // Scan new or stale sources now, then keep them fresh.
  useEffect(() => {
    const scanStale = () => {
      if (!isVisible()) return;
      sources.forEach(source => {
        const scan = scansRef.current[source.id];
        // A scan that hit errors is retried after a minute instead of the usual five.
        const due = scan?.errors?.length ? RETRY_AFTER_ERROR_MS : SCAN_EVERY_MS;
        if (!scan?.scanning && (!scan?.scannedAt || Date.now() - scan.scannedAt > due)) void scanSource(source);
      });
    };
    scanStale();
    const timer = window.setInterval(scanStale, 60_000);
    document.addEventListener('visibilitychange', scanStale);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', scanStale); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIds, scanSource]);

  const allRaw = useMemo(() => sources.flatMap(source => scans[source.id]?.balances || []), [sources, scans]);
  const priceKeys = useMemo(() => priceKeysFor(allRaw), [allRaw]);
  const priceKeyList = priceKeys.join(',');

  const refreshPrices = useCallback(async (force = false) => {
    const keys = priceKeys.filter(key => force || !noPrice.current.has(key));
    if (!keys.length) return;
    setPricing(true);
    try {
      const [nextPrices, nextChanges] = await Promise.all([fetchPrices(keys), fetchChanges24h(keys).catch(() => new Map<string, number>())]);
      keys.forEach(key => { if (!nextPrices.has(key)) noPrice.current.add(key); });
      setPrices(current => new Map([...current, ...nextPrices]));
      setChanges(current => new Map([...current, ...nextChanges]));
      setPricedAt(Date.now());
      setPriceError(null);
    } catch (error) {
      setPriceError(error instanceof Error ? error.message : 'Price refresh failed');
    } finally {
      setPricing(false);
    }
  }, [priceKeyList]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refreshPrices(true);
    const tick = () => { if (isVisible()) void refreshPrices(); };
    const timer = window.setInterval(tick, PRICE_EVERY_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [refreshPrices]);

  // Keep the cache to the sources that still exist.
  useEffect(() => {
    const kept = Object.fromEntries(sources.map(source => [source.id, scans[source.id]]).filter(([, scan]) => scan && !(scan as SourceScan).scanning));
    const keys = new Set(priceKeys);
    writeCache({ scans: kept, prices: [...prices].filter(([key]) => keys.has(key)), changes: [...changes].filter(([key]) => keys.has(key)), pricedAt });
  }, [sources, scans, prices, changes, pricedAt, priceKeys]);

  const priced = useMemo(
    () => [...sources.flatMap(source => priceBalances(source.id, scans[source.id]?.balances || [], prices, changes)), ...manual],
    [sources, scans, prices, changes, manual],
  );
  const summary = useMemo(() => summarize(priced), [priced]);
  const scanning = sources.some(source => scans[source.id]?.scanning);

  return { scans, priced, summary, pricedAt, pricing, scanning, priceError, rescan, refreshPrices: () => refreshPrices(true) };
};

export type CryptoPortfolio = ReturnType<typeof useCryptoPortfolio>;
