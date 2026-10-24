import type { Expense, Income, Subscription } from '../types';
import { CURRENCIES } from '../types';
import { isValidDate, moneyInCents } from './savingsGoalMath';
import { forecastDates } from './cashForecastService';

export interface CsvTable { headers: string[]; rows: string[][] }
export interface CsvMapping { date: number; description: number; amount: number; debit: number; credit: number; currency: number; reference: number; mode: 'signed' | 'split'; expenseSign: 'negative' | 'positive'; dateFormat: 'ISO' | 'DMY' | 'MDY'; decimal: '.' | ','; defaultCurrency: string }
export interface ImportSource { kind: 'Cash' | 'Card'; id: string; name: string }
export interface CsvTransaction { row: number; date: string; description: string; amount: number; currency: string; direction: 'debit' | 'credit'; reference: string; fingerprint: string; occurrence: number; error?: string }
export interface ImportCandidate { key: string; name: string; date: string; kind: 'Expense' | 'Income' | 'Subscription'; exact: boolean }
export interface ReconciledCsvRow { transaction: CsvTransaction; duplicate: boolean; candidates: ImportCandidate[]; defaultAction: 'expense' | 'income' | 'match' | 'skip' }
export interface ImportDraft { transaction: CsvTransaction; action: 'expense' | 'income'; category: string }
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const sourceMarker = (source: ImportSource) => `[statement:${source.kind}:${source.id}]`;

export function parseCsv(text: string, delimiter = ','): CsvTable {
  if (text.length > 2_000_000) throw new Error('Choose a CSV smaller than 2 MB.');
  if (![',', ';', '\t'].includes(delimiter)) throw new Error('Choose a supported delimiter.');
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closed = false;
  const pushCell = () => { row.push(cell.trim()); cell = ''; closed = false; };
  const pushRow = () => { pushCell(); if (row.some(Boolean)) rows.push(row); row = []; if (rows.length > 501) throw new Error('Import up to 500 transactions at a time. Split larger statements into smaller files.'); };
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) { if (char === '"') { if (input[index + 1] === '"') { cell += '"'; index++; } else { quoted = false; closed = true; } } else cell += char; continue; }
    if (char === delimiter) pushCell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && input[index + 1] === '\n') index++; pushRow(); }
    else if (char === '"') { if (cell.trim() || closed) throw new Error('Invalid CSV quoting. Export the statement as CSV again.'); cell = ''; quoted = true; }
    else { if (closed && char.trim()) throw new Error('Unexpected text after a quoted CSV field.'); if (!closed) cell += char; }
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.');
  if (cell || row.length || closed) pushRow();
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one transaction.');
  const headers = rows.shift()!;
  if (headers.length < 2 || headers.length > 60) throw new Error('Check the delimiter. The first row must contain column headers.');
  return { headers, rows };
}

export function suggestMapping(headers: string[], defaultCurrency: string): CsvMapping {
  const find = (names: string[]) => headers.findIndex(header => names.includes(normalize(header)));
  return { date: find(['date', 'transaction date', 'posting date', 'posted date']), description: find(['description', 'merchant', 'transaction description', 'details', 'narrative']), amount: find(['amount', 'transaction amount', 'signed amount']), debit: find(['debit', 'withdrawal', 'withdrawals', 'debit amount']), credit: find(['credit', 'deposit', 'deposits', 'credit amount']), currency: find(['currency', 'ccy']), reference: find(['reference', 'transaction id', 'reference number']), mode: headers.some(header => ['debit', 'withdrawal', 'withdrawals', 'debit amount'].includes(normalize(header))) ? 'split' : 'signed', expenseSign: 'negative', dateFormat: 'ISO', decimal: '.', defaultCurrency };
}
const parseDate = (value: string, format: CsvMapping['dateFormat']) => {
  let date = value.trim();
  if (format !== 'ISO') { const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(date); if (!match) throw new Error('Date does not match the selected format.'); const [, first, second, year] = match; date = `${year}-${(format === 'DMY' ? second : first).padStart(2, '0')}-${(format === 'DMY' ? first : second).padStart(2, '0')}`; }
  if (!isValidDate(date)) throw new Error('Invalid date; choose the correct date format.'); return date;
};
export function parseCsvMoney(value: string, decimal: '.' | ','): number {
  let text = value.trim(); const parentheses = /^\(.*\)$/.test(text); if (parentheses) text = text.slice(1, -1).trim();
  const pattern = decimal === '.' ? /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/ : /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  if (!pattern.test(text) || (parentheses && /^[+-]/.test(text))) throw new Error('Invalid amount; check decimal format. Use numbers without currency symbols.');
  const amount = Number(decimal === '.' ? text.replace(/,/g, '') : text.replace(/\./g, '').replace(',', '.')) * (parentheses ? -1 : 1);
  moneyInCents(amount); return amount;
}

export function mapCsvRows(table: CsvTable, mapping: CsvMapping): CsvTransaction[] {
  const required = [mapping.date, mapping.description, ...(mapping.mode === 'signed' ? [mapping.amount] : [mapping.debit, mapping.credit])];
  if (required.some(index => index < 0 || index >= table.headers.length) || new Set(required).size !== required.length) throw new Error('Map each required field to a different column.');
  if (!CURRENCIES.includes(mapping.defaultCurrency)) throw new Error('Choose a supported currency.');
  const counts = new Map<string, number>();
  return table.rows.map((cells, index) => {
    const transaction: CsvTransaction = { row: index + 2, date: '', description: '', amount: 0, currency: '', direction: 'debit', reference: '', fingerprint: '', occurrence: 0 };
    try {
      if (cells.length !== table.headers.length) throw new Error('Column count differs from the header. Check delimiter or quoting.');
      transaction.date = parseDate(cells[mapping.date], mapping.dateFormat);
      transaction.description = cells[mapping.description].trim(); if (!transaction.description || transaction.description.length > 240) throw new Error('Description must contain 1–240 characters.');
      transaction.currency = mapping.currency >= 0 ? (cells[mapping.currency] || mapping.defaultCurrency).toUpperCase() : mapping.defaultCurrency;
      if (!CURRENCIES.includes(transaction.currency)) throw new Error('Unsupported currency.');
      transaction.reference = mapping.reference >= 0 ? cells[mapping.reference].trim() : ''; if (transaction.reference.length > 160) throw new Error('Reference is too long.');
      if (mapping.mode === 'split') {
        const debit = cells[mapping.debit] ? parseCsvMoney(cells[mapping.debit], mapping.decimal) : 0; const credit = cells[mapping.credit] ? parseCsvMoney(cells[mapping.credit], mapping.decimal) : 0;
        if (debit < 0 || credit < 0 || Boolean(debit) === Boolean(credit)) throw new Error('Use one positive debit or credit amount, not both.');
        transaction.amount = debit || credit; transaction.direction = debit ? 'debit' : 'credit';
      } else { const amount = parseCsvMoney(cells[mapping.amount], mapping.decimal); if (!amount) throw new Error('Zero-value rows are not transactions.'); transaction.amount = Math.abs(amount); transaction.direction = (mapping.expenseSign === 'negative' ? amount < 0 : amount > 0) ? 'debit' : 'credit'; }
      transaction.fingerprint = JSON.stringify([transaction.date, normalize(transaction.description), moneyInCents(transaction.amount), transaction.currency, transaction.direction, normalize(transaction.reference)]);
      transaction.occurrence = counts.get(transaction.fingerprint) || 0; counts.set(transaction.fingerprint, transaction.occurrence + 1);
    } catch (error) { transaction.error = error instanceof Error ? error.message : 'Invalid transaction.'; }
    return transaction;
  });
}

export function reconcileCsv(transactions: CsvTransaction[], source: ImportSource, expenses: Expense[], incomes: Income[], subscriptions: Subscription[]): ReconciledCsvRow[] {
  const used = new Set<string>();
  const dayDelta = (a: string, b: string) => Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000;
  return transactions.map(transaction => {
    const candidates: ImportCandidate[] = []; const duplicate = transaction.occurrence > 0;
    if (transaction.error) return { transaction, duplicate, candidates, defaultAction: 'skip' };
    const close = (amount: number, currency: string, date: string) => currency === transaction.currency && Math.abs(amount - transaction.amount) < 0.005 && dayDelta(date, transaction.date) <= 3;
    if (transaction.direction === 'debit') {
      for (const expense of expenses) {
        if (source.kind === 'Card' ? expense.linkedCardId && expense.linkedCardId !== source.id : expense.linkedCardId) continue;
        const marker = expense.notes?.match(/\[statement:(?:Cash|Card):[^\]]+\]/)?.[0]; if (marker && marker !== sourceMarker(source)) continue;
        if (!close(expense.amount, expense.currency, expense.expenseDate)) continue;
        candidates.push({ key: `expense:${expense.id}`, kind: 'Expense', name: expense.name, date: expense.expenseDate.slice(0, 10), exact: normalize(expense.name) === normalize(transaction.description) && expense.expenseDate.slice(0, 10) === transaction.date });
      }
      for (const sub of subscriptions) {
        if ((sub.status === 'Past' && (!sub.cancellationDate || transaction.date > sub.cancellationDate.slice(0, 10))) || (sub.cardId && (source.kind !== 'Card' || sub.cardId !== source.id)) || sub.currency !== transaction.currency || Math.abs(sub.price - transaction.amount) >= 0.005) continue;
        const words = normalize(sub.name).split(' ').filter(word => word.length > 2); if (!words.some(word => normalize(transaction.description).split(' ').includes(word))) continue;
        const time = Date.parse(`${transaction.date}T00:00:00Z`); const lower = new Date(time - 4 * 86400000).toISOString().slice(0, 10); const upper = new Date(time + 3 * 86400000).toISOString().slice(0, 10);
        if (!forecastDates(sub.firstPaymentDate.slice(0, 10), sub.billingCycle, lower, upper).length) continue;
        candidates.push({ key: `subscription:${sub.id}:${transaction.date}`, kind: 'Subscription', name: sub.name, date: transaction.date, exact: false });
      }
    } else for (const income of incomes) {
      const date = income.incomeDate || income.firstIncomeDate;
      if (income.incomeMode !== 'One-time' || !close(income.amount, income.currency, date)) continue;
      candidates.push({ key: `income:${income.id}`, kind: 'Income', name: income.name, date: date.slice(0, 10), exact: normalize(income.name) === normalize(transaction.description) && date.slice(0, 10) === transaction.date });
    }
    candidates.sort((a, b) => Number(b.exact) - Number(a.exact) || a.key.localeCompare(b.key));
    const exact = candidates.find(candidate => candidate.exact && !used.has(candidate.key));
    if (exact) used.add(exact.key);
    return { transaction, duplicate, candidates: exact ? [exact, ...candidates.filter(candidate => candidate.key !== exact.key)] : candidates, defaultAction: exact ? 'match' : duplicate || candidates.length || transaction.direction === 'credit' ? 'skip' : 'expense' };
  });
}

export async function importRecordId(scope: string, source: ImportSource, transaction: CsvTransaction) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['statement-import-v1', scope, source.kind, source.id, transaction.fingerprint, transaction.occurrence]))));
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes.slice(0, 16)].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function recordedExpensesNotInCsv(rows: ReconciledCsvRow[], source: ImportSource, expenses: Expense[]) {
  const dates = rows.filter(row => !row.transaction.error).map(row => row.transaction.date).sort();
  if (!dates.length) return [];
  const candidates = new Set(rows.flatMap(row => row.candidates.map(candidate => candidate.key)));
  return expenses.filter(expense => {
    const date = expense.expenseDate.slice(0, 10);
    const sameSource = source.kind === 'Card' ? expense.linkedCardId === source.id : expense.notes?.includes(sourceMarker(source));
    return sameSource && date >= dates[0] && date <= dates.at(-1)! && !candidates.has(`expense:${expense.id}`);
  }).sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
}
