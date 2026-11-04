import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TickerDetail from '../components/TickerDetail';
import { CANDLESTICK_PATTERNS, exampleWithContext } from '../services/candlestickPatterns';
import { getPositionMetrics } from '../services/investmentService';
import type { InvestmentHolding } from '../types';

const controls = { failWarmup: false, empty: false, setSymbol: (_: string) => {} };
(window as any).tickerTest = controls;
const hammer = exampleWithContext(CANDLESTICK_PATTERNS.find(p => p.id === 'hammer')!);
window.fetch = async (input, init) => {
  const url = new URL(String(input), window.location.href);
  if (!url.pathname.endsWith('/stock-history')) return new Response(JSON.stringify({ error: { message: 'Company data is not part of this chart fixture.' } }), { status: 503 });
  const symbol = url.searchParams.get('symbol')!, interval = url.searchParams.get('interval'), range = url.searchParams.get('range');
  if (controls.failWarmup && range === '5d' && interval === '1m') return new Response('{}', { status: 503 });
  await new Promise(resolve => setTimeout(resolve, symbol === 'SLOW' ? 800 : 20));
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const step = interval === '1d' ? 86400000 : interval === '1m' ? 60000 : interval === '15m' ? 900000 : interval === '60m' ? 3600000 : 300000;
  const factor = symbol === 'SECOND' ? 3 : 1, count = interval === '1d' ? 1000 : 320;
  const full = Array.from({ length: count }, (_, i) => {
    const close = 80 + i * 0.03 + Math.sin(i / 8) * 2;
    const bar = i >= count - hammer.length ? hammer[i - (count - hammer.length)] : { open: close - 0.2, high: close + 0.7, low: close - 0.8, close };
    return { timestamp: Date.UTC(2026, 10, 4, 20) - (count - 1 - i) * step, open: bar.open * factor, high: bar.high * factor, low: bar.low * factor, close: bar.close * factor, volume: 10000 + i * 4 };
  });
  const candles = controls.empty ? [] : range === '1d' ? full.slice(-60) : range === '1y' ? full.slice(-250) : full;
  return new Response(JSON.stringify({ symbol, currency: 'USD', currentPrice: 99 * factor, previousClose: 100 * factor, marketState: 'CLOSED', candles }));
};
function Fixture() {
  const [symbol, setSymbol] = useState('DEMO'); controls.setSymbol = setSymbol;
  const investment: InvestmentHolding = { id: symbol, symbol, name: `${symbol} test stock`, kind: 'Stocks', units: 10, averageCost: symbol === 'SECOND' ? 280 : 90, currentPrice: symbol === 'SECOND' ? 297 : 99, currency: 'USD', color: '#3b82f6', isActive: true };
  return <TickerDetail key={symbol} investment={investment} metrics={getPositionMetrics(investment)} baseCurrency="USD" priceRefreshedAt={null} isRefreshing={false} onClose={() => {}} onRefresh={() => {}} />;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
