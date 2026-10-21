// Partículas en la GPU: una nube de puntos con tamaño y color por partícula que se simula en la CPU (cientos, no
// miles). Dos capas: aditiva (chispas, fuego, brasas, fogonazos) y de mezcla normal (sangre, humo, polvo). El
// tamaño va en metros y se proyecta en el vertex shader, así que las partículas se hacen pequeñas con la distancia.
import * as THREE from "three";

export interface Emit {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  /** Tamaño inicial y final (m). */
  s0: number;
  s1: number;
  /** Color y opacidad inicial; la opacidad baja a 0 durante la vida. */
  r: number;
  g: number;
  b: number;
  a?: number;
  /** Gravedad (m/s², positiva cae) y rozamiento con el aire (1/s). */
  gravity?: number;
  drag?: number;
  /** Al tocar el suelo muere y avisa (gotas de sangre). */
  ground?: boolean;
}

const VERT = `
  attribute float size;
  attribute vec4 color;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(0.0, size * uScale / max(0.1, -mv.z));
  }`;

const FRAG = `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = smoothstep(1.0, 0.25, d);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }`;

class Layer {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly rgba0: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly ground: Uint8Array;
  private cursor = 0;
  readonly uniforms = { uScale: { value: 700 } };

  constructor(private readonly cap: number, additive: boolean) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.rgba0 = new Float32Array(cap * 4);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.ground = new Uint8Array(cap);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
  }

  emit(e: Emit): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    this.pos[i * 3] = e.x;
    this.pos[i * 3 + 1] = e.y;
    this.pos[i * 3 + 2] = e.z;
    this.vel[i * 3] = e.vx ?? 0;
    this.vel[i * 3 + 1] = e.vy ?? 0;
    this.vel[i * 3 + 2] = e.vz ?? 0;
    this.life[i] = e.life;
    this.max[i] = e.life;
    this.s0[i] = e.s0;
    this.s1[i] = e.s1;
    this.rgba0[i * 4] = e.r;
    this.rgba0[i * 4 + 1] = e.g;
    this.rgba0[i * 4 + 2] = e.b;
    this.rgba0[i * 4 + 3] = e.a ?? 1;
    this.grav[i] = e.gravity ?? 0;
    this.drag[i] = e.drag ?? 0;
    this.ground[i] = e.ground ? 1 : 0;
  }

  /** Avanza; `onGround(x, z)` se llama con las gotas que tocan el suelo. */
  update(dt: number, onGround?: (x: number, z: number) => void): void {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      const k = 1 - this.life[i] / this.max[i];
      const drag = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.ground[i] && this.pos[i * 3 + 1] <= 0.03) {
        onGround?.(this.pos[i * 3], this.pos[i * 3 + 2]);
        this.life[i] = 0;
        this.size[i] = 0;
        continue;
      }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.col[i * 4] = this.rgba0[i * 4];
      this.col[i * 4 + 1] = this.rgba0[i * 4 + 1];
      this.col[i * 4 + 2] = this.rgba0[i * 4 + 2];
      // Entra rápido y se desvanece despacio.
      this.col[i * 4 + 3] = this.rgba0[i * 4 + 3] * Math.min(1, k * 12) * (1 - k * k);
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.size.fill(0);
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.removeFromParent();
  }
}

export class Particles {
  readonly add = new Layer(520, true);
  readonly mix = new Layer(900, false);

  constructor(scene: THREE.Object3D) {
    scene.add(this.add.points, this.mix.points);
  }

  /** `pixelH`: alto del buffer en píxeles; `fov`: grados. Calcula la escala de punto. */
  setView(pixelH: number, fov: number): void {
    const s = pixelH / (2 * Math.tan((fov * Math.PI) / 360));
    this.add.uniforms.uScale.value = s;
    this.mix.uniforms.uScale.value = s;
  }

  update(dt: number, onGround?: (x: number, z: number) => void): void {
    this.add.update(dt);
    this.mix.update(dt, onGround);
  }

  clear(): void {
    this.add.clear();
    this.mix.clear();
  }

  dispose(): void {
    this.add.dispose();
    this.mix.dispose();
  }
}
