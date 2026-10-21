// Calcomanías del sector: sangre, manos, arañazos, pintadas en las paredes y marcas de la calzada. Las texturas se
// pintan en canvas con semilla fija. `DecalPool` reparte manchas nuevas (sangre de los impactos y de los zombis
// caídos) en unas pocas mallas instanciadas: coste fijo por mucha sangre que haya.
import * as THREE from "three";

type R = () => number;

function seeded(seed: number): R {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h = w): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas 2d no disponible");
  return { c, g };
}

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, THREE.CanvasTexture>();
const memo = (key: string, make: () => THREE.CanvasTexture) => {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
};

/** Mancha de sangre: charco central irregular y salpicaduras que salen en rayos. */
export function bloodTexture(variant: number): THREE.CanvasTexture {
  return memo(`blood${variant}`, () => {
    const r = seeded(900 + variant * 31);
    const { c, g } = canvas(256);
    g.translate(128, 128);
    const core = 30 + r() * 24;
    // Charco: varios óvalos superpuestos.
    for (let i = 0; i < 7; i++) {
      g.fillStyle = `rgba(${70 + r() * 30},4,6,${0.55 + r() * 0.3})`;
      g.beginPath();
      g.ellipse((r() - 0.5) * 34, (r() - 0.5) * 34, core * (0.5 + r() * 0.6), core * (0.4 + r() * 0.6), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // Rayos con gotas que se hacen más pequeñas.
    const rays = 9 + Math.floor(r() * 8);
    for (let i = 0; i < rays; i++) {
      const a = r() * Math.PI * 2;
      const len = 40 + r() * 80;
      const n = 3 + Math.floor(r() * 5);
      for (let k = 0; k < n; k++) {
        const d = core * 0.8 + (len * (k + r() * 0.6)) / n;
        const rad = Math.max(1.2, (1 - k / n) * (2 + r() * 5));
        g.fillStyle = `rgba(${80 + r() * 40},5,8,${0.6 + r() * 0.35})`;
        g.beginPath();
        g.arc(Math.cos(a) * d, Math.sin(a) * d, rad, 0, Math.PI * 2);
        g.fill();
      }
      // Estela entre el charco y la primera gota.
      g.strokeStyle = "rgba(70,4,6,0.55)";
      g.lineWidth = 1.5 + r() * 2.5;
      g.beginPath();
      g.moveTo(Math.cos(a) * core * 0.6, Math.sin(a) * core * 0.6);
      g.lineTo(Math.cos(a) * (core + len * 0.35), Math.sin(a) * (core + len * 0.35));
      g.stroke();
    }
    // Brillo húmedo.
    g.fillStyle = "rgba(255,120,110,0.22)";
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse((r() - 0.5) * core, (r() - 0.5) * core, 3 + r() * 6, 2 + r() * 3, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    return tex(c);
  });
}

/** Mano ensangrentada apoyada en la pared. */
export function handTexture(): THREE.CanvasTexture {
  return memo("hand", () => {
    const r = seeded(77);
    const { c, g } = canvas(128);
    g.translate(64, 76);
    g.fillStyle = "rgba(110,8,10,0.85)";
    g.beginPath();
    g.ellipse(0, 6, 24, 28, 0, 0, Math.PI * 2);
    g.fill();
    for (const [a, l] of [[-0.85, 40], [-0.4, 48], [0, 52], [0.4, 46], [1.05, 32]] as const) {
      g.save();
      g.rotate(a);
      g.beginPath();
      g.roundRect(-5, -l - 14, 10, l, 5);
      g.fill();
      g.restore();
    }
    // Goterones.
    for (let i = 0; i < 10; i++) {
      const x = (r() - 0.5) * 50;
      g.fillStyle = "rgba(100,6,8,0.7)";
      g.fillRect(x, 24, 2 + r() * 2, 8 + r() * 30);
    }
    return tex(c);
  });
}

/** Cuatro arañazos paralelos. */
export function clawTexture(): THREE.CanvasTexture {
  return memo("claw", () => {
    const r = seeded(91);
    const { c, g } = canvas(128);
    g.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = `rgba(12,10,10,${0.7 + r() * 0.25})`;
      g.lineWidth = 3.5 - i * 0.3;
      g.beginPath();
      g.moveTo(22 + i * 24, 8 + r() * 8);
      g.bezierCurveTo(30 + i * 24 + r() * 10, 44, 18 + i * 24 + r() * 14, 84, 28 + i * 24, 120);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.1)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(24 + i * 24, 10);
      g.lineTo(30 + i * 24, 118);
      g.stroke();
    }
    return tex(c);
  });
}

/** Pintada de pared (rojo de bote de spray con chorretones o blanco de tiza). */
export function graffitiTexture(text: string, color = "#c4161c", arrow: "" | "left" | "right" = ""): THREE.CanvasTexture {
  return memo(`txt:${text}:${color}:${arrow}`, () => {
    const r = seeded(text.length * 131 + (color.charCodeAt(1) || 7));
    const w = 512;
    const h = 128;
    const { c, g } = canvas(w, h);
    g.font = "bold 74px 'Courier New', monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    // Ajusta el tamaño al ancho disponible.
    let size = 74;
    while (g.measureText(text).width > w - 40 && size > 20) {
      size -= 4;
      g.font = `bold ${size}px 'Courier New', monospace`;
    }
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate((r() - 0.5) * 0.06);
    g.shadowColor = color;
    g.shadowBlur = 6;
    g.fillStyle = color;
    g.fillText(text, 0, 0);
    g.shadowBlur = 0;
    g.restore();
    // Chorretones bajo las letras.
    const tw = Math.min(w - 40, g.measureText(text).width);
    for (let i = 0; i < 12; i++) {
      const x = w / 2 - tw / 2 + r() * tw;
      const len = 10 + r() * 42;
      const grad = g.createLinearGradient(0, h / 2 + 8, 0, h / 2 + 8 + len);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(x, h / 2 + 8, 2 + r() * 2, len);
    }
    if (arrow) {
      g.strokeStyle = color;
      g.lineWidth = 7;
      g.lineCap = "round";
      const dir = arrow === "left" ? -1 : 1;
      g.beginPath();
      g.moveTo(w / 2 + dir * -tw / 2 - dir * 6, 108);
      g.lineTo(w / 2 + dir * tw / 2, 108);
      g.moveTo(w / 2 + dir * tw / 2 - dir * 14, 98);
      g.lineTo(w / 2 + dir * tw / 2, 108);
      g.lineTo(w / 2 + dir * tw / 2 - dir * 14, 118);
      g.stroke();
    }
    return tex(c);
  });
}

/** Agujero de bala: círculo oscuro con borde levantado. */
export function holeTexture(): THREE.CanvasTexture {
  return memo("hole", () => {
    const { c, g } = canvas(64);
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(0,0,0,0.95)");
    grad.addColorStop(0.28, "rgba(6,6,8,0.9)");
    grad.addColorStop(0.45, "rgba(40,38,36,0.45)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return tex(c);
  });
}

/** Línea discontinua de la calzada. */
export function dashTexture(color = "#d8b640"): THREE.CanvasTexture {
  return memo(`dash${color}`, () => {
    const r = seeded(5);
    const { c, g } = canvas(32, 256);
    g.fillStyle = color;
    g.fillRect(8, 0, 16, 150);
    // Desgaste.
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.7})`;
      g.fillRect(r() * 32, r() * 256, 1 + r() * 4, 1 + r() * 5);
    }
    const t = tex(c);
    t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Charco: ovalo oscuro y brillante. */
export function puddleTexture(): THREE.CanvasTexture {
  return memo("puddle", () => {
    const r = seeded(321);
    const { c, g } = canvas(128);
    g.translate(64, 64);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.beginPath();
      g.ellipse(Math.cos(a) * 18, Math.sin(a) * 14, 26 + r() * 12, 22 + r() * 10, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    const t = tex(c);
    return t;
  });
}

export function disposeDecalTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

/**
 * Manchas dinámicas: cuatro mallas instanciadas (una por variante) con un anillo de huecos. Cada mancha nueva
 * pisa a la más vieja. Se pone en el suelo o en una pared según la normal.
 */
export class DecalPool {
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly next: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 0, 1);
  private readonly col = new THREE.Color();
  private holes: THREE.InstancedMesh | null = null;
  private holeNext = 0;
  private static readonly HOLES = 90;

  constructor(scene: THREE.Object3D, private readonly perVariant = 36, variants = 4) {
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let v = 0; v < variants; v++) {
      const mat = new THREE.MeshStandardMaterial({
        map: bloodTexture(v),
        transparent: true,
        depthWrite: false,
        roughness: 0.25,
        metalness: 0.1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, perVariant);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      // Ocultas al principio: escala 0.
      this.m.makeScale(0, 0, 0);
      for (let i = 0; i < perVariant; i++) mesh.setMatrixAt(i, this.m);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.meshes.push(mesh);
      this.next.push(0);
    }
    const holeMat = new THREE.MeshStandardMaterial({
      map: holeTexture(),
      transparent: true,
      depthWrite: false,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.holes = new THREE.InstancedMesh(geo, holeMat, DecalPool.HOLES);
    this.holes.frustumCulled = false;
    this.holes.renderOrder = 2;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < DecalPool.HOLES; i++) this.holes.setMatrixAt(i, this.m);
    this.holes.instanceMatrix.needsUpdate = true;
    scene.add(this.holes);
  }

  /** Agujero de bala (0,1 m) sobre una superficie. */
  hole(at: THREE.Vector3, normal: THREE.Vector3, size = 0.11): void {
    const mesh = this.holes;
    if (!mesh) return;
    const i = this.holeNext;
    this.holeNext = (i + 1) % DecalPool.HOLES;
    this.n.copy(normal).normalize();
    this.q.setFromUnitVectors(this.up, this.n);
    this.p.copy(at).addScaledVector(this.n, 0.014);
    this.s.set(size, size, 1);
    this.m.compose(this.p, this.q, this.s);
    mesh.setMatrixAt(i, this.m);
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Mancha en `at` sobre una superficie de normal `normal`, de `size` metros. */
  splat(at: THREE.Vector3, normal: THREE.Vector3, size: number, tint = 1): void {
    const v = Math.floor(Math.random() * this.meshes.length);
    const mesh = this.meshes[v];
    const i = this.next[v];
    this.next[v] = (i + 1) % this.perVariant;
    this.n.copy(normal).normalize();
    this.q.setFromUnitVectors(this.up, this.n);
    // Giro aleatorio sobre la normal.
    this.e.set(0, 0, Math.random() * Math.PI * 2);
    const spin = new THREE.Quaternion().setFromEuler(this.e);
    this.q.multiply(spin);
    this.p.copy(at).addScaledVector(this.n, 0.012 + (i % 5) * 0.0015);
    this.s.set(size, size, 1);
    this.m.compose(this.p, this.q, this.s);
    mesh.setMatrixAt(i, this.m);
    mesh.instanceMatrix.needsUpdate = true;
    // Sangre vieja más oscura.
    this.col.setScalar(tint);
    mesh.setColorAt(i, this.col);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.m.makeScale(0, 0, 0);
    if (this.holes) {
      for (let i = 0; i < DecalPool.HOLES; i++) this.holes.setMatrixAt(i, this.m);
      this.holes.instanceMatrix.needsUpdate = true;
      this.holeNext = 0;
    }
    for (const mesh of this.meshes) {
      for (let i = 0; i < this.perVariant; i++) mesh.setMatrixAt(i, this.m);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.next.fill(0);
  }

  dispose(): void {
    for (const m of [...this.meshes, ...(this.holes ? [this.holes] : [])]) {
      m.removeFromParent();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    this.meshes[0]?.geometry.dispose();
  }
}
