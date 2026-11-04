import * as THREE from 'three';
import type { ToWorld } from './traffic';
import type { StreetNetwork } from './streets';
import { ACTIVITY_TYPES, activityCapacity, activityFinished, activityPath, activityReady, boatKind, boatTripDuration, leisurePose, type BoatTrip, type HeldItem, type RodLine, type WaterAccess } from './activities';

export const RECREATION_TYPES = new Set(['playground', 'skatepark', 'basketballcourt', 'tennisclub', 'publicpool', 'bowlinghall', 'sportscentre', 'amusementpark', 'footballground', 'citystadium']);
export interface RecreationPlace {
  id: string; type: string; size: number; door: number | null; center: THREE.Vector3; rotation: number; online: boolean;
  water?: WaterAccess; // waterfront facilities: their jetty and boat loop
  // A tall building's roof: residents take the lift up and wait here for a helicopter.
  helipad?: { pad: THREE.Vector3; hatch: THREE.Vector3 };
  // A bus stop or taxi stand on the pavement: `center` is on the pavement, facing the road.
  pavementStop?: boolean;
  boatTrip?: BoatTrip; // transient voyage clock shared by the boat and all its passengers
  serviceRole?: 'sanitation';
}
export interface RecreationResident { id: number; employed: boolean; road: number; door: number | null; position: THREE.Vector3 }
export interface ActivityPose {
  position: THREE.Vector3; heading: number; walking: boolean; scale: number;
  rootPitch?: number; rootRoll?: number; torsoPitch?: number;
  thighs?: [number, number]; knees?: [number, number]; arms?: [number, number]; elbows?: [number, number]; armSplay?: number;
  hold?: HeldItem; hat?: string; rod?: RodLine; // drawn by people.ts in the hand, on the head, from the hand
  visible?: boolean; shirt?: string;
}
export interface Visit {
  resident: number; place: RecreationPlace; slot: number; phase: 'outbound' | 'entering' | 'playing' | 'leaving' | 'returning';
  position: THREE.Vector3; route: number[]; next: number; origin: number; elapsed: number; heading: number; duration: number;
  originPosition?: THREE.Vector3; walking?: boolean;
  // Waypoints still to walk inside the plot (round the building, along a jetty), and how long
  // the current step has made no progress.
  path?: THREE.Vector3[]; stuck?: number;
  transporting?: boolean;
  // Seconds still out of sight (in a lift), and whether the visitor has gone up to the roof.
  hidden?: number; lifted?: boolean;
}
const capacity = (place: RecreationPlace) => RECREATION_TYPES.has(place.type) ? sportsCapacity(place.type) : activityCapacity(place);
const sportsCapacity = (type: string) => type === 'tennisclub' || type === 'bowlinghall' ? 2 : type === 'playground' ? 3 : type === 'citystadium' ? 8 : type === 'footballground' ? 6 : 4;
const waterKey = (p: RecreationPlace) => p.water ? `${p.water.dock.x}:${p.water.dock.z}:${p.water.loop?.length || 0}` : '';
const lerp = (a: number, b: number, value: number) => a + (b - a) * value;
export function facilityPoint(place: RecreationPlace, x: number, y: number, z: number): THREE.Vector3 {
  const sin = Math.sin(place.rotation), cos = Math.cos(place.rotation);
  return new THREE.Vector3(place.center.x + (x * cos + z * sin) * place.size, y * place.size, place.center.z + (-x * sin + z * cos) * place.size);
}

// Coordinates follow the actual models in publicBuildings.ts. Time is an accumulated
// animation clock, so reduced motion and pause freeze both bodies and equipment.
export function activityPose(place: RecreationPlace, slot: number, seconds: number): ActivityPose {
  let x = 0, y = 0.056, z = 0, heading = 0;
  const pose: Omit<ActivityPose, 'position' | 'heading'> = { walking: false, scale: 1 };
  const wave = Math.sin(seconds * 4 + slot), phase = seconds % 8;
  switch (place.type) {
    case 'basketballcourt': {
      x = (slot % 2 ? 0.17 : -0.14) + Math.sin(seconds * 0.7 + slot) * 0.035;
      z = slot < 2 ? 0.11 : -0.17; heading = slot < 2 ? Math.PI : 0;
      const shooting = slot === 0 && phase >= 3 && phase < 5;
      pose.arms = shooting ? [-2.6, -2.6] : [-0.25, -0.55 - Math.abs(wave) * 0.35];
      pose.elbows = shooting ? [-0.3, -0.3] : [-0.4, -0.7];
      pose.knees = [shooting ? 0.1 : 0.2, shooting ? 0.1 : 0.2];
      if (shooting) y += Math.sin((phase - 3) * Math.PI / 2) * 0.025;
      break;
    }
    case 'tennisclub':
      x = Math.sin(seconds * 1.2) * 0.15; z = slot ? 0.25 : -0.25; heading = slot ? Math.PI : 0;
      pose.arms = [-0.3, -0.9 + Math.sin(seconds * Math.PI + slot * Math.PI) * 0.9]; pose.elbows = [-0.3, -0.6]; pose.knees = [0.18, 0.24]; break;
    case 'skatepark': {
      const t = seconds * 0.75 + slot * Math.PI / 2;
      x = Math.sin(t) * 0.3; z = -0.12 + slot * 0.075; y = 0.074 + Math.pow(Math.abs(Math.sin(t)), 5) * 0.13;
      heading = Math.cos(t) >= 0 ? Math.PI / 2 : -Math.PI / 2;
      pose.torsoPitch = 0.23; pose.thighs = [-0.4, -0.25]; pose.knees = [0.65, 0.65]; pose.arms = [-0.35, -0.25]; pose.armSplay = 0.7; break;
    }
    case 'publicpool': {
      const t = (seconds * 0.12 + slot * 0.23) % 2, direction = t < 1;
      x = -0.28 + (direction ? t : 2 - t) * 0.42; z = -0.17 + slot * 0.1; y = 0.088;
      heading = direction ? Math.PI / 2 : -Math.PI / 2; pose.rootPitch = Math.PI / 2;
      pose.arms = [Math.sin(seconds * 4 + slot) * 2.5, -Math.sin(seconds * 4 + slot) * 2.5]; pose.elbows = [-0.2, -0.2]; pose.thighs = [wave * 0.2, -wave * 0.2]; pose.knees = [0.1, 0.1]; break;
    }
    case 'playground':
      pose.scale = 0.7;
      if (slot === 0) {
        const t = seconds % 9;
        if (t < 4) { x = 0.23; z = -0.24; y = lerp(0.05, 0.26, t / 4); pose.arms = [-2.1, -2.3]; pose.thighs = [wave * 0.5, -wave * 0.5]; }
        else if (t < 5.5) { const slide = (t - 4) / 1.5; x = 0.23; z = lerp(-0.04, 0.24, slide); y = lerp(0.25, 0.08, slide); pose.thighs = [-1.1, -1.1]; pose.knees = [0.15, 0.15]; pose.arms = [-0.8, -0.8]; }
        else { const walk = (t - 5.5) / 3.5; x = 0.34; z = lerp(0.24, -0.24, walk); heading = Math.PI; pose.walking = true; }
      } else if (slot === 1) {
        x = -0.17; z = -0.2; y = 0.053; pose.thighs = [-1.35 + wave * 0.15, -1.35 + wave * 0.15]; pose.knees = [0.65 - wave * 0.3, 0.65 - wave * 0.3]; pose.arms = [-2.2, -2.2]; pose.elbows = [-0.45, -0.45]; pose.torsoPitch = wave * 0.08;
      } else { x = -0.21; z = 0.26; pose.torsoPitch = 0.6; pose.thighs = [-0.8, -0.8]; pose.knees = [1.3, 1.3]; pose.arms = [-0.9 + wave * 0.2, -0.4]; }
      break;
    case 'footballground': case 'citystadium': {
      x = Math.sin(seconds * 0.8 + slot * 1.4) * 0.15;
      z = (slot % 3 - 1) * 0.19 + Math.sin(seconds * 0.6 + slot) * 0.045;
      heading = Math.atan2(Math.cos(seconds * 0.8 + slot * 1.4), Math.cos(seconds * 0.6 + slot));
      pose.walking = true; pose.thighs = [wave * 0.5, -wave * 0.5]; pose.knees = [0.35, 0.35]; break;
    }
    case 'sportscentre':
      x = (slot - 1.5) * 0.16; z = 0.35; pose.arms = [-0.8 - Math.abs(wave) * 1.8, -0.8 - Math.abs(wave) * 1.8]; pose.armSplay = 0.45; pose.knees = [0.1 + (1 + wave) * 0.25, 0.1 + (1 + wave) * 0.25]; break;
    case 'bowlinghall':
      x = slot ? 0.27 : -0.2; z = 0.31; heading = slot ? -Math.PI / 2 : Math.PI / 2;
      pose.arms = [-0.2, -0.4 + Math.sin(seconds * 2) * 1.3]; pose.elbows = [-0.2, -0.3]; pose.torsoPitch = slot ? 0 : Math.max(0, Math.sin(seconds * 2)) * 0.25; break;
    case 'amusementpark':
      x = -0.04 + (slot % 2) * 0.17; z = 0.1 + Math.floor(slot / 2) * 0.15; heading = Math.PI; pose.scale = slot % 2 ? 0.75 : 1; pose.arms = [-0.3, -1.8 + wave * 0.3]; break;
    default: return leisurePose(place, slot, seconds);
  }
  return { ...pose, position: facilityPoint(place, x, y, z), heading: heading + place.rotation };
}

// A reverse breadth-first route tree is shared by all residents visiting one entrance.
export function routesTo(graph: Map<number, number[]>, goal: number): Map<number, number> {
  if (!graph.has(goal)) return new Map();
  const next = new Map<number, number>([[goal, goal]]), queue = [goal];
  for (let i = 0; i < queue.length; i++) for (const node of graph.get(queue[i]) || []) if (!next.has(node)) { next.set(node, queue[i]); queue.push(node); }
  return next;
}
export function roadRoute(next: Map<number, number>, start: number, goal: number): number[] | null {
  if (!next.has(start)) return null;
  const path = [start];
  while (path.at(-1) !== goal && path.length <= next.size) path.push(next.get(path.at(-1)!)!);
  return path.at(-1) === goal ? path : null;
}

export class RecreationVisits {
  readonly visits = new Map<number, Visit>();
  private places: RecreationPlace[] = [];
  private graph = new Map<number, number[]>();
  private routeTrees = new Map<string, Map<number, number>>();
  private cooldown = new Map<number, number>();
  private placeKey = '';
  private nextAssignment = 0;
  seconds = 0;
  constructor(private toWorld: ToWorld, private release: (resident: number, road: number, position?: THREE.Vector3) => void, private streets?: StreetNetwork) {}
  finishTransport(id: number, road: number, position: THREE.Vector3) {
    this.streets?.cancel(`recreation:${id}`); this.streets?.cancel(`transit:${id}`); this.streets?.crowd.release(id);
    this.visits.delete(id); this.cooldown.set(id, this.seconds + 22); this.release(id, road, position);
  }
  setRoads(graph: Map<number, number[]>) { this.graph = graph; this.routeTrees.clear(); this.placeKey = ''; this.cancelAll(); }
  residentChanged(id: number) { this.cancel(id); }
  setPlaces(places: RecreationPlace[]) {
    const key = places.map(p => `${p.id}:${p.type}:${p.door}:${p.online}:${p.center.x}:${p.center.z}:${p.size}:${p.rotation}:${waterKey(p)}`).join('|');
    if (key === this.placeKey) return;
    const previous = new Map(this.places.map(p => [p.id, p]));
    this.placeKey = key; this.places = places.filter(p => p.online && p.door != null && this.graph.has(p.door)).map(p => {
      if (!boatKind(p.type)) return p;
      const old = previous.get(p.id), same = old && old.type === p.type && old.door === p.door && old.center.equals(p.center) && old.rotation === p.rotation && old.size === p.size && waterKey(old) === waterKey(p);
      return { ...p, boatTrip: same ? old.boatTrip : { elapsed: 0, active: false, unloading: false, completed: 0 } };
    }); this.routeTrees.clear(); this.nextAssignment = this.seconds;
    for (const [id, visit] of this.visits) {
      const live = this.places.find(p => p.id === visit.place.id);
      if (!live || live.door !== visit.place.door || !live.center.equals(visit.place.center) || live.rotation !== visit.place.rotation || live.type !== visit.place.type || live.size !== visit.place.size || waterKey(live) !== waterKey(visit.place)) this.cancel(id);
      else visit.place = live;
    }
  }
  get placeList(): readonly RecreationPlace[] { return this.places; }
  private nearestRoad(position: THREE.Vector3, fallback: number) {
    if (this.graph.has(fallback)) return fallback;
    let best = -1, distance = Infinity;
    for (const road of this.graph.keys()) { const d = this.toWorld(road).distanceToSquared(position); if (d < distance) { distance = d; best = road; } }
    return best;
  }
  private cancel(id: number) { this.streets?.cancel(`recreation:${id}`); const visit = this.visits.get(id); if (!visit) return; this.release(id, this.nearestRoad(visit.position, visit.place.door ?? -1)); this.visits.delete(id); this.cooldown.set(id, this.seconds + 5); }
  private cancelAll() { for (const id of [...this.visits.keys()]) this.cancel(id); }
  private tree(place: RecreationPlace) { let next = this.routeTrees.get(place.id); if (!next) { next = routesTo(this.graph, place.door!); this.routeTrees.set(place.id, next); } return next; }
  private startVisits(residents: RecreationResident[]) {
    const budget = Math.min(192, residents.length, Math.max(2, Math.ceil(residents.length * 0.35)));
    // Residents nearby come first, and residents without jobs before those taking a short
    // break from work, so people use their local facilities rather than crossing the city.
    const free = residents.filter(person => !this.visits.has(person.id) && (this.cooldown.get(person.id) || 0) <= this.seconds);
    const first = Math.floor(this.seconds / 20) % Math.max(1, this.places.length);
    const places = [...this.places.slice(first), ...this.places.slice(0, first)];
    // Give each destination a visitor before filling extra slots; periodically rotate
    // priority so a large city cannot permanently starve its later-built facilities.
    for (let slot = 0; slot < 8 && this.visits.size < budget; slot++) {
      for (const place of places) {
        if (slot >= capacity(place) || this.visits.size >= budget || !free.length) continue;
        const occupied = new Set([...this.visits.values()].filter(v => v.place.id === place.id).map(v => v.slot));
        if (occupied.has(slot)) continue;
        const tried = new Set<number>();
        for (let attempt = 0; attempt < 6; attempt++) {
          let best = -1, score = Infinity;
          free.forEach((person, i) => {
            if (tried.has(i)) return;
            const value = person.position.distanceToSquared(place.center) + (person.employed ? 400 : 0);
            if (value < score) { score = value; best = i; }
          });
          if (best < 0) break;
          tried.add(best);
          const person = free[best];
          const origin = person.employed ? person.door : this.graph.has(person.road) ? person.road : person.door;
          if (origin == null) continue;
          const route = roadRoute(this.tree(place), origin, place.door!);
          // Residents walk further for a day by the water or in the park than to a local court.
          if (!route || route.length > (RECREATION_TYPES.has(place.type) ? 32 : 80)) continue;
          const position = person.employed && !this.streets ? this.toWorld(origin) : person.position.clone();
          if (this.streets && !this.streets.route(position, this.streets.curb(place.door!, place.center))) continue;
          if (this.streets && !this.streets.crowd.has(person.id) && !this.streets.crowd.spawn(person.id, position)) continue;
          this.visits.set(person.id, { resident: person.id, place, slot, phase: 'outbound', position, originPosition: position.clone(), route, next: 0, origin, elapsed: 0, heading: 0, duration: 35 + slot * 3, walking: true });
          free.splice(best, 1);
          break;
        }
      }
    }
  }
  update(dt: number, motion: boolean, residents: RecreationResident[]) {
    const live = new Set(residents.map(r => r.id));
    for (const id of [...this.visits.keys()]) if (!live.has(id)) { this.streets?.cancel(`recreation:${id}`); this.visits.delete(id); this.cooldown.delete(id); }
    if (!motion) return;
    this.seconds += dt;
    for (const place of this.places) {
      const trip = place.boatTrip; if (!trip) continue;
      const passengers = [...this.visits.values()].filter(v => v.place.id === place.id && (v.phase === 'playing' || v.phase === 'leaving'));
      if (!passengers.length) { trip.active = false; trip.unloading = false; trip.elapsed = 0; }
      else if (trip.active && !trip.unloading) {
        trip.elapsed += dt;
        if (trip.elapsed >= boatTripDuration(place)) { trip.elapsed = boatTripDuration(place); trip.unloading = true; trip.completed++; }
      }
    }
    if (this.seconds >= this.nextAssignment) { this.startVisits(residents); this.nextAssignment = this.seconds + 0.75; }
    const step = (visit: Visit, target: THREE.Vector3, speed = 0.32) => {
      if (this.streets) {
        const before = visit.position.clone(), result = this.streets.stepResident(visit.resident, visit.position, target, dt, speed);
        visit.walking = result.walking; if (result.walking) visit.heading = result.heading;
        // Two visitors meeting head-on on a narrow jetty or plot edge can block each other for
        // good; after a few seconds without progress the step is simply completed.
        visit.stuck = result.arrived || visit.position.distanceToSquared(before) > 1e-8 ? 0 : (visit.stuck || 0) + dt;
        if (visit.stuck > 4) { visit.position.copy(target); visit.stuck = 0; return true; }
        return result.arrived;
      }
      const delta = target.clone().sub(visit.position), distance = delta.length();
      if (Math.hypot(delta.x, delta.z) > 0.001) visit.heading = Math.atan2(delta.x, delta.z);
      visit.walking = distance > 0.001;
      if (distance <= speed * dt + 0.001) { visit.position.copy(target); return true; }
      visit.position.addScaledVector(delta, speed * dt / distance); return false;
    };
    for (const [id, visit] of this.visits) {
      if (visit.transporting) continue;
      if (visit.hidden && visit.hidden > 0) { visit.hidden -= dt; visit.walking = false; continue; }
      // A pavement stop has no plot to cross: its queue is the way in.
      const entrance = visit.place.pavementStop ? activityPose(visit.place, visit.slot, this.seconds).position : facilityPoint(visit.place, 0, 0.045, 0.46);
      if (visit.phase === 'outbound' || visit.phase === 'returning') {
        if (this.streets) {
          const target = visit.phase === 'outbound' ? this.streets.curb(visit.place.door!, visit.place.center) : visit.originPosition!;
          const before = visit.position.clone(), result = this.streets.walk(`recreation:${id}`, visit.position, target, dt);
          visit.walking = result.walking; if (result.walking) visit.heading = result.heading;
          // A long trip that stops getting anywhere (caught in a knot of people) is given up.
          visit.stuck = visit.position.distanceToSquared(before) > 1e-8 ? 0 : (visit.stuck || 0) + dt;
          if (result.blocked || visit.stuck > 30) { this.cancel(id); continue; }
          if (result.arrived) {
            if (visit.phase === 'outbound') { visit.phase = 'entering'; visit.next = visit.route.length; }
            else { this.release(id, visit.origin); this.visits.delete(id); this.cooldown.set(id, this.seconds + 22); }
          }
          continue;
        }
        const target = this.toWorld(visit.route[visit.next]); target.y = 0.08;
        if (step(visit, target)) {
          visit.next++;
          if (visit.next === visit.route.length) {
            if (visit.phase === 'outbound') visit.phase = 'entering';
            else { this.release(id, visit.origin); this.visits.delete(id); this.cooldown.set(id, this.seconds + 22); }
          }
        }
      } else if (visit.phase === 'entering') {
        if (visit.next === visit.route.length) { if (step(visit, entrance)) { visit.next++; if (ACTIVITY_TYPES.has(visit.place.type) || visit.place.helipad) visit.path = activityPath(visit.place, visit.slot, this.seconds); } }
        else if (visit.path?.length) { if (step(visit, visit.path[0])) visit.path.shift(); }
        // Boat passengers wait on the jetty for the boat; everyone else walks to their spot.
        else if (!activityReady(visit.place, this.seconds)) visit.walking = false;
        // Up in the lift: out of sight for a moment, then out of the roof hatch.
        else if (visit.place.helipad && !visit.lifted) { visit.lifted = true; visit.hidden = 2.5; visit.walking = false; visit.position.copy(activityPose(visit.place, visit.slot, this.seconds).position); }
        else if (boatKind(visit.place.type) || step(visit, activityPose(visit.place, visit.slot, this.seconds).position)) {
          visit.phase = 'playing'; visit.elapsed = 0;
          if (visit.place.boatTrip) visit.place.boatTrip.active = true;
          const pose = activityPose(visit.place, visit.slot, this.seconds); visit.position.copy(pose.position); visit.heading = pose.heading;
        }
      } else if (visit.phase === 'playing') {
        visit.elapsed += dt; const pose = activityPose(visit.place, visit.slot, this.seconds); visit.position.copy(pose.position); visit.heading = pose.heading;
        if (activityFinished(visit.place, this.seconds, visit.elapsed, visit.duration)) {
          visit.phase = 'leaving';
          if (visit.place.helipad) { visit.position.copy(activityPath(visit.place, visit.slot, this.seconds)[0]); visit.hidden = 2.5; visit.path = []; }
          else if (ACTIVITY_TYPES.has(visit.place.type)) { visit.path = activityPath(visit.place, visit.slot, this.seconds).reverse(); }
        }
      } else if (visit.phase === 'leaving') {
        if (visit.path?.length) { if (step(visit, visit.path[0])) visit.path.shift(); }
        else if (step(visit, entrance)) { visit.phase = 'returning'; visit.route.reverse(); visit.next = 0; }
      }
    }
  }
  pose(id: number): ActivityPose | null {
    const visit = this.visits.get(id); if (!visit) return null;
    if (visit.hidden && visit.hidden > 0) return { position: visit.position, heading: visit.heading, walking: false, scale: 1, visible: false };
    return visit.phase === 'playing' ? activityPose(visit.place, visit.slot, this.seconds) : { position: visit.position, heading: visit.heading, walking: visit.walking ?? true, scale: 1 };
  }
  get attendance() { const counts = new Map<string, number>(); for (const visit of this.visits.values()) if (visit.phase === 'playing') counts.set(visit.place.id, (counts.get(visit.place.id) || 0) + 1); return counts; }
}
