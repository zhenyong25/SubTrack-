import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-office-routine-'));
try {
  const outfile = path.join(directory, 'office-routine.test.mjs');
  await build({ entryPoints: ['./tests/officeRoutine.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile });
  process.exitCode = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' }).status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
