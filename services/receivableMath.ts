import type { Receivable, ReceivableEntry } from '../types';
import { CURRENCIES } from '../types';
export const RECEIVABLES_KEY = 'subtrack_receivables_v1';
export interface ReceivablesData { receivables: Receivable[]; entries: ReceivableEntry[] }
export const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
const cents = (amount: number) => {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e10 || Math.abs(amount * 100 - Math.round(amount * 100)) > .001) throw new Error('Use non-negative amounts with at most two decimal places.');
  return Math.round(amount * 100);
};
export function receivableBalance(record: Receivable, entries: ReceivableEntry[], today: string) {
  const relevant = entries.filter(e => e.receivableId === record.id && e.entryDate <= today);
  const principal = Math.max(0, cents(record.principal) - relevant.reduce((sum, e) => sum + cents(e.principal), 0)) / 100;
  const interest = Math.max(0, cents(record.agreedInterest) - relevant.reduce((sum, e) => sum + cents(e.interest), 0)) / 100;
  const repayments = relevant.filter(e => e.kind === 'Repayment');
  return { principal, interest, outstanding: Math.round((principal + interest) * 100) / 100, collected: repayments.reduce((sum, e) => sum + cents(e.principal) + cents(e.interest), 0) / 100, writtenOff: relevant.filter(e => e.kind === 'Write-off').reduce((sum, e) => sum + cents(e.principal) + cents(e.interest), 0) / 100, thisMonth: repayments.filter(e => e.entryDate.slice(0, 7) === today.slice(0, 7)).reduce((sum, e) => sum + cents(e.principal) + cents(e.interest), 0) / 100 };
}
export function validateReceivable(record: Receivable, entries: ReceivableEntry[], today: string, previous?: Receivable) {
  if (!CURRENCIES.includes(record.currency) || !['One-off', 'Instalments'].includes(record.repaymentPlan)) throw new Error('Choose a supported currency and repayment plan.');
  if (!record.borrower.trim() || !record.description.trim()) throw new Error('Enter a borrower and description.');
  if (!validDate(record.lentDate) || record.lentDate > today || record.dueDate && (!validDate(record.dueDate) || record.dueDate < record.lentDate)) throw new Error('Check the lent date and due date.');
  if (cents(record.principal) <= 0) throw new Error('Amount lent must be greater than zero.');
  cents(record.agreedInterest);
  if (record.repaymentPlan === 'Instalments' && (!record.instalment || cents(record.instalment) <= 0)) throw new Error('Enter a positive instalment amount.');
  const history = entries.filter(e => e.receivableId === record.id);
  if (previous && history.length && (previous.currency !== record.currency || previous.lentDate !== record.lentDate)) throw new Error('Currency and lent date cannot change after repayments or write-offs are recorded.');
  if (cents(record.principal) < history.reduce((sum, e) => sum + cents(e.principal), 0) || cents(record.agreedInterest) < history.reduce((sum, e) => sum + cents(e.interest), 0)) throw new Error('The agreed amounts cannot be less than payments and write-offs already recorded.');
}
export function validateReceivableEntry(entry: ReceivableEntry, record: Receivable, entries: ReceivableEntry[], today: string) {
  if (!['Repayment', 'Write-off'].includes(entry.kind) || !validDate(entry.entryDate) || entry.entryDate > today || entry.entryDate < record.lentDate) throw new Error('Entry date must be between the lent date and today.');
  if (cents(entry.principal) + cents(entry.interest) <= 0) throw new Error('Enter an amount greater than zero.');
  if (entry.kind === 'Write-off' && !entry.notes?.trim()) throw new Error('Add a reason for the write-off.');
  const balance = receivableBalance(record, entries, today);
  if (cents(entry.principal) > cents(balance.principal) || cents(entry.interest) > cents(balance.interest)) throw new Error('The entry exceeds the outstanding principal or interest.');
}
