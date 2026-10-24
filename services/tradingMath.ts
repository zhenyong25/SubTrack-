import type { StockCandle } from './stockQuoteService';

// Trading analysis, adapted from the day-trader-skill rules (github.com/Jakeschincariol/day-trader-skill):
// long-only plans, stops set before entry, size set by the stop, flat by the close. Everything
// here is pure so it can be tested; prices come from the app's Yahoo proxy.

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

export interface TradeRules {
  currency: string;
  budget: number; // money set aside for trading: only what you can afford to lose
  cashBufferPct: number; // share of the budget always kept in cash
  maxLossPerTrade: number; // most one trade may lose if the stop fills at the stop
  maxPositionPct: number; // largest position as a share of the budget
  maxOrder: number;
  minOrder: number;
  maxDailyLoss: number;
  maxTradesPerDay: number;
  minRewardRisk: number;
  requireStop: boolean;
  noEntriesBefore: string; // HH:MM, New York time
  noEntriesAfter: string;
  flatBy: string;
  blocked: string[];
  pdtGuard: boolean; // block a 4th day trade in 5 business days (US pattern-day-trader rule)
  watchlist: string[];
}

// The repo's example config: a $5,000 paper budget risking $50 a trade.
export const DEFAULT_RULES: TradeRules = {
  currency: 'USD',
  budget: 5000,
  cashBufferPct: 10,
  maxLossPerTrade: 50,
  maxPositionPct: 75,
  maxOrder: 4000,
  minOrder: 5,
  maxDailyLoss: 150,
  maxTradesPerDay: 3,
  minRewardRisk: 1,
  requireStop: true,
  noEntriesBefore: '09:45',
  noEntriesAfter: '15:30',
  flatBy: '15:55',
  blocked: [],
  pdtGuard: false,
  watchlist: [],
};

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// ---------------------------------------------------------------------------------------------
// New York sessions
// ---------------------------------------------------------------------------------------------

const NY_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// A timestamp's New York calendar day and minute of the day.
export const nyTime = (timestamp: number) => {
  const parts = Object.fromEntries(NY_PARTS.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
};

export const OPEN_MINUTE = 9 * 60 + 30;
const CLOSE_MINUTE = 16 * 60;
export const BARS_PER_SESSION = (CLOSE_MINUTE - OPEN_MINUTE) / 5; // 78 five-minute bars

export interface Session {
  day: string;
  bars: StockCandle[]; // regular-hours 5-minute bars, index 0 starts 9:30
}

// Groups 5-minute bars into regular-hours sessions (pre/post market dropped). A session is full
// when all 78 bars are present - half days and sessions with gaps aren't.
export const toSessions = (candles: StockCandle[]): Session[] => {
  const byDay = new Map<string, StockCandle[]>();
  candles.forEach(candle => {
    const { day, minute } = nyTime(candle.timestamp);
    if (minute < OPEN_MINUTE || minute >= CLOSE_MINUTE) return;
    const list = byDay.get(day) || [];
    list.push(candle);
    byDay.set(day, list);
  });
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, bars]) => ({ day, bars: bars.sort((a, b) => a.timestamp - b.timestamp) }));
};

export const isFullSession = (session: Session) =>
  session.bars.length === BARS_PER_SESSION
  && session.bars.every((bar, index) => nyTime(bar.timestamp).minute === OPEN_MINUTE + index * 5);

// Index of the 5-minute bar that starts at a New York minute of the day.
export const barIndexAt = (minute: number) => Math.floor((minute - OPEN_MINUTE) / 5);

// ---------------------------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------------------------

export const sma = (values: number[], length: number): number | undefined =>
  values.length >= length ? values.slice(-length).reduce((sum, v) => sum + v, 0) / length : undefined;

// Wilder's RSI over closes; undefined until there are `length` changes.
export const rsi = (closes: number[], length = 14): number[] => {
  const out: number[] = [];
  if (closes.length <= length) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= length; i += 1) {
    const change = closes[i] - closes[i - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  gain /= length;
  loss /= length;
  const value = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[length] = value();
  for (let i = length + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    gain = (gain * (length - 1) + Math.max(change, 0)) / length;
    loss = (loss * (length - 1) + Math.max(-change, 0)) / length;
    out[i] = value();
  }
  return out;
};

// Average true range of the last `length` bars (all of them when there are fewer).
export const atr = (bars: StockCandle[], length = 14): { value: number; bars: number } | undefined => {
  if (bars.length === 0) return undefined;
  const ranges = bars.map((bar, i) => {
    const prev = i > 0 ? bars[i - 1].close : bar.open;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prev), Math.abs(bar.low - prev));
  });
  const used = ranges.slice(-length);
  return { value: used.reduce((sum, r) => sum + r, 0) / used.length, bars: used.length };
};

// ---------------------------------------------------------------------------------------------
// Setups
// ---------------------------------------------------------------------------------------------

export type DailySetup = 'breakout_20d' | 'bull_flag' | 'reclaim_ma20' | 'oversold' | 'oversold_bounce';

export const SETUP_LABELS: Record<DailySetup | 'orb', string> = {
  breakout_20d: '20-day breakout',
  bull_flag: 'Bull flag',
  reclaim_ma20: 'Reclaimed 20-day average',
  oversold: 'Oversold (RSI < 30)',
  oversold_bounce: 'Oversold bounce',
  orb: 'Opening-range breakout',
};

// The repo's daily rules, on closes only.
export const dailySetups = (closes: number[]): { setups: DailySetup[]; rsi?: number; ma20?: number } => {
  const setups: DailySetup[] = [];
  const n = closes.length;
  const last = closes[n - 1];
  if (n >= 21 && closes.slice(n - 21, n - 1).every(close => last > close)) setups.push('breakout_20d');
  // Up more than 10% across the 10 sessions before the last 5 (from the close before them).
  if (n >= 16) {
    const runUp = closes[n - 6] / closes[n - 16] - 1;
    const flag = closes.slice(n - 5);
    const flagRange = Math.max(...flag) / Math.min(...flag) - 1;
    if (runUp > 0.10 && flagRange <= 0.05) setups.push('bull_flag');
  }
  const ma20 = sma(closes, 20);
  const prevMa20 = sma(closes.slice(0, -1), 20);
  if (ma20 !== undefined && prevMa20 !== undefined && closes[n - 2] < prevMa20 && last > ma20) setups.push('reclaim_ma20');
  const rsiValues = rsi(closes);
  const rsiNow = rsiValues[n - 1];
  const rsiPrev = rsiValues[n - 2];
  if (rsiNow !== undefined && rsiNow < 30) setups.push('oversold');
  if (rsiPrev !== undefined && rsiPrev < 30 && last > closes[n - 2]) setups.push('oversold_bounce');
  return { setups, rsi: rsiNow, ma20 };
};

export interface OpeningRange { high: number; low: number; mid: number }

// The first 15 minutes (the 9:30, 9:35 and 9:40 bars).
export const openingRange = (session: Session): OpeningRange | undefined => {
  const first = session.bars.slice(0, 3);
  if (first.length < 3 || nyTime(first[2].timestamp).minute !== OPEN_MINUTE + 10) return undefined;
  const high = Math.max(...first.map(bar => bar.high));
  const low = Math.min(...first.map(bar => bar.low));
  return { high, low, mid: (high + low) / 2 };
};

export type OrbState =
  | { status: 'forming' }
  | { status: 'waiting'; range: OpeningRange }
  | { status: 'triggered'; range: OpeningRange; barIndex: number; price: number; minute: number }
  | { status: 'expired'; range: OpeningRange };

// The first completed bar after the range to close above the range high, before the last entry time.
export const orbState = (session: Session, lastEntryMinute: number, completedBars = session.bars.length): OrbState => {
  const range = openingRange(session);
  if (!range || completedBars < 3) return { status: 'forming' };
  for (let i = 3; i < completedBars; i += 1) {
    const bar = session.bars[i];
    const closeMinute = nyTime(bar.timestamp).minute + 5;
    if (closeMinute > lastEntryMinute) return { status: 'expired', range };
    if (bar.close > range.high) return { status: 'triggered', range, barIndex: i, price: bar.close, minute: closeMinute };
  }
  const lastClose = completedBars > 0 ? nyTime(session.bars[completedBars - 1].timestamp).minute + 5 : 0;
  return lastClose >= lastEntryMinute ? { status: 'expired', range } : { status: 'waiting', range };
};

// ---------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------

export type StopMethod = 'price' | 'pct' | 'atr' | 'or-mid' | 'or-low';

const roundDown = (value: number) => Math.floor(value * 100 + 1e-9) / 100;
const roundHalfUp = (value: number) => Math.round(value * 100 + 1e-9) / 100;

// A long stop rounds away from the entry (down) to the cent.
export const stopPrice = (method: StopMethod, entry: number, opts: { price?: number; pct?: number; atr?: number; atrK?: number; range?: OpeningRange }): number | undefined => {
  switch (method) {
    case 'price': return opts.price;
    case 'pct': return opts.pct ? roundDown(entry * (1 - opts.pct / 100)) : undefined;
    case 'atr': return opts.atr ? roundDown(entry - (opts.atrK ?? 1) * opts.atr) : undefined;
    case 'or-mid': return opts.range ? roundDown(opts.range.mid) : undefined;
    case 'or-low': return opts.range ? roundDown(opts.range.low) : undefined;
  }
};

export const targetPrice = (entry: number, stop: number, rMultiple: number) => roundHalfUp(entry + rMultiple * (entry - stop));

export interface Sizing {
  shares: number;
  cost: number;
  lossAtStop: number;
  limitedBy: 'max loss' | 'position cap' | 'max order' | 'cash';
  limits: Record<Sizing['limitedBy'], number>;
}

// The stop sets the size: the smallest of four limits, in whole shares.
export const sizePosition = (rules: TradeRules, entry: number, stop: number, cashAvailable = rules.budget): Sizing | undefined => {
  const risk = entry - stop;
  if (!(entry > 0) || !(risk > 0)) return undefined;
  const limits = {
    'max loss': Math.floor(rules.maxLossPerTrade / risk + 1e-9),
    'position cap': Math.floor((rules.budget * rules.maxPositionPct / 100) / entry + 1e-9),
    'max order': Math.floor(rules.maxOrder / entry + 1e-9),
    cash: Math.floor(Math.min(rules.budget * (1 - rules.cashBufferPct / 100), cashAvailable) / entry + 1e-9),
  };
  const limitedBy = (Object.keys(limits) as Sizing['limitedBy'][]).reduce((a, b) => (limits[b] < limits[a] ? b : a));
  const shares = Math.max(0, limits[limitedBy]);
  return { shares, cost: roundHalfUp(shares * entry), lossAtStop: roundHalfUp(shares * risk), limitedBy, limits };
};

// ---------------------------------------------------------------------------------------------
// Risk check
// ---------------------------------------------------------------------------------------------

export interface PlanInput {
  symbol: string;
  entry: number;
  stop?: number;
  target?: number;
  shares: number;
  entryMinute?: number; // New York minute the entry would happen; checked against the window
}

export interface RiskCheck { name: string; pass: boolean; detail: string; fix?: string }

export interface DayUsage {
  trades: number; // entries already taken today
  committedLoss: number; // realized losses today plus open trades' loss at their stops
  dayTradesLast5: number; // round trips opened and closed the same day, last 5 business days
}

// PASS/BLOCK against the rules, as if this order filled.
export const checkRisk = (rules: TradeRules, plan: PlanInput, usage: DayUsage): { pass: boolean; checks: RiskCheck[] } => {
  const checks: RiskCheck[] = [];
  const add = (name: string, pass: boolean, detail: string, fix?: string) => checks.push({ name, pass, detail, fix: pass ? undefined : fix });
  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const risk = plan.stop !== undefined ? plan.entry - plan.stop : undefined;
  const cost = plan.shares * plan.entry;
  const loss = risk !== undefined ? plan.shares * risk : undefined;

  add('Ticker', !rules.blocked.map(s => s.toUpperCase()).includes(plan.symbol.toUpperCase()), rules.blocked.length ? `Blocked list: ${rules.blocked.join(', ')}` : 'No blocked tickers', 'Skip this ticker');
  add('Size', plan.shares > 0 && cost >= rules.minOrder && cost <= rules.maxOrder, `${plan.shares} shares · ${fmt(cost)} (allowed ${fmt(rules.minOrder)}–${fmt(rules.maxOrder)})`, 'Change the share count');
  add('Position', cost <= rules.budget * rules.maxPositionPct / 100 + 1e-9, `${((cost / rules.budget) * 100).toFixed(1)}% of budget (max ${rules.maxPositionPct}%)`, 'Buy fewer shares');
  add('Cash', cost <= rules.budget * (1 - rules.cashBufferPct / 100) + 1e-9, `Keeps ${rules.cashBufferPct}% of the budget in cash`, 'Buy fewer shares');
  const stopOk = plan.stop !== undefined && plan.stop < plan.entry;
  add('Stop', rules.requireStop ? stopOk : plan.stop === undefined || stopOk, plan.stop === undefined ? 'No stop' : stopOk ? `Stop ${fmt(plan.stop)} below entry` : 'Stop must be below the entry', 'Set a stop below the entry');
  if (loss !== undefined && stopOk) {
    add('Loss', loss <= rules.maxLossPerTrade + 1e-9, `Loss at stop ${fmt(loss)} (max ${fmt(rules.maxLossPerTrade)})`, 'Fewer shares or a closer stop - never a wider max loss');
  }
  if (plan.target !== undefined && risk && risk > 0) {
    const rr = (plan.target - plan.entry) / risk;
    add('Reward:risk', rr >= rules.minRewardRisk - 1e-9, `${rr.toFixed(2)} : 1 (min ${rules.minRewardRisk})`, 'Raise the target or skip the trade');
  }
  const dayLoss = usage.committedLoss + (loss ?? 0);
  add('Daily loss', dayLoss <= rules.maxDailyLoss + 1e-9, `Today at risk ${fmt(dayLoss)} (limit ${fmt(rules.maxDailyLoss)})`, 'Stop for today');
  add('Trades', usage.trades < rules.maxTradesPerDay, `${usage.trades} of ${rules.maxTradesPerDay} trades taken today`, 'Done for today');
  if (plan.entryMinute !== undefined) {
    const inWindow = plan.entryMinute >= minutesOf(rules.noEntriesBefore) && plan.entryMinute <= minutesOf(rules.noEntriesAfter);
    const hhmm = `${String(Math.floor(plan.entryMinute / 60)).padStart(2, '0')}:${String(plan.entryMinute % 60).padStart(2, '0')}`;
    add('Window', inWindow, `Entry ${hhmm} ET (allowed ${rules.noEntriesBefore}–${rules.noEntriesAfter})`, 'Wait for the entry window');
  }
  if (rules.pdtGuard) add('PDT', usage.dayTradesLast5 < 3, `${usage.dayTradesLast5} day trades in the last 5 business days`, 'Hold overnight or wait - a 4th day trade flags the account');
  return { pass: checks.every(check => check.pass), checks };
};

// ---------------------------------------------------------------------------------------------
// Time Machine
// ---------------------------------------------------------------------------------------------

// Small seeded generator (mulberry32) so a run can be repeated exactly.
export const seededRandom = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type Outcome = 'target' | 'stop' | 'neither';

export interface SimulationPlan {
  entry: number;
  stop: number;
  target: number;
  entryBar: number; // index of the bar whose close is the entry
  untilBar: number; // last bar index that can trade (the bar closing at the flat-by time)
}

export interface SimulationResult {
  runs: number;
  seed: number;
  odds: Record<Outcome, number>;
  green: number;
  averageR: number;
  close: { median: number; p5: number; p95: number };
  bands: Array<{ bar: number; p5: number; p25: number; p50: number; p75: number; p95: number }>;
  hitSideTargetShare?: number; // among replays that hit a side, the share that hit the target first
}

const percentile = (sorted: Float64Array | number[], p: number) => {
  if (sorted.length === 0) return NaN;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
};

// Replays the rest of the day `runs` times from the entry, each bar drawn from a past full session
// at the same time of day (±2 bars) and scaled by its moves relative to its previous close. The
// stop is checked before the target, so a bar touching both counts as a stop.
export const simulate = (pool: Session[], plan: SimulationPlan, runs = 10000, seed = 19): SimulationResult => {
  const random = seededRandom(seed);
  const risk = plan.entry - plan.stop;
  const steps = Math.max(0, plan.untilBar - plan.entryBar);
  const counts: Record<Outcome, number> = { target: 0, stop: 0, neither: 0 };
  let green = 0;
  let totalR = 0;
  const finals = new Float64Array(runs);
  const paths = new Float64Array(runs * (steps + 1));

  for (let run = 0; run < runs; run += 1) {
    let price = plan.entry;
    let outcome: Outcome = 'neither';
    paths[run * (steps + 1)] = price;
    for (let step = 1; step <= steps; step += 1) {
      const barIndex = plan.entryBar + step;
      const session = pool[Math.floor(random() * pool.length)];
      const j = Math.min(BARS_PER_SESSION - 1, Math.max(1, barIndex + Math.floor(random() * 5) - 2));
      const bar = session.bars[j];
      const base = session.bars[j - 1].close;
      const high = price * (bar.high / base);
      const low = price * (bar.low / base);
      const close = price * (bar.close / base);
      if (outcome === 'neither') {
        if (low <= plan.stop) outcome = 'stop';
        else if (high >= plan.target) outcome = 'target';
      }
      price = outcome === 'neither' ? close : price;
      paths[run * (steps + 1) + step] = outcome === 'stop' ? plan.stop : outcome === 'target' ? plan.target : close;
      if (outcome !== 'neither') {
        for (let rest = step + 1; rest <= steps; rest += 1) paths[run * (steps + 1) + rest] = paths[run * (steps + 1) + step];
        break;
      }
    }
    counts[outcome] += 1;
    const r = outcome === 'stop' ? -1 : outcome === 'target' ? (plan.target - plan.entry) / risk : (price - plan.entry) / risk;
    totalR += r;
    if (outcome === 'target' || (outcome === 'neither' && price > plan.entry)) green += 1;
    finals[run] = outcome === 'stop' ? plan.stop : outcome === 'target' ? plan.target : price;
  }

  finals.sort();
  const bands: SimulationResult['bands'] = [];
  const column = new Float64Array(runs);
  for (let step = 0; step <= steps; step += 1) {
    for (let run = 0; run < runs; run += 1) column[run] = paths[run * (steps + 1) + step];
    column.sort();
    bands.push({ bar: plan.entryBar + step, p5: percentile(column, 0.05), p25: percentile(column, 0.25), p50: percentile(column, 0.5), p75: percentile(column, 0.75), p95: percentile(column, 0.95) });
  }
  const sided = counts.target + counts.stop;
  return {
    runs,
    seed,
    odds: { target: counts.target / runs, stop: counts.stop / runs, neither: counts.neither / runs },
    green: green / runs,
    averageR: totalR / runs,
    close: { median: percentile(finals, 0.5), p5: percentile(finals, 0.05), p95: percentile(finals, 0.95) },
    bands,
    hitSideTargetShare: sided > 0 ? counts.target / sided : undefined,
  };
};

export interface HistoryResult { fires: number; target: number; stop: number; neither: number; averageR: number }

// The plan's own rule run on each past session: an opening-range breakout entry, the stop
// method, the R target, out at the flat-by bar. What actually happened, not a simulation.
export const replayHistory = (pool: Session[], rule: { stopMethod: StopMethod; pct?: number; atrK?: number; rMultiple: number; lastEntryMinute: number; untilBar: number }): HistoryResult | undefined => {
  if (rule.stopMethod === 'price') return undefined;
  let fires = 0; let target = 0; let stop = 0; let neither = 0; let totalR = 0;
  pool.forEach(session => {
    const state = orbState(session, rule.lastEntryMinute);
    if (state.status !== 'triggered') return;
    const entry = state.price;
    const sessionAtr = atr(session.bars.slice(0, state.barIndex + 1))?.value;
    const stopLevel = stopPrice(rule.stopMethod, entry, { pct: rule.pct, atr: sessionAtr, atrK: rule.atrK, range: state.range });
    if (stopLevel === undefined || !(stopLevel < entry)) return;
    const goal = targetPrice(entry, stopLevel, rule.rMultiple);
    fires += 1;
    let outcome: Outcome = 'neither';
    let last = entry;
    for (let i = state.barIndex + 1; i <= Math.min(rule.untilBar, session.bars.length - 1); i += 1) {
      const bar = session.bars[i];
      if (bar.low <= stopLevel) { outcome = 'stop'; break; }
      if (bar.high >= goal) { outcome = 'target'; break; }
      last = bar.close;
    }
    if (outcome === 'stop') { stop += 1; totalR -= 1; }
    else if (outcome === 'target') { target += 1; totalR += rule.rMultiple; }
    else { neither += 1; totalR += (last - entry) / (entry - stopLevel); }
  });
  return { fires, target, stop, neither, averageR: fires > 0 ? totalR / fires : 0 };
};

// The repo's verdict: compare the target-first share (among replays that hit a side) with the
// break-even rate 1 / (1 + R).
export const verdict = (result: SimulationResult, rMultiple: number): string => {
  if (result.hitSideTargetShare === undefined) return 'No replay reached the stop or the target.';
  const breakEven = 1 / (1 + rMultiple);
  const gap = (result.hitSideTargetShare - breakEven) * 100;
  const side = gap >= 0 ? 'target' : 'stop';
  if (Math.abs(gap) < 5) return rMultiple === 1 ? 'Close to a coin flip' : 'Close to break-even';
  return `${Math.abs(gap) < 15 ? 'Leans toward' : 'Strongly toward'} the ${side}`;
};

// ---------------------------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------------------------

export const MISTAKES = ['Chased the entry', 'Moved the stop', 'Exited early', 'Oversized', 'Revenge trade', 'No stop', 'Outside the window', 'Ignored the plan'] as const;

export interface JournalTrade {
  id: string;
  tradeDate: string; // YYYY-MM-DD, New York date of the entry
  symbol: string;
  setup: string;
  entry: number;
  stop: number;
  target?: number;
  shares: number;
  currency?: string; // of the prices; absent = the rules currency
  exitPrice?: number;
  exitDate?: string;
  fees: number;
  followedPlan: boolean;
  mistakes: string[];
  notes?: string;
  createdAt?: string;
}

export const tradeRisk = (trade: JournalTrade) => Math.max(0, (trade.entry - trade.stop) * trade.shares);
export const isClosed = (trade: JournalTrade) => trade.exitPrice !== undefined && Number.isFinite(trade.exitPrice);
export const tradePnl = (trade: JournalTrade) => (isClosed(trade) ? (trade.exitPrice! - trade.entry) * trade.shares - trade.fees : undefined);
export const tradeR = (trade: JournalTrade) => {
  const pnl = tradePnl(trade);
  const risk = tradeRisk(trade);
  return pnl !== undefined && risk > 0 ? pnl / risk : undefined;
};

export interface Bucket { label: string; trades: number; winRate: number; averageR: number }

export interface JournalStats {
  closed: number;
  open: number;
  wins: number;
  winRate: number;
  averageWinR: number;
  averageLossR: number;
  expectancy: number; // average R per trade
  profitFactor?: number;
  totalPnl: number;
  maxDrawdownR: number;
  longestLosingStreak: number;
  equity: Array<{ date: string; r: number }>; // cumulative R after each closed trade
  followed: Bucket;
  broke: Bucket;
  bySetup: Bucket[];
  byMistake: Bucket[];
}

const bucket = (label: string, rs: number[]): Bucket => ({
  label,
  trades: rs.length,
  winRate: rs.length ? rs.filter(r => r > 0).length / rs.length : 0,
  averageR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : 0,
});

// P&L is converted with `toBase` (trade amount and currency to the rules currency) when given;
// everything measured in R is currency-free.
export const journalStats = (trades: JournalTrade[], toBase: (amount: number, currency?: string) => number = amount => amount): JournalStats => {
  const closed = trades
    .filter(trade => isClosed(trade) && tradeR(trade) !== undefined)
    .sort((a, b) => (a.exitDate || a.tradeDate).localeCompare(b.exitDate || b.tradeDate) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const rs = closed.map(trade => tradeR(trade)!);
  const pnls = closed.map(trade => toBase(tradePnl(trade)!, trade.currency));
  const wins = rs.filter(r => r > 0);
  const losses = rs.filter(r => r <= 0);
  const grossWin = pnls.filter(p => p > 0).reduce((s, p) => s + p, 0);
  const grossLoss = -pnls.filter(p => p < 0).reduce((s, p) => s + p, 0);

  let cumulative = 0; let peak = 0; let maxDrawdown = 0; let streak = 0; let longest = 0;
  const equity = closed.map((trade, index) => {
    cumulative += rs[index];
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    streak = rs[index] <= 0 ? streak + 1 : 0;
    longest = Math.max(longest, streak);
    return { date: trade.exitDate || trade.tradeDate, r: cumulative };
  });

  const group = (keyOf: (trade: JournalTrade) => string[]) => {
    const map = new Map<string, number[]>();
    closed.forEach((trade, index) => keyOf(trade).forEach(key => map.set(key, [...(map.get(key) || []), rs[index]])));
    return [...map.entries()].map(([label, values]) => bucket(label, values)).sort((a, b) => b.trades - a.trades);
  };

  return {
    closed: closed.length,
    open: trades.filter(trade => !isClosed(trade)).length,
    wins: wins.length,
    winRate: rs.length ? wins.length / rs.length : 0,
    averageWinR: wins.length ? wins.reduce((s, r) => s + r, 0) / wins.length : 0,
    averageLossR: losses.length ? losses.reduce((s, r) => s + r, 0) / losses.length : 0,
    expectancy: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : undefined,
    totalPnl: pnls.reduce((s, p) => s + p, 0),
    maxDrawdownR: maxDrawdown,
    longestLosingStreak: longest,
    equity,
    followed: bucket('Followed the plan', closed.flatMap((t, i) => (t.followedPlan ? [rs[i]] : []))),
    broke: bucket('Broke the plan', closed.flatMap((t, i) => (t.followedPlan ? [] : [rs[i]]))),
    bySetup: group(trade => [trade.setup || 'Other']),
    byMistake: group(trade => trade.mistakes),
  };
};

// What today's journal already uses up: entries taken, losses booked or still at risk at their
// stops, and same-day round trips in the last five business days (for the PDT guard).
export const dayUsage = (trades: JournalTrade[], today: string): DayUsage => {
  const todays = trades.filter(trade => trade.tradeDate === today);
  const committedLoss = todays.reduce((sum, trade) => {
    const pnl = tradePnl(trade);
    if (pnl !== undefined) return sum + Math.max(0, -pnl);
    return sum + tradeRisk(trade);
  }, 0);
  const days: string[] = [];
  const cursor = new Date(`${today}T12:00:00Z`);
  while (days.length < 5) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  const dayTradesLast5 = trades.filter(trade => isClosed(trade) && trade.exitDate === trade.tradeDate && days.includes(trade.tradeDate)).length;
  return { trades: todays.length, committedLoss, dayTradesLast5 };
};
