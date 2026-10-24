import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Info, Layers, PieChart, Receipt, TrendingUp } from 'lucide-react';
import type { InvestmentAccount, InvestmentHolding, InvestmentTransaction, InvestmentValuation } from '../types';
import InvestmentLogo from './InvestmentLogo';
import BrokerageLogo from './BrokerageLogo';
import { convertCurrency } from '../services/storageService';
import { colorForInvestmentKind } from '../services/investmentService';
import {
  buildFifoLots,
  dateKeyToUtc,
  dividendPayments,
  forecastNextDividend,
  groupAllocation,
  holdingCashFlows,
  moneyWeightedReturn,
  trailingMonthKeys,
  type AllocationSlice,
  type CashFlow,
  type DividendForecast,
  type MoneyWeightedReturn,
} from '../services/portfolioAnalyticsService';

// A holding with its value and cost already converted to the base currency (InvestmentTab's
// getBaseMetrics), so this panel agrees with the numbers shown everywhere else on the tab.
export interface InsightPosition {
  holding: InvestmentHolding;
  value: number;
  basis: number;
}

interface PortfolioInsightsProps {
  baseCurrency: string;
  positions: InsightPosition[];
  transactions: InvestmentTransaction[];
  valuationsByHolding: Map<string, InvestmentValuation[]>;
  accounts: InvestmentAccount[];
}

type InsightView = 'allocation' | 'returns' | 'dividends' | 'lots';

const VIEWS: Array<{ id: InsightView; label: string; icon: React.ElementType }> = [
  { id: 'allocation', label: 'Allocation', icon: PieChart },
  { id: 'returns', label: 'Returns', icon: TrendingUp },
  { id: 'dividends', label: 'Dividends', icon: CalendarClock },
  { id: 'lots', label: 'Tax lots', icon: Layers },
];

// Validated categorical palette (dataviz reference), in fixed slot order, light and dark steps.
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
const UNASSIGNED_COLOR = '#64748b';
const DAY_MS = 24 * 60 * 60 * 1000;

const formatMoney = (value: number, currency: string) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
const formatSigned = (value: number, currency: string) => `${value > 0 ? '+' : ''}${formatMoney(value, currency)}`;
const formatPct = (value: number) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
// Analytics dates are UTC midnights, so they're shown in UTC to keep the calendar day intact.
const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const toneFor = (value: number) => (value > 0 ? 'text-emerald-500' : value < 0 ? 'text-red-500' : 'text-textMain');

const todayUtc = () => dateKeyToUtc(new Date().toLocaleDateString('en-CA'));

const describeReturn = (result: MoneyWeightedReturn | null) => {
  if (!result) return { value: '—', note: 'Not enough history' };
  if (result.annualized) return { value: `${formatPct(result.rate)} / yr`, note: `Annualized over ${(result.days / 365).toFixed(1)} years` };
  return { value: formatPct(result.rate), note: `Over ${result.days} day${result.days === 1 ? '' : 's'} (not annualized under a year)` };
};

// How much of the selection one position takes up. A big single position drives most of the
// portfolio's swings, so it's flagged.
type Concentration = 'low' | 'medium' | 'high';
const CONCENTRATION: Record<Concentration, { label: string; bar: string; pill: string }> = {
  low: { label: 'Under 10%', bar: '#10b981', pill: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  medium: { label: '10–20%', bar: '#f59e0b', pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  high: { label: 'Over 20%', bar: '#ef4444', pill: 'bg-red-500/15 text-red-600 dark:text-red-400' },
};
const concentrationOf = (share: number): Concentration => (share > 0.2 ? 'high' : share >= 0.1 ? 'medium' : 'low');

const AllocationBar: React.FC<{
  title: string;
  slices: AllocationSlice[];
  baseCurrency: string;
  icon?: (slice: AllocationSlice) => React.ReactNode; // shown instead of the colour swatch when it returns something
  rateConcentration?: boolean; // colour each position by its share (the "Other" bucket isn't one position)
}> = ({ title, slices, baseCurrency, icon, rateConcentration = false }) => {
  if (slices.length === 0) return null;
  const levelOf = (slice: AllocationSlice) => (rateConcentration && slice.key !== '__other' ? concentrationOf(slice.share) : undefined);
  const barColor = (slice: AllocationSlice) => {
    const level = levelOf(slice);
    return level ? CONCENTRATION[level].bar : slice.color;
  };
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-secondary">{title}</h4>
      <div className="mt-3 flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`${title}: ${slices.map(s => `${s.label} ${(s.share * 100).toFixed(1)}%`).join(', ')}`}>
        {slices.map(slice => (
          <div
            key={slice.key}
            className="h-full first:rounded-l-full last:rounded-r-full transition-opacity hover:opacity-80"
            style={{ width: `${slice.share * 100}%`, backgroundColor: barColor(slice), minWidth: 2 }}
            title={`${slice.label}: ${formatMoney(slice.value, baseCurrency)} (${(slice.share * 100).toFixed(1)}%)`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {slices.map(slice => {
          const level = levelOf(slice);
          return (
            <li key={slice.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                {/* In a card with logos, a swatch is padded to logo width so the labels line up. */}
                {icon?.(slice) ?? <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${icon ? 'mx-[7px]' : ''}`} style={{ backgroundColor: barColor(slice) }} />}
                <span className="truncate font-semibold text-textMain">{slice.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-secondary">
                {formatMoney(slice.value, baseCurrency)}
                {level ? (
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${CONCENTRATION[level].pill}`} title={CONCENTRATION[level].label}>
                    {level === 'high' && <AlertTriangle size={10} />}
                    {(slice.share * 100).toFixed(1)}%
                  </span>
                ) : (
                  <span className="font-bold text-textMain">· {(slice.share * 100).toFixed(1)}%</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {rateConcentration && (
        <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2 text-[10px] text-secondary">
          {(Object.keys(CONCENTRATION) as Concentration[]).map(level => (
            <span key={level} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CONCENTRATION[level].bar }} />
              {CONCENTRATION[level].label}
            </span>
          ))}
        </p>
      )}
    </div>
  );
};

const StatTile: React.FC<{ label: string; value: string; note?: string; tone?: string }> = ({ label, value, note, tone = 'text-textMain' }) => (
  <div className="rounded-2xl border border-border bg-background p-4">
    <p className="text-xs font-bold uppercase tracking-wider text-secondary">{label}</p>
    <p className={`mt-2 text-lg font-extrabold tabular-nums sm:text-xl ${tone}`}>{value}</p>
    {note && <p className="mt-1 text-[11px] text-secondary">{note}</p>}
  </div>
);

const PortfolioInsights: React.FC<PortfolioInsightsProps> = ({ baseCurrency, positions, transactions, valuationsByHolding, accounts }) => {
  const [view, setView] = useState<InsightView>('allocation');
  const [lotHoldingId, setLotHoldingId] = useState('');
  const asOf = todayUtc();
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const series = isDark ? SERIES_DARK : SERIES_LIGHT;

  const holdingIds = useMemo(() => new Set(positions.map(p => p.holding.id)), [positions]);
  const relevantTransactions = useMemo(() => transactions.filter(t => holdingIds.has(t.investmentId)), [transactions, holdingIds]);

  // ---- Allocation ----------------------------------------------------------------------------
  const allocation = useMemo(() => {
    const accountsById = new Map<string, InvestmentAccount>(accounts.map(account => [account.id, account]));
    const currencies = Array.from(new Set(positions.map(p => p.holding.currency || baseCurrency))).sort();
    const total = positions.reduce((sum, p) => sum + Math.max(0, p.value), 0);
    const byValue = (p: InsightPosition) => p.value;
    return {
      total,
      byKind: groupAllocation(positions, byValue, p => ({ key: p.holding.kind, label: p.holding.kind, color: colorForInvestmentKind(p.holding.kind) })),
      byAccount: accounts.length > 0
        ? groupAllocation(positions, byValue, p => {
          const account = p.holding.accountId ? accountsById.get(p.holding.accountId) : undefined;
          return account
            ? { key: account.id, label: account.name, color: account.color }
            : { key: '__unassigned', label: 'Unassigned', color: UNASSIGNED_COLOR };
        })
        : [],
      byCurrency: groupAllocation(positions, byValue, p => {
        const currency = p.holding.currency || baseCurrency;
        return { key: currency, label: currency, color: series[currencies.indexOf(currency) % series.length] };
      }),
      byHolding: groupAllocation(positions, byValue, p => ({ key: p.holding.id, label: p.holding.name, color: p.holding.color || UNASSIGNED_COLOR }), 8),
    };
  }, [positions, accounts, baseCurrency, series]);

  const holdingsById = useMemo(() => new Map<string, InvestmentHolding>(positions.map(p => [p.holding.id, p.holding])), [positions]);
  const oversized = allocation.byHolding.filter(slice => slice.key !== '__other' && concentrationOf(slice.share) === 'high');

  // ---- Returns ------------------------------------------------------------------------------
  const returns = useMemo(() => {
    const portfolioFlows: CashFlow[] = [];
    let approximate = false;
    const rows = positions.map(({ holding, value, basis }) => {
      const history = valuationsByHolding.get(holding.id) || [];
      let flows: CashFlow[];
      let consistent = true;
      if (holding.kind === 'Pokemon Cards' && history.length > 0) {
        // Collectibles are tracked by logged values, not trades: the first logged value is what
        // went in (already the basis in base currency), today's value is what it's worth now.
        flows = [{ date: dateKeyToUtc(history[0].valuationDate), amount: -basis }];
        if (value !== 0) flows.push({ date: asOf, amount: value });
      } else {
        // Flows come out in the holding's own currency; convert each to the base currency.
        const currency = holding.currency || baseCurrency;
        const nativeValue = convertCurrency(value, baseCurrency, currency);
        const result = holdingCashFlows(holding, transactions, nativeValue, asOf);
        consistent = result.consistent;
        flows = result.flows.map(flow => ({ ...flow, amount: convertCurrency(flow.amount, currency, baseCurrency) }));
      }
      if (!consistent) approximate = true;
      portfolioFlows.push(...flows);
      const invested = -flows.filter(f => f.amount < 0).reduce((sum, f) => sum + f.amount, 0);
      const netGain = flows.reduce((sum, f) => sum + f.amount, 0);
      return { holding, value, invested, netGain, mwr: moneyWeightedReturn(flows), consistent };
    }).sort((a, b) => b.netGain - a.netGain);
    const invested = rows.reduce((sum, row) => sum + row.invested, 0);
    const netGain = rows.reduce((sum, row) => sum + row.netGain, 0);
    return { rows, invested, netGain, mwr: moneyWeightedReturn(portfolioFlows), approximate };
  }, [positions, transactions, valuationsByHolding, baseCurrency, asOf]);

  // ---- Dividends ----------------------------------------------------------------------------
  const dividends = useMemo(() => {
    const payments = dividendPayments(relevantTransactions);
    const months = trailingMonthKeys(asOf, 12);
    const monthTotals = new Map(months.map(month => [month, 0]));
    const yearAgo = asOf - 365 * DAY_MS;
    let trailing = 0;
    let allTime = 0;
    const byHolding = new Map<string, { trailing: number; allTime: number; count: number }>();
    payments.forEach(payment => {
      const amount = convertCurrency(payment.amount, payment.currency || baseCurrency, baseCurrency);
      allTime += amount;
      const month = new Date(payment.date).toISOString().slice(0, 7);
      if (monthTotals.has(month)) monthTotals.set(month, (monthTotals.get(month) || 0) + amount);
      const entry = byHolding.get(payment.investmentId) || { trailing: 0, allTime: 0, count: 0 };
      entry.allTime += amount;
      entry.count += 1;
      if (payment.date > yearAgo && payment.date <= asOf) {
        trailing += amount;
        entry.trailing += amount;
      }
      byHolding.set(payment.investmentId, entry);
    });

    const forecasts: DividendForecast[] = [];
    byHolding.forEach((_, investmentId) => {
      const forecast = forecastNextDividend(payments.filter(p => p.investmentId === investmentId), asOf);
      if (forecast) forecasts.push(forecast);
    });
    forecasts.sort((a, b) => a.nextDate - b.nextDate);

    const positionsById = new Map<string, InsightPosition>(positions.map(p => [p.holding.id, p]));
    const payerBasis = Array.from(byHolding.keys()).reduce((sum, id) => sum + (positionsById.get(id)?.basis || 0), 0);
    const payerValue = Array.from(byHolding.keys()).reduce((sum, id) => sum + (positionsById.get(id)?.value || 0), 0);
    const bars = months.map(month => ({ month, total: monthTotals.get(month) || 0 }));
    return {
      count: payments.length,
      trailing,
      allTime,
      yieldOnCost: payerBasis > 0 ? trailing / payerBasis : null,
      currentYield: payerValue > 0 ? trailing / payerValue : null,
      bars,
      maxBar: Math.max(0, ...bars.map(bar => bar.total)),
      forecasts,
      rows: Array.from(byHolding.entries())
        .map(([id, entry]) => ({ id, holding: positionsById.get(id)?.holding, ...entry }))
        .filter(row => row.holding)
        .sort((a, b) => b.trailing - a.trailing || b.allTime - a.allTime),
    };
  }, [relevantTransactions, positions, baseCurrency, asOf]);

  // ---- Tax lots -----------------------------------------------------------------------------
  const lotCandidates = useMemo(
    () => positions.filter(p => p.holding.kind !== 'Pokemon Cards' && p.holding.units > 0).map(p => p.holding),
    [positions],
  );
  const lotHolding = lotCandidates.find(h => h.id === lotHoldingId) || lotCandidates[0];
  const lots = useMemo(() => (lotHolding ? buildFifoLots(lotHolding, transactions) : null), [lotHolding, transactions]);
  const averageCostRealized = useMemo(
    () => (lotHolding ? transactions.filter(t => t.investmentId === lotHolding.id && t.realizedPnl != null && t.transactionType !== 'Dividend' && t.transactionType !== 'Fee')
      .reduce((sum, t) => sum + (t.realizedPnl || 0), 0) : 0),
    [lotHolding, transactions],
  );

  if (positions.length === 0) return null;

  return (
    <section className="investment-insights bg-surface rounded-2xl border border-border p-4 shadow-sm" aria-labelledby="portfolio-insights-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Go deeper</p>
          <h3 id="portfolio-insights-heading" className="mt-1 text-lg font-extrabold text-textMain">Portfolio insights</h3>
          <p className="mt-1 text-xs text-secondary">For the holdings in your current account and category selection.</p>
        </div>
        <div className="grid w-full grid-cols-4 gap-1 rounded-xl border border-border bg-background p-1 sm:flex sm:w-auto" role="tablist" aria-label="Insight view">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-bold transition-colors sm:px-3 ${view === id ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-textMain'}`}
            >
              <Icon size={14} className="hidden shrink-0 sm:block" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4" role="tabpanel">
        {view === 'allocation' && (
          <div className="space-y-3">
            {oversized.length > 0 && allocation.byHolding.length > 1 && (
              <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  {oversized.map((slice, index) => (
                    <React.Fragment key={slice.key}>
                      {index > 0 && (index === oversized.length - 1 ? ' and ' : ', ')}
                      <strong>{slice.label}</strong> ({(slice.share * 100).toFixed(0)}%)
                    </React.Fragment>
                  ))}
                  {oversized.length === 1 ? ' is' : ' are each'} over 20% of this selection. A position that large drives most of your ups and downs.
                </span>
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <AllocationBar
                title="By holding"
                slices={allocation.byHolding}
                baseCurrency={baseCurrency}
                rateConcentration
                icon={slice => {
                  const holding = holdingsById.get(slice.key);
                  return holding ? <InvestmentLogo investment={holding} className="h-6 w-6 rounded-md !p-0.5 text-[9px]" /> : null;
                }}
              />
              <AllocationBar title="By asset class" slices={allocation.byKind} baseCurrency={baseCurrency} />
              {allocation.byAccount.length > 0 && (
                <AllocationBar
                  title="By account"
                  slices={allocation.byAccount}
                  baseCurrency={baseCurrency}
                  icon={slice => {
                    const account = accounts.find(item => item.id === slice.key);
                    return account ? <BrokerageLogo account={account} className="h-6 w-6 !rounded-md !p-0.5" /> : null;
                  }}
                />
              )}
              <AllocationBar title="By currency" slices={allocation.byCurrency} baseCurrency={baseCurrency} />
            </div>
            {allocation.total <= 0 && <p className="text-xs text-secondary">Nothing here has a positive value to allocate yet.</p>}
          </div>
        )}

        {view === 'returns' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile label="Money-weighted return" value={describeReturn(returns.mwr).value} note={describeReturn(returns.mwr).note} tone={returns.mwr ? toneFor(returns.mwr.rate) : undefined} />
              <StatTile label="Total put in" value={formatMoney(returns.invested, baseCurrency)} note="Opening positions, buys and fees" />
              <StatTile label="Net gain" value={formatSigned(returns.netGain, baseCurrency)} note="Value today + sales + dividends − money in" tone={toneFor(returns.netGain)} />
            </div>
            <p className="flex items-start gap-2 text-[11px] text-secondary">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                Money-weighted return (XIRR) accounts for when you added or took out money, so a big buy last month doesn't count as if it had been there all year.
                {returns.approximate && ' Some holdings have trade logs that don\'t fully add up to their current units (≈), e.g. after a deleted transaction, so their figures are approximate.'}
              </span>
            </p>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[520px] whitespace-nowrap text-left text-xs">
                <thead className="bg-background text-[10px] uppercase tracking-wide text-secondary">
                  <tr>
                    <th className="px-3 py-2 font-bold">Holding</th>
                    <th className="px-3 py-2 text-right font-bold">Put in</th>
                    <th className="px-3 py-2 text-right font-bold">Value now</th>
                    <th className="px-3 py-2 text-right font-bold">Net gain</th>
                    <th className="px-3 py-2 text-right font-bold">Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {returns.rows.map(row => {
                    const described = describeReturn(row.mwr);
                    return (
                      <tr key={row.holding.id}>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-textMain">{row.holding.name}</span>
                          {!row.consistent && <span className="ml-1 text-secondary" title="Trade logs don't fully explain this holding">≈</span>}
                          {row.holding.positionSide === 'Short' && <span className="ml-1.5 text-[10px] font-bold text-rose-500">Short</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-secondary">{formatMoney(row.invested, baseCurrency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-textMain">{formatMoney(row.value, baseCurrency)}</td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${toneFor(row.netGain)}`}>{formatSigned(row.netGain, baseCurrency)}</td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${row.mwr ? toneFor(row.mwr.rate) : 'text-secondary'}`} title={described.note}>{described.value}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'dividends' && (
          dividends.count === 0 ? (
            <div className="py-8 text-center text-secondary">
              <Receipt size={22} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No dividends logged yet.</p>
              <p className="mt-1 text-xs">Log a Dividend entry (the amount goes in the price field) to see income, yield and upcoming payments.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Last 12 months" value={formatMoney(dividends.trailing, baseCurrency)} note={`≈ ${formatMoney(dividends.trailing / 12, baseCurrency)} a month`} />
                <StatTile label="All time" value={formatMoney(dividends.allTime, baseCurrency)} note={`${dividends.count} payment${dividends.count === 1 ? '' : 's'}`} />
                <StatTile label="Yield on cost" value={dividends.yieldOnCost === null ? '—' : `${(dividends.yieldOnCost * 100).toFixed(2)}%`} note="12-month income ÷ what the payers cost" />
                <StatTile label="Current yield" value={dividends.currentYield === null ? '—' : `${(dividends.currentYield * 100).toFixed(2)}%`} note="12-month income ÷ payers' value today" />
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-secondary">Dividend income, last 12 months</h4>
                  <div className="mt-3 flex h-36 items-end gap-[2px]" role="img" aria-label={`Monthly dividend income: ${dividends.bars.map(bar => `${bar.month} ${formatMoney(bar.total, baseCurrency)}`).join(', ')}`}>
                    {dividends.bars.map(bar => (
                      <div key={bar.month} className="group flex h-full flex-1 flex-col justify-end" title={`${new Date(`${bar.month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}: ${formatMoney(bar.total, baseCurrency)}`}>
                        <div
                          className="w-full rounded-t bg-primary transition-opacity group-hover:opacity-80"
                          style={{ height: dividends.maxBar > 0 ? `${(bar.total / dividends.maxBar) * 100}%` : 0, minHeight: bar.total > 0 ? 3 : 0 }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex gap-[2px] border-t border-border pt-1">
                    {dividends.bars.map((bar, index) => (
                      <span key={bar.month} className="flex-1 text-center text-[9px] text-secondary">
                        {index % 2 === dividends.bars.length % 2 ? '' : new Date(`${bar.month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-secondary">Upcoming (estimated)</h4>
                  {dividends.forecasts.length === 0 ? (
                    <p className="mt-3 text-xs text-secondary">Estimates appear once a holding has paid at least twice on a regular monthly, quarterly, half-yearly or yearly schedule.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {dividends.forecasts.map(forecast => {
                        const holding = positions.find(p => p.holding.id === forecast.investmentId)?.holding;
                        return (
                          <li key={forecast.investmentId} className="flex items-center justify-between gap-3 text-xs">
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-textMain">{holding?.name || 'Holding'}</span>
                              <span className="text-[11px] text-secondary">{forecast.cadence} · around {formatDate(forecast.nextDate)}</span>
                            </span>
                            <span className="shrink-0 font-bold tabular-nums text-textMain">≈ {formatMoney(forecast.estimatedAmount, forecast.currency)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="mt-3 text-[10px] text-secondary">Based on each holding's own payment history (last amount repeated), not announced dates.</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[420px] whitespace-nowrap text-left text-xs">
                  <thead className="bg-background text-[10px] uppercase tracking-wide text-secondary">
                    <tr>
                      <th className="px-3 py-2 font-bold">Holding</th>
                      <th className="px-3 py-2 text-right font-bold">Last 12 months</th>
                      <th className="px-3 py-2 text-right font-bold">All time</th>
                      <th className="px-3 py-2 text-right font-bold">Payments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dividends.rows.map(row => (
                      <tr key={row.id}>
                        <td className="px-3 py-2 font-semibold text-textMain">{row.holding!.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-textMain">{formatMoney(row.trailing, baseCurrency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-secondary">{formatMoney(row.allTime, baseCurrency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-secondary">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {view === 'lots' && (
          !lotHolding || !lots ? (
            <div className="py-8 text-center text-secondary">
              <Layers size={22} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No open stock or crypto positions in this selection.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-bold text-secondary" htmlFor="tax-lot-holding">Holding</label>
                <select
                  id="tax-lot-holding"
                  value={lotHolding.id}
                  onChange={event => setLotHoldingId(event.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-textMain"
                >
                  {lotCandidates.map(holding => (
                    <option key={holding.id} value={holding.id}>{holding.name}{holding.symbol ? ` (${holding.symbol})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile label="Open lots" value={String(lots.openLots.length)} note={`${lots.closedLots} closed so far`} />
                <StatTile label="Realized (FIFO)" value={formatSigned(lots.fifoRealized, lotHolding.currency)} note="Sales matched to the oldest lots first" tone={toneFor(lots.fifoRealized)} />
                <StatTile label="Realized (average cost)" value={formatSigned(averageCostRealized, lotHolding.currency)} note="What the rest of the app reports" tone={toneFor(averageCostRealized)} />
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[620px] whitespace-nowrap text-left text-xs">
                  <thead className="bg-background text-[10px] uppercase tracking-wide text-secondary">
                    <tr>
                      <th className="px-3 py-2 font-bold">Opened</th>
                      <th className="px-3 py-2 text-right font-bold">Units</th>
                      <th className="px-3 py-2 text-right font-bold">Cost / unit</th>
                      <th className="px-3 py-2 text-right font-bold">Cost</th>
                      <th className="px-3 py-2 text-right font-bold">Gain now</th>
                      <th className="px-3 py-2 text-right font-bold">Held</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lots.openLots.map((lot, index) => {
                      const perUnit = lotHolding.positionSide === 'Short' ? lot.costPerUnit - lotHolding.currentPrice : lotHolding.currentPrice - lot.costPerUnit;
                      const gain = perUnit * lot.units;
                      const cost = lot.costPerUnit * lot.units;
                      const days = Math.max(0, Math.round((asOf - lot.openedOn) / DAY_MS));
                      return (
                        <tr key={`${lot.openedOn}-${index}`}>
                          <td className="px-3 py-2 text-textMain">
                            {formatDate(lot.openedOn)}
                            {lot.fromOpeningBalance && <span className="ml-1.5 text-[10px] text-secondary" title="Units the holding was created with, before any logged trade">opening</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-textMain">{lot.units.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-secondary">{formatMoney(lot.costPerUnit, lotHolding.currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-secondary">{formatMoney(cost, lotHolding.currency)}</td>
                          <td className={`px-3 py-2 text-right font-semibold tabular-nums ${toneFor(gain)}`}>
                            {formatSigned(gain, lotHolding.currency)}
                            {cost > 0 && <span className="ml-1 text-[10px] font-normal">({formatPct(gain / cost)})</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${days >= 365 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-slate-500/10 text-secondary'}`}>
                              {days >= 365 ? `${(days / 365).toFixed(1)} yr` : `${days} d`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="flex items-start gap-2 text-[11px] text-secondary">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>
                  Lots are rebuilt from your trade log, oldest first. Useful for deciding which shares to sell and for markets that tax gains by holding period.
                  {!lots.consistent && ' This holding\'s logs don\'t fully add up to its current units, so the lots are approximate.'}
                </span>
              </p>
            </div>
          )
        )}
      </div>
    </section>
  );
};

export default PortfolioInsights;
