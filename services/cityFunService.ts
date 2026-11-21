// My City extras: timed city events with a choice to make, and achievements. Pure rules like the
// rest of the game. Rewards scale with the city's income so they stay worth it as the city grows,
// and nothing here rewards real spending, earning or trading.
import {
  currentStreak, earn, getBuilding, household, levelForXp, touch,
  type BuildingCategory, type CityState, type CityStats,
} from './cityGameService';

const HOUR = 3_600_000;
/** A new event every 3 hours; each lasts until the next one. */
export const EVENT_WINDOW_MS = 3 * HOUR;

type EventKind = 'festival' | 'rush' | 'wallet' | 'outage' | 'harvest' | 'openday';
interface EventDef {
  kind: EventKind;
  icon: string;
  categories: BuildingCategory[];
  title: (place: string) => string;
  story: (place: string, person: string) => string;
  choices: [string, string]; // [more coins, more XP]
}
const EVENTS: EventDef[] = [
  { kind: 'festival', icon: '🎉', categories: ['recreation', 'culture', 'services', 'nature'], title: p => `Street festival at the ${p}`, story: p => `The neighbourhood wants a party at the ${p} tonight.`, choices: ['Book a live band', 'Hand out free snacks'] },
  { kind: 'rush', icon: '🛍️', categories: ['business', 'shopping', 'dining'], title: p => `Rush hour at the ${p}`, story: p => `Queues are out the door at the ${p}!`, choices: ['Open an extra counter', 'Train a new hire'] },
  { kind: 'wallet', icon: '👛', categories: ['homes', 'highrise'], title: p => `Lost wallet near the ${p}`, story: (p, who) => `${who} dropped a wallet on the way home to the ${p}.`, choices: ['Return it in person', 'Post it on the noticeboard'] },
  { kind: 'outage', icon: '⚡', categories: ['utilities'], title: p => `Trouble at the ${p}`, story: p => `A fuse blew at the ${p} during the evening peak.`, choices: ['Send the repair crew', 'Teach an apprentice'] },
  { kind: 'harvest', icon: '🌾', categories: ['farming', 'fishing', 'harbour'], title: p => `Bumper day at the ${p}`, story: p => `The ${p} had its best day of the season.`, choices: ['Sell at the market', 'Share with neighbours'] },
];
const OPEN_DAY: EventDef = { kind: 'openday', icon: '🏛️', categories: [], title: () => 'Open day at the Town Hall', story: () => 'Residents are visiting the Town Hall to meet the mayor.', choices: ['Sell guided tours', 'Host a Q&A'] };

export interface CityEvent {
  key: string; // the 3-hour window, e.g. "ev:16612345"
  kind: EventKind;
  icon: string;
  buildingId: string; // or 'hall'
  title: string;
  story: string;
  endsAt: number;
  choices: Array<{ label: string; coins: number; xp: number }>;
  resolved: boolean;
}

const hash = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** This window's event: the same for every visit (and every tab) during the window. */
export const currentEvent = (state: CityState, stats: CityStats, now: number): CityEvent => {
  const window = Math.floor(now / EVENT_WINDOW_MS);
  const key = `ev:${window}`;
  // Only working buildings host events, so the event always makes sense where it happens.
  const working = state.buildings.filter(b => stats.status.get(b.id)?.road).sort((a, b) => a.id.localeCompare(b.id));
  const options = EVENTS.map(def => ({ def, places: working.filter(b => def.categories.includes(getBuilding(b.type)!.category) && b.type !== 'tree') })).filter(o => o.places.length);
  const h = hash(key);
  const pick = options.length ? options[h % options.length] : null;
  const def = pick?.def ?? OPEN_DAY;
  const building = pick ? pick.places[Math.floor(h / 7) % pick.places.length] : null;
  const place = building ? getBuilding(building.type)!.name.toLowerCase() : 'Town Hall';
  const person = building ? household(building.id, 1)[0] ?? 'A resident' : 'A resident';
  // About half an hour of the city's income, at least 40 coins; the other choice trades coins for XP.
  const coins = Math.max(40, Math.round(stats.incomePerHour * 0.5));
  return {
    key, kind: def.kind, icon: def.icon, buildingId: building?.id ?? 'hall',
    title: def.title(place), story: def.story(place, person), endsAt: (window + 1) * EVENT_WINDOW_MS,
    choices: [
      { label: def.choices[0], coins, xp: 10 },
      { label: def.choices[1], coins: Math.round(coins * 0.4), xp: Math.max(30, Math.min(400, Math.round(coins / 20))) },
    ],
    resolved: Boolean(state.events?.resolved.includes(key)),
  };
};

export const resolveEvent = (state: CityState, event: CityEvent, choice: number, now: number, today: string): { state?: CityState; error?: string } => {
  if (now >= event.endsAt || event.key !== `ev:${Math.floor(now / EVENT_WINDOW_MS)}`) return { error: 'That event has ended. A new one is on.' };
  if (state.events?.resolved.includes(event.key)) return { error: 'You already handled this one.' };
  const option = event.choices[choice];
  if (!option) return { error: 'Pick one of the options.' };
  const events = { helped: (state.events?.helped || 0) + 1, resolved: [...(state.events?.resolved || []), event.key].slice(-50) };
  return { state: touch({ ...earn(state, option.coins, option.xp), events }, now, today) };
};

// ---------------------------------------------------------------------------------------------
// Achievements: each has tiers; every tier reached can be claimed once.

const TIER_REWARDS = [{ coins: 150, xp: 40 }, { coins: 600, xp: 120 }, { coins: 2500, xp: 300 }, { coins: 10000, xp: 700 }];
const DEFS: Array<{ id: string; icon: string; title: string; unit: string; tiers: number[]; value: (s: CityState, stats: CityStats, today: string) => number }> = [
  { id: 'residents', icon: '👥', title: 'Growing town', unit: 'residents', tiers: [100, 1000, 10000, 50000], value: (_s, st) => st.residents },
  { id: 'buildings', icon: '🏗️', title: 'Master builder', unit: 'buildings', tiers: [10, 50, 150, 400], value: s => s.buildings.length },
  { id: 'roads', icon: '🛣️', title: 'Road network', unit: 'road tiles', tiers: [50, 200, 600, 1500], value: s => s.roads.length },
  { id: 'happy', icon: '😊', title: 'Happy citizens', unit: 'happiness', tiers: [70, 85, 95, 100], value: (_s, st) => st.happiness },
  { id: 'coins', icon: '🪙', title: 'City treasury', unit: 'coins earned', tiers: [10000, 100000, 1000000, 10000000], value: s => s.lifetimeCoins },
  { id: 'streak', icon: '🔥', title: 'Habit streak', unit: 'days in a row', tiers: [3, 7, 30, 100], value: (s, _st, today) => Math.max(s.streak?.best || 0, currentStreak(s, today)) },
  { id: 'level', icon: '⭐', title: 'Rising star', unit: 'city level', tiers: [5, 10, 20, 30], value: s => levelForXp(s.xp) },
  { id: 'events', icon: '🎪', title: 'Community spirit', unit: 'events handled', tiers: [1, 10, 50, 200], value: s => s.events?.helped || 0 },
  { id: 'land', icon: '🗺️', title: 'Land baron', unit: 'plots owned', tiers: [8, 16, 32, 64], value: s => s.chunks.length },
];

export interface Achievement {
  id: string; icon: string; title: string; unit: string; value: number;
  tier: number; // tiers claimed so far (0-4)
  next: number | null; // the next target, or null when all are claimed
  claimable: boolean; // the next tier is reached and not yet claimed
  reward: { coins: number; xp: number } | null;
}

export const achievements = (state: CityState, stats: CityStats, today: string): Achievement[] => DEFS.map(def => {
  const claimed = new Set(state.achievements || []);
  const value = def.value(state, stats, today);
  const tier = def.tiers.findIndex((_, i) => !claimed.has(`${def.id}:${i}`));
  const done = tier === -1;
  return {
    id: def.id, icon: def.icon, title: def.title, unit: def.unit, value,
    tier: done ? def.tiers.length : tier,
    next: done ? null : def.tiers[tier],
    claimable: !done && value >= def.tiers[tier],
    reward: done ? null : TIER_REWARDS[tier],
  };
});

export const claimAchievement = (state: CityState, stats: CityStats, id: string, now: number, today: string): { state?: CityState; error?: string; reward?: { coins: number; xp: number } } => {
  const item = achievements(state, stats, today).find(a => a.id === id);
  if (!item) return { error: 'Unknown achievement.' };
  if (!item.claimable || !item.reward) return { error: item.next === null ? 'All tiers claimed.' : `Reach ${item.next.toLocaleString()} ${item.unit} first.` };
  return { state: touch({ ...earn(state, item.reward.coins, item.reward.xp), achievements: [...(state.achievements || []), `${id}:${item.tier}`] }, now, today), reward: item.reward };
};

/** How long the city has been left alone, and what it earned meanwhile; null for short breaks. */
export const awaySummary = (state: CityState, pendingTotal: number, now: number) => {
  const away = now - state.updatedAt;
  if (!state.updatedAt || away < HOUR || pendingTotal < 1) return null;
  const hours = Math.floor(away / HOUR);
  const text = hours >= 48 ? `${Math.floor(hours / 24)} days` : hours >= 24 ? `1 day ${hours - 24}h` : `${hours} hour${hours === 1 ? '' : 's'}`;
  return { away, text, coins: Math.floor(pendingTotal) };
};
