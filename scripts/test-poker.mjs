import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const parent = path.resolve(tmpdir());
const directory = mkdtempSync(path.join(parent, 'subtrack-poker-'));
if (path.dirname(path.resolve(directory)) !== parent || !path.basename(directory).startsWith('subtrack-poker-')) throw new Error('Unexpected test directory');
try {
  await build({ entryPoints: ['tests/poker.test.ts', 'tests/poker-dashboard.test.ts'], bundle: true, platform: 'node', format: 'esm', outdir: directory, outExtension: { '.js': '.mjs' } });
  const result = spawnSync(process.execPath, ['--test', path.join(directory, 'poker.test.mjs'), path.join(directory, 'poker-dashboard.test.mjs')], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
