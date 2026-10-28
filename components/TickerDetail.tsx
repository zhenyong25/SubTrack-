import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Scale,
  Clock3,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  WalletCards,
} from 'lucide-react';
import type { InvestmentHolding } from '../types';
import {
  fetchStockIntradayHistory,
  type StockCandle,
  type StockHistoryInterval,
  type StockHistoryRange,
  type StockIntradayHistory,
} from '../services/stockQuoteService';
import type { PositionMetrics } from '../services/investmentService';
import { breakEven, tickerStats } from '../services/tickerStatsService';
import { buildInsights, fetchStockInsights, type StockInsights } from '../services/stockInsightsService';
import { AnalystCard, EarningsCard, FinancialsCard, GrowthCard, InsightsCard, KeyStatsCard, NewsCard, ProfileCard } from './TickerFundamentals';
import InvestmentLogo from './InvestmentLogo';
import PriceAlertControls from './PriceAlertControls';

type TickerRange = '1D' | '5D' | '1M' | '3M' | '1Y' | 'MAX';
type TickerInterval = '20s' | StockHistoryInterval;

interface TickerDetailProps {
  investment: InvestmentHolding;
  metrics: PositionMetrics;
  baseCurrency: string;
  priceRefreshedAt: number | null;
  isRefreshing: boolean;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
}

const RANGE_OPTIONS: TickerRange[] = ['1D', '5D', '1M', '3M', '1Y', 'MAX'];
const RANGE_TO_API: Record<TickerRange, StockHistoryRange> = {
  '1D': '1d',
  '5D': '5d',
  '1M': '1mo',
  '3M': '3mo',
  '1Y': '1y',
  MAX: 'max',
};
const INTERVALS_BY_RANGE: Record<TickerRange, TickerInterval[]> = {
  '1D': ['20s', '1m', '5m', '60m'],
  '5D': ['5m', '15m', '60m'],
  '1M': ['15m', '60m', '1d'],
  '3M': ['60m', '1d'],
  '1Y': ['1d'],
  MAX: ['1d'],
};
const DEFAULT_INTERVAL: Record<TickerRange, TickerInterval> = {
  '1D': '5m',
  '5D': '15m',
  '1M': '60m',
  '3M': '1d',
  '1Y': '1d',
  MAX: '1d',
};
const INTERVAL_LABELS: Record<TickerInterval, string> = {
  '20s': '20 sec',
  '1m': '1 min',
  '5m': '5 min',
  '15m': '15 min',
  '60m': '1 hour',
  '1d': '1 day',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatPrice = (value: number, currency: string) => {
  const maximumFractionDigits = Math.abs(value) < 1 ? 4 : 2;
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits })} ${currency}`;
};

const formatCompact = (value: number) => new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value);

const formatMarketState = (state?: string | null) => {
  switch (state?.toUpperCase()) {
    case 'REGULAR': return 'Market open';
    case 'PRE': return 'Pre-market';
    case 'POST': return 'After hours';
    case 'CLOSED': return 'Market closed';
    default: return 'Price tracking';
  }
};

const compressCandles = (candles: StockCandle[], maximum = 700): StockCandle[] => {
  if (candles.length <= maximum) return candles;
  const groupSize = Math.ceil(candles.length / maximum);
  const compressed: StockCandle[] = [];

  for (let index = 0; index < candles.length; index += groupSize) {
    const group = candles.slice(index, index + groupSize);
    compressed.push({
      timestamp: group[group.length - 1].timestamp,
      open: group[0].open,
      high: Math.max(...group.map(candle => candle.high)),
      low: Math.min(...group.map(candle => candle.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, candle) => sum + (candle.volume || 0), 0),
    });
  }

  return compressed;
};

const TickerDetail: React.FC<TickerDetailProps> = ({
  investment,
  metrics,
  baseCurrency,
  priceRefreshedAt,
  isRefreshing,
  onClose,
  onRefresh,
}) => {
  const [range, setRange] = useState<TickerRange>('1D');
  const [interval, setIntervalMode] = useState<TickerInterval>('5m');
  const [history, setHistory] = useState<StockIntradayHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [selectedCandleIndex, setSelectedCandleIndex] = useState<number | null>(null);
  const [liveTicks, setLiveTicks] = useState<Array<{ timestamp: number; price: number }>>([]);
  const [daily, setDaily] = useState<StockIntradayHistory | null>(null);
  const [insights, setInsights] = useState<StockInsights | null>(null);
  const [insightsError, setInsightsError] = useState('');
  const chartViewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  // Where to put the scroll after a zoom renders, so the point being zoomed on stays put.
  const zoomAnchorRef = useRef<{ contentX: number; viewX: number; ratio: number } | null>(null);
  const dragRef = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hasMouse = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches, []);

  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const viewport = chartViewportRef.current;
    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (viewport && anchor) viewport.scrollLeft = anchor.contentX * anchor.ratio - anchor.viewX;
  }, [zoom]);

  // Zooms around a point of the viewport (its middle by default) rather than its left edge.
  const zoomTo = useCallback((nextZoom: number, clientX?: number) => {
    const viewport = chartViewportRef.current;
    const next = clamp(nextZoom, 1, 6);
    if (!viewport || next === zoomRef.current) return;
    const rect = viewport.getBoundingClientRect();
    const viewX = clientX === undefined ? viewport.clientWidth / 2 : clamp(clientX - rect.left, 0, viewport.clientWidth);
    zoomAnchorRef.current = { contentX: viewport.scrollLeft + viewX, viewX, ratio: next / zoomRef.current };
    zoomRef.current = next;
    setZoom(next);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    setLiveTicks(previous => {
      const timestamp = priceRefreshedAt || Date.now();
      const last = previous.at(-1);
      if (last?.timestamp === timestamp || (last?.price === investment.currentPrice && priceRefreshedAt === null)) return previous;
      return [...previous, { timestamp, price: investment.currentPrice }].slice(-180);
    });
  }, [investment.currentPrice, priceRefreshedAt]);

  useEffect(() => {
    if (interval === '20s') {
      setHistory(null);
      setIsLoading(false);
      setError('');
      return;
    }

    if (!investment.symbol) {
      setHistory(null);
      setIsLoading(false);
      setError('This holding does not have a market symbol.');
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError('');
    fetchStockIntradayHistory(investment.symbol, interval, controller.signal, RANGE_TO_API[range])
      .then(result => {
        if (!controller.signal.aborted) setHistory(result);
      })
      .catch(fetchError => {
        if (controller.signal.aborted) return;
        setHistory(null);
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load this ticker history.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [investment.symbol, interval, range]);

  // A year of daily bars for the statistics, separate from whatever range the chart shows.
  useEffect(() => {
    if (!investment.symbol) return;
    const controller = new AbortController();
    fetchStockIntradayHistory(investment.symbol, '1d', controller.signal, '1y')
      .then(result => { if (!controller.signal.aborted) setDaily(result); })
      .catch(() => { /* statistics are optional - the chart and position still show */ });
    return () => controller.abort();
  }, [investment.symbol]);

  // Fundamentals, analysts, earnings, statements and news - Stocks only (crypto has none).
  useEffect(() => {
    setInsights(null);
    setInsightsError('');
    if (!investment.symbol || investment.kind !== 'Stocks') return;
    const controller = new AbortController();
    fetchStockInsights(investment.symbol, controller.signal)
      .then(result => { if (!controller.signal.aborted) setInsights(result); })
      .catch(reason => { if (!controller.signal.aborted) setInsightsError(reason instanceof Error ? reason.message : 'Could not load company data.'); });
    return () => controller.abort();
  }, [investment.symbol, investment.kind]);

  useEffect(() => {
    setSelectedCandleIndex(null);
    setZoom(1);
    if (chartViewportRef.current) chartViewportRef.current.scrollLeft = 0;
  }, [range, interval]);

  useEffect(() => {
    const viewport = chartViewportRef.current;
    if (!viewport) return;
    let startingDistance = 0;
    let startingZoom = 1;

    const touchDistance = (touches: TouchList) => Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      startingDistance = touchDistance(event.touches);
      startingZoom = zoomRef.current;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || startingDistance === 0) return;
      event.preventDefault();
      zoomTo(startingZoom * (touchDistance(event.touches) / startingDistance), (event.touches[0].clientX + event.touches[1].clientX) / 2);
    };
    // Ctrl/Cmd + scroll zooms around the cursor; a trackpad pinch arrives as the same thing.
    // A plain scroll is left alone so the page still scrolls past the chart.
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      // ~1.3× per mouse-wheel notch (deltaY ≈ 100); a pinch sends many small deltas.
      zoomTo(zoomRef.current * Math.exp(-event.deltaY * 0.0025), event.clientX);
    };

    viewport.addEventListener('touchstart', handleTouchStart, { passive: true });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('wheel', handleWheel);
    };
  }, [zoomTo]);

  const rawCandles = useMemo<StockCandle[]>(() => {
    if (interval === '20s') {
      return liveTicks.map((tick, index) => {
        const open = liveTicks[index - 1]?.price ?? tick.price;
        return {
          timestamp: tick.timestamp,
          open,
          high: Math.max(open, tick.price),
          low: Math.min(open, tick.price),
          close: tick.price,
        };
      });
    }
    return history?.candles || [];
  }, [history, interval, liveTicks]);

  const candles = useMemo(() => {
    const available = compressCandles(rawCandles);
    if (available.length > 0) return available;
    return [{
      timestamp: Date.now(),
      open: investment.currentPrice,
      high: investment.currentPrice,
      low: investment.currentPrice,
      close: investment.currentPrice,
      volume: 0,
    }];
  }, [rawCandles, investment.currentPrice]);

  const chart = useMemo(() => {
    const width = 920;
    const height = 430;
    const padding = { top: 22, right: 20, bottom: 34, left: 68 };
    const priceBottom = 302;
    const volumeTop = 332;
    const volumeBottom = height - padding.bottom;
    const plotWidth = width - padding.left - padding.right;
    const priceHeight = priceBottom - padding.top;
    const candleMin = Math.min(...candles.map(candle => candle.low));
    const candleMax = Math.max(...candles.map(candle => candle.high));
    // Stretch the scale to show the average-cost line when it's reasonably close; when it's far
    // away it gets a marker pinned to the edge instead, so the candles don't flatten into a line.
    const average = investment.averageCost > 0 ? investment.averageCost : null;
    const span = Math.max(candleMax - candleMin, Math.abs(candleMax) * 0.01);
    const averageInView = average !== null && average >= candleMin - span * 1.5 && average <= candleMax + span * 1.5;
    const rawMin = averageInView ? Math.min(candleMin, average) : candleMin;
    const rawMax = averageInView ? Math.max(candleMax, average) : candleMax;
    const pricePadding = Math.max((rawMax - rawMin) * 0.08, Math.abs(rawMax) * 0.002, 0.0001);
    const minPrice = rawMin - pricePadding;
    const maxPrice = rawMax + pricePadding;
    const priceRange = Math.max(maxPrice - minPrice, 0.0001);
    const maximumVolume = Math.max(...candles.map(candle => candle.volume || 0), 1);
    const slotWidth = plotWidth / Math.max(candles.length, 1);
    const bodyWidth = Math.max(0.8, Math.min(14, slotWidth * 0.68));
    const yForPrice = (price: number) => padding.top + (1 - ((price - minPrice) / priceRange)) * priceHeight;

    return {
      width,
      height,
      padding,
      priceBottom,
      volumeTop,
      volumeBottom,
      minPrice,
      maxPrice,
      slotWidth,
      yForPrice: (price: number) => clamp(yForPrice(price), padding.top, priceBottom),
      average: average === null ? null : averageInView ? { y: yForPrice(average), edge: null } : { y: average > candleMax ? padding.top : priceBottom, edge: average > candleMax ? 'above' as const : 'below' as const },
      candles: candles.map((candle, index) => ({
        ...candle,
        x: padding.left + ((index + 0.5) * slotWidth),
        openY: yForPrice(candle.open),
        highY: yForPrice(candle.high),
        lowY: yForPrice(candle.low),
        closeY: yForPrice(candle.close),
        bodyWidth,
        volumeY: volumeBottom - (((candle.volume || 0) / maximumVolume) * (volumeBottom - volumeTop)),
      })),
    };
  }, [candles, investment.averageCost]);

  const activeIndex = clamp(selectedCandleIndex ?? (candles.length - 1), 0, candles.length - 1);
  const activeCandle = candles[activeIndex];
  const marketPrice = interval === '20s'
    ? investment.currentPrice
    : history?.currentPrice ?? candles.at(-1)?.close ?? investment.currentPrice;
  const referencePrice = range === '1D' && history?.previousClose
    ? history.previousClose
    : candles[0]?.open ?? marketPrice;
  const priceChange = marketPrice - referencePrice;
  const priceChangePct = referencePrice !== 0 ? (priceChange / referencePrice) * 100 : 0;
  const isUp = priceChange >= 0;
  const currency = history?.currency || investment.currency;
  const side = investment.positionSide === 'Short' ? 'Short' : 'Long';
  const nativeUnrealized = side === 'Short'
    ? (investment.averageCost - marketPrice) * investment.units
    : (marketPrice - investment.averageCost) * investment.units;
  const even = breakEven(side, marketPrice, investment.averageCost);
  const stats = useMemo(
    () => (daily?.candles.length ? tickerStats(daily.candles, marketPrice, daily) : null),
    [daily, marketPrice],
  );
  const dayPnl = stats?.previousClose !== undefined ? (marketPrice - stats.previousClose) * investment.units * (side === 'Short' ? -1 : 1) : undefined;
  const heldDays = investment.acquiredDate ? Math.floor((Date.now() - new Date(investment.acquiredDate).getTime()) / 86400000) : undefined;
  const pct = (value: number, digits = 1) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
  const tone = (value: number | undefined) => (value === undefined || Math.abs(value) < 1e-9 ? 'text-textMain' : value > 0 ? 'text-emerald-500' : 'text-rose-500');
  const averageY = chart.average?.y;
  const priceY = chart.yForPrice(marketPrice);
  const inProfit = even?.status === 'profit';
  const insightList = useMemo(
    () => (insights ? buildInsights(insights, { price: marketPrice, averageCost: investment.averageCost, side, today: new Date().toISOString().slice(0, 10) }) : []),
    [insights, marketPrice, investment.averageCost, side],
  );

  const handleRangeChange = (nextRange: TickerRange) => {
    setRange(nextRange);
    if (!INTERVALS_BY_RANGE[nextRange].includes(interval)) setIntervalMode(DEFAULT_INTERVAL[nextRange]);
  };

  const handleChartPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * chart.width;
    const rawIndex = Math.floor((viewX - chart.padding.left) / chart.slotWidth);
    if (rawIndex >= 0 && rawIndex < candles.length) setSelectedCandleIndex(rawIndex);
  };

  // Touch: dragging inspects candles (swiping pans natively). Mouse: hovering inspects and
  // click-dragging pans the zoomed chart, since a mouse has no swipe.
  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button === 0 && chartViewportRef.current) {
      dragRef.current = { startX: event.clientX, startScroll: chartViewportRef.current.scrollLeft, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    handleChartPointer(event);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (event.pointerType === 'mouse' && drag && chartViewportRef.current) {
      const dx = event.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) > 4) {
        drag.moved = true;
        setIsDragging(true);
      }
      if (drag.moved) {
        chartViewportRef.current.scrollLeft = drag.startScroll - dx;
        return;
      }
    }
    if (event.pointerType === 'mouse' || event.buttons === 1) handleChartPointer(event);
  };

  const endDrag = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const timeLabel = (timestamp: number) => new Date(timestamp).toLocaleString(undefined, range === '1D'
    ? { hour: '2-digit', minute: '2-digit', second: interval === '20s' ? '2-digit' : undefined }
    : range === '5D'
      ? { weekday: 'short', hour: '2-digit', minute: '2-digit' }
      : { month: 'short', day: 'numeric', year: range === '1Y' || range === 'MAX' ? 'numeric' : undefined });

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-background text-textMain animate-fade-in">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to investments"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-textMain hover:text-primary"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-black">{investment.symbol || investment.name}</p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-secondary">Ticker detail</p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh ticker price"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-textMain hover:text-primary disabled:opacity-50"
          >
            {isRefreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6">
        {/* Two columns on desktop. On a phone the columns dissolve ("contents") so every card
            becomes one list, reordered so your position comes right after the chart. */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
            <div className="order-1 min-w-0 lg:order-none">
            <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <InvestmentLogo investment={investment} className="h-12 w-12 shrink-0 rounded-2xl sm:h-14 sm:w-14" />
                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-black sm:text-xl">{history?.name || investment.name}</h1>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-secondary">
                      <span>{investment.symbol}</span>
                      {history?.exchange && <><span>·</span><span>{history.exchange}</span></>}
                      {investment.positionSide === 'Short' && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-500">Short</span>}
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${history?.marketState === 'REGULAR' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-secondary'}`}>
                  {formatMarketState(history?.marketState)}
                </span>
              </div>
    
              <div className="mt-6">
                <p className="text-3xl font-black tracking-tight sm:text-4xl">{formatPrice(marketPrice, currency)}</p>
                <p className={`mt-2 text-sm font-black ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {isUp ? '+' : ''}{priceChange.toLocaleString(undefined, { maximumFractionDigits: 4 })} ({isUp ? '+' : ''}{priceChangePct.toFixed(2)}%)
                  <span className="ml-2 font-semibold text-secondary">{range}</span>
                </p>
              </div>
            </section>
            </div>
            <div className="order-3 min-w-0 lg:order-none">
            <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
              <div className="border-b border-border px-4 pb-3 pt-4 sm:px-5">
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {RANGE_OPTIONS.map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleRangeChange(option)}
                      className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${range === option ? 'bg-primary text-white shadow-sm' : 'border border-border bg-background text-secondary hover:text-textMain'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {INTERVALS_BY_RANGE[range].map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setIntervalMode(option)}
                      className={`shrink-0 rounded-xl px-3 py-2 text-[11px] font-bold transition ${interval === option ? 'bg-cyan-500/15 text-cyan-600 ring-1 ring-cyan-500/30 dark:text-cyan-300' : 'bg-background text-secondary'}`}
                    >
                      {INTERVAL_LABELS[option]}
                    </button>
                  ))}
                </div>
              </div>
    
              <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
                {[
                  ['O', activeCandle.open],
                  ['H', activeCandle.high],
                  ['L', activeCandle.low],
                  ['C', activeCandle.close],
                ].map(([label, value]) => (
                  <div key={label as string} className="bg-surface px-2 py-3 text-center">
                    <p className="text-[9px] font-black uppercase text-secondary">{label}</p>
                    <p className="mt-1 truncate text-[11px] font-black sm:text-sm">{Number(value).toLocaleString(undefined, { maximumFractionDigits: Number(value) < 1 ? 4 : 2 })}</p>
                  </div>
                ))}
              </div>
    
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-xs font-black">{timeLabel(activeCandle.timestamp)}</p>
                  <p className="mt-0.5 text-[10px] text-secondary">
                    Volume {activeCandle.volume ? formatCompact(activeCandle.volume) : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
                  <button
                    type="button"
                    onClick={() => zoomTo(zoom - 0.5)}
                    disabled={zoom <= 1}
                    aria-label="Zoom out chart"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:text-textMain disabled:opacity-30"
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomTo(1)}
                    aria-label="Reset chart zoom"
                    className="flex h-8 min-w-12 items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-black text-textMain"
                  >
                    {zoom === 1 ? <RotateCcw size={12} /> : null}{zoom.toFixed(zoom % 1 === 0 ? 0 : 1)}×
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomTo(zoom + 0.5)}
                    disabled={zoom >= 6}
                    aria-label="Zoom in chart"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:text-textMain disabled:opacity-30"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
    
              <div ref={chartViewportRef} className="relative overflow-x-auto overscroll-x-contain border-y border-border bg-background/40">
                {isLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-sm font-bold text-secondary"><Loader2 size={18} className="animate-spin" />Loading price movement…</div>
                  </div>
                )}
                <svg
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  className="block h-[340px] select-none sm:h-[430px]"
                  style={{ width: `${zoom * 100}%`, minWidth: '100%', cursor: isDragging ? 'grabbing' : hasMouse && zoom > 1 ? 'grab' : 'crosshair' }}
                  role="img"
                  aria-label={`${investment.symbol} candlestick price chart`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onPointerLeave={event => {
                    // Back to the latest candle once the mouse leaves, like most chart tools.
                    if (event.pointerType === 'mouse' && !dragRef.current) setSelectedCandleIndex(null);
                  }}
                >
                  {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
                    const y = chart.padding.top + (fraction * (chart.priceBottom - chart.padding.top));
                    const price = chart.maxPrice - (fraction * (chart.maxPrice - chart.minPrice));
                    return (
                      <g key={fraction}>
                        <line x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={y} y2={y} stroke="currentColor" className="text-slate-300/50 dark:text-white/10" strokeDasharray="3 6" />
                        <text x={chart.padding.left - 7} y={y + 3} textAnchor="end" className="fill-slate-400 dark:fill-white/40" fontSize="10">
                          {price.toLocaleString(undefined, { maximumFractionDigits: price < 1 ? 4 : 2 })}
                        </text>
                      </g>
                    );
                  })}
    
                  <text x={chart.padding.left} y={chart.volumeTop - 9} className="fill-slate-400 dark:fill-white/40" fontSize="9" fontWeight="700">VOLUME</text>
    
                  {/* The gap between your average cost and the price: what you're up (green) or down (red). */}
                  {averageY !== undefined && even && even.status !== 'even' && (
                    <rect
                      x={chart.padding.left}
                      y={Math.min(averageY, priceY)}
                      width={chart.width - chart.padding.left - chart.padding.right}
                      height={Math.abs(averageY - priceY)}
                      fill={inProfit ? '#10b981' : '#f43f5e'}
                      opacity="0.08"
                      pointerEvents="none"
                    />
                  )}
    
                  {chart.candles.map((candle, index) => {
                    const falling = candle.close < candle.open;
                    const color = falling ? '#f43f5e' : '#10b981';
                    const bodyTop = Math.min(candle.openY, candle.closeY);
                    const bodyHeight = Math.max(1.5, Math.abs(candle.openY - candle.closeY));
                    return (
                      <g key={`${candle.timestamp}-${index}`}>
                        <line x1={candle.x} x2={candle.x} y1={candle.highY} y2={candle.lowY} stroke={color} strokeWidth="1.2" />
                        <rect x={candle.x - (candle.bodyWidth / 2)} y={bodyTop} width={candle.bodyWidth} height={bodyHeight} rx="0.8" fill={color} />
                        <rect
                          x={candle.x - (Math.max(1, candle.bodyWidth * 0.82) / 2)}
                          y={candle.volumeY}
                          width={Math.max(1, candle.bodyWidth * 0.82)}
                          height={Math.max(1, chart.volumeBottom - candle.volumeY)}
                          fill={color}
                          opacity="0.34"
                        />
                      </g>
                    );
                  })}
    
                  <g pointerEvents="none">
                    <line x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={priceY} y2={priceY} stroke="#06b6d4" strokeWidth="1" opacity="0.8" />
                    <rect x={chart.width - chart.padding.right - 74} y={priceY - 9} width="74" height="18" rx="4" fill="#06b6d4" />
                    <text x={chart.width - chart.padding.right - 37} y={priceY + 3.5} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800">
                      {marketPrice.toLocaleString(undefined, { maximumFractionDigits: marketPrice < 1 ? 4 : 2 })}
                    </text>
                    {chart.average && even && (
                      <>
                        {!chart.average.edge && <line x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={chart.average.y} y2={chart.average.y} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="7 5" />}
                        <rect x={chart.padding.left + 4} y={chart.average.y - (chart.average.edge === 'below' ? 18 : chart.average.edge === 'above' ? 0 : 9)} width="190" height="18" rx="4" fill="#f59e0b" />
                        <text x={chart.padding.left + 10} y={chart.average.y + (chart.average.edge === 'below' ? -5.5 : chart.average.edge === 'above' ? 12.5 : 3.5)} fill="#fff" fontSize="10" fontWeight="800">
                          {chart.average.edge === 'above' ? '▲ ' : chart.average.edge === 'below' ? '▼ ' : ''}Avg {investment.averageCost.toLocaleString(undefined, { maximumFractionDigits: investment.averageCost < 1 ? 4 : 2 })} · {even.status === 'even' ? 'break-even' : `${pct(even.movePct)} away`}
                        </text>
                      </>
                    )}
                  </g>
    
                  {chart.candles[activeIndex] && (
                    <line
                      x1={chart.candles[activeIndex].x}
                      x2={chart.candles[activeIndex].x}
                      y1={chart.padding.top}
                      y2={chart.volumeBottom}
                      stroke="#06b6d4"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                      pointerEvents="none"
                    />
                  )}
    
                  {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
                    const index = Math.min(candles.length - 1, Math.round((candles.length - 1) * fraction));
                    const candle = chart.candles[index];
                    return candle ? (
                      <text key={fraction} x={candle.x} y={chart.height - 10} textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'} className="fill-slate-400 dark:fill-white/40" fontSize="9">
                        {timeLabel(candle.timestamp)}
                      </text>
                    ) : null;
                  })}
                </svg>
              </div>
    
              <div className="px-4 py-3 text-[10px] leading-relaxed text-secondary">
                {error ? <p className="font-semibold text-rose-500">{error}</p> : interval === '20s'
                  ? <p><strong className="text-textMain">Live session:</strong> a new candle is collected every 20 seconds while this investment screen is open.</p>
                  : hasMouse
                    ? <p>Hover to inspect candles. Zoom with +/− or Ctrl + scroll (pinch on a trackpad), then drag to pan.</p>
                    : <p>Drag across the chart to inspect candles. Pinch or use +/− to zoom, then swipe sideways.</p>}
              </div>
            </section>
            </div>
            <div className="order-7 min-w-0 lg:order-none">
            {stats && (
              <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-2 text-secondary"><Activity size={15} /><p className="text-[10px] font-black uppercase tracking-wide">Price & trading</p></div>
    
                {stats.high52 !== undefined && stats.low52 !== undefined && stats.high52 > stats.low52 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] font-bold text-secondary"><span>52-week low</span><span>52-week high</span></div>
                    <div className="relative mt-2 h-2 rounded-full bg-gradient-to-r from-rose-500/40 via-slate-400/30 to-emerald-500/40">
                      {investment.averageCost >= stats.low52 && investment.averageCost <= stats.high52 && (
                        <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500" style={{ left: `${((investment.averageCost - stats.low52) / (stats.high52 - stats.low52)) * 100}%` }} title="Your average cost" />
                      )}
                      <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-cyan-500" style={{ left: `${(stats.rangePosition ?? 0) * 100}%` }} title="Current price" />
                    </div>
                    <div className="mt-2 flex justify-between text-xs font-black tabular-nums"><span>{formatPrice(stats.low52, currency)}</span><span>{formatPrice(stats.high52, currency)}</span></div>
                    <p className="mt-1 text-[10px] text-secondary">
                      {pct(marketPrice / stats.high52 - 1)} from the high, {pct(marketPrice / stats.low52 - 1)} from the low. <span className="text-cyan-500">●</span> price <span className="text-amber-500">▮</span> your average
                    </p>
                  </div>
                )}
    
                {stats.returns.length > 0 && (
                  <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {stats.returns.map(item => (
                      <div key={item.label} className="rounded-xl border border-border bg-background px-2 py-2 text-center">
                        <p className="text-[9px] font-black uppercase text-secondary">{item.label}</p>
                        <p className={`mt-0.5 text-xs font-black tabular-nums ${tone(item.pct)}`}>{pct(item.pct)}</p>
                      </div>
                    ))}
                  </div>
                )}
    
                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  {[
                    { label: 'Previous close', value: stats.previousClose !== undefined ? formatPrice(stats.previousClose, currency) : '—' },
                    { label: 'Day range', value: daily?.dayLow && daily?.dayHigh ? `${daily.dayLow.toLocaleString(undefined, { maximumFractionDigits: 2 })} – ${daily.dayHigh.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—' },
                    { label: 'Volume', value: daily?.dayVolume ? formatCompact(daily.dayVolume) : '—', note: daily?.dayVolume && stats.avgVolume30 ? `${(daily.dayVolume / stats.avgVolume30).toFixed(1)}× the 30-day average` : undefined },
                    { label: 'Avg. volume (30d)', value: stats.avgVolume30 ? formatCompact(stats.avgVolume30) : '—' },
                    { label: '50-day average', value: stats.ma50 ? formatPrice(stats.ma50, currency) : '—', note: stats.ma50 ? `Price ${pct(marketPrice / stats.ma50 - 1)}` : undefined },
                    { label: '200-day average', value: stats.ma200 ? formatPrice(stats.ma200, currency) : '—', note: stats.ma200 ? `Price ${pct(marketPrice / stats.ma200 - 1)}` : 'Needs 200 sessions' },
                    { label: 'RSI (14)', value: stats.rsi14 !== undefined ? stats.rsi14.toFixed(0) : '—', note: stats.rsi14 === undefined ? undefined : stats.rsi14 >= 70 ? 'Overbought zone' : stats.rsi14 <= 30 ? 'Oversold zone' : 'Neutral' },
                    { label: 'Volatility (30d)', value: stats.volatility30 !== undefined ? `${(stats.volatility30 * 100).toFixed(0)}%` : '—', note: stats.typicalDayMove !== undefined ? `Typical day ±${(stats.typicalDayMove * 100).toFixed(1)}%` : 'Annualized' },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">{item.label}</p>
                      <p className="mt-0.5 text-sm font-black tabular-nums">{item.value}</p>
                      {item.note && <p className="text-[10px] text-secondary">{item.note}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}
            </div>
            {insights && <div className="order-8 min-w-0 lg:order-none"><EarningsCard data={insights} /></div>}
            {insights && <div className="order-9 min-w-0 empty:hidden lg:order-none"><GrowthCard data={insights} /></div>}
            {insights && <div className="order-11 min-w-0 empty:hidden lg:order-none"><FinancialsCard data={insights} /></div>}
            {insights && insights.news.length > 0 && <div className="order-12 min-w-0 lg:order-none"><NewsCard news={insights.news} /></div>}
          </div>
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
            <div className="order-2 min-w-0 lg:order-none">
            {even && investment.units > 0 && (
              <section className={`rounded-3xl border p-5 shadow-sm sm:p-6 ${even.status === 'loss' ? 'border-rose-500/30 bg-rose-500/5' : even.status === 'profit' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-surface'}`}>
                <div className="flex items-center gap-2 text-secondary"><Scale size={15} /><p className="text-[10px] font-black uppercase tracking-wide">Break-even · {side} at {formatPrice(investment.averageCost, investment.currency)}</p></div>
                {even.status === 'even' ? (
                  <p className="mt-3 text-xl font-black">Right at your average cost</p>
                ) : side === 'Long' ? (
                  even.status === 'loss' ? (
                    <>
                      <p className="mt-3 text-2xl font-black text-rose-500">Needs {pct(even.movePct)} to break even</p>
                      <p className="mt-1 text-sm text-secondary">The price has to rise {formatPrice(even.movePerUnit, investment.currency)} per share, from {formatPrice(marketPrice, currency)} back to your average.</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-2xl font-black text-emerald-500">{pct(even.pnlPct)} above your average</p>
                      <p className="mt-1 text-sm text-secondary">It can fall {pct(even.movePct).replace('-', '')} ({formatPrice(-even.movePerUnit, investment.currency)} per share) before this position turns into a loss.</p>
                    </>
                  )
                ) : even.status === 'profit' ? (
                  <>
                    <p className="mt-3 text-2xl font-black text-emerald-500">Can rise {pct(even.movePct)} before you lose money</p>
                    <p className="mt-1 text-sm text-secondary">You shorted at {formatPrice(investment.averageCost, investment.currency)}. If you don't buy back, every share costs you once the price goes above that - {formatPrice(even.movePerUnit, investment.currency)} away.</p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-2xl font-black text-rose-500">Needs to fall {pct(even.movePct).replace('-', '')} to break even</p>
                    <p className="mt-1 text-sm text-secondary">The price is {formatPrice(-even.movePerUnit, investment.currency)} per share above where you shorted. Buying back now locks in {formatPrice(nativeUnrealized, investment.currency)}.</p>
                  </>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                  {[
                    { label: 'P&L per share', value: `${even.pnlPerUnit > 0 ? '+' : ''}${formatPrice(even.pnlPerUnit, investment.currency)}`, className: tone(even.pnlPerUnit) },
                    { label: 'Return on cost', value: pct(even.pnlPct, 2), className: tone(even.pnlPct) },
                    { label: 'Each 1% move', value: `±${formatPrice(marketPrice * investment.units * 0.01, currency)}`, className: 'text-textMain' },
                    ...(stats?.typicalDayMove && even.status !== 'even'
                      ? [{ label: 'Gap vs a typical day', value: `≈ ${(Math.abs(even.movePct) / stats.typicalDayMove).toFixed(1)}×`, className: 'text-textMain', note: `A typical day moves ±${(stats.typicalDayMove * 100).toFixed(1)}%` }]
                      : []),
                  ].map(item => (
                    <div key={item.label} className="rounded-2xl border border-border bg-surface px-3 py-2.5">
                      <p className="text-[9px] font-black uppercase tracking-wide text-secondary">{item.label}</p>
                      <p className={`mt-1 text-sm font-black tabular-nums ${item.className}`}>{item.value}</p>
                      {'note' in item && item.note && <p className="mt-0.5 text-[10px] text-secondary">{item.note}</p>}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] text-secondary">The average cost includes fees you logged with your buys. The amber line on the chart marks it.</p>
                {investment.symbol && <PriceAlertControls symbol={investment.symbol} currentPrice={marketPrice} averageCost={investment.averageCost} currency={currency} />}
              </section>
            )}
            </div>
            <div className="order-4 min-w-0 lg:order-none">
            <section>
              <h2 className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-secondary">Your position</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                {[
                  { icon: WalletCards, label: 'Units', value: investment.units.toLocaleString(), note: `${side} position` },
                  { icon: BarChart3, label: 'Avg. cost', value: formatPrice(investment.averageCost, investment.currency), note: 'Per unit' },
                  { label: 'Cost basis', value: formatPrice(investment.units * investment.averageCost, investment.currency), note: 'Units × average cost' },
                  { icon: Clock3, label: 'Market value', value: formatPrice(metrics.currentValue, baseCurrency), note: 'In portfolio currency' },
                  { label: 'Unrealized P&L', value: `${nativeUnrealized > 0 ? '+' : ''}${formatPrice(nativeUnrealized, investment.currency)}`, note: even ? `${pct(even.pnlPct, 2)} on cost` : 'At latest price', className: tone(nativeUnrealized) },
                  { label: "Today's P&L", value: dayPnl === undefined ? '—' : `${dayPnl > 0 ? '+' : ''}${formatPrice(dayPnl, currency)}`, note: stats?.dayChangePct !== undefined ? `Stock ${pct(stats.dayChangePct, 2)} today` : 'Since the last close', className: tone(dayPnl) },
                  { label: 'Held for', value: heldDays === undefined ? '—' : heldDays < 1 ? 'Today' : `${heldDays.toLocaleString()} day${heldDays === 1 ? '' : 's'}`, note: investment.acquiredDate ? `Since ${new Date(investment.acquiredDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No acquired date' },
                  { label: 'Position size', value: formatPrice(marketPrice * investment.units, currency), note: side === 'Short' ? 'Notional you owe back' : 'At the latest price' },
                ].map(item => {
                  const Icon = 'icon' in item ? item.icon : null;
                  return (
                    <div key={item.label} className="rounded-2xl border border-border bg-surface p-4">
                      <div className="flex items-center gap-2 text-secondary">{Icon && <Icon size={15} />}<p className="text-[10px] font-black uppercase tracking-wide">{item.label}</p></div>
                      <p className={`mt-3 text-base font-black tabular-nums ${'className' in item && item.className ? item.className : ''}`}>{item.value}</p>
                      <p className="mt-1 text-[10px] text-secondary">{item.note}</p>
                    </div>
                  );
                })}
              </div>
            </section>
            </div>
            {insightsError && <p className="order-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300 lg:order-none">{insightsError}</p>}
            {!insights && !insightsError && investment.symbol && (
              <div className="order-5 flex items-center gap-2 rounded-3xl border border-border bg-surface p-5 text-xs font-bold text-secondary lg:order-none"><Loader2 size={15} className="animate-spin" /> Loading company data…</div>
            )}
            {insightList.length > 0 && <div className="order-5 min-w-0 lg:order-none"><InsightsCard insights={insightList} /></div>}
            {insights?.analysts && <div className="order-6 min-w-0 lg:order-none"><AnalystCard analysts={insights.analysts} price={marketPrice} averageCost={investment.averageCost} currency={currency} /></div>}
            {insights && <div className="order-10 min-w-0 lg:order-none"><KeyStatsCard data={insights} /></div>}
            {insights?.profile && <div className="order-[13] min-w-0 lg:order-none"><ProfileCard profile={insights.profile} /></div>}
          </div>
        </div>

        <p className="mt-6 px-2 text-center text-[10px] leading-relaxed text-secondary">
          Market data is provided through Yahoo Finance and may be delayed. This view is for tracking, not trade execution.
        </p>
      </main>
    </div>
  );
};

export default TickerDetail;
