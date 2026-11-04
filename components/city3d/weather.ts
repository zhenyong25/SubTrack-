import * as THREE from 'three';

export type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'thunderstorm';
export type WeatherChoice = WeatherKind | 'auto';
export const WEATHER_LABELS: Record<WeatherChoice, string> = { auto: 'Automatic', sunny: 'Sunny', cloudy: 'Cloudy', rain: 'Rain', thunderstorm: 'Thunderstorm' };
const CYCLE: Array<[WeatherKind, number]> = [['sunny', 70], ['cloudy', 45], ['rain', 65], ['thunderstorm', 40], ['cloudy', 35]];
const COVER: Record<WeatherKind, number> = { sunny: 0.08, cloudy: 0.65, rain: 0.8, thunderstorm: 1 };
const RAIN: Record<WeatherKind, number> = { sunny: 0, cloudy: 0, rain: 0.65, thunderstorm: 1 };

// Local simulated weather. It uses a simulation clock, so a paused/backgrounded city does
// not suddenly skip through a storm. No real-weather API or saved-city changes are needed.
export class CityWeather {
  choice: WeatherChoice = 'auto';
  kind: WeatherKind = 'sunny';
  seconds = 0; cover = 0.08; rain = 0; flash = 0;
  private cycle = 0; private phaseSeconds = 0; private stormSeconds = 0; private nextLightning = 18;
  private clouds: THREE.InstancedMesh;
  private cloudMaterial = new THREE.MeshStandardMaterial({ color: '#e6e9eb', transparent: true, opacity: 0.6, roughness: 1, depthWrite: false });
  private drops: THREE.LineSegments;
  private rainMaterial = new THREE.LineBasicMaterial({ color: '#adcbdf', transparent: true, opacity: 0, depthWrite: false });
  private bolt: THREE.Line;
  private boltMaterial = new THREE.LineBasicMaterial({ color: '#d9e9ff', transparent: true, opacity: 0, depthWrite: false });
  private randomSeed = 41;
  private random() { this.randomSeed = Math.imul(this.randomSeed, 1664525) + 1013904223 | 0; return (this.randomSeed >>> 0) / 4294967296; }
  private seeds: number[];
  get speed() { return 1 - this.rain * 0.45; }
  get risk() { return 1 + this.rain * 2; }
  get cloudCount() { return this.clouds.count; }
  get rainCount() { return this.drops.geometry.drawRange.count / 2; }
  constructor(scene: THREE.Scene) {
    this.seeds = Array.from({ length: 2400 * 3 }, () => this.random());
    this.clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.cloudMaterial, 64);
    this.clouds.name = 'city-weather-clouds'; this.clouds.frustumCulled = false;
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2400 * 6), 3)); geometry.setDrawRange(0, 0);
    this.drops = new THREE.LineSegments(geometry, this.rainMaterial); this.drops.name = 'city-weather-rain'; this.drops.frustumCulled = false;
    this.bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 8 }, () => new THREE.Vector3())), this.boltMaterial);
    this.bolt.name = 'city-weather-lightning'; this.bolt.frustumCulled = false;
    scene.add(this.clouds, this.drops, this.bolt);
  }
  setChoice(choice: WeatherChoice) {
    if (this.choice === choice) return;
    this.choice = choice; this.phaseSeconds = 0; this.stormSeconds = 0; this.nextLightning = 18; this.flash = 0;
    if (choice === 'auto') { this.cycle = 0; this.kind = CYCLE[0][0]; } else this.kind = choice;
  }
  update(dt: number, motion: boolean, target: THREE.Vector3, night: boolean) {
    if (motion) {
      this.seconds += dt; this.phaseSeconds += dt;
      if (this.choice === 'auto' && this.phaseSeconds >= CYCLE[this.cycle][1]) { this.phaseSeconds = 0; this.cycle = (this.cycle + 1) % CYCLE.length; this.kind = CYCLE[this.cycle][0]; }
      const blend = 1 - Math.exp(-dt * 0.8);
      this.cover += (COVER[this.kind] - this.cover) * blend; this.rain += (RAIN[this.kind] - this.rain) * blend;
      this.flash = Math.max(0, this.flash - dt * 3);
      if (this.kind === 'thunderstorm') {
        this.stormSeconds += dt;
        if (this.stormSeconds >= this.nextLightning) {
          this.flash = 0.65; this.nextLightning = this.stormSeconds + 19 + this.random() * 12;
          const positions = this.bolt.geometry.getAttribute('position') as THREE.BufferAttribute, x = target.x + 8 + this.random() * 8, z = target.z - 8;
          for (let i = 0; i < 8; i++) positions.setXYZ(i, x + (i % 2 ? 0.6 : -0.4), 13 - i * 1.2, z + this.random() * 0.5);
          positions.needsUpdate = true;
        }
      } else this.stormSeconds = 0;
    } else {
      // Reduced motion gives a static weather scene without flashes or moving streaks.
      this.cover = COVER[this.kind]; this.rain = RAIN[this.kind]; this.flash = 0;
    }
    this.cloudMaterial.color.set(night ? '#566277' : this.kind === 'thunderstorm' ? '#6d7b88' : '#d3dce3');
    this.cloudMaterial.opacity = 0.35 + this.cover * 0.55;
    this.clouds.count = Math.round(8 + this.cover * 56);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < this.clouds.count; i++) {
      const seed = this.seeds[i], drift = (this.seconds * (this.rain > 0.1 ? 0.28 : 0.1) + seed * 72) % 72 - 36;
      matrix.compose(new THREE.Vector3(Math.floor(target.x / 30) * 30 + drift, 9 + this.seeds[i + 64] * 3, Math.floor(target.z / 30) * 30 + this.seeds[i + 128] * 72 - 36), q, new THREE.Vector3(3 + seed * 3, 0.7 + seed * 0.5, 1.8 + seed * 2));
      this.clouds.setMatrixAt(i, matrix);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    const drops = Math.round(this.rain * 2400), positions = this.drops.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < drops; i++) {
      const x = target.x + this.seeds[i * 3] * 36 - 18, z = target.z + this.seeds[i * 3 + 1] * 36 - 18, y = (this.seeds[i * 3 + 2] * 14 - this.seconds * (this.kind === 'thunderstorm' ? 10 : 7)) % 14;
      const height = (y + 14) % 14;
      positions.setXYZ(i * 2, x, height, z); positions.setXYZ(i * 2 + 1, x + this.rain * 0.07, height - 0.22, z + 0.025);
    }
    positions.needsUpdate = true; this.drops.geometry.setDrawRange(0, drops * 2);
    this.rainMaterial.opacity = night ? 0.35 : 0.55;
    this.boltMaterial.opacity = this.flash;
  }
  dispose() {
    for (const mesh of [this.clouds, this.drops, this.bolt]) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    this.clouds.dispose(); this.cloudMaterial.dispose(); this.rainMaterial.dispose(); this.boltMaterial.dispose();
  }
}
