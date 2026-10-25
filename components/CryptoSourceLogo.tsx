import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import type { CryptoChain, CryptoExchange } from '../types';
import { CHAINS } from '../services/cryptoChains';
import { EXCHANGES, exchangeLogo } from '../services/cryptoExchangeService';

const folders: Record<CryptoChain, string> = {
  bitcoin: 'bitcoin', ethereum: 'ethereum', base: 'base', arbitrum: 'arbitrum',
  optimism: 'optimism', polygon: 'polygon', bsc: 'smartchain', solana: 'solana', tron: 'tron',
};

// Network identity is independent of its gas token (Base and Arbitrum aren't Ethereum logos).
export default function CryptoSourceLogo({ chain, exchange, size = 16 }: { chain?: CryptoChain; exchange?: CryptoExchange; size?: number }) {
  const [failed, setFailed] = useState<string[]>([]);
  const urls = exchange
    ? [exchangeLogo(exchange), `https://icons.duckduckgo.com/ip3/${EXCHANGES[exchange].domain}.ico`]
    : chain ? [`https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${folders[chain]}/info/logo.png`] : [];
  const src = urls.find(url => !failed.includes(url));
  const name = exchange ? EXCHANGES[exchange].name : chain ? CHAINS[chain].name : 'Wallet';
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-slate-500" style={{ width: size, height: size }}>
    {src ? <img src={src} alt="" title={name} width={size} height={size} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" onError={() => setFailed(current => [...current, src])} />
      : chain || exchange ? <span className="font-bold" style={{ fontSize: Math.max(8, size * 0.55) }}>{name.slice(0, 1)}</span> : <Wallet size={Math.max(10, size - 3)} />}
  </span>;
}
