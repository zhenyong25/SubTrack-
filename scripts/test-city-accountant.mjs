import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-city-accountant-'));
try {
  const outfile = path.join(directory, 'city-accountant.test.mjs');
  await build({ entryPoints: ['./tests/cityAccountant.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile });
  process.exitCode = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' }).status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
