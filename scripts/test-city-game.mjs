import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-city-'));
try {
  await build({ entryPoints: ['tests/cityGame.test.ts', 'tests/cityExpansion.test.ts'], bundle: true, platform: 'node', format: 'esm', outdir: directory, outExtension: { '.js': '.mjs' } });
  const result = spawnSync(process.execPath, ['--test', path.join(directory, 'cityGame.test.mjs'), path.join(directory, 'cityExpansion.test.mjs')], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
