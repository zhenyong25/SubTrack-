import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from './appDataService';

export const INSURANCE_KINDS = ['Life', 'Medical', 'Critical illness', 'Personal accident', 'Disability', 'Travel', 'Other'] as const;
export interface InsurancePolicy {
  id: string; name: string; insurer: string; policyNumber: string; insuredPerson: string;
  kind: typeof INSURANCE_KINDS[number]; currency: string; premium: number;
  frequency: 'Monthly' | 'Quarterly' | 'Yearly' | 'One-time';
  coverage: number; deductible: number; startDate: string; endDate: string; renewalDate: string;
  destination: string; emergencyPhone: string; notes: string; archived: boolean;
  /** Itemised cover, e.g. imported from a policy page. Older records have none. */
  benefits?: InsuranceBenefit[];
  /** The link the benefits were imported from, if any. */
  sourceUrl?: string;
  /** Stored copies of the policy wording, certificate or schedule. */
  documents?: InsuranceDocument[];
  recordType?: 'Policy' | 'Quotation';
  people?: string[];
  paymentDueDate?: string;
  paymentAnchorDay?: number;
  policyRenewalDate?: string;
  reminderDays?: number;
  coPaymentPercent?: number;
  waitingPeriod?: string;
  exclusions?: string;
  riders?: string;
  limitBasis?: 'Annual' | 'Lifetime' | 'Per claim' | 'Unspecified';
  premiumHistory?: PremiumRecord[];
  payments?: InsurancePayment[];
  claims?: InsuranceClaim[];
  review?: { year: number; completed: string[]; notes: string };
  reviews?: Record<string, { completed: string[]; notes: string }>;
}
export interface PremiumRecord { id: string; effectiveDate: string; premium: number; frequency: InsurancePolicy['frequency']; reason: string; documentPath?: string }
export interface InsurancePayment { id: string; dueDate: string; paidDate: string; amount: number; reference: string }
export const CLAIM_STATUSES = ['Preparing', 'Submitted', 'Under review', 'Approved', 'Partially approved', 'Rejected', 'Paid', 'Closed'] as const;
export interface InsuranceClaim { id: string; title: string; incidentDate: string; submittedDate: string; requested: number; approved?: number; status: typeof CLAIM_STATUSES[number]; followUpDate: string; tasks: string; notes: string; documentPaths: string[] }
export interface InsuranceDocument { path: string; name: string; size: number; type: string; uploadedAt: string }
export const MAX_DOCUMENTS = 10;
/** One line of a policy's benefit schedule. `limit` is null for cover with no amount ("Included"). */
export interface InsuranceBenefit {
  id: string; name: string; limit: number | null;
  /** How the schedule words the limit when a number alone loses meaning, e.g. "200 per 6 hours, up to 800". */
  limitText: string;
  /** Conditions such as age bands or waiting periods. */
  details: string;
  /** True for a sub-limit that sits under the benefit before it. */
  subLimit: boolean;
}
export const MAX_BENEFITS = 150;
export const insuranceToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export function policyStatus(policy: InsurancePolicy, today = insuranceToday()) {
  return policy.archived ? 'Archived' : policy.endDate && policy.endDate < today ? 'Expired' : policy.startDate > today ? 'Upcoming' : 'Active';
}
export type PolicyStatus = ReturnType<typeof policyStatus>;
/** What the register shows: a one-time policy (e.g. travel cover) in force is "Current", a recurring one "Active". */
export const statusLabel = (policy: InsurancePolicy, today = insuranceToday()) => {
  const status = policyStatus(policy, today);
  return status === 'Active' && policy.frequency === 'One-time' ? 'Current' : status;
};
/** Register order: in force first, then upcoming, expired and archived. */
export const STATUS_ORDER: PolicyStatus[] = ['Active', 'Upcoming', 'Expired', 'Archived'];
export const annualPremium = (p: InsurancePolicy) => p.premium * ({ Monthly: 12, Quarterly: 4, Yearly: 1, 'One-time': 0 }[p.frequency]);
export function insuranceMetrics(policies: InsurancePolicy[], currency: string, today = insuranceToday()) {
  const live = policies.filter(p => p.recordType !== 'Quotation' && !p.archived && policyStatus(p, today) !== 'Expired' && p.currency === currency);
  const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 30);
  const until = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return {
    annual: live.reduce((sum, p) => sum + annualPremium(p), 0),
    travel: live.filter(p => p.kind === 'Travel').reduce((sum, p) => sum + p.premium * (p.frequency === 'One-time' ? 1 : 0), 0),
    due: live.filter(p => { const d = p.paymentDueDate ?? p.renewalDate; return (d && d <= until && !p.payments?.some(x => x.dueDate === d)) || (p.policyRenewalDate && p.policyRenewalDate <= until); }).length,
    active: live.filter(p => policyStatus(p, today) === 'Active').length,
    coverage: INSURANCE_KINDS.map(kind => ({ kind, amount: live.filter(p => p.kind === kind && policyStatus(p, today) === 'Active').reduce((sum, p) => sum + p.coverage, 0) })),
  };
}
export function validatePolicy(p: InsurancePolicy) {
  if (!p.name.trim() || !p.insurer.trim() || !p.insuredPerson.trim()) throw new Error('Enter a policy name, insurer and insured person.');
  if (!INSURANCE_KINDS.includes(p.kind) || !['Monthly', 'Quarterly', 'Yearly', 'One-time'].includes(p.frequency)) throw new Error('Choose a valid policy type and payment frequency.');
  if (!/^[A-Z]{3}$/.test(p.currency)) throw new Error('Choose a currency.');
  for (const value of [p.premium, p.coverage, p.deductible]) if (!Number.isFinite(value) || value < 0) throw new Error('Amounts must be zero or greater.');
  for (const date of [p.startDate, p.endDate, p.renewalDate]) {
    if (!date) continue;
    const parsed = new Date(`${date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Enter valid dates.');
  }
  if (p.endDate && p.startDate && p.endDate < p.startDate) throw new Error('Coverage must end on or after its start date.');
  const benefits = p.benefits ?? [];
  if (!Array.isArray(benefits) || benefits.length > MAX_BENEFITS) throw new Error(`A policy can list up to ${MAX_BENEFITS} benefits.`);
  for (const b of benefits) {
    if (!b.name?.trim()) throw new Error('Every benefit needs a name.');
    if (b.limit !== null && (!Number.isFinite(b.limit) || b.limit < 0)) throw new Error(`The limit for ${b.name} must be zero or greater.`);
  }
  if ((p.documents ?? []).length > MAX_DOCUMENTS) throw new Error(`A policy can store up to ${MAX_DOCUMENTS} documents.`);
  validateInsuranceDetails(p);
  if (p.kind === 'Travel' && p.recordType !== 'Quotation' && (!p.startDate || !p.endDate || !p.destination.trim())) throw new Error('Travel insurance needs a destination and coverage dates.');
}
const key = 'subtrack_insurance_v1';
function validateInsuranceDetails(p: InsurancePolicy) {
  const validDate = (s: string, optional = false) => { if (optional && !s) return; const d = new Date(`${s}T12:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new Error('Enter valid dates.'); };
  const amount = (n: number) => { if (!Number.isFinite(n) || n < 0) throw new Error('Amounts must be zero or greater.'); };
  if (p.recordType && !['Policy', 'Quotation'].includes(p.recordType)) throw new Error('Choose a valid record type.');
  if (p.limitBasis && !['Annual', 'Lifetime', 'Per claim', 'Unspecified'].includes(p.limitBasis)) throw new Error('Choose a valid limit basis.');
  if (p.coPaymentPercent !== undefined && (!Number.isFinite(p.coPaymentPercent) || p.coPaymentPercent < 0 || p.coPaymentPercent > 100)) throw new Error('Co-payment must be between 0 and 100%.');
  if (p.reminderDays !== undefined && (!Number.isInteger(p.reminderDays) || p.reminderDays < 0 || p.reminderDays > 365)) throw new Error('Reminder lead time must be 0–365 days.');
  if (p.paymentAnchorDay !== undefined && (!Number.isInteger(p.paymentAnchorDay) || p.paymentAnchorDay < 1 || p.paymentAnchorDay > 31)) throw new Error('Payment anchor must be a day from 1–31.');
  for (const d of [p.paymentDueDate, p.policyRenewalDate]) if (d) validDate(d);
  for (const h of p.premiumHistory ?? []) { validDate(h.effectiveDate); amount(h.premium); if (!['Monthly', 'Quarterly', 'Yearly', 'One-time'].includes(h.frequency)) throw new Error('Choose a valid payment frequency.'); }
  if (new Set((p.premiumHistory ?? []).map(h => h.effectiveDate)).size !== (p.premiumHistory ?? []).length) throw new Error('Use one premium entry per effective date.');
  for (const payment of p.payments ?? []) { validDate(payment.dueDate); validDate(payment.paidDate); amount(payment.amount); }
  if (new Set((p.payments ?? []).map(x => x.dueDate)).size !== (p.payments ?? []).length) throw new Error('This payment due date is already recorded.');
  for (const c of p.claims ?? []) { if (!c.title.trim() || !CLAIM_STATUSES.includes(c.status)) throw new Error('Enter a claim title and valid status.'); validDate(c.incidentDate); validDate(c.submittedDate, true); validDate(c.followUpDate, true); amount(c.requested); if (c.approved !== undefined) amount(c.approved); }
}
function readLocal(): InsurancePolicy[] {
  const data = JSON.parse(localStorage.getItem(key) || '[]');
  if (!Array.isArray(data)) throw new Error('Saved insurance records could not be read.');
  return data;
}
async function context() {
  const client = getSupabaseClient(); const session = await getSupabaseSession();
  if (!client || !session) throw new Error('Sign in again to access insurance.');
  return { client, userId: session.user.id };
}
function check(error: { message?: string; code?: string } | null) {
  if (error) throw new Error(['42P01', 'PGRST205'].includes(error.code || '') ? 'Insurance database setup is required. Run supabase_insurance_schema.sql in your Supabase project, then retry.' : error.message || 'Insurance could not be saved.');
}
export async function loadInsurance(): Promise<InsurancePolicy[]> {
  if (!isSupabaseConfigured()) return readLocal();
  const { client, userId } = await context(); const rows: InsurancePolicy[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from('insurance_policies').select('id,details').eq('user_id', userId).order('id').range(offset, offset + 999);
    check(error); rows.push(...(data || []).map(row => ({ ...row.details, id: row.id } as InsurancePolicy)));
    if (!data || data.length < 1000) return rows;
  }
}
export async function saveInsurance(policy: InsurancePolicy) {
  validatePolicy(policy);
  if (!isSupabaseConfigured()) {
    const rows = readLocal(); localStorage.setItem(key, JSON.stringify([...rows.filter(p => p.id !== policy.id), policy])); return;
  }
  const { client, userId } = await context();
  const { error } = await client.from('insurance_policies').upsert({ id: policy.id, user_id: userId, details: policy }); check(error);
}
export async function deleteInsurance(id: string) {
  if (!isSupabaseConfigured()) { localStorage.setItem(key, JSON.stringify(readLocal().filter(p => p.id !== id))); return; }
  const { client, userId } = await context();
  const { error } = await client.from('insurance_policies').delete().eq('user_id', userId).eq('id', id); check(error);
}
