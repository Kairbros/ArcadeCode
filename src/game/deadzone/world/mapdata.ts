// Mapa SECTOR 09 en datos puros: muros con huecos, puertas comprables, ventanas barricables,
// compras de pared, props, puntos de aparición y luces. El constructor está en map.ts.
//
// Ejes: X derecha, Z hacia el sur (+Z). El jugador empieza en el patio mirando hacia −Z (la calle).

import type { TextureName } from "./textures";

export type MatKind = TextureName | "emissiveRed" | "emissiveGreen" | "glass" | "dark";

export interface Hole {
  /** Distancia desde el inicio del muro hasta el comienzo del hueco (m). */
  from: number;
  /** Distancia hasta el final del hueco. */
  to: number;
  kind: "open" | "door" | "window";
  /** Puertas: identificador, precio y cartel. */
  id?: string;
  cost?: number;
  label?: string;
}

export interface WallRun {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  h?: number;
  /** Grosor del muro. */
  t?: number;
  mat: MatKind;
  matTop?: MatKind;
  holes?: Hole[];
}

export interface PropSpec {
  kind:
    | "car"
    | "van"
    | "barrel"
    | "crate"
    | "dumpster"
    | "sandbag"
    | "fence"
    | "shelf"
    | "counter"
    | "desk"
    | "table"
    | "container"
    | "fountain"
    | "sign"
    | "rubble"
    | "lamp"
    | "pipe"
    | "corpse"
    | "cone"
    | "barrelFire"
    | "tires"
    | "bench"
    | "barbed"
    | "deadTree"
    | "bus"
    | "streetlight"
    | "tent"
    | "generator";
  x: number;
  z: number;
  rot?: number;
  /** Variante de color / tamaño. */
  v?: number;
}

export interface BuySpec {
  id: string;
  /** "weapon" compra el arma; si ya la tienes, ofrece munición. */
  weaponId: string;
  x: number;
  z: number;
  /** Hacia dónde mira el cartel (radianes, 0 = +X). */
  facing: number;
}

export interface LightSpec {
  x: number;
  z: number;
  y: number;
  color: number;
  intensity: number;
  distance: number;
  flicker?: boolean;
}

export const MAP_BOUNDS = { minX: -26, maxX: 26, minZ: -38, maxZ: 20 };

/** Recintos transitables: sirven para saber de qué lado de un hueco está el interior. */
export const ROOMS: { x0: number; z0: number; x1: number; z1: number; name: string }[] = [
  { name: "PATIO", x0: -8, z0: 8, x1: 8, z1: 18 },
  { name: "CALLE", x0: -5, z0: -8, x1: 5, z1: 8 },
  { name: "TIENDA", x0: 5, z0: -8, x1: 12, z1: 1 },
  { name: "PLAZA", x0: -14, z0: -24, x1: 14, z1: -8 },
  { name: "ARMERÍA", x0: 14, z0: -24, x1: 22, z1: -12 },
  { name: "BLOQUE B", x0: -23, z0: -24, x1: -14, z1: -12 },
  { name: "PASAJE", x0: -20, z0: -13, x1: -14, z1: 9 },
  { name: "CALLEJÓN", x0: -20, z0: 9, x1: -8, z1: 18 },
  { name: "CALLE NORTE", x0: -5, z0: -32, x1: 5, z1: -24 },
  { name: "DEPÓSITO", x0: -12, z0: -38, x1: 12, z1: -32 },
];

/** ¿El punto cae dentro de algún recinto? */
export function inRoom(x: number, z: number): string | null {
  for (const r of ROOMS) {
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r.name;
  }
  return null;
}

/** Recintos con suelo propio y techo (la lluvia no cae dentro). */
export const INTERIORS: { x0: number; z0: number; x1: number; z1: number; mat: "tile" | "concrete" | "wood" }[] = [
  { x0: 5, z0: -8, x1: 12, z1: 1, mat: "tile" },
  { x0: 14, z0: -24, x1: 22, z1: -12, mat: "concrete" },
  { x0: -23, z0: -24, x1: -14, z1: -12, mat: "wood" },
  { x0: -12, z0: -38, x1: 12, z1: -32, mat: "concrete" },
  { x0: -20, z0: -13, x1: -14, z1: 9, mat: "concrete" },
];

export const PLAYER_SPAWN = { x: 0, y: 0, z: 14, yaw: 0 };

/** Muros del sector. Cada uno puede llevar huecos (pasos, puertas o ventanas). */
export const WALLS: WallRun[] = [
  // --- Perímetro del sector ---
  { x1: -26, z1: 20, x2: 26, z2: 20, h: 5, mat: "concrete" },
  { x1: -26, z1: -38, x2: 26, z2: -38, h: 5, mat: "concrete" },
  { x1: -26, z1: -38, x2: -26, z2: 20, h: 5, mat: "concrete" },
  { x1: 26, z1: -38, x2: 26, z2: 20, h: 5, mat: "concrete" },

  // --- Patio inicial (x −8..8, z 8..18) ---
  { x1: -8, z1: 8, x2: -8, z2: 18, mat: "concrete", holes: [{ from: 3.5, to: 5.5, kind: "open" }] },
  { x1: 8, z1: 8, x2: 8, z2: 18, mat: "concrete", holes: [{ from: 4, to: 6, kind: "window", id: "w_patio_e" }] },
  {
    x1: -8,
    z1: 8,
    x2: 8,
    z2: 8,
    mat: "brick",
    holes: [
      { from: 3, to: 13, kind: "open" },
      { from: 14.5, to: 15.9, kind: "window", id: "w_patio_n" },
    ],
  },
  { x1: -8, z1: 18, x2: 8, z2: 18, mat: "brick", holes: [{ from: 5, to: 7, kind: "window", id: "w_patio_s" }] },

  // --- Calle principal (x −5..5, z −8..8) ---
  {
    x1: -5,
    z1: -8,
    x2: -5,
    z2: 8,
    mat: "concrete",
    holes: [{ from: 5, to: 7, kind: "window", id: "w_calle_w" }],
  },
  {
    x1: 5,
    z1: -8,
    x2: 5,
    z2: 8,
    mat: "brick",
    holes: [{ from: 6, to: 8, kind: "door", id: "d_tienda", cost: 750, label: "TIENDA" }],
  },

  // --- Tienda (x 5..12, z −8..1) ---
  { x1: 12, z1: -8, x2: 12, z2: 1, mat: "brick", holes: [{ from: 3, to: 5, kind: "window", id: "w_tienda_e" }] },
  { x1: 5, z1: 1, x2: 12, z2: 1, mat: "brick" },

  // --- Plaza (x −14..14, z −24..−8) ---
  {
    x1: -14,
    z1: -24,
    x2: -14,
    z2: -8,
    mat: "concrete",
    holes: [
      { from: 11, to: 13, kind: "door", id: "d_pasillo", cost: 750, label: "PASAJE OESTE" },
      { from: 6, to: 8, kind: "door", id: "d_edificio", cost: 1250, label: "BLOQUE B" },
    ],
  },
  { x1: 14, z1: -24, x2: 14, z2: -8, mat: "concrete", holes: [{ from: 7, to: 9, kind: "door", id: "d_armeria", cost: 1000, label: "ARMERÍA" }] },
  {
    x1: -14,
    z1: -24,
    x2: 14,
    z2: -24,
    mat: "brick",
    holes: [
      { from: 11, to: 17, kind: "open" },
      { from: 4, to: 6, kind: "window", id: "w_plaza_nw" },
      { from: 22, to: 24, kind: "window", id: "w_plaza_ne" },
    ],
  },
  { x1: -14, z1: -8, x2: -5, z2: -8, mat: "concrete" },
  { x1: 5, z1: -8, x2: 14, z2: -8, mat: "concrete" },

  // --- Calle norte (x −5..5, z −32..−24) ---
  { x1: -5, z1: -32, x2: -5, z2: -24, mat: "brick" },
  { x1: 5, z1: -32, x2: 5, z2: -24, mat: "brick" },

  // --- Zona norte / depósito (x −12..12, z −38..−32) ---
  { x1: -12, z1: -38, x2: -12, z2: -32, mat: "metal" },
  { x1: 12, z1: -38, x2: 12, z2: -32, mat: "metal", holes: [{ from: 2, to: 4, kind: "window", id: "w_norte_e" }] },
  { x1: -12, z1: -32, x2: 12, z2: -32, mat: "metal", holes: [{ from: 11, to: 13, kind: "door", id: "d_norte", cost: 1500, label: "DEPÓSITO NORTE" }] },

  // --- Bloque B (x −23..−14, z −24..−12) ---
  { x1: -23, z1: -24, x2: -23, z2: -12, mat: "brick" },
  { x1: -23, z1: -24, x2: -14, z2: -24, mat: "brick", holes: [{ from: 4, to: 6, kind: "window", id: "w_edificio_n" }] },
  { x1: -23, z1: -12, x2: -14, z2: -12, mat: "brick" },

  // --- Armería (x 14..22, z −24..−12) ---
  {
    x1: 22,
    z1: -24,
    x2: 22,
    z2: -12,
    mat: "metal",
    holes: [{ from: 8, to: 10, kind: "window", id: "w_armeria_e" }],
  },
  { x1: 14, z1: -24, x2: 22, z2: -24, mat: "metal" },
  { x1: 14, z1: -12, x2: 22, z2: -12, mat: "metal" },

  // --- Pasaje oeste (x −20..−14, z −13..9) ---
  { x1: -20, z1: -13, x2: -20, z2: 9, mat: "concrete" },
  { x1: -20, z1: -13, x2: -14, z2: -13, mat: "concrete" },
  { x1: -14, z1: -8, x2: -14, z2: 9, mat: "concrete", holes: [{ from: 13, to: 15, kind: "window", id: "w_pasillo_e" }] },

  // --- Callejón oeste (x −20..−8, z 9..18) ---
  { x1: -20, z1: 9, x2: -20, z2: 18, mat: "brick" },
  { x1: -14, z1: 9, x2: -8, z2: 9, mat: "concrete" },
  { x1: -20, z1: 18, x2: -8, z2: 18, mat: "brick", holes: [{ from: 4, to: 6, kind: "window", id: "w_callejon_s" }] },
];

/** Puntos de aparición de los zombis: fuera de los recintos, siempre en calle abierta. */
export const SPAWNS: { x: number; z: number }[] = [
  { x: -22, z: 15 },
  { x: -11, z: 19.5 },
  { x: 12, z: 12 },
  { x: 20, z: 14 },
  { x: 18, z: -4 },
  { x: 18, z: -30 },
  { x: -18, z: -30 },
  { x: -25, z: -18 },
  { x: 8, z: -30 },
  { x: -11, z: 3 },
  { x: 10, z: 6 },
  { x: 0, z: 19 },
];

/** Compras de pared (tiza): arma y munición. El cartel va pegado a un muro real. */
export const BUYS: BuySpec[] = [
  { id: "buy_pistol_ammo", weaponId: "pistol", x: -6.5, z: 17.6, facing: -Math.PI / 2 },
  { id: "buy_smg", weaponId: "smg", x: -4.62, z: 2, facing: 0 },
  { id: "buy_shotgun", weaponId: "shotgun", x: 21.62, z: -18, facing: Math.PI },
  { id: "buy_rifle", weaponId: "rifle", x: -22.62, z: -18, facing: 0 },
  { id: "buy_revolver", weaponId: "revolver", x: 4.62, z: 4.5, facing: Math.PI },
  { id: "buy_sniper", weaponId: "sniper", x: 4.62, z: -28, facing: Math.PI },
];

/** Caja misteriosa: en el centro de la plaza, el corazón del sector. */
export const MYSTERY_BOX = { x: 0, z: -16, y: 0 };

/** Mejorador de armas (Bloque B, pared norte; mira al sur) y interruptor de la energía (depósito norte). */
export const UPGRADER = { x: -21.4, z: -23.12, facing: Math.PI / 2 };
export const POWER_SWITCH = { x: -1.5, z: -37.6, facing: Math.PI / 2 };

export const PROPS: PropSpec[] = [
  // Patio
  { kind: "car", x: -4.5, z: 16.5, rot: 0.2, v: 1 },
  { kind: "sandbag", x: 4, z: 10.5, rot: 0 },
  { kind: "sandbag", x: 6, z: 10.5, rot: Math.PI / 2 },
  { kind: "barrel", x: 7, z: 16.5 },
  { kind: "barrel", x: 6.2, z: 17.3, v: 1 },
  { kind: "crate", x: -7, z: 9.5 },
  { kind: "dumpster", x: 7.2, z: 8.8, rot: 0.3 },

  // Calle principal
  { kind: "car", x: 2.6, z: 3, rot: -0.15 },
  { kind: "dumpster", x: 3.8, z: -4.2, rot: 1.5 },
  { kind: "crate", x: 4, z: -6.5 },
  { kind: "rubble", x: 1, z: -2.5 },
  { kind: "sign", x: -4.2, z: 6, rot: Math.PI / 2 },

  // Plaza
  { kind: "van", x: -8, z: -21, rot: 0.1 },
  { kind: "fence", x: 6, z: -10.5, rot: 0 },
  { kind: "fence", x: 9, z: -10.5, rot: 0 },
  { kind: "barrel", x: 11, z: -22 },
  { kind: "barrel", x: 11.8, z: -21.4, v: 2 },
  { kind: "crate", x: -12, z: -10 },
  { kind: "rubble", x: 5, z: -19 },
  { kind: "rubble", x: -3, z: -22 },

  // Tienda
  { kind: "shelf", x: 7.5, z: -6, rot: 0 },
  { kind: "shelf", x: 7.5, z: -3.5, rot: 0 },
  { kind: "counter", x: 10.5, z: -1.5, rot: Math.PI / 2 },
  { kind: "crate", x: 11, z: -7 },

  // Armería
  { kind: "counter", x: 15.5, z: -18, rot: Math.PI / 2 },
  { kind: "crate", x: 20, z: -22 },
  { kind: "crate", x: 19, z: -13.5, v: 1 },
  { kind: "shelf", x: 16, z: -22.5, rot: 0 },

  // Bloque B
  { kind: "desk", x: -18, z: -20 },
  { kind: "desk", x: -20.5, z: -14 },
  { kind: "table", x: -16.5, z: -15.5, rot: 0.6 },
  { kind: "rubble", x: -15.5, z: -22.6 },

  // Pasaje y callejón
  { kind: "container", x: -17, z: -11, rot: 0 },
  { kind: "barrel", x: -19, z: 4 },
  { kind: "dumpster", x: -18, z: 10.5, rot: 0.1 },
  { kind: "crate", x: -12, z: 14 },
  { kind: "pipe", x: -9.5, z: 16, rot: 0 },

  // Calle norte y depósito
  { kind: "car", x: -2.5, z: -27, rot: 1.4, v: 2 },
  { kind: "container", x: -8, z: -35, rot: Math.PI / 2 },
  { kind: "container", x: 8.5, z: -35.5, rot: Math.PI / 2 },
  { kind: "crate", x: -4, z: -34 },
  { kind: "barrel", x: 4, z: -37 },
  { kind: "rubble", x: 2, z: -33 },

  // --- Ambientación ---
  // Calle: autobús siniestrado, farolas, conos y cadáveres.
  { kind: "bus", x: -2.9, z: -0.2, rot: 0.05 },
  { kind: "streetlight", x: -4.4, z: 5.5, rot: Math.PI / 2 },
  { kind: "streetlight", x: 4.4, z: -6.5, rot: -Math.PI / 2, v: 1 },
  { kind: "cone", x: 2.2, z: 6.8, rot: 0.3 },
  { kind: "corpse", x: 0.5, z: 5.2, rot: 0.6, v: 1 },
  { kind: "corpse", x: 3.2, z: -3.4, rot: 2.4, v: 2 },
  { kind: "tires", x: 4, z: 0.8 },
  // Patio: generador, tienda de campaña, fuego y alambrada.
  { kind: "barrelFire", x: -6.3, z: 13.2 },
  { kind: "tent", x: -4.6, z: 16.2, rot: 0.15 },
  { kind: "generator", x: 12.3, z: -16.4, rot: -Math.PI / 2 },
  { kind: "corpse", x: -1.5, z: 11.3, rot: 0.2 },
  { kind: "corpse", x: 3.4, z: 15.8, rot: 4.1, v: 3 },
  { kind: "barbed", x: 3.7, z: 9.0, rot: 0 },
  { kind: "barbed", x: -3.7, z: 9.0, rot: 0 },
  { kind: "bench", x: 1.6, z: 17.2, rot: Math.PI },
  // Plaza: el corazón del sector. Bancos y árboles secos alrededor de la caja, fuegos en las esquinas.
  { kind: "bench", x: -7.2, z: -16, rot: Math.PI / 2 },
  { kind: "bench", x: 7.2, z: -16, rot: -Math.PI / 2 },
  { kind: "deadTree", x: -11.5, z: -19.5 },
  { kind: "deadTree", x: 12, z: -12, v: 2 },
  { kind: "deadTree", x: 11.6, z: -20.5, v: 4 },
  { kind: "barrelFire", x: -5.8, z: -10.5 },
  { kind: "barrelFire", x: 5.5, z: -21.5 },
  { kind: "streetlight", x: -7.5, z: -10.4, rot: 0, v: 1 },
  { kind: "streetlight", x: 7.5, z: -22.4, rot: Math.PI },
  { kind: "corpse", x: 4.2, z: -12.5, rot: 0.9 },
  { kind: "corpse", x: -4.8, z: -19.8, rot: 3.6, v: 2 },
  { kind: "cone", x: 2.8, z: -9.6, rot: 0.2 },
  { kind: "tires", x: 8.6, z: -22.4 },
  { kind: "car", x: 9.6, z: -15, rot: 1.2, v: 3 },
  // Armería y Bloque B.
  { kind: "corpse", x: 18, z: -16, rot: 5.2 },
  { kind: "generator", x: 20.6, z: -13.2, rot: Math.PI },
  { kind: "corpse", x: -18.5, z: -17, rot: 1.4, v: 1 },
  // Pasaje, callejón y calle norte.
  { kind: "corpse", x: -16.5, z: -2.5, rot: 0.3, v: 3 },
  { kind: "barbed", x: -17, z: 7, rot: Math.PI / 2 },
  { kind: "corpse", x: -13, z: 15.6, rot: 2.8 },
  { kind: "deadTree", x: -9.8, z: 12.4, v: 1 },
  { kind: "corpse", x: 1.6, z: -28.4, rot: 1.9, v: 2 },
  { kind: "tires", x: 3.6, z: -30.2 },
  { kind: "cone", x: -3, z: -31, rot: 0.8 },
  { kind: "barrelFire", x: 6.2, z: -34.6 },
  { kind: "corpse", x: -6, z: -36, rot: 0.4 },
];

/** Luces del mapa (pocas y con distancia corta para no matar el rendimiento). */
export const LIGHTS: LightSpec[] = [
  { x: 0, z: 11, y: 4.6, color: 0xffb066, intensity: 22, distance: 16 },
  { x: 0, z: 2, y: 4.6, color: 0xff7a4a, intensity: 18, distance: 14, flicker: true },
  { x: 0, z: -16, y: 5.2, color: 0xff5a4a, intensity: 26, distance: 20, flicker: true },
  { x: -10, z: -16, y: 3.2, color: 0x66ffcc, intensity: 10, distance: 9 },
  { x: 8, z: -4, y: 3.1, color: 0xffe0b0, intensity: 12, distance: 9, flicker: true },
  { x: 18, z: -18, y: 3.2, color: 0xffd9a0, intensity: 14, distance: 10 },
  { x: -18, z: -18, y: 3.2, color: 0xa0d8ff, intensity: 12, distance: 10, flicker: true },
  { x: 0, z: -35, y: 4.2, color: 0xbfe0ff, intensity: 16, distance: 14, flicker: true },
  { x: -17, z: 13, y: 4.2, color: 0xff8a5a, intensity: 14, distance: 12 },
  // Relleno para que la calle y los accesos no queden a oscuras.
  { x: 0, z: 7.5, y: 4.4, color: 0xffc48a, intensity: 20, distance: 15 },
  { x: 0, z: -5, y: 4.4, color: 0xff9a6a, intensity: 20, distance: 15 },
  { x: -6, z: -13, y: 4.6, color: 0xff6a4a, intensity: 18, distance: 16 },
  { x: 6, z: -13, y: 4.6, color: 0x9fd8ff, intensity: 16, distance: 15 },
  { x: -17, z: 3, y: 3.6, color: 0xffd0a0, intensity: 16, distance: 12 },
];
