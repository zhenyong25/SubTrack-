import * as THREE from 'three';
import type { ActivityPose, RecreationPlace } from './recreation';

// Compact tractors stay on the clear front access strip, away from crops, sheds and pens.
// Slot zero is the driver: equipment and resident use exactly the same simulation clock.
export const TRACTOR_TYPES = new Set(['wheatfield', 'redbarn', 'appleorchard', 'dairyfarm', 'vineyard', 'graincooperative']);
export interface TractorState { position: THREE.Vector3; heading: number; wheelAngle: number }
export function tractorState(place: RecreationPlace, seconds: number): TractorState | null {
  if (!TRACTOR_TYPES.has(place.type)) return null;
  // Back up at each end of this narrow lane instead of swinging into the neighbouring plot.
  const x = Math.sin(seconds * 0.18) * 0.26, z = 0.42;
  const sin = Math.sin(place.rotation), cos = Math.cos(place.rotation);
  return {
    position: new THREE.Vector3(place.center.x + (x * cos + z * sin) * place.size, 0.035 * place.size + 0.002, place.center.z + (-x * sin + z * cos) * place.size),
    heading: Math.PI / 2 + place.rotation,
    wheelAngle: x * place.size / 0.045,
  };
}
export function tractorDriver(place: RecreationPlace, seconds: number): ActivityPose | null {
  const tractor = tractorState(place, seconds); if (!tractor) return null;
  const position = tractor.position.clone().add(new THREE.Vector3(-Math.sin(tractor.heading) * 0.045, 0.036, -Math.cos(tractor.heading) * 0.045));
  return { position, heading: tractor.heading, walking: false, scale: 1, thighs: [-1.5, -1.5], knees: [-1.2, -1.2], arms: [-1.1, -1.1], elbows: [-0.8, -0.8], torsoPitch: 0.08, hat: '#d8bf73' };
}
