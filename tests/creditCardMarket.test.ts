import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCreditCardMarket, parseMoneySmartPage, parseRinggitPlusList, plainText, reviveNuxtData } from '../server/creditCardMarket';
import { amountOf, filterMarketCards, ownsCard, categoriesOf } from '../services/creditCardMarketService';

// Nuxt's payload format: a flat array where objects and arrays point at other entries by index.
const toNuxtData = (root: unknown, wrapRoot = true) => {
  const out: unknown[] = [];
  const add = (value: unknown): number => {
    const index = out.length;
    out.push(null);
    if (Array.isArray(value)) out[index] = value.map(add);
    else if (value && typeof value === 'object') out[index] = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, add(item)]));
    else out[index] = value;
    return index;
  };
  if (wrapRoot) { out.push(['ShallowReactive', 1]); add(root); } else add(root);
  return `<html><script type="application/json" data-nuxt-data="nuxt-app" id="__NUXT_DATA__">${JSON.stringify(out)}</script></html>`;
};

const moneySmartProduct = (slug: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: slug, type: 'product',
  attributes: {
    name, slug,
    provider: { attributes: { name: 'UOB' } },
    image_url: 'https://photos.cdn-moneysmart.com/credit_cards/uploads/products/images/UOB One Card.png',
    pdp_url: `https://www.moneysmart.sg/credit-cards/${slug}`,
    hopoff_url: `https://iss.moneysmart.sg/credit-cards/${slug}/redirect?campaign_id=1`,
    highlights: [
      { value: 'Up to 10%', label: 'cashback on daily spend at McDonald&#39;s, Grab &amp; Shopee' },
      { value: 'Up to S$2,240', label: 'cashback cap a year' },
    ],
    badges: ['Enjoy up to 10% Cashback!'],
    key_features: ['- Earn up to 10% cashback', '<b>No</b> minimum spend'],
    summary: 'Great for <em>steady</em> spenders.',
    campaign: { title: 'Get S$60 Cash', promotion_end: '2026-10-31T23:59:00+08:00' },
    more_details: { group_attributes: [
      { feature_group_slug: 'annual-interest-rate-and-fees', items: [
        { title: 'Annual Interest Rate', value: '27.80', type: 'percentage' },
        { title: 'Annual Principal Fee', value: '196.2', type: 'currency' },
      ] },
      { feature_group_slug: 'minimum-income-requirements', items: [
        { title: 'Singaporean/PR Minimum Annual Income', value: 'S$30,000', type: 'text' },
        { title: 'Non-Singaporean Minimum Annual Income', value: 'S$40,000', type: 'text' },
      ] },
      { feature_group_slug: 'card-association', items: [{ title: 'Visa', value: 'true' }, { title: 'Mastercard', value: 'false' }] },
    ] },
    ...extra,
  },
});

const moneySmartPage = (products: unknown[], pageCount = 1) => toNuxtData({ data: {
  'channelConfig-credit-cards-en': { categories: [] },
  'product-listings-credit-cards-{"page":"1"}': { products, meta: { page: 1, total_page_count: pageCount, total_product_count: products.length } },
} });

test('revives Nuxt payloads, including wrapped and shared values', () => {
  const shared = { name: 'shared' };
  const data = reviveNuxtData(toNuxtData({ a: shared, b: [1, 'two'] }));
  assert.deepEqual(data, { a: { name: 'shared' }, b: [1, 'two'] });
  assert.throws(() => reviveNuxtData('<html></html>'), /page data not found/);
});

test('reads a MoneySmart product into a market card', () => {
  const { cards, pageCount } = parseMoneySmartPage(moneySmartPage([moneySmartProduct('uob-one-card', 'UOB One Card')], 5));
  assert.equal(pageCount, 5);
  const [card] = cards;
  assert.equal(card.name, 'UOB One Card');
  assert.equal(card.issuer, 'UOB');
  assert.equal(card.annualFee, 'S$196.20');
  assert.equal(card.interestRate, '27.80%');
  assert.equal(card.minIncome, 'S$30,000');
  assert.equal(card.minIncomeForeigner, 'S$40,000');
  assert.equal(card.network, 'Visa');
  assert.equal(card.promotion, 'Get S$60 Cash');
  assert.equal(card.promotionEnds, '2026-10-31');
  assert.equal(card.imageUrl, 'https://photos.cdn-moneysmart.com/credit_cards/uploads/products/images/UOB%20One%20Card.png');
  assert.equal(card.applyUrl, 'https://iss.moneysmart.sg/credit-cards/uob-one-card/redirect?campaign_id=1');
  assert.deepEqual(card.highlights[0], { value: 'Up to 10%', label: "cashback on daily spend at McDonald's, Grab & Shopee" });
  assert.deepEqual(card.keyFeatures, ['Earn up to 10% cashback', 'No minimum spend']);
  assert.equal(card.summary, 'Great for steady spenders.');
  assert.ok(card.categories.includes('Cashback') && card.categories.includes('Sign-up offer'));
  assert.ok(!card.categories.includes('No annual fee'));
});

test('a free MoneySmart card is tagged no annual fee, and untrusted links are dropped', () => {
  const { cards } = parseMoneySmartPage(moneySmartPage([moneySmartProduct('free-card', 'Free Miles Card', {
    hopoff_url: 'https://evil.example/redirect', pdp_url: 'https://evil.example/card', campaign: null, badges: [],
    highlights: [{ value: '1.2 miles', label: 'per S$1 spent' }],
    more_details: { group_attributes: [{ feature_group_slug: 'annual-interest-rate-and-fees', items: [{ title: 'Annual Principal Fee', value: '0', type: 'currency' }] }] },
  })]));
  const [card] = cards;
  assert.equal(card.annualFee, 'Free');
  assert.equal(card.applyUrl, null);
  assert.equal(card.url, 'https://www.moneysmart.sg/credit-cards/free-card');
  assert.deepEqual(card.categories, ['Miles & travel', 'No annual fee']);
});

const ringgitPlusHtml = (items: string) => `<form class=Filter><select><option value="All banks" selected>All banks</option><option value=Maybank>Maybank</option><option value="Maybank Islamic">Maybank Islamic</option><option value="Hong Leong Bank">Hong Leong Bank</option></select></form>
<ul class="Products CRCD">${items}</ul>`;
const ringgitPlusItem = (href: string, name: string, income: string, fee: string, cashback: string) =>
  `<li><!--F#1--><h3><a href=${href}>${name}</a></h3><img loading=lazy src=https://ringgitplus.com/img-v5/card-120/${href.length}.jpg alt="${name}"><dl><dt>Min. Income</dt><dd><span>${income}</span><sub>/month</sub></dd><dt>Annual Fee</dt><dd>${fee}</dd><dt>Cashback</dt><dd>${cashback}</dd></dl></li>`;

test('reads RinggitPlus tiles, matching the longest bank name', () => {
  const cards = parseRinggitPlusList(ringgitPlusHtml([
    ringgitPlusItem('/en/credit-card/Maybank-Islamic-Ikhwan-Visa.html', 'Maybank Islamic Ikhwan Visa', 'RM2,000', 'Free', 'up to <span>8%</span>'),
    ringgitPlusItem('/en/credit-card/Hong-Leong-Essential.html', 'Hong Leong Essential Card', 'RM3,000', 'RM250', 'No'),
    '<li><h3><a href=/en/personal-loan/x.html>Not a card</a></h3><dl><dt>Rate</dt><dd>4%</dd></dl></li>',
  ].join('')));
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map(card => card.issuer), ['Maybank Islamic', 'Hong Leong Bank']);
  assert.equal(cards[0].id, 'Maybank-Islamic-Ikhwan-Visa');
  assert.equal(cards[0].minIncome, 'RM2,000/month');
  assert.equal(cards[0].annualFee, 'Free');
  assert.deepEqual(cards[0].highlights, [{ value: 'up to 8%', label: 'Cashback' }]);
  assert.deepEqual(cards[0].categories, ['No annual fee']);
  assert.equal(cards[0].network, 'Visa');
  assert.equal(cards[0].url, 'https://ringgitplus.com/en/credit-card/Maybank-Islamic-Ikhwan-Visa.html');
  assert.deepEqual(cards[1].highlights, []); // "No" cashback isn't a highlight
});

test('fetches every MoneySmart page and tags Malaysian cards from category pages', async () => {
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  try {
    globalThis.fetch = (async (input: string) => {
      const url = String(input); asked.push(url);
      if (url === 'https://www.moneysmart.sg/credit-cards') return new Response(moneySmartPage([moneySmartProduct('a', 'Card A')], 3));
      if (url.endsWith('?page=2')) return new Response(moneySmartPage([moneySmartProduct('b', 'Card B'), moneySmartProduct('a', 'Card A')], 3));
      if (url.endsWith('?page=3')) return new Response('down', { status: 500 });
      const item = ringgitPlusItem('/en/credit-card/Maybank-2-Gold.html', 'Maybank 2 Gold Card', 'RM2,500', 'Free*', 'up to <span>5%</span>');
      if (url === 'https://ringgitplus.com/en/credit-card/') return new Response(ringgitPlusHtml(item));
      if (url.includes('/cashback/') || url.includes('/islamic/')) return new Response(ringgitPlusHtml(url.includes('/cashback/') ? item : ''));
      return new Response('missing', { status: 404 });
    }) as typeof fetch;
    const sg = await (await handleCreditCardMarket(new Request('http://x/api/credit-cards?country=sg'))).json();
    assert.deepEqual(sg.cards.map((card: { id: string }) => card.id), ['a', 'b']); // duplicates across pages dropped
    assert.equal(sg.source, 'MoneySmart');
    assert.equal(sg.warnings.length, 1); // page 3 failed
    const my = await (await handleCreditCardMarket(new Request('http://x/api/credit-cards?country=my'))).json();
    assert.equal(my.cards.length, 1);
    assert.deepEqual(my.cards[0].categories, ['Cashback']); // "Free*" is a conditional waiver, not "no annual fee"
    assert.equal(my.warnings.length, 5); // five category pages answered 404
    // A second request inside the cache window doesn't refetch.
    const before = asked.length;
    await handleCreditCardMarket(new Request('http://x/api/credit-cards?country=my'));
    assert.equal(asked.length, before);
  } finally { globalThis.fetch = realFetch; }
});

test('rejects unknown countries and pages without product data', async () => {
  assert.equal((await handleCreditCardMarket(new Request('http://x/api/credit-cards?country=us'))).status, 400);
  assert.throws(() => parseMoneySmartPage('<html>no data</html>'), /page data not found/);
  assert.throws(() => parseMoneySmartPage(toNuxtData({ data: {} })), /product list not found/);
});

test('turns fee and income text into amounts for sorting', () => {
  assert.equal(amountOf('Free'), 0);
  assert.equal(amountOf('Free*'), 0);
  assert.equal(amountOf('S$196.20'), 196.2);
  assert.equal(amountOf('RM3,000/month'), 3000);
  assert.equal(amountOf('(a) Singaporeans: SGD 65,000 OR ...'), 65000);
  assert.equal(amountOf(null), Infinity);
});

test('filters, searches and sorts market cards', () => {
  const card = (id: string, name: string, issuer: string, fee: string, income: string, categories: string[]) => ({
    id, name, issuer, imageUrl: null, url: '', applyUrl: null, categories, highlights: [{ value: 'up to 5%', label: 'cashback' }], annualFee: fee,
    minIncome: income, minIncomeForeigner: null, interestRate: null, network: null, promotion: null, promotionEnds: null, summary: null, keyFeatures: [],
  });
  const cards = [card('1', 'UOB One Card', 'UOB', 'S$196.20', 'S$30,000', ['Cashback']), card('2', 'DBS Altitude', 'DBS', 'Free', 'S$30,000', ['Miles & travel', 'No annual fee']), card('3', 'Citi Rewards', 'Citi', 'S$194.40', 'S$42,000', ['Rewards'])];
  const base = { query: '', issuer: '', category: '', sort: 'featured' as const };
  assert.deepEqual(filterMarketCards(cards, base).map(c => c.id), ['1', '2', '3']);
  assert.deepEqual(filterMarketCards(cards, { ...base, sort: 'fee' }).map(c => c.id), ['2', '3', '1']);
  assert.deepEqual(filterMarketCards(cards, { ...base, sort: 'income' }).map(c => c.id), ['2', '1', '3']); // tie broken by name
  assert.deepEqual(filterMarketCards(cards, { ...base, category: 'Rewards' }).map(c => c.id), ['3']);
  assert.deepEqual(filterMarketCards(cards, { ...base, issuer: 'DBS' }).map(c => c.id), ['2']);
  assert.deepEqual(filterMarketCards(cards, { ...base, query: 'uob cashback' }).map(c => c.id), ['1']);
  assert.deepEqual(categoriesOf(cards).slice(0, 1), ['Cashback']);
});

test('recognises your own cards by name', () => {
  const market = { name: 'UOB One Card' } as Parameters<typeof ownsCard>[0];
  assert.equal(ownsCard(market, ['UOB One']), true);
  assert.equal(ownsCard(market, ['uob one credit card']), true);
  assert.equal(ownsCard(market, ['UOB']), false);
  assert.equal(ownsCard({ name: 'DBS Live Fresh Card' } as Parameters<typeof ownsCard>[0], ['DBS Live Fresh']), true);
  assert.equal(ownsCard({ name: 'DBS Altitude Visa Signature Card' } as Parameters<typeof ownsCard>[0], ['DBS Live Fresh']), false);
});

test('plain text from HTML fragments', () => {
  assert.equal(plainText('(a) Singaporeans: SGD 65,000 OR <br> (b) PR &amp; others'), '(a) Singaporeans: SGD 65,000 OR · (b) PR & others');
  assert.equal(plainText(undefined), '');
});
