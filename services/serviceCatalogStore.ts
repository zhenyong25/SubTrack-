import { useEffect, useSyncExternalStore } from 'react';
import { getSupabaseClient } from './appDataService';
import { BUNDLED_SERVICES, isSubscriptionService, type SubscriptionService } from './serviceCatalog';

const CACHE_KEY = 'subtrack_service_catalog_v1';
const TTL = 24 * 60 * 60 * 1000;
let catalog = BUNDLED_SERVICES;
let cacheRead = false;
let lastAttempt = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = (next: SubscriptionService[]) => {
  catalog = next;
  listeners.forEach(listener => listener());
};
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getServiceCatalogSnapshot = () => catalog;

export async function loadServiceCatalog() {
  const client = getSupabaseClient();
  // Keep caches isolated when switching Supabase projects.
  const cacheKey = `${CACHE_KEY}:${import.meta.env.VITE_SUPABASE_URL || 'local'}`;
  if (!cacheRead) {
    cacheRead = true;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && Date.now() - cached.savedAt < TTL && Array.isArray(cached.services)
        && cached.services.length && cached.services.every(isSubscriptionService)) publish(cached.services);
    } catch { /* Bundled catalog works when storage is unavailable. */ }
  }
  if (!client || Date.now() - lastAttempt < 60_000) return pending;
  if (pending) return pending;
  lastAttempt = Date.now();
  pending = (async () => {
    try {
      const rows: SubscriptionService[] = [];
      // Supabase commonly caps responses at 1,000 rows. Page explicitly.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from('subscription_services')
          .select('id,name,domain,category,aliases,logo_url,sort_order,is_active')
          .order('sort_order').order('id').range(offset, offset + 499);
        if (error || !data || !data.every(isSubscriptionService)) return;
        rows.push(...data);
        if (data.length < 500) break;
      }
      if (!rows.length) return;
      publish(rows);
      try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), services: rows })); } catch { /* Optional cache. */ }
    } catch { /* Offline or migration not applied: retain usable catalog. */ }
    finally { pending = null; }
  })();
  return pending;
}

export function useServiceCatalog() {
  const services = useSyncExternalStore(subscribe, getServiceCatalogSnapshot, () => BUNDLED_SERVICES);
  useEffect(() => { void loadServiceCatalog(); }, []);
  return services;
}
