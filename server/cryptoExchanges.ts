// Reads balances from crypto exchanges with a READ-ONLY API key, for the Investments tab's crypto
// view. Exchanges don't allow these signed requests from a browser (no CORS), so the browser sends
// the key here with each sync; this signs the request, asks the exchange, and returns balances.
// Keys are never stored or logged here - they live only in the browser that added them.
//
// Used by the Cloudflare Worker (server/index.ts) and mirrored in vite.config.ts for `vite dev`.
// Only standard fetch + WebCrypto, so it runs the same in both.

export type ExchangeId = 'binance' | 'coinbase' | 'okx' | 'bybit' | 'kraken';

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // OKX only
}

export interface ExchangeBalance {
  asset: string; // ticker as the exchange names it, normalised (e.g. Kraken's XXBT -> BTC)
  amount: string; // decimal string, as the exchange reports it
  wallet: string; // which part of the account, e.g. "Spot", "Funding", "Earn"
  priceUsd?: number; // the exchange's own USD(T) price, when it has one
  change24h?: number; // percent
}

export interface ExchangeResult {
  balances: ExchangeBalance[];
  errors: string[]; // parts of the account that couldn't be read (e.g. a key without Earn access)
}

const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const base64 = (buffer: ArrayBuffer | Uint8Array) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
const fromBase64 = (value: string) => Uint8Array.from(atob(value.replace(/\s+/g, '')), c => c.charCodeAt(0));
const base64Url = (input: ArrayBuffer | Uint8Array | string) =>
  (typeof input === 'string' ? btoa(unescape(encodeURIComponent(input))) : base64(input)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const hmac = async (algorithm: 'SHA-256' | 'SHA-512', key: Uint8Array | string, message: string | Uint8Array) => {
  const keyBytes = typeof key === 'string' ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: algorithm }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, typeof message === 'string' ? encoder.encode(message) : message);
};

const TIMEOUT_MS = 15000;
// One retry for network blips (a dropped connection, a DNS hiccup) - never for an exchange's answer.
const send = async (url: string, init: RequestInit) => {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      const cause = (error as { cause?: { code?: string } })?.cause?.code;
      throw new Error(`couldn't reach ${new URL(url).host}${cause ? ` (${cause})` : ''} - check the connection and try again`);
    }
  }
};

const call = async (url: string, init: RequestInit = {}) => {
  const response = await send(url, init);
  const text = await response.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.retMsg || data?.error?.[0] || data?.error_details || data?.error || text.slice(0, 120);
    throw new Error(`${response.status}: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
  }
  return data;
};

const positive = (value: unknown) => Number(value) > 0;
const STABLE = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'USD', 'DAI', 'TUSD', 'USDP', 'PYUSD']);

// Runs each part of the account separately, so one refused permission doesn't hide the rest.
const parts = async (tasks: [string, () => Promise<ExchangeBalance[]>][]): Promise<ExchangeResult> => {
  const results = await Promise.allSettled(tasks.map(([, task]) => task()));
  const balances: ExchangeBalance[] = [];
  const errors: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') balances.push(...result.value);
    else errors.push(`${tasks[index][0]}: ${result.reason instanceof Error ? result.reason.message : 'could not be read'}`);
  });
  if (!balances.length && errors.length === tasks.length) throw new Error(errors[0]);
  return { balances, errors };
};

// ------------------------------------------------------------------------------------- Binance
// https://developers.binance.com/docs/binance-spot-api-docs - HMAC-SHA256 of the query string.

export const binanceSignature = async (query: string, secret: string) => hex(await hmac('SHA-256', secret, query));

// Binance's CDN geo-blocks some server locations (an HTML 403/451 page instead of its JSON API),
// so its official alternative hosts are tried in turn. Market data comes from its public mirror.
const BINANCE_HOSTS = ['api.binance.com', 'api-gcp.binance.com', 'api1.binance.com', 'api2.binance.com', 'api3.binance.com', 'api4.binance.com'];
const isGeoBlock = (error: unknown) => error instanceof Error && /^(403|451): (<|\s*$)|restricted location|unavailable from a restricted/i.test(error.message);

const binance = async ({ apiKey, apiSecret }: ExchangeCredentials): Promise<ExchangeResult> => {
  const signed = async (method: 'GET' | 'POST', path: string, params: Record<string, string> = {}) => {
    let lastError: unknown;
    for (const host of BINANCE_HOSTS) {
      // A fresh timestamp and signature per attempt, so a retry can't fall outside recvWindow.
      const query = new URLSearchParams({ ...params, recvWindow: '10000', timestamp: String(Date.now()) }).toString();
      const signature = await binanceSignature(query, apiSecret);
      try {
        return await call(`https://${host}${path}?${query}&signature=${signature}`, { method, headers: { 'X-MBX-APIKEY': apiKey } });
      } catch (error) {
        if (!isGeoBlock(error)) throw error;
        lastError = error;
      }
    }
    throw new Error(lastError ? 'Binance refuses requests from this server\'s location - balances can sync from the app running locally' : 'Binance unavailable');
  };
  const tickers: { symbol: string; lastPrice: string; priceChangePercent: string }[] = await call('https://data-api.binance.vision/api/v3/ticker/24hr?type=MINI')
    .catch(() => call('https://api.binance.com/api/v3/ticker/24hr?type=MINI'))
    .catch(() => []);
  const quote = new Map<string, { price: number; change: number }>();
  (Array.isArray(tickers) ? tickers : []).forEach(t => {
    const match = t.symbol.match(/^(.+?)(USDT|FDUSD|USDC)$/);
    if (match && !quote.has(match[1])) quote.set(match[1], { price: Number(t.lastPrice), change: Number(t.priceChangePercent) });
  });
  const priced = (asset: string, amount: string, wallet: string): ExchangeBalance => {
    // Binance prefixes some Earn tokens with "LD" (e.g. LDBTC = BTC in Simple Earn).
    const base = asset.startsWith('LD') && asset.length > 3 && quote.has(asset.slice(2)) ? asset.slice(2) : asset;
    const q = STABLE.has(base) ? { price: 1, change: 0 } : quote.get(base);
    return { asset: base, amount, wallet: base !== asset ? 'Earn' : wallet, priceUsd: q?.price, change24h: q?.change };
  };
  return parts([
    ['Spot', async () => {
      const data = await signed('GET', '/api/v3/account', { omitZeroBalances: 'true' });
      return (data.balances || []).filter((b: { free: string; locked: string }) => positive(Number(b.free) + Number(b.locked)))
        .map((b: { asset: string; free: string; locked: string }) => priced(b.asset, String(Number(b.free) + Number(b.locked)), 'Spot'));
    }],
    ['Funding', async () => {
      const data = await signed('POST', '/sapi/v1/asset/get-funding-asset');
      return (data || []).filter((b: { free: string; locked: string; freeze: string }) => positive(Number(b.free) + Number(b.locked) + Number(b.freeze)))
        .map((b: { asset: string; free: string; locked: string; freeze: string }) => priced(b.asset, String(Number(b.free) + Number(b.locked) + Number(b.freeze)), 'Funding'));
    }],
    ['Earn', async () => {
      const [flexible, locked] = await Promise.all([
        signed('GET', '/sapi/v1/simple-earn/flexible/position', { size: '100' }),
        signed('GET', '/sapi/v1/simple-earn/locked/position', { size: '100' }),
      ]);
      return [
        ...(flexible?.rows || []).map((r: { asset: string; totalAmount: string }) => priced(r.asset, r.totalAmount, 'Earn')),
        ...(locked?.rows || []).map((r: { asset: string; amount: string }) => priced(r.asset, r.amount, 'Earn')),
      ].filter(b => positive(b.amount));
    }],
  ]);
};

// ----------------------------------------------------------------------------------------- OKX
// https://www.okx.com/docs-v5/en/#overview-rest-authentication - base64 HMAC-SHA256 of
// timestamp + method + path, plus the passphrase chosen when the key was made.

export const okxSignature = async (timestamp: string, method: string, path: string, body: string, secret: string) =>
  base64(await hmac('SHA-256', secret, `${timestamp}${method}${path}${body}`));

const okx = async ({ apiKey, apiSecret, passphrase }: ExchangeCredentials): Promise<ExchangeResult> => {
  if (!passphrase) throw new Error('OKX keys need the passphrase you set when creating them');
  const signed = async (path: string) => {
    const timestamp = new Date().toISOString();
    const sign = await okxSignature(timestamp, 'GET', path, '', apiSecret);
    const data = await call(`https://www.okx.com${path}`, { headers: { 'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': sign, 'OK-ACCESS-TIMESTAMP': timestamp, 'OK-ACCESS-PASSPHRASE': passphrase } });
    if (data?.code && data.code !== '0') throw new Error(data.msg || `OKX error ${data.code}`);
    return data?.data || [];
  };
  const tickers = await call('https://www.okx.com/api/v5/market/tickers?instType=SPOT').catch(() => null);
  const quote = new Map<string, { price: number; change: number }>();
  (tickers?.data || []).forEach((t: { instId: string; last: string; open24h: string }) => {
    const [base, quoteCcy] = t.instId.split('-');
    if ((quoteCcy === 'USDT' || quoteCcy === 'USDC') && !quote.has(base)) quote.set(base, { price: Number(t.last), change: Number(t.open24h) > 0 ? (Number(t.last) / Number(t.open24h) - 1) * 100 : 0 });
  });
  const priced = (asset: string, amount: string, wallet: string): ExchangeBalance => {
    const q = STABLE.has(asset) ? { price: 1, change: 0 } : quote.get(asset);
    return { asset, amount, wallet, priceUsd: q?.price, change24h: q?.change };
  };
  return parts([
    ['Trading', async () => {
      const [account] = await signed('/api/v5/account/balance');
      return (account?.details || []).filter((d: { eq: string }) => positive(d.eq)).map((d: { ccy: string; eq: string }) => priced(d.ccy, d.eq, 'Trading'));
    }],
    ['Funding', async () => (await signed('/api/v5/asset/balances')).filter((b: { bal: string }) => positive(b.bal)).map((b: { ccy: string; bal: string }) => priced(b.ccy, b.bal, 'Funding'))],
    ['Earn', async () => (await signed('/api/v5/finance/savings/balance')).filter((b: { amt: string }) => positive(b.amt)).map((b: { ccy: string; amt: string }) => priced(b.ccy, b.amt, 'Earn'))],
  ]);
};

// --------------------------------------------------------------------------------------- Bybit
// https://bybit-exchange.github.io/docs/v5/guide - hex HMAC-SHA256 of timestamp + key + window + query.

export const bybitSignature = async (timestamp: string, apiKey: string, recvWindow: string, query: string, secret: string) =>
  hex(await hmac('SHA-256', secret, `${timestamp}${apiKey}${recvWindow}${query}`));

// Like Binance, Bybit's CDN blocks some server locations; api.bytick.com is its official alternative.
const BYBIT_HOSTS = ['api.bybit.com', 'api.bytick.com'];
const isBlocked = (error: unknown) => isGeoBlock(error) || (error instanceof Error && /^403: .*(cloudfront|block access from your country)/is.test(error.message));

const bybit = async ({ apiKey, apiSecret }: ExchangeCredentials): Promise<ExchangeResult> => {
  const signed = async (path: string, query: string) => {
    let lastError: unknown;
    for (const host of BYBIT_HOSTS) {
      const timestamp = String(Date.now());
      const recvWindow = '10000';
      const sign = await bybitSignature(timestamp, apiKey, recvWindow, query, apiSecret);
      try {
        const data = await call(`https://${host}${path}?${query}`, { headers: { 'X-BAPI-API-KEY': apiKey, 'X-BAPI-SIGN': sign, 'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': recvWindow } });
        if (data?.retCode !== 0) throw new Error(data?.retMsg || 'Bybit refused the request');
        return data.result;
      } catch (error) {
        if (!isBlocked(error)) throw error;
        lastError = error;
      }
    }
    throw new Error(lastError ? 'Bybit refuses requests from this server\'s location - balances can sync from the app running locally' : 'Bybit unavailable');
  };
  const tickers = await call('https://api.bybit.com/v5/market/tickers?category=spot')
    .catch(() => call('https://api.bytick.com/v5/market/tickers?category=spot'))
    .catch(() => null);
  const quote = new Map<string, { price: number; change: number }>();
  (tickers?.result?.list || []).forEach((t: { symbol: string; lastPrice: string; price24hPcnt: string }) => {
    const match = t.symbol.match(/^(.+?)(USDT|USDC)$/);
    if (match && !quote.has(match[1])) quote.set(match[1], { price: Number(t.lastPrice), change: Number(t.price24hPcnt) * 100 });
  });
  const priced = (asset: string, amount: string, wallet: string): ExchangeBalance => {
    const q = STABLE.has(asset) ? { price: 1, change: 0 } : quote.get(asset);
    return { asset, amount, wallet, priceUsd: q?.price, change24h: q?.change };
  };
  return parts([
    ['Unified trading', async () => {
      const result = await signed('/v5/account/wallet-balance', 'accountType=UNIFIED');
      return (result?.list?.[0]?.coin || []).filter((c: { walletBalance: string }) => positive(c.walletBalance)).map((c: { coin: string; walletBalance: string }) => priced(c.coin, c.walletBalance, 'Trading'));
    }],
    ['Funding', async () => {
      const result = await signed('/v5/asset/transfer/query-account-coins-balance', 'accountType=FUND');
      return (result?.balance || []).filter((c: { walletBalance: string }) => positive(c.walletBalance)).map((c: { coin: string; walletBalance: string }) => priced(c.coin, c.walletBalance, 'Funding'));
    }],
  ]);
};

// -------------------------------------------------------------------------------------- Kraken
// https://docs.kraken.com/api/docs/guides/spot-rest-auth - base64 HMAC-SHA512 (base64 secret) of
// path + SHA256(nonce + body).

const KRAKEN_NAMES: Record<string, string> = { XBT: 'BTC', XDG: 'DOGE', ZUSD: 'USD', ZEUR: 'EUR', ZGBP: 'GBP', ZCAD: 'CAD', ZJPY: 'JPY', ZAUD: 'AUD' };
export const krakenAsset = (raw: string) => {
  const base = raw.replace(/\.(S|M|F|B|P)$/, '').replace(/\d+\.S$/, '');
  if (KRAKEN_NAMES[base]) return KRAKEN_NAMES[base];
  const trimmed = base.length === 4 && /^[XZ]/.test(base) ? base.slice(1) : base;
  return KRAKEN_NAMES[trimmed] || trimmed;
};

export const krakenSignature = async (path: string, nonce: string, body: string, secret: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(nonce + body)));
  return base64(await hmac('SHA-512', fromBase64(secret), new Uint8Array([...encoder.encode(path), ...digest])));
};

const kraken = async ({ apiKey, apiSecret }: ExchangeCredentials): Promise<ExchangeResult> => {
  const path = '/0/private/Balance';
  const nonce = String(Date.now() * 1000);
  const body = `nonce=${nonce}`;
  const sign = await krakenSignature(path, nonce, body, apiSecret);
  const data = await call(`https://api.kraken.com${path}`, { method: 'POST', headers: { 'API-Key': apiKey, 'API-Sign': sign, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (data?.error?.length) throw new Error(data.error.join(', '));
  const balances = Object.entries((data?.result || {}) as Record<string, string>)
    .filter(([, amount]) => positive(amount))
    .map(([raw, amount]) => ({ asset: krakenAsset(raw), amount, wallet: /\.(S|M|B|F)$/.test(raw) ? 'Earn' : 'Spot', priceUsd: STABLE.has(krakenAsset(raw)) ? 1 : undefined }));
  return { balances, errors: [] };
};

// ------------------------------------------------------------------------------------ Coinbase
// https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication
// CDP keys sign a short-lived JWT: ES256 for "EC PRIVATE KEY" secrets, EdDSA for Ed25519 ones.

const der = (tag: number, content: Uint8Array) => {
  const length = content.length < 128 ? [content.length] : content.length < 256 ? [0x81, content.length] : [0x82, content.length >> 8, content.length & 0xff];
  return new Uint8Array([tag, ...length, ...content]);
};

const coinbaseKey = async (secret: string): Promise<{ key: CryptoKey; alg: 'ES256' | 'EdDSA' }> => {
  const pem = secret.replace(/\\n/g, '\n').trim();
  if (pem.includes('BEGIN EC PRIVATE KEY')) {
    // SEC1 -> PKCS#8, which is what WebCrypto imports.
    const sec1 = fromBase64(pem.replace(/-----[^-]+-----/g, ''));
    const algorithm = der(0x30, new Uint8Array([...der(0x06, new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01])), ...der(0x06, new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]))]));
    const pkcs8 = der(0x30, new Uint8Array([0x02, 0x01, 0x00, ...algorithm, ...der(0x04, sec1)]));
    return { key: await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']), alg: 'ES256' };
  }
  if (pem.includes('BEGIN PRIVATE KEY')) {
    return { key: await crypto.subtle.importKey('pkcs8', fromBase64(pem.replace(/-----[^-]+-----/g, '')), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']), alg: 'ES256' };
  }
  // Ed25519: 64 bytes (seed + public key), base64. WebCrypto wants the 32-byte seed in PKCS#8.
  const raw = fromBase64(pem);
  const seed = raw.slice(0, 32);
  const pkcs8 = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20, ...seed]);
  return { key: await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']), alg: 'EdDSA' };
};

// A JWT for one request ("GET api.coinbase.com/path", no query string), valid for two minutes.
export const coinbaseJwt = async (keyName: string, secret: string, method: string, host: string, path: string) => {
  const { key, alg } = await coinbaseKey(secret);
  const now = Math.floor(Date.now() / 1000);
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const header = base64Url(JSON.stringify({ alg, kid: keyName, nonce, typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ sub: keyName, iss: 'cdp', nbf: now, exp: now + 120, uri: `${method} ${host}${path.split('?')[0]}` }));
  const signature = await crypto.subtle.sign(alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'Ed25519' }, key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(signature)}`;
};

const coinbase = async ({ apiKey, apiSecret }: ExchangeCredentials): Promise<ExchangeResult> => {
  // Fail fast, and clearly, on a key that isn't in a format Coinbase issues.
  await coinbaseKey(apiSecret).catch(() => {
    throw new Error('that private key could not be read - paste the whole key exactly as Coinbase showed it (for EC keys, including the BEGIN/END lines)');
  });
  const host = 'api.coinbase.com';
  const signed = async (path: string) =>
    call(`https://${host}${path}`, { headers: { Authorization: `Bearer ${await coinbaseJwt(apiKey, apiSecret, 'GET', host, path)}` } });
  // Public USD exchange rates: 1 USD = rate units of each currency.
  const rates = await call('https://api.coinbase.com/v2/exchange-rates?currency=USD').catch(() => null);
  const usdPer = (asset: string) => {
    const rate = Number(rates?.data?.rates?.[asset]);
    return rate > 0 ? 1 / rate : undefined;
  };
  const balances: ExchangeBalance[] = [];
  let cursor = '';
  for (let page = 0; page < 10; page += 1) {
    const data = await signed(`/api/v3/brokerage/accounts?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    (data?.accounts || []).forEach((account: { currency: string; available_balance?: { value: string }; hold?: { value: string } }) => {
      const amount = Number(account.available_balance?.value || 0) + Number(account.hold?.value || 0);
      if (amount > 0) balances.push({ asset: account.currency, amount: String(amount), wallet: 'Spot', priceUsd: STABLE.has(account.currency) ? 1 : usdPer(account.currency) });
    });
    if (!data?.has_next || !data?.cursor) break;
    cursor = data.cursor;
  }
  return { balances, errors: [] };
};

// ---------------------------------------------------------------------------------------- route

const READERS: Record<ExchangeId, (credentials: ExchangeCredentials) => Promise<ExchangeResult>> = { binance, coinbase, okx, bybit, kraken };

export const handleExchangeBalances = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return Response.json({ error: { message: 'Use POST.' } }, { status: 405 });
  const text = await request.text();
  if (text.length > 8000) return Response.json({ error: { message: 'Request too large.' } }, { status: 413 });
  let body: { exchange?: string } & Partial<ExchangeCredentials>;
  try { body = JSON.parse(text); } catch { return Response.json({ error: { message: 'Invalid JSON.' } }, { status: 400 }); }
  const reader = READERS[body.exchange as ExchangeId];
  if (!reader) return Response.json({ error: { message: 'Unsupported exchange.' } }, { status: 400 });
  if (!body.apiKey?.trim() || !body.apiSecret?.trim()) return Response.json({ error: { message: 'API key and secret are required.' } }, { status: 400 });
  try {
    const result = await reader({ apiKey: body.apiKey.trim(), apiSecret: body.apiSecret.trim(), passphrase: body.passphrase?.trim() || undefined });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // The exchange's message (bad key, IP not allowed, missing permission) - never the key itself.
    return Response.json({ error: { message: error instanceof Error ? error.message : 'The exchange could not be reached.' } }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
};
