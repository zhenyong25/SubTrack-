import { CashbackCategory, CashbackProgram, CashbackTier, Expense, PaymentCard } from '../types';
import { convertCurrency } from './storageService';

// ---------------------------------------------------------------------------
// Statement cycles. Everything here works on YYYY-MM-DD strings and UTC date math so a
// timezone can never shift a transaction into the wrong cycle or year.
// ---------------------------------------------------------------------------

export interface StatementCycle {
  start: string; // first day of the cycle (the day after the previous statement date)
  end: string; // statement date
  label: string;
}

// Statement day 31 clamps to each month's last day, i.e. a plain calendar month.
export const DEFAULT_STATEMENT_DAY = 31;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number) => String(value).padStart(2, '0');
const toIso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const parseIso = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return { year, month, day };
};

export const addDaysIso = (iso: string, delta: number) => {
  const { year, month, day } = parseIso(iso);
  return new Date(Date.UTC(year, month - 1, day + delta)).toISOString().slice(0, 10);
};
const addDays = addDaysIso;

const statementDateIn = (year: number, month: number, statementDay: number) =>
  toIso(year, month, Math.min(statementDay, daysInMonth(year, month)));

export const formatCycleDate = (iso: string) => {
  const { year, month, day } = parseIso(iso);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
};

const normalizeStatementDay = (statementDay?: number) =>
  Number.isFinite(statementDay) ? Math.min(31, Math.max(1, Math.round(statementDay as number))) : DEFAULT_STATEMENT_DAY;

export const getStatementCycle = (referenceDate: string, statementDay?: number): StatementCycle => {
  const day = normalizeStatementDay(statementDay);
  const { year, month } = parseIso(referenceDate);
  const reference = referenceDate.slice(0, 10);
  const statementThisMonth = statementDateIn(year, month, day);

  let start: string;
  let end: string;
  if (reference <= statementThisMonth) {
    const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    start = addDays(statementDateIn(prev.year, prev.month, day), 1);
    end = statementThisMonth;
  } else {
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    start = addDays(statementThisMonth, 1);
    end = statementDateIn(next.year, next.month, day);
  }

  return { start, end, label: `${formatCycleDate(start)} – ${formatCycleDate(end)}` };
};

export const shiftStatementCycle = (cycle: StatementCycle, statementDay: number | undefined, direction: 1 | -1) =>
  getStatementCycle(direction === 1 ? addDays(cycle.end, 1) : addDays(cycle.start, -1), statementDay);

export const getTodayIso = () => {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

// ---------------------------------------------------------------------------
// Rule set lookup
// ---------------------------------------------------------------------------

// A rule set covers a cycle when the cycle's statement date sits inside its effective range.
export const getProgramForCycle = (programs: CashbackProgram[], cardId: string, cycleEnd: string) =>
  programs
    .filter(program =>
      program.cardId === cardId &&
      program.effectiveFrom <= cycleEnd &&
      (!program.effectiveTo || cycleEnd <= program.effectiveTo))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

export const isExpenseOnCard = (expense: Expense, card: PaymentCard) =>
  expense.linkedCardId === card.id || (!expense.linkedCardId && Boolean(expense.linkedCardName) && expense.linkedCardName === card.name);

export const isCashbackCard = (card?: PaymentCard | null) => card?.kind === 'Credit' && card.rewardType === 'Cashback';

// ---------------------------------------------------------------------------
// Cashback calculation
// ---------------------------------------------------------------------------

export interface CashbackTransaction {
  expense: Expense;
  amount: number; // in the rule set's currency
  categoryId: string | null;
  cashback: number; // this transaction's share of its category's earned cashback
}

export interface CategoryCashback {
  category: CashbackCategory;
  spend: number;
  transactionCount: number;
  rate: number; // % at the current tier
  eligible: boolean; // has met the category minimum spend
  spendToMin: number;
  uncapped: number; // what it would earn with no caps
  cashback: number;
  capped: boolean;
}

export interface CashbackSummary {
  program: CashbackProgram;
  cycle: StatementCycle;
  totalSpend: number;
  tier: CashbackTier | null;
  nextTier: CashbackTier | null;
  spendToNextTier: number;
  categories: CategoryCashback[];
  transactions: CashbackTransaction[];
  totalCashback: number;
  totalCap?: number; // sum of every category cap, undefined when any category is uncapped
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const computeCashback = (
  program: CashbackProgram,
  card: PaymentCard,
  expenses: Expense[],
  cycle: StatementCycle,
): CashbackSummary => {
  const categories = [...program.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const categoryIds = new Set(categories.map(category => category.id));
  const defaultCategory = categories.find(category => category.isDefault);

  const transactions: CashbackTransaction[] = expenses
    .filter(expense => isExpenseOnCard(expense, card))
    .filter(expense => {
      const date = expense.expenseDate.slice(0, 10);
      return date >= cycle.start && date <= cycle.end;
    })
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
    .map(expense => {
      const tagged = expense.cashbackCategoryId && categoryIds.has(expense.cashbackCategoryId)
        ? expense.cashbackCategoryId
        : defaultCategory?.id ?? null;
      return {
        expense,
        amount: convertCurrency(expense.amount, expense.currency, program.currency),
        categoryId: tagged,
        cashback: 0,
      };
    });

  const totalSpend = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  const sortedTiers = [...program.tiers].sort((a, b) => a.minTotalSpend - b.minTotalSpend);
  const tier = [...sortedTiers].reverse().find(item => totalSpend >= item.minTotalSpend) ?? null;
  const nextTier = sortedTiers.find(item => item.minTotalSpend > totalSpend) ?? null;

  const groupRemaining = new Map<string, number>();
  categories.forEach(category => {
    if (category.capGroup && category.groupMonthlyCap != null) {
      groupRemaining.set(category.capGroup, Math.max(groupRemaining.get(category.capGroup) ?? 0, category.groupMonthlyCap));
    }
  });

  const results: CategoryCashback[] = categories.map(category => {
    const inCategory = transactions.filter(tx => tx.categoryId === category.id);
    const spend = inCategory.reduce((sum, tx) => sum + tx.amount, 0);
    const rate = tier?.rates[category.id] ?? 0;
    const eligible = spend >= category.minSpend;
    const uncapped = eligible ? (spend * rate) / 100 : 0;

    let earned = category.monthlyCap != null ? Math.min(uncapped, category.monthlyCap) : uncapped;
    if (category.capGroup && groupRemaining.has(category.capGroup)) {
      const remaining = groupRemaining.get(category.capGroup) ?? 0;
      earned = Math.min(earned, remaining);
      groupRemaining.set(category.capGroup, remaining - earned);
    }

    const cashback = round2(earned);
    const capped = uncapped - cashback > 0.005;
    inCategory.forEach(tx => {
      tx.cashback = spend > 0 ? (cashback * tx.amount) / spend : 0;
    });

    return {
      category,
      spend,
      transactionCount: inCategory.length,
      rate,
      eligible,
      spendToMin: Math.max(category.minSpend - spend, 0),
      uncapped: round2(uncapped),
      cashback,
      capped,
    };
  });

  const caps = categories.map(category => category.monthlyCap);
  const totalCap = caps.every(cap => cap != null)
    ? caps.reduce<number>((sum, cap) => sum + (cap as number), 0)
    : undefined;

  return {
    program,
    cycle,
    totalSpend,
    tier,
    nextTier,
    spendToNextTier: nextTier ? Math.max(nextTier.minTotalSpend - totalSpend, 0) : 0,
    categories: results,
    transactions,
    totalCashback: round2(results.reduce((sum, result) => sum + result.cashback, 0)),
    totalCap,
  };
};

// ---------------------------------------------------------------------------
// Built-in rule sets (from the RHB Shell Visa criteria)
// ---------------------------------------------------------------------------

interface PresetCategory {
  name: string;
  minSpend: number;
  monthlyCap?: number;
  capGroup?: string;
  groupMonthlyCap?: number;
  isDefault?: boolean;
}

interface PresetTier {
  min: number;
  max?: number;
  rates: number[]; // same order as categories
}

export interface CashbackPreset {
  key: string;
  label: string;
  name: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string;
  categories: PresetCategory[];
  tiers: PresetTier[];
}

export const CASHBACK_PRESETS: CashbackPreset[] = [
  {
    key: 'rhb-shell-2026',
    label: 'RHB Shell Visa · from Jan 2026',
    name: 'RHB Shell Visa (2026)',
    currency: 'MYR',
    effectiveFrom: '2025-12-23',
    categories: [
      { name: 'Petrol (Shell)', minSpend: 0, monthlyCap: 30 },
      { name: 'Groceries', minSpend: 250, monthlyCap: 10 },
      { name: 'e-Wallet Top-up & Online', minSpend: 500, monthlyCap: 10 },
      { name: 'Utilities', minSpend: 250, monthlyCap: 10 },
      { name: 'Overseas', minSpend: 500, monthlyCap: 50 },
      { name: 'Other Spending', minSpend: 500, isDefault: true },
    ],
    tiers: [
      { min: 1000, max: 1999.99, rates: [3, 1, 1, 1, 1, 0.2] },
      { min: 2000, max: 2999.99, rates: [5, 2, 2, 2, 2, 0.2] },
      { min: 3000, rates: [12, 5, 5, 5, 5, 0.2] },
    ],
  },
  {
    key: 'rhb-shell-2025',
    label: 'RHB Shell Visa · up to Dec 2025',
    name: 'RHB Shell Visa (2025)',
    currency: 'MYR',
    effectiveFrom: '2020-01-01',
    effectiveTo: '2025-12-22',
    categories: [
      { name: 'Petrol (Shell)', minSpend: 0, monthlyCap: 50 },
      { name: 'Groceries', minSpend: 0, capGroup: 'Combined', groupMonthlyCap: 50 },
      { name: 'Online Spend', minSpend: 0, capGroup: 'Combined', groupMonthlyCap: 50 },
      { name: 'Top Up E-Wallet', minSpend: 0, capGroup: 'Combined', groupMonthlyCap: 50 },
      { name: 'Utilities', minSpend: 0, capGroup: 'Combined', groupMonthlyCap: 50 },
      { name: 'Other Spending', minSpend: 0, isDefault: true },
    ],
    tiers: [
      { min: 800, max: 1499.99, rates: [5, 1, 1, 1, 1, 0.2] },
      { min: 1500, max: 2499.99, rates: [8, 2, 2, 2, 2, 0.2] },
      { min: 2500, rates: [12, 5, 5, 5, 5, 0.2] },
    ],
  },
];

export const buildProgramFromPreset = (
  preset: CashbackPreset,
  cardId: string,
): CashbackProgram => {
  const categories: CashbackCategory[] = preset.categories.map((category, index) => ({
    id: crypto.randomUUID(),
    name: category.name,
    minSpend: category.minSpend,
    monthlyCap: category.monthlyCap,
    capGroup: category.capGroup,
    groupMonthlyCap: category.groupMonthlyCap,
    isDefault: category.isDefault,
    sortOrder: index,
  }));

  const tiers: CashbackTier[] = preset.tiers.map((tier, index) => ({
    id: crypto.randomUUID(),
    tierNo: index + 1,
    minTotalSpend: tier.min,
    maxTotalSpend: tier.max,
    rates: Object.fromEntries(categories.map((category, categoryIndex) => [category.id, tier.rates[categoryIndex] ?? 0])),
  }));

  return {
    id: crypto.randomUUID(),
    cardId,
    name: preset.name,
    currency: preset.currency,
    effectiveFrom: preset.effectiveFrom,
    effectiveTo: preset.effectiveTo,
    categories,
    tiers,
  };
};
