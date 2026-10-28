import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const parent = path.resolve(tmpdir());
const directory = mkdtempSync(path.join(parent, 'subtrack-crypto-'));
if (path.dirname(path.resolve(directory)) !== parent || !path.basename(directory).startsWith('subtrack-crypto-')) throw new Error('Unexpected test directory');
try {
  await build({ entryPoints: ['tests/cryptoPortfolio.test.ts', 'tests/cryptoExchanges.test.ts', 'tests/airdropInsights.test.ts', 'tests/cryptoMarket.test.ts'], bundle: true, platform: 'node', format: 'esm', outdir: directory, outExtension: { '.js': '.mjs' } });
  const result = spawnSync(process.execPath, ['--test', path.join(directory, 'cryptoPortfolio.test.mjs'), path.join(directory, 'cryptoExchanges.test.mjs'), path.join(directory, 'airdropInsights.test.mjs'), path.join(directory, 'cryptoMarket.test.mjs')], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
