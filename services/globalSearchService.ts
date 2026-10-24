import type { Expense, Subscription, InvestmentTransaction, InvestmentHolding, InvestmentAccount, PaymentCard } from '../types';

export type SearchKind = 'expense' | 'subscription' | 'transaction';
export const SEARCH_LABELS: Record<SearchKind, string> = { expense: 'Expenses', subscription: 'Subscriptions', transaction: 'Transactions' };
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 32;
export const normalizeSearchText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/(\d),(?=\d)/g, '$1');
export const normalizeTags = (values: unknown): string[] => Array.isArray(values)
  ? [...new Set(values.filter((value): value is string => typeof value === 'string').map(value => value.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_TAG_LENGTH)).filter(Boolean))].slice(0, MAX_TAGS)
  : [];

export interface SearchRecord {
  key: string;
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  date: string;
  amount: number | null;
  currency: string;
  notes: string;
  tags: string[];
  details: Array<{ label: string; value: string }>;
  searchText: string;
}
export interface SearchData {
  expenses: Expense[];
  subscriptions: Subscription[];
  transactions: InvestmentTransaction[];
  holdings: InvestmentHolding[];
  accounts: InvestmentAccount[];
  cards: PaymentCard[];
}

export function buildSearchRecords(data: SearchData): SearchRecord[] {
  const cards = new Map(data.cards.map(item => [item.id, item.name]));
  const holdings = new Map(data.holdings.map(item => [item.id, item]));
  const accounts = new Map(data.accounts.map(item => [item.id, item]));
  const build = (record: Omit<SearchRecord, 'key' | 'searchText'>, extra = ''): SearchRecord => ({
    ...record,
    key: `${record.kind}:${record.id}`,
    searchText: normalizeSearchText([record.title, record.subtitle, record.date, record.currency, record.notes, ...record.tags, record.amount, record.amount?.toFixed(2), ...record.details.map(item => item.value), extra].join(' ')),
  });
  return [
    ...data.expenses.map(item => {
      const card = cards.get(item.linkedCardId || '') || item.linkedCardName || 'Cash';
      return build({ id: item.id, kind: 'expense', title: item.name, subtitle: `${item.category} · ${card}`, date: item.expenseDate.slice(0, 10), amount: item.amount, currency: item.currency, notes: item.notes || '', tags: normalizeTags(item.tags), details: [{ label: 'Category', value: item.category }, { label: 'Payment method', value: card }] });
    }),
    ...data.subscriptions.map(item => {
      const card = cards.get(item.cardId || '') || item.cardName || 'Cash';
      return build({ id: item.id, kind: 'subscription', title: item.name, subtitle: `${item.billingCycle} · ${item.status} · ${item.category}`, date: (item.status === 'Past' ? item.cancellationDate || item.nextPaymentDate : item.nextPaymentDate).slice(0, 10), amount: item.price, currency: item.currency, notes: item.notes || '', tags: normalizeTags(item.tags), details: [{ label: 'Billing cycle', value: item.billingCycle }, { label: 'Status', value: item.status }, { label: 'Category', value: item.category }, { label: 'Payment method', value: card }, { label: 'Started', value: item.firstPaymentDate.slice(0, 10) } ] }, (item.sharedWith || []).join(' '));
    }),
    ...data.transactions.map(item => {
      const holding = holdings.get(item.investmentId);
      const account = holding?.accountId ? accounts.get(holding.accountId) : undefined;
      const title = `${item.transactionType} · ${holding?.name || item.source || 'Investment'}`;
      const amount = item.transactionType === 'Split' ? null : item.transactionType === 'Fee' ? item.fees : item.transactionType === 'Dividend' ? item.price : item.units * item.price;
      return build({ id: item.id, kind: 'transaction', title, subtitle: [holding?.symbol, account?.name || 'Unassigned account', item.transactionType].filter(Boolean).join(' · '), date: item.tradeDate.slice(0, 10), amount, currency: item.currency, notes: item.notes || '', tags: normalizeTags(item.tags), details: [{ label: 'Type', value: item.transactionType }, { label: 'Holding', value: holding?.name || item.source || 'Investment' }, { label: 'Units', value: String(item.units) }, { label: 'Unit price', value: `${item.price} ${item.currency}` }, { label: 'Fees', value: `${item.fees} ${item.currency}` }, { label: 'Brokerage account', value: account?.name || 'Unassigned' }, ...(account?.broker ? [{ label: 'Broker', value: account.broker }] : [])] }, [item.source, item.externalId, holding?.kind].join(' '));
    }),
  ];
}

export interface SearchFilters { query: string; kind: SearchKind | 'all'; tags: string[]; from: string; to: string; currency: string; sort: 'relevance' | 'newest' | 'oldest' }
export function searchRecords(records: SearchRecord[], filters: SearchFilters) {
  const tokens = [...filters.query.matchAll(/#"([^"]+)"|#([^\s]+)|"([^"]+)"|(\S+)/g)];
  const tagTerms = tokens.filter(match => match[1] || match[2]).map(match => normalizeSearchText(match[1] || match[2]));
  const words = tokens.filter(match => match[3] || match[4]).map(match => normalizeSearchText(match[3] || match[4]));
  const requiredTags = [...filters.tags.map(normalizeSearchText), ...tagTerms];
  const matches = records.filter(record => {
    if (filters.from && record.date < filters.from || filters.to && record.date > filters.to || filters.currency && record.currency !== filters.currency) return false;
    const tags = record.tags.map(normalizeSearchText);
    return requiredTags.every(tag => tags.includes(tag)) && words.every(word => record.searchText.includes(word));
  });
  const counts = { all: matches.length, expense: 0, subscription: 0, transaction: 0 };
  for (const record of matches) counts[record.kind]++;
  const score = (record: SearchRecord) => words.reduce((sum, word) => sum + (normalizeSearchText(record.title).includes(word) ? 4 : record.tags.some(tag => normalizeSearchText(tag).includes(word)) ? 2 : 1), 0);
  const results = matches.filter(record => filters.kind === 'all' || record.kind === filters.kind).sort((a, b) => {
    if (filters.sort === 'relevance' && words.length) { const diff = score(b) - score(a); if (diff) return diff; }
    const date = a.date.localeCompare(b.date);
    return (filters.sort === 'oldest' ? date : -date) || a.key.localeCompare(b.key);
  });
  return { results, counts };
}
