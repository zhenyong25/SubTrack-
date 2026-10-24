import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FlaskConical, Loader2, NotebookPen, Search, XCircle } from 'lucide-react';
import { fetchStockIntradayHistory, normalizeTickerSymbol, type StockIntradayHistory } from '../services/stockQuoteService';
import {
  BARS_PER_SESSION,
  OPEN_MINUTE,
  SETUP_LABELS,
  atr,
  barIndexAt,
  checkRisk,
  dayUsage,
  isFullSession,
  minutesOf,
  orbState,
  replayHistory,
  simulate,
  sizePosition,
  stopPrice,
  targetPrice,
  toSessions,
  verdict,
  type HistoryResult,
  type JournalTrade,
  type SimulationResult,
  type StopMethod,
  type TradeRules,
} from '../services/tradingMath';
import { Field, INPUT_CLASS, Panel, Stat, hhmm, money, nyNow, pct, signedR, toneFor } from './tradeUi';

interface TradePlanPanelProps {
  rules: TradeRules;
  journal: JournalTrade[];
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  onLogTrade: (trade: JournalTrade) => void;
}

const STOP_METHODS: Array<{ id: StopMethod; label: string; needsRange?: boolean }> = [
  { id: 'or-mid', label: 'Opening-range midpoint', needsRange: true },
  { id: 'or-low', label: 'Opening-range low', needsRange: true },
  { id: 'atr', label: 'ATR × K below entry' },
  { id: 'pct', label: '% below entry' },
  { id: 'price', label: 'My price' },
];
const R_TARGETS = ['1', '1.5', '2', '3'];
const SIM_RUNS = 10000;
const MIN_POOL = 20;

const TradePlanPanel: React.FC<TradePlanPanelProps> = ({ rules, journal, symbol, onSymbolChange, onLogTrade }) => {
  const [symbolInput, setSymbolInput] = useState(symbol);
  const [history, setHistory] = useState<StockIntradayHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState('');
  const [entryTime, setEntryTime] = useState('10:00');
  const [stopMethod, setStopMethod] = useState<StopMethod>('or-mid');
  const [manualStop, setManualStop] = useState('');
  const [stopPct, setStopPct] = useState('1.5');
  const [atrK, setAtrK] = useState('1');
  const [rTarget, setRTarget] = useState('2');
  const [sharesInput, setSharesInput] = useState('');
  const [setup, setSetup] = useState<string>(SETUP_LABELS.orb);
  const [sim, setSim] = useState<{ result: SimulationResult; history?: HistoryResult; rMultiple: number } | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simError, setSimError] = useState('');
  const [logged, setLogged] = useState(false);

  const load = async (raw: string) => {
    const next = normalizeTickerSymbol(raw);
    if (!next) return;
    setLoading(true);
    setError('');
    setSim(null);
    setLogged(false);
    try {
      const data = await fetchStockIntradayHistory(next, '5m', undefined, '60d');
      setHistory(data);
      setSymbolInput(data.symbol || next);
      onSymbolChange(data.symbol || next);
    } catch (loadError) {
      setHistory(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load prices.');
    } finally {
      setLoading(false);
    }
  };

  // Load whatever symbol the scanner (or a previous visit) handed over.
  useEffect(() => {
    if (symbol && symbol !== history?.symbol) {
      setSymbolInput(symbol);
      void load(symbol);
    }
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = nyNow();
  const isUS = history?.exchangeTimezone === 'America/New_York';
  const sessions = useMemo(() => (history && isUS ? toSessions(history.candles) : []), [history, isUS]);
  const todaySession = sessions.find(session => session.day === now.day);
  const completedToday = todaySession ? todaySession.bars.filter(bar => bar.timestamp + 5 * 60 * 1000 <= Date.now()).length : 0;
  const orb = todaySession ? orbState(todaySession, minutesOf(rules.noEntriesAfter), completedToday) : undefined;
  const range = orb && orb.status !== 'forming' ? orb.range : undefined;
  const pool = useMemo(() => sessions.filter(session => session.day < now.day && isFullSession(session)), [sessions, now.day]);

  // Prefill the entry from the breakout trigger, or the latest price.
  useEffect(() => {
    if (!history) return;
    if (orb?.status === 'triggered') {
      setEntry(orb.price.toFixed(2));
      setEntryTime(hhmm(orb.minute));
      setSetup(SETUP_LABELS.orb);
    } else {
      const last = history.currentPrice ?? history.candles.at(-1)?.close;
      if (last) setEntry(last.toFixed(2));
      const inSession = now.minute >= OPEN_MINUTE + 15 && now.minute < minutesOf(rules.flatBy);
      setEntryTime(inSession ? hhmm(now.minute - (now.minute % 5)) : '10:00');
    }
    if (!isUS || !range) setStopMethod(current => (current === 'or-mid' || current === 'or-low' ? 'pct' : current));
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  const entryValue = Number(entry);
  const entryMinute = minutesOf(entryTime);
  // ATR from today's bars up to the entry, or the most recent session's when today has none.
  const atrBars = useMemo(() => {
    const source = todaySession ?? sessions.at(-1);
    if (!source) return [];
    const upTo = todaySession ? Math.max(1, barIndexAt(entryMinute)) : source.bars.length;
    return source.bars.slice(0, upTo);
  }, [todaySession, sessions, entryMinute]);
  const atrValue = atr(atrBars);

  const stop = entryValue > 0 ? stopPrice(stopMethod, entryValue, {
    price: manualStop ? Number(manualStop) : undefined,
    pct: Number(stopPct),
    atr: atrValue?.value,
    atrK: Number(atrK),
    range,
  }) : undefined;
  const risk = stop !== undefined ? entryValue - stop : undefined;
  const rMultiple = Number(rTarget);
  const target = stop !== undefined && risk && risk > 0 ? targetPrice(entryValue, stop, rMultiple) : undefined;
  const sizing = stop !== undefined ? sizePosition(rules, entryValue, stop) : undefined;
  const shares = sharesInput !== '' ? Math.max(0, Math.floor(Number(sharesInput))) : sizing?.shares ?? 0;

  const refusals: string[] = [];
  if (risk !== undefined && risk <= 0) refusals.push('The stop must be below the entry.');
  if (risk !== undefined && risk > 0 && risk < entryValue * 0.0005) refusals.push('The stop is too tight to survive the spread (under 0.05% of the price).');
  if (entryMinute >= minutesOf(rules.flatBy)) refusals.push(`The entry is at or after your flat-by time (${rules.flatBy}).`);
  if (stopMethod.startsWith('or') && !range) refusals.push('No opening range yet - it needs the 9:30-9:45 bars of a US session today.');
  if (stopMethod === 'atr' && !atrValue) refusals.push('Not enough bars for an ATR.');

  const usage = dayUsage(journal, now.day);
  const check = entryValue > 0 ? checkRisk(rules, { symbol: symbolInput || '?', entry: entryValue, stop, target, shares, entryMinute }, usage) : undefined;

  const entryBar = barIndexAt(entryMinute) - 1; // the bar that closes at the entry time
  const untilBar = Math.min(BARS_PER_SESSION - 1, barIndexAt(minutesOf(rules.flatBy)) - 1);
  const canSimulate = isUS && pool.length >= MIN_POOL && stop !== undefined && target !== undefined && refusals.length === 0 && entryBar >= 0 && entryBar < untilBar;

  const runSimulation = () => {
    if (!canSimulate || stop === undefined || target === undefined) return;
    setSimRunning(true);
    setSimError('');
    // Let the spinner paint before the (sub-second) crunch.
    window.setTimeout(() => {
      try {
        const result = simulate(pool, { entry: entryValue, stop, target, entryBar, untilBar }, SIM_RUNS, 19);
        const past = replayHistory(pool, { stopMethod, pct: Number(stopPct), atrK: Number(atrK), rMultiple, lastEntryMinute: minutesOf(rules.noEntriesAfter), untilBar });
        setSim({ result, history: past, rMultiple });
      } catch (simulationError) {
        setSimError(simulationError instanceof Error ? simulationError.message : 'The simulation failed.');
      } finally {
        setSimRunning(false);
      }
    }, 30);
  };

  const logTrade = () => {
    if (stop === undefined || !(shares > 0)) return;
    onLogTrade({
      id: crypto.randomUUID(),
      tradeDate: now.day,
      symbol: symbolInput,
      setup,
      entry: entryValue,
      stop,
      target,
      shares,
      currency,
      fees: 0,
      followedPlan: true,
      mistakes: [],
      notes: sim ? `Time Machine: ${pct(sim.result.odds.target)} target first, ${pct(sim.result.odds.stop)} stop first, avg ${signedR(sim.result.averageR)}` : undefined,
      createdAt: new Date().toISOString(),
    });
    setLogged(true);
  };

  const currency = history?.currency || rules.currency;

  return (
    <div className="space-y-4">
      <Panel eyebrow="Plan before you enter" title="Trade plan">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={event => { event.preventDefault(); void load(symbolInput); }}
        >
          <div className="min-w-[10rem] flex-1">
            <Field label="Ticker" htmlFor="plan-symbol">
              <input id="plan-symbol" value={symbolInput} onChange={event => setSymbolInput(event.target.value.toUpperCase())} placeholder="e.g. TSLA" className={INPUT_CLASS} autoComplete="off" />
            </Field>
          </div>
          <button type="submit" disabled={loading || !symbolInput.trim()} className="flex h-[42px] items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-40">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Load
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        {history && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={history.name || history.symbol} value={money(history.currentPrice ?? history.candles.at(-1)?.close ?? 0, currency)} note={history.exchange || undefined} />
              <Stat
                label="Opening range today"
                value={range ? `${range.low.toFixed(2)} – ${range.high.toFixed(2)}` : '—'}
                note={!isUS ? 'US-listed stocks only' : !todaySession ? 'No session today yet' : orb?.status === 'forming' ? 'Forming until 9:45 ET' : `Midpoint ${range!.mid.toFixed(2)}`}
              />
              <Stat
                label="Breakout"
                value={orb?.status === 'triggered' ? `Triggered ${hhmm(orb.minute)}` : orb?.status === 'waiting' ? 'Waiting' : orb?.status === 'expired' ? 'No trigger' : '—'}
                note={orb?.status === 'triggered' ? `First close above the range: ${orb.price.toFixed(2)}` : orb?.status === 'expired' ? `None before ${rules.noEntriesAfter} ET` : 'First 5-min close above the range high'}
                tone={orb?.status === 'triggered' ? 'text-emerald-500' : 'text-textMain'}
              />
              <Stat label="ATR (5-min)" value={atrValue ? atrValue.value.toFixed(2) : '—'} note={atrValue ? `${atrValue.bars} bars${atrValue.bars < 14 ? ' (fewer than 14)' : ''}` : undefined} />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Field label={`Entry (${currency})`} htmlFor="plan-entry">
                <input id="plan-entry" type="number" inputMode="decimal" step="0.01" value={entry} onChange={event => setEntry(event.target.value)} className={INPUT_CLASS} />
              </Field>
              <Field label="Entry time (ET)" htmlFor="plan-time" hint={`Window ${rules.noEntriesBefore}–${rules.noEntriesAfter}`}>
                <input id="plan-time" type="time" step="300" value={entryTime} onChange={event => setEntryTime(event.target.value)} className={INPUT_CLASS} />
              </Field>
              <Field label="Stop" htmlFor="plan-stop-method">
                <select id="plan-stop-method" value={stopMethod} onChange={event => setStopMethod(event.target.value as StopMethod)} className={INPUT_CLASS}>
                  {STOP_METHODS.map(method => (
                    <option key={method.id} value={method.id} disabled={method.needsRange && !range}>{method.label}{method.needsRange && !range ? ' (no range)' : ''}</option>
                  ))}
                </select>
              </Field>
              {stopMethod === 'price' && (
                <Field label="Stop price" htmlFor="plan-stop-price">
                  <input id="plan-stop-price" type="number" inputMode="decimal" step="0.01" value={manualStop} onChange={event => setManualStop(event.target.value)} className={INPUT_CLASS} />
                </Field>
              )}
              {stopMethod === 'pct' && (
                <Field label="% below entry" htmlFor="plan-stop-pct">
                  <input id="plan-stop-pct" type="number" inputMode="decimal" step="0.1" min="0" value={stopPct} onChange={event => setStopPct(event.target.value)} className={INPUT_CLASS} />
                </Field>
              )}
              {stopMethod === 'atr' && (
                <Field label="K (ATR multiple)" htmlFor="plan-atr-k">
                  <input id="plan-atr-k" type="number" inputMode="decimal" step="0.1" min="0" value={atrK} onChange={event => setAtrK(event.target.value)} className={INPUT_CLASS} />
                </Field>
              )}
              <Field label="Target" htmlFor="plan-target">
                <select id="plan-target" value={rTarget} onChange={event => setRTarget(event.target.value)} className={INPUT_CLASS}>
                  {R_TARGETS.map(r => <option key={r} value={r}>{r}R</option>)}
                </select>
              </Field>
              <Field label="Shares" htmlFor="plan-shares" hint={sizing ? `Sized: ${sizing.shares} (by ${sizing.limitedBy})` : undefined}>
                <input id="plan-shares" type="number" inputMode="numeric" min="0" step="1" value={sharesInput} onChange={event => setSharesInput(event.target.value)} placeholder={sizing ? String(sizing.shares) : '0'} className={INPUT_CLASS} />
              </Field>
              <Field label="Setup" htmlFor="plan-setup">
                <select id="plan-setup" value={setup} onChange={event => setSetup(event.target.value)} className={INPUT_CLASS}>
                  {[...Object.values(SETUP_LABELS), 'Other'].map(label => <option key={label} value={label}>{label}</option>)}
                </select>
              </Field>
            </div>

            {refusals.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                {refusals.map(reason => <li key={reason}>{reason}</li>)}
              </ul>
            )}

            {stop !== undefined && risk !== undefined && risk > 0 && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Stop" value={money(stop, currency)} note={`Risk ${money(risk)} / share (${pct(risk / entryValue, 2)})`} tone="text-red-500" />
                <Stat label={`Target (${rMultiple}R)`} value={target !== undefined ? money(target, currency) : '—'} note={target !== undefined ? `+${money(target - entryValue)} / share` : undefined} tone="text-emerald-500" />
                <Stat label="Position" value={`${shares} shares`} note={`${money(shares * entryValue, currency)}${sizing ? ` · max ${sizing.limits['max loss']} by loss, ${sizing.limits['position cap']} by cap, ${sizing.limits['max order']} by order, ${sizing.limits.cash} by cash` : ''}`} />
                <Stat label="Loss at stop" value={money(shares * risk, currency)} note={`Max per trade ${money(rules.maxLossPerTrade)}`} />
              </div>
            )}

            {check && (
              <div className={`rounded-2xl border p-4 ${check.pass ? 'border-emerald-500/40' : 'border-red-500/40'}`}>
                <p className={`flex items-center gap-2 text-sm font-extrabold ${check.pass ? 'text-emerald-500' : 'text-red-500'}`}>
                  {check.pass ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  {check.pass ? 'PASS - within your rules' : 'BLOCK - this trade breaks your rules'}
                </p>
                <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                  {check.checks.map(item => (
                    <li key={item.name} className="flex items-start gap-2">
                      {item.pass ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" /> : <XCircle size={13} className="mt-0.5 shrink-0 text-red-500" />}
                      <span>
                        <span className="font-bold text-textMain">{item.name}</span> <span className="text-secondary">· {item.detail}</span>
                        {item.fix && <span className="block text-[11px] text-red-500">{item.fix}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={runSimulation} disabled={!canSimulate || simRunning} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                {simRunning ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />} Run Time Machine
              </button>
              <button type="button" onClick={logTrade} disabled={stop === undefined || !(shares > 0) || logged} className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-bold text-primary hover:border-primary disabled:opacity-40">
                <NotebookPen size={15} /> {logged ? 'Logged to journal' : 'Log to journal'}
              </button>
              {!canSimulate && history && (
                <span className="text-[11px] text-secondary">
                  {!isUS ? 'The Time Machine needs a US-listed stock (New York session bars).'
                    : pool.length < MIN_POOL ? `Needs ${MIN_POOL} full past sessions of 5-minute bars; found ${pool.length}.`
                      : 'Fix the plan above to simulate it.'}
                </span>
              )}
            </div>
            {simError && <p className="text-xs text-red-500">{simError}</p>}
          </div>
        )}
      </Panel>

      {sim && stop !== undefined && target !== undefined && (
        <TimeMachineResult sim={sim} entry={entryValue} stop={stop} target={target} currency={currency} poolSize={pool.length} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

const OUTCOMES = [
  { key: 'target', label: 'Target first', color: '#10b981' },
  { key: 'stop', label: 'Stop first', color: '#ef4444' },
  { key: 'neither', label: 'Neither by flat-by', color: '#94a3b8' },
] as const;

const TimeMachineResult: React.FC<{ sim: { result: SimulationResult; history?: HistoryResult; rMultiple: number }; entry: number; stop: number; target: number; currency: string; poolSize: number }> = ({ sim, entry, stop, target, currency, poolSize }) => {
  const { result, history, rMultiple } = sim;
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 220;
  const pad = { left: 52, right: 12, top: 12, bottom: 24 };
  const low = Math.min(stop, ...result.bands.map(b => b.p5));
  const high = Math.max(target, ...result.bands.map(b => b.p95));
  const span = high - low || 1;
  const x = (i: number) => pad.left + (result.bands.length <= 1 ? 0 : (i / (result.bands.length - 1)) * (width - pad.left - pad.right));
  const y = (v: number) => pad.top + (1 - (v - low) / span) * (height - pad.top - pad.bottom);
  const area = (lowKey: 'p5' | 'p25', highKey: 'p95' | 'p75') =>
    `${result.bands.map((b, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(b[highKey])}`).join(' ')} ${result.bands.slice().reverse().map((b, i) => `L ${x(result.bands.length - 1 - i)} ${y(b[lowKey])}`).join(' ')} Z`;
  const median = result.bands.map((b, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(b.p50)}`).join(' ');
  const timeOf = (bar: number) => hhmm(OPEN_MINUTE + (bar + 1) * 5);
  const hovered = hover !== null ? result.bands[hover] : null;

  return (
    <Panel eyebrow={`${result.runs.toLocaleString()} replays · seed ${result.seed} · ${poolSize} past sessions`} title="Time Machine">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-3">
          <div>
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={OUTCOMES.map(o => `${o.label} ${pct(result.odds[o.key])}`).join(', ')}>
              {OUTCOMES.map(o => <div key={o.key} style={{ width: `${result.odds[o.key] * 100}%`, backgroundColor: o.color, minWidth: result.odds[o.key] > 0 ? 2 : 0 }} title={`${o.label}: ${pct(result.odds[o.key])}`} />)}
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {OUTCOMES.map(o => (
                <li key={o.key} className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: o.color }} />{o.label}</span>
                  <span className="font-bold tabular-nums text-textMain">{pct(result.odds[o.key])}</span>
                </li>
              ))}
              <li className="flex items-center justify-between text-secondary"><span>Green at the close (target, or above entry)</span><span className="font-bold tabular-nums text-textMain">{pct(result.green)}</span></li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Average R" value={signedR(result.averageR)} tone={toneFor(result.averageR)} note="Across all replays" />
            <Stat label="Price at flat-by" value={money(result.close.median, currency)} note={`5–95%: ${result.close.p5.toFixed(2)} – ${result.close.p95.toFixed(2)}`} />
          </div>
          <div className="rounded-xl border border-border bg-background p-3 text-xs">
            <p className="font-extrabold text-textMain">{verdict(result, rMultiple)}</p>
            {result.hitSideTargetShare !== undefined && (
              <p className="mt-1 text-secondary">Of replays that hit a side, {pct(result.hitSideTargetShare)} hit the target first. Break-even at {rMultiple}R is {pct(1 / (1 + rMultiple))}.</p>
            )}
            {result.odds.neither > 0.4 && <p className="mt-1 text-secondary">Over 40% of replays hit neither side - the flat-by exit decides a lot of these.</p>}
            {result.hitSideTargetShare !== undefined && Math.sign(result.averageR) !== Math.sign(result.hitSideTargetShare - 1 / (1 + rMultiple)) && Math.abs(result.averageR) > 0.005 && (
              <p className="mt-1 text-secondary">Average R points the other way from the lean, because of the replays that hit neither side.</p>
            )}
            <p className="mt-2 border-t border-border pt-2 text-secondary">
              {history
                ? history.fires > 0
                  ? <>History: this breakout rule fired <strong className="text-textMain">{history.fires}</strong> times in the last {poolSize} sessions - {history.target} target, {history.stop} stop, {history.neither} neither, average <strong className={toneFor(history.averageR)}>{signedR(history.averageR)}</strong>.</>
                  : 'History: the breakout rule never fired in these sessions.'
                : 'History replay needs a rule-based stop (not a fixed price).'}
            </p>
          </div>
        </div>

        <div>
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Range of simulated prices from entry to the flat-by time"
            onMouseMove={event => {
              const rect = event.currentTarget.getBoundingClientRect();
              const px = ((event.clientX - rect.left) / rect.width) * width;
              const i = Math.round(((px - pad.left) / (width - pad.left - pad.right)) * (result.bands.length - 1));
              setHover(i >= 0 && i < result.bands.length ? i : null);
            }}
            onMouseLeave={() => setHover(null)}
          >
            <path d={area('p5', 'p95')} fill="#3b82f6" opacity={0.15} />
            <path d={area('p25', 'p75')} fill="#3b82f6" opacity={0.3} />
            <path d={median} fill="none" stroke="#3b82f6" strokeWidth={2} />
            {[{ v: target, c: '#10b981', l: `Target ${target.toFixed(2)}` }, { v: entry, c: '#94a3b8', l: `Entry ${entry.toFixed(2)}` }, { v: stop, c: '#ef4444', l: `Stop ${stop.toFixed(2)}` }].map(line => (
              <g key={line.l}>
                <line x1={pad.left} x2={width - pad.right} y1={y(line.v)} y2={y(line.v)} stroke={line.c} strokeDasharray="4 4" strokeWidth={1} />
                <text x={pad.left - 4} y={y(line.v) + 3} textAnchor="end" fontSize="9" fill={line.c}>{line.v.toFixed(2)}</text>
              </g>
            ))}
            {[0, Math.floor((result.bands.length - 1) / 2), result.bands.length - 1].map(i => (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize="9" className="fill-current text-secondary">{timeOf(result.bands[i].bar)}</text>
            ))}
            {hovered && hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} stroke="currentColor" className="text-secondary" strokeWidth={1} />
            )}
          </svg>
          <p className="mt-1 min-h-[1.25rem] text-[11px] text-secondary">
            {hovered
              ? <>At <strong className="text-textMain">{timeOf(hovered.bar)} ET</strong>: median {hovered.p50.toFixed(2)}, half of replays {hovered.p25.toFixed(2)}–{hovered.p75.toFixed(2)}, 90% {hovered.p5.toFixed(2)}–{hovered.p95.toFixed(2)}</>
              : 'Dark band: middle 50% of replays · light band: 90% · line: median. Hover for a time.'}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-secondary">Built from this stock's own recent 5-minute bars, checked bar by bar (stop before target). Earnings, news and halts outside the last 60 days aren't in it, and a gap can fill below the stop. A simulation, not a prediction.</p>
    </Panel>
  );
};

export default TradePlanPanel;
