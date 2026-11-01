// Upcoming official Pokémon TCG events in Singapore - GYM Battles, league tournaments,
// pre-releases and beginner sessions - from the official event search
// (asia.pokemon-card.com/sg/event-search), a server-rendered list of 20 per page linked from the
// "Pokémon Game On!" page. Dates on the list are MM-DD; the year comes from the search's start date.

export interface PokemonEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "14:00-16:00"
  category: string; // e.g. "Earnest Battle", "For Beginner"
  official: boolean; // league events marked as official
  format: string; // e.g. "Standard / Open"
  title: string;
  organizer: string; // the hosting shop
  place: string;
  url: string;
}

export interface PokemonEventList {
  fetchedAt: string;
  source: string;
  sourceUrl: string;
  total: number;
  events: PokemonEvent[];
  warnings: string[];
}

const ORIGIN = 'https://asia.pokemon-card.com';
const SOURCE_URL = `${ORIGIN}/sg/event-search/search/?keyword=`;
const MAX_PAGES = 25;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-SG,en;q=0.9',
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const text = (html: string | undefined) => (html || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => code[0] === '#' ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : ENTITIES[code.toLowerCase()] ?? whole)
  .replace(/\s+/g, ' ').trim();

// "11-01" on a list that starts 2026-11-01 is 2026-11-01; "01-15" on it is 2027-01-15.
export const resolveDate = (monthDay: string, start: Date): string | null => {
  const match = monthDay.match(/^(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = start.getUTCFullYear() + (month < start.getUTCMonth() + 1 ? 1 : 0);
  return `${year}-${match[1]}-${match[2]}`;
};

export const parseEventPage = (html: string, start: Date): { events: PokemonEvent[]; pages: number; total: number } => {
  const events: PokemonEvent[] = [];
  for (const block of html.matchAll(/<a class="eventLink" href="(\/sg\/event-search\/(\d+)\/)">([\s\S]*?)<\/li>\s*<\/a>/g)) {
    const body = block[3];
    const field = (cls: string) => body.match(new RegExp(`<[a-z]+ class="${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:p|time)>`))?.[1];
    const date = resolveDate(text(field('eventDate')), start);
    const title = text(field('eventTitle'));
    if (!date || !title) continue;
    const tag = body.match(/<p class="eventTag([^"]*)">([\s\S]*?)<\/p>/);
    events.push({
      id: block[2],
      date,
      time: text(field('eventTime')),
      category: text(tag?.[2]) || 'Event',
      official: /\bofficial\b/.test(tag?.[1] || ''),
      format: text(field('formatAndLeague')).replace(/^\/\s*/, '').trim(),
      title,
      organizer: text(field('organizer')),
      place: text(field('place')),
      url: `${ORIGIN}${block[1]}`,
    });
  }
  const pages = Number(html.match(/class="resultTotalPages">[^0-9]*(\d+)\s*pages/)?.[1]) || 1;
  const total = Number(html.match(/class="resultNumber">\s*(\d+)/)?.[1]) || events.length;
  return { events, pages, total };
};

// The search takes its start date as MM-DD-YYYY, in Singapore time.
const singaporeToday = () => new Date(Date.now() + 8 * 3600_000);
const startParam = (day: Date) => `${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}-${day.getUTCFullYear()}`;

const fetchPage = async (page: number, start: Date) => {
  const url = `${ORIGIN}/sg/event-search/search/?pageNo=${page}&keyword=&startDate=${startParam(start)}`;
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`the event search answered ${response.status}`);
  return parseEventPage(await response.text(), start);
};

const CACHE_MS = 3 * 3600_000;
const MIN_REFRESH_MS = 60_000;
let cache: PokemonEventList | null = null;

export async function handlePokemonEvents(request: Request): Promise<Response> {
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';
  const age = cache ? Date.now() - Date.parse(cache.fetchedAt) : Infinity;
  if (cache && age < (refresh ? MIN_REFRESH_MS : CACHE_MS)) return Response.json(cache);
  try {
    const start = singaporeToday();
    const first = await fetchPage(1, start);
    const warnings: string[] = [];
    const rest = await Promise.all(Array.from({ length: Math.min(first.pages, MAX_PAGES) - 1 }, (_, i) => i + 2).map(page =>
      fetchPage(page, start).then(result => result.events).catch(() => { warnings.push(`Page ${page} of the event search couldn't be read.`); return []; })));
    const seen = new Set<string>();
    const events = [...first.events, ...rest.flat()].filter(event => !seen.has(event.id) && seen.add(event.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    if (first.pages > MAX_PAGES) warnings.push(`Only the first ${MAX_PAGES} pages of events are shown.`);
    cache = { fetchedAt: new Date().toISOString(), source: 'Pokémon TCG Asia event search', sourceUrl: SOURCE_URL, total: first.total, events, warnings };
    return Response.json(cache);
  } catch (error) {
    if (cache) return Response.json(cache);
    return Response.json({ error: `The official event list couldn't be loaded: ${error instanceof Error ? error.message : 'unknown error'}.` }, { status: 502 });
  }
}
