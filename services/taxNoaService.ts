import { DONATION_MULTIPLIER, emptyYear, type NoaLine, type ReliefKey, type TaxNoaSummary, type TaxYear } from './sgTaxService';

export type NoaExtraction = Partial<TaxNoaSummary>;

const AMOUNT = '(\\d[\\d,]*\\.\\d{2})';
const num = (text: string) => Number(text.replace(/,/g, ''));

// Line items printed on an IRAS NOA. Income items are in capitals under INCOME; reliefs are listed
// under RELIEFS in mixed case. `key` maps a relief to the record's relief field where one fits.
const INCOME_ITEMS: Array<{ label: string; pattern: string }> = [
  { label: 'Employment', pattern: 'EMPLOYMENT' },
  { label: 'Trade, business, profession or vocation', pattern: 'TRADE(?:,? BUSINESS)?[A-Z ,/]{0,40}?' },
  { label: 'Rent', pattern: 'RENT(?:AL)?' },
  { label: 'Interest', pattern: 'INTEREST' },
  { label: 'Dividends', pattern: 'DIVIDENDS?' },
  { label: 'Others', pattern: 'OTHERS?' },
];
const RELIEF_ITEMS: Array<{ label: string; pattern: string; key?: ReliefKey }> = [
  { label: 'Earned Income', pattern: 'Earned Income' },
  { label: 'CPF/Provident Fund', pattern: 'CPF\\s*/\\s*Provident Fund|Provident Fund', key: 'cpf' },
  { label: 'CPF Cash Top-up', pattern: 'CPF Cash Top-?up', key: 'cpfTopUpSelf' },
  { label: 'SRS', pattern: 'Supplementary Retirement Scheme|SRS', key: 'srs' },
  { label: 'NSman', pattern: 'NSman[- ]?(?:self|wife|parent)?', key: 'nsman' },
  { label: 'Spouse', pattern: '(?:Handicapped )?Spouse', key: 'spouse' },
  { label: 'Qualifying Child', pattern: 'Qualifying Child|Handicapped Child|Child Relief \\(Disability\\)', key: 'qcr' },
  { label: "Working Mother's Child", pattern: "Working Mother'?s? Child", key: 'wmcr' },
  { label: 'Parent', pattern: '(?:Handicapped )?Parent', key: 'parent' },
  { label: 'Grandparent Caregiver', pattern: 'Grandparent Caregiver', key: 'grandparentCaregiver' },
  { label: 'Life Insurance', pattern: 'Life Insurance', key: 'lifeInsurance' },
  { label: 'Course Fees', pattern: 'Course Fees', key: 'other' },
];

/** Recognises totals and line items in text-based IRAS NOAs. Unknown fields stay blank for review. */
export function parseNoaText(text: string): NoaExtraction {
  const s = text.replace(/\s+/g, ' ');
  if (!/notice of assessment|year of assessment/i.test(s)) throw new Error('This does not look like an IRAS Notice of Assessment. Enter the totals manually if the PDF is scanned.');
  const after = (label: string, flags = 'i') => {
    const match = s.match(new RegExp(label + '\\s*(?:\\([\\s$]*\\)|[:$^=+−–-])*\\s*' + AMOUNT, flags));
    return match ? num(match[1]) : undefined;
  };
  const out: NoaExtraction = { ya: Number(s.match(/YEAR OF ASSESSMENT\s+(20\d{2})/i)?.[1]) || undefined };
  // The total is printed as "INCOME^"; prefer that over words like "Earned Income".
  out.income = after('\\bINCOME\\^', '') ?? after('(?:^|[\\s+])INCOME\\^?');
  out.deductions = after('DEDUCTIONS');
  out.chargeable = after('CHARGEABLE INCOME');
  const taxMatch = s.match(new RegExp('Tax Payable(?: by \\d{1,2} [A-Za-z]+ \\d{4})?\\s*[:$]?\\s*' + AMOUNT, 'i'));
  out.tax = taxMatch ? num(taxMatch[1]) : undefined;
  // Date of notice only. Do not mistake payment or objection deadlines for this date.
  const dateMatch = s.match(/\bDate\s*:\s*(?:[A-Z][A-Z\d*]{5,20}\s+)?(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})/i);
  if (dateMatch) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(dateMatch[2].slice(0, 3).toLowerCase()) + 1;
    if (month) out.date = `${dateMatch[3]}-${String(month).padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
  }
  const lines: NoaLine[] = [];
  for (const item of INCOME_ITEMS) {
    const match = s.match(new RegExp(`\\b(?:${item.pattern})\\s+${AMOUNT}`)); // capitals only
    if (match) lines.push({ kind: 'income', label: item.label, amount: num(match[1]) });
  }
  // Reliefs come after the RELIEFS heading, so prose elsewhere isn't mistaken for one.
  const reliefStart = s.search(/\bRELIEFS\b/);
  if (reliefStart >= 0) {
    const reliefText = s.slice(reliefStart + 7);
    for (const item of RELIEF_ITEMS) {
      const match = reliefText.match(new RegExp(`\\b(?:${item.pattern})(?: Relief)?\\s+${AMOUNT}`, 'i'));
      if (match) lines.push({ kind: 'relief', label: item.label, amount: num(match[1]) });
    }
  }
  const donation = s.match(new RegExp(`\\bDONATIONS?(?: \\(?\\d+%\\)?)?\\s+${AMOUNT}`, 'i'));
  if (donation) lines.push({ kind: 'donation', label: 'Donations', amount: num(donation[1]) });
  const rebate = s.match(new RegExp(`(?:Less:?\\s*)?(Personal Income Tax Rebate|Parenthood Tax Rebate)\\s*\\(?-?\\)?\\s*${AMOUNT}`, 'i'));
  if (rebate) lines.push({ kind: 'rebate', label: rebate[1], amount: num(rebate[2]) });
  if (lines.length) out.lines = lines;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

export async function readNoaPdf(file: File) {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') throw new Error('Choose a PDF Notice of Assessment.');
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error('Choose a non-empty PDF up to 15 MB.');
  const { extractPdfText } = await import('./huggingFaceService');
  const text = await extractPdfText(file);
  if (text.trim().length < 40) return {} as NoaExtraction;
  return parseNoaText(text);
}

/** All five totals present and sensible. */
export const noaComplete = (d: NoaExtraction): d is TaxNoaSummary =>
  (['income', 'deductions', 'chargeable', 'tax'] as const).every(k => typeof d[k] === 'number' && Number.isFinite(d[k]) && d[k]! >= 0)
  && Number.isInteger(d.ya) && d.ya! >= 2000 && d.ya! <= 2100;
/** Income minus deductions should equal chargeable income (to the dollar). */
export const noaConsistent = (d: TaxNoaSummary) => Math.abs(Math.max(0, Math.floor(d.income - d.deductions)) - d.chargeable) <= 1;

/**
 * A year record for a reviewed NOA. An existing record keeps its detailed figures and gains the
 * NOA; a new one is filled from the NOA's line items (or its total income, if none were read).
 */
export function yearFromNoa(summary: TaxNoaSummary, existing: TaxYear | undefined, previous: TaxYear | undefined): TaxYear {
  const base: TaxYear = existing ?? (() => {
    const draft = emptyYear(summary.ya, previous);
    const lines = summary.lines ?? [];
    const income = (label: string) => lines.find(l => l.kind === 'income' && l.label === label)?.amount ?? 0;
    const employment = income('Employment'), trade = income('Trade, business, profession or vocation'), rent = income('Rent');
    const others = lines.filter(l => l.kind === 'income' && ['Interest', 'Dividends', 'Others'].includes(l.label)).reduce((sum, l) => sum + l.amount, 0);
    const itemised = employment + trade + rent + others;
    const reliefs: TaxYear['reliefs'] = {};
    for (const line of lines.filter(l => l.kind === 'relief')) {
      const key = RELIEF_ITEMS.find(item => item.label === line.label)?.key;
      if (key) reliefs[key] = (reliefs[key] || 0) + line.amount;
    }
    const donation = lines.find(l => l.kind === 'donation')?.amount ?? 0;
    return {
      ...draft, reliefs,
      employment: itemised ? employment : summary.income, selfEmployed: trade, rental: rent, otherIncome: others,
      donations: Math.round((donation / DONATION_MULTIPLIER) * 100) / 100,
      notes: draft.notes || 'Created from a Notice of Assessment.',
    };
  })();
  return { ...base, ya: summary.ya, status: 'Assessed', noaSummary: summary, assessedTax: summary.tax, noaDate: summary.date ?? base.noaDate };
}
