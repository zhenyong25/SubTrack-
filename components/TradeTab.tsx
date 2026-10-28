import React, { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, CalendarDays, Crosshair, Loader2, Radar, ShieldCheck } from 'lucide-react';
import { DEFAULT_RULES, type JournalTrade, type TradeRules } from '../services/tradingMath';
import { deleteJournalTrade, loadTradeData, saveJournalTrade, saveTradeRules } from '../services/tradeStoreService';
import TradePlanPanel from './TradePlanPanel';
import TradeScannerPanel from './TradeScannerPanel';
import TradeJournalPanel from './TradeJournalPanel';
import TradeEarningsPanel from './TradeEarningsPanel';
import TradeOptionsPanel from './TradeOptionsPanel';
import { Field, INPUT_CLASS, Panel } from './tradeUi';

type TradeView = 'plan' | 'scanner' | 'journal' | 'rules' | 'earnings' | 'options';

const VIEWS: Array<{ id: TradeView; label: string; icon: React.ElementType }> = [
  { id: 'plan', label: 'Plan', icon: Crosshair },
  { id: 'scanner', label: 'Scanner', icon: Radar },
  { id: 'options', label: 'Options', icon: BookOpen },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'rules', label: 'Rules', icon: ShieldCheck },
  { id: 'earnings', label: 'Earnings', icon: CalendarDays },
];

interface TradeTabProps {
  holdingSymbols: string[]; // stock tickers held in Investments, scanned alongside the watchlist
  onNotify: (message: string) => void;
}

const TradeTab: React.FC<TradeTabProps> = ({ holdingSymbols, onNotify }) => {
  const [view, setView] = useState<TradeView>('plan');
  const [rules, setRules] = useState<TradeRules>(DEFAULT_RULES);
  const [journal, setJournal] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');
  const [planSymbol, setPlanSymbol] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadTradeData()
      .then(data => { if (!cancelled) { setRules(data.rules); setJournal(data.journal); setWarning(data.warning || ''); } })
      .catch(error => { if (!cancelled) setWarning(error instanceof Error ? error.message : 'Could not load your trading data.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const report = (failure: string | null, success?: string) => {
    if (failure) setWarning(failure);
    else if (success) onNotify(success);
  };

  const saveRules = (next: TradeRules) => {
    setRules(next);
    void saveTradeRules(next).then(failure => report(failure));
  };

  const saveTrade = (trade: JournalTrade) => {
    const exists = journal.some(item => item.id === trade.id);
    const next = exists ? journal.map(item => (item.id === trade.id ? trade : item)) : [...journal, trade];
    setJournal(next);
    void saveJournalTrade(trade, next).then(failure => report(failure, exists ? `Saved ${trade.symbol} trade` : `Logged ${trade.symbol} to your journal`));
  };

  const deleteTrade = (id: string) => {
    const next = journal.filter(item => item.id !== id);
    setJournal(next);
    void deleteJournalTrade(id, next).then(failure => report(failure, 'Trade deleted'));
  };

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-secondary"><Loader2 size={18} className="animate-spin" /> Loading your trading data…</div>;
  }

  return (
    <div className="desktop-layout trade-layout space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Trade view">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold ${view === id ? 'bg-primary text-white' : 'text-secondary hover:text-textMain'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white"
            title="This feature is still being tested - calculations and layout may change."
          >
            Beta
          </span>
          <p className="text-[11px] text-secondary">Still in testing · {rules.budget.toLocaleString()} {rules.currency} budget · {rules.maxLossPerTrade} max loss per trade · paper-trade first</p>
        </div>
      </div>

      {warning && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {warning}
        </p>
      )}

      {view === 'plan' && <TradePlanPanel rules={rules} journal={journal} symbol={planSymbol} onSymbolChange={setPlanSymbol} onLogTrade={saveTrade} />}
      {view === 'options' && <TradeOptionsPanel rules={rules} onNotify={onNotify} />}
      {view === 'scanner' && <TradeScannerPanel rules={rules} holdingSymbols={holdingSymbols} onSaveRules={saveRules} onPlan={symbol => { setPlanSymbol(symbol); setView('plan'); }} />}
      {view === 'journal' && <TradeJournalPanel rules={rules} journal={journal} onSave={saveTrade} onDelete={deleteTrade} />}
      {view === 'rules' && <RulesPanel rules={rules} onSave={next => { saveRules(next); onNotify('Trading rules saved'); }} />}
      {view === 'earnings' && <TradeEarningsPanel rules={rules} holdingSymbols={holdingSymbols} onSaveRules={next => { saveRules(next); onNotify('Added to your watchlist'); }} onPlan={symbol => { setPlanSymbol(symbol); setView('plan'); }} />}

      <p className="text-[10px] text-secondary">
        For practice and education, not financial advice - most day traders lose money. Prices are delayed and unofficial (Yahoo Finance). Rules adapted from the open-source day-trader-skill.
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

const NUMBER_FIELDS: Array<{ key: keyof TradeRules; label: string; hint: string; step?: string }> = [
  { key: 'budget', label: 'Trading budget', hint: 'Only money you can afford to lose' },
  { key: 'maxLossPerTrade', label: 'Max loss per trade', hint: 'Sizes every position' },
  { key: 'maxDailyLoss', label: 'Daily loss limit', hint: 'Stop trading for the day after this' },
  { key: 'maxTradesPerDay', label: 'Trades per day', hint: 'Fewer, better trades', step: '1' },
  { key: 'minRewardRisk', label: 'Min reward : risk', hint: 'e.g. 1 = target at least 1R', step: '0.1' },
  { key: 'maxPositionPct', label: 'Max position (% of budget)', hint: 'Caps one stock' },
  { key: 'cashBufferPct', label: 'Cash buffer (% of budget)', hint: 'Never invested' },
  { key: 'maxOrder', label: 'Max order size', hint: 'Largest single order' },
  { key: 'minOrder', label: 'Min order size', hint: 'Smallest single order' },
];

const RulesPanel: React.FC<{ rules: TradeRules; onSave: (rules: TradeRules) => void }> = ({ rules, onSave }) => {
  const [draft, setDraft] = useState<TradeRules>(rules);
  const [blocked, setBlocked] = useState(rules.blocked.join(', '));
  useEffect(() => { setDraft(rules); setBlocked(rules.blocked.join(', ')); }, [rules]);
  const invalid = NUMBER_FIELDS.some(field => !(Number(draft[field.key]) >= 0)) || !(draft.budget > 0) || !(draft.maxLossPerTrade > 0)
    || draft.noEntriesBefore >= draft.noEntriesAfter || draft.noEntriesAfter >= draft.flatBy;

  return (
    <Panel eyebrow="Decide before the market opens" title="Risk rules">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {NUMBER_FIELDS.map(field => (
          <Field key={field.key} label={`${field.label}${['budget', 'maxLossPerTrade', 'maxDailyLoss', 'maxOrder', 'minOrder'].includes(field.key) ? ` (${draft.currency})` : ''}`} htmlFor={`rule-${field.key}`} hint={field.hint}>
            <input id={`rule-${field.key}`} type="number" inputMode="decimal" min="0" step={field.step || '1'} value={String(draft[field.key])}
              onChange={event => setDraft({ ...draft, [field.key]: Number(event.target.value) })} className={INPUT_CLASS} />
          </Field>
        ))}
        <Field label="No entries before (ET)" htmlFor="rule-before"><input id="rule-before" type="time" value={draft.noEntriesBefore} onChange={e => setDraft({ ...draft, noEntriesBefore: e.target.value })} className={INPUT_CLASS} /></Field>
        <Field label="No entries after (ET)" htmlFor="rule-after"><input id="rule-after" type="time" value={draft.noEntriesAfter} onChange={e => setDraft({ ...draft, noEntriesAfter: e.target.value })} className={INPUT_CLASS} /></Field>
        <Field label="Flat by (ET)" htmlFor="rule-flat" hint="Out of every position, no overnight holds"><input id="rule-flat" type="time" value={draft.flatBy} onChange={e => setDraft({ ...draft, flatBy: e.target.value })} className={INPUT_CLASS} /></Field>
        <Field label="Blocked tickers" htmlFor="rule-blocked" hint="Comma separated">
          <input id="rule-blocked" value={blocked} onChange={e => setBlocked(e.target.value.toUpperCase())} className={INPUT_CLASS} />
        </Field>
      </div>
      <div className="mt-4 space-y-2 text-xs text-textMain">
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.requireStop} onChange={e => setDraft({ ...draft, requireStop: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" /> Require a stop on every trade</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.pdtGuard} onChange={e => setDraft({ ...draft, pdtGuard: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" /> Pattern-day-trader guard (block a 4th day trade in 5 business days)</label>
      </div>
      {draft.noEntriesAfter >= draft.flatBy && <p className="mt-3 text-xs text-red-500">The last entry time must be before the flat-by time.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={invalid} onClick={() => onSave({ ...draft, blocked: blocked.split(/[\s,]+/).map(s => s.trim()).filter(Boolean) })} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Save rules</button>
        <button type="button" onClick={() => { setDraft({ ...DEFAULT_RULES, watchlist: rules.watchlist }); setBlocked(''); }} className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-secondary hover:text-textMain">Reset to defaults</button>
      </div>
      <p className="mt-3 text-[11px] text-secondary">Never widen a stop or raise a limit to make a trade pass. If a trade is blocked, take fewer shares, use a closer stop, wait, or skip it.</p>
    </Panel>
  );
};

export default TradeTab;
