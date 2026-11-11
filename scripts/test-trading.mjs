import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-trading-'));
try {
  const outfiles = [];
  for (const name of ['trading', 'candlestickPatterns', 'tradeMarkers']) {
    const outfile = path.join(directory, `${name}.test.mjs`);
    await build({ entryPoints: [`tests/${name}.test.ts`], bundle: true, platform: 'node', format: 'esm', outfile });
    outfiles.push(outfile);
  }
  const result = spawnSync(process.execPath, ['--test', ...outfiles], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
