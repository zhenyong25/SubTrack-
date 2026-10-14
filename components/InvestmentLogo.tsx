import React, { useMemo, useState } from 'react';
import type { InvestmentHolding } from '../types';
import { getInvestmentLogoUrls } from '../services/investmentLogoService';

interface InvestmentLogoProps {
  investment: InvestmentHolding;
  className?: string;
}

const getInitials = (name: string, symbol?: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0]?.slice(0, 2) || symbol?.slice(0, 2) || '?').toUpperCase();
};

export default function InvestmentLogo({ investment, className = 'h-11 w-11' }: InvestmentLogoProps) {
  const candidates = useMemo(
    () => getInvestmentLogoUrls(investment.kind, investment.symbol),
    [investment.kind, investment.symbol],
  );
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const source = candidates.find(candidate => !failedSources.includes(candidate));

  if (source) {
    return (
      <span className={`${className} flex items-center justify-center overflow-hidden border border-border bg-white p-1.5 shadow-sm`}>
        <img
          src={source}
          alt={`${investment.name} logo`}
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
          referrerPolicy="origin"
          onError={() => setFailedSources(previous => previous.includes(source) ? previous : [...previous, source])}
        />
      </span>
    );
  }

  return (
    <span
      className={`${className} flex items-center justify-center border border-white/10 text-xs font-black text-white shadow-sm`}
      style={{ backgroundColor: investment.color || '#64748b' }}
      aria-label={`${investment.name} monogram`}
    >
      {getInitials(investment.name, investment.symbol)}
    </span>
  );
}
