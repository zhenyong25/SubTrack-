// Cloudflare Worker for the "subtrack" project: serves the built SPA as static assets, and
// proxies statement-parsing calls to Hugging Face server-side. Calling Hugging Face directly
// from the browser depended on their CORS response being reliable, which it wasn't in practice
// (a preflight failed in production while the same request succeeded from curl moments later -
// third-party CORS for a router primarily meant for server/SDK use isn't a guarantee). Proxying
// through this Worker also means HF_TOKEN never has to be bundled into client-side JS.

export interface Env {
  HF_TOKEN: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const HF_CHAT_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';

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

    return env.ASSETS.fetch(request);
  },
};
