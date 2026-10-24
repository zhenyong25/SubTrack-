import React, { useState } from 'react';
import { getBankLogoUrls, type Bank } from '../services/bankLogoService';

// A bank's logo, trying each source until one loads; `fallback` shows when there's no bank or
// every source fails.
export default function BankLogo({ bank, fallback, className = 'h-8 w-8' }: { bank?: Bank; fallback: React.ReactNode; className?: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const source = bank ? getBankLogoUrls(bank).find(url => !failed.includes(url)) : undefined;
  if (!bank || !source) return <>{fallback}</>;
  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1`}>
      <img
        src={source}
        alt={`${bank.name} logo`}
        title={bank.name}
        className="h-full w-full object-contain"
        loading="lazy"
        onError={() => setFailed(previous => [...previous, source])}
      />
    </span>
  );
}
