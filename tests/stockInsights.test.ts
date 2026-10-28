import test from 'node:test';
import assert from 'node:assert/strict';
import { toFinancials, toInsights } from '../server/stockInsights';
import { buildInsights, impliedNetIncome, type EarningsEstimate, type StockInsights } from '../services/stockInsightsService';

const series = (type: string, points: Array<[string, number]>) => ({
  meta: { type: [type] },
  [type]: points.map(([asOfDate, raw]) => ({ asOfDate, currencyCode: 'HKD', reportedValue: { raw } })),
});

test('statements are grouped by period, oldest first, unknown series ignored', () => {
  const { financials, currency } = toFinancials([
    series('annualTotalRevenue', [['2025-12-31', 22.8e9], ['2024-12-31', 13.6e9]]),
    series('annualNetIncome', [['2024-12-31', 5.4e9], ['2025-12-31', 11.3e9]]),
    series('quarterlyNetIncome', [['2026-06-30', 3.6e9]]),
    series('annualSomethingElse', [['2025-12-31', 1]]),
    { meta: { type: ['annualFreeCashFlow'] }, annualFreeCashFlow: [null, { asOfDate: '2025-12-31', reportedValue: {} }] },
  ]);
  assert.equal(currency, 'HKD');
  assert.deepEqual(financials.annual, [
    { date: '2024-12-31', values: { TotalRevenue: 13.6e9, NetIncome: 5.4e9 } },
    { date: '2025-12-31', values: { TotalRevenue: 22.8e9, NetIncome: 11.3e9 } },
  ]);
  assert.deepEqual(financials.quarterly, [{ date: '2026-06-30', values: { NetIncome: 3.6e9 } }]);
});

test('quoteSummary is flattened, with "none" ratings and missing modules handled', () => {
  const insights = toInsights('FUTU', {
    price: { currency: 'USD', longName: 'Futu Holdings Limited', shortName: 'Futu' },
    summaryDetail: { trailingPE: { raw: 10.1, fmt: '10.10' }, marketCap: { raw: 14.3e9 } },
    financialData: { financialCurrency: 'HKD', recommendationKey: 'none', numberOfAnalystOpinions: { raw: 18 }, targetMeanPrice: { raw: 160.9 } },
    calendarEvents: { earnings: { earningsDate: [{ raw: 1794918600, fmt: '2026-11-17' }], isEarningsDateEstimate: true, earningsAverage: { raw: 29.9 } } },
    earningsHistory: { history: [{ quarter: { raw: 1767139200, fmt: '2025-12-31' }, epsActual: { raw: 24.4 }, epsEstimate: { raw: 23.8 }, surprisePercent: { raw: 0.025 } }, { quarter: { raw: 1759190400, fmt: '2025-09-30' }, epsActual: { raw: 23.4 }, epsEstimate: { raw: 20.5 }, surprisePercent: { raw: 0.142 } }] },
    earningsTrend: { trend: [{ period: '0y', endDate: '2026-12-31', earningsEstimate: { avg: { raw: 77.6 }, yearAgoEps: { raw: 82.4 } }, revenueEstimate: { avg: { raw: 25.3e9 }, growth: { raw: 0.106 } } }, { period: '-5y', endDate: null }] },
  }, null, []);
  assert.equal(insights.currency, 'USD');
  assert.equal(insights.financialCurrency, 'HKD');
  assert.equal(insights.profile?.name, 'Futu Holdings Limited');
  assert.equal(insights.stats.trailingPE, 10.1);
  assert.equal(insights.stats.forwardPE, null);
  assert.equal(insights.analysts?.key, null);
  assert.equal(insights.analysts?.count, 18);
  assert.deepEqual(insights.nextEarnings, { date: '2026-11-17', isEstimate: true, epsAvg: 29.9, revenueAvg: null });
  assert.deepEqual(insights.pastReports.map(report => report.periodEnd), ['2025-09-30', '2025-12-31']);
  assert.deepEqual(insights.estimates.map(estimate => [estimate.period, estimate.revenueAvg]), [['0y', 25.3e9]]);
  assert.deepEqual(insights.financials, { annual: [], quarterly: [] });
});

const estimate = (overrides: Partial<EarningsEstimate>): EarningsEstimate => ({
  period: '0y', endDate: '2026-12-31', epsAvg: 90, epsLow: null, epsHigh: null, epsYearAgo: 80, epsAnalysts: 5,
  revenueAvg: null, revenueLow: null, revenueHigh: null, revenueYearAgo: null, revenueGrowth: null, ...overrides,
});
const financials: StockInsights['financials'] = {
  annual: [{ date: '2025-12-31', values: { NetIncome: 8e9 } }],
  quarterly: [{ date: '2025-09-30', values: { NetIncome: 2e9 } }, { date: '2025-12-31', values: { NetIncome: -1e9 } }],
};

test('net income is implied from the year-ago period and EPS growth', () => {
  assert.equal(impliedNetIncome(estimate({}), financials), 9e9);
  assert.equal(impliedNetIncome(estimate({ period: '0q', endDate: '2026-09-30', epsAvg: 30, epsYearAgo: 20 }), financials), 3e9);
  // No matching year-ago period, a loss on either side, or no year-ago EPS: nothing to scale.
  assert.equal(impliedNetIncome(estimate({ endDate: '2027-12-31' }), financials), null);
  assert.equal(impliedNetIncome(estimate({ period: '+1q', endDate: '2026-12-31' }), financials), null);
  assert.equal(impliedNetIncome(estimate({ epsYearAgo: -5 }), financials), null);
  assert.equal(impliedNetIncome(estimate({ epsYearAgo: null }), financials), null);
});

test('next year builds on this year\'s projection when its year-ago figure is not reported yet', () => {
  const thisYear = estimate({});
  const nextYear = estimate({ period: '+1y', endDate: '2027-12-31', epsAvg: 99, epsYearAgo: 90 });
  assert.equal(impliedNetIncome(nextYear, financials), null);
  assert.ok(Math.abs(impliedNetIncome(nextYear, financials, [thisYear, nextYear])! - 9.9e9) < 1);
});

const base: StockInsights = {
  symbol: 'TEST', currency: 'USD', financialCurrency: 'USD', profile: null,
  stats: { trailingPE: 20, forwardPE: 15, revenueGrowth: 0.2, profitMargins: 0.25, totalCash: 5e9, totalDebt: 2e9, debtToEquity: 40, shortPercentOfFloat: 0.12, shortRatio: 3, dividendYield: 0.02, dividendRate: 2, payoutRatio: 0.3, returnOnEquity: 0.3, operatingMargins: 0.3, trailingEps: 5 },
  analysts: { key: 'buy', mean: 2, count: 10, targetLow: 90, targetMean: 130, targetMedian: 128, targetHigh: 170, trend: { strongBuy: 3, buy: 5, hold: 2, sell: 0, strongSell: 0 } },
  nextEarnings: { date: '2026-11-10', isEstimate: false, epsAvg: 1, revenueAvg: null },
  pastReports: [
    { periodEnd: '2025-12-31', epsActual: 1.1, epsEstimate: 1, surprisePct: 0.1 },
    { periodEnd: '2026-03-31', epsActual: 0.5, epsEstimate: 1, surprisePct: -0.5 },
    { periodEnd: '2026-06-30', epsActual: 1.2, epsEstimate: 1.1, surprisePct: 0.09 },
  ],
  estimates: [estimate({ revenueGrowth: 0.15 })],
  financials,
  news: [],
};

test('insights for a long holder', () => {
  const insights = buildInsights(base, { price: 100, averageCost: 120, side: 'Long', today: '2026-10-27' });
  const titles = insights.map(item => item.title);
  assert.equal(titles[0], 'Reports earnings in 14 days');
  assert.ok(titles.includes('Analyst target +30% from here'));
  assert.match(insights.find(item => item.title.startsWith('Analyst target'))!.detail, /above your 120.00 average cost/);
  assert.ok(titles.includes('Most analysts rate it a buy'));
  assert.equal(insights.find(item => item.title.startsWith('Beat EPS'))!.title, 'Beat EPS estimates 2 of the last 3 quarters');
  assert.match(insights.find(item => item.title.startsWith('Beat EPS'))!.detail, /-50%/);
  assert.ok(titles.includes('Revenue expected to grow 15% this year'));
  assert.equal(insights.find(item => item.title.startsWith('P/E'))!.tone, 'good');
  assert.ok(titles.includes('More cash than debt'));
  assert.ok(titles.includes('12.0% of shares are sold short'));
  assert.equal(insights.find(item => item.title.startsWith('Pays'))!.tone, 'good');
});

test('the same numbers read differently for a short seller, and stale earnings dates are skipped', () => {
  const insights = buildInsights(base, { price: 100, averageCost: 110, side: 'Short', today: '2026-12-01' });
  assert.equal(insights.some(item => item.title.startsWith('Reports earnings')), false);
  const target = insights.find(item => item.title.startsWith('Analyst target'))!;
  assert.equal(target.tone, 'bad');
  assert.match(target.detail, /would be a loss/);
  assert.equal(insights.find(item => item.title.startsWith('Pays'))!.tone, 'bad');
  assert.equal(insights.find(item => item.title.includes('sold short'))!.tone, 'bad');
});
