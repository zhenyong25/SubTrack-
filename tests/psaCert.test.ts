import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePsaCert, parsePsaCert, titleCase } from '../server/psaCert';

test('reads an English slab label into tracker fields', () => {
  const slab = parsePsaCert({ CertNumber: '118141547', Year: '2023', Brand: 'POKEMON SV PROMO', Subject: 'CHARIZARD EX', CardNumber: '056', CardGrade: 'GEM MT 10', Variety: 'BLACK STAR', TotalPopulation: 1234 }, '118141547');
  assert.equal(slab.name, 'Charizard EX');
  assert.equal(slab.set, 'SV Promo');
  assert.equal(slab.language, 'English');
  assert.equal(slab.grade, 10);
  assert.equal(slab.number, '056');
  assert.equal(slab.population, 1234);
  assert.equal(slab.url, 'https://www.psacard.com/cert/118141547');
});

test('takes the language out of the brand and keeps half grades whole', () => {
  const japanese = parsePsaCert({ Brand: 'POKEMON JAPANESE SV4a-SHINY TREASURE EX', Subject: 'PIKACHU', CardGrade: 'NM-MT 8.5' }, '12345678');
  assert.equal(japanese.language, 'Japanese');
  assert.equal(japanese.set, 'SV4A-Shiny Treasure EX');
  assert.equal(japanese.grade, 8);
  const chinese = parsePsaCert({ Brand: 'POKEMON SIMPLIFIED CHINESE GEM PACK', Subject: 'EEVEE', CardGrade: 'MINT 9' }, '12345678');
  assert.equal(chinese.language, 'Simplified Chinese');
  assert.equal(chinese.set, 'Gem Pack');
  assert.equal(parsePsaCert({ Brand: 'POKEMON', Subject: 'X', CardGrade: 'AUTHENTIC' }, '12345678').grade, null);
});

test('title-cases PSA upper case without breaking card codes', () => {
  assert.equal(titleCase("MEWTWO VSTAR"), 'Mewtwo VSTAR');
  assert.equal(titleCase("FA/LUGIA V-ALT ART"), 'Fa/Lugia V-Alt Art');
  assert.equal(titleCase('SWSH284'), 'SWSH284');
});

test('rejects malformed certificate numbers before calling PSA', async () => {
  const response = await handlePsaCert(new Request('http://x/api/pokemon/psa-cert?cert=12ab'));
  assert.equal(response.status, 400);
});

test('explains a used-up PSA quota and a missing certificate', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('quota', { status: 429 });
    const limited = await handlePsaCert(new Request('http://x/?cert=99999991'));
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).error, /PSA_API_TOKEN/);
    globalThis.fetch = async () => Response.json({ IsValidRequest: true, ServerMessage: 'No data found' });
    assert.equal((await handlePsaCert(new Request('http://x/?cert=99999992'))).status, 404);
    let auth = '';
    globalThis.fetch = async (_url, init) => { auth = new Headers(init?.headers).get('Authorization') || ''; return Response.json({ PSACert: { Subject: 'MEW', Brand: 'POKEMON', CardGrade: 'GEM MT 10' } }); };
    const found = await handlePsaCert(new Request('http://x/?cert=99999993'), 'secret');
    assert.equal(auth, 'bearer secret');
    assert.equal((await found.json()).grade, 10);
  } finally { globalThis.fetch = realFetch; }
});

test('says when PSA has not approved the account, and trims the token', async () => {
  const realFetch = globalThis.fetch;
  try {
    let auth = '';
    globalThis.fetch = async (_url, init) => { auth = new Headers(init?.headers).get('Authorization') || ''; return Response.json({ Message: 'Access to this API is limited to approved customers.' }, { status: 403 }); };
    const refused = await handlePsaCert(new Request('http://x/?cert=99999994'), ' secret\r\n');
    assert.equal(auth, 'bearer secret');
    assert.equal(refused.status, 502);
    assert.match((await refused.json()).error, /approved/);
  } finally { globalThis.fetch = realFetch; }
});
