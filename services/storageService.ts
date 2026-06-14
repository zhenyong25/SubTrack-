
import { Subscription, BillingCycle, PaymentCard, Friend } from '../types';

const STORAGE_KEY = 'subtrack_data_v1';
const STORAGE_KEY_CARDS = 'subtrack_cards_v1';
const STORAGE_KEY_FRIENDS = 'subtrack_friends_v1';

// Static rates for demo purposes (Base is USD)
const EXCHANGE_RATES: Record<string, number> = {
  'USD': 1.0,
  'EUR': 0.92,
  'GBP': 0.79,
  'JPY': 150.0,
  'CAD': 1.35,
  'AUD': 1.52,
  'INR': 83.0,
  'CNY': 7.2,
  'MYR': 4.7,
  'SGD': 1.36
};

export const getCurrencySymbol = (code: string): string => {
    const symbols: Record<string, string> = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'JPY': '¥',
        'CAD': '$',
        'AUD': '$',
        'INR': '₹',
        'CNY': '¥',
        'MYR': 'RM',
        'SGD': '$'
    };
    return symbols[code] || code;
};

export const getSubscriptions = (): Subscription[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load subscriptions", e);
    return [];
  }
};

export const saveSubscriptions = (subs: Subscription[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
};

export const getCards = (): PaymentCard[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_CARDS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const saveCards = (cards: PaymentCard[]) => {
  localStorage.setItem(STORAGE_KEY_CARDS, JSON.stringify(cards));
};

export const getFriends = (): Friend[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_FRIENDS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export const saveFriends = (friends: Friend[]) => {
  localStorage.setItem(STORAGE_KEY_FRIENDS, JSON.stringify(friends));
}

// Helper to calculate the next payment date based on cycle
export const calculateNextPayment = (startDate: string, cycle: BillingCycle): string => {
  const start = new Date(startDate);
  const now = new Date();
  
  // If start date is in future, that is the next payment
  if (start > now) return start.toISOString();

  // For Free Trial, if the date passed, it usually converts to Monthly (default logic)
  if (cycle === BillingCycle.FreeTrial) {
    return start.toISOString(); 
  }

  const next = new Date(start);
  
  while (next <= now) {
    switch (cycle) {
      case BillingCycle.Daily:
        next.setDate(next.getDate() + 1);
        break;
      case BillingCycle.Weekly:
        next.setDate(next.getDate() + 7);
        break;
      case BillingCycle.Monthly:
        next.setMonth(next.getMonth() + 1);
        break;
      case BillingCycle.Yearly:
        next.setFullYear(next.getFullYear() + 1);
        break;
    }
  }
  
  return next.toISOString();
};

export const isUpcoming = (dateStr: string, daysThreshold: number = 3): boolean => {
  const target = new Date(dateStr);
  const now = new Date();
  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= daysThreshold;
};

export const getUrgencyLevel = (dateStr: string): 'critical' | 'warning' | 'safe' => {
  const target = new Date(dateStr);
  const now = new Date();
  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays >= 0 && diffDays <= 3) return 'critical'; // Red
  if (diffDays > 3 && diffDays <= 7) return 'warning';  // Amber
  return 'safe';
};

// Convert any amount from source currency to target currency
export const convertCurrency = (amount: number, fromCurrency: string, toCurrency: string): number => {
  if (fromCurrency === toCurrency) return amount;
  
  const fromRate = EXCHANGE_RATES[fromCurrency] || 1;
  const toRate = EXCHANGE_RATES[toCurrency] || 1;
  
  // Convert to USD first, then to target
  const amountInUSD = amount / fromRate;
  return amountInUSD * toRate;
};

// Get monthly cost in the TARGET currency, accounting for splits
export const getMonthlyCost = (sub: Subscription, targetCurrency: string = 'USD'): number => {
  if (sub.billingCycle === BillingCycle.FreeTrial) return 0;
  
  let baseMonthlyCost = sub.price;

  switch (sub.billingCycle) {
    case BillingCycle.Daily: 
      baseMonthlyCost = sub.price * 30; 
      break;
    case BillingCycle.Weekly: 
      baseMonthlyCost = sub.price * 4; 
      break;
    case BillingCycle.Monthly: 
      baseMonthlyCost = sub.price; 
      break;
    case BillingCycle.Yearly: 
      baseMonthlyCost = sub.price / 12; 
      break;
  }

  // Handle Shared/Split cost
  const splitCount = sub.sharedCount && sub.sharedCount > 0 ? sub.sharedCount : 1;
  const myShare = baseMonthlyCost / splitCount;

  // Convert to target currency
  return convertCurrency(myShare, sub.currency || 'USD', targetCurrency);
};

export const exportSubscriptionsToCSV = (subs: Subscription[]) => {
  // Define CSV Headers compatible with generic finance apps
  const headers = ["Name", "Cost", "Currency", "Cycle", "First Payment Date", "Next Payment Date", "Category", "Card Name", "Card Type", "Status", "Note"];
  
  const rows = subs.map(s => {
    return [
      `"${s.name}"`, // Quote strings to handle commas
      s.price,
      s.currency,
      s.billingCycle,
      s.firstPaymentDate.split('T')[0], // Clean date
      s.nextPaymentDate.split('T')[0],
      `"${s.category}"`,
      `"${s.cardName}"`,
      s.cardType || '',
      s.status,
      `"${s.notes || ''}"`
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  
  // Create download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `subtrack_export_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- CHART DATA HELPERS ---

export const getYearlyExpenseData = (subs: Subscription[], year: number, baseCurrency: string) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Initialize buckets
    const data = months.map(m => ({ name: m, total: 0 }));

    subs.forEach(sub => {
        if (sub.billingCycle === BillingCycle.FreeTrial) return;

        const subStartDate = new Date(sub.firstPaymentDate);
        // If cancellation date exists, use it, otherwise assume infinity (active)
        const subEndDate = sub.status === 'Past' && sub.cancellationDate 
            ? new Date(sub.cancellationDate) 
            : new Date(9999, 11, 31); 
        
        // Loop through each month of the target year
        for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
            // Create a specific date for Month Year (start of month)
            const monthStart = new Date(year, monthIdx, 1);
            // End of month
            const monthEnd = new Date(year, monthIdx + 1, 0);

            // 1. Must have started before or during this month
            // 2. Must not have been cancelled before this month
            
            // Check start: Start Date month/year must be <= Current month/year
            if (new Date(subStartDate.getFullYear(), subStartDate.getMonth(), 1) > monthStart) continue;

            // Check end: If cancelled, cancellation date must be >= start of this month
            if (subEndDate < monthStart) continue;

            let costToAdd = 0;
            const splitCount = sub.sharedCount && sub.sharedCount > 0 ? sub.sharedCount : 1;
            const price = convertCurrency(sub.price / splitCount, sub.currency, baseCurrency);

            if (sub.billingCycle === BillingCycle.Monthly) {
                // Occurs every month
                costToAdd = price;
            } else if (sub.billingCycle === BillingCycle.Yearly) {
                // Occurs only if month matches start month (Renewal)
                if (subStartDate.getMonth() === monthIdx) {
                    costToAdd = price;
                }
            } else if (sub.billingCycle === BillingCycle.Weekly) {
                 // Approx cost
                 costToAdd = price * 4.3;
            } else if (sub.billingCycle === BillingCycle.Daily) {
                 const daysInMonth = monthEnd.getDate();
                 costToAdd = price * daysInMonth;
            }

            data[monthIdx].total += costToAdd;
        }
    });
    
    return data.map(d => ({ ...d, total: parseFloat(d.total.toFixed(2)) }));
}

export const getPaymentDistribution = (subs: Subscription[], baseCurrency: string) => {
  // Buckets for Day 1 to 31
  const buckets = Array(31).fill(0).map((_, i) => ({ day: i + 1, total: 0 }));

  subs.forEach(sub => {
    if (sub.status !== 'Active') return;
    if (sub.billingCycle === BillingCycle.FreeTrial) return;
    if (sub.billingCycle === BillingCycle.Daily || sub.billingCycle === BillingCycle.Weekly) return; // Skip frequent ones

    const dayOfMonth = new Date(sub.nextPaymentDate).getDate();
    // Use index day-1
    if (dayOfMonth >= 1 && dayOfMonth <= 31) {
        const price = convertCurrency(sub.price, sub.currency, baseCurrency);
        const splitCount = sub.sharedCount && sub.sharedCount > 0 ? sub.sharedCount : 1;
        buckets[dayOfMonth - 1].total += (price / splitCount);
    }
  });

  return buckets.map(b => ({ name: `${b.day}`, total: parseFloat(b.total.toFixed(2)) }));
};

// Calculate total spending for a specific card over the past 12 months
export const getCardSpendingHistory = (subs: Subscription[], cardName: string, baseCurrency: string) => {
  const today = new Date();
  const data = [];

  // Go back 12 months
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthKey = d.toLocaleString('default', { month: 'short' }); 
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);

    let total = 0;

    subs.forEach(sub => {
       // Match by name
       if (sub.cardName !== cardName) return; 

       const subStartDate = new Date(sub.firstPaymentDate);
       const subEndDate = sub.status === 'Past' && sub.cancellationDate 
            ? new Date(sub.cancellationDate) 
            : new Date(9999, 11, 31); 

       if (new Date(subStartDate.getFullYear(), subStartDate.getMonth(), 1) > monthStart) return;
       if (subEndDate < monthStart) return;

       const price = convertCurrency(sub.price / (sub.sharedCount||1), sub.currency, baseCurrency);
       
       if (sub.billingCycle === BillingCycle.Monthly) {
          total += price;
       } else if (sub.billingCycle === BillingCycle.Yearly) {
          if (new Date(sub.firstPaymentDate).getMonth() === d.getMonth()) total += price;
       }
    });

    data.push({ name: monthKey, value: total });
  }
  return data;
};
