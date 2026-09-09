import bundledServices from '../data/subscriptionServices';

export interface SubscriptionService {
  id: string;
  name: string;
  domain: string;
  category: string;
  aliases: string[];
  logo_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export const BUNDLED_SERVICES: SubscriptionService[] = bundledServices;
export const normalizeServiceName = (value: string) => value.toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\+/g, ' plus ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const isSubscriptionService = (value: unknown): value is SubscriptionService => {
  if (!value || typeof value !== 'object') return false;
  const s = value as SubscriptionService;
  return typeof s.id === 'string' && typeof s.name === 'string' && typeof s.category === 'string'
    && typeof s.domain === 'string' && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(s.domain)
    && Array.isArray(s.aliases) && s.aliases.every(a => typeof a === 'string')
    && (s.logo_url === null || (typeof s.logo_url === 'string' && /^https:\/\//.test(s.logo_url)))
    && Number.isFinite(s.sort_order) && typeof s.is_active === 'boolean';
};

export function findExactService(name: string, services: SubscriptionService[] = BUNDLED_SERVICES) {
  const query = normalizeServiceName(name);
  if (!query) return undefined;
  const matches = services.filter(s => [s.name, ...s.aliases].some(alias => normalizeServiceName(alias) === query));
  // Do not silently choose between different brands sharing a name.
  return matches.length === 1 ? matches[0] : undefined;
}

export function searchServices(query: string, services: SubscriptionService[], category = '') {
  const normalized = normalizeServiceName(query);
  const words = normalized.split(' ').filter(Boolean);
  return services.filter(s => s.is_active && (!category || s.category === category))
    .map(service => {
      const names = [service.name, ...service.aliases].map(normalizeServiceName);
      const haystack = normalizeServiceName(`${service.name} ${service.aliases.join(' ')} ${service.domain} ${service.category}`);
      const score = !normalized ? 3 : names.includes(normalized) ? 0
        : names.some(n => n.startsWith(normalized)) ? 1 : words.every(w => haystack.includes(w)) ? 2 : -1;
      return { service, score };
    })
    .filter(result => result.score !== -1)
    .sort((a, b) => a.score - b.score || a.service.sort_order - b.service.sort_order || a.service.name.localeCompare(b.service.name))
    .map(result => result.service);
}
