import { Expense } from '../types';

export const splitSearchTerms = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

// Every term has to match somewhere in the expense - name, category, notes, card, amount,
// currency, or the date (2026-09-20, "september", "sep", "2026") - so "grab sep" finds
// September's Grab rides.
export const expenseMatchesSearch = (expense: Expense, terms: string[]): boolean => {
  if (terms.length === 0) return true;
  const day = expense.expenseDate.split('T')[0];
  const date = new Date(`${day}T00:00:00`);
  const dateText = Number.isNaN(date.getTime())
    ? expense.expenseDate
    : `${day} ${date.toLocaleString('en-US', { month: 'long' })} ${date.toLocaleString('en-US', { month: 'short' })} ${date.getFullYear()}`;
  const haystack = [
    expense.name,
    expense.category,
    expense.notes,
    expense.linkedCardName,
    expense.amount.toFixed(2),
    String(expense.amount),
    expense.currency,
    dateText,
  ].filter(Boolean).join(' ').toLowerCase();
  return terms.every(term => haystack.includes(term));
};
