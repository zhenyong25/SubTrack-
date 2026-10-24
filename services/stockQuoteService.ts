export interface StockQuote {
  symbol: string;
  price: number;
  currency: string | null;
  name: string | null;
}

export interface StockCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StockIntradayHistory {
  symbol: string;
  currency: string | null;
  name?: string | null;
  currentPrice?: number | null;
  previousClose?: number | null;
  marketState?: string | null;
  exchange?: string | null;
  exchangeTimezone?: string | null;
  candles: StockCandle[];
}

export type StockHistoryInterval = '1m' | '5m' | '15m' | '60m' | '1d';
export type StockHistoryRange = '1d' | '5d' | '1mo' | '60d' | '3mo' | '1y' | 'max';

// Yahoo Finance lists Hong Kong stocks as a zero-padded 4-digit code plus ".HK" (Tencent is
// 0700.HK; "700.HK" returns nothing), while people usually write them as 700, 00700 or HK:700.
// So a bare 1-5 digit number, or one written with an HK prefix or suffix, is treated as an HK
// code and rewritten to Yahoo's form. Other markets that use numeric codes (Tokyo's .T, Shanghai's
// .SS) need their suffix, so they pass through unchanged, as do US tickers like AAPL or BRK-B.
const HK_CODE_PATTERN = /^(?:(?:HK|HKG|HKEX|SEHK)[:.\s-]?)?(\d{1,5})(?:\.HK)?$/;

export const normalizeTickerSymbol = (input: string): string => {
  const compact = input.trim().toUpperCase().replace(/\s+/g, ' ');
  const hkMatch = compact.match(HK_CODE_PATTERN);
  if (!hkMatch) return compact.replace(/\s+/g, '');
  const code = hkMatch[1].replace(/^0+(?=\d)/, '');
  return `${code.padStart(4, '0')}.HK`;
};

export const isHongKongSymbol = (symbol?: string) => Boolean(symbol && /\.HK$/i.test(symbol.trim()));

// Same-origin route (server/index.ts in production, a Vite dev-server middleware locally),
// not Yahoo Finance directly - their quote endpoint sends no CORS headers, so a direct
// browser call would be blocked. It's an unofficial, undocumented API with no key or signup,
// which is convenient but means it can change or go away without notice.
export const fetchStockQuote = async (symbol: string): Promise<StockQuote> => {
  const trimmed = normalizeTickerSymbol(symbol);
  if (!trimmed) throw new Error('Enter a symbol first.');

  const response = await fetch(`/api/stock-quote?symbol=${encodeURIComponent(trimmed)}`);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error?.message || `Price lookup failed (${response.status}).`);
  }

  return data as StockQuote;
};

export const fetchStockIntradayHistory = async (
  symbol: string,
  interval: StockHistoryInterval,
  signal?: AbortSignal,
  range: StockHistoryRange = '5d',
): Promise<StockIntradayHistory> => {
  const trimmed = normalizeTickerSymbol(symbol);
  if (!trimmed) throw new Error('Enter a symbol first.');

  const response = await fetch(`/api/stock-history?symbol=${encodeURIComponent(trimmed)}&interval=${interval}&range=${range}`, { signal });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error?.message || `Intraday history lookup failed (${response.status}).`);
  }

  return data as StockIntradayHistory;
};
