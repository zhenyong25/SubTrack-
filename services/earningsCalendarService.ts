import { weekDays, type EarningsEvent, type EarningsTime, type EarningsWeek } from '../server/earningsCalendar';

export type { EarningsEvent, EarningsTime, EarningsWeek };
export { weekDays };

export const EARNINGS_TIME_LABELS: Record<EarningsTime, string> = {
  bmo: 'Before open',
  amc: 'After close',
  unknown: 'Time not set',
};

// The week to show first: the current Monday-Friday, or the coming one at the weekend, when
// this week's reports are all out.
export const defaultWeekStart = (nyDay: string): string => {
  const weekday = new Date(`${nyDay}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6 ? shiftWeek(weekDays(nyDay)[0], 1) : weekDays(nyDay)[0];
};

export const shiftWeek = (weekStart: string, weeks: number): string => {
  const day = new Date(`${weekDays(weekStart)[0]}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + weeks * 7);
  return day.toISOString().slice(0, 10);
};

// Same-origin route (server/earningsCalendar.ts), which reads Nasdaq's calendar server-side.
export const fetchEarningsWeek = async (weekStart: string, signal?: AbortSignal): Promise<EarningsWeek> => {
  const response = await fetch(`/api/earnings-calendar?week=${encodeURIComponent(weekStart)}`, { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Earnings calendar lookup failed (${response.status}).`);
  // A server without this route answers with the app's index.html instead - restart `vite dev`
  // or redeploy the Worker after pulling it in.
  if (!data || !Array.isArray(data.events) || !Array.isArray(data.days)) {
    throw new Error('The earnings calendar service isn\'t available on this server yet - restart the dev server or redeploy.');
  }
  return { ...data, failedDays: Array.isArray(data.failedDays) ? data.failedDays : [] } as EarningsWeek;
};

export interface EarningsFilter {
  mine: Set<string> | null; // only these tickers, when set
  minMarketCap: number;
  query: string;
}

export const filterEarnings = (events: EarningsEvent[], filter: EarningsFilter): EarningsEvent[] => {
  const query = filter.query.trim().toUpperCase();
  return events.filter(event =>
    (!filter.mine || filter.mine.has(event.symbol))
    && (filter.minMarketCap <= 0 || (event.marketCap ?? 0) >= filter.minMarketCap)
    && (!query || event.symbol.startsWith(query) || event.name.toUpperCase().includes(query)));
};

// Day -> time slot -> events, biggest companies first.
export const groupEarnings = (events: EarningsEvent[], days: string[]) => {
  const groups = new Map(days.map(day => [day, { bmo: [] as EarningsEvent[], amc: [] as EarningsEvent[], unknown: [] as EarningsEvent[] }]));
  events.forEach(event => groups.get(event.date)?.[event.time].push(event));
  groups.forEach(slots => Object.values(slots).forEach(list => list.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))));
  return groups;
};

export const formatMarketCap = (value: number | null) => {
  if (value === null) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
};

export const formatEps = (value: number | null) => (value === null ? '—' : `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}`);

export type EarningsResult = 'beat' | 'miss' | 'inline' | 'pending';

export const earningsResult = (event: EarningsEvent): EarningsResult => {
  if (event.eps === null) return 'pending';
  if (event.epsEstimate === null) return 'inline';
  const gap = event.eps - event.epsEstimate;
  return Math.abs(gap) < 0.005 ? 'inline' : gap > 0 ? 'beat' : 'miss';
};
