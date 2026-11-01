import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CalendarPlus, ExternalLink, Loader2, MapPin, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import {
  EVENTS_STALE_AFTER_MS, EVENT_GROUPS, eventIcs, fetchPokemonEvents, filterEvents, mergeEvents, readCachedEvents, singaporeDate,
  type EventGroup, type EventWhen, type ListedEvent, type PokemonEventList,
} from '../services/pokemonEventService';
import { EVENT_KINDS, type CustomEvent, type PokemonExtras } from '../services/pokemonExtrasService';

// Upcoming Pokémon TCG events in Singapore: the official schedule (GYM Battles, pre-releases,
// league tournaments) plus card shows and meetups you add yourself, by day.

const input = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-textMain';
const PAGE = 20;
const WHEN: Array<[EventWhen, string]> = [['all', 'All upcoming'], ['today', 'Today'], ['weekend', 'This weekend'], ['week', 'Next 7 days'], ['month', 'Next 30 days']];
const GROUP_STYLE: Record<EventGroup, string> = {
  'GYM Battle': 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  'Release events': 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  League: 'bg-purple-500/10 text-purple-600 dark:text-purple-300',
  Beginners: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  'Your events': 'bg-pink-500/10 text-pink-600 dark:text-pink-300',
  Other: 'bg-slate-500/10 text-secondary',
};
const blankEvent = (): CustomEvent => ({ id: crypto.randomUUID(), kind: 'Card show', title: '', date: singaporeDate(), time: '', place: '', url: '', notes: '' });
const dayHeading = (date: string, today: string) => {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  return date === today ? `Today · ${label}` : label;
};
const download = (event: ListedEvent) => {
  const url = URL.createObjectURL(new Blob([eventIcs(event)], { type: 'text/calendar' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.title.replace(/[^\w-]+/g, '-').slice(0, 60)}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

interface Props {
  extras: PokemonExtras;
  busy: boolean;
  onSave: (next: PokemonExtras) => Promise<boolean>;
}

export default function PokemonEventsPanel({ extras, busy, onSave }: Props) {
  const [list, setList] = useState<PokemonEventList | null>(() => readCachedEvents());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<{ refresh: boolean; n: number } | null>(() => {
    const cached = readCachedEvents();
    return !cached || Date.now() - Date.parse(cached.fetchedAt) > EVENTS_STALE_AFTER_MS ? { refresh: false, n: 0 } : null;
  });
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [when, setWhen] = useState<EventWhen>('all');
  const [shown, setShown] = useState(PAGE);
  const [draft, setDraft] = useState<CustomEvent | null>(null);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    fetchPokemonEvents(request.refresh, controller.signal)
      .then(next => { if (!controller.signal.aborted) setList(next); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'The event list couldn\'t be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request]);

  useEffect(() => setShown(PAGE), [query, groups, when]);

  const today = singaporeDate();
  const all = useMemo(() => mergeEvents((list?.events || []).filter(event => event.date >= today), extras.events.filter(event => event.date >= today)), [list, extras.events, today]);
  const visible = useMemo(() => filterEvents(all, { query, groups, when, today }), [all, query, groups, when, today]);
  const counts = useMemo(() => {
    const result = new Map<EventGroup, number>();
    all.forEach(event => result.set(event.group, (result.get(event.group) || 0) + 1));
    return result;
  }, [all]);
  const days = useMemo(() => {
    const byDay = new Map<string, ListedEvent[]>();
    visible.slice(0, shown).forEach(event => byDay.set(event.date, [...(byDay.get(event.date) || []), event]));
    return [...byDay];
  }, [visible, shown]);
  const pastMine = extras.events.filter(event => event.date < today).length;

  const toggleGroup = (group: EventGroup) => setGroups(current => current.includes(group) ? current.filter(item => item !== group) : [...current, group]);
  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.title.trim() || !draft.date) return;
    const clean = { ...draft, title: draft.title.trim(), place: draft.place.trim(), url: /^https?:\/\//i.test(draft.url.trim()) ? draft.url.trim() : '', notes: draft.notes.trim() };
    const exists = extras.events.some(item => item.id === clean.id);
    if (await onSave({ ...extras, events: exists ? extras.events.map(item => item.id === clean.id ? clean : item) : [...extras.events, clean] })) setDraft(null);
  };
  const removeMine = (id: string) => onSave({ ...extras, events: extras.events.filter(item => `mine-${item.id}` !== id) });
  const clearPast = () => onSave({ ...extras, events: extras.events.filter(item => item.date >= today) });

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface p-4 text-textMain sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-extrabold"><CalendarDays size={20} className="text-primary" /> Events in Singapore</h2>
          <p className="mt-1 text-sm text-secondary">Official Pokémon TCG events - GYM Battles, pre-releases and league tournaments - plus card shows you add.</p>
          <p className="mt-1 text-xs text-secondary">
            {list
              ? <>{(list.events || []).filter(event => event.date >= today).length} official events from the <a href={list.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">official event search</a> · updated {new Date(list.fetchedAt).toLocaleString()}</>
              : loading ? 'Loading the official schedule…' : 'No schedule loaded yet.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(blankEvent())} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white"><Plus size={15} /> Add event</button>
          <button type="button" disabled={loading} onClick={() => setRequest({ refresh: true, n: Date.now() })} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:border-primary disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
          </button>
        </div>
      </div>

      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}{list && ' Showing the last schedule saved on this device.'}</p>}
      {list?.warnings.map(warning => <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">{warning}</p>)}

      {draft && (
        <form onSubmit={saveDraft} className="space-y-3 rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center justify-between"><h3 className="font-bold">{extras.events.some(item => item.id === draft.id) ? 'Edit your event' : 'Add a card show or event'}</h3><button type="button" onClick={() => setDraft(null)} aria-label="Close" className="text-secondary hover:text-textMain"><X size={16} /></button></div>
          <p className="text-xs text-secondary">Collector card shows and community meetups aren't on Pokémon's official schedule - add the ones you hear about here.</p>
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <select className={input} aria-label="Kind" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as CustomEvent['kind'] })}>{EVENT_KINDS.map(kind => <option key={kind}>{kind}</option>)}</select>
            <input required className={input} placeholder="Name, e.g. Singapore Card Show" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <input required type="date" className={input} aria-label="Date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} />
            <input className={input} placeholder="Time, e.g. 10:00-18:00" value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} />
            <input className={input} placeholder="Venue" value={draft.place} onChange={e => setDraft({ ...draft, place: e.target.value })} />
          </div>
          <input className={input} placeholder="Link (optional)" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} />
          <textarea className={input} placeholder="Notes - entry fee, what to bring" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
          <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save event'}</button>
        </form>
      )}

      {all.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {WHEN.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={when === id} onClick={() => setWhen(id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${when === id ? 'border-primary bg-primary text-white' : 'border-border bg-background text-secondary hover:text-textMain'}`}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {EVENT_GROUPS.filter(group => counts.get(group)).map(group => {
              const on = groups.includes(group);
              return (
                <button key={group} type="button" aria-pressed={on} onClick={() => toggleGroup(group)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${on ? 'border-primary bg-primary text-white' : 'border-border bg-background text-secondary hover:text-textMain'}`}>
                  {group} <span className={on ? 'text-white/80' : ''}>{counts.get(group)}</span>
                </button>
              );
            })}
          </div>
          <label className="relative block">
            <span className="sr-only">Search events</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input className={`${input} pl-9`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search shop, event or place" />
          </label>
          <p className="text-xs text-secondary" role="status">{visible.length} {visible.length === 1 ? 'event' : 'events'}{pastMine > 0 && <> · <button type="button" onClick={clearPast} className="font-bold text-primary">clear {pastMine} past event{pastMine === 1 ? '' : 's'} you added</button></>}</p>

          {visible.length === 0
            ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-secondary">No events match these filters.</p>
            : days.map(([date, events]) => (
              <div key={date} className="space-y-2">
                <h3 className="sticky top-0 z-[1] bg-surface py-1 text-sm font-extrabold">{dayHeading(date, today)}</h3>
                <ul className="grid gap-2 lg:grid-cols-2">
                  {events.map(event => (
                    <li key={event.id} className={`flex gap-3 rounded-2xl border bg-background p-3 ${event.mine ? 'border-pink-500/40' : 'border-border'}`}>
                      <div className="w-20 shrink-0 text-xs font-bold tabular-nums text-textMain">{event.time || 'All day'}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-bold leading-snug">{event.title}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${GROUP_STYLE[event.group]}`}>{event.label}</span>
                        </div>
                        {event.organizer && <p className="mt-1 text-xs font-semibold text-textMain">{event.organizer}</p>}
                        {event.place && <p className="mt-0.5 text-xs text-secondary">{event.place}</p>}
                        {(event.format || event.notes) && <p className="mt-0.5 text-[11px] text-secondary">{[event.format, event.notes].filter(Boolean).join(' · ')}</p>}
                        <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold">
                          {event.url && <a href={event.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{event.mine ? 'Link' : 'Details & entry'} <ExternalLink size={11} /></a>}
                          <button type="button" onClick={() => download(event)} className="inline-flex items-center gap-1 text-primary"><CalendarPlus size={12} /> Add to calendar</button>
                          {event.place && !/refer to venue/i.test(event.place) && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.organizer, event.place].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><MapPin size={11} /> Directions</a>}
                          {event.mine && <button type="button" disabled={busy} onClick={() => removeMine(event.id)} className="inline-flex items-center gap-1 text-red-500"><Trash2 size={11} /> Remove</button>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          {visible.length > shown && <button type="button" onClick={() => setShown(count => count + PAGE)} className="w-full rounded-xl border border-border py-2 text-sm font-bold text-primary hover:border-primary">Show {Math.min(PAGE, visible.length - shown)} more ({visible.length - shown} left)</button>}
          <p className="text-[11px] leading-relaxed text-secondary">Official events come from Pokémon's event search - entry, fees and spots are on each event's page, and shops may change times. Calendar files use Singapore time.</p>
        </>
      )}

      {loading && all.length === 0 && <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-8 text-sm text-secondary"><Loader2 size={16} className="animate-spin" /> Loading the official schedule…</div>}
    </section>
  );
}
