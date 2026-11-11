// "Hot stocks" for the Trade tab: Yahoo Finance's predefined US screeners (most active, day
// gainers/losers, small caps with momentum), merged into one list. Like the chart endpoint they're
// unofficial and keyless but send no CORS headers, so they're read here server-side. The ranking
// itself happens in services/hotStocks.ts.

const SCREENER_ENDPOINT = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Safari/537.36';
export const HOT_LISTS = ['most_actives', 'day_gainers', 'day_losers', 'small_cap_gainers'] as const;
export type HotList = typeof HOT_LISTS[number];

export interface HotQuote {
  symbol: string;
  name: string;
  exchange: string | null;
  quoteType: string | null;
  currency: string | null;
  price: number;
  changePct: number; // fraction, 0.05 = +5%
  open: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number;
  avgVolume10Day: number | null;
  avgVolume3Month: number | null;
  marketCap: number | null;
  bid: number | null;
  ask: number | null;
  earningsAt: number | null; // ms, the next or most recent earnings release
  marketState: string | null;
  quoteTime: number | null; // ms
  lists: HotList[];
}

export interface HotStocksResponse {
  fetchedAt: number;
  quotes: HotQuote[];
  failedLists: HotList[];
}

type YahooQuote = Record<string, unknown>;
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
// Yahoo sends 0 for a missing bid/ask outside market hours.
const positive = (value: unknown) => { const n = num(value); return n !== null && n > 0 ? n : null; };

export const toHotQuote = (quote: YahooQuote, list: HotList): HotQuote | null => {
  const symbol = typeof quote.symbol === 'string' ? quote.symbol : '';
  const price = positive(quote.regularMarketPrice), volume = num(quote.regularMarketVolume);
  if (!symbol || price === null || volume === null) return null;
  const earnings = num(quote.earningsTimestamp) ?? num(quote.earningsTimestampStart);
  const time = num(quote.regularMarketTime);
  return {
    symbol,
    name: String(quote.displayName || quote.shortName || quote.longName || symbol),
    exchange: typeof quote.fullExchangeName === 'string' ? quote.fullExchangeName : null,
    quoteType: typeof quote.quoteType === 'string' ? quote.quoteType : null,
    currency: typeof quote.currency === 'string' ? quote.currency : null,
    price,
    changePct: (num(quote.regularMarketChangePercent) ?? 0) / 100,
    open: positive(quote.regularMarketOpen),
    previousClose: positive(quote.regularMarketPreviousClose),
    dayHigh: positive(quote.regularMarketDayHigh),
    dayLow: positive(quote.regularMarketDayLow),
    volume,
    avgVolume10Day: positive(quote.averageDailyVolume10Day),
    avgVolume3Month: positive(quote.averageDailyVolume3Month),
    marketCap: positive(quote.marketCap),
    bid: positive(quote.bid),
    ask: positive(quote.ask),
    earningsAt: earnings === null ? null : earnings * 1000,
    marketState: typeof quote.marketState === 'string' ? quote.marketState : null,
    quoteTime: time === null ? null : time * 1000,
    lists: [list],
  };
};

const fetchList = async (list: HotList): Promise<HotQuote[]> => {
  const response = await fetch(`${SCREENER_ENDPOINT}?scrIds=${list}&count=100`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Yahoo screener ${list} answered ${response.status}`);
  const data = await response.json() as { finance?: { result?: Array<{ quotes?: YahooQuote[] }> } };
  const quotes = data.finance?.result?.[0]?.quotes;
  if (!Array.isArray(quotes)) throw new Error(`Yahoo screener ${list} returned no quotes`);
  return quotes.map(quote => toHotQuote(quote, list)).filter((quote): quote is HotQuote => quote !== null);
};

// One entry per symbol, remembering every list it appeared on.
export const mergeHotQuotes = (lists: HotQuote[][]): HotQuote[] => {
  const bySymbol = new Map<string, HotQuote>();
  for (const quote of lists.flat()) {
    const existing = bySymbol.get(quote.symbol);
    if (existing) existing.lists = [...new Set([...existing.lists, ...quote.lists])];
    else bySymbol.set(quote.symbol, { ...quote, lists: [...quote.lists] });
  }
  return [...bySymbol.values()];
};

export const handleHotStocks = async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return Response.json({ error: { message: 'Use GET.' } }, { status: 405 });
  const results = await Promise.allSettled(HOT_LISTS.map(fetchList));
  const failedLists = HOT_LISTS.filter((_, index) => results[index].status === 'rejected');
  if (failedLists.length === HOT_LISTS.length) {
    const reason = (results[0] as PromiseRejectedResult).reason;
    return Response.json({ error: { message: `Hot stocks lookup failed (${reason instanceof Error ? reason.message : 'Yahoo unreachable'}).` } }, { status: 502 });
  }
  const body: HotStocksResponse = {
    fetchedAt: Date.now(),
    quotes: mergeHotQuotes(results.map(result => (result.status === 'fulfilled' ? result.value : []))),
    failedLists,
  };
  // Prices are delayed anyway; a minute of caching keeps refreshes cheap.
  return Response.json(body, { headers: { 'Cache-Control': failedLists.length ? 'no-store' : 'public, max-age=60' } });
};
