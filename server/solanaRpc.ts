// Read-only relay to public Solana RPC nodes for the crypto wallet scan. The official endpoint
// refuses requests that carry a browser Origin header (403), and blocks some server providers too,
// so several public nodes are tried in turn. Only the balance lookups the scan needs are forwarded.

const SOLANA_RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com', 'https://solana-mainnet.public.blastapi.io'];
const ALLOWED_METHODS = new Set(['getBalance', 'getTokenAccountsByOwner', 'getMultipleAccounts']);

export const handleSolanaRpc = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return Response.json({ error: { message: 'Use POST.' } }, { status: 405 });
  const text = await request.text();
  if (text.length > 4000) return Response.json({ error: { message: 'Request too large.' } }, { status: 413 });
  let body: { method?: string };
  try { body = JSON.parse(text); } catch { return Response.json({ error: { message: 'Invalid JSON.' } }, { status: 400 }); }
  if (!body || Array.isArray(body) || !ALLOWED_METHODS.has(body.method || '')) {
    return Response.json({ error: { message: 'Method not allowed.' } }, { status: 400 });
  }
  let lastError = 'Solana RPC unreachable';
  for (const endpoint of SOLANA_RPCS) {
    try {
      const upstream = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text, signal: AbortSignal.timeout(15000) });
      const result = await upstream.text();
      // A node that refuses us (403/429, or a JSON-RPC error like "IP blocked") - try the next one.
      if (!upstream.ok || /"error"\s*:\s*\{[^}]*"code"\s*:\s*(403|429|-32029)/.test(result)) {
        lastError = `${new URL(endpoint).host} answered ${upstream.status}`;
        continue;
      }
      return new Response(result, { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  return Response.json({ error: { message: lastError } }, { status: 502 });
};
