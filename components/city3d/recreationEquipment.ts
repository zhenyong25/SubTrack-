import * as THREE from 'three';
import { activityPose, facilityPoint, type RecreationVisits } from './recreation';
import { ActivityProps } from './activityProps';

// Equipment shares a few instanced meshes with per-instance colours, regardless of
// the number of courts. Empty facilities have no floating balls or boards.
export class RecreationEquipment {
  private meshes: Record<string, THREE.InstancedMesh> = {};
  private material = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  private matrix = new THREE.Matrix4(); private q = new THREE.Quaternion(); private axis = new THREE.Vector3(0, 1, 0);
  private activities: ActivityProps;
  constructor(scene: THREE.Scene, private capacity = 256) {
    this.activities = new ActivityProps(scene);
    const geometries: Record<string, THREE.BufferGeometry> = {
      ball: new THREE.SphereGeometry(1, 10, 8),
      board: new THREE.BoxGeometry(0.05, 0.012, 0.13),
      wheel: new THREE.SphereGeometry(0.01, 6, 4),
      racket: new THREE.TorusGeometry(0.028, 0.003, 4, 12),
      handle: new THREE.CylinderGeometry(0.003, 0.003, 0.04, 5),
      balloon: new THREE.SphereGeometry(0.04, 10, 8),
    };
    for (const [name, geometry] of Object.entries(geometries)) {
      const mesh = new THREE.InstancedMesh(geometry, this.material, capacity * (name === 'wheel' ? 4 : 1));
      mesh.name = `recreation-${name}`; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color()); scene.add(mesh); this.meshes[name] = mesh;
    }
  }
  update(visits: RecreationVisits) {
    const counts: Record<string, number> = {}; Object.keys(this.meshes).forEach(name => { counts[name] = 0; });
    const put = (name: string, position: THREE.Vector3, color: string, heading = 0, scale = new THREE.Vector3(1, 1, 1)) => {
      const mesh = this.meshes[name], i = counts[name]; if (i >= mesh.instanceMatrix.count) return;
      this.q.setFromAxisAngle(this.axis, heading); this.matrix.compose(position, this.q, scale); mesh.setMatrixAt(i, this.matrix); mesh.setColorAt(i, new THREE.Color(color)); counts[name]++;
    };
    const active = [...visits.visits.values()].filter(v => v.phase === 'playing');
    const places = new Map(active.map(v => [v.place.id, v.place])); const t = visits.seconds;
    for (const place of places.values()) {
      const participants = active.filter(v => v.place.id === place.id);
      if (place.type === 'basketballcourt') {
        const shooter = participants.find(v => v.slot === 0) || participants[0];
        const body = activityPose(place, shooter.slot, t), phase = t % 8; let p: THREE.Vector3;
        if (phase >= 3 && phase < 5) {
          const f = (phase - 3) / 2, start = activityPose(place, shooter.slot, t - phase + 3).position.clone().add(new THREE.Vector3(0, 0.16, 0));
          const rim = facilityPoint(place, 0, 0.27, -0.325); p = start.lerp(rim, f); p.y += Math.sin(Math.PI * f) * 0.35;
        } else if (phase >= 5 && phase < 6) { const f = phase - 5; p = facilityPoint(place, 0, 0.27 * (1 - f) + 0.065 * f, -0.325); }
        else p = body.position.clone().add(new THREE.Vector3(0.04, 0.025 + Math.abs(Math.sin(t * 5)) * 0.105, 0));
        put('ball', p, '#d39956', 0, new THREE.Vector3().setScalar(0.018));
      } else if (place.type === 'tennisclub') {
        const phase = t % 2, f = phase < 1 ? phase : 2 - phase;
        put('ball', facilityPoint(place, Math.sin(t * 1.2) * 0.15, 0.11 + Math.sin(f * Math.PI) * 0.13, -0.25 + f * 0.5), '#c9d583', 0, new THREE.Vector3().setScalar(0.008));
      } else if (place.type === 'footballground' || place.type === 'citystadium') {
        const f = (t * 0.35) % participants.length, a = participants[Math.floor(f)], b = participants[(Math.floor(f) + 1) % participants.length];
        const p = activityPose(place, a.slot, t).position.lerp(activityPose(place, b.slot, t).position, f % 1); p.y = 0.063 * place.size;
        put('ball', p, '#e8e1ce', t, new THREE.Vector3().setScalar(0.014));
      } else if (place.type === 'bowlinghall') {
        const f = (t % 3) / 3; put('ball', facilityPoint(place, -0.22 + f * 0.46, 0.06, 0.31), '#7585ad', 0, new THREE.Vector3().setScalar(0.014));
      }
    }
    for (const visit of active) {
      const pose = activityPose(visit.place, visit.slot, t);
      if (visit.place.type === 'skatepark') {
        const p = pose.position.clone(); p.y -= 0.002; put('board', p, '#b68b67', pose.heading);
        for (const dx of [-0.026, 0.026]) for (const dz of [-0.043, 0.043]) { const offset = new THREE.Vector3(dx, -0.008, dz).applyAxisAngle(this.axis, pose.heading); put('wheel', p.clone().add(offset), '#52656a'); }
      } else if (visit.place.type === 'tennisclub') {
        const p = pose.position.clone().add(new THREE.Vector3(0.065 * Math.cos(pose.heading), 0.12 + Math.sin(t * Math.PI + visit.slot * Math.PI) * 0.035, -0.065 * Math.sin(pose.heading)));
        put('racket', p, '#b99b75', pose.heading); put('handle', p.clone().add(new THREE.Vector3(0, -0.045, 0)), '#826f59');
      } else if (visit.place.type === 'amusementpark') {
        const p = pose.position.clone().add(new THREE.Vector3(0.04, 0.3 + Math.sin(t * 2 + visit.slot) * 0.008, 0)); put('balloon', p, visit.slot % 2 ? '#bd8e9b' : '#d2b679');
        put('handle', p.clone().add(new THREE.Vector3(0, -0.07, 0)), '#d6ccad', 0, new THREE.Vector3(0.2, 3, 0.2));
      }
    }
    for (const [name, mesh] of Object.entries(this.meshes)) { mesh.count = counts[name]; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    this.activities.update(visits);
  }
  dispose() {
    this.activities.dispose(); for (const mesh of Object.values(this.meshes)) { mesh.geometry.dispose(); mesh.removeFromParent(); mesh.dispose(); } this.material.dispose(); }
}
