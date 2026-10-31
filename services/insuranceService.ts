import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from './appDataService';

export const INSURANCE_KINDS = ['Life', 'Medical', 'Critical illness', 'Personal accident', 'Disability', 'Travel', 'Other'] as const;
export interface InsurancePolicy {
  id: string; name: string; insurer: string; policyNumber: string; insuredPerson: string;
  kind: typeof INSURANCE_KINDS[number]; currency: string; premium: number;
  frequency: 'Monthly' | 'Quarterly' | 'Yearly' | 'One-time';
  coverage: number; deductible: number; startDate: string; endDate: string; renewalDate: string;
  destination: string; emergencyPhone: string; notes: string; archived: boolean;
}
export const insuranceToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export function policyStatus(policy: InsurancePolicy, today = insuranceToday()) {
  return policy.archived ? 'Archived' : policy.endDate && policy.endDate < today ? 'Expired' : policy.startDate > today ? 'Upcoming' : 'Active';
}
export const annualPremium = (p: InsurancePolicy) => p.premium * ({ Monthly: 12, Quarterly: 4, Yearly: 1, 'One-time': 0 }[p.frequency]);
export function insuranceMetrics(policies: InsurancePolicy[], currency: string, today = insuranceToday()) {
  const live = policies.filter(p => !p.archived && policyStatus(p, today) !== 'Expired' && p.currency === currency);
  const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 30);
  const until = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return {
    annual: live.reduce((sum, p) => sum + annualPremium(p), 0),
    travel: live.filter(p => p.kind === 'Travel').reduce((sum, p) => sum + p.premium * (p.frequency === 'One-time' ? 1 : 0), 0),
    due: live.filter(p => p.renewalDate && p.renewalDate <= until).length,
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
  if (p.kind === 'Travel' && (!p.startDate || !p.endDate || !p.destination.trim())) throw new Error('Travel insurance needs a destination and coverage dates.');
}
const key = 'subtrack_insurance_v1';
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
