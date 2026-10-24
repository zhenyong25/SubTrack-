import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, PiggyBank, Pencil, Plus, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { RetirementBalanceEntry, RetirementFund, RetirementScheme } from '../types';
import { getCurrencySymbol } from '../services/storageService';
import { balancesAsOf, dayOf, sumBalances } from '../services/retirementService';

interface RetirementFundsPanelProps {
  funds: RetirementFund[];
  entries: RetirementBalanceEntry[];
  onSaveFund: (fund: RetirementFund) => void;
  onDeleteFund: (fundId: string) => void;
  onSaveEntries: (entries: RetirementBalanceEntry[]) => void;
  onDeleteSnapshot: (fundId: string, balanceDate: string) => void;
}

interface SubAccountConfig {
  key: string;
  label: string;
  hint: string;
  color: string;
}

interface SchemeConfig {
  label: string;
  country: string;
  currency: string;
  defaultName: string;
  subAccounts: SubAccountConfig[];
}

// Sub-account keys are what get stored in retirement_balance_entries.sub_account, so don't rename them.
const SCHEMES: Record<RetirementScheme, SchemeConfig> = {
  EPF: {
    label: 'EPF (KWSP)',
    country: 'Malaysia',
    currency: 'MYR',
    defaultName: 'My EPF',
    subAccounts: [
      { key: 'persaraan', label: 'Akaun Persaraan', hint: 'Account 1 · retirement', color: '#d4a838' },
      { key: 'sejahtera', label: 'Akaun Sejahtera', hint: 'Account 2 · well-being', color: '#164cb8' },
      { key: 'fleksibel', label: 'Akaun Fleksibel', hint: 'Account 3 · flexible', color: '#e33a05' },
    ],
  },
  CPF: {
    label: 'CPF',
    country: 'Singapore',
    currency: 'SGD',
    defaultName: 'My CPF',
    subAccounts: [
      { key: 'oa', label: 'Ordinary Account (OA)', hint: 'Housing, education, investment', color: '#2563eb' },
      { key: 'sa', label: 'Special Account (SA)', hint: 'Retirement, until age 55', color: '#16a34a' },
      { key: 'ma', label: 'MediSave Account (MA)', hint: 'Healthcare', color: '#e11d48' },
      { key: 'ra', label: 'Retirement Account (RA)', hint: 'From age 55', color: '#d4a838' },
    ],
  },
};

const SCHEME_KEYS = Object.keys(SCHEMES) as RetirementScheme[];

const INPUT_CLASS = 'w-full bg-background border border-border rounded-xl p-3 text-sm text-textMain focus:border-primary outline-none';
const SELECT_CLASS = `${INPUT_CLASS} [color-scheme:light] dark:[color-scheme:dark]`;
const MASK = '••••••';

const formatAmount = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toDateInputValue = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatLongDate = (isoDate: string) => {
  const date = new Date(`${dayOf(isoDate)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const DONUT_SIZE = 180;
const DONUT_STROKE = 18;

const Donut: React.FC<{ segments: Array<{ key: string; color: string; value: number }>; children: React.ReactNode }> = ({ segments, children }) => {
  const radius = (DONUT_SIZE - DONUT_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);

  let offset = 0;
  return (
    <div className="relative mx-auto" style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
      <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} className="-rotate-90" aria-hidden="true">
        <circle cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={DONUT_STROKE} opacity={0.6} />
        {total > 0 && segments.map(segment => {
          const length = (Math.max(segment.value, 0) / total) * circumference;
          if (length <= 0) return null;
          const circle = (
            <circle
              key={segment.key}
              cx={DONUT_SIZE / 2}
              cy={DONUT_SIZE / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={DONUT_STROKE}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return circle;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">{children}</div>
    </div>
  );
};

type FundFormState = {
  id: string | null;
  scheme: RetirementScheme;
  name: string;
  currency: string;
  notes: string;
};

const createEmptyFundForm = (): FundFormState => ({
  id: null,
  scheme: 'EPF',
  name: SCHEMES.EPF.defaultName,
  currency: SCHEMES.EPF.currency,
  notes: '',
});

type BalanceFormState = {
  fundId: string;
  balanceDate: string;
  values: Record<string, string>;
};

const RetirementFundsPanel: React.FC<RetirementFundsPanelProps> = ({
  funds,
  entries,
  onSaveFund,
  onDeleteFund,
  onSaveEntries,
  onDeleteSnapshot,
}) => {
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [fundForm, setFundForm] = useState<FundFormState>(createEmptyFundForm());
  const [balanceForm, setBalanceForm] = useState<BalanceFormState | null>(null);
  const [expandedHistoryFundId, setExpandedHistoryFundId] = useState<string | null>(null);
  const [amountsHidden, setAmountsHidden] = useState(false);

  const activeFunds = useMemo(() => funds.filter(fund => !fund.isArchived), [funds]);

  const entriesByFund = useMemo(() => {
    const map = new Map<string, RetirementBalanceEntry[]>();
    entries.forEach(entry => {
      const list = map.get(entry.fundId) || [];
      list.push(entry);
      map.set(entry.fundId, list);
    });
    return map;
  }, [entries]);

  const money = (value: number, currency: string) => (amountsHidden ? MASK : `${getCurrencySymbol(currency)} ${formatAmount(value)}`);

  const openAddFund = () => {
    setFundForm(createEmptyFundForm());
    setIsFundModalOpen(true);
  };

  const openEditFund = (fund: RetirementFund) => {
    setFundForm({ id: fund.id, scheme: fund.scheme, name: fund.name, currency: fund.currency, notes: fund.notes || '' });
    setIsFundModalOpen(true);
  };

  // Picking a scheme on a brand-new fund also swaps in that scheme's usual name/currency,
  // but only while the user hasn't typed their own.
  const chooseScheme = (scheme: RetirementScheme) => {
    setFundForm(prev => {
      if (prev.id) return prev;
      const previousDefaults = SCHEMES[prev.scheme];
      return {
        ...prev,
        scheme,
        name: prev.name === previousDefaults.defaultName ? SCHEMES[scheme].defaultName : prev.name,
        currency: prev.currency === previousDefaults.currency ? SCHEMES[scheme].currency : prev.currency,
      };
    });
  };

  const saveFundForm = () => {
    const name = fundForm.name.trim();
    if (!name) return;
    const existing = fundForm.id ? funds.find(fund => fund.id === fundForm.id) : undefined;
    onSaveFund({
      ...existing,
      id: fundForm.id || crypto.randomUUID(),
      scheme: fundForm.scheme,
      name,
      currency: fundForm.currency,
      notes: fundForm.notes.trim() || undefined,
      isArchived: false,
    });
    setIsFundModalOpen(false);
  };

  const openLogBalance = (fund: RetirementFund) => {
    const latest = balancesAsOf(entriesByFund.get(fund.id) || []);
    const values: Record<string, string> = {};
    SCHEMES[fund.scheme].subAccounts.forEach(sub => {
      values[sub.key] = latest[sub.key] !== undefined ? String(latest[sub.key]) : '';
    });
    setBalanceForm({ fundId: fund.id, balanceDate: toDateInputValue(), values });
  };

  const saveBalanceForm = () => {
    if (!balanceForm) return;
    const fund = funds.find(item => item.id === balanceForm.fundId);
    if (!fund) return;
    const existing = entriesByFund.get(fund.id) || [];

    // Every sub-account is written for the date (blank = 0), so a snapshot always describes the
    // whole fund - e.g. an SA that was closed shows as 0 rather than lingering at its old value.
    const nextEntries = SCHEMES[fund.scheme].subAccounts.map(sub => {
      const parsed = Number(balanceForm.values[sub.key]);
      const sameSlot = existing.find(entry => entry.subAccount === sub.key && dayOf(entry.balanceDate) === balanceForm.balanceDate);
      return {
        id: sameSlot?.id || crypto.randomUUID(),
        fundId: fund.id,
        subAccount: sub.key,
        balanceDate: balanceForm.balanceDate,
        balance: Number.isFinite(parsed) ? parsed : 0,
      };
    });

    onSaveEntries(nextEntries);
    setBalanceForm(null);
  };

  const balanceFormValues: string[] = balanceForm ? Object.keys(balanceForm.values).map(key => balanceForm.values[key]) : [];
  const balanceFormIsValid = Boolean(balanceForm?.balanceDate)
    && balanceFormValues.every(value => value.trim() === '' || Number.isFinite(Number(value)))
    && balanceFormValues.some(value => value.trim() !== '');

  const balanceFormFund = balanceForm ? funds.find(fund => fund.id === balanceForm.fundId) : undefined;

  return (
    <section className="retirement-panel bg-surface rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-textMain uppercase tracking-wide">Retirement funds</h3>
          <p className="text-[10px] text-secondary mt-0.5">EPF / CPF, counted in your net worth above.</p>
        </div>
        <div className="flex items-center gap-2">
          {activeFunds.length > 0 && (
            <button
              type="button"
              onClick={() => setAmountsHidden(hidden => !hidden)}
              className="p-2 rounded-xl border border-border bg-background text-secondary hover:text-textMain"
              aria-label={amountsHidden ? 'Show amounts' : 'Hide amounts'}
              aria-pressed={amountsHidden}
            >
              {amountsHidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
          <button
            onClick={openAddFund}
            className="flex items-center gap-1.5 rounded-xl bg-primary/10 text-primary px-3 py-2 text-xs font-bold hover:bg-primary/20"
          >
            <Plus size={14} /> Add fund
          </button>
        </div>
      </div>

      {activeFunds.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <PiggyBank size={22} className="mx-auto mb-2 text-secondary opacity-60" />
          <p className="text-xs text-secondary">Add your EPF or CPF to see how your balance splits across its accounts.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeFunds.map(fund => {
            const scheme = SCHEMES[fund.scheme];
            const fundEntries = entriesByFund.get(fund.id) || [];
            const latestBalances = balancesAsOf(fundEntries);
            const total = sumBalances(latestBalances);
            const dates: string[] = Array.from(new Set<string>(fundEntries.map(entry => dayOf(entry.balanceDate)))).sort();
            const latestDate = dates[dates.length - 1];
            const previousDate = dates.length > 1 ? dates[dates.length - 2] : undefined;
            const delta = previousDate ? total - sumBalances(balancesAsOf(fundEntries, previousDate)) : null;
            const deltaPct = previousDate && delta !== null
              ? (() => {
                  const previousTotal = total - delta;
                  return previousTotal !== 0 ? (delta / Math.abs(previousTotal)) * 100 : null;
                })()
              : null;
            const isHistoryOpen = expandedHistoryFundId === fund.id;

            return (
              <div key={fund.id} className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-bold text-textMain truncate">{fund.name}</p>
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-secondary bg-surface border border-border px-1.5 py-0.5 rounded-full">
                        {fund.scheme} · {fund.currency}
                      </span>
                    </div>
                    <p className="text-[10px] text-secondary mt-0.5">{scheme.country}{fund.notes ? ` · ${fund.notes}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditFund(fund)}
                      className="p-1.5 rounded-lg text-secondary hover:bg-surface hover:text-primary"
                      aria-label={`Edit ${fund.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${fund.name}? This also removes its logged balance history.`)) {
                          onDeleteFund(fund.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-secondary hover:bg-red-500/10 hover:text-red-500"
                      aria-label={`Delete ${fund.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {fundEntries.length === 0 ? (
                  <div className="mt-4 text-center py-6 border border-dashed border-border rounded-xl">
                    <p className="text-xs text-secondary">No balance logged yet.</p>
                    <button
                      onClick={() => openLogBalance(fund)}
                      className="mt-3 rounded-xl bg-primary text-white px-4 py-2 text-xs font-bold"
                    >
                      Log balance
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mt-4">
                      <Donut segments={scheme.subAccounts.map(sub => ({ key: sub.key, color: sub.color, value: latestBalances[sub.key] ?? 0 }))}>
                        <p className="text-[10px] text-secondary">Total savings</p>
                        <p className="text-lg font-extrabold text-textMain leading-tight break-all">{money(total, fund.currency)}</p>
                        <p className="mt-1 text-[10px] text-secondary">as at {formatLongDate(latestDate)}</p>
                      </Donut>
                    </div>

                    {delta !== null && delta !== 0 && !amountsHidden && (
                      <div className={`mt-3 flex items-center justify-center gap-1 text-xs font-semibold ${delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {delta >= 0 ? '+' : '-'}{getCurrencySymbol(fund.currency)} {formatAmount(Math.abs(delta))}
                        {deltaPct !== null && ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`}
                        <span className="text-secondary font-normal">since {formatLongDate(previousDate!)}</span>
                      </div>
                    )}

                    <div className="mt-4 space-y-3">
                      {scheme.subAccounts.map(sub => {
                        const value = latestBalances[sub.key] ?? 0;
                        const share = total > 0 ? (value / total) * 100 : 0;
                        return (
                          <div key={sub.key} className="flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-textMain truncate">{sub.label}</p>
                              <p className="text-[10px] text-secondary truncate">{sub.hint}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-textMain">{money(value, fund.currency)}</p>
                              <p className="text-[10px] text-secondary">{amountsHidden ? MASK : `${share.toFixed(1)}%`}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setExpandedHistoryFundId(isHistoryOpen ? null : fund.id)}
                        className="text-[10px] font-bold text-secondary hover:text-textMain"
                      >
                        {isHistoryOpen ? 'Hide history' : `History (${dates.length})`}
                      </button>
                      <button
                        onClick={() => openLogBalance(fund)}
                        className="text-[10px] font-bold text-primary px-2 py-1 rounded-lg hover:bg-primary/10"
                      >
                        Log balance
                      </button>
                    </div>

                    {isHistoryOpen && (
                      <div className="mt-2 border-t border-border pt-2 space-y-1.5 max-h-48 overflow-y-auto">
                        {dates.slice().reverse().map(date => (
                          <div key={date} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-secondary">{date}</span>
                            <span className="font-semibold text-textMain">{money(sumBalances(balancesAsOf(fundEntries, date)), fund.currency)}</span>
                            <button
                              onClick={() => {
                                if (confirm(`Delete the ${date} balance for ${fund.name}?`)) onDeleteSnapshot(fund.id, date);
                              }}
                              className="text-secondary hover:text-red-500"
                              aria-label={`Delete ${date} balance`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isFundModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={() => setIsFundModalOpen(false)}>
          <div
            className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-border my-4 sm:my-8 max-h-[95vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex justify-between items-center bg-background shrink-0">
              <h3 className="text-base font-bold text-textMain">{fundForm.id ? 'Edit Fund' : 'Add Retirement Fund'}</h3>
              <button onClick={() => setIsFundModalOpen(false)} className="text-secondary hover:text-textMain p-1 -mr-1" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Scheme</label>
                <div className="grid grid-cols-2 gap-2">
                  {SCHEME_KEYS.map(key => (
                    <button
                      key={key}
                      type="button"
                      disabled={Boolean(fundForm.id)}
                      onClick={() => chooseScheme(key)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
                        fundForm.scheme === key
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-background border-border text-secondary hover:border-primary/50 disabled:opacity-50'
                      }`}
                    >
                      <p className="text-sm font-bold">{SCHEMES[key].label}</p>
                      <p className="text-[10px] opacity-80">{SCHEMES[key].country}</p>
                    </button>
                  ))}
                </div>
                {fundForm.id && <p className="mt-1 text-[10px] text-secondary">The scheme can't be changed after it's added.</p>}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Name</label>
                <input
                  autoFocus
                  type="text"
                  value={fundForm.name}
                  onChange={e => setFundForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={SCHEMES[fundForm.scheme].defaultName}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Currency</label>
                <select
                  value={fundForm.currency}
                  onChange={e => setFundForm(prev => ({ ...prev, currency: e.target.value }))}
                  className={SELECT_CLASS}
                >
                  {Array.from(new Set([SCHEMES[fundForm.scheme].currency, fundForm.currency, 'MYR', 'SGD'])).map(code => (
                    <option key={code} value={code}>{getCurrencySymbol(code)} {code}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">Notes</label>
                <input
                  type="text"
                  value={fundForm.notes}
                  onChange={e => setFundForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional"
                  className={INPUT_CLASS}
                />
              </div>

              <button
                onClick={saveFundForm}
                disabled={!fundForm.name.trim()}
                className="w-full rounded-xl bg-primary text-white font-bold py-3 text-sm shadow-lg disabled:opacity-40"
              >
                {fundForm.id ? 'Save changes' : 'Add fund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {balanceForm && balanceFormFund && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={() => setBalanceForm(null)}>
          <div
            className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-border my-4 sm:my-8 max-h-[95vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex justify-between items-center bg-background shrink-0">
              <div>
                <h3 className="text-base font-bold text-textMain">Log Balance</h3>
                <p className="text-[10px] text-secondary">{balanceFormFund.name} · {balanceFormFund.currency}</p>
              </div>
              <button onClick={() => setBalanceForm(null)} className="text-secondary hover:text-textMain p-1 -mr-1" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">As at</label>
                <input
                  type="date"
                  value={balanceForm.balanceDate}
                  onChange={e => setBalanceForm(prev => (prev ? { ...prev, balanceDate: e.target.value } : prev))}
                  className="w-full h-12 min-w-0 bg-background border border-border rounded-xl px-3 text-sm text-textMain focus:border-primary outline-none [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>

              {SCHEMES[balanceFormFund.scheme].subAccounts.map((sub, index) => (
                <div key={sub.key}>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-secondary mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sub.color }} />
                    {sub.label}
                  </label>
                  <input
                    autoFocus={index === 0}
                    type="number"
                    step="0.01"
                    value={balanceForm.values[sub.key] ?? ''}
                    onChange={e => setBalanceForm(prev => (prev ? { ...prev, values: { ...prev.values, [sub.key]: e.target.value } } : prev))}
                    placeholder="0.00"
                    className={`${INPUT_CLASS} no-spinner`}
                  />
                </div>
              ))}
              <p className="text-[10px] text-secondary">Leave an account blank if it has nothing in it (counts as 0).</p>

              <button
                onClick={saveBalanceForm}
                disabled={!balanceFormIsValid}
                className="w-full rounded-xl bg-primary text-white font-bold py-3 text-sm shadow-lg disabled:opacity-40"
              >
                Save balance
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default RetirementFundsPanel;
