// Reads a policy page, PDF or pasted text and asks a Hugging Face model to turn it into a draft
// policy with an itemised benefits list. Nothing is saved here: the result pre-fills the policy
// form so the user can check it before saving.
import { CURRENCIES } from '../types';
import { htmlToText } from '../server/insurancePage';
import { INSURANCE_KINDS, MAX_BENEFITS, type InsuranceBenefit, type InsurancePolicy } from './insuranceService';

// Enough for a benefits schedule plus the key terms around it while staying inside the
// context window of the smallest model in the fallback list.
export const MAX_SOURCE_CHARS = 24_000;

export interface PolicySource { text: string; label: string; sourceUrl?: string; truncated: boolean; pdfLinks: string[] }

export interface PolicyExtraction {
  fields: Partial<Pick<InsurancePolicy, 'name' | 'insurer' | 'policyNumber' | 'insuredPerson' | 'kind' | 'currency' | 'premium' | 'frequency' | 'coverage' | 'deductible' | 'startDate' | 'endDate' | 'renewalDate' | 'destination' | 'emergencyPhone' | 'notes'>>;
  benefits: InsuranceBenefit[];
}

const limitSource = (text: string, label: string, extra: Partial<PolicySource> = {}): PolicySource => {
  const clean = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length < 40) throw new Error(`${label} has almost no readable text. A scanned document needs to be a text PDF, or paste the text instead.`);
  return { text: clean.slice(0, MAX_SOURCE_CHARS), label, truncated: clean.length > MAX_SOURCE_CHARS, pdfLinks: [], ...extra };
};

const pdfText = async (blob: Blob) => (await import('./huggingFaceService')).extractPdfText(blob);

export async function readPolicyLink(url: string): Promise<PolicySource> {
  const response = await fetch(`/api/insurance/page?url=${encodeURIComponent(url.trim())}`);
  const type = response.headers.get('Content-Type') || '';
  if (response.ok && type.includes('application/pdf')) return limitSource(await pdfText(await response.blob()), 'The linked PDF', { sourceUrl: url.trim() });
  const body = await response.json().catch(() => null) as { error?: string; text?: string; title?: string; url?: string; truncated?: boolean; pdfLinks?: string[] } | null;
  if (!response.ok || !body?.text) throw new Error(body?.error || `The link could not be read (HTTP ${response.status}).`);
  const source = limitSource(body.title ? `${body.title}\n${body.text}` : body.text, 'The page', { sourceUrl: body.url || url.trim(), pdfLinks: body.pdfLinks || [] });
  return { ...source, truncated: source.truncated || !!body.truncated };
}

export async function readPolicyFile(file: File): Promise<PolicySource> {
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose a file under 15 MB.');
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return limitSource(await pdfText(file), file.name);
  if (file.type.includes('html') || /\.html?$/.test(name)) return limitSource(htmlToText(await file.text()).text, file.name);
  if (file.type.startsWith('text/') || /\.(txt|md|csv)$/.test(name)) return limitSource(await file.text(), file.name);
  throw new Error('Upload a PDF, web page (.html) or text file. For a photo or scan, paste the text instead.');
}

export const readPolicyText = (text: string) => limitSource(text, 'The pasted text');

export const buildPolicyPrompt = (source: string, today: string) => `You read insurance documents and return their details as JSON.
Today is ${today}. Below is text from an insurance policy page, certificate of insurance or policy wording.

Return ONE JSON object, no commentary, with these keys (use "" or null when the document doesn't say - never guess):
- name: plan or product name, e.g. "Travel Insurance - Single Trip Essential"
- insurer: the underwriting insurance company, e.g. "Chubb"
- policyNumber, insuredPerson: only if printed
- kind: one of ${INSURANCE_KINDS.map(k => `"${k}"`).join(', ')}
- currency: ISO 4217 code of the amounts (S$ = SGD, RM = MYR, HK$ = HKD, A$ = AUD, US$ or $ with US context = USD)
- premium: number per payment, null if not shown; frequency: "Monthly", "Quarterly", "Yearly" or "One-time" (single-trip travel cover is "One-time")
- coverage: the headline limit as a number - the sum assured for life/CI/PA, or the overseas medical expenses limit for travel
- deductible: number, null if none shown
- startDate, endDate, renewalDate: YYYY-MM-DD, only if actual dates are printed
- destination: covered region for travel, if stated
- emergencyPhone: the claims or 24-hour emergency assistance number
- notes: up to 5 short lines on important terms - who/where it covers, cancellation rules, key exclusions. Plain text, "\\n" between lines.
- benefits: array of EVERY benefit in the schedule, in document order. Each item:
  { "name": string, "limit": number or null, "limitText": string, "details": string, "subLimit": boolean }
  * limit: the main maximum as a plain number (250000, not "250,000"); null when the cover has no amount ("Included", "Covered")
  * limitText: the limit as worded when a number alone loses meaning ("200 per every 6 hours, up to 800", "Included"); otherwise ""
  * details: conditions that change the limit, e.g. "Ages 18-70: 250,000; below 18 or above 70: 125,000"; otherwise ""
  * subLimit: true for a "Sub-limit for ..." line that belongs to the benefit listed before it; list each sub-limit as its own
    item, right after its benefit, and keep its own wording as the name (e.g. "Sub-limit for Traditional Chinese Medicine")
  Use the standard adult limit when the schedule lists several age bands, and put the bands in details.

Document:
"""
${source}
"""`;

const text = (value: unknown, max = 200) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const amount = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const date = (value: unknown) => {
  const raw = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const parsed = new Date(`${raw}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : '';
};

/** Pulls the first complete JSON object out of a model reply, tolerating code fences and chatter around it. */
export function firstJsonObject(reply: string): any {
  const start = reply.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < reply.length; i++) {
    const ch = reply[i];
    if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { return JSON.parse(reply.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

export function parsePolicyExtraction(reply: string, newId: () => string = () => crypto.randomUUID()): PolicyExtraction {
  const raw = firstJsonObject(reply);
  if (!raw || typeof raw !== 'object') throw new Error('The model’s answer couldn’t be read. Try again, or paste just the benefits table.');
  const fields: PolicyExtraction['fields'] = {};
  for (const key of ['name', 'insurer', 'policyNumber', 'insuredPerson', 'destination', 'emergencyPhone'] as const) {
    const value = text(raw[key], key === 'emergencyPhone' ? 40 : 200);
    if (value) fields[key] = value;
  }
  const notes = typeof raw.notes === 'string' ? raw.notes.replace(/\\n/g, '\n').split('\n').map(line => line.trim()).filter(Boolean).join('\n').slice(0, 2000) : '';
  if (notes) fields.notes = notes;
  const kind = INSURANCE_KINDS.find(k => k.toLowerCase() === text(raw.kind).toLowerCase());
  if (kind) fields.kind = kind;
  const currency = text(raw.currency, 3).toUpperCase();
  if (CURRENCIES.includes(currency)) fields.currency = currency;
  const frequency = (['Monthly', 'Quarterly', 'Yearly', 'One-time'] as const).find(f => f.toLowerCase() === text(raw.frequency).toLowerCase());
  if (frequency) fields.frequency = frequency;
  for (const key of ['premium', 'coverage', 'deductible'] as const) {
    const value = amount(raw[key]);
    if (value !== null) fields[key] = value;
  }
  for (const key of ['startDate', 'endDate', 'renewalDate'] as const) {
    const value = date(raw[key]);
    if (value) fields[key] = value;
  }
  if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) { delete fields.startDate; delete fields.endDate; }

  const benefits: InsuranceBenefit[] = [];
  for (const item of Array.isArray(raw.benefits) ? raw.benefits : []) {
    const name = text(item?.name);
    if (!name || benefits.length >= MAX_BENEFITS) continue;
    const limitText = text(item?.limitText, 200);
    const limit = amount(item?.limit);
    benefits.push({ id: newId(), name, limit, limitText: limitText === String(limit) ? '' : limitText, details: text(item?.details, 500), subLimit: item?.subLimit === true || /^sub-?limit/i.test(name) });
  }
  if (benefits[0]) benefits[0].subLimit = false;
  if (!Object.keys(fields).length && !benefits.length) throw new Error('No policy details were found in that source.');
  return { fields, benefits };
}

// Measured on a real Trip.com/Chubb benefits page (Nov 2026): Llama 3.3 70B (novita) got every
// benefit and sub-limit right in ~22s; the 72B/235B Qwens were also right but took 30-76s.
// Qwen 7B, first in the statement list, dropped a benefit and merged sub-limits, so it's last here.
const POLICY_MODELS = [
  'meta-llama/Llama-3.3-70B-Instruct:novita',
  'Qwen/Qwen2.5-72B-Instruct:deepinfra',
  'Qwen/Qwen2.5-72B-Instruct:featherless-ai',
  'Qwen/Qwen3-235B-A22B-Instruct-2507:deepinfra',
  'Qwen/Qwen2.5-7B-Instruct:featherless-ai',
];

export async function extractPolicy(source: PolicySource, today: string): Promise<PolicyExtraction> {
  const { requestChatCompletion } = await import('./huggingFaceService');
  const data = await requestChatCompletion({ messages: [{ role: 'user', content: buildPolicyPrompt(source.text, today) }], temperature: 0, max_tokens: 4000 }, 'Policy import', POLICY_MODELS);
  const reply: string | undefined = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error('The model returned an empty answer. Try again.');
  return parsePolicyExtraction(reply);
}

/**
 * Applies an extraction to the form draft. Anything the user already typed wins over the
 * import, except the benefits list, which the import replaces. Returns the labels it filled.
 */
export function applyExtraction(draft: InsurancePolicy, extraction: PolicyExtraction, sourceUrl?: string, defaults?: InsurancePolicy) {
  const next: InsurancePolicy = { ...draft };
  const filled: string[] = [];
  const untouched = (key: keyof InsurancePolicy) => {
    const value = draft[key];
    if (defaults && value === defaults[key]) return true;
    return value === '' || value === 0;
  };
  for (const [key, value] of Object.entries(extraction.fields) as Array<[keyof PolicyExtraction['fields'], any]>) {
    if (value === undefined || !untouched(key)) continue;
    (next as any)[key] = value; filled.push(key);
  }
  if (extraction.benefits.length) next.benefits = extraction.benefits;
  if (sourceUrl) next.sourceUrl = sourceUrl;
  return { policy: next, filled };
}
