import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { binanceSignature, bybitSignature, coinbaseJwt, krakenAsset, krakenSignature, okxSignature, handleExchangeBalances } from '../server/cryptoExchanges';

test('Binance: matches the signed-request example in Binance\'s API docs', async () => {
  const secret = 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j';
  const query = 'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559';
  assert.equal(await binanceSignature(query, secret), 'c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71');
});

test('Kraken: matches the API-Sign example in Kraken\'s docs', async () => {
  const secret = 'kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==';
  const body = 'nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25';
  assert.equal(await krakenSignature('/0/private/AddOrder', '1616492376594', body, secret), '4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==');
});

test('Kraken asset codes read as the usual tickers', () => {
  assert.equal(krakenAsset('XXBT'), 'BTC');
  assert.equal(krakenAsset('XETH'), 'ETH');
  assert.equal(krakenAsset('XXDG'), 'DOGE');
  assert.equal(krakenAsset('ZUSD'), 'USD');
  assert.equal(krakenAsset('USDT'), 'USDT');
  assert.equal(krakenAsset('DOT.S'), 'DOT');
  assert.equal(krakenAsset('SOL.F'), 'SOL');
});

test('OKX and Bybit: same strings and HMACs as their documented formulas', async () => {
  const secret = 'test-secret';
  const okxExpected = createHmac('sha256', secret).update('2026-10-25T08:00:00.000ZGET/api/v5/account/balance').digest('base64');
  assert.equal(await okxSignature('2026-10-25T08:00:00.000Z', 'GET', '/api/v5/account/balance', '', secret), okxExpected);
  const bybitExpected = createHmac('sha256', secret).update('1700000000000my-key10000accountType=UNIFIED').digest('hex');
  assert.equal(await bybitSignature('1700000000000', 'my-key', '10000', 'accountType=UNIFIED', secret), bybitExpected);
});

const decodeJwt = (jwt: string) => {
  const [header, payload, signature] = jwt.split('.');
  const json = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  return { header: json(header), payload: json(payload), signed: `${header}.${payload}`, signature: Buffer.from(signature, 'base64url') };
};

test('Coinbase: ES256 JWT from an "EC PRIVATE KEY" verifies with the matching public key', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'sec1', format: 'pem' }).toString();
  const keyName = 'organizations/org-1/apiKeys/key-1';
  const jwt = decodeJwt(await coinbaseJwt(keyName, pem.replace(/\n/g, '\\n'), 'GET', 'api.coinbase.com', '/api/v3/brokerage/accounts?limit=250'));
  assert.equal(jwt.header.alg, 'ES256');
  assert.equal(jwt.header.kid, keyName);
  assert.equal(jwt.payload.sub, keyName);
  assert.equal(jwt.payload.iss, 'cdp');
  assert.equal(jwt.payload.uri, 'GET api.coinbase.com/api/v3/brokerage/accounts');
  assert.equal(jwt.payload.exp - jwt.payload.nbf, 120);
  assert.ok(verify('sha256', Buffer.from(jwt.signed), { key: publicKey, dsaEncoding: 'ieee-p1363' }, jwt.signature));
});

test('Coinbase: EdDSA JWT from an Ed25519 secret (seed + public key, base64) verifies', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const seed = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const pub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const secret = Buffer.concat([seed, pub]).toString('base64');
  const jwt = decodeJwt(await coinbaseJwt('key-uuid', secret, 'GET', 'api.coinbase.com', '/api/v3/brokerage/accounts'));
  assert.equal(jwt.header.alg, 'EdDSA');
  assert.ok(verify(null, Buffer.from(jwt.signed), publicKey, jwt.signature));
});

test('route: rejects bad requests without calling out', async () => {
  const post = (body: unknown) => handleExchangeBalances(new Request('http://x/api/crypto/exchange', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal((await handleExchangeBalances(new Request('http://x/api/crypto/exchange'))).status, 405);
  assert.equal((await post({ exchange: 'ftx', apiKey: 'a', apiSecret: 'b' })).status, 400);
  assert.equal((await post({ exchange: 'binance', apiKey: '', apiSecret: 'b' })).status, 400);
  const tooBig = await handleExchangeBalances(new Request('http://x', { method: 'POST', body: 'x'.repeat(9000) }));
  assert.equal(tooBig.status, 413);
});
