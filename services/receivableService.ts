import type { Receivable, ReceivableEntry } from '../types';
import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from './appDataService';
import { RECEIVABLES_KEY, validateReceivable, validateReceivableEntry, type ReceivablesData } from './receivableMath';
import { todayDate } from './savingsGoalMath';
const read = (): ReceivablesData => { const raw = localStorage.getItem(RECEIVABLES_KEY); if (!raw) return { receivables: [], entries: [] }; const value = JSON.parse(raw); if (!Array.isArray(value.receivables) || !Array.isArray(value.entries)) throw new Error('Saved receivables could not be read. Restore your data before making changes.'); return value; };
const write = (data: ReceivablesData) => localStorage.setItem(RECEIVABLES_KEY, JSON.stringify(data));
const context = async () => { const client = getSupabaseClient(); const session = await getSupabaseSession(); if (!client || !session?.user.id) throw new Error('Please sign in again.'); return { client, userId: session.user.id }; };
const check = (error: any) => { if (error) throw new Error(['42P01', 'PGRST205', '42703'].includes(error.code) ? 'Finish receivables setup: run supabase_receivables_schema.sql in this app’s Supabase project, then retry.' : error.message || 'Could not save receivables.'); };
const fromRow = (r: any): Receivable => ({ id: r.id, borrower: r.borrower, description: r.description, currency: r.currency, principal: Number(r.principal), agreedInterest: Number(r.agreed_interest), lentDate: r.lent_date, dueDate: r.due_date || undefined, repaymentPlan: r.repayment_plan, instalment: r.instalment == null ? undefined : Number(r.instalment), contact: r.contact || undefined, notes: r.notes || undefined });
const entryFromRow = (r: any): ReceivableEntry => ({ id: r.id, receivableId: r.receivable_id, kind: r.kind, entryDate: r.entry_date, principal: Number(r.principal), interest: Number(r.interest), notes: r.notes || undefined });
export async function loadReceivables(): Promise<ReceivablesData> {
  if (!isSupabaseConfigured()) return read();
  const { client, userId } = await context();
  const all = async (table: string) => { const result: any[] = []; for (let start = 0; ; start += 1000) { const { data, error } = await client.from(table).select('*').eq('user_id', userId).order('created_at').order('id').range(start, start + 999); check(error); result.push(...(data || [])); if (!data || data.length < 1000) return result; } };
  const [receivables, entries] = await Promise.all([all('receivables'), all('receivable_entries')]);
  return { receivables: receivables.map(fromRow), entries: entries.map(entryFromRow) };
}
export async function saveReceivable(record: Receivable) {
  const data = await loadReceivables();
  validateReceivable(record, data.entries, todayDate(), data.receivables.find(r => r.id === record.id));
  if (!isSupabaseConfigured()) { write({ ...data, receivables: [...data.receivables.filter(r => r.id !== record.id), record] }); return; }
  const { client, userId } = await context();
  const row = { id: record.id, user_id: userId, borrower: record.borrower.trim(), description: record.description.trim(), currency: record.currency, principal: record.principal, agreed_interest: record.agreedInterest, lent_date: record.lentDate, due_date: record.dueDate || null, repayment_plan: record.repaymentPlan, instalment: record.instalment || null, contact: record.contact || null, notes: record.notes || null };
  const { error } = await client.from('receivables').upsert(row, { onConflict: 'id' }); check(error);
}
export async function addReceivableEntry(entry: ReceivableEntry) {
  const data = await loadReceivables();
  if (data.entries.some(e => e.id === entry.id)) return;
  const record = data.receivables.find(r => r.id === entry.receivableId); if (!record) throw new Error('This receivable no longer exists.');
  validateReceivableEntry(entry, record, data.entries, todayDate());
  if (!isSupabaseConfigured()) { write({ ...data, entries: [...data.entries, entry] }); return; }
  const { client, userId } = await context();
  const { error } = await client.from('receivable_entries').insert({ id: entry.id, user_id: userId, receivable_id: entry.receivableId, kind: entry.kind, entry_date: entry.entryDate, principal: entry.principal, interest: entry.interest, notes: entry.notes || null }); check(error);
}
export async function deleteReceivableEntry(id: string) {
  if (!isSupabaseConfigured()) { const data = read(); write({ ...data, entries: data.entries.filter(e => e.id !== id) }); return; }
  const { client, userId } = await context(); const { error } = await client.from('receivable_entries').delete().eq('id', id).eq('user_id', userId); check(error);
}
