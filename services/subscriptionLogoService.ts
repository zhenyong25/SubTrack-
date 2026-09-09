import type { SubscriptionService } from './serviceCatalog';
import localLogoAssets from '../data/serviceLogoAssets';

const token = (import.meta.env.VITE_LOGO_DEV_PUBLISHABLE_KEY || '').trim();
export const hasLogoDevKey = /^pk_[a-zA-Z0-9_-]+$/.test(token);
export const getServiceLogoUrls = (service?: SubscriptionService): string[] => {
  if (!service) return [];
  const urls: string[] = [];
  if (service.logo_url?.startsWith('https://')) urls.push(service.logo_url);
  if (localLogoAssets[service.domain]) urls.push(localLogoAssets[service.domain]);
  if (hasLogoDevKey) urls.push(`https://img.logo.dev/${encodeURIComponent(service.domain)}?${new URLSearchParams({ token, size: '128', format: 'png', theme: 'light', fallback: '404' })}`);
  // Also covers new database entries that were added after the app was built.
  urls.push(`https://www.google.com/s2/favicons?${new URLSearchParams({ domain: service.domain, sz: '128' })}`);
  urls.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(service.domain)}.ico`);
  return [...new Set(urls)];
};
export const getServiceLogoUrl = (service?: SubscriptionService) => getServiceLogoUrls(service)[0];

const hashName = (name: string) => {
  let hash = 0;
  for (const character of name) hash = character.charCodeAt(0) + ((hash << 5) - hash);
  return Math.abs(hash);
};

export const getSubscriptionLogoDataUrl = (name: string) => {
  const label = (Array.from(name.trim())[0]?.toUpperCase() || '?').replace(/[<>&"']/g, char => `&#${char.charCodeAt(0)};`);
  const hue = hashName(name) % 360;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="hsl(${hue} 72% 55%)"/>
          <stop offset="1" stop-color="hsl(${(hue + 38) % 360} 68% 38%)"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#g)"/>
      <text x="32" y="41" text-anchor="middle" font-family="system-ui, sans-serif" font-size="30" font-weight="800" fill="white">${label}</text>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
