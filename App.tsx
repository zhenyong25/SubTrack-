
import React, { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Bell, CheckCircle, Plus, Landmark, TrendingUp, Wallet } from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import AddSubscription from './components/AddSubscription';
import AddIncome from './components/AddIncome';
import AddExpense from './components/AddExpense';
import SubscriptionDetail from './components/SubscriptionDetail';
import Settings from './components/Settings';
import CardDetail from './components/CardDetail';
import CardsTab from './components/CardsTab';
import IncomeTab from './components/IncomeTab';
import ExpenseTab from './components/ExpenseTab';
import InvestmentTab from './components/InvestmentTab';
import { deleteInvestmentTransaction, deletePokerMttBankrollTransaction } from './services/appDataService';
import CashFlowTab from './components/CashFlowTab';
import { Subscription, BillingCycle, UserProfile, PaymentCard, Income, Expense, BudgetPlan, CardBenefit, InvestmentHolding, InvestmentTransaction, InvestmentValuation, CardPointTransaction, PokerMttTournament, PokerMttBankrollTransaction, CashAccount, CashBalanceEntry } from './types';
import { calculateNextPayment, isUpcoming, getUrgencyLevel } from './services/storageService';
import { clearStoredAppData, createDefaultProfile, getSupabaseClient, getSupabaseSession, isSupabaseConfigured, loadAppData, saveBudgetPlans, saveCardPointTransactions, saveCards, saveCashAccounts, saveCashBalanceEntries, saveExpenses, saveIncomes, saveInvestmentTransactions, saveInvestments, savePokerMttBankrollTransactions, savePokerMttTournaments, saveProfile, saveSubscriptions, signOut as supabaseSignOut } from './services/appDataService';
import { getCardBenefitsForCard } from './services/cardBenefitsService';
import AppLogo from './components/AppLogo';

enum Tab {
  Dashboard = 'Dashboard',
  Cards = 'Cards',
  Expenses = 'Expenses',
  Income = 'Income',
  Investment = 'Investment',
  CashFlow = 'CashFlow',
  Settings = 'Settings'
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.Dashboard);
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingIncome, setIsAddingIncome] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | undefined>(undefined);
  const [editingIncome, setEditingIncome] = useState<Income | undefined>(undefined);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(undefined);
  const [presetExpenseDate, setPresetExpenseDate] = useState<string | undefined>(undefined);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgetPlans, setBudgetPlans] = useState<BudgetPlan[]>([]);
  const [investments, setInvestments] = useState<InvestmentHolding[]>([]);
  const [investmentValuations, setInvestmentValuations] = useState<InvestmentValuation[]>([]);
  const [investmentTransactions, setInvestmentTransactions] = useState<InvestmentTransaction[]>([]);
  const [pokerMttTournaments, setPokerMttTournaments] = useState<PokerMttTournament[]>([]);
  const [pokerMttBankrollTransactions, setPokerMttBankrollTransactions] = useState<PokerMttBankrollTransaction[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [cashBalanceEntries, setCashBalanceEntries] = useState<CashBalanceEntry[]>([]);
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [cardPointTransactions, setCardPointTransactions] = useState<CardPointTransaction[]>([]);
  const [cardBenefits, setCardBenefits] = useState<CardBenefit[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(isSupabaseConfigured());
  const [session, setSession] = useState<Session | null>(null);
  
  // Card Management State
  const [addingCard, setAddingCard] = useState<PaymentCard | null>(null);

  // User Profile State
  const [userProfile, setUserProfile] = useState<UserProfile>({ 
      name: '', 
      currency: 'SGD', 
      isLoggedIn: false, 
      friends: [],
      notificationDays: 3,
  });
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Load auth state, data and theme on mount
  useEffect(() => {
    // Theme
    const savedTheme = localStorage.getItem('subtrack_theme');
    if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }

    let authSubscription: { unsubscribe: () => void } | null = null;
    let alive = true;

    const bootstrapAuth = async () => {
      if (!isSupabaseConfigured()) {
        setAuthChecking(false);
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        setAuthChecking(false);
        return;
      }

      const currentSession = await getSupabaseSession();
      if (!alive) return;

      setSession(currentSession);
      setAuthChecking(false);

      const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        setAuthChecking(false);
      });
      authSubscription = data.subscription;
    };

    void bootstrapAuth();

    // Click outside handler for notifications
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      alive = false;
      authSubscription?.unsubscribe();
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrapData = async () => {
      if (authChecking) return;

      if (isSupabaseConfigured() && !session) {
        setUserProfile(createDefaultProfile());
        setSubscriptions([]);
        setIncomes([]);
        setExpenses([]);
        setBudgetPlans([]);
        setInvestments([]);
        setInvestmentValuations([]);
        setInvestmentTransactions([]);
        setPokerMttTournaments([]);
        setPokerMttBankrollTransactions([]);
        setCashAccounts([]);
        setCashBalanceEntries([]);
        setCards([]);
        setCardPointTransactions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const loaded = await loadAppData();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const updated = loaded.subscriptions.map(sub => {
          let next = sub.nextPaymentDate;
          let status = sub.status || 'Active';
          let cancellationDate = sub.cancellationDate;
          const nextDate = new Date(next || sub.firstPaymentDate);

          if (
            status === 'Active' &&
            sub.billingCycle === BillingCycle.FreeTrial &&
            !Number.isNaN(nextDate.getTime()) &&
            nextDate < todayStart
          ) {
            status = 'Past';
            cancellationDate = cancellationDate || next || sub.firstPaymentDate;
          }

          if (new Date(next) < new Date() && status === 'Active') {
            if (sub.billingCycle !== BillingCycle.FreeTrial) {
              next = calculateNextPayment(sub.firstPaymentDate, sub.billingCycle);
            }
          }
          return { ...sub, status, cancellationDate, nextPaymentDate: next };
        });

        if (cancelled) return;

        const sessionEmail = session?.user.email;
        const sessionPhoto =
          session?.user.user_metadata?.avatar_url ||
          session?.user.user_metadata?.picture ||
          undefined;

        setUserProfile({
          ...loaded.profile,
          email: sessionEmail || loaded.profile.email,
          photoUrl: loaded.profile.photoUrl || sessionPhoto,
          isLoggedIn: Boolean(session || loaded.userId),
        });
        setSubscriptions(updated);
        setIncomes(loaded.incomes);
        setExpenses(loaded.expenses);
        setBudgetPlans(loaded.budgetPlans ?? []);
        setInvestments(loaded.investments);
        setInvestmentValuations(loaded.investmentValuations);
        setInvestmentTransactions(loaded.investmentTransactions);
        setPokerMttTournaments(loaded.pokerMttTournaments);
        setPokerMttBankrollTransactions(loaded.pokerMttBankrollTransactions);
        setCashAccounts(loaded.cashAccounts);
        setCashBalanceEntries(loaded.cashBalanceEntries);
        setCards(loaded.cards);
        setCardPointTransactions(loaded.cardPointTransactions);
        setCardBenefits(loaded.cardBenefits);
        void saveSubscriptions(updated);

        if (loaded.userId) {
          void saveProfile({ ...loaded.profile, isLoggedIn: true });
          void saveIncomes(loaded.incomes);
          void saveExpenses(loaded.expenses);
          void saveInvestmentTransactions(loaded.investmentTransactions);
          void savePokerMttTournaments(loaded.pokerMttTournaments);
          void savePokerMttBankrollTransactions(loaded.pokerMttBankrollTransactions);
          void saveCardPointTransactions(loaded.cardPointTransactions);
        }
      } catch (error) {
        console.error('Failed to load app data', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void bootstrapData();

    return () => {
      cancelled = true;
    };
  }, [authChecking, session]);

  // Deep link support (e.g. iOS Back Tap / Action Button shortcuts): opening the app
  // with ?add=expense|income|subscription jumps straight to that form.
  useEffect(() => {
    if (authChecking || isLoading) return;
    if (isSupabaseConfigured() && !session) return;

    const params = new URLSearchParams(window.location.search);
    const add = params.get('add');
    if (!add) return;

    if (add === 'expense') {
      setActiveTab(Tab.Expenses);
      setEditingExpense(undefined);
      setIsAddingExpense(true);
    } else if (add === 'income') {
      setActiveTab(Tab.Income);
      setEditingIncome(undefined);
      setIsAddingIncome(true);
    } else if (add === 'subscription') {
      setEditingSub(undefined);
      setIsAdding(true);
    }

    const url = new URL(window.location.href);
    url.searchParams.delete('add');
    window.history.replaceState({}, '', url.toString());
  }, [authChecking, isLoading, session]);

  const showToast = (msg: string) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3000);
  };

  const toggleTheme = () => {
    const newMode = !isDark;
    setIsDark(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('subtrack_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('subtrack_theme', 'light');
    }
  };

  const handleUpdateProfile = (profile: UserProfile) => {
      setUserProfile(profile);
      void saveProfile(profile);
  };

  const handleSignOut = async () => {
      await supabaseSignOut();
      setSession(null);
      setSubscriptions([]);
      setIncomes([]);
      setExpenses([]);
      setBudgetPlans([]);
      setInvestments([]);
      setInvestmentValuations([]);
      setInvestmentTransactions([]);
      setCashAccounts([]);
      setCashBalanceEntries([]);
      setCards([]);
      setCardPointTransactions([]);
      setCardBenefits([]);
      setUserProfile(createDefaultProfile());
      setSelectedSubId(null);
      setEditingSub(undefined);
      setIsAdding(false);
      setEditingIncome(undefined);
      setIsAddingIncome(false);
      setEditingExpense(undefined);
      setIsAddingExpense(false);
      setActiveTab(Tab.Dashboard);
      showToast('Signed out.');
  };

  const handleCurrencyChange = (curr: string) => {
    handleUpdateProfile({ ...userProfile, currency: curr });
  };

  const handleUpdateCardPointTransactions = (transactions: CardPointTransaction[]) => {
    setCardPointTransactions(transactions);
    void saveCardPointTransactions(transactions);
  };

  const handleSaveCashAccount = (account: CashAccount) => {
    const exists = cashAccounts.some(item => item.id === account.id);
    const updated = exists
      ? cashAccounts.map(item => (item.id === account.id ? account : item))
      : [...cashAccounts, account];
    setCashAccounts(updated);
    void saveCashAccounts(updated);
    showToast(exists ? `Updated ${account.name}` : `Added ${account.name}`);
  };

  const handleDeleteCashAccount = (accountId: string) => {
    const updatedAccounts = cashAccounts.filter(item => item.id !== accountId);
    setCashAccounts(updatedAccounts);
    void saveCashAccounts(updatedAccounts);

    const updatedEntries = cashBalanceEntries.filter(entry => entry.accountId !== accountId);
    setCashBalanceEntries(updatedEntries);
    void saveCashBalanceEntries(updatedEntries);
    showToast('Account removed');
  };

  const handleSaveCashBalanceEntry = (entry: CashBalanceEntry) => {
    const updated = [...cashBalanceEntries, entry];
    setCashBalanceEntries(updated);
    void saveCashBalanceEntries(updated);
    showToast('Balance logged');
  };

  const handleDeleteCashBalanceEntry = (entryId: string) => {
    const updated = cashBalanceEntries.filter(entry => entry.id !== entryId);
    setCashBalanceEntries(updated);
    void saveCashBalanceEntries(updated);
  };

  const handleAddOrUpdateSubscription = (data: Omit<Subscription, 'id' | 'nextPaymentDate'>, newCard?: PaymentCard) => {
    // 1. Handle New Card Creation
    let updatedCards = [...cards];
    if (newCard) {
        // Avoid duplications if ID already exists
        if (!cards.find(c => c.id === newCard.id)) {
            updatedCards = [...cards, newCard];
            setCards(updatedCards);
            void saveCards(updatedCards);
        }
    }

    // 2. Handle Subscription
    if (editingSub) {
        const updatedList = subscriptions.map(s =>
          s.id === editingSub.id
            ? {
                ...data,
                id: editingSub.id,
                nextPaymentDate: calculateNextPayment(data.firstPaymentDate, data.billingCycle),
              }
            : s
        );
        setSubscriptions(updatedList);
        void saveSubscriptions(updatedList);
        showToast(`Updated ${data.name}`);
    } else {
        const newSub: Subscription = {
            ...data,
            id: crypto.randomUUID(),
            nextPaymentDate: calculateNextPayment(data.firstPaymentDate, data.billingCycle)
        };
        const updatedList = [...subscriptions, newSub];
        setSubscriptions(updatedList);
        void saveSubscriptions(updatedList);
        showToast(`Added ${newSub.name}`);
    }
    
    setIsAdding(false);
    setEditingSub(undefined);
    if(editingSub) setSelectedSubId(editingSub.id);
    else setActiveTab(Tab.Dashboard);
  };

  const handleAddOrUpdateIncome = (data: Omit<Income, 'id'>) => {
    if (editingIncome) {
      const updatedList = incomes.map(income =>
        income.id === editingIncome.id
          ? {
              ...data,
              id: editingIncome.id,
              nextIncomeDate:
                data.incomeMode === 'One-time'
                  ? data.incomeDate || data.firstIncomeDate
                  : calculateNextPayment(data.firstIncomeDate, data.incomeCycle as BillingCycle),
            }
          : income
      );
      setIncomes(updatedList);
      void saveIncomes(updatedList);
      showToast(`Updated ${data.name}`);
    } else {
      const newIncome: Income = {
        ...data,
        id: crypto.randomUUID(),
        nextIncomeDate:
          data.incomeMode === 'One-time'
            ? data.incomeDate || data.firstIncomeDate
            : calculateNextPayment(data.firstIncomeDate, data.incomeCycle as BillingCycle),
      };
      const updatedList = [...incomes, newIncome];
      setIncomes(updatedList);
      void saveIncomes(updatedList);
      showToast(`Added ${newIncome.name}`);
    }

    setIsAddingIncome(false);
    setEditingIncome(undefined);
    setActiveTab(Tab.Income);
  };

  const handleAddOrUpdateExpense = async (data: Omit<Expense, 'id'>) => {
    if (editingExpense) {
      const updatedList = expenses.map(expense =>
        expense.id === editingExpense.id
          ? {
              ...data,
              id: editingExpense.id,
            }
          : expense
      );
      setExpenses(updatedList);
      const saved = await saveExpenses(updatedList);
      showToast(saved ? `Updated ${data.name}` : `Failed to save ${data.name} to Supabase`);
    } else {
      const newExpense: Expense = {
        ...data,
        id: crypto.randomUUID(),
      };
      const updatedList = [...expenses, newExpense];
      setExpenses(updatedList);
      const saved = await saveExpenses(updatedList);
      showToast(saved ? `Added ${newExpense.name}` : `Failed to save ${newExpense.name} to Supabase`);
    }

    setIsAddingExpense(false);
    setEditingExpense(undefined);
    setPresetExpenseDate(undefined);
    setActiveTab(Tab.Expenses);
  };

  const handleCloneSubscription = (originalSub: Subscription) => {
      const newSub: Subscription = {
          ...originalSub,
          id: crypto.randomUUID(),
          firstPaymentDate: new Date().toISOString(),
          nextPaymentDate: calculateNextPayment(new Date().toISOString(), originalSub.billingCycle),
          status: 'Active',
          cancellationDate: undefined,
          paymentHistory: {} // Start fresh history
      };
      const updatedList = [...subscriptions, newSub];
      setSubscriptions(updatedList);
      void saveSubscriptions(updatedList);
      setSelectedSubId(newSub.id); // Switch view to new sub
      showToast(`${newSub.name} renewed!`);
  };

  const handleStartEdit = (sub: Subscription) => {
      setEditingSub(sub);
      setSelectedSubId(null);
      setIsAdding(true);
  };

  const handleCancelAdd = () => {
      setIsAdding(false);
      setEditingSub(undefined);
      if(editingSub) setSelectedSubId(editingSub.id);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this subscription permanently?")) {
      const updated = subscriptions.filter(s => s.id !== id);
      setSubscriptions(updated);
      void saveSubscriptions(updated);
      setSelectedSubId(null);
      showToast("Subscription deleted.");
    }
  };

  const handleDeleteIncome = (id: string) => {
    if (confirm('Are you sure you want to delete this income source permanently?')) {
      const updated = incomes.filter(income => income.id !== id);
      setIncomes(updated);
      void saveIncomes(updated);
      showToast('Income source deleted.');
    }
  };

  const handleDeleteExpense = (id: string) => {
    if (confirm('Are you sure you want to delete this expense permanently?')) {
      const updated = expenses.filter(expense => expense.id !== id);
      setExpenses(updated);
      void saveExpenses(updated);
      showToast('Expense deleted.');
    }
  };

  const handleAddInvestmentTransaction = async (transaction: Omit<InvestmentTransaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTransaction: InvestmentTransaction = {
      ...transaction,
      id: crypto.randomUUID(),
    };

    const updatedTransactions = [...investmentTransactions, newTransaction].sort(
      (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
    );
    setInvestmentTransactions(updatedTransactions);
    void saveInvestmentTransactions(updatedTransactions);

    const updatedHoldings = investments.map(holding => {
      if (holding.id !== newTransaction.investmentId) return holding;

      const prevUnits = holding.units;
      const prevBasis = prevUnits * holding.averageCost;
      const tradeUnits = Math.max(0, newTransaction.units);
      const tradeValue = tradeUnits * newTransaction.price;

      if (newTransaction.transactionType === 'Buy' || newTransaction.transactionType === 'Transfer In') {
        const nextUnits = prevUnits + tradeUnits;
        const nextBasis = prevBasis + tradeValue + newTransaction.fees;
        return {
          ...holding,
          units: nextUnits,
          averageCost: nextUnits > 0 ? nextBasis / nextUnits : 0,
          acquiredDate: holding.acquiredDate || newTransaction.tradeDate,
        };
      }

      if (newTransaction.transactionType === 'Sell' || newTransaction.transactionType === 'Transfer Out') {
        const nextUnits = Math.max(0, prevUnits - tradeUnits);
        return {
          ...holding,
          units: nextUnits,
          averageCost: nextUnits > 0 ? holding.averageCost : 0,
        };
      }

      if (newTransaction.transactionType === 'Fee') {
        const nextBasis = prevBasis + newTransaction.fees;
        return {
          ...holding,
          averageCost: prevUnits > 0 ? nextBasis / prevUnits : holding.averageCost,
        };
      }

      return holding;
    });

    setInvestments(updatedHoldings);
    void saveInvestments(updatedHoldings);

    showToast(`Logged ${newTransaction.transactionType} for ${newTransaction.source || 'investment'}`);
  };

  const handleDeleteInvestmentTransaction = async (transactionId: string) => {
    const transaction = investmentTransactions.find(entry => entry.id === transactionId);
    if (!transaction) return;
    if (!confirm('Delete this transaction log? The holding\'s units and average cost will stay unchanged.')) return;

    await deleteInvestmentTransaction(transactionId);
    setInvestmentTransactions(current => current.filter(entry => entry.id !== transactionId));
    showToast('Transaction log deleted.');
  };

  const handleAddInvestmentHolding = async (holding: InvestmentHolding) => {
    const updatedHoldings = [...investments, holding];
    setInvestments(updatedHoldings);
    await saveInvestments(updatedHoldings);
    showToast(`Added ${holding.name}`);
  };

  const handleAddPokerMttTournament = async (tournament: PokerMttTournament) => {
    const updated = [...pokerMttTournaments.filter(item => item.id !== tournament.id), tournament].sort((a, b) => new Date(a.tournamentDate).getTime() - new Date(b.tournamentDate).getTime());
    setPokerMttTournaments(updated);
    await savePokerMttTournaments(updated);
    showToast('Poker tournament saved.');
  };

  const handleAddPokerMttBankrollTransaction = async (event: PokerMttBankrollTransaction) => {
    const updated = [...pokerMttBankrollTransactions, event].sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    setPokerMttBankrollTransactions(updated);
    await savePokerMttBankrollTransactions(updated);
    showToast('Poker bankroll entry saved.');
  };

  const handleClearData = async () => {
      if(confirm("This will wipe all your subscriptions, income sources, expenses, and cards. Are you sure?")) {
          setSubscriptions([]);
          setIncomes([]);
          setExpenses([]);
          setBudgetPlans([]);
          setCards([]);
          setInvestments([]);
          setInvestmentValuations([]);
          setInvestmentTransactions([]);
          setPokerMttTournaments([]);
          setPokerMttBankrollTransactions([]);
          setUserProfile(createDefaultProfile());
          setEditingSub(undefined);
          setEditingIncome(undefined);
          setEditingExpense(undefined);
          setIsAdding(false);
          setIsAddingIncome(false);
          setIsAddingExpense(false);
          await clearStoredAppData();
          showToast("All data cleared.");
      }
  };

  const handleUpdateCard = (updatedCard: PaymentCard) => {
      const updatedCards = cards.map(c => c.id === updatedCard.id ? updatedCard : c);
      setCards(updatedCards);
      void saveCards(updatedCards);
      showToast("Card details updated");
  };

  // Start "Add Card" flow - Open modal with blank card
  const handleAddNewCardStart = () => {
      const newCardTemplate: PaymentCard = {
          id: 'new', // Flag as new
          name: '',
          kind: 'Credit',
          type: 'Visa',
          last4Digits: '',
          color: '#1e293b',
          creditLimit: 0,
          currentDebt: 0,
          currentBalance: 0,
      };
      setAddingCard(newCardTemplate);
  };

  const handleEditCardStart = (card: PaymentCard) => {
      setAddingCard(card);
  };

  const handleAddNewIncomeStart = () => {
      setEditingIncome(undefined);
      setIsAddingIncome(true);
  };

  const handleEditIncomeStart = (income: Income) => {
      setEditingIncome(income);
      setIsAddingIncome(true);
  };

  const handleAddNewExpenseStart = (expenseDate?: string) => {
      setEditingExpense(undefined);
      setPresetExpenseDate(expenseDate);
      setIsAddingExpense(true);
  };

  const handleEditExpenseStart = (expense: Expense) => {
      setPresetExpenseDate(undefined);
      setEditingExpense(expense);
      setIsAddingExpense(true);
  };

  const handleSaveBudgetPlan = (plan: BudgetPlan) => {
      const updated = budgetPlans.some(item => item.month === plan.month)
        ? budgetPlans.map(item => item.month === plan.month ? plan : item)
        : [...budgetPlans, plan];
      setBudgetPlans(updated);
      void saveBudgetPlans(updated);
      showToast('Budget plan saved');
  };

  // Save new or existing card from modal
  const handleSaveCardFromModal = (card: PaymentCard) => {
      if (card.id === 'new') {
          // Create new
          const realNewCard = { ...card, id: crypto.randomUUID() };
          const newCards = [...cards, realNewCard];
          setCards(newCards);
          void saveCards(newCards);
          showToast("New card added");
      } else {
          // Update existing
          handleUpdateCard(card);
      }
      setAddingCard(null);
  };

  const getUpcomingNotifications = () => {
      return subscriptions
          .filter(s => s.status === 'Active' && isUpcoming(s.nextPaymentDate, userProfile.notificationDays))
          .sort((a, b) => new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime());
  };

  if (isAdding) {
    return (
      <AddSubscription 
        onSave={handleAddOrUpdateSubscription} 
        onCancel={handleCancelAdd} 
        initialData={editingSub}
        savedCards={cards}
      />
    );
  }

  if (isAddingIncome) {
    return (
      <AddIncome
        onSave={handleAddOrUpdateIncome}
        onCancel={() => {
          setIsAddingIncome(false);
          setEditingIncome(undefined);
        }}
        initialData={editingIncome}
      />
    );
  }

  if (isAddingExpense) {
    return (
      <AddExpense
        onSave={handleAddOrUpdateExpense}
        onCancel={() => {
          setIsAddingExpense(false);
          setEditingExpense(undefined);
          setPresetExpenseDate(undefined);
        }}
        initialData={editingExpense}
        initialDate={presetExpenseDate}
        cards={cards}
      />
    );
  }

  const selectedSub = subscriptions.find(s => s.id === selectedSubId);
  const upcomingNotifications = getUpcomingNotifications();

  if (authChecking || (isSupabaseConfigured() && session && isLoading)) {
    return (
      <div className="min-h-screen bg-background text-textMain flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <AppLogo />
          </div>
          <p className="text-sm font-semibold">Loading SubTrack...</p>
        </div>
      </div>
    );
  }

  if (isSupabaseConfigured() && !session) {
    return <AuthScreen onAuthenticated={() => undefined} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-textMain flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 animate-pulse">
            <AppLogo />
          </div>
          <p className="text-sm font-semibold">Loading SubTrack...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen text-textMain font-sans selection:bg-primary selection:text-white transition-colors duration-300">
      {/* Header */}
      <header className="fixed top-0 w-full z-20 bg-background/90 backdrop-blur-md border-b border-border px-6 pb-4 flex justify-between items-center transition-colors duration-300" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="flex items-center space-x-3">
             <AppLogo />
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
               {activeTab === Tab.Investment
                 ? (userProfile.name ? `${userProfile.name}'s Portfolio` : 'Portfolio')
                 : (userProfile.name ? `${userProfile.name}'s SubTrack` : 'SubTrack')}
            </h1>
        </div>
        <div className="flex items-center space-x-3 relative" ref={notificationRef}>
            <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className={`p-2 rounded-full transition-colors relative ${showNotifications || upcomingNotifications.length > 0 ? 'text-primary' : 'text-secondary hover:text-textMain'}`}
            title="Notifications"
            >
            <Bell size={20} />
            {upcomingNotifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background"></span>
            )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
                <div className="absolute top-12 right-0 w-72 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-scale-in">
                    <div className="bg-background px-4 py-3 border-b border-border flex justify-between items-center">
                        <span className="text-sm font-bold text-textMain">Upcoming Bills</span>
                        <span className="text-[10px] text-secondary bg-background border border-border px-2 py-0.5 rounded-full">{upcomingNotifications.length}</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {upcomingNotifications.length > 0 ? (
                            upcomingNotifications.map(sub => {
                                const urgency = getUrgencyLevel(sub.nextPaymentDate);
                                return (
                                    <div key={sub.id} className="p-3 border-b border-border/50 hover:bg-background/50 transition-colors flex items-center space-x-3">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: urgency === 'critical' ? '#ef4444' : '#f59e0b' }}></div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-textMain truncate">{sub.name}</p>
                                            <p className="text-xs text-secondary">Due {new Date(sub.nextPaymentDate).toLocaleDateString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold">{sub.price.toFixed(2)}</p>
                                            <p className="text-[10px] text-secondary">{sub.currency}</p>
                                        </div>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="p-6 text-center text-secondary">
                                <CheckCircle size={24} className="mx-auto mb-2 opacity-50" />
                                <p className="text-xs">All bills paid for now!</p>
                            </div>
                        )}
                    </div>
                    {upcomingNotifications.length > 0 && (
                        <div className="p-2 bg-background border-t border-border text-center">
                            <p className="text-[10px] text-secondary">Alerts set to {userProfile.notificationDays} days before due.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
      </header>

      {/* Main Content */}
      <main
        className="px-4 max-w-2xl mx-auto"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 6rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)',
        }}
      >
        {activeTab === Tab.Dashboard && (
          <Dashboard 
            subscriptions={subscriptions} 
            cards={cards}
            baseCurrency={userProfile.currency}
            onCurrencyChange={handleCurrencyChange}
            onUpdateCard={handleUpdateCard}
            cardPointTransactions={cardPointTransactions}
            onUpdateCardPointTransactions={handleUpdateCardPointTransactions}
            onAddCard={handleAddNewCardStart}
            onDeleteSubscription={handleDelete}
            onSelectSubscription={setSelectedSubId}
          />
        )}
        
        {activeTab === Tab.Cards && (
            <CardsTab
                cards={cards}
                subscriptions={subscriptions}
                expenses={expenses}
                cardBenefits={cardBenefits}
                cardPointTransactions={cardPointTransactions}
                baseCurrency={userProfile.currency}
                onAddCard={handleAddNewCardStart}
                onEditCard={handleEditCardStart}
            />
        )}

        {activeTab === Tab.Expenses && (
            <ExpenseTab
                expenses={expenses}
                subscriptions={subscriptions}
                budgetPlans={budgetPlans}
                baseCurrency={userProfile.currency}
                onCurrencyChange={handleCurrencyChange}
                onAddExpense={handleAddNewExpenseStart}
                onEditExpense={handleEditExpenseStart}
                onDeleteExpense={handleDeleteExpense}
                onSaveBudgetPlan={handleSaveBudgetPlan}
            />
        )}

        {activeTab === Tab.Income && (
            <IncomeTab
                incomes={incomes}
                baseCurrency={userProfile.currency}
                onCurrencyChange={handleCurrencyChange}
                onAddIncome={handleAddNewIncomeStart}
                onEditIncome={handleEditIncomeStart}
                onDeleteIncome={handleDeleteIncome}
            />
        )}

        {activeTab === Tab.Investment && (
        <InvestmentTab
                baseCurrency={userProfile.currency}
                investments={investments}
                valuations={investmentValuations}
                transactions={investmentTransactions}
                pokerMttTournaments={pokerMttTournaments}
                pokerMttBankrollTransactions={pokerMttBankrollTransactions}
                onAddTransaction={handleAddInvestmentTransaction}
                onDeleteTransaction={handleDeleteInvestmentTransaction}
                onCreateHolding={handleAddInvestmentHolding}
                onAddPokerMttTournament={handleAddPokerMttTournament}
                onDeletePokerMttTournament={(tournamentId) => {
                  const updated = pokerMttTournaments.filter(tournament => tournament.id !== tournamentId);
                  setPokerMttTournaments(updated);
                  void savePokerMttTournaments(updated);
                }}
                onAddPokerMttBankrollTransaction={handleAddPokerMttBankrollTransaction}
                onDeletePokerMttBankrollTransaction={async eventId => {
                  await deletePokerMttBankrollTransaction(eventId);
                  setPokerMttBankrollTransactions(current => current.filter(event => event.id !== eventId));
                  showToast('Bankroll entry deleted.');
                }}
            />
        )}

        {activeTab === Tab.CashFlow && (
            <CashFlowTab
                baseCurrency={userProfile.currency}
                accounts={cashAccounts}
                balanceEntries={cashBalanceEntries}
                onSaveAccount={handleSaveCashAccount}
                onDeleteAccount={handleDeleteCashAccount}
                onSaveBalanceEntry={handleSaveCashBalanceEntry}
                onDeleteBalanceEntry={handleDeleteCashBalanceEntry}
            />
        )}

        {activeTab === Tab.Settings && (
            <Settings 
                currentProfile={userProfile}
                onUpdateProfile={handleUpdateProfile}
                onToggleTheme={toggleTheme}
                isDark={isDark}
                onClearData={handleClearData}
                onSignOut={handleSignOut}
                subscriptions={subscriptions}
                cards={cards}
                onAddCard={handleAddNewCardStart}
                onEditCard={handleEditCardStart}
            />
        )}
      </main>

      {/* Navigation Tabs */}
      <nav
        className="fixed left-1/2 -translate-x-1/2 bg-surface/90 backdrop-blur-xl border border-border/50 shadow-2xl rounded-full px-3 sm:px-6 py-3 flex space-x-3 sm:space-x-5 z-40"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <button 
          onClick={() => setActiveTab(Tab.Dashboard)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Dashboard ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Dashboard ? 'bg-primary/10' : 'bg-transparent'}`}>
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
          </div>
        </button>
        <button 
          onClick={() => setActiveTab(Tab.Cards)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Cards ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Cards ? 'bg-primary/10' : 'bg-transparent'}`}>
            <Landmark size={20} />
          </div>
        </button>
        <button 
          onClick={() => setActiveTab(Tab.Expenses)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Expenses ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Expenses ? 'bg-primary/10' : 'bg-transparent'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18" /><path d="M6 7h12" /><path d="M8 17h8" /></svg>
          </div>
        </button>
        <button 
          onClick={() => setActiveTab(Tab.Income)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Income ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Income ? 'bg-primary/10' : 'bg-transparent'}`}>
            <TrendingUp size={20} />
          </div>
        </button>
        <button 
          onClick={() => setActiveTab(Tab.Investment)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Investment ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Investment ? 'bg-primary/10' : 'bg-transparent'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l5-5 4 4 9-9" /><path d="M21 7v5h-5" /></svg>
          </div>
        </button>
        <button
          onClick={() => setActiveTab(Tab.CashFlow)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.CashFlow ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.CashFlow ? 'bg-primary/10' : 'bg-transparent'}`}>
            <Wallet size={20} />
          </div>
        </button>
        <button
          onClick={() => setActiveTab(Tab.Settings)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Settings ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
           <div className={`p-1 rounded-lg ${activeTab === Tab.Settings ? 'bg-primary/10' : 'bg-transparent'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
          </div>
        </button>
      </nav>

      {/* Floating Add Button (Dashboard, Expenses, Income and Subscriptions) */}
      {(activeTab === Tab.Dashboard || activeTab === Tab.Income || activeTab === Tab.Expenses) && (
        <button 
          onClick={() => {
            if (activeTab === Tab.Income) {
              handleAddNewIncomeStart();
              return;
            }
            if (activeTab === Tab.Expenses) {
              handleAddNewExpenseStart();
              return;
            }
            setIsAdding(true);
            setEditingSub(undefined);
          }}
          className="fixed right-6 bg-primary hover:bg-blue-600 text-white p-4 rounded-full shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 z-30"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
          aria-label={activeTab === Tab.Income ? 'Add income' : activeTab === Tab.Expenses ? 'Add expense' : 'Add subscription'}
        >
          <Plus size={24} />
        </button>
      )}

      {/* Detail Modal */}
      {selectedSub && (
          <SubscriptionDetail 
              subscription={selectedSub}
              friends={userProfile.friends}
              onUpdate={(updated) => {
                  const updatedList = subscriptions.map(s => s.id === updated.id ? updated : s);
                  setSubscriptions(updatedList);
                  void saveSubscriptions(updatedList);
              }}
              onDelete={handleDelete}
              onEdit={handleStartEdit}
              onClone={handleCloneSubscription}
              onClose={() => setSelectedSubId(null)}
              onShowToast={showToast}
          />
      )}

      {/* Card Detail / Add Modal */}
      {addingCard && (
          <CardDetail 
              card={addingCard}
              subscriptions={subscriptions}
              expenses={expenses}
              baseCurrency={userProfile.currency}
              benefits={getCardBenefitsForCard(addingCard.name, cardBenefits)}
              onUpdate={handleSaveCardFromModal}
              cardPointTransactions={cardPointTransactions}
              onUpdateCardPointTransactions={handleUpdateCardPointTransactions}
              onClose={() => setAddingCard(null)}
          />
      )}

      {/* Toast Notification */}
      {toastMessage && (
          <div
            className="fixed left-1/2 -translate-x-1/2 bg-surface border border-primary/20 text-textMain px-4 py-2 rounded-full shadow-lg z-50 animate-slide-up flex items-center"
            style={{ top: 'calc(env(safe-area-inset-top) + 6rem)' }}
          >
              <CheckCircle size={16} className="text-primary mr-2" />
              <span className="text-sm font-bold">{toastMessage}</span>
          </div>
      )}
    </div>
  );
}

export default App;
