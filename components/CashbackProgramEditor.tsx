import React, { useMemo, useState } from 'react';
import { ArrowLeft, Plus, Save, Trash2, TriangleAlert, Wand2 } from 'lucide-react';
import { CashbackCategory, CashbackProgram, CashbackTier, CURRENCIES, PaymentCard } from '../types';
import { buildProgramFromPreset, CASHBACK_PRESETS } from '../services/cashbackService';
import { getCurrencySymbol } from '../services/storageService';

interface CashbackProgramEditorProps {
  card: PaymentCard;
  program: CashbackProgram | null;
  cycleEnd: string;
  onSave: (program: CashbackProgram) => void | Promise<void>;
  onClose: () => void;
}

interface CategoryDraft {
  id: string;
  name: string;
  minSpend: string;
  monthlyCap: string;
  capGroup: string;
  groupMonthlyCap: string;
}

interface TierDraft {
  id: string;
  minTotalSpend: string;
  rates: Record<string, string>;
}

const INPUT_CLASS = 'w-full bg-surface border border-border rounded-xl p-2.5 text-sm text-textMain placeholder:text-secondary focus:border-primary outline-none no-spinner';
const LABEL_CLASS = 'block text-[10px] font-bold uppercase text-secondary mb-1';

const numberToString = (value?: number) => (value == null ? '' : String(value));

const categoriesToDrafts = (categories: CashbackCategory[]): CategoryDraft[] =>
  [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(category => ({
      id: category.id,
      name: category.name,
      minSpend: numberToString(category.minSpend),
      monthlyCap: numberToString(category.monthlyCap),
      capGroup: category.capGroup ?? '',
      groupMonthlyCap: numberToString(category.groupMonthlyCap),
    }));

const tiersToDrafts = (tiers: CashbackTier[]): TierDraft[] =>
  [...tiers]
    .sort((a, b) => a.minTotalSpend - b.minTotalSpend)
    .map(tier => ({
      id: tier.id,
      minTotalSpend: numberToString(tier.minTotalSpend),
      rates: Object.fromEntries(Object.entries(tier.rates).map(([categoryId, rate]) => [categoryId, String(rate)])),
    }));

const parseOptionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value));
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const CashbackProgramEditor: React.FC<CashbackProgramEditorProps> = ({ card, program, cycleEnd, onSave, onClose }) => {
  const isNew = program === null;

  const blankCategory = useMemo(() => crypto.randomUUID(), []);
  const [name, setName] = useState(program?.name ?? `${card.name} cashback`);
  const [currency, setCurrency] = useState(program?.currency ?? 'MYR');
  const [effectiveFrom, setEffectiveFrom] = useState(program?.effectiveFrom ?? cycleEnd);
  const [effectiveTo, setEffectiveTo] = useState(program?.effectiveTo ?? '');
  const [notes, setNotes] = useState(program?.notes ?? '');
  const [categories, setCategories] = useState<CategoryDraft[]>(() =>
    program
      ? categoriesToDrafts(program.categories)
      : [{ id: blankCategory, name: 'Other Spending', minSpend: '0', monthlyCap: '', capGroup: '', groupMonthlyCap: '' }],
  );
  const [defaultCategoryId, setDefaultCategoryId] = useState(
    () => program?.categories.find(category => category.isDefault)?.id ?? (program ? '' : blankCategory),
  );
  const [tiers, setTiers] = useState<TierDraft[]>(() =>
    program ? tiersToDrafts(program.tiers) : [{ id: crypto.randomUUID(), minTotalSpend: '', rates: {} }],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const applyPreset = (presetKey: string) => {
    const preset = CASHBACK_PRESETS.find(item => item.key === presetKey);
    if (!preset) return;
    const built = buildProgramFromPreset(preset, card.id);
    setName(built.name);
    setCurrency(built.currency);
    setEffectiveFrom(built.effectiveFrom);
    setEffectiveTo(built.effectiveTo ?? '');
    setCategories(categoriesToDrafts(built.categories));
    setDefaultCategoryId(built.categories.find(category => category.isDefault)?.id ?? '');
    setTiers(tiersToDrafts(built.tiers));
    setErrors([]);
  };

  const updateCategory = (id: string, patch: Partial<CategoryDraft>) =>
    setCategories(previous => previous.map(category => (category.id === id ? { ...category, ...patch } : category)));

  const addCategory = () =>
    setCategories(previous => [...previous, { id: crypto.randomUUID(), name: '', minSpend: '0', monthlyCap: '', capGroup: '', groupMonthlyCap: '' }]);

  const removeCategory = (id: string) => {
    setCategories(previous => previous.filter(category => category.id !== id));
    setTiers(previous => previous.map(tier => {
      const { [id]: _removed, ...rates } = tier.rates;
      return { ...tier, rates };
    }));
    if (defaultCategoryId === id) setDefaultCategoryId('');
  };

  const updateTier = (id: string, patch: Partial<TierDraft>) =>
    setTiers(previous => previous.map(tier => (tier.id === id ? { ...tier, ...patch } : tier)));

  const updateRate = (tierId: string, categoryId: string, value: string) =>
    setTiers(previous => previous.map(tier => (tier.id === tierId ? { ...tier, rates: { ...tier.rates, [categoryId]: value } } : tier)));

  const addTier = () => setTiers(previous => [...previous, { id: crypto.randomUUID(), minTotalSpend: '', rates: {} }]);
  const removeTier = (id: string) => setTiers(previous => previous.filter(tier => tier.id !== id));

  const handleSave = async () => {
    const problems: string[] = [];

    if (!name.trim()) problems.push('Give the rule set a name.');
    if (!effectiveFrom) problems.push('Choose the first statement date this rule set applies to.');
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) problems.push('The end date is before the start date.');
    if (categories.length === 0) problems.push('Add at least one category.');
    if (tiers.length === 0) problems.push('Add at least one spend tier.');

    const names = new Set<string>();
    categories.forEach((category, index) => {
      const label = category.name.trim() || `Category ${index + 1}`;
      if (!category.name.trim()) problems.push(`Category ${index + 1} needs a name.`);
      else if (names.has(category.name.trim().toLowerCase())) problems.push(`"${label}" is used more than once.`);
      names.add(category.name.trim().toLowerCase());

      const minSpend = parseOptionalNumber(category.minSpend) ?? 0;
      if (Number.isNaN(minSpend) || minSpend < 0) problems.push(`${label}: min spend must be 0 or more.`);
      const cap = parseOptionalNumber(category.monthlyCap);
      if (cap !== undefined && (Number.isNaN(cap) || cap < 0)) problems.push(`${label}: monthly cap must be 0 or more (or blank for unlimited).`);
    });

    const groupCaps = new Map<string, number>();
    categories.forEach(category => {
      const group = category.capGroup.trim();
      if (!group) return;
      const cap = parseOptionalNumber(category.groupMonthlyCap);
      if (cap !== undefined && !Number.isNaN(cap) && cap >= 0 && !groupCaps.has(group)) groupCaps.set(group, cap);
    });
    categories.forEach(category => {
      const group = category.capGroup.trim();
      if (group && !groupCaps.has(group)) problems.push(`Shared group "${group}" needs a shared cap amount.`);
    });

    const minimums = new Set<number>();
    tiers.forEach((tier, index) => {
      const min = parseOptionalNumber(tier.minTotalSpend);
      if (min === undefined || Number.isNaN(min) || min < 0) {
        problems.push(`Tier ${index + 1}: enter the monthly spend where it starts.`);
      } else if (minimums.has(min)) {
        problems.push(`Two tiers start at ${min}.`);
      } else {
        minimums.add(min);
      }
      categories.forEach(category => {
        const rate = parseOptionalNumber(tier.rates[category.id] ?? '') ?? 0;
        if (Number.isNaN(rate) || rate < 0 || rate > 100) {
          problems.push(`Tier ${index + 1}, ${category.name.trim() || 'category'}: rate must be between 0 and 100.`);
        }
      });
    });

    if (problems.length > 0) {
      setErrors([...new Set(problems)]);
      return;
    }

    const sortedTiers = [...tiers].sort((a, b) => Number(a.minTotalSpend) - Number(b.minTotalSpend));
    const built: CashbackProgram = {
      id: program?.id ?? crypto.randomUUID(),
      cardId: card.id,
      name: name.trim(),
      currency,
      effectiveFrom,
      effectiveTo: effectiveTo || undefined,
      notes: notes.trim() || undefined,
      categories: categories.map((category, index) => {
        const group = category.capGroup.trim();
        return {
          id: category.id,
          name: category.name.trim(),
          minSpend: parseOptionalNumber(category.minSpend) ?? 0,
          monthlyCap: parseOptionalNumber(category.monthlyCap),
          capGroup: group || undefined,
          groupMonthlyCap: group ? groupCaps.get(group) : undefined,
          isDefault: category.id === defaultCategoryId || undefined,
          sortOrder: index,
        };
      }),
      tiers: sortedTiers.map((tier, index) => {
        const min = Number(tier.minTotalSpend);
        const next = sortedTiers[index + 1];
        const max = next ? round2(Number(next.minTotalSpend) - 0.01) : undefined;
        return {
          id: tier.id,
          tierNo: index + 1,
          minTotalSpend: min,
          maxTotalSpend: max !== undefined && max > min ? max : undefined,
          rates: Object.fromEntries(
            categories.map(category => [category.id, parseOptionalNumber(tier.rates[category.id] ?? '') ?? 0]),
          ),
        };
      }),
    };

    setIsSaving(true);
    try {
      await onSave(built);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-[60] flex flex-col overflow-hidden animate-slide-up">
      <div
        className="flex items-center justify-between p-4 border-b border-border bg-surface shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <button onClick={onClose} className="p-2 -ml-2 text-secondary hover:text-textMain" aria-label="Close cashback criteria">
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-base font-bold text-textMain">{isNew ? 'New cashback rule set' : 'Edit cashback criteria'}</h2>
        <button
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          <Save size={14} /> {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="p-4 pb-16 space-y-6 max-w-2xl mx-auto w-full overflow-y-auto flex-1 min-h-0">
        {errors.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-red-500" />
            <ul className="space-y-0.5 text-[11px] text-red-600 dark:text-red-400">
              {errors.map(error => <li key={error}>{error}</li>)}
            </ul>
          </div>
        )}

        {isNew && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-secondary mb-2">
              <Wand2 size={12} /> Start from a template
            </p>
            <div className="flex flex-wrap gap-2">
              {CASHBACK_PRESETS.map(preset => (
                <button
                  key={preset.key}
                  onClick={() => applyPreset(preset.key)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-textMain hover:border-primary/50 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-secondary">Fills in categories, minimum spends, caps and tier rates. You can change anything afterwards.</p>
          </div>
        )}

        <section className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Rule set name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. RHB Shell Visa (2026)" className={INPUT_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Applies to statements from</label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={e => setEffectiveFrom(e.target.value)}
                className={`${INPUT_CLASS} [color-scheme:light] dark:[color-scheme:dark]`}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Until (blank = ongoing)</label>
              <input
                type="date"
                value={effectiveTo}
                onChange={e => setEffectiveTo(e.target.value)}
                className={`${INPUT_CLASS} [color-scheme:light] dark:[color-scheme:dark]`}
              />
            </div>
          </div>
          <p className="-mt-2 text-[10px] text-secondary">
            Dates refer to the statement date that closes a cycle, so a change that starts on the 23rd of a month applies from the next statement.
          </p>
          <div>
            <label className={LABEL_CLASS}>Currency</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className={INPUT_CLASS}>
              {CURRENCIES.map(code => <option key={code} value={code}>{getCurrencySymbol(code)} {code}</option>)}
            </select>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase text-secondary">Categories</h3>
            <button onClick={addCategory} className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-bold text-textMain hover:border-primary/50">
              <Plus size={12} /> Add category
            </button>
          </div>
          <div className="space-y-3">
            {categories.map((category, index) => (
              <div key={category.id} className="rounded-xl border border-border bg-surface p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={category.name}
                    onChange={e => updateCategory(category.id, { name: e.target.value })}
                    placeholder={`Category ${index + 1} (e.g. Groceries)`}
                    aria-label={`Category ${index + 1} name`}
                    className={INPUT_CLASS}
                  />
                  <button
                    onClick={() => removeCategory(category.id)}
                    className="shrink-0 rounded-lg p-2 text-secondary hover:bg-background hover:text-red-500"
                    aria-label={`Remove ${category.name || `category ${index + 1}`}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLASS}>Min spend ({currency})</label>
                    <input type="number" min={0} step="any" inputMode="decimal" value={category.minSpend} onChange={e => updateCategory(category.id, { minSpend: e.target.value })} placeholder="0" className={INPUT_CLASS} />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Monthly cap ({currency})</label>
                    <input type="number" min={0} step="any" inputMode="decimal" value={category.monthlyCap} onChange={e => updateCategory(category.id, { monthlyCap: e.target.value })} placeholder="Unlimited" className={INPUT_CLASS} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLASS}>Shared cap group (optional)</label>
                    <input type="text" value={category.capGroup} onChange={e => updateCategory(category.id, { capGroup: e.target.value })} placeholder="e.g. Combined" className={INPUT_CLASS} />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Shared cap ({currency})</label>
                    <input type="number" min={0} step="any" inputMode="decimal" value={category.groupMonthlyCap} onChange={e => updateCategory(category.id, { groupMonthlyCap: e.target.value })} placeholder="Group total" disabled={!category.capGroup.trim()} className={`${INPUT_CLASS} disabled:opacity-50`} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-secondary cursor-pointer">
                  <input
                    type="radio"
                    name="cashback-default-category"
                    checked={defaultCategoryId === category.id}
                    onChange={() => setDefaultCategoryId(category.id)}
                    className="accent-primary"
                  />
                  Untagged transactions on this card count here
                </label>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-secondary">
            A category earns nothing until its spend reaches the minimum. Categories that share a group name also share one combined cap, on top of their own.
          </p>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase text-secondary">Spend tiers &amp; rates (%)</h3>
            <button onClick={addTier} className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-bold text-textMain hover:border-primary/50">
              <Plus size={12} /> Add tier
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface text-secondary">
                  <th className="px-2 py-2 text-left font-bold whitespace-nowrap">Total monthly spend from</th>
                  {categories.map(category => (
                    <th key={category.id} className="px-2 py-2 text-left font-bold whitespace-nowrap">{category.name || 'Unnamed'}</th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, index) => (
                  <tr key={tier.id} className="border-t border-border">
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={tier.minTotalSpend}
                        onChange={e => updateTier(tier.id, { minTotalSpend: e.target.value })}
                        placeholder="1000"
                        aria-label={`Tier ${index + 1} starts at`}
                        className={`${INPUT_CLASS} min-w-[90px]`}
                      />
                    </td>
                    {categories.map(category => (
                      <td key={category.id} className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          inputMode="decimal"
                          value={tier.rates[category.id] ?? ''}
                          onChange={e => updateRate(tier.id, category.id, e.target.value)}
                          placeholder="0"
                          aria-label={`Tier ${index + 1} rate for ${category.name || 'category'}`}
                          className={`${INPUT_CLASS} min-w-[64px]`}
                        />
                      </td>
                    ))}
                    <td className="px-1">
                      <button onClick={() => removeTier(tier.id)} className="rounded-lg p-1.5 text-secondary hover:text-red-500" aria-label={`Remove tier ${index + 1}`}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-secondary">
            A tier applies once total spend on the card in a cycle reaches its starting amount, and runs until the next tier starts. Spend below the first tier earns nothing.
          </p>
        </section>

        <section>
          <label className={LABEL_CLASS}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Petrol only counts at Shell stations"
            className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm text-textMain placeholder:text-secondary focus:border-primary outline-none resize-y"
          />
        </section>
      </div>
    </div>
  );
};

export default CashbackProgramEditor;
