import type { PokemonEvent, PokemonEventList } from '../server/pokemonEvents';
import type { CustomEvent } from './pokemonExtrasService';

export type { PokemonEvent, PokemonEventList };

const CACHE_KEY = 'subtrack_pokemon_events_v1:sg';
export const EVENTS_STALE_AFTER_MS = 6 * 3600_000;

export const readCachedEvents = (): PokemonEventList | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return stored && Array.isArray(stored.events) ? stored : null;
  } catch {
    return null;
  }
};

// Same-origin route (server/pokemonEvents.ts). `refresh` skips the server's 3-hour cache.
export const fetchPokemonEvents = async (refresh = false, signal?: AbortSignal): Promise<PokemonEventList> => {
  const response = await fetch(`/api/pokemon/events${refresh ? '?refresh=1' : ''}`, { signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `The event list couldn't be loaded (${response.status}).`);
  if (!data || !Array.isArray(data.events)) throw new Error('The event service isn\'t available on this server yet - restart the dev server or redeploy.');
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
  return data as PokemonEventList;
};

// What kind of event, from its title - the official category is "Earnest Battle" for nearly all.
export const EVENT_GROUPS = ['GYM Battle', 'Release events', 'League', 'Beginners', 'Your events', 'Other'] as const;
export type EventGroup = typeof EVENT_GROUPS[number];
export const eventGroup = (title: string): EventGroup => {
  if (/gym battle/i.test(title)) return 'GYM Battle';
  if (/pre-?release|new expansion|launch|build\s*&\s*battle/i.test(title)) return 'Release events';
  if (/league|championship|showdown/i.test(title)) return 'League';
  if (/beginner|academia|new trainer|tutorial/i.test(title)) return 'Beginners';
  return 'Other';
};

// One list for display: the official events plus the ones you added.
export interface ListedEvent {
  id: string;
  date: string;
  time: string;
  title: string;
  group: EventGroup;
  label: string; // badge text
  format: string;
  organizer: string;
  place: string;
  url: string;
  notes: string;
  mine: boolean;
}

export const mergeEvents = (official: PokemonEvent[], mine: CustomEvent[]): ListedEvent[] => [
  ...official.map(event => ({
    id: event.id, date: event.date, time: event.time, title: event.title, group: eventGroup(event.title), label: eventGroup(event.title),
    format: event.format, organizer: event.organizer, place: event.place, url: event.url, notes: '', mine: false,
  })),
  ...mine.map(event => ({
    id: `mine-${event.id}`, date: event.date, time: event.time, title: event.title, group: 'Your events' as const, label: event.kind,
    format: '', organizer: '', place: event.place, url: event.url, notes: event.notes, mine: true,
  })),
].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title));

export type EventWhen = 'all' | 'today' | 'weekend' | 'week' | 'month';

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// The date range for a "when" choice, from today (YYYY-MM-DD, Singapore).
export const whenRange = (when: EventWhen, today: string): [string, string] => {
  if (when === 'today') return [today, today];
  if (when === 'week') return [today, shift(today, 6)];
  if (when === 'month') return [today, shift(today, 29)];
  if (when === 'weekend') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sunday … 6 Saturday
    if (weekday === 0) return [today, today];
    const saturday = shift(today, 6 - weekday);
    return [weekday === 6 ? today : saturday, shift(saturday, 1)];
  }
  return [today, '9999-12-31'];
};

export const filterEvents = (events: ListedEvent[], filter: { query: string; groups: EventGroup[]; when: EventWhen; today: string }) => {
  const [from, to] = whenRange(filter.when, filter.today);
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return events.filter(event => {
    if (event.date < from || event.date > to) return false;
    if (filter.groups.length && !filter.groups.includes(event.group)) return false;
    const text = `${event.title} ${event.organizer} ${event.place} ${event.format} ${event.label}`.toLowerCase();
    return words.every(word => text.includes(word));
  });
};

export const singaporeDate = (now = Date.now()) => new Date(now + 8 * 3600_000).toISOString().slice(0, 10);

// A calendar file for one event. Singapore has no daylight saving, so times convert to UTC by
// subtracting 8 hours; events without times become all-day.
export const eventIcs = (event: ListedEvent, now = new Date()) => {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const times = event.time.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  const utc = (hour: string, minute: string) => {
    const at = new Date(Date.parse(`${event.date}T00:00:00Z`) + (Number(hour) * 60 + Number(minute) - 8 * 60) * 60_000);
    return at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  };
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const nextDay = shift(event.date, 1).replace(/-/g, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SubTrack//Pokemon events//EN', 'BEGIN:VEVENT',
    `UID:${event.id}@subtrack`, `DTSTAMP:${stamp}`,
    ...(times ? [`DTSTART:${utc(times[1], times[2])}`, `DTEND:${utc(times[3], times[4])}`] : [`DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nextDay}`]),
    `SUMMARY:${escape(event.organizer ? `${event.title} @ ${event.organizer}` : event.title)}`,
    ...(event.place ? [`LOCATION:${escape(event.place)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    ...(event.notes || event.format ? [`DESCRIPTION:${escape([event.format, event.notes].filter(Boolean).join('\n'))}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
};
