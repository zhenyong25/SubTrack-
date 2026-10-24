import React, { useMemo, useState } from 'react';
import { BookOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { MISTAKES, SETUP_LABELS, isClosed, journalStats, tradePnl, tradeR, tradeRisk, type Bucket, type JournalTrade, type TradeRules } from '../services/tradingMath';
import { Field, INPUT_CLASS, Panel, Stat, money, nyNow, pct, signedR, toneFor } from './tradeUi';
import { CURRENCIES } from '../types';
import { convertCurrency } from '../services/storageService';

interface TradeJournalPanelProps {
  rules: TradeRules;
  journal: JournalTrade[];
  onSave: (trade: JournalTrade) => void;
  onDelete: (id: string) => void;
}

interface FormState {
  id?: string;
  tradeDate: string;
  symbol: string;
  setup: string;
  entry: string;
  stop: string;
  target: string;
  shares: string;
  currency: string;
  exitPrice: string;
  exitDate: string;
  fees: string;
  followedPlan: boolean;
  mistakes: string[];
  notes: string;
  createdAt?: string;
}

const SETUPS = [...Object.values(SETUP_LABELS), 'Other'];

const emptyForm = (currency: string): FormState => ({
  tradeDate: nyNow().day, symbol: '', setup: SETUP_LABELS.orb, entry: '', stop: '', target: '', shares: '', currency,
  exitPrice: '', exitDate: '', fees: '0', followedPlan: true, mistakes: [], notes: '',
});

const toForm = (trade: JournalTrade, fallbackCurrency: string): FormState => ({
  currency: trade.currency || fallbackCurrency,
  id: trade.id, tradeDate: trade.tradeDate, symbol: trade.symbol, setup: trade.setup, entry: String(trade.entry), stop: String(trade.stop),
  target: trade.target !== undefined ? String(trade.target) : '', shares: String(trade.shares), exitPrice: trade.exitPrice !== undefined ? String(trade.exitPrice) : '',
  exitDate: trade.exitDate || '', fees: String(trade.fees), followedPlan: trade.followedPlan, mistakes: trade.mistakes, notes: trade.notes || '', createdAt: trade.createdAt,
});

const problemWith = (form: FormState): string | null => {
  if (!form.symbol.trim()) return 'Enter the ticker.';
  if (!(Number(form.entry) > 0)) return 'Enter the entry price.';
  if (form.stop === '' || !(Number(form.stop) >= 0) || Number(form.stop) >= Number(form.entry)) return 'The stop must be below the entry - the journal measures every trade in R from it.';
  if (!(Number(form.shares) > 0)) return 'Enter the shares.';
  if (form.exitPrice !== '' && !(Number(form.exitPrice) >= 0)) return 'The exit price must be zero or more.';
  if (form.exitPrice !== '' && !form.exitDate) return 'Enter the exit date.';
  return null;
};

const fromForm = (form: FormState): JournalTrade => ({
  id: form.id || crypto.randomUUID(),
  tradeDate: form.tradeDate,
  symbol: form.symbol.trim().toUpperCase(),
  setup: form.setup,
  entry: Number(form.entry),
  stop: Number(form.stop),
  target: form.target !== '' ? Number(form.target) : undefined,
  shares: Number(form.shares),
  currency: form.currency,
  exitPrice: form.exitPrice !== '' ? Number(form.exitPrice) : undefined,
  exitDate: form.exitPrice !== '' ? form.exitDate : undefined,
  fees: Number(form.fees) || 0,
  followedPlan: form.followedPlan,
  mistakes: form.followedPlan ? form.mistakes.filter(m => m !== 'Ignored the plan') : form.mistakes,
  notes: form.notes.trim() || undefined,
  createdAt: form.createdAt || new Date().toISOString(),
});

const BucketTable: React.FC<{ title: string; buckets: Bucket[]; empty: string }> = ({ title, buckets, empty }) => (
  <div className="rounded-2xl border border-border bg-background p-4">
    <h4 className="text-xs font-bold uppercase tracking-wide text-secondary">{title}</h4>
    {buckets.length === 0 ? <p className="mt-2 text-xs text-secondary">{empty}</p> : (
      <table className="mt-2 w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-secondary">
          <tr><th className="py-1 text-left font-bold" /><th className="py-1 text-right font-bold">Trades</th><th className="py-1 text-right font-bold">Win rate</th><th className="py-1 text-right font-bold">Avg R</th></tr>
        </thead>
        <tbody>
          {buckets.map(b => (
            <tr key={b.label} className="border-t border-border">
              <td className="py-1.5 font-semibold text-textMain">{b.label}</td>
              <td className="py-1.5 text-right tabular-nums text-secondary">{b.trades}</td>
              <td className="py-1.5 text-right tabular-nums text-secondary">{pct(b.winRate, 0)}</td>
              <td className={`py-1.5 text-right font-bold tabular-nums ${toneFor(b.averageR)}`}>{signedR(b.averageR)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const EquityCurve: React.FC<{ points: Array<{ date: string; r: number }> }> = ({ points }) => {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="text-xs text-secondary">The equity curve appears after two closed trades.</p>;
  const width = 640; const height = 180; const pad = { left: 40, right: 10, top: 10, bottom: 20 };
  const values = [0, ...points.map(p => p.r)];
  const low = Math.min(...values); const high = Math.max(...values); const span = high - low || 1;
  const x = (i: number) => pad.left + (i / points.length) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - (v - low) / span) * (height - pad.top - pad.bottom);
  const path = values.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ');
  const last = points[points.length - 1].r;
  const color = last >= 0 ? '#10b981' : '#ef4444';
  const hovered = hover !== null ? points[hover] : null;
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Cumulative R over ${points.length} trades, now ${signedR(last)}`}
        onMouseMove={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          const i = Math.round((((event.clientX - rect.left) / rect.width) * width - pad.left) / (width - pad.left - pad.right) * points.length) - 1;
          setHover(i >= 0 && i < points.length ? i : null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-border" strokeDasharray="4 4" />
        <text x={pad.left - 4} y={y(0) + 3} textAnchor="end" fontSize="9" className="fill-current text-secondary">0R</text>
        {y(0) - y(high) > 12 && <text x={pad.left - 4} y={y(high) + 8} textAnchor="end" fontSize="9" className="fill-current text-secondary">{high.toFixed(1)}R</text>}
        {low < 0 && y(low) - y(0) > 12 && <text x={pad.left - 4} y={y(low)} textAnchor="end" fontSize="9" className="fill-current text-secondary">{low.toFixed(1)}R</text>}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => <circle key={i} cx={x(i + 1)} cy={y(p.r)} r={hover === i ? 4 : 2} fill={color} />)}
      </svg>
      <p className="mt-1 min-h-[1.25rem] text-[11px] text-secondary">
        {hovered ? <>Trade {hover! + 1} · {hovered.date}: cumulative <strong className={toneFor(hovered.r)}>{signedR(hovered.r)}</strong></> : 'Cumulative R after each closed trade. Hover a point.'}
      </p>
    </div>
  );
};

const TradeJournalPanel: React.FC<TradeJournalPanelProps> = ({ rules, journal, onSave, onDelete }) => {
  const [form, setForm] = useState<FormState | null>(null);
  const stats = useMemo(
    () => journalStats(journal, (amount, currency) => convertCurrency(amount, currency || rules.currency, rules.currency)),
    [journal, rules.currency],
  );
  const sorted = [...journal].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const update = (patch: Partial<FormState>) => setForm(current => (current ? { ...current, ...patch } : current));
  const problem = form ? problemWith(form) : null;
  const cost = stats.followed.trades > 0 && stats.broke.trades > 0 ? stats.followed.averageR - stats.broke.averageR : undefined;

  const save = () => {
    if (!form || problem) return;
    onSave(fromForm(form));
    setForm(null);
  };

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Review to improve"
        title="Performance"
        action={<button type="button" onClick={() => setForm(emptyForm(rules.currency))} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"><Plus size={15} /> Add trade</button>}
      >
        {journal.length === 0 ? (
          <div className="py-8 text-center text-secondary">
            <BookOpen size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-textMain">No trades logged yet.</p>
            <p className="mx-auto mt-1 max-w-md text-xs">Log each trade with its plan (entry, stop) and how it ended. Measured in R - the amount you planned to risk - you'll see which setups and habits actually make you money.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Expectancy" value={stats.closed ? signedR(stats.expectancy) : '—'} note="Average R per closed trade" tone={toneFor(stats.expectancy)} />
              <Stat label="Win rate" value={stats.closed ? pct(stats.winRate, 0) : '—'} note={`${stats.wins} of ${stats.closed} closed · ${stats.open} open`} />
              <Stat label="Avg win / loss" value={stats.closed ? `${signedR(stats.averageWinR)} / ${signedR(stats.averageLossR)}` : '—'} note="Winners should be bigger than losers" />
              <Stat label="Profit factor" value={stats.profitFactor !== undefined ? stats.profitFactor.toFixed(2) : '—'} note="Gross profit ÷ gross loss; above 1 makes money" tone={stats.profitFactor !== undefined ? toneFor(stats.profitFactor - 1) : undefined} />
              <Stat label="Net P&L" value={money(stats.totalPnl, rules.currency)} tone={toneFor(stats.totalPnl)} note={journal.some(t => t.currency && t.currency !== rules.currency) ? `Converted to ${rules.currency}` : undefined} />
              <Stat label="Max drawdown" value={`${stats.maxDrawdownR.toFixed(2)}R`} note={`≈ ${money(stats.maxDrawdownR * rules.maxLossPerTrade, rules.currency)} at your max loss per trade`} />
              <Stat label="Losing streak" value={String(stats.longestLosingStreak)} note="Longest run of losses in a row" />
              <Stat
                label="Plan discipline"
                value={stats.closed ? pct((stats.followed.trades) / stats.closed, 0) : '—'}
                note={cost !== undefined ? `Breaking it costs ${cost.toFixed(2)}R per trade` : 'Share of trades that followed the plan'}
                tone={cost !== undefined && cost > 0 ? 'text-amber-500' : undefined}
              />
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <h4 className="text-xs font-bold uppercase tracking-wide text-secondary">Equity curve (R)</h4>
              <div className="mt-2"><EquityCurve points={stats.equity} /></div>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <BucketTable title="Plan followed vs broken" buckets={[stats.followed, stats.broke].filter(b => b.trades > 0)} empty="Close a trade to compare." />
              <BucketTable title="By setup" buckets={stats.bySetup} empty="Close a trade to see setups." />
              <BucketTable title="By mistake" buckets={stats.byMistake} empty="No mistakes tagged - or none made." />
            </div>
          </div>
        )}
      </Panel>

      {journal.length > 0 && (
        <Panel title="Trades">
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[760px] whitespace-nowrap text-left text-xs">
              <thead className="bg-background text-[10px] uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-3 py-2 font-bold">Date</th>
                  <th className="px-3 py-2 font-bold">Ticker</th>
                  <th className="px-3 py-2 font-bold">Setup</th>
                  <th className="px-3 py-2 text-right font-bold">Entry → Exit</th>
                  <th className="px-3 py-2 text-right font-bold">Stop</th>
                  <th className="px-3 py-2 text-right font-bold">Shares</th>
                  <th className="px-3 py-2 text-right font-bold">Risk</th>
                  <th className="px-3 py-2 text-right font-bold">P&amp;L</th>
                  <th className="px-3 py-2 text-right font-bold">R</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map(trade => {
                  const pnl = tradePnl(trade);
                  const r = tradeR(trade);
                  return (
                    <tr key={trade.id}>
                      <td className="px-3 py-2 text-secondary">{trade.tradeDate}</td>
                      <td className="px-3 py-2">
                        <span className="font-bold text-textMain">{trade.symbol}</span>
                        {!trade.followedPlan && <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400" title={trade.mistakes.join(', ')}>off plan</span>}
                      </td>
                      <td className="px-3 py-2 text-secondary">{trade.setup}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-textMain">{trade.entry.toFixed(2)} → {isClosed(trade) ? trade.exitPrice!.toFixed(2) : <span className="font-bold text-primary">open</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-secondary">{trade.stop.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-secondary">{trade.shares}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-secondary">{money(tradeRisk(trade))}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${pnl === undefined ? 'text-secondary' : toneFor(pnl)}`}>{pnl === undefined ? '—' : `${pnl > 0 ? '+' : ''}${money(pnl, trade.currency || rules.currency)}`}</td>
                      <td className={`px-3 py-2 text-right font-bold tabular-nums ${r === undefined ? 'text-secondary' : toneFor(r)}`}>{r === undefined ? '—' : signedR(r)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="flex justify-end gap-2">
                          {!isClosed(trade) && (
                            <button type="button" onClick={() => setForm({ ...toForm(trade, rules.currency), exitDate: nyNow().day })} className="rounded-lg bg-primary px-2 py-1 text-[11px] font-bold text-white">Close</button>
                          )}
                          <button type="button" onClick={() => setForm(toForm(trade, rules.currency))} className="text-secondary hover:text-primary" aria-label="Edit trade"><Pencil size={13} /></button>
                          <button type="button" onClick={() => { if (confirm(`Delete the ${trade.symbol} trade from ${trade.tradeDate}?`)) onDelete(trade.id); }} className="text-secondary hover:text-red-500" aria-label="Delete trade"><Trash2 size={13} /></button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setForm(null)}>
          <div className="my-4 flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-scale-in" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={form.id ? 'Edit trade' : 'Add trade'}>
            <div className="flex items-center justify-between border-b border-border bg-background p-4">
              <h3 className="text-base font-bold text-textMain">{form.id ? 'Edit trade' : 'Add trade'}</h3>
              <button type="button" onClick={() => setForm(null)} className="p-1 text-secondary hover:text-textMain" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ticker" htmlFor="j-symbol"><input id="j-symbol" value={form.symbol} onChange={e => update({ symbol: e.target.value.toUpperCase() })} className={INPUT_CLASS} autoFocus /></Field>
                <Field label="Entry date (ET)" htmlFor="j-date"><input id="j-date" type="date" value={form.tradeDate} onChange={e => update({ tradeDate: e.target.value })} className={INPUT_CLASS} /></Field>
                <Field label="Setup" htmlFor="j-setup">
                  <select id="j-setup" value={form.setup} onChange={e => update({ setup: e.target.value })} className={INPUT_CLASS}>
                    {[...new Set([...SETUPS, form.setup])].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Shares" htmlFor="j-shares"><input id="j-shares" type="number" inputMode="numeric" min="0" value={form.shares} onChange={e => update({ shares: e.target.value })} className={INPUT_CLASS} /></Field>
                <Field label="Entry" htmlFor="j-entry"><input id="j-entry" type="number" inputMode="decimal" step="0.01" value={form.entry} onChange={e => update({ entry: e.target.value })} className={INPUT_CLASS} /></Field>
                <Field label="Stop (planned)" htmlFor="j-stop"><input id="j-stop" type="number" inputMode="decimal" step="0.01" value={form.stop} onChange={e => update({ stop: e.target.value })} className={INPUT_CLASS} /></Field>
                <Field label="Target (optional)" htmlFor="j-target"><input id="j-target" type="number" inputMode="decimal" step="0.01" value={form.target} onChange={e => update({ target: e.target.value })} className={INPUT_CLASS} /></Field>
                <Field label="Currency" htmlFor="j-currency">
                  <select id="j-currency" value={form.currency} onChange={e => update({ currency: e.target.value })} className={INPUT_CLASS}>
                    {[...new Set([form.currency, ...CURRENCIES])].map(code => <option key={code} value={code}>{code}</option>)}
                  </select>
                </Field>
                <Field label="Fees" htmlFor="j-fees"><input id="j-fees" type="number" inputMode="decimal" step="0.01" min="0" value={form.fees} onChange={e => update({ fees: e.target.value })} className={INPUT_CLASS} /></Field>
                <Field label="Exit price" htmlFor="j-exit" hint="Leave blank while the trade is open"><input id="j-exit" type="number" inputMode="decimal" step="0.01" value={form.exitPrice} onChange={e => update({ exitPrice: e.target.value })} className={INPUT_CLASS} /></Field>
                <Field label="Exit date" htmlFor="j-exit-date"><input id="j-exit-date" type="date" value={form.exitDate} onChange={e => update({ exitDate: e.target.value })} className={INPUT_CLASS} /></Field>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <label className="flex items-center gap-2 text-xs font-bold text-textMain">
                  <input type="checkbox" checked={form.followedPlan} onChange={e => update({ followedPlan: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
                  I followed my plan (entry, stop, size and exit)
                </label>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-secondary">Mistakes</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {MISTAKES.map(mistake => {
                    const on = form.mistakes.includes(mistake);
                    return (
                      <button key={mistake} type="button" aria-pressed={on}
                        onClick={() => update({ mistakes: on ? form.mistakes.filter(m => m !== mistake) : [...form.mistakes, mistake], followedPlan: on ? form.followedPlan : false })}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'border-border text-secondary hover:text-textMain'}`}
                      >{mistake}</button>
                    );
                  })}
                </div>
              </div>
              <Field label="Notes" htmlFor="j-notes"><textarea id="j-notes" rows={3} value={form.notes} onChange={e => update({ notes: e.target.value })} placeholder="Why you took it, how you felt, what you'd do differently" className={INPUT_CLASS} /></Field>
              {problem && (form.symbol || form.entry) && <p className="text-xs text-red-500">{problem}</p>}
              <button type="button" onClick={save} disabled={Boolean(problem)} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg disabled:opacity-40">{form.id ? 'Save trade' : 'Add trade'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeJournalPanel;
