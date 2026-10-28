import React, { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { optionMetrics, optionPnl, validateOption, type OptionTrade } from '../services/optionsMath';
import { loadOptions, persistOption } from '../services/optionsStoreService';
import { normalizeTickerSymbol } from '../services/stockQuoteService';
import type { TradeRules } from '../services/tradingMath';
import { CURRENCIES } from '../types';
import InvestmentLogo from './InvestmentLogo';
import { Field, INPUT_CLASS, money, Panel, Stat, toneFor } from './tradeUi';

const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const fresh = (currency: string): OptionTrade => ({ id: crypto.randomUUID(), symbol: '', type: 'Call', strike: 0, premium: 0, contracts: 1, multiplier: 100, fees: 0, currency, tradeDate: today(), expiry: '', notes: '' });

export default function TradeOptionsPanel({ rules, onNotify }: { rules: TradeRules; onNotify: (message: string) => void }) {
  const [draft, setDraft] = useState<OptionTrade>(() => fresh(rules.currency));
  const [trades, setTrades] = useState<OptionTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [status, setStatus] = useState('All');
  useEffect(() => {
    let active = true;
    loadOptions().then(data => { if (active) { setTrades(data.trades); setWarning(data.warning || ''); } })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load options.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const update = <K extends keyof OptionTrade,>(key: K, value: OptionTrade[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const invalid = validateOption(draft);
  const metrics = invalid ? null : optionMetrics(draft);
  const upper = metrics ? Math.max(draft.strike * 1.5, metrics.breakEven * 1.2) : 0;
  const chart = metrics ? [...new Set([
    ...Array.from({ length: 41 }, (_, index) => upper * index / 40),
    draft.strike, ...(metrics.breakEven >= 0 ? [metrics.breakEven] : []),
  ])].sort((a, b) => a - b).map(price => ({ price, pnl: metrics.payoff(price) })) : [];
  const save = async (trade: OptionTrade, remove = false) => {
    setBusy(true); setError('');
    try {
      const warning = await persistOption(trade, remove);
      setWarning(warning || '');
      setTrades(previous => remove ? previous.filter(item => item.id !== trade.id) : [trade, ...previous.filter(item => item.id !== trade.id)]);
      if (draft.id === trade.id) setDraft(fresh(rules.currency));
      onNotify(remove ? 'Option trade deleted' : 'Option trade saved');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save option trade.'); }
    finally { setBusy(false); }
  };
  const editing = trades.some(trade => trade.id === draft.id);
  const numeric = (key: 'strike' | 'premium' | 'contracts' | 'multiplier' | 'fees', label: string, step = '0.01') => <Field label={label} htmlFor={`option-${key}`}>
    <input id={`option-${key}`} type="number" min={key === 'contracts' || key === 'multiplier' ? 1 : 0} step={step} value={Number.isNaN(draft[key]) ? '' : draft[key] || ''} onChange={event => update(key, event.target.value === '' ? NaN : Number(event.target.value))} className={INPUT_CLASS} />
  </Field>;
  return <div className="space-y-4">
    {warning && <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">{warning}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
    <Panel eyebrow="Calls & puts" title={editing ? 'Edit option trade' : 'Options planner'}>
      <p className="mb-4 text-xs text-secondary">Buy-to-open calls and puts. Enter premiums per underlying share manually; this planner does not fetch option quotes or place orders.</p>
      <form onSubmit={event => { event.preventDefault(); if (!invalid) void save({ ...draft, symbol: normalizeTickerSymbol(draft.symbol) }); }}>
        <fieldset disabled={busy || loading}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Field label="Underlying ticker" htmlFor="option-symbol"><input id="option-symbol" value={draft.symbol} onChange={event => update('symbol', event.target.value.toUpperCase())} placeholder="e.g. TSLA" className={INPUT_CLASS} /></Field>
            <Field label="Buy option" htmlFor="option-type"><select id="option-type" value={draft.type} onChange={event => update('type', event.target.value as OptionTrade['type'])} className={INPUT_CLASS}><option>Call</option><option>Put</option></select></Field>
            <Field label="Entry date" htmlFor="option-entry"><input id="option-entry" type="date" value={draft.tradeDate} onChange={event => update('tradeDate', event.target.value)} className={INPUT_CLASS} /></Field>
            <Field label="Expiration" htmlFor="option-expiry"><input id="option-expiry" type="date" min={draft.tradeDate} value={draft.expiry} onChange={event => update('expiry', event.target.value)} className={INPUT_CLASS} /></Field>
            {numeric('strike', 'Strike price')}{numeric('premium', 'Entry premium / share')}{numeric('contracts', 'Contracts', '1')}{numeric('multiplier', 'Shares per contract', '1')}
            {numeric('fees', 'Total fees (entry + exit)')}
            <Field label="Currency" htmlFor="option-currency"><select id="option-currency" value={draft.currency} onChange={event => update('currency', event.target.value)} className={INPUT_CLASS}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></Field>
          </div>
          <p className="mt-2 text-[11px] text-secondary">The default multiplier is 100. Check the actual contract specification, especially adjusted contracts.</p>
          <label className="mt-4 flex items-center gap-2 text-sm text-textMain"><input type="checkbox" checked={draft.exitPremium != null} onChange={event => setDraft(previous => ({ ...previous, exitPremium: event.target.checked ? 0 : undefined, exitDate: event.target.checked ? (today() > previous.expiry && previous.expiry ? previous.expiry : today()) : undefined }))} /> Closed trade / record an exit</label>
          {draft.exitPremium != null && <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Exit premium / share" htmlFor="option-exit-premium" hint="Enter 0 for an option that expired worthless."><input id="option-exit-premium" type="number" min="0" step="0.01" value={Number.isNaN(draft.exitPremium) ? '' : draft.exitPremium} onChange={event => update('exitPremium', event.target.value === '' ? NaN : Number(event.target.value))} className={INPUT_CLASS} /></Field>
            <Field label="Exit date" htmlFor="option-exit-date"><input id="option-exit-date" type="date" min={draft.tradeDate} max={draft.expiry} value={draft.exitDate || ''} onChange={event => update('exitDate', event.target.value)} className={INPUT_CLASS} /></Field>
          </div>}
          <div className="mt-3"><Field label="Notes" htmlFor="option-notes"><textarea id="option-notes" value={draft.notes} onChange={event => update('notes', event.target.value)} placeholder="Trade thesis, exit plan, or review" className={INPUT_CLASS} rows={2} /></Field></div>
          {invalid && <p className="mt-3 text-xs text-secondary">{invalid}</p>}
          <div className="mt-4 flex gap-3"><button disabled={!!invalid} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{busy ? 'Saving...' : editing ? 'Save changes' : 'Save option trade'}</button><button type="button" onClick={() => setDraft(fresh(rules.currency))} className="text-sm text-secondary">{editing ? 'Cancel edit' : 'Clear'}</button></div>
        </fieldset>
      </form>
      {metrics && <div className="mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Premium + total fees" value={money(metrics.cost, draft.currency)} />
          <Stat label="Maximum option loss" value={money(metrics.maxLoss, draft.currency)} />
          <Stat label="Break-even at expiry" value={metrics.breakEven < 0 ? 'Not achievable' : money(metrics.breakEven, draft.currency)} />
          <Stat label="Maximum option profit" value={metrics.maxProfit === Infinity ? 'Unlimited' : money(metrics.maxProfit, draft.currency)} />
        </div>
        {draft.currency === rules.currency && metrics.maxLoss > rules.maxLossPerTrade && <p className="text-xs text-amber-600 dark:text-amber-300">Full premium risk exceeds your {money(rules.maxLossPerTrade, rules.currency)} per-trade loss limit.</p>}
        {draft.currency !== rules.currency && <p className="text-xs text-secondary">Trade currency differs from your risk rules. Compare the amounts after currency conversion.</p>}
        {draft.exitPremium != null && <Stat label="Realized P/L after fees" value={money(optionPnl(draft)!, draft.currency)} tone={toneFor(optionPnl(draft)!)} />}
        <h4 className="text-sm font-bold text-textMain">Profit / loss at expiration</h4>
        <div className="h-64" role="img" aria-label={`${draft.type} payoff at expiration; maximum loss ${money(metrics.maxLoss, draft.currency)}, break-even ${metrics.breakEven.toFixed(2)}`}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ left: 10, right: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="price" type="number" domain={['dataMin', 'dataMax']} tickFormatter={value => Number(value).toFixed(0)} label={{ value: `Underlying price (${draft.currency})`, position: 'bottom', offset: 0 }} /><YAxis tickFormatter={value => Number(value).toFixed(0)} width={70} /><Tooltip labelFormatter={value => `Underlying: ${money(Number(value), draft.currency)}`} formatter={value => [money(Number(value), draft.currency), 'P/L']} /><ReferenceLine y={0} stroke="#94a3b8" />{metrics.breakEven >= 0 && <ReferenceLine x={metrics.breakEven} stroke="#10b981" strokeDasharray="4 4" />}<Line type="linear" dataKey="pnl" stroke="#3b82f6" dot={false} strokeWidth={2} />
          </LineChart></ResponsiveContainer>
        </div>
        <p className="text-[11px] text-secondary">Expiration scenarios include the entered fees. Before expiration, option premiums also depend on time and volatility. Exercise can create a separate stock position; this calculator models the option payoff only. <a href="https://www.optionseducation.org/strategies/all-strategies/long-call" target="_blank" rel="noreferrer" className="text-primary underline">Call guide</a> · <a href="https://www.optionseducation.org/strategies/all-strategies/long-put" target="_blank" rel="noreferrer" className="text-primary underline">Put guide</a></p>
      </div>}
    </Panel>
    <Panel title="Options journal" action={<select aria-label="Filter options trades" value={status} onChange={event => setStatus(event.target.value)} className={INPUT_CLASS}><option>All</option><option>Open</option><option>Closed</option></select>}>
      <p className="mb-3 text-xs text-secondary">Saved separately from the stock journal. Edit a trade to record an exit; expiry alone does not close it automatically.</p>
      {loading ? <p className="text-sm text-secondary">Loading options...</p> : !trades.filter(trade => status === 'All' || (trade.exitPremium == null ? 'Open' : 'Closed') === status).length ? <p className="text-sm text-secondary">No {status === 'All' ? '' : status.toLowerCase() + ' '}option trades yet.</p> :
        <ul className="divide-y divide-border">{trades.filter(trade => status === 'All' || (trade.exitPremium == null ? 'Open' : 'Closed') === status).map(trade => {
          const pnl = optionPnl(trade);
          return <li key={trade.id} className="flex flex-wrap items-center gap-3 py-4">
            <InvestmentLogo investment={{ kind: 'Stocks', symbol: trade.symbol, name: trade.symbol, color: '#3b82f6' }} className="h-9 w-9 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1"><p className="text-sm font-bold text-textMain">{trade.symbol} {trade.strike} {trade.type} <span className="text-xs font-normal text-secondary">{pnl == null ? trade.expiry < today() ? 'Expired · exit needed' : 'Open' : 'Closed'}</span></p><p className="text-xs text-secondary">Expiry {trade.expiry} · {trade.contracts} × {trade.multiplier} · Entry {money(trade.premium, trade.currency)}</p>{pnl != null && <p className={`text-xs font-bold ${toneFor(pnl)}`}>Realized P/L {money(pnl, trade.currency)}</p>}</div>
            <button disabled={busy} onClick={() => setDraft({ ...trade })} className="text-xs font-bold text-primary">Edit / close</button>
            <button disabled={busy} onClick={() => { if (confirm(`Delete this ${trade.symbol} ${trade.type} trade?`)) void save(trade, true); }} className="text-xs text-red-500">Delete</button>
          </li>;
        })}</ul>}
    </Panel>
  </div>;
}
