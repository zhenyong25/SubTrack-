import * as THREE from 'three';

// About 0.8 m between resident centres at the city's 10 m/tile scale.
export const PERSONAL_SPACE = 0.078;
const CELL = 0.2;
const keyAt = (p: THREE.Vector3) => `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
const residentId = (id: string | number) => String(id).replace(/^(wander|building|recreation|transit):/, '');
interface Occupant { position: THREE.Vector3; goal: THREE.Vector3 | null; waiting: number }
const distanceToSegment = (start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3) => {
  const dx = end.x - start.x, dz = end.z - start.z, length = dx * dx + dz * dz;
  const t = length ? THREE.MathUtils.clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / length, 0, 1) : 0;
  return Math.hypot(start.x + t * dx - point.x, start.z + t * dz - point.z);
};
const corridorDistance = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
  const ax = b.x - a.x, az = b.z - a.z, bx = d.x - c.x, bz = d.z - c.z, det = ax * bz - az * bx;
  if (Math.abs(det) > 0.0000001) {
    const dx = c.x - a.x, dz = c.z - a.z, t = (dx * bz - dz * bx) / det, u = (dx * az - dz * ax) / det;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(distanceToSegment(a, b, c), distanceToSegment(a, b, d), distanceToSegment(c, d, a), distanceToSegment(c, d, b));
};
export class PedestrianCrowd {
  private people = new Map<string, Occupant>();
  private buckets = new Map<string, Set<string>>();
  private exits = new Map<string, { start: THREE.Vector3; end: THREE.Vector3 }>();

  begin(people: Array<{ id: string | number; position: THREE.Vector3 }>) {
    const previous = this.people; this.people = new Map(); this.buckets.clear();
    for (const person of people) {
      const id = residentId(person.id), old = previous.get(id);
      this.put(id, { position: person.position.clone(), goal: old?.goal || null, waiting: old?.waiting || 0 });
    }
  }
  clear() { this.people.clear(); this.buckets.clear(); this.exits.clear(); }
  has(id: string | number) { return this.people.has(residentId(id)); }
  positionOf(id: string | number) { return this.people.get(residentId(id))?.position; }
  release(id: string | number) {
    this.unreserve(id); this.removePosition(residentId(id));
  }
  private removePosition(key: string) {
    const person = this.people.get(key); if (!person) return;
    this.buckets.get(keyAt(person.position))?.delete(key); this.people.delete(key);
  }
  private put(id: string, person: Occupant) {
    this.removePosition(id); this.people.set(id, person); const bucket = keyAt(person.position);
    if (!this.buckets.has(bucket)) this.buckets.set(bucket, new Set()); this.buckets.get(bucket)!.add(id);
  }
  private neighbours(position: THREE.Vector3) {
    const ids = new Set<string>();
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      const key = `${Math.floor(position.x / CELL) + x},${Math.floor(position.z / CELL) + z}`;
      for (const id of this.buckets.get(key) || []) ids.add(id);
    }
    return ids;
  }
  available(id: string | number, position: THREE.Vector3, spacing = PERSONAL_SPACE) {
    const key = residentId(id);
    for (const other of this.neighbours(position)) if (other !== key) {
      const p = this.people.get(other)!.position;
      if (Math.hypot(p.x - position.x, p.z - position.z) < spacing) return false;
    }
    for (const [owner, path] of this.exits) if (owner !== key && distanceToSegment(path.start, path.end, position) < spacing) return false;
    return true;
  }
  reserveExit(id: string | number, position: THREE.Vector3, start = position) {
    const key = residentId(id);
    for (const [other, person] of this.people) if (other !== key && distanceToSegment(start, position, person.position) < PERSONAL_SPACE) return false;
    for (const [other, path] of this.exits) if (other !== key && corridorDistance(start, position, path.start, path.end) < PERSONAL_SPACE) return false;
    this.exits.set(key, { start: start.clone(), end: position.clone() }); return true;
  }
  unreserve(id: string | number) { this.exits.delete(residentId(id)); }
  spawn(id: string | number, position: THREE.Vector3, spacing = PERSONAL_SPACE) {
    const key = residentId(id);
    if (!this.available(key, position, spacing)) return false;
    this.put(key, { position: position.clone(), goal: null, waiting: 0 }); return true;
  }
  move(id: string | number, position: THREE.Vector3, target: THREE.Vector3, dt: number, speed: number, allowed: (p: THREE.Vector3) => boolean, passing = true) {
    const key = residentId(id), delta = target.clone().sub(position), distance = delta.length(), step = Math.min(distance, speed * dt);
    if (!this.has(key) && !this.spawn(key, position)) return { arrived: false, walking: false, heading: 0 };
    const person = this.people.get(key)!; person.goal = target.clone();
    if (distance < 0.00001) return { arrived: true, walking: false, heading: 0 };
    const candidate = position.clone().addScaledVector(delta, step / distance);
    const blocker = (id: string) => this.people.get(id) || { position: this.exits.get(id.slice(5))!.end, goal: null, waiting: 0 };
    const blockers = (end: THREE.Vector3) => [
      ...[...this.neighbours(end)].filter(other => other !== key && distanceToSegment(position, end, this.people.get(other)!.position) < PERSONAL_SPACE - 0.000001),
      ...[...this.exits].filter(([owner, path]) => owner !== key && corridorDistance(position, end, path.start, path.end) < PERSONAL_SPACE - 0.000001).map(([owner]) => `exit:${owner}`),
    ];
    let next = candidate;
    const blocked = blockers(candidate);
    if (blocked.length || !allowed(candidate)) {
      person.waiting += dt;
      if (!passing) return { arrived: false, walking: false, heading: Math.atan2(delta.x, delta.z) };
      const opposing = blocked.some(other => {
        const walker = blocker(other), goal = walker.goal;
        return goal && goal.clone().sub(walker.position).dot(delta) < -0.00001;
      });
      // Keep right when meeting an oncoming walker. Following walkers queue rather
      // than pushing through the person ahead. Only step aside on walkable ground.
      if (!opposing && person.waiting <= 3 && (person.waiting < 1.5 || blocked.some(other => !blocker(other).goal))) return { arrived: false, walking: false, heading: Math.atan2(delta.x, delta.z) };
      const lateral = new THREE.Vector3(delta.z, 0, -delta.x).normalize().multiplyScalar(speed * dt);
      const alternatives = [position.clone().add(lateral), position.clone().sub(lateral)];
      // In a tight corner the lower-priority walker can back up a little to let
      // the other person clear it, instead of both waiting face to face forever.
      if (blocked.every(other => key.localeCompare(other, undefined, { numeric: true }) > 0)) alternatives.push(position.clone().addScaledVector(delta, -Math.min(speed * dt, 0.02) / distance));
      // Still stuck after 3 s (a knot of people facing each other): try every direction and take
      // the free step that ends closest to the goal. Nobody overlaps; someone finds the gap.
      if (person.waiting > 3) for (let i = 0; i < 8; i++) alternatives.push(position.clone().add(new THREE.Vector3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)).multiplyScalar(speed * dt)));
      const options = alternatives.filter(p => allowed(p) && !blockers(p).length);
      const free = person.waiting > 3 ? options.sort((a, b) => a.distanceTo(target) - b.distanceTo(target))[0] : options[0];
      if (!free) return { arrived: false, walking: false, heading: Math.atan2(delta.x, delta.z) };
      next = free;
    } else person.waiting = 0;
    const heading = Math.atan2(next.x - position.x, next.z - position.z);
    position.copy(next); this.put(key, { ...person, position: next.clone() });
    return { arrived: position.distanceTo(target) < 0.00001, walking: true, heading };
  }
}
