// Insurance tools that sit beside the policy register: premiums into the budget, protection gap
// and travel checks, "Am I covered?" questions and the emergency card. Kept free of React so the
// date and money logic is testable on its own.
import type { Expense, Income, Subscription } from '../types';
import { policyStatus, type InsurancePolicy } from './insuranceService';

const day = 86_400_000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);
export const addDays = (date: string, days: number) => toDate(toTime(date) + days * day);

/** A real policy (not a quotation) that isn't archived. */
const isPolicy = (p: InsurancePolicy) => p.recordType !== 'Quotation' && !p.archived;
/** In force today. */
export const inForce = (p: InsurancePolicy, today: string) => isPolicy(p) && policyStatus(p, today) === 'Active';

// People: the explicit list when there is one, else the insured-person label. Matching ignores
// case and spacing, because imports often write names in capitals.
export const personKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
export const policyPeople = (p: InsurancePolicy) => (p.people?.length ? p.people : [p.insuredPerson]).map(n => n.trim().replace(/\s+/g, ' ')).filter(Boolean);
/** Everyone named on a policy, in a readable spelling (mixed case preferred over all caps). */
export function peopleOf(policies: InsurancePolicy[]) {
  const names = new Map<string, string>();
  for (const p of policies) for (const name of policyPeople(p)) {
    const key = personKey(name); const seen = names.get(key);
    if (!seen || (seen === seen.toUpperCase() && name !== name.toUpperCase())) names.set(key, name);
  }
  return [...names.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
}
export const covers = (p: InsurancePolicy, key: string) => policyPeople(p).some(n => personKey(n) === key);

// ---------- Premiums into the budget ----------

// A marker in the subscription or expense notes ties it back to its policy, so the policy
// record itself never has to change.
export const policyMarker = (policyId: string) => `[insurance:${policyId}]`;
export const linkedTo = <T extends { notes?: string }>(rows: T[], policyId: string) => rows.filter(r => r.notes?.includes(policyMarker(policyId)));

export type BudgetMode = 'subscription' | 'expense' | 'none';
/** Monthly and yearly premiums map onto subscription billing cycles; others are logged per payment. */
export function budgetMode(p: InsurancePolicy): BudgetMode {
  if (!isPolicy(p) || !p.premium) return 'none';
  return p.frequency === 'Monthly' || p.frequency === 'Yearly' ? 'subscription' : 'expense';
}

export function premiumSubscription(p: InsurancePolicy, today: string, color: string): Omit<Subscription, 'id' | 'nextPaymentDate'> {
  if (budgetMode(p) !== 'subscription') throw new Error('Only monthly or yearly premiums can be tracked as recurring.');
  return {
    name: `${p.insurer} · ${p.name}`.slice(0, 120), price: p.premium, currency: p.currency,
    billingCycle: p.frequency as 'Monthly' | 'Yearly',
    firstPaymentDate: p.paymentDueDate || p.renewalDate || p.startDate || today,
    category: 'Insurance', cardName: 'None', color, status: 'Active',
    notes: `Insurance premium for ${p.name}${p.policyNumber ? ` (${p.policyNumber})` : ''}. ${policyMarker(p.id)}`,
  };
}

export function premiumExpense(p: InsurancePolicy, date: string, color: string): Omit<Expense, 'id'> {
  if (!p.premium) throw new Error('This policy has no premium recorded.');
  return {
    name: `${p.insurer} · ${p.name}`.slice(0, 120), amount: p.premium, currency: p.currency, expenseDate: date,
    category: 'Insurance', color,
    notes: `${p.frequency === 'One-time' ? 'Premium' : `${p.frequency} premium`} for ${p.name}${p.policyNumber ? ` (${p.policyNumber})` : ''}. ${policyMarker(p.id)}`,
  };
}

// ---------- Protection gaps ----------

const CYCLE_PER_YEAR: Record<string, number> = { Daily: 365, Weekly: 52, Monthly: 12, Yearly: 1 };
/**
 * Yearly earned (Active-kind) income: recurring income at its yearly rate plus one-time income in
 * the past 12 months. `convert` turns each amount into the chosen currency.
 */
export function annualEarnedIncome(incomes: Income[], today: string, convert: (amount: number, from: string) => number) {
  const yearAgo = addDays(today, -365);
  let total = 0;
  for (const i of incomes) {
    if (i.incomeType !== 'Active') continue;
    if (i.incomeMode === 'One-time') {
      const date = (i.incomeDate || i.firstIncomeDate || '').slice(0, 10);
      if (date > yearAgo && date <= today) total += convert(i.amount, i.currency);
    } else if (i.status === 'Active' && (!i.cancellationDate || i.cancellationDate.slice(0, 10) > today)) {
      total += convert(i.amount * (CYCLE_PER_YEAR[i.incomeCycle] ?? 0), i.currency);
    }
  }
  return Math.round(total * 100) / 100;
}

export type GapLevel = 'Covered' | 'Low' | 'None' | 'Check';
export interface GapRow { kind: string; label: string; have: number; target: number | null; level: GapLevel; note: string; policies: InsurancePolicy[] }

// Benchmarks from the Life Insurance Association Singapore's protection gap study: death cover of
// about 9x and critical illness cover of about 4x annual income. Rules of thumb, not advice.
export const BENCHMARKS = { life: 9, critical: 4 };

export function protectionGaps(policies: InsurancePolicy[], person: string, income: number, convert: (amount: number, from: string) => number, today: string): GapRow[] {
  const mine = policies.filter(p => inForce(p, today) && covers(p, person) && p.kind !== 'Travel');
  const ofKind = (kind: InsurancePolicy['kind']) => mine.filter(p => p.kind === kind);
  const sum = (rows: InsurancePolicy[]) => Math.round(rows.reduce((s, p) => s + convert(p.coverage, p.currency), 0));
  const multiple = (kind: InsurancePolicy['kind'], label: string, times: number): GapRow => {
    const rows = ofKind(kind); const have = sum(rows); const target = income > 0 ? Math.round(income * times) : null;
    const level: GapLevel = !rows.length ? 'None' : target === null ? 'Check' : have >= target ? 'Covered' : 'Low';
    const note = target === null ? `Benchmark is about ${times}× yearly income. Enter an income to compare.` : `Benchmark: about ${times}× yearly income.`;
    return { kind, label, have, target, level, note, policies: rows };
  };
  const present = (kind: InsurancePolicy['kind'], label: string, note: string): GapRow => {
    const rows = ofKind(kind);
    return { kind, label, have: sum(rows), target: null, level: rows.length ? 'Covered' : 'None', note, policies: rows };
  };
  return [
    multiple('Life', 'Death and total permanent disability', BENCHMARKS.life),
    multiple('Critical illness', 'Critical illness', BENCHMARKS.critical),
    present('Medical', 'Hospital and surgical', 'Large hospital bills are the most common claim. A hospitalisation plan (e.g. an Integrated Shield plan) is the usual base cover.'),
    present('Disability', 'Disability income', 'Replaces part of your income if you cannot work. Often overlooked.'),
    present('Personal accident', 'Personal accident', 'Low-cost cover for accidental injury, medical bills and death.'),
  ];
}

// ---------- Travel overlaps and trip check ----------

export interface Overlap { a: InsurancePolicy; b: InsurancePolicy; start: string; end: string; people: string[] }
/** Pairs of travel policies covering the same person on the same days. Expired and quotations are ignored. */
export function travelOverlaps(policies: InsurancePolicy[], today: string): Overlap[] {
  const trips = policies.filter(p => p.kind === 'Travel' && isPolicy(p) && p.startDate && p.endDate && p.endDate >= today);
  const out: Overlap[] = [];
  for (let i = 0; i < trips.length; i++) for (let j = i + 1; j < trips.length; j++) {
    const a = trips[i], b = trips[j];
    const start = a.startDate > b.startDate ? a.startDate : b.startDate;
    const end = a.endDate < b.endDate ? a.endDate : b.endDate;
    if (start > end) continue;
    const keys = new Set(policyPeople(b).map(personKey));
    const people = policyPeople(a).filter(n => keys.has(personKey(n)));
    if (people.length) out.push({ a, b, start, end, people });
  }
  return out.sort((x, y) => x.start.localeCompare(y.start));
}

export interface TripSpan { start: string; end: string; policies: InsurancePolicy[] }
/** Splits a trip into runs of days with the same travel cover; a run with no policies is a gap. */
export function checkTrip(policies: InsurancePolicy[], start: string, end: string, person?: string): TripSpan[] {
  if (!start || !end || end < start) return [];
  if ((toTime(end) - toTime(start)) / day > 366) throw new Error('Check a trip of up to a year at a time.');
  const travel = policies.filter(p => p.kind === 'Travel' && isPolicy(p) && p.startDate && p.endDate && (!person || covers(p, person)));
  const spans: TripSpan[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const on = travel.filter(p => p.startDate <= d && d <= p.endDate);
    const last = spans[spans.length - 1];
    if (last && last.policies.length === on.length && last.policies.every(p => on.includes(p))) last.end = d;
    else spans.push({ start: d, end: d, policies: on });
  }
  return spans;
}

// ---------- Am I covered? ----------

export interface CoverAnswer { verdict: 'Covered' | 'Partly covered' | 'Not covered' | 'Unclear'; answer: string; limits: string[]; conditions: string[]; evidence: string[] }
const VERDICTS: CoverAnswer['verdict'][] = ['Covered', 'Partly covered', 'Not covered', 'Unclear'];
export const MAX_WORDING_CHARS = 60_000;

/** Everything recorded about a policy, as plain text for the model. */
export function policyFacts(p: InsurancePolicy) {
  const lines = [
    `Policy: ${p.name} (${p.kind}) by ${p.insurer}`, `Insured: ${policyPeople(p).join(', ')}`,
    p.startDate || p.endDate ? `Coverage dates: ${p.startDate || '?'} to ${p.endDate || 'no end date'}` : '',
    p.destination ? `Destination / region: ${p.destination}` : '',
    `Main limit: ${p.currency} ${p.coverage}`, `Deductible / excess: ${p.currency} ${p.deductible}`,
    p.coPaymentPercent !== undefined ? `Co-payment: ${p.coPaymentPercent}%` : '',
    p.limitBasis ? `Limit basis: ${p.limitBasis}` : '', p.waitingPeriod ? `Waiting period: ${p.waitingPeriod}` : '',
    p.riders ? `Riders: ${p.riders}` : '', p.exclusions ? `Exclusions: ${p.exclusions}` : '', p.notes ? `Notes: ${p.notes}` : '',
  ].filter(Boolean);
  const benefits = (p.benefits ?? []).map(b => `${b.subLimit ? '  - ' : '- '}${b.name}: ${b.limitText || (b.limit === null ? 'Included' : `${p.currency} ${b.limit}`)}${b.details ? ` (${b.details})` : ''}`);
  return [...lines, benefits.length ? `Benefit schedule:\n${benefits.join('\n')}` : 'No itemised benefit schedule recorded.'].join('\n');
}

export function coverPrompt(p: InsurancePolicy, question: string, wording: string) {
  return `You answer questions about one insurance policy using ONLY the information below. Never rely on general knowledge of what policies usually cover. If the information does not settle the question, the verdict is "Unclear" and you say what to check or ask the insurer.

${policyFacts(p)}

${wording ? `Policy wording (extracted from the stored document, may be truncated):\n"""\n${wording}\n"""` : 'No policy wording document is available; only the summary above.'}

Question: ${question}

Reply with JSON only, no prose around it:
{"verdict": "Covered" | "Partly covered" | "Not covered" | "Unclear",
 "answer": "2-4 plain sentences answering the question",
 "limits": ["relevant limits with amounts, e.g. 'Trip delay: SGD 100 per 6 hours, up to SGD 1,000'"],
 "conditions": ["conditions, exclusions or documents needed that apply"],
 "evidence": ["short exact quotes from the information above that support the answer"]}`;
}

export function parseCoverAnswer(reply: string): CoverAnswer {
  const json = reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
  let data: any;
  try { data = JSON.parse(json); } catch { throw new Error('The answer could not be read. Try asking again.'); }
  const list = (v: unknown) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, 8) : [];
  const answer = typeof data?.answer === 'string' ? data.answer.trim() : '';
  if (!answer) throw new Error('The answer was empty. Try asking again.');
  return { verdict: VERDICTS.includes(data.verdict) ? data.verdict : 'Unclear', answer, limits: list(data.limits), conditions: list(data.conditions), evidence: list(data.evidence) };
}

// ---------- Emergency card ----------

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const shortDate = (d: string) => d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** Policies worth carrying: in force or starting within 60 days, travel first. */
export function emergencyPolicies(policies: InsurancePolicy[], today: string) {
  const soon = addDays(today, 60);
  return policies.filter(p => isPolicy(p) && (policyStatus(p, today) === 'Active' || (policyStatus(p, today) === 'Upcoming' && p.startDate <= soon)))
    .sort((a, b) => Number(b.kind === 'Travel') - Number(a.kind === 'Travel') || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

/** A self-contained printable page; print it or save it as PDF from the browser's print dialog. */
export function emergencyCardHtml(policies: InsurancePolicy[], today: string, owner: string) {
  const rows = policies.map(p => {
    const medical = (p.benefits ?? []).find(b => !b.subLimit && /medical|hospital/i.test(b.name));
    return `<section><h2>${esc(p.name)}</h2><p class="meta">${esc(p.kind)} · ${esc(p.insurer)}${p.kind === 'Travel' && p.destination ? ` · ${esc(p.destination)}` : ''}</p><dl>
<dt>Policy no.</dt><dd class="mono">${esc(p.policyNumber || 'Not recorded')}</dd>
<dt>Claims / emergency</dt><dd class="big">${p.emergencyPhone ? `<a href="tel:${esc(p.emergencyPhone.replace(/[^+\d]/g, ''))}">${esc(p.emergencyPhone)}</a>` : 'Not recorded'}</dd>
<dt>Insured</dt><dd>${esc(policyPeople(p).join(', '))}</dd>
${p.startDate || p.endDate ? `<dt>Cover</dt><dd>${esc(shortDate(p.startDate))} – ${esc(p.endDate ? shortDate(p.endDate) : 'ongoing')}</dd>` : ''}
${medical ? `<dt>${esc(medical.name)}</dt><dd>${esc(medical.limitText || (medical.limit === null ? 'Included' : `${p.currency} ${medical.limit.toLocaleString()}`))}</dd>` : ''}
</dl></section>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Insurance emergency card</title>
<style>body{font:14px/1.4 system-ui,sans-serif;color:#111;background:#fff;margin:0;padding:16px;max-width:760px}h1{font-size:20px;margin:0}header p{color:#555;margin:4px 0 16px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}section{border:1.5px solid #222;border-radius:10px;padding:12px;break-inside:avoid}
h2{font-size:15px;margin:0}.meta{color:#555;margin:2px 0 8px;font-size:12px}dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:0}dt{color:#555;font-size:12px}dd{margin:0}
.big{font-size:16px;font-weight:700}.mono{font-family:ui-monospace,monospace}a{color:inherit}footer{margin-top:16px;color:#777;font-size:11px}@media print{body{padding:0}}</style></head>
<body><header><h1>Insurance emergency card${owner ? ` · ${esc(owner)}` : ''}</h1><p>Generated ${esc(shortDate(today))}. Call the claims or assistance line before arranging treatment where possible.</p></header>
<main>${rows || '<p>No policies are in force or starting soon.</p>'}</main><footer>Check limits and conditions in the full policy wording.</footer></body></html>`;
}
