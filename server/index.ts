// Cloudflare Worker for the "subtrack" project: serves the built SPA as static assets, and
// proxies statement-parsing calls to Hugging Face server-side. Calling Hugging Face directly
// from the browser depended on their CORS response being reliable, which it wasn't in practice
// (a preflight failed in production while the same request succeeded from curl moments later -
// third-party CORS for a router primarily meant for server/SDK use isn't a guarantee). Proxying
// through this Worker also means HF_TOKEN never has to be bundled into client-side JS.

import { handleExchangeBalances } from './cryptoExchanges';
import { handleEarningsCalendar } from './earningsCalendar';
import { handleStockInsights } from './stockInsights';
import { handleSolanaRpc } from './solanaRpc';
import { handlePokemonMarket } from './pokemonMarket';
import { handlePsaCert } from './psaCert';

export interface Env {
  HF_TOKEN: string;
  PSA_API_TOKEN?: string; // optional PSA public API token for slab lookups - wrangler secret put PSA_API_TOKEN
  SOLANA_RPC_URL?: string; // optional private Solana RPC (e.g. Helius) - set with: wrangler secret put SOLANA_RPC_URL
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const HF_CHAT_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';

// Yahoo Finance's quote endpoint doesn't send any Access-Control-Allow-Origin header (it's not
// meant for direct browser use), so it has to be proxied server-side too - same reasoning as
// the Hugging Face route above. It's an unofficial, undocumented endpoint that could change or
// disappear without notice; there's no auth/key involved, just a plausible browser User-Agent.
const YAHOO_CHART_ENDPOINT = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const SYMBOL_PATTERN = /^[A-Z0-9.\-^=]{1,20}$/;

interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  currency?: string;
  longName?: string;
  shortName?: string;
  marketState?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  exchangeTimezoneName?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
}

interface YahooChartQuote {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
}

const HISTORY_INTERVALS = new Set(['1m', '5m', '15m', '60m', '1d']);
const HISTORY_RANGES = new Set(['1d', '5d', '1mo', '60d', '3mo', '1y', 'max']);

const safeHistoryRequest = (requestedInterval: string | null, requestedRange: string | null) => {
  let interval = HISTORY_INTERVALS.has(requestedInterval || '') ? requestedInterval! : '60m';
  let range = HISTORY_RANGES.has(requestedRange || '') ? requestedRange! : '5d';

  // Yahoo limits how far its smallest candles can be requested. Keep every request inside
  // a reliable window even if somebody manually changes the URL query parameters.
  if (interval === '1m' && range !== '1d' && range !== '5d') range = '5d';
  // Yahoo serves 5m and 15m bars for up to 60 days; the trade simulator needs that much history.
  if (interval === '5m' && !['1d', '5d', '1mo', '60d'].includes(range)) range = '1mo';
  if (interval === '15m' && !['1d', '5d', '1mo', '60d'].includes(range)) range = '1mo';
  if (interval === '60m' && range === 'max') range = '1y';

  return { interval, range };
};

async function handleStockQuote(url: URL): Promise<Response> {
  const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) {
    return Response.json({ error: { message: 'Invalid or missing symbol.' } }, { status: 400 });
  }

  const upstream = await fetch(`${YAHOO_CHART_ENDPOINT}${encodeURIComponent(symbol)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Safari/537.36' },
  });

  if (!upstream.ok) {
    return Response.json({ error: { message: `Quote lookup failed (${upstream.status}).` } }, { status: upstream.status });
  }

  const data = await upstream.json<{ chart?: { result?: Array<{ meta?: YahooChartMeta }> } }>();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') {
    return Response.json({ error: { message: `No quote found for "${symbol}".` } }, { status: 404 });
  }

  return Response.json({
    symbol: meta.symbol || symbol,
    price: meta.regularMarketPrice,
    currency: meta.currency || null,
    name: meta.longName || meta.shortName || null,
  });
}

async function handleStockHistory(url: URL): Promise<Response> {
  const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
  const { interval, range } = safeHistoryRequest(url.searchParams.get('interval'), url.searchParams.get('range'));
  if (!SYMBOL_PATTERN.test(symbol)) {
    return Response.json({ error: { message: 'Invalid or missing symbol.' } }, { status: 400 });
  }

  const historyUrl = `${YAHOO_CHART_ENDPOINT}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=true&events=div%2Csplits`;
  const upstream = await fetch(historyUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Safari/537.36' },
  });

  if (!upstream.ok) {
    return Response.json({ error: { message: `Intraday history lookup failed (${upstream.status}).` } }, { status: upstream.status });
  }

  const data = await upstream.json<{
    chart?: {
      result?: Array<{
        meta?: YahooChartMeta;
        timestamp?: number[];
        indicators?: { quote?: YahooChartQuote[] };
      }>;
    };
  }>();
  const result = data?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) {
    return Response.json({ error: { message: `No intraday history found for "${symbol}".` } }, { status: 404 });
  }

  const candles = result.timestamp.flatMap((timestamp, index) => {
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    const volume = quote.volume?.[index];
    if (![open, high, low, close].every(value => typeof value === 'number' && Number.isFinite(value))) return [];
    return [{
      timestamp: timestamp * 1000,
      open,
      high,
      low,
      close,
      volume: typeof volume === 'number' && Number.isFinite(volume) ? volume : undefined,
    }];
  });

  return Response.json({
    symbol: result.meta?.symbol || symbol,
    currency: result.meta?.currency || null,
    name: result.meta?.longName || result.meta?.shortName || null,
    currentPrice: result.meta?.regularMarketPrice ?? null,
    previousClose: result.meta?.regularMarketPreviousClose ?? null,
    marketState: result.meta?.marketState || null,
    exchange: result.meta?.fullExchangeName || result.meta?.exchangeName || null,
    exchangeTimezone: result.meta?.exchangeTimezoneName || null,
    fiftyTwoWeekHigh: result.meta?.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: result.meta?.fiftyTwoWeekLow ?? null,
    dayHigh: result.meta?.regularMarketDayHigh ?? null,
    dayLow: result.meta?.regularMarketDayLow ?? null,
    dayVolume: result.meta?.regularMarketVolume ?? null,
    candles,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/hf/chat' && request.method === 'POST') {
      if (!env.HF_TOKEN) {
        return Response.json({ error: { message: 'HF_TOKEN is not configured on this Worker.' } }, { status: 500 });
      }

      const body = await request.text();
      const upstream = await fetch(HF_CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.HF_TOKEN}`,
        },
        body,
      });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
      });
    }

    if (url.pathname === '/api/stock-quote' && request.method === 'GET') {
      return handleStockQuote(url);
    }

    if (url.pathname === '/api/stock-history' && request.method === 'GET') {
      return handleStockHistory(url);
    }

    if (url.pathname === '/api/earnings-calendar') {
      return handleEarningsCalendar(request);
    }

    if (url.pathname === '/api/stock-insights') {
      return handleStockInsights(request);
    }
    if (url.pathname === '/api/pokemon/market') return handlePokemonMarket(request);
    if (url.pathname === '/api/pokemon/psa-cert') return handlePsaCert(request, env.PSA_API_TOKEN);

    // Crypto: exchange balances via a read-only key sent with each request (never stored),
    // and a read-only Solana RPC relay - see the two modules for why they're server-side.
    if (url.pathname === '/api/crypto/exchange') {
      return handleExchangeBalances(request);
    }

    if (url.pathname === '/api/crypto/solana') {
      return handleSolanaRpc(request, env.SOLANA_RPC_URL);
    }

    return env.ASSETS.fetch(request);
  },
};
