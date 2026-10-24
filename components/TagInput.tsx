import React, { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTags } from '../services/globalSearchService';

export function TagChips({ tags }: { tags?: string[] }) {
  const values = normalizeTags(tags);
  if (!values.length) return null;
  return <span className="flex flex-wrap gap-1.5">{values.map(tag => <span key={tag} className="max-w-full break-words rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">#{tag}</span>)}</span>;
}

export default function TagInput({ value, onChange, suggestions = [], disabled = false }: { value: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; disabled?: boolean }) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const add = (text = draft) => {
    const next = normalizeTags([...value, ...text.split(',')]);
    onChange(next); setDraft('');
  };
  const matches = suggestions.filter(tag => !value.includes(tag) && tag.includes(draft.trim().toLowerCase().replace(/^#/, ''))).slice(0, 6);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xs font-semibold text-secondary">Tags</label>
      <div className="flex flex-wrap gap-1.5">
        {value.map(tag => <span key={tag} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 py-1 pl-2 text-xs font-semibold text-primary">
          <span className="break-words">#{tag}</span>
          <button type="button" disabled={disabled} onClick={() => onChange(value.filter(item => item !== tag))} aria-label={`Remove tag ${tag}`} className="rounded p-1 hover:bg-primary/10 disabled:opacity-40"><X size={13} /></button>
        </span>)}
      </div>
      <div className="flex gap-2">
        <input id={id} value={draft} maxLength={MAX_TAG_LENGTH * 3} disabled={disabled || value.length >= MAX_TAGS} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); if (draft.trim()) add(); }
        }} placeholder={value.length >= MAX_TAGS ? 'Maximum 10 tags' : 'Add a tag, then press Enter'} aria-describedby={`${id}-hint`} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-textMain outline-none focus:border-primary disabled:opacity-50" />
        <button type="button" disabled={disabled || !draft.trim() || value.length >= MAX_TAGS} onClick={() => add()} aria-label="Add tag" className="rounded-xl border border-border px-3 text-primary hover:bg-primary/10 disabled:opacity-30"><Plus size={17} /></button>
      </div>
      <p id={`${id}-hint`} className="text-[10px] text-secondary">Up to {MAX_TAGS} tags, {MAX_TAG_LENGTH} characters each. Press Enter or + to add before saving.</p>
      {!!matches.length && !disabled && value.length < MAX_TAGS && <div className="flex flex-wrap gap-1.5">{matches.map(tag => <button key={tag} type="button" onClick={() => add(tag)} className="rounded-full border border-border px-2 py-1 text-[10px] text-secondary hover:border-primary hover:text-primary">+ {tag}</button>)}</div>}
    </div>
  );
}
