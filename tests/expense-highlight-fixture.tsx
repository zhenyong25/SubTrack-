import React from 'react';
import { createRoot } from 'react-dom/client';
import ExpenseTab from '../components/ExpenseTab';
import type { Expense } from '../types';

// This month: Food on the 3rd and 5th (two items), Transport on the 4th, Rental on the 1st.
const now = new Date();
const day = (d: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const expense = (id: string, name: string, amount: number, d: number, category: string, color: string): Expense => ({ id, name, amount, currency: 'SGD', expenseDate: day(d), category, color });
const expenses = [
  expense('rent', 'Room rent', 900, 1, 'Rental', '#16a34a'), expense('lunch', 'Chicken rice', 15, 3, 'Food', '#f97316'),
  expense('bus', 'Bus fare', 20, 4, 'Transport', '#14b8a6'), expense('kopi', 'Kopi', 10, 5, 'Food', '#f97316'), expense('bun', 'Big pau', 5, 5, 'Food', '#f97316'),
];
const noop = () => undefined;
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-7xl p-3 text-textMain sm:p-6"><ExpenseTab expenses={expenses} subscriptions={[]} budgetPlans={[]} baseCurrency="SGD" onCurrencyChange={noop} onAddExpense={noop} onEditExpense={noop} onDeleteExpense={noop} onSaveBudgetPlan={noop} /></main>);
