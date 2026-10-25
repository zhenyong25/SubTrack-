// Read-only relay to public Solana RPC nodes for the crypto wallet scan. The official endpoint
// refuses requests that carry a browser Origin header (403), and blocks some server providers too,
// so several public nodes are tried in turn. A private RPC URL (SOLANA_RPC_URL, e.g. a free Helius
// key) goes first when it's configured - public nodes refuse Cloudflare's IPs for token lookups.
// Only the balance lookups the scan needs are forwarded.

const SOLANA_RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];
const ALLOWED_METHODS = new Set(['getBalance', 'getTokenAccountsByOwner', 'getMultipleAccounts']);

export const handleSolanaRpc = async (request: Request, privateRpcUrl?: string): Promise<Response> => {
  if (request.method !== 'POST') return Response.json({ error: { message: 'Use POST.' } }, { status: 405 });
  const text = await request.text();
  if (text.length > 4000) return Response.json({ error: { message: 'Request too large.' } }, { status: 413 });
  let body: { method?: string };
  try { body = JSON.parse(text); } catch { return Response.json({ error: { message: 'Invalid JSON.' } }, { status: 400 }); }
  if (!body || Array.isArray(body) || !ALLOWED_METHODS.has(body.method || '')) {
    return Response.json({ error: { message: 'Method not allowed.' } }, { status: 400 });
  }
  const failures: string[] = [];
  for (const endpoint of [privateRpcUrl, ...SOLANA_RPCS].filter((url): url is string => Boolean(url))) {
    try {
      const upstream = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text, signal: AbortSignal.timeout(15000) });
      const result = await upstream.text();
      // A node that refuses us (403/429, or a JSON-RPC error like "IP blocked") - try the next one.
      if (!upstream.ok || /"error"\s*:\s*\{[^}]*"code"\s*:\s*(403|429|-32029)/.test(result)) {
        failures.push(`${endpoint === privateRpcUrl ? 'private RPC' : new URL(endpoint).host} answered ${upstream.status}`);
        continue;
      }
      return new Response(result, { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      failures.push(`${endpoint === privateRpcUrl ? 'private RPC' : new URL(endpoint).host}: unreachable`);
    }
  }
  return Response.json({ error: { message: `no Solana node answered (${failures.join('; ')})` } }, { status: 502 });
};
