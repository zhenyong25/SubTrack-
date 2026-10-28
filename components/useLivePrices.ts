import { useEffect, useRef, useState } from 'react';
import { CURRENCIES, type InvestmentHolding, type InvestmentKind } from '../types';
import { fetchStockQuote } from '../services/stockQuoteService';

export const QUOTABLE_KINDS: InvestmentKind[] = ['Stocks', 'Crypto'];
const POLL_INTERVAL_MS = 20 * 1000;

// Polls Stocks/Crypto prices every POLL_INTERVAL_MS while the component using it is mounted and
// the browser tab is actually visible (paused via the Page Visibility API otherwise, and resumed
// with an immediate refresh on refocus, rather than left running in a background tab indefinitely).
// Used by both Investments and Net worth, so the total moves with the market on either page.
// There's no free push/streaming feed for this, so "live" here means frequent polling of the
// same REST endpoint the manual refresh uses - refreshed one holding at a time rather than in
// parallel, since concurrent calls to onUpdateHolding could otherwise race (see its own
// comment in App.tsx for why that matters). Returns when the last cycle finished.
export const useLivePrices = (
  investments: InvestmentHolding[],
  onUpdateHolding: (holding: InvestmentHolding, silent?: boolean) => void,
): number | null => {
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  // Always reads the latest holdings and handler inside the poll loop without restarting the
  // interval every time a price updates `investments` (which would happen on every tick).
  const investmentsRef = useRef(investments);
  const onUpdateRef = useRef(onUpdateHolding);
  useEffect(() => {
    investmentsRef.current = investments;
    onUpdateRef.current = onUpdateHolding;
  }, [investments, onUpdateHolding]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let isRefreshing = false;

    const runRefreshCycle = async () => {
      if (isRefreshing || document.visibilityState !== 'visible') return;
      const quotable = investmentsRef.current.filter(
        (investment): investment is InvestmentHolding & { symbol: string } =>
          QUOTABLE_KINDS.includes(investment.kind) && Boolean(investment.symbol),
      );
      if (quotable.length === 0) return;

      isRefreshing = true;
      for (const holding of quotable) {
        if (cancelled) break;
        try {
          const quote = await fetchStockQuote(holding.symbol);
          if (!cancelled) {
            // Re-read the holding: units or cost may have been edited while the quote was in flight.
            const latest = investmentsRef.current.find(item => item.id === holding.id);
            if (!latest) continue;
            const quoteCurrency = quote.currency && CURRENCIES.includes(quote.currency) ? quote.currency : latest.currency;
            if (latest.currentPrice !== quote.price || latest.currency !== quoteCurrency) {
              onUpdateRef.current({ ...latest, currentPrice: quote.price, currency: quoteCurrency }, true);
            }
          }
        } catch {
          // Best-effort background refresh - one bad symbol shouldn't stop the rest.
        }
      }
      isRefreshing = false;
      if (!cancelled) setRefreshedAt(Date.now());
    };

    const scheduleNext = () => {
      timeoutId = setTimeout(() => {
        runRefreshCycle().finally(() => {
          if (!cancelled) scheduleNext();
        });
      }, POLL_INTERVAL_MS);
    };

    runRefreshCycle().finally(() => {
      if (!cancelled) scheduleNext();
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') runRefreshCycle();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return refreshedAt;
};
