import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const parent = path.resolve(tmpdir()); const directory = mkdtempSync(path.join(parent, 'subtrack-import-'));
if (path.dirname(path.resolve(directory)) !== parent || !path.basename(directory).startsWith('subtrack-import-')) throw new Error('Unexpected test directory');
try {
  await build({ entryPoints: ['tests/statement-csv.test.ts','tests/statement-import-persistence.test.ts'], bundle: true, platform: 'node', format: 'esm', outdir: directory, outExtension:{'.js':'.mjs'}, plugins:[{name:'fake-import-session',setup(builder){builder.onLoad({filter:/[\\/]appDataService\.ts$/},()=>({loader:'js',contents:'export const isSupabaseConfigured=()=>Boolean(globalThis.__importCloud);export const getSupabaseClient=()=>globalThis.__importClient;export const getSupabaseSession=async()=>globalThis.__importUser?{user:{id:globalThis.__importUser}}:null;'}));}}] });
  process.exitCode=spawnSync(process.execPath,['--test',path.join(directory,'statement-csv.test.mjs'),path.join(directory,'statement-import-persistence.test.mjs')],{stdio:'inherit'}).status??1;
} finally {rmSync(directory,{recursive:true,force:true});}
