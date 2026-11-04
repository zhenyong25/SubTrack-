import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(tmpdir(), 'subtrack-city-'));
const suites = process.argv.includes('--rotation') ? ['cityRotation'] : process.argv.includes('--windows') ? ['cityWindows'] : process.argv.includes('--stops') ? ['cityStops'] : process.argv.includes('--incidents') ? ['cityIncidents'] : process.argv.includes('--upgrades') ? ['cityUpgrades'] : process.argv.includes('--ambience') ? ['cityAnimals', 'cityBillboards'] : process.argv.includes('--flights') ? ['cityFlights'] : process.argv.includes('--terrain') ? ['cityTerrain'] : process.argv.includes('--roadside') ? ['cityRoadside'] : process.argv.includes('--aviation') ? ['cityAviation'] : process.argv.includes('--animals') ? ['cityAnimals'] : process.argv.includes('--vehicles') ? ['cityVehicles'] : process.argv.includes('--boats') ? ['cityBoats'] : process.argv.includes('--activities') ? ['cityActivities', 'cityBoats'] : ['cityGame', 'cityExpansion', 'cityRecreation', 'cityMovement', 'cityTrafficFlow', 'cityActivities', 'cityBoats', 'cityVehicles', 'cityAnimals', 'cityAviation', 'cityRoadside', 'cityTerrain', 'cityFlights', 'cityBillboards', 'cityUpgrades', 'cityIncidents', 'cityStops', 'cityWindows', 'cityRotation'];
try {
  await build({ entryPoints: suites.map(name => `tests/${name}.test.ts`), bundle: true, platform: 'node', format: 'esm', outdir: directory, outExtension: { '.js': '.mjs' } });
  const result = spawnSync(process.execPath, ['--test', ...suites.map(name => path.join(directory, `${name}.test.mjs`))], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
