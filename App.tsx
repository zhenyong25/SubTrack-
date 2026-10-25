
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { PiggyBank, Search, CheckCircle, Plus, Landmark, TrendingUp, Wallet, HandCoins, CandlestickChart } from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import AddSubscription from './components/AddSubscription';
import AddIncome from './components/AddIncome';
import AddExpense from './components/AddExpense';
import SubscriptionDetail from './components/SubscriptionDetail';
import Settings from './components/Settings';
import SavingsGoalsTab from './components/SavingsGoalsTab';
import CardDetail from './components/CardDetail';
import CardEditModal from './components/CardEditModal';
import CardsTab from './components/CardsTab';
import IncomeTab from './components/IncomeTab';
import ExpenseTab from './components/ExpenseTab';
import StatementCsvImport from './components/StatementCsvImport';
import InvestmentTab from './components/InvestmentTab';
import TradeTab from './components/TradeTab';
import { deleteAccountStatement, deleteInvestmentHolding, deleteInvestmentTransaction, deletePaymentCard, downloadAccountStatement, uploadAccountStatement } from './services/appDataService';
import CashFlowTab from './components/CashFlowTab';
import DebtsTab from './components/DebtsTab';
import SmartReminders from './components/SmartReminders';
import { applyInvestmentTransaction, isPortfolioHolding } from './services/investmentService';
import { Subscription, BillingCycle, UserProfile, PaymentCard, Income, Expense, BudgetPlan, CardBenefit, CashbackProgram, InvestmentAccount, InvestmentHolding, InvestmentTransaction, InvestmentValuation, CardPointTransaction, PokerMttTournament, PokerMttBankrollTransaction, PokerCashSession, CryptoSource, CashAccount, CashBalanceEntry, RetirementFund, RetirementBalanceEntry, AccountStatement, AccountStatementKind, Loan, LoanPayment } from './types';
import { calculateNextPayment, getExpenseCategoryColor } from './services/storageService';
import { clearStoredAppData, createDefaultProfile, deleteCashbackProgram, deleteExpenseRecord, getLastSaveError, getSupabaseClient, getSupabaseSession, isSupabaseConfigured, loadAppData, saveBudgetPlans, saveCardPointTransactions, saveCards, saveCashAccounts, saveCashBalanceEntries, saveCashbackProgram, saveExpenses, saveIncomes, saveInvestmentAccounts, saveInvestmentTransactions, saveInvestmentValuations, saveInvestments, saveLoanPayments, saveLoans, deleteCryptoSource, deletePokerCashSession, deletePokerMttBankrollTransaction, deletePokerMttTournament, saveCryptoSources, savePokerCashSessions, savePokerMttBankrollTransactions, savePokerMttTournaments, saveProfile, saveRetirementEntries, saveRetirementFunds, saveSubscriptions, signOut as supabaseSignOut } from './services/appDataService';
import { getCardBenefitsForCard } from './services/cardBenefitsService';
import AppLogo from './components/AppLogo';
import GlobalSearch from './components/GlobalSearch';
import { buildSearchRecords, normalizeTags, type SearchRecord } from './services/globalSearchService';
import { saveRecordTags } from './services/appDataService';

enum Tab {
  Dashboard = 'Dashboard',
  Cards = 'Cards',
  Expenses = 'Expenses',
  Income = 'Income',
  Investment = 'Investment',
  Trade = 'Trade',
  CashFlow = 'CashFlow',
  Debts = 'Debts',
  Goals = 'Goals',
  Settings = 'Settings'
}

const applyCategoryColorsToExpenses = (items: Expense[]): Expense[] =>
  items.map(expense => {
    const categoryColor = getExpenseCategoryColor(expense.category);
    return expense.color === categoryColor ? expense : { ...expense, color: categoryColor };
  });

function App() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const closeGlobalSearch = useCallback(() => setIsSearchOpen(false), []);
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
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccount[]>([]);
  const [pokerMttTournaments, setPokerMttTournaments] = useState<PokerMttTournament[]>([]);
  const [pokerMttBankrollTransactions, setPokerMttBankrollTransactions] = useState<PokerMttBankrollTransaction[]>([]);
  const [pokerCashSessions, setPokerCashSessions] = useState<PokerCashSession[]>([]);
  const [cryptoSources, setCryptoSources] = useState<CryptoSource[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [cashBalanceEntries, setCashBalanceEntries] = useState<CashBalanceEntry[]>([]);
  const [retirementFunds, setRetirementFunds] = useState<RetirementFund[]>([]);
  const [retirementEntries, setRetirementEntries] = useState<RetirementBalanceEntry[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanPayments, setLoanPayments] = useState<LoanPayment[]>([]);
  // A card whose debt the Debts tab should open (or start) next, set from the card's page.
  const [debtFocusCardId, setDebtFocusCardId] = useState<string | null>(null);
  const [debtFocusLoanId, setDebtFocusLoanId] = useState<string | null>(null);
  const [focusGoalId, setFocusGoalId] = useState<string | null>(null);
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [cardPointTransactions, setCardPointTransactions] = useState<CardPointTransaction[]>([]);
  const [cardBenefits, setCardBenefits] = useState<CardBenefit[]>([]);
  const [cashbackPrograms, setCashbackPrograms] = useState<CashbackProgram[]>([]);
  const [accountStatements, setAccountStatements] = useState<AccountStatement[]>([]);
  const [isDark, setIsDark] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(isSupabaseConfigured());
  const [session, setSession] = useState<Session | null>(null);
  
  // Card Management State
  const [addingCard, setAddingCard] = useState<PaymentCard | null>(null);
  const [viewingCardId, setViewingCardId] = useState<string | null>(null);

  // User Profile State
  const [userProfile, setUserProfile] = useState<UserProfile>({ 
      name: '', 
      currency: 'SGD', 
      isLoggedIn: false, 
      friends: [],
      notificationDays: 3,
  });
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const searchableRecords = useMemo(() => buildSearchRecords({
    expenses, subscriptions, transactions: investmentTransactions, holdings: investments, accounts: investmentAccounts, cards,
  }), [expenses, subscriptions, investmentTransactions, investments, investmentAccounts, cards]);

  useEffect(() => {
    if (isLoading || authChecking || (isSupabaseConfigured() && !session) || isAdding || isAddingExpense || isAddingIncome) return;
    const openSearch = (event: KeyboardEvent) => {
      if (!event.repeat && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog && dialog.getAttribute('aria-labelledby') !== 'global-search-title') return;
        event.preventDefault(); setIsSearchOpen(open => !open);
      }
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, [isLoading, authChecking, session, isAdding, isAddingExpense, isAddingIncome]);

  const handleSearchSaveTags = useCallback(async (record: SearchRecord, values: string[]) => {
    const tags = normalizeTags(values);
    await saveRecordTags(record.kind, record.id, tags);
    if (record.kind === 'expense') setExpenses(current => current.map(item => item.id === record.id ? { ...item, tags } : item));
    else if (record.kind === 'subscription') setSubscriptions(current => current.map(item => item.id === record.id ? { ...item, tags } : item));
    else setInvestmentTransactions(current => current.map(item => item.id === record.id ? { ...item, tags } : item));
  }, []);

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

    return () => {
      alive = false;
      authSubscription?.unsubscribe();
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
        setInvestmentAccounts([]);
        setPokerMttTournaments([]);
        setPokerMttBankrollTransactions([]);
        setPokerCashSessions([]);
        setCryptoSources([]);
        setCashAccounts([]);
        setCashBalanceEntries([]);
        setRetirementFunds([]);
        setRetirementEntries([]);
        setLoans([]);
        setLoanPayments([]);
        setCards([]);
        setCardPointTransactions([]);
        setCashbackPrograms([]);
        setAccountStatements([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const loaded = await loadAppData();
        const updated = loaded.subscriptions.map(sub => {
          let next = sub.nextPaymentDate;
          const status = sub.status || 'Active';
          const cancellationDate = sub.cancellationDate;
          // Expiry does not prove cancellation; leave trials available for review.

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
        const categoryColoredExpenses = applyCategoryColorsToExpenses(loaded.expenses);
        setExpenses(categoryColoredExpenses);
        setBudgetPlans(loaded.budgetPlans ?? []);
        setInvestments(loaded.investments);
        setInvestmentValuations(loaded.investmentValuations);
        setInvestmentTransactions(loaded.investmentTransactions);
        setInvestmentAccounts(loaded.investmentAccounts);
        setPokerMttTournaments(loaded.pokerMttTournaments);
        setPokerMttBankrollTransactions(loaded.pokerMttBankrollTransactions);
        setPokerCashSessions(loaded.pokerCashSessions);
        setCryptoSources(loaded.cryptoSources);
        setCashAccounts(loaded.cashAccounts);
        setCashBalanceEntries(loaded.cashBalanceEntries);
        setRetirementFunds(loaded.retirementFunds);
        setRetirementEntries(loaded.retirementEntries);
        setLoans(loaded.loans);
        setLoanPayments(loaded.loanPayments);
        setCards(loaded.cards);
        setCardPointTransactions(loaded.cardPointTransactions);
        setCardBenefits(loaded.cardBenefits);
        setCashbackPrograms(loaded.cashbackPrograms);
        setAccountStatements(loaded.accountStatements);
        void saveSubscriptions(updated);

        if (loaded.userId) {
          void saveProfile({ ...loaded.profile, isLoggedIn: true });
          void saveIncomes(loaded.incomes);
          const recoloredExpenses = categoryColoredExpenses.filter((expense, index) => expense !== loaded.expenses[index]);
          if (recoloredExpenses.length > 0) void saveExpenses(categoryColoredExpenses, recoloredExpenses);
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
      setIsSearchOpen(false);
      await supabaseSignOut();
      setSession(null);
      setSubscriptions([]);
      setIncomes([]);
      setExpenses([]);
      setBudgetPlans([]);
      setInvestments([]);
      setInvestmentValuations([]);
      setInvestmentTransactions([]);
      setInvestmentAccounts([]);
      setCashAccounts([]);
      setCashBalanceEntries([]);
      setRetirementFunds([]);
      setRetirementEntries([]);
      setLoans([]);
      setLoanPayments([]);
      setCards([]);
      setCardPointTransactions([]);
      setCardBenefits([]);
      setCashbackPrograms([]);
      setAccountStatements([]);
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

  const handleSaveCashbackProgram = async (program: CashbackProgram) => {
    setCashbackPrograms(previous =>
      previous.some(item => item.id === program.id)
        ? previous.map(item => (item.id === program.id ? program : item))
        : [...previous, program],
    );
    const saved = await saveCashbackProgram(program);
    showToast(saved ? `Saved ${program.name}` : `${program.name} saved locally, but database sync failed`);
  };

  const handleDeleteCashbackProgram = async (programId: string) => {
    setCashbackPrograms(previous => previous.filter(item => item.id !== programId));
    const deleted = await deleteCashbackProgram(programId);
    showToast(deleted ? 'Cashback rule set deleted' : 'Removed locally, but database sync failed');
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

    const orphanedStatements = accountStatements.filter(statement => statement.cashAccountId === accountId);
    if (orphanedStatements.length > 0) {
      setAccountStatements(accountStatements.filter(statement => statement.cashAccountId !== accountId));
      void Promise.all(orphanedStatements.map(statement => deleteAccountStatement(statement)));
    }
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

  const handleSaveRetirementFund = (fund: RetirementFund) => {
    const exists = retirementFunds.some(item => item.id === fund.id);
    const updated = exists
      ? retirementFunds.map(item => (item.id === fund.id ? fund : item))
      : [...retirementFunds, fund];
    setRetirementFunds(updated);
    void saveRetirementFunds(updated);
    showToast(exists ? `Updated ${fund.name}` : `Added ${fund.name}`);
  };

  const handleDeleteRetirementFund = (fundId: string) => {
    const updatedFunds = retirementFunds.filter(item => item.id !== fundId);
    setRetirementFunds(updatedFunds);
    void saveRetirementFunds(updatedFunds);

    const updatedEntries = retirementEntries.filter(entry => entry.fundId !== fundId);
    setRetirementEntries(updatedEntries);
    void saveRetirementEntries(updatedEntries);
    showToast('Fund removed');
  };

  // Logging the same fund + sub-account + date again replaces that figure (matches the table's
  // unique constraint) instead of stacking a duplicate.
  const handleSaveRetirementEntries = (entries: RetirementBalanceEntry[]) => {
    const keyOf = (entry: RetirementBalanceEntry) => `${entry.fundId}|${entry.subAccount}|${entry.balanceDate}`;
    const incoming = new Map(entries.map(entry => [keyOf(entry), entry]));
    const kept = retirementEntries.filter(entry => !incoming.has(keyOf(entry)));
    const updated = [...kept, ...incoming.values()];
    setRetirementEntries(updated);
    void saveRetirementEntries(updated);
    showToast('Balance logged');
  };

  const handleDeleteRetirementSnapshot = (fundId: string, balanceDate: string) => {
    const updated = retirementEntries.filter(entry => !(entry.fundId === fundId && entry.balanceDate === balanceDate));
    setRetirementEntries(updated);
    void saveRetirementEntries(updated);
  };

  const handleUploadStatement = async (
    file: File,
    params: { accountKind: AccountStatementKind; cashAccountId?: string; cardId?: string; statementPeriod?: string },
  ) => {
    try {
      const statement = await uploadAccountStatement(file, params);
      setAccountStatements(prev => [statement, ...prev]);
      showToast('Statement uploaded');
    } catch (error) {
      console.error('Failed to upload statement', error);
      showToast('Failed to upload statement');
    }
  };

  const handleDownloadStatement = async (statement: AccountStatement) => {
    try {
      const blob = await downloadAccountStatement(statement);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = statement.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download statement', error);
      showToast('Failed to download statement');
    }
  };

  const handleDeleteStatement = async (statement: AccountStatement) => {
    setAccountStatements(prev => prev.filter(item => item.id !== statement.id));
    try {
      await deleteAccountStatement(statement);
      showToast('Statement removed');
    } catch (error) {
      console.error('Failed to delete statement', error);
      showToast('Failed to remove statement');
    }
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

  const saveErrorSuffix = () => {
    const reason = getLastSaveError();
    return reason ? `: ${reason}` : '';
  };

  const handleAddOrUpdateExpense = async (data: Omit<Expense, 'id'>) => {
    const categoryColoredData = { ...data, color: getExpenseCategoryColor(data.category) };
    if (editingExpense) {
      const updatedList = applyCategoryColorsToExpenses(expenses.map(expense =>
        expense.id === editingExpense.id
          ? {
              ...categoryColoredData,
              id: editingExpense.id,
            }
          : expense
      ));
      setExpenses(updatedList);
      const saved = await saveExpenses(updatedList, updatedList.filter(expense => expense.id === editingExpense.id));
      showToast(saved ? `Updated ${data.name}` : `Failed to save ${data.name} to Supabase${saveErrorSuffix()}`);
    } else {
      const newExpense: Expense = {
        ...categoryColoredData,
        id: crypto.randomUUID(),
      };
      const updatedList = applyCategoryColorsToExpenses([...expenses, newExpense]);
      setExpenses(updatedList);
      const saved = await saveExpenses(updatedList, updatedList.filter(expense => expense.id === newExpense.id));
      showToast(saved ? `Added ${newExpense.name}` : `Failed to save ${newExpense.name} to Supabase${saveErrorSuffix()}`);
    }

    setIsAddingExpense(false);
    setEditingExpense(undefined);
    setPresetExpenseDate(undefined);
    setActiveTab(Tab.Expenses);
  };

  const handleAddExpenseFromStatement = async (data: Omit<Expense, 'id'>): Promise<Expense> => {
    const newExpense: Expense = {
      ...data,
      color: getExpenseCategoryColor(data.category),
      id: crypto.randomUUID(),
    };
    const updatedList = applyCategoryColorsToExpenses([...expenses, newExpense]);
    setExpenses(updatedList);
    const saved = await saveExpenses(updatedList, updatedList.filter(expense => expense.id === newExpense.id));
    showToast(saved ? `Added ${newExpense.name}` : `Failed to save ${newExpense.name} to Supabase${saveErrorSuffix()}`);
    return newExpense;
  };

  const handleUpdateExpenseFromStatement = async (updated: Expense): Promise<void> => {
    const categoryColoredUpdate = { ...updated, color: getExpenseCategoryColor(updated.category) };
    const updatedList = applyCategoryColorsToExpenses(
      expenses.map(expense => (expense.id === updated.id ? categoryColoredUpdate : expense)),
    );
    setExpenses(updatedList);
    const saved = await saveExpenses(updatedList, updatedList.filter(expense => expense.id === updated.id));
    showToast(saved ? `Updated ${updated.name}` : `Failed to save ${updated.name} to Supabase${saveErrorSuffix()}`);
  };

  // A statement line that's a credit (money coming in - salary, a transfer from someone else,
  // a refund) isn't an expense, so the statement reconciliation panel routes those to the
  // existing Income ledger instead. saveIncomes() doesn't report success/failure the way
  // saveExpenses() does, so this mirrors handleAddOrUpdateIncome's existing toast behavior
  // rather than inventing a different one just for this path.
  const handleAddIncomeFromStatement = async (data: Omit<Income, 'id'>): Promise<Income> => {
    const newIncome: Income = { ...data, id: crypto.randomUUID() };
    const updatedList = [...incomes, newIncome];
    setIncomes(updatedList);
    void saveIncomes(updatedList);
    showToast(`Added ${newIncome.name}`);
    return newIncome;
  };

  const handleUpdateIncomeFromStatement = async (updated: Income): Promise<void> => {
    const updatedList = incomes.map(income => (income.id === updated.id ? updated : income));
    setIncomes(updatedList);
    void saveIncomes(updatedList);
    showToast(`Updated ${updated.name}`);
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
      void deleteExpenseRecord(id, updated).then(deleted => {
        showToast(deleted ? 'Expense deleted.' : `Deleted here, but the database refused it${saveErrorSuffix()}`);
      });
    }
  };

  const handleAddInvestmentTransaction = async (transaction: Omit<InvestmentTransaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    // How the trade changes the holding (and the P&L it locks in) is worked out first, so the
    // realized figure is stored with the transaction itself.
    let realizedPnl: number | undefined;
    const updatedHoldings = investments.map(holding => {
      if (holding.id !== transaction.investmentId) return holding;
      const result = applyInvestmentTransaction(holding, transaction);
      realizedPnl = result.realizedPnl;
      return result.holding;
    });

    const newTransaction: InvestmentTransaction = {
      ...transaction,
      id: crypto.randomUUID(),
      realizedPnl,
    };

    const updatedTransactions = [...investmentTransactions, newTransaction].sort(
      (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
    );
    setInvestmentTransactions(updatedTransactions);
    void saveInvestmentTransactions(updatedTransactions).then(reportSyncFailure);

    setInvestments(updatedHoldings);
    void saveInvestments(updatedHoldings);

    const pnlNote = realizedPnl === undefined || realizedPnl === 0
      ? ''
      : ` - realized ${realizedPnl > 0 ? '+' : ''}${realizedPnl.toFixed(2)} ${newTransaction.currency}`;
    showToast(`Logged ${newTransaction.transactionType} for ${newTransaction.source || 'investment'}${pnlNote}`);
  };

  const handleDeleteInvestmentTransaction = async (transactionId: string) => {
    const transaction = investmentTransactions.find(entry => entry.id === transactionId);
    if (!transaction) return;
    if (!confirm('Delete this transaction log? The holding\'s units and average cost will stay unchanged.')) return;

    await deleteInvestmentTransaction(transactionId);
    setInvestmentTransactions(current => current.filter(entry => entry.id !== transactionId));
    showToast('Transaction log deleted.');
  };

  // The data is always kept on this device; this just says when the database refused it.
  const reportSyncFailure = (failure: string | null) => {
    if (failure) showToast(`Saved on this device, but the database rejected it: ${failure}`);
  };

  const handleSaveLoan = (loan: Loan) => {
    const exists = loans.some(item => item.id === loan.id);
    const updated = exists ? loans.map(item => (item.id === loan.id ? loan : item)) : [...loans, loan];
    setLoans(updated);
    void saveLoans(updated).then(failure => failure ? reportSyncFailure(failure) : showToast(exists ? `Saved ${loan.name}` : `Added ${loan.name}`));
  };

  // Payments go first so the database never holds payments for a loan that's gone (the
  // foreign key would cascade them anyway, but the local copy needs the same cleanup).
  const handleDeleteLoan = (loanId: string) => {
    const updatedPayments = loanPayments.filter(payment => payment.loanId !== loanId);
    setLoanPayments(updatedPayments);
    void saveLoanPayments(updatedPayments).then(reportSyncFailure);
    const updatedLoans = loans.filter(item => item.id !== loanId);
    setLoans(updatedLoans);
    void saveLoans(updatedLoans).then(failure => failure ? reportSyncFailure(failure) : showToast('Loan deleted.'));
  };

  const handleAddLoanPayment = (payment: LoanPayment) => {
    const updated = [...loanPayments, payment];
    setLoanPayments(updated);
    void saveLoanPayments(updated).then(failure => failure ? reportSyncFailure(failure) : showToast('Payment logged.'));
  };

  const handleDeleteLoanPayment = (paymentId: string) => {
    const updated = loanPayments.filter(payment => payment.id !== paymentId);
    setLoanPayments(updated);
    void saveLoanPayments(updated).then(reportSyncFailure);
  };

  // Poker results all hang off one "Poker (MTT)" holding (the database ties every row to an
  // investment). It's made the first time anything is logged, and saved before the row that
  // references it.
  const ensurePokerHoldingId = async (): Promise<string> => {
    const existing = investments.find(holding => holding.kind === 'Poker (MTT)' && holding.isActive)
      || investments.find(holding => holding.kind === 'Poker (MTT)');
    if (existing) return existing.id;
    const holding: InvestmentHolding = {
      id: crypto.randomUUID(),
      name: 'Poker bankroll',
      kind: 'Poker (MTT)',
      units: 1,
      averageCost: 0,
      currentPrice: 0,
      currency: 'USD',
      color: '#ec4899',
      isActive: true,
    };
    const updatedHoldings = [...investments, holding];
    setInvestments(updatedHoldings);
    const failure = await saveInvestments(updatedHoldings);
    if (failure) reportSyncFailure(failure);
    return holding.id;
  };

  const withPokerHolding = async <T extends { investmentId: string }>(item: T): Promise<T> =>
    item.investmentId ? item : { ...item, investmentId: await ensurePokerHoldingId() };

  const handleSavePokerTournament = async (input: PokerMttTournament) => {
    const tournament = await withPokerHolding(input);
    const exists = pokerMttTournaments.some(item => item.id === tournament.id);
    const updated = exists ? pokerMttTournaments.map(item => (item.id === tournament.id ? tournament : item)) : [...pokerMttTournaments, tournament];
    setPokerMttTournaments(updated);
    const failure = await savePokerMttTournaments(updated);
    if (failure) reportSyncFailure(failure);
    else showToast(`${exists ? 'Updated' : 'Logged'} ${tournament.tournamentName}`);
  };

  const handleDeletePokerTournament = async (tournamentId: string) => {
    const updated = pokerMttTournaments.filter(item => item.id !== tournamentId);
    setPokerMttTournaments(updated);
    const failure = await deletePokerMttTournament(tournamentId, updated);
    if (failure) reportSyncFailure(failure);
    else showToast('Tournament deleted.');
  };

  const handleSavePokerSession = async (input: PokerCashSession) => {
    const session = await withPokerHolding(input);
    const exists = pokerCashSessions.some(item => item.id === session.id);
    const updated = exists ? pokerCashSessions.map(item => (item.id === session.id ? session : item)) : [...pokerCashSessions, session];
    setPokerCashSessions(updated);
    const failure = await savePokerCashSessions(updated);
    if (failure) reportSyncFailure(failure);
    else showToast(exists ? 'Session updated.' : 'Session logged.');
  };

  const handleDeletePokerSession = async (sessionId: string) => {
    const updated = pokerCashSessions.filter(item => item.id !== sessionId);
    setPokerCashSessions(updated);
    const failure = await deletePokerCashSession(sessionId, updated);
    if (failure) reportSyncFailure(failure);
    else showToast('Session deleted.');
  };

  const handleSavePokerBankrollEvent = async (input: PokerMttBankrollTransaction) => {
    const event = await withPokerHolding(input);
    const updated = [...pokerMttBankrollTransactions, event];
    setPokerMttBankrollTransactions(updated);
    const failure = await savePokerMttBankrollTransactions(updated);
    if (failure) reportSyncFailure(failure);
    else showToast(`${event.eventType} logged.`);
  };

  const handleDeletePokerBankrollEvent = async (eventId: string) => {
    try {
      await deletePokerMttBankrollTransaction(eventId);
      setPokerMttBankrollTransactions(current => current.filter(item => item.id !== eventId));
      showToast('Bankroll entry deleted.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete this bankroll entry.');
    }
  };

  const handleSaveCryptoSource = async (input: CryptoSource) => {
    const source = { ...input, createdAt: input.createdAt || new Date().toISOString() };
    const exists = cryptoSources.some(item => item.id === source.id);
    const updated = exists ? cryptoSources.map(item => (item.id === source.id ? source : item)) : [...cryptoSources, source];
    setCryptoSources(updated);
    const failure = await saveCryptoSources(updated);
    if (failure) reportSyncFailure(failure);
    else showToast(exists ? `Updated ${source.label}` : `Added ${source.label} - scanning…`);
  };

  const handleDeleteCryptoSource = async (sourceId: string) => {
    const updated = cryptoSources.filter(item => item.id !== sourceId);
    setCryptoSources(updated);
    const failure = await deleteCryptoSource(sourceId, updated);
    if (failure) reportSyncFailure(failure);
    else showToast('Wallet removed.');
  };

  const handleAddInvestmentHolding = async (holding: InvestmentHolding) => {
    const updatedHoldings = [...investments, holding];
    setInvestments(updatedHoldings);
    const failure = await saveInvestments(updatedHoldings);
    if (failure) reportSyncFailure(failure);
    else showToast(`Added ${holding.name}`);
  };

  const handleUpdateInvestmentHolding = async (holding: InvestmentHolding, silent = false) => {
    // Functional form, not a closure over `investments` - a background price refresh can
    // call this for several holdings back-to-back, and closing over the render's snapshot
    // would let a later call silently overwrite an earlier one's change before either
    // triggers a re-render.
    let updatedHoldings: InvestmentHolding[] = [];
    setInvestments(prev => {
      updatedHoldings = prev.map(item => (item.id === holding.id ? holding : item));
      return updatedHoldings;
    });
    const failure = await saveInvestments(updatedHoldings);
    if (failure) reportSyncFailure(failure);
    else if (!silent) showToast(`Updated ${holding.name}`);
  };

  // Every logged value is kept, including several on the same day (ordered by when they were logged).
  const handleSaveInvestmentValuation = (valuation: InvestmentValuation) => {
    const updated = [...investmentValuations, valuation];
    setInvestmentValuations(updated);
    void saveInvestmentValuations(updated).then(failure => { if (!failure) showToast('Value logged'); else reportSyncFailure(failure); });
  };

  const handleDeleteInvestmentValuation = (valuationId: string) => {
    const updated = investmentValuations.filter(item => item.id !== valuationId);
    setInvestmentValuations(updated);
    void saveInvestmentValuations(updated);
  };

  const handleDeleteInvestmentHolding = async (holdingId: string) => {
    const holding = investments.find(item => item.id === holdingId);
    if (!holding) return;
    if (!confirm(`Delete "${holding.name}"? This also removes its logged transactions and valuations.`)) return;

    await deleteInvestmentHolding(holdingId);
    setInvestments(current => current.filter(item => item.id !== holdingId));
    setInvestmentTransactions(current => current.filter(transaction => transaction.investmentId !== holdingId));
    setInvestmentValuations(current => current.filter(valuation => valuation.investmentId !== holdingId));
    showToast(`Deleted ${holding.name}`);
  };

  const handleSaveInvestmentAccount = async (account: InvestmentAccount) => {
    const exists = investmentAccounts.some(item => item.id === account.id);
    const updated = exists
      ? investmentAccounts.map(item => (item.id === account.id ? account : item))
      : [...investmentAccounts, account];
    setInvestmentAccounts(updated);
    const failure = await saveInvestmentAccounts(updated);
    if (failure) reportSyncFailure(failure);
    else showToast(exists ? `Updated ${account.name}` : `Added ${account.name}`);
  };

  // The holdings stay in the portfolio, just untagged - Supabase does the same server-side via
  // `on delete set null`, this keeps local state (and the device copy) in step.
  const handleDeleteInvestmentAccount = async (accountId: string) => {
    const account = investmentAccounts.find(item => item.id === accountId);
    if (!account) return;
    const taggedCount = investments.filter(holding => holding.accountId === accountId).length;
    const holdingNote = taggedCount > 0 ? ` Its ${taggedCount} holding${taggedCount === 1 ? '' : 's'} will be kept as unassigned.` : '';
    if (!confirm(`Delete the account "${account.name}"?${holdingNote}`)) return;

    const updatedAccounts = investmentAccounts.filter(item => item.id !== accountId);
    setInvestmentAccounts(updatedAccounts);
    const failure = await saveInvestmentAccounts(updatedAccounts);

    if (taggedCount > 0) {
      const updatedHoldings = investments.map(holding => (
        holding.accountId === accountId ? { ...holding, accountId: undefined } : holding
      ));
      setInvestments(updatedHoldings);
      void saveInvestments(updatedHoldings);
    }

    if (failure) reportSyncFailure(failure);
    else showToast(`Deleted ${account.name}`);
  };

  const portfolioHoldings = investments.filter(isPortfolioHolding);

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
          setInvestmentAccounts([]);
          setPokerMttTournaments([]);
          setPokerMttBankrollTransactions([]);
          setPokerCashSessions([]);
          setCryptoSources([]);
          setRetirementFunds([]);
          setRetirementEntries([]);
          setLoans([]);
          setLoanPayments([]);
          setUserProfile(createDefaultProfile());
          setEditingSub(undefined);
          setEditingIncome(undefined);
          setEditingExpense(undefined);
          setIsAdding(false);
          setIsAddingIncome(false);
          setIsAddingExpense(false);
          await clearStoredAppData();
          window.dispatchEvent(new Event('subtrack-data-cleared'));
          showToast("All data cleared.");
      }
  };

  const handleUpdateCard = (updatedCard: PaymentCard) => {
      const updatedCards = cards.map(c => c.id === updatedCard.id ? updatedCard : c);
      setCards(updatedCards);
      void saveCards(updatedCards);
      showToast("Card details updated");
  };

  const handleDeleteCard = async (card: PaymentCard) => {
      const linkedSubscriptions = subscriptions.filter(
          subscription => subscription.cardId === card.id || (!subscription.cardId && subscription.cardName === card.name),
      );
      const linkedExpenses = expenses.filter(
          expense => expense.linkedCardId === card.id || (!expense.linkedCardId && expense.linkedCardName === card.name),
      );
      const cardStatements = accountStatements.filter(statement => statement.cardId === card.id);
      const cardRewards = cardPointTransactions.filter(transaction => transaction.cardId === card.id);
      const cardPrograms = cashbackPrograms.filter(program => program.cardId === card.id);
      const details = [
          linkedSubscriptions.length > 0 ? `${linkedSubscriptions.length} subscription${linkedSubscriptions.length === 1 ? '' : 's'}` : null,
          linkedExpenses.length > 0 ? `${linkedExpenses.length} expense${linkedExpenses.length === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(' and ');
      const destructiveDetails = [
          cardRewards.length > 0 ? `${cardRewards.length} points entr${cardRewards.length === 1 ? 'y' : 'ies'}` : null,
          cardPrograms.length > 0 ? `${cardPrograms.length} cashback rule set${cardPrograms.length === 1 ? '' : 's'}` : null,
          cardStatements.length > 0 ? `${cardStatements.length} statement${cardStatements.length === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(', ');

      const message = [
          `Delete “${card.name}” ending in ${card.last4Digits || '0000'}?`,
          details ? `${details} will be kept but unlinked from this card.` : null,
          destructiveDetails ? `${destructiveDetails} will be permanently deleted.` : null,
          'This action cannot be undone.',
      ].filter(Boolean).join('\n\n');

      if (!confirm(message)) return;

      try {
          await deletePaymentCard(card.id);

          const updatedSubscriptions = subscriptions.map(subscription =>
              subscription.cardId === card.id || (!subscription.cardId && subscription.cardName === card.name)
                  ? { ...subscription, cardId: undefined, cardName: 'Cash', cardType: undefined }
                  : subscription,
          );
          const updatedExpenses = expenses.map(expense =>
              expense.linkedCardId === card.id || (!expense.linkedCardId && expense.linkedCardName === card.name)
                  ? { ...expense, linkedCardId: undefined, linkedCardName: undefined, cashbackCategoryId: undefined }
                  : expense,
          );
          const updatedPointTransactions = cardPointTransactions.filter(transaction => transaction.cardId !== card.id);
          // A debt linked to this card stays in Debts, just unlinked (the database does the same).
          const linkedLoans = loans.some(loan => loan.cardId === card.id);
          const updatedLoans = loans.map(loan => (loan.cardId === card.id ? { ...loan, cardId: undefined } : loan));

          setCards(previous => previous.filter(item => item.id !== card.id));
          if (linkedLoans) setLoans(updatedLoans);
          setSubscriptions(updatedSubscriptions);
          setExpenses(updatedExpenses);
          setCardPointTransactions(updatedPointTransactions);
          setCashbackPrograms(previous => previous.filter(program => program.cardId !== card.id));
          setAccountStatements(previous => previous.filter(statement => statement.cardId !== card.id));
          setViewingCardId(null);
          setAddingCard(previous => previous?.id === card.id ? null : previous);

          await Promise.all([
              saveSubscriptions(updatedSubscriptions),
              saveExpenses(updatedExpenses, updatedExpenses.filter((expense, index) => expense !== expenses[index])),
              saveCardPointTransactions(updatedPointTransactions),
              ...cardPrograms.map(program => deleteCashbackProgram(program.id)),
              ...(linkedLoans ? [saveLoans(updatedLoans)] : []),
          ]);
          showToast(`${card.name} deleted`);
      } catch (error) {
          console.error('Failed to delete card', error);
          showToast(error instanceof Error ? error.message : 'Could not delete this card. Please try again.');
      }
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

  const handleViewCardStart = (card: PaymentCard) => {
      setViewingCardId(card.id);
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

  const handleSaveBudgetPlan = async (plan: BudgetPlan) => {
      const updated = budgetPlans.some(item => item.month === plan.month)
        ? budgetPlans.map(item => item.month === plan.month ? plan : item)
        : [...budgetPlans, plan];
      setBudgetPlans(updated);
      const saved = await saveBudgetPlans(updated);
      showToast(saved ? 'Budget plan saved' : 'Budget saved locally, but database sync failed');
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
        expenses={expenses}
        cashbackPrograms={cashbackPrograms}
      />
    );
  }

  const selectedSub = subscriptions.find(s => s.id === selectedSubId);
  const viewingCard = cards.find(c => c.id === viewingCardId);

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
      <header className="app-header fixed top-0 w-full z-20 bg-background/90 backdrop-blur-md border-b border-border px-6 pb-4 flex justify-between items-center transition-colors duration-300" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="flex items-center space-x-3">
             <AppLogo />
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
               SubTrack
            </h1>
        </div>
        <div className="flex items-center space-x-3 relative">
            <button type="button" onClick={() => setIsSearchOpen(true)} aria-label="Open global search" title="Search (Ctrl / Command + K)" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 text-secondary transition-colors hover:border-primary/40 hover:text-primary lg:w-64">
              <Search size={18} className="shrink-0" />
              <span className="hidden text-xs md:inline">Search anything</span>
              <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[10px] lg:inline-flex">Ctrl K</kbd>
            </button>
            <SmartReminders key={session?.user.id || 'local'} scope={session?.user.id || 'local'} subscriptions={subscriptions} loans={loans} payments={loanPayments} days={userProfile.notificationDays} onOpen={reminder => {
              setViewingCardId(null); setSelectedSubId(null);
              if (reminder.kind === 'goal') { setFocusGoalId(reminder.sourceId); setActiveTab(Tab.Goals); }
              else if (reminder.kind === 'debt') { setDebtFocusLoanId(reminder.sourceId); setActiveTab(Tab.Debts); }
              else { setSelectedSubId(reminder.sourceId); setActiveTab(Tab.Dashboard); }
            }} onSettings={() => { setViewingCardId(null); setSelectedSubId(null); setActiveTab(Tab.Settings); }} />
        </div>
      </header>

      {/* Main Content */}
      <main
        className="app-main px-4 max-w-2xl mx-auto"
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
            onAddCard={handleAddNewCardStart}
            onViewCard={handleViewCardStart}
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
                onViewCard={handleViewCardStart}
                onEditCard={handleEditCardStart}
                onDeleteCard={handleDeleteCard}
            />
        )}

        {activeTab === Tab.Expenses && (
            <ExpenseTab
                importPanel={<StatementCsvImport key={session?.user.id || 'local'} accounts={cashAccounts} cards={cards} expenses={expenses} incomes={incomes} subscriptions={subscriptions} currency={userProfile.currency} onCommitted={result => {
                  if (result.expenses.length) setExpenses(current => [...current, ...result.expenses.filter(record => !current.some(item => item.id === record.id))]);
                  if (result.incomes.length) setIncomes(current => [...current, ...result.incomes.filter(record => !current.some(item => item.id === record.id))]);
                }} />}
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

        {activeTab === Tab.Trade && (
            <TradeTab
                holdingSymbols={portfolioHoldings.filter(holding => holding.kind === 'Stocks' && holding.symbol).map(holding => holding.symbol!)}
                onNotify={showToast}
            />
        )}

        {activeTab === Tab.Investment && (
        <InvestmentTab
                baseCurrency={userProfile.currency}
                investments={portfolioHoldings}
                accounts={investmentAccounts}
                onSaveAccount={handleSaveInvestmentAccount}
                onDeleteAccount={handleDeleteInvestmentAccount}
                valuations={investmentValuations}
                transactions={investmentTransactions}
                onAddTransaction={handleAddInvestmentTransaction}
                onDeleteTransaction={handleDeleteInvestmentTransaction}
                onCreateHolding={handleAddInvestmentHolding}
                onUpdateHolding={handleUpdateInvestmentHolding}
                onDeleteHolding={handleDeleteInvestmentHolding}
                onSaveValuation={handleSaveInvestmentValuation}
                onDeleteValuation={handleDeleteInvestmentValuation}
                poker={{
                    tournaments: pokerMttTournaments,
                    sessions: pokerCashSessions,
                    bankroll: pokerMttBankrollTransactions,
                    onSaveTournament: handleSavePokerTournament,
                    onDeleteTournament: handleDeletePokerTournament,
                    onSaveSession: handleSavePokerSession,
                    onDeleteSession: handleDeletePokerSession,
                    onSaveBankrollEvent: handleSavePokerBankrollEvent,
                    onDeleteBankrollEvent: handleDeletePokerBankrollEvent,
                }}
                crypto={{
                    sources: cryptoSources,
                    onSaveSource: handleSaveCryptoSource,
                    onDeleteSource: handleDeleteCryptoSource,
                }}
            />
        )}

        {activeTab === Tab.Debts && (
            <DebtsTab
                baseCurrency={userProfile.currency}
                loans={loans}
                payments={loanPayments}
                onSaveLoan={handleSaveLoan}
                onDeleteLoan={handleDeleteLoan}
                onAddPayment={handleAddLoanPayment}
                onDeletePayment={handleDeleteLoanPayment}
                cards={cards}
                cardStatements={accountStatements.filter(statement => statement.accountKind === 'Card')}
                focusCardId={debtFocusCardId}
                focusLoanId={debtFocusLoanId}
                onLoanFocusHandled={() => setDebtFocusLoanId(null)}
                onFocusHandled={() => setDebtFocusCardId(null)}
            />
        )}

        {activeTab === Tab.CashFlow && (
            <CashFlowTab
                cards={cards}
                forecast={{ incomes, subscriptions, expenses, loans, payments: loanPayments }}
                baseCurrency={userProfile.currency}
                accounts={cashAccounts}
                balanceEntries={cashBalanceEntries}
                onSaveAccount={handleSaveCashAccount}
                onDeleteAccount={handleDeleteCashAccount}
                onSaveBalanceEntry={handleSaveCashBalanceEntry}
                onDeleteBalanceEntry={handleDeleteCashBalanceEntry}
                investments={portfolioHoldings}
                investmentValuations={investmentValuations}
                cryptoSources={cryptoSources}
                retirementFunds={retirementFunds}
                retirementEntries={retirementEntries}
                onSaveRetirementFund={handleSaveRetirementFund}
                onDeleteRetirementFund={handleDeleteRetirementFund}
                onSaveRetirementEntries={handleSaveRetirementEntries}
                onDeleteRetirementSnapshot={handleDeleteRetirementSnapshot}
                statements={accountStatements}
                statementsEnabled={isSupabaseConfigured()}
                onUploadStatement={handleUploadStatement}
                onDownloadStatement={handleDownloadStatement}
                onDeleteStatement={handleDeleteStatement}
            />
        )}

        {activeTab === Tab.Goals && <SavingsGoalsTab key={session?.user.id || 'local'} baseCurrency={userProfile.currency} focusGoalId={focusGoalId} onFocusHandled={() => setFocusGoalId(null)} />}

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

      {isSearchOpen && <GlobalSearch records={searchableRecords} onClose={closeGlobalSearch} onSaveTags={handleSearchSaveTags} onOpenRecord={record => {
        setIsSearchOpen(false);
        if (record.kind === 'expense') {
          const expense = expenses.find(item => item.id === record.id);
          if (expense) handleEditExpenseStart(expense);
        } else if (record.kind === 'subscription') setSelectedSubId(record.id);
        else setActiveTab(Tab.Investment);
      }} />}

      {/* Navigation Tabs */}
      <nav
        aria-label="Main navigation"
        className="app-navigation fixed left-1/2 -translate-x-1/2 bg-surface/90 backdrop-blur-xl border border-border/50 shadow-2xl rounded-full px-3 sm:px-6 py-3 flex space-x-1 min-[400px]:space-x-2 sm:space-x-5 z-40"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <button 
          aria-label="Subscriptions"
          aria-current={activeTab === Tab.Dashboard ? 'page' : undefined}
          onClick={() => setActiveTab(Tab.Dashboard)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Dashboard ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Dashboard ? 'bg-primary/10' : 'bg-transparent'}`}>
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
          </div>
          <span className="desktop-nav-label">Subscriptions</span>
        </button>
        <button 
          aria-label="Cards"
          aria-current={activeTab === Tab.Cards ? 'page' : undefined}
          onClick={() => setActiveTab(Tab.Cards)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Cards ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Cards ? 'bg-primary/10' : 'bg-transparent'}`}>
            <Landmark size={20} />
          </div>
          <span className="desktop-nav-label">Cards</span>
        </button>
        <button 
          aria-label="Expenses"
          aria-current={activeTab === Tab.Expenses ? 'page' : undefined}
          onClick={() => setActiveTab(Tab.Expenses)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Expenses ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Expenses ? 'bg-primary/10' : 'bg-transparent'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18" /><path d="M6 7h12" /><path d="M8 17h8" /></svg>
          </div>
          <span className="desktop-nav-label">Expenses</span>
        </button>
        <button 
          aria-label="Income"
          aria-current={activeTab === Tab.Income ? 'page' : undefined}
          onClick={() => setActiveTab(Tab.Income)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Income ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Income ? 'bg-primary/10' : 'bg-transparent'}`}>
            <TrendingUp size={20} />
          </div>
          <span className="desktop-nav-label">Income</span>
        </button>
        <button 
          aria-label="Investments"
          aria-current={activeTab === Tab.Investment ? 'page' : undefined}
          onClick={() => setActiveTab(Tab.Investment)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Investment ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Investment ? 'bg-primary/10' : 'bg-transparent'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l5-5 4 4 9-9" /><path d="M21 7v5h-5" /></svg>
          </div>
          <span className="desktop-nav-label">Investments</span>
        </button>
        <button
          aria-label="Trade (beta)"
          aria-current={activeTab === Tab.Trade ? 'page' : undefined}
          onClick={() => setActiveTab(Tab.Trade)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Trade ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`relative p-1 rounded-lg ${activeTab === Tab.Trade ? 'bg-primary/10' : 'bg-transparent'}`}>
            <CandlestickChart size={20} />
            {/* Icon-only nav (phones): a small beta mark; the desktop label carries its own pill. */}
            <span className="absolute -right-1.5 -top-1 rounded-full bg-amber-500 px-1 text-[8px] font-black leading-[12px] text-white lg:hidden" aria-hidden="true">β</span>
          </div>
          <span className="desktop-nav-label">
            Trade
            <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-px align-middle text-[9px] font-black uppercase tracking-wide text-white">Beta</span>
          </span>
        </button>
        <button
          aria-label="Net worth"
          aria-current={activeTab === Tab.CashFlow ? 'page' : undefined}
          onClick={() => setActiveTab(Tab.CashFlow)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.CashFlow ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.CashFlow ? 'bg-primary/10' : 'bg-transparent'}`}>
            <Wallet size={20} />
          </div>
          <span className="desktop-nav-label">Net worth</span>
        </button>
        <button
          aria-label="Debts"
          aria-current={activeTab === Tab.Debts ? 'page' : undefined}
          onClick={() => setActiveTab(Tab.Debts)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Debts ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Debts ? 'bg-primary/10' : 'bg-transparent'}`}>
            <HandCoins size={20} />
          </div>
          <span className="desktop-nav-label">Debts</span>
        </button>
        <button
          aria-label="Goals"
          aria-current={activeTab === Tab.Goals ? 'page' : undefined}
          onClick={() => setActiveTab(Tab.Goals)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Goals ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
          <div className={`p-1 rounded-lg ${activeTab === Tab.Goals ? 'bg-primary/10' : 'bg-transparent'}`}><PiggyBank size={20} /></div>
          <span className="desktop-nav-label">Goals</span>
        </button>
        <button
          aria-label="Settings"
          aria-current={activeTab === Tab.Settings ? 'page' : undefined}
          onClick={() => setActiveTab(Tab.Settings)}
          className={`flex flex-col items-center space-y-1 transition-all duration-200 ${activeTab === Tab.Settings ? 'text-primary scale-110' : 'text-secondary hover:text-textMain'}`}
        >
           <div className={`p-1 rounded-lg ${activeTab === Tab.Settings ? 'bg-primary/10' : 'bg-transparent'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
          </div>
          <span className="desktop-nav-label">Settings</span>
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
          className="app-add-button fixed right-6 bg-primary hover:bg-blue-600 text-white p-4 rounded-full shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 z-30"
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

      {/* Card Details Page */}
      {viewingCard && (
          <CardDetail
              card={viewingCard}
              subscriptions={subscriptions}
              expenses={expenses}
              baseCurrency={userProfile.currency}
              benefits={getCardBenefitsForCard(viewingCard.name, cardBenefits)}
              onEdit={handleEditCardStart}
              onDelete={handleDeleteCard}
              cardPointTransactions={cardPointTransactions}
              onUpdateCardPointTransactions={handleUpdateCardPointTransactions}
              cashbackPrograms={cashbackPrograms.filter(program => program.cardId === viewingCard.id)}
              onSaveCashbackProgram={handleSaveCashbackProgram}
              onDeleteCashbackProgram={handleDeleteCashbackProgram}
              onClose={() => setViewingCardId(null)}
              statements={accountStatements.filter(statement => statement.accountKind === 'Card' && statement.cardId === viewingCard.id)}
              statementsEnabled={isSupabaseConfigured()}
              onUploadStatement={handleUploadStatement}
              onDownloadStatement={handleDownloadStatement}
              onDeleteStatement={handleDeleteStatement}
              onAddExpense={handleAddExpenseFromStatement}
              onUpdateExpense={handleUpdateExpenseFromStatement}
              incomes={incomes}
              onAddIncome={handleAddIncomeFromStatement}
              onUpdateIncome={handleUpdateIncomeFromStatement}
              linkedLoan={loans.find(loan => loan.cardId === viewingCard.id && !loan.isArchived)}
              loanPayments={loanPayments}
              onOpenDebt={() => {
                setDebtFocusCardId(viewingCard.id);
                setViewingCardId(null);
                setActiveTab(Tab.Debts);
              }}
          />
      )}

      {/* Card Add / Edit Modal */}
      {addingCard && (
          <CardEditModal
              card={addingCard}
              baseCurrency={userProfile.currency}
              expenses={expenses}
              subscriptions={subscriptions}
              onSave={handleSaveCardFromModal}
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
