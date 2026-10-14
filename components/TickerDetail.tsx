import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
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
import InvestmentLogo from './InvestmentLogo';

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
  const chartViewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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
      setZoom(clamp(startingZoom * (touchDistance(event.touches) / startingDistance), 1, 6));
    };

    viewport.addEventListener('touchstart', handleTouchStart, { passive: true });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

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
    const rawMin = Math.min(...candles.map(candle => candle.low));
    const rawMax = Math.max(...candles.map(candle => candle.high));
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
  }, [candles]);

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
  const nativeUnrealized = investment.positionSide === 'Short'
    ? (investment.averageCost - marketPrice) * investment.units
    : (marketPrice - investment.averageCost) * investment.units;

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

  const timeLabel = (timestamp: number) => new Date(timestamp).toLocaleString(undefined, range === '1D'
    ? { hour: '2-digit', minute: '2-digit', second: interval === '20s' ? '2-digit' : undefined }
    : range === '5D'
      ? { weekday: 'short', hour: '2-digit', minute: '2-digit' }
      : { month: 'short', day: 'numeric', year: range === '1Y' || range === 'MAX' ? 'numeric' : undefined });

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-background text-textMain animate-fade-in">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
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

      <main className="mx-auto max-w-5xl space-y-4 px-4 pb-28 pt-5 sm:space-y-6 sm:px-6">
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
                onClick={() => setZoom(current => clamp(current - 0.5, 1, 6))}
                disabled={zoom <= 1}
                aria-label="Zoom out chart"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:text-textMain disabled:opacity-30"
              >
                <Minus size={15} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Reset chart zoom"
                className="flex h-8 min-w-12 items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-black text-textMain"
              >
                {zoom === 1 ? <RotateCcw size={12} /> : null}{zoom.toFixed(zoom % 1 === 0 ? 0 : 1)}×
              </button>
              <button
                type="button"
                onClick={() => setZoom(current => clamp(current + 0.5, 1, 6))}
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
              style={{ width: `${zoom * 100}%`, minWidth: '100%' }}
              role="img"
              aria-label={`${investment.symbol} candlestick price chart`}
              onPointerDown={handleChartPointer}
              onPointerMove={event => {
                if (event.pointerType === 'mouse' || event.buttons === 1) handleChartPointer(event);
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
              : <p>Drag across the chart to inspect candles. Pinch or use +/− to zoom, then swipe sideways.</p>}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-secondary"><WalletCards size={15} /><p className="text-[10px] font-black uppercase tracking-wide">Your position</p></div>
            <p className="mt-3 text-base font-black">{investment.units.toLocaleString()} units</p>
            <p className="mt-1 text-[10px] text-secondary">{investment.positionSide || 'Long'} position</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-secondary"><BarChart3 size={15} /><p className="text-[10px] font-black uppercase tracking-wide">Avg. cost</p></div>
            <p className="mt-3 text-base font-black">{formatPrice(investment.averageCost, investment.currency)}</p>
            <p className="mt-1 text-[10px] text-secondary">Per unit</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-secondary"><Clock3 size={15} /><p className="text-[10px] font-black uppercase tracking-wide">Market value</p></div>
            <p className="mt-3 text-base font-black">{formatPrice(metrics.currentValue, baseCurrency)}</p>
            <p className="mt-1 text-[10px] text-secondary">In portfolio currency</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-[10px] font-black uppercase tracking-wide text-secondary">Unrealized P&amp;L</p>
            <p className={`mt-3 text-base font-black ${nativeUnrealized > 0 ? 'text-emerald-500' : nativeUnrealized < 0 ? 'text-rose-500' : 'text-textMain'}`}>
              {nativeUnrealized > 0 ? '+' : ''}{formatPrice(nativeUnrealized, investment.currency)}
            </p>
            <p className="mt-1 text-[10px] text-secondary">At latest price</p>
          </div>
        </section>

        <p className="px-2 text-center text-[10px] leading-relaxed text-secondary">
          Market data is provided through Yahoo Finance and may be delayed. This view is for tracking, not trade execution.
        </p>
      </main>
    </div>
  );
};

export default TickerDetail;
