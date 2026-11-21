import { getSupabaseClient } from './appDataService';
import type { InsuranceDocument } from './insuranceService';

// Policy PDFs live in the private statements bucket at "<user_id>/insurance/<policy_id>/<uuid>_<name>".
// The bucket's storage policies already limit every object to the folder named after its owner.
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export function validateDocument(file: Pick<File, 'type' | 'size'>) {
  if (!DOCUMENT_TYPES.includes(file.type)) throw new Error('Choose a PDF, JPG, PNG or WebP file.');
  if (!file.size || file.size > MAX_DOCUMENT_BYTES) throw new Error('Choose a non-empty file up to 15 MB.');
}

async function context() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Sign in with cloud sync to store policy documents.');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sign in again to access policy documents.');
  return { bucket: client.storage.from('account-statements'), prefix: `${data.user.id}/insurance/` };
}

export const documentStorageAvailable = () => !!getSupabaseClient();

export async function uploadPolicyDocument(policyId: string, file: File): Promise<InsuranceDocument> {
  validateDocument(file);
  const { bucket, prefix } = await context();
  const name = file.name.replace(/[^a-zA-Z0-9._ ()-]/g, '_').slice(-150) || 'policy.pdf';
  const path = `${prefix}${policyId}/${crypto.randomUUID()}_${name}`;
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
  return { path, name, size: file.size, type: file.type, uploadedAt: new Date().toISOString() };
}

export async function readPolicyDocument(doc: InsuranceDocument): Promise<Blob> {
  const { bucket, prefix } = await context();
  if (!doc.path.startsWith(prefix)) throw new Error('This document belongs to another account.');
  const { data, error } = await bucket.download(doc.path);
  if (error || !data) throw new Error('Could not download the document. Please try again.');
  return data.type ? data : new Blob([data], { type: doc.type });
}

/** Best-effort removal: a leftover file only costs storage, so failures are not surfaced. */
export async function removePolicyDocuments(docs: InsuranceDocument[]) {
  if (!docs.length) return;
  try {
    const { bucket, prefix } = await context();
    const paths = docs.map(d => d.path).filter(p => p.startsWith(prefix));
    if (paths.length) await bucket.remove(paths);
  } catch { /* ignore */ }
}
