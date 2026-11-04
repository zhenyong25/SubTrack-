import * as THREE from 'three';
import { PrimitiveBatch } from './primitiveBatch';

// Animals that live at farms, parks, ponds, forests, homes and the waterfront: cows graze in
// the dairy paddock, chickens peck round the barn, sheep wander the orchard, ducks paddle in
// the rice paddies, pigeons gather by the fountain, gulls circle the harbour. Each building
// keeps its own animals inside its plot, whether or not anyone is visiting. They are drawn from
// a few shared instanced shapes, and their clock only runs while the city is in motion.

export type Species = 'cow' | 'calf' | 'horse' | 'pig' | 'sheep' | 'goat' | 'chicken' | 'duck' | 'goose' | 'dog' | 'cat' | 'rabbit' | 'squirrel' | 'deer' | 'panda' | 'heron' | 'pigeon' | 'gull' | 'sparrow' | 'crow' | 'swallow' | 'parrot' | 'flamingo' | 'peacock' | 'fox' | 'hedgehog' | 'butterfly' | 'koi';
export interface AnimalPlace { id: string; type: string; size: number; center: THREE.Vector3; rotation: number; ground: number }
// Where in the plot (its own coordinates, -0.5..0.5, front +z) a group lives, and at what height
// above the plot's ground (water birds float on a pond).
interface Range { x: [number, number]; z: [number, number]; lift?: number; ring?: [number, number] }
interface Group { species: Species; count: number; range: Range }

const yard = (x: [number, number], z: [number, number], lift?: number): Range => ({ x, z, lift });
export const ANIMAL_HOMES: Record<string, Group[]> = {
  dairyfarm: [{ species: 'cow', count: 3, range: yard([-0.36, 0.36], [0.03, 0.34]) }, { species: 'calf', count: 1, range: yard([-0.36, 0.36], [0.03, 0.34]) }, { species: 'dog', count: 1, range: yard([-0.42, 0.42], [0.38, 0.45]) }],
  redbarn: [{ species: 'pig', count: 2, range: yard([-0.33, 0.37], [0.19, 0.39]) }, { species: 'horse', count: 1, range: yard([-0.33, 0.37], [0.19, 0.39]) }, { species: 'chicken', count: 5, range: yard([0.17, 0.42], [-0.4, 0.1]) }],
  graincooperative: [{ species: 'chicken', count: 6, range: yard([-0.4, 0.4], [-0.07, 0.1]) }, { species: 'cat', count: 1, range: yard([-0.4, 0.4], [-0.07, 0.1]) }],
  appleorchard: [{ species: 'sheep', count: 4, range: yard([-0.4, 0.4], [-0.4, 0.18]) }],
  vineyard: [{ species: 'goat', count: 2, range: yard([0.23, 0.42], [-0.4, 0.15]) }],
  vegetablepatch: [{ species: 'chicken', count: 3, range: yard([-0.4, 0.2], [0.36, 0.44]) }],
  communityallotment: [{ species: 'rabbit', count: 2, range: yard([-0.04, 0.04], [-0.42, 0.42]) }],
  wheatfield: [{ species: 'pigeon', count: 3, range: yard([-0.4, 0.4], [0.35, 0.42]) }],
  ricepaddy: [{ species: 'duck', count: 5, range: yard([-0.4, 0.4], [-0.38, 0.38], 0.03) }],
  park: [{ species: 'dog', count: 1, range: yard([-0.4, 0.4], [-0.4, 0.4]) }, { species: 'squirrel', count: 2, range: yard([-0.4, 0.4], [-0.4, 0.4]) }],
  pocketgarden: [{ species: 'squirrel', count: 1, range: yard([-0.4, 0.4], [-0.4, 0.4]) }, { species: 'cat', count: 1, range: yard([-0.05, 0.05], [-0.4, 0.4]) }],
  rosegarden: [{ species: 'rabbit', count: 2, range: yard([-0.4, 0.4], [-0.05, 0.05]) }],
  picnicgrove: [{ species: 'dog', count: 1, range: yard([-0.4, 0.4], [-0.05, 0.05]) }, { species: 'squirrel', count: 2, range: yard([-0.4, 0.4], [-0.4, 0.4]) }],
  urbanforest: [{ species: 'deer', count: 2, range: yard([-0.4, 0.4], [-0.35, 0.28]) }, { species: 'squirrel', count: 2, range: yard([-0.4, 0.4], [-0.4, 0.3]) }],
  bamboogrove: [{ species: 'panda', count: 1, range: yard([-0.4, 0.4], [-0.4, 0.4]) }],
  wetlandreserve: [{ species: 'heron', count: 2, range: yard([0.1, 0.38], [-0.3, 0.05], 0.015) }, { species: 'duck', count: 3, range: yard([-0.38, -0.18], [-0.3, 0.3], 0.015) }],
  duckpond: [{ species: 'goose', count: 2, range: yard([-0.42, 0.42], [0.3, 0.44]) }],
  fountain: [{ species: 'pigeon', count: 6, range: { x: [0, 0], z: [0, 0], ring: [0.42, 0.47] } }],
  cottage: [{ species: 'cat', count: 1, range: yard([0.24, 0.43], [0.3, 0.44]) }],
  townhouse: [{ species: 'dog', count: 1, range: yard([0.24, 0.43], [0.3, 0.44]) }],
};
// Small flocks forage by paths; swallows wheel overhead, while shy wildlife stays in gardens.
const EXTRA_HOMES: Record<string, Group[]> = {
  park: [{ species: 'sparrow', count: 5, range: yard([-0.4, 0.4], [-0.4, 0.4]) }, { species: 'swallow', count: 3, range: yard([0, 0], [0, 0]) }],
  fountain: [{ species: 'sparrow', count: 4, range: { x: [0, 0], z: [0, 0], ring: [0.38, 0.47] } }],
  pocketgarden: [{ species: 'sparrow', count: 3, range: yard([-0.4, 0.4], [-0.4, 0.4]) }, { species: 'hedgehog', count: 1, range: yard([-0.4, -0.25], [-0.4, 0.4]) }],
  rosegarden: [{ species: 'hedgehog', count: 2, range: yard([-0.4, 0.4], [-0.06, 0.06]) }, { species: 'sparrow', count: 3, range: yard([-0.4, 0.4], [-0.06, 0.06]) }],
  picnicgrove: [{ species: 'sparrow', count: 4, range: yard([-0.4, 0.4], [-0.05, 0.05]) }],
  urbanforest: [{ species: 'fox', count: 1, range: yard([-0.4, 0.4], [-0.35, 0.28]) }, { species: 'crow', count: 3, range: yard([-0.4, 0.4], [-0.35, 0.28]) }, { species: 'swallow', count: 4, range: yard([0, 0], [0, 0]) }],
  bamboogrove: [{ species: 'parrot', count: 3, range: yard([-0.4, 0.4], [-0.4, 0.4]) }],
  botanicalgarden: [{ species: 'peacock', count: 2, range: yard([-0.4, 0.4], [0.29, 0.42]) }, { species: 'parrot', count: 3, range: yard([-0.4, 0.4], [0.29, 0.42]) }],
  wetlandreserve: [{ species: 'flamingo', count: 3, range: yard([0.1, 0.38], [-0.3, 0.05], 0.015) }, { species: 'swallow', count: 3, range: yard([0, 0], [0, 0]) }],
  duckpond: [{ species: 'duck', count: 4, range: yard([-0.25, 0.25], [-0.24, 0.18], 0.02) }],
  wheatfield: [{ species: 'crow', count: 3, range: yard([-0.4, 0.4], [0.35, 0.42]) }],
  appleorchard: [{ species: 'sparrow', count: 4, range: yard([-0.4, 0.4], [-0.4, 0.18]) }],
  shop: [{ species: 'pigeon', count: 3, range: yard([-0.4, 0.4], [0.36, 0.44]) }],
};
EXTRA_HOMES.duckpond.push({ species: 'koi', count: 4, range: yard([-0.18, 0.18], [-0.12, 0.12], 0.02) });
for (const type of ['rosegarden', 'botanicalgarden', 'pocketgarden', 'florist']) {
  EXTRA_HOMES[type] = [...(EXTRA_HOMES[type] || []), { species: 'butterfly', count: type === 'botanicalgarden' ? 7 : 4, range: yard([-0.36, 0.36], [0.23, 0.4], 0.12) }];
}
for (const [type, groups] of Object.entries(EXTRA_HOMES)) ANIMAL_HOMES[type] = [...(ANIMAL_HOMES[type] || []), ...groups];
const GULL_HOMES = ['lighthouse', 'fishingjetty', 'anglershut', 'harbourmaster', 'fishauction', 'trawlerdepot', 'fishingboathouse', 'ferryterminal', 'marinaoffice', 'smokehouse'];
const HOMES = ANIMAL_HOMES;
for (const type of GULL_HOMES) HOMES[type] = [...(HOMES[type] || []), { species: 'gull', count: 4, range: yard([0, 0], [0, 0]) }];
export const ANIMAL_TYPES = new Set(Object.keys(HOMES));

// World units a second, a tile being ~10 m.
const SPEED: Record<Species, number> = { cow: 0.04, calf: 0.05, horse: 0.06, pig: 0.04, sheep: 0.035, goat: 0.05, chicken: 0.045, duck: 0.03, goose: 0.035, dog: 0.16, cat: 0.05, rabbit: 0.09, squirrel: 0.12, deer: 0.06, panda: 0.025, heron: 0.02, pigeon: 0.05, gull: 0.35, sparrow: 0.085, crow: 0.075, swallow: 0.5, parrot: 0.065, flamingo: 0.025, peacock: 0.045, fox: 0.12, hedgehog: 0.035, butterfly: 0.045, koi: 0.065 };
// Body length, for keeping animals apart.
const LENGTH: Record<Species, number> = { cow: 0.24, calf: 0.15, horse: 0.24, pig: 0.14, sheep: 0.13, goat: 0.11, chicken: 0.04, duck: 0.045, goose: 0.06, dog: 0.08, cat: 0.05, rabbit: 0.035, squirrel: 0.025, deer: 0.16, panda: 0.15, heron: 0.06, pigeon: 0.03, gull: 0.06, sparrow: 0.025, crow: 0.055, swallow: 0.04, parrot: 0.045, flamingo: 0.065, peacock: 0.085, fox: 0.1, hedgehog: 0.04, butterfly: 0.025, koi: 0.055 };
type Mode = 'walk' | 'run' | 'idle' | 'graze' | 'rest' | 'sit' | 'fly';
// How each species spends its time.
const HABITS: Record<Species, Array<[Mode, number]>> = {
  cow: [['graze', 5], ['walk', 3], ['idle', 2], ['rest', 1]], calf: [['graze', 3], ['walk', 4], ['run', 1], ['idle', 2]], horse: [['graze', 5], ['walk', 3], ['idle', 2]],
  pig: [['graze', 4], ['walk', 3], ['rest', 2]], sheep: [['graze', 6], ['walk', 3], ['rest', 1]], goat: [['graze', 4], ['walk', 4], ['idle', 2]],
  chicken: [['graze', 5], ['walk', 5]], pigeon: [['graze', 5], ['walk', 4], ['fly', 1]], duck: [['walk', 6], ['idle', 3]], goose: [['graze', 4], ['walk', 4], ['idle', 2]],
  dog: [['run', 5], ['sit', 3], ['walk', 2]], cat: [['sit', 4], ['rest', 3], ['walk', 3]], rabbit: [['walk', 4], ['graze', 4], ['sit', 2]], squirrel: [['run', 5], ['sit', 4]],
  deer: [['graze', 5], ['walk', 3], ['idle', 2]], panda: [['sit', 7], ['walk', 3]], heron: [['idle', 7], ['walk', 3]], gull: [['fly', 1]],
  sparrow: [['graze', 4], ['walk', 3], ['fly', 3]], crow: [['graze', 3], ['walk', 3], ['fly', 4]], swallow: [['fly', 1]], parrot: [['idle', 2], ['walk', 2], ['fly', 6]],
  flamingo: [['idle', 4], ['graze', 3], ['walk', 3]], peacock: [['sit', 4], ['walk', 4], ['graze', 2]], fox: [['walk', 4], ['run', 3], ['rest', 3]], hedgehog: [['walk', 5], ['graze', 3], ['rest', 2]],
  butterfly: [['fly', 7], ['idle', 2]], koi: [['walk', 1]],
};
export const CIRCLING_BIRDS = new Set<Species>(['gull', 'swallow']);
const SHY_BIRDS = new Set<Species>(['pigeon', 'sparrow', 'crow', 'parrot']);
const SHY_ANIMALS = new Set<Species>(['rabbit', 'squirrel', 'hedgehog']);

interface Animal { species: Species; place: AnimalPlace; range: Range; x: number; z: number; heading: number; mode: Mode; timer: number; tx: number; tz: number; gait: number; head: number; phase: number; air: number; from: [number, number]; cooldown: number; reaction: 'scatter' | 'scamper' | 'greet' | null; reactionTime: number }

let seed = 1;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const between = ([a, b]: [number, number]) => a + random() * (b - a);
const spot = (range: Range): [number, number] => {
  if (range.ring) { const a = random() * Math.PI * 2, r = between(range.ring); return [Math.cos(a) * r, Math.sin(a) * r]; }
  return [between(range.x), between(range.z)];
};

export class Animals {
  private animals: Animal[] = [];
  private key = '';
  private batch: PrimitiveBatch;
  private seconds = 0;
  readonly stats = { birdsScattered: 0, animalScampers: 0, dogGreetings: 0 };
  constructor(scene: THREE.Scene) { this.batch = new PrimitiveBatch(scene, 'city-animals', 6000); }
  get count() { return this.animals.length; }
  get species() { return [...new Set(this.animals.map(a => a.species))].sort(); }
  get reacting() { return this.animals.filter(a => a.reaction).length; }
  // Unchanged buildings keep their animals where they are.
  setPlaces(places: AnimalPlace[]) {
    const live = places.filter(p => HOMES[p.type]);
    const key = live.map(p => `${p.id}:${p.type}:${p.center.x}:${p.center.z}:${p.rotation}:${p.size}`).join('|');
    if (key === this.key) return;
    this.key = key;
    const kept = new Map<string, Animal[]>();
    for (const animal of this.animals) { const list = kept.get(animal.place.id) || []; list.push(animal); kept.set(animal.place.id, list); }
    this.animals = live.flatMap(place => {
      const previous = kept.get(place.id);
      if (previous && previous[0].place.type === place.type && previous[0].place.center.equals(place.center) && previous[0].place.rotation === place.rotation) { previous.forEach(a => { a.place = place; }); return previous; }
      seed = [...place.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483646, 7) + 1;
      return HOMES[place.type].flatMap(group => Array.from({ length: group.count }, (): Animal => {
        const [x, z] = spot(group.range);
        return { species: group.species, place, range: group.range, x, z, heading: random() * Math.PI * 2, mode: CIRCLING_BIRDS.has(group.species) ? 'fly' : 'idle', timer: random() * 3, tx: x, tz: z, gait: random() * 6, head: 0, phase: random() * 10, air: 0, from: [x, z], cooldown: 0, reaction: null, reactionTime: 0 };
      }));
    });
  }

  private choose(a: Animal) {
    const habits = HABITS[a.species], total = habits.reduce((s, [, w]) => s + w, 0);
    let r = random() * total; a.mode = habits[0][0];
    for (const [mode, weight] of habits) if ((r -= weight) < 0) { a.mode = mode; break; }
    if (a.mode === 'walk' || a.mode === 'run' || a.mode === 'fly') {
      // Mostly short strolls, sometimes across the yard.
      const [x, z] = spot(a.range), reach = a.mode === 'fly' ? 1 : random() < 0.7 ? 0.25 : 1;
      a.from = [a.x, a.z]; a.tx = a.x + (x - a.x) * reach; a.tz = a.z + (z - a.z) * reach;
      if (a.range.ring) { const r = Math.hypot(a.tx, a.tz) || 1, clamp = Math.min(a.range.ring[1], Math.max(a.range.ring[0], r)); a.tx *= clamp / r; a.tz *= clamp / r; }
      a.timer = 20;
    } else a.timer = 2 + random() * (a.mode === 'rest' || a.mode === 'sit' ? 10 : 5);
  }

  private local(p: AnimalPlace, point: THREE.Vector3): [number, number] {
    const dx = point.x - p.center.x, dz = point.z - p.center.z, c = Math.cos(p.rotation), s = Math.sin(p.rotation);
    return [(dx * c - dz * s) / p.size, (dx * s + dz * c) / p.size];
  }
  private react(a: Animal, visitor: THREE.Vector3) {
    const [vx, vz] = this.local(a.place, visitor);
    if (a.species === 'dog') {
      a.reaction = 'greet'; a.reactionTime = 4; a.cooldown = 14;
      this.stats.dogGreetings++;
    } else {
      // Pick a safe landing/escape spot within this animal's own habitat. A fountain's
      // ring stays a ring; animals never run out into the adjacent road.
      let best: [number, number] = [a.x, a.z], score = -Infinity;
      for (let i = 0; i < 16; i++) {
        const candidate = spot(a.range), away = Math.hypot(candidate[0] - vx, candidate[1] - vz);
        if (away > score) { best = candidate; score = away; }
      }
      a.from = [a.x, a.z]; [a.tx, a.tz] = best;
      a.reaction = SHY_BIRDS.has(a.species) ? 'scatter' : 'scamper';
      a.mode = a.reaction === 'scatter' ? 'fly' : 'run'; a.timer = 20; a.cooldown = 9 + random() * 4;
      if (a.reaction === 'scatter') this.stats.birdsScattered++; else this.stats.animalScampers++;
    }
  }

  update(dt: number, motion: boolean, residents: readonly THREE.Vector3[] = []) {
    if (motion) {
      this.seconds += dt;
      // Nearby visible people only: people inside buildings, boats and aircraft are absent.
      const visitors = new Map<string, THREE.Vector3[]>();
      for (const p of residents) { const key = `${Math.floor(p.x)}:${Math.floor(p.z)}`, cell = visitors.get(key) || []; cell.push(p); visitors.set(key, cell); }
      const nearest = (position: THREE.Vector3, radius: number) => {
        let best: THREE.Vector3 | undefined, distance = radius * radius;
        const cx = Math.floor(position.x), cz = Math.floor(position.z);
        for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const p of visitors.get(`${x}:${z}`) || []) {
          if (Math.abs(position.y - p.y) > 0.2) continue;
          const d = (p.x - position.x) ** 2 + (p.z - position.z) ** 2;
          if (d < distance) { best = p; distance = d; }
        }
        return best;
      };
      for (const a of this.animals) {
        a.timer -= dt;
        a.cooldown = Math.max(0, a.cooldown - dt);
        if (CIRCLING_BIRDS.has(a.species)) { a.gait += dt * 9; continue; }
        if (a.reaction === 'greet') {
          a.reactionTime -= dt;
          const visitor = nearest(this.pose(a).position, 0.55);
          if (!visitor || a.reactionTime <= 0) { a.reaction = null; a.mode = 'sit'; a.timer = 2; }
          else {
            const [vx, vz] = this.local(a.place, visitor), dx = a.x - vx, dz = a.z - vz, distance = Math.hypot(dx, dz) || 1;
            a.tx = Math.max(a.range.x[0], Math.min(a.range.x[1], vx + dx / distance * 0.085 / a.place.size));
            a.tz = Math.max(a.range.z[0], Math.min(a.range.z[1], vz + dz / distance * 0.085 / a.place.size));
            a.mode = Math.hypot(a.tx - a.x, a.tz - a.z) * a.place.size > 0.015 ? 'run' : 'sit';
            a.heading = Math.atan2(vx - a.x, vz - a.z); a.timer = 2;
          }
        } else if (visitors.size && !a.reaction && a.cooldown === 0 && a.mode !== 'fly' && (SHY_BIRDS.has(a.species) || SHY_ANIMALS.has(a.species) || a.species === 'dog')) {
          const visitor = nearest(this.pose(a).position, SHY_BIRDS.has(a.species) ? 0.34 : a.species === 'dog' ? 0.32 : 0.23);
          if (visitor) this.react(a, visitor);
        }
        const moving = a.mode === 'walk' || a.mode === 'run' || a.mode === 'fly';
        if (moving) {
          const speed = SPEED[a.species] * (a.mode === 'run' ? 1 : a.mode === 'fly' ? 4 : 0.55) / a.place.size;
          const dx = a.tx - a.x, dz = a.tz - a.z, distance = Math.hypot(dx, dz), step = speed * dt;
          if (distance <= step) { a.x = a.tx; a.z = a.tz; a.timer = 0; }
          else {
            a.x += dx / distance * step; a.z += dz / distance * step;
            const want = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - a.heading), Math.cos(want - a.heading));
            a.heading += Math.max(-dt * 4, Math.min(dt * 4, turn));
          }
          a.gait += step * a.place.size / LENGTH[a.species] * 6;
          if (a.mode === 'fly') { const total = Math.hypot(a.tx - a.from[0], a.tz - a.from[1]) || 1; a.air = Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - Math.hypot(a.tx - a.x, a.tz - a.z) / total))) * (a.reaction === 'scatter' ? 0.28 : 0.12); }
        } else a.air = 0;
        if (a.timer <= 0) {
          if (a.reaction === 'scatter' || a.reaction === 'scamper') { a.reaction = null; a.mode = 'idle'; a.timer = 2; a.air = 0; }
          else if (a.reaction !== 'greet') this.choose(a);
        }
        a.head += ((a.mode === 'graze' ? 1 : 0) - a.head) * Math.min(1, dt * 3);
      }
      // Herd mates step apart rather than standing inside each other.
      const herds = new Map<AnimalPlace, Animal[]>();
      for (const a of this.animals) { if (a.air || CIRCLING_BIRDS.has(a.species) || a.species === 'butterfly' || a.species === 'koi') continue; const herd = herds.get(a.place) || []; herd.push(a); herds.set(a.place, herd); }
      for (const herd of herds.values()) for (let i = 0; i < herd.length; i++) for (let j = i + 1; j < herd.length; j++) {
        const a = herd[i], b = herd[j];
        const gap = (LENGTH[a.species] + LENGTH[b.species]) * 0.4 / a.place.size, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= gap || d === 0) continue;
        const push = (gap - d) / 2 / d; a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
      }
      for (const a of this.animals) if (!a.range.ring) { a.x = Math.max(a.range.x[0], Math.min(a.range.x[1], a.x)); a.z = Math.max(a.range.z[0], Math.min(a.range.z[1], a.z)); }
    }
    this.draw();
  }

  // Where an animal is in the world and which way it faces.
  pose(a: Animal) {
    const p = a.place, sin = Math.sin(p.rotation), cos = Math.cos(p.rotation);
    if (CIRCLING_BIRDS.has(a.species)) {
      const swallow = a.species === 'swallow', angle = this.seconds * (swallow ? 0.8 : 0.5) + a.phase, r = (swallow ? 0.44 : 0.6) * p.size;
      return { position: new THREE.Vector3(p.center.x + Math.cos(angle) * r, p.ground + (swallow ? 0.65 * p.size : 0.45) + Math.sin(this.seconds + a.phase) * 0.05, p.center.z + Math.sin(angle) * r), heading: -angle };
    }
    return {
      position: new THREE.Vector3(p.center.x + (a.x * cos + a.z * sin) * p.size, p.ground + (a.range.lift || 0) * p.size + a.air, p.center.z + (-a.x * sin + a.z * cos) * p.size),
      heading: a.heading + p.rotation,
    };
  }

  private draw() {
    const b = this.batch; b.begin();
    for (const a of this.animals) {
      const { position, heading } = this.pose(a);
      const moving = a.mode === 'walk' || a.mode === 'run' || a.mode === 'fly';
      draw(b, a, position, heading, moving ? Math.sin(a.gait) : 0, this.seconds);
    }
    b.end();
  }
  dispose() { this.batch.dispose(); }
}

// ------------------------------------------------------------------------------------ models
// A point `x` right, `y` up and `z` ahead of an animal at `at` facing `heading`.
const at = (base: THREE.Vector3, heading: number, x: number, y: number, z: number) => new THREE.Vector3(base.x + x * Math.cos(heading) + z * Math.sin(heading), base.y + y, base.z - x * Math.sin(heading) + z * Math.cos(heading));
interface Beast { len: number; width: number; height: number; leg: number; legR: number; color: string; legColor?: string; head: [number, number, number]; headColor?: string; neck: number; muzzle?: string; ears?: string; horns?: string; tail?: string; spots?: string; mane?: string }
const BEASTS: Partial<Record<Species, Beast>> = {
  cow: { len: 0.2, width: 0.085, height: 0.075, leg: 0.06, legR: 0.008, color: '#f4f1ea', head: [0.045, 0.045, 0.06], neck: 0.03, muzzle: '#e8b3a8', ears: '#f4f1ea', horns: '#e6dcc0', tail: '#3a3330', spots: '#2b2725' },
  calf: { len: 0.12, width: 0.055, height: 0.05, leg: 0.045, legR: 0.006, color: '#b77a4b', head: [0.035, 0.035, 0.045], neck: 0.02, muzzle: '#e8b3a8', ears: '#b77a4b', tail: '#6d4a30' },
  horse: { len: 0.2, width: 0.07, height: 0.07, leg: 0.085, legR: 0.008, color: '#8a5a37', legColor: '#5b3b25', head: [0.035, 0.04, 0.075], neck: 0.07, ears: '#8a5a37', tail: '#2e2119', mane: '#2e2119' },
  pig: { len: 0.13, width: 0.075, height: 0.065, leg: 0.03, legR: 0.008, color: '#efb3a8', head: [0.05, 0.05, 0.045], neck: 0.005, muzzle: '#e39a90', ears: '#e39a90', tail: '#efb3a8' },
  sheep: { len: 0.12, width: 0.08, height: 0.075, leg: 0.04, legR: 0.006, color: '#f2efe6', legColor: '#2d2a28', head: [0.032, 0.035, 0.045], headColor: '#2d2a28', neck: 0.015, ears: '#2d2a28' },
  goat: { len: 0.1, width: 0.05, height: 0.05, leg: 0.05, legR: 0.005, color: '#e8e2d4', head: [0.03, 0.035, 0.05], neck: 0.035, ears: '#e8e2d4', horns: '#8a7a64', tail: '#e8e2d4' },
  dog: { len: 0.07, width: 0.035, height: 0.035, leg: 0.035, legR: 0.005, color: '#c8964f', head: [0.03, 0.03, 0.035], neck: 0.02, muzzle: '#3b2d22', ears: '#8a5a37', tail: '#c8964f' },
  cat: { len: 0.045, width: 0.025, height: 0.025, leg: 0.022, legR: 0.004, color: '#d98a3d', head: [0.025, 0.024, 0.022], neck: 0.01, ears: '#d98a3d', tail: '#d98a3d' },
  deer: { len: 0.14, width: 0.05, height: 0.055, leg: 0.08, legR: 0.006, color: '#a8754a', head: [0.03, 0.035, 0.05], neck: 0.06, muzzle: '#3b2d22', ears: '#a8754a', horns: '#d8c7a5', tail: '#f2ead8' },
  panda: { len: 0.14, width: 0.1, height: 0.09, leg: 0.04, legR: 0.018, color: '#f3f1ea', legColor: '#1f1f1f', head: [0.065, 0.06, 0.06], neck: 0.0, ears: '#1f1f1f' },
  fox: { len: 0.095, width: 0.035, height: 0.035, leg: 0.038, legR: 0.004, color: '#bf6632', legColor: '#352e2b', head: [0.03, 0.03, 0.042], neck: 0.018, muzzle: '#f5dfbf', ears: '#8c452d', tail: '#bf6632' },
};

function draw(b: PrimitiveBatch, a: Animal, base: THREE.Vector3, heading: number, swing: number, seconds: number) {
  if (a.species === 'butterfly') {
    const flap = Math.sin(seconds * 18 + a.phase) * 0.9, color = ['#efa948', '#69b6df', '#d18ce0'][Math.floor(a.phase) % 3];
    b.add('sphere', base, [0.004, 0.004, 0.025], '#443a35', heading);
    for (const side of [-1, 1]) {
      const wing = at(base, heading, side * Math.cos(flap) * 0.014, Math.abs(Math.sin(flap)) * 0.014, 0);
      b.add('sphere', wing, [0.028, 0.003, 0.032], color, heading, 0, side * flap);
      b.add('sphere', at(wing, heading, side * 0.003, 0.002, 0.005), [0.008, 0.004, 0.012], '#f6e5ae', heading, 0, side * flap);
    }
    return;
  }
  if (a.species === 'koi') {
    const p = (x: number, y: number, z: number) => at(base, heading, x, y, z), wag = Math.sin(seconds * 7 + a.phase) * 0.007;
    const color = a.phase > 5 ? '#e69242' : '#f4e3c9';
    b.add('sphere', p(0, 0.002, 0), [0.024, 0.012, 0.06], color, heading);
    b.add('sphere', p(0.002, 0.008, 0.009), [0.017, 0.004, 0.021], a.phase > 5 ? '#f6e5ce' : '#d66c3c', heading);
    for (const side of [-1, 1]) {
      b.add('box', p(wag + side * 0.006, 0.002, -0.035), [0.013, 0.003, 0.025], color, heading + side * 0.55);
      b.add('sphere', p(side * 0.007, 0.004, 0.021), 0.004, '#303737');
    }
    return;
  }
  if (a.species === 'rabbit' || a.species === 'squirrel' || a.species === 'hedgehog') return small(b, a, base, heading, swing, seconds);
  const beast = BEASTS[a.species];
  if (beast) return quadruped(b, a, beast, base, heading, swing, seconds);
  bird(b, a, base, heading, swing, seconds);
}

function quadruped(b: PrimitiveBatch, a: Animal, s: Beast, base: THREE.Vector3, heading: number, swing: number, seconds: number) {
  const p = (x: number, y: number, z: number) => at(base, heading, x, y, z), legColor = s.legColor || s.color;
  const resting = a.mode === 'rest', sitting = a.mode === 'sit';
  // Body: standing on its legs, lying on the ground, or sitting with its back end down.
  const lift = resting ? s.height * 0.45 : s.leg + s.height / 2 - (sitting ? s.leg * 0.45 : 0);
  const pitch = sitting ? -0.45 : 0;
  b.add('sphere', p(0, lift, 0), [s.width, s.height, s.len], s.color, heading, pitch);
  if (s.spots) for (const [x, z] of [[0.042, 0.03], [-0.04, -0.04], [0.035, -0.06]]) b.add('sphere', p(x, lift + 0.01, z), [0.012, 0.035, 0.05], s.spots, heading);
  if (a.species === 'panda') b.add('sphere', p(0, lift + 0.01, s.len * 0.18), [s.width * 1.03, s.height * 0.9, s.len * 0.3], '#1f1f1f', heading, pitch);
  if (!resting) {
    // Legs swing in diagonal pairs from the hips and shoulders.
    for (const [x, z, phase] of [[-1, 1, 1], [1, 1, -1], [-1, -1, -1], [1, -1, 1]] as const) {
      const folded = sitting && z < 0, hip = p(x * s.width * 0.3, lift - s.height * 0.3, z * s.len * 0.32);
      b.add('cyl', hip, [s.legR * 2, folded ? s.leg * 0.4 : s.leg, s.legR * 2], legColor, heading, folded ? Math.PI - 1.2 : Math.PI + swing * phase * 0.5);
    }
  }
  // Head: up and alert, or down at the grass.
  const down = a.head, neckTop = p(0, lift + s.height * 0.35, s.len * 0.42);
  const head = p(0, lift + s.height * 0.35 + s.neck * (1 - down) - (lift - s.head[1] * 0.4) * down, s.len * 0.5 + s.head[2] * 0.35 + s.neck * 0.4 * (1 - down) + s.neck * 0.2 * down);
  if (s.neck > 0.01) b.segment(neckTop, head, s.width * 0.18, s.color);
  const nod = down * 0.7 + (a.mode === 'idle' ? Math.sin(seconds * 0.7 + a.phase) * 0.15 : 0);
  b.add('sphere', head, s.head, s.headColor || s.color, heading + (a.mode === 'idle' ? Math.sin(seconds * 0.4 + a.phase) * 0.4 : 0), nod);
  const face = (x: number, y: number, z: number) => at(head, heading, x, y * Math.cos(nod) - z * Math.sin(nod), z * Math.cos(nod) + y * Math.sin(nod));
  if (s.muzzle) b.add('sphere', face(0, -s.head[1] * 0.15, s.head[2] * 0.42), [s.head[0] * 0.7, s.head[1] * 0.55, s.head[2] * 0.35], s.muzzle, heading, nod);
  if (a.species === 'pig') b.add('cyl', face(0, -s.head[1] * 0.05, s.head[2] * 0.45), [0.022, 0.012, 0.022], s.muzzle!, heading, nod + Math.PI / 2);
  if (s.ears) for (const x of [-1, 1]) b.add('sphere', face(x * s.head[0] * 0.5, s.head[1] * 0.35, -s.head[2] * 0.1), [s.head[0] * (a.species === 'panda' ? 0.35 : 0.3), s.head[1] * 0.3, s.head[2] * 0.2], s.ears, heading, 0, x * 0.4);
  if (a.species === 'panda') for (const x of [-1, 1]) b.add('sphere', face(x * s.head[0] * 0.22, s.head[1] * 0.08, s.head[2] * 0.4), [0.012, 0.014, 0.008], '#1f1f1f', heading);
  if (a.species === 'cat') for (const x of [-1, 1]) b.add('cone', face(x * s.head[0] * 0.3, s.head[1] * 0.3, 0), [0.01, 0.015, 0.008], s.color, heading, nod);
  if (s.horns && (a.species !== 'deer' || a.phase < 5)) for (const x of [-1, 1]) {
    const root = face(x * s.head[0] * 0.3, s.head[1] * 0.4, -s.head[2] * 0.15);
    if (a.species === 'deer') { b.segment(root, root.clone().add(new THREE.Vector3(x * 0.012 * Math.cos(heading), 0.05, -x * 0.012 * Math.sin(heading))), 0.003, s.horns); b.segment(root.clone().setY(root.y + 0.03), at(root, heading, x * 0.01, 0.045, 0.02), 0.0025, s.horns); }
    else b.add('cone', root, [0.008, a.species === 'goat' ? 0.03 : 0.018, 0.008], s.horns, heading, -0.6, x * 0.3);
  }
  if (s.mane) b.segment(neckTop.clone().setY(neckTop.y + s.width * 0.15), head.clone().setY(head.y + s.head[1] * 0.4), s.width * 0.1, s.mane);
  if (s.tail) {
    const root = p(0, lift + s.height * 0.2, -s.len * 0.48), wag = a.species === 'dog' ? Math.sin(seconds * 12) * 0.03 : Math.sin(seconds * 1.5 + a.phase) * 0.01;
    const up = a.species === 'dog' || a.species === 'cat' ? 0.03 : -s.height * 0.6;
    b.segment(root, at(root, heading, wag, up, -0.02), a.species === 'horse' ? 0.008 : 0.003, s.tail);
    if (a.species === 'fox') { b.add('sphere', at(root, heading, wag, -0.005, -0.03), [0.025, 0.025, 0.06], s.color, heading, -0.25); b.add('sphere', at(root, heading, wag, 0, -0.055), [0.017, 0.017, 0.025], '#f5dfbf', heading); }
  }
  if (a.species === 'panda' && sitting) b.segment(p(0.03, lift + 0.02, s.len * 0.4), p(0.05, lift + 0.09, s.len * 0.45), 0.004, '#7fa64d');
}

// Rabbits hop and squirrels scamper; both sit up with their ears or tail high.
function small(b: PrimitiveBatch, a: Animal, base: THREE.Vector3, heading: number, swing: number, _seconds: number) {
  if (a.species === 'hedgehog') {
    const p = (x: number, y: number, z: number) => at(base, heading, x, y, z);
    b.add('sphere', p(0, 0.014, 0), [0.035, 0.026, 0.045], '#6e5947', heading);
    b.add('sphere', p(0, 0.01, 0.023), [0.02, 0.018, 0.025], '#cbb399', heading);
    b.add('sphere', p(0, 0.01, 0.037), 0.006, '#282725');
    for (let i = -2; i <= 2; i++) b.add('cone', p(i * 0.006, 0.02, 0), [0.008, 0.014, 0.025], '#b89b77', heading, 0, i * -0.25);
    return;
  }
  const p = (x: number, y: number, z: number) => at(base, heading, x, y, z), rabbit = a.species === 'rabbit';
  const hop = Math.abs(swing) * (rabbit ? 0.025 : 0.01), color = rabbit ? '#c9b7a0' : '#a0603a', size = rabbit ? 0.035 : 0.025;
  const upright = a.mode === 'sit' ? 0.7 : 0;
  b.add('sphere', p(0, size * 0.5 + hop, 0), [size * 0.75, size * 0.7, size], color, heading, -upright);
  const head = p(0, size * (0.8 + upright * 0.5) + hop, size * (0.5 - upright * 0.2));
  b.add('sphere', head, size * 0.55, color, heading);
  if (rabbit) { for (const x of [-1, 1]) b.add('sphere', at(head, heading, x * 0.006, 0.02, -0.004), [0.006, 0.025, 0.008], color, heading, -0.2, x * 0.2); b.add('sphere', p(0, size * 0.5 + hop, -size * 0.5), 0.012, '#f6f2ea'); }
  else b.add('sphere', p(0, size * 1.1 + hop, -size * 0.6), [size * 0.6, size * 1.3, size * 0.5], '#b8784e', heading, 0.4);
}

function bird(b: PrimitiveBatch, a: Animal, base: THREE.Vector3, heading: number, swing: number, seconds: number) {
  const p = (x: number, y: number, z: number) => at(base, heading, x, y, z);
  const flying = CIRCLING_BIRDS.has(a.species) || a.mode === 'fly' && a.air > 0.01, flap = flying ? Math.sin(seconds * (a.species === 'gull' ? 5 : 14) + a.phase) * 0.6 : 0;
  const peck = a.head * Math.max(0, Math.sin(seconds * 6 + a.phase));
  const spec = {
    chicken: { body: [0.03, 0.03, 0.04], color: a.phase > 5 ? '#f3efe4' : '#b8673a', leg: 0.018, head: 0.016, neck: [0.022, 0.016] },
    duck: { body: [0.026, 0.02, 0.045], color: '#8a6b4c', leg: 0, head: 0.017, neck: [0.016, 0.02] },
    goose: { body: [0.035, 0.03, 0.06], color: '#f4f2ec', leg: 0.016, head: 0.018, neck: [0.045, 0.03] },
    heron: { body: [0.03, 0.03, 0.055], color: '#9aa5ab', leg: 0.06, head: 0.014, neck: [0.06, 0.02] },
    pigeon: { body: [0.02, 0.018, 0.03], color: '#8c93a0', leg: 0.008, head: 0.012, neck: [0.012, 0.012] },
    gull: { body: [0.025, 0.022, 0.05], color: '#f7f7f4', leg: 0, head: 0.016, neck: [0.012, 0.022] },
    sparrow: { body: [0.018, 0.018, 0.028], color: '#a3784f', leg: 0.008, head: 0.011, neck: [0.01, 0.009] },
    crow: { body: [0.03, 0.03, 0.055], color: '#303b49', leg: 0.014, head: 0.017, neck: [0.015, 0.018] },
    swallow: { body: [0.018, 0.016, 0.04], color: '#254964', leg: 0, head: 0.011, neck: [0.01, 0.015] },
    parrot: { body: [0.025, 0.03, 0.045], color: a.phase > 5 ? '#4aab69' : '#e65f4e', leg: 0.01, head: 0.017, neck: [0.02, 0.012] },
    flamingo: { body: [0.04, 0.035, 0.065], color: '#efa4b2', leg: 0.075, head: 0.016, neck: [0.075, 0.018] },
    peacock: { body: [0.04, 0.04, 0.07], color: '#247992', leg: 0.025, head: 0.015, neck: [0.04, 0.015] },
  }[a.species as 'chicken'];
  const [w, h, l] = spec.body, legs = flying ? 0 : spec.leg, y = legs + h * 0.5;
  b.add('sphere', p(0, y, 0), [w, h, l], spec.color, heading, a.species === 'chicken' ? -0.15 : 0);
  if (legs) for (const x of [-1, 1]) b.add('cyl', p(x * w * 0.2, y - h * 0.3, 0), [0.003, legs, 0.003], a.species === 'heron' ? '#5c6166' : '#e8a33a', heading, Math.PI + swing * x * 0.5);
  const head = p(0, y + spec.neck[0] - peck * (y + spec.neck[0] - 0.01), l * 0.35 + spec.neck[1] + peck * 0.01);
  if (spec.neck[0] > 0.03) b.segment(p(0, y + h * 0.2, l * 0.3), head, 0.005, spec.color);
  const headColor = a.species === 'duck' ? '#2f6b48' : spec.color;
  b.add('sphere', head, spec.head, headColor);
  b.add('cone', at(head, heading, 0, -0.002, spec.head * 0.45), [spec.head * 0.4, a.species === 'heron' ? 0.035 : spec.head * 0.8, spec.head * 0.3], a.species === 'pigeon' || a.species === 'heron' ? '#d9b44a' : '#e8932f', heading, Math.PI / 2 + peck * 0.6);
  if (a.species === 'chicken') { b.add('box', at(head, heading, 0, spec.head * 0.45, 0), [0.003, 0.009, 0.012], '#d6332b', heading); b.add('cone', p(0, y + h * 0.2, -l * 0.5), [0.018, 0.025, 0.01], a.phase > 5 ? '#efe8d6' : '#3b2a20', heading, -0.6); }
  if (a.species === 'duck') b.add('sphere', p(0, y + h * 0.1, 0), [w * 1.02, h * 0.3, l * 0.5], '#f2efe6', heading);
  if (a.species === 'swallow') for (const x of [-1, 1]) b.add('box', p(x * 0.009, y, -0.028), [0.006, 0.003, 0.035], '#254964', heading + x * 0.35);
  if (a.species === 'parrot') { b.add('cone', p(0, y, -0.028), [0.015, 0.045, 0.008], '#2c82a3', heading, -Math.PI / 2); b.add('sphere', head.clone().add(new THREE.Vector3(0, 0.006, 0)), spec.head * 0.6, '#f2cc58'); }
  if (a.species === 'peacock') {
    const display = a.mode === 'sit' || a.mode === 'idle';
    for (let i = 0; i < 9; i++) { const angle = (i - 4) * (display ? 0.23 : 0.06), tip = p(Math.sin(angle) * 0.1, y + (display ? Math.cos(angle) * 0.1 : 0.015), -0.045 - (display ? 0 : 0.075)); b.segment(p(0, y, -0.025), tip, 0.009, i % 2 ? '#41865b' : '#38766c'); b.add('sphere', tip, [0.013, 0.016, 0.007], '#c5b467', heading); b.add('sphere', tip.clone().addScaledVector(new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)), 0.004), 0.006, '#28538a'); }
  }
  if (flying || a.species === 'gull') for (const x of [-1, 1]) b.add('box', at(p(0, y + h * 0.2, 0), heading, x * (a.species === 'gull' ? 0.04 : 0.025), 0, 0), [a.species === 'gull' ? 0.08 : 0.05, 0.003, l * 0.5], a.species === 'gull' ? '#c7ccd1' : spec.color, heading, 0, x * flap);
  else b.add('sphere', p(0, y + h * 0.15, -l * 0.05), [w * 1.05, h * 0.6, l * 0.75], a.species === 'pigeon' ? '#6f7683' : spec.color, heading);
}
