import * as THREE from 'three';
import type { ActivityPose, RecreationPlace } from './recreation';
import { tractorDriver } from './farmVehicles';

// What residents do at every kind of facility other than the sports venues in recreation.ts:
// fishing off a jetty, boat trips, dining outside, browsing stalls, farm work, picnics,
// feeding ducks, concerts, queues for the cinema, waiting for the bus, fire drills and more.
// Each activity is a set of slots (one resident each) whose pose is a pure function of the
// place and an accumulated animation clock, so pausing freezes everything exactly.
//
// Coordinates: x/z are the building's own plot coordinates (-0.5..0.5, front +z faces the
// road), scaled by its footprint like the models. Heights are in world units.

export type HeldItem = 'cup' | 'phone' | 'book' | 'bag' | 'flowers' | 'icecream' | 'basket' | 'hoe' | 'can' | 'binoculars' | 'brush' | 'ticket'
  | 'crate' | 'hay' | 'hammer' | 'clipboard' | 'guitar' | 'mic' | 'bread' | 'parcel' | 'suitcase' | 'hose' | 'coin' | 'trashbag';
export interface RodLine { pitch: number; float: THREE.Vector3; fish: boolean }
export type BoatKind = 'row' | 'sail' | 'motor' | 'fishing' | 'lifeboat' | 'ferry';
// Where a waterfront building meets the water: a jetty runs `out` from `shore`, boats tie up
// at `dock` and sail `loop` (closed, starting and ending at the dock) when it fits the water.
export interface WaterAccess { shore: THREE.Vector3; out: THREE.Vector3; side: THREE.Vector3; dock: THREE.Vector3; loop: THREE.Vector3[] | null }

type Kind = 'dining' | 'window' | 'market' | 'field' | 'paddy' | 'orchard' | 'barnyard' | 'greenhouse' | 'garden' | 'picnic' | 'ducks' | 'birdwatch'
  | 'jog' | 'fountain' | 'concert' | 'queue' | 'painting' | 'steps' | 'lookup' | 'waiting' | 'cycling' | 'firedrill' | 'patrol' | 'schoolyard'
  | 'campus' | 'chat' | 'bench' | 'instruments' | 'tinker' | 'cargo' | 'repair' | 'fishing' | 'boat';

const KINDS: Record<string, Kind> = {};
const assign = (kind: Kind, types: string) => types.split(' ').forEach(type => { KINDS[type] = kind; });
assign('dining', 'cafe bakery teahouse noodleshop icecreamparlour pizzeria sushibar foodcourt brewpub seafrontrestaurant banquethall');
assign('window', 'shop bookshop florist bikeshop tailor electronicsstore departmentstore citymall baitshop');
assign('market', 'market farmersmarket antiquearcade fishauction shoppinggalleria');
assign('field', 'wheatfield vegetablepatch flowerfarm communityallotment');
assign('paddy', 'ricepaddy');
assign('orchard', 'appleorchard vineyard');
assign('barnyard', 'redbarn dairyfarm graincooperative');
assign('greenhouse', 'glassgreenhouse botanicalgarden biotechcampus');
assign('garden', 'park pocketgarden rosegarden sculpturegarden');
assign('picnic', 'picnicgrove');
assign('ducks', 'duckpond');
assign('birdwatch', 'wetlandreserve');
assign('jog', 'urbanforest bamboogrove');
assign('fountain', 'fountain');
assign('concert', 'bandstand');
assign('queue', 'cinema theatre concerthall airport');
assign('painting', 'communitygallery artsstudio');
assign('steps', 'publiclibrary localmuseum');
assign('lookup', 'clocktower observatory');
assign('waiting', 'busstop tramstop taxistand metroentrance railwaystation interchange busdepot parkinggarage skyhotel');
assign('cycling', 'bikestation');
assign('firedrill', 'firestation');
assign('patrol', 'policestation');
assign('schoolyard', 'school nursery');
assign('campus', 'university');
assign('chat', 'communityhall courthouse office innovationhub researchlab bank vault creditunion glasstower financialtower metropolisspire datacentre fusioninstitute');
assign('bench', 'clinic medicalcentre generalhospital emergencycentre');
assign('instruments', 'weatherstation powerplant windmill solar watertower pump solarcanopy waterreclamation');
assign('tinker', 'roboticsworkshop');
assign('cargo', 'containeryard harbourcrane coastalwarehouse logisticshub factory workshop smokehouse recyclingcentre');
assign('repair', 'shiprepair netmakers');
assign('fishing', 'anglershut fishingjetty lighthouse aquaculture');
assign('boat', 'harbourmaster oysterhatchery sailingclub marinaoffice fishingboathouse trawlerdepot lifeboatstation ferryterminal cruiseterminal');

const BOATS: Record<string, BoatKind> = {
  harbourmaster: 'row', oysterhatchery: 'row', sailingclub: 'sail', marinaoffice: 'motor', fishingboathouse: 'fishing', trawlerdepot: 'fishing',
  lifeboatstation: 'lifeboat', ferryterminal: 'ferry', cruiseterminal: 'ferry',
};
export const ACTIVITY_TYPES = new Set(Object.keys(KINDS));
// Activities that need the water beside the building.
export const WATER_ACTIVITY_TYPES = new Set(Object.keys(KINDS).filter(type => KINDS[type] === 'fishing' || KINDS[type] === 'boat'));
export const boatKind = (type: string): BoatKind | null => BOATS[type] || null;
export const activityKind = (type: string) => KINDS[type] || null;

const CAPACITY: Partial<Record<Kind, number>> = { dining: 4, window: 3, market: 5, field: 4, paddy: 3, orchard: 4, barnyard: 2, greenhouse: 3, garden: 4, picnic: 4, ducks: 3, birdwatch: 3, jog: 4, fountain: 4, concert: 6, queue: 5, painting: 3, steps: 4, lookup: 3, waiting: 5, cycling: 3, firedrill: 3, patrol: 2, schoolyard: 6, campus: 5, chat: 4, bench: 3, instruments: 2, tinker: 2, cargo: 3, repair: 3, fishing: 3 };
const BOAT_SEATS: Record<BoatKind, number> = { row: 2, sail: 3, motor: 3, fishing: 3, lifeboat: 3, ferry: 8 };
export function activityCapacity(place: RecreationPlace) {
  if (place.helipad) return 2;
  const kind = KINDS[place.type]; if (!kind) return 0;
  if ((kind === 'fishing' || kind === 'boat') && !place.water) return 0;
  return kind === 'boat' ? BOAT_SEATS[BOATS[place.type]] : CAPACITY[kind] || 0;
}

// ----------------------------------------------------------------------------------- geometry
export const WATER_LEVEL = -0.07;
const PAVEMENT_TOP = 0.079; // the raised pavement (pavement.ts) plus a shoe's thickness
export const DECK_TOP = 0.045;
// A seated figure's root sits this far below the seat: hip pivot and thigh, at average height.
const SEAT_DROP = 0.074;
const ground = (place: RecreationPlace) => 0.035 * place.size + 0.002;
const toWorld = (place: RecreationPlace, x: number, z: number, y: number) => {
  const sin = Math.sin(place.rotation), cos = Math.cos(place.rotation);
  return new THREE.Vector3(place.center.x + (x * cos + z * sin) * place.size, y, place.center.z + (-x * sin + z * cos) * place.size);
};
const toLocal = (place: RecreationPlace, p: THREE.Vector3) => {
  const sin = Math.sin(place.rotation), cos = Math.cos(place.rotation), dx = (p.x - place.center.x) / place.size, dz = (p.z - place.center.z) / place.size;
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
};
const headingOf = (v: THREE.Vector3) => Math.atan2(v.x, v.z);
const hash = (text: string) => { let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0; return Math.abs(h); };

// Common bodies (see people.ts for the joint conventions: negative thighs/arms swing forward).
const SIT = { thighs: [-1.5, -1.5] as [number, number], knees: [-1.45, -1.45] as [number, number] };
const SIT_GROUND = { thighs: [-1.5, -1.45] as [number, number], knees: [-0.1, -0.25] as [number, number] };
const CROUCH = { torsoPitch: 0.75, thighs: [-1.1, -1.25] as [number, number], knees: [-1.45, -1.6] as [number, number] };
const KNEEL = { thighs: [-0.2, -1.4] as [number, number], knees: [-1.7, -1.4] as [number, number] };

interface Spec extends Omit<ActivityPose, 'position' | 'heading' | 'scale' | 'walking'> { walking?: boolean; x?: number; z?: number; at?: THREE.Vector3; y?: number; heading: number; worldHeading?: boolean; scale?: number }
const finish = (place: RecreationPlace, spec: Spec): ActivityPose => {
  const { x = 0, z = 0, at, y, heading, worldHeading, scale = 1, ...pose } = spec;
  const position = at ? at.clone() : toWorld(place, x, z, y ?? ground(place));
  if (at && y !== undefined) position.y = y;
  return { scale, walking: false, ...pose, position, heading: worldHeading ? heading : heading + place.rotation };
};
// Following a closed loop around the plot (local coordinates), facing the way of travel.
const loop = (radiusX: number, radiusZ: number, t: number, cx = 0, cz = 0) => {
  const x = cx + Math.cos(t) * radiusX, z = cz + Math.sin(t) * radiusZ;
  return { x, z, heading: Math.atan2(-Math.sin(t) * radiusX, Math.cos(t) * radiusZ) };
};
// Pacing back and forth along x at depth z.
const pace = (from: number, to: number, z: number, speed: number, t: number) => {
  const length = Math.abs(to - from), cycle = (t * speed) % (2 * length), forward = cycle < length;
  return { x: from + Math.sign(to - from) * (forward ? cycle : 2 * length - cycle), z, heading: (forward === to > from) ? Math.PI / 2 : -Math.PI / 2 };
};

// ---------------------------------------------------------------------------------- boats
interface Route { points: THREE.Vector3[]; lengths: number[]; total: number }
const routes = new WeakMap<THREE.Vector3[], Route>();
const route = (points: THREE.Vector3[]) => {
  let r = routes.get(points);
  if (!r) { const lengths = [0]; for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1])); r = { points, lengths, total: lengths.at(-1)! }; routes.set(points, r); }
  return r;
};
const BOAT_SPEED: Record<BoatKind, number> = { row: 0.14, sail: 0.24, motor: 0.38, fishing: 0.2, lifeboat: 0.45, ferry: 0.2 };
export const BOAT_SIZE: Record<BoatKind, { length: number; width: number; height: number; color: string }> = {
  row: { length: 0.32, width: 0.13, height: 0.05, color: '#a8754d' },
  sail: { length: 0.42, width: 0.15, height: 0.055, color: '#eef0ea' },
  motor: { length: 0.42, width: 0.16, height: 0.06, color: '#f4f2ec' },
  fishing: { length: 0.5, width: 0.18, height: 0.07, color: '#3f7f8c' },
  lifeboat: { length: 0.46, width: 0.17, height: 0.065, color: '#e2742f' },
  ferry: { length: 1.0, width: 0.3, height: 0.09, color: '#f2f0e8' },
};
const DOCKED = 8, FISHING_STOP = 14, SIGHTSEEING_STOP = 10;
export interface BoatTrip { elapsed: number; active: boolean; unloading: boolean; completed: number }
export interface BoatState {
  position: THREE.Vector3; heading: number; docked: boolean; fishing: boolean; sightseeing: boolean; cycle: number; tilt: number;
  phase: 'boarding' | 'outbound' | 'fishing' | 'sightseeing' | 'returning' | 'unloading';
}
export function boatTripDuration(place: RecreationPlace) {
  const kind = BOATS[place.type];
  return !kind || !place.water?.loop ? 25 : DOCKED + route(place.water.loop).total / BOAT_SPEED[kind] + (kind === 'fishing' ? FISHING_STOP : SIGHTSEEING_STOP);
}
// A voyage starts when the first resident boards. Everyone shares its clock and waits for
// the return before disembarking; late arrivals wait on the jetty for the next voyage.
export function boatState(place: RecreationPlace, seconds: number, sailing = true): BoatState | null {
  const kind = BOATS[place.type], water = place.water; if (!kind || !water) return null;
  const bob = Math.sin(seconds * 1.7 + hash(place.id)) * 0.004;
  const moored = (heading: number): BoatState => ({ position: water.dock.clone().setY(WATER_LEVEL + bob), heading, docked: true, fishing: false, sightseeing: false, cycle: 0, tilt: bob * 4, phase: 'boarding' });
  const dockHeading = water.loop ? headingOf(water.loop[1].clone().sub(water.loop[0])) : headingOf(water.side);
  if (!water.loop) return { ...moored(dockHeading), phase: place.boatTrip?.unloading ? 'unloading' : 'boarding' };
  const r = route(water.loop), travel = r.total / BOAT_SPEED[kind], stop = kind === 'fishing' ? FISHING_STOP : SIGHTSEEING_STOP, period = DOCKED + travel + stop;
  const trip = place.boatTrip, cycle = trip ? trip.elapsed : (seconds + hash(place.id) % 17) % period;
  if (trip?.unloading) return { ...moored(dockHeading), cycle, phase: 'unloading' };
  if (!sailing || trip && !trip.active || cycle < DOCKED) return { ...moored(dockHeading), cycle };
  let moving = cycle - DOCKED, stopped = false;
  if (moving > travel / 2) { if (moving < travel / 2 + stop) { moving = travel / 2; stopped = true; } else moving -= stop; }
  const fishing = stopped && kind === 'fishing', sightseeing = stopped && !fishing;
  const distance = Math.min(r.total, moving * BOAT_SPEED[kind]);
  let i = 1; while (i < r.lengths.length - 1 && r.lengths[i] < distance) i++;
  const a = r.points[i - 1], b = r.points[i], f = (distance - r.lengths[i - 1]) / Math.max(0.0001, r.lengths[i] - r.lengths[i - 1]);
  const position = a.clone().lerp(b, f).setY(WATER_LEVEL + bob);
  return { position, heading: headingOf(b.clone().sub(a)), docked: false, fishing, sightseeing, cycle, tilt: stopped ? bob * 4 : 0.025, phase: fishing ? 'fishing' : sightseeing ? 'sightseeing' : moving < travel / 2 ? 'outbound' : 'returning' };
}
const seatsFor = (kind: BoatKind, count: number) => {
  const { length } = BOAT_SIZE[kind];
  if (kind === 'ferry') return Array.from({ length: count }, (_, i) => [(i % 2 ? 1 : -1) * 0.075, length * (0.28 - Math.floor(i / 2) * 0.13)] as [number, number]);
  return Array.from({ length: count }, (_, i) => [0, length * (0.22 - i * 0.24)] as [number, number]);
};
export const boatSeat = (place: RecreationPlace, slot: number, state: BoatState, lift = 0) => {
  const kind = BOATS[place.type]!, [sx, sz] = seatsFor(kind, BOAT_SEATS[kind])[slot] || [0, 0], { height } = BOAT_SIZE[kind];
  const sin = Math.sin(state.heading), cos = Math.cos(state.heading);
  return new THREE.Vector3(state.position.x + sx * cos + sz * sin, state.position.y + height * 0.55 + lift, state.position.z - sx * sin + sz * cos);
};

// Finds the shore beside a building and a loop of open water for its boats. `isWater` takes
// world x/z. Returns null when no side of the footprint touches water.
export function waterAccess(center: THREE.Vector3, size: number, isWater: (x: number, z: number) => boolean, boat: BoatKind | null = null): WaterAccess | null {
  const candidates: Array<{ shore: THREE.Vector3; out: THREE.Vector3; open: number }> = [];
  for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const out = new THREE.Vector3(dx, 0, dz), side = new THREE.Vector3(dz, 0, -dx);
    for (let k = 0; k < size; k++) {
      const along = k - (size - 1) / 2, shore = center.clone().addScaledVector(out, size / 2).addScaledVector(side, along);
      if (!isWater(shore.x + out.x * 0.5, shore.z + out.z * 0.5)) continue;
      let open = 0; for (let step = 0.5; step <= 4; step += 0.5) { const p = shore.clone().addScaledVector(out, step); if (!isWater(p.x, p.z)) break; open++; }
      candidates.push({ shore, out, open });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.open - a.open);
  const boatLength = BOAT_SIZE[boat || 'row'].length;
  const margin = 0.22 + boatLength / 3;
  const offsets = [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin], ...[-1, 1].flatMap(x => [-1, 1].map(z => [x * margin * 0.7071, z * margin * 0.7071]))];
  const clear = (p: THREE.Vector3) => offsets.every(([x, z]) => isWater(p.x + x, p.z + z));
  const segmentClear = (a: THREE.Vector3, b: THREE.Vector3) => {
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.1));
    for (let i = 0; i <= steps; i++) if (!clear(a.clone().lerp(b, i / steps))) return false;
    return true;
  };
  let fallback: WaterAccess | null = null;
  for (const candidate of candidates) {
    const { out } = candidate, shore = candidate.shore.clone().setY(DECK_TOP), side = new THREE.Vector3(out.z, 0, -out.x);
    for (const reach of boat ? [0.64, 0.96, 1.28, 1.6] : [0.64]) {
      const dock = shore.clone().addScaledVector(out, reach).setY(WATER_LEVEL);
      fallback ||= { shore, out, side, dock, loop: null };
      // A short pier can put the bow against a jagged bank. Extend it into the same water
      // before looking for a trip, without crossing another bank or a dry island.
      let approach = true;
      for (let d = 0.5; d <= reach; d += 0.1) { const p = shore.clone().addScaledVector(out, d); if (!isWater(p.x, p.z)) { approach = false; break; } }
      if (!approach || !clear(dock)) continue;
      for (const [along, across] of [[3.6, 1.8], [2.4, 1.3], [1.8, 1], [1.3, 0.75], [0.9, 0.5]]) {
        if (boat === 'row' && along > 1.3) continue;
        if (boat === 'ferry' && along < 1.3) break;
        const points = Array.from({ length: 29 }, (_, i) => {
          const a = i / 28 * Math.PI * 2;
          return dock.clone().addScaledVector(out, along * (1 - Math.cos(a))).addScaledVector(side, across * Math.sin(a));
        });
        if (points.every((p, i) => !i || segmentClear(points[i - 1], p))) return { shore, out, side, dock, loop: points };
      }
      if (!boat) continue;
      // Rivers and irregular lake edges often cannot fit an ellipse. Find connected open
      // water instead, then return along that safe channel. Every segment clears the hull.
      const step = 0.4, radius = boat === 'row' ? 3 : 7.2;
      const nodes = [{ point: dock, x: 0, z: 0, parent: -1 }], seen = new Set(['0,0']);
      let farthest = 0, distance = 0;
      for (let i = 0; i < nodes.length && nodes.length < 1200; i++) {
        const node = nodes[i];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const x = node.x + dx, z = node.z + dz, key = `${x},${z}`, d = (x * x + z * z) * step * step;
          if (seen.has(key) || d > radius * radius) continue;
          const point = dock.clone().add(new THREE.Vector3(x * step, 0, z * step));
          if (!segmentClear(node.point, point)) continue;
          seen.add(key);
          nodes.push({ point, x, z, parent: i });
          if (d > distance) { distance = d; farthest = nodes.length - 1; }
        }
      }
      if (distance >= 1.5 * 1.5) {
        const path: THREE.Vector3[] = [];
        for (let i = farthest; i >= 0; i = nodes[i].parent) path.unshift(nodes[i].point);
        return { shore, out, side, dock, loop: [...path, ...path.slice(0, -1).reverse()] };
      }
    }
  }
  return fallback;
}

// --------------------------------------------------------------------------------- poses
const deckEnd = (water: WaterAccess, along: number, across = 0) => water.shore.clone().addScaledVector(water.out, along).addScaledVector(water.side, across).setY(DECK_TOP);
const rodPitch = (t: number) => (t < 1 ? 0.35 + t * 0.6 : t < 11 ? 0.95 + Math.sin(t * 1.3) * 0.03 : t < 12.5 ? 0.4 : 0.55);

// The front door of a building, just inside its facade, where a visitor going up to the roof
// takes the lift.
export const liftDoor = (place: RecreationPlace) => new THREE.Vector3(place.center.x + Math.sin(place.rotation) * place.size * 0.18, ground(place), place.center.z + Math.cos(place.rotation) * place.size * 0.18);
// Waiting for a helicopter beside the roof's helipad, out of the hatch and off the landing ring.
function rooftopPose(place: RecreationPlace, slot: number, seconds: number): ActivityPose {
  const { pad, hatch } = place.helipad!, toPad = pad.clone().sub(hatch).setY(0).normalize(), side = new THREE.Vector3(toPad.z, 0, -toPad.x);
  const position = hatch.clone().addScaledVector(toPad, -0.02).addScaledVector(side, slot ? 0.07 : -0.07).setY(pad.y);
  const check = (seconds + slot * 3) % 9 < 4;
  return { position, heading: Math.atan2(toPad.x, toPad.z) + Math.sin(seconds * 0.3 + slot) * 0.3, walking: false, scale: 1, arms: [-0.15, check ? -0.75 : -0.2], elbows: [-0.2, check ? -1.3 : -0.3], hold: check ? 'phone' : 'suitcase' };
}

// Queueing along the pavement at a stop, under the shelter, looking up the road for the bus.
function pavementQueue(place: RecreationPlace, slot: number, seconds: number): ActivityPose {
  const t = seconds + slot * 1.7, check = (t % 9) < 4, along = new THREE.Vector3(Math.cos(place.rotation), 0, -Math.sin(place.rotation));
  const position = place.center.clone().addScaledVector(along, (slot - 2) * 0.065).setY(PAVEMENT_TOP);
  return { position, heading: place.rotation + Math.sin(t * 0.25) * 0.5, walking: false, scale: 1, arms: [-0.15, check ? -0.75 : -0.15], elbows: [-0.2, check ? -1.3 : -0.25], hold: slot === 3 ? 'suitcase' : check ? 'phone' : undefined };
}

export function leisurePose(place: RecreationPlace, slot: number, seconds: number): ActivityPose {
  if (place.pavementStop) return pavementQueue(place, slot, seconds);
  if (place.helipad) return rooftopPose(place, slot, seconds);
  const driver = slot === 0 ? tractorDriver(place, seconds) : null;
  if (driver) return driver;
  const kind = KINDS[place.type], g = ground(place), t = seconds + slot * 1.7, wave = Math.sin(t * 4), slow = Math.sin(t * 0.9);
  const base = { heading: 0 } as Spec;
  switch (kind) {
    case 'dining': {
      // Two to a table on the forecourt, facing each other, eating and talking.
      const table = slot >> 1, facingLeft = slot % 2 === 1, bite = (t % 6) < 1.2;
      const tableAt = toWorld(place, table ? 0.24 : -0.24, 0.37, 0);
      const offset = new THREE.Vector3(facingLeft ? 0.075 : -0.075, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), place.rotation);
      return finish(place, { ...SIT, at: tableAt.add(offset), y: g + 0.045 - SEAT_DROP, heading: facingLeft ? -Math.PI / 2 : Math.PI / 2,
        arms: [-0.55, bite ? -0.6 : -0.5 + Math.max(0, wave) * 0.3], elbows: [-1.1, bite ? -2.3 : -1.2], torsoPitch: 0.12,
        hold: place.type === 'icecreamparlour' ? 'icecream' : place.type === 'bakery' ? 'bread' : 'cup' });
    }
    case 'window': {
      const x = (slot - 1) * 0.2 + Math.sin(t * 0.25) * 0.04, point = (t % 9) < 2;
      return finish(place, { x, z: 0.34, heading: Math.PI + Math.sin(t * 0.3) * 0.3, arms: [point ? -1.4 : -0.15, -0.25], elbows: [point ? -0.2 : -0.3, -0.9], torsoPitch: 0.05, hold: place.type === 'florist' ? 'flowers' : place.type === 'bookshop' ? 'book' : 'bag' });
    }
    case 'market': {
      const reach = (t % 5) < 1.5;
      return finish(place, { x: -0.32 + slot * 0.16, z: 0.36 + (slot % 2) * 0.05, heading: Math.PI + slow * 0.25, arms: [reach ? -1.3 : -0.2, -0.35], elbows: [reach ? -0.3 : -0.2, -0.9], torsoPitch: reach ? 0.25 : 0.05, hold: 'basket' });
    }
    case 'field': {
      const row = pace(-0.32, 0.28, -0.3 + slot * 0.19, 0.03, t), hoeing = slot % 2 === 0, chop = Math.max(0, Math.sin(t * 2.4));
      return finish(place, hoeing
        ? { x: row.z, z: row.x, heading: row.heading - Math.PI / 2, torsoPitch: 0.35, arms: [-0.6 - chop * 0.8, -0.6 - chop * 0.8], elbows: [-0.5, -0.5], knees: [-0.15, -0.15], hold: 'hoe', hat: '#d8bf73' }
        : { x: row.z, z: row.x, heading: row.heading - Math.PI / 2, ...CROUCH, y: g - 0.022, arms: [-0.9, -0.7 + wave * 0.1], elbows: [-0.3, -0.5], hold: 'can', hat: '#d8bf73' });
    }
    case 'paddy': {
      const row = pace(0.3, -0.3, -0.25 + slot * 0.25, 0.02, t), dip = Math.max(0, Math.sin(t * 1.6));
      return finish(place, { x: row.z, z: row.x, heading: row.heading - Math.PI / 2, torsoPitch: 1.0, thighs: [-0.35, -0.35], knees: [-0.3, -0.3], y: g - 0.012, arms: [-1.4 + dip * 0.4, -0.9], elbows: [-0.2, -0.3], hat: '#e3cf8b' });
    }
    case 'orchard': {
      const picking = (t % 7) < 4, x = (slot % 2 ? 0.22 : -0.22), z = slot < 2 ? -0.18 : 0.18;
      return finish(place, { x, z, heading: slot % 2 ? -Math.PI / 2 : Math.PI / 2, arms: [picking ? -2.7 + wave * 0.1 : -0.3, picking ? -2.4 : -0.6], elbows: [-0.2, picking ? -0.3 : -0.9], armSplay: 0.15, hold: 'basket', hat: '#cfb26a' });
    }
    case 'barnyard': {
      // Feed carriers use the yard; grain handlers go beside the warehouse. Keep the
      // tractor's front access lane clear instead of sending workers through its wheels.
      const walk = pace(-0.3, 0.3, place.type === 'dairyfarm' ? 0.3 : 0.26, 0.07, t);
      if (place.type === 'graincooperative') { walk.z = walk.x; walk.x = -0.44; walk.heading -= Math.PI / 2; }
      return finish(place, { ...walk, walking: true, arms: [-1.2, -1.2], elbows: [-0.6, -0.6], hold: 'hay', hat: '#c8a85c' });
    }
    case 'greenhouse': {
      const walk = pace(-0.3, 0.3, 0.32 + slot * 0.04, 0.035, t + slot * 4), pausing = (t % 8) < 3;
      return finish(place, { ...walk, walking: !pausing, arms: [pausing ? -1.0 : -0.2, -0.5], elbows: [-0.3, -0.7], torsoPitch: pausing ? 0.3 : 0, hold: 'can' });
    }
    case 'garden': {
      if (slot === 2) return finish(place, { ...SIT, x: 0.27, z: 0.38, y: g + 0.045 - SEAT_DROP, heading: Math.PI, arms: [-0.7, -0.75], elbows: [-0.9, -0.9], hold: 'book' });
      if (slot === 3) return finish(place, { ...CROUCH, x: -0.25, z: -0.1, y: g - 0.022, heading: 0.4, arms: [-1.3, -1.25], elbows: [-0.9, -0.9], hold: 'phone' });
      const p = loop(0.33, 0.3, t * 0.12 + slot * Math.PI);
      return finish(place, { ...p, walking: true });
    }
    case 'picnic': {
      const a = slot * Math.PI / 2 + 0.3, eat = (t % 5) < 1;
      return finish(place, { ...SIT_GROUND, x: Math.sin(a) * 0.14, z: 0.05 + Math.cos(a) * 0.14, y: g - 0.072, heading: a + Math.PI, arms: [-0.6, eat ? -0.7 : -0.5], elbows: [-0.6, eat ? -2.3 : -0.8], torsoPitch: 0.1, hold: slot % 2 ? 'bread' : 'cup' });
    }
    case 'ducks': {
      const spots = [[-0.12, 0.3], [0.14, 0.3], [0.36, 0.02]], [x, z] = spots[slot] || spots[0], toss = (t % 3) < 0.6;
      return finish(place, { x, z, heading: Math.atan2(-x, -z), arms: [-0.2, toss ? -1.6 : -0.5], elbows: [-0.3, toss ? -0.1 : -1.0], torsoPitch: 0.08, hold: 'bread' });
    }
    case 'birdwatch': {
      const look = (t % 10) < 7;
      return finish(place, { x: -0.25 + slot * 0.22, z: 0.12 + (slot % 2) * 0.1, heading: Math.PI + Math.sin(t * 0.2) * 0.5, arms: look ? [-1.35, -1.35] : [-0.1, -0.2], elbows: look ? [-1.7, -1.7] : [-0.2, -0.2], armSplay: look ? 0.35 : 0.06, torsoPitch: look ? -0.08 : 0, hold: look ? 'binoculars' : undefined });
    }
    case 'jog': return finish(place, { ...loop(0.36, 0.34, t * 0.45 + slot * Math.PI / 2), walking: true, torsoPitch: 0.12, arms: [-0.6 + wave * 0.5, -0.6 - wave * 0.5], elbows: [-1.4, -1.4] });
    case 'fountain': {
      const a = slot * Math.PI / 2 + 0.5, toss = slot === 0 && (t % 7) < 0.8;
      return finish(place, { x: Math.sin(a) * 0.38, z: Math.cos(a) * 0.38, heading: a + Math.PI, arms: [-0.2, toss ? -1.9 : slot % 2 ? -1.2 : -0.3], elbows: [-0.3, toss ? -0.2 : slot % 2 ? -1.0 : -0.4], hold: slot === 0 ? 'coin' : slot % 2 ? 'phone' : undefined });
    }
    case 'concert': {
      if (slot === 0) return finish(place, { x: -0.07, z: 0.02, y: g + 0.13 * place.size - 0.035 * place.size, heading: 0, arms: [-0.9, -0.5 + Math.abs(Math.sin(t * 8)) * 0.35], elbows: [-1.1, -1.2], torsoPitch: Math.sin(t * 2) * 0.05, hold: 'guitar' });
      if (slot === 1) return finish(place, { x: 0.08, z: 0.04, y: g + 0.13 * place.size - 0.035 * place.size + Math.abs(Math.sin(t * 2.5)) * 0.006, heading: -0.2, arms: [-0.3 + wave * 0.15, -0.6], elbows: [-0.3, -2.3], hold: 'mic' });
      const clap = Math.sin(t * 9) > 0;
      return finish(place, { x: -0.3 + (slot - 2) * 0.2, z: 0.4 - (slot % 2) * 0.05, y: g + Math.abs(Math.sin(t * 2.5 + slot)) * 0.006, heading: Math.PI, arms: [-1.3, -1.3], elbows: [-0.7, -0.7], armSplay: clap ? 0.05 : 0.4 });
    }
    case 'queue': return finish(place, { x: 0.12 + slot * 0.075, z: 0.42, heading: -Math.PI / 2, arms: [-0.2, slot % 2 ? -0.7 : -0.25], elbows: [-0.2, slot % 2 ? -1.3 : -0.3], torsoPitch: Math.sin(t * 0.4) * 0.03, hold: slot % 2 ? 'phone' : 'ticket' });
    case 'painting': {
      if (slot === 0) return finish(place, { x: 0.22, z: 0.34, heading: Math.PI, arms: [-0.2, -1.4 + Math.sin(t * 3) * 0.25], elbows: [-0.3, -0.5], armSplay: 0.1, hold: 'brush' });
      return finish(place, { x: -0.2 + slot * 0.08, z: 0.4, heading: Math.PI - 0.4 + slot * 0.3, arms: [-0.3, -0.6], elbows: [-0.3, -2.3], torsoPitch: -0.04 });
    }
    case 'steps': return finish(place, { ...SIT_GROUND, x: -0.27 + slot * 0.18, z: 0.4, y: g - 0.072, heading: 0, arms: [-0.85, -0.85], elbows: [-0.95, -0.95], torsoPitch: 0.15, hold: 'book' });
    case 'lookup': return finish(place, { x: -0.18 + slot * 0.18, z: 0.4, heading: Math.PI, torsoPitch: -0.22, arms: [-0.2, slot === 1 ? -1.4 : -2.8], elbows: [-0.2, slot === 1 ? -0.7 : -0.1], hold: slot === 1 ? 'phone' : undefined });
    case 'waiting': {
      const check = (t % 9) < 4;
      return finish(place, { x: -0.22 + slot * 0.11, z: 0.18 + (slot % 2) * 0.05, heading: Math.sin(t * 0.25) * 0.4, arms: [-0.15, check ? -0.75 : -0.15], elbows: [-0.2, check ? -1.3 : -0.25], hold: slot === 3 ? 'suitcase' : check ? 'phone' : undefined });
    }
    case 'cycling': {
      const p = loop(0.3, 0.26, t * 0.6 + slot * Math.PI * 2 / 3), pedal = t * 7;
      return finish(place, { ...p, y: g + 0.035, thighs: [-1.1 + Math.sin(pedal) * 0.35, -1.1 - Math.sin(pedal) * 0.35], knees: [-0.9 + Math.cos(pedal) * 0.35, -0.9 - Math.cos(pedal) * 0.35], arms: [-1.1, -1.1], elbows: [-0.3, -0.3], torsoPitch: 0.25 });
    }
    case 'firedrill': {
      if (slot < 2) return finish(place, { x: -0.1 + slot * 0.08, z: 0.38, heading: Math.PI / 2, arms: [-1.3, -1.2], elbows: [-0.4, -0.5], knees: [-0.15, -0.2], torsoPitch: 0.1, hold: slot === 0 ? 'hose' : undefined, hat: '#c73a2a' });
      return finish(place, { ...CROUCH, x: -0.3, z: 0.32, y: g - 0.022, heading: 0.5, arms: [-1.0 + wave * 0.3, -1.0 - wave * 0.3], elbows: [-0.6, -0.6], hat: '#c73a2a' });
    }
    case 'patrol': return finish(place, { ...pace(-0.32, 0.32, 0.4 - slot * 0.06, 0.06, t + slot * 5), walking: true, hat: '#23325a' });
    case 'schoolyard': {
      if (slot === 5) return finish(place, { x: 0.28, z: 0.3, y: g + Math.abs(Math.sin(t * 5)) * 0.03, heading: Math.PI, scale: 0.68, arms: [-0.3, -0.3], armSplay: 0.6 + Math.sin(t * 10) * 0.2, knees: [-0.5, -0.5], thighs: [-0.3, -0.3] });
      return finish(place, { ...loop(0.12 + slot * 0.05, 0.1 + slot * 0.04, t * (0.9 + slot * 0.1) + slot, -0.08, 0.2), walking: true, scale: 0.68, arms: [-0.5 + wave * 0.6, -0.5 - wave * 0.6] });
    }
    case 'campus': {
      if (slot < 3) return finish(place, { ...SIT_GROUND, x: -0.25 + slot * 0.2, z: 0.05 + (slot % 2) * 0.12, y: g - 0.072, heading: slot * 1.3, arms: [-0.85, -0.85], elbows: [-0.95, -0.95], torsoPitch: 0.15, hold: 'book' });
      return finish(place, { ...pace(-0.3, 0.3, 0.38 - (slot - 3) * 0.06, 0.05, t + slot * 3), walking: true, arms: [-0.3, -0.7], elbows: [-0.2, -1.4], hold: 'book' });
    }
    case 'chat': {
      // Two pairs, facing each other, gesturing in turn.
      const pair = slot >> 1, left = slot % 2 === 0, talking = Math.floor(t / 2.5 + pair) % 2 === Number(left);
      const p = toWorld(place, pair ? 0.22 : -0.22, 0.38, g).add(new THREE.Vector3(left ? -0.05 : 0.05, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), place.rotation));
      return finish(place, { at: p, heading: left ? Math.PI / 2 : -Math.PI / 2, arms: [talking ? -0.9 + wave * 0.25 : -0.15, slot === 1 ? -0.6 : talking ? -0.7 - wave * 0.2 : -0.2], elbows: [talking ? -0.9 : -0.2, slot === 1 ? -1.4 : talking ? -0.8 : -0.3], torsoPitch: talking ? 0.04 : 0, hold: slot === 1 ? 'cup' : undefined });
    }
    case 'bench': {
      if (slot === 2) return finish(place, { ...pace(-0.3, 0.3, 0.42, 0.02, t), walking: true, torsoPitch: 0.1 });
      return finish(place, { ...SIT, x: slot ? 0.08 : -0.08, z: 0.38, y: g + 0.045 - SEAT_DROP, heading: Math.PI, arms: [-0.5, -0.6], elbows: [-0.8, slot ? -1.4 : -0.8], hold: slot ? 'cup' : 'book' });
    }
    case 'instruments': return finish(place, { x: 0.2 - slot * 0.35, z: 0.3, heading: Math.PI + slow * 0.4, torsoPitch: slot ? -0.15 : 0.1, arms: [-0.85, slot ? -2.6 : -0.85], elbows: [-0.9, slot ? -0.2 : -0.9], hold: 'clipboard' });
    case 'tinker': return finish(place, slot ? { x: 0.08, z: 0.36, heading: -Math.PI / 2, arms: [-0.6, -0.7], elbows: [-0.3, -2.2], hold: 'clipboard' } : { ...KNEEL, x: -0.18, z: 0.36, y: g - 0.035, heading: Math.PI / 2, arms: [-1.1 + wave * 0.3, -0.9], elbows: [-0.4, -0.6], torsoPitch: 0.3, hold: 'hammer' });
    case 'cargo': return finish(place, { ...pace(-0.34, 0.34, 0.36 + slot * 0.05, 0.08, t + slot * 3.1), walking: true, arms: [-1.15, -1.15], elbows: [-0.7, -0.7], hold: 'crate', hat: '#f2c230' });
    case 'repair': return finish(place, { x: -0.18 + slot * 0.18, z: 0.3, heading: Math.PI, arms: [-0.3, -1.5 - Math.max(0, Math.sin(t * 6)) * 0.9], elbows: [-0.3, -0.5], torsoPitch: 0.05, hold: 'hammer', hat: '#f2c230' });
    case 'fishing': {
      const water = place.water!, cycle = (t * 0.9) % 14, pitch = rodPitch(cycle), fish = cycle >= 11 && Math.floor((t * 0.9) / 14) % 2 === 0;
      const heading = headingOf(water.out) + (slot === 2 ? 0.9 : slot === 1 ? -0.2 : 0.15);
      const at = slot === 2 ? deckEnd(water, 0.28, 0.06) : deckEnd(water, 0.5, slot ? -0.06 : 0.05);
      const reach = cycle >= 11 && cycle < 12.5 ? 0.25 : 0;
      const float = at.clone().add(new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(0.6 - reach)).setY(WATER_LEVEL + 0.004 + (cycle > 1 && cycle < 11 ? Math.max(0, Math.sin(t * 3)) * 0.004 - (Math.sin(t * 0.7) > 0.95 ? 0.006 : 0) : 0));
      const arms: [number, number] = [-1.0 - (pitch - 0.9) * 0.6, -1.0 - (pitch - 0.9) * 0.6];
      if (slot === 1) return finish(place, { ...SIT, at, y: DECK_TOP - SEAT_DROP, heading, worldHeading: true, knees: [-0.6 + Math.sin(t) * 0.2, -0.5 - Math.sin(t) * 0.2], arms, elbows: [-0.5, -0.5], rod: { pitch, float, fish } });
      return finish(place, { at, y: DECK_TOP, heading, worldHeading: true, arms, elbows: [-0.5, -0.5], torsoPitch: 0.04, rod: { pitch, float, fish }, hat: slot ? undefined : '#5c7a54' });
    }
    case 'boat': {
      const boat = boatState(place, seconds)!, kindOfBoat = BOATS[place.type], rowing = kindOfBoat === 'row' && slot === 0 && !boat.docked && !boat.sightseeing;
      const seat = boatSeat(place, slot, boat), heading = boat.heading + (kindOfBoat === 'ferry' ? (slot % 2 ? Math.PI / 2 : -Math.PI / 2) : rowing ? Math.PI : 0);
      const stroke = Math.sin(seconds * 2.6);
      const fishing = boat.fishing, sightseeing = boat.sightseeing;
      const spec: Spec = { ...SIT, at: seat, y: seat.y - SEAT_DROP, heading, worldHeading: true, rootRoll: boat.tilt, knees: [-0.8, -0.8],
        arms: rowing ? [-1.3 + stroke * 0.5, -1.3 + stroke * 0.5] : [-0.3, (seconds + slot * 3) % 8 < 1.5 ? -2.7 : -0.4], elbows: rowing ? [-0.5 - stroke * 0.3, -0.5 - stroke * 0.3] : [-0.4, -0.3],
        torsoPitch: rowing ? 0.2 + stroke * 0.25 : 0.05, hat: kindOfBoat === 'lifeboat' ? '#f2a43a' : kindOfBoat === 'sail' && slot === 0 ? '#f6f2e6' : undefined };
      if (fishing) {
        const out = new THREE.Vector3(Math.sin(heading + (slot % 2 ? 1.5 : -1.5)), 0, Math.cos(heading + (slot % 2 ? 1.5 : -1.5)));
        const cycle = (seconds * 0.9 + slot * 4) % 14;
        Object.assign(spec, { heading: headingOf(out), arms: [-1.0, -1.0], elbows: [-0.5, -0.5], rod: { pitch: rodPitch(cycle), float: seat.clone().addScaledVector(out, 0.5).setY(WATER_LEVEL + 0.004), fish: cycle >= 11 && Math.floor(seconds / 14 + slot) % 2 === 0 } });
      }
      if (sightseeing) Object.assign(spec, { heading: heading + (slot % 2 ? 0.8 : -0.8), arms: [-1.35, -1.35], elbows: [-1.0, -1.0], hold: 'binoculars', torsoPitch: -0.04 });
      return finish(place, spec);
    }
  }
  return finish(place, base);
}

// ---------------------------------------------------------------------- arriving and leaving
// Where to walk from the entrance before the activity's own spot (boat passengers: to their
// place on the jetty). Open grounds (fields, gardens) are crossed directly; elsewhere visitors
// walk round the plot edge rather than through walls, and waterfront visitors then walk out
// along the jetty.
const OPEN = new Set<Kind>(['field', 'paddy', 'orchard', 'garden', 'picnic', 'ducks', 'birdwatch', 'jog', 'fountain', 'concert', 'schoolyard', 'campus', 'cycling']);
export function activityPath(place: RecreationPlace, slot: number, seconds: number): THREE.Vector3[] {
  if (place.pavementStop) return [];
  if (place.helipad) return [liftDoor(place)];
  const kind = KINDS[place.type], g = ground(place);
  if (!kind || OPEN.has(kind)) return [];
  const water = kind === 'fishing' || kind === 'boat' ? place.water! : null;
  const path: THREE.Vector3[] = [], goal = water ? water.shore.clone().addScaledVector(water.out, -0.04) : leisurePose(place, slot, seconds).position, local = toLocal(place, goal);
  if (local.z <= 0.28) { const side = local.x >= 0 ? 0.45 : -0.45; path.push(toWorld(place, side, 0.45, g), toWorld(place, side, Math.max(-0.45, local.z), g)); }
  if (water) path.push(goal.setY(g), deckEnd(water, 0.12));
  if (kind === 'boat') {
    const reach = Math.hypot(water!.dock.x - water!.shore.x, water!.dock.z - water!.shore.z);
    path.push(deckEnd(water!, Math.max(0.32, reach - 0.22) + slot % 3 * 0.05, ((slot % 2) - 0.5) * 0.08));
  }
  return path;
}
// Boat passengers board while the boat is moored and leave after a full trip.
export function activityReady(place: RecreationPlace, seconds: number) {
  if (KINDS[place.type] !== 'boat') return true;
  if (place.boatTrip) return !place.boatTrip.unloading && (!place.boatTrip.active || place.boatTrip.elapsed < DOCKED - 1);
  const boat = boatState(place, seconds)!; return boat.docked && (!place.water!.loop || boat.cycle < DOCKED - 1);
}
export function activityFinished(place: RecreationPlace, seconds: number, elapsed: number, duration: number) {
  // Rooftop passengers wait a while for a helicopter before giving up and going home.
  if (place.helipad) return elapsed >= 75;
  if (KINDS[place.type] !== 'boat') return elapsed >= duration;
  if (place.boatTrip) return place.boatTrip.unloading;
  const boat = boatState(place, seconds)!; return boat.docked && elapsed > (place.water!.loop ? DOCKED + 2 : 25);
}
