// Credit cards on the market, for the Cards tab's Singapore and Malaysia lists.
// - Singapore: MoneySmart (moneysmart.sg/credit-cards). Its listing pages are server-rendered by
//   Nuxt, and each page embeds its 20 products as structured data in __NUXT_DATA__ (fees, income,
//   interest, network, highlights, promotions), so we read that rather than the markup. The page
//   size is fixed at 20, so every page is fetched - the first page says how many there are.
// - Malaysia: RinggitPlus (ringgitplus.com/en/credit-card). One page lists every card with its
//   minimum income, annual fee and headline benefit; its category pages tag cards as cashback,
//   travel and so on.
// Neither site has a public API; both are fetched server-side (no CORS) with browser-like
// headers, and parsed defensively so a layout change shows up as an error, not wrong data.

export type MarketCountry = 'sg' | 'my';

export interface MarketCard {
  id: string;
  name: string;
  issuer: string;
  imageUrl: string | null;
  url: string; // the card's page on the source site
  applyUrl: string | null;
  categories: string[];
  highlights: Array<{ value: string; label: string }>;
  annualFee: string | null; // as the source states it, e.g. "Free", "S$196.20", "Free*"
  minIncome: string | null;
  minIncomeForeigner: string | null;
  interestRate: string | null;
  network: string | null;
  promotion: string | null;
  promotionEnds: string | null;
  summary: string | null;
  keyFeatures: string[];
}

export interface MarketCardList {
  country: MarketCountry;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  cards: MarketCard[];
  warnings: string[];
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-SG,en;q=0.9',
};
const MONEYSMART_URL = 'https://www.moneysmart.sg/credit-cards';
const RINGGITPLUS_URL = 'https://ringgitplus.com/en/credit-card/';
const RINGGITPLUS_CATEGORIES: Array<[string, string]> = [
  ['cashback', 'Cashback'], ['travel', 'Miles & travel'], ['rewards', 'Rewards'], ['petrol', 'Petrol'],
  ['islamic', 'Islamic'], ['no-annual-fee', 'No annual fee'], ['sign-up-offers', 'Sign-up offer'],
];

const fetchPage = async (url: string): Promise<string> => {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  if (response.status === 403 || response.status === 429) throw new Error(`${new URL(url).hostname} turned the request away (${response.status}) - it limits automated requests from some networks. Try Refresh later`);
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
  return response.text();
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘' };
export const decodeEntities = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) =>
  code[0] === '#' ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : ENTITIES[code.toLowerCase()] ?? whole);
// HTML fragments to one line of text: <br> and list items become separators.
export const plainText = (html: unknown): string => typeof html !== 'string' ? '' : decodeEntities(html
  .replace(/<br\s*\/?>|<\/(p|li|div)>/gi, ' · ').replace(/<[^>]+>/g, ''))
  .replace(/\s+/g, ' ').replace(/(\s*·\s*)+/g, ' · ').replace(/^\s*·\s*|\s*·\s*$/g, '').trim();
const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

// Nuxt serialises its payload with devalue: a flat array where objects and arrays hold indexes
// into it, and a few tagged arrays (["Reactive", i], ["Date", s], ...) wrap values.
export const reviveNuxtData = (html: string): any => {
  const match = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('page data not found');
  const raw = JSON.parse(match[1]) as unknown[];
  const memo = new Map<number, unknown>();
  const WRAPPERS = new Set(['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef', 'NuxtError', 'Island']);
  const revive = (index: unknown): unknown => {
    if (typeof index !== 'number') return index;
    if (index < 0) return undefined;
    if (memo.has(index)) return memo.get(index);
    const value = raw[index];
    if (Array.isArray(value)) {
      const tag = value[0];
      if (typeof tag === 'string' && (WRAPPERS.has(tag) || ['Set', 'Map', 'Date', 'BigInt', 'RegExp'].includes(tag))) {
        const out = tag === 'Date' || tag === 'BigInt' || tag === 'RegExp' ? value[1] : tag === 'Set' || tag === 'Map' ? value.slice(1).map(revive) : revive(value[1]);
        memo.set(index, out);
        return out;
      }
      const out: unknown[] = [];
      memo.set(index, out);
      value.forEach(item => out.push(revive(item)));
      return out;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      memo.set(index, out);
      Object.entries(value).forEach(([key, item]) => { out[key] = revive(item); });
      return out;
    }
    memo.set(index, value);
    return value;
  };
  return revive(0);
};

// Tags from what a card offers, for cards whose source doesn't categorise them.
const tagsFrom = (text: string, annualFee: string | null, promotion: string | null) => {
  const tags: string[] = [];
  if (/cash ?back|rebate/i.test(text)) tags.push('Cashback');
  if (/\bmiles?\b|krisflyer|travel|air ?miles/i.test(text)) tags.push('Miles & travel');
  if (/points?|rewards?|\d+x\b/i.test(text)) tags.push('Rewards');
  if (/petrol|fuel|shell|esso|caltex|spc\b/i.test(text)) tags.push('Petrol');
  if (annualFee && /^free$/i.test(annualFee)) tags.push('No annual fee');
  if (promotion) tags.push('Sign-up offer');
  return tags;
};

const money = (value: unknown, currency: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return amount === 0 ? 'Free' : `${currency}${amount.toLocaleString('en-US', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

export const parseMoneySmartPage = (html: string): { cards: MarketCard[]; pageCount: number } => {
  const data = reviveNuxtData(html)?.data || {};
  const listing = Object.entries(data).find(([key]) => key.startsWith('product-listings'))?.[1] as any;
  if (!listing || !Array.isArray(listing.products)) throw new Error('product list not found');
  const cards = listing.products.map((product: any): MarketCard | null => {
    const item = product?.attributes;
    if (!item?.name || !item?.slug) return null;
    const groups: any[] = Array.isArray(item.more_details?.group_attributes) ? item.more_details.group_attributes : [];
    const group = (slug: string) => groups.find(entry => entry?.feature_group_slug === slug)?.items as any[] | undefined;
    const field = (slug: string, title: RegExp) => group(slug)?.find(entry => title.test(String(entry?.title || '')));
    const rate = field('annual-interest-rate-and-fees', /Annual Interest Rate/i);
    const fee = field('annual-interest-rate-and-fees', /Annual Principal Fee/i);
    const income = field('minimum-income-requirements', /Singaporean|Minimum Annual Income/i);
    const foreigner = field('minimum-income-requirements', /Non-Singaporean|Foreigner/i);
    const network = (group('card-association') || []).filter(entry => entry?.value === 'true').map(entry => plainText(entry.title)).join(' / ');
    const highlights = (Array.isArray(item.highlights) ? item.highlights : [])
      .map((entry: any) => ({ value: plainText(entry?.value), label: plainText(entry?.label) }))
      .filter((entry: { value: string }) => entry.value);
    const annualFee = fee ? (fee.type === 'currency' ? money(fee.value, 'S$') : plainText(fee.value) || null) : null;
    const promotion = plainText(item.campaign?.title) || null;
    const keyFeatures = (Array.isArray(item.key_features) ? item.key_features : []).map((entry: unknown) => clip(plainText(entry).replace(/^-\s*/, ''), 220)).filter(Boolean).slice(0, 8);
    return {
      id: String(item.slug),
      name: plainText(item.name),
      issuer: plainText(item.provider?.attributes?.name) || plainText(item.name).split(' ')[0],
      imageUrl: typeof item.image_url === 'string' && item.image_url.startsWith('https://') ? item.image_url.replace(/ /g, '%20') : null,
      url: typeof item.pdp_url === 'string' && item.pdp_url.startsWith('https://www.moneysmart.sg/') ? item.pdp_url : `${MONEYSMART_URL}/${item.slug}`,
      applyUrl: typeof item.hopoff_url === 'string' && /^https:\/\/[a-z.]*moneysmart\.sg\//.test(item.hopoff_url) ? item.hopoff_url : null,
      categories: tagsFrom([...highlights.map((entry: { value: string; label: string }) => `${entry.value} ${entry.label}`), ...(Array.isArray(item.badges) ? item.badges : [])].join(' '), annualFee, promotion),
      highlights,
      annualFee,
      minIncome: income ? clip(plainText(income.value), 160) || null : null,
      minIncomeForeigner: foreigner ? clip(plainText(foreigner.value), 120) || null : null,
      interestRate: rate?.value ? `${plainText(rate.value)}${rate.type === 'percentage' ? '%' : ''}` : null,
      network: network || null,
      promotion,
      promotionEnds: typeof item.campaign?.promotion_end === 'string' ? item.campaign.promotion_end.slice(0, 10) : null,
      summary: item.summary ? clip(plainText(item.summary), 420) : null,
      keyFeatures,
    };
  }).filter(Boolean) as MarketCard[];
  const pageCount = Math.max(1, Math.min(20, Number(listing.meta?.total_page_count) || 1));
  return { cards, pageCount };
};

export const parseRinggitPlusList = (html: string): MarketCard[] => {
  const banks = [...html.matchAll(/<option value=("?)([^">]+)\1>/g)].map(match => decodeEntities(match[2])).filter(bank => bank !== 'All banks')
    .sort((a, b) => b.length - a.length);
  const list = html.slice(html.indexOf('class="Products'));
  const cards: MarketCard[] = [];
  for (const match of list.matchAll(/<h3><a href=("?)([^" >]+)\1[^>]*>([\s\S]*?)<\/a><\/h3>(?:<img[^>]*?src=("?)([^" >]+)\4[^>]*>)?\s*<dl>([\s\S]*?)<\/dl>/g)) {
    const href = match[2];
    if (!href.startsWith('/en/credit-card/')) continue;
    const name = plainText(match[3]);
    const terms = new Map<string, string>();
    for (const pair of match[6].matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) terms.set(plainText(pair[1]), decodeEntities(pair[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim());
    const annualFee = terms.get('Annual Fee') || null;
    const highlights = [...terms].filter(([label, value]) => label !== 'Min. Income' && label !== 'Annual Fee' && value && !/^no$/i.test(value))
      .map(([label, value]) => ({ value, label }));
    // Cards drop a trailing "Bank" ("Hong Leong Essential Card" is Hong Leong Bank's), and
    // co-branded cards put the partner first ("Lazada CIMB Card"), so try the start, then anywhere.
    const bankIn = (anchor: string) => banks.find(bank => [bank, bank.replace(/\s+bank$/i, '')].some(prefix => prefix.length >= 3
      && new RegExp(`${anchor}${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(name)));
    const issuer = bankIn('^') || bankIn('\\b') || 'Other';
    cards.push({
      id: href.replace(/^\/en\/credit-card\//, '').replace(/\.html$/, ''),
      name,
      issuer,
      // The list links 120px thumbnails; the same image is published at 400px.
      imageUrl: match[5]?.startsWith('https://') ? match[5].replace('/img-v5/card-120/', '/img-v5/card-400/') : null,
      url: `https://ringgitplus.com${href}`,
      applyUrl: null,
      categories: annualFee && /^free$/i.test(annualFee) ? ['No annual fee'] : [],
      highlights,
      annualFee,
      minIncome: terms.get('Min. Income') || null,
      minIncomeForeigner: null,
      interestRate: null,
      network: /visa/i.test(name) ? 'Visa' : /master ?card/i.test(name) ? 'Mastercard' : /american express|amex/i.test(name) ? 'American Express' : /unionpay/i.test(name) ? 'UnionPay' : null,
      promotion: null,
      promotionEnds: null,
      summary: null,
      keyFeatures: [],
    });
  }
  return cards;
};

const fetchSingapore = async (): Promise<MarketCardList> => {
  const first = parseMoneySmartPage(await fetchPage(MONEYSMART_URL));
  const warnings: string[] = [];
  const rest = await Promise.all(Array.from({ length: first.pageCount - 1 }, (_, i) => i + 2).map(page =>
    fetchPage(`${MONEYSMART_URL}?page=${page}`).then(html => parseMoneySmartPage(html).cards).catch(() => { warnings.push(`Page ${page} of MoneySmart's list could not be read.`); return []; })));
  const seen = new Set<string>();
  const cards = [...first.cards, ...rest.flat()].filter(card => !seen.has(card.id) && seen.add(card.id));
  return { country: 'sg', source: 'MoneySmart', sourceUrl: MONEYSMART_URL, fetchedAt: new Date().toISOString(), cards, warnings };
};

const fetchMalaysia = async (): Promise<MarketCardList> => {
  const [main, ...categoryPages] = await Promise.all([
    fetchPage(RINGGITPLUS_URL),
    ...RINGGITPLUS_CATEGORIES.map(([slug]) => fetchPage(`${RINGGITPLUS_URL}${slug}/`).catch(() => null)),
  ]);
  const cards = parseRinggitPlusList(main);
  const warnings: string[] = [];
  const byId = new Map(cards.map(card => [card.id, card]));
  categoryPages.forEach((html, index) => {
    const label = RINGGITPLUS_CATEGORIES[index][1];
    if (!html) { warnings.push(`RinggitPlus's ${label.toLowerCase()} list could not be read, so that filter may be incomplete.`); return; }
    parseRinggitPlusList(html).forEach(listed => {
      const card = byId.get(listed.id);
      if (card && !card.categories.includes(label)) card.categories.push(label);
    });
  });
  return { country: 'my', source: 'RinggitPlus', sourceUrl: RINGGITPLUS_URL, fetchedAt: new Date().toISOString(), cards, warnings };
};

const CACHE_MS = 6 * 3600_000;
const MIN_REFRESH_MS = 60_000; // a forced refresh still reuses a list younger than this
const cache = new Map<MarketCountry, MarketCardList>();

export async function handleCreditCardMarket(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const country = url.searchParams.get('country');
  if (country !== 'sg' && country !== 'my') return Response.json({ error: 'Choose country=sg or country=my.' }, { status: 400 });
  const cached = cache.get(country);
  const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
  if (cached && age < (url.searchParams.get('refresh') === '1' ? MIN_REFRESH_MS : CACHE_MS)) return Response.json(cached);
  try {
    const list = await (country === 'sg' ? fetchSingapore() : fetchMalaysia());
    if (list.cards.length === 0) throw new Error('no cards found - the site may have changed its layout');
    cache.set(country, list);
    return Response.json(list);
  } catch (error) {
    const source = country === 'sg' ? 'MoneySmart' : 'RinggitPlus';
    if (cached) return Response.json({ ...cached, warnings: [...cached.warnings, `${source} couldn't be reached just now, so this is the list from ${cached.fetchedAt}.`] });
    return Response.json({ error: `${source}'s card list couldn't be read: ${error instanceof Error ? error.message : 'unknown error'}.` }, { status: 502 });
  }
}
