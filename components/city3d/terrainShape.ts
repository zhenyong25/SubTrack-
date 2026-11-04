import { MAP, elevationAt, type Terrain } from '../../services/cityGameService';

// Heights of the ground mesh's vertices, one per tile corner ((MAP + 1)² of them). The sea bed
// drops away under water; on land the mountains and hills of `elevationAt` rise, except at the
// corners of anything built (roads, buildings, the Town Hall), which stay level so nothing
// stands on a slope, even in a city founded before the mountains.
export function terrainHeights(tiles: Terrain[], built: Set<number>) {
  const heights = new Float32Array((MAP + 1) * (MAP + 1));
  for (let j = 0; j <= MAP; j += 1) for (let i = 0; i <= MAP; i += 1) {
    const around = [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]];
    const wet = around.filter(([x, z]) => x < 0 || z < 0 || x >= MAP || z >= MAP || tiles[z * MAP + x] === 'water').length;
    const level = around.some(([x, z]) => x >= 0 && z >= 0 && x < MAP && z < MAP && built.has(z * MAP + x));
    heights[j * (MAP + 1) + i] = wet === 4 ? -0.55 : wet > 0 ? -0.16 : level ? 0 : elevationAt(i, j);
  }
  return heights;
}
// The ground height at a point in tile coordinates, following the mesh's own triangles closely
// enough for trees and markers.
export function groundAt(heights: Float32Array, x: number, z: number) {
  const i = Math.max(0, Math.min(MAP - 1, Math.floor(x))), j = Math.max(0, Math.min(MAP - 1, Math.floor(z))), u = x - i, v = z - j, row = MAP + 1;
  const a = heights[j * row + i], b = heights[j * row + i + 1], c = heights[(j + 1) * row + i], d = heights[(j + 1) * row + i + 1];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
