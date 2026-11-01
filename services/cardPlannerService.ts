import type { MarketCard, MarketCountry } from './creditCardMarketService';

export const SPEND_CATEGORIES = [
  { id: 'online', label: 'Online', pattern: /online|e[- ]?commerce|internet/i },
  { id: 'local', label: 'Local retail', pattern: /local|domestic|retail spend/i },
  { id: 'groceries', label: 'Groceries', pattern: /grocer|supermarket/i },
  { id: 'dining', label: 'Dining', pattern: /dining|restaurant|food delivery/i },
  { id: 'petrol', label: 'Petrol', pattern: /petrol|fuel|shell|caltex|petronas/i },
  { id: 'bills', label: 'Bills & utilities', pattern: /utilit|bill payment/i },
  { id: 'travel', label: 'Travel', pattern: /travel|airline|air miles|airmiles|airport/i },
  { id: 'overseas', label: 'Overseas', pattern: /overseas|foreign|international spend/i },
  { id: 'ewallet', label: 'E-wallet', pattern: /e[- ]?wallet/i },
  { id: 'other', label: 'Other', pattern: /(?!) / },
] as const;
export type SpendCategory = typeof SPEND_CATEGORIES[number]['id'];
export interface PlannerAllocation { category: SpendCategory; amount: number; rate: number | null; cap: number | null }
export interface PlannerCard {
  id: string; name: string; issuer: string; imageUrl: string | null; sourceUrl: string | null; source: string;
  mentions: SpendCategory[]; evidence: string[];
  creditLimit: number | null; balance: number; creditGroup: string;
  cashbackCap: number | null; cashbackGroup: string; uncappedCashback: boolean; minimumSpend: number; conditions: string;
  allocations: PlannerAllocation[];
}
export interface CardPlan { version: 1; country: MarketCountry; budget: number | null; cards: PlannerCard[] }
export const PLANNER_DRAG_TYPE = 'application/x-subtrack-planner-card';
export const PLANNER_MOVE_TYPE = 'application/x-subtrack-planner-move';
export const currencyFor = (country: MarketCountry) => country === 'my' ? 'MYR' : 'SGD';
export const emptyCardPlan = (country: MarketCountry): CardPlan => ({ version: 1, country, budget: null, cards: [] });
export const planStorageKey = (owner: string, country: MarketCountry) => `subtrack_card_plan_v1:${encodeURIComponent(owner)}:${country}`;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const validAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
const optionalAmount = (value: unknown) => value === null || validAmount(value);
export const categoryLabel = (id: SpendCategory) => SPEND_CATEGORIES.find(c => c.id === id)!.label;
export const safePlannerUrl = (url: unknown): string | null => { try { const u = new URL(String(url)); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; } };

export function plannerCardFromMarket(card: MarketCard, country: MarketCountry): PlannerCard {
  const evidence = [...card.highlights.map(h => `${h.value} ${h.label}`), ...card.keyFeatures, ...card.categories];
  const text = evidence.join(' ');
  return { id: `market:${country}:${card.id}`, name: card.name, issuer: card.issuer, imageUrl: safePlannerUrl(card.imageUrl), sourceUrl: safePlannerUrl(card.url), source: country === 'my' ? 'RinggitPlus listing' : 'MoneySmart listing', mentions: SPEND_CATEGORIES.filter(c => c.pattern.test(text)).map(c => c.id), evidence: evidence.slice(0, 8), creditLimit: null, balance: 0, creditGroup: '', cashbackCap: null, cashbackGroup: '', uncappedCashback: false, minimumSpend: 0, conditions: '', allocations: [] };
}
export function addPlannerCard(plan: CardPlan, card: PlannerCard): CardPlan {
  return plan.cards.some(item => samePlannerCard(item, card)) ? plan : { ...plan, cards: [...plan.cards, { ...card, allocations: [...card.allocations] }] };
}
export const samePlannerCard = (a: PlannerCard, b: PlannerCard) => a.id === b.id || a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
export function movePlannerCard(plan: CardPlan, source: string, target: string): CardPlan {
  const from = plan.cards.findIndex(c => c.id === source), to = plan.cards.findIndex(c => c.id === target);
  if (from < 0 || to < 0 || from === to) return plan;
  const cards = [...plan.cards]; cards.splice(to, 0, cards.splice(from, 1)[0]); return { ...plan, cards };
}
export function readCardPlan(owner: string, country: MarketCountry): CardPlan {
  const raw = localStorage.getItem(planStorageKey(owner, country)); if (!raw) return emptyCardPlan(country);
  const plan = JSON.parse(raw);
  if (plan?.version !== 1 || plan.country !== country || !optionalAmount(plan.budget) || !Array.isArray(plan.cards) || plan.cards.length > 100) throw new Error('The saved card board could not be read. It has not been overwritten.');
  const ids = new Set<string>();
  for (const card of plan.cards) {
    if (!card || typeof card.id !== 'string' || ids.has(card.id) || typeof card.name !== 'string' || typeof card.issuer !== 'string' || typeof card.source !== 'string' || typeof card.creditGroup !== 'string' || typeof card.conditions !== 'string' || !optionalAmount(card.creditLimit) || !validAmount(card.balance) || !optionalAmount(card.cashbackCap) || typeof card.uncappedCashback !== 'boolean' || !validAmount(card.minimumSpend) || !Array.isArray(card.allocations) || !Array.isArray(card.mentions) || !Array.isArray(card.evidence) || card.evidence.some((v: unknown) => typeof v !== 'string')) throw new Error('The saved card board contains an invalid card. It has not been overwritten.');
    ids.add(card.id); const categories = new Set();
    if (card.cashbackGroup === undefined) card.cashbackGroup = '';
    if (typeof card.cashbackGroup !== 'string') throw new Error('The saved cashback group could not be read.');
    for (const row of card.allocations) {
      if (!row || !SPEND_CATEGORIES.some(c => c.id === row.category) || categories.has(row.category) || !validAmount(row.amount) || !optionalAmount(row.rate) || row.rate > 100 || !optionalAmount(row.cap)) throw new Error('The saved spending rules could not be read.');
      categories.add(row.category);
    }
    if (card.mentions.some((id: string) => !SPEND_CATEGORIES.some(c => c.id === id))) throw new Error('The saved category suggestions could not be read.');
    card.imageUrl = safePlannerUrl(card.imageUrl); card.sourceUrl = safePlannerUrl(card.sourceUrl);
  }
  return plan;
}
export function writeCardPlan(owner: string, plan: CardPlan) { localStorage.setItem(planStorageKey(owner, plan.country), JSON.stringify(plan)); }

export function calculateCardPlan(plan: CardPlan) {
  const rows = plan.cards.map(card => {
    const planned = round(card.allocations.reduce((sum, a) => sum + a.amount, 0));
    const minimumMet = planned >= card.minimumSpend;
    const capKnown = card.cashbackCap !== null || card.uncappedCashback;
    const knownRows = card.allocations.filter(a => a.amount > 0 && a.rate !== null);
    const beforeCap = minimumMet ? knownRows.reduce((sum, a) => sum + Math.min(a.amount * a.rate! / 100, a.cap ?? Infinity), 0) : 0;
    const cashback = capKnown ? round(Math.min(beforeCap, card.cashbackCap ?? Infinity)) : 0;
    return { card, planned, minimumMet, cashback, capKnown, capped: card.cashbackCap !== null && beforeCap >= card.cashbackCap, rewardComplete: planned === 0 || !minimumMet || capKnown && card.allocations.every(a => a.amount === 0 || a.rate !== null) };
  });
  // A shared rewards cap is applied once, independently of shared credit limits.
  const rewardGroups = new Map<string, typeof rows>();
  for (const row of rows) if (row.card.cashbackGroup.trim()) {
    const key = row.card.cashbackGroup.trim().toLowerCase(); rewardGroups.set(key, [...(rewardGroups.get(key) || []), row]);
  }
  let inconsistentRewardGroups = 0;
  for (const members of rewardGroups.values()) {
    const first = members[0].card;
    const consistent = members.every(r => r.capKnown && r.card.cashbackCap === first.cashbackCap && r.card.uncappedCashback === first.uncappedCashback);
    const cap = first.cashbackCap ?? Infinity;
    const total = members.reduce((sum, r) => sum + r.cashback, 0);
    if (!consistent) inconsistentRewardGroups++;
    let remaining = consistent ? cap : 0;
    for (const row of members) {
      row.cashback = round(Math.min(row.cashback, remaining)); remaining = Math.max(0, round(remaining - row.cashback));
      row.capKnown = consistent;
      row.capped = consistent && total >= cap;
      row.rewardComplete = row.rewardComplete && (consistent || row.planned === 0);
    }
  }
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) { const key = row.card.creditGroup.trim() ? `shared:${row.card.creditGroup.trim().toLowerCase()}` : `card:${row.card.id}`; grouped.set(key, [...(grouped.get(key) || []), row]); }
  const groups = [...grouped.entries()].map(([id, members]) => {
    const limits = members.map(m => m.card.creditLimit), known = limits.every(n => n !== null), consistent = known && limits.every(n => n === limits[0]);
    const limit = consistent ? limits[0]! : null, balance = round(members.reduce((sum, m) => sum + m.card.balance, 0)), planned = round(members.reduce((sum, m) => sum + m.planned, 0));
    return { id, members: members.map(m => m.card.id), limit, balance, planned, available: limit === null ? null : round(Math.max(0, limit - balance)), overLimit: limit !== null && round(balance + planned) > limit, inconsistent: known && !consistent };
  });
  const planned = round(rows.reduce((sum, r) => sum + r.planned, 0));
  const knownGroups = groups.filter(g => g.available !== null);
  const available = round(knownGroups.reduce((sum, g) => sum + g.available!, 0));
  const afterPlan = round(knownGroups.reduce((sum, g) => sum + g.available! - g.planned, 0));
  const cashback = round(rows.reduce((sum, r) => sum + r.cashback, 0));
  const totalLimit = round(knownGroups.reduce((sum, g) => sum + g.limit!, 0));
  return { rows, groups, planned, available, afterPlan, totalLimit, cashback, remainingBudget: plan.budget === null ? null : round(plan.budget - planned), unknownLimits: rows.filter(r => r.card.creditLimit === null).length, inconsistentGroups: groups.filter(g => g.inconsistent).length, inconsistentRewardGroups, rewardComplete: rows.every(r => r.rewardComplete) };
}

export function categoryGuidance(plan: CardPlan) {
  const result = calculateCardPlan(plan);
  return SPEND_CATEGORIES.map(category => {
    const candidates = result.rows.flatMap(row => {
      const rule = row.card.allocations.find(a => a.category === category.id);
      if (!rule || rule.rate === null || rule.rate <= 0) return [];
      const capped = row.capped || rule.cap !== null && rule.amount * rule.rate / 100 >= rule.cap;
      const group = result.groups.find(g => g.members.includes(row.card.id))!;
      const noCredit = group.available !== null && round(group.available - group.planned) <= 0;
      const ready = !capped && row.minimumMet && row.capKnown && !noCredit;
      return [{ id: row.card.id, name: row.card.name, rate: rule.rate, minimumMet: row.minimumMet, capKnown: row.capKnown, capped, noCredit, ready, conditions: row.card.conditions }];
    }).sort((a, b) => Number(b.ready) - Number(a.ready) || Number(a.capped) - Number(b.capped) || Number(b.minimumMet) - Number(a.minimumMet) || b.rate - a.rate);
    const mentions = plan.cards.filter(card => card.mentions.includes(category.id)).map(card => ({ name: card.name, url: card.sourceUrl }));
    return { category, candidates, mentions };
  }).filter(row => row.candidates.length || row.mentions.length);
}
