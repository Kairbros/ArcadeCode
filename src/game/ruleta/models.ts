// Modelos 3D de la escena, hechos con cajas (estilo de bloques) y la luz y sombras de Three.js.
// Unidades: metros; la mesa es cuadrada, de 2 × 2, con el tablero en y = 0. Los personajes y objetos
// de cada asiento miran hacia -z (hacia el centro de la mesa); la escopeta apunta con el cañón hacia -z.
import * as THREE from "three";
import {
  I_ADRENALINE, I_BEER, I_CIGS, I_CUFFS, I_INVERTER, I_LUPA, I_MEDS, I_PHONE, I_SAW,
} from "./config";
import { aim, len, mix, sub, type V3 } from "./math3d";
import {
  canTexture, feltTexture, floorTexture, medsTexture, packTexture, wallTexture, woodTexture,
} from "./textures";

export const TABLE_R = 1; // media anchura de la mesa
export const SEAT_R = 1.45; // distancia del centro a cada jugador
export const FLOOR_Y = -0.75;
export const LAMP_Y = 1.3;
export const DEALER_SCALE = 1.3; // el crupier impone desde el otro lado de la mesa
/** Cintura: el cuerpo se inclina alrededor de este punto (coordenadas del asiento). */
export const PIVOT: V3 = [0, 0.02, 0.05];

// --- Utilidades ---

type Mat = THREE.Material | THREE.Material[];

const std = (color: number, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const glowMat = (color: number) => new THREE.MeshBasicMaterial({ color });

/** Caja de tamaño `s` centrada en `c`, con giro opcional (cabeceo, guiñada, alabeo). */
function box(s: V3, mat: Mat, c: V3 = [0, 0, 0], r: V3 = [0, 0, 0], shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...s), mat);
  m.position.set(...c);
  m.rotation.set(r[0], r[1], r[2], "YXZ");
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

/** Caja alargada entre dos puntos (culatas, varillas). */
function beam(a: V3, b: V3, w: number, h: number, mat: Mat): THREE.Mesh {
  const [yaw, pitch] = aim(sub(b, a));
  return box([w, h, len(sub(b, a))], mat, mix(a, b, 0.5), [pitch, yaw, 0]);
}

function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...children);
  return g;
}

// Materiales compartidos (se crean al construir la primera escena).
let M: ReturnType<typeof materials> | null = null;
function materials() {
  const wood = woodTexture();
  return {
    metal: std(0x2c3036, 0.35, 0.75),
    darkMetal: std(0x1a1b1f, 0.5, 0.6),
    steel: std(0xb8bcc2, 0.25, 0.85),
    brass: std(0xc9a142, 0.3, 0.9),
    wood: std(0xffffff, 0.6, 0, { map: wood }),
    darkWood: std(0x7a6050, 0.7, 0, { map: wood }),
    black: std(0x0a0909, 1),
    live: std(0x9c1a1a, 0.45),
    blank: std(0x4c7cc4, 0.45),
  };
}
const mats = () => (M ??= materials());

// --- Sala ---

export function buildRoom(): THREE.Group {
  const g = new THREE.Group();
  const floor = box([8, 0.02, 8], std(0xffffff, 0.9, 0, { map: floorTexture() }), [0, FLOOR_Y - 0.01, 0]);
  floor.castShadow = false;
  g.add(floor);
  const wallMat = std(0xffffff, 0.95, 0, { map: wallTexture() });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    g.add(box([6.4, 3.4, 0.1], wallMat, [Math.sin(a) * -3.25, FLOOR_Y + 1.7, Math.cos(a) * -3.25], [0, a, 0], false));
  }
  g.add(box([6.4, 0.1, 6.4], std(0x0c0c0c, 1), [0, FLOOR_Y + 3.45, 0], [0, 0, 0], false));
  // Tuberías en la pared del fondo y una puerta a un lado.
  const pipe = mats().darkMetal;
  g.add(box([6.4, 0.09, 0.09], pipe, [0, 1.6, -3.12], [0, 0, 0], false));
  g.add(box([6.4, 0.05, 0.05], pipe, [0, 1.45, -3.15], [0, 0, 0], false));
  g.add(box([0.07, 3.4, 0.07], pipe, [1.2, FLOOR_Y + 1.7, -3.13], [0, 0, 0], false));
  g.add(box([0.06, 2.1, 1], std(0x2a1d14, 0.8, 0, { map: woodTexture() }), [-3.17, FLOOR_Y + 1.05, -0.8], [0, 0, 0], false));
  g.add(box([0.05, 0.05, 0.05], mats().brass, [-3.13, FLOOR_Y + 1.0, -0.45], [0, 0, 0], false));
  return g;
}

/** Mesa cuadrada: tapete encima, canto de madera y cuatro patas. */
export function buildTable(): THREE.Group {
  const m = mats();
  const felt = std(0xffffff, 0.95, 0, { map: feltTexture() });
  const top = box([TABLE_R * 2, 0.07, TABLE_R * 2], [m.darkWood, m.darkWood, felt, m.black, m.darkWood, m.darkWood], [0, -0.035, 0]);
  top.castShadow = false;
  const e = TABLE_R + 0.015;
  const g = group(
    top,
    box([TABLE_R * 2 + 0.1, 0.05, 0.07], m.wood, [0, 0.005, e]),
    box([TABLE_R * 2 + 0.1, 0.05, 0.07], m.wood, [0, 0.005, -e]),
    box([0.07, 0.05, TABLE_R * 2 - 0.04], m.wood, [e, 0.005, 0]),
    box([0.07, 0.05, TABLE_R * 2 - 0.04], m.wood, [-e, 0.005, 0]),
  );
  const h = -FLOOR_Y - 0.07;
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(box([0.1, h, 0.1], m.darkWood, [x * 0.85, -0.07 - h / 2, z * 0.85]));
  return g;
}

/** Lámpara colgante: pantalla de cuatro lados, bombilla y cable. La luz la pone el render. */
export function buildLamp(): THREE.Group {
  const shade = std(0x37402f, 0.6, 0.4, { side: THREE.DoubleSide });
  const g = group(
    new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.34, 0.2, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.1, 0), shade),
    box([0.012, 1.8, 0.012], mats().black, [0, 1.1, 0], [0, 0, 0], false),
    box([0.07, 0.07, 0.07], glowMat(0xfff1cc), [0, 0.06, 0], [0, 0, 0], false),
  );
  g.position.set(0, LAMP_Y, 0);
  return g;
}

// --- Escopeta ---
// Origen en el cajón de mecanismos; el cañón apunta hacia -z.

export const GUN_GRIP: V3 = [0, -0.06, 0.12];
export const GUN_PUMP: V3 = [0, -0.035, -0.22];
const barrelLength = (sawed: boolean) => (sawed ? 0.22 : 0.45);
export const gunMuzzle = (sawed: boolean): V3 => [0, 0.025, -0.13 - barrelLength(sawed)];

export interface GunModel {
  root: THREE.Group;
  full: THREE.Group;
  sawed: THREE.Group;
}

export function buildGun(): GunModel {
  const m = mats();
  const barrel = (sawed: boolean) => {
    const b = barrelLength(sawed);
    const end = -0.13 - b;
    return group(
      box([0.045, 0.045, b], m.metal, [0, 0.025, -0.13 - b / 2]),
      box([0.052, 0.052, 0.016], m.darkMetal, [0, 0.025, end + 0.008]),
      box([0.028, 0.028, 0.004], m.black, [0, 0.025, end - 0.001]),
      box([0.008, 0.014, 0.014], m.steel, [0, 0.055, end + 0.025]),
      box([0.034, 0.032, b * 0.75], m.metal, [0, -0.022, -0.1 - (b * 0.75) / 2]),
    );
  };
  const full = barrel(false), sawed = barrel(true);
  const pump = group(box([0.066, 0.06, 0.14], m.wood, GUN_PUMP));
  for (let i = 0; i < 5; i++) pump.add(box([0.07, 0.064, 0.006], m.darkWood, [0, GUN_PUMP[1], GUN_PUMP[2] - 0.05 + i * 0.025]));
  const root = group(
    box([0.066, 0.1, 0.22], m.metal, [0, 0, -0.02]),
    box([0.07, 0.022, 0.1], m.steel, [0, 0.012, -0.04]), // ventana de expulsión
    box([0.02, 0.008, 0.07], m.darkMetal, [0, -0.07, 0.04]), // guardamonte
    box([0.02, 0.022, 0.008], m.darkMetal, [0, -0.06, 0.005]),
    box([0.02, 0.022, 0.008], m.darkMetal, [0, -0.06, 0.075]),
    box([0.006, 0.022, 0.006], m.steel, [0, -0.055, 0.04]), // gatillo
    beam([0, -0.012, 0.08], [0, -0.085, 0.42], 0.055, 0.1, m.wood), // culata
    box([0.06, 0.12, 0.014], m.black, [0, -0.09, 0.425], [-0.21, 0, 0]), // cantonera
    pump,
    full,
    sawed,
  );
  return { root, full, sawed };
}

// --- Cartuchos (de pie, base en y = 0) ---

export function buildShell(live: boolean): THREE.Group {
  const m = mats();
  const body = live ? m.live : m.blank;
  return group(
    box([0.05, 0.006, 0.05], m.brass, [0, 0.003, 0]),
    box([0.046, 0.02, 0.046], m.brass, [0, 0.016, 0]),
    box([0.042, 0.07, 0.042], body, [0, 0.061, 0]),
    box([0.028, 0.012, 0.028], body, [0, 0.102, 0]),
  );
}

// --- Objetos (apoyados en y = 0) ---

export function buildItem(item: number): THREE.Group {
  const m = mats();
  switch (item) {
    case I_LUPA: {
      const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6f2, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.45 });
      const rim = m.darkMetal;
      return group(
        box([0.09, 0.014, 0.012], rim, [0, 0.007, -0.039]),
        box([0.09, 0.014, 0.012], rim, [0, 0.007, 0.039]),
        box([0.012, 0.014, 0.066], rim, [-0.039, 0.007, 0]),
        box([0.012, 0.014, 0.066], rim, [0.039, 0.007, 0]),
        box([0.066, 0.004, 0.066], glass, [0, 0.008, 0], [0, 0, 0], false),
        box([0.075, 0.016, 0.018], m.darkWood, [0.08, 0.008, 0]),
      );
    }
    case I_CIGS: {
      const pack = std(0xffffff, 0.7, 0, { map: packTexture() });
      const paper = std(0xf2efe6, 0.8), filter = std(0xc87a34, 0.8);
      return group(
        box([0.056, 0.026, 0.088], [std(0xa8222a, 0.7), std(0xa8222a, 0.7), pack, std(0xa8222a, 0.7), std(0xece8dc, 0.7), std(0xa8222a, 0.7)], [0, 0.013, 0]),
        box([0.01, 0.01, 0.03], paper, [-0.012, 0.016, -0.055]),
        box([0.011, 0.011, 0.012], filter, [-0.012, 0.016, -0.074]),
        box([0.01, 0.01, 0.018], paper, [0.01, 0.016, -0.05]),
        box([0.011, 0.011, 0.012], filter, [0.01, 0.016, -0.064]),
      );
    }
    case I_BEER: {
      const can = std(0xffffff, 0.35, 0.3, { map: canTexture() });
      return group(
        box([0.058, 0.1, 0.058], [can, can, m.steel, m.steel, can, can], [0, 0.05, 0]),
        box([0.05, 0.006, 0.05], m.steel, [0, 0.103, 0]),
        box([0.012, 0.003, 0.022], m.steel, [0, 0.107, 0.008]),
      );
    }
    case I_SAW: {
      const teeth = group();
      for (let k = 0; k < 9; k++) teeth.add(box([0.008, 0.004, 0.008], m.steel, [-0.08 + k * 0.016, 0.002, -0.026], [0, Math.PI / 4, 0]));
      return group(
        box([0.15, 0.004, 0.045], m.steel, [-0.015, 0.002, 0]),
        teeth,
        box([0.06, 0.032, 0.06], std(0x8a2a1c, 0.6), [0.09, 0.016, 0]),
        box([0.026, 0.034, 0.024], m.black, [0.095, 0.017, 0], [0, 0, 0], false),
      );
    }
    case I_CUFFS: {
      const cuff = (x: number) => group(
        box([0.055, 0.012, 0.01], m.steel, [x, 0.006, -0.0225]),
        box([0.055, 0.012, 0.01], m.steel, [x, 0.006, 0.0225]),
        box([0.01, 0.012, 0.035], m.steel, [x - 0.0225, 0.006, 0]),
        box([0.01, 0.012, 0.035], m.steel, [x + 0.0225, 0.006, 0]),
      );
      return group(
        cuff(-0.04), cuff(0.04),
        box([0.026, 0.006, 0.006], std(0x6c7078, 0.4, 0.8), [0, 0.006, 0]),
        box([0.018, 0.016, 0.026], m.steel, [-0.075, 0.008, 0]),
        box([0.018, 0.016, 0.026], m.steel, [0.075, 0.008, 0]),
      );
    }
    case I_PHONE: {
      const keys = group();
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) keys.add(box([0.009, 0.003, 0.006], std(0x6a6c74, 0.5), [(c - 1) * 0.013, 0.017, 0.012 + r * 0.009], [0, 0, 0], false));
      return group(
        box([0.05, 0.016, 0.1], std(0x1c1d22, 0.3, 0.3), [0, 0.008, 0]),
        box([0.036, 0.002, 0.042], glowMat(0x9be08a), [0, 0.017, -0.022], [0, 0, 0], false),
        keys,
      );
    }
    case I_INVERTER: {
      const yellow = std(0xd8b02c, 0.5), ink = std(0x111111, 0.6);
      return group(
        box([0.064, 0.034, 0.064], yellow, [0, 0.017, 0]),
        box([0.032, 0.003, 0.064], ink, [-0.016, 0.035, 0], [0, 0, 0], false),
        box([0.018, 0.003, 0.005], yellow, [-0.016, 0.0365, 0], [0, 0, 0], false), // "+"
        box([0.005, 0.003, 0.018], yellow, [-0.016, 0.0365, 0], [0, 0, 0], false),
        box([0.018, 0.003, 0.005], ink, [0.016, 0.0365, 0], [0, 0, 0], false), // "−"
        box([0.012, 0.01, 0.012], std(0xb02020, 0.4), [0.02, 0.04, -0.022]),
      );
    }
    case I_MEDS: {
      const amber = new THREE.MeshStandardMaterial({ color: 0xb4641e, roughness: 0.2, transparent: true, opacity: 0.85 });
      const lab = std(0xffffff, 0.8, 0, { map: medsTexture() });
      return group(
        box([0.044, 0.06, 0.044], amber, [0, 0.03, 0]),
        box([0.046, 0.03, 0.046], [lab, lab, amber, amber, lab, lab], [0, 0.03, 0]),
        box([0.05, 0.016, 0.05], std(0xefefef, 0.5), [0, 0.068, 0]),
      );
    }
    case I_ADRENALINE: {
      const clear = new THREE.MeshStandardMaterial({ color: 0xdfe8ec, roughness: 0.1, transparent: true, opacity: 0.45 });
      const dark = std(0x303036, 0.5);
      return group(
        box([0.05, 0.016, 0.016], std(0xd02a2a, 0.3, 0, { emissive: 0x400000 }), [-0.02, 0.012, 0]),
        box([0.085, 0.02, 0.02], clear, [0, 0.012, 0], [0, 0, 0], false),
        box([0.045, 0.003, 0.003], m.steel, [-0.065, 0.012, 0]),
        box([0.03, 0.006, 0.006], dark, [0.055, 0.012, 0]),
        box([0.006, 0.024, 0.024], dark, [0.072, 0.012, 0]),
        box([0.006, 0.006, 0.044], dark, [0.043, 0.012, 0]),
      );
    }
  }
  return group(box([0.05, 0.04, 0.05], std(0x808080), [0, 0.02, 0]));
}

// --- Personajes ---

export interface Character {
  /** En el asiento: se coloca y gira entero. */
  root: THREE.Group;
  /** De cintura para arriba: se inclina (rotation.x) alrededor de PIVOT. */
  upper: THREE.Group;
  head: V3;
  shoulders: [V3, V3];
  /** Ojos que brillan (coordenadas del asiento, antes de inclinarse). */
  eyes: V3[];
  /** Mano de muestra: el render la clona para cada lado. */
  hand: THREE.Group;
  sleeve: THREE.MeshStandardMaterial;
  /** Oscurece (k < 1) o restaura (k = 1) al personaje; se usa cuando queda fuera de la ronda. */
  dim(k: number): void;
}

/** Materiales propios del personaje, para poder oscurecerlos sin afectar a los demás. */
function palette() {
  const list: { m: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; base: THREE.Color; glow: boolean }[] = [];
  const add = <T extends THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>(m: T, glow = false) => {
    list.push({ m, base: m.color.clone(), glow });
    return m;
  };
  return {
    std: (color: number, roughness = 0.85) => add(std(color, roughness)),
    glow: (color: number) => add(glowMat(color), true),
    dim: (k: number) => list.forEach((e) => e.m.color.copy(e.base).multiplyScalar(e.glow ? k * k * k : k)),
  };
}

function legs(p: ReturnType<typeof palette>, pants: number): THREE.Group {
  const cloth = p.std(pants, 0.9), shoe = p.std(0x111111, 0.6), chair = mats().darkWood;
  const g = group(box([0.4, 0.22, 0.26], cloth, [0, -0.11, 0.03]));
  for (const s of [-1, 1]) {
    g.add(
      box([0.15, 0.12, 0.4], cloth, [s * 0.11, -0.25, -0.16]),
      box([0.13, 0.45, 0.13], cloth, [s * 0.11, -0.5, -0.34]),
      box([0.13, 0.06, 0.2], shoe, [s * 0.11, FLOOR_Y + 0.03, -0.38]),
    );
  }
  g.add(box([0.5, 0.05, 0.46], chair, [0, -0.33, 0.05]), box([0.46, 0.75, 0.04], chair, [0, 0.07, 0.29]));
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(box([0.04, 0.4, 0.04], chair, [x * 0.22, FLOOR_Y + 0.2, 0.05 + z * 0.2]));
  return g;
}

function hand(skin: THREE.Material, scale: number): THREE.Group {
  const g = group(box([0.075, 0.028, 0.08], skin));
  [0.05, 0.056, 0.05, 0.042].forEach((l, i) => g.add(box([0.016, 0.022, l], skin, [(i - 1.5) * 0.019, -0.002, -0.04 - l / 2])));
  g.add(box([0.018, 0.02, 0.04], skin, [0.045, -0.002, -0.01], [0, -0.5, 0]));
  g.scale.setScalar(scale);
  return g;
}

/** Monta el personaje: cuerpo que se inclina en la cintura, piernas fijas y mano de muestra. */
function assemble(body: THREE.Group, lower: THREE.Group, scale: number) {
  body.scale.setScalar(scale);
  const upper = new THREE.Group();
  upper.position.set(...PIVOT);
  body.position.set(-PIVOT[0], -PIVOT[1], -PIVOT[2]);
  upper.add(body);
  upper.rotation.order = "YXZ";
  return { root: group(lower, upper), upper };
}

/** El crupier: alto, traje oscuro, cara pálida y huesuda, cuencas negras con ojos que brillan y dientes. */
export function buildDealer(): Character {
  const p = palette();
  const coat = p.std(0x1d1b20, 0.9), lapel = p.std(0x141216, 0.8), shirt = p.std(0xb8b2a4);
  const tie = p.std(0x5c1014, 0.7), skin = p.std(0xc9c2b2, 0.7), skinDark = p.std(0x8f887a, 0.8);
  const black = p.std(0x0a0808, 1), teeth = p.std(0xe6dcc0, 0.4), eye = p.glow(0xfff8e0);
  const eyes: V3[] = [[-0.065, 0.945, -0.156], [0.065, 0.945, -0.156]];
  const body = group(
    box([0.58, 0.6, 0.3], coat, [0, 0.32, 0.02]),
    box([0.68, 0.1, 0.32], coat, [0, 0.6, 0.02]),
    box([0.14, 0.36, 0.012], shirt, [0, 0.42, -0.135]),
    box([0.05, 0.26, 0.008], tie, [0, 0.43, -0.144]),
    box([0.06, 0.04, 0.014], tie, [0, 0.575, -0.145]),
    box([0.07, 0.26, 0.01], lapel, [-0.08, 0.47, -0.142], [0, 0, 0.22]),
    box([0.07, 0.26, 0.01], lapel, [0.08, 0.47, -0.142], [0, 0, -0.22]),
    box([0.1, 0.14, 0.1], skin, [0, 0.69, 0]),
    // Cabeza alargada con la mandíbula más estrecha
    box([0.27, 0.3, 0.27], skin, [0, 0.96, -0.01]),
    box([0.21, 0.08, 0.22], skin, [0, 0.775, -0.025]),
    box([0.25, 0.03, 0.25], skinDark, [0, 1.12, -0.01]),
    box([0.28, 0.035, 0.03], skinDark, [0, 1.0, -0.148]),
    box([0.16, 0.006, 0.006], skinDark, [0, 1.05, -0.146], [0, 0, 0], false),
    box([0.12, 0.006, 0.006], skinDark, [0, 1.07, -0.146], [0, 0, 0], false),
    ...[-1, 1].flatMap((s) => [
      box([0.05, 0.09, 0.012], skinDark, [s * 0.1, 0.86, -0.142], [0, 0, 0], false), // pómulos hundidos
      box([0.085, 0.065, 0.012], black, [s * 0.065, 0.945, -0.146], [0, 0, 0], false), // cuencas
      box([0.026, 0.026, 0.006], eye, [s * 0.065, 0.945, -0.153], [0, 0, 0], false),
      box([0.03, 0.08, 0.05], skin, [s * 0.145, 0.93, 0]), // orejas
    ]),
    box([0.04, 0.07, 0.04], skin, [0, 0.89, -0.16]),
    box([0.17, 0.05, 0.012], black, [0, 0.805, -0.141], [0, 0, 0], false),
    ...[0, 1, 2, 3, 4, 5].map((i) => box([0.016, 0.03 + (i % 2) * 0.006, 0.006], teeth, [-0.06 + i * 0.024, 0.81, -0.149], [0, 0, 0], false)),
  );
  const { root, upper } = assemble(body, legs(p, 0x18161a), DEALER_SCALE);
  const k = (v: V3): V3 => [v[0] * DEALER_SCALE, v[1] * DEALER_SCALE, v[2] * DEALER_SCALE];
  return {
    root, upper, head: k([0, 0.93, -0.01]), shoulders: [k([-0.31, 0.58, 0.02]), k([0.31, 0.58, 0.02])], eyes: eyes.map(k),
    hand: hand(skin, 1.35), sleeve: coat, dim: p.dim,
  };
}

export function buildHuman(color: number): Character {
  const p = palette();
  const c = new THREE.Color(color);
  const shirt = p.std(c.clone().multiplyScalar(0.8).getHex()), collar = p.std(c.clone().multiplyScalar(0.5).getHex());
  const skin = p.std(0xdcb898, 0.7), hair = p.std(0x3a2618, 0.95), white = p.std(0xeeeeee, 0.5);
  const dark = p.std(0x1c1c24, 0.6), lips = p.std(0x8a4a44, 0.6);
  const body = group(
    box([0.44, 0.46, 0.26], shirt, [0, 0.25, 0.02]),
    box([0.5, 0.08, 0.28], shirt, [0, 0.45, 0.02]),
    box([0.2, 0.03, 0.18], collar, [0, 0.49, 0]),
    box([0.09, 0.08, 0.09], skin, [0, 0.53, 0]),
    box([0.22, 0.25, 0.22], skin, [0, 0.68, -0.01]),
    box([0.235, 0.05, 0.235], hair, [0, 0.81, 0.005]),
    box([0.235, 0.2, 0.03], hair, [0, 0.71, 0.11]),
    ...[-1, 1].flatMap((s) => [
      box([0.012, 0.1, 0.17], hair, [s * 0.116, 0.75, 0.03]),
      box([0.045, 0.032, 0.004], white, [s * 0.05, 0.69, -0.121], [0, 0, 0], false),
      box([0.02, 0.026, 0.004], dark, [s * 0.05, 0.69, -0.124], [0, 0, 0], false),
      box([0.05, 0.01, 0.006], hair, [s * 0.05, 0.725, -0.122], [0, 0, 0], false),
    ]),
    box([0.03, 0.05, 0.03], skin, [0, 0.66, -0.13]),
    box([0.07, 0.012, 0.006], lips, [0, 0.61, -0.121], [0, 0, 0], false),
  );
  const { root, upper } = assemble(body, legs(p, 0x2a2c38), 1);
  return {
    root, upper, head: [0, 0.68, -0.01], shoulders: [[-0.24, 0.45, 0.02], [0.24, 0.45, 0.02]], eyes: [],
    hand: hand(skin, 1), sleeve: shirt, dim: p.dim,
  };
}

/** Caja de 1 m de alto (a lo largo de y): el render la estira entre dos puntos (brazos). */
export function buildLimb(mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
