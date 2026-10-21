// Modelos 3D de Karts, de formas redondeadas (cápsulas, cilindros y esferas con sombreado suave) en vez de
// cajas: karts brillantes con ruedas, árboles y arbustos esponjosos, cactus, rocas, montañas y nubes de bolas,
// y los objetos (plátano, caparazones, caja TNT, monedas). Coordenadas en metros de la escena; los karts
// miran a -z y apoyan en y = 0.
import * as THREE from "three";
import { buildBean } from "../core/bean";
import type { DecoKind } from "./track";

/** Una pieza de un modelo: geometría, color y colocación. */
export interface Part {
  g: THREE.BufferGeometry;
  color: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), SC = new THREE.Vector3();

/** Junta piezas en una sola geometría con color por vértice (usar con `vertexColors: true`). */
export function partsGeometry(parts: Part[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  for (const part of parts) {
    const g = part.g.index ? part.g.toNonIndexed() : part.g.clone();
    E.set(...(part.rot ?? [0, 0, 0]), "YXZ");
    M.compose(P.set(...(part.pos ?? [0, 0, 0])), Q.setFromEuler(E), SC.set(...(part.scale ?? [1, 1, 1])));
    g.applyMatrix4(M);
    c.setHex(part.color);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const sphere = (r: number) => new THREE.SphereGeometry(r, 14, 10);
const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r: number, h: number, seg = 14) => new THREE.ConeGeometry(r, h, seg);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 12);
const ico = (r: number) => new THREE.IcosahedronGeometry(r, 1);
const octa = (r: number) => new THREE.OctahedronGeometry(r, 0);

// --- Decorados (cada tipo es una sola geometría; el render los instancia) ---

export function decoGeometry(kind: DecoKind): THREE.BufferGeometry {
  switch (kind) {
    case "tree":
      return partsGeometry([
        { g: cyl(0.12, 0.18, 1.1), color: 0x7a4e2a, pos: [0, 0.55, 0] },
        { g: sphere(0.85), color: 0x3fae45, pos: [0, 1.7, 0], scale: [1, 0.92, 1] },
        { g: sphere(0.55), color: 0x4cc254, pos: [0.5, 1.4, 0.2] },
        { g: sphere(0.5), color: 0x36a03c, pos: [-0.45, 1.4, -0.25] },
        { g: sphere(0.5), color: 0x5ad060, pos: [0.1, 2.3, -0.1] },
      ]);
    case "bush":
      return partsGeometry([
        { g: sphere(0.46), color: 0x35a540, pos: [0, 0.3, 0], scale: [1.2, 0.8, 1] },
        { g: sphere(0.34), color: 0x4cc254, pos: [0.42, 0.25, 0.1] },
        { g: sphere(0.3), color: 0x2e9138, pos: [-0.38, 0.22, -0.1] },
        { g: sphere(0.07), color: 0xff6aa0, pos: [0.1, 0.62, 0.3] },
        { g: sphere(0.07), color: 0xffe066, pos: [-0.3, 0.5, 0.25] },
        { g: sphere(0.07), color: 0xffffff, pos: [0.5, 0.5, -0.05] },
      ]);
    case "cactus":
      return partsGeometry([
        { g: capsule(0.17, 1.4), color: 0x3fb05a, pos: [0, 0.87, 0] },
        { g: capsule(0.1, 0.3), color: 0x3fb05a, pos: [-0.32, 0.85, 0], rot: [0, 0, Math.PI / 2] },
        { g: capsule(0.1, 0.4), color: 0x3fb05a, pos: [-0.5, 1.15, 0] },
        { g: capsule(0.1, 0.3), color: 0x3fb05a, pos: [0.32, 1.1, 0], rot: [0, 0, Math.PI / 2] },
        { g: capsule(0.1, 0.35), color: 0x3fb05a, pos: [0.5, 1.38, 0] },
        { g: sphere(0.09), color: 0xff6aa0, pos: [0, 1.72, 0] },
      ]);
    case "rock":
      return partsGeometry([
        { g: ico(0.6), color: 0x8f8c96, pos: [0, 0.3, 0], scale: [1.25, 0.78, 1.05] },
        { g: ico(0.32), color: 0x77747e, pos: [0.55, 0.18, 0.25] },
        { g: ico(0.22), color: 0x9d9aa4, pos: [-0.5, 0.12, -0.3] },
      ]);
    case "crystal":
      return partsGeometry([
        { g: octa(0.5), color: 0x6af4ff, pos: [0, 1.3, 0], scale: [0.8, 2.5, 0.8] },
        { g: octa(0.34), color: 0xff6ae6, pos: [0.55, 0.8, 0.1], scale: [0.8, 2.2, 0.8], rot: [0, 0.4, -0.35] },
        { g: octa(0.3), color: 0xa88aff, pos: [-0.5, 0.7, -0.1], scale: [0.8, 2.1, 0.8], rot: [0, 0.9, 0.4] },
        { g: octa(0.2), color: 0xffffff, pos: [0, 2.7, 0], scale: [0.6, 1.2, 0.6] },
      ]);
    case "asteroid":
      return partsGeometry([
        { g: ico(0.8), color: 0x7a7488, pos: [0, 0.8, 0], scale: [1.3, 0.85, 1.05] },
        { g: ico(0.4), color: 0x5e5a6e, pos: [0.9, 0.5, 0.3] },
        { g: ico(0.28), color: 0x9a94ac, pos: [-0.8, 1.2, -0.4] },
        { g: ico(0.18), color: 0xff7a40, pos: [0.3, 1.3, 0.55] },
      ]);
    case "lavarock":
      return partsGeometry([
        { g: ico(0.7), color: 0x3c2e34, pos: [0, 0.45, 0], scale: [1.15, 1, 1] },
        { g: ico(0.4), color: 0x2c2228, pos: [0.65, 0.25, 0.3] },
        { g: ico(0.14), color: 0xff7a20, pos: [0.2, 0.85, 0.4] },
        { g: ico(0.12), color: 0xffb030, pos: [-0.4, 0.55, 0.5] },
        { g: ico(0.1), color: 0xff5a14, pos: [0.55, 0.45, -0.5] },
      ]);
    case "torch":
      return partsGeometry([
        { g: cyl(0.2, 0.28, 1.5), color: 0x4e3c44, pos: [0, 0.75, 0] },
        { g: cyl(0.34, 0.22, 0.28), color: 0x2e2228, pos: [0, 1.62, 0] },
        { g: cone(0.26, 0.7, 10), color: 0xff8a20, pos: [0, 2.1, 0] },
        { g: cone(0.14, 0.5, 8), color: 0xffe066, pos: [0, 2.0, 0] },
      ]);
    case "pine":
      return partsGeometry([
        { g: cyl(0.1, 0.16, 0.7), color: 0x6a452a, pos: [0, 0.35, 0] },
        { g: cone(0.85, 0.95), color: 0x1f7a4a, pos: [0, 0.95, 0] },
        { g: cone(0.62, 0.85), color: 0x238a54, pos: [0, 1.45, 0] },
        { g: cone(0.42, 0.75), color: 0x279a5e, pos: [0, 1.9, 0] },
        { g: cone(0.55, 0.4), color: 0xf4f9ff, pos: [0, 1.1, 0] },
        { g: cone(0.4, 0.34), color: 0xf4f9ff, pos: [0, 1.6, 0] },
        { g: cone(0.26, 0.3), color: 0xf4f9ff, pos: [0, 2.0, 0] },
      ]);
  }
}

/** Radio aproximado (m) de cada decorado, para ocultar el que tapa la vista. */
export const DECO_RADIUS: Record<DecoKind, number> = {
  tree: 0.9, bush: 0.7, cactus: 0.55, rock: 0.8, pine: 0.85, crystal: 0.8, asteroid: 1.1, lavarock: 0.9, torch: 0.4,
};

/** Montañas redondeadas (conos con la punta nevada) en un anillo alrededor del mapa. */
export function mountainGeometry(
  placements: { x: number; z: number; w: number; h: number; color: number; snow: boolean; cap?: number }[], base: number,
): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (const m of placements) {
    parts.push({ g: new THREE.ConeGeometry(m.w, m.h, 10, 1), color: m.color, pos: [m.x, base + m.h / 2, m.z] });
    parts.push({ g: sphere(m.w * 0.5), color: m.color, pos: [m.x + m.w * 0.55, base + m.h * 0.18, m.z + m.w * 0.2], scale: [1, 0.8, 1] });
    if (m.snow) parts.push({ g: new THREE.ConeGeometry(m.w * 0.36, m.h * 0.34, 10, 1), color: m.cap ?? 0xf6faff, pos: [m.x, base + m.h * 0.84, m.z] });
  }
  return partsGeometry(parts);
}

/** Nubes esponjosas: racimos de bolas blancas. */
export function cloudGeometry(clouds: { x: number; y: number; z: number; s: number }[]): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (const c of clouds) {
    for (const [dx, dy, r] of [[0, 0, 1], [1.1, -0.15, 0.8], [-1.1, -0.1, 0.75], [0.5, 0.45, 0.7], [-0.4, 0.4, 0.65]] as const) {
      parts.push({ g: sphere(r * c.s), color: 0xffffff, pos: [c.x + dx * c.s, c.y + dy * c.s, c.z], scale: [1, 0.75, 1] });
    }
  }
  return partsGeometry(parts);
}

// --- Karts ---

export interface KartModel {
  root: THREE.Group;
  /** Ruedas que giran con la velocidad (pivote en el eje). */
  spinners: THREE.Group[];
  /** Pivotes de las ruedas delanteras (giran con el volante). */
  steer: THREE.Group[];
  /** Llamas de los tubos de escape (visibles con turbo). */
  flames: THREE.Group;
  /** Ala delta que se abre en los saltos largos. */
  glider: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
}

const std = (color: number, roughness = 0.5, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Kart redondeado y brillante con el poroto del casino al volante. */
export function buildKart(color: number): KartModel {
  const root = new THREE.Group();
  const c = new THREE.Color(color);
  const bodyMat = std(color, 0.3, 0.25);
  const light = std(c.clone().lerp(new THREE.Color(0xffffff), 0.45).getHex(), 0.35, 0.1);
  const dark = std(c.clone().multiplyScalar(0.45).getHex(), 0.5, 0.2);
  const black = std(0x1d1d24, 0.7), steel = std(0xd2d6e2, 0.22, 0.85), tire = std(0x16161a, 0.85);
  const add = (
    g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number,
    rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1], parent: THREE.Object3D = root,
  ) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(...rot);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const H = Math.PI / 2;
  // Chasis: cápsula achatada, morro y rayas.
  add(capsule(0.2, 0.62), bodyMat, 0, 0.22, 0.05, [H, 0, 0], [1.35, 1, 0.62]);
  add(capsule(0.12, 0.34), bodyMat, 0, 0.19, -0.58, [H, 0, 0], [1.15, 1, 0.6]);
  add(capsule(0.025, 0.7), light, 0, 0.33, -0.05, [H, 0, 0]);
  add(capsule(0.04, 0.78), light, 0, 0.14, -0.84, [0, 0, H]);
  // Pontones laterales y asiento.
  for (const s of [-1, 1]) add(capsule(0.09, 0.34), dark, 0.36 * s, 0.2, 0.12, [H, 0, 0], [1, 1, 0.8]);
  add(capsule(0.17, 0.12), black, 0, 0.4, 0.2, [0, 0, 0], [1.1, 1, 0.7]);
  // Alerón trasero y tubos de escape con llamas.
  for (const s of [-1, 1]) add(cyl(0.015, 0.015, 0.3), steel, 0.28 * s, 0.5, 0.58);
  add(capsule(0.05, 0.72), light, 0, 0.66, 0.6, [0, 0, H], [1, 1, 0.55]);
  const flames = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a });
  for (const s of [-1, 1]) {
    add(cyl(0.05, 0.06, 0.2, 10), steel, 0.14 * s, 0.3, 0.7, [H, 0, 0]);
    add(cone(0.06, 0.4, 8), flameMat, 0.14 * s, 0.3, 0.98, [H, 0, 0], [1, 1, 1], flames);
  }
  root.add(flames);
  flames.visible = false;
  // Faros.
  for (const s of [-1, 1]) add(sphere(0.045), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }), 0.12 * s, 0.22, -0.88);
  // Ruedas: neumático, llanta de acero y tapacubos. Las delanteras llevan pivote de dirección.
  const spinners: THREE.Group[] = [], steer: THREE.Group[] = [];
  const wheels = [[-0.4, -0.48, 0.15, 0.13, true], [0.4, -0.48, 0.15, 0.13, true], [-0.42, 0.45, 0.19, 0.18, false], [0.42, 0.45, 0.19, 0.18, false]] as const;
  for (const [x, z, r, w, front] of wheels) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const spin = new THREE.Group();
    pivot.add(spin);
    add(cyl(r, r, w, 18), tire, 0, 0, 0, [0, 0, H], [1, 1, 1], spin);
    add(cyl(r * 0.62, r * 0.62, w + 0.012, 14), steel, 0, 0, 0, [0, 0, H], [1, 1, 1], spin);
    add(cyl(r * 0.2, r * 0.2, w + 0.03, 8), dark, 0, 0, 0, [0, 0, H], [1, 1, 1], spin);
    // Taco del neumático: una pastilla oscura para que se note el giro.
    add(new THREE.BoxGeometry(w + 0.02, r * 0.45, r * 0.3), black, 0, 0, r * 0.82, [0, 0, 0], [1, 1, 1], spin);
    root.add(pivot);
    spinners.push(spin);
    if (front) steer.push(pivot);
  }
  // Piloto: el poroto del casino sentado, con los brazos al volante.
  const bean = buildBean(color);
  bean.root.scale.setScalar(0.4);
  bean.root.position.set(0, 0.22, 0.14);
  bean.arms.forEach((arm) => (arm.rotation.x = -1.05));
  bean.legs.forEach((leg) => (leg.rotation.x = -1.3));
  root.add(bean.root);
  add(new THREE.TorusGeometry(0.06, 0.012, 6, 14), black, 0, 0.5, -0.18, [-0.9, 0, 0]);
  // Ala delta: dos velas triangulares del color del kart sobre dos barras.
  const glider = new THREE.Group();
  const sailMat = new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color(0xffffff), 0.25).getHex(), roughness: 0.5, side: THREE.DoubleSide });
  const sail = new THREE.BufferGeometry();
  sail.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 1.1, -0.3, -1.05, 0.75, 0.55, 0, 0.8, 0.5, 0, 1.1, -0.3, 0, 0.8, 0.5, 1.05, 0.75, 0.55,
  ], 3));
  sail.computeVertexNormals();
  const sailMesh = new THREE.Mesh(sail, sailMat);
  sailMesh.castShadow = true;
  glider.add(sailMesh);
  for (const s of [-1, 1]) add(cyl(0.012, 0.012, 0.8), steel, 0.18 * s, 0.7, 0.1, [0.5, 0, -0.5 * s], [1, 1, 1], glider);
  glider.visible = false;
  root.add(glider);
  return { root, spinners, steer, flames, glider, bodyMat };
}

// --- Objetos ---

export function bananaGeometry(): THREE.BufferGeometry {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.05, -0.28), new THREE.Vector3(0, 0.34, 0), new THREE.Vector3(0, 0.05, 0.28));
  return partsGeometry([
    { g: new THREE.TubeGeometry(curve, 14, 0.06, 8), color: 0xffd92e },
    { g: sphere(0.045), color: 0x5a3a14, pos: [0, 0.05, -0.29] },
    { g: sphere(0.045), color: 0x5a3a14, pos: [0, 0.05, 0.29] },
  ]);
}

/** Caparazón: casco redondo con borde claro y pinchos. `red` = el teledirigido. */
export function shellGeometry(red: boolean): THREE.BufferGeometry {
  const main = red ? 0xe8283a : 0x2cc24c;
  const parts: Part[] = [
    { g: new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), color: main, pos: [0, 0.1, 0], scale: [1, 0.85, 1.15] },
    { g: cyl(0.25, 0.25, 0.05, 16), color: 0xf6f0e0, pos: [0, 0.08, 0], scale: [1, 1, 1.15] },
    { g: ico(0.1), color: 0xf6f0e0, pos: [0, 0.3, 0] },
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push({ g: cone(0.045, 0.1, 6), color: 0xf6f0e0, pos: [Math.cos(a) * 0.17, 0.2, Math.sin(a) * 0.2] });
  }
  return partsGeometry(parts);
}

/** Caja TNT de Crash: madera roja con una franja clara y el rótulo. */
export function tntTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#c8312a";
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "#7a1a16";
  g.lineWidth = 4;
  g.strokeRect(2, 2, 60, 60);
  g.fillStyle = "#f4e6c0";
  g.fillRect(6, 22, 52, 22);
  g.fillStyle = "#c8312a";
  g.font = "bold 20px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("TNT", 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function coinGeometry(): THREE.BufferGeometry {
  return partsGeometry([
    { g: cyl(0.2, 0.2, 0.05, 20), color: 0xffcf2a, rot: [Math.PI / 2, 0, 0] },
    { g: cyl(0.14, 0.14, 0.06, 20), color: 0xffe680, rot: [Math.PI / 2, 0, 0] },
  ]);
}

/**
 * Rampa: cuña ancha con el lomo amarillo. Empieza en z = 0 (a ras del suelo) y sube hasta el labio en
 * z = -length, a `height` metros. Mira a -z.
 */
export function rampGeometry(width: number, length: number, height: number): THREE.BufferGeometry {
  const hw = width / 2;
  const v = [[-hw, 0, 0], [hw, 0, 0], [-hw, height, -length], [hw, height, -length], [-hw, 0, -length], [hw, 0, -length]];
  const faces: [number[], number][] = [
    [[0, 1, 3, 2], 0xffc928], [[4, 2, 3, 5], 0x7a4a14], [[0, 2, 4], 0xb0b0c0], [[1, 5, 3], 0xb0b0c0], [[0, 4, 5, 1], 0x555560],
  ];
  const pos: number[] = [], col: number[] = [];
  const cc = new THREE.Color();
  for (const [idx, color] of faces) {
    cc.setHex(color);
    const tris = idx.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
    for (const t of tris) {
      for (const k of t) {
        pos.push(...v[idx[k]]);
        col.push(cc.r, cc.g, cc.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Flechas de las placas de turbo. */
export function padTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 3; i++) {
    const y = 12 + i * 17;
    g.fillStyle = i === 1 ? "#ffd84a" : "#ff9a2a";
    g.beginPath();
    g.moveTo(32, y - 6);
    g.lineTo(54, y + 8);
    g.lineTo(44, y + 8);
    g.lineTo(32, y);
    g.lineTo(20, y + 8);
    g.lineTo(10, y + 8);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- Peligros y Lakitu ---

function faceTexture(draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Thwomp: bloque de piedra con cara de enfado y pinchos; cae sobre la pista a intervalos. */
export function buildThwomp(): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a8a9a, roughness: 0.8 });
  const face = new THREE.MeshStandardMaterial({
    map: faceTexture((c) => {
      c.fillStyle = "#8c8c9c";
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = "#6c6c7c";
      c.fillRect(0, 0, 64, 6);
      c.fillRect(0, 58, 64, 6);
      c.fillStyle = "#fff";
      c.fillRect(10, 20, 18, 12);
      c.fillRect(36, 20, 18, 12);
      c.fillStyle = "#c01818";
      c.fillRect(17, 23, 6, 8);
      c.fillRect(41, 23, 6, 8);
      c.strokeStyle = "#202028";
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(8, 14);
      c.lineTo(28, 22);
      c.moveTo(56, 14);
      c.lineTo(36, 22);
      c.stroke();
      c.fillStyle = "#202028";
      c.fillRect(14, 42, 36, 10);
      c.fillStyle = "#fff";
      for (let i = 0; i < 5; i++) c.fillRect(16 + i * 7, 42, 4, 5);
    }),
    roughness: 0.8,
  });
  // Caras de BoxGeometry: +x, -x, +y, -y, +z, -z. La cara de enfado mira a -z (hacia donde va la pista).
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), [stone, stone, stone, stone, stone, face]);
  body.castShadow = true;
  g.add(body);
  const spike = new THREE.MeshStandardMaterial({ color: 0xc8c8d8, roughness: 0.4, metalness: 0.5 });
  for (const x of [-0.5, 0, 0.5]) {
    for (const z of [-0.5, 0, 0.5]) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 8), spike);
      s.position.set(x, -0.8, z);
      s.rotation.x = Math.PI;
      g.add(s);
    }
  }
  return g;
}

/** Chomp: bola negra con dientes. Mira a -z; la cadena la añade el render. */
export function buildChomp(): THREE.Group {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.35, metalness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), black);
  ball.castShadow = true;
  g.add(ball);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), white);
    eye.position.set(0.22 * s, 0.2, -0.46);
    eye.scale.z = 0.6;
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), black);
    pupil.position.set(0.22 * s, 0.2, -0.57);
    g.add(pupil);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0xc02030 }));
  mouth.position.set(0, -0.12, -0.52);
  g.add(mouth);
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), white);
    t.position.set(-0.24 + i * 0.12, -0.04, -0.56);
    t.rotation.x = Math.PI;
    g.add(t);
  }
  return g;
}

/** Meteoro: roca ardiente con una cola de fuego hacia atrás (+z). */
export function buildMeteor(): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: 0x5a4a52, roughness: 0.9, emissive: 0x802010 }));
  rock.castShadow = true;
  g.add(rock);
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 2.2, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = 1.3;
  g.add(tail);
  return g;
}

/** Lakitu: la nube con carita que devuelve al kart a la pista. */
export function buildCloud(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  for (const [x, y, r] of [[0, 0, 0.5], [0.5, -0.05, 0.38], [-0.5, -0.05, 0.38], [0.25, 0.22, 0.32], [-0.25, 0.22, 0.32]] as const) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), white);
    m.position.set(x, y, 0);
    m.scale.y = 0.8;
    g.add(m);
  }
  const dark = new THREE.MeshBasicMaterial({ color: 0x15151c });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dark);
    eye.position.set(0.18 * s, 0.05, -0.46);
    g.add(eye);
  }
  return g;
}
