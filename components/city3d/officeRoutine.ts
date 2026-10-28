export type OfficeActivity = 'Typing at the desk' | 'Getting up' | 'Walking to the shelves' | 'Checking a folder' | 'Walking to the window' | 'Taking a short break' | 'Returning to the desk' | 'Sitting down';
type Stop = { duration: number; x: number; z: number; angle: number; stand: number; activity: OfficeActivity };
// Clear aisles around the desk, chair, bookcase and plants. Angles face local +Z.
const stops: Stop[] = [
  { duration: 9, x: 0, z: -1.04, angle: 0, stand: 0, activity: 'Typing at the desk' },
  { duration: 1.8, x: 0, z: -1.04, angle: 0, stand: 1, activity: 'Getting up' },
  { duration: 1.8, x: -0.85, z: -1.04, angle: -Math.PI / 2, stand: 1, activity: 'Walking to the shelves' },
  { duration: 2.2, x: -1.65, z: -1.5, angle: -2.1, stand: 1, activity: 'Walking to the shelves' },
  { duration: 2, x: -2.55, z: -1.75, angle: -Math.PI / 2, stand: 1, activity: 'Walking to the shelves' },
  { duration: 6, x: -2.55, z: -1.75, angle: -Math.PI, stand: 1, activity: 'Checking a folder' },
  { duration: 3, x: -3.15, z: -0.35, angle: -0.4, stand: 1, activity: 'Walking to the window' },
  { duration: 4, x: -3.15, z: -0.35, angle: -Math.PI / 2, stand: 1, activity: 'Taking a short break' },
  { duration: 3.3, x: -2, z: -1.3, angle: 2.26, stand: 1, activity: 'Returning to the desk' },
  { duration: 2.5, x: -0.85, z: -1.04, angle: 1.35, stand: 1, activity: 'Returning to the desk' },
  { duration: 1.8, x: 0, z: -1.04, angle: Math.PI / 2, stand: 1, activity: 'Returning to the desk' },
  { duration: 1.8, x: 0, z: -1.04, angle: 0, stand: 0, activity: 'Sitting down' },
];
export const OFFICE_ROUTINE_SECONDS = stops.reduce((sum, stop) => sum + stop.duration, 0);
const smooth = (t: number) => t * t * (3 - 2 * t);
export function officeRoutine(seconds: number, reducedMotion = false) {
  let time = reducedMotion ? 0 : ((seconds % OFFICE_ROUTINE_SECONDS) + OFFICE_ROUTINE_SECONDS) % OFFICE_ROUTINE_SECONDS;
  for (let i = 0; i < stops.length; i++) {
    const end = stops[i], start = stops[(i + stops.length - 1) % stops.length];
    if (time <= end.duration) {
      const t = smooth(time / end.duration);
      const turn = Math.atan2(Math.sin(end.angle - start.angle), Math.cos(end.angle - start.angle));
      const moving = start.x !== end.x || start.z !== end.z;
      return { x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t,
        angle: start.angle + turn * smooth(Math.min(1, time / 0.65)), stand: start.stand + (end.stand - start.stand) * t,
        gait: moving ? Math.sin(Math.PI * time / end.duration) : 0, activity: end.activity,
        folder: end.activity === 'Checking a folder' ? Math.sin(Math.PI * time / end.duration) : 0 };
    }
    time -= end.duration;
  }
  throw new Error('Invalid office routine time');
}
