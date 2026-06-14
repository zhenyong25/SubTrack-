
import React, { useState } from 'react';
import { Subscription, BillingCycle, CURRENCIES } from '../types';
import { getUrgencyLevel, convertCurrency } from '../services/storageService';
import { CalendarClock, ChevronRight, Tag } from 'lucide-react';
import CardLogo from './CardLogo';

interface SubscriptionListProps {
  subscriptions: Subscription[];
  baseCurrency: string;
  onCurrencyChange: (currency: string) => void;
  onDelete: (id: string) => void;
  onSelect: (sub: Subscription) => void;
}

const SubscriptionList: React.FC<SubscriptionListProps> = ({ subscriptions, baseCurrency, onCurrencyChange, onDelete, onSelect }) => {
  const [filter, setFilter] = useState<'Active' | 'Past'>('Active');

  const filteredSubs = subscriptions.filter(s => s.status === filter);
  
  const sortedSubs = [...filteredSubs].sort((a, b) => 
    new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime()
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    // Standardize to MMM DD, YYYY
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDaysRemaining = (dateStr: string) => {
      const target = new Date(dateStr);
      const now = new Date();
      const diffTime = target.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
  };

  const calculateProgress = (nextPayment: string, cycle: BillingCycle) => {
      const end = new Date(nextPayment).getTime();
      const now = new Date().getTime();
      let duration = 0;

      switch(cycle) {
          case BillingCycle.Monthly: duration = 30 * 24 * 60 * 60 * 1000; break;
          case BillingCycle.Yearly: duration = 365 * 24 * 60 * 60 * 1000; break;
          case BillingCycle.Weekly: duration = 7 * 24 * 60 * 60 * 1000; break;
          case BillingCycle.Daily: duration = 1 * 24 * 60 * 60 * 1000; break;
          default: duration = 30 * 24 * 60 * 60 * 1000;
      }

      const start = end - duration;
      const progress = ((now - start) / duration) * 100;
      return Math.min(Math.max(progress, 0), 100);
  };

  const getLogoUrl = (name: string) => {
      const cleanName = name.toLowerCase().replace(/\s+/g, '').replace(/premium|plus|pro|standard|family|student|individual|plan/g, '');
      const domainMap: Record<string, string> = {
          'netflix': 'netflix.com', 'spotify': 'spotify.com', 'youtube': 'youtube.com', 'amazon': 'amazon.com', 'prime': 'amazon.com',
          'disney': 'disneyplus.com', 'hulu': 'hulu.com', 'hbo': 'hbo.com', 'max': 'max.com', 'apple': 'apple.com', 'icloud': 'apple.com',
          'google': 'google.com', 'dropbox': 'dropbox.com', 'slack': 'slack.com', 'adobe': 'adobe.com', 'chatgpt': 'openai.com',
          'openai': 'openai.com', 'github': 'github.com', 'playstation': 'playstation.com', 'xbox': 'xbox.com', 'nintendo': 'nintendo.com',
          'steam': 'steampowered.com', 'twitch': 'twitch.tv', 'duolingo': 'duolingo.com', 'canva': 'canva.com', 'notion': 'notion.so',
          'medium': 'medium.com', 'x': 'twitter.com', 'twitter': 'twitter.com', 'linkedin': 'linkedin.com', 'zoom': 'zoom.us',
          'discord': 'discord.com', 'figma': 'figma.com', 'tinder': 'tinder.com', 'bumble': 'bumble.com', 'hinge': 'hinge.co',
          'audible': 'audible.com', 'evernote': 'evernote.com', 'midjourney': 'midjourney.com', 'claude': 'anthropic.com'
      };
      for(const key in domainMap) {
          if(cleanName.includes(key)) return `https://logo.clearbit.com/${domainMap[key]}`;
      }
      return `https://logo.clearbit.com/${cleanName}.com`;
  };

  const getCycleBadge = (cycle: BillingCycle) => {
      // Fixed width container (w-[65px]) ensures price alignment to the left
      const containerClass = "w-[65px] flex justify-end"; 
      const styleBase = "text-[9px] px-1.5 py-0.5 rounded-[4px] font-bold uppercase tracking-wider border ml-1.5";
      
      switch(cycle) {
          case BillingCycle.Monthly: 
            return <div className={containerClass}><span className={`${styleBase} bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/50`}>Monthly</span></div>;
          case BillingCycle.Yearly: 
            return <div className={containerClass}><span className={`${styleBase} bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/50`}>Yearly</span></div>;
          case BillingCycle.Weekly: 
            return <div className={containerClass}><span className={`${styleBase} bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800/50`}>Weekly</span></div>;
          case BillingCycle.Daily: 
            return <div className={containerClass}><span className={`${styleBase} bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700`}>Daily</span></div>;
          case BillingCycle.FreeTrial: 
            return <div className={containerClass}><span className={`${styleBase} bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/50`}>Trial</span></div>;
          default: 
            return <div className={containerClass}></div>;
      }
  };

  return (
    <div className="pb-24 animate-fade-in relative px-1">
      
      {/* Slim Sticky Header with Currency Selector */}
      <div className="sticky top-[72px] z-10 py-2 -mx-5 px-5 transition-all bg-gradient-to-b from-background via-background/95 to-transparent flex justify-between items-center">
        
        {/* Filter Tabs */}
        <div className="flex items-center space-x-1 bg-surface/80 backdrop-blur-md p-1 rounded-lg border border-border/60 w-fit shadow-sm">
            <button 
                onClick={() => setFilter('Active')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${filter === 'Active' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-textMain'}`}
            >
                Active
            </button>
            <button 
                onClick={() => setFilter('Past')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${filter === 'Past' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-textMain'}`}
            >
                Past
            </button>
        </div>

        {/* Currency Selector */}
        <div className="flex items-center bg-surface/80 backdrop-blur-md p-1 rounded-lg border border-border/60 shadow-sm">
            <select 
                value={baseCurrency}
                onChange={(e) => onCurrencyChange(e.target.value)}
                className="bg-transparent text-[10px] font-bold text-textMain py-1 px-2 rounded outline-none cursor-pointer"
            >
                {CURRENCIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                ))}
            </select>
        </div>
      </div>

      {sortedSubs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-secondary bg-surface/50 rounded-2xl border-2 border-dashed border-border mt-2">
          <CalendarClock size={24} className="opacity-40 mb-2" />
          <p className="text-xs font-bold text-textMain">No {filter.toLowerCase()} subscriptions</p>
        </div>
      )}

      {/* Subscription List */}
      <div className="space-y-3 mt-2">
        {sortedSubs.map((sub) => {
            const isTrial = sub.billingCycle === BillingCycle.FreeTrial;
            const logoUrl = getLogoUrl(sub.name);
            const daysRemaining = getDaysRemaining(sub.nextPaymentDate);
            const progress = calculateProgress(sub.nextPaymentDate, sub.billingCycle);
            const urgencyLevel = getUrgencyLevel(sub.nextPaymentDate);
            
            // Calculate price in base currency
            const displayPrice = convertCurrency(sub.price, sub.currency, baseCurrency);
            
            let dateColorClass = 'text-secondary';
            if (urgencyLevel === 'critical' && sub.status === 'Active') dateColorClass = 'text-red-500 font-bold';
            else if (urgencyLevel === 'warning' && sub.status === 'Active') dateColorClass = 'text-amber-500 font-bold';

            // Status Text Logic
            let statusText = '';
            if (sub.status === 'Past') {
                statusText = sub.cancellationDate 
                  ? `Ended on ${formatDate(sub.cancellationDate)}` 
                  : 'Cancelled';
            } else {
                statusText = daysRemaining < 0 
                  ? 'Overdue' 
                  : daysRemaining === 0 
                    ? 'Due Today' 
                    : `${formatDate(sub.nextPaymentDate)}`;
            }

            return (
            <div 
                key={sub.id} 
                onClick={() => onSelect(sub)}
                className="group relative bg-surface hover:bg-surface/80 rounded-xl border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer overflow-hidden"
            >
                <div className="flex items-center px-3 py-3">
                    {/* Logo - Uses Custom Color for Glow/Shadow */}
                    <div 
                        className="w-12 h-12 flex-shrink-0 rounded-xl bg-background border border-border flex items-center justify-center overflow-hidden mr-3 transition-shadow"
                        style={{ boxShadow: `0 4px 12px -4px ${sub.color || 'transparent'}` }}
                    >
                        <img 
                            src={logoUrl} 
                            alt={sub.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.style.background = `linear-gradient(135deg, ${sub.color}, ${sub.color}88)`;
                                e.currentTarget.parentElement!.innerText = sub.name.charAt(0).toUpperCase();
                                e.currentTarget.parentElement!.className = "w-12 h-12 flex-shrink-0 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-sm mr-3";
                            }}
                        />
                    </div>

                    {/* Middle: Name & Meta */}
                    <div className="flex-1 min-w-0 mr-2">
                        <h3 className={`font-bold text-sm truncate leading-snug ${sub.status === 'Past' ? 'text-secondary line-through' : 'text-textMain'}`}>{sub.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                             {sub.cardName && sub.cardName !== 'Cash' && (
                                <div className="flex items-center text-[10px] text-secondary bg-background px-1.5 py-0.5 rounded border border-border/50 truncate max-w-[100px]">
                                    <CardLogo type={sub.cardType} name={sub.cardName} />
                                    <span className="truncate">{sub.cardName}</span>
                                </div>
                             )}
                             {(!sub.cardName || sub.cardName === 'Cash') && (
                                <div className="flex items-center text-[10px] text-secondary">
                                    <Tag size={10} className="mr-1" /> {sub.category}
                                </div>
                             )}
                        </div>
                    </div>

                    {/* Right: Price, Cycle Tag & Date */}
                    <div className="text-right flex-shrink-0 min-w-[130px] flex flex-col items-end justify-center">
                        <div className="flex items-center justify-end mb-0.5 w-full">
                             {isTrial ? (
                                <span className="text-lg font-extrabold text-emerald-500 leading-none">Free</span>
                             ) : (
                                <span className={`text-lg font-extrabold leading-none tracking-tight ${sub.status === 'Past' ? 'text-secondary' : 'text-textMain'}`}>
                                     {displayPrice.toFixed(2)}
                                </span>
                             )}
                             {getCycleBadge(sub.billingCycle)}
                        </div>
                        <div className={`text-[11px] font-medium mt-1 ${dateColorClass}`}>
                            {statusText}
                        </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight size={16} className="text-border ml-2 group-hover:text-primary transition-colors" />
                </div>

                {/* Slim Progress Line - Uses Custom Color */}
                <div className="h-[2px] w-full bg-border/20 mt-0">
                    <div 
                        className="h-full opacity-80" 
                        style={{ 
                            width: sub.status === 'Past' ? '0%' : `${progress}%`,
                            backgroundColor: isTrial ? '#10b981' : (sub.color || 'var(--color-primary)')
                        }}
                    />
                </div>
            </div>
            );
        })}
      </div>
    </div>
  );
};

export default SubscriptionList;
