import { getSupabaseClient } from './appDataService';

export interface Payslip { path: string; name: string; month: string; size: number }
export function validatePayslip(file: Pick<File, 'type' | 'size'>, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid pay month.');
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a PDF, JPG, PNG or WebP file.');
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose a non-empty file up to 10 MB.');
}
async function context() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud storage must be configured to store payslips.');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sign in to access your payslips.');
  return { bucket: client.storage.from('account-statements'), prefix: `${data.user.id}/payslips/` };
}
export async function listPayslips(): Promise<Payslip[]> {
  const { bucket, prefix } = await context();
  const slips: Payslip[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(prefix.slice(0, -1), { limit: 100, offset, sortBy: { column: 'name', order: 'desc' } });
    if (error) throw new Error(`Could not load payslips: ${error.message}`);
    for (const item of data || []) {
      if (item.id && /^\d{4}-\d{2}_/.test(item.name)) slips.push({ path: prefix + item.name, month: item.name.slice(0, 7), name: item.name.slice(45), size: Number(item.metadata?.size || 0) });
    }
    if (!data || data.length < 100) return slips;
  }
}
export async function uploadPayslip(file: File, month: string): Promise<Payslip> {
  validatePayslip(file, month);
  const { bucket, prefix } = await context();
  const name = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(-150) || 'payslip';
  const path = `${prefix}${month}_${crypto.randomUUID()}_${name}`;
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Could not upload payslip: ${error.message}`);
  return { path, month, name, size: file.size };
}
export async function readPayslip(slip: Payslip): Promise<Blob> {
  const { bucket, prefix } = await context();
  if (!slip.path.startsWith(prefix)) throw new Error('Invalid payslip.');
  const { data, error } = await bucket.download(slip.path);
  if (error || !data) throw new Error('Could not download payslip. Please try again.');
  return data;
}
export async function deletePayslip(slip: Payslip) {
  const { bucket, prefix } = await context();
  if (!slip.path.startsWith(prefix)) throw new Error('Invalid payslip.');
  const { error } = await bucket.remove([slip.path]);
  if (error) throw new Error(`Could not delete payslip: ${error.message}`);
}
