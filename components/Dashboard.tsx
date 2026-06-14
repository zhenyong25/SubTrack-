
import React, { useMemo, useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Subscription, BillingCycle, CURRENCIES, PaymentCard } from '../types';
import { getMonthlyCost, getYearlyExpenseData, convertCurrency, getCurrencySymbol } from '../services/storageService';
import { CreditCard, Calendar, TrendingUp, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, Clock, PlusCircle } from 'lucide-react';
import CardLogo from './CardLogo';
import CardDetail from './CardDetail';

interface DashboardProps {
  subscriptions: Subscription[];
  cards: PaymentCard[];
  baseCurrency: string;
  onCurrencyChange: (currency: string) => void;
  onUpdateCard: (card: PaymentCard) => void;
  onAddCard: () => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'];

type ViewMode = 'Daily' | 'Monthly' | 'Yearly';

const Dashboard: React.FC<DashboardProps> = ({ subscriptions, cards, baseCurrency, onCurrencyChange, onUpdateCard, onAddCard }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('Monthly');
  const [cardFilterDate, setCardFilterDate] = useState(new Date());
  const [selectedCardForDetail, setSelectedCardForDetail] = useState<PaymentCard | null>(null);
  
  // Year state for Chart
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Sync Chart Year when Card Filter Date changes years
  useEffect(() => {
    setSelectedYear(cardFilterDate.getFullYear());
  }, [cardFilterDate]);

  const stats = useMemo(() => {
    let monthlyTotal = 0;
    let yearlyTotal = 0;
    let activeTrials = 0;
    let currentMonthBill = 0;
    let mostExpensiveSub = { name: '-', amount: 0 };
    let totalCount = 0;
    let nextUpSub: Subscription | null = null;
    
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const currentYear = now.getFullYear();

    const activeSubs = subscriptions.filter(s => s.status === 'Active').sort((a,b) => 
        new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime()
    );
    if(activeSubs.length > 0) nextUpSub = activeSubs[0];

    subscriptions.forEach(sub => {
      if (sub.status !== 'Active') return;

      if (sub.billingCycle === BillingCycle.FreeTrial) {
        activeTrials++;
      } else {
        const monthly = getMonthlyCost(sub, baseCurrency);
        monthlyTotal += monthly;
        yearlyTotal += monthly * 12;
        totalCount++;

        if (monthly > mostExpensiveSub.amount) {
            mostExpensiveSub = { name: sub.name, amount: monthly };
        }

        const nextPay = new Date(sub.nextPaymentDate);
        if (nextPay.getMonth() === currentMonthIdx && nextPay.getFullYear() === currentYear) {
             const shareCount = sub.sharedCount && sub.sharedCount > 0 ? sub.sharedCount : 1;
             let convertedCost = getMonthlyCost(sub, baseCurrency);
             if (sub.billingCycle === BillingCycle.Yearly) {
                 convertedCost = convertCurrency(sub.price / shareCount, sub.currency, baseCurrency);
             }
             currentMonthBill += convertedCost;
        }
      }
    });

    const averageCost = totalCount > 0 ? monthlyTotal / totalCount : 0;

    return { monthlyTotal, yearlyTotal, activeTrials, currentMonthBill, mostExpensiveSub, averageCost, totalCount, nextUpSub };
  }, [subscriptions, baseCurrency]);

  const displayTotal = useMemo(() => {
      switch (viewMode) {
          case 'Daily': return stats.monthlyTotal / 30;
          case 'Monthly': return stats.monthlyTotal;
          case 'Yearly': return stats.yearlyTotal;
      }
  }, [viewMode, stats]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    subscriptions.forEach(sub => {
      if (sub.status !== 'Active') return;
      const cost = getMonthlyCost(sub, baseCurrency);
      if (cost > 0) {
        map.set(sub.category, (map.get(sub.category) || 0) + cost);
      }
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [subscriptions, baseCurrency]);

  const yearlyChartData = useMemo(() => getYearlyExpenseData(subscriptions, selectedYear, baseCurrency), [subscriptions, selectedYear, baseCurrency]);

  // Card Usage Data with Linkage
  const cardUsageData = useMemo(() => {
     // 1. Initialize map with existing cards
     const map = new Map<string, { total: number, type: string, cardId?: string, budget?: number, instance?: PaymentCard }>();
     
     cards.forEach(c => {
         map.set(c.name, { total: 0, type: c.type, cardId: c.id, budget: c.budget, instance: c });
     });

     const filterMonth = cardFilterDate.getMonth();
     const filterYear = cardFilterDate.getFullYear();

     subscriptions.forEach(sub => {
       if (sub.status !== 'Active') return;
       if (sub.billingCycle === BillingCycle.FreeTrial) return;

       // Logic for monthly occurrence check
       let occursInMonth = false;
       const firstDate = new Date(sub.firstPaymentDate);
       
       if (sub.billingCycle === BillingCycle.Monthly) {
           occursInMonth = firstDate <= new Date(filterYear, filterMonth + 1, 0); 
       } else if (sub.billingCycle === BillingCycle.Yearly) {
           const renewalMonth = firstDate.getMonth();
           occursInMonth = renewalMonth === filterMonth && firstDate.getFullYear() <= filterYear;
       } else if (sub.billingCycle === BillingCycle.Daily || sub.billingCycle === BillingCycle.Weekly) {
           occursInMonth = true;
       }

       if (occursInMonth) {
            let costForMonth = 0;
            const splitCount = sub.sharedCount || 1;
            const price = convertCurrency(sub.price / splitCount, sub.currency, baseCurrency);

            if (sub.billingCycle === BillingCycle.Monthly) costForMonth = price;
            else if (sub.billingCycle === BillingCycle.Yearly) costForMonth = price; 
            else if (sub.billingCycle === BillingCycle.Weekly) costForMonth = price * 4.3;
            else if (sub.billingCycle === BillingCycle.Daily) costForMonth = price * 30;

            if (costForMonth > 0) {
                // If sub linked by ID, use that, else use name fallback
                let key = sub.cardName;
                if (sub.cardId) {
                    const linkedCard = cards.find(c => c.id === sub.cardId);
                    if (linkedCard) key = linkedCard.name;
                }

                // If this card name wasn't in our initial list (ad-hoc), add it
                if (!map.has(key)) {
                    map.set(key, { total: 0, type: sub.cardType || 'Other' });
                }

                const current = map.get(key)!;
                current.total += costForMonth;
                map.set(key, current);
            }
       }
     });

     return Array.from(map.entries()).map(([name, data]) => ({ 
         name, 
         value: data.total, 
         type: data.type, 
         cardId: data.cardId,
         budget: data.budget,
         instance: data.instance
     })).sort((a,b) => b.value - a.value);
  }, [subscriptions, baseCurrency, cardFilterDate, cards]);

  const handlePrevCardMonth = () => {
      const d = new Date(cardFilterDate);
      d.setMonth(d.getMonth() - 1);
      setCardFilterDate(d);
  };

  const handleNextCardMonth = () => {
      const d = new Date(cardFilterDate);
      d.setMonth(d.getMonth() + 1);
      setCardFilterDate(d);
  };

  const getCardStatusColor = (value: number, budget?: number) => {
      if (!budget) return 'bg-background';
      const ratio = value / budget;
      if (ratio > 1) return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900/50';
      if (ratio > 0.75) return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-900/50';
      return 'bg-background';
  };

  // Determine active month for Chart based on Card Filter
  // Only valid if the selected card year matches the selected chart year
  const activeMonthIndex = cardFilterDate.getFullYear() === selectedYear ? cardFilterDate.getMonth() : -1;

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      
      {/* Widget / Focus Card */}
      {stats.nextUpSub && (
        <div className="bg-gradient-to-r from-primary to-blue-600 rounded-2xl p-5 text-white shadow-xl flex items-center justify-between relative overflow-hidden">
            <div className="relative z-10">
                <p className="text-xs font-medium opacity-80 uppercase tracking-wide mb-1 flex items-center">
                    <Clock size={12} className="mr-1" /> Next Bill
                </p>
                <h2 className="text-2xl font-bold">{stats.nextUpSub.name}</h2>
                <div className="flex items-center mt-2 space-x-2">
                     <span className="text-3xl font-bold">
                        {stats.nextUpSub.billingCycle === BillingCycle.FreeTrial ? 'Free' : (stats.nextUpSub.price / (stats.nextUpSub.sharedCount || 1)).toFixed(2)}
                     </span>
                     <span className="text-sm opacity-90">{stats.nextUpSub.currency}</span>
                </div>
                <p className="text-xs mt-2 opacity-80 font-medium">
                    Due {new Date(stats.nextUpSub.nextPaymentDate).toLocaleDateString('en-US', {weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'})}
                </p>
            </div>
            <div className="relative z-10 bg-white/10 p-3 rounded-xl backdrop-blur-sm border border-white/10">
                 <div className="text-center">
                    <span className="block text-xl font-bold">{new Date(stats.nextUpSub.nextPaymentDate).getDate()}</span>
                    <span className="block text-[10px] uppercase">{new Date(stats.nextUpSub.nextPaymentDate).toLocaleString('default', {month:'short'})}</span>
                 </div>
            </div>
            <div className="absolute -right-6 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        </div>
      )}

      {/* Global Controls */}
      <div className="flex justify-between items-center">
         <div className="bg-surface p-1 rounded-lg border border-border flex space-x-1">
             {(['Daily', 'Monthly', 'Yearly'] as ViewMode[]).map((mode) => (
                 <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${viewMode === mode ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-textMain'}`}
                 >
                     {mode}
                 </button>
             ))}
         </div>

         <div className="flex space-x-2">
            <select 
            value={baseCurrency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="bg-surface text-xs font-bold text-textMain py-1.5 px-3 rounded-lg border border-border outline-none focus:border-primary cursor-pointer"
            >
            {CURRENCIES.map(c => (
                <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>
            ))}
            </select>
         </div>
      </div>

      {/* Summary */}
      <div className="bg-surface p-6 rounded-2xl shadow-sm border border-border flex flex-col items-center text-center">
             <p className="text-sm font-medium text-secondary uppercase tracking-wide mb-2">
                 Total {viewMode} Spending
             </p>
             <div className="flex items-baseline space-x-2 text-textMain">
                 <span className="text-4xl font-bold tracking-tight">{displayTotal.toFixed(2)}</span>
                 <span className="text-lg font-medium text-secondary">{baseCurrency}</span>
             </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface p-5 rounded-xl shadow-sm border border-border flex flex-col justify-between">
          <div className="flex items-center space-x-2 text-secondary mb-3">
            <Calendar size={18} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider">Due This Month</span>
          </div>
          <div>
            <div className="flex items-baseline space-x-1">
                <p className="text-2xl font-bold text-textMain">{stats.currentMonthBill.toFixed(2)}</p>
                <span className="text-xs font-medium text-secondary">{baseCurrency}</span>
            </div>
            <p className="text-[10px] text-secondary mt-1">Actual bill payments</p>
          </div>
        </div>
        
        <div className="bg-surface p-5 rounded-xl shadow-sm border border-border flex flex-col justify-between">
             <div className="flex items-center space-x-2 text-secondary mb-3">
                <ArrowUpRight size={18} className="text-red-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Top Expense</span>
            </div>
            <div>
                <p className="text-lg font-bold text-textMain truncate">{stats.mostExpensiveSub.name}</p>
                <div className="flex items-center space-x-1 mt-1">
                     <span className="text-sm font-semibold text-secondary">{stats.mostExpensiveSub.amount.toFixed(2)}</span>
                     <span className="text-[10px] text-secondary">{baseCurrency}/mo</span>
                </div>
            </div>
        </div>
        
        <div className="bg-surface p-5 rounded-xl shadow-sm border border-border flex flex-col justify-between">
            <div className="flex items-center space-x-2 text-secondary mb-3">
                <BarChart3 size={18} className="text-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Avg. Cost</span>
            </div>
             <div>
                <p className="text-2xl font-bold text-textMain">{stats.averageCost.toFixed(2)}</p>
                <p className="text-[10px] text-secondary mt-1">Per subscription</p>
            </div>
        </div>

        <div className="bg-surface p-5 rounded-xl shadow-sm border border-border flex flex-col justify-between">
             <div className="flex items-center space-x-2 text-secondary mb-3">
                <TrendingUp size={18} className={stats.activeTrials > 0 ? "text-emerald-500" : "text-secondary"} />
                <span className="text-xs font-bold uppercase tracking-wider">Active Trials</span>
            </div>
            <div>
                <p className="text-2xl font-bold text-textMain">{stats.activeTrials}</p>
                <p className="text-[10px] text-secondary mt-1">
                    {stats.activeTrials > 0 ? "Don't forget to cancel!" : "No active trials"}
                </p>
            </div>
        </div>
      </div>

      {/* Yearly Expense Chart */}
      <div className="bg-surface p-6 rounded-xl shadow-sm border border-border">
          <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Yearly Expenses</h3>
              <div className="flex items-center space-x-2 bg-background border border-border rounded-lg px-2 py-1">
                  <button onClick={() => setSelectedYear(y => y - 1)} className="p-1 hover:text-primary"><ChevronLeft size={16}/></button>
                  <span className="text-xs font-bold w-12 text-center">{selectedYear}</span>
                  <button onClick={() => setSelectedYear(y => y + 1)} className="p-1 hover:text-primary"><ChevronRight size={16}/></button>
              </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                    <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: 'var(--color-secondary)', fontSize: 10}} 
                        interval={0}
                    />
                    <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: 'var(--color-secondary)', fontSize: 10}}
                        width={30}
                    />
                    <Tooltip 
                        cursor={{fill: 'var(--color-text-main)', opacity: 0.05}} 
                        contentStyle={{ 
                            backgroundColor: 'var(--color-surface)', 
                            borderColor: 'var(--color-border)', 
                            color: 'var(--color-text-main)', 
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' 
                        }}
                        itemStyle={{ color: 'var(--color-primary)', fontSize: '12px', fontWeight: 'bold' }}
                        formatter={(value: number) => [`${value.toFixed(0)} ${baseCurrency}`, 'Cost']}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                        {yearlyChartData.map((entry, index) => (
                            <Cell 
                                key={`cell-${index}`} 
                                fill={index === activeMonthIndex ? 'var(--color-success)' : 'var(--color-primary)'} 
                                className="transition-all duration-300"
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
          </div>
      </div>

       {/* Spending by Card */}
       <div className="bg-surface p-6 rounded-xl shadow-sm border border-border">
            <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center space-x-2">
                    <CreditCard className="text-primary" size={18} />
                    <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Card Usage</h3>
                 </div>
                 <div className="flex space-x-2">
                    {/* Month Picker */}
                    <div className="flex items-center bg-background border border-border rounded-lg p-1">
                        <button onClick={handlePrevCardMonth} className="p-1 hover:text-primary"><ChevronLeft size={16} /></button>
                        <span className="text-xs font-bold w-20 text-center select-none">
                            {cardFilterDate.toLocaleDateString('en-US', {month: 'short', year: '2-digit'})}
                        </span>
                        <button onClick={handleNextCardMonth} className="p-1 hover:text-primary"><ChevronRight size={16} /></button>
                    </div>
                    {/* Add Card Button - Open Modal via App prop */}
                    <button onClick={onAddCard} className="bg-primary/10 text-primary p-2 rounded-lg hover:bg-primary hover:text-white transition-colors">
                        <PlusCircle size={18} />
                    </button>
                 </div>
            </div>

            {cardUsageData.length > 0 ? (
                <div className="space-y-3">
                    {cardUsageData.map(item => {
                        const statusColor = getCardStatusColor(item.value, item.budget);
                        
                        return (
                            <div 
                                key={item.name} 
                                onClick={() => item.instance && setSelectedCardForDetail(item.instance)}
                                className={`flex items-center justify-between p-3 rounded-lg border border-border/50 transition-colors cursor-pointer hover:border-primary/50 ${statusColor}`}
                            >
                                <div className="flex items-center">
                                    <CardLogo type={item.type as any} name={item.name} />
                                    <div className="ml-2">
                                        <span className="text-sm font-medium text-textMain block">{item.name}</span>
                                        {item.budget && (
                                            <div className="w-24 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full ${item.value > item.budget ? 'bg-red-500' : 'bg-primary'}`} 
                                                    style={{ width: `${Math.min((item.value / item.budget) * 100, 100)}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-sm font-bold text-textMain block">{item.value.toFixed(2)} {baseCurrency}</span>
                                    {item.budget && (
                                        <span className={`text-[10px] font-medium ${item.value > item.budget ? 'text-red-500' : 'text-secondary'}`}>
                                            of {item.budget} budget
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-8 text-secondary">
                    <p className="text-xs">No active payments due in {cardFilterDate.toLocaleDateString('en-US', {month: 'long'})}.</p>
                    <button onClick={onAddCard} className="mt-2 text-primary text-xs font-bold hover:underline">Add a Card</button>
                </div>
            )}
       </div>

      {/* Spending by Category Chart */}
      <div className="bg-surface p-6 rounded-xl shadow-sm border border-border">
        <h3 className="text-sm font-bold text-textMain uppercase mb-6 tracking-wide">Spending by Category</h3>
        <div className="h-64 w-full">
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-main)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ color: 'var(--color-text-main)', fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(value: number) => [`${value.toFixed(2)} ${baseCurrency}`, 'Monthly']}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-secondary opacity-50">
              <p>No data available</p>
            </div>
          )}
        </div>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          {categoryData.map((entry, index) => (
            <div key={entry.name} className="flex items-center space-x-1.5 bg-background px-2 py-1 rounded-md border border-border">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
              <span className="text-xs font-medium text-secondary">{entry.name}</span>
            </div>
          ))}
        </div>
      </div>

      {selectedCardForDetail && (
          <CardDetail 
              card={selectedCardForDetail} 
              subscriptions={subscriptions}
              baseCurrency={baseCurrency}
              onUpdate={onUpdateCard}
              onClose={() => setSelectedCardForDetail(null)}
          />
      )}
    </div>
  );
};

export default Dashboard;
