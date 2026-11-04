import * as THREE from 'three';
import { BuildingKit } from './buildingKit';
import type { ModelContext } from './models';
import { PrimitiveBatch } from './primitiveBatch';

// The airport and everything that flies. Airliners take turns at each airport: taxi from the
// gate, take off down the runway, fly a circuit over the city, land and taxi back. Helicopters
// hop between helipads - the airport's own pad and the flat roofs of tall buildings you have
// built, each marked with an H. A high airliner crosses the sky now and then over any city.
// Planes follow a timetable of the animation clock; helicopters decide where to go next as they
// land. Either way, pausing the city freezes everything in the air.

// ------------------------------------------------------------------------------- airport model
// Plot coordinates (-0.5..0.5, front +z faces the road), scaled by the 4-tile footprint.
export const AIRPORT = {
  runwayZ: -0.33, runwayFrom: -0.44, runwayTo: 0.44, taxiwayZ: -0.2,
  gates: [[-0.32, -0.07], [-0.1, -0.07]] as Array<[number, number]>,
  helipad: [0.15, -0.07] as [number, number],
  surface: 0.041, // top of the runway and apron, in plot units
};
export function airportModel(c: ModelContext, level: number, size: number) {
  const k = new BuildingKit(c, level);
  k.plot('#b7bdb3');
  // Runway with threshold bars and a dashed centre line, and the taxiway to the apron.
  k.box(0.92, 0.006, 0.14, 0, 0.035, AIRPORT.runwayZ, '#55595e');
  for (let i = 0; i < 9; i++) k.box(0.05, 0.002, 0.006, -0.3 + i * 0.075, 0.041, AIRPORT.runwayZ, '#f3f1ea');
  for (const end of [-1, 1]) for (let i = 0; i < 5; i++) k.box(0.025, 0.002, 0.012, end * 0.42, 0.041, AIRPORT.runwayZ - 0.05 + i * 0.025, '#f3f1ea');
  k.box(0.9, 0.005, 0.04, 0, 0.035, AIRPORT.taxiwayZ, '#6b7075');
  k.box(0.04, 0.005, 0.14, -0.44, 0.035, (AIRPORT.runwayZ + AIRPORT.taxiwayZ) / 2, '#6b7075');
  k.box(0.04, 0.005, 0.14, 0.42, 0.035, (AIRPORT.runwayZ + AIRPORT.taxiwayZ) / 2, '#6b7075');
  for (let i = 0; i < 12; i++) for (const side of [-1, 1]) k.box(0.006, 0.008, 0.006, -0.44 + i * 0.08, 0.035, AIRPORT.runwayZ + side * 0.075, i % 2 ? '#7cc4ff' : '#ffe08a');
  // Apron, gates and the terminal with its glass front facing the road.
  k.box(0.56, 0.005, 0.18, -0.2, 0.035, -0.06, '#8f959a');
  for (const [x] of AIRPORT.gates) { k.box(0.004, 0.002, 0.12, x, 0.041, -0.06, '#f2c94c'); k.box(0.03, 0.03, 0.09, x, 0.06, 0.07, '#c9ced3'); }
  k.block(0.56, 0.12 + level * 0.015, 0.16, -0.18, 0.12, '#e3e6e8', 2, 0.04, true);
  const roof = k.box(0.6, 0.02, 0.19, -0.18, 0.16 + level * 0.015, 0.12, '#9fb6c4'); roof.rotation.x = -0.05;
  k.sign(-0.18, 0.13, 0.205, 0.22, '#3f6f9c');
  // Control tower and hangar.
  k.cyl(0.03, 0.42 + level * 0.04, 0.33, 0.04, 0.15, '#dfe2df');
  k.cyl(0.06, 0.06, 0.33, 0.46 + level * 0.04, 0.15, '#4d7392', 0.065);
  k.cyl(0.07, 0.015, 0.33, 0.52 + level * 0.04, 0.15, '#cfd4d6', 0.05);
  k.arch(0.22, 0.17, 0.14, 0.32, 0.035, -0.08, '#b8bec2');
  // The airport's own helipad, with a windsock beside the apron.
  helipadMarking(k, AIRPORT.helipad[0], AIRPORT.helipad[1], 0.041, 0.05);
  k.cyl(0.004, 0.12, 0.05, 0.04, -0.12, '#cfd4d6'); const sock = k.cyl(0.012, 0.04, 0.07, 0.15, -0.12, '#e8732f', 0.006); sock.rotation.z = Math.PI / 2;
  // Car park in front.
  k.box(0.4, 0.004, 0.14, 0.2, 0.035, 0.38, '#5d6166');
  for (let i = 0; i < 6; i++) k.box(0.004, 0.002, 0.08, 0.04 + i * 0.065, 0.04, 0.38, '#f3f1ea');
  k.group.scale.setScalar(size);
  k.group.name = 'airport';
  return k.group;
}
// A yellow ring with an H, flat on a surface at height `y` (plot units).
function helipadMarking(k: BuildingKit, x: number, z: number, y: number, radius: number) {
  k.cyl(radius, 0.002, x, y, z, '#f2c230'); k.cyl(radius * 0.82, 0.0025, x, y, z, '#3b3f44');
  k.box(radius * 0.18, 0.003, radius * 0.9, x - radius * 0.3, y, z, '#ffffff'); k.box(radius * 0.18, 0.003, radius * 0.9, x + radius * 0.3, y, z, '#ffffff'); k.box(radius * 0.6, 0.003, radius * 0.16, x, y, z, '#ffffff');
}

// ------------------------------------------------------------------------------------ tracks
export interface AirportPlace { id: string; center: THREE.Vector3; rotation: number; size: number; road?: number; curb?: THREE.Vector3 }
// A point on the airfield, from plot coordinates.
export const airportPoint = (a: AirportPlace, x: number, z: number) => {
  const sin = Math.sin(a.rotation), cos = Math.cos(a.rotation);
  return new THREE.Vector3(a.center.x + (x * cos + z * sin) * a.size, AIRPORT.surface * a.size, a.center.z + (-x * sin + z * cos) * a.size);
};
// The terminal's front (road) door and its apron door, which passengers walk through.
export const TERMINAL_FRONT: [number, number] = [-0.18, 0.215];
export const TERMINAL_APRON: [number, number] = [-0.18, 0.03];
// `hatch` is where passengers come up from (a roof hatch, or the airport terminal's apron
// door); `road` and `curb` are the street outside that building, where they come out.
// `door` is the building's front door at street level, where they come out after the lift.
export interface Helipad { id: string; position: THREE.Vector3; roof: boolean; hatch?: THREE.Vector3; door?: THREE.Vector3; road?: number; curb?: THREE.Vector3 }
interface Sample { p: THREE.Vector3; roll: number; s: number }
interface Track { samples: Sample[]; length: number }
const track = (points: Array<[THREE.Vector3, number]>): Track => {
  const samples: Sample[] = []; let s = 0;
  points.forEach(([p, roll], i) => { if (i) s += p.distanceTo(points[i - 1][0]); samples.push({ p, roll, s }); });
  return { samples, length: s };
};
const along = (t: Track, s: number) => {
  s = Math.max(0, Math.min(t.length, s));
  let i = 1; while (i < t.samples.length - 1 && t.samples[i].s < s) i++;
  const a = t.samples[i - 1], b = t.samples[i], f = (s - a.s) / Math.max(1e-6, b.s - a.s);
  const p = a.p.clone().lerp(b.p, f), d = b.p.clone().sub(a.p);
  return { p, heading: Math.atan2(d.x, d.z), pitch: -Math.atan2(d.y, Math.hypot(d.x, d.z)), roll: a.roll + (b.roll - a.roll) * f };
};
// Ground speed when taxiing, and flying speed, in world units a second.
// Planes wait at the gate long enough for their passengers to walk out and board.
const TAXI = 0.4, FLY = 2.4;
export const GATE_WAIT = 16;
interface Schedule { taxiOut: Track; roll: Track; flight: Track; rollout: Track; taxiIn: Track; times: number[]; period: number }
export function airportSchedule(place: AirportPlace, gate: number): Schedule {
  const sin = Math.sin(place.rotation), cos = Math.cos(place.rotation), ground = AIRPORT.surface * place.size;
  const at = (x: number, z: number, y = ground) => new THREE.Vector3(place.center.x + (x * cos + z * sin) * place.size, y, place.center.z + (-x * sin + z * cos) * place.size);
  const d = at(1, AIRPORT.runwayZ).sub(at(0, AIRPORT.runwayZ)).setY(0).normalize(), n = at(0, -1).sub(at(0, 0)).setY(0).normalize();
  const [gx, gz] = AIRPORT.gates[gate];
  const out = (list: Array<[number, number]>) => track(list.map(([x, z]) => [at(x, z), 0]));
  const taxiOut = out([[gx, gz], [gx, AIRPORT.taxiwayZ], [AIRPORT.runwayFrom, AIRPORT.taxiwayZ], [AIRPORT.runwayFrom, AIRPORT.runwayZ], [AIRPORT.runwayFrom + 0.04, AIRPORT.runwayZ]]);
  const roll = out([[AIRPORT.runwayFrom + 0.04, AIRPORT.runwayZ], [0.25, AIRPORT.runwayZ]]);
  // The circuit: climb out, turn back over the city, fly downwind, turn onto final and land.
  const lift = at(0.25, AIRPORT.runwayZ), touch = at(-0.3, AIRPORT.runwayZ), climb = lift.clone().addScaledVector(d, 10).setY(4.5), final = touch.clone().addScaledVector(d, -12).setY(5);
  const points: Array<[THREE.Vector3, number]> = [[lift, 0]];
  for (let i = 1; i <= 8; i++) { const f = i / 8; points.push([lift.clone().lerp(climb, f).setY(ground + (4.5 - ground) * f * f * (3 - 2 * f)), 0]); }
  const turn = (from: THREE.Vector3, sign: number, y0: number, y1: number) => {
    const centre = from.clone().addScaledVector(n, 7);
    for (let i = 1; i <= 16; i++) {
      const a = i / 16 * Math.PI, f = i / 16;
      points.push([centre.clone().addScaledVector(n, -Math.cos(a) * 7).addScaledVector(d, sign * Math.sin(a) * 7).setY(y0 + (y1 - y0) * f), i < 16 ? -0.45 * sign : 0]);
    }
  };
  turn(climb, 1, 4.5, 5.5);
  const downwindEnd = final.clone().addScaledVector(n, 14).setY(5.5);
  for (let i = 1; i <= 6; i++) points.push([points.at(-1)![0].clone().lerp(downwindEnd, 1 / (7 - i)), 0]);
  turn(final, -1, 5.5, 5);
  for (let i = 1; i <= 10; i++) { const f = i / 10; points.push([final.clone().lerp(touch, f).setY(5 + (ground - 5) * f), 0]); }
  const flight = track(points);
  const rollout = out([[-0.3, AIRPORT.runwayZ], [AIRPORT.runwayTo - 0.02, AIRPORT.runwayZ]]);
  const taxiIn = out([[AIRPORT.runwayTo - 0.02, AIRPORT.runwayZ], [AIRPORT.runwayTo - 0.02, AIRPORT.taxiwayZ], [gx, AIRPORT.taxiwayZ], [gx, gz]]);
  // Accelerating from rest to flying speed down the roll, and the reverse after landing.
  const times = [GATE_WAIT, taxiOut.length / TAXI, 2 * roll.length / FLY, flight.length / FLY, 2 * rollout.length / (FLY + TAXI), taxiIn.length / TAXI];
  return { taxiOut, roll, flight, rollout, taxiIn, times, period: times.reduce((a, b) => a + b, 0) };
}
export interface PlaneState { position: THREE.Vector3; heading: number; pitch: number; roll: number; flying: boolean; phase: string }
// Two planes per airport take turns: one flies a cycle while the other waits at its gate.
export function planeState(place: AirportPlace, gate: number, seconds: number, schedules: Schedule[]): PlaneState {
  const turnLength = schedules[0].period, cycle = Math.floor(seconds / turnLength), mine = cycle % 2 === gate;
  const s = schedules[gate], t = seconds % turnLength;
  const parked = () => { const p = along(s.taxiIn, s.taxiIn.length), before = along(s.taxiIn, s.taxiIn.length - 0.05); return { position: p.p, heading: before.heading + Math.PI, pitch: 0, roll: 0, flying: false, phase: 'gate' }; };
  if (!mine) return parked();
  let rest = t * (s.period / turnLength);
  const phases: Array<[string, Track | null, (u: number) => number]> = [
    ['gate', null, () => 0],
    ['taxi', s.taxiOut, u => u * s.taxiOut.length],
    ['takeoff', s.roll, u => u * u * s.roll.length],
    ['flight', s.flight, u => u * s.flight.length],
    ['landing', s.rollout, u => (u * (2 * FLY - (FLY - TAXI) * u)) / (FLY + TAXI) * s.rollout.length],
    ['taxi', s.taxiIn, u => u * s.taxiIn.length],
  ];
  for (let i = 0; i < phases.length; i++) {
    if (rest > s.times[i] && i < phases.length - 1) { rest -= s.times[i]; continue; }
    const [phase, path, distance] = phases[i];
    if (!path) return parked();
    const pose = along(path, distance(Math.min(1, rest / s.times[i])));
    return { position: pose.p, heading: pose.heading, pitch: phase === 'takeoff' && rest / s.times[i] > 0.85 ? -0.12 : pose.pitch, roll: pose.roll, flying: phase === 'flight', phase };
  }
  return parked();
}

// ----------------------------------------------------------------------------------- helicopters
interface Heli { color: string; stripe: string; position: THREE.Vector3; heading: number; pad: string; target: Helipad | null; mode: 'landed' | 'up' | 'cruise' | 'down'; timer: number; rotor: number; spin: number; hold: boolean }
const HELI_COLORS: Array<[string, string]> = [['#d9332b', '#f4f4f0'], ['#23407a', '#f4f4f0'], ['#f2c230', '#2b2d30'], ['#f4f4f0', '#2a9d8f']];

export class Aviation {
  private batch: PrimitiveBatch;
  private airports: AirportPlace[] = [];
  private schedules = new Map<string, Schedule[]>();
  private pads: Helipad[] = [];
  private helis: Heli[] = [];
  private m = new THREE.Matrix4(); private local = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(0, 0, 0, 'YXZ'); private v = new THREE.Vector3(); private s = new THREE.Vector3();
  seconds = 0;
  constructor(scene: THREE.Scene) { this.batch = new PrimitiveBatch(scene, 'aviation', 1500); }
  get helicopters() { return this.helis.map(h => ({ position: h.position.clone(), heading: h.heading, mode: h.mode, pad: h.pad })); }
  // Keep a landed helicopter on its pad while passengers walk on or off.
  hold(index: number, hold: boolean) { const h = this.helis[index]; if (h) h.hold = hold; }
  // How many people are waiting at a helipad: helicopters go there first.
  demand: (padId: string) => number = () => 0;
  padById(id: string) { return this.pads.find(p => p.id === id) || null; }
  schedulesFor(id: string) { return this.schedules.get(id) || null; }
  get airportList(): readonly AirportPlace[] { return this.airports; }
  get planes() { return this.airports.flatMap(a => [0, 1].map(gate => planeState(a, gate, this.seconds, this.schedules.get(a.id)!))); }
  get padCount() { return this.pads.length; }

  // Airports and helipads (airport pads and rooftops), redone when buildings change.
  setPlaces(airports: AirportPlace[], roofs: Helipad[]) {
    this.airports = airports;
    for (const a of airports) if (!this.schedules.has(a.id)) this.schedules.set(a.id, [airportSchedule(a, 0), airportSchedule(a, 1)]);
    const pads = [...airports.map(a => {
      const sin = Math.sin(a.rotation), cos = Math.cos(a.rotation), [x, z] = AIRPORT.helipad;
      return { id: `${a.id}:pad`, position: new THREE.Vector3(a.center.x + (x * cos + z * sin) * a.size, AIRPORT.surface * a.size, a.center.z + (-x * sin + z * cos) * a.size), roof: false, hatch: airportPoint(a, 0.06, 0.03), door: airportPoint(a, ...TERMINAL_FRONT), road: a.road, curb: a.curb };
    }), ...roofs];
    this.pads = pads;
    // One helicopter per three pads, at least one wherever there are two places to fly between.
    const wanted = pads.length < 2 ? 0 : Math.min(6, Math.max(1, Math.round(pads.length / 3)));
    const known = new Set(pads.map(p => p.id));
    for (const h of this.helis) if (!known.has(h.pad) && h.mode === 'landed') { h.mode = 'up'; h.target = null; }
    for (const h of this.helis) if (h.target && !known.has(h.target.id)) h.target = null;
    while (this.helis.length > wanted) this.helis.pop();
    while (this.helis.length < wanted) {
      const pad = pads[this.helis.length % pads.length], [color, stripe] = HELI_COLORS[this.helis.length % HELI_COLORS.length];
      this.helis.push({ color, stripe, position: pad.position.clone(), heading: this.helis.length, pad: pad.id, target: null, mode: 'landed', timer: 3 + this.helis.length * 4, rotor: 0, spin: 0, hold: false });
    }
  }

  private cruise() { return Math.max(3, ...this.pads.map(p => p.position.y)) + 1.2; }
  private nextPad(h: Heli) {
    const taken = new Set(this.helis.filter(o => o !== h).flatMap(o => [o.target?.id, o.mode === 'landed' ? o.pad : undefined]));
    const free = this.pads.filter(p => p.id !== h.pad && !taken.has(p.id)), waiting = free.filter(p => this.demand(p.id) > 0);
    const options = waiting.length ? waiting : free;
    return options.length ? options[Math.floor(Math.random() * options.length)] : null;
  }

  update(dt: number, motion: boolean) {
    if (motion) {
      this.seconds += dt;
      for (const h of this.helis) {
        const flying = h.mode !== 'landed';
        h.spin += ((flying || h.timer < 2 ? 28 : 0) - h.spin) * Math.min(1, dt * 0.8);
        h.rotor += h.spin * dt;
        if (h.mode === 'landed') {
          h.timer -= dt;
          if (h.hold) h.timer = Math.max(h.timer, 2.5);
          else if (h.timer <= 0 && h.spin > 20) { h.target = this.nextPad(h); if (h.target) h.mode = 'up'; else h.timer = 5; }
        } else if (h.mode === 'up') {
          h.position.y = Math.min(this.cruise(), h.position.y + dt * 0.8);
          if (!h.target) h.target = this.nextPad(h);
          if (h.position.y >= this.cruise()) h.mode = h.target ? 'cruise' : 'down';
        } else if (h.mode === 'cruise') {
          const target = h.target!, dx = target.position.x - h.position.x, dz = target.position.z - h.position.z, distance = Math.hypot(dx, dz);
          const want = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - h.heading), Math.cos(want - h.heading));
          h.heading += Math.max(-dt * 1.5, Math.min(dt * 1.5, turn));
          const step = Math.abs(turn) > 0.4 ? dt * 0.3 : dt * 1.4;
          if (distance <= step) { h.position.x = target.position.x; h.position.z = target.position.z; h.mode = 'down'; }
          else { h.position.x += dx / distance * step; h.position.z += dz / distance * step; }
        } else if (h.mode === 'down') {
          const pad = h.target || this.pads.find(p => p.id === h.pad);
          if (!pad) { h.mode = 'up'; continue; }
          const slow = Math.max(0.25, Math.min(0.8, (h.position.y - pad.position.y) * 0.6));
          h.position.y = Math.max(pad.position.y, h.position.y - dt * slow);
          if (h.position.y <= pad.position.y + 1e-4) { h.mode = 'landed'; h.pad = pad.id; h.target = null; h.timer = 8 + Math.random() * 8; }
        }
      }
    }
    this.draw();
  }

  // ---------------------------------------------------------------------------------- drawing
  private part(frame: THREE.Matrix4, shape: Parameters<PrimitiveBatch['addMatrix']>[0], position: [number, number, number], scale: [number, number, number], color: string, rotation: [number, number, number] = [0, 0, 0]) {
    this.local.compose(this.v.set(...position), this.q.setFromEuler(this.e.set(rotation[0], rotation[1], rotation[2], 'XYZ')), this.s.set(...scale));
    this.batch.addMatrix(shape, this.m.multiplyMatrices(frame, this.local), color);
  }
  private frame(position: THREE.Vector3, heading: number, pitch: number, roll: number) {
    return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, heading, roll, 'YXZ')), new THREE.Vector3(1, 1, 1));
  }
  private plane(state: PlaneState, livery: string, scale = 1) {
    const f = this.frame(state.position, state.heading, state.pitch, state.roll).scale(this.s.setScalar(scale));
    const blink = Math.sin(this.seconds * 6) > 0.6;
    this.part(f, 'cyl', [0, 0.07, -0.33], [0.1, 0.62, 0.1], '#f4f4f0', [Math.PI / 2, 0, 0]);
    this.part(f, 'cone', [0, 0.07, 0.29], [0.1, 0.09, 0.1], '#f4f4f0', [Math.PI / 2, 0, 0]);
    this.part(f, 'cone', [0, 0.075, -0.33], [0.1, 0.08, 0.06], '#f4f4f0', [-Math.PI / 2, 0, 0]);
    this.part(f, 'box', [0, 0.085, 0.24], [0.08, 0.012, 0.03], '#26323d', [0.4, 0, 0]);
    for (const side of [-1, 1]) this.part(f, 'box', [side * 0.051, 0.083, -0.02], [0.002, 0.008, 0.44], '#26323d');
    this.part(f, 'box', [0, 0.06, -0.01], [0.075, 0.035, 0.6], livery);
    this.part(f, 'box', [0, 0.06, 0], [0.74, 0.012, 0.13], '#d9dde0', [0, 0, 0]);
    this.part(f, 'box', [0, 0.09, -0.36], [0.26, 0.008, 0.07], '#d9dde0');
    this.part(f, 'box', [0, 0.1, -0.36], [0.008, 0.13, 0.09], livery, [-0.35, 0, 0]);
    for (const side of [-1, 1]) {
      this.part(f, 'cyl', [side * 0.16, 0.035, -0.04], [0.045, 0.12, 0.045], '#9aa3ab', [Math.PI / 2, 0, 0]);
      this.part(f, 'sphere', [side * 0.37, 0.065, -0.02], [0.015, 0.015, 0.015], side < 0 ? '#e23b3b' : '#3bd36b');
    }
    this.part(f, 'sphere', [0, 0.12, -0.03], [0.02, 0.02, 0.02], blink ? '#ffffff' : '#7a1f1f');
    if (!state.flying) for (const [x, z] of [[0, 0.22], [-0.07, -0.04], [0.07, -0.04]]) this.part(f, 'cyl', [x, 0.012, z], [0.03, 0.02, 0.03], '#1f1f1f', [0, 0, Math.PI / 2]);
  }
  private heli(h: Heli) {
    const pitch = h.mode === 'cruise' ? 0.14 : 0, f = this.frame(h.position, h.heading, pitch, 0);
    this.part(f, 'sphere', [0, 0.07, 0], [0.12, 0.1, 0.18], h.color);
    this.part(f, 'sphere', [0, 0.08, 0.05], [0.1, 0.07, 0.09], '#26323d');
    this.part(f, 'box', [0, 0.06, 0], [0.122, 0.018, 0.12], h.stripe);
    this.part(f, 'cyl', [0, 0.085, -0.06], [0.03, 0.22, 0.03], h.color, [-Math.PI / 2 + 0.1, 0, 0]);
    this.part(f, 'box', [0, 0.1, -0.27], [0.006, 0.06, 0.04], h.stripe);
    this.part(f, 'cyl', [0.008, 0.1, -0.27], [0.07, 0.004, 0.07], '#3b3f44', [0, 0, Math.PI / 2 + h.rotor * 3]);
    for (const side of [-1, 1]) this.part(f, 'box', [side * 0.05, 0.004, 0], [0.008, 0.008, 0.2], '#3b3f44');
    for (const z of [-0.05, 0.05]) this.part(f, 'box', [0, 0.018, z], [0.1, 0.03, 0.006], '#3b3f44');
    this.part(f, 'cyl', [0, 0.12, 0], [0.012, 0.03, 0.012], '#3b3f44');
    for (let blade = 0; blade < 3; blade++) this.part(f, 'box', [0, 0.152, 0], [0.42, 0.003, 0.02], '#2b2d30', [0, h.rotor + blade * Math.PI * 2 / 3, 0]);
    if (h.mode !== 'landed' && Math.sin(this.seconds * 5 + h.heading) > 0.7) this.part(f, 'sphere', [0, 0.02, 0], [0.02, 0.02, 0.02], '#ff4d4d');
  }
  // A high airliner crossing the whole map every couple of minutes, on a different line each time.
  private overflight() {
    const period = 75, cycle = Math.floor(this.seconds / period), t = (this.seconds % period) / 50;
    if (t > 1) return;
    const a = (cycle * 2.399) % (Math.PI * 2), dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-dir.z, 0, dir.x);
    const position = dir.clone().multiplyScalar(-75 + t * 150).addScaledVector(side, ((cycle * 37) % 40) - 20).setY(16);
    this.plane({ position, heading: Math.atan2(dir.x, dir.z), pitch: 0, roll: 0, flying: true, phase: 'overflight' }, '#2e5e9e', 2.2);
  }
  private draw() {
    this.batch.begin();
    const liveries = ['#1d6fb8', '#d62828', '#2a9d8f', '#e07a1f'];
    this.airports.forEach((a, i) => [0, 1].forEach(gate => this.plane(planeState(a, gate, this.seconds, this.schedules.get(a.id)!), liveries[(i * 2 + gate) % liveries.length])));
    for (const h of this.helis) this.heli(h);
    this.overflight();
    this.batch.end();
  }
  dispose() { this.batch.dispose(); }
}

// Rooftop helipads: a ring and an H on each flat roof that a helicopter can use.
export class RoofPads {
  private batch: PrimitiveBatch;
  constructor(scene: THREE.Scene) { this.batch = new PrimitiveBatch(scene, 'roof-helipads', 512); }
  set(pads: Helipad[]) {
    const b = this.batch; b.begin();
    for (const pad of pads) {
      const p = pad.position;
      b.add('cyl', p.clone().setY(p.y), [0.36, 0.004, 0.36], '#f2c230'); b.add('cyl', p.clone().setY(p.y + 0.001), [0.3, 0.004, 0.3], '#3b3f44');
      for (const x of [-0.05, 0.05]) b.add('box', new THREE.Vector3(p.x + x, p.y + 0.002, p.z), [0.03, 0.004, 0.15], '#ffffff');
      b.add('box', new THREE.Vector3(p.x, p.y + 0.002, p.z), [0.1, 0.004, 0.026], '#ffffff');
      // The hatch passengers climb out of.
      if (pad.hatch) { b.add('box', pad.hatch.clone().setY(p.y - 0.004), [0.09, 0.03, 0.09], '#7b8288'); b.add('box', pad.hatch.clone().setY(p.y + 0.026), [0.07, 0.006, 0.07], '#4b5258'); }
    }
    b.end();
  }
  dispose() { this.batch.dispose(); }
}
