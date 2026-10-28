import type { EarningsEstimate, FinancialPeriod, StockInsights } from '../server/stockInsights';

export type { EarningsEstimate, FinancialPeriod, StockInsights };

// Same-origin route (server/stockInsights.ts), which reads Yahoo Finance server-side.
export const fetchStockInsights = async (symbol: string, signal?: AbortSignal): Promise<StockInsights> => {
  const response = await fetch(`/api/stock-insights?symbol=${encodeURIComponent(symbol)}`, { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Company data lookup failed (${response.status}).`);
  if (!data || !Array.isArray(data.estimates) || !data.financials) throw new Error('Company data isn\'t available on this server yet - restart the dev server or redeploy.');
  return data as StockInsights;
};

export const ESTIMATE_LABELS: Record<EarningsEstimate['period'], string> = { '0q': 'This quarter', '+1q': 'Next quarter', '0y': 'This year', '+1y': 'Next year' };

const DAY_MS = 86400000;
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;

// Analysts publish EPS and revenue estimates but not net income. Net income moves with EPS
// (same share count give or take buybacks), so it's implied from the matching period a year
// earlier: its net income scaled by how much EPS is expected to grow. Skipped when either side
// is a loss, where that ratio stops meaning anything. A period whose year-ago figure isn't
// reported yet (next year, or next quarter early on) builds on that period's own projection.
export const impliedNetIncome = (estimate: EarningsEstimate, financials: StockInsights['financials'], estimates: EarningsEstimate[] = []): number | null => {
  if (!estimate.endDate || estimate.epsAvg === null || !(estimate.epsYearAgo! > 0) || !(estimate.epsAvg > 0)) return null;
  const periods = estimate.period.endsWith('q') ? financials.quarterly : financials.annual;
  const yearAgo = new Date(`${estimate.endDate}T00:00:00Z`);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const target = yearAgo.toISOString().slice(0, 10);
  const match = periods.find(period => daysBetween(period.date, target) <= 20);
  let base = match?.values.NetIncome ?? null;
  if (base === null) {
    const earlier = estimates.find(item => item !== estimate && item.period.endsWith(estimate.period.slice(-1)) && item.endDate && daysBetween(item.endDate, target) <= 20);
    base = earlier ? impliedNetIncome(earlier, financials) : null;
  }
  if (!(base! > 0)) return null;
  return base! * (estimate.epsAvg / estimate.epsYearAgo!);
};

export interface Insight {
  tone: 'good' | 'bad' | 'neutral';
  title: string;
  detail: string;
}

const pct = (value: number, digits = 0) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
const plainPct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`;

// Plain-language observations from the numbers, most relevant to the holder first. They're
// descriptive rules of thumb, not advice.
export const buildInsights = (
  data: StockInsights,
  position: { price: number; averageCost: number; side: 'Long' | 'Short'; today: string },
): Insight[] => {
  const insights: Insight[] = [];
  const { stats, analysts } = data;
  const { price, averageCost, side, today } = position;

  if (data.nextEarnings?.date && data.nextEarnings.date >= today) {
    const days = Math.round(daysBetween(data.nextEarnings.date, today));
    if (days <= 45) {
      insights.push({
        tone: 'neutral',
        title: days === 0 ? 'Reports earnings today' : `Reports earnings in ${days} day${days === 1 ? '' : 's'}`,
        detail: `${new Date(`${data.nextEarnings.date}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', day: 'numeric', month: 'short' })}${data.nextEarnings.isEstimate ? ' (estimated date)' : ''}. Prices often gap on results - a stop or your break-even can be jumped straight past.`,
      });
    }
  }

  if (analysts?.targetMean && price > 0) {
    const upside = analysts.targetMean / price - 1;
    const vsCost = averageCost > 0 ? analysts.targetMean / averageCost - 1 : null;
    const forYou = vsCost === null ? '' : side === 'Long'
      ? ` That's ${vsCost >= 0 ? 'above' : 'below'} your ${averageCost.toFixed(2)} average cost.`
      : ` For your short, a move there would be ${analysts.targetMean > averageCost ? 'a loss' : 'still a profit'}.`;
    insights.push({
      tone: side === 'Short' ? (upside > 0.1 ? 'bad' : upside < -0.05 ? 'good' : 'neutral') : upside > 0.1 ? 'good' : upside < -0.05 ? 'bad' : 'neutral',
      title: `Analyst target ${pct(upside)} from here`,
      detail: `The average 12-month target is ${analysts.targetMean.toFixed(2)}${analysts.count ? ` across ${analysts.count} analysts` : ''} (range ${analysts.targetLow?.toFixed(2) ?? '?'}–${analysts.targetHigh?.toFixed(2) ?? '?'}).${forYou}`,
    });
  }

  if (analysts?.trend) {
    const { strongBuy, buy, hold, sell, strongSell } = analysts.trend;
    const total = strongBuy + buy + hold + sell + strongSell;
    if (total > 0) {
      const bullish = (strongBuy + buy) / total;
      const bearish = (sell + strongSell) / total;
      insights.push({
        tone: bullish >= 0.6 ? 'good' : bearish >= 0.3 ? 'bad' : 'neutral',
        title: bullish >= 0.6 ? 'Most analysts rate it a buy' : bearish >= 0.3 ? 'Many analysts rate it a sell' : 'Analysts are mixed',
        detail: `${strongBuy + buy} buy, ${hold} hold, ${sell + strongSell} sell this month.`,
      });
    }
  }

  const reports = data.pastReports.filter(report => report.epsActual !== null && report.epsEstimate !== null);
  if (reports.length >= 2) {
    const beats = reports.filter(report => report.epsActual! > report.epsEstimate!).length;
    const worst = reports.reduce((low, report) => ((report.surprisePct ?? 0) < (low.surprisePct ?? 0) ? report : low), reports[0]);
    insights.push({
      tone: beats >= reports.length - 1 ? 'good' : beats <= reports.length / 2 ? 'bad' : 'neutral',
      title: `Beat EPS estimates ${beats} of the last ${reports.length} quarters`,
      detail: worst.surprisePct !== null && worst.surprisePct < -0.05
        ? `The biggest miss was ${pct(worst.surprisePct)} (quarter ending ${worst.periodEnd}).`
        : 'No big misses recently.',
    });
  }

  const thisYear = data.estimates.find(item => item.period === '0y');
  const nextYear = data.estimates.find(item => item.period === '+1y');
  if (stats.revenueGrowth !== null || thisYear?.revenueGrowth != null) {
    const growth = thisYear?.revenueGrowth ?? stats.revenueGrowth!;
    insights.push({
      tone: growth > 0.1 ? 'good' : growth < 0 ? 'bad' : 'neutral',
      title: growth >= 0 ? `Revenue expected to grow ${plainPct(growth)} this year` : `Revenue expected to shrink ${plainPct(-growth)} this year`,
      detail: [
        stats.revenueGrowth !== null ? `Last quarter was ${pct(stats.revenueGrowth)} year on year.` : '',
        nextYear?.revenueGrowth != null ? `Next year's estimate: ${pct(nextYear.revenueGrowth)}.` : '',
      ].filter(Boolean).join(' ') || 'From analyst revenue estimates.',
    });
  }

  if (stats.trailingPE !== null && stats.forwardPE !== null && stats.forwardPE > 0) {
    const cheaperAhead = stats.forwardPE < stats.trailingPE;
    insights.push({
      tone: stats.forwardPE > 40 ? 'bad' : cheaperAhead ? 'good' : 'neutral',
      title: `P/E ${stats.trailingPE.toFixed(1)} now, ${stats.forwardPE.toFixed(1)} on next year's earnings`,
      detail: stats.forwardPE > 40
        ? 'A high multiple prices in a lot of future growth - results that disappoint tend to hit it hard.'
        : cheaperAhead ? 'The lower forward P/E means earnings are expected to grow.' : 'The higher forward P/E means earnings are expected to shrink.',
    });
  } else if (stats.trailingPE === null && stats.trailingEps !== null && stats.trailingEps < 0) {
    insights.push({ tone: 'bad', title: 'Loss-making over the last year', detail: 'With no earnings there\'s no P/E - the price rests on future profits.' });
  }

  if (stats.profitMargins !== null) {
    insights.push({
      tone: stats.profitMargins >= 0.2 ? 'good' : stats.profitMargins < 0 ? 'bad' : 'neutral',
      title: `${plainPct(stats.profitMargins)} net profit margin`,
      detail: [
        stats.returnOnEquity !== null ? `Return on equity ${plainPct(stats.returnOnEquity)}.` : '',
        stats.operatingMargins !== null ? `Operating margin ${plainPct(stats.operatingMargins)}.` : '',
      ].filter(Boolean).join(' ') || 'Share of revenue kept as profit.',
    });
  }

  if (stats.totalCash !== null && stats.totalDebt !== null) {
    const netCash = stats.totalCash - stats.totalDebt;
    insights.push({
      tone: netCash >= 0 ? 'good' : stats.debtToEquity !== null && stats.debtToEquity > 150 ? 'bad' : 'neutral',
      title: netCash >= 0 ? 'More cash than debt' : 'More debt than cash',
      detail: stats.debtToEquity !== null ? `Debt is ${(stats.debtToEquity / 100).toFixed(2)}× shareholders' equity.` : 'From the latest balance sheet.',
    });
  }

  if (stats.shortPercentOfFloat !== null && stats.shortPercentOfFloat >= 0.1) {
    insights.push({
      tone: side === 'Short' ? 'bad' : 'neutral',
      title: `${plainPct(stats.shortPercentOfFloat, 1)} of shares are sold short`,
      detail: `A crowded short - good news can force short sellers to buy back fast (a squeeze).${stats.shortRatio !== null ? ` ${stats.shortRatio.toFixed(1)} days of volume to cover.` : ''}`,
    });
  }

  if (stats.dividendYield !== null && stats.dividendYield > 0) {
    insights.push({
      tone: side === 'Short' ? 'bad' : 'good',
      title: `Pays a ${plainPct(stats.dividendYield, 1)} dividend`,
      detail: side === 'Short' ? 'As a short seller you owe the dividend to the lender on the ex-date.' : `${stats.dividendRate !== null ? `${stats.dividendRate.toFixed(2)} a share a year` : 'Yearly'}${stats.payoutRatio !== null ? `, ${plainPct(stats.payoutRatio)} of earnings` : ''}.`,
    });
  }

  return insights;
};

// e.g. "22.85B HKD"
export const compactMoney = (value: number | null | undefined, currency?: string | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const formatted = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
};
