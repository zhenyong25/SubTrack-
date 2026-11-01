import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { along, buildGraph, pickNext, spawnOnRoads, surfaceHeight, type ToWorld } from './traffic';
import { RecreationVisits, type RecreationPlace, type RecreationResident } from './recreation';
import { RecreationEquipment } from './recreationEquipment';
import { BuildingVisits, type BuildingEntrance } from './buildingVisits';
import type { StreetNetwork } from './streets';

// The residents. Every resident lives in one of the homes you built. They commute, visit
// buildings, stroll on pavements, or take a recreation break. Indoor residents are hidden.
// Activity visitors are drawn from these same residents. Scale is real-world: a tile is about 10 m, so a person is about
// 0.175 tall.
//
// Close to the camera each person is a jointed figure (hips, knees, shoulders, elbows, neck,
// hair, shoes, some in dresses) with a walk cycle; further away a two-piece figure is used.

const PERSON_SCALE = 0.44; // the figure is modelled ~0.4 tall; this makes it ~1.75 m
const SKIN = ['#f3cfb3', '#e8b48f', '#c98e62', '#a8693f', '#7a4a2a', '#f7dcc8', '#d9a47a'];
const SHIRTS = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#8d6cab', '#f1f1ee', '#264653', '#e9c46a', '#ff7aa2', '#3a86ff', '#6a994e', '#bc4749'];
const PANTS = ['#1d3557', '#2b2d42', '#6c584c', '#495057', '#22333b', '#a68a64', '#3d405b'];
const HAIR = ['#1c130e', '#3b2516', '#5a3a22', '#8a5a2b', '#c9a15d', '#2b2b2b', '#a33b20'];
const SHOES = ['#1f1f1f', '#5b3a29', '#f2f2f2', '#2f3e46'];

export interface HomePlace { id: string; residents: number; door: number | null }
export interface WorkPlace { id: string; staff: number; door?: number | null }

interface Person {
  home: HomePlace | null; work: WorkPlace | null; // with a job: inside at work, out of sight
  from: number; to: number; t: number; // the road segment they're walking (from < 0: no roads yet)
  side: number; speed: number; phase: number; height: number; hairStyle: number; dress: boolean;
  shirt: THREE.Color; pants: THREE.Color; skin: THREE.Color; hair: THREE.Color; shoes: THREE.Color;
  pos: THREE.Vector3; heading: number;
  walking: boolean; wander: THREE.Vector3 | null;
  streetVisible: boolean; spawnAt: number;
  previousNode: number | null; wanderOrigin: number | null;
}

const NEAR_DISTANCE = 18;
const FAR_LIMIT = 75;
const MAX_DETAILED = 900;

const capsule = (radius: number, length: number, radial = 12) => {
  const geometry = new THREE.CapsuleGeometry(radius, length, 6, radial);
  geometry.translate(0, -(length / 2 + radius), 0); // hangs down from its joint
  return geometry;
};
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

export class Pedestrians {
  private people: Person[] = [];
  private graph = new Map<number, number[]>();
  private roadList: number[] = [];
  private roads = new Set<number>();
  private parts: Record<string, THREE.InstancedMesh> = {};
  private far: THREE.InstancedMesh; private farHead: THREE.InstancedMesh;
  private m = { base: new THREE.Matrix4(), joint: new THREE.Matrix4(), child: new THREE.Matrix4(), out: new THREE.Matrix4(), rot: new THREE.Matrix4(), head: new THREE.Matrix4() };
  private quat = new THREE.Quaternion(); private up = new THREE.Vector3(0, 1, 0); private scale = new THREE.Vector3(); private v = new THREE.Vector3();
  private materials: THREE.Material[] = [];
  readonly recreation: RecreationVisits;
  readonly buildings: BuildingVisits | null;
  private equipment: RecreationEquipment;
  private animationTime = 0;

  constructor(scene: THREE.Scene, private capacity: number, private toWorld: ToWorld, private plaza: THREE.Vector3, private streets?: StreetNetwork) {
    this.recreation = new RecreationVisits(toWorld, (id, road) => {
      const person = this.people[id]; if (!person) return;
      person.from = road; person.to = road < 0 ? -1 : pickNext(this.graph, road, -1); person.t = 0;
      person.wander = null;
      if (this.streets) { this.streets.crowd.release(id); person.streetVisible = false; }
      if (this.streets) { const node = this.streets.closest(person.pos); if (node) person.pos.copy(node.position); }
    }, streets);
    this.buildings = streets ? new BuildingVisits(streets, (id, curb, road) => {
      const person = this.people[id]; if (!person) return;
      person.pos.copy(curb); person.from = road; person.to = road; person.wander = null;
      streets.crowd.release(id); person.streetVisible = false;
    }) : null;
    this.equipment = new RecreationEquipment(scene);
    const cloth = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ roughness: 0.55 });
    const hairMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    const shoeMaterial = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    this.materials.push(cloth, skin, hairMaterial, shoeMaterial);

    const torso = new THREE.LatheGeometry([[0.001, 0], [0.032, 0.002], [0.03, 0.03], [0.036, 0.075], [0.04, 0.1], [0.036, 0.118], [0.012, 0.128], [0.001, 0.128]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    torso.scale(1.15, 1, 0.68);
    const pelvis = new RoundedBoxGeometry(0.07, 0.04, 0.045, 3, 0.015);
    const dress = new THREE.LatheGeometry([[0.03, 0.06], [0.034, 0.03], [0.05, -0.02], [0.062, -0.065], [0.001, -0.065]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    const neck = new THREE.CylinderGeometry(0.011, 0.013, 0.022, 10);
    const head = new THREE.SphereGeometry(0.025, 20, 16);
    head.scale(0.9, 1.12, 1);
    const hairShort = new THREE.SphereGeometry(0.027, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    hairShort.scale(0.95, 1.1, 1.04);
    const hairLong = new THREE.CapsuleGeometry(0.024, 0.035, 6, 14);
    hairLong.translate(0, -0.01, -0.01);
    hairLong.scale(1.05, 1.05, 0.95);
    const hairBun = new THREE.SphereGeometry(0.013, 12, 10);
    const shoe = new RoundedBoxGeometry(0.03, 0.02, 0.058, 2, 0.008);
    shoe.translate(0, -0.012, 0.01);
    const hand = new THREE.SphereGeometry(0.011, 10, 8);
    hand.translate(0, -0.066, 0);
    const forearm = capsule(0.0105, 0.044);
    const forearmWithHand = new THREE.BufferGeometry();
    {
      const merged = [forearm.toNonIndexed(), hand.toNonIndexed()];
      forearmWithHand.setAttribute('position', new THREE.Float32BufferAttribute(merged.flatMap(g => Array.from(g.getAttribute('position').array as Float32Array)), 3));
      forearmWithHand.setAttribute('normal', new THREE.Float32BufferAttribute(merged.flatMap(g => Array.from(g.getAttribute('normal').array as Float32Array)), 3));
      merged.forEach(g => g.dispose());
      forearm.dispose(); hand.dispose();
    }

    const make = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, perPerson: number) => {
      const mesh = new THREE.InstancedMesh(geometry, material, Math.min(capacity, MAX_DETAILED) * perPerson);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.setColorAt(0, new THREE.Color());
      scene.add(mesh);
      this.parts[name] = mesh;
    };
    make('torso', torso, cloth, 1);
    make('pelvis', pelvis, cloth, 1);
    make('dress', dress, cloth, 1);
    make('neck', neck, skin, 1);
    make('head', head, skin, 1);
    make('hairShort', hairShort, hairMaterial, 1);
    make('hairLong', hairLong, hairMaterial, 1);
    make('hairBun', hairBun, hairMaterial, 1);
    make('thigh', capsule(0.017, 0.062), cloth, 2);
    make('shin', capsule(0.0135, 0.06), cloth, 2);
    make('shoe', shoe, shoeMaterial, 2);
    make('upperArm', capsule(0.0115, 0.048), cloth, 2);
    make('forearm', forearmWithHand, skin, 2);

    const farBody = new THREE.CapsuleGeometry(0.03, 0.22, 4, 8);
    farBody.translate(0, 0.17, 0);
    farBody.scale(1.2, 1, 0.7);
    this.far = new THREE.InstancedMesh(farBody, cloth, capacity);
    this.farHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 10, 8).translate(0, 0.37, 0), skin, capacity);
    [this.far, this.farHead].forEach(mesh => {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.setColorAt(0, new THREE.Color());
      scene.add(mesh);
    });
  }

  setRoads(roads: Set<number>) {
    this.graph = buildGraph(roads);
    this.roads = roads;
    this.roadList = [...roads];
    this.recreation.setRoads(this.graph);
    this.buildings?.roadsChanged();
    this.people.forEach((person, id) => {
      person.wander = null; this.streets?.cancel(`wander:${id}`);
      if (this.streets) person.streetVisible = false;
      // An edited road may remove a crossing while somebody is using it. Release them
      // onto a surviving pavement before restarting traffic on the changed network.
      const node = this.streets?.closest(person.pos);
      if (node) { person.pos.copy(node.position); person.from = person.to = node.road; }
      else if ((!person.work || this.streets) && (!this.graph.has(person.from) || !this.graph.has(person.to))) this.startWalk(person);
    });
  }

  setRecreation(places: RecreationPlace[]) { this.recreation.setPlaces(places); }
  setEntrances(places: BuildingEntrance[]) { this.buildings?.setPlaces(places); }

  // Who lives where and who has a job. Jobs are spread across the city's residents rather than
  // filled house by house. The street simulation draws trips from those same residents.
  setCity(homes: HomePlace[], works: WorkPlace[]) {
    const homeSlots = homes.flatMap(home => Array.from({ length: home.residents }, () => home));
    const workSlots = works.flatMap(work => Array.from({ length: work.staff }, () => work));
    const random = seeded(7);
    for (let i = workSlots.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [workSlots[i], workSlots[j]] = [workSlots[j], workSlots[i]]; }
    const target = Math.min(this.capacity, homeSlots.length);
    while (this.people.length < target) this.people.push(this.newPerson(this.people.length));
    for (let i = target; i < this.people.length; i++) { this.recreation.residentChanged(i); this.buildings?.cancel(i); this.streets?.cancel(`wander:${i}`); }
    this.people.length = target;
    this.people.forEach((person, i) => {
      const home = homeSlots[i] || null;
      const work = workSlots[i] || null;
      const lostJob = person.work && !work;
      const changed = person.home?.id !== home?.id || person.work?.id !== work?.id;
      if (changed) { this.recreation.residentChanged(i); this.buildings?.cancel(i); this.streets?.cancel(`wander:${i}`); this.streets?.crowd.release(i); }
      person.home = home;
      person.work = work;
      if (lostJob || (this.streets && changed) || (!work && person.from < 0 && this.roadList.length)) this.startWalk(person);
    });
  }

  private newPerson(i: number): Person {
    const dress = i % 5 === 1 || i % 7 === 3;
    const skin = new THREE.Color(SKIN[(i * 7 + 3) % SKIN.length]);
    return {
      home: null, work: null, from: -1, to: -1, t: 0,
      side: (Math.random() < 0.5 ? -1 : 1) * (0.37 + Math.random() * 0.07), speed: 0.12 + Math.random() * 0.05, phase: Math.random() * 10,
      height: 0.92 + Math.random() * 0.14, hairStyle: dress ? (i % 2 ? 1 : 2) : [0, 0, 0, 1, 3][i % 5], dress,
      shirt: new THREE.Color(SHIRTS[(i * 5) % SHIRTS.length]), pants: dress ? skin.clone() : new THREE.Color(PANTS[(i * 3) % PANTS.length]),
      skin, hair: new THREE.Color(HAIR[(i * 11) % HAIR.length]), shoes: new THREE.Color(SHOES[(i * 13) % SHOES.length]),
      pos: new THREE.Vector3(), heading: Math.random() * Math.PI * 2, walking: false, wander: null, streetVisible: !this.streets, spawnAt: 0, previousNode: null, wanderOrigin: null,
    };
  }

  // Out the front door (or anywhere on the roads) and off for a walk.
  private startWalk(person: Person) {
    if (this.roadList.length === 0) { person.from = person.to = -1; return; }
    const start = person.home?.door != null && this.graph.has(person.home.door) ? { from: person.home.door, to: pickNext(this.graph, person.home.door, -1) } : spawnOnRoads(this.graph, this.roadList);
    person.from = start.from;
    person.to = start.to;
    person.t = Math.random();
    if (this.streets) {
      const node = this.streets.closest(this.toWorld(start.from));
      if (node) person.pos.copy(node.position);
      person.wander = null;
      person.streetVisible = false; person.spawnAt = this.animationTime / 1000;
    }
  }

  private advance(person: Person, dt: number) {
    if (person.work || person.from < 0 || person.from === person.to) return;
    person.t += dt * person.speed;
    while (person.t >= 1) { person.t -= 1; const next = pickNext(this.graph, person.to, person.from); person.from = person.to; person.to = next; }
  }

  // Where a walker is and which way they face.
  private locate(person: Person, time: number, index: number) {
    if (person.from < 0) {
      // No roads yet: stroll around the Town Hall plaza.
      const angle = person.phase + time * 0.00004;
      const radius = 1.4 + (index % 9) * 0.06;
      person.pos.set(this.plaza.x + Math.cos(angle) * radius, 0, this.plaza.z + Math.sin(angle) * radius);
      person.heading = angle + Math.PI;
      return;
    }
    if (person.from !== person.to) person.heading = along(this.toWorld, person.from, person.to, person.t, person.side, person.pos);
    else person.pos.copy(this.toWorld(person.from)).add(this.v.set(person.side, 0, 0));
  }

  update(dt: number, time: number, motion: boolean, camera: THREE.Camera) {
    if (motion) this.animationTime += dt * 1000;
    time = this.animationTime;
    this.streets?.crowd.begin(this.people.flatMap((person, id) => {
      const activity = this.recreation.pose(id), building = this.buildings?.pose(id);
      if (building && !building.visible || person.work && !activity && !building || !person.streetVisible && !activity && !building) return [];
      return [{ id, position: activity?.position || building?.position || person.pos }];
    }));
    const residents: RecreationResident[] = [];
    this.people.forEach((person, id) => {
      if (!person.work && !this.recreation.visits.has(id) && !this.buildings?.visits.has(id)) {
        if (this.streets && this.streets.nodes.size) {
          if (!person.streetVisible && time / 1000 >= person.spawnAt) {
            const position = this.streets.spawnResident(id, person.pos);
            if (position) { person.pos.copy(position); person.streetVisible = true; }
            else person.spawnAt = time / 1000 + 0.7 + id % 5 * 0.1;
          }
          if (motion && person.streetVisible) {
            if (!person.wander) {
              const node = this.streets.closest(person.pos), forward = node?.links.filter(link => link.to !== person.previousNode);
              const links = forward?.length ? forward : node?.links;
              const next = links?.[Math.floor(Math.random() * links.length)];
              person.wanderOrigin = node?.id ?? null; person.wander = (next ? this.streets.nodes.get(next.to)!.position : node?.position)?.clone() || null;
            }
            if (person.wander) { const result = this.streets.walk(`wander:${id}`, person.pos, person.wander, dt, person.speed * 1.5); person.walking = result.walking; if (result.walking) person.heading = result.heading; if (result.arrived || result.blocked) { person.previousNode = result.blocked ? this.streets.closest(person.wander)?.id ?? person.wanderOrigin : person.wanderOrigin; person.wander = null; } }
          }
        } else { if (motion) this.advance(person, dt); this.locate(person, time, id); person.walking = true; }
      }
      if ((person.streetVisible || person.work || !this.streets) && !this.buildings?.visits.has(id) && !this.streets?.isCrossing(`wander:${id}`)) residents.push({ id, employed: Boolean(person.work), road: person.from, door: person.work?.door ?? person.home?.door ?? null, position: person.pos });
    });
    this.recreation.update(dt, motion, residents);
    this.buildings?.update(dt, motion, this.people.flatMap((person, id) => this.recreation.visits.has(id) || this.streets?.isCrossing(`wander:${id}`) || !person.streetVisible && !person.work && !this.buildings?.visits.has(id) ? [] : [{ id, home: person.home?.id || null, work: person.work?.id || null, position: person.pos }]), this.people.length);
    for (const id of [...this.recreation.visits.keys(), ...(this.buildings?.visits.keys() || [])]) this.streets?.cancel(`wander:${id}`);
    const counts: Record<string, number> = {};
    Object.keys(this.parts).forEach(name => { counts[name] = 0; });
    let farCount = 0;
    const cam = camera.position;
    const { base, joint, child, out, rot, head: headMatrix } = this.m;
    const put = (name: string, matrix: THREE.Matrix4, color: THREE.Color) => {
      const i = counts[name]++;
      this.parts[name].setMatrixAt(i, matrix);
      this.parts[name].setColorAt(i, color);
    };

    const visiblePositions: THREE.Vector3[] = [];
    for (let i = 0; i < this.people.length; i += 1) {
      const p = this.people[i];
      const building = this.buildings?.pose(i);
      const activity = this.recreation.pose(i) || building;
      if (building && !building.visible) { p.streetVisible = false; continue; }
      if (p.work && !activity) continue; // at work, indoors
      if (this.streets && !p.streetVisible && !activity) continue;
      if (activity) { p.pos.copy(activity.position); p.heading = activity.heading; }
      p.streetVisible = true;
      visiblePositions.push(p.pos);
      const distance = cam.distanceTo(p.pos);
      if (distance > FAR_LIMIT) continue;

      const walking = motion && (activity ? activity.walking : p.walking);
      const cycle = walking ? time * 0.0062 * (p.speed / 0.145) + p.phase : 0; // about one stride a second
      this.quat.setFromAxisAngle(this.up, p.heading);
      const bob = walking ? Math.abs(Math.cos(cycle)) * 0.0025 : 0;
      // Feet on whatever is underfoot - the raised pavement, the asphalt or the grass.
      const ground = activity ? p.pos.y : surfaceHeight(this.roads, p.pos.x, p.pos.z) + 0.004;
      base.compose(this.v.set(p.pos.x, ground + bob, p.pos.z), this.quat, this.scale.setScalar(p.height * PERSON_SCALE * (activity?.scale || 1)));
      if (activity?.rootPitch) base.multiply(rot.makeRotationX(activity.rootPitch));
      if (activity?.rootRoll) base.multiply(rot.makeRotationZ(activity.rootRoll));

      const near = counts.torso < MAX_DETAILED && distance < NEAR_DISTANCE;
      if (!near) {
        this.far.setMatrixAt(farCount, base);
        this.far.setColorAt(farCount, p.shirt);
        this.farHead.setMatrixAt(farCount, base);
        this.farHead.setColorAt(farCount, p.skin);
        farCount += 1;
        continue;
      }

      // A slight hip sway as weight moves from foot to foot.
      if (walking) base.multiply(rot.makeRotationY(Math.sin(cycle) * 0.08));
      put('pelvis', out.multiplyMatrices(base, joint.makeTranslation(0, 0.19, 0)), p.dress ? p.shirt : p.pants);
      if (p.dress) put('dress', out.multiplyMatrices(base, joint.makeTranslation(0, 0.2, 0)), p.shirt);
      put('torso', out.multiplyMatrices(base, joint.makeRotationX(activity?.torsoPitch ?? 0.03).setPosition(0, 0.205, 0)), p.shirt);
      put('neck', out.multiplyMatrices(base, joint.makeTranslation(0, 0.343, 0)), p.skin);
      headMatrix.multiplyMatrices(base, joint.makeTranslation(0, 0.374, 0.003));
      put('head', headMatrix, p.skin);
      if (p.hairStyle === 0 || p.hairStyle === 2) put('hairShort', out.multiplyMatrices(headMatrix, joint.makeTranslation(0, 0.004, -0.002)), p.hair);
      if (p.hairStyle === 1) put('hairLong', out.multiplyMatrices(headMatrix, joint.makeTranslation(0, 0.004, -0.004)), p.hair);
      if (p.hairStyle === 2) put('hairBun', out.multiplyMatrices(headMatrix, joint.makeTranslation(0, 0.02, -0.022)), p.hair);
      if (p.hairStyle === 3) put('hairShort', out.multiplyMatrices(headMatrix, rot.makeScale(0.98, 0.88, 0.98).setPosition(0, 0.001, -0.001)), p.hair);

      // Legs: the thigh swings from the hip, the knee bends as the leg comes through, the foot
      // stays level.
      for (let side = 0; side < 2; side += 1) {
        const sign = side ? 1 : -1;
        const phase = cycle + side * Math.PI;
        const swing = activity?.thighs?.[side] ?? (walking ? Math.sin(phase) * 0.45 : 0);
        const knee = activity?.knees?.[side] ?? (walking ? 0.06 + Math.max(0, Math.cos(phase)) * 0.75 : 0.02);
        joint.multiplyMatrices(base, rot.makeRotationX(swing).setPosition(sign * 0.021, 0.185, 0));
        put('thigh', joint, p.pants);
        child.multiplyMatrices(joint, rot.makeRotationX(-knee).setPosition(0, -0.096, 0));
        put('shin', child, p.dress ? p.skin : p.pants);
        out.multiplyMatrices(child, rot.makeRotationX(knee - swing).setPosition(0, -0.087, 0));
        put('shoe', out, p.shoes);
      }
      // Arms swing opposite the legs; resting arms hang at the sides.
      for (let side = 0; side < 2; side += 1) {
        const sign = side ? 1 : -1;
        const swing = activity?.arms?.[side] ?? (walking ? -Math.sin(cycle + side * Math.PI) * 0.38 : 0);
        joint.multiplyMatrices(base, rot.makeRotationX(swing).setPosition(sign * 0.049, 0.318, 0));
        joint.multiply(rot.makeRotationZ(sign * (activity?.armSplay ?? 0.06)));
        put('upperArm', joint, p.shirt);
        child.multiplyMatrices(joint, rot.makeRotationX(activity?.elbows?.[side] ?? -(walking ? 0.2 + Math.max(0, -swing) * 0.5 : 0.12)).setPosition(0, -0.072, 0));
        put('forearm', child, p.skin);
      }
    }

    Object.values(this.parts).forEach(mesh => {
      const name = Object.keys(this.parts).find(key => this.parts[key] === mesh)!;
      mesh.count = counts[name];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    [this.far, this.farHead].forEach(mesh => {
      mesh.count = farCount;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    this.equipment.update(this.recreation);
    this.streets?.setPedestrians(visiblePositions);
  }

  dispose() {
    this.equipment.dispose();
    [...Object.values(this.parts), this.far, this.farHead].forEach(mesh => { mesh.geometry.dispose(); mesh.removeFromParent(); mesh.dispose(); });
    this.materials.forEach(material => material.dispose());
  }
}
