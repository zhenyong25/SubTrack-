import { getSupabaseClient, getSupabaseSession, isSupabaseConfigured } from './appDataService';
import { validateTaxYear, type TaxYear } from './sgTaxService';

// One row per Year of Assessment, details kept as JSON like insurance policies. Without cloud
// sync the records stay in this browser.
const key = 'subtrack_tax_years_v1';
function readLocal(): TaxYear[] {
  const data = JSON.parse(localStorage.getItem(key) || '[]');
  if (!Array.isArray(data)) throw new Error('Saved tax records could not be read.');
  return data;
}
async function context() {
  const client = getSupabaseClient(); const session = await getSupabaseSession();
  if (!client || !session) throw new Error('Sign in again to access your tax records.');
  return { client, userId: session.user.id };
}
function check(error: { message?: string; code?: string } | null) {
  if (error) throw new Error(['42P01', 'PGRST205'].includes(error.code || '') ? 'Tax database setup is required. Run supabase_tax_schema.sql in your Supabase project, then retry.' : error.message || 'Tax records could not be saved.');
}
export async function loadTaxYears(): Promise<TaxYear[]> {
  if (!isSupabaseConfigured()) return readLocal();
  const { client, userId } = await context();
  const { data, error } = await client.from('tax_years').select('id,details').eq('user_id', userId).order('id').limit(500);
  check(error);
  return (data || []).map(row => ({ ...row.details, id: row.id } as TaxYear));
}
export async function saveTaxYear(year: TaxYear, all: TaxYear[]) {
  validateTaxYear(year);
  if (all.some(y => y.id !== year.id && y.ya === year.ya)) throw new Error(`YA ${year.ya} is already recorded. Edit that year instead.`);
  if (!isSupabaseConfigured()) { localStorage.setItem(key, JSON.stringify([...readLocal().filter(y => y.id !== year.id), year])); return; }
  const { client, userId } = await context();
  const { error } = await client.from('tax_years').upsert({ id: year.id, user_id: userId, details: year }); check(error);
}
export async function deleteTaxYear(id: string) {
  if (!isSupabaseConfigured()) { localStorage.setItem(key, JSON.stringify(readLocal().filter(y => y.id !== id))); return; }
  const { client, userId } = await context();
  const { error } = await client.from('tax_years').delete().eq('user_id', userId).eq('id', id); check(error);
}
