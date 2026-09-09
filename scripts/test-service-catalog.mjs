import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-catalog-tests-'));
try {
  const outfile = path.join(directory, 'catalog.test.mjs');
  await build({
    entryPoints: ['tests/service-catalog.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile,
    define: { 'import.meta.env': JSON.stringify({ VITE_LOGO_DEV_PUBLISHABLE_KEY: 'pk_test_only', VITE_SUPABASE_URL: 'https://catalog-test.invalid' }) },
    plugins: [{ name: 'catalog-test-client', setup(builder) {
      builder.onLoad({ filter: /[\\/]appDataService\.ts$/ }, () => ({
        contents: 'export const getSupabaseClient = () => globalThis.__catalogClient;', loader: 'js',
      }));
    } }],
  });
  const persistenceFile = path.join(directory, 'persistence.test.mjs');
  await build({
    entryPoints: ['tests/subscription-service-persistence.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: persistenceFile,
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://test.invalid', VITE_SUPABASE_ANON_KEY: 'test-only' }) },
    plugins: [{ name: 'fake-supabase', setup(builder) {
      builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'fake-client', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
        contents: `export const createClient = () => ({
          auth: { getSession: async () => ({ data: { session: { user: { id: 'test-user' } } }, error: null }) },
          from: table => globalThis.__subscriptionFake.from(table)
        });`, loader: 'js',
      }));
    } }],
  });
  const result = spawnSync(process.execPath, ['--test', outfile, persistenceFile], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  // This exact directory was allocated above by mkdtemp; never remove a computed workspace path.
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('subtrack-catalog-tests-')) throw new Error('Unexpected temporary test directory');
  rmSync(directory, { recursive: true, force: true });
}
