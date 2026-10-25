// Read-only relay to Solana's public RPC for the crypto wallet scan. The official endpoint refuses
// requests that carry a browser Origin header (403), but answers the same request server-side.
// Only the balance lookups the scan needs are forwarded.

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
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
  try {
    const upstream = await fetch(SOLANA_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text, signal: AbortSignal.timeout(15000) });
    return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' } });
  } catch (error) {
    return Response.json({ error: { message: error instanceof Error ? error.message : 'Solana RPC unreachable' } }, { status: 502 });
  }
};
