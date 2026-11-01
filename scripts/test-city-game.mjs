import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-city-'));
try {
  await build({ entryPoints: ['tests/cityGame.test.ts', 'tests/cityExpansion.test.ts', 'tests/cityRecreation.test.ts', 'tests/cityMovement.test.ts', 'tests/cityTrafficFlow.test.ts'], bundle: true, platform: 'node', format: 'esm', outdir: directory, outExtension: { '.js': '.mjs' } });
  const result = spawnSync(process.execPath, ['--test', path.join(directory, 'cityGame.test.mjs'), path.join(directory, 'cityExpansion.test.mjs'), path.join(directory, 'cityRecreation.test.mjs'), path.join(directory, 'cityMovement.test.mjs'), path.join(directory, 'cityTrafficFlow.test.mjs')], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
