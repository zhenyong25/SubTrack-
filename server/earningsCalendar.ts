// Weekly earnings calendar for the Trade tab, from Nasdaq's public calendar API (the data behind
// nasdaq.com/market-activity/earnings). Like Yahoo's chart endpoint it's unofficial, keyless and
// sends no CORS headers, so it's fetched here server-side. It refuses requests without browser-
// like headers, and can hang instead of failing, hence the headers and the timeout.

const NASDAQ_EARNINGS_ENDPOINT = 'https://api.nasdaq.com/api/calendar/earnings';
const NASDAQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/',
};
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type EarningsTime = 'bmo' | 'amc' | 'unknown'; // before market open, after market close

export interface EarningsEvent {
  date: string; // YYYY-MM-DD, New York
  symbol: string;
  name: string;
  time: EarningsTime;
  marketCap: number | null;
  fiscalQuarter: string | null; // e.g. "Sep/2026"
  epsEstimate: number | null;
  estimateCount: number | null;
  lastYearEps: number | null;
  lastYearDate: string | null; // as Nasdaq gives it, e.g. "10/28/2025"
  eps: number | null; // reported EPS, once the company has reported
  surprisePct: number | null;
}

export interface EarningsWeek {
  weekStart: string;
  days: string[];
  events: EarningsEvent[];
  failedDays: string[];
}

interface NasdaqRow {
  time?: string;
  symbol?: string;
  name?: string;
  marketCap?: string;
  fiscalQuarterEnding?: string;
  epsForecast?: string;
  noOfEsts?: string;
  lastYearEPS?: string;
  lastYearRptDt?: string;
  eps?: string;
  surprise?: string;
}

// Nasdaq formats numbers for display: "$2.98", "($7.47)" for negatives, "$740,324,150,000",
// and "N/A" or "" when there's nothing.
export const parseNasdaqNumber = (value?: string | null): number | null => {
  const text = (value || '').trim();
  if (!text || /^(n\/?a|--?)$/i.test(text)) return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  const number = Number(text.replace(/[()$,%\s-]/g, ''));
  if (!Number.isFinite(number)) return null;
  return negative ? -number : number;
};

export const parseEarningsTime = (value?: string | null): EarningsTime =>
  value === 'time-pre-market' ? 'bmo' : value === 'time-after-hours' ? 'amc' : 'unknown';

export const normalizeNasdaqRow = (row: NasdaqRow, date: string): EarningsEvent | null => {
  const symbol = (row.symbol || '').trim().toUpperCase();
  if (!symbol) return null;
  const estimateCount = parseNasdaqNumber(row.noOfEsts);
  const lastYearDate = (row.lastYearRptDt || '').trim();
  return {
    date,
    symbol,
    name: (row.name || symbol).trim(),
    time: parseEarningsTime(row.time),
    marketCap: parseNasdaqNumber(row.marketCap),
    fiscalQuarter: (row.fiscalQuarterEnding || '').trim() || null,
    epsEstimate: parseNasdaqNumber(row.epsForecast),
    estimateCount: estimateCount === null ? null : Math.round(estimateCount),
    lastYearEps: parseNasdaqNumber(row.lastYearEPS),
    lastYearDate: lastYearDate && !/^n\/?a$/i.test(lastYearDate) ? lastYearDate : null,
    eps: parseNasdaqNumber(row.eps),
    surprisePct: parseNasdaqNumber(row.surprise),
  };
};

// Monday to Friday of the week starting on `weekStart`, which is snapped back to its Monday.
export const weekDays = (weekStart: string): string[] => {
  const start = new Date(`${weekStart}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return Array.from({ length: 5 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
};

export const fetchDay = async (date: string): Promise<EarningsEvent[]> => {
  const upstream = await fetch(`${NASDAQ_EARNINGS_ENDPOINT}?date=${date}`, { headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(15000) });
  if (!upstream.ok) throw new Error(`Nasdaq answered ${upstream.status}`);
  const data = await upstream.json() as { data?: { rows?: NasdaqRow[] | null } };
  return (data?.data?.rows || []).flatMap(row => normalizeNasdaqRow(row, date) || []);
};

export const handleEarningsCalendar = async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return Response.json({ error: { message: 'Use GET.' } }, { status: 405 });
  const requested = new URL(request.url).searchParams.get('week') || '';
  if (!DAY_PATTERN.test(requested) || Number.isNaN(Date.parse(requested))) {
    return Response.json({ error: { message: 'Invalid or missing week (YYYY-MM-DD).' } }, { status: 400 });
  }

  const days = weekDays(requested);
  const results = await Promise.allSettled(days.map(fetchDay));
  const failedDays = days.filter((_, index) => results[index].status === 'rejected');
  if (failedDays.length === days.length) {
    const reason = (results[0] as PromiseRejectedResult).reason;
    return Response.json({ error: { message: `Earnings calendar lookup failed (${reason instanceof Error ? reason.message : 'Nasdaq unreachable'}).` } }, { status: 502 });
  }

  const week: EarningsWeek = {
    weekStart: days[0],
    days,
    events: results.flatMap(result => (result.status === 'fulfilled' ? result.value : [])),
    failedDays,
  };
  // Estimates and results change through the day, but not by the minute.
  return Response.json(week, { headers: { 'Cache-Control': failedDays.length ? 'no-store' : 'public, max-age=900' } });
};
