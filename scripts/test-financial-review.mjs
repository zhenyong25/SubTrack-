import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const parent=path.resolve(tmpdir()); const directory=mkdtempSync(path.join(parent,'subtrack-review-'));
if(path.dirname(path.resolve(directory))!==parent||!path.basename(directory).startsWith('subtrack-review-'))throw new Error('Unexpected test directory');
try{const outfile=path.join(directory,'review.test.mjs');await build({entryPoints:['tests/financial-review.test.ts'],bundle:true,platform:'node',format:'esm',outfile});process.exitCode=spawnSync(process.execPath,['--test',outfile],{stdio:'inherit'}).status??1;}finally{rmSync(directory,{recursive:true,force:true});}
