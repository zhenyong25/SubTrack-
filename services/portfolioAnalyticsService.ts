import type { InvestmentHolding, InvestmentTransaction } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Trade dates are stored date-only (or as ISO strings); reading just the YYYY-MM-DD part as UTC
// keeps day counts exact regardless of the device's time zone.
export const dateKeyToUtc = (value: string): number => {
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  return Date.UTC(year, (month || 1) - 1, day || 1);
};

export const utcToDateKey = (timestamp: number): string => new Date(timestamp).toISOString().split('T')[0];

const byTradeDate = (a: InvestmentTransaction, b: InvestmentTransaction) =>
  dateKeyToUtc(a.tradeDate) - dateKeyToUtc(b.tradeDate) || (a.createdAt || '').localeCompare(b.createdAt || '');

// ---------------------------------------------------------------------------------------------
// Money-weighted return (XIRR)
// ---------------------------------------------------------------------------------------------

// Negative amounts are money put in, positive amounts are money taken out (or still held, for
// the final "what it's worth today" flow).
export interface CashFlow {
  date: number; // UTC ms
  amount: number;
}

const npv = (rate: number, flows: CashFlow[], origin: number) =>
  flows.reduce((sum, flow) => sum + flow.amount / Math.pow(1 + rate, (flow.date - origin) / (365 * DAY_MS)), 0);

// The annual rate at which the flows' net present value is zero. Bisection on a bracketed root -
// slower than Newton's method but it can't diverge, and these series are tiny. Null when there's
// no answer (all flows one sign) or the rate is outside -99.99%..+1,000,000%.
export const xirr = (flows: CashFlow[]): number | null => {
  const relevant = flows.filter(flow => Number.isFinite(flow.amount) && flow.amount !== 0);
  if (!relevant.some(flow => flow.amount < 0) || !relevant.some(flow => flow.amount > 0)) return null;
  const origin = Math.min(...relevant.map(flow => flow.date));

  let low = -0.9999;
  let high = 10000;
  let lowValue = npv(low, relevant, origin);
  const highValue = npv(high, relevant, origin);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || Math.sign(lowValue) === Math.sign(highValue)) return null;

  for (let i = 0; i < 300; i += 1) {
    const mid = (low + high) / 2;
    const midValue = npv(mid, relevant, origin);
    if (Math.abs(midValue) < 1e-9 || high - low < 1e-10) return mid;
    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
};

// Annualizing a few weeks of returns produces absurd numbers, so periods under a year are
// reported as the plain return over the period instead (the GIPS convention).
export interface MoneyWeightedReturn {
  rate: number;
  annualized: boolean;
  days: number;
}

export const moneyWeightedReturn = (flows: CashFlow[]): MoneyWeightedReturn | null => {
  const rate = xirr(flows);
  if (rate === null) return null;
  const dates = flows.map(flow => flow.date);
  const days = Math.round((Math.max(...dates) - Math.min(...dates)) / DAY_MS);
  if (days >= 365) return { rate, annualized: true, days };
  return { rate: Math.pow(1 + rate, days / 365) - 1, annualized: false, days };
};

// ---------------------------------------------------------------------------------------------
// Rebuilding a holding's history
// ---------------------------------------------------------------------------------------------

// Holdings can be created with units already in them, and those starting units have no
// transaction. Their size is today's units minus what the logs added; their cost is solved for:
// replaying the logs (same average-cost rules as applyInvestmentTransaction) makes today's
// average cost a straight-line function of the opening cost, so two trial replays pin it down.
export interface OpeningPosition {
  units: number;
  averageCost: number;
  date: number;
  // False when the logs can't fully explain today's position (e.g. a transaction was deleted,
  // which leaves the holding unchanged), so anything built on them is approximate.
  consistent: boolean;
}

const opensPosition = (type: InvestmentTransaction['transactionType'], isShort: boolean) =>
  isShort ? type === 'Sell' : type === 'Buy' || type === 'Transfer In';
const closesPosition = (type: InvestmentTransaction['transactionType'], isShort: boolean) =>
  isShort ? type === 'Buy' : type === 'Sell' || type === 'Transfer Out';

interface Replay {
  finalAverageCost: number;
  // Average cost at the first close that has a stored realized P&L, and that trade.
  firstRealized?: { averageCost: number; trade: InvestmentTransaction; closed: number };
  emptied: boolean; // the position hit zero at some point, so the opening cost stopped mattering
  overClosed: boolean; // a close needed more units than were held
}

const replay = (sorted: InvestmentTransaction[], isShort: boolean, openingUnits: number, openingCost: number): Replay => {
  let units = openingUnits;
  let basis = openingUnits * openingCost;
  let emptied = false;
  let overClosed = false;
  let firstRealized: Replay['firstRealized'];
  sorted.forEach(trade => {
    const tradeUnits = Math.max(0, trade.units);
    if (opensPosition(trade.transactionType, isShort)) {
      units += tradeUnits;
      basis += tradeUnits * trade.price + (isShort ? -trade.fees : trade.fees);
    } else if (closesPosition(trade.transactionType, isShort)) {
      if (tradeUnits > units + 1e-9) overClosed = true;
      const averageCost = units > 0 ? basis / units : 0;
      const closed = Math.min(tradeUnits, units);
      if (!firstRealized && trade.realizedPnl != null && closed > 0) firstRealized = { averageCost, trade, closed };
      units -= closed;
      basis = units * averageCost;
      if (units <= 1e-12) {
        units = 0;
        basis = 0;
        emptied = true;
      }
    } else if (trade.transactionType === 'Fee' && !isShort) {
      basis += trade.fees;
    }
  });
  return { finalAverageCost: units > 0 ? basis / units : 0, firstRealized, emptied, overClosed };
};

export const reconstructOpeningPosition = (
  holding: InvestmentHolding,
  transactions: InvestmentTransaction[],
): OpeningPosition => {
  const isShort = holding.positionSide === 'Short';
  const sorted = transactions.filter(t => t.investmentId === holding.id).sort(byTradeDate);
  const netLogged = sorted.reduce((sum, trade) => {
    const tradeUnits = Math.max(0, trade.units);
    if (opensPosition(trade.transactionType, isShort)) return sum + tradeUnits;
    if (closesPosition(trade.transactionType, isShort)) return sum - tradeUnits;
    return sum;
  }, 0);
  let units = holding.units - netLogged;
  let consistent = true;
  if (units < -1e-9) consistent = false;
  units = Math.abs(units) < 1e-9 || units < 0 ? 0 : units;

  let averageCost = 0;
  if (units > 0) {
    const atZero = replay(sorted, isShort, units, 0);
    const atOne = replay(sorted, isShort, units, 1);
    const slope = atOne.finalAverageCost - atZero.finalAverageCost;
    const realizedSlope = atZero.firstRealized && atOne.firstRealized
      ? atOne.firstRealized.averageCost - atZero.firstRealized.averageCost
      : 0;
    if (!atZero.emptied && slope > 1e-12) {
      averageCost = (holding.averageCost - atZero.finalAverageCost) / slope;
    } else if (atZero.firstRealized && realizedSlope > 1e-12) {
      // The position was closed out since, so today's average says nothing about the opening
      // cost - but the first sale's stored P&L does: pnl = closed * (price - avg) - fees
      // (mirrored for a short).
      const { trade, closed, averageCost: base } = atZero.firstRealized;
      const perUnit = (trade.realizedPnl! + trade.fees) / closed;
      const averageAtSale = isShort ? perUnit + trade.price : trade.price - perUnit;
      averageCost = (averageAtSale - base) / realizedSlope;
    } else {
      averageCost = holding.averageCost;
      consistent = false;
    }
    if (!Number.isFinite(averageCost) || averageCost < -1e-9) {
      averageCost = holding.averageCost;
      consistent = false;
    }
    if (atZero.overClosed) consistent = false;
  } else if (replay(sorted, isShort, 0, 0).overClosed) {
    consistent = false;
  }

  const firstTradeDate = sorted.length ? dateKeyToUtc(sorted[0].tradeDate) : undefined;
  const declared = holding.acquiredDate ? dateKeyToUtc(holding.acquiredDate) : undefined;
  const created = holding.createdAt ? dateKeyToUtc(holding.createdAt) : undefined;
  const candidates = [declared, created].filter((value): value is number => value !== undefined && Number.isFinite(value));
  // The opening position can't post-date the first trade on top of it.
  let date = candidates.length ? Math.min(...candidates) : firstTradeDate ?? Date.UTC(1970, 0, 1);
  if (firstTradeDate !== undefined) date = Math.min(date, firstTradeDate);

  return { units, averageCost: Math.max(0, averageCost), date, consistent };
};

// One holding's cash flows in its own currency, from the opening position through every logged
// trade to its value today. A short is treated as the equity it ties up (matching
// getPositionMetrics): opening one commits the sale proceeds, buying back releases them plus or
// minus the gain.
export const holdingCashFlows = (
  holding: InvestmentHolding,
  transactions: InvestmentTransaction[],
  currentValue: number,
  asOf: number,
): { flows: CashFlow[]; consistent: boolean } => {
  const isShort = holding.positionSide === 'Short';
  const opening = reconstructOpeningPosition(holding, transactions);
  const flows: CashFlow[] = [];
  let units = opening.units;
  let averageCost = opening.averageCost;
  if (units > 0) flows.push({ date: opening.date, amount: -units * averageCost });

  transactions
    .filter(t => t.investmentId === holding.id)
    .sort(byTradeDate)
    .forEach(trade => {
      const date = dateKeyToUtc(trade.tradeDate);
      const tradeUnits = Math.max(0, trade.units);
      const type = trade.transactionType;
      if (opensPosition(type, isShort)) {
        const committed = tradeUnits * trade.price + (isShort ? -trade.fees : trade.fees);
        const nextUnits = units + tradeUnits;
        averageCost = nextUnits > 0 ? (units * averageCost + committed) / nextUnits : 0;
        units = nextUnits;
        flows.push({ date, amount: -committed });
      } else if (closesPosition(type, isShort)) {
        const closed = Math.min(tradeUnits, units);
        const released = isShort
          ? closed * (2 * averageCost - trade.price) - trade.fees
          : closed * trade.price - (type === 'Sell' ? trade.fees : 0);
        units -= closed;
        if (units <= 0) averageCost = 0;
        flows.push({ date, amount: released });
      } else if (type === 'Dividend') {
        flows.push({ date, amount: isShort ? -trade.price : trade.price });
      } else if (type === 'Fee') {
        flows.push({ date, amount: -trade.fees });
      }
    });

  if (currentValue !== 0) flows.push({ date: asOf, amount: currentValue });
  return { flows, consistent: opening.consistent };
};

// ---------------------------------------------------------------------------------------------
// Tax lots (FIFO)
// ---------------------------------------------------------------------------------------------

export interface TaxLot {
  openedOn: number;
  units: number;
  costPerUnit: number; // fees included
  fromOpeningBalance: boolean;
}

export interface LotSummary {
  openLots: TaxLot[];
  // Gain realized if sales are matched to the oldest lots first. The app itself books realized
  // P&L on average cost, so the two can differ for a position bought at several prices.
  fifoRealized: number;
  closedLots: number;
  consistent: boolean;
}

export const buildFifoLots = (holding: InvestmentHolding, transactions: InvestmentTransaction[]): LotSummary => {
  const isShort = holding.positionSide === 'Short';
  const opening = reconstructOpeningPosition(holding, transactions);
  const lots: TaxLot[] = opening.units > 0
    ? [{ openedOn: opening.date, units: opening.units, costPerUnit: opening.averageCost, fromOpeningBalance: true }]
    : [];
  let fifoRealized = 0;
  let closedLots = 0;

  transactions
    .filter(t => t.investmentId === holding.id)
    .sort(byTradeDate)
    .forEach(trade => {
      const tradeUnits = Math.max(0, trade.units);
      if (tradeUnits <= 0) return;
      if (opensPosition(trade.transactionType, isShort)) {
        const cost = tradeUnits * trade.price + (isShort ? -trade.fees : trade.fees);
        lots.push({ openedOn: dateKeyToUtc(trade.tradeDate), units: tradeUnits, costPerUnit: cost / tradeUnits, fromOpeningBalance: false });
        return;
      }
      if (!closesPosition(trade.transactionType, isShort)) return;
      const realizes = trade.transactionType === 'Sell' || (isShort && trade.transactionType === 'Buy');
      let remaining = tradeUnits;
      while (remaining > 1e-12 && lots.length) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.units);
        if (realizes) {
          const perUnit = isShort ? lot.costPerUnit - trade.price : trade.price - lot.costPerUnit;
          fifoRealized += take * perUnit;
        }
        lot.units -= take;
        remaining -= take;
        if (lot.units <= 1e-12) {
          lots.shift();
          closedLots += 1;
        }
      }
      if (realizes) fifoRealized -= trade.fees;
    });

  return { openLots: lots, fifoRealized, closedLots, consistent: opening.consistent };
};

// ---------------------------------------------------------------------------------------------
// Dividends
// ---------------------------------------------------------------------------------------------

export interface DividendPayment {
  investmentId: string;
  date: number;
  amount: number; // in the transaction's currency
  currency: string;
}

export const dividendPayments = (transactions: InvestmentTransaction[]): DividendPayment[] =>
  transactions
    .filter(t => t.transactionType === 'Dividend' && t.price > 0)
    .map(t => ({ investmentId: t.investmentId, date: dateKeyToUtc(t.tradeDate), amount: t.price, currency: t.currency }))
    .sort((a, b) => a.date - b.date);

// The last `count` calendar months ending with the one `asOf` falls in, oldest first, as YYYY-MM.
export const trailingMonthKeys = (asOf: number, count = 12): string[] => {
  const end = new Date(asOf);
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (count - 1 - index), 1));
    return month.toISOString().slice(0, 7);
  });
};

export type DividendCadence = 'Monthly' | 'Quarterly' | 'Semi-annual' | 'Annual';

export interface DividendForecast {
  investmentId: string;
  cadence: DividendCadence;
  nextDate: number;
  estimatedAmount: number;
  currency: string;
}

const CADENCES: Array<{ cadence: DividendCadence; months: number; minDays: number; maxDays: number }> = [
  { cadence: 'Monthly', months: 1, minDays: 20, maxDays: 45 },
  { cadence: 'Quarterly', months: 3, minDays: 70, maxDays: 115 },
  { cadence: 'Semi-annual', months: 6, minDays: 150, maxDays: 215 },
  { cadence: 'Annual', months: 12, minDays: 320, maxDays: 410 },
];

// Estimates the next payment from a holding's own history: needs at least two payments whose
// typical (median) gap matches a standard schedule. The amount is the latest payment repeated.
// Payers whose last payment is more than two missed cycles old are treated as having stopped.
export const forecastNextDividend = (payments: DividendPayment[], asOf: number): DividendForecast | null => {
  if (payments.length < 2) return null;
  const sorted = payments.slice().sort((a, b) => a.date - b.date);
  // Several lines on one day (e.g. a special dividend) count as a single payment date.
  const dates = Array.from(new Set(sorted.map(p => p.date)));
  if (dates.length < 2) return null;
  const gaps = dates.slice(1).map((date, index) => (date - dates[index]) / DAY_MS).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  const match = CADENCES.find(c => median >= c.minDays && median <= c.maxDays);
  if (!match) return null;

  const last = sorted[sorted.length - 1];
  const step = (from: number) => {
    const date = new Date(from);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + match.months, date.getUTCDate());
  };
  let next = step(last.date);
  let missed = 0;
  while (next < asOf) {
    next = step(next);
    missed += 1;
    if (missed > 2) return null;
  }
  const lastDayTotal = sorted.filter(p => p.date === last.date).reduce((sum, p) => sum + p.amount, 0);
  return { investmentId: last.investmentId, cadence: match.cadence, nextDate: next, estimatedAmount: lastDayTotal, currency: last.currency };
};

// ---------------------------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------------------------

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  share: number; // 0..1
  color: string;
}

// Groups positive values into slices, largest first. Anything past `maxSlices` is folded into
// "Other" so a long tail doesn't turn the bar into confetti.
export const groupAllocation = <T,>(
  items: T[],
  valueOf: (item: T) => number,
  keyOf: (item: T) => { key: string; label: string; color: string },
  maxSlices = 6,
): AllocationSlice[] => {
  const totals = new Map<string, { label: string; color: string; value: number }>();
  items.forEach(item => {
    const value = valueOf(item);
    if (!(value > 0)) return;
    const { key, label, color } = keyOf(item);
    const current = totals.get(key);
    totals.set(key, { label, color, value: (current?.value || 0) + value });
  });
  const total = Array.from(totals.values()).reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return [];
  const sorted = Array.from(totals.entries())
    .map(([key, slice]) => ({ key, ...slice }))
    .sort((a, b) => b.value - a.value);
  const kept = sorted.length > maxSlices ? sorted.slice(0, maxSlices - 1) : sorted;
  const rest = sorted.slice(kept.length);
  if (rest.length) kept.push({ key: '__other', label: `Other (${rest.length})`, color: '#94a3b8', value: rest.reduce((sum, s) => sum + s.value, 0) });
  return kept.map(slice => ({ ...slice, share: slice.value / total }));
};
