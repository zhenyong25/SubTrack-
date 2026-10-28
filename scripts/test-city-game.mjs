import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-city-'));
try {
  const outfile = path.join(directory, 'city.test.mjs');
  await build({ entryPoints: ['tests/cityGame.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile });
  const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
