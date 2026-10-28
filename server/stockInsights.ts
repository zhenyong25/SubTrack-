// Company fundamentals for the ticker detail screen: valuation, analyst views, earnings history
// and estimates, financial statements and news, from three unofficial Yahoo Finance endpoints
// fetched server-side (no CORS headers, like the chart endpoint in index.ts):
// - quoteSummary: most of it. Needs a session cookie plus a matching "crumb", fetched once and
//   reused until Yahoo refuses it.
// - fundamentals-timeseries: the statements (quoteSummary's statement modules are mostly zeros now).
// - search: recent news.
// Each part is optional - whatever loads is returned.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SYMBOL_PATTERN = /^[A-Z0-9.\-^=]{1,20}$/;
const SUMMARY_MODULES = [
  'price', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'assetProfile', 'recommendationTrend',
  'earningsTrend', 'earningsHistory', 'calendarEvents',
].join(',');
const STATEMENT_FIELDS = [
  'TotalRevenue', 'GrossProfit', 'OperatingIncome', 'NetIncome', 'EBITDA', 'DilutedEPS', 'TotalAssets',
  'TotalLiabilitiesNetMinorityInterest', 'StockholdersEquity', 'CashAndCashEquivalents', 'TotalDebt',
  'OperatingCashFlow', 'CapitalExpenditure', 'FreeCashFlow',
] as const;
type StatementField = typeof STATEMENT_FIELDS[number];

export interface FinancialPeriod {
  date: string; // period end, YYYY-MM-DD
  values: Partial<Record<StatementField, number>>;
}

export interface EarningsEstimate {
  period: '0q' | '+1q' | '0y' | '+1y';
  endDate: string | null;
  epsAvg: number | null;
  epsLow: number | null;
  epsHigh: number | null;
  epsYearAgo: number | null;
  epsAnalysts: number | null;
  revenueAvg: number | null;
  revenueLow: number | null;
  revenueHigh: number | null;
  revenueYearAgo: number | null;
  revenueGrowth: number | null;
}

export interface PastReport {
  periodEnd: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
}

export interface NewsItem {
  title: string;
  publisher: string;
  url: string;
  publishedAt: number;
  thumbnail: string | null;
}

export interface StockInsights {
  symbol: string;
  currency: string | null; // the share price's
  financialCurrency: string | null; // the statements' and EPS figures', which can differ (e.g. HKD for a US-listed ADR)
  profile: { name: string | null; sector: string | null; industry: string | null; country: string | null; website: string | null; employees: number | null; summary: string | null } | null;
  stats: Record<string, number | null>;
  analysts: { key: string | null; mean: number | null; count: number | null; targetLow: number | null; targetMean: number | null; targetMedian: number | null; targetHigh: number | null; trend: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null } | null;
  nextEarnings: { date: string | null; isEstimate: boolean; epsAvg: number | null; revenueAvg: number | null } | null;
  pastReports: PastReport[];
  estimates: EarningsEstimate[];
  financials: { annual: FinancialPeriod[]; quarterly: FinancialPeriod[] };
  news: NewsItem[];
}

type Raw = { raw?: number; fmt?: string } | number | string | null | undefined;
const num = (value: Raw): number | null => {
  const raw = value && typeof value === 'object' ? value.raw : value;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
};
const day = (value: Raw): string | null => {
  if (value && typeof value === 'object' && typeof value.fmt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.fmt)) return value.fmt;
  const seconds = num(value);
  return seconds === null ? (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null) : new Date(seconds * 1000).toISOString().slice(0, 10);
};
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// ---------------------------------------------------------------------------------------------

let session: { cookie: string; crumb: string; at: number } | null = null;

const yahooSession = async (refresh = false) => {
  if (session && !refresh && Date.now() - session.at < 6 * 60 * 60 * 1000) return session;
  // fc.yahoo.com answers 404 but sets the session cookie that the crumb is tied to.
  const landing = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  const setCookies = typeof landing.headers.getSetCookie === 'function' ? landing.headers.getSetCookie() : [landing.headers.get('set-cookie') || ''];
  const cookie = setCookies.map(item => item.split(';')[0]).filter(Boolean).join('; ');
  if (!cookie) throw new Error('Yahoo gave no session cookie');
  const crumbResponse = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie }, signal: AbortSignal.timeout(10000) });
  const crumb = (await crumbResponse.text()).trim();
  if (!crumbResponse.ok || !crumb || crumb.length > 40 || /[<{\s]/.test(crumb)) throw new Error(`Yahoo crumb refused (${crumbResponse.status})`);
  session = { cookie, crumb, at: Date.now() };
  return session;
};

const fetchSummary = async (symbol: string) => {
  for (const refresh of [false, true]) {
    const { cookie, crumb } = await yahooSession(refresh);
    const response = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${SUMMARY_MODULES}&crumb=${encodeURIComponent(crumb)}`,
      { headers: { 'User-Agent': UA, Cookie: cookie }, signal: AbortSignal.timeout(15000) },
    );
    if (response.status === 401 || response.status === 403) continue; // stale crumb - get a new one once
    if (!response.ok) throw new Error(`quoteSummary answered ${response.status}`);
    const data = await response.json() as { quoteSummary?: { result?: Array<Record<string, any>> } };
    const result = data?.quoteSummary?.result?.[0];
    if (!result) throw new Error('No company data');
    return result;
  }
  throw new Error('Yahoo refused the session');
};

const fetchStatements = async (symbol: string) => {
  const types = STATEMENT_FIELDS.flatMap(field => [`annual${field}`, `quarterly${field}`]).join(',');
  const now = Math.floor(Date.now() / 1000);
  const response = await fetch(
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${types}&period1=${now - 6 * 365 * 86400}&period2=${now}`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error(`timeseries answered ${response.status}`);
  const data = await response.json() as { timeseries?: { result?: Array<Record<string, any>> } };
  return toFinancials(data?.timeseries?.result || []);
};

export const toFinancials = (series: Array<Record<string, any>>) => {
  const periods = { annual: new Map<string, FinancialPeriod>(), quarterly: new Map<string, FinancialPeriod>() };
  let currency: string | null = null;
  series.forEach(item => {
    const type: string = item?.meta?.type?.[0] || '';
    const match = type.match(/^(annual|quarterly)(.+)$/);
    if (!match || !STATEMENT_FIELDS.includes(match[2] as StatementField)) return;
    const frequency = match[1] as 'annual' | 'quarterly';
    (item[type] || []).forEach((point: any) => {
      const value = num(point?.reportedValue);
      const date = typeof point?.asOfDate === 'string' ? point.asOfDate : null;
      if (value === null || !date) return;
      currency = currency || point.currencyCode || null;
      const period = periods[frequency].get(date) || { date, values: {} };
      period.values[match[2] as StatementField] = value;
      periods[frequency].set(date, period);
    });
  });
  const sorted = (map: Map<string, FinancialPeriod>, keep: number) => [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep);
  return { financials: { annual: sorted(periods.annual, 5), quarterly: sorted(periods.quarterly, 6) }, currency };
};

const fetchNews = async (query: string): Promise<NewsItem[]> => {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=8&quotesCount=0&enableFuzzyQuery=false`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) throw new Error(`search answered ${response.status}`);
  const data = await response.json() as { news?: Array<Record<string, any>> };
  return (data?.news || []).flatMap(item => {
    const title = text(item.title);
    const url = text(item.link);
    if (!title || !url || !/^https:\/\//.test(url)) return [];
    const resolutions: Array<{ url: string; width: number }> = item.thumbnail?.resolutions || [];
    const thumbnail = resolutions.filter(image => /^https:\/\//.test(image?.url || '')).sort((a, b) => Math.abs(a.width - 240) - Math.abs(b.width - 240))[0]?.url || null;
    return [{ title, publisher: text(item.publisher) || 'News', url, publishedAt: (num(item.providerPublishTime) || 0) * 1000, thumbnail }];
  });
};

export const toInsights = (symbol: string, summary: Record<string, any> | null, statements: ReturnType<typeof toFinancials> | null, news: NewsItem[]): StockInsights => {
  const price = summary?.price || {};
  const detail = summary?.summaryDetail || {};
  const keyStats = summary?.defaultKeyStatistics || {};
  const financial = summary?.financialData || {};
  const profile = summary?.assetProfile;
  const trend = summary?.recommendationTrend?.trend?.find((item: any) => item?.period === '0m');
  const earnings = summary?.calendarEvents?.earnings;
  const nextEarningsDate = earnings?.earningsDate?.map((item: Raw) => day(item)).filter(Boolean).sort()[0] || null;

  return {
    symbol,
    currency: text(price.currency),
    financialCurrency: text(financial.financialCurrency) || statements?.currency || null,
    profile: profile || price.longName ? {
      name: text(price.longName) || text(price.shortName),
      sector: text(profile?.sectorDisp) || text(profile?.sector),
      industry: text(profile?.industryDisp) || text(profile?.industry),
      country: text(profile?.country),
      website: /^https?:\/\//.test(profile?.website || '') ? profile.website : null,
      employees: num(profile?.fullTimeEmployees),
      summary: text(profile?.longBusinessSummary),
    } : null,
    stats: {
      marketCap: num(detail.marketCap) ?? num(price.marketCap),
      trailingPE: num(detail.trailingPE),
      forwardPE: num(detail.forwardPE) ?? num(keyStats.forwardPE),
      priceToSales: num(detail.priceToSalesTrailing12Months),
      priceToBook: num(keyStats.priceToBook),
      pegRatio: num(keyStats.pegRatio) ?? num(keyStats.trailingPegRatio),
      beta: num(detail.beta),
      trailingEps: num(keyStats.trailingEps),
      dividendRate: num(detail.dividendRate),
      dividendYield: num(detail.dividendYield),
      payoutRatio: num(detail.payoutRatio),
      exDividendDate: num(detail.exDividendDate),
      sharesOutstanding: num(keyStats.sharesOutstanding),
      shortPercentOfFloat: num(keyStats.shortPercentOfFloat) ?? num(keyStats.sharesPercentSharesOut),
      shortRatio: num(keyStats.shortRatio),
      heldPercentInsiders: num(keyStats.heldPercentInsiders),
      heldPercentInstitutions: num(keyStats.heldPercentInstitutions),
      revenueGrowth: num(financial.revenueGrowth),
      earningsGrowth: num(financial.earningsGrowth),
      grossMargins: num(financial.grossMargins),
      operatingMargins: num(financial.operatingMargins),
      profitMargins: num(financial.profitMargins),
      returnOnEquity: num(financial.returnOnEquity),
      returnOnAssets: num(financial.returnOnAssets),
      totalCash: num(financial.totalCash),
      totalDebt: num(financial.totalDebt),
      debtToEquity: num(financial.debtToEquity),
      currentRatio: num(financial.currentRatio),
      freeCashflow: num(financial.freeCashflow),
      operatingCashflow: num(financial.operatingCashflow),
      totalRevenue: num(financial.totalRevenue),
    },
    analysts: financial.numberOfAnalystOpinions || trend ? {
      key: text(financial.recommendationKey) === 'none' ? null : text(financial.recommendationKey),
      mean: num(financial.recommendationMean),
      count: num(financial.numberOfAnalystOpinions),
      targetLow: num(financial.targetLowPrice),
      targetMean: num(financial.targetMeanPrice),
      targetMedian: num(financial.targetMedianPrice),
      targetHigh: num(financial.targetHighPrice),
      trend: trend ? { strongBuy: num(trend.strongBuy) || 0, buy: num(trend.buy) || 0, hold: num(trend.hold) || 0, sell: num(trend.sell) || 0, strongSell: num(trend.strongSell) || 0 } : null,
    } : null,
    nextEarnings: nextEarningsDate ? {
      date: nextEarningsDate,
      isEstimate: Boolean(earnings?.isEarningsDateEstimate),
      epsAvg: num(earnings?.earningsAverage),
      revenueAvg: num(earnings?.revenueAverage),
    } : null,
    pastReports: (summary?.earningsHistory?.history || []).map((item: any) => ({
      periodEnd: day(item.quarter),
      epsActual: num(item.epsActual),
      epsEstimate: num(item.epsEstimate),
      surprisePct: num(item.surprisePercent),
    })).filter((item: PastReport) => item.periodEnd).sort((a: PastReport, b: PastReport) => a.periodEnd!.localeCompare(b.periodEnd!)),
    estimates: (summary?.earningsTrend?.trend || []).filter((item: any) => ['0q', '+1q', '0y', '+1y'].includes(item?.period)).map((item: any) => ({
      period: item.period,
      endDate: day(item.endDate),
      epsAvg: num(item.earningsEstimate?.avg),
      epsLow: num(item.earningsEstimate?.low),
      epsHigh: num(item.earningsEstimate?.high),
      epsYearAgo: num(item.earningsEstimate?.yearAgoEps),
      epsAnalysts: num(item.earningsEstimate?.numberOfAnalysts),
      revenueAvg: num(item.revenueEstimate?.avg),
      revenueLow: num(item.revenueEstimate?.low),
      revenueHigh: num(item.revenueEstimate?.high),
      revenueYearAgo: num(item.revenueEstimate?.yearAgoRevenue),
      revenueGrowth: num(item.revenueEstimate?.growth),
    })),
    financials: statements?.financials || { annual: [], quarterly: [] },
    news,
  };
};

export const handleStockInsights = async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return Response.json({ error: { message: 'Use GET.' } }, { status: 405 });
  const symbol = (new URL(request.url).searchParams.get('symbol') || '').trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) return Response.json({ error: { message: 'Invalid or missing symbol.' } }, { status: 400 });

  const [summary, statements, news] = await Promise.allSettled([fetchSummary(symbol), fetchStatements(symbol), fetchNews(symbol)]);
  if (summary.status === 'rejected' && statements.status === 'rejected') {
    const reason = summary.reason instanceof Error ? summary.reason.message : 'Yahoo unreachable';
    return Response.json({ error: { message: `Company data lookup failed (${reason}).` } }, { status: 502 });
  }
  let articles = news.status === 'fulfilled' ? news.value : [];
  // Searching a code like 0700.HK finds no news; the company name does.
  const name = summary.status === 'fulfilled' ? text(summary.value?.price?.shortName) : null;
  if (articles.length === 0 && name) articles = await fetchNews(name).catch(() => []);
  const insights = toInsights(
    symbol,
    summary.status === 'fulfilled' ? summary.value : null,
    statements.status === 'fulfilled' ? statements.value : null,
    articles,
  );
  const complete = summary.status === 'fulfilled' && statements.status === 'fulfilled';
  return Response.json(insights, { headers: { 'Cache-Control': complete ? 'public, max-age=900' : 'no-store' } });
};
