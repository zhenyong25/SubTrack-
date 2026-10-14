import { RetirementBalanceEntry, RetirementScheme } from '../types';

// Brand-ish colours for a whole EPF / CPF fund (the panel uses per-sub-account colours instead).
export const RETIREMENT_SCHEME_COLORS: Record<RetirementScheme, string> = {
  EPF: '#d4a838',
  CPF: '#e11d48',
};

export const dayOf = (isoDate: string) => isoDate.split('T')[0];

// Latest logged balance per sub-account on or before `asOf` (ISO yyyy-mm-dd; omit for "latest").
export const balancesAsOf = (fundEntries: RetirementBalanceEntry[], asOf?: string): Record<string, number> => {
  const result: Record<string, number> = {};
  const latestDate: Record<string, string> = {};
  fundEntries.forEach(entry => {
    const date = dayOf(entry.balanceDate);
    if (asOf && date > asOf) return;
    if (latestDate[entry.subAccount] === undefined || date >= latestDate[entry.subAccount]) {
      latestDate[entry.subAccount] = date;
      result[entry.subAccount] = entry.balance;
    }
  });
  return result;
};

export const sumBalances = (balances: Record<string, number>) => Object.keys(balances).reduce((sum, key) => sum + balances[key], 0);
