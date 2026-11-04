import * as THREE from 'three';
import { PrimitiveBatch } from './primitiveBatch';
import { BOAT_SIZE, DECK_TOP, WATER_LEVEL, activityKind, boatKind, boatState, type BoatState } from './activities';
import { activityPose, type RecreationPlace, type RecreationVisits, type Visit } from './recreation';
import { tractorState, type TractorState } from './farmVehicles';

// Furniture and equipment for the activities in activities.ts. Jetties and moored boats are
// always there for a working waterfront facility; everything else appears with the people
// using it, so an empty café has no phantom diners' plates.
const UP = new THREE.Vector3(0, 1, 0);
const local = (place: RecreationPlace, x: number, z: number, y: number) => {
  const sin = Math.sin(place.rotation), cos = Math.cos(place.rotation);
  return new THREE.Vector3(place.center.x + (x * cos + z * sin) * place.size, y, place.center.z + (-x * sin + z * cos) * place.size);
};
const ground = (place: RecreationPlace) => 0.035 * place.size + 0.002;
const PARASOLS = ['#d0604f', '#4f8fb0', '#e2b34a', '#6a9f6b'];

export class ActivityProps {
  private batch: PrimitiveBatch;
  private v = new THREE.Vector3();
  constructor(scene: THREE.Scene) { this.batch = new PrimitiveBatch(scene, 'activity-props', 3072); }

  update(visits: RecreationVisits) {
    const b = this.batch, t = visits.seconds; b.begin();
    const playing = new Map<string, Visit[]>();
    for (const visit of visits.visits.values()) if (visit.phase === 'playing') { const list = playing.get(visit.place.id); if (list) list.push(visit); else playing.set(visit.place.id, [visit]); }
    for (const place of visits.placeList) {
      const here = playing.get(place.id) || [], kind = activityKind(place.type);
      if (place.water) this.jetty(place);
      const boat = boatKind(place.type);
      if (boat && place.water) this.boat(place, boatState(place, t, here.length > 0 || Boolean(place.boatTrip?.unloading))!, here.length > 0, t);
      if (!here.length || !kind) continue;
      const g = ground(place), slots = new Set(here.map(v => v.slot));
      const tractor = slots.has(0) ? tractorState(place, t) : null;
      if (tractor) this.tractor(tractor);
      if (kind === 'dining') for (const table of new Set(here.map(v => v.slot >> 1))) {
        const at = local(place, table ? 0.24 : -0.24, 0.37, g);
        b.add('cyl', at, [0.012, 0.075, 0.012], '#5b5f60'); b.add('cyl', this.v.copy(at).setY(g + 0.075), [0.11, 0.008, 0.11], '#e8dcc4');
        if (table === 0 || place.type !== 'brewpub') { b.add('cyl', this.v.copy(at).setY(g + 0.083), [0.006, 0.14, 0.006], '#d8cbb0'); b.add('cone', this.v.copy(at).setY(g + 0.19), [0.2, 0.05, 0.2], PARASOLS[(table + place.id.length) % PARASOLS.length]); }
        for (const side of [-1, 1]) {
          const stool = at.clone().add(new THREE.Vector3(side * 0.075, 0, 0).applyAxisAngle(UP, place.rotation));
          b.add('cyl', stool, [0.04, 0.045, 0.04], '#8b6b4a');
          b.add('cyl', at.clone().add(new THREE.Vector3(side * 0.03, 0.084, 0).applyAxisAngle(UP, place.rotation)), [0.03, 0.003, 0.03], '#fbfaf5');
        }
      }
      if (kind === 'garden' && slots.has(2)) this.bench(place, 0.27, 0.38);
      if (kind === 'bench' && (slots.has(0) || slots.has(1))) this.bench(place, 0, 0.38);
      if (kind === 'picnic') {
        const at = local(place, 0, 0.05, g); b.add('box', at, [0.17, 0.003, 0.17], '#d9534f', place.rotation);
        for (let i = 0; i < 4; i++) b.add('box', local(place, -0.06 + i * 0.04, 0.05, g + 0.0035), [0.012, 0.0005, 0.17], '#f5f0e8', place.rotation);
        b.add('box', local(place, 0.03, 0.04, g), [0.045, 0.03, 0.03], '#a67c4e', place.rotation + 0.3);
      }
      if (kind === 'ducks') for (let i = 0; i < 4; i++) {
        const a = t * 0.25 + i * 1.5, p = local(place, Math.cos(a) * (0.12 + i * 0.03), Math.sin(a) * (0.09 + i * 0.02), 0.058 * place.size), heading = place.rotation + Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2;
        b.add('sphere', p, [0.022, 0.016, 0.034], i ? '#ece3c4' : '#7c6a4c', heading);
        b.add('sphere', p.clone().add(new THREE.Vector3(0, 0.014, 0.016).applyAxisAngle(UP, heading)), 0.013, i ? '#ece3c4' : '#2f6b48');
        b.add('cone', p.clone().add(new THREE.Vector3(0, 0.012, 0.026).applyAxisAngle(UP, heading)), [0.006, 0.01, 0.006], '#e39b2f', heading, Math.PI / 2);
      }
      if (kind === 'birdwatch') for (let i = 0; i < 5; i++) {
        const a = t * 0.5 + i * 1.26, p = local(place, Math.cos(a) * 0.35, Math.sin(a) * 0.3, 0.55 + Math.sin(t + i) * 0.06), heading = place.rotation + Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2, flap = Math.sin(t * 9 + i) * 0.6;
        b.add('sphere', p, [0.014, 0.012, 0.03], '#4c4a48', heading);
        for (const s of [-1, 1]) b.add('box', p.clone().add(new THREE.Vector3(s * 0.025, 0, 0).applyAxisAngle(UP, heading)), [0.045, 0.002, 0.016], '#5b5753', heading, 0, s * flap);
      }
      if (kind === 'concert') for (let i = 0; i < 4; i++) {
        const f = (t * 0.4 + i / 4) % 1, p = local(place, -0.05 + Math.sin(f * 6 + i) * 0.06, 0.02, (0.13 + 0.25 + f * 0.35) * place.size);
        b.add('sphere', p, [0.016, 0.012, 0.004], ['#f2d06b', '#e7798a', '#7cc2e3', '#a7d68a'][i], place.rotation);
        b.add('box', p.clone().add(new THREE.Vector3(0.007, 0, 0)), [0.002, 0.03, 0.002], '#3a3a3a');
      }
      if (kind === 'painting' && slots.has(0)) {
        const at = local(place, 0.22, 0.27, g);
        for (const s of [-1, 0, 1]) b.add('cyl', at.clone().add(new THREE.Vector3(s * 0.02, 0, s ? 0.01 : -0.02).applyAxisAngle(UP, place.rotation)), [0.004, 0.16, 0.004], '#9a7a55');
        b.add('box', at.clone().setY(g + 0.08), [0.08, 0.065, 0.004], '#f8f4ea', place.rotation, 0.15);
        b.add('box', at.clone().setY(g + 0.095).add(new THREE.Vector3(0, 0, 0.003).applyAxisAngle(UP, place.rotation)), [0.05, 0.03, 0.002], ['#7fb4d6', '#e3a35b', '#91c47d'][Math.floor(t / 20) % 3], place.rotation, 0.15);
      }
      if (kind === 'cycling') for (const visit of here) {
        const pose = activityPose(place, visit.slot, t), heading = pose.heading, f = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)), p = pose.position.clone().setY(g);
        for (const s of [-1, 1]) b.add('cyl', p.clone().addScaledVector(f, s * 0.05).setY(g + 0.034), [0.068, 0.006, 0.068], '#2b2b2b', heading, 0, Math.PI / 2);
        b.segment(p.clone().addScaledVector(f, -0.05).setY(g + 0.034), p.clone().addScaledVector(f, 0.05).setY(g + 0.034), 0.004, ['#d0473b', '#3b7dd0', '#3ba86a'][visit.slot % 3]);
        b.segment(p.clone().addScaledVector(f, -0.015).setY(g + 0.034), p.clone().addScaledVector(f, -0.02).setY(g + 0.075), 0.004, '#555');
        b.segment(p.clone().addScaledVector(f, 0.05).setY(g + 0.034), p.clone().addScaledVector(f, 0.042).setY(g + 0.09), 0.004, '#555');
      }
      if (kind === 'firedrill' && slots.has(0)) {
        const pose = activityPose(place, 0, t), f = new THREE.Vector3(Math.sin(pose.heading), 0, Math.cos(pose.heading)), start = pose.position.clone().addScaledVector(f, 0.06).setY(g + 0.075);
        for (let i = 0; i < 10; i++) {
          const s = ((t * 1.5 + i / 10) % 1), p = start.clone().addScaledVector(f, s * 0.42); p.y += s * 0.2 - s * s * 0.28;
          b.add('sphere', p, 0.012 + s * 0.01, '#9fd3f0');
        }
        b.add('cyl', local(place, -0.42, 0.38, g), [0.03, 0.06, 0.03], '#c0392b');
        b.segment(local(place, -0.42, 0.38, g + 0.03), pose.position.clone().setY(g + 0.005), 0.004, '#c9b78f');
      }
      if (kind === 'tinker' && slots.has(0)) {
        const x = 0.02 + Math.sin(t * 0.8) * 0.05, at = local(place, x, 0.36, g), blink = Math.sin(t * 4) > 0;
        b.add('box', at, [0.04, 0.04, 0.035], '#c8ccd0', place.rotation); b.add('sphere', at.clone().setY(g + 0.055), 0.03, '#9aa3ab');
        b.add('sphere', local(place, x - 0.015, 0.36, g + 0.058), 0.007, blink ? '#59e0ff' : '#1f4f5c');
      }
      if (kind === 'repair' && Math.sin(t * 6) > 0.85) for (const visit of here) {
        const pose = activityPose(place, visit.slot, t), f = new THREE.Vector3(Math.sin(pose.heading), 0, Math.cos(pose.heading));
        for (let i = 0; i < 3; i++) b.add('sphere', pose.position.clone().addScaledVector(f, 0.07).add(new THREE.Vector3(Math.sin(t * 40 + i) * 0.02, 0.12 + i * 0.01, Math.cos(t * 30 + i) * 0.02)), 0.005, '#ffd75e');
      }
    }
    b.end();
  }

  private tractor(state: TractorState) {
    const b = this.batch, h = state.heading;
    const at = (x: number, y: number, z: number) => state.position.clone().add(new THREE.Vector3(x, y, z).applyAxisAngle(UP, h));
    b.add('box', at(0, 0.045, 0), [0.075, 0.024, 0.18], '#365f39', h);
    b.add('box', at(0, 0.069, 0.05), [0.075, 0.045, 0.095], '#71a447', h);
    b.add('box', at(0, 0.077, 0.099), [0.06, 0.027, 0.003], '#303b38', h);
    b.add('box', at(0, 0.101, -0.045), [0.06, 0.008, 0.045], '#343b36', h);
    b.add('box', at(0, 0.109, -0.068), [0.06, 0.035, 0.008], '#343b36', h);
    b.add('cyl', at(-0.025, 0.114, 0.064), [0.009, 0.07, 0.009], '#434c46', h);
    b.segment(at(0, 0.075, 0), at(0, 0.137, 0.005), 0.004, '#535b51');
    b.add('cyl', at(0, 0.135, 0.005), [0.045, 0.004, 0.045], '#333b36', h, -0.4);
    for (const side of [-1, 1]) {
      b.add('box', at(side * 0.05, 0.092, -0.046), [0.028, 0.006, 0.095], '#71a447', h);
      b.add('sphere', at(side * 0.027, 0.095, 0.102), 0.013, '#fff2b0');
      for (const rear of [true, false]) {
        const radius = rear ? 0.045 : 0.03, z = rear ? -0.048 : 0.065, x = side * 0.058;
        b.add('sphere', at(x, radius, z), [0.031, radius * 2, radius * 2], '#2c302e', h);
        b.add('sphere', at(x + side * 0.016, radius, z), [0.004, radius * 1.05, radius * 1.05], '#e3bc53', h);
        const spin = state.wheelAngle * (rear ? 1 : 1.5);
        b.segment(at(x + side * 0.019, radius + Math.sin(spin) * radius * 0.45, z + Math.cos(spin) * radius * 0.45), at(x + side * 0.019, radius - Math.sin(spin) * radius * 0.45, z - Math.cos(spin) * radius * 0.45), 0.002, '#756849');
      }
    }
  }

  private bench(place: RecreationPlace, x: number, z: number) {
    const g = ground(place), at = local(place, x, z, g);
    this.batch.add('box', at.clone().setY(g + 0.038), [0.2, 0.008, 0.05], '#93714b', place.rotation);
    this.batch.add('box', at.clone().setY(g + 0.046).add(new THREE.Vector3(0, 0, -0.024).applyAxisAngle(UP, place.rotation)), [0.2, 0.04, 0.006], '#93714b', place.rotation);
    for (const s of [-1, 1]) this.batch.add('box', at.clone().add(new THREE.Vector3(s * 0.085, 0, 0).applyAxisAngle(UP, place.rotation)), [0.01, 0.038, 0.045], '#5d6b68', place.rotation);
  }

  private jetty(place: RecreationPlace) {
    const water = place.water!, heading = Math.atan2(water.out.x, water.out.z), start = water.shore.clone().addScaledVector(water.out, -0.1), length = Math.hypot(water.dock.x - water.shore.x, water.dock.z - water.shore.z) + 0.01;
    const centre = start.clone().addScaledVector(water.out, length / 2);
    this.batch.add('box', centre.clone().setY(DECK_TOP - 0.018), [0.2, 0.018, length], '#a98a63', heading);
    for (let i = 0; i < Math.ceil(length / 0.11); i++) this.batch.add('box', start.clone().addScaledVector(water.out, 0.05 + i * 0.11).setY(DECK_TOP - 0.0005), [0.2, 0.001, 0.006], '#7d6448', heading);
    for (let along = 0.15; along < length; along += 0.35) for (const s of [-1, 1]) this.batch.add('cyl', water.shore.clone().addScaledVector(water.out, along).addScaledVector(water.side, s * 0.095).setY(WATER_LEVEL - 0.08), [0.022, DECK_TOP + 0.1, 0.022], '#6b5844');
  }

  private boat(place: RecreationPlace, state: BoatState, crewed: boolean, t: number) {
    const b = this.batch, kind = boatKind(place.type)!, size = BOAT_SIZE[kind], h = state.heading;
    const f = new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), s = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
    const at = (x: number, y: number, z: number) => state.position.clone().addScaledVector(s, x).addScaledVector(f, z).setY(state.position.y + y);
    const bottom = -size.height * 0.45;
    b.add('hull', at(0, bottom, 0), [size.width, size.height, size.length], size.color, h, 0, state.tilt);
    b.add('hull', at(0, bottom + size.height * 0.98, 0), [size.width * 0.86, 0.004, size.length * 0.9], kind === 'row' ? '#c79a6a' : '#cdb38a', h, 0, state.tilt);
    b.add('hull', at(0, bottom + size.height * 0.62, 0), [size.width * 1.01, size.height * 0.12, size.length * 1.005], kind === 'lifeboat' ? '#f6f1e7' : kind === 'ferry' ? '#2f5f8a' : '#2e4f6a', h, 0, state.tilt);
    const top = bottom + size.height;
    if (kind === 'row') {
      const stroke = crewed && !state.docked && !state.sightseeing ? Math.sin(t * 2.6) : 0;
      for (const side of [-1, 1]) {
        const lock = at(side * size.width * 0.5, top, 0.02), blade = lock.clone().addScaledVector(s, side * 0.16).addScaledVector(f, stroke * 0.08); blade.y = WATER_LEVEL + (stroke > 0 ? 0.03 : 0);
        b.segment(lock, blade, 0.003, '#8a6a46');
      }
    }
    if (kind === 'sail') {
      b.add('cyl', at(0, top, 0.06), [0.008, 0.42, 0.008], '#d8d2c2', h);
      b.add('sail', at(0, top + 0.03, 0.055), [1, 0.37, 0.24], '#fbf8ef', h + (state.docked ? 0 : Math.sin(t * 0.3) * 0.25));
      b.add('sail', at(0, top + 0.03, 0.07), [1, 0.3, -0.15], '#e86a5b', h);
    }
    if (kind === 'motor') { b.add('box', at(0, top, 0.06), [size.width * 0.8, 0.03, 0.01], '#9fc6d8', h, -0.5); b.add('box', at(0, top - 0.02, -size.length * 0.5), [0.04, 0.06, 0.035], '#3c3f44', h); }
    if (kind === 'fishing' || kind === 'lifeboat') {
      b.add('box', at(0, top, -size.length * 0.2), [size.width * 0.7, 0.08, size.length * 0.25], kind === 'lifeboat' ? '#f4f1ea' : '#e8e0cc', h);
      b.add('box', at(0, top + 0.05, -size.length * 0.2 + size.length * 0.126), [size.width * 0.6, 0.02, 0.003], '#2a3a48', h);
      if (kind === 'fishing') { b.add('cyl', at(0, top, 0.05), [0.007, 0.3, 0.007], '#d0c8b5', h); b.segment(at(0, top + 0.28, 0.05), at(0, top + 0.02, size.length * 0.48), 0.002, '#605b52'); }
      else b.add('sphere', at(0, top + 0.09, -size.length * 0.2), 0.015, Math.sin(t * 8) > 0 && !state.docked ? '#4aa3ff' : '#355f86');
    }
    if (kind === 'ferry') {
      b.add('box', at(0, top, -0.3), [size.width * 0.85, 0.09, 0.3], '#f6f4ee', h);
      for (const side of [-1, 1]) b.add('box', at(side * size.width * 0.425, top + 0.045, -0.3), [0.002, 0.025, 0.26], '#2b3e4f', h);
      b.add('box', at(0, top + 0.09, -0.3), [size.width * 0.9, 0.008, 0.34], '#2f5f8a', h);
      b.add('cyl', at(0, top + 0.098, -0.38), [0.045, 0.06, 0.045], '#d0473b', h);
      for (const side of [-1, 1]) b.add('box', at(side * size.width * 0.47, top, 0.05), [0.004, 0.03, size.length * 0.55], '#e8e8e8', h);
    }
    if (!state.docked && !state.fishing && !state.sightseeing) for (let i = 0; i < 4; i++) {
      const p = at((i % 2 ? 1 : -1) * size.width * (0.3 + i * 0.12), 0, -size.length * 0.5 - 0.03 - i * 0.05); p.y = WATER_LEVEL + 0.002;
      b.add('sphere', p, [0.05 + i * 0.02, 0.004, 0.05], '#f4fbff');
    }
  }

  dispose() { this.batch.dispose(); }
}
