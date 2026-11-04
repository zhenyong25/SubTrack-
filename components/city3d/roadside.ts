import * as THREE from 'three';
import { PrimitiveBatch } from './primitiveBatch';
import { type ActivityPose, type RecreationPlace, type RecreationVisits, type Visit } from './recreation';
import { Traffic, type ServiceVehicle, type ToWorld } from './traffic';
import type { StreetNetwork } from './streets';
import { PAVEMENT_SURFACE } from './pavement';

export interface RoadsidePoint { id: string; type: string; road: number; center: THREE.Vector3; curb: THREE.Vector3; online: boolean; waste: boolean }
interface Rider { id: number; visit: Visit; position: THREE.Vector3; heading: number; phase: 'boarding' | 'aboard' | 'alighting' | 'working'; waypoint: number; walking: boolean; timer: number; carrying: boolean }
interface Trip { vehicle: number; model: ServiceVehicle['model']; origin: string; target: RoadsidePoint; stage: 'boarding' | 'moving' | 'alighting' | 'collecting'; riders: Rider[]; elapsed: number; travel: number; collections: number }
const matches = (model: string, p: RecreationPlace) => model === 'garbage' ? p.serviceRole === 'sanitation'
  : model === 'taxi' ? p.type === 'taxistand' : model === 'tram' ? ['tramstop', 'interchange', 'railwaystation'].includes(p.type)
  : ['busstop', 'busdepot', 'interchange', 'railwaystation'].includes(p.type);
const right = (v: ServiceVehicle) => new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading));
export const vehicleDoor = (v: ServiceVehicle) => v.position.clone().addScaledVector(right(v), v.size.side + 0.045).add(new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading)).multiplyScalar(v.model === 'bus' || v.model === 'tram' ? 0.22 : 0.04)).setY(PAVEMENT_SURFACE);
const curbAt = (v: ServiceVehicle) => v.position.clone().addScaledVector(right(v), 0.255).setY(PAVEMENT_SURFACE);
const sameSide = (v: ServiceVehicle, p: RoadsidePoint) => p.center.clone().sub(v.position).dot(right(v)) > 0.02;

// Existing residents walk to a stopped vehicle, disappear into it, travel on that same
// vehicle and emerge on a pavement. The sanitation crew use the same lifecycle and fleet.
export class RoadsideLife {
  readonly trips = new Map<number, Trip>();
  readonly riders = new Map<number, Rider>();
  private points = new Map<string, RoadsidePoint>();
  private batch: PrimitiveBatch;
  private seconds = 0;
  private collectedAt = new Map<string, number>();
  private idleHolds = new Map<number, number>();
  private idleCooldown = new Map<number, number>();
  readonly stats = { busBoarded: 0, taxiBoarded: 0, tramBoarded: 0, alighted: 0, collections: 0, cancelled: 0 };
  constructor(scene: THREE.Scene, private traffic: Traffic, private visits: RecreationVisits, private toWorld: ToWorld, private streets?: StreetNetwork) { this.batch = new PrimitiveBatch(scene, 'roadside-props', 4096); }
  setPlaces(points: RoadsidePoint[]) {
    const next = new Map(points.filter(p => p.online).map(p => [p.id, p]));
    for (const trip of [...this.trips.values()]) for (const id of [trip.origin, trip.target.id]) {
      const old = this.points.get(id), live = next.get(id);
      if (!old || !live || old.road !== live.road || !old.curb.equals(live.curb)) { this.releaseTrip(trip, true); break; }
    }
    this.points = next;
  }
  has(id: number) { return this.riders.has(id); }
  private releaseTrip(trip: Trip, cancel = false) {
    this.traffic.holdService(trip.vehicle, false); this.traffic.dispatchService(trip.vehicle);
    for (const rider of trip.riders) {
      this.streets?.cancel(`transit:${rider.id}`); this.riders.delete(rider.id);
      if (this.visits.visits.get(rider.id) !== rider.visit) continue;
      if (cancel) {
        const node = this.streets?.closest(rider.position), road = node?.road ?? rider.visit.origin;
        this.visits.finishTransport(rider.id, road, node?.position || this.toWorld(road)); this.stats.cancelled++;
      } else { rider.visit.transporting = false; rider.visit.elapsed = 0; }
    }
    this.trips.delete(trip.vehicle);
  }
  cancelAll() { for (const trip of [...this.trips.values()]) this.releaseTrip(trip, true); for (const id of this.idleHolds.keys()) this.traffic.holdService(id, false); this.idleHolds.clear(); }
  private walk(rider: Rider, target: THREE.Vector3, dt: number, pavement = false, doorway?: ServiceVehicle) {
    if (this.streets) {
      // Only a held vehicle's short doorstep corridor may cross the pavement margin. Normal
      // walking still uses the street graph and its crossing signals.
      const curb = doorway && curbAt(doorway), door = doorway && vehicleDoor(doorway), line = door && curb && door.clone().sub(curb);
      const result = doorway && curb && door && line ? this.streets.crowd.move(rider.id, rider.position, target, dt, 0.35, point => {
        const f = Math.max(0, Math.min(1, point.clone().sub(curb).dot(line) / Math.max(0.000001, line.lengthSq())));
        return point.distanceTo(curb.clone().addScaledVector(line, f)) < 0.055;
      }) : pavement ? this.streets.walk(`transit:${rider.id}`, rider.position, target, dt, 0.35) : this.streets.stepResident(rider.id, rider.position, target, dt, 0.35);
      rider.walking = result.walking; if (result.walking) rider.heading = result.heading;
      return result.arrived;
    }
    const delta = target.clone().sub(rider.position), length = delta.length(); rider.walking = length > 0.002;
    if (length > 0.002) rider.heading = Math.atan2(delta.x, delta.z);
    if (length <= dt * 0.35 + 0.002) { rider.position.copy(target); return true; }
    rider.position.addScaledVector(delta, dt * 0.35 / length); return false;
  }
  private destination(vehicle: ServiceVehicle, origin: RoadsidePoint, garbage = false): RoadsidePoint {
    const options = [...this.points.values()].filter(p => p.road !== origin.road && this.traffic.serviceCanReach(vehicle, p.road)
      && (garbage ? p.waste : vehicle.model === 'taxi' ? true : matches(vehicle.model, { type: p.type } as RecreationPlace)));
    options.sort((a, b) => a.curb.distanceToSquared(origin.curb) - b.curb.distanceToSquared(origin.curb));
    return options[garbage ? 0 : Math.min(options.length - 1, vehicle.id % Math.max(1, Math.min(options.length, 3)))] || origin;
  }
  update(dt: number, motion: boolean) {
    const vehicles = new Map(this.traffic.serviceVehicles.map(v => [v.id, v]));
    for (const trip of [...this.trips.values()]) {
      if (!vehicles.has(trip.vehicle) || !this.points.has(trip.origin) || !this.points.has(trip.target.id) || trip.riders.some(r => this.visits.visits.get(r.id) !== r.visit)) this.releaseTrip(trip, true);
    }
    if (!motion) { this.draw(vehicles); return; }
    this.seconds += dt;
    const heldThisFrame = new Set<number>();
    for (const v of vehicles.values()) {
      if (v.stop === null || this.trips.has(v.id)) continue;
      const place = this.visits.placeList.find(p => p.door === v.stop && matches(v.model, p) && this.points.has(p.id) && sameSide(v, this.points.get(p.id)!));
      if (!place) continue;
      const limit = v.model === 'garbage' ? 1 : v.model === 'taxi' ? 2 : 5;
      const candidates = [...this.visits.visits.values()].filter(visit => visit.place.id === place.id && visit.phase === 'playing' && !visit.transporting).slice(0, limit);
      if (!candidates.length) {
        // Taxis wait for their fare and the collection truck waits for its crew instead of
        // repeatedly driving away just before a resident reaches the pickup point.
        if (['taxi', 'garbage'].includes(v.model) && (this.idleCooldown.get(v.id) || 0) <= this.seconds) {
          const since = this.idleHolds.get(v.id) ?? this.seconds;
          if (this.seconds - since < 30) { this.idleHolds.set(v.id, since); heldThisFrame.add(v.id); this.traffic.holdService(v.id, true); }
          else this.idleCooldown.set(v.id, this.seconds + 10);
        }
        continue;
      }
      const origin = this.points.get(place.id)!, target = this.destination(v, origin, v.model === 'garbage');
      const riders = candidates.map(visit => { const r: Rider = { id: visit.resident, visit, position: visit.position.clone(), heading: visit.heading, phase: 'boarding', waypoint: 0, walking: false, timer: 0, carrying: false }; visit.transporting = true; this.riders.set(r.id, r); return r; });
      this.trips.set(v.id, { vehicle: v.id, model: v.model, origin: origin.id, target, stage: 'boarding', riders, elapsed: 0, travel: 0, collections: 0 });
      this.traffic.holdService(v.id, true);
    }
    for (const id of this.idleHolds.keys()) if (!heldThisFrame.has(id)) { if (!this.trips.has(id)) this.traffic.holdService(id, false); this.idleHolds.delete(id); }
    for (const trip of [...this.trips.values()]) {
      const v = vehicles.get(trip.vehicle)!; trip.elapsed += dt;
      if (trip.elapsed > 180) { this.releaseTrip(trip, true); continue; }
      if (trip.stage === 'boarding') {
        this.traffic.holdService(v.id, true);
        const rider = trip.riders.find(r => r.phase === 'boarding');
        if (rider) {
          const target = rider.waypoint === 0 ? curbAt(v) : vehicleDoor(v);
          if (this.walk(rider, target, dt, false, rider.waypoint === 0 ? undefined : v)) {
            if (rider.waypoint++ > 0) {
              rider.phase = 'aboard'; this.streets?.crowd.release(rider.id); this.streets?.cancel(`transit:${rider.id}`);
              if (trip.model !== 'garbage') this.stats[trip.model === 'taxi' ? 'taxiBoarded' : trip.model === 'tram' ? 'tramBoarded' : 'busBoarded']++;
            }
          }
        }
        if (!rider || trip.elapsed > 20) {
          for (const pending of trip.riders.filter(r => r.phase === 'boarding')) { pending.visit.transporting = false; pending.visit.elapsed = 0; this.riders.delete(pending.id); this.streets?.cancel(`transit:${pending.id}`); }
          trip.riders = trip.riders.filter(r => r.phase === 'aboard');
          if (!trip.riders.length) { this.releaseTrip(trip); continue; }
          trip.stage = 'moving'; trip.travel = 0; this.traffic.holdService(v.id, false); this.traffic.dispatchService(v.id, trip.target.road);
        }
      } else if (trip.stage === 'moving') {
        trip.travel += dt;
        for (const rider of trip.riders) rider.position.copy(v.position);
        // A lone stop still offers a short round trip before coming back to collect again.
        if (trip.target.id === trip.origin && trip.travel < 10) this.traffic.dispatchService(v.id);
        else this.traffic.dispatchService(v.id, trip.target.road);
        if (trip.travel > 3 && v.stop === trip.target.road) {
          if (trip.model === 'garbage' && trip.target.id !== trip.origin) {
            const bin = [...this.points.values()].find(p => p.waste && p.road === v.stop && sameSide(v, p));
            if (!bin) { trip.target = this.destination(v, trip.target, true); continue; }
            trip.target = bin; trip.stage = 'collecting';
          } else trip.stage = 'alighting';
          this.traffic.holdService(v.id, true);
          for (const rider of trip.riders) { rider.phase = 'aboard'; rider.waypoint = 0; rider.timer = 0; }
        }
      } else if (trip.stage === 'alighting') {
        this.traffic.holdService(v.id, true);
        const rider = trip.riders[0];
        if (rider?.phase === 'aboard') {
          const door = vehicleDoor(v); if (this.streets && !this.streets.crowd.spawn(rider.id, door)) continue;
          rider.position.copy(door); rider.phase = 'alighting';
        }
        if (rider && this.walk(rider, curbAt(v), dt, false, v)) {
          this.visits.finishTransport(rider.id, v.stop ?? trip.target.road, rider.position); this.riders.delete(rider.id); trip.riders.shift(); this.stats.alighted++;
        }
        if (!trip.riders.length) this.releaseTrip(trip);
      } else {
        this.traffic.holdService(v.id, true);
        const rider = trip.riders[0]; rider.timer += dt;
        if (rider.phase === 'aboard') {
          const door = vehicleDoor(v); if (this.streets && !this.streets.crowd.spawn(rider.id, door)) continue;
          rider.position.copy(door); rider.phase = 'working'; rider.timer = 0;
        }
        const rear = curbAt(v).add(new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading)).multiplyScalar(-0.28));
        if (rider.waypoint === 0 && this.walk(rider, curbAt(v), dt, false, v)) rider.waypoint = 1;
        else if (rider.waypoint === 1 && this.walk(rider, trip.target.curb, dt, true)) { rider.waypoint = 2; rider.timer = 0; }
        else if (rider.waypoint === 2 && rider.timer > 1.2) { rider.carrying = true; rider.waypoint = 3; }
        else if (rider.waypoint === 3 && this.walk(rider, rear, dt)) { rider.waypoint = 4; rider.timer = 0; }
        else if (rider.waypoint === 4 && rider.timer > 1.2) { rider.carrying = false; rider.waypoint = 5; this.collectedAt.set(trip.target.id, this.seconds); this.stats.collections++; trip.collections++; }
        else if (rider.waypoint === 5 && this.walk(rider, curbAt(v), dt)) rider.waypoint = 6;
        else if (rider.waypoint === 6 && this.walk(rider, vehicleDoor(v), dt, false, v)) {
          rider.phase = 'aboard'; this.streets?.crowd.release(rider.id); trip.stage = 'moving'; trip.travel = 0;
          trip.target = trip.collections >= 3 ? this.points.get(trip.origin)! : this.destination(v, trip.target, true);
          this.traffic.holdService(v.id, false); this.traffic.dispatchService(v.id, trip.target.road);
        }
      }
    }
    this.draw(vehicles);
  }
  pose(id: number): ActivityPose | null {
    const rider = this.riders.get(id); if (!rider) return null;
    const working = rider.phase === 'working', action = working && (rider.waypoint === 2 || rider.waypoint === 4);
    return { position: rider.position, heading: rider.heading, walking: rider.walking && rider.phase !== 'aboard' && !action, visible: rider.phase !== 'aboard', scale: 1,
      hat: working ? '#eea324' : undefined, shirt: working ? '#ed8b32' : undefined, hold: rider.carrying ? 'trashbag' : undefined,
      ...(action ? { torsoPitch: rider.waypoint === 2 ? 0.65 : 0.08, arms: [-1.1, -1.1] as [number, number], elbows: [-0.6, -0.6] as [number, number] } : {}) };
  }
  private draw(vehicles: Map<number, ServiceVehicle>) {
    const b = this.batch; b.begin();
    for (const p of this.points.values()) {
      if (p.waste) {
        const pos = p.curb.clone().addScaledVector(p.center.clone().sub(p.curb).setY(0).normalize(), 0.065), full = this.seconds - (this.collectedAt.get(p.id) ?? -100) > 30;
        b.add('box', pos, [0.05, 0.075, 0.05], '#48735a'); b.add('box', pos.clone().add(new THREE.Vector3(0, 0.075, 0)), [0.057, 0.008, 0.057], '#284c39');
        if (full) b.add('sphere', pos.clone().add(new THREE.Vector3(0.025, 0.035, 0.015)), [0.045, 0.06, 0.04], '#373d35');
      }
      if (['busstop', 'taxistand', 'tramstop'].includes(p.type)) {
        const pos = p.curb.clone().addScaledVector(p.center.clone().sub(p.curb).setY(0).normalize(), 0.06), taxi = p.type === 'taxistand';
        b.add('cyl', pos, [0.008, 0.3, 0.008], '#65766d');
        b.add('box', pos.clone().setY(pos.y + 0.24), [0.095, 0.065, 0.012], taxi ? '#f5c642' : '#347bac');
        b.add('box', pos.clone().add(new THREE.Vector3(0, 0.26, 0.008)), [0.055, 0.025, 0.004], taxi ? '#26312f' : '#f7f5e8');
      }
    }
    // Open door leaves distinguish a pickup from traffic waiting at a light.
    for (const trip of this.trips.values()) if (trip.stage !== 'moving') {
      const v = vehicles.get(trip.vehicle); if (!v) continue;
      const door = vehicleDoor(v); b.add('box', door.clone().setY(v.position.y + 0.045), [0.008, v.model === 'bus' ? 0.16 : 0.085, 0.065], '#93b4c1', v.heading + Math.PI / 3);
    }
    b.end();
  }
  dispose() { this.cancelAll(); this.batch.dispose(); }
}
