import React, { useMemo, useState } from 'react';
import { BarChart3, Building2, CalendarClock, ExternalLink, FileText, Lightbulb, Newspaper, Target, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import {
  ESTIMATE_LABELS, compactMoney, impliedNetIncome,
  type FinancialPeriod, type Insight, type StockInsights,
} from '../services/stockInsightsService';

// Company fundamentals cards for the ticker detail screen (TickerDetail lays them out).

export const Card: React.FC<{ icon: React.ElementType; title: string; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ icon: Icon, title, action, className = '', children }) => (
  <section className={`min-w-0 rounded-3xl border border-border bg-surface p-5 shadow-sm ${className}`}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-secondary"><Icon size={15} /><h2 className="text-[10px] font-black uppercase tracking-wide">{title}</h2></div>
      {action}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const signedPct = (value: number | null | undefined, digits = 1) => (value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`);
const plainPct = (value: number | null | undefined, digits = 1) => (value === null || value === undefined ? '—' : `${(value * 100).toFixed(digits)}%`);
const fixed = (value: number | null | undefined, digits = 2) => (value === null || value === undefined ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const tone = (value: number | null | undefined) => (value === null || value === undefined || Math.abs(value) < 1e-9 ? 'text-textMain' : value > 0 ? 'text-emerald-500' : 'text-rose-500');
const shortDate = (date: string | null, withYear = true) => (date ? new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined }) : '—');
const quarterLabel = (date: string | null) => {
  if (!date) return '—';
  const d = new Date(`${date}T00:00:00Z`);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} '${String(d.getUTCFullYear()).slice(2)}`;
};

// ---------------------------------------------------------------------------------------------

const INSIGHT_STYLES = {
  good: { icon: TrendingUp, className: 'bg-emerald-500/10 text-emerald-500' },
  bad: { icon: TrendingDown, className: 'bg-rose-500/10 text-rose-500' },
  neutral: { icon: Minus, className: 'bg-slate-500/10 text-secondary' },
};

export const InsightsCard: React.FC<{ insights: Insight[] }> = ({ insights }) => (
  <Card icon={Lightbulb} title="Investment insights">
    <ul className="space-y-3">
      {insights.map(insight => {
        const style = INSIGHT_STYLES[insight.tone];
        const Icon = style.icon;
        return (
          <li key={insight.title} className="flex gap-3">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.className}`}><Icon size={13} /></span>
            <div className="min-w-0">
              <p className="text-sm font-black">{insight.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-secondary">{insight.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
    <p className="mt-4 text-[10px] text-secondary">Rules of thumb read from the numbers below - context, not a recommendation.</p>
  </Card>
);

// ---------------------------------------------------------------------------------------------

const RATINGS = [
  { key: 'strongBuy', label: 'Strong buy', color: 'bg-emerald-600' },
  { key: 'buy', label: 'Buy', color: 'bg-emerald-400' },
  { key: 'hold', label: 'Hold', color: 'bg-slate-400' },
  { key: 'sell', label: 'Sell', color: 'bg-rose-400' },
  { key: 'strongSell', label: 'Strong sell', color: 'bg-rose-600' },
] as const;

export const AnalystCard: React.FC<{ analysts: NonNullable<StockInsights['analysts']>; price: number; averageCost: number; currency: string }> = ({ analysts, price, averageCost, currency }) => {
  const total = analysts.trend ? RATINGS.reduce((sum, rating) => sum + analysts.trend![rating.key], 0) : 0;
  const { targetLow, targetHigh, targetMean } = analysts;
  const hasRange = targetLow !== null && targetHigh !== null && targetHigh > targetLow;
  // The bar spans the targets plus the price and your cost, so all of them fit on it.
  const low = hasRange ? Math.min(targetLow!, price, averageCost > 0 ? averageCost : Infinity) : 0;
  const high = hasRange ? Math.max(targetHigh!, price, averageCost) : 1;
  const at = (value: number) => `${((value - low) / (high - low || 1)) * 100}%`;
  return (
    <Card icon={Target} title="Analysts">
      {targetMean !== null && (
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase text-secondary">Average 12-month target</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{fixed(targetMean)} <span className="text-sm text-secondary">{currency}</span></p>
          </div>
          <p className={`text-lg font-black ${tone(targetMean / price - 1)}`}>{signedPct(targetMean / price - 1)}</p>
        </div>
      )}
      {hasRange && (
        <div className="mt-5">
          <div className="relative h-2 rounded-full bg-slate-500/20">
            <span className="absolute inset-y-0 rounded-full bg-blue-500/40" style={{ left: at(targetLow!), width: `calc(${at(targetHigh!)} - ${at(targetLow!)})` }} title="Analysts' target range" />
            {targetMean !== null && <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500" style={{ left: at(targetMean) }} title="Average target" />}
            {averageCost > 0 && <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500" style={{ left: at(averageCost) }} title="Your average cost" />}
            <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-cyan-500" style={{ left: at(price) }} title="Current price" />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-bold tabular-nums text-secondary"><span>Low {fixed(targetLow)}</span><span>High {fixed(targetHigh)}</span></div>
          <p className="mt-1 text-[10px] text-secondary"><span className="text-cyan-500">●</span> price <span className="text-blue-500">▮</span> average target <span className="text-blue-500/60">▬</span> target range <span className="text-amber-500">▮</span> your average cost</p>
        </div>
      )}
      {analysts.trend && total > 0 && (
        <div className="mt-5">
          <div className="flex h-3 overflow-hidden rounded-full">
            {RATINGS.map(rating => analysts.trend![rating.key] > 0 && (
              <span key={rating.key} className={rating.color} style={{ width: `${(analysts.trend![rating.key] / total) * 100}%` }} title={`${rating.label}: ${analysts.trend![rating.key]}`} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-secondary">
            {RATINGS.map(rating => (
              <span key={rating.key} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${rating.color}`} />{rating.label} {analysts.trend![rating.key]}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------

// Past four quarters' EPS against the estimate, then the analysts' estimates ahead.
export const EarningsCard: React.FC<{ data: StockInsights }> = ({ data }) => {
  const currency = data.financialCurrency || data.currency || '';
  const reports = data.pastReports.filter(report => report.epsActual !== null || report.epsEstimate !== null);
  const values = reports.flatMap(report => [report.epsActual, report.epsEstimate]).filter((value): value is number => value !== null);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 0.01);
  const y = (value: number) => 12 + (1 - (value - min) / (max - min || 1)) * 96;
  const next = data.nextEarnings;
  return (
    <Card icon={CalendarClock} title="Earnings">
      {next?.date && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/5 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase text-secondary">Next report{next.isEstimate ? ' (estimated)' : ''}</p>
            <p className="mt-0.5 text-base font-black">{shortDate(next.date)}</p>
          </div>
          <div className="text-right text-xs">
            {next.epsAvg !== null && <p><span className="text-secondary">EPS est.</span> <strong>{fixed(next.epsAvg)} {currency}</strong></p>}
            {next.revenueAvg !== null && <p><span className="text-secondary">Revenue est.</span> <strong>{compactMoney(next.revenueAvg, currency)}</strong></p>}
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <>
          <p className="text-[10px] font-bold uppercase text-secondary">Past reports · EPS vs estimate ({currency})</p>
          <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${reports.length}, minmax(0, 1fr))` }}>
            {reports.map(report => {
              const beat = report.epsActual !== null && report.epsEstimate !== null ? report.epsActual >= report.epsEstimate : null;
              return (
                <div key={report.periodEnd} className="text-center">
                  <svg viewBox="0 0 60 120" className="mx-auto h-24 w-full max-w-[72px]" aria-hidden="true">
                    <line x1="30" x2="30" y1="8" y2="112" stroke="currentColor" className="text-border" />
                    {min < 0 && <line x1="10" x2="50" y1={y(0)} y2={y(0)} stroke="currentColor" className="text-border" strokeDasharray="2 3" />}
                    {report.epsEstimate !== null && <circle cx="30" cy={y(report.epsEstimate)} r="7" fill="none" stroke="currentColor" strokeWidth="2" className="text-secondary" />}
                    {report.epsActual !== null && <circle cx="30" cy={y(report.epsActual)} r="7" fill={beat === false ? '#f43f5e' : '#10b981'} />}
                  </svg>
                  <p className="text-[11px] font-black">{quarterLabel(report.periodEnd)}</p>
                  <p className="text-[10px] tabular-nums text-secondary">{fixed(report.epsActual)} vs {fixed(report.epsEstimate)}</p>
                  <p className={`text-[10px] font-black ${tone(report.surprisePct)}`}>{report.surprisePct === null ? '' : signedPct(report.surprisePct)}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-secondary"><span className="text-emerald-500">●</span> beat <span className="text-rose-500">●</span> missed <span className="text-secondary">○</span> estimate</p>
        </>
      )}

      {data.estimates.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <p className="text-[10px] font-bold uppercase text-secondary">Analyst estimates ({currency})</p>
          <table className="mt-2 w-full min-w-[520px] text-left text-xs">
            <thead className="text-[10px] uppercase text-secondary">
              <tr>
                <th className="py-1.5 font-bold">Period</th>
                <th className="py-1.5 text-right font-bold">EPS est.</th>
                <th className="py-1.5 text-right font-bold">EPS growth</th>
                <th className="py-1.5 text-right font-bold">Revenue est.</th>
                <th className="py-1.5 text-right font-bold">Revenue growth</th>
                <th className="py-1.5 text-right font-bold" title="Year-ago net income scaled by expected EPS growth">Net income*</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.estimates.map(estimate => {
                const epsGrowth = estimate.epsAvg !== null && estimate.epsYearAgo ? estimate.epsAvg / Math.abs(estimate.epsYearAgo) - Math.sign(estimate.epsYearAgo) : null;
                return (
                  <tr key={estimate.period}>
                    <td className="py-2"><p className="font-bold">{ESTIMATE_LABELS[estimate.period]}</p><p className="text-[10px] text-secondary">to {shortDate(estimate.endDate)}{estimate.epsAnalysts ? ` · ${estimate.epsAnalysts} analyst${estimate.epsAnalysts === 1 ? '' : 's'}` : ''}</p></td>
                    <td className="py-2 text-right font-bold tabular-nums">{fixed(estimate.epsAvg)}</td>
                    <td className={`py-2 text-right tabular-nums ${tone(epsGrowth)}`}>{signedPct(epsGrowth)}</td>
                    <td className="py-2 text-right font-bold tabular-nums">{compactMoney(estimate.revenueAvg)}</td>
                    <td className={`py-2 text-right tabular-nums ${tone(estimate.revenueGrowth)}`}>{signedPct(estimate.revenueGrowth)}</td>
                    <td className="py-2 text-right tabular-nums">{compactMoney(impliedNetIncome(estimate, data.financials, data.estimates))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-secondary">* Analysts don't publish net income forecasts - this is the year-ago net income scaled by the expected EPS growth.</p>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------

// Revenue and net income by year, with this year's and next year's projections after them.
export const GrowthCard: React.FC<{ data: StockInsights }> = ({ data }) => {
  const currency = data.financialCurrency || data.currency || '';
  const bars = useMemo(() => {
    const history = data.financials.annual
      .filter(period => period.values.TotalRevenue !== undefined)
      .slice(-4)
      .map(period => ({ label: period.date.slice(0, 4), revenue: period.values.TotalRevenue ?? null, netIncome: period.values.NetIncome ?? null, projected: false }));
    const projections = data.estimates
      .filter(estimate => estimate.period.endsWith('y') && estimate.endDate && estimate.revenueAvg !== null && !history.some(item => item.label === estimate.endDate!.slice(0, 4)))
      .map(estimate => ({ label: `${estimate.endDate!.slice(0, 4)}E`, revenue: estimate.revenueAvg, netIncome: impliedNetIncome(estimate, data.financials, data.estimates), projected: true }));
    return [...history, ...projections];
  }, [data]);
  if (bars.length < 2) return null;

  const values = bars.flatMap(bar => [bar.revenue, bar.netIncome]).filter((value): value is number => value !== null);
  const top = Math.max(...values, 1);
  const bottom = Math.min(0, ...values);
  const width = 640;
  const height = 230;
  const plotTop = 22;
  const plotBottom = 196;
  const y = (value: number) => plotTop + (1 - (value - bottom) / (top - bottom)) * (plotBottom - plotTop);
  const slot = (width - 20) / bars.length;
  const barWidth = Math.min(34, slot * 0.32);

  return (
    <Card icon={BarChart3} title={`Revenue & net income (${currency})`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Revenue and net income by year, with projections">
        <line x1="10" x2={width - 10} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-border" />
        {bars.map((bar, index) => {
          const center = 10 + slot * (index + 0.5);
          return (
            <g key={bar.label}>
              {[{ value: bar.revenue, color: '#3b82f6', offset: -barWidth / 2 - 2 }, { value: bar.netIncome, color: '#10b981', offset: barWidth / 2 + 2 }].map(({ value, color, offset }) => value !== null && (
                <g key={color}>
                  <rect
                    x={center + offset - barWidth / 2}
                    y={Math.min(y(value), y(0))}
                    width={barWidth}
                    height={Math.max(1, Math.abs(y(value) - y(0)))}
                    rx="3"
                    fill={value < 0 ? '#f43f5e' : color}
                    fillOpacity={bar.projected ? 0.35 : 0.9}
                    stroke={bar.projected ? (value < 0 ? '#f43f5e' : color) : 'none'}
                    strokeDasharray="4 3"
                  />
                  <text x={center + offset} y={Math.min(y(value), y(0)) - 5} textAnchor="middle" fontSize="10" fontWeight="700" className="fill-slate-500 dark:fill-white/60">{compactMoney(value)}</text>
                </g>
              ))}
              <text x={center} y={height - 12} textAnchor="middle" fontSize="11" fontWeight="800" className={bar.projected ? 'fill-primary' : 'fill-slate-500 dark:fill-white/60'}>{bar.label}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[10px] text-secondary">
        <span className="text-blue-500">■</span> revenue <span className="text-emerald-500">■</span> net income · faded bars marked E are projections (analyst revenue estimates; net income implied from EPS estimates)
      </p>
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------

export const KeyStatsCard: React.FC<{ data: StockInsights }> = ({ data }) => {
  const { stats } = data;
  const currency = data.currency || '';
  const reporting = data.financialCurrency || currency;
  const groups: Array<{ title: string; rows: Array<[string, string]> }> = [
    { title: 'Valuation', rows: [
      ['Market cap', compactMoney(stats.marketCap, currency)],
      ['P/E (trailing)', fixed(stats.trailingPE, 1)],
      ['P/E (forward)', fixed(stats.forwardPE, 1)],
      ['PEG ratio', fixed(stats.pegRatio)],
      ['Price / sales', fixed(stats.priceToSales)],
      ['Price / book', fixed(stats.priceToBook)],
      ['EPS (trailing)', stats.trailingEps === null ? '—' : `${fixed(stats.trailingEps)} ${reporting}`],
      ['Beta', fixed(stats.beta)],
    ] },
    { title: 'Profitability & growth', rows: [
      ['Revenue growth (yoy)', signedPct(stats.revenueGrowth)],
      ['Earnings growth (yoy)', signedPct(stats.earningsGrowth)],
      ['Gross margin', plainPct(stats.grossMargins)],
      ['Operating margin', plainPct(stats.operatingMargins)],
      ['Profit margin', plainPct(stats.profitMargins)],
      ['Return on equity', plainPct(stats.returnOnEquity)],
      ['Return on assets', plainPct(stats.returnOnAssets)],
    ] },
    { title: 'Balance sheet', rows: [
      ['Total cash', compactMoney(stats.totalCash, reporting)],
      ['Total debt', compactMoney(stats.totalDebt, reporting)],
      ['Debt / equity', stats.debtToEquity === null ? '—' : `${(stats.debtToEquity / 100).toFixed(2)}×`],
      ['Current ratio', fixed(stats.currentRatio)],
      ['Free cash flow', compactMoney(stats.freeCashflow, reporting)],
    ] },
    { title: 'Shares & dividend', rows: [
      ['Shares outstanding', compactMoney(stats.sharesOutstanding)],
      ['Held by insiders', plainPct(stats.heldPercentInsiders)],
      ['Held by institutions', plainPct(stats.heldPercentInstitutions)],
      ['Short % of float', plainPct(stats.shortPercentOfFloat)],
      ['Days to cover', fixed(stats.shortRatio, 1)],
      ['Dividend yield', stats.dividendYield ? plainPct(stats.dividendYield, 2) : 'None'],
      ['Payout ratio', plainPct(stats.payoutRatio)],
      ['Ex-dividend', stats.exDividendDate ? shortDate(new Date(stats.exDividendDate * 1000).toISOString().slice(0, 10)) : '—'],
    ] },
  ];
  return (
    <Card icon={FileText} title="Key statistics">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
        {groups.map(group => {
          const rows = group.rows.filter(([, value]) => value !== '—');
          if (rows.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-primary">{group.title}</p>
              <dl className="divide-y divide-border">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                    <dt className="text-secondary">{label}</dt>
                    <dd className="font-black tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------

type StatementTab = 'income' | 'balance' | 'cash';
const STATEMENT_ROWS: Record<StatementTab, Array<{ key: keyof FinancialPeriod['values']; label: string; strong?: boolean; perShare?: boolean }>> = {
  income: [
    { key: 'TotalRevenue', label: 'Revenue', strong: true },
    { key: 'GrossProfit', label: 'Gross profit' },
    { key: 'OperatingIncome', label: 'Operating income' },
    { key: 'EBITDA', label: 'EBITDA' },
    { key: 'NetIncome', label: 'Net income', strong: true },
    { key: 'DilutedEPS', label: 'Diluted EPS', perShare: true },
  ],
  balance: [
    { key: 'TotalAssets', label: 'Total assets', strong: true },
    { key: 'TotalLiabilitiesNetMinorityInterest', label: 'Total liabilities' },
    { key: 'StockholdersEquity', label: "Shareholders' equity", strong: true },
    { key: 'CashAndCashEquivalents', label: 'Cash & equivalents' },
    { key: 'TotalDebt', label: 'Total debt' },
  ],
  cash: [
    { key: 'OperatingCashFlow', label: 'Operating cash flow', strong: true },
    { key: 'CapitalExpenditure', label: 'Capital expenditure' },
    { key: 'FreeCashFlow', label: 'Free cash flow', strong: true },
  ],
};
const TAB_LABELS: Record<StatementTab, string> = { income: 'Income', balance: 'Balance sheet', cash: 'Cash flow' };

export const FinancialsCard: React.FC<{ data: StockInsights }> = ({ data }) => {
  const [frequency, setFrequency] = useState<'annual' | 'quarterly'>('annual');
  const [tab, setTab] = useState<StatementTab>('income');
  const currency = data.financialCurrency || data.currency || '';
  const periods = data.financials[frequency];
  const rows = STATEMENT_ROWS[tab].filter(row => periods.some(period => period.values[row.key] !== undefined));
  if (data.financials.annual.length === 0 && data.financials.quarterly.length === 0) return null;
  const toggle = (active: boolean) => `rounded-lg px-2.5 py-1 text-[11px] font-bold ${active ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`;

  return (
    <Card
      icon={FileText}
      title={`Financial report (${currency})`}
      action={(
        <div className="flex gap-1 rounded-xl border border-border bg-background p-0.5">
          {(['annual', 'quarterly'] as const).map(option => <button key={option} type="button" onClick={() => setFrequency(option)} className={toggle(frequency === option)}>{option === 'annual' ? 'Annual' : 'Quarterly'}</button>)}
        </div>
      )}
    >
      <div className="flex gap-1">
        {(Object.keys(TAB_LABELS) as StatementTab[]).map(option => <button key={option} type="button" onClick={() => setTab(option)} className={toggle(tab === option)}>{TAB_LABELS[option]}</button>)}
      </div>
      {rows.length === 0 || periods.length === 0 ? (
        <p className="mt-4 text-xs text-secondary">No {frequency} {TAB_LABELS[tab].toLowerCase()} figures available.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-right text-xs tabular-nums">
            <thead className="text-[10px] uppercase text-secondary">
              <tr>
                <th className="py-1.5 text-left font-bold" />
                {periods.map(period => <th key={period.date} className="py-1.5 font-bold">{frequency === 'annual' ? period.date.slice(0, 4) : quarterLabel(period.date)}</th>)}
                <th className="py-1.5 font-bold" title="Change from the previous period">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(row => {
                const latest = periods.at(-1)?.values[row.key];
                const previous = periods.at(-2)?.values[row.key];
                const change = latest !== undefined && previous !== undefined && previous !== 0 ? (latest - previous) / Math.abs(previous) : null;
                return (
                  <tr key={row.key}>
                    <td className={`py-2 text-left ${row.strong ? 'font-black' : 'text-secondary'}`}>{row.label}</td>
                    {periods.map(period => {
                      const value = period.values[row.key];
                      return <td key={period.date} className={`py-2 ${row.strong ? 'font-black' : ''} ${value !== undefined && value < 0 ? 'text-rose-500' : ''}`}>{value === undefined ? '—' : row.perShare ? fixed(value) : compactMoney(value)}</td>;
                    })}
                    <td className={`py-2 font-bold ${tone(change)}`}>{signedPct(change, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------

const timeAgo = (timestamp: number) => {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  const days = Math.round(minutes / 60 / 24);
  return days < 30 ? `${days}d ago` : new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export const NewsCard: React.FC<{ news: StockInsights['news'] }> = ({ news }) => (
  <Card icon={Newspaper} title="Related news">
    <ul className="grid gap-3 sm:grid-cols-2">
      {news.slice(0, 8).map(item => (
        <li key={item.url}>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="group flex gap-3 rounded-2xl border border-border bg-background p-2.5 hover:border-primary">
            {item.thumbnail
              ? <img src={item.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-20 shrink-0 rounded-xl object-cover" />
              : <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl bg-surface text-secondary"><Newspaper size={18} /></span>}
            <span className="min-w-0">
              <span className="line-clamp-2 text-xs font-bold leading-snug group-hover:text-primary">{item.title}</span>
              <span className="mt-1 flex items-center gap-1 text-[10px] text-secondary">{item.publisher} · {item.publishedAt ? timeAgo(item.publishedAt) : ''} <ExternalLink size={10} /></span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  </Card>
);

// ---------------------------------------------------------------------------------------------

export const ProfileCard: React.FC<{ profile: NonNullable<StockInsights['profile']> }> = ({ profile }) => {
  const [expanded, setExpanded] = useState(false);
  const facts = [
    ['Sector', profile.sector],
    ['Industry', profile.industry],
    ['Country', profile.country],
    ['Employees', profile.employees ? profile.employees.toLocaleString() : null],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));
  return (
    <Card icon={Building2} title="About the company">
      {profile.name && <p className="text-sm font-black">{profile.name}</p>}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0"><dt className="text-[10px] font-bold uppercase text-secondary">{label}</dt><dd className="truncate text-xs font-bold">{value}</dd></div>
        ))}
      </dl>
      {profile.summary && (
        <>
          <p className={`mt-3 text-xs leading-relaxed text-secondary ${expanded ? '' : 'line-clamp-4'}`}>{profile.summary}</p>
          <button type="button" onClick={() => setExpanded(value => !value)} className="mt-1 text-[11px] font-bold text-primary">{expanded ? 'Show less' : 'Read more'}</button>
        </>
      )}
      {profile.website && (
        <a href={profile.website} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-1 text-xs font-bold text-primary">{profile.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} <ExternalLink size={11} /></a>
      )}
    </Card>
  );
};
