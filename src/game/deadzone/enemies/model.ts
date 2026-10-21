// Modelos de los infectados: cada miembro es UNA malla de cajas fusionadas con el color por vértice (ropa rota,
// piel enferma, costillas al aire, heridas, manos con dedos, mandíbula descolgada), así que un zombi son 7
// llamadas de dibujo en vez de 20. Hay seis aspectos por tipo (ropa, pelo, heridas y miembros) y las geometrías se
// comparten entre todos los zombis. El frente es −Z, igual que el jugador.
import * as THREE from "three";
import { blockGeometry, type Block } from "../../core/three";
import type { ZombieKind } from "./defs";

export const ZOMBIE_VARIANTS = 6;

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

const SHIRTS = [0x4b5a3a, 0x5c3a3a, 0x37465f, 0x6a6858, 0x26272c, 0x7a6a38];
const PANTS = [0x23262b, 0x3a3326, 0x2b3a4a, 0x1c1c1c, 0x40382c, 0x2a2f2a];
const HAIR = [0x1a1410, 0x3a2a1a, 0x6a5a40, 0x101010, 0x4a1a14, 0x808078];
const BLOOD = 0x5a0e0e;
const DRIED = 0x3a0a0a;
const BONE = 0xcfc7b0;
const SHOE = 0x141417;

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

const SKIN: Record<ZombieKind, number[]> = {
  walker: [0x8a9b6a, 0x93a07a, 0x7a8c66, 0x9aa584, 0x86957a, 0x8d8f72],
  runner: [0xb08a72, 0xa87f6a, 0xb59377, 0x9a7766, 0xaf8d7a, 0xa5856c],
  brute: [0x6f7a72, 0x677268, 0x778078, 0x6a756c, 0x727c70, 0x646f66],
};

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
  const r = rng(kind.length * 977 + v * 131 + 7);
  const skin = SKIN[kind][v];
  const shirt = SHIRTS[(v + (kind === "runner" ? 2 : kind === "brute" ? 4 : 0)) % SHIRTS.length];
  const pants = PANTS[(v * 5 + 1) % PANTS.length];
  const hair = HAIR[(v + 2) % HAIR.length];
  const brute = kind === "brute";
  const runner = kind === "runner";
  // Complexión: el bruto es ancho; el corredor, flaco.
  const W = brute ? 1.38 : runner ? 0.86 : 1;
  const limbW = brute ? 1.45 : runner ? 0.85 : 1;

  // --- Tronco ---
  const torso: Block[] = [
    { s: [0.52 * W, 0.62, 0.3], p: [0, 1.18, 0], color: shirt },
    { s: [0.56 * W, 0.1, 0.33], p: [0, 1.46, 0], color: shade(shirt, 0.85) },
    { s: [0.54 * W, 0.07, 0.31], p: [0, 0.88, 0], color: 0x1a1a1d },
  ];
  // Dobladillo roto: tiras desiguales.
  for (let i = 0; i < 5; i++) {
    const len = 0.1 + r() * 0.16;
    torso.push({ s: [(0.5 * W) / 5 - 0.012, len, 0.31], p: [(i - 2) * ((0.5 * W) / 5), 0.84 - len / 2, 0], color: shade(shirt, 0.78 + r() * 0.2) });
  }
  // Heridas: costillas al aire (algunos), manchas de sangre y mordiscos.
  if (v % 2 === 0 || brute) {
    const side = v % 3 === 0 ? -1 : 1;
    torso.push({ s: [0.3, 0.26, 0.012], p: [0.05 * side, 1.18, -0.156], color: BLOOD });
    for (let i = 0; i < 4; i++) torso.push({ s: [0.22, 0.022, 0.016], p: [0.05 * side, 1.07 + i * 0.065, -0.162], color: BONE });
  }
  for (let i = 0; i < 3; i++) {
    torso.push({ s: [0.1 + r() * 0.2, 0.08 + r() * 0.2, 0.012], p: [(r() - 0.5) * 0.4 * W, 0.98 + r() * 0.4, r() < 0.7 ? -0.157 : 0.157], color: r() < 0.5 ? BLOOD : DRIED });
  }
  if (v === 2 || brute) {
    // Mochila o chaleco táctico.
    torso.push({ s: [0.42 * W, 0.46, 0.2], p: [0, 1.2, 0.25], color: brute ? 0x2a2e33 : 0x5a5a40 });
    if (brute) {
      torso.push({ s: [0.6 * W, 0.2, 0.34], p: [0, 1.34, 0], color: 0x2a2e33 });
      for (const sx of [-1, 1]) torso.push({ s: [0.22, 0.12, 0.28], p: [sx * 0.36 * W, 1.5, 0], color: 0x3a4048 });
    }
  }
  if (v === 4) torso.push({ s: [0.07, 0.4, 0.014], p: [0, 1.22, -0.158], color: 0x6a1414 }); // corbata

  // --- Cabeza (origen en su centro) ---
  const head: Block[] = [
    { s: [0.26, 0.28, 0.26], p: [0, 0, 0], color: skin },
    // Mandíbula descolgada con la boca abierta.
    { s: [0.2, 0.07, 0.17], p: [0, -0.17, -0.06], color: shade(skin, 0.88), r: [-0.45, 0, 0] },
    { s: [0.14, 0.05, 0.02], p: [0, -0.115, -0.135], color: 0x1c0606 },
    { s: [0.03, 0.07, 0.05], p: [0.145, -0.01, 0], color: shade(skin, 0.9) },
    { s: [0.03, 0.07, 0.05], p: [-0.145, -0.01, 0], color: shade(skin, 0.9) },
    { s: [0.05, 0.06, 0.04], p: [0, -0.04, -0.14], color: shade(skin, 0.92) },
  ];
  // Pelo, gorra o calva con herida.
  if (v % 3 === 0) {
    head.push({ s: [0.28, 0.07, 0.28], p: [0, 0.15, 0.01], color: hair });
    head.push({ s: [0.28, 0.2, 0.06], p: [0, 0.06, 0.15], color: hair });
  } else if (v % 3 === 1) {
    head.push({ s: [0.3, 0.07, 0.3], p: [0, 0.15, 0], color: 0x2a3a2a });
    head.push({ s: [0.28, 0.025, 0.12], p: [0, 0.135, -0.18], color: 0x2a3a2a });
  } else {
    head.push({ s: [0.12, 0.04, 0.16], p: [0.05, 0.145, -0.02], color: BLOOD });
    head.push({ s: [0.14, 0.05, 0.12], p: [-0.05, 0.12, 0.05], color: hair });
  }
  head.push({ s: [0.07, 0.09, 0.012], p: [v % 2 ? 0.07 : -0.07, -0.01, -0.136], color: BLOOD });
  const eyes: Block[] = [
    { s: [0.05, 0.032, 0.02], p: [-0.07, 0.035, -0.135], color: 0xff3a14 },
    { s: [0.05, 0.032, 0.02], p: [0.07, 0.035, -0.135], color: 0xff3a14 },
  ];

  // --- Cuello cortado (para cuando vuela la cabeza) ---
  const stump: Block[] = [
    { s: [0.12, 0.08, 0.12], p: [0, 0, 0], color: BLOOD },
    { s: [0.05, 0.1, 0.05], p: [0, 0.02, 0], color: BONE },
  ];

  // --- Brazos: pivote en el hombro, cuelgan hacia −Y ---
  const arm = (side: number): Block[] => {
    const b: Block[] = [];
    const t = 0.13 * limbW;
    b.push({ s: [t, 0.34, t], p: [0, -0.17, 0], color: shirt });
    for (let i = 0; i < 3; i++) b.push({ s: [t + 0.012, 0.05 + r() * 0.05, t + 0.012], p: [(i - 1) * (t / 3), -0.35 - r() * 0.03, 0], color: shade(shirt, 0.8) });
    const stumpArm = (v === 1 && side < 0) || (v === 4 && side > 0);
    if (stumpArm) {
      // Brazo cercenado a medio antebrazo, con el hueso asomando.
      b.push({ s: [t * 0.85, 0.12, t * 0.85], p: [0, -0.42, 0], color: skin });
      b.push({ s: [t * 0.9, 0.05, t * 0.9], p: [0, -0.5, 0], color: BLOOD });
      b.push({ s: [0.035, 0.1, 0.035], p: [0, -0.53, 0], color: BONE });
    } else {
      b.push({ s: [0.11 * limbW, 0.3, 0.11 * limbW], p: [0, -0.5, 0], color: skin });
      b.push({ s: [0.1 * limbW, 0.1, 0.085 * limbW], p: [0, -0.7, 0], color: shade(skin, 0.9) });
      for (let i = 0; i < 4; i++) b.push({ s: [0.018, 0.075, 0.018], p: [(i - 1.5) * 0.024 * limbW, -0.78, -0.012], color: shade(skin, 0.82) });
      if (r() < 0.6) b.push({ s: [0.115 * limbW, 0.08, 0.115 * limbW], p: [0, -0.46 - r() * 0.1, 0], color: BLOOD });
    }
    return b;
  };

  // --- Piernas: pivote en la cadera ---
  const leg = (side: number): Block[] => {
    const b: Block[] = [];
    const t = 0.17 * limbW;
    b.push({ s: [t, 0.44, t], p: [0, -0.22, 0], color: pants });
    const torn = (v + (side > 0 ? 1 : 0)) % 2 === 0;
    b.push({ s: [t - 0.01, torn ? 0.16 : 0.3, t - 0.01], p: [0, torn ? -0.52 : -0.59, 0], color: pants });
    if (torn) {
      b.push({ s: [0.12 * limbW, 0.16, 0.12 * limbW], p: [0, -0.68, 0], color: skin });
      b.push({ s: [0.13 * limbW, 0.06, 0.12 * limbW], p: [0.012, -0.6, -0.02], color: BLOOD });
    }
    b.push({ s: [0.17 * limbW, 0.1, 0.27 * limbW], p: [0, -0.8, -0.05], color: SHOE });
    return b;
  };

  return {
    torso: blockGeometry(torso),
    head: blockGeometry(head),
    eyes: blockGeometry(eyes),
    lArm: blockGeometry(arm(-1)),
    rArm: blockGeometry(arm(1)),
    lLeg: blockGeometry(leg(-1)),
    rLeg: blockGeometry(leg(1)),
    stump: blockGeometry(stump),
  };
}
