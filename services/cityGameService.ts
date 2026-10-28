// My City: a city builder that grows with money habits. Pure rules - no storage, no rendering -
// so everything here is testable. Coins come from daily missions (recording real activity) and
// from buildings producing over time; they're spent on roads, buildings and land.
// Coins have no cash value, and nothing rewards how much is spent, earned or traded.

import type { Expense, Income, SavingsEntry } from '../types';
import { parseAccountantReport, type AccountantReport } from './cityAccountantService';
import { FIX_REWARD, fixedSince, parseAgentRecords, type AgentId, type AgentRecord, type AgentReport } from './cityAgents';
import { parseWorld, QUEST_REWARDS, worldStats, worldWeek, type QuestId } from './financeWorldService';

export const CITY_PREFIX = 'subtrack_city_v1:';
export const MAP = 100; // tiles per side
export const CHUNK = 10; // land is bought in 10×10 plots
export const CHUNKS = MAP / CHUNK;
export const INCOME_CAP_HOURS = 8; // buildings stop filling after this long - visit to collect
export const STARTING_COINS = 300;
export const ROAD_COST = 5;
export const ROAD_REFUND = 2;

// ---------------------------------------------------------------------------------------------
// Terrain: the same island for everyone - a coastline, a river and a lake - from seeded noise.

export type Terrain = 'water' | 'sand' | 'grass';

const hash = (x: number, z: number) => {
  let h = Math.imul(x * 374761393 + z * 668265263, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const valueNoise = (x: number, z: number) => {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = smooth(x - x0), tz = smooth(z - z0);
  const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
};
const fbm = (x: number, z: number) => valueNoise(x / 14, z / 14) * 0.6 + valueNoise(x / 6, z / 6) * 0.3 + valueNoise(x / 3, z / 3) * 0.1;

let terrainCache: Terrain[] | null = null;
export const terrainMap = (): Terrain[] => {
  if (terrainCache) return terrainCache;
  const tiles: Terrain[] = new Array(MAP * MAP);
  const center = MAP / 2;
  for (let z = 0; z < MAP; z += 1) {
    for (let x = 0; x < MAP; x += 1) {
      const d = Math.hypot(x + 0.5 - center, z + 0.5 - center) / center;
      const shore = 0.82 + (fbm(x, z) - 0.5) * 0.28;
      const riverX = 27 + Math.sin(z / 9) * 5 + Math.sin(z / 23) * 4;
      const river = Math.abs(x - riverX) < 1.6 && z > 8 && z < 94;
      const lake = Math.hypot(x - 73, z - 28) < 6.5 + (fbm(x + 40, z) - 0.5) * 3;
      const start = Math.abs(x + 0.5 - center) < 13 && Math.abs(z + 0.5 - center) < 13; // the first plots are always solid ground
      let terrain: Terrain = d > shore || river || lake ? 'water' : d > shore - 0.035 ? 'sand' : 'grass';
      if (!start && terrain === 'grass' && (Math.abs(x - riverX) < 2.6 || Math.hypot(x - 73, z - 28) < 8)) terrain = 'sand';
      if (start) terrain = 'grass';
      tiles[z * MAP + x] = terrain;
    }
  }
  terrainCache = tiles;
  return tiles;
};
export const terrainAt = (x: number, z: number): Terrain => (x < 0 || z < 0 || x >= MAP || z >= MAP ? 'water' : terrainMap()[z * MAP + x]);
export const tileIndex = (x: number, z: number) => z * MAP + x;
export const tileXZ = (index: number) => ({ x: index % MAP, z: Math.floor(index / MAP) });
export const chunkOf = (x: number, z: number) => Math.floor(z / CHUNK) * CHUNKS + Math.floor(x / CHUNK);

// Wild trees: scattered on grass and thick in forests, the same for everyone. Cutting them
// down - or building over them - pays TIMBER_COINS a tree.
export const TIMBER_COINS = 4;
const fract = (value: number) => value - Math.floor(value);
export const treeSeed = (x: number, z: number) => fract(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
export const isForest = (x: number, z: number) => Math.sin(x * 0.18) + Math.cos(z * 0.21) + Math.sin((x - z) * 0.07) > 0.9;
export const wildTrees = (x: number, z: number) => {
  if (terrainAt(x, z) !== 'grass' || isHallTile(x, z)) return 0;
  const h = treeSeed(x, z);
  const forest = isForest(x, z);
  if (h > (forest ? 0.6 : 0.14)) return 0;
  return forest && h < 0.25 ? 2 : 1;
};
export const treesAt = (state: Pick<CityState, 'cleared' | 'roads'>, x: number, z: number) => {
  const index = tileIndex(x, z);
  return state.cleared.includes(index) || state.roads.includes(index) ? 0 : wildTrees(x, z);
};
// Clears wild trees from tiles and pays for the timber.
const harvest = (state: CityState, tiles: number[]): CityState => {
  const cleared = new Set(state.cleared);
  let timber = 0;
  tiles.forEach(index => {
    if (cleared.has(index)) return;
    const { x, z } = tileXZ(index);
    const count = wildTrees(x, z);
    if (count === 0) return;
    timber += count * TIMBER_COINS;
    cleared.add(index);
  });
  return timber === 0 ? state : { ...earn(state, timber, 0), cleared: [...cleared].sort((a, b) => a - b) };
};

// ---------------------------------------------------------------------------------------------
// Buildings

export type BuildingCategory = 'homes' | 'business' | 'industry' | 'utilities' | 'services' | 'advisors';

export interface BuildingType {
  id: string;
  name: string;
  category: BuildingCategory;
  size: 1 | 2;
  cost: number;
  unlock: number; // city level
  income: number; // coins per hour at level 1, before staffing, utilities and happiness
  residents?: number;
  jobs?: number;
  happiness?: number;
  power?: number; // used
  water?: number; // used
  powerSupply?: number;
  waterSupply?: number;
  noRoad?: boolean; // greenery works without a road
  coastal?: boolean; // must touch water
  description: string;
}

export const BUILDINGS: BuildingType[] = [
  { id: 'cottage', name: 'Cottage', category: 'homes', size: 1, cost: 40, unlock: 1, income: 2, residents: 6, power: 1, water: 1, description: 'A small family home.' },
  { id: 'townhouse', name: 'Townhouse', category: 'homes', size: 1, cost: 110, unlock: 3, income: 4, residents: 14, power: 2, water: 2, description: 'Terraced homes - more residents per tile.' },
  { id: 'apartment', name: 'Apartments', category: 'homes', size: 2, cost: 380, unlock: 6, income: 10, residents: 60, power: 6, water: 6, description: 'A mid-rise block for a growing town.' },
  { id: 'tower', name: 'Residential tower', category: 'homes', size: 2, cost: 900, unlock: 10, income: 22, residents: 150, power: 14, water: 14, description: 'High-rise living with a view.' },
  { id: 'cafe', name: 'Café', category: 'business', size: 1, cost: 60, unlock: 1, income: 10, jobs: 4, power: 1, water: 1, description: 'Coffee and coins.' },
  { id: 'shop', name: 'Corner shop', category: 'business', size: 1, cost: 100, unlock: 2, income: 15, jobs: 6, power: 2, water: 1, description: 'Everyday groceries.' },
  { id: 'market', name: 'Market hall', category: 'business', size: 2, cost: 260, unlock: 4, income: 42, jobs: 16, power: 4, water: 3, description: 'A covered market.' },
  { id: 'office', name: 'Office block', category: 'business', size: 2, cost: 600, unlock: 7, income: 95, jobs: 40, power: 10, water: 4, description: 'Glass and steel - lots of jobs.' },
  { id: 'bank', name: 'Bank', category: 'business', size: 2, cost: 850, unlock: 9, income: 130, jobs: 30, power: 8, water: 3, description: 'Where the city keeps its savings.' },
  { id: 'workshop', name: 'Workshop', category: 'industry', size: 1, cost: 180, unlock: 3, income: 24, jobs: 10, happiness: -3, power: 3, water: 2, description: 'Productive but noisy.' },
  { id: 'factory', name: 'Factory', category: 'industry', size: 2, cost: 520, unlock: 6, income: 85, jobs: 40, happiness: -10, power: 12, water: 8, description: 'Big output, big smoke.' },
  { id: 'powerplant', name: 'Power plant', category: 'utilities', size: 2, cost: 160, unlock: 1, income: 0, jobs: 6, happiness: -6, powerSupply: 60, water: 1, description: 'Electricity for 60 units of demand.' },
  { id: 'windmill', name: 'Wind turbine', category: 'utilities', size: 1, cost: 220, unlock: 4, income: 0, happiness: 1, powerSupply: 18, description: 'Clean power from the sea breeze.' },
  { id: 'solar', name: 'Solar farm', category: 'utilities', size: 2, cost: 400, unlock: 5, income: 0, happiness: 2, powerSupply: 50, description: 'Quiet, clean electricity.' },
  { id: 'watertower', name: 'Water tower', category: 'utilities', size: 1, cost: 90, unlock: 1, income: 0, jobs: 2, power: 1, waterSupply: 40, description: 'Fresh water for 40 units of demand.' },
  { id: 'pump', name: 'Pumping station', category: 'utilities', size: 2, cost: 360, unlock: 6, income: 0, jobs: 6, power: 4, waterSupply: 150, description: 'Water for a whole district.' },
  { id: 'tree', name: 'Trees', category: 'services', size: 1, cost: 15, unlock: 1, income: 0, happiness: 2, noRoad: true, description: 'A little shade. Happier residents earn more.' },
  { id: 'park', name: 'Park', category: 'services', size: 1, cost: 70, unlock: 2, income: 0, happiness: 6, noRoad: true, description: 'Lawns and benches for everyone.' },
  { id: 'fountain', name: 'Plaza fountain', category: 'services', size: 1, cost: 150, unlock: 4, income: 0, happiness: 10, noRoad: true, description: 'The heart of a town square.' },
  { id: 'school', name: 'School', category: 'services', size: 2, cost: 450, unlock: 5, income: 0, jobs: 12, happiness: 16, power: 3, water: 2, description: 'Families love a good school.' },
  { id: 'clinic', name: 'Clinic', category: 'services', size: 2, cost: 600, unlock: 7, income: 0, jobs: 14, happiness: 18, power: 4, water: 3, description: 'Health care close to home.' },
  // Advisor buildings: each is the workplace of a resident who reviews part of your money (services/cityAgents.ts).
  { id: 'postoffice', name: 'Post Office', category: 'advisors', size: 1, cost: 120, unlock: 2, income: 4, jobs: 3, happiness: 3, power: 1, water: 1, description: 'Your Subscription Auditor works here - finds overlaps, trials about to charge and stale renewals.' },
  { id: 'vault', name: 'Savings Vault', category: 'advisors', size: 1, cost: 140, unlock: 2, income: 4, jobs: 2, happiness: 3, power: 1, water: 1, description: 'Your Savings Coach works here - keeps every goal on track with a monthly amount.' },
  { id: 'creditunion', name: 'Credit Union', category: 'advisors', size: 1, cost: 160, unlock: 3, income: 5, jobs: 3, happiness: 2, power: 1, water: 1, description: 'Your Debt Advisor works here - what to pay off first, and how much sooner you could be free.' },
  { id: 'lighthouse', name: 'Lighthouse', category: 'services', size: 1, cost: 500, unlock: 8, income: 15, happiness: 10, power: 1, coastal: true, noRoad: true, description: 'Guides ships - and visitors. Build it by the water.' },
];

export const HALL = { id: 'hall', name: 'Town Hall', x: 49, z: 49, size: 2, income: 6, happiness: 5, powerSupply: 10, waterSupply: 10 } as const;
export const MAX_BUILDING_LEVEL = 3;
const LEVEL_MULTIPLIER = [0, 1, 1.7, 2.6];
const UPGRADE_COST_FACTOR = [0, 0, 1.5, 2.5];

// Cumulative XP per city level (index = level).
export const LEVEL_XP = [0, 0, 80, 200, 380, 620, 920, 1300, 1760, 2300, 3000, 3800, 4800, 6000, 7500, 9300];
export const MAX_LEVEL = LEVEL_XP.length - 1;
export const START_CHUNKS = [44, 45, 54, 55];
export const maxChunks = (level: number) => START_CHUNKS.length + (level - 1) * 3;

export interface PlacedBuilding {
  id: string;
  type: string;
  x: number; // north-west tile of its footprint
  z: number;
  level: number;
  collectedAt: number; // ms; production since then is waiting to be collected
}

export interface CityState {
  accountantReport?: AccountantReport;
  agents?: Partial<Record<AgentId, AgentRecord>>; // each advisor's latest report and the fixes already rewarded
  version: 2;
  coins: number;
  xp: number;
  buildings: PlacedBuilding[];
  roads: number[]; // tile indexes
  lights: number[]; // road tiles with a street light
  cleared: number[]; // tiles whose wild trees were cut down
  chunks: number[]; // owned 10×10 plots
  hallCollectedAt: number;
  daily: { day: string; claimed: string[]; collected: boolean; built: boolean };
  weekly: Array<{ week: string; quest: QuestId }>;
  lifetimeCoins: number;
  updatedAt: number;
}

export const getBuilding = (type: string) => BUILDINGS.find(item => item.id === type);

export const levelForXp = (xp: number) => {
  let level = 1;
  while (level < MAX_LEVEL && xp >= LEVEL_XP[level + 1]) level += 1;
  return level;
};

export const levelProgress = (xp: number) => {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, current: 1, needed: 1, ratio: 1 };
  const current = xp - LEVEL_XP[level];
  const needed = LEVEL_XP[level + 1] - LEVEL_XP[level];
  return { level, current, needed, ratio: current / needed };
};

// A starter street grid: a ring around the Town Hall and two avenues through it.
export const starterRoads = () => {
  const roads = new Set<number>();
  for (let i = 48; i <= 51; i += 1) { roads.add(tileIndex(i, 48)); roads.add(tileIndex(i, 51)); roads.add(tileIndex(48, i)); roads.add(tileIndex(51, i)); }
  for (let i = 41; i <= 58; i += 1) { roads.add(tileIndex(i, 51)); roads.add(tileIndex(51, i)); }
  [48, 51].forEach(z => [48, 51].forEach(x => roads.add(tileIndex(x, z))));
  // The hall itself sits inside the ring.
  for (let x = HALL.x; x < HALL.x + HALL.size; x += 1) for (let z = HALL.z; z < HALL.z + HALL.size; z += 1) roads.delete(tileIndex(x, z));
  return [...roads].sort((a, b) => a - b);
};

export const newCity = (now: number, today: string): CityState => ({
  version: 2,
  coins: STARTING_COINS,
  xp: 0,
  buildings: [],
  roads: starterRoads(),
  lights: [],
  cleared: [],
  chunks: [...START_CHUNKS],
  hallCollectedAt: now,
  daily: { day: today, claimed: [], collected: false, built: false },
  weekly: [],
  lifetimeCoins: 0,
  updatedAt: now,
});

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// What everything cost, so a version-1 city (the small island grid) can be refunded in full.
const V1_COSTS: Record<string, number> = { cottage: 40, townhouse: 120, apartment: 320, cafe: 60, market: 150, workshop: 220, bank: 450, tree: 15, park: 80, fountain: 160, windmill: 260, lighthouse: 600 };
const v1Spent = (building: { type: string; level: number }) => {
  const cost = V1_COSTS[building.type] || 0;
  return cost + (building.level >= 2 ? Math.round(cost * 1.5) : 0) + (building.level >= 3 ? Math.round(cost * 2.5) : 0);
};

// A saved city that doesn't look right is refused rather than silently reset.
export const parseCity = (raw: string | null): CityState | null => {
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (!data || ![1, 2].includes(data.version) || !finite(data.coins) || !finite(data.xp) || !Array.isArray(data.buildings) || !finite(data.hallCollectedAt) || !data.daily || !isDay(data.daily.day) || !Array.isArray(data.weekly)) {
    throw new Error('Your saved city could not be read. It has not been overwritten.');
  }
  const accountantReport = parseAccountantReport(data.accountantReport);
  const base = {
    ...(accountantReport ? { accountantReport } : {}),
    ...(data.agents ? { agents: parseAgentRecords(data.agents) } : {}),
    xp: Math.max(0, Math.floor(data.xp)),
    hallCollectedAt: data.hallCollectedAt,
    daily: { day: data.daily.day, claimed: Array.isArray(data.daily.claimed) ? data.daily.claimed.filter((id: unknown) => typeof id === 'string') : [], collected: Boolean(data.daily.collected), built: Boolean(data.daily.built) },
    weekly: data.weekly.filter((r: any) => r && isDay(r.week) && Object.hasOwn(QUEST_REWARDS, r.quest)),
    lifetimeCoins: finite(data.lifetimeCoins) ? data.lifetimeCoins : 0,
    updatedAt: finite(data.updatedAt) ? data.updatedAt : 0,
  };
  if (data.version === 1) {
    // The map grew from an 11×11 island to 100×100 with roads, so old buildings are refunded
    // in full and the city starts again on the new map, keeping coins, XP and quests.
    const refund = data.buildings.reduce((sum: number, b: any) => sum + (b && Number.isInteger(b.level) ? v1Spent(b) : 0), 0);
    return { ...newCity(data.hallCollectedAt, data.daily.day), ...base, coins: Math.max(0, Math.floor(data.coins)) + refund };
  }
  const chunks = Array.isArray(data.chunks) ? [...new Set<number>(data.chunks.filter((c: unknown) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < CHUNKS * CHUNKS))] : [...START_CHUNKS];
  const roads = Array.isArray(data.roads) ? [...new Set<number>(data.roads.filter((r: unknown) => Number.isInteger(r) && (r as number) >= 0 && (r as number) < MAP * MAP))] : starterRoads();
  const buildings = data.buildings.filter((b: any) => b && typeof b.id === 'string' && getBuilding(b.type) && Number.isInteger(b.x) && Number.isInteger(b.z) && Number.isInteger(b.level) && b.level >= 1 && b.level <= MAX_BUILDING_LEVEL && finite(b.collectedAt));
  const tileList = (value: unknown) => (Array.isArray(value) ? [...new Set<number>(value.filter((r: unknown) => Number.isInteger(r) && (r as number) >= 0 && (r as number) < MAP * MAP))] : []);
  const roadSet = new Set(roads);
  const lights = tileList(data.lights).filter(index => roadSet.has(index));
  return { version: 2, coins: Math.max(0, Math.floor(data.coins)), buildings, roads, lights, cleared: tileList(data.cleared), chunks, ...base };
};

// Players of the earlier island keep what they earned: its coins (including what decorations
// cost, refunded) and XP carry over, and its weekly quest claims still count.
export const cityFromWorld = (raw: string | null, now: number, today: string): CityState => {
  const city = newCity(now, today);
  if (!raw) return city;
  try {
    const world = parseWorld(raw);
    const stats = worldStats(world);
    const prices: Record<string, number> = { garden: 20, sailboat: 40, stars: 60 };
    const refund = world.decorations.reduce((sum, id) => sum + (prices[id] || 0), 0);
    return { ...city, coins: city.coins + stats.coins + refund, xp: stats.xp, weekly: world.receipts.map(r => ({ week: r.week, quest: r.quest })) };
  } catch {
    return city;
  }
};

// ---------------------------------------------------------------------------------------------
// The map: who owns what, and what's on each tile

export const ownsTile = (state: Pick<CityState, 'chunks'>, x: number, z: number) => x >= 0 && z >= 0 && x < MAP && z < MAP && state.chunks.includes(chunkOf(x, z));
export const isHallTile = (x: number, z: number) => x >= HALL.x && x < HALL.x + HALL.size && z >= HALL.z && z < HALL.z + HALL.size;

const footprint = (x: number, z: number, size: number) => {
  const tiles: Array<[number, number]> = [];
  for (let dx = 0; dx < size; dx += 1) for (let dz = 0; dz < size; dz += 1) tiles.push([x + dx, z + dz]);
  return tiles;
};
const neighbours = (x: number, z: number, size: number) => {
  const tiles: Array<[number, number]> = [];
  for (let i = 0; i < size; i += 1) tiles.push([x + i, z - 1], [x + i, z + size], [x - 1, z + i], [x + size, z + i]);
  return tiles;
};

export const occupancy = (state: CityState) => {
  const map = new Map<number, string>();
  footprint(HALL.x, HALL.z, HALL.size).forEach(([x, z]) => map.set(tileIndex(x, z), 'hall'));
  state.buildings.forEach(building => footprint(building.x, building.z, getBuilding(building.type)!.size).forEach(([x, z]) => map.set(tileIndex(x, z), building.id)));
  return map;
};

export const buildingAt = (state: CityState, x: number, z: number) => occupancy(state).get(tileIndex(x, z)) ?? null;

export const hasRoadAccess = (roads: Set<number>, x: number, z: number, size: number) =>
  neighbours(x, z, size).some(([nx, nz]) => nx >= 0 && nz >= 0 && nx < MAP && nz < MAP && roads.has(tileIndex(nx, nz)));

export const canPlace = (state: CityState, typeId: string, x: number, z: number, ignoreId?: string): { ok: boolean; reason?: string } => {
  const type = getBuilding(typeId);
  if (!type) return { ok: false, reason: 'Unknown building.' };
  const taken = occupancy(state);
  const roads = new Set(state.roads);
  for (const [tx, tz] of footprint(x, z, type.size)) {
    if (!ownsTile(state, tx, tz)) return { ok: false, reason: 'You don\'t own that land yet - buy the plot first.' };
    if (terrainAt(tx, tz) === 'water') return { ok: false, reason: 'You can\'t build on water.' };
    if (roads.has(tileIndex(tx, tz))) return { ok: false, reason: 'There\'s a road there.' };
    const occupant = taken.get(tileIndex(tx, tz));
    if (occupant && occupant !== ignoreId) return { ok: false, reason: 'That spot is taken.' };
  }
  if (type.coastal && !neighbours(x, z, type.size).some(([nx, nz]) => terrainAt(nx, nz) === 'water')) return { ok: false, reason: `${type.name} has to be built by the water.` };
  return { ok: true };
};

// ---------------------------------------------------------------------------------------------
// The economy

export interface BuildingStatus {
  road: boolean;
  serviced: number; // 0-1: share of power and water it gets
  rate: number; // coins per hour now
  residents: number; // people living here
  staff: number; // jobs here that are filled
  jobs: number; // jobs here when running fully
}

export interface CityStats {
  residents: number;
  jobs: number;
  staffing: number; // share of jobs filled, 0-1
  happiness: number; // 0-100
  happinessBonus: number; // income multiplier
  power: { supply: number; demand: number };
  water: { supply: number; demand: number };
  incomePerHour: number;
  pending: number;
  noRoad: number; // buildings that need a road and don't have one
  status: Map<string, BuildingStatus>; // by building id, plus 'hall'
}

export const cityStats = (state: CityState, now: number): CityStats => {
  const roads = new Set(state.roads);
  const scale = (value: number | undefined, level: number) => (value || 0) * LEVEL_MULTIPLIER[level];
  const connected = new Map(state.buildings.map(building => {
    const type = getBuilding(building.type)!;
    return [building.id, type.noRoad || hasRoadAccess(roads, building.x, building.z, type.size)];
  }));
  let powerSupply: number = HALL.powerSupply, waterSupply: number = HALL.waterSupply, powerDemand = 0, waterDemand = 0;
  state.buildings.forEach(building => {
    if (!connected.get(building.id)) return;
    const type = getBuilding(building.type)!;
    powerSupply += scale(type.powerSupply, building.level);
    waterSupply += scale(type.waterSupply, building.level);
    powerDemand += scale(type.power, building.level);
    waterDemand += scale(type.water, building.level);
  });
  const powerRatio = powerDemand === 0 ? 1 : Math.min(1, powerSupply / powerDemand);
  const waterRatio = waterDemand === 0 ? 1 : Math.min(1, waterSupply / waterDemand);
  const serviced = (type: BuildingType) => ((type.power || 0) > 0 ? powerRatio : 1) * ((type.water || 0) > 0 ? waterRatio : 1);

  // Residents are simply everyone living in the homes you've built - every home adds its
  // people. Homes cut off from roads, power or water still house them, but unhappily.
  let residents = 0, jobs = 0, happiness = 50 + HALL.happiness, homes = 0, green = 0;
  state.buildings.forEach(building => {
    const type = getBuilding(building.type)!;
    const factor = connected.get(building.id) ? serviced(type) : 0;
    residents += scale(type.residents, building.level);
    jobs += scale(type.jobs, building.level) * factor;
    if (factor > 0) happiness += (type.happiness || 0) * (1 + (building.level - 1) * 0.5);
    if (type.category === 'homes') { homes += 1; happiness -= (1 - factor) * 3; }
    if (type.category === 'services') green += 1;
  });
  // Lit streets feel safer: +1 for every 4 street lights, up to +12.
  happiness += Math.min(12, Math.floor(state.lights.length / 4));
  // Crowding: lots of homes without parks and services wears people down.
  happiness -= Math.max(0, homes - green * 2 - 6);
  happiness = Math.max(0, Math.min(100, Math.round(happiness)));
  const staffing = jobs === 0 ? 1 : Math.min(1, residents / jobs);
  const happinessBonus = 0.75 + happiness / 200;

  const status = new Map<string, BuildingStatus>();
  status.set('hall', { road: true, serviced: 1, rate: HALL.income * happinessBonus, residents: 0, staff: 0, jobs: 0 });
  let noRoad = 0;
  state.buildings.forEach(building => {
    const type = getBuilding(building.type)!;
    const road = Boolean(connected.get(building.id));
    if (!road) noRoad += 1;
    const factor = road ? serviced(type) : 0;
    const rate = scale(type.income, building.level) * factor * ((type.jobs || 0) > 0 && type.category !== 'utilities' ? staffing : 1) * happinessBonus;
    const jobsHere = scale(type.jobs, building.level);
    status.set(building.id, { road, serviced: factor, rate, residents: Math.round(scale(type.residents, building.level)), staff: Math.round(jobsHere * factor * staffing), jobs: Math.round(jobsHere) });
  });
  const incomePerHour = [...status.values()].reduce((sum, item) => sum + item.rate, 0);
  const since = (id: string) => (id === 'hall' ? state.hallCollectedAt : state.buildings.find(b => b.id === id)?.collectedAt ?? now);
  const pending = [...status.entries()].reduce((sum, [id, item]) => sum + Math.min(INCOME_CAP_HOURS, Math.max(0, now - since(id)) / 3600000) * item.rate, 0);
  return {
    residents: Math.round(residents), jobs: Math.round(jobs), staffing, happiness, happinessBonus,
    power: { supply: Math.round(powerSupply), demand: Math.round(powerDemand) },
    water: { supply: Math.round(waterSupply), demand: Math.round(waterDemand) },
    incomePerHour, pending, noRoad, status,
  };
};

// Coins waiting at each building (and 'hall').
export const pendingCoins = (state: CityState, now: number, stats = cityStats(state, now)) => {
  const result: Record<string, number> = {};
  const hours = (since: number) => Math.min(INCOME_CAP_HOURS, Math.max(0, now - since) / 3600000);
  result.hall = hours(state.hallCollectedAt) * stats.status.get('hall')!.rate;
  state.buildings.forEach(building => { result[building.id] = hours(building.collectedAt) * (stats.status.get(building.id)?.rate || 0); });
  return result;
};
export const pendingAt = (state: CityState, id: string, now: number) => pendingCoins(state, now)[id] || 0;

const touch = (state: CityState, now: number, today: string): CityState =>
  state.daily.day === today ? { ...state, updatedAt: now } : { ...state, daily: { day: today, claimed: [], collected: false, built: false }, updatedAt: now };

const earn = (state: CityState, coins: number, xp: number): CityState => ({ ...state, coins: state.coins + coins, xp: state.xp + xp, lifetimeCoins: state.lifetimeCoins + coins });
const markBuilt = (state: CityState): CityState => ({ ...state, daily: { ...state.daily, built: true } });

// Collect from one building, or everything when no id is given. Whole coins only - the
// fraction stays and keeps filling.
export const collect = (state: CityState, now: number, today: string, id?: string): { state: CityState; coins: number } => {
  const stats = cityStats(state, now);
  const waiting = pendingCoins(state, now, stats);
  const ids = id ? [id] : Object.keys(waiting);
  let total = 0;
  const collectedAt = new Map<string, number>();
  for (const target of ids) {
    const amount = Math.floor(waiting[target] || 0);
    if (amount < 1) continue;
    total += amount;
    const rate = stats.status.get(target)!.rate; // coins per hour
    collectedAt.set(target, now - ((waiting[target] - amount) / rate) * 3600000);
  }
  if (total === 0) return { state, coins: 0 };
  let next: CityState = {
    ...state,
    hallCollectedAt: collectedAt.get('hall') ?? state.hallCollectedAt,
    buildings: state.buildings.map(building => (collectedAt.has(building.id) ? { ...building, collectedAt: collectedAt.get(building.id)! } : building)),
  };
  next = touch(earn(next, total, Math.floor(total / 10)), now, today);
  return { state: { ...next, daily: { ...next.daily, collected: true } }, coins: total };
};

export type BuildResult = { state: CityState; error?: undefined } | { state?: undefined; error: string };

export const build = (state: CityState, typeId: string, x: number, z: number, now: number, today: string, id: string): BuildResult => {
  const type = getBuilding(typeId);
  if (!type) return { error: 'Unknown building.' };
  if (levelForXp(state.xp) < type.unlock) return { error: `${type.name} unlocks at city level ${type.unlock}.` };
  const place = canPlace(state, typeId, x, z);
  if (!place.ok) return { error: place.reason! };
  if (state.coins < type.cost) return { error: `You need ${type.cost - state.coins} more coins.` };
  const cleared = harvest(state, footprint(x, z, type.size).map(([tx, tz]) => tileIndex(tx, tz)));
  return { state: markBuilt(touch({ ...cleared, coins: cleared.coins - type.cost, xp: cleared.xp + Math.ceil(type.cost / 4), buildings: [...cleared.buildings, { id, type: typeId, x, z, level: 1, collectedAt: now }] }, now, today)) };
};

export const upgradeCost = (building: PlacedBuilding) => {
  const type = getBuilding(building.type)!;
  return building.level >= MAX_BUILDING_LEVEL ? null : Math.round(type.cost * UPGRADE_COST_FACTOR[building.level + 1]);
};

// Upgrading collects first, so nothing earned at the old rate is lost.
export const upgrade = (state: CityState, id: string, now: number, today: string): BuildResult => {
  const building = state.buildings.find(item => item.id === id);
  if (!building) return { error: 'That building is gone.' };
  const cost = upgradeCost(building);
  if (cost === null) return { error: 'Already at the top level.' };
  const { state: collected } = collect(state, now, today, id);
  if (collected.coins < cost) return { error: `You need ${cost - collected.coins} more coins.` };
  return { state: markBuilt(touch({
    ...collected,
    coins: collected.coins - cost,
    xp: collected.xp + Math.ceil(cost / 4),
    buildings: collected.buildings.map(item => (item.id === id ? { ...item, level: item.level + 1, collectedAt: now } : item)),
  }, now, today)) };
};

export const move = (state: CityState, id: string, x: number, z: number, now: number, today: string): BuildResult => {
  const building = state.buildings.find(item => item.id === id);
  if (!building) return { error: 'That building is gone.' };
  const place = canPlace(state, building.type, x, z, id);
  if (!place.ok) return { error: place.reason! };
  const cleared = harvest(state, footprint(x, z, getBuilding(building.type)!.size).map(([tx, tz]) => tileIndex(tx, tz)));
  return { state: touch({ ...cleared, buildings: cleared.buildings.map(item => (item.id === id ? { ...item, x, z } : item)) }, now, today) };
};

export const demolishRefund = (building: PlacedBuilding) => {
  const type = getBuilding(building.type)!;
  let spent = type.cost;
  for (let level = 2; level <= building.level; level += 1) spent += Math.round(type.cost * UPGRADE_COST_FACTOR[level]);
  return Math.floor(spent / 2);
};

// Half of everything spent on it comes back, plus whatever it had produced.
export const demolish = (state: CityState, id: string, now: number, today: string): BuildResult => {
  const building = state.buildings.find(item => item.id === id);
  if (!building) return { error: 'That building is gone.' };
  const { state: collected } = collect(state, now, today, id);
  return { state: touch({ ...collected, coins: collected.coins + demolishRefund(building), buildings: collected.buildings.filter(item => item.id !== id) }, now, today) };
};

// ---------------------------------------------------------------------------------------------
// Roads and land

// Tiles a road dragged from one tile to another would cover: along the longer direction
// first, then the other, like most city builders.
export const roadPath = (from: { x: number; z: number }, to: { x: number; z: number }) => {
  const tiles: number[] = [];
  const horizontalFirst = Math.abs(to.x - from.x) >= Math.abs(to.z - from.z);
  const corner = horizontalFirst ? { x: to.x, z: from.z } : { x: from.x, z: to.z };
  const line = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
    for (let i = 0; i <= steps; i += 1) tiles.push(tileIndex(a.x + Math.sign(b.x - a.x) * i, a.z + Math.sign(b.z - a.z) * i));
  };
  line(from, corner);
  line(corner, to);
  return [...new Set(tiles)];
};

// Which tiles of a planned road can be built, and what the new ones cost.
export const planRoads = (state: CityState, tiles: number[]) => {
  const roads = new Set(state.roads);
  const taken = occupancy(state);
  const fresh: number[] = [];
  let blocked = 0;
  tiles.forEach(index => {
    if (roads.has(index)) return;
    const { x, z } = tileXZ(index);
    if (!ownsTile(state, x, z) || terrainAt(x, z) === 'water' || taken.has(index)) { blocked += 1; return; }
    fresh.push(index);
  });
  return { fresh, blocked, cost: fresh.length * ROAD_COST };
};

export const buildRoads = (state: CityState, tiles: number[], now: number, today: string): BuildResult => {
  const plan = planRoads(state, tiles);
  if (plan.fresh.length === 0) return { error: plan.blocked ? 'Roads can only go on empty land you own.' : 'There\'s already a road there.' };
  if (state.coins < plan.cost) return { error: `You need ${plan.cost - state.coins} more coins for ${plan.fresh.length} road tiles.` };
  const cleared = harvest(state, plan.fresh);
  return { state: markBuilt(touch({ ...cleared, coins: cleared.coins - plan.cost, xp: cleared.xp + plan.fresh.length, roads: [...cleared.roads, ...plan.fresh].sort((a, b) => a - b) }, now, today)) };
};

// Removing a road takes its street light with it.
export const removeRoad = (state: CityState, index: number, now: number, today: string): BuildResult => {
  if (!state.roads.includes(index)) return { error: 'No road there.' };
  const lit = state.lights.includes(index);
  return { state: touch({ ...state, coins: state.coins + ROAD_REFUND + (lit ? LIGHT_REFUND : 0), roads: state.roads.filter(road => road !== index), lights: state.lights.filter(light => light !== index) }, now, today) };
};

// Street lights go on road tiles: one lamp per tile, dragged along like roads.
export const LIGHT_COST = 10;
export const LIGHT_REFUND = 4;

export const planLights = (state: CityState, tiles: number[]) => {
  const roads = new Set(state.roads), lit = new Set(state.lights);
  const fresh = tiles.filter(index => roads.has(index) && !lit.has(index));
  return { fresh, cost: fresh.length * LIGHT_COST };
};

export const addLights = (state: CityState, tiles: number[], now: number, today: string): BuildResult => {
  const plan = planLights(state, tiles);
  if (plan.fresh.length === 0) return { error: tiles.some(index => state.roads.includes(index)) ? 'Those streets are already lit.' : 'Street lights go along roads.' };
  if (state.coins < plan.cost) return { error: `You need ${plan.cost - state.coins} more coins for ${plan.fresh.length} street lights.` };
  return { state: markBuilt(touch({ ...state, coins: state.coins - plan.cost, xp: state.xp + plan.fresh.length, lights: [...state.lights, ...plan.fresh].sort((a, b) => a - b) }, now, today)) };
};

export const removeLight = (state: CityState, index: number, now: number, today: string): BuildResult => {
  if (!state.lights.includes(index)) return { error: 'No street light there.' };
  return { state: touch({ ...state, coins: state.coins + LIGHT_REFUND, lights: state.lights.filter(light => light !== index) }, now, today) };
};

// Cutting down wild trees on your land pays for the timber.
export const clearTrees = (state: CityState, x: number, z: number, now: number, today: string): BuildResult => {
  if (!ownsTile(state, x, z)) return { error: 'You can only clear trees on land you own.' };
  const count = treesAt(state, x, z);
  if (count === 0) return { error: 'No trees there.' };
  return { state: touch({ ...harvest(state, [tileIndex(x, z)]), xp: state.xp + count }, now, today) };
};

export const chunkCost = (state: CityState) => Math.round(250 * 1.35 ** (state.chunks.length - START_CHUNKS.length));

export const chunkAvailable = (state: CityState, chunk: number) => {
  if (state.chunks.includes(chunk)) return false;
  const cx = chunk % CHUNKS, cz = Math.floor(chunk / CHUNKS);
  const adjacent = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
    const nx = cx + dx, nz = cz + dz;
    return nx >= 0 && nz >= 0 && nx < CHUNKS && nz < CHUNKS && state.chunks.includes(nz * CHUNKS + nx);
  });
  if (!adjacent) return false;
  for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z += 1) for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x += 1) if (terrainAt(x, z) !== 'water') return true;
  return false;
};

export const buyChunk = (state: CityState, chunk: number, now: number, today: string): BuildResult => {
  if (!chunkAvailable(state, chunk)) return { error: 'You can only buy land next to land you own.' };
  const level = levelForXp(state.xp);
  if (state.chunks.length >= maxChunks(level)) return { error: `Reach city level ${level + 1} to buy more land.` };
  const cost = chunkCost(state);
  if (state.coins < cost) return { error: `You need ${cost - state.coins} more coins.` };
  return { state: touch({ ...state, coins: state.coins - cost, xp: state.xp + 20, chunks: [...state.chunks, chunk] }, now, today) };
};

// ---------------------------------------------------------------------------------------------
// Missions

export interface FinanceActivity {
  expensesToday: number;
  incomeToday: boolean;
  savedToday: boolean;
}

export interface Mission {
  id: string;
  title: string;
  detail: string;
  coins: number;
  xp: number;
  progress: number;
  done: boolean;
  claimed: boolean;
  destination?: 'expenses' | 'income' | 'goals';
}

const dateOf = (value?: string) => (value || '').slice(0, 10);

export const financeActivity = (expenses: Expense[], incomes: Income[], entries: SavingsEntry[], today: string): FinanceActivity => ({
  expensesToday: expenses.filter(expense => dateOf(expense.expenseDate) === today).length,
  incomeToday: incomes.some(income => [income.incomeDate, income.firstIncomeDate].some(date => dateOf(date) === today)),
  savedToday: entries.some(entry => entry.direction === 'Contribution' && entry.amount > 0 && dateOf(entry.entryDate) === today),
});

const daySeed = (day: string) => [...day].reduce((h, char) => (h * 31 + char.charCodeAt(0)) >>> 0, 7);

export const dailyMissions = (state: CityState, activity: FinanceActivity, today: string): Mission[] => {
  const daily = state.daily.day === today ? state.daily : { day: today, claimed: [], collected: false, built: false };
  const seed = daySeed(today);
  const all: Record<string, Omit<Mission, 'claimed'>> = {
    checkin: { id: 'checkin', title: 'Visit your city', detail: 'Stop by today.', coins: 30, xp: 10, progress: 1, done: true },
    log1: { id: 'log1', title: 'Record an expense', detail: activity.expensesToday ? 'Recorded today.' : 'Log anything you spent today.', coins: 60, xp: 25, progress: Math.min(1, activity.expensesToday), done: activity.expensesToday >= 1, destination: 'expenses' },
    log3: { id: 'log3', title: 'Keep a full record', detail: `${Math.min(3, activity.expensesToday)} / 3 expenses recorded today.`, coins: 100, xp: 40, progress: Math.min(1, activity.expensesToday / 3), done: activity.expensesToday >= 3, destination: 'expenses' },
    save: { id: 'save', title: 'Pay yourself first', detail: activity.savedToday ? 'Saved today.' : 'Add any amount to a savings goal.', coins: 90, xp: 35, progress: activity.savedToday ? 1 : 0, done: activity.savedToday, destination: 'goals' },
    income: { id: 'income', title: 'Track what comes in', detail: activity.incomeToday ? 'Income recorded for today.' : 'Record income dated today.', coins: 75, xp: 30, progress: activity.incomeToday ? 1 : 0, done: activity.incomeToday, destination: 'income' },
    collect: { id: 'collect', title: 'Run the city', detail: daily.collected ? 'Collected today.' : 'Collect coins from your buildings.', coins: 25, xp: 10, progress: daily.collected ? 1 : 0, done: daily.collected },
    build: { id: 'build', title: 'Build something', detail: daily.built ? 'Built today.' : 'Build, upgrade or lay a road.', coins: 35, xp: 15, progress: daily.built ? 1 : 0, done: daily.built },
  };
  const extra = ['log3', 'save', 'income'][seed % 3];
  const game = ['collect', 'build'][Math.floor(seed / 3) % 2];
  return ['checkin', 'log1', extra, game].map(id => ({ ...all[id], claimed: daily.claimed.includes(id) }));
};

export const ALL_DONE_BONUS = { coins: 80, xp: 30 } as const;

export const claimMission = (state: CityState, missions: Mission[], id: string, now: number, today: string): BuildResult => {
  const current = touch(state, now, today);
  if (id === 'bonus') {
    if (current.daily.claimed.includes('bonus') || !missions.every(item => current.daily.claimed.includes(item.id))) return { error: 'Finish every mission today first.' };
    const earned = earn(current, ALL_DONE_BONUS.coins, ALL_DONE_BONUS.xp);
    return { state: { ...earned, daily: { ...earned.daily, claimed: [...earned.daily.claimed, 'bonus'] } } };
  }
  const mission = missions.find(item => item.id === id);
  if (!mission || !mission.done) return { error: 'Not done yet.' };
  if (current.daily.claimed.includes(id)) return { error: 'Already claimed today.' };
  const earned = earn(current, mission.coins, mission.xp);
  return { state: { ...earned, daily: { ...earned.daily, claimed: [...earned.daily.claimed, id] } } };
};

export const WEEKLY_REWARDS: Record<QuestId, { coins: number; xp: number }> = { record: { coins: 180, xp: 60 }, save: { coins: 220, xp: 75 }, review: { coins: 260, xp: 90 } };

export const claimWeekly = (state: CityState, quest: QuestId, eligible: boolean, now: number, today: string): BuildResult => {
  const week = worldWeek(today);
  if (!eligible) return { error: 'Not done yet.' };
  if (state.weekly.some(item => item.week === week && item.quest === quest)) return { error: 'Already claimed this week.' };
  const earned = earn(touch(state, now, today), WEEKLY_REWARDS[quest].coins, WEEKLY_REWARDS[quest].xp);
  return { state: { ...earned, weekly: [...earned.weekly, { week, quest }] } };
};

// Which of two saves to keep - the one changed most recently.
export const newerCity = (a: CityState | null, b: CityState | null) => (!a ? b : !b ? a : b.updatedAt > a.updatedAt ? b : a);

// ---------------------------------------------------------------------------------------------
// The people: names for residents and staff, and what each job is called. Deterministic, so the
// same building always shows the same people.

const FIRST_NAMES = ['Aisha', 'Wei Ming', 'Priya', 'Daniel', 'Siti', 'Arjun', 'Mei Ling', 'Hafiz', 'Nurul', 'Jason', 'Kavitha', 'Farid', 'Chloe', 'Rajesh', 'Hui Min', 'Amir', 'Sofia', 'Kenji', 'Lakshmi', 'Ethan', 'Zara', 'Marcus', 'Aina', 'Vikram', 'Grace', 'Irfan', 'Yuki', 'Hana', 'Ben', 'Divya'];
const LAST_NAMES = ['Tan', 'Lim', 'Rahman', 'Kumar', 'Wong', 'Abdullah', 'Lee', 'Ng', 'Singh', 'Ismail', 'Chen', 'Nair', 'Goh', 'Hassan', 'Pillai', 'Teo', 'Yusof', 'Ong', 'Fernandez', 'Chua'];
export const JOB_ROLES: Record<string, string[]> = {
  cafe: ['Barista', 'Waiter', 'Cook', 'Café manager'],
  shop: ['Cashier', 'Shelf stacker', 'Shop owner'],
  market: ['Stallholder', 'Grocer', 'Fishmonger', 'Baker', 'Market manager'],
  office: ['Analyst', 'Accountant', 'Designer', 'Software engineer', 'Receptionist', 'Team lead'],
  bank: ['Teller', 'Loan officer', 'Financial adviser', 'Branch manager'],
  workshop: ['Mechanic', 'Welder', 'Carpenter'],
  factory: ['Machine operator', 'Packer', 'Forklift driver', 'Quality inspector', 'Foreman'],
  powerplant: ['Plant operator', 'Electrical engineer', 'Technician'],
  watertower: ['Water technician'],
  pump: ['Pump operator', 'Water engineer'],
  school: ['Teacher', 'Teaching assistant', 'Librarian', 'Principal'],
  clinic: ['Nurse', 'Doctor', 'Pharmacist', 'Receptionist'],
  // The first person on an advisor building's staff is the advisor.
  postoffice: ['Subscription Auditor', 'Postal clerk', 'Sorting clerk'],
  vault: ['Savings Coach', 'Vault keeper'],
  creditunion: ['Debt Advisor', 'Loans clerk', 'Cashier'],
};

const nameHash = (text: string) => [...text].reduce((h, char) => Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
export const personName = (seed: string) => {
  const h = nameHash(seed);
  return `${FIRST_NAMES[h % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(h / FIRST_NAMES.length) % LAST_NAMES.length]}`;
};

// Who works at a building: one name and role per filled job. The first role is the most common.
export const staffRoster = (buildingId: string, type: string, staff: number) => {
  const roles = JOB_ROLES[type] || ['Staff'];
  return Array.from({ length: staff }, (_, i) => ({
    name: personName(`${buildingId}:staff:${i}`),
    role: i === 0 && staff > 3 ? roles[roles.length - 1] : roles[(i * 7) % Math.max(1, roles.length - (staff > 3 ? 1 : 0))],
  }));
};

// Who lives in a home: a household sharing a family name.
export const household = (buildingId: string, residents: number) => {
  const family = LAST_NAMES[nameHash(`${buildingId}:family`) % LAST_NAMES.length];
  return Array.from({ length: residents }, (_, i) => `${FIRST_NAMES[nameHash(`${buildingId}:resident:${i}`) % FIRST_NAMES.length]} ${family}`);
};

// ---------------------------------------------------------------------------------------------
// Advisors' reports

// Saves an advisor's new report. Issues it flagged last time that are gone now were fixed -
// each earns FIX_REWARD once. Coins reward acting on advice, never amounts.
export const recordAgentReport = (state: CityState, report: AgentReport, now: number, today: string): { state: CityState; fixed: number } => {
  const records = state.agents || {};
  const previous = records[report.agent];
  const fixed = fixedSince(previous?.report, report, previous?.rewarded || []);
  let next: CityState = { ...state, agents: { ...records, [report.agent]: { report, rewarded: [...(previous?.rewarded || []), ...fixed].slice(-500) } } };
  if (fixed.length) next = earn(next, fixed.length * FIX_REWARD.coins, fixed.length * FIX_REWARD.xp);
  return { state: touch(next, now, today), fixed: fixed.length };
};
