import * as THREE from 'three';
import { PrimitiveBatch, type PrimitiveShape } from './primitiveBatch';
import type { HeldItem, RodLine } from './activities';

// Things residents carry, wear or fish with. Items are modelled in the figure's own units
// (people.ts: about 0.4 tall before scaling) in the frame of the right forearm, whose hand is
// at y -0.066 and whose +z points forward, so they follow every arm pose.
type Part = [shape: PrimitiveShape, position: [number, number, number], scale: [number, number, number], color: string, rotation?: [number, number, number]];
const ITEMS: Record<HeldItem, Part[]> = {
  trashbag: [['sphere', [0, -0.13, 0], [0.07, 0.09, 0.065], '#373d35'], ['box', [0, -0.087, 0], [0.015, 0.014, 0.015], '#202820']],
  cup: [['cyl', [0, -0.084, 0.012], [0.018, 0.022, 0.018], '#f4efe6'], ['cyl', [0, -0.063, 0.012], [0.019, 0.003, 0.019], '#6b4a33']],
  phone: [['box', [0, -0.09, 0.012], [0.014, 0.026, 0.004], '#1d2024']],
  book: [['box', [0, -0.095, 0.014], [0.04, 0.05, 0.012], '#8c3b3b'], ['box', [0, -0.094, 0.0145], [0.037, 0.048, 0.013], '#f3ecd9']],
  bag: [['box', [0, -0.13, 0], [0.04, 0.045, 0.018], '#e9d6a8'], ['box', [0, -0.085, 0], [0.002, 0.012, 0.016], '#8a6a46']],
  flowers: [['cyl', [0, -0.11, 0.01], [0.006, 0.05, 0.006], '#4d7d3b'], ['sphere', [0, -0.055, 0.012], [0.03, 0.026, 0.03], '#e2577b'], ['sphere', [0.008, -0.05, 0.02], [0.015, 0.015, 0.015], '#f4d35e']],
  icecream: [['cone', [0, -0.065, 0.012], [0.014, -0.035, 0.014], '#d9a35b'], ['sphere', [0, -0.06, 0.012], [0.018, 0.018, 0.018], '#f6c2d0']],
  basket: [['box', [0, -0.12, 0], [0.045, 0.026, 0.032], '#b8894f'], ['box', [0, -0.098, 0], [0.003, 0.02, 0.03], '#8a6a46'], ['sphere', [0, -0.105, 0], [0.03, 0.012, 0.022], '#c2423a']],
  hoe: [['cyl', [0, -0.066, 0], [0.007, 0.21, 0.007], '#9b7b55', [2.6, 0, 0]], ['box', [0, -0.25, 0.115], [0.03, 0.008, 0.02], '#6f7375', [2.6, 0, 0]]],
  can: [['box', [0, -0.11, 0], [0.026, 0.026, 0.04], '#4b9a72'], ['cyl', [0, -0.1, 0.03], [0.005, 0.03, 0.005], '#4b9a72', [1.1, 0, 0]]],
  binoculars: [['cyl', [-0.011, -0.074, 0.008], [0.012, 0.024, 0.012], '#2a2d30', [Math.PI / 2, 0, 0]], ['cyl', [0.011, -0.074, 0.008], [0.012, 0.024, 0.012], '#2a2d30', [Math.PI / 2, 0, 0]]],
  brush: [['cyl', [0, -0.07, 0.005], [0.004, 0.05, 0.004], '#a87b4f', [0.4, 0, 0]], ['sphere', [0, -0.025, 0.024], [0.007, 0.007, 0.007], '#d24a5a']],
  ticket: [['box', [0, -0.08, 0.012], [0.022, 0.012, 0.002], '#f3d36b']],
  crate: [['box', [-0.048, -0.105, 0.02], [0.08, 0.055, 0.06], '#b98d57'], ['box', [-0.048, -0.077, 0.02], [0.082, 0.004, 0.062], '#8c6a3f']],
  hay: [['box', [-0.048, -0.105, 0.02], [0.09, 0.05, 0.06], '#e2c56a']],
  hammer: [['cyl', [0, -0.07, 0], [0.006, 0.06, 0.006], '#8a6a46', [1.6, 0, 0]], ['box', [0, -0.07, 0.055], [0.012, 0.03, 0.012], '#5c6166', [1.6, 0, 0]]],
  clipboard: [['box', [0, -0.09, 0.014], [0.032, 0.042, 0.003], '#8a6a46'], ['box', [0, -0.089, 0.016], [0.026, 0.034, 0.002], '#ffffff']],
  guitar: [['sphere', [-0.03, -0.075, 0.03], [0.05, 0.062, 0.016], '#b5652b'], ['box', [-0.075, -0.035, 0.03], [0.012, 0.01, 0.075], '#4b3423', [0, 0, 0.9]]],
  mic: [['cyl', [0, -0.085, 0.01], [0.007, 0.03, 0.007], '#2a2d30'], ['sphere', [0, -0.052, 0.012], [0.012, 0.012, 0.012], '#9aa0a6']],
  bread: [['cyl', [0, -0.07, 0.01], [0.015, 0.07, 0.015], '#d39b55', [0.5, 0, 0]]],
  parcel: [['box', [0, -0.11, 0.008], [0.042, 0.032, 0.035], '#b98d57'], ['box', [0, -0.094, 0.008], [0.043, 0.002, 0.008], '#e9d6a8']],
  suitcase: [['box', [0, -0.14, 0], [0.018, 0.06, 0.05], '#3e5f8a'], ['box', [0, -0.087, 0], [0.004, 0.012, 0.02], '#2a2d30']],
  hose: [['cyl', [0, -0.07, 0.005], [0.01, 0.05, 0.01], '#2a2d30', [1.5, 0, 0]], ['cyl', [0, -0.07, 0.05], [0.007, 0.02, 0.007], '#c9a227', [1.5, 0, 0]]],
  coin: [['cyl', [0, -0.08, 0.012], [0.012, 0.002, 0.012], '#f2c94c', [Math.PI / 2, 0, 0]]],
};
const parts = Object.fromEntries(Object.entries(ITEMS).map(([name, list]) => [name, list.map(([shape, p, s, color, r]) => ({
  shape, color, matrix: new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]))), new THREE.Vector3(...s)),
}))])) as Record<HeldItem, Array<{ shape: PrimitiveShape; color: string; matrix: THREE.Matrix4 }>>;

const ROD_LENGTH = 0.26;
const crown = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.017, -0.002), new THREE.Quaternion(), new THREE.Vector3(0.056, 0.016, 0.058));
const brim = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.015, 0.002), new THREE.Quaternion(), new THREE.Vector3(0.086, 0.003, 0.09));

export class HeldItems {
  private batch: PrimitiveBatch;
  private m = new THREE.Matrix4(); private hand = new THREE.Vector3(); private tip = new THREE.Vector3();
  constructor(scene: THREE.Scene) { this.batch = new PrimitiveBatch(scene, 'held-items', 4096); }
  begin() { this.batch.begin(); }
  item(kind: HeldItem, forearm: THREE.Matrix4) { for (const part of parts[kind]) this.batch.addMatrix(part.shape, this.m.multiplyMatrices(forearm, part.matrix), part.color); }
  hat(color: string, head: THREE.Matrix4) {
    this.batch.addMatrix('cyl', this.m.multiplyMatrices(head, crown), color);
    this.batch.addMatrix('cyl', this.m.multiplyMatrices(head, brim), color);
  }
  // A rod from the hand at `pitch` from upright in the facing direction, its line to the float
  // (or a fish hanging from the tip when one is landed).
  rod(rod: RodLine, forearm: THREE.Matrix4, heading: number, seconds: number) {
    this.hand.set(0, -0.066, 0).applyMatrix4(forearm);
    const s = Math.sin(rod.pitch);
    this.tip.set(Math.sin(heading) * s, Math.cos(rod.pitch), Math.cos(heading) * s).multiplyScalar(ROD_LENGTH).add(this.hand);
    this.batch.segment(this.hand, this.tip, 0.0018, '#3b3127');
    if (rod.fish) {
      const fish = this.tip.clone(); fish.y -= 0.07;
      this.batch.segment(this.tip, fish, 0.0004, '#e9eef0');
      this.batch.add('sphere', fish.setY(fish.y - 0.012), [0.012, 0.03, 0.008], '#a9bcc6', heading, 0, Math.sin(seconds * 14) * 0.5);
    } else {
      this.batch.segment(this.tip, rod.float, 0.0004, '#e9eef0');
      this.batch.add('sphere', rod.float, 0.008, '#e8483b');
    }
  }
  end() { this.batch.end(); }
  dispose() { this.batch.dispose(); }
}
