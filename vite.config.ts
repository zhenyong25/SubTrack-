import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { handleExchangeBalances } from './server/cryptoExchanges';
import { handleSolanaRpc } from './server/solanaRpc';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          // Mirrors server/index.ts's crypto routes for local `vite dev`: the same handlers,
          // given a standard Request built from Node's request.
          name: 'crypto-routes',
          configureServer(server) {
            const routes: Record<string, (request: Request) => Promise<Response>> = {
              '/api/crypto/exchange': handleExchangeBalances,
              '/api/crypto/solana': request => handleSolanaRpc(request, env.SOLANA_RPC_URL),
            };
            Object.entries(routes).forEach(([route, handle]) => {
              server.middlewares.use(route, async (req, res) => {
                const chunks: Buffer[] = [];
                for await (const chunk of req) chunks.push(chunk as Buffer);
                const response = await handle(new Request(`http://localhost${route}`, {
                  method: req.method,
                  headers: { 'Content-Type': 'application/json' },
                  body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks).toString('utf8'),
                }));
                res.statusCode = response.status;
                res.setHeader('Content-Type', response.headers.get('Content-Type') || 'application/json');
                res.setHeader('Cache-Control', 'no-store');
                res.end(await response.text());
              });
            });
          },
        },
        {
          // Mirrors server/index.ts's proxy route for local `vite dev`, which doesn't run
          // the Cloudflare Worker: forwards to Hugging Face with the token read server-side
          // here (via loadEnv, in this Node process) so it's never bundled into client JS
          // even in dev, and so scanning a statement works locally without deploying first.
          name: 'hf-chat-proxy',
          configureServer(server) {
            server.middlewares.use('/api/hf/chat', async (req, res) => {
              if (req.method !== 'POST') {
                res.statusCode = 405;
                res.end();
                return;
              }

              const chunks: Buffer[] = [];
              for await (const chunk of req) chunks.push(chunk as Buffer);
              const body = Buffer.concat(chunks).toString('utf8');

              try {
                const upstream = await fetch('https://router.huggingface.co/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.HF_TOKEN || ''}`,
                  },
                  body,
                });
                res.statusCode = upstream.status;
                res.setHeader('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
                res.end(await upstream.text());
              } catch (error) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : 'Proxy request failed' } }));
              }
            });
          },
        },
        {
          // Mirrors server/index.ts's /api/stock-quote route for local `vite dev` - Yahoo
          // Finance's endpoint sends no CORS headers, so it has to be proxied server-side here
          // too, the same reasoning as the HF proxy above.
          name: 'stock-quote-proxy',
          configureServer(server) {
            server.middlewares.use('/api/stock-quote', async (req, res) => {
              if (req.method !== 'GET') {
                res.statusCode = 405;
                res.end();
                return;
              }

              const symbol = (new URL(req.url || '', 'http://localhost').searchParams.get('symbol') || '').trim().toUpperCase();
              if (!/^[A-Z0-9.\-^=]{1,20}$/.test(symbol)) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: { message: 'Invalid or missing symbol.' } }));
                return;
              }

              try {
                const upstream = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Safari/537.36' },
                });
                const data = await upstream.json();
                const meta = data?.chart?.result?.[0]?.meta;
                res.setHeader('Content-Type', 'application/json');
                if (!upstream.ok || !meta || typeof meta.regularMarketPrice !== 'number') {
                  res.statusCode = upstream.ok ? 404 : upstream.status;
                  res.end(JSON.stringify({ error: { message: `No quote found for "${symbol}".` } }));
                  return;
                }
                res.statusCode = 200;
                res.end(JSON.stringify({
                  symbol: meta.symbol || symbol,
                  price: meta.regularMarketPrice,
                  currency: meta.currency || null,
                  name: meta.longName || meta.shortName || null,
                }));
              } catch (error) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : 'Proxy request failed' } }));
              }
            });
          },
        },
        {
          // Hourly OHLC proxy used by the portfolio's 1D candlestick chart. Five days are
          // requested upstream so the UI can carry the last close through weekends and
          // closed-market hours while still rendering a complete 24-hour axis.
          name: 'stock-history-proxy',
          configureServer(server) {
            server.middlewares.use('/api/stock-history', async (req, res) => {
              if (req.method !== 'GET') {
                res.statusCode = 405;
                res.end();
                return;
              }

              const requestUrl = new URL(req.url || '', 'http://localhost');
              const symbol = (requestUrl.searchParams.get('symbol') || '').trim().toUpperCase();
              const supportedIntervals = new Set(['1m', '5m', '15m', '60m', '1d']);
              const supportedRanges = new Set(['1d', '5d', '1mo', '60d', '3mo', '1y', 'max']);
              let interval = supportedIntervals.has(requestUrl.searchParams.get('interval') || '') ? requestUrl.searchParams.get('interval')! : '60m';
              let range = supportedRanges.has(requestUrl.searchParams.get('range') || '') ? requestUrl.searchParams.get('range')! : '5d';
              if (interval === '1m' && range !== '1d' && range !== '5d') range = '5d';
              if ((interval === '5m' || interval === '15m') && !['1d', '5d', '1mo', '60d'].includes(range)) range = '1mo';
              if (interval === '60m' && range === 'max') range = '1y';
              if (!/^[A-Z0-9.\-^=]{1,20}$/.test(symbol)) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: { message: 'Invalid or missing symbol.' } }));
                return;
              }

              try {
                const upstream = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=true&events=div%2Csplits`, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Safari/537.36' },
                });
                const data = await upstream.json();
                const result = data?.chart?.result?.[0];
                const quote = result?.indicators?.quote?.[0];
                res.setHeader('Content-Type', 'application/json');
                if (!upstream.ok || !result?.timestamp || !quote) {
                  res.statusCode = upstream.ok ? 404 : upstream.status;
                  res.end(JSON.stringify({ error: { message: `No intraday history found for "${symbol}".` } }));
                  return;
                }

                const candles = result.timestamp.flatMap((timestamp: number, index: number) => {
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

                res.statusCode = 200;
                res.end(JSON.stringify({
                  symbol: result.meta?.symbol || symbol,
                  currency: result.meta?.currency || null,
                  name: result.meta?.longName || result.meta?.shortName || null,
                  currentPrice: result.meta?.regularMarketPrice ?? null,
                  previousClose: result.meta?.regularMarketPreviousClose ?? null,
                  marketState: result.meta?.marketState || null,
                  exchange: result.meta?.fullExchangeName || result.meta?.exchangeName || null,
                  exchangeTimezone: result.meta?.exchangeTimezoneName || null,
                  candles,
                }));
              } catch (error) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : 'Proxy request failed' } }));
              }
            });
          },
        },
        VitePWA({
          strategies: 'injectManifest',
          srcDir: '.',
          filename: 'sw.ts',
          registerType: 'autoUpdate',
          // We register manually in index.tsx via virtual:pwa-register so we get
          // real update polling and an auto-reload once a new SW takes over —
          // the default injected script only calls register() once on load.
          injectRegister: false,
          includeAssets: ['favicon.svg'],
          manifest: {
            name: 'SubTrack',
            short_name: 'SubTrack',
            description: 'Track subscriptions, expenses, income, and cards in one place.',
            start_url: '/',
            display: 'standalone',
            background_color: '#0f172a',
            theme_color: '#2563eb',
            icons: [
              { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
              { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          injectManifest: {
            globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
            // service-logos are fetched on demand; the pdf.js worker is only needed
            // when reconciling a statement, so keep both out of the eager install precache.
            globIgnores: ['**/service-logos/**', '**/pdf.worker*.mjs'],
            // Default is 2 MiB; the main bundle has grown past that (Supabase, pdf.js,
            // recharts, etc.), which would silently drop it from the precache manifest
            // and break offline support for anyone with the app installed.
            maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          },
        }),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
