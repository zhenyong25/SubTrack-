import * as THREE from 'three';
import { PrimitiveBatch } from './primitiveBatch';
import { PAVEMENT_SURFACE, ROAD_SURFACE } from './pavement';
import type { StreetStop } from '../../services/cityGameService';

// Bus stops and taxi stands on the pavement (cityGameService `stops`). A stop stands on one side
// of its road tile: `out` points from the road's centre line to that pavement, `along` runs
// with the kerb, and `rotation` turns a stop's "front" (+z) to face the road.
export const STOP_DISTANCE = 0.4; // from the tile's centre to where people queue
export function stopFrame(toWorld: (index: number) => THREE.Vector3, stop: StreetStop) {
  const angle = stop.side * Math.PI / 2, out = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)), along = new THREE.Vector3(out.z, 0, -out.x);
  const centre = toWorld(stop.road).setY(PAVEMENT_SURFACE).addScaledVector(out, STOP_DISTANCE);
  return { centre, out, along, rotation: angle + Math.PI };
}

export class StreetStops {
  private batch: PrimitiveBatch;
  constructor(scene: THREE.Scene) { this.batch = new PrimitiveBatch(scene, 'street-stops', 1024); }
  set(stops: StreetStop[], toWorld: (index: number) => THREE.Vector3) {
    const b = this.batch; b.begin();
    for (const stop of stops) {
      const { centre, out, along } = stopFrame(toWorld, stop), heading = Math.atan2(out.x, out.z), y = PAVEMENT_SURFACE;
      const at = (a: number, o: number, h = y) => centre.clone().addScaledVector(along, a).addScaledVector(out, o).setY(h);
      if (stop.kind === 'bus') {
        // A glass shelter open to the road, with a bench and a sign post at the end.
        b.add('box', at(0, 0.07), [0.34, 0.2, 0.012], '#a9c6c2', heading);
        for (const a of [-0.17, 0.17]) { b.add('box', at(a, 0.035), [0.012, 0.2, 0.08], '#a9c6c2', heading); b.add('cyl', at(a, -0.01), [0.012, 0.21, 0.012], '#5d6b70'); }
        b.add('box', at(0, 0.03, y + 0.205), [0.38, 0.014, 0.13], '#5f7f86', heading);
        b.add('box', at(0, 0.05, y + 0.045), [0.24, 0.01, 0.04], '#98774f', heading);
        for (const a of [-0.1, 0.1]) b.add('box', at(a, 0.05), [0.01, 0.045, 0.035], '#62716d', heading);
        b.add('cyl', at(0.23, -0.04), [0.01, 0.28, 0.01], '#5d6b70');
        b.add('box', at(0.23, -0.04, y + 0.25), [0.07, 0.06, 0.01], '#2f6fb0', heading + Math.PI / 2);
        b.add('box', at(0.23, -0.04, y + 0.25), [0.03, 0.03, 0.012], '#f4f4f0', heading + Math.PI / 2);
      } else {
        // A sign, a bench and yellow markings along the kerb where taxis wait.
        b.add('cyl', at(0.2, -0.04), [0.01, 0.28, 0.01], '#5d6b70');
        b.add('box', at(0.2, -0.04, y + 0.25), [0.08, 0.05, 0.012], '#f2c230', heading + Math.PI / 2);
        b.add('box', at(0.2, -0.04, y + 0.25), [0.05, 0.015, 0.014], '#2b2d30', heading + Math.PI / 2);
        b.add('box', at(-0.04, 0.06, y + 0.045), [0.2, 0.01, 0.04], '#98774f', heading);
        for (const a of [-0.11, 0.03]) b.add('box', at(a, 0.06), [0.01, 0.045, 0.035], '#62716d', heading);
        for (const a of [-0.18, 0.18]) b.add('box', at(a, -0.13, ROAD_SURFACE + 0.001), [0.012, 0.002, 0.07], '#f2c230', heading);
        b.add('box', at(0, -0.165, ROAD_SURFACE + 0.001), [0.38, 0.002, 0.012], '#f2c230', heading);
      }
    }
    b.end();
  }
  dispose() { this.batch.dispose(); }
}
