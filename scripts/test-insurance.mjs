import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-insurance-'));
try {
  for (const name of ['insurance', 'insuranceInsights']) {
  const outfile = path.join(directory, `${name}.test.mjs`);
  await build({ entryPoints: [`tests/${name}.test.ts`], bundle: true, platform: 'node', format: 'esm', outfile, define: { 'import.meta.env': '{}' },
    // The importer loads the Hugging Face client lazily; these tests never call the model, so stub it out.
    plugins: [{ name: 'stub-hugging-face', setup(builder) { builder.onLoad({ filter: /[\\/]huggingFaceService\.ts$/ }, () => ({ loader: 'js', contents: 'export const extractPdfText = async () => ""; export const requestChatCompletion = async () => { throw new Error("not in tests"); };' })); } }] });
  const status = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' }).status ?? 1;
  if (status) process.exitCode = status;
  }
} finally { rmSync(directory, { recursive: true, force: true }); }
