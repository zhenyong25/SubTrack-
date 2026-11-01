import * as THREE from 'three';
import type { StreetNetwork } from './streets';

// Instanced lamps stay readable from any camera direction and glow in the night scene.
export class TrafficSignals {
  private meshes: THREE.InstancedMesh[] = [];
  private lamps: THREE.InstancedMesh | null = null;
  private entries: Array<{ road: number; slot: number }> = [];
  private materials: THREE.Material[] = [];
  constructor(private scene: THREE.Scene, private streets: StreetNetwork) {}
  rebuild() {
    this.dispose();
    const poleMaterial = new THREE.MeshStandardMaterial({ color: '#505d61', roughness: 0.5, metalness: 0.6 });
    const housingMaterial = new THREE.MeshStandardMaterial({ color: '#162127', roughness: 0.7 });
    const lampMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    this.materials.push(poleMaterial, housingMaterial, lampMaterial);
    const count = this.streets.crossings.size * 2;
    const make = (g: THREE.BufferGeometry, m: THREE.Material, n: number) => { const mesh = new THREE.InstancedMesh(g, m, Math.max(1, n)); mesh.count = n; mesh.frustumCulled = false; this.scene.add(mesh); this.meshes.push(mesh); return mesh; };
    const poles = make(new THREE.CylinderGeometry(0.012, 0.017, 0.63, 8), poleMaterial, count);
    const housings = make(new THREE.BoxGeometry(0.075, 0.19, 0.07), housingMaterial, count);
    this.lamps = make(new THREE.SphereGeometry(0.022, 8, 6), lampMaterial, count * 5);
    this.lamps.name = 'city-traffic-signals';
    const matrix = new THREE.Matrix4(); let slot = 0;
    for (const crossing of this.streets.crossings.values()) for (const side of [-1, 1]) {
      const x = crossing.position.x + side * 0.5, z = crossing.position.z + side * 0.5;
      poles.setMatrixAt(slot, matrix.makeTranslation(x, 0.36, z)); housings.setMatrixAt(slot, matrix.makeTranslation(x, 0.61, z));
      for (let lamp = 0; lamp < 5; lamp++) this.lamps.setMatrixAt(slot * 5 + lamp, matrix.makeTranslation(x + (lamp > 2 ? side * 0.055 : 0), lamp > 2 ? 0.39 - (lamp - 3) * 0.06 : 0.67 - lamp * 0.055, z + side * 0.043));
      this.entries.push({ road: crossing.road, slot }); slot++;
    }
    this.update();
  }
  update() {
    if (!this.lamps) return;
    const color = new THREE.Color();
    for (const { road, slot } of this.entries) {
      const phase = this.streets.crossings.get(road)!.phase;
      const lights = [phase !== 'cars' && phase !== 'amber', phase === 'amber', phase === 'cars', phase !== 'walk', phase === 'walk'];
      const colors = ['#ff5148', '#ffbd4b', '#51e39c', '#ff5148', '#69f0b2'];
      lights.forEach((on, i) => this.lamps!.setColorAt(slot * 5 + i, color.set(on ? colors[i] : '#15252b')));
    }
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.meshes.forEach(mesh => { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }); this.meshes = [];
    this.materials.forEach(m => m.dispose()); this.materials = []; this.entries = []; this.lamps = null;
  }
}
