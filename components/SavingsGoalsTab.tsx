import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, Loader2, Pencil, PiggyBank, Plus, RefreshCw, Target, Trash2, Wallet, X } from 'lucide-react';
import { CURRENCIES } from '../types';
import type { SavingsGoal, SavingsEntry, SavingsGoalKind } from '../types';
import { convertCurrency } from '../services/storageService';
import { advanceGoalDate, GOAL_COLORS, goalBalance, goalPlan, todayDate, validateEntry, validateGoal } from '../services/savingsGoalMath';
import { deleteSavingsEntry, deleteSavingsGoal, loadSavingsGoals, recordSavingsEntry, saveSavingsGoal, type SavingsData } from '../services/savingsGoalService';

const money = (value: number, currency: string) => `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const dateText = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const repeats: Record<number, string> = { 1: 'Monthly', 3: 'Quarterly', 6: 'Every 6 months', 12: 'Yearly' };
const inputClass = 'mt-1 block w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-textMain outline-none focus:border-primary disabled:opacity-50';
const labelClass = 'block text-xs font-semibold text-secondary';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function GoalModal({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy); const closeRef = useRef(onClose); busyRef.current = busy; closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (ref.current?.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled])') || ref.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])') || [])].filter(node => node.getClientRects().length);
        if (!nodes.length) { event.preventDefault(); ref.current?.focus(); return; }
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6" onClick={() => { if (!busy) onClose(); }}>
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="goal-modal-title" className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-surface text-textMain shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4"><h2 id="goal-modal-title" className="text-base font-bold">{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Close goal dialog" className="rounded-full p-2 text-secondary hover:bg-background disabled:opacity-30"><X size={18} /></button></div>
      {children}
    </div>
  </div>;
}

function GoalForm({ goal, isNew, onSave, onClose }: { key?: string; goal: SavingsGoal; isNew: boolean; onSave: (goal: SavingsGoal, isNew: boolean) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(goal.name); const [kind, setKind] = useState<SavingsGoalKind>(goal.kind);
  const [amount, setAmount] = useState(goal.targetAmount ? String(goal.targetAmount) : ''); const [opening, setOpening] = useState(goal.openingBalance ? String(goal.openingBalance) : '');
  const [currency, setCurrency] = useState(goal.currency); const [date, setDate] = useState(goal.targetDate || '');
  const [repeat, setRepeat] = useState(goal.repeatMonths || 12); const [notes, setNotes] = useState(goal.notes || ''); const [color, setColor] = useState(goal.color);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <GoalModal title={isNew ? 'Create a goal' : 'Edit goal'} busy={busy} onClose={onClose}>
    <form className="space-y-4 overflow-y-auto p-5" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setError('');
      const updated = { ...goal, name: name.trim(), kind, targetAmount: Number(amount), openingBalance: isNew ? Number(opening || 0) : goal.openingBalance, currency, targetDate: date || undefined, repeatMonths: kind === 'Savings' ? 0 : repeat, notes: notes.trim() || undefined, color, updatedAt: new Date().toISOString() };
      try { validateGoal(updated, isNew ? undefined : goal); setBusy(true); await onSave(updated, isNew); }
      catch (err) { setError(errorText(err)); }
      finally { setBusy(false); }
    }}>
      <label className={labelClass}>Goal name<input required maxLength={80} value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="Emergency fund, holiday, annual insurance..." className={inputClass} /></label>
      <label className={labelClass}>Type<select aria-label="Goal type" value={kind} disabled={busy} onChange={event => setKind(event.target.value as SavingsGoalKind)} className={inputClass}><option value="Savings">Savings goal · one-off target</option><option value="Sinking fund">Sinking fund · recurring cost</option></select></label>
      <div className="grid grid-cols-2 gap-3"><label className={labelClass}>Target amount<input required type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} className={inputClass} /></label><label className={labelClass}>Currency<select aria-label="Goal currency" value={currency} disabled={!isNew || busy} onChange={event => setCurrency(event.target.value)} className={inputClass}>{CURRENCIES.map(value => <option key={value}>{value}</option>)}</select></label></div>
      {isNew && <label className={labelClass}>Already saved (optional)<input type="number" inputMode="decimal" min="0" step="0.01" value={opening} disabled={busy} onChange={event => setOpening(event.target.value)} placeholder="0.00" className={inputClass} /></label>}
      <div className={kind === 'Sinking fund' ? 'grid grid-cols-2 gap-3' : ''}><label className={labelClass}>{kind === 'Sinking fund' ? 'Next due date' : 'Target date (optional)'}<input type="date" required={kind === 'Sinking fund'} value={date} disabled={busy} onChange={event => setDate(event.target.value)} className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`} /></label>{kind === 'Sinking fund' && <label className={labelClass}>Repeat every<select value={repeat} disabled={busy} onChange={event => setRepeat(Number(event.target.value))} className={inputClass}>{Object.entries(repeats).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}</div>
      <label className={labelClass}>Notes (optional)<textarea rows={2} maxLength={1000} value={notes} disabled={busy} onChange={event => setNotes(event.target.value)} className={inputClass} /></label>
      <div><p className="mb-2 text-xs font-semibold text-secondary">Color</p><div className="flex gap-2">{GOAL_COLORS.map(value => <button key={value} type="button" disabled={busy} onClick={() => setColor(value)} aria-label={`Use ${value} color`} aria-pressed={color === value} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/20 text-white" style={{ backgroundColor: value }}>{color === value && <Check size={15} />}</button>)}</div></div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">{busy && <Loader2 size={16} className="animate-spin" />}{isNew ? 'Create goal' : 'Save changes'}</button>
    </form>
  </GoalModal>;
}

function EntryForm({ goal, entries, direction, id, onSave, onClose }: { key?: string; goal: SavingsGoal; entries: SavingsEntry[]; direction: SavingsEntry['direction']; id: string; onSave: (goal: SavingsGoal, entry: SavingsEntry, advance: boolean) => Promise<void>; onClose: () => void }) {
  const [amount, setAmount] = useState(''); const [date, setDate] = useState(todayDate()); const [notes, setNotes] = useState(''); const [advance, setAdvance] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [createdAt] = useState(new Date().toISOString());
  const withdrawal = direction === 'Withdrawal';
  return <GoalModal title={withdrawal ? (goal.kind === 'Sinking fund' ? 'Use fund money' : 'Withdraw savings') : 'Add a contribution'} busy={busy} onClose={onClose}>
    <form className="space-y-4 overflow-y-auto p-5" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setError('');
      const entry: SavingsEntry = { id, goalId: goal.id, direction, amount: Number(amount), entryDate: date, notes: notes.trim() || undefined, createdAt };
      try { validateEntry(goal, entries, entry); setBusy(true); await onSave(goal, entry, advance); }
      catch (err) { setError(errorText(err)); } finally { setBusy(false); }
    }}>
      <div className="rounded-xl border border-border bg-background p-3"><p className="text-sm font-bold">{goal.name}</p><p className="mt-1 text-xs text-secondary">Available: {money(goalBalance(goal, entries), goal.currency)}</p></div>
      <label className={labelClass}>Amount ({goal.currency})<input autoFocus required type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Date<input required type="date" max={todayDate()} value={date} disabled={busy} onChange={event => setDate(event.target.value)} className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`} /></label>
      <label className={labelClass}>Notes (optional)<textarea rows={2} maxLength={1000} value={notes} disabled={busy} onChange={event => setNotes(event.target.value)} className={inputClass} /></label>
      {withdrawal && goal.kind === 'Sinking fund' && goal.targetDate && <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-xs"><input type="checkbox" checked={advance} disabled={busy} onChange={event => setAdvance(event.target.checked)} className="mt-0.5" /><span><span className="block font-semibold">Start the next funding cycle</span><span className="mt-1 block text-secondary">Move the due date to {dateText(advanceGoalDate(goal.targetDate, goal.repeatMonths))}. Any unspent money stays in this fund.</span></span></label>}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">{busy && <Loader2 size={16} className="animate-spin" />}{withdrawal ? 'Record withdrawal' : 'Save contribution'}</button>
    </form>
  </GoalModal>;
}

export default function SavingsGoalsTab({ baseCurrency, focusGoalId, onFocusHandled }: { key?: string; baseCurrency: string; focusGoalId?: string | null; onFocusHandled?: () => void }) {
  const [data, setData] = useState<SavingsData>({ goals: [], entries: [] });
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [actionError, setActionError] = useState(''); const [busyId, setBusyId] = useState('');
  const [kind, setKind] = useState<'All' | SavingsGoalKind>('All'); const [status, setStatus] = useState('all');
  const [goalForm, setGoalForm] = useState<{ goal: SavingsGoal; isNew: boolean } | null>(null);
  const [entryForm, setEntryForm] = useState<{ goalId: string; direction: SavingsEntry['direction']; id: string } | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]); const alive = useRef(true); const requestVersion = useRef(0);
  const refresh = useCallback(async () => { const version = ++requestVersion.current; try { const next = await loadSavingsGoals(); if (alive.current && version === requestVersion.current) { setData(next); setLoadError(''); } } catch (error) { if (version === requestVersion.current) throw error; } }, []);
  useEffect(() => { alive.current = true; void refresh().catch(error => { if (alive.current) setLoadError(errorText(error)); }).finally(() => { if (alive.current) setLoading(false); }); return () => { alive.current = false; }; }, [refresh]);
  const refreshAfterSave = () => { void refresh().catch(error => { if (alive.current) setLoadError(`Saved, but the latest data could not be reloaded: ${errorText(error)}`); }); };
  useEffect(() => {
    if (!focusGoalId || loading || loadError) return;
    if (!data.goals.some(goal => goal.id === focusGoalId)) { setActionError('This goal is no longer available.'); onFocusHandled?.(); return; }
    setKind('All'); setStatus('all'); setExpanded(current => [...new Set([...current, focusGoalId])]);
    const frame = requestAnimationFrame(() => { const target = document.getElementById(`savings-goal-${focusGoalId}`); target?.focus({ preventScroll: true }); target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); onFocusHandled?.(); });
    return () => cancelAnimationFrame(frame);
  }, [focusGoalId, loading, loadError, data.goals]);
  const plans = useMemo(() => new Map(data.goals.map(goal => [goal.id, goalPlan(goal, data.entries)])), [data]);
  const totals = useMemo(() => data.goals.reduce((sum, goal) => {
    const plan = plans.get(goal.id)!;
    return { saved: sum.saved + convertCurrency(plan.balance, goal.currency, baseCurrency), remaining: sum.remaining + convertCurrency(plan.remaining, goal.currency, baseCurrency), monthly: sum.monthly + convertCurrency(plan.monthlyNeeded || 0, goal.currency, baseCurrency), funded: sum.funded + Number(plan.funded) };
  }, { saved: 0, remaining: 0, monthly: 0, funded: 0 }), [data.goals, plans, baseCurrency]);
  const visible = data.goals.filter(goal => (kind === 'All' || goal.kind === kind) && (status === 'all' || (status === 'funded' ? plans.get(goal.id)!.funded : !plans.get(goal.id)!.funded))).slice().sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999') || a.name.localeCompare(b.name));
  const create = (goalKind: SavingsGoalKind = 'Savings', name = '') => { const now = new Date().toISOString(); setGoalForm({ isNew: true, goal: { id: crypto.randomUUID(), name, kind: goalKind, targetAmount: 0, openingBalance: 0, currency: baseCurrency, repeatMonths: goalKind === 'Sinking fund' ? 12 : 0, color: GOAL_COLORS[data.goals.length % GOAL_COLORS.length], createdAt: now, updatedAt: now } }); };
  const entryGoal = entryForm ? data.goals.find(goal => goal.id === entryForm.goalId) : undefined;
  return <div className="space-y-3 pb-24 animate-fade-in">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-surface p-4 sm:p-5">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-primary/10 p-3 text-primary"><PiggyBank size={24} /></span><div><h2 className="text-xl font-bold">Savings goals & sinking funds</h2><p className="mt-1 text-xs text-secondary">Earmark existing money for milestones and recurring costs.</p></div></div>
      <button type="button" disabled={loading || Boolean(loadError)} onClick={() => create()} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"><Plus size={16} /> New goal</button>
    </div>
    {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-textMain"><p className="min-w-0 flex-1">{loadError}</p><button type="button" onClick={() => { setLoading(true); void refresh().catch(error => setLoadError(errorText(error))).finally(() => setLoading(false)); }} className="flex items-center gap-1.5 font-bold text-primary"><RefreshCw size={14} /> Retry</button></div>}
    {actionError && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500">{actionError}</p>}
    {loading ? <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-secondary"><Loader2 size={20} className="animate-spin" /> Loading goals...</div> : !loadError || data.goals.length > 0 ? <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ label: 'Earmarked', value: money(totals.saved, baseCurrency), icon: Wallet }, { label: 'Still to save', value: money(totals.remaining, baseCurrency), icon: Target }, { label: 'Monthly plan', value: money(totals.monthly, baseCurrency), icon: CalendarDays }, { label: 'Fully funded', value: `${totals.funded} / ${data.goals.length}`, icon: CheckCircle2 }].map(item => <div key={item.label} className="min-w-0 rounded-xl border border-border bg-surface p-4"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-secondary"><item.icon size={15} className="shrink-0 text-primary" />{item.label}</p><p className="mt-2 break-words text-lg font-bold sm:text-xl">{item.value}</p></div>)}
      </div>
      <p className="px-1 text-[10px] text-secondary">Summary converted to {baseCurrency}. Monthly plan covers dated targets. Contributions are allocations from your existing balances.</p>
      {data.goals.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{(['All', 'Savings', 'Sinking fund'] as const).map(value => <button key={value} type="button" onClick={() => setKind(value)} aria-pressed={kind === value} className={`rounded-full border px-3 py-2 text-xs font-semibold ${kind === value ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-secondary hover:text-primary'}`}>{value === 'Savings' ? 'Savings goals' : value === 'Sinking fund' ? 'Sinking funds' : 'All goals'}</button>)}</div><label className="text-xs text-secondary">Status <select value={status} onChange={event => setStatus(event.target.value)} className="ml-2 rounded-lg border border-border bg-surface px-2 py-2 text-xs text-textMain"><option value="all">All</option><option value="active">In progress</option><option value="funded">Funded</option></select></label></div>}
      {!data.goals.length ? <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center sm:p-10"><Target size={32} className="mx-auto mb-3 text-primary opacity-60" /><h3 className="font-bold">Give your savings a purpose</h3><p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-secondary">Build a buffer for surprises, save for a milestone, or spread an annual bill into smaller monthly contributions.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => create('Savings', 'Emergency fund')} className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">Start an emergency fund</button><button type="button" onClick={() => create('Sinking fund', 'Annual insurance')} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-secondary">Plan an annual bill</button></div></div> : !visible.length ? <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-secondary">No goals match these filters.</p> : <div className="goals-grid grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {visible.map(goal => {
          const plan = plans.get(goal.id)!; const history = data.entries.filter(entry => entry.goalId === goal.id).slice().sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt)); const open = expanded.includes(goal.id);
          const dueNow = goal.targetDate && goal.targetDate <= todayDate() && !plan.funded;
          return <article key={goal.id} id={`savings-goal-${goal.id}`} tabIndex={-1} className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary" aria-label={goal.name}>
            <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="shrink-0 rounded-xl p-2.5" style={{ backgroundColor: `${goal.color}18`, color: goal.color }}>{goal.kind === 'Savings' ? <Target size={20} /> : <PiggyBank size={20} />}</span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-secondary">{goal.kind}</p><h3 className="mt-0.5 break-words text-base font-bold">{goal.name}</h3></div></div><div className="flex shrink-0 items-center gap-1"><button type="button" disabled={Boolean(busyId)} onClick={() => setGoalForm({ goal, isNew: false })} aria-label={`Edit ${goal.name}`} className="rounded-lg p-2 text-secondary hover:bg-background hover:text-primary"><Pencil size={14} /></button><button type="button" disabled={Boolean(busyId)} onClick={async () => { if (!confirm(`Delete ${goal.name} and its contribution history?`)) return; setBusyId(goal.id); setActionError(''); try { await deleteSavingsGoal(goal.id); setData(current => ({ goals: current.goals.filter(item => item.id !== goal.id), entries: current.entries.filter(item => item.goalId !== goal.id) })); refreshAfterSave(); } catch (error) { setActionError(errorText(error)); } finally { setBusyId(''); } }} aria-label={`Delete ${goal.name}`} className="rounded-lg p-2 text-secondary hover:bg-red-500/10 hover:text-red-500"><Trash2 size={14} /></button></div></div>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2"><p className="text-2xl font-extrabold">{money(plan.balance, goal.currency)}</p><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${plan.funded ? 'bg-emerald-500/10 text-emerald-500' : plan.overdue ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'}`}>{plan.funded ? 'Funded' : plan.overdue ? 'Overdue' : `${plan.progress.toFixed(0)}% saved`}</span></div>
            <p className="mt-1 text-xs text-secondary">of {money(goal.targetAmount, goal.currency)}</p>
            <div role="progressbar" aria-label={`${goal.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(plan.progress)} className="mt-3 h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full transition-all" style={{ width: `${plan.progress}%`, backgroundColor: goal.color }} /></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-[10px] text-secondary">Remaining</p><p className="mt-1 font-semibold">{money(plan.remaining, goal.currency)}</p></div><div><p className="text-[10px] text-secondary">{dueNow ? 'Needed now' : 'Monthly contribution'}</p><p className="mt-1 font-semibold">{plan.monthlyNeeded === null ? 'Add a target date' : money(dueNow ? plan.remaining : plan.monthlyNeeded, goal.currency)}</p></div><div className="col-span-2 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-[10px] text-secondary"><span>{goal.targetDate ? `${goal.kind === 'Sinking fund' ? 'Next due' : 'Target'}: ${dateText(goal.targetDate)}` : 'No deadline'}</span>{goal.kind === 'Sinking fund' && <span>{repeats[goal.repeatMonths]}</span>}</div></div>
            {goal.notes && <p className="mt-3 whitespace-pre-wrap break-words text-xs text-secondary">{goal.notes}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => setEntryForm({ goalId: goal.id, direction: 'Contribution', id: crypto.randomUUID() })} className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white hover:opacity-90"><Plus size={14} /> Add money</button><button type="button" disabled={Boolean(busyId) || plan.balance <= 0} onClick={() => setEntryForm({ goalId: goal.id, direction: 'Withdrawal', id: crypto.randomUUID() })} className="rounded-xl border border-border px-3 py-2.5 text-xs font-bold text-secondary hover:text-primary disabled:opacity-30">{goal.kind === 'Sinking fund' ? 'Use funds' : 'Withdraw'}</button></div>
            <button type="button" onClick={() => setExpanded(current => open ? current.filter(id => id !== goal.id) : [...current, goal.id])} aria-expanded={open} className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[10px] font-semibold text-secondary"><span>History ({history.length})</span>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
            {open && <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1"><p className="text-[10px] text-secondary">Starting balance: {money(goal.openingBalance, goal.currency)}</p>{history.map(entry => <div key={entry.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-background p-2.5"><div className="min-w-0"><p className={`text-xs font-semibold ${entry.direction === 'Contribution' ? 'text-emerald-500' : 'text-amber-500'}`}>{entry.direction === 'Contribution' ? '+' : '-'}{money(entry.amount, goal.currency)}</p><p className="mt-0.5 text-[10px] text-secondary">{dateText(entry.entryDate)} · {entry.direction}</p>{entry.advancedCycle && <p className="mt-1 text-[10px] text-primary">Next funding cycle started</p>}{entry.notes && <p className="mt-1 break-words text-[10px] text-secondary">{entry.notes}</p>}</div><button type="button" disabled={Boolean(busyId)} onClick={async () => { if (!confirm('Remove this movement from the goal history? This does not change the fund due date.')) return; setBusyId(entry.id); setActionError(''); try { await deleteSavingsEntry(goal.id, entry.id); setData(current => ({ ...current, entries: current.entries.filter(item => item.id !== entry.id) })); refreshAfterSave(); } catch (error) { setActionError(errorText(error)); } finally { setBusyId(''); } }} aria-label={`Remove ${entry.direction.toLowerCase()} from ${goal.name} on ${entry.entryDate}`} className="shrink-0 rounded p-1 text-secondary hover:text-red-500">{busyId === entry.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}</button></div>)}</div>}
          </article>;
        })}
      </div>}
    </> : null}
    {goalForm && <GoalForm key={goalForm.goal.id} goal={goalForm.goal} isNew={goalForm.isNew} onClose={() => setGoalForm(null)} onSave={async (goal, isNew) => { await saveSavingsGoal(goal, isNew); setData(current => ({ ...current, goals: isNew ? [...current.goals, goal] : current.goals.map(item => item.id === goal.id ? goal : item) })); setGoalForm(null); refreshAfterSave(); }} />}
    {entryForm && entryGoal && <EntryForm key={entryForm.id} id={entryForm.id} goal={entryGoal} entries={data.entries} direction={entryForm.direction} onClose={() => setEntryForm(null)} onSave={async (goal, entry, advance) => { await recordSavingsEntry(goal, entry, advance); setData(current => ({ entries: current.entries.some(item => item.id === entry.id) ? current.entries : [...current.entries, { ...entry, advancedCycle: advance }], goals: current.goals.map(item => item.id === goal.id && advance ? { ...item, targetDate: advanceGoalDate(item.targetDate!, item.repeatMonths) } : item) })); setEntryForm(null); refreshAfterSave(); }} />}
  </div>;
}
