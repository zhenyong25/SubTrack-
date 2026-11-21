import React from 'react';
import { createRoot } from 'react-dom/client';
import FinanceWorld from '../components/FinanceWorld';
import { CITY_PREFIX, LEVEL_XP, build, newCity, type CityState } from '../services/cityGameService';
import type { Expense } from '../types';

// A small city last visited 5 hours ago, on a 2-day streak, with an expense recorded today and
// XP just short of level 5, so collecting what it earned levels it up.
const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = Date.now(), then = now - 5 * 3600000;
const today = local(new Date()), yesterday = local(new Date(now - 86400000));
let city: CityState = { ...newCity(then, today), coins: 5000 };
city = build(city, 'cafe', 44, 52, then, today, 'cafe').state!;
city = build(city, 'cottage', 45, 52, then, today, 'home').state!;
for (let i = 0; i < 10; i += 1) city = build(city, 'tree', 40 + i, 56, then, today, `tree-${i}`).state!;
// XP is set after building, which earns XP of its own.
city = { ...city, xp: LEVEL_XP[5] - 5, streak: { count: 2, lastDay: yesterday, best: 2 }, updatedAt: then };
localStorage.setItem(CITY_PREFIX + 'fun-browser', JSON.stringify(city));
const expenses: Expense[] = [{ id: 'lunch', name: 'Lunch', amount: 8, currency: 'SGD', expenseDate: today, category: 'Food', color: '#f97316' }];
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-7xl p-3 text-textMain"><FinanceWorld owner="fun-browser" expenses={expenses} incomes={[]} subscriptions={[]} loans={[]} loanPayments={[]} onOpen={() => {}} /></main>);
