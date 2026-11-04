import * as THREE from 'three';
import { vehicleOverlap } from './streets';
import { Traffic, type FleetVehicle } from './traffic';
import { PrimitiveBatch } from './primitiveBatch';

export interface Impact { a: number; b: number; position: THREE.Vector3; road: number }
const emergency = (v: FleetVehicle) => v.model === 'police' || v.model === 'tow';
// Swept oriented bodies, rather than tile occupancy or just centre distances. Sample at
// less than a tyre's width, including both vehicles' motion and changing heading.
export function vehicleImpacts(before: readonly FleetVehicle[], after: readonly FleetVehicle[]): Impact[] {
  const previous = new Map(before.map(v => [v.id, v])), cells = new Map<string, FleetVehicle[]>(), pairs = new Set<string>(), impacts: Impact[] = [];
  for (const v of after) {
    if (v.crashed || emergency(v) || !previous.has(v.id)) continue;
    const p = previous.get(v.id)!;
    const minX = Math.floor(Math.min(v.position.x, p.position.x) - v.size.half), maxX = Math.floor(Math.max(v.position.x, p.position.x) + v.size.half);
    const minZ = Math.floor(Math.min(v.position.z, p.position.z) - v.size.half), maxZ = Math.floor(Math.max(v.position.z, p.position.z) + v.size.half);
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const key = `${x}:${z}`, list = cells.get(key) || [];
      for (const other of list) {
        const pair = [v.id, other.id].sort((a, b) => a - b).join(':'); if (pairs.has(pair)) continue; pairs.add(pair);
        const old = previous.get(other.id)!;
        if (vehicleOverlap(p.position, p.heading, old.position, old.heading, -0.008, p.size, old.size)) continue;
        const travel = p.position.distanceTo(v.position) + old.position.distanceTo(other.position);
        if (travel < 0.001) continue;
        const steps = Math.min(128, Math.max(1, Math.ceil(travel / 0.025)));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps, a = p.position.clone().lerp(v.position, t), b = old.position.clone().lerp(other.position, t);
          const turnA = Math.atan2(Math.sin(v.heading - p.heading), Math.cos(v.heading - p.heading)), turnB = Math.atan2(Math.sin(other.heading - old.heading), Math.cos(other.heading - old.heading));
          if (vehicleOverlap(a, p.heading + turnA * t, b, old.heading + turnB * t, -0.008, v.size, other.size)) { impacts.push({ a: v.id, b: other.id, position: a.add(b).multiplyScalar(0.5), road: v.road }); break; }
        }
      }
      list.push(v); cells.set(key, list);
    }
  }
  return impacts;
}

export interface ResponseBase { road: number; police: boolean; tow: boolean }
export interface RoadIncident { id: number; cars: number[]; position: THREE.Vector3; road: number; stage: 'reported' | 'responding' | 'controlling' | 'loading' | 'recovering'; elapsed: number; stageTime: number; police: number | null; tow: number | null; policeBase: number; towBase: number; removed: boolean; retry: number }

export class RoadIncidents {
  readonly active = new Map<number, RoadIncident>();
  readonly stats = { accidents: 0, cleared: 0, towed: 0, cancelled: 0 };
  private batch: PrimitiveBatch;
  private previous: FleetVehicle[] = [];
  private bases: ResponseBase[] = [];
  private roads = new Set<number>();
  private nextId = 1; private seconds = 0;
  constructor(scene: THREE.Scene, private traffic: Traffic) { this.batch = new PrimitiveBatch(scene, 'city-road-response', 2048); traffic.enableIncidents(true); }
  setRoads(roads: Set<number>) {
    // A demolished road must never leave a held car or an orphaned emergency scene behind.
    for (const incident of [...this.active.values()]) if (!roads.has(incident.road) || !roads.has(incident.policeBase) || !roads.has(incident.towBase)) this.finish(incident, true);
    this.roads = roads; this.previous = [];
  }
  setBases(bases: ResponseBase[]) { this.bases = bases; }
  get notice() {
    const i = this.active.values().next().value as RoadIncident | undefined;
    if (!i) return null;
    return { id: i.id, position: i.position, text: i.stage === 'reported' ? 'Accident reported. Dispatching police and recovery.' : i.stage === 'responding' ? 'Police and tow truck responding.' : i.stage === 'controlling' ? 'Police are managing traffic at the accident.' : i.stage === 'loading' ? 'Tow crew loading a damaged vehicle.' : 'Tow truck taking the wreck away. Road reopening.' };
  }
  private base(road: number, kind: 'police' | 'tow') {
    return this.bases.find(b => b[kind] && this.traffic.canReach(b.road, road))?.road ?? [...this.roads].find(r => this.traffic.canReach(r, road)) ?? road;
  }
  private finish(i: RoadIncident, cancel = false) {
    for (const car of i.cars) this.traffic.setCrashed(car, false);
    for (const id of [i.police, i.tow]) if (id !== null) { this.traffic.holdService(id, false); this.traffic.removeVehicle(id); }
    this.active.delete(i.id); if (cancel) this.stats.cancelled++; else this.stats.cleared++;
  }
  update(dt: number, motion: boolean) {
    const fleet = this.traffic.fleetVehicles, vehicles = new Map(fleet.map(v => [v.id, v]));
    for (const i of [...this.active.values()]) if (!this.roads.has(i.road) || !i.removed && i.cars.some(id => !vehicles.has(id))) this.finish(i, true);
    if (motion) {
      this.seconds += dt;
      for (const impact of vehicleImpacts(this.previous, fleet)) {
        if (this.active.size >= 3 || [...this.active.values()].some(i => i.cars.includes(impact.a) || i.cars.includes(impact.b))) continue;
        const i: RoadIncident = { id: this.nextId++, cars: [impact.a, impact.b], position: impact.position, road: impact.road, stage: 'reported', elapsed: 0, stageTime: 0, police: null, tow: null, policeBase: this.base(impact.road, 'police'), towBase: this.base(impact.road, 'tow'), removed: false, retry: 0 };
        this.active.set(i.id, i); this.stats.accidents++;
        for (const id of i.cars) this.traffic.setCrashed(id, true);
      }
      for (const i of [...this.active.values()]) {
        i.elapsed += dt; i.stageTime += dt; i.retry -= dt;
        if (i.elapsed > 240) { this.finish(i, true); continue; }
        if (i.elapsed > 1.5 && i.retry <= 0) {
          if (i.police === null) i.police = this.traffic.spawnResponder('police', i.policeBase, i.road);
          // Send recovery after police have secured the scene. An early tow truck waiting
          // on the approach must not trap the police car behind it in the same lane.
          if (i.stage === 'controlling' && i.tow === null) i.tow = this.traffic.spawnResponder('tow', i.towBase, i.road);
          i.retry = 2;
          if (i.stage === 'reported') { i.stage = 'responding'; i.stageTime = 0; }
        }
        const police = i.police === null ? undefined : vehicles.get(i.police), tow = i.tow === null ? undefined : vehicles.get(i.tow);
        const policeHere = police && police.position.distanceTo(i.position) < 1;
        const towHere = tow && tow.position.distanceTo(i.position) < 2;
        if (policeHere && i.stage !== 'recovering') this.traffic.holdService(police.id, true);
        if (towHere && i.stage !== 'recovering') this.traffic.holdService(tow.id, true);
        if (i.stage === 'responding' && policeHere) { i.stage = 'controlling'; i.stageTime = 0; }
        if (i.stage === 'controlling' && towHere && i.stageTime > 4) { i.stage = 'loading'; i.stageTime = 0; }
        if (i.stage === 'loading' && i.stageTime > 7 && tow) {
          const wreck = i.cars.find(id => vehicles.get(id)?.model !== 'tram');
          if (wreck !== undefined && this.traffic.loadWreck(tow.id, wreck)) { i.removed = true; this.stats.towed++; }
          i.stage = 'recovering'; i.stageTime = 0;
          for (const id of i.cars) this.traffic.setCrashed(id, false);
          this.traffic.holdService(tow.id, false); this.traffic.dispatchService(tow.id, i.towBase);
        }
        if (i.stage === 'recovering') {
          if (police && i.stageTime > 4) { this.traffic.holdService(police.id, false); this.traffic.dispatchService(police.id, i.policeBase); }
          if (i.stageTime > 10 && tow && (tow.road === i.towBase || tow.position.distanceTo(i.position) > 4) || i.stageTime > 45) this.finish(i);
        }
      }
      this.previous = fleet;
    }
    this.traffic.setRoadClosures(new Set([...this.active.values()].filter(i => ['controlling', 'loading'].includes(i.stage)).map(i => i.road)));
    this.draw(vehicles);
  }
  private draw(vehicles: Map<number, FleetVehicle>) {
    const b = this.batch; b.begin();
    for (const i of this.active.values()) {
      const pulse = Math.sin(this.seconds * 9) > 0;
      for (const id of i.cars) {
        const car = vehicles.get(id); if (!car || !car.crashed) continue;
        for (let puff = 0; puff < 3; puff++) b.add('sphere', car.position.clone().add(new THREE.Vector3(Math.sin(puff + this.seconds) * 0.025, 0.17 + (this.seconds * 0.12 + puff * 0.1) % 0.4, 0.08)), [0.07, 0.1, 0.07], '#9b9b94');
        if (pulse) for (const side of [-1, 1]) b.add('sphere', car.position.clone().add(new THREE.Vector3(side * 0.07, 0.08, 0)), 0.026, '#ffc552');
      }
      const police = i.police === null ? undefined : vehicles.get(i.police), tow = i.tow === null ? undefined : vehicles.get(i.tow);
      for (const v of [police, tow]) if (v) for (const side of [-1, 1]) b.add('sphere', v.position.clone().add(new THREE.Vector3(side * 0.04, v.model === 'tow' ? 0.25 : 0.2, 0)), 0.035, v.model === 'tow' ? pulse ? '#ffc64f' : '#9a6d25' : pulse === (side > 0) ? '#ef4d50' : '#4d9bff');
      if (['controlling', 'loading', 'recovering'].includes(i.stage) && police) {
        const right = new THREE.Vector3(Math.cos(police.heading), 0, -Math.sin(police.heading));
        for (let n = 0; n < 2; n++) {
          const p = police.position.clone().addScaledVector(right, 0.26).addScaledVector(new THREE.Vector3(Math.sin(police.heading), 0, Math.cos(police.heading)), n * 0.28 - 0.12); p.y = 0.075;
          b.add('box', p, [0.035, 0.085, 0.025], '#263f5b', police.heading);
          b.add('sphere', p.clone().add(new THREE.Vector3(0, 0.115, 0)), 0.034, '#d4aa84');
          b.add('box', p.clone().add(new THREE.Vector3(0, 0.129, 0)), [0.04, 0.012, 0.035], '#183047', police.heading);
          for (const s of [-1, 1]) b.segment(p.clone().addScaledVector(right, s * 0.012), p.clone().addScaledVector(right, s * 0.013).setY(0.055), 0.008, '#1c2b3c');
          const shoulder = p.clone().add(new THREE.Vector3(0, 0.07, 0)), hand = shoulder.clone().addScaledVector(right, 0.07).add(new THREE.Vector3(0, Math.sin(this.seconds * 3 + n) * 0.025, 0));
          b.segment(shoulder, hand, 0.009, '#d4aa84'); b.add('sphere', hand, 0.018, '#f5dd8d');
        }
        for (const side of [-1, 1]) for (let n = 0; n < 3; n++) {
          const p = i.position.clone().addScaledVector(right, side * 0.25).add(new THREE.Vector3(Math.sin(police.heading) * (n - 1) * 0.3, 0, Math.cos(police.heading) * (n - 1) * 0.3));
          p.y = 0.04; b.add('box', p, [0.07, 0.008, 0.07], '#3a4145'); b.add('cone', p.clone().add(new THREE.Vector3(0, 0.008, 0)), [0.045, 0.085, 0.045], '#ef8d38');
        }
        if (i.stage === 'loading' && tow) b.segment(tow.position.clone().add(new THREE.Vector3(0, 0.15, 0)), i.position.clone().add(new THREE.Vector3(0, 0.1, 0)), 0.004, '#525b64');
      }
    }
    b.end();
  }
  dispose() { for (const i of [...this.active.values()]) this.finish(i, true); this.traffic.setRoadClosures(new Set()); this.traffic.enableIncidents(false); this.batch.dispose(); }
}
