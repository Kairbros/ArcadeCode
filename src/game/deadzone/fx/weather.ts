// Clima de la noche: ceniza y brasas flotando, bancos de niebla a ras de suelo y relámpagos con su trueno. Ya no
// llueve (petición del usuario: se quitó la lluvia; el shader y el reparto de gotas se eliminaron).
// Todo es barato: unas pocas llamadas de dibujo y cero trabajo de CPU por partícula.
import * as THREE from "three";

const ASH = 260;

const ASH_VERT = `
  attribute vec3 seed;
  attribute float kind;
  uniform float uTime;
  uniform vec3 uCam;
  uniform float uScale;
  varying vec4 vC;
  void main() {
    vec3 size = vec3(34.0, 12.0, 34.0);
    vec3 drift = vec3(0.35 + sin(uTime * 0.3 + seed.x * 20.0) * 0.4, -0.35 - kind * 0.4, 0.15 + cos(uTime * 0.27 + seed.z * 20.0) * 0.35);
    vec3 p = mod(seed * size + drift * uTime - uCam, size) + uCam - size * 0.5;
    p.y = mod(seed.y * size.y + drift.y * uTime, size.y);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float s = mix(0.035, 0.06, seed.x);
    gl_PointSize = s * uScale / max(0.1, -mv.z);
    vec3 col = mix(vec3(0.55, 0.55, 0.58), vec3(1.0, 0.45, 0.12), kind);
    float tw = 0.5 + 0.5 * sin(uTime * 4.0 + seed.y * 90.0);
    vC = vec4(col, mix(0.32, 0.85 * tw, kind) * (1.0 - smoothstep(10.0, 17.0, length(p - uCam))));
  }`;

const ASH_FRAG = `
  varying vec4 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0 || vC.a < 0.01) discard;
    gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(1.0, 0.3, d));
  }`;

const MIST_VERT = `
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const MIST_FRAG = `
  uniform float uTime;
  uniform vec3 uCam;
  uniform vec3 uColor;
  uniform float uFlash;
  uniform float uDir;
  uniform float uOpacity;
  varying vec3 vW;
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.05 + 9.7; a *= 0.5; } return s; }
  void main() {
    vec2 uv = vW.xz * 0.085 + vec2(uTime * 0.012 * uDir, uTime * 0.007);
    float n = fbm(uv);
    float a = smoothstep(0.38, 0.8, n);
    float d = length(vW.xz - uCam.xz);
    float fade = smoothstep(1.2, 5.0, d) * (1.0 - smoothstep(26.0, 44.0, d));
    gl_FragColor = vec4(uColor + uFlash * 0.5, a * fade * uOpacity);
  }`;

export interface WeatherHooks {
  /** Retumbar del trueno (retraso en s) para el audio. */
  thunder?: (delay: number) => void;
}

export class Weather {
  readonly group = new THREE.Group();
  /** Relámpago actual (0..1): lo leen el cielo, la luz de la luna y la niebla. */
  flash = 0;
  private nextBolt = 8 + Math.random() * 10;
  private bolt = 0;
  private pulses = 0;
  private readonly ashU: Record<string, THREE.IUniform>;
  private readonly mists: THREE.ShaderMaterial[] = [];
  private readonly disposables: { dispose(): void }[] = [];

  constructor(private readonly hooks: WeatherHooks = {}) {
    // Ceniza y brasas.
    const aSeed = new Float32Array(ASH * 3);
    const aKind = new Float32Array(ASH);
    for (let i = 0; i < ASH; i++) {
      aSeed.set([Math.random(), Math.random(), Math.random()], i * 3);
      aKind[i] = Math.random() < 0.18 ? 1 : 0;
    }
    const ashGeo = new THREE.BufferGeometry();
    ashGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ASH * 3), 3));
    ashGeo.setAttribute("seed", new THREE.BufferAttribute(aSeed, 3));
    ashGeo.setAttribute("kind", new THREE.BufferAttribute(aKind, 1));
    this.ashU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 700 } };
    const ashMat = new THREE.ShaderMaterial({ uniforms: this.ashU, vertexShader: ASH_VERT, fragmentShader: ASH_FRAG, transparent: true, depthWrite: false, fog: false, blending: THREE.NormalBlending });
    const ash = new THREE.Points(ashGeo, ashMat);
    ash.frustumCulled = false;
    ash.renderOrder = 5;
    this.group.add(ash);
    this.disposables.push(ashGeo, ashMat);

    // Bancos de niebla: tres capas planas a distintas alturas con ruido que se desplaza.
    const planeGeo = new THREE.PlaneGeometry(130, 130);
    this.disposables.push(planeGeo);
    [[0.3, 1, 0.5], [0.75, -1, 0.34], [1.25, 1, 0.22]].forEach(([y, dir, op]) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uCam: { value: new THREE.Vector3() },
          uColor: { value: new THREE.Color(0.2, 0.23, 0.29) },
          uFlash: { value: 0 },
          uDir: { value: dir },
          uOpacity: { value: op },
        },
        vertexShader: MIST_VERT,
        fragmentShader: MIST_FRAG,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(planeGeo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, y, -9);
      m.frustumCulled = false;
      m.renderOrder = 1;
      this.group.add(m);
      this.mists.push(mat);
      this.disposables.push(mat);
    });
  }

  /** Alto del buffer (px) y campo de visión, para el tamaño de la ceniza. */
  setView(pixelH: number, fov: number): void {
    this.ashU.uScale.value = pixelH / (2 * Math.tan((fov * Math.PI) / 360));
  }

  update(dt: number, time: number, cam: THREE.Vector3): void {
    this.ashU.uTime.value = time;
    (this.ashU.uCam.value as THREE.Vector3).copy(cam);
    for (const m of this.mists) {
      m.uniforms.uTime.value = time;
      m.uniforms.uCam.value.copy(cam);
      m.uniforms.uFlash.value = this.flash;
    }
    // Relámpagos: de vez en cuando uno doble, con el trueno un instante después.
    this.nextBolt -= dt;
    if (this.nextBolt <= 0 && this.pulses <= 0) {
      this.pulses = 2 + Math.floor(Math.random() * 2);
      this.bolt = 0;
      this.nextBolt = 14 + Math.random() * 26;
      this.hooks.thunder?.(0.25 + Math.random() * 1.6);
    }
    if (this.pulses > 0) {
      this.bolt += dt;
      const k = this.bolt * 14;
      const phase = Math.floor(k);
      const f = k - phase;
      this.flash = Math.max(0, (phase % 2 === 0 ? 1 - f : 0.25 * (1 - f)) * (1 - this.bolt * 0.35));
      if (this.bolt > this.pulses * 0.13 + 0.2) {
        this.pulses = 0;
        this.flash = 0;
      }
    } else this.flash = Math.max(0, this.flash - dt * 6);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
