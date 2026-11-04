import * as THREE from 'three';

// Lit windows that follow who is inside. Each placed building carries one number per instance:
// its integer part is a seed for that building and its fraction is the share of its windows
// that are lit. The facade shader lights a window when a hash of the window's cell and the seed
// falls under that share, so a building fills up window by window as people come home, and an
// empty one goes dark. Meshes without the attribute (previews) stay dark.

export const WINDOW_LIGHT = 'instanceLight';
export function litWindows(material: THREE.MeshStandardMaterial, cols: number, rows: number) {
  material.onBeforeCompile = shader => {
    shader.uniforms.windowGrid = { value: new THREE.Vector2(cols, rows) };
    shader.vertexShader = `attribute float ${WINDOW_LIGHT};\nvarying float vWindowLight;\n` + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  vWindowLight = ${WINDOW_LIGHT};`);
    shader.fragmentShader = 'uniform vec2 windowGrid;\nvarying float vWindowLight;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    vec2 cell = floor(vEmissiveMapUv * windowGrid);
    float seed = floor(vWindowLight), share = fract(vWindowLight);
    float chance = fract(sin(dot(cell + seed * 0.731, vec2(12.9898, 78.233))) * 43758.5453);
    totalEmissiveRadiance *= step(chance, share - 0.0001);
  }`);
  };
  material.customProgramCacheKey = () => 'occupied-windows';
}
// The per-instance value for a building: its seed plus the lit share (kept below 1).
export const windowLight = (id: string, share: number) => {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return h + Math.max(0, Math.min(0.995, share));
};
export function setWindowLights(mesh: THREE.InstancedMesh, values: number[]) {
  let attribute = mesh.geometry.getAttribute(WINDOW_LIGHT) as THREE.InstancedBufferAttribute | undefined;
  if (!attribute || attribute.count < mesh.instanceMatrix.count) {
    attribute = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count), 1);
    attribute.setUsage(THREE.DynamicDrawUsage);
    mesh.geometry.setAttribute(WINDOW_LIGHT, attribute);
  }
  let changed = false;
  values.forEach((value, i) => { if (attribute!.array[i] !== value) { attribute!.array[i] = value; changed = true; } });
  if (changed) attribute.needsUpdate = true;
}
