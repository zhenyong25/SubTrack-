import React, { useState } from 'react';
import { Subscription, BillingCycle } from '../types';
import { getUrgencyLevel } from '../services/storageService';
import { Calendar, Users, Archive, Clock, Circle } from 'lucide-react';
import CardLogo from './CardLogo';

interface SubscriptionListProps {
  subscriptions: Subscription[];
  onDelete: (id: string) => void;
  onSelect: (sub: Subscription) => void;
}

const SubscriptionList: React.FC<SubscriptionListProps> = ({ subscriptions, onDelete, onSelect }) => {
  const [filter, setFilter] = useState<'Active' | 'Past'>('Active');

  const filteredSubs = subscriptions.filter(s => s.status === filter);
  
  const sortedSubs = [...filteredSubs].sort((a, b) => 
    new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime()
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getUrgencyColor = (dateStr: string) => {
      const urgency = getUrgencyLevel(dateStr);
      if (urgency === 'critical') return 'text-red-600 dark:text-red-400 font-bold';
      if (urgency === 'warning') return 'text-amber-500 font-bold';
      return 'text-secondary';
  };

  return (
    <div className="space-y-3 pb-24 animate-fade-in">
      
      {/* List Header / Tabs */}
      <div className="flex items-center space-x-6 mb-2 border-b border-border">
        <button 
            onClick={() => setFilter('Active')}
            className={`flex items-center space-x-2 py-3 text-sm font-medium transition-all border-b-2 ${filter === 'Active' ? 'text-primary border-primary' : 'text-secondary border-transparent hover:text-textMain'}`}
        >
            <span>Active</span>
            <span className="bg-secondary/10 text-secondary px-1.5 py-0.5 rounded text-[10px] font-bold">{subscriptions.filter(s => s.status === 'Active').length}</span>
        </button>
        <button 
            onClick={() => setFilter('Past')}
            className={`flex items-center space-x-2 py-3 text-sm font-medium transition-all border-b-2 ${filter === 'Past' ? 'text-primary border-primary' : 'text-secondary border-transparent hover:text-textMain'}`}
        >
            <span>Past / Inactive</span>
        </button>
      </div>

      {/* Grid Headers for Desktop/Tablet */}
      <div className="hidden sm:flex px-4 pb-2 text-xs font-semibold text-secondary uppercase tracking-wider">
          <div className="flex-1">Service</div>
          <div className="w-28 text-left hidden md:block">Payment Method</div>
          <div className="w-20 text-right">Cost</div>
          <div className="w-24 text-right">Due Date</div>
      </div>

      {sortedSubs.length === 0 && (
        <div className="text-center py-16 text-secondary bg-surface rounded-xl border border-border border-dashed">
          <p className="mb-2 text-sm font-medium">No {filter.toLowerCase()} subscriptions.</p>
          {filter === 'Active' && <p className="text-xs opacity-70">Tap the + button to add one.</p>}
        </div>
      )}

      {sortedSubs.map((sub) => {
        const isTrial = sub.billingCycle === BillingCycle.FreeTrial;
        const isShared = (sub.sharedWith && sub.sharedWith.length > 0) || (sub.sharedCount && sub.sharedCount > 1);
        const shareCount = sub.sharedWith?.length ? sub.sharedWith.length + 1 : (sub.sharedCount || 1);
        const myShare = isShared ? sub.price / shareCount : sub.price;
        const currency = sub.currency || 'USD';
        const urgencyClass = getUrgencyColor(sub.nextPaymentDate);
        
        return (
          <div 
            key={sub.id} 
            onClick={() => onSelect(sub)}
            className="group bg-surface rounded-xl p-3 border border-border transition-all duration-200 cursor-pointer hover:border-primary/30 hover:shadow-md active:scale-[0.99] flex items-center relative overflow-hidden"
          >
              {/* Active Green Dot Indicator */}
              {filter === 'Active' && (
                <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-emerald-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              )}

              {/* 1. Icon & Name (Flex Grow to fill available space) */}
              <div className="flex-1 flex items-center space-x-3 overflow-hidden pr-2">
                  <div 
                    className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-lg font-bold text-white shadow-sm relative"
                    style={{ backgroundColor: sub.color }}
                  >
                    {sub.name.charAt(0).toUpperCase()}
                    {/* Status Dot */}
                    {filter === 'Active' && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-surface"></span>
                        </span>
                    )}
                  </div>
                  <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                          <h3 className="font-bold text-textMain text-sm truncate">{sub.name}</h3>
                          {isShared && <Users size={12} className="text-primary flex-shrink-0" />}
                      </div>
                      <div className="flex items-center text-xs text-secondary space-x-1 truncate">
                          <span className="truncate">{sub.category}</span>
                          {/* Show Card info here on mobile since column is hidden */}
                          <span className="sm:hidden mx-1">•</span>
                          <div className="flex items-center sm:hidden truncate">
                                <CardLogo type={sub.cardType} name={sub.cardName} />
                                <span className="truncate max-w-[60px]">{sub.cardName}</span>
                          </div>
                      </div>
                  </div>
              </div>

              {/* 2. Card Info Column (Fixed Width: 7rem / w-28) - Hidden on mobile to save space, consistent on Desktop */}
              <div className="hidden sm:flex w-28 flex-col justify-center text-right pr-2">
                   <div className="flex items-center justify-end text-xs text-secondary">
                        <CardLogo type={sub.cardType} name={sub.cardName} />
                        <span className="truncate max-w-[80px]">{sub.cardName}</span>
                   </div>
              </div>

              {/* 3. Cost Column (Fixed Width: 5rem / w-20) */}
              <div className="w-20 text-right flex flex-col justify-center">
                  <p className="text-sm font-bold text-textMain">
                     {isTrial ? 'Free' : `${myShare.toFixed(2)}`}
                  </p>
                  <p className="text-[10px] text-secondary">{currency}</p>
              </div>

              {/* 4. Date Column (Fixed Width: 6rem / w-24) */}
              <div className="w-24 text-right flex flex-col justify-center pl-2 border-l border-border/50 ml-2">
                 {filter === 'Active' ? (
                     <>
                        <div className={`flex justify-end items-center text-xs ${urgencyClass} mb-0.5`}>
                           {isTrial ? <Clock size={10} className="mr-1" /> : <Calendar size={10} className="mr-1" />}
                           <span>{formatDate(sub.nextPaymentDate)}</span>
                        </div>
                        <div className="text-[10px] text-secondary">
                            {sub.billingCycle}
                        </div>
                     </>
                 ) : (
                     <span className="text-xs text-secondary italic flex items-center justify-end">
                         <Archive size={12} className="mr-1" /> Archived
                     </span>
                 )}
              </div>
          </div>
        );
      })}
    </div>
  );
};

export default SubscriptionList;