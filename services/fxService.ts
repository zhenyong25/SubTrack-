import { fetchStockQuote } from './stockQuoteService';
import { convertCurrency } from './storageService';

// Units of `currency` per USD: live from Yahoo Finance (e.g. USDSGD=X), else the app's fixed table.
export type FxRate = { rate: number; live: boolean };

export const fallbackRate = (currency: string): FxRate => ({ rate: convertCurrency(1, 'USD', currency), live: false });

export const fetchUsdRate = async (currency: string): Promise<FxRate> => {
  if (currency === 'USD') return { rate: 1, live: true };
  try {
    const quote = await fetchStockQuote(`USD${currency}=X`);
    if (Number.isFinite(quote.price) && quote.price > 0) return { rate: quote.price, live: true };
  } catch { /* offline or no quote - use the fixed rate */ }
  return fallbackRate(currency);
};
