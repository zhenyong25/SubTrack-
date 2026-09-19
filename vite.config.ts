import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
            name: 'SubTrack AI',
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
