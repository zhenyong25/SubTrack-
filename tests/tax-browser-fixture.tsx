import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TaxTab from '../components/TaxTab';
import type { Income } from '../types';

// A salaried employee: $8,000 a month since 2025, plus a one-off bonus this year.
const year = new Date().getFullYear();
const incomes: Income[] = [
  { id: 'salary', name: 'Salary', amount: 8_000, currency: 'SGD', incomeType: 'Active', incomeMode: 'Recurring', incomeCycle: 'Monthly', firstIncomeDate: `${year - 1}-01-25`, nextIncomeDate: '', category: 'Salary', color: '#000', status: 'Active' },
  { id: 'bonus', name: 'Bonus', amount: 12_000, currency: 'SGD', incomeType: 'Active', incomeMode: 'One-time', incomeCycle: 'Monthly', firstIncomeDate: `${year}-03-01`, incomeDate: `${year}-03-01`, nextIncomeDate: '', category: 'Bonus', color: '#000', status: 'Active' },
];
function Fixture() {
  const [rows, setRows] = useState(incomes);
  (window as any).updateTaxSalary = (amount: number) => setRows(prev => prev.map(i => i.id === 'salary' ? { ...i, amount } : i));
  return <main className="mx-auto max-w-7xl p-3 text-textMain sm:p-6"><TaxTab incomes={rows} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
