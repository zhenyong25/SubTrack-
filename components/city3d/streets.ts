import * as THREE from 'three';
import { buildGraph, LANE, PAVEMENT_SURFACE, type ToWorld } from './traffic';
import { surfaceHeight, PAVEMENT_INNER, VEHICLE_STOP_DISTANCE } from './pavement';
import { CAR_SIZE, type VehicleSize } from './vehicleModels';
export { CAR_SIZE, VEHICLE_STOP_DISTANCE, type VehicleSize };
import { PedestrianCrowd, PERSONAL_SPACE } from './pedestrianCrowd';

export type SignalPhase = 'cars' | 'amber' | 'all-red' | 'walk' | 'clearance';
export interface Crossing {
  road: number; position: THREE.Vector3; phase: SignalPhase; elapsed: number;
  waiting: Set<string>; active: Set<string>;
  vehicle: number | null;
  vehicleQueue: Map<number, number>;
}
// A junction with no signal. Adjacent junction tiles share one box, so cars inside it can't
// each hold a tile the other needs next.
export interface Junction { road: number; tiles: THREE.Vector3[]; vehicle: number | null; vehicleQueue: Map<number, number> }
export interface SidewalkNode { id: number; road: number; position: THREE.Vector3; links: Array<{ to: number; crossing: number | null }> }
interface Journey { target: THREE.Vector3; nodes: number[]; points: THREE.Vector3[]; next: number; crossing: number | null; clearedEdge: number; walking: boolean; stall: number; closest: number;
  // Turned back to the starting kerb after getting stuck on the road once the walk signal ended.
  retreat: boolean;
  // Seconds spent waiting at the current crossing.
  waited: number;
  // After leaving the car lanes, the crossing being finished along the road edge to the kerb.
  finishing: { road: number; from: THREE.Vector3; to: THREE.Vector3 } | null }
export interface StreetVehicle { id: number; position: THREE.Vector3; heading?: number; size?: VehicleSize }
export const vehicleOverlap = (a: THREE.Vector3, headingA: number, b: THREE.Vector3, headingB: number, padding = 0.005, sizeA = CAR_SIZE, sizeB = CAR_SIZE) => {
  const forwardA = [Math.sin(headingA), Math.cos(headingA)], sideA = [forwardA[1], -forwardA[0]];
  const forwardB = [Math.sin(headingB), Math.cos(headingB)], sideB = [forwardB[1], -forwardB[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
  const delta = [b.x - a.x, b.z - a.z];
  return [forwardA, sideA, forwardB, sideB].every(axis => Math.abs(dot(delta, axis)) < (sizeA.half + padding) * Math.abs(dot(forwardA, axis)) + (sizeB.half + padding) * Math.abs(dot(forwardB, axis)) + (sizeA.side + padding) * Math.abs(dot(sideA, axis)) + (sizeB.side + padding) * Math.abs(dot(sideB, axis)));
};
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const CURB = (PAVEMENT_INNER + 0.5) / 2;
const STOP_DISTANCE = VEHICLE_STOP_DISTANCE;
// An unsignalled junction's box is its own tile plus a car's front overhang (car centres are
// tested), so a car waiting to enter keeps its nose out of the turning path.
const JUNCTION_ZONE = 0.72;
// A walker this far across a road arm is beyond every car's side (lane centre + half a car + a
// margin) and so no longer holds the signal, even before reaching the crowded kerb.
const CLEAR_OF_LANES = LANE + 0.09 + 0.03;
export const WALK_SECONDS = 10;
const keyAt = (x: number, z: number) => `${Math.floor(x)},${Math.floor(z)}`;
const near = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => Math.abs(a.x - b.x) < radius && Math.abs(a.z - b.z) < radius;

// One shared street simulation for walkers and vehicles. Sidewalk routes only cross an
// active road at a controlled zebra crossing. No timers use wall time, so pausing is exact.
export class StreetNetwork {
  readonly crowd = new PedestrianCrowd();
  readonly nodes = new Map<number, SidewalkNode>();
  readonly crossings = new Map<number, Crossing>();
  readonly junctions: Junction[] = [];
  private nodeBuckets = new Map<string, SidewalkNode[]>();
  private pedestrianBuckets = new Map<string, THREE.Vector3[]>();
  private vehicles = new Map<number, THREE.Vector3>();
  private vehicleHeadings = new Map<number, number>();
  private vehicleSizes = new Map<number, VehicleSize>();
  // Junction zones are measured to a vehicle's centre; a longer vehicle stops that much earlier.
  private reach(id: number) { return Math.max(0, (this.vehicleSizes.get(id)?.half ?? CAR_SIZE.half) - CAR_SIZE.half); }
  private vehicleBuckets = new Map<string, Set<number>>();
  private journeys = new Map<string, Journey>();
  private trees = new Map<number, Map<number, number>>();
  private roads = new Set<number>();
  private seconds = 0;
  completedCrossings = 0;
  stoppedCars = 0;
  readonly blockedVehicles = new Map<number, { reason: string; by?: number; crossing?: number }>();
  // Cars let through a deadlock ignore other cars and junction turns for a moment. Signals and
  // pedestrians still stop them. Traffic decides who is released.
  readonly released = new Map<number, 1>();
  // Wrecks remain physical barriers even while normal cars resolve a queue deadlock.
  readonly solidVehicles = new Set<number>();

  constructor(readonly toWorld: ToWorld) {}

  setRoads(roads: Set<number>, entrances: number[] = []) {
    this.nodes.clear(); this.crossings.clear(); this.nodeBuckets.clear(); this.trees.clear(); this.journeys.clear();
    this.vehicles.clear(); this.vehicleBuckets.clear(); this.pedestrianBuckets.clear();
    this.vehicleHeadings.clear();
    this.roads = roads; this.crowd.clear();
    const graph = buildGraph(roads);
    // Leave enough room between stop zones for a car to clear one crossing before the next.
    const candidates = [...new Set([...graph].filter(([, links]) => links.length >= 3).map(([id]) => id).concat(entrances))];
    for (const road of candidates) {
      if (!graph.has(road)) continue;
      const position = this.toWorld(road);
      if ([...this.crossings.values()].some(c => c.position.distanceTo(position) < 2.6)) continue;
      this.crossings.set(road, { road, position, phase: 'cars', elapsed: 0, waiting: new Set(), active: new Set(), vehicle: null, vehicleQueue: new Map() });
    }
    // Junctions without a signal are still entered one car at a time, or crossing streams meet
    // inside them. Tiles right next to a signal are already covered by its stop zone.
    this.junctions.length = 0;
    const free = new Set([...graph].filter(([id, links]) => links.length >= 3 && ![...this.crossings.values()].some(c => c.position.distanceTo(this.toWorld(id)) < 1.5)).map(([id]) => id));
    for (const start of free) {
      const group = [start]; free.delete(start);
      for (let i = 0; i < group.length; i++) for (const n of graph.get(group[i]) || []) if (free.delete(n)) group.push(n);
      this.junctions.push({ road: start, tiles: group.map(id => this.toWorld(id)), vehicle: null, vehicleQueue: new Map() });
    }
    for (const road of roads) {
      const centre = this.toWorld(road);
      CORNERS.forEach(([x, z], corner) => {
        const node = { id: road * 4 + corner, road, position: new THREE.Vector3(centre.x + x * CURB, PAVEMENT_SURFACE + 0.004, centre.z + z * CURB), links: [] };
        this.nodes.set(node.id, node);
        const bucket = keyAt(node.position.x, node.position.z);
        this.nodeBuckets.set(bucket, [...(this.nodeBuckets.get(bucket) || []), node]);
      });
    }
    const connect = (a: number, b: number, crossing: number | null = null) => {
      if (!this.nodes.has(a) || !this.nodes.has(b)) return;
      this.nodes.get(a)!.links.push({ to: b, crossing }); this.nodes.get(b)!.links.push({ to: a, crossing });
    };
    for (const road of roads) {
      const neighbours = graph.get(road)!;
      // N, E, S, W edges of a tile. Without a road arm, this is continuous pavement.
      [[0, 1, -100], [1, 2, 1], [2, 3, 100], [3, 0, -1]].forEach(([a, b, offset]) => {
        const crossesRoad = neighbours.includes(road + offset);
        if (!crossesRoad || this.crossings.has(road)) connect(road * 4 + a, road * 4 + b, crossesRoad ? road : null);
      });
      if (neighbours.includes(road + 1)) { connect(road * 4 + 1, (road + 1) * 4); connect(road * 4 + 2, (road + 1) * 4 + 3); }
      if (neighbours.includes(road + 100)) { connect(road * 4 + 3, (road + 100) * 4); connect(road * 4 + 2, (road + 100) * 4 + 1); }
    }
  }

  curb(road: number, building: THREE.Vector3) {
    const p = this.toWorld(road), dx = building.x - p.x, dz = building.z - p.z;
    if (Math.abs(dx) > Math.abs(dz)) p.x += Math.sign(dx) * CURB; else p.z += Math.sign(dz) * CURB;
    p.y = PAVEMENT_SURFACE + 0.004; return p;
  }

  closest(position: THREE.Vector3) {
    let best: SidewalkNode | null = null, distance = Infinity;
    const search = (nodes: Iterable<SidewalkNode>) => { for (const node of nodes) { const d = node.position.distanceToSquared(position); if (d < distance) { best = node; distance = d; } } };
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) search(this.nodeBuckets.get(keyAt(position.x + dx, position.z + dz)) || []);
    if (!best) search(this.nodes.values());
    return best as SidewalkNode | null;
  }

  // `avoid` routes around corners (a crowd, a jammed crossing), without the shared cache.
  route(start: THREE.Vector3, target: THREE.Vector3, avoid?: Set<number>): number[] | null {
    const a = this.closest(start), b = this.closest(target); if (!a || !b) return null;
    if (avoid?.size) {
      if (avoid.has(a.id) || avoid.has(b.id)) return null;
      const tree = new Map([[b.id, b.id]]), queue = [b.id];
      for (let i = 0; i < queue.length; i++) for (const edge of this.nodes.get(queue[i])!.links) if (!tree.has(edge.to) && !avoid.has(edge.to)) { tree.set(edge.to, queue[i]); queue.push(edge.to); }
      if (!tree.has(a.id)) return null;
      const route = [a.id]; while (route.at(-1) !== b.id) route.push(tree.get(route.at(-1)!)!);
      return route;
    }
    if (a.id === b.id) return [a.id];
    if (a.links.some(edge => edge.to === b.id)) return [a.id, b.id];
    let tree = this.trees.get(b.id);
    if (!tree) {
      tree = new Map([[b.id, b.id]]); const queue = [b.id];
      for (let i = 0; i < queue.length; i++) for (const edge of this.nodes.get(queue[i])!.links) if (!tree.has(edge.to)) { tree.set(edge.to, queue[i]); queue.push(edge.to); }
      if (this.trees.size >= 64) this.trees.delete(this.trees.keys().next().value!);
      this.trees.set(b.id, tree);
    }
    if (!tree.has(a.id)) return null;
    const route = [a.id]; while (route.at(-1) !== b.id) route.push(tree.get(route.at(-1)!)!);
    return route;
  }

  cancel(id: string) {
    if (!this.journeys.delete(id)) return;
    this.crowd.unreserve(id);
    for (const crossing of this.crossings.values()) { crossing.waiting.delete(id); crossing.active.delete(id); }
  }
  isCrossing(id: string) { return this.journeys.get(id)?.crossing != null; }

  spawnResident(id: number, origin: THREE.Vector3) {
    const start = this.closest(origin); if (!start) return null;
    const queue = [start.id], seen = new Set(queue), candidates: THREE.Vector3[] = [];
    for (let i = 0; i < queue.length && i < 24; i++) {
      const node = this.nodes.get(queue[i])!; candidates.push(node.position);
      for (const edge of node.links) if (edge.crossing === null) {
        const next = this.nodes.get(edge.to)!;
        if (node.position.distanceTo(next.position) > 0.2) for (const t of [0.2, 0.4, 0.6, 0.8]) candidates.push(node.position.clone().lerp(next.position, t));
        if (!seen.has(edge.to)) { seen.add(edge.to); queue.push(edge.to); }
      }
    }
    candidates.sort((a, b) => a.distanceToSquared(origin) - b.distanceToSquared(origin));
    for (const p of candidates) if (surfaceHeight(this.roads, p.x, p.z) === PAVEMENT_SURFACE && this.crowd.spawn(id, p, 0.16)) return p.clone();
    return null;
  }
  private lanes(nodes: number[], target: THREE.Vector3) {
    return nodes.map((id, i) => {
      const p = this.nodes.get(id)!.position;
      const before = i ? this.nodes.get(nodes[i - 1])!.position : p;
      const after = i + 1 < nodes.length ? this.nodes.get(nodes[i + 1])!.position : target;
      const incoming = p.clone().sub(before).setY(0), outgoing = after.clone().sub(p).setY(0);
      if (incoming.lengthSq() < 0.00001) incoming.copy(outgoing);
      if (outgoing.lengthSq() < 0.00001) outgoing.copy(incoming);
      incoming.normalize(); outgoing.normalize();
      const dot = incoming.dot(outgoing);
      const direction = dot < -0.9 ? incoming : incoming.clone().add(outgoing).multiplyScalar(1 / Math.max(0.2, 1 + dot));
      const offset = new THREE.Vector3(direction.z, 0, -direction.x).multiplyScalar(0.06).clampLength(0, Math.SQRT2 * 0.06);
      return p.clone().add(offset);
    });
  }
  // Progress across a road arm, from the crossing's centre line towards the far kerb.
  private across(point: THREE.Vector3, crossing: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3) {
    const direction = to.clone().sub(from).setY(0).normalize();
    return point.clone().sub(crossing).setY(0).dot(direction);
  }
  private onPavement(point: THREE.Vector3) {
    return [[0, 0], [0.032, 0], [-0.032, 0], [0, 0.032], [0, -0.032]].every(([x, z]) => surfaceHeight(this.roads, point.x + x, point.z + z) === PAVEMENT_SURFACE);
  }
  stepResident(id: string | number, position: THREE.Vector3, target: THREE.Vector3, dt: number, speed = 0.32, property = true) {
    const journey = typeof id === 'string' ? this.journeys.get(id) : undefined;
    const margin = (point: THREE.Vector3) => [[0, 0], [0.032, 0], [-0.032, 0], [0, 0.032], [0, -0.032]].every(([x, z]) => {
      const h = surfaceHeight(this.roads, point.x + x, point.z + z); return h === PAVEMENT_SURFACE || property && h === 0;
    });
    // Someone already within the margin at the kerb edge may walk anywhere on the pavement
    // surface; otherwise almost every step from there fails the margin and they freeze.
    const startSafe = margin(position);
    // Distance from the zebra line between two kerb corners.
    const lineDistance = (point: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3) => {
      const line = to.clone().sub(from).setY(0).normalize(), offset = point.clone().sub(from).setY(0);
      return Math.abs(offset.x * line.z - offset.z * line.x);
    };
    // On the strip, or someone pushed off it who isn't straying further.
    const onStrip = (point: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3) => lineDistance(point, from, to) <= Math.max(0.12, lineDistance(position, from, to) + 0.0001);
    return this.crowd.move(id, position, target, dt, speed, point => {
      const height = surfaceHeight(this.roads, point.x, point.z);
      if ((height === PAVEMENT_SURFACE || property && height === 0) && (!startSafe || margin(point))) return true;
      if (journey?.crossing != null) {
        // Crossing: stay on the zebra strip, out of the junction's other arms.
        const crossing = this.crossings.get(journey.crossing), from = this.nodes.get(journey.nodes[journey.next - 1])?.position, to = this.nodes.get(journey.nodes[journey.next])?.position;
        return Boolean(crossing && near(point, crossing.position, 0.5) && (!from || !to || onStrip(point, from, to)));
      }
      // Finishing a crossing: the road edge beside the crossing line is walkable; the car lanes,
      // including those of the junction's other arms, are not.
      const finishing = journey?.finishing, crossing = finishing && this.crossings.get(finishing.road);
      if (!finishing || !crossing || !near(point, crossing.position, 0.5) || this.across(point, crossing.position, finishing.from, finishing.to) < CLEAR_OF_LANES) return false;
      return onStrip(point, finishing.from, finishing.to);
    });
  }

  // Walk another way round a blocked corner (any reasonable length: moving beats a growing crowd).
  private detour(id: string, journey: Journey, position: THREE.Vector3, avoid: number) {
    const nodes = this.route(position, journey.target, new Set([avoid]));
    if (!nodes || nodes.length > (journey.nodes.length - journey.next) * 3 + 24) return false;
    for (const crossing of this.crossings.values()) crossing.waiting.delete(id);
    Object.assign(journey, { nodes, points: this.lanes(nodes, journey.target), next: 0, clearedEdge: -1, stall: 0, closest: Infinity, waited: 0, retreat: false });
    return true;
  }

  walk(id: string, position: THREE.Vector3, target: THREE.Vector3, dt: number, speed = 0.32) {
    let journey = this.journeys.get(id);
    if (!journey || !journey.target.equals(target)) {
      this.cancel(id); const nodes = this.route(position, target);
      if (!nodes) return { arrived: false, walking: false, heading: 0, blocked: true };
      journey = { target: target.clone(), nodes, points: this.lanes(nodes, target), next: 0, crossing: null, clearedEdge: -1, walking: false, stall: 0, closest: Infinity, retreat: false, waited: 0, finishing: null }; this.journeys.set(id, journey);
    }
    const node = this.nodes.get(journey.nodes[journey.next]);
    const destination = journey.retreat && journey.crossing !== null ? journey.points[journey.next - 1] : journey.points[journey.next] || journey.target;
    const previous = this.nodes.get(journey.nodes[journey.next - 1]);
    const edge = previous?.links.find(link => link.to === node?.id);
    const crossing = edge?.crossing != null ? this.crossings.get(edge.crossing) : null;
    if (crossing && journey.clearedEdge !== journey.next && !crossing.active.has(id)) {
      // Still out on the road edge from the previous crossing: step up onto the corner first,
      // rather than waiting where turning cars pass.
      if (journey.finishing && previous) {
        const result = this.stepResident(id, position, journey.points[journey.next - 1], dt, speed);
        if (surfaceHeight(this.roads, position.x, position.z) === PAVEMENT_SURFACE) journey.finishing = null;
        journey.walking = result.walking; return { arrived: false, walking: result.walking, heading: result.heading, blocked: false };
      }
      // Don't feed a crowd: arriving at a crossing that already has a big queue, queueing a while
      // in a long one, or missing a whole signal cycle, go another way. Strollers turn round,
      // others detour round this crossing, and if there is no other way they give up the trip
      // (`blocked`), so a crowd always drains instead of growing.
      const crowded = !crossing.waiting.has(id) && crossing.waiting.size >= 8;
      crossing.waiting.add(id);
      journey.waited += dt;
      if (crossing.phase !== 'walk' && node && (crowded || journey.waited > 4 && crossing.waiting.size >= 6 || journey.waited > 20)) {
        if (id.startsWith('wander:') || !this.detour(id, journey, position, node.id)) { this.cancel(id); return { arrived: false, walking: false, heading: 0, blocked: true }; }
        return { arrived: false, walking: false, heading: 0, blocked: false };
      }
      if (crossing.phase !== 'walk') {
        // Make room for someone stepping up from the crossing right beside us; otherwise they
        // stay on the road and the signal can never return to green.
        const stepping = [...crossing.active, ...[...this.journeys].filter(([, j]) => j.finishing?.road === crossing.road).map(([other]) => other)];
        const arrival = stepping.map(other => this.crowd.positionOf(other)).find(p => p && p.distanceTo(position) < PERSONAL_SPACE * 2);
        if (arrival && previous) {
          const away = position.clone().sub(arrival).setY(0);
          if (away.lengthSq() < 0.0001) away.copy(previous.position).sub(position).setY(0);
          const result = this.stepResident(id, position, position.clone().addScaledVector(away.normalize(), 0.05), dt, speed);
          journey.walking = result.walking; return { arrived: false, walking: result.walking, heading: result.heading, blocked: false };
        }
        journey.walking = false; return { arrived: false, walking: false, heading: 0, blocked: false };
      }
      // Everyone waiting crosses together on the walk signal, followers queueing behind the
      // walker ahead. (Reserving the whole strip let only one person per direction cross at a
      // time, and the crowd waiting on the far kerb blocked it entirely.)
      if (!this.onPavement(destination)) return { arrived: false, walking: false, heading: 0, blocked: false };
      crossing.waiting.delete(id); crossing.active.add(id); journey.crossing = crossing.road; journey.waited = 0;
    }
    const result = this.stepResident(id, position, destination, dt, speed, false);
    journey.walking = result.walking;
    // Stalled means no progress towards the current point: sidestepping back and forth on the
    // spot counts too.
    const remaining = position.distanceTo(destination);
    if (remaining < journey.closest - 0.002) { journey.closest = remaining; journey.stall = 0; } else journey.stall += dt;
    // Can't move on the pavement for 3 s (a crowd in the way): switch to another way round that
    // corner, or give up the trip if there is none - never stand in the crowd making it worse.
    if (journey.crossing === null && !journey.finishing && journey.stall > 3 && node) {
      const lastLeg = journey.next >= journey.nodes.length - 1;
      if (id.startsWith('wander:') || lastLeg || !this.detour(id, journey, position, node.id)) { this.cancel(id); return { arrived: false, walking: false, heading: result.heading, blocked: true }; }
      return { arrived: false, walking: false, heading: result.heading, blocked: false };
    }
    // Stuck on the road after the walk signal has ended: turn back to the starting kerb (nobody
    // new starts crossing behind them now) and wait for the next walk signal, rather than hold
    // every car at red. If that way is blocked too, try forwards again.
    const onRoad = journey.crossing !== null ? this.crossings.get(journey.crossing) : undefined;
    if (onRoad && onRoad.phase !== 'walk' && journey.stall > 3) { journey.retreat = !journey.retreat; journey.stall = 0; journey.closest = Infinity; }
    // Don't start once the walk signal has ended: a crossing walker still on the starting kerb
    // goes back to waiting rather than holding every car at red.
    const started = journey.crossing !== null ? this.crossings.get(journey.crossing) : undefined;
    if (started && started.phase !== 'walk' && previous && surfaceHeight(this.roads, position.x, position.z) === PAVEMENT_SURFACE && (journey.retreat || position.distanceTo(previous.position) < position.distanceTo(destination))) {
      started.active.delete(id); started.waiting.add(id); journey.crossing = null; journey.stall = 0; journey.retreat = false; journey.closest = Infinity;
      return { arrived: false, walking: false, heading: result.heading, blocked: false };
    }
    // The crossing is over once the walker is clear of the car lanes on the far side: the
    // signal can return to green even if people on a crowded kerb keep them at the road edge.
    if (started && previous && node && this.across(position, started.position, previous.position, node.position) >= CLEAR_OF_LANES) {
      started.active.delete(id); journey.crossing = null; journey.clearedEdge = journey.next; this.crowd.unreserve(id); this.completedCrossings++; journey.retreat = false;
      journey.finishing = { road: started.road, from: previous.position, to: node.position };
      // Head straight on rather than funnelling everyone through the same corner point, which
      // backs the queue up into the lanes - unless the next leg is another crossing, which is
      // waited for on that corner, not out on the road edge.
      const after = this.nodes.get(journey.nodes[journey.next + 1]);
      const crossesNext = after && node.links.some(link => link.to === after.id && link.crossing !== null);
      if (journey.next < journey.nodes.length && !crossesNext) { journey.next++; journey.closest = Infinity; }
      return { arrived: false, walking: result.walking, heading: result.heading, blocked: false };
    }
    if (journey.finishing && surfaceHeight(this.roads, position.x, position.z) === PAVEMENT_SURFACE) journey.finishing = null;
    // Back on the far pavement, the kerb point counts as reached nearby: people waiting to cross
    // the other way often stand on it.
    // Neither shortcut applies while still on the road edge: ending the leg there would leave
    // the walker stranded on the road with only pavement steps allowed.
    const kerbReached = !journey.finishing && journey.clearedEdge === journey.next && position.distanceTo(destination) < 0.1 && journey.next < journey.nodes.length - 1;
    // Corner gridlock: someone blocked right beside a route corner (or their destination, often a
    // corner for wanderers) counts it as reached rather than waiting for others to clear it.
    const cornerReached = journey.crossing === null && !journey.finishing && journey.stall > 1 && position.distanceTo(destination) < 0.16;
    if (result.arrived || kerbReached || cornerReached) {
      if (journey.crossing !== null) { this.crossings.get(journey.crossing)?.active.delete(id); journey.crossing = null; this.crowd.unreserve(id); this.completedCrossings++; }
      const laneEndpoint = journey.next === journey.nodes.length - 1 && node?.position.distanceTo(journey.target) < 0.00001;
      if (journey.next >= journey.nodes.length || laneEndpoint) { this.cancel(id); return { arrived: true, walking: false, heading: result.heading, blocked: false }; }
      journey.next++; journey.closest = Infinity;
    }
    return { arrived: false, walking: journey.walking, heading: result.heading, blocked: false };
  }

  update(dt: number, motion: boolean) {
    if (!motion) return;
    this.seconds += dt;
    this.stoppedCars = 0;
    for (const crossing of this.crossings.values()) {
      crossing.elapsed += dt;
      const phase = (next: SignalPhase) => { crossing.phase = next; crossing.elapsed = 0; };
      // Pedestrian-actuated: a waiting walker triggers a fixed 10 s walk signal, long enough to
      // see and for late arrivals to join. Clearance still waits for anyone on the road, since
      // walkers do not yield to cars; walkers back on the pavement are released in walk().
      const greenTime = crossing.vehicleQueue.size > 1 ? 10 : 4;
      if (crossing.phase === 'cars' && crossing.elapsed >= greenTime && crossing.waiting.size) phase('amber');
      else if (crossing.phase === 'amber' && crossing.elapsed >= 1) phase('all-red');
      else if (crossing.phase === 'all-red' && crossing.elapsed >= 0.5 && ![...this.vehicles].some(([id, p]) => near(p, crossing.position, STOP_DISTANCE + this.reach(id)))) phase('walk');
      else if (crossing.phase === 'walk' && crossing.elapsed >= WALK_SECONDS) phase('clearance');
      else if (crossing.phase === 'clearance' && crossing.elapsed >= 0.5 && !crossing.active.size) phase('cars');
    }
  }

  setPedestrians(positions: THREE.Vector3[]) {
    this.pedestrianBuckets.clear();
    for (const p of positions) { const key = keyAt(p.x, p.z); const bucket = this.pedestrianBuckets.get(key); if (bucket) bucket.push(p); else this.pedestrianBuckets.set(key, [p]); }
  }
  setVehicles(vehicles: StreetVehicle[]) {
    this.vehicles.clear(); this.vehicleBuckets.clear(); this.vehicleHeadings.clear(); this.vehicleSizes.clear();
    for (const v of vehicles) { if (v.size) this.vehicleSizes.set(v.id, v.size); this.moveVehicle(v.id, v.position, v.heading); }
    for (const crossing of this.crossings.values()) if (crossing.vehicle !== null && !this.vehicles.has(crossing.vehicle)) crossing.vehicle = null;
    for (const c of this.crossings.values()) for (const id of c.vehicleQueue.keys()) if (!this.vehicles.has(id)) c.vehicleQueue.delete(id);
    for (const j of this.junctions) {
      if (j.vehicle !== null && !this.vehicles.has(j.vehicle)) j.vehicle = null;
      for (const id of j.vehicleQueue.keys()) if (!this.vehicles.has(id)) j.vehicleQueue.delete(id);
    }
  }
  // Cars still inside a junction whose light has gone red. The walk phase waits for them, and
  // they may be queued behind cars held by that same light, so they are let through.
  clearing() {
    const ids: number[] = [];
    for (const c of this.crossings.values()) if (c.phase === 'all-red' && c.elapsed > 1.5) for (const [id, p] of this.vehicles) if (near(p, c.position, STOP_DISTANCE + this.reach(id))) ids.push(id);
    return ids;
  }
  // Whether a road tile is inside a junction box (signalled or not), where vehicles must not stop.
  boxAt(index: number) { const p = this.toWorld(index); return this.crossings.has(index) || this.junctions.some(j => j.tiles.some(t => t.distanceToSquared(p) < 0.01)); }
  private inJunction(j: Junction, p: THREE.Vector3, margin = 0) { return j.tiles.some(t => near(p, t, JUNCTION_ZONE + margin)); }
  moveVehicle(id: number, position: THREE.Vector3, heading?: number) {
    const previous = this.vehicles.get(id); if (previous) this.vehicleBuckets.get(keyAt(previous.x, previous.z))?.delete(id);
    const p = position.clone(), key = keyAt(p.x, p.z); this.vehicles.set(id, p);
    if (heading !== undefined) this.vehicleHeadings.set(id, heading);
    if (!this.vehicleBuckets.has(key)) this.vehicleBuckets.set(key, new Set()); this.vehicleBuckets.get(key)!.add(id);
    const reach = this.reach(id);
    for (const c of this.crossings.values()) if (c.vehicle === id && !near(p, c.position, STOP_DISTANCE + reach)) c.vehicle = null;
    for (const c of this.crossings.values()) if (near(p, c.position, STOP_DISTANCE + reach) || !near(p, c.position, STOP_DISTANCE + reach + 0.25)) c.vehicleQueue.delete(id);
    for (const j of this.junctions) {
      const inside = this.inJunction(j, p, reach);
      if (j.vehicle === id && !inside) j.vehicle = null;
      if (inside || !this.inJunction(j, p, reach + 0.25)) j.vehicleQueue.delete(id);
    }
  }
  canSpawn(position: THREE.Vector3, heading?: number, size = CAR_SIZE) {
    const reach = Math.max(0, size.half - CAR_SIZE.half);
    this.vehicleSizes.set(-1, size);
    const free = ![...this.crossings.values()].some(c => near(position, c.position, STOP_DISTANCE + reach + 0.1)) && !this.junctions.some(j => this.inJunction(j, position, reach + 0.1)) && this.canDrive(-1, position, position, heading);
    this.vehicleSizes.delete(-1);
    return free;
  }
  canDrive(id: number, current: THREE.Vector3, next: THREE.Vector3, heading = Math.atan2(next.x - current.x, next.z - current.z), exit?: THREE.Vector3) {
    this.blockedVehicles.delete(id);
    const stop = (reason: string, by?: number, crossing?: number) => { this.stoppedCars++; if (id >= 0) this.blockedVehicles.set(id, { reason, by, crossing }); return false; };
    // Entering a junction box (signalled or not). Returns the reason to wait, if any.
    const released = id >= 0 ? this.released.get(id) || 0 : 0;
    const enter = (box: Crossing | Junction, centre: THREE.Vector3, inside: (p: THREE.Vector3, margin?: number) => boolean): [string, number | undefined] | null => {
      if (id >= 0 && !box.vehicleQueue.has(id)) box.vehicleQueue.set(id, this.seconds);
      if (id < 0) return null;
      if (released) { box.vehicle = id; return null; }
      // Don't block the box: wait outside until the exit beyond the junction has room, or a
      // queue reaching back from the next junction gridlocks both signals.
      if (exit) {
        const exitHeading = Math.atan2(exit.x - centre.x, exit.z - centre.z);
        const full = [...this.vehicles].find(([other, p]) => other !== id && p.distanceTo(exit) < 0.5 && Math.cos((this.vehicleHeadings.get(other) ?? exitHeading) - exitHeading) > 0.5);
        if (full) return ['box', full[0]];
      }
      // Reserve the junction before entering, so crossing vehicle streams cannot meet inside it
      // or gridlock each other while a pedestrian signal is waiting for clearance.
      if (box.vehicle !== null && box.vehicle !== id) return ['junction', box.vehicle];
      const occupant = [...this.vehicles].find(([other, p]) => other !== id && inside(p));
      if (occupant) return ['junction', occupant[0]];
      // A car holding back because its exit is full gives up its turn, or it and the cars it
      // waits for can block each other in a loop.
      const first = [...box.vehicleQueue].filter(([other]) => { const p = this.vehicles.get(other); return p && inside(p, 0.2) && this.blockedVehicles.get(other)?.reason !== 'box'; }).sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]?.[0];
      if (first !== undefined && first !== id) return ['queue', first];
      box.vehicle = id; return null;
    };
    const size = this.vehicleSizes.get(id) ?? CAR_SIZE, reach = this.reach(id);
    for (const c of this.crossings.values()) if (!near(current, c.position, STOP_DISTANCE + reach) && near(next, c.position, STOP_DISTANCE + reach)) {
      if (id >= 0 && !c.vehicleQueue.has(id)) c.vehicleQueue.set(id, this.seconds);
      if (c.phase !== 'cars') return stop('signal', undefined, c.road);
      const wait = enter(c, c.position, (p, margin = 0) => near(p, c.position, STOP_DISTANCE + margin));
      if (wait) return stop(wait[0], wait[1], c.road);
    }
    for (const j of this.junctions) if (!this.inJunction(j, current, reach) && this.inJunction(j, next, reach)) {
      const wait = enter(j, j.tiles.reduce((best, t) => t.distanceTo(next) < best.distanceTo(next) ? t : best), (p, margin = 0) => this.inJunction(j, p, margin));
      if (wait) return stop(wait[0], wait[1], j.road);
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const key = keyAt(next.x + dx, next.z + dz);
      const travel = next.distanceTo(current), forwardX = Math.sin(heading), forwardZ = Math.cos(heading);
      for (const person of this.pedestrianBuckets.get(key) || []) {
        // Cars never drive on the pavement; projecting a turning car's path straight ahead would
        // otherwise stop it for people waiting on the far kerb.
        if (surfaceHeight(this.roads, person.x, person.z) === PAVEMENT_SURFACE) continue;
        const px = person.x - current.x, pz = person.z - current.z;
        const forward = px * forwardX + pz * forwardZ, lateral = Math.abs(px * forwardZ - pz * forwardX);
        const nx = person.x - next.x, nz = person.z - next.z;
        const endForward = nx * forwardX + nz * forwardZ, endLateral = Math.abs(nx * forwardZ - nz * forwardX);
        // 0.115 matches what counts as touching; people just clear of the lanes (0.12) don't stop cars.
        // (Scaled for longer and wider vehicles.)
        const side = size.side + 0.025, ends = size.half + 0.035;
        if (lateral < side && forward > -ends && forward < travel + ends || endLateral < side && Math.abs(endForward) < ends) return stop('pedestrian');
      }
      for (const other of this.vehicleBuckets.get(key) || []) {
        if (other === id) continue;
        if (released && !this.solidVehicles.has(other)) continue;
        const p = this.vehicles.get(other)!;
        const otherHeading = this.vehicleHeadings.get(other) ?? heading;
        const dx = p.x - next.x, dz = p.z - next.z, longitudinal = dx * forwardX + dz * forwardZ, lateral = Math.abs(dx * forwardZ - dz * forwardX);
        const sameDirection = Math.cos(heading - otherHeading) > 0.9;
        const otherSize = this.vehicleSizes.get(other) ?? CAR_SIZE;
        if (vehicleOverlap(next, heading, p, otherHeading, 0.005, size, otherSize) || sameDirection && longitudinal > 0 && longitudinal < size.half + otherSize.half + 0.05 && lateral < size.side + otherSize.side) return stop('vehicle', other);
      }
    }
    return true;
  }
}
