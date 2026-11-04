import * as THREE from 'three';
import type { StreetNetwork } from './streets';
import { CAR_SIZE, TRAM_LENGTH, TRAM_SECTION, VEHICLES, vehicleGeometry, type VehicleModel, type VehicleSize } from './vehicleModels';
import { ROAD_KINDS, type RoadKind } from '../../services/cityGameService';

// Vehicles moving along the road network (cars, vans, taxis, buses and trams, see
// vehicleModels.ts), chimney smoke, and the road-walking helpers people.ts shares. Each is a few
// InstancedMeshes updated every frame, so thousands of residents stay cheap to draw.

export type ToWorld = (index: number) => THREE.Vector3; // centre of a tile

// Road surfaces, shared with the road geometry in CityScene3D so people and cars stand on top
// of them: the asphalt's top, the raised pavement's top, and where the pavement starts (its
// distance from the road's centre line, on sides with no road joining).
import { ROAD_SURFACE, VEHICLE_STOP_DISTANCE } from './pavement';
export { ROAD_SURFACE, PAVEMENT_SURFACE, PAVEMENT_INNER, surfaceHeight } from './pavement';

const DIRS = [1, -1, 100, -100];

export const buildGraph = (roads: Set<number>) => {
  const graph = new Map<number, number[]>();
  roads.forEach(index => {
    // East/west steps must stay on the same row; north/south ones can't leave the map.
    graph.set(index, DIRS.filter(d => Math.abs(d) === 100 || Math.floor((index + d) / 100) === Math.floor(index / 100)).map(d => index + d).filter(n => roads.has(n)));
  });
  return graph;
};


export const pickNext = (graph: Map<number, number[]>, at: number, cameFrom: number) => {
  const options = graph.get(at) || [];
  const forward = options.filter(n => n !== cameFrom);
  const list = forward.length ? forward : options;
  return list.length ? list[Math.floor(Math.random() * list.length)] : at;
};

export const spawnOnRoads = (graph: Map<number, number[]>, roadList: number[]) => {
  const from = roadList[Math.floor(Math.random() * roadList.length)];
  return { from, to: pickNext(graph, from, -1) };
};

// Position along a road segment, shifted sideways (pavement for people, lane for cars).
export const along = (toWorld: ToWorld, from: number, to: number, t: number, offset: number, out: THREE.Vector3) => {
  const a = toWorld(from), b = toWorld(to);
  out.lerpVectors(a, b, t);
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  out.x += (-dz / length) * offset;
  out.z += (dx / length) * offset;
  return Math.atan2(dx, dz);
};

interface Car { uid?: number; target?: number; sinceStop?: number; from: number; to: number; t: number; speed: number; previous?: number; next?: number; held?: number;
  // Seconds since the car last moved, and how long it may still pass through a deadlock.
  stalled?: number; release?: number;
  skid?: number; cargo?: { model: VehicleModel; color: THREE.Color };
  model?: VehicleModel; color?: THREE.Color;
  // The tiles before `previous` and after `next`, for a tram's second section.
  before?: number; after?: number;
  // Seconds still to wait at a bus or tram stop or taxi rank, and the last stop served.
  dwell?: number; served?: number; servedFrom?: number }

// Lane centres sit midway between the centre line and the kerb (0.3): two 3 m lanes, leaving
// room between a car's side and people standing at the kerb.
export const LANE = 0.15;

// Join the lane centres with a continuous curve before/after a tile centre.
// Snapping the lane offset at the centre used to put turning cars into the
// opposing queue, where both streams could wait on each other permanently.
export function vehiclePose(toWorld: ToWorld, car: Car, out: THREE.Vector3) {
  const aroundStart = car.t < 0.5 && car.previous !== undefined;
  const before = aroundStart ? car.previous! : car.from, node = aroundStart ? car.from : car.to, after = aroundStart ? car.to : car.next;
  if (after === undefined) return along(toWorld, car.from, car.to, car.t, -LANE, out);
  const centre = toWorld(node), incoming = centre.clone().sub(toWorld(before)).normalize(), outgoing = toWorld(after).sub(centre).normalize();
  const dot = incoming.dot(outgoing);
  if (dot > 0.99) return along(toWorld, car.from, car.to, car.t, -LANE, out);
  const u = aroundStart ? car.t + 0.5 : car.t - 0.5;
  const rightIn = new THREE.Vector3(incoming.z, 0, -incoming.x), rightOut = new THREE.Vector3(outgoing.z, 0, -outgoing.x);
  const a = centre.clone().addScaledVector(incoming, -0.5).addScaledVector(rightIn, LANE);
  const b = centre.clone().addScaledVector(outgoing, 0.5).addScaledVector(rightOut, LANE);
  const tangent = new THREE.Vector3();
  if (dot < -0.99) {
    const c = centre.clone().addScaledVector(incoming, 0.1).addScaledVector(rightIn, LANE);
    const d = centre.clone().addScaledVector(incoming, 0.1).addScaledVector(rightOut, LANE);
    out.copy(a).multiplyScalar((1 - u) ** 3).addScaledVector(c, 3 * u * (1 - u) ** 2).addScaledVector(d, 3 * u * u * (1 - u)).addScaledVector(b, u ** 3);
    tangent.copy(c).sub(a).multiplyScalar(3 * (1 - u) ** 2).addScaledVector(d.clone().sub(c), 6 * u * (1 - u)).addScaledVector(b.clone().sub(d), 3 * u * u);
  } else {
    // Meet at the intersection of the two lane centres. Follow those lanes
    // continuously, without cutting the occupied pavement corner or jumping
    // sideways into an oncoming car when the road segment changes.
    const corner = centre.clone().addScaledVector(rightIn.clone().add(rightOut), LANE / (1 + dot));
    const incomingLength = a.distanceTo(corner), outgoingLength = corner.distanceTo(b), distance = u * (incomingLength + outgoingLength);
    if (distance < incomingLength) { out.copy(a).addScaledVector(incoming, distance); tangent.copy(incoming); }
    else { out.copy(corner).addScaledVector(outgoing, distance - incomingLength); tangent.copy(outgoing); }
  }
  return Math.atan2(tangent.x, tangent.z);
}

const sizeOf = (model: VehicleModel = 'sedan'): VehicleSize => model === 'tram' ? { half: TRAM_LENGTH / 2, side: VEHICLES.tram.width / 2 } : { half: VEHICLES[model].length / 2, side: VEHICLES[model].width / 2 };
const DWELL: Partial<Record<VehicleModel, number>> = { bus: 6, tram: 6, taxi: 4, garbage: 8, police: 10, tow: 10 };
export interface TransitStops { bus: Set<number>; tram: Set<number>; taxiRanks: Set<number>; dropOffs: Set<number>; waste?: Set<number>; sanitation?: Set<number> }
export interface ServiceVehicle { id: number; model: 'bus' | 'tram' | 'taxi' | 'garbage'; position: THREE.Vector3; heading: number; road: number; stop: number | null; dwell: number; size: VehicleSize }
export interface FleetVehicle { id: number; model: VehicleModel; position: THREE.Vector3; heading: number; road: number; size: VehicleSize; stopped: boolean; crashed: boolean }

export class Traffic {
  readonly meshes: THREE.InstancedMesh[];
  private chassis: THREE.InstancedMesh; private wheels: THREE.InstancedMesh; private lights: THREE.InstancedMesh;
  private models = {} as Record<VehicleModel, { paint: THREE.InstancedMesh; detail: THREE.InstancedMesh }>;
  private cars: Car[] = [];
  private nextUid = 1;
  private heldServices = new Set<number>();
  private incidentCars = new Set<number>();
  private responders = new Set<number>();
  private closedRoads: ReadonlySet<number> = new Set();
  private incidentsEnabled = false;
  private drivingClock = 0; private nextSkid = 60;
  private weatherSpeed = 1; private skidRisk = 1;
  private routes = new Map<string, Map<number, number>>();
  private graph = new Map<number, number[]>();
  private tramGraph = new Map<number, number[]>();
  private roadList: number[] = [];
  private tramList: number[] = [];
  private kinds = new Map<number, RoadKind>();
  private stops: TransitStops = { bus: new Set(), tram: new Set(), taxiRanks: new Set(), dropOffs: new Set() };
  private base = new THREE.Matrix4(); private local = new THREE.Matrix4(); private out = new THREE.Matrix4(); private quat = new THREE.Quaternion(); private up = new THREE.Vector3(0, 1, 0); private one = new THREE.Vector3(1, 1, 1); private pos = new THREE.Vector3();
  private offset = new THREE.Vector3(); private stretch = new THREE.Vector3(); private section = new THREE.Matrix4(); private noTurn = new THREE.Quaternion();
  readonly lightMaterial: THREE.MeshStandardMaterial;
  private materials: THREE.Material[];

  constructor(scene: THREE.Scene, private capacity: number, private toWorld: ToWorld, private streets?: StreetNetwork) {
    const paint = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.5 });
    const detail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.35 });
    const tyre = new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.8 });
    const underbody = new THREE.MeshStandardMaterial({ color: '#222426', roughness: 0.9 });
    this.lightMaterial = new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff1b0', emissiveIntensity: 0.2 });
    this.materials = [paint, detail, tyre, underbody, this.lightMaterial];
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string) => {
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true; mesh.frustumCulled = false; mesh.count = 0; mesh.name = name;
      scene.add(mesh);
      return mesh;
    };
    // Every vehicle has a dark underbody at its own pose: one instance per vehicle, in order.
    this.chassis = make(new THREE.BoxGeometry(0.15, 0.02, 0.34).translate(0, 0.025, 0), underbody, capacity, 'city-cars');
    const wheel = new THREE.CylinderGeometry(0.034, 0.034, 0.026, 18); wheel.rotateZ(Math.PI / 2);
    this.wheels = make(wheel, tyre, capacity * 10, 'city-car-wheels');
    this.lights = make(new THREE.BoxGeometry(1, 0.02, 0.006), this.lightMaterial, capacity, 'city-car-lights');
    const parts: THREE.InstancedMesh[] = [];
    for (const model of Object.keys(VEHICLES) as VehicleModel[]) {
      const geometry = vehicleGeometry(model), count = model === 'tram' ? 32 : capacity;
      this.models[model] = { paint: make(geometry.paint, paint, count, `city-${model}`), detail: make(geometry.detail, detail, count, `city-${model}-detail`) };
      this.models[model].paint.setColorAt(0, new THREE.Color());
      parts.push(this.models[model].paint, this.models[model].detail);
    }
    this.meshes = [this.chassis, ...parts, this.wheels, this.lights];
  }

  // Road kinds set each tile's speed; trams run only on connected tram line tiles.
  setRoads(roads: Set<number>, kinds: ReadonlyMap<number, RoadKind> = new Map()) {
    this.graph = buildGraph(roads);
    this.routes.clear(); this.heldServices.clear();
    this.roadList = [...roads];
    this.kinds = new Map(kinds);
    const tram = new Set([...roads].filter(road => kinds.get(road) === 'tram'));
    this.tramGraph = buildGraph(tram); this.tramList = [...tram];
    this.cars = this.cars.filter(car => { const graph = this.graphFor(car); return graph.has(car.from) && graph.has(car.to); });
    const live = new Set(this.cars.map(c => c.uid!));
    for (const id of this.responders) if (!live.has(id)) this.responders.delete(id);
    for (const id of this.incidentCars) if (!live.has(id)) this.incidentCars.delete(id);
    for (const car of this.cars) { if (car.next !== undefined && !this.graphFor(car).has(car.next)) car.next = undefined; car.after = undefined; car.target = undefined; car.dwell = 0; }
    this.chassis.count = this.cars.length;
  }
  // Buses call at bus stops and trams at tram stops; taxis wait at ranks and drop off at shops.
  setStops(stops: TransitStops) { this.stops = stops; }
  get vehicleCounts() { const counts: Partial<Record<VehicleModel, number>> = {}; for (const car of this.cars) counts[car.model!] = (counts[car.model!] || 0) + 1; return counts; }
  get fleetVehicles(): FleetVehicle[] {
    return this.cars.map(c => { const position = new THREE.Vector3(), heading = vehiclePose(this.toWorld, c, position); position.y = ROAD_SURFACE;
      return { id: c.uid!, model: c.model!, position, heading, road: c.t < 0.5 ? c.from : c.to, size: sizeOf(c.model), stopped: Boolean(c.dwell || this.heldServices.has(c.uid!) || this.incidentCars.has(c.uid!)), crashed: this.incidentCars.has(c.uid!) }; });
  }
  enableIncidents(enabled: boolean) { this.incidentsEnabled = enabled; }
  setRoadClosures(roads: ReadonlySet<number>) { this.closedRoads = roads; }
  setDrivingConditions(speed: number, risk: number) { this.weatherSpeed = Math.max(0.3, Math.min(1, speed)); this.skidRisk = Math.max(0, risk); }
  setCrashed(id: number, crashed: boolean) { if (crashed) { this.incidentCars.add(id); const c = this.cars.find(c => c.uid === id); if (c) { c.release = 0; c.skid = 0; } } else if (this.incidentCars.delete(id)) { const c = this.cars.find(c => c.uid === id); if (c) c.dwell = 0; } }
  removeVehicle(id: number) { this.cars = this.cars.filter(c => c.uid !== id); this.incidentCars.delete(id); this.heldServices.delete(id); this.responders.delete(id); }
  loadWreck(tow: number, wreck: number) {
    const truck = this.cars.find(c => c.uid === tow), car = this.cars.find(c => c.uid === wreck);
    if (!truck || !car) return false;
    truck.cargo = { model: car.model!, color: car.color!.clone() }; this.removeVehicle(wreck); return true;
  }
  canReach(from: number, to: number) { return this.graph.has(from) && this.routeTree(to).has(from); }
  spawnResponder(model: 'police' | 'tow', origin: number, target: number) {
    if (!this.canReach(origin, target)) return null;
    if (this.cars.length >= this.capacity) { const spare = this.cars.find(c => !this.incidentCars.has(c.uid!) && !this.responders.has(c.uid!) && !this.heldServices.has(c.uid!) && ['sedan', 'suv', 'hatchback', 'pickup', 'van'].includes(c.model!)); if (!spare) return null; this.removeVehicle(spare.uid!); }
    for (let i = 0; i < 12; i++) if (this.spawn(model, origin)) { const car = this.cars[this.cars.length - 1]; this.responders.add(car.uid!); car.target = target; return car.uid!; }
    return null;
  }
  holdService(id: number, held: boolean) { if (held) this.heldServices.add(id); else this.heldServices.delete(id); }
  dispatchService(id: number, road?: number) { const car = this.cars.find(c => c.uid === id); if (car) car.target = road; }
  get serviceVehicles(): ServiceVehicle[] {
    return this.cars.filter(c => !this.incidentCars.has(c.uid!) && ['bus', 'tram', 'taxi', 'garbage'].includes(c.model || '')).map(c => {
      const position = new THREE.Vector3(), heading = vehiclePose(this.toWorld, c, position); position.y = ROAD_SURFACE;
      return { id: c.uid!, model: c.model as ServiceVehicle['model'], position, heading, road: c.t < 0.5 ? c.from : c.to, stop: (c.dwell || 0) > 0 ? c.served ?? null : null, dwell: c.dwell || 0, size: sizeOf(c.model) };
    });
  }
  private routeTree(goal: number, tram = false) {
    const key = `${tram}:${goal}`; let tree = this.routes.get(key); if (tree) return tree;
    const graph = tram ? this.tramGraph : this.graph; tree = new Map([[goal, goal]]); const queue = [goal];
    if (graph.has(goal)) for (let i = 0; i < queue.length; i++) for (const next of graph.get(queue[i]) || []) if (!tree.has(next)) { tree.set(next, queue[i]); queue.push(next); }
    this.routes.set(key, tree); return tree;
  }
  serviceCanReach(vehicle: ServiceVehicle, road: number) { return this.routeTree(road, vehicle.model === 'tram').has(vehicle.road); }
  private serviceNext(car: Car, from: number) {
    return car.target !== undefined && from !== car.target ? this.routeTree(car.target, car.model === 'tram').get(from) : undefined;
  }
  private graphFor(car: Car) { return car.model === 'tram' ? this.tramGraph : this.graph; }

  private pickModel(): VehicleModel {
    const weights: Array<[VehicleModel, number]> = [['sedan', 26], ['hatchback', 18], ['suv', 14], ['pickup', 7], ['van', 8], ['taxi', 12], ['bus', this.stops.bus.size ? 14 : 5]];
    let r = Math.random() * weights.reduce((sum, [, w]) => sum + w, 0);
    for (const [model, weight] of weights) if ((r -= weight) < 0) return model;
    return 'sedan';
  }
  private spawn(model: VehicleModel, origin?: number) {
    const tram = model === 'tram', graph = tram ? this.tramGraph : this.graph;
    const segment = origin === undefined ? spawnOnRoads(graph, tram ? this.tramList : this.roadList) : { from: origin, to: pickNext(graph, origin, -1) };
    if (segment.from === segment.to) return false;
    const colors = VEHICLES[model].colors;
    const candidate: Car = { ...segment, uid: this.nextUid++, previous: pickNext(graph, segment.from, segment.to), next: pickNext(graph, segment.to, segment.from), t: Math.random(), speed: 0.6 + Math.random() * 0.35, model, color: new THREE.Color(colors[Math.floor(Math.random() * colors.length)]) };
    const heading = vehiclePose(this.toWorld, candidate, this.pos);
    if (this.streets && !this.streets.canSpawn(this.pos, heading, sizeOf(model))) return false;
    this.streets?.moveVehicle(this.cars.length, this.pos, heading); this.cars.push(candidate);
    return true;
  }

  setCount(count: number) {
    // A tram for every 14 tiles of line, once there is a line worth running.
    const tramTarget = this.tramList.length < 6 ? 0 : Math.min(6, 1 + Math.floor(this.tramList.length / 14));
    const required: VehicleModel[] = count > 0 ? [...(this.stops.bus.size ? ['bus' as const] : []), ...(this.stops.taxiRanks.size ? ['taxi' as const] : []), ...(this.stops.sanitation?.size ? ['garbage' as const] : [])] : [];
    const target = this.roadList.length < 4 ? 0 : Math.min(this.capacity - tramTarget - this.responders.size, Math.max(0, Math.round(count)) + required.length);
    let trams = this.cars.filter(car => car.model === 'tram').length, others = this.cars.length - trams - this.responders.size;
    // Remove from the end, so the vehicles that stay keep their ids.
    for (let i = this.cars.length - 1; i >= 0 && (others > target || trams > tramTarget); i--) {
      if (this.responders.has(this.cars[i].uid!) || this.incidentCars.has(this.cars[i].uid!)) continue;
      const tram = this.cars[i].model === 'tram';
      if (tram ? trams > tramTarget : others > target) { this.cars.splice(i, 1); if (tram) trams--; else others--; }
    }
    let attempts = 0;
    while (trams < tramTarget && attempts++ < 40) if (this.spawn('tram')) trams++;
    // Keep a fleet slot free when a service vehicle cannot safely spawn this frame.
    // Otherwise ordinary traffic fills it permanently and the service never appears.
    for (const model of required) if (!this.cars.some(c => c.model === model) && others >= target) {
      const index = this.cars.findIndex(c => c.model !== 'tram' && !required.includes(c.model!) && !this.heldServices.has(c.uid!) && !this.responders.has(c.uid!) && !this.incidentCars.has(c.uid!));
      if (index >= 0) { this.cars.splice(index, 1); others--; }
    }
    for (const model of required) if (!this.cars.some(c => c.model === model) && others < target && this.spawn(model)) others++;
    attempts = 0;
    while (others < target && attempts++ < target * 4 + 8) {
      const missing = required.filter(model => !this.cars.some(c => c.model === model)).length;
      if (others >= target - missing) break;
      if (this.spawn(this.pickModel())) others++;
    }
    this.chassis.count = this.cars.length;
  }

  // Where along the road into a stop's tile a vehicle pulls in: short of a junction box, which
  // must stay clear, or else beside the building. Null: no call here.
  private stopAt(car: Car, tile: number, from: number, id: number) {
    const model = car.model || 'sedan';
    const calls = model === 'police' || model === 'tow' ? car.target === tile : model === 'bus' ? this.stops.bus.has(tile) : model === 'tram' ? this.stops.tram.has(tile)
      : model === 'garbage' ? this.stops.sanitation?.has(tile) || this.stops.waste?.has(tile) && car.target === tile
      : model === 'taxi' && (this.stops.taxiRanks.has(tile) || car.target === tile || this.stops.dropOffs.has(tile) && (tile * 7 + id * 13) % 4 === 0);
    if (!calls) return null;
    if (!this.streets) return 0.82;
    if (this.streets.boxAt(from)) return null;
    return this.streets.boxAt(tile) ? Math.max(0.02, 1 - (VEHICLE_STOP_DISTANCE + sizeOf(model).half - CAR_SIZE.half + 0.03)) : 0.82;
  }
  private advance(car: Car, step: number, graph: Map<number, number[]>) {
    const next: Car = { ...car, t: car.t + step };
    while (next.t >= 1) {
      next.t -= 1; next.before = next.previous; next.previous = next.from; next.from = next.to; next.to = next.next!;
      next.sinceStop = (next.sinceStop || 0) + 1;
      next.next = this.serviceNext(next, next.to) ?? next.after ?? pickNext(graph, next.to, next.from); next.after = this.serviceNext(next, next.next) ?? pickNext(graph, next.next, next.to);
    }
    return next;
  }
  // The route `delta` tile-lengths ahead of (or behind) a vehicle, for a tram's sections.
  private shifted(car: Car, delta: number): Car {
    const t = car.t + delta;
    if (t >= 1) return { from: car.to, to: car.next ?? car.to, previous: car.from, next: car.after, t: t - 1, speed: 0 };
    if (t < 0) return car.previous === undefined ? { ...car, t: 0 } : { from: car.previous, to: car.from, previous: car.before, next: car.to, t: t + 1, speed: 0 };
    return { ...car, t };
  }

  update(dt: number, motion: boolean) {
    if (motion) this.drivingClock += dt;
    this.cars.forEach(car => {
      const graph = this.graphFor(car);
      if (car.target === undefined && ['bus', 'tram', 'taxi', 'garbage'].includes(car.model || '')) {
        const stops = [...(car.model === 'bus' ? this.stops.bus : car.model === 'tram' ? this.stops.tram : car.model === 'garbage' ? this.stops.sanitation || [] : this.stops.taxiRanks)];
        car.target = stops.filter(road => road !== car.served && this.routeTree(road, car.model === 'tram').has(car.to)).sort((a, b) => this.toWorld(a).distanceToSquared(this.toWorld(car.to)) - this.toWorld(b).distanceToSquared(this.toWorld(car.to)))[0];
      }
      if (car.target !== undefined && car.t < 0.45) { car.next = this.serviceNext(car, car.to) ?? car.next; car.after = car.next === undefined ? undefined : this.serviceNext(car, car.next) ?? car.after; }
      if (car.next === undefined) car.next = pickNext(graph, car.to, car.from);
      if (car.after === undefined) car.after = pickNext(graph, car.next, car.to);
      if (car.t < 0.45 && this.closedRoads.has(car.next) && !this.responders.has(car.uid!) && !this.incidentCars.has(car.uid!)) {
        const diversion = (graph.get(car.to) || []).find(n => n !== car.from && !this.closedRoads.has(n));
        if (diversion !== undefined) { car.next = diversion; car.after = pickNext(graph, diversion, car.to); }
      }
    });
    this.streets?.setVehicles(this.cars.map((car, id) => { const position = new THREE.Vector3(); const heading = vehiclePose(this.toWorld, car, position); return { id, position, heading, size: sizeOf(car.model) }; }));
    if (this.streets) { this.streets.solidVehicles.clear(); this.cars.forEach((c, id) => { if (this.incidentCars.has(c.uid!)) this.streets!.solidVehicles.add(id); }); }
    if (motion) this.resolveDeadlocks(dt);
    const counts = {} as Record<VehicleModel, number>; for (const model of Object.keys(this.models) as VehicleModel[]) counts[model] = 0;
    let wheelCount = 0, lightCount = 0;
    const place = (model: VehicleModel, matrix: THREE.Matrix4, color: THREE.Color) => {
      const mesh = this.models[model], k = counts[model]; if (k >= mesh.paint.instanceMatrix.count) return;
      counts[model] = k + 1; mesh.paint.setMatrixAt(k, matrix); mesh.paint.setColorAt(k, color); mesh.detail.setMatrixAt(k, matrix);
    };
    const lamp = (model: VehicleModel, matrix: THREE.Matrix4) => {
      const spec = VEHICLES[model];
      this.local.compose(this.offset.set(0, spec.lamp.y, spec.length / 2 + 0.004), this.noTurn, this.stretch.set(spec.lamp.width, 1, 1));
      this.lights.setMatrixAt(lightCount++, this.out.multiplyMatrices(matrix, this.local));
    };
    for (let i = 0; i < this.cars.length; i += 1) {
      const car = this.cars[i], model = car.model || 'sedan', graph = this.graphFor(car);
      if (motion && car.from !== car.to) {
        if (this.heldServices.has(car.uid!) || this.incidentCars.has(car.uid!)) { car.dwell = Math.max(0.1, car.dwell || 0); car.stalled = 0; }
        else if (car.dwell && car.dwell > 0) { car.dwell -= dt; car.stalled = 0; }
        else {
          const kind = this.kinds.get(car.t < 0.5 ? car.from : car.to) || 'street';
          const nextCar = this.advance(car, dt * car.speed * VEHICLES[model].speed * ROAD_KINDS[kind].speed * this.weatherSpeed, graph);
          // Pull in at a stop on the way.
          let calling = false;
          if (nextCar.to !== car.served || nextCar.from !== car.servedFrom || (car.sinceStop || 0) > 3) {
            const at = this.stopAt(nextCar, nextCar.to, nextCar.from, i);
            if (at !== null && nextCar.t >= at && (car.to !== nextCar.to || car.t <= at)) { nextCar.t = car.to === nextCar.to ? Math.max(at, car.t) : at; calling = true; }
          }
          const current = new THREE.Vector3(), next = new THREE.Vector3();
          vehiclePose(this.toWorld, car, current);
          const nextHeading = vehiclePose(this.toWorld, nextCar, next);
          // Where the car leaves the junction ahead, so it never enters a box it cannot clear.
          const exit = car.next !== undefined ? new THREE.Vector3() : undefined;
          if (exit) vehiclePose(this.toWorld, { from: car.to, to: car.next!, t: 0.85, previous: car.from, speed: 0 }, exit);
          let moved = !this.streets || this.streets.canDrive(i, current, next, nextHeading, exit);
          const brakingForCar = this.streets?.blockedVehicles.get(i)?.reason === 'vehicle';
          if (this.incidentsEnabled && brakingForCar && this.drivingClock > this.nextSkid && ['sedan', 'hatchback', 'suv', 'pickup', 'van'].includes(model) && Math.random() < dt * 0.15 * this.skidRisk) { car.skid = 0.65; this.nextSkid = this.drivingClock + 100 + Math.random() * 80; }
          if (car.skid && car.skid > 0) { car.skid -= dt; if (brakingForCar) moved = true; nextCar.skid = car.skid; }
          if (moved) { Object.assign(car, nextCar); if (calling) { car.dwell = DWELL[model]; car.served = car.to; car.servedFrom = car.from; car.sinceStop = 0; if (car.target === car.to) { car.target = undefined; car.after = undefined; } } }
          car.stalled = moved ? 0 : (car.stalled || 0) + dt;
          // Exit still full after a moment: take another way out. A ring of queued cars around a
          // block only clears when someone turns off. The car waits short of the junction, where
          // its pose doesn't depend on `next`, so changing it doesn't move the car.
          car.held = this.streets?.blockedVehicles.get(i)?.reason === 'box' ? (car.held || 0) + dt : 0;
          if (car.held > 1.5) {
            const options = (graph.get(car.to) || []).filter(n => n !== car.from && n !== car.next);
            if (options.length) { car.next = options[Math.floor(Math.random() * options.length)]; car.after = pickNext(graph, car.next, car.to); }
            car.held = 0;
          }
        }
      }
      // Drive on the left, as in Malaysia and Singapore.
      const heading = vehiclePose(this.toWorld, car, this.pos);
      this.streets?.moveVehicle(i, this.pos, heading);
      this.pos.y = ROAD_SURFACE; // tyres on the asphalt, not sunk into it
      this.base.compose(this.pos, this.quat.setFromAxisAngle(this.up, heading), this.one);
      if (this.incidentCars.has(car.uid!)) this.base.multiply(new THREE.Matrix4().makeRotationZ(0.045));
      this.chassis.setMatrixAt(i, this.base);
      const color = car.color || new THREE.Color(VEHICLES[model].colors[0]);
      if (model === 'tram') {
        // Two sections, each following the rails, coupled at the middle.
        for (const shift of [TRAM_SECTION / 2, -TRAM_SECTION / 2]) {
          const sectionHeading = vehiclePose(this.toWorld, this.shifted(car, shift), this.pos);
          this.pos.y = ROAD_SURFACE;
          this.section.compose(this.pos, this.quat.setFromAxisAngle(this.up, sectionHeading), this.one);
          place('tram', this.section, color);
          if (shift > 0) lamp('tram', this.section);
        }
        continue;
      }
      place(model, this.base, color);
      if (car.cargo) { this.local.compose(this.offset.set(0, 0.09, -0.13), this.noTurn, this.stretch.setScalar(0.62)); place(car.cargo.model, this.out.multiplyMatrices(this.base, this.local), car.cargo.color); }
      lamp(model, this.base);
      const spec = VEHICLES[model], r = spec.wheelRadius / 0.034;
      for (const [x, z] of spec.wheels) {
        this.local.compose(this.offset.set(x, spec.wheelRadius, z), this.noTurn, this.stretch.set(1, r, r));
        this.wheels.setMatrixAt(wheelCount++, this.out.multiplyMatrices(this.base, this.local));
      }
      if (car.cargo) {
        const loaded = VEHICLES[car.cargo.model], radius = loaded.wheelRadius / 0.034 * 0.62;
        for (const [x, z] of loaded.wheels) {
          this.local.compose(this.offset.set(x * 0.62, 0.09 + loaded.wheelRadius * 0.62, z * 0.62 - 0.13), this.noTurn, this.stretch.set(0.62, radius, radius));
          this.wheels.setMatrixAt(wheelCount++, this.out.multiplyMatrices(this.base, this.local));
        }
      }
    }
    this.chassis.count = this.cars.length; this.wheels.count = wheelCount; this.lights.count = lightCount;
    for (const model of Object.keys(this.models) as VehicleModel[]) {
      const mesh = this.models[model]; mesh.paint.count = mesh.detail.count = counts[model];
      if (mesh.paint.instanceColor) mesh.paint.instanceColor.needsUpdate = true;
    }
    this.meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  }

  // Every stopped car waits for one other car (or a signal or a pedestrian). Rules that each
  // look sensible locally - don't block the box, queue for the junction, keep your distance -
  // can still close a loop of cars all waiting on each other, which never clears by itself:
  // around a block, on wide roads, at dead ends. Follow the waits; when they come back round,
  // let the car that has waited longest through the other cars for a moment. A car whose
  // waits end at a red light or a pedestrian is simply queueing and is never let through.
  private resolveDeadlocks(dt: number) {
    const streets = this.streets; if (!streets) return;
    streets.released.clear();
    const release = (id: number, seconds: number) => { this.cars[id].release = seconds; streets.released.set(id, 1); };
    this.cars.forEach((car, id) => { if (car.release && (car.release -= dt) > 0) streets.released.set(id, 1); else car.release = 0; });
    // Cars caught inside a junction when its light changed: the walk phase waits for them.
    for (const id of streets.clearing()) if (this.cars[id] && !this.cars[id].release && (this.cars[id].stalled || 0) > 0.5) release(id, 1);
    const stalled = (id: number | undefined) => id !== undefined && (this.cars[id]?.stalled || 0) > 0;
    const legitimate = new Set<number>(), checked = new Set<number>();
    for (let start = 0; start < this.cars.length; start++) {
      if (checked.has(start) || !stalled(start)) continue;
      const chain: number[] = [], seen = new Map<number, number>();
      let at: number | undefined = start, queueing = false;
      while (at !== undefined && !seen.has(at) && !checked.has(at)) {
        seen.set(at, chain.length); chain.push(at);
        const wait = streets.blockedVehicles.get(at);
        if (!wait || wait.reason === 'signal' || wait.reason === 'pedestrian') { queueing = true; at = undefined; break; }
        at = stalled(wait.by) ? wait.by : undefined;
      }
      if (at !== undefined && checked.has(at) && legitimate.has(at)) queueing = true;
      chain.forEach(id => { checked.add(id); if (queueing) legitimate.add(id); });
      if (at === undefined || !seen.has(at)) continue;
      const loop = chain.slice(seen.get(at));
      const first = loop.reduce((best, id) => (this.cars[id].stalled || 0) > (this.cars[best].stalled || 0) ? id : best);
      if ((this.cars[first].stalled || 0) > 1.5 && !this.cars[first].release) release(first, 1.2);
    }
    // Last resort for waits the chain can't see (a car blocked by one that is itself moving).
    this.cars.forEach((car, id) => { if (!car.release && !legitimate.has(id) && (car.stalled || 0) > 12) release(id, 1.5); });
  }

  dispose() {
    this.meshes.forEach(mesh => { mesh.geometry.dispose(); mesh.removeFromParent(); mesh.dispose(); });
    this.materials.forEach(material => material.dispose());
  }
}

export class Smoke {
  private mesh: THREE.InstancedMesh;
  private emitters: THREE.Vector3[] = [];
  private matrix = new THREE.Matrix4(); private quat = new THREE.Quaternion(); private scale = new THREE.Vector3(); private pos = new THREE.Vector3();
  private static PUFFS = 7;

  constructor(scene: THREE.Scene, private capacity: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.08, 2), new THREE.MeshStandardMaterial({ color: '#eef1f3', roughness: 1, transparent: true, opacity: 0.6, depthWrite: false }), capacity * Smoke.PUFFS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  setEmitters(points: THREE.Vector3[]) {
    this.emitters = points.slice(0, this.capacity);
    this.mesh.count = this.emitters.length * Smoke.PUFFS;
  }

  update(time: number, motion: boolean) {
    this.emitters.forEach((origin, e) => {
      for (let p = 0; p < Smoke.PUFFS; p += 1) {
        const t = motion ? ((time * 0.00025 + p / Smoke.PUFFS + e * 0.13) % 1) : p / Smoke.PUFFS;
        this.pos.set(origin.x + t * 0.5, origin.y + t * 1.1, origin.z + Math.sin(t * 6 + e) * 0.08);
        this.scale.setScalar((0.5 + t * 2.2) * (1 - t * 0.6) * (t > 0.85 ? (1 - t) / 0.15 : 1));
        this.matrix.compose(this.pos, this.quat, this.scale);
        this.mesh.setMatrixAt(e * Smoke.PUFFS + p, this.matrix);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh.removeFromParent(); this.mesh.dispose(); }
}
