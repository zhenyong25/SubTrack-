import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const parent = path.resolve(tmpdir());
const directory = mkdtempSync(path.join(parent, 'subtrack-card-market-'));
if (path.dirname(path.resolve(directory)) !== parent || !path.basename(directory).startsWith('subtrack-card-market-')) throw new Error('Unexpected test directory');
try {
  await build({ entryPoints: ['tests/creditCardMarket.test.ts', 'tests/cardFace.test.ts'], bundle: true, platform: 'node', format: 'esm', outdir: directory, outExtension: { '.js': '.mjs' } });
  process.exitCode = spawnSync(process.execPath, ['--test', path.join(directory, 'creditCardMarket.test.mjs'), path.join(directory, 'cardFace.test.mjs')], { stdio: 'inherit' }).status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
