import type { Loan, LoanPayment, SavingsEntry, SavingsGoal, Subscription } from '../types';
import { dueStatus, flatEquivalentRate, isStatementLoan, loanInstalment, loanStatus, projectPayoff } from './loanService';
import { goalPlan } from './savingsGoalMath';

// City advisors: residents who work in an advisor building and review one part of your money.
// Each agent is pure rules over records already in the app - private, instant and testable -
// in the same shape as the Accountant at the Town Hall. Reviews never change your records; they
// point at what's worth doing. Fixing something an agent flagged earns coins on the next review.

export type AgentId = 'auditor' | 'debt' | 'savings';
export type Destination = 'subscriptions' | 'debts' | 'goals';

export interface AgentFinding {
  id: string; // stable, so a fixed issue can be recognised (and rewarded) once
  tone: 'warn' | 'info' | 'good';
  title: string;
  detail: string;
  action?: { label: string; destination: Destination };
}

export interface AgentReport {
  version: 1;
  agent: AgentId;
  completedAt: string;
  fingerprint: string;
  summary: Array<{ label: string; value: string; note?: string }>;
  findings: AgentFinding[];
}

export interface AgentInput {
  today: string;
  subscriptions: Subscription[];
  loans: Loan[];
  payments: LoanPayment[];
  goals: SavingsGoal[];
  entries: SavingsEntry[];
}

export interface AgentDefinition {
  id: AgentId;
  building: string; // the BUILDINGS type the agent works in
  role: string;
  office: string; // the room's name
  color: string; // the agent's colour in their office
  intro: string;
  steps: string[];
  destination: Destination;
  destinationLabel: string;
  fingerprint: (input: AgentInput) => string;
  review: (input: AgentInput) => Pick<AgentReport, 'summary' | 'findings'>;
}

export const FIX_REWARD = { coins: 40, xp: 15 } as const;

const DAY = 86400000;
const dayMs = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
const daysUntil = (from: string, to: string) => Math.round((dayMs(to) - dayMs(from)) / DAY);
const hash = (value: unknown) => {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
};
const money = (value: number, currency: string) => `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (time: number) => new Date(time).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const byCurrency = <T,>(items: T[], currency: (item: T) => string, value: (item: T) => number) => {
  const totals = new Map<string, number>();
  items.forEach(item => totals.set(currency(item), (totals.get(currency(item)) || 0) + value(item)));
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
};

// ---------------------------------------------------------------------------------------------
// Subscription Auditor (Post Office)

const MONTHS_PER_CYCLE: Record<string, number> = { Daily: 30.4, Weekly: 4.35, Monthly: 1, Yearly: 1 / 12, 'Free Trial': 0 };
export const monthlyCost = (sub: Subscription) => (sub.price > 0 ? sub.price * (MONTHS_PER_CYCLE[sub.billingCycle] ?? 1) : 0);

// Services people often pay for twice without meaning to.
const OVERLAPS: Array<{ id: string; label: string; match: RegExp }> = [
  { id: 'music', label: 'music streaming', match: /spotify|apple music|youtube music|tidal|deezer|amazon music|joox|soundcloud/i },
  { id: 'video', label: 'video streaming', match: /netflix|disney|hbo|max\b|prime video|hulu|viu|iqiyi|apple tv|paramount|crunchyroll|youtube premium/i },
  { id: 'storage', label: 'cloud storage', match: /icloud|google one|dropbox|onedrive|box\b|pcloud/i },
  { id: 'ai', label: 'AI assistants', match: /chatgpt|openai|claude|gemini|copilot|perplexity|midjourney/i },
  { id: 'office', label: 'office suites', match: /microsoft 365|office 365|google workspace|notion|evernote/i },
];

const auditor: AgentDefinition = {
  id: 'auditor',
  building: 'postoffice',
  role: 'Subscription Auditor',
  office: 'Post Office · Subscriptions desk',
  color: '#c0392b',
  intro: 'Goes through every subscription you pay for: what it costs a month, what overlaps, which trials are about to start charging.',
  steps: ['Opening the subscription ledger', 'Working out what each one costs a month', 'Looking for services that overlap', 'Checking trials and upcoming renewals', 'Writing up the audit'],
  destination: 'subscriptions',
  destinationLabel: 'Open Subscriptions',
  fingerprint: ({ today, subscriptions }) => hash([today, subscriptions.map(s => [s.id, s.name, s.price, s.currency, s.billingCycle, s.status, s.nextPaymentDate, s.firstPaymentDate, s.category])]),
  review: ({ today, subscriptions }) => {
    const active = subscriptions.filter(sub => sub.status === 'Active');
    const paid = active.filter(sub => sub.billingCycle !== 'Free Trial' && sub.price > 0);
    const findings: AgentFinding[] = [];

    OVERLAPS.forEach(group => {
      const matches = paid.filter(sub => group.match.test(sub.name));
      if (matches.length < 2) return;
      const totals = byCurrency(matches, sub => sub.currency, monthlyCost).map(([currency, value]) => money(value, currency)).join(' + ');
      findings.push({
        id: `overlap:${group.id}:${matches.map(sub => sub.id).sort().join(',')}`,
        tone: 'warn',
        title: `${matches.length} ${group.label} services`,
        detail: `${matches.map(sub => sub.name).join(', ')} - ${totals} a month together. Keeping one could save the rest.`,
        action: { label: 'Review subscriptions', destination: 'subscriptions' },
      });
    });

    active.filter(sub => sub.billingCycle === 'Free Trial').forEach(sub => {
      const date = (sub.firstPaymentDate || sub.nextPaymentDate || '').slice(0, 10);
      const days = date ? daysUntil(today, date) : null;
      if (days === null || days < -3 || days > 14) return;
      findings.push({
        id: `trial:${sub.id}:${date}`,
        tone: 'warn',
        title: days < 0 ? `${sub.name} trial may already be charging` : `${sub.name} trial ends ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
        detail: `Decide before ${dateText(dayMs(date))} whether to keep it${sub.price > 0 ? ` - it then costs ${money(sub.price, sub.currency)}` : ''}. If you keep it, update it to a paid plan here.`,
        action: { label: 'Review the trial', destination: 'subscriptions' },
      });
    });

    paid.forEach(sub => {
      const next = (sub.nextPaymentDate || '').slice(0, 10);
      if (!next) return;
      const days = daysUntil(today, next);
      if (days < -7) {
        findings.push({ id: `stale:${sub.id}:${next}`, tone: 'warn', title: `${sub.name} has a renewal date in the past`, detail: `It shows ${dateText(dayMs(next))}. If you cancelled it, mark it as past; if it renewed, the record needs updating.`, action: { label: 'Fix the record', destination: 'subscriptions' } });
      } else if (sub.billingCycle === 'Yearly' && days >= 0 && days <= 30) {
        findings.push({ id: `annual:${sub.id}:${next}`, tone: 'info', title: `${sub.name} renews for a year on ${dateText(dayMs(next))}`, detail: `${money(sub.price, sub.currency)} in one go. A good moment to check you still use it.` });
      }
    });

    // The priciest few, for perspective.
    const priciest = [...paid].sort((a, b) => monthlyCost(b) - monthlyCost(a)).slice(0, 3);
    if (priciest.length >= 2) {
      findings.push({ id: `top:${priciest.map(sub => sub.id).join(',')}`, tone: 'info', title: 'Your biggest subscriptions', detail: priciest.map(sub => `${sub.name} ${money(monthlyCost(sub), sub.currency)}/mo`).join(' · ') });
    }
    if (paid.length > 0 && !findings.some(finding => finding.tone === 'warn')) {
      findings.unshift({ id: 'clean', tone: 'good', title: 'No overlaps or surprises', detail: 'Nothing duplicated, no trials about to charge, and every renewal date looks current.' });
    }

    const monthly = byCurrency(paid, sub => sub.currency, monthlyCost);
    return {
      summary: [
        { label: 'Active subscriptions', value: String(active.length), note: active.length !== paid.length ? `${active.length - paid.length} free or on trial` : undefined },
        ...monthly.map(([currency, value]) => ({ label: `Per month · ${currency}`, value: money(value, currency), note: `${money(value * 12, currency)} a year` })),
      ],
      findings,
    };
  },
};

// ---------------------------------------------------------------------------------------------
// Debt Advisor (Credit Union)

const debt: AgentDefinition = {
  id: 'debt',
  building: 'creditunion',
  role: 'Debt Advisor',
  office: 'Credit Union · Advice desk',
  color: '#1d6fa3',
  intro: 'Works out what you owe, which debt to clear first, and how much sooner you\'d be free with a little extra each month.',
  steps: ['Gathering your loans and cards', 'Checking what\'s due and overdue', 'Ranking debts by interest', 'Modelling extra payments', 'Writing up your plan'],
  destination: 'debts',
  destinationLabel: 'Open Debts',
  fingerprint: ({ today, loans, payments }) => hash([today, loans.map(l => [l.id, l.principal, l.annualRate, l.interestMethod, l.termMonths, l.instalment, l.isArchived, l.openingBalance]), payments.map(p => [p.id, p.amount, p.paymentDate, p.entryType])]),
  review: ({ today, loans, payments }) => {
    const asOf = dayMs(today);
    const open = loans.filter(loan => !loan.isArchived).map(loan => ({ loan, status: loanStatus(loan, payments) })).filter(item => !item.status.paidOff && item.status.outstanding > 0.005);
    const findings: AgentFinding[] = [];

    open.forEach(({ loan }) => {
      const due = dueStatus(loan, payments, asOf);
      if (!due) return;
      const days = Math.round((due.nextDue - asOf) / DAY);
      if (due.overdue) findings.push({ id: `overdue:${loan.id}:${due.nextDue}`, tone: 'warn', title: `${loan.name} is overdue`, detail: `${due.behind} payment${due.behind === 1 ? '' : 's'} not recorded. If you've paid, log it; if not, paying now limits late fees and interest.`, action: { label: 'Log a payment', destination: 'debts' } });
      else if (days <= 7) findings.push({ id: `due:${loan.id}:${due.nextDue}`, tone: 'info', title: `${loan.name} is due ${days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`, detail: `${loanInstalment(loan) ? `${money(loanInstalment(loan)!, loan.currency)} on ` : ''}${dateText(due.nextDue)}.` });
    });

    // Avalanche: extra money goes to the highest rate first. Flat-rate loans are compared by
    // their true (equivalent reducing) rate.
    const rate = (loan: Loan) => (loan.interestMethod === 'Flat' ? flatEquivalentRate(loan) ?? loan.annualRate : loan.annualRate);
    const ranked = [...open].filter(item => rate(item.loan) > 0).sort((a, b) => rate(b.loan) - rate(a.loan));
    if (ranked.length >= 2) {
      const [first] = ranked;
      findings.push({ id: `avalanche:${first.loan.id}`, tone: 'info', title: `Put any extra towards ${first.loan.name} first`, detail: `At ${rate(first.loan).toFixed(1)}% it's your most expensive debt. Pay the minimum on the rest and anything extra here - it saves the most interest. Order: ${ranked.map(item => `${item.loan.name} (${rate(item.loan).toFixed(1)}%)`).join(' → ')}.` });
    }

    // What 10% more each month would do, on the biggest reducing-rate loan.
    const reducing = open.filter(item => item.loan.interestMethod !== 'Flat' && !isStatementLoan(item.loan) && loanInstalment(item.loan)).sort((a, b) => b.status.outstanding - a.status.outstanding)[0];
    if (reducing) {
      const instalment = loanInstalment(reducing.loan)!;
      const extra = Math.max(10, Math.round(instalment * 0.1));
      const base = projectPayoff(reducing.loan, payments, asOf, 0);
      const faster = projectPayoff(reducing.loan, payments, asOf, extra);
      if (base && faster && Number.isFinite(base.months) && Number.isFinite(faster.months) && base.months - faster.months >= 1) {
        findings.push({ id: `extra:${reducing.loan.id}:${extra}`, tone: 'good', title: `${money(extra, reducing.loan.currency)} more a month on ${reducing.loan.name}`, detail: `Finishes ${base.months - faster.months} month${base.months - faster.months === 1 ? '' : 's'} sooner (${dateText(faster.payoffDate)} instead of ${dateText(base.payoffDate)}) and saves about ${money(base.interestRemaining - faster.interestRemaining, reducing.loan.currency)} in interest.` });
      } else if (base && !Number.isFinite(base.months)) {
        findings.push({ id: `stuck:${reducing.loan.id}`, tone: 'warn', title: `${reducing.loan.name}'s payment doesn't cover the interest`, detail: 'At this instalment the balance never goes down. Paying more, or refinancing, is worth looking at.', action: { label: 'Review the loan', destination: 'debts' } });
      }
    }

    open.filter(item => item.loan.interestMethod === 'Flat').forEach(({ loan }) => {
      const equivalent = flatEquivalentRate(loan);
      if (equivalent && equivalent > loan.annualRate * 1.4) findings.push({ id: `flat:${loan.id}`, tone: 'info', title: `${loan.name}'s real rate is about ${equivalent.toFixed(1)}%`, detail: `It's quoted at ${loan.annualRate}% flat, but flat interest is charged on the original amount the whole way through. Paying it off early usually saves nothing unless the lender rebates interest.` });
    });
    open.filter(item => isStatementLoan(item.loan)).forEach(({ loan, status }) => {
      if (status.outstanding > 0) findings.push({ id: `card:${loan.id}:${status.statement?.date ?? ''}`, tone: 'warn', title: `${money(status.outstanding, loan.currency)} left on ${loan.name}`, detail: 'Card interest is usually the most expensive debt there is. Clearing the full statement balance by the due date avoids it entirely.', action: { label: 'Log a card payment', destination: 'debts' } });
    });

    if (open.length === 0) findings.push({ id: 'debt-free', tone: 'good', title: 'Nothing owed', detail: loans.length ? 'Every debt you track is paid off. Well done.' : 'You aren\'t tracking any debts. Add loans or cards in Debts and I\'ll plan them.' });
    else if (!findings.some(finding => finding.tone === 'warn')) findings.unshift({ id: 'on-track', tone: 'good', title: 'Payments are on track', detail: 'Nothing overdue and no card balances carried over.' });

    const latest = open.map(item => projectPayoff(item.loan, payments, asOf, 0)).filter((p): p is NonNullable<typeof p> => Boolean(p && Number.isFinite(p.months)));
    const monthly = byCurrency(open, item => item.loan.currency, item => loanInstalment(item.loan) || 0).filter(([, value]) => value > 0);
    return {
      summary: [
        ...byCurrency(open, item => item.loan.currency, item => item.status.outstanding).map(([currency, value]) => ({ label: `Owed · ${currency}`, value: money(value, currency), note: `${open.filter(item => item.loan.currency === currency).length} debt(s)` })),
        ...monthly.map(([currency, value]) => ({ label: `Monthly payments · ${currency}`, value: money(value, currency) })),
        ...(latest.length ? [{ label: 'Debt-free by', value: dateText(Math.max(...latest.map(p => p.payoffDate))), note: 'at current instalments' }] : []),
      ],
      findings,
    };
  },
};

// ---------------------------------------------------------------------------------------------
// Savings Coach (Savings Vault)

const savings: AgentDefinition = {
  id: 'savings',
  building: 'vault',
  role: 'Savings Coach',
  office: 'Savings Vault · Coaching room',
  color: '#2a9d8f',
  intro: 'Checks each savings goal against its deadline and tells you exactly what a month gets it back on track.',
  steps: ['Opening your savings goals', 'Adding up what\'s saved', 'Checking each goal against its deadline', 'Working out monthly amounts', 'Writing up your plan'],
  destination: 'goals',
  destinationLabel: 'Open Goals',
  fingerprint: ({ today, goals, entries }) => hash([today.slice(0, 7), goals.map(g => [g.id, g.targetAmount, g.targetDate, g.openingBalance, g.currency]), entries.map(e => [e.id, e.amount, e.direction, e.entryDate])]),
  review: ({ today, goals, entries }) => {
    const findings: AgentFinding[] = [];
    const plans = goals.map(goal => {
      try { return { goal, plan: goalPlan(goal, entries.filter(entry => entry.entryDate.slice(0, 10) <= today), today) }; } catch { return null; }
    }).filter((item): item is NonNullable<typeof item> => item !== null);
    const month = today.slice(0, 7);

    plans.forEach(({ goal, plan }) => {
      if (plan.funded) { findings.push({ id: `funded:${goal.id}`, tone: 'good', title: `${goal.name} is fully funded`, detail: `${money(plan.balance, goal.currency)} saved. Time to enjoy it - or set the next target.` }); return; }
      if (plan.overdue) { findings.push({ id: `overdue:${goal.id}:${goal.targetDate}`, tone: 'warn', title: `${goal.name} passed its target date`, detail: `${money(plan.remaining, goal.currency)} still to go. Move the date out to something realistic, or top it up.`, action: { label: 'Adjust the goal', destination: 'goals' } }); return; }
      const contributedThisMonth = entries.some(entry => entry.goalId === goal.id && entry.direction === 'Contribution' && entry.amount > 0 && entry.entryDate.slice(0, 7) === month);
      if (plan.monthlyNeeded) {
        findings.push({
          id: contributedThisMonth ? `monthly:${goal.id}:${month}:paid` : `monthly:${goal.id}:${month}`,
          tone: contributedThisMonth ? 'good' : 'warn',
          title: contributedThisMonth ? `${goal.name}: saved this month` : `${goal.name} needs ${money(plan.monthlyNeeded, goal.currency)} this month`,
          detail: `${plan.progress.toFixed(0)}% there, ${money(plan.remaining, goal.currency)} to go by ${goal.targetDate ? dateText(dayMs(goal.targetDate)) : 'the target date'} - ${money(plan.monthlyNeeded, goal.currency)} a month gets it done.`,
          action: contributedThisMonth ? undefined : { label: 'Add a contribution', destination: 'goals' },
        });
      } else if (!goal.targetDate) {
        findings.push({ id: `nodate:${goal.id}`, tone: 'info', title: `${goal.name} has no target date`, detail: `${plan.progress.toFixed(0)}% saved. A date turns it into a monthly amount I can coach you on.`, action: { label: 'Set a date', destination: 'goals' } });
      }
    });
    if (plans.length === 0) findings.push({ id: 'no-goals', tone: 'info', title: 'No savings goals yet', detail: 'Set one up - an emergency fund is a great first goal - and I\'ll keep it on track.', action: { label: 'Create a goal', destination: 'goals' } });

    return {
      summary: [
        ...byCurrency(plans, item => item.goal.currency, item => item.plan.balance).map(([currency, value]) => {
          const target = plans.filter(item => item.goal.currency === currency).reduce((sum, item) => sum + item.goal.targetAmount, 0);
          return { label: `Saved · ${currency}`, value: money(value, currency), note: target ? `${Math.min(100, (value / target) * 100).toFixed(0)}% of ${money(target, currency)}` : undefined };
        }),
        { label: 'Goals', value: String(plans.length), note: `${plans.filter(item => item.plan.funded).length} funded` },
      ],
      findings,
    };
  },
};

export const AGENTS: AgentDefinition[] = [auditor, debt, savings];
export const agentFor = (id: AgentId) => AGENTS.find(agent => agent.id === id)!;
export const agentForBuilding = (type: string) => AGENTS.find(agent => agent.building === type) ?? null;

export const runAgent = (agent: AgentDefinition, input: AgentInput): AgentReport => ({
  version: 1,
  agent: agent.id,
  completedAt: new Date().toISOString(),
  fingerprint: agent.fingerprint(input),
  ...agent.review(input),
});

// Issues flagged last time that are gone now - fixed. Each is rewarded once, ever.
export const fixedSince = (previous: AgentReport | undefined, next: AgentReport, alreadyRewarded: string[]) => {
  if (!previous) return [];
  const now = new Set(next.findings.map(finding => finding.id));
  return previous.findings.filter(finding => finding.tone === 'warn' && !now.has(finding.id) && !alreadyRewarded.includes(finding.id)).map(finding => finding.id);
};

export interface AgentRecord { report?: AgentReport; rewarded: string[] }

export const parseAgentRecords = (value: unknown): Partial<Record<AgentId, AgentRecord>> => {
  if (!value || typeof value !== 'object') return {};
  const result: Partial<Record<AgentId, AgentRecord>> = {};
  AGENTS.forEach(agent => {
    const record = (value as Record<string, any>)[agent.id];
    if (!record || typeof record !== 'object') return;
    const report = record.report && record.report.version === 1 && record.report.agent === agent.id && Array.isArray(record.report.findings) && Array.isArray(record.report.summary) ? record.report as AgentReport : undefined;
    result[agent.id] = { report, rewarded: Array.isArray(record.rewarded) ? record.rewarded.filter((id: unknown) => typeof id === 'string').slice(-500) : [] };
  });
  return result;
};
