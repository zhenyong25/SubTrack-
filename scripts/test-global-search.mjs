import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const testParent = path.resolve(tmpdir());
const directory = mkdtempSync(path.join(testParent, 'subtrack-global-search-'));
if (path.dirname(path.resolve(directory)) !== testParent || !path.basename(directory).startsWith('subtrack-global-search-')) throw new Error('Unexpected temporary test directory');
try {
  const outfile = path.join(directory, 'search.test.mjs');
  await build({ entryPoints: ['tests/global-search.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile });
  const persistence = path.join(directory, 'persistence.test.mjs');
  await build({ entryPoints: ['tests/global-search-persistence.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: persistence, define: { 'import.meta.env': '{}' } });
  const cloud = path.join(directory, 'cloud.test.mjs');
  await build({ entryPoints: ['tests/global-search-cloud.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: cloud,
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://test.invalid', VITE_SUPABASE_ANON_KEY: 'test-key' }) },
    plugins: [{ name: 'mock-tag-database', setup(builder) {
      builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'mock', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const createClient = () => ({ auth: { getSession: async () => ({ data: { session: globalThis.__tagSession() ? { user: { id: globalThis.__tagSession() } } : null } }), getUser: async () => ({ data: { user: null } }) }, from: table => globalThis.__tagDatabase.from(table) });', loader: 'js' }));
    } }],
  });
  const result = spawnSync(process.execPath, ['--test', outfile, persistence, cloud], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
