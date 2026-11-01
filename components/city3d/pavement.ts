// Shared geometry and surface tests keep feet on the same pavement that is rendered.
export const ROAD_SURFACE = 0.03;
export const PAVEMENT_SURFACE = 0.075;
export const PAVEMENT_INNER = 0.3; // 2 m pavements beside two 3 m traffic lanes.
export interface PavementRect { x: number; z: number; width: number; depth: number }
const WIDTH = 0.5 - PAVEMENT_INNER;
const CENTRE = PAVEMENT_INNER + WIDTH / 2;
export function roadNeighbour(roads: Set<number>, index: number, dx: number, dz: number) {
  const x = index % 100 + dx, z = Math.floor(index / 100) + dz;
  return x >= 0 && x < 100 && z >= 0 && z < 100 && roads.has(z * 100 + x);
}
export function pavementRects(roads: Set<number>, index: number): PavementRect[] {
  const result: PavementRect[] = [];
  for (const side of [-1, 1]) {
    if (!roadNeighbour(roads, index, side, 0)) result.push({ x: side * CENTRE, z: 0, width: WIDTH, depth: PAVEMENT_INNER * 2 });
    if (!roadNeighbour(roads, index, 0, side)) result.push({ x: 0, z: side * CENTRE, width: PAVEMENT_INNER * 2, depth: WIDTH });
  }
  // Fill the corner between adjoining strips, including the inside corner of a bend
  // or junction. Separate rectangles avoid overlapping, coplanar brick surfaces.
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    if (!roadNeighbour(roads, index, x, 0) || !roadNeighbour(roads, index, 0, z) || !roadNeighbour(roads, index, x, z)) result.push({ x: x * CENTRE, z: z * CENTRE, width: WIDTH, depth: WIDTH });
  }
  return result;
}
export const surfaceHeight = (roads: Set<number>, x: number, z: number) => {
  const tx = Math.floor(x + 50), tz = Math.floor(z + 50);
  if (tx < 0 || tz < 0 || tx >= 100 || tz >= 100) return 0;
  const index = tz * 100 + tx;
  if (!roads.has(index)) return 0;
  const lx = x + 50 - tx - 0.5, lz = z + 50 - tz - 0.5;
  const sx = Math.sign(lx), sz = Math.sign(lz);
  const edgeX = Math.abs(lx) >= PAVEMENT_INNER, edgeZ = Math.abs(lz) >= PAVEMENT_INNER;
  const pavement = edgeX && !roadNeighbour(roads, index, sx, 0)
    || edgeZ && !roadNeighbour(roads, index, 0, sz)
    || edgeX && edgeZ && !roadNeighbour(roads, index, sx, sz);
  return pavement ? PAVEMENT_SURFACE : ROAD_SURFACE;
};
