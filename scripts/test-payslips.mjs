import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-payslips-'));
try {
  const outfile = path.join(directory, 'payslips.test.mjs');
  await build({ entryPoints: ['./tests/payslips.test.ts'], bundle: true, platform: 'node', format: 'esm', outfile,
    plugins: [{ name: 'mock-storage', setup(build) {
      build.onResolve({ filter: /\/appDataService$/ }, () => ({ path: path.resolve('tests/payslipStorageMock.ts') }));
    } }],
  });
  process.exitCode = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' }).status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
