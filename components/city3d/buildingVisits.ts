import * as THREE from 'three';
import type { ActivityPose } from './recreation';
import type { StreetNetwork } from './streets';

export interface BuildingEntrance {
  id: string; type: string; door: number | null; curb: THREE.Vector3; threshold: THREE.Vector3; online: boolean; public: boolean;
}
export interface VisitingResident { id: number; home: string | null; work: string | null; position: THREE.Vector3 }
export interface BuildingVisit {
  resident: number; home: BuildingEntrance; destination: BuildingEntrance;
  phase: 'departing' | 'outbound' | 'entering' | 'inside' | 'leaving' | 'returning' | 'home';
  position: THREE.Vector3; heading: number; walking: boolean; elapsed: number; duration: number;
}
const entranceKey = (p: BuildingEntrance) => `${p.id}:${p.type}:${p.door}:${p.online}:${p.curb.toArray()}:${p.threshold.toArray()}`;

// Residents visit shops and public buildings or commute to their existing workplace.
// The same resident is hidden while inside; no extra shopper population is spawned.
export class BuildingVisits {
  readonly visits = new Map<number, BuildingVisit>();
  private places = new Map<string, BuildingEntrance>();
  private cooldown = new Map<number, number>();
  private seconds = 0;
  private nextAssignment = 0;
  private round = 0;
  entered = 0;
  exited = 0;
  constructor(private streets: StreetNetwork, private release: (id: number, curb: THREE.Vector3, road: number) => void) {}

  setPlaces(places: BuildingEntrance[]) {
    const live = new Map(places.filter(p => p.online && p.door !== null).map(p => [p.id, p]));
    for (const [id, visit] of this.visits) {
      const home = live.get(visit.home.id), target = live.get(visit.destination.id);
      if (!home || !target || entranceKey(home) !== entranceKey(visit.home) || entranceKey(target) !== entranceKey(visit.destination)) this.cancel(id);
      else { visit.home = home; visit.destination = target; }
    }
    this.places = live;
  }
  cancel(id: number) {
    const visit = this.visits.get(id); this.streets.cancel(`building:${id}`);
    this.streets.crowd.release(id);
    if (!visit) return;
    const node = this.streets.closest(visit.position);
    if (node) this.release(id, node.position, node.road);
    this.visits.delete(id); this.cooldown.set(id, this.seconds + 8);
  }
  roadsChanged() { for (const id of [...this.visits.keys()]) this.cancel(id); }

  update(dt: number, motion: boolean, residents: VisitingResident[], totalResidents = residents.length) {
    const live = new Set(residents.map(r => r.id));
    for (const id of [...this.visits.keys()]) if (!live.has(id)) this.cancel(id);
    for (const id of this.cooldown.keys()) if (!live.has(id)) this.cooldown.delete(id);
    if (!motion) return;
    this.seconds += dt;
    if (this.seconds >= this.nextAssignment) {
      this.nextAssignment = this.seconds + 1;
      const budget = Math.min(160, Math.max(1, Math.ceil(totalResidents * 0.4)));
      const destinations = [...this.places.values()].filter(p => p.public);
      for (const person of residents) {
        if (this.visits.size >= budget) break;
        if (this.visits.has(person.id) || (this.cooldown.get(person.id) || 0) > this.seconds) continue;
        const home = this.places.get(person.home || ''); if (!home) continue;
        const work = this.places.get(person.work || '');
        const options = work && work.id !== home.id ? [work] : destinations.slice(this.round % Math.max(1, destinations.length)).concat(destinations.slice(0, this.round % Math.max(1, destinations.length)));
        for (const destination of options) {
          if (destination.id === home.id) continue;
          if ([...this.visits.values()].filter(v => v.destination.id === destination.id).length >= 8) continue;
          const start = work ? home.curb : person.position;
          const route = this.streets.route(start, destination.curb);
          if (!route || route.length > 192) continue;
          if (work && !this.streets.crowd.spawn(person.id, home.threshold)) continue;
          this.visits.set(person.id, { resident: person.id, home, destination, phase: work ? 'departing' : 'outbound', position: work ? home.threshold.clone() : person.position.clone(), heading: 0, walking: true, elapsed: 0, duration: 6 + person.id % 7 });
          this.round++; break;
        }
      }
    }
    for (const [id, visit] of this.visits) {
      const direct = (target: THREE.Vector3) => {
        const result = this.streets.stepResident(id, visit.position, target, dt);
        if (result.walking) visit.heading = result.heading; visit.walking = result.walking;
        return result.arrived;
      };
      if (visit.phase === 'departing') {
        if (direct(visit.home.curb)) visit.phase = 'outbound';
      } else if (visit.phase === 'outbound' || visit.phase === 'returning') {
        const result = this.streets.walk(`building:${id}`, visit.position, visit.phase === 'outbound' ? visit.destination.curb : visit.home.curb, dt);
        visit.walking = result.walking; if (result.walking) visit.heading = result.heading;
        if (result.blocked) { this.cancel(id); continue; }
        if (result.arrived) visit.phase = visit.phase === 'outbound' ? 'entering' : 'home';
      } else if (visit.phase === 'entering') {
        if (direct(visit.destination.threshold)) { visit.phase = 'inside'; visit.elapsed = 0; visit.walking = false; this.streets.crowd.release(id); this.entered++; }
      } else if (visit.phase === 'inside') {
        visit.elapsed += dt;
        if (visit.elapsed >= visit.duration && this.streets.crowd.spawn(id, visit.position)) { visit.phase = 'leaving'; this.exited++; }
      } else if (visit.phase === 'leaving') {
        if (direct(visit.destination.curb)) visit.phase = 'returning';
      } else if (visit.phase === 'home' && direct(visit.home.threshold)) {
        this.streets.cancel(`building:${id}`); this.visits.delete(id); this.cooldown.set(id, this.seconds + 10 + id % 8);
        this.streets.crowd.release(id);
        this.release(id, visit.home.curb, visit.home.door!);
      }
    }
  }
  pose(id: number): (ActivityPose & { visible: boolean }) | null {
    const visit = this.visits.get(id); return visit ? { position: visit.position, heading: visit.heading, walking: visit.walking, scale: 1, visible: visit.phase !== 'inside' } : null;
  }
}
