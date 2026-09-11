import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Bundle with an in-memory client so these checks cannot touch live account data.
const loadService = async (remote) => {
  const result = await build({
    stdin: { contents: "export { deleteInvestmentTransaction } from './services/appDataService';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm',
    define: { 'import.meta.env': JSON.stringify(remote ? { VITE_SUPABASE_URL: 'https://test.invalid', VITE_SUPABASE_ANON_KEY: 'test-only' } : {}) },
    plugins: [{ name: 'fake-supabase', setup(builder) {
      builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'fake-client', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const createClient = () => globalThis.__investmentClient;', loader: 'js' }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const key = 'subtrack_investment_transactions_v1';
const seed = () => localStorage.setItem(key, JSON.stringify([{ id: 'first' }, { id: 'second' }]));
const read = () => JSON.parse(localStorage.getItem(key));
const local = await loadService(false);
seed();
await local.deleteInvestmentTransaction('first');
assert.deepEqual(read(), [{ id: 'second' }]);
await local.deleteInvestmentTransaction('second');
assert.deepEqual(read(), [], 'Deleting the final entry must persist an empty list');

let signedIn = true;
let failure = false;
let missing = false;
let filters;
globalThis.__investmentClient = {
  auth: { getSession: async () => ({ data: { session: signedIn ? { user: { id: 'test-user' } } : null }, error: null }) },
  from(table) {
    assert.equal(table, 'investment_transactions');
    filters = {};
    return {
      delete() { return this; },
      eq(column, value) { filters[column] = value; return this; },
      async select() { return { data: missing ? [] : [{ id: filters.id }], error: failure ? { message: 'Denied' } : null }; },
    };
  },
};
const remote = await loadService(true);
seed();
await remote.deleteInvestmentTransaction('first');
assert.deepEqual(filters, { user_id: 'test-user', id: 'first' });
assert.deepEqual(read(), [{ id: 'second' }]);
await remote.deleteInvestmentTransaction('second');
assert.deepEqual(read(), []);
for (const scenario of ['failure', 'missing', 'signed-out']) {
  seed();
  failure = scenario === 'failure';
  missing = scenario === 'missing';
  signedIn = scenario !== 'signed-out';
  await assert.rejects(() => remote.deleteInvestmentTransaction('first'));
  assert.deepEqual(read(), [{ id: 'first' }, { id: 'second' }], `${scenario} must preserve local entries`);
}
console.log('Investment deletion checks passed: local, remote, final entry, scoped deletion, and failure preservation.');
