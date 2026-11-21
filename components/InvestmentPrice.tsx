import React, { useEffect, useRef, useState } from 'react';

const InvestmentPrice: React.FC<{ price: number; currency: string }> = ({ price, currency }) => {
  const previous = useRef({ price, currency });
  const [flash, setFlash] = useState<{ direction: 'up' | 'down'; sequence: number } | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const last = previous.current;
    previous.current = { price, currency };
    if (currency !== last.currency || !Number.isFinite(price) || !Number.isFinite(last.price)) {
      setFlash(null);
      return;
    }
    if (price === last.price) return;

    setFlash({ direction: price > last.price ? 'up' : 'down', sequence: ++sequence.current });
  }, [price, currency]);

  return (
    <span
      key={flash?.sequence ?? 'neutral'}
      className={`inline-block rounded px-1 -mx-1 ${flash ? `investment-price-flash ${flash.direction === 'up' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'}` : 'text-textMain'}`}
      title={flash ? `Price ${flash.direction === 'up' ? 'increased' : 'decreased'} on the last price movement` : undefined}
    >
      {price.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
    </span>
  );
};

export default InvestmentPrice;
