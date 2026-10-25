// Same Logo.dev key check as subscriptionLogoService, kept here so this stays importable in tests.
const token = (import.meta.env?.VITE_LOGO_DEV_PUBLISHABLE_KEY || '').trim();
const hasLogoDevKey = /^pk_[a-zA-Z0-9_-]+$/.test(token);

export interface Bank {
  name: string;
  domain: string;
}

// Banks and card issuers common in Singapore and Malaysia, matched on whole words in a loan's
// lender, name or linked card name. More specific patterns come first (e.g. "Hong Leong" before
// anything that might share a word with it).
const BANKS: Array<Bank & { pattern: RegExp }> = [
  { name: 'DBS PayLah!', domain: 'dbs.com.sg', pattern: /\bpaylah\b/i },
  { name: 'YouTrip', domain: 'you.co', pattern: /\byou\s?trip\b/i },
  { name: 'Alipay', domain: 'alipay.com', pattern: /\balipay\b|支付宝/i },
  { name: "Touch 'n Go", domain: 'tngdigital.com.my', pattern: /\btouch\s*['’]?\s*n\s*['’]?\s*go\b|\btng\b/i },
  { name: 'Wise', domain: 'wise.com', pattern: /\bwise\b|\btransferwise\b/i },
  { name: 'Revolut', domain: 'revolut.com', pattern: /\brevolut\b/i },
  { name: 'GrabPay', domain: 'grab.com', pattern: /\bgrab\s?pay\b/i },
  { name: 'ShopeePay', domain: 'shopeepay.com.my', pattern: /\bshopee\s?pay\b/i },
  { name: 'Boost', domain: 'myboost.co', pattern: /\bboost\b/i },
  { name: 'MAE', domain: 'maybank.com', pattern: /\bmae\b/i },
  { name: 'DBS', domain: 'dbs.com.sg', pattern: /\bdbs\b|\bposb\b/i },
  { name: 'OCBC', domain: 'ocbc.com', pattern: /\bocbc\b/i },
  { name: 'UOB', domain: 'uob.com.sg', pattern: /\buob\b|united overseas bank/i },
  { name: 'Citibank', domain: 'citibank.com.sg', pattern: /\bciti(bank)?\b/i },
  { name: 'HSBC', domain: 'hsbc.com.sg', pattern: /\bhsbc\b/i },
  { name: 'Standard Chartered', domain: 'sc.com', pattern: /standard chartered|\bstanchart\b|\bscb\b/i },
  { name: 'American Express', domain: 'americanexpress.com', pattern: /\bamex\b|american express/i },
  { name: 'Maybank', domain: 'maybank.com', pattern: /\bmaybank\b/i },
  { name: 'CIMB', domain: 'cimb.com', pattern: /\bcimb\b/i },
  { name: 'Public Bank', domain: 'pbebank.com', pattern: /public bank|\bpbb\b/i },
  { name: 'RHB', domain: 'rhbgroup.com', pattern: /\brhb\b/i },
  { name: 'Hong Leong Bank', domain: 'hlb.com.my', pattern: /hong leong|\bhlb\b/i },
  { name: 'AmBank', domain: 'ambank.com.my', pattern: /\bambank\b/i },
  { name: 'Bank Islam', domain: 'bankislam.com', pattern: /bank islam/i },
  { name: 'Trust Bank', domain: 'trustbank.sg', pattern: /trust bank/i },
  { name: 'GXS Bank', domain: 'gxs.com.sg', pattern: /\bgxs\b/i },
  { name: 'MariBank', domain: 'maribank.sg', pattern: /\bmari\s?bank\b/i },
  { name: 'Bank of China', domain: 'bankofchina.com', pattern: /bank of china|\bboc\b/i },
];

// The first bank named in any of the given texts, checked in order (lender before loan name).
export const findBank = (...texts: Array<string | undefined>): Bank | undefined => {
  for (const text of texts) {
    if (!text) continue;
    const match = BANKS.find(bank => bank.pattern.test(text));
    if (match) return { name: match.name, domain: match.domain };
  }
  return undefined;
};

// Logo sources to try in order, the same chain subscription logos use.
export const getBankLogoUrls = (bank: Bank): string[] => {
  const urls: string[] = [];
  if (hasLogoDevKey) urls.push(`https://img.logo.dev/${encodeURIComponent(bank.domain)}?${new URLSearchParams({ token, size: '128', format: 'png', theme: 'light', fallback: '404' })}`);
  urls.push(`https://www.google.com/s2/favicons?${new URLSearchParams({ domain: bank.domain, sz: '128' })}`);
  urls.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(bank.domain)}.ico`);
  return urls;
};
