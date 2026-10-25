import type { PokerCashSession, PokerMttBankrollEventType, PokerMttBankrollTransaction, PokerMttTournament } from '../types';

// Poker bankroll maths. All amounts are USD, as logged. A tournament's buyInUsd is the total for
// every entry (re-entries included); cashoutUsd is the end reward and bountyUsd any knockouts won.

export const tournamentWinnings = (t: PokerMttTournament) => Number(t.cashoutUsd || 0) + Number(t.bountyUsd || 0);
export const tournamentProfit = (t: PokerMttTournament) => tournamentWinnings(t) - Number(t.buyInUsd || 0);
// In the money = the tournament paid an end reward. Bounties alone don't count.
export const isInTheMoney = (t: PokerMttTournament) => Number(t.cashoutUsd || 0) > 0;
export const buyInPerEntry = (t: PokerMttTournament) => (t.entries > 0 ? Number(t.buyInUsd || 0) / t.entries : Number(t.buyInUsd || 0));
export const sessionProfit = (s: PokerCashSession) => Number(s.cashOutUsd || 0) - Number(s.buyInUsd || 0);

const dayOf = (value: string) => value.slice(0, 10);

// ---------------------------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------------------------

export type PokerRange = 'all' | 'ytd' | '90d' | '30d';
export const RANGE_LABELS: Record<PokerRange, string> = { all: 'All time', ytd: 'This year', '90d': 'Last 90 days', '30d': 'Last 30 days' };

// The first day (YYYY-MM-DD) a range covers, or undefined for all time.
export const rangeStart = (range: PokerRange, today: string): string | undefined => {
  if (range === 'all') return undefined;
  if (range === 'ytd') return `${today.slice(0, 4)}-01-01`;
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (range === '90d' ? 89 : 29));
  return date.toISOString().slice(0, 10);
};

export const inRange = (date: string, range: PokerRange, today: string) => {
  const start = rangeStart(range, today);
  const day = dayOf(date);
  return (!start || day >= start) && day <= today;
};

// ---------------------------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------------------------

export interface TournamentStats {
  count: number;
  entries: number;
  buyIns: number;
  cashouts: number;
  bounties: number;
  winnings: number;
  profit: number;
  roi?: number; // profit / buy-ins
  itm: number;
  itmRate?: number;
  largestWin: number;
  averageBuyIn?: number; // per entry
  highestBuyIn?: number;
  lowestBuyIn?: number;
  bountyEvents: number;
}

export const tournamentStats = (tournaments: PokerMttTournament[]): TournamentStats => {
  const perEntry = tournaments.filter(t => t.entries > 0).map(buyInPerEntry);
  const entries = tournaments.reduce((sum, t) => sum + (Number(t.entries) || 0), 0);
  const buyIns = tournaments.reduce((sum, t) => sum + Number(t.buyInUsd || 0), 0);
  const cashouts = tournaments.reduce((sum, t) => sum + Number(t.cashoutUsd || 0), 0);
  const bounties = tournaments.reduce((sum, t) => sum + Number(t.bountyUsd || 0), 0);
  const itm = tournaments.filter(isInTheMoney).length;
  return {
    count: tournaments.length,
    entries,
    buyIns,
    cashouts,
    bounties,
    winnings: cashouts + bounties,
    profit: cashouts + bounties - buyIns,
    roi: buyIns > 0 ? (cashouts + bounties - buyIns) / buyIns : undefined,
    itm,
    itmRate: tournaments.length ? itm / tournaments.length : undefined,
    largestWin: tournaments.reduce((max, t) => Math.max(max, tournamentWinnings(t)), 0),
    averageBuyIn: entries > 0 ? buyIns / entries : undefined,
    highestBuyIn: perEntry.length ? Math.max(...perEntry) : undefined,
    lowestBuyIn: perEntry.length ? Math.min(...perEntry) : undefined,
    bountyEvents: tournaments.filter(t => t.isBounty || Number(t.bountyUsd || 0) > 0).length,
  };
};

// ---------------------------------------------------------------------------------------------
// Cash games
// ---------------------------------------------------------------------------------------------

export interface CashStats {
  sessions: number;
  buyIns: number;
  cashOuts: number;
  profit: number;
  winningSessions: number;
  winRate?: number;
  biggestWin: number;
  biggestLoss: number;
  averageResult?: number;
  hours: number;
  hourly?: number; // profit per hour, over sessions with a duration
}

export const cashStats = (sessions: PokerCashSession[]): CashStats => {
  const results = sessions.map(sessionProfit);
  const timed = sessions.filter(s => Number(s.durationHours) > 0);
  const hours = timed.reduce((sum, s) => sum + Number(s.durationHours), 0);
  const timedProfit = timed.reduce((sum, s) => sum + sessionProfit(s), 0);
  const profit = results.reduce((sum, r) => sum + r, 0);
  const winning = results.filter(r => r > 0).length;
  return {
    sessions: sessions.length,
    buyIns: sessions.reduce((sum, s) => sum + Number(s.buyInUsd || 0), 0),
    cashOuts: sessions.reduce((sum, s) => sum + Number(s.cashOutUsd || 0), 0),
    profit,
    winningSessions: winning,
    winRate: sessions.length ? winning / sessions.length : undefined,
    biggestWin: results.length ? Math.max(0, ...results) : 0,
    biggestLoss: results.length ? Math.min(0, ...results) : 0,
    averageResult: sessions.length ? profit / sessions.length : undefined,
    hours,
    hourly: hours > 0 ? timedProfit / hours : undefined,
  };
};

// ---------------------------------------------------------------------------------------------
// Bankroll
// ---------------------------------------------------------------------------------------------

export interface BankrollStats {
  deposits: number;
  withdrawals: number;
  adjustments: number; // corrections, rakeback, bonuses - counted as results
  netDeposits: number;
  tournamentProfit: number;
  cashProfit: number;
  totalProfit: number;
  bankroll: number;
  returnOnDeposits?: number; // total profit / money deposited
}

export const bankrollStats = (events: PokerMttBankrollTransaction[], tournaments: PokerMttTournament[], sessions: PokerCashSession[]): BankrollStats => {
  const sum = (type: PokerMttBankrollTransaction['eventType']) => events.filter(e => e.eventType === type).reduce((total, e) => total + Number(e.amountUsd || 0), 0);
  const deposits = sum('Deposit');
  const withdrawals = sum('Withdrawal');
  const adjustments = sum('Adjustment');
  const mttProfit = tournaments.reduce((total, t) => total + tournamentProfit(t), 0);
  const cashProfit = sessions.reduce((total, s) => total + sessionProfit(s), 0);
  const totalProfit = mttProfit + cashProfit + adjustments;
  const netDeposits = deposits - withdrawals;
  return {
    deposits,
    withdrawals,
    adjustments,
    netDeposits,
    tournamentProfit: mttProfit,
    cashProfit,
    totalProfit,
    bankroll: netDeposits + totalProfit,
    returnOnDeposits: deposits > 0 ? totalProfit / deposits : undefined,
  };
};

// ---------------------------------------------------------------------------------------------
// Deposits sent in another currency (e.g. SGD bank transfers into a USD poker account)
// ---------------------------------------------------------------------------------------------

// The non-USD currency most deposits and withdrawals were sent in, if any.
export const homeCurrency = (events: PokerMttBankrollTransaction[]): string | undefined => {
  const counts = new Map<string, number>();
  events.forEach(e => {
    if (e.eventType !== 'Adjustment' && e.currency && e.currency !== 'USD') counts.set(e.currency, (counts.get(e.currency) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

// An event's amount in `currency`: what was actually sent when it was sent in that currency,
// otherwise its USD value at `rate` (units of `currency` per USD).
export const amountIn = (e: PokerMttBankrollTransaction, currency: string, rate: number) =>
  e.currency === currency && e.amount != null ? Number(e.amount) : Number(e.amountUsd || 0) * rate;

export interface HomeCurrencyStats {
  currency: string;
  deposited: number;
  withdrawn: number;
  valueNow: number; // today's bankroll, converted at today's rate
  profit: number; // value now + withdrawn - deposited: results and exchange-rate moves together
  returnOnDeposits?: number;
}

export const homeCurrencyStats = (events: PokerMttBankrollTransaction[], bankrollUsd: number, currency: string, rate: number): HomeCurrencyStats => {
  const sum = (type: PokerMttBankrollEventType) => events.filter(e => e.eventType === type).reduce((total, e) => total + amountIn(e, currency, rate), 0);
  const deposited = sum('Deposit');
  const withdrawn = sum('Withdrawal');
  const valueNow = bankrollUsd * rate;
  const profit = valueNow + withdrawn - deposited;
  return { currency, deposited, withdrawn, valueNow, profit, returnOnDeposits: deposited > 0 ? profit / deposited : undefined };
};

// ---------------------------------------------------------------------------------------------
// Grouping by week / month / year
// ---------------------------------------------------------------------------------------------

export type PokerPeriod = 'week' | 'month' | 'year';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Weeks start on Monday and are keyed by that Monday's date.
export const periodKey = (date: string, period: PokerPeriod) => {
  const day = dayOf(date);
  if (period === 'year') return day.slice(0, 4);
  if (period === 'month') return day.slice(0, 7);
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export const periodLabel = (key: string, period: PokerPeriod) => {
  if (period === 'year') return key;
  if (period === 'month') return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  return `Week of ${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
};

export interface PeriodRow {
  key: string;
  label: string;
  deposits: number;
  withdrawals: number;
  tournamentProfit: number;
  cashProfit: number;
  adjustments: number;
  profit: number; // tournaments + cash + adjustments
  tournaments: number;
  itm: number;
  sessions: number;
  depositsHome: number; // deposits in the home currency, when one is given
  withdrawalsHome: number;
}

// One row per period that had any activity, newest first.
export const groupByPeriod = (events: PokerMttBankrollTransaction[], tournaments: PokerMttTournament[], sessions: PokerCashSession[], period: PokerPeriod, home?: { currency: string; rate: number }): PeriodRow[] => {
  const rows = new Map<string, PeriodRow>();
  const row = (date: string) => {
    const key = periodKey(date, period);
    if (!rows.has(key)) rows.set(key, { key, label: periodLabel(key, period), deposits: 0, withdrawals: 0, tournamentProfit: 0, cashProfit: 0, adjustments: 0, profit: 0, tournaments: 0, itm: 0, sessions: 0, depositsHome: 0, withdrawalsHome: 0 });
    return rows.get(key)!;
  };
  events.forEach(e => {
    const r = row(e.eventDate);
    if (e.eventType === 'Deposit') {
      r.deposits += Number(e.amountUsd || 0);
      if (home) r.depositsHome += amountIn(e, home.currency, home.rate);
    } else if (e.eventType === 'Withdrawal') {
      r.withdrawals += Number(e.amountUsd || 0);
      if (home) r.withdrawalsHome += amountIn(e, home.currency, home.rate);
    }
    else { r.adjustments += Number(e.amountUsd || 0); r.profit += Number(e.amountUsd || 0); }
  });
  tournaments.forEach(t => {
    const r = row(t.tournamentDate);
    r.tournaments += 1;
    if (isInTheMoney(t)) r.itm += 1;
    r.tournamentProfit += tournamentProfit(t);
    r.profit += tournamentProfit(t);
  });
  sessions.forEach(s => {
    const r = row(s.sessionDate);
    r.sessions += 1;
    r.cashProfit += sessionProfit(s);
    r.profit += sessionProfit(s);
  });
  return [...rows.values()].sort((a, b) => b.key.localeCompare(a.key));
};

// ---------------------------------------------------------------------------------------------
// Results over time
// ---------------------------------------------------------------------------------------------

export interface ProfitPoint { date: string; tournaments: number; cash: number; total: number }

// Cumulative profit after each day with a result, oldest first.
export const profitSeries = (tournaments: PokerMttTournament[], sessions: PokerCashSession[]): ProfitPoint[] => {
  const byDay = new Map<string, { tournaments: number; cash: number }>();
  const add = (date: string, key: 'tournaments' | 'cash', value: number) => {
    const day = dayOf(date);
    const entry = byDay.get(day) || { tournaments: 0, cash: 0 };
    entry[key] += value;
    byDay.set(day, entry);
  };
  tournaments.forEach(t => add(t.tournamentDate, 'tournaments', tournamentProfit(t)));
  sessions.forEach(s => add(s.sessionDate, 'cash', sessionProfit(s)));
  let mtt = 0; let cash = 0;
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => {
    mtt += day.tournaments;
    cash += day.cash;
    return { date, tournaments: mtt, cash, total: mtt + cash };
  });
};
