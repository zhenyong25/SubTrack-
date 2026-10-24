import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const parent = path.resolve(tmpdir());
const directory = mkdtempSync(path.join(parent, 'subtrack-goals-'));
if (path.dirname(path.resolve(directory)) !== parent || !path.basename(directory).startsWith('subtrack-goals-')) throw new Error('Unexpected test directory');
try {
  const math = path.join(directory, 'math.test.mjs'); const storage = path.join(directory, 'storage.test.mjs');
  await build({ entryPoints: ['tests/savings-goals.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: math });
  await build({ entryPoints: ['tests/savings-goals-persistence.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: storage,
    plugins: [{ name: 'fake-goal-session', setup(builder) { builder.onLoad({ filter: /[\\/]appDataService\.ts$/ }, () => ({ loader: 'js', contents: 'export const isSupabaseConfigured = () => Boolean(globalThis.__goalCloud); export const getSupabaseClient = () => globalThis.__goalClient; export const getSupabaseSession = async () => globalThis.__goalUser ? { user: { id: globalThis.__goalUser } } : null;' })); } }],
  });
  process.exitCode = spawnSync(process.execPath, ['--test', math, storage], { stdio: 'inherit' }).status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
