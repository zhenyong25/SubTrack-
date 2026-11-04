import * as THREE from 'three';

// Small props (boats, rods, cups, crates, ducks...) drawn from a few shared unit shapes. Each
// shape is one InstancedMesh with per-instance colour, refilled every frame, so the number of
// props on screen never changes the number of draw calls.
export type PrimitiveShape = 'box' | 'cyl' | 'sphere' | 'cone' | 'hull' | 'sail';

const hull = () => {
  // Plan view of a boat, bow towards +z; extruded downwards, then lifted to span y 0..1.
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5); shape.lineTo(0.5, -0.5); shape.lineTo(0.5, 0.15); shape.quadraticCurveTo(0.42, 0.42, 0, 0.5); shape.quadraticCurveTo(-0.42, 0.42, -0.5, 0.15); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 6 });
  geometry.rotateX(Math.PI / 2); geometry.translate(0, 1, 0);
  return geometry;
};
const sail = () => {
  // A triangle in the boat's centre plane: luff up the mast at z 0, foot along -z.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 0, 0, 0, -1, 0, 1, 0], 3));
  geometry.computeVertexNormals();
  return geometry;
};

export class PrimitiveBatch {
  private meshes = {} as Record<PrimitiveShape, THREE.InstancedMesh>;
  private counts = {} as Record<PrimitiveShape, number>;
  private colors = new Map<string, THREE.Color>();
  private material = new THREE.MeshStandardMaterial({ roughness: 0.65, side: THREE.DoubleSide });
  private matrix = new THREE.Matrix4(); private euler = new THREE.Euler(0, 0, 0, 'YXZ'); private q = new THREE.Quaternion(); private s = new THREE.Vector3();

  constructor(scene: THREE.Scene, name: string, capacity = 2048) {
    const geometries: Record<PrimitiveShape, THREE.BufferGeometry> = {
      box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0),
      sphere: new THREE.SphereGeometry(0.5, 12, 8),
      cone: new THREE.ConeGeometry(0.5, 1, 10).translate(0, 0.5, 0),
      hull: hull(),
      sail: sail(),
    };
    for (const [shape, geometry] of Object.entries(geometries) as Array<[PrimitiveShape, THREE.BufferGeometry]>) {
      const mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
      mesh.name = `${name}-${shape}`; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color());
      scene.add(mesh); this.meshes[shape] = mesh; this.counts[shape] = 0;
    }
  }
  private color(value: string) { let c = this.colors.get(value); if (!c) { c = new THREE.Color(value); this.colors.set(value, c); } return c; }
  begin() { for (const shape of Object.keys(this.counts) as PrimitiveShape[]) this.counts[shape] = 0; }
  // Unit shapes sit on their base (box, cyl, cone, hull) or centre (sphere) at `matrix`.
  addMatrix(shape: PrimitiveShape, matrix: THREE.Matrix4, color: string) {
    const mesh = this.meshes[shape], i = this.counts[shape]; if (i >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, this.color(color)); this.counts[shape] = i + 1;
  }
  // Rotation is heading (about y), then pitch (about the turned x axis), then roll.
  add(shape: PrimitiveShape, position: THREE.Vector3, scale: [number, number, number] | number, color: string, heading = 0, pitch = 0, roll = 0) {
    this.q.setFromEuler(this.euler.set(pitch, heading, roll));
    this.matrix.compose(position, this.q, typeof scale === 'number' ? this.s.setScalar(scale) : this.s.set(...scale));
    this.addMatrix(shape, this.matrix, color);
  }
  // A thin rod between two points (fishing lines, hoses, oars).
  segment(from: THREE.Vector3, to: THREE.Vector3, radius: number, color: string) {
    const delta = to.clone().sub(from), length = delta.length(); if (length < 0.0001) return;
    this.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.divideScalar(length));
    this.matrix.compose(from, this.q, this.s.set(radius * 2, length, radius * 2));
    this.addMatrix('cyl', this.matrix, color);
  }
  end() {
    for (const [shape, mesh] of Object.entries(this.meshes) as Array<[PrimitiveShape, THREE.InstancedMesh]>) {
      mesh.count = this.counts[shape]; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  dispose() { for (const mesh of Object.values(this.meshes)) { mesh.geometry.dispose(); mesh.removeFromParent(); mesh.dispose(); } this.material.dispose(); }
}
