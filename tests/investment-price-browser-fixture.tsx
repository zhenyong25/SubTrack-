import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import InvestmentPrice from '../components/InvestmentPrice';

function Fixture() {
  const [quote, setQuote] = useState({ price: 100, currency: 'USD' });
  (window as any).setQuote = (price: number, currency = 'USD') => setQuote({ price, currency });
  return <InvestmentPrice {...quote} />;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
