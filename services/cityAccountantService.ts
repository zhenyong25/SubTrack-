import type { Expense } from '../types';

export interface AccountantFinding {
  kind: 'category' | 'duplicate';
  title: string;
  detail: string;
  expenseIds: string[];
}
export interface AccountantReport {
  version: 1;
  asOf: string;
  start: string;
  completedAt: string;
  fingerprint: string;
  reviewed: number;
  skipped: number;
  currencies: Array<{ currency: string; current: number; previous: number; changePct: number | null; topCategory: string; topCategoryAmount: number }>;
  findings: AccountantFinding[];
}
export interface AccountantProgress { step: number; label: string }
const DAY = 86400000;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const shift = (today: string, days: number) => new Date(Date.parse(today) + days * DAY).toISOString().slice(0, 10);
const dayOf = (expense: Expense) => String(expense.expenseDate || '').slice(0, 10);
const normal = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function accountantFingerprint(expenses: Expense[], today: string) {
  const input = JSON.stringify([today, expenses.filter(expense => dayOf(expense) >= shift(today, -13) && dayOf(expense) <= today)
    .map(expense => [expense.id, expense.name, expense.amount, expense.currency, expense.expenseDate, expense.category]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return `v1:${today}:${(hash >>> 0).toString(16)}`;
}

function prepare(expenses: Expense[], today: string) {
  if (!validDate(today)) throw new Error('Choose a valid review date.');
  const seen = new Set<string>();
  let skipped = 0;
  const rows = expenses.filter(expense => {
    const day = dayOf(expense);
    if (day < shift(today, -13) || day > today) return false;
    if (!validDate(day) || !Number.isFinite(expense.amount) || expense.amount < 0 || !expense.currency?.trim() || seen.has(expense.id)) { skipped++; return false; }
    seen.add(expense.id); return true;
  });
  return { rows, skipped, current: rows.filter(expense => dayOf(expense) >= shift(today, -6)) };
}
function totals(rows: Expense[], today: string): AccountantReport['currencies'] {
  const groups = new Map<string, { current: number; previous: number; categories: Map<string, number> }>();
  for (const expense of rows) {
    const currency = expense.currency.trim().toUpperCase();
    const group = groups.get(currency) || { current: 0, previous: 0, categories: new Map<string, number>() };
    const amount = Math.round(expense.amount * 100);
    if (dayOf(expense) >= shift(today, -6)) {
      group.current += amount;
      const category = expense.category?.trim() || 'Uncategorised';
      group.categories.set(category, (group.categories.get(category) || 0) + amount);
    } else group.previous += amount;
    groups.set(currency, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([currency, group]) => {
    const top = [...group.categories].sort((a, b) => b[1] - a[1])[0];
    return { currency, current: group.current / 100, previous: group.previous / 100, changePct: group.previous > 0 ? (group.current / group.previous - 1) * 100 : null, topCategory: top?.[0] || 'No expenses', topCategoryAmount: (top?.[1] || 0) / 100 };
  });
}
function findings(rows: Expense[]): AccountantFinding[] {
  const result: AccountantFinding[] = [];
  const unclassified = rows.filter(expense => ['', 'other', 'uncategorised', 'uncategorized'].includes(normal(expense.category || '')));
  if (unclassified.length) result.push({ kind: 'category', title: `${unclassified.length} expense${unclassified.length === 1 ? '' : 's'} to categorise`, detail: 'These entries have an empty, Other or Uncategorised category. Review them in Expenses.', expenseIds: unclassified.map(expense => expense.id) });
  const matches = new Map<string, Expense[]>();
  for (const row of rows) {
    if (!row.name?.trim()) continue;
    const key = JSON.stringify([normal(row.name), dayOf(row), row.currency.trim().toUpperCase(), Math.round(row.amount * 100)]);
    matches.set(key, [...(matches.get(key) || []), row]);
  }
  for (const group of matches.values()) if (group.length > 1) result.push({ kind: 'duplicate', title: `Check ${group.length} matching ${group[0].name} entries`, detail: `Same name, date and amount (${group[0].amount.toFixed(2)} ${group[0].currency}) on ${dayOf(group[0])}. They may be separate purchases; confirm before changing anything.`, expenseIds: group.map(expense => expense.id) });
  return result;
}

// Each stage performs real work and yields to the UI. No network calls or artificial waits.
export async function runAccountantReview(expenses: Expense[], today: string, options: { signal?: AbortSignal; onProgress?: (progress: AccountantProgress) => void; yieldControl?: () => Promise<void> } = {}): Promise<AccountantReport> {
  const stage = async (step: number, label: string) => {
    if (options.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError');
    options.onProgress?.({ step, label });
    await (options.yieldControl?.() || new Promise<void>(resolve => setTimeout(resolve, 0)));
    if (options.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError');
  };
  await stage(0, 'Reading recent expense records');
  const prepared = prepare(expenses, today);
  await stage(1, 'Comparing the last two weeks by currency');
  const currencies = totals(prepared.rows, today);
  await stage(2, 'Checking categories and possible duplicate entries');
  const issues = findings(prepared.current);
  await stage(3, 'Preparing your spending report');
  return { version: 1, asOf: today, start: shift(today, -6), completedAt: new Date().toISOString(), fingerprint: accountantFingerprint(expenses, today), reviewed: prepared.current.length, skipped: prepared.skipped, currencies, findings: issues };
}

export function parseAccountantReport(value: unknown): AccountantReport | undefined {
  const report = value as AccountantReport | null;
  if (!report || report.version !== 1 || !validDate(report.asOf) || !validDate(report.start) || typeof report.fingerprint !== 'string' || !Number.isFinite(Date.parse(report.completedAt))
    || !Number.isInteger(report.reviewed) || report.reviewed < 0 || !Number.isInteger(report.skipped) || report.skipped < 0 || !Array.isArray(report.currencies) || !Array.isArray(report.findings)) return undefined;
  if (!report.currencies.every(item => item && typeof item.currency === 'string' && [item.current, item.previous, item.topCategoryAmount].every(value => Number.isFinite(value) && value >= 0) && (item.changePct === null || Number.isFinite(item.changePct)) && typeof item.topCategory === 'string')) return undefined;
  if (!report.findings.every(item => item && ['category', 'duplicate'].includes(item.kind) && typeof item.title === 'string' && typeof item.detail === 'string' && Array.isArray(item.expenseIds) && item.expenseIds.every(id => typeof id === 'string'))) return undefined;
  return report;
}
