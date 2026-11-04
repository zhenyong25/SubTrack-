import * as THREE from 'three';

export const BILLBOARD_TYPES = new Set(['shop', 'office', 'cinema', 'departmentstore', 'citymall', 'electronicsstore', 'metropolisspire', 'skyhotel']);
export interface BillboardPlace { id: string; type: string; center: THREE.Vector3; rotation: number; size: number; height: number }
interface Screen { x: number; y: number; z: number; width: number; height: number; turn: number; roof: boolean }

// Coordinates are relative to the plot; roof signs use the actual upgraded model height.
export function billboardLayout(p: BillboardPlace): Screen[] {
  if (!BILLBOARD_TYPES.has(p.type)) return [];
  if (p.type === 'metropolisspire') return [
    { x: 0, y: 0.39, z: 0.275, width: 0.58, height: 0.35, turn: 0, roof: false },
    { x: 0.34, y: 0.39, z: 0, width: 0.46, height: 0.35, turn: Math.PI / 2, roof: false },
    { x: 0, y: 0.87, z: 0.22, width: 0.42, height: 0.38, turn: 0, roof: false },
  ];
  if (p.type === 'skyhotel') return [{ x: -0.12, y: 0.78, z: 0.155, width: 0.43, height: 0.6, turn: 0, roof: false }];
  return [{ x: 0, y: p.height / p.size + 0.2, z: 0.2, width: p.type === 'shop' ? 0.72 : 0.78, height: 0.32, turn: 0, roof: true }];
}

function posterAtlas(): THREE.Texture {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const posters = [
    ['#281550', '#ff6dcc', 'CITY', 'LIGHTS', 'YOUR CITY. YOUR NIGHT.'],
    ['#083d58', '#5ce7df', 'GO', 'EXPLORE', 'A LITTLE ADVENTURE, EVERY DAY'],
    ['#eb633a', '#ffe59b', 'FRESH', 'LOCAL', 'FROM OUR FARMS TO YOUR TABLE'],
    ['#182b77', '#acb8ff', 'TONIGHT', 'LIVE', 'MUSIC • FILM • GOOD COMPANY'],
  ];
  posters.forEach(([bg, accent, first, second, caption], i) => {
    ctx.save(); ctx.translate(0, i * 256);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = accent; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(464, 90, 77, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(464, 90, 102, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = accent; ctx.font = '900 58px sans-serif'; ctx.fillText(first, 24, 76);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 74px sans-serif'; ctx.fillText(second, 22, 148);
    ctx.fillStyle = accent; ctx.font = 'bold 15px sans-serif'; ctx.fillText(caption, 25, 181);
    ctx.fillStyle = '#080e20'; ctx.fillRect(0, 212, 512, 44);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('MY CITY  •  DISCOVER SOMETHING NEW  •', 12, 241);
    ctx.restore();
  });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  return texture;
}

// One shared poster atlas and three instanced meshes for the entire city's signs. Animation
// happens in the shader: no canvas uploads or new materials during the animation loop.
export class DigitalBillboards {
  readonly screens: THREE.InstancedMesh;
  private frames: THREE.InstancedMesh;
  private posts: THREE.InstancedMesh;
  private atlas: THREE.Texture;
  private seconds = 0;
  private material: THREE.ShaderMaterial;
  private frameMaterial = new THREE.MeshStandardMaterial({ color: '#1a2130', roughness: 0.5, metalness: 0.5 });
  get count() { return this.screens.count; }
  get clock() { return this.seconds; }
  constructor(scene: THREE.Scene, textureFactory = posterAtlas) {
    this.atlas = textureFactory();
    this.material = new THREE.ShaderMaterial({
      uniforms: { atlas: { value: this.atlas }, clock: { value: 0 }, brightness: { value: 0.95 } },
      vertexShader: `attribute float channel; varying vec2 screenUv; varying float screenChannel;
        void main() { screenUv = uv; screenChannel = channel; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform sampler2D atlas; uniform float clock; uniform float brightness;
        varying vec2 screenUv; varying float screenChannel;
        void main() { vec2 uv = screenUv; float panel = mod(floor(clock / 8.) + screenChannel, 4.);
          if (uv.y < .17) uv.x = fract(uv.x + clock * .055);
          vec3 color = texture2D(atlas, vec2(uv.x, (uv.y + panel) / 4.)).rgb;
          float scan = .97 + .03 * sin(screenUv.y * 640.);
          gl_FragColor = vec4(color * brightness * scan, 1.);
          #include <colorspace_fragment>
        }`,
      toneMapped: false,
    });
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.setAttribute('channel', new THREE.InstancedBufferAttribute(new Float32Array(256), 1));
    this.screens = new THREE.InstancedMesh(plane, this.material, 256);
    this.frames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.frameMaterial, 256);
    this.posts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.frameMaterial, 512);
    for (const [mesh, name] of [[this.screens, 'city-digital-screens'], [this.frames, 'city-billboard-frames'], [this.posts, 'city-billboard-posts']] as const) {
      mesh.name = name; mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh);
    }
    this.frames.castShadow = true; this.posts.castShadow = true;
  }
  setPlaces(places: BillboardPlace[]) {
    let count = 0, posts = 0;
    const channel = this.screens.geometry.getAttribute('channel') as THREE.InstancedBufferAttribute;
    for (const p of places) for (const s of billboardLayout(p)) {
      if (count >= 256) break;
      const root = new THREE.Matrix4().compose(p.center, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotation), new THREE.Vector3(p.size, p.size, p.size));
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.turn);
      const local = new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.width + 0.025, s.height + 0.025, 0.025));
      this.frames.setMatrixAt(count, root.clone().multiply(local));
      local.compose(new THREE.Vector3(s.x + Math.sin(s.turn) * 0.014, s.y, s.z + Math.cos(s.turn) * 0.014), q, new THREE.Vector3(s.width, s.height, 1));
      this.screens.setMatrixAt(count, root.clone().multiply(local));
      channel.setX(count, [...p.id].reduce((sum, c) => sum + c.charCodeAt(0), count) % 4); count++;
      if (s.roof) for (const side of [-1, 1]) {
        local.compose(new THREE.Vector3(s.x + side * s.width * 0.36, p.height / p.size + 0.05, s.z), new THREE.Quaternion(), new THREE.Vector3(0.015, 0.1, 0.018));
        this.posts.setMatrixAt(posts++, root.clone().multiply(local));
      }
    }
    this.screens.count = this.frames.count = count; this.posts.count = posts;
    for (const mesh of [this.screens, this.frames, this.posts]) mesh.instanceMatrix.needsUpdate = true;
    channel.needsUpdate = true;
  }
  update(dt: number, motion: boolean, night: boolean) {
    if (motion) this.seconds += dt;
    this.material.uniforms.clock.value = this.seconds;
    this.material.uniforms.brightness.value = night ? 1.2 : 0.95;
  }
  dispose() {
    for (const mesh of [this.screens, this.frames, this.posts]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
    this.atlas.dispose(); this.material.dispose(); this.frameMaterial.dispose();
  }
}
