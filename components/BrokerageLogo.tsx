import React, { useState } from 'react';
import { Landmark } from 'lucide-react';
import type { InvestmentAccount } from '../types';

export default function BrokerageLogo({ account, className = 'h-9 w-9' }: { account?: InvestmentAccount; className?: string }) {
  const name = `${account?.broker || ''} ${account?.name || ''}`.toLowerCase();
  const ticker = /moomoo|futu/.test(name) ? 'FUTU' : /ibkr|interactive brokers/.test(name) ? 'IBKR' : /tiger/.test(name) ? 'TIGR' : /schwab/.test(name) ? 'SCHW' : /robinhood/.test(name) ? 'HOOD' : /webull/.test(name) ? 'BULL' : undefined;
  const source = ticker ? `https://financialmodelingprep.com/image-stock/${ticker}.png` : undefined;
  const [failed, setFailed] = useState<string[]>([]);
  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1 text-slate-500`}>
      {source && !failed.includes(source)
        ? <img src={source} alt={`${account?.broker || account?.name} logo`} className="h-full w-full object-contain" loading="lazy" onError={() => setFailed(previous => [...previous, source])} />
        : account ? <span className="text-[10px] font-black" style={{ color: account.color }}>{account.name.slice(0, 2).toUpperCase()}</span> : <Landmark size={18} />}
    </span>
  );
}
