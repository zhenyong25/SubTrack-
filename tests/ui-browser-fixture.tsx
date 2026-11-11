import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';
import AuthScreen from '../components/AuthScreen';

// Synthetic records in an isolated browser profile; never connects to a user account.
const today = new Date().toLocaleDateString('en-CA');
const month = today.slice(0, 7);
const earlier = `${Number(today.slice(0, 4)) - 1}-01-01`;
const save = (key: string, value: unknown) => localStorage.setItem(`subtrack_${key}`, JSON.stringify(value));
const mode = new URLSearchParams(window.location.search).get('mode') || 'populated';
if (!sessionStorage.getItem(`ui-fixture-seeded:${mode}`)) {
  localStorage.clear();
  save('profile', { name: 'Alex Morgan', currency: 'SGD', isLoggedIn: false, friends: [], notificationDays: 3 });
  save('cards_v1', [
    { id: 'card-1', name: 'DBS Altitude Visa', type: 'Visa', kind: 'Credit', last4Digits: '1234', color: '#1e293b', creditLimit: 12000, currentDebt: 850, expiryMonth: 12, expiryYear: 2028 },
    { id: 'card-2', name: 'UOB One', type: 'Mastercard', kind: 'Credit', last4Digits: '5678', color: '#2563eb', creditLimit: 8000, currentDebt: 200, rewardType: 'Cashback' },
  ]);
  save('data_v1', ['Netflix', 'Spotify', 'Microsoft 365', 'YouTube Premium'].map((name, i) => ({
    id: `sub-${i}`, name, price: [22.98, 11.98, 10.8, 17.98][i], currency: 'SGD', billingCycle: 'Monthly',
    firstPaymentDate: earlier, nextPaymentDate: today, category: i % 2 ? 'Music' : 'Entertainment',
    cardName: 'DBS Altitude Visa', cardId: 'card-1', color: '#2563eb', status: 'Active',
  })));
  save('income_v1', [{ id: 'income-1', name: 'Monthly salary', amount: 6500, currency: 'SGD', incomeType: 'Active', incomeMode: 'Recurring', incomeCycle: 'Monthly', firstIncomeDate: earlier, nextIncomeDate: today, category: 'Salary', color: '#10b981', status: 'Active' }]);
  save('expenses_v1', Array.from({ length: 18 }, (_, i) => ({ id: `expense-${i}`, name: ['Groceries', 'Lunch with friends', 'Transport', 'Household essentials'][i % 4], amount: 18.5 + i * 9.4, currency: 'SGD', expenseDate: `${month}-${String(i % 10 + 1).padStart(2, '0')}`, category: ['Food', 'Dining', 'Transport', 'Shopping'][i % 4], color: '#3b82f6', linkedCardId: 'card-1' })));
  save('investments_v1', [
    { id: 'stock-1', name: 'Apple', symbol: 'AAPL', kind: 'Stocks', units: 20, averageCost: 180, currentPrice: 205, currency: 'USD', color: '#64748b', isActive: true, acquiredDate: earlier, accountId: 'broker-1' },
    { id: 'stock-2', name: 'Tesla', symbol: 'TSLA', kind: 'Stocks', units: 10, averageCost: 320, currentPrice: 290, currency: 'USD', color: '#ef4444', isActive: true, positionSide: 'Short', acquiredDate: earlier, accountId: 'broker-1' },
    { id: 'other-1', name: 'Collectible investment with a longer holding name', kind: 'Other', units: 1, averageCost: 400, currentPrice: 520, currency: 'SGD', color: '#a855f7', isActive: true, acquiredDate: earlier },
  ]);
  save('investment_accounts_v1', [{ id: 'broker-1', name: 'IBKR Margin', broker: 'Interactive Brokers', accountType: 'Margin', currency: 'USD', color: '#ef4444' }]);
  save('investment_transactions_v1', [{ id: 'tx-1', investmentId: 'stock-1', transactionType: 'Buy', tradeDate: earlier, units: 20, price: 180, fees: 1, currency: 'USD' }]);
  save('cash_accounts_v1', [{ id: 'bank-1', name: 'Everyday savings', institution: 'DBS', accountType: 'Bank', country: 'Singapore', currency: 'SGD', color: '#ef4444' }]);
  save('cash_balance_entries_v1', [{ id: 'balance-1', accountId: 'bank-1', balanceDate: today, balance: 18500 }]);
  save('loans_v1', [{ id: 'loan-1', name: 'Home renovation', lender: 'DBS', kind: 'Personal', currency: 'SGD', principal: 12000, annualRate: 3.5, interestMethod: 'Reducing', termMonths: 36, startDate: earlier, instalment: 352, paymentDay: 15, color: '#2563eb' }]);
  save('savings_v1', { goals: [{ id: 'goal-1', name: 'Emergency fund', kind: 'Savings', targetAmount: 25000, openingBalance: 9000, currency: 'SGD', targetDate: '2027-12-31', repeatMonths: 0, color: '#10b981', createdAt: earlier, updatedAt: today }], entries: [] });
  save('insurance_v1', [{ id: 'policy-1', name: 'Personal medical coverage', insurer: 'AIA', insuredPerson: 'Alex Morgan', policyNumber: 'DEMO-001', kind: 'Medical', currency: 'SGD', premium: 120, frequency: 'Monthly', coverage: 100000, deductible: 1000, startDate: earlier, endDate: '', renewalDate: today, destination: '', emergencyPhone: '', notes: '', archived: false }]);
  localStorage.setItem('subtrack_theme', 'light');
  if (mode === 'empty') {
    for (const key of Object.keys(localStorage)) if (!['subtrack_profile', 'subtrack_theme'].includes(key)) localStorage.removeItem(key);
  }
  sessionStorage.setItem(`ui-fixture-seeded:${mode}`, '1');
}
// Market endpoints deliberately exercise the unavailable-data state without live services.
window.fetch = async () => new Response(JSON.stringify({ error: 'Market data is unavailable in this local UI fixture.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
createRoot(document.getElementById('root')!).render(mode === 'auth' ? <AuthScreen onAuthenticated={() => {}} /> : <App />);
