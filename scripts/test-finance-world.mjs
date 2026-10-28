import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const parent = path.resolve(tmpdir());
const directory = mkdtempSync(path.join(parent, 'subtrack-world-'));
if (path.dirname(path.resolve(directory)) !== parent || !path.basename(directory).startsWith('subtrack-world-')) throw new Error('Unexpected test directory');
try {
  await build({ entryPoints: ['tests/financeWorld.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile: path.join(directory, 'tests.mjs') });
  const result = spawnSync(process.execPath, ['--test', path.join(directory, 'tests.mjs')], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
