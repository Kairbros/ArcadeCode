// Cielo del SECTOR 09: una cúpula con shader (noche de tormenta con luna de sangre, estrellas que titilan, nubes
// que se mueven, resplandor de incendios en el horizonte y relámpagos) más un anillo de edificios en ruinas que
// asoma por encima de los muros del perímetro. La misma cúpula, sin animar, sirve de mapa de entorno (PMREM)
// para que el metal y los charcos reflejen el cielo.
import * as THREE from "three";
import { glowSprite } from "../../core/three";

export const MOON_DIR = new THREE.Vector3(-0.42, 0.46, -0.78).normalize();

const VERT = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }`;

const FRAG = `
  uniform float uTime;
  uniform float uFlash;
  uniform vec3 uMoon;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 zenith = vec3(0.010, 0.016, 0.040);
    vec3 mid = vec3(0.060, 0.070, 0.105);
    vec3 horizon = vec3(0.30, 0.13, 0.075);
    vec3 col = mix(horizon, mid, smoothstep(-0.04, 0.30, h));
    col = mix(col, zenith, smoothstep(0.22, 0.95, h));
    // Incendios lejanos: el horizonte brilla a manchas.
    float az = atan(d.z, d.x);
    float fire = fbm(vec2(az * 2.4 + 3.0, uTime * 0.04));
    col += vec3(0.62, 0.20, 0.06) * pow(max(0.0, 1.0 - abs(h) * 3.0), 2.2) * (0.25 + fire * 1.5);
    // Estrellas.
    vec3 sp = d * 260.0;
    float rnd = hash(floor(sp));
    float star = step(0.9988, rnd) * (0.55 + 0.45 * sin(uTime * 2.3 + rnd * 80.0)) * smoothstep(0.12, 0.5, h);
    col += vec3(0.8, 0.85, 1.0) * star;
    // Luna de sangre: disco con manchas, halo rojizo.
    float md = dot(d, uMoon);
    float disc = smoothstep(0.9972, 0.9982, md);
    vec2 mp = vec2(dot(d - uMoon * md, normalize(cross(uMoon, vec3(0.0, 1.0, 0.0)))), dot(d - uMoon * md, normalize(cross(cross(uMoon, vec3(0.0, 1.0, 0.0)), uMoon))));
    float maria = fbm(mp * 90.0);
    vec3 moonCol = mix(vec3(0.95, 0.30, 0.14), vec3(0.55, 0.12, 0.08), maria);
    float halo = pow(max(0.0, md), 60.0) * 0.55 + pow(max(0.0, md), 9.0) * 0.12;
    // Nubes: capas que se desplazan y tapan la luna a ratos.
    float cover = 0.0;
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.28);
      float c = fbm(uv * 1.3 + vec2(uTime * 0.014, uTime * 0.007));
      cover = smoothstep(0.44, 0.78, c) * smoothstep(0.0, 0.16, h);
      float lit = pow(max(0.0, md), 4.0);
      vec3 cloud = mix(vec3(0.020, 0.024, 0.036), vec3(0.30, 0.10, 0.09), lit);
      cloud += vec3(0.35, 0.40, 0.60) * uFlash * 0.8;
      col = mix(col, cloud, cover * 0.92);
    }
    col += (moonCol * disc * 2.4 + vec3(0.55, 0.14, 0.10) * halo) * (1.0 - cover * 0.85);
    // Relámpago: todo el cielo se ilumina, más entre las nubes.
    col += vec3(0.50, 0.56, 0.80) * uFlash * (0.35 + 0.8 * fbm(d.xz * 4.0 + uTime * 3.0));
    gl_FragColor = vec4(col, 1.0);
  }`;

export interface Sky {
  dome: THREE.Mesh;
  skyline: THREE.Group;
  uniforms: { uTime: { value: number }; uFlash: { value: number }; uMoon: { value: THREE.Vector3 } };
  update(time: number, flash: number, camX: number, camZ: number): void;
  /** Escena solo con la cúpula, para generar el mapa de entorno. */
  envScene(): THREE.Scene;
  dispose(): void;
}

export function buildSky(): Sky {
  const uniforms = { uTime: { value: 0 }, uFlash: { value: 0 }, uMoon: { value: MOON_DIR.clone() } };
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms, vertexShader: VERT, fragmentShader: FRAG });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 20), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;

  // Ruinas de la ciudad alrededor: cajas oscuras de distinta altura con alguna ventana encendida.
  const skyline = new THREE.Group();
  const seed = (() => {
    let a = 4242;
    return () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
  })();
  const dark = new THREE.MeshBasicMaterial({ color: 0x06080d, fog: false });
  const lit = new THREE.MeshBasicMaterial({ color: 0xffa24a, fog: false, side: THREE.DoubleSide });
  const geoms: THREE.BufferGeometry[] = [];
  const litGeoms: THREE.BufferGeometry[] = [];
  const cx = 0;
  const cz = -9;
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + seed() * 0.08;
    const dist = 64 + seed() * 46;
    const w = 6 + seed() * 14;
    const d = 6 + seed() * 12;
    const h = 14 + seed() * 46;
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx + Math.cos(a) * dist, h / 2 - 1, cz + Math.sin(a) * dist);
    geoms.push(g);
    // Ventanas encendidas (pocas).
    const n = Math.floor(seed() * 4);
    for (let k = 0; k < n; k++) {
      const wg = new THREE.PlaneGeometry(1.1, 1.5);
      const toCenter = Math.atan2(cz - (cz + Math.sin(a) * dist), cx - (cx + Math.cos(a) * dist));
      wg.rotateY(-toCenter + Math.PI / 2);
      wg.translate(cx + Math.cos(a) * (dist - d / 2 - 0.05), 4 + seed() * (h - 6), cz + Math.sin(a) * (dist - d / 2 - 0.05));
      litGeoms.push(wg);
    }
  }
  const merge = (list: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    const out = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (const g of list) {
      const ng = g.index ? g.toNonIndexed() : g;
      const p = ng.attributes.position;
      for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
      ng.dispose();
      g.dispose();
    }
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return out;
  };
  const city = new THREE.Mesh(merge(geoms), dark);
  city.frustumCulled = false;
  skyline.add(city);
  if (litGeoms.length) {
    const windows = new THREE.Mesh(merge(litGeoms), lit);

    windows.frustumCulled = false;
    skyline.add(windows);
  }
  // Resplandor de incendios detrás de los edificios.
  const fires: THREE.Sprite[] = [];
  for (let i = 0; i < 7; i++) {
    const a = seed() * Math.PI * 2;
    const sp = glowSprite(0xff6a1a, 46 + seed() * 30, 0.5);
    (sp.material as THREE.SpriteMaterial).fog = false;
    sp.position.set(cx + Math.cos(a) * 105, 8 + seed() * 14, cz + Math.sin(a) * 105);
    skyline.add(sp);
    fires.push(sp);
  }

  let envSkyScene: THREE.Scene | null = null;
  return {
    dome,
    skyline,
    uniforms,
    update(time, flash, camX, camZ) {
      uniforms.uTime.value = time;
      uniforms.uFlash.value = flash;
      // La cúpula sigue a la cámara para que parezca infinita.
      dome.position.set(camX, 0, camZ);
      fires.forEach((f, i) => {
        (f.material as THREE.SpriteMaterial).opacity = 0.32 + Math.sin(time * 0.9 + i * 2.1) * 0.12 + Math.sin(time * 3.7 + i) * 0.05 + flash * 0.2;
      });
    },
    envScene() {
      if (!envSkyScene) {
        envSkyScene = new THREE.Scene();
        const m = new THREE.Mesh(dome.geometry, new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uTime: { value: 7 }, uFlash: { value: 0 }, uMoon: { value: MOON_DIR.clone() } }, vertexShader: VERT, fragmentShader: FRAG }));
        envSkyScene.add(m);
      }
      return envSkyScene;
    },
    dispose() {
      dome.geometry.dispose();
      mat.dispose();
      city.geometry.dispose();
      dark.dispose();
      lit.dispose();
      skyline.children.forEach((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      if (envSkyScene) {
        envSkyScene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) (m.material as THREE.Material).dispose();
        });
      }
    },
  };
}
