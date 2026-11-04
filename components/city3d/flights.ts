import * as THREE from 'three';
import { PrimitiveBatch } from './primitiveBatch';
import type { ActivityPose, RecreationVisits, Visit } from './recreation';
import { GATE_WAIT, TERMINAL_APRON, TERMINAL_FRONT, airportPoint, planeState, type Aviation, type PlaneState } from './aviation';

// Residents taking a flight. At a tall building they take the lift, come out of the roof hatch
// and wait by the helipad; when a helicopter lands they walk over and climb in, fly to another
// rooftop (or the airport), climb out, go down that building's hatch and come out of its front
// door. At the airport, people queueing outside the terminal walk through it, across the apron
// and up the airstairs into the plane at the gate; they fly its circuit, come back down the
// stairs after it docks again, and leave through the terminal. Riders are the same residents,
// on the same visits, borrowed while they travel - nobody extra is ever drawn.

interface Leg { to: THREE.Vector3; hide?: number; jump?: THREE.Vector3 }
type Craft = { kind: 'plane'; airport: string; gate: number; cycle: number } | { kind: 'heli'; index: number; from: string };
interface Rider {
  id: number; visit: Visit; craft: Craft; stage: 'boarding' | 'aboard' | 'alighting';
  position: THREE.Vector3; heading: number; walking: boolean; legs: Leg[]; hidden: number;
  finish: 'resume' | { road: number; curb: THREE.Vector3 };
}
const WALK = 0.3;
const left = (heading: number) => new THREE.Vector3(-Math.cos(heading), 0, Math.sin(heading));
const forward = (heading: number) => new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
// Where the airstairs meet the plane (front left door) and the ground.
const planeDoor = (plane: PlaneState) => plane.position.clone().addScaledVector(forward(plane.heading), 0.17).addScaledVector(left(plane.heading), 0.06).setY(plane.position.y + 0.06);
const stairFoot = (plane: PlaneState) => plane.position.clone().addScaledVector(forward(plane.heading), 0.17).addScaledVector(left(plane.heading), 0.2);
const heliDoor = (position: THREE.Vector3, heading: number) => position.clone().addScaledVector(left(heading), 0.12);

export class FlightLife {
  readonly riders = new Map<number, Rider>();
  private boarded = new Set<string>();
  private batch: PrimitiveBatch;
  readonly stats = { planeBoarded: 0, planeLanded: 0, heliBoarded: 0, heliLanded: 0 };
  constructor(scene: THREE.Scene, private visits: RecreationVisits, private aviation: Aviation) {
    this.batch = new PrimitiveBatch(scene, 'flight-props', 64);
    aviation.demand = padId => this.waiting(`${padId}:roof`).length;
  }
  has(id: number) { return this.riders.has(id); }
  private waiting(placeId: string) { return [...this.visits.visits.values()].filter(v => v.place.id === placeId && v.phase === 'playing' && !v.transporting); }
  private take(visit: Visit, craft: Craft, legs: Leg[], finish: Rider['finish']) {
    visit.transporting = true;
    this.riders.set(visit.resident, { id: visit.resident, visit, craft, stage: 'boarding', position: visit.position.clone(), heading: visit.heading, walking: true, legs, hidden: 0, finish });
  }
  private done(rider: Rider) {
    this.riders.delete(rider.id);
    if (this.visits.visits.get(rider.id) !== rider.visit) return;
    if (rider.finish === 'resume') {
      // Back outside the terminal: the visit ends and they head home with their luggage.
      rider.visit.transporting = false; rider.visit.position.copy(rider.position); rider.visit.elapsed = rider.visit.duration;
    } else this.visits.finishTransport(rider.id, rider.finish.road, rider.finish.curb);
  }
  // Abandoned (a demolished building, a helicopter gone): back to where the visit started.
  private cancel(rider: Rider) {
    this.riders.delete(rider.id);
    if (this.visits.visits.get(rider.id) === rider.visit) this.visits.finishTransport(rider.id, rider.visit.origin, rider.visit.originPosition || rider.position);
  }

  update(dt: number, motion: boolean) {
    if (motion) {
      for (const rider of [...this.riders.values()]) if (this.visits.visits.get(rider.id) !== rider.visit) this.riders.delete(rider.id);
      this.planes(); this.helicopters();
      for (const rider of [...this.riders.values()]) this.walk(rider, dt);
    }
    this.draw();
  }

  private planes() {
    const seconds = this.aviation.seconds;
    for (const airport of this.aviation.airportList) {
      const schedules = this.aviation.schedulesFor(airport.id); if (!schedules) continue;
      const turn = schedules[0].period, cycle = Math.floor(seconds / turn), gate = cycle % 2, into = seconds % turn;
      const plane = planeState(airport, gate, seconds, schedules), key = `${airport.id}:${cycle}`;
      this.boarded.delete(`${airport.id}:${cycle - 2}`);
      const front = airportPoint(airport, ...TERMINAL_FRONT), apron = airportPoint(airport, ...TERMINAL_APRON);
      // Boarding: the plane whose turn it is waits at its gate.
      if (plane.phase === 'gate' && into < GATE_WAIT - 6 && !this.boarded.has(key)) {
        const passengers = this.waiting(airport.id).slice(0, 4);
        if (passengers.length) {
          this.boarded.add(key);
          for (const visit of passengers) this.take(visit, { kind: 'plane', airport: airport.id, gate, cycle }, [{ to: front, hide: 1.5, jump: apron }, { to: stairFoot(plane) }, { to: planeDoor(plane) }], 'resume');
          this.stats.planeBoarded += passengers.length;
        }
      }
      for (const rider of this.riders.values()) {
        if (rider.craft.kind !== 'plane' || rider.craft.airport !== airport.id) continue;
        const own = planeState(airport, rider.craft.gate, seconds, schedules);
        // Still on the way when the doors close: they hurry aboard.
        if (rider.stage === 'boarding' && own.phase !== 'gate') { rider.stage = 'aboard'; rider.legs = []; rider.hidden = 0; }
        // Landed and back at the gate: down the stairs and out through the terminal.
        if (rider.stage === 'aboard' && cycle > rider.craft.cycle && own.phase === 'gate') {
          rider.stage = 'alighting'; rider.position.copy(planeDoor(own));
          const exit = front.clone().add(front.clone().sub(apron).setY(0).normalize().multiplyScalar(0.35));
          rider.legs = [{ to: stairFoot(own) }, { to: apron, hide: 1.5, jump: front }, { to: exit }];
          this.stats.planeLanded++;
        }
      }
    }
  }

  private helicopters() {
    const helis = this.aviation.helicopters;
    for (const rider of [...this.riders.values()]) if (rider.craft.kind === 'heli' && rider.craft.index >= helis.length) this.cancel(rider);
    helis.forEach((heli, index) => {
      const mine = [...this.riders.values()].filter(r => r.craft.kind === 'heli' && r.craft.index === index);
      if (heli.mode !== 'landed') {
        for (const rider of mine) if (rider.stage === 'boarding') { rider.stage = 'aboard'; rider.legs = []; }
        this.aviation.hold(index, false);
        return;
      }
      const pad = this.aviation.padById(heli.pad);
      if (!pad) { this.aviation.hold(index, false); return; }
      const door = heliDoor(heli.position, heli.heading);
      // Arrived: out of the helicopter, across the roof and down the hatch; after the lift ride
      // they step out of the front door below and walk down to the pavement.
      for (const rider of mine) if (rider.stage === 'aboard' && rider.craft.kind === 'heli' && rider.craft.from !== pad.id) {
        rider.stage = 'alighting'; rider.position.copy(door);
        rider.legs = [{ to: pad.hatch || pad.position, hide: 2.5, jump: pad.door }];
        if (pad.door && pad.curb) rider.legs.push({ to: pad.curb });
        if (pad.road !== undefined && pad.curb) rider.finish = { road: pad.road, curb: pad.curb };
        this.stats.heliLanded++;
      }
      // Boarding: whoever is waiting on this roof, up to two passengers.
      const aboard = mine.filter(r => r.stage !== 'alighting').length;
      if (pad.roof && aboard < 2) for (const visit of this.waiting(`${pad.id}:roof`).slice(0, 2 - aboard)) {
        this.take(visit, { kind: 'heli', index, from: pad.id }, [{ to: door }], { road: visit.origin, curb: visit.originPosition || visit.position });
        this.stats.heliBoarded++;
      }
      this.aviation.hold(index, [...this.riders.values()].some(r => r.craft.kind === 'heli' && r.craft.index === index && r.stage !== 'aboard'));
    });
  }

  private walk(rider: Rider, dt: number) {
    if (rider.hidden > 0) {
      rider.hidden -= dt; rider.walking = false;
      if (rider.hidden <= 0) { const leg = rider.legs.shift(); if (leg?.jump) rider.position.copy(leg.jump); }
    } else if (rider.legs.length) {
      const leg = rider.legs[0], delta = leg.to.clone().sub(rider.position), distance = delta.length();
      if (Math.hypot(delta.x, delta.z) > 0.001) rider.heading = Math.atan2(delta.x, delta.z);
      if (distance <= WALK * dt) { rider.position.copy(leg.to); rider.walking = false; if (leg.hide) rider.hidden = leg.hide; else rider.legs.shift(); }
      else { rider.position.addScaledVector(delta, WALK * dt / distance); rider.walking = true; }
    }
    if (rider.hidden > 0 || rider.legs.length) return;
    if (rider.stage === 'boarding') { rider.stage = 'aboard'; rider.walking = false; }
    else if (rider.stage === 'alighting') this.done(rider);
  }

  pose(id: number): (ActivityPose & { visible: boolean }) | null {
    const rider = this.riders.get(id); if (!rider) return null;
    return { position: rider.position, heading: rider.heading, walking: rider.walking, scale: 1, visible: rider.stage !== 'aboard' && rider.hidden <= 0, hold: 'suitcase' };
  }

  // Airstairs at a plane while its passengers are on them.
  private draw() {
    const b = this.batch; b.begin();
    const seconds = this.aviation.seconds;
    for (const airport of this.aviation.airportList) {
      const schedules = this.aviation.schedulesFor(airport.id); if (!schedules) continue;
      for (const gate of [0, 1]) {
        const busy = [...this.riders.values()].some(r => r.craft.kind === 'plane' && r.craft.airport === airport.id && r.craft.gate === gate && r.stage !== 'aboard');
        const plane = planeState(airport, gate, seconds, schedules);
        if (!busy || plane.phase !== 'gate') continue;
        const foot = stairFoot(plane), top = planeDoor(plane), mid = foot.clone().lerp(top, 0.5);
        b.add('box', mid.setY(foot.y), [0.06, 0.035, 0.15], '#d9dde0', plane.heading + Math.PI / 2, 0.45);
        b.segment(foot.clone().setY(foot.y + 0.05), top.clone().setY(top.y + 0.04), 0.003, '#8f979d');
      }
    }
    b.end();
  }
  dispose() { this.batch.dispose(); }
}
