// Modelos de los infectados con el aspecto del casino: el «poroto» (cuerpo de cápsula con la camiseta rota, ojos
// saltones, guantes redondos y piececitos) pero muerto. A diferencia del poroto sano, tiene un CUELLO delgado y
// oscuro y una CABEZA redonda de color más claro que se distinguen bien del cuerpo: ahí es donde los disparos hacen
// mucho más daño (`HEAD` y `BODY` de este fichero los usa también el rayo de los disparos).
// Cada miembro es UNA malla fusionada con el color por vértice (un zombi son 7 llamadas de dibujo) y hay seis
// aspectos por tipo; las geometrías se comparten entre todos los zombis. El frente es −Z, igual que el jugador.
import * as THREE from "three";
import { partsGeometry, type Part } from "../../karts/models";
import type { ZombieKind } from "./defs";

export const ZOMBIE_VARIANTS = 6;

/** Medidas del modelo (m, con los pies en 0 y a escala 1: el zombi se escala por `def.height / MODEL.height`). */
/** Medidas de un modelo (humano o perro). `headF`: cuánto se adelanta la cabeza respecto al cuerpo (m). */
export interface ModelDims {
  height: number;
  headY: number;
  headR: number;
  headF: number;
  bodyTop: number;
  neckY: number;
  shoulderY: number;
  hipY: number;
}

export const MODEL = {
  headF: 0,
  /** Altura total hasta lo alto de la cabeza (sin sombrero). */
  height: 2.12,
  /** Centro y radio de la CABEZA: la parte donde un disparo hace daño crítico. */
  headY: 1.84,
  headR: 0.27,
  /** Altura del tope del cuerpo (donde empieza el cuello) y del cuello. */
  bodyTop: 1.62,
  neckY: 1.7,
  /** Pivotes de hombros y caderas. */
  shoulderY: 1.4,
  hipY: 0.82,
} as const;

/** El perro infernal: cuerpo horizontal, cabeza adelantada y cuatro patas (delanteras = «brazos», traseras = «piernas»). */
export const HOUND = {
  headF: 0.5,
  height: 0.95,
  headY: 0.74,
  headR: 0.2,
  bodyTop: 0.86,
  neckY: 0.7,
  shoulderY: 0.56,
  hipY: 0.56,
} as const;

/** Medidas del modelo de cada tipo. */
export function modelFor(kind: ZombieKind): ModelDims {
  return kind === "hound" ? HOUND : MODEL;
}

export interface ZombieRig {
  torso: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  lArm: THREE.BufferGeometry;
  rArm: THREE.BufferGeometry;
  lLeg: THREE.BufferGeometry;
  rLeg: THREE.BufferGeometry;
  /** Hueso y sangre del cuello cuando le vuelan la cabeza. */
  stump: THREE.BufferGeometry;
}

const SHIRTS = [0x6a2a50, 0x9a7a30, 0x4a4a58, 0x2f5a58, 0x7a3a2a, 0x3a3a6a];
const PANTS = [0x2a1620, 0x33281c, 0x20242e, 0x1c1c1c, 0x40382c, 0x2a2f2a];
const BLOOD = 0x7a0c0c;
const DRIED = 0x4a0808;
const BONE = 0xe8e0c0;
const DARK = 0x2a0e1c;
const CREAM = 0xfff2dc;

const SKIN: Record<ZombieKind, number[]> = {
  walker: [0x7fa65a, 0x93a884, 0x6c9c8c, 0x88a860, 0x7a9c70, 0x8aa07a],
  runner: [0xb4bb7c, 0xc0b888, 0xa8b484, 0xb8aa78, 0xbcbc90, 0xaab070],
  brute: [0x5f8a5a, 0x6a7a68, 0x587a6a, 0x66845a, 0x607264, 0x587858],
  hound: [0x2a1e1a, 0x34221c, 0x1f1a1c, 0x2e2018, 0x2a2420, 0x382420],
};

const sphere = (r: number) => new THREE.SphereGeometry(r, 14, 10);
const cyl = (rt: number, rb: number, h: number, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Oscurece o aclara un color 0xRRGGBB. */
function shade(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

const cache = new Map<string, ZombieRig>();

export function zombieRig(kind: ZombieKind, variant: number): ZombieRig {
  const v = ((variant % ZOMBIE_VARIANTS) + ZOMBIE_VARIANTS) % ZOMBIE_VARIANTS;
  const key = `${kind}${v}`;
  let rig = cache.get(key);
  if (!rig) {
    rig = build(kind, v);
    cache.set(key, rig);
  }
  return rig;
}

export function disposeZombieRigs(): void {
  for (const rig of cache.values()) for (const g of Object.values(rig)) (g as THREE.BufferGeometry).dispose();
  cache.clear();
}

function build(kind: ZombieKind, v: number): ZombieRig {
  if (kind === "hound") return buildHound(v);
  const r = rng(kind.length * 977 + v * 131 + 7);
  const skin = SKIN[kind][v];
  const headSkin = new THREE.Color(skin).lerp(new THREE.Color(0xeef4c8), 0.3).getHex(); // la cabeza, más clara
  const neckSkin = shade(skin, 0.5); // el cuello, oscuro y delgado
  const shirt = SHIRTS[(v + (kind === "runner" ? 2 : kind === "brute" ? 4 : 0)) % SHIRTS.length];
  const pants = PANTS[(v * 5 + 1) % PANTS.length];
  const brute = kind === "brute";
  const runner = kind === "runner";
  // Complexión: el bruto es muy ancho; el corredor, flaco.
  const R = brute ? 0.46 : runner ? 0.29 : 0.35;
  const len = brute ? 0.04 : runner ? 0.3 : 0.14;
  const limb = brute ? 1.35 : runner ? 0.82 : 1;
  const cy = MODEL.bodyTop - R - len / 2; // centro del cuerpo

  // --- Cuerpo y cuello (los pies en y = 0) ---
  const torso: Part[] = [
    { g: cyl(R, R, len), color: skin, pos: [0, cy, 0] },
    { g: sphere(R), color: skin, pos: [0, cy + len / 2, 0] },
    { g: sphere(R), color: skin, pos: [0, cy - len / 2, 0] },
    // Camiseta rota: cubre la mitad de abajo, con el bajo en picos.
    { g: cyl(R + 0.014, R + 0.014, 0.4 + len * 0.5, 18, true), color: shirt, pos: [0, cy - 0.12, 0] },
    { g: new THREE.SphereGeometry(R + 0.014, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), color: shirt, pos: [0, cy - len / 2, 0] },
    // Cuello: cilindro estrecho y oscuro, con el cuello roto de la camiseta alrededor.
    { g: cyl(brute ? 0.13 : 0.095, brute ? 0.15 : 0.115, 0.26, 12), color: neckSkin, pos: [0, MODEL.neckY, 0] },
    { g: cyl(R * 0.62, R * 0.8, 0.07, 16, true), color: shirt, pos: [0, MODEL.bodyTop - 0.08, 0] },
  ];
  const hemY = cy - len / 2 - R + 0.03;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const hl = 0.1 + r() * 0.1;
    torso.push({ g: cone(0.05, hl, 4), color: shade(shirt, 0.8 + r() * 0.2), pos: [Math.cos(a) * (R * 0.99), hemY + 0.1 - hl / 2, Math.sin(a) * (R * 0.99)], rot: [Math.PI, a, 0] });
  }
  // Heridas, sangre seca y, en algunos, las costillas al aire.
  torso.push(
    { g: sphere(0.1), color: BLOOD, pos: [-0.12, cy + 0.04, -R + 0.01], scale: [1, 1, 0.35] },
    { g: sphere(0.07), color: DRIED, pos: [0.14, cy - 0.16, -R + 0.01], scale: [1, 1, 0.35] },
    { g: sphere(0.06), color: BLOOD, pos: [R - 0.05, cy + 0.12, -0.1], scale: [0.4, 1, 1] },
  );
  if (v % 2 === 0 || brute) {
    for (let i = 0; i < 3; i++) torso.push({ g: box(0.2, 0.022, 0.02), color: BONE, pos: [0.06, cy + 0.2 + i * 0.065, -R - 0.004] });
    torso.push({ g: box(0.24, 0.24, 0.012), color: BLOOD, pos: [0.06, cy + 0.26, -R + 0.004] });
  }
  if (v === 2 || brute) torso.push({ g: box(R * 1.2, 0.46, 0.2), color: brute ? 0x2a2e33 : 0x5a5a40, pos: [0, cy + 0.04, R * 0.92] }); // mochila o chaleco
  if (v === 4) torso.push({ g: box(0.07, 0.4, 0.014), color: 0x6a1414, pos: [0, cy + 0.04, -R - 0.01] }); // corbata

  // --- Cabeza (origen en su centro): bola clara con cuencas, boca abierta con dientes y el accesorio ---
  const hr = MODEL.headR;
  const head: Part[] = [
    { g: sphere(hr), color: headSkin, pos: [0, 0, 0] },
    { g: sphere(0.13), color: 0x1a0c10, pos: [0.115, 0.05, -0.19], scale: [1, 1, 0.55] },
    { g: sphere(0.13), color: 0x1a0c10, pos: [-0.115, 0.05, -0.19], scale: [1, 1, 0.55] },
    { g: box(0.2, 0.08, 0.06), color: 0x2a0808, pos: [0, -0.14, -0.235] },
    { g: cone(0.022, 0.055), color: BONE, pos: [-0.065, -0.105, -0.255], rot: [Math.PI, 0, 0] },
    { g: cone(0.022, 0.055), color: BONE, pos: [0, -0.105, -0.255], rot: [Math.PI, 0, 0] },
    { g: cone(0.022, 0.055), color: BONE, pos: [0.065, -0.105, -0.255], rot: [Math.PI, 0, 0] },
    { g: cone(0.022, 0.045), color: BONE, pos: [-0.03, -0.18, -0.255] },
    { g: cone(0.022, 0.045), color: BONE, pos: [0.03, -0.18, -0.255] },
    { g: box(0.2, 0.045, 0.02), color: 0xff8a24, pos: [0, 0.18, -0.215], rot: [0.3, 0, 0] }, // cinta del casino
    { g: sphere(0.045), color: BLOOD, pos: [v % 2 ? 0.1 : -0.1, 0.12, -0.215], scale: [1, 1, 0.4] }, // herida en la cara
    { g: sphere(0.042), color: 0xc01818, pos: [0.105, 0.04, -0.285] }, // pupilas rojas sobre los ojos
    { g: sphere(0.042), color: 0xc01818, pos: [-0.105, 0.04, -0.285] },
  ];
  switch (v % 3) {
    case 0:
      // Bombín torcido y roto.
      head.push(
        { g: cyl(0.19, 0.21, 0.19, 14), color: DARK, pos: [0.03, 0.29, 0.02], rot: [0.12, 0, -0.18] },
        { g: cyl(0.32, 0.32, 0.035, 16), color: DARK, pos: [0, 0.21, 0.02], rot: [0.12, 0, -0.18] },
        { g: cyl(0.205, 0.205, 0.05, 14), color: CREAM, pos: [0.02, 0.24, 0.02], rot: [0.12, 0, -0.18] },
      );
      break;
    case 1:
      // Cerebro al aire.
      for (const [x, z] of [[0, 0], [0.09, 0.06], [-0.09, 0.05], [0.04, -0.07]] as const) head.push({ g: sphere(0.085), color: 0xd87a8a, pos: [x, 0.26, z] });
      break;
    default:
      // Cono de obra en la cabeza.
      head.push({ g: cone(0.14, 0.3, 10), color: 0xff7a24, pos: [0, 0.4, 0], rot: [0.1, 0, 0.15] }, { g: cyl(0.1, 0.12, 0.05, 10), color: 0xf4f4f4, pos: [0, 0.35, 0], rot: [0.1, 0, 0.15] });
  }
  // Ojos que brillan (se pintan aparte con un material sin luz).
  const eyes: Part[] = [
    { g: sphere(0.105), color: 0xffffff, pos: [0.115, 0.05, -0.2], scale: [1, 1, 0.7] },
    { g: sphere(0.105), color: 0xffffff, pos: [-0.115, 0.05, -0.2], scale: [1, 1, 0.7] },
  ];

  // --- Cuello cortado (para cuando vuela la cabeza) ---
  const stump: Part[] = [
    { g: cyl(0.1, 0.12, 0.08, 10), color: BLOOD, pos: [0, 0, 0] },
    { g: cyl(0.035, 0.035, 0.12, 8), color: BONE, pos: [0, 0.03, 0] },
  ];

  // --- Brazos: pivote en el hombro, cuelgan hacia −Y; la mano es un guante redondo ---
  const arm = (side: number): Part[] => {
    const b: Part[] = [];
    const t = 0.065 * limb;
    b.push({ g: cyl(t, t, 0.5, 8), color: skin, pos: [0, -0.25, 0] });
    b.push({ g: cyl(t + 0.012, t + 0.012, 0.18, 8, true), color: shirt, pos: [0, -0.1, 0] });
    const stumpArm = (v === 1 && side < 0) || (v === 4 && side > 0);
    if (stumpArm) {
      // Brazo cercenado a medio antebrazo, con el hueso asomando.
      b.push({ g: cyl(t * 1.05, t, 0.07, 8), color: BLOOD, pos: [0, -0.5, 0] });
      b.push({ g: cyl(0.03, 0.03, 0.1, 6), color: BONE, pos: [0, -0.56, 0] });
    } else {
      b.push({ g: sphere(0.12 * limb), color: 0xcfe0a8, pos: [0, -0.57, 0] }); // mano
      if (r() < 0.6) b.push({ g: sphere(0.06 * limb), color: BLOOD, pos: [0.04, -0.3, -0.04] });
    }
    return b;
  };

  // --- Piernas: pivote en la cadera; piececitos redondos ---
  const leg = (side: number): Part[] => {
    const b: Part[] = [];
    const t = 0.105 * limb;
    b.push({ g: cyl(t, t, 0.62, 10), color: pants, pos: [0, -0.31, 0] });
    if ((v + (side > 0 ? 1 : 0)) % 2 === 0) b.push({ g: sphere(0.06 * limb), color: skin, pos: [0.06, -0.2, -0.08] }); // un roto en el pantalón
    b.push({ g: sphere(0.15 * limb), color: DARK, pos: [0, -0.7, -0.05], scale: [1, 0.55, 1.5] });
    return b;
  };

  return {
    torso: partsGeometry(torso),
    head: partsGeometry(head),
    eyes: partsGeometry(eyes),
    lArm: partsGeometry(arm(-1)),
    rArm: partsGeometry(arm(1)),
    lLeg: partsGeometry(leg(-1)),
    rLeg: partsGeometry(leg(1)),
    stump: partsGeometry(stump),
  };
}

/** Perro infernal: pelaje negro con grietas de brasa, ojos y boca incandescentes, púas en el lomo. */
function buildHound(v: number): ZombieRig {
  const r = rng(4242 + v * 31);
  const fur = SKIN.hound[v];
  const belly = shade(fur, 1.6);
  const EMBER = 0xff6a1a;
  const H = HOUND;
  const torso: Part[] = [
    // Cuerpo: cápsula horizontal con pecho ancho y grupa.
    { g: cyl(0.23, 0.23, 0.62, 14), color: fur, pos: [0, 0.6, 0], rot: [Math.PI / 2, 0, 0] },
    { g: sphere(0.27), color: fur, pos: [0, 0.63, -0.3] },
    { g: sphere(0.23), color: fur, pos: [0, 0.6, 0.33] },
    { g: sphere(0.2), color: belly, pos: [0, 0.48, -0.05], scale: [0.9, 0.7, 2.2] },
    // Cuello grueso que sube hacia la cabeza adelantada.
    { g: cyl(0.11, 0.17, 0.4, 10), color: fur, pos: [0, 0.74, -0.42], rot: [-1.0, 0, 0] },
    // Cola.
    { g: cone(0.06, 0.45, 6), color: fur, pos: [0, 0.74, 0.62], rot: [-1.9, 0, 0] },
    { g: sphere(0.045), color: EMBER, pos: [0, 0.9, 0.76] },
  ];
  // Púas del lomo y grietas de brasa en los costados.
  for (let i = 0; i < 6; i++) torso.push({ g: cone(0.04, 0.13 + r() * 0.05, 5), color: shade(fur, 0.5), pos: [0, 0.86 - Math.abs(i - 2.5) * 0.015, -0.34 + i * 0.13] });
  for (let i = 0; i < 5; i++) {
    const side = i % 2 ? 1 : -1;
    torso.push({ g: box(0.02, 0.018, 0.12 + r() * 0.08), color: EMBER, pos: [side * 0.225, 0.52 + r() * 0.2, -0.3 + i * 0.16], rot: [0, 0, side * 0.5] });
  }
  const head: Part[] = [
    { g: sphere(H.headR), color: fur, pos: [0, 0, 0] },
    { g: box(0.15, 0.1, 0.24), color: fur, pos: [0, -0.05, -0.2] }, // hocico
    { g: box(0.13, 0.035, 0.22), color: 0x5a0e0e, pos: [0, -0.115, -0.19] }, // mandíbula
    { g: box(0.11, 0.03, 0.18), color: EMBER, pos: [0, -0.09, -0.19] }, // boca al rojo vivo
    { g: sphere(0.04), color: 0x050505, pos: [0, 0.0, -0.325] }, // nariz
    { g: cone(0.026, 0.06), color: BONE, pos: [-0.05, -0.1, -0.28], rot: [Math.PI, 0, 0] },
    { g: cone(0.026, 0.06), color: BONE, pos: [0.05, -0.1, -0.28], rot: [Math.PI, 0, 0] },
    { g: cone(0.022, 0.05), color: BONE, pos: [-0.04, -0.125, -0.28] },
    { g: cone(0.022, 0.05), color: BONE, pos: [0.04, -0.125, -0.28] },
    { g: cone(0.07, 0.2, 5), color: shade(fur, 0.7), pos: [-0.11, 0.2, 0.05], rot: [0.3, 0, 0.35] }, // orejas
    { g: cone(0.07, 0.2, 5), color: shade(fur, 0.7), pos: [0.11, 0.2, 0.05], rot: [0.3, 0, -0.35] },
    { g: sphere(0.05), color: BLOOD, pos: [v % 2 ? 0.1 : -0.1, 0.1, -0.12], scale: [1, 1, 0.5] },
  ];
  const eyes: Part[] = [
    { g: sphere(0.045), color: 0xffffff, pos: [0.085, 0.05, -0.15], scale: [1, 0.8, 0.8] },
    { g: sphere(0.045), color: 0xffffff, pos: [-0.085, 0.05, -0.15], scale: [1, 0.8, 0.8] },
  ];
  const stump: Part[] = [
    { g: cyl(0.1, 0.12, 0.08, 10), color: BLOOD, pos: [0, 0, 0] },
    { g: cyl(0.035, 0.035, 0.1, 8), color: BONE, pos: [0, 0.03, 0] },
  ];
  // Patas: delanteras finas y traseras con muslo; zarpas oscuras.
  const front = (): Part[] => [
    { g: cyl(0.055, 0.045, 0.52, 8), color: fur, pos: [0, -0.27, 0] },
    { g: sphere(0.08), color: shade(fur, 0.6), pos: [0, -0.56, -0.03], scale: [1, 0.6, 1.5] },
  ];
  const hind = (): Part[] => [
    { g: sphere(0.12), color: fur, pos: [0, -0.04, 0.02], scale: [0.9, 1.3, 1.1] },
    { g: cyl(0.05, 0.04, 0.5, 8), color: fur, pos: [0, -0.3, 0.04] },
    { g: sphere(0.08), color: shade(fur, 0.6), pos: [0, -0.56, -0.02], scale: [1, 0.6, 1.5] },
  ];
  return {
    torso: partsGeometry(torso),
    head: partsGeometry(head),
    eyes: partsGeometry(eyes),
    lArm: partsGeometry(front()),
    rArm: partsGeometry(front()),
    lLeg: partsGeometry(hind()),
    rLeg: partsGeometry(hind()),
    stump: partsGeometry(stump),
  };
}
