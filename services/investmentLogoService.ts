import type { InvestmentKind } from '../types';

const logoDevToken = (import.meta.env.VITE_LOGO_DEV_PUBLISHABLE_KEY || '').trim();
const hasLogoDevKey = /^pk_[a-zA-Z0-9_-]+$/.test(logoDevToken);

export const getInvestmentLogoUrls = (kind: InvestmentKind, symbol?: string): string[] => {
  const normalizedSymbol = symbol?.trim().toUpperCase();
  if (kind !== 'Stocks' || !normalizedSymbol) return [];

  const encodedSymbol = encodeURIComponent(normalizedSymbol);
  const urls: string[] = [];

  if (hasLogoDevKey) {
    urls.push(`https://img.logo.dev/ticker/${encodedSymbol}?${new URLSearchParams({
      token: logoDevToken,
      size: '128',
      format: 'png',
      theme: 'light',
      fallback: '404',
    })}`);
  }

  // Keyless fallback for local development and installations that have not configured
  // Logo.dev. A failed or unsupported ticker falls through to the in-app monogram.
  urls.push(`https://financialmodelingprep.com/image-stock/${encodedSymbol}.png`);

  return urls;
};
