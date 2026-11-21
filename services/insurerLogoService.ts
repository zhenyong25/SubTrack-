import type { Bank } from './bankLogoService';

// Insurers common in Singapore and Malaysia, matched on whole words in a policy's insurer field.
// Logos load through the same source chain as bank logos (see getBankLogoUrls). More specific
// patterns come first (Tiq before Etiqa, HSBC Life before anything matching "life").
const INSURERS: Array<Bank & { pattern: RegExp }> = [
  { name: 'Income', domain: 'income.com.sg', pattern: /\b(ntuc\s+)?income\b/i },
  { name: 'Chubb', domain: 'chubb.com', pattern: /\bchubb\b/i },
  { name: 'FWD', domain: 'fwd.com.sg', pattern: /\bfwd\b/i },
  { name: 'AIA', domain: 'aia.com.sg', pattern: /\baia\b/i },
  { name: 'Prudential', domain: 'prudential.com.sg', pattern: /\bprudential\b|\bpru\b/i },
  { name: 'Great Eastern', domain: 'greateasternlife.com', pattern: /great\s*eastern/i },
  { name: 'Singlife', domain: 'singlife.com', pattern: /\bsing\s?life\b|\baviva\b/i },
  { name: 'HSBC Life', domain: 'hsbc.com.sg', pattern: /\bhsbc\b/i },
  { name: 'Manulife', domain: 'manulife.com.sg', pattern: /\bmanulife\b/i },
  { name: 'Tokio Marine', domain: 'tokiomarine.com', pattern: /tokio\s*marine/i },
  { name: 'MSIG', domain: 'msig.com.sg', pattern: /\bmsig\b|mitsui\s+sumitomo/i },
  { name: 'Allianz', domain: 'allianz.com', pattern: /\ballianz\b/i },
  { name: 'AXA', domain: 'axa.com', pattern: /\baxa\b/i },
  { name: 'Tiq', domain: 'tiq.com.sg', pattern: /\btiq\b/i },
  { name: 'Etiqa', domain: 'etiqa.com.sg', pattern: /\betiqa\b/i },
  { name: 'Sompo', domain: 'sompo.com.sg', pattern: /\bsompo\b/i },
  { name: 'Liberty', domain: 'libertyinsurance.com.sg', pattern: /\bliberty\b/i },
  { name: 'HL Assurance', domain: 'hlas.com.sg', pattern: /\bhlas\b|hl\s+assurance/i },
  { name: 'Raffles Health Insurance', domain: 'raffleshealthinsurance.com', pattern: /\braffles\b/i },
  { name: 'DirectAsia', domain: 'directasia.com', pattern: /direct\s?asia/i },
  { name: 'AIG', domain: 'aig.sg', pattern: /\baig\b/i },
  { name: 'Zurich', domain: 'zurich.com', pattern: /\bzurich\b/i },
  { name: 'Generali', domain: 'generali.com', pattern: /\bgenerali\b/i },
  { name: 'Starr', domain: 'starrcompanies.com', pattern: /\bstarr\b/i },
  { name: 'Cigna', domain: 'cigna.com', pattern: /\bcigna\b/i },
  { name: 'Bupa', domain: 'bupa.com', pattern: /\bbupa\b/i },
  { name: 'Lonpac', domain: 'lonpac.com', pattern: /\blonpac\b/i },
  { name: 'Takaful Malaysia', domain: 'takaful-malaysia.com.my', pattern: /takaful\s+malaysia/i },
];

/** The insurer named in a policy's insurer field, or undefined when it isn't one we know. */
export const findInsurer = (insurer: string | undefined): Bank | undefined => {
  if (!insurer) return undefined;
  const match = INSURERS.find(i => i.pattern.test(insurer));
  return match && { name: match.name, domain: match.domain };
};
