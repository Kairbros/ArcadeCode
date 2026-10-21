// Definición de armas: todo por datos para que el sistema sea modular y las pruebas no dependan
// de Three.js. Cada arma tiene una versión MEJORADA (la máquina del mejorador) con otro nombre, más daño,
// cargador y reserva, y un brillo propio (`tint`).

export type WeaponId = "pistol" | "revolver" | "smg" | "shotgun" | "rifle" | "lmg" | "sniper" | "pulse";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Daño por proyectil. */
  damage: number;
  /** Cadencia en disparos por minuto. */
  rpm: number;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  /** Dispersión base en radianes (cono). */
  spread: number;
  /** Proyectiles por disparo (escopeta > 1). */
  pellets: number;
  range: number;
  /** Precio en la pared (0: no se vende, solo sale de la caja). */
  price: number;
  ammoPrice: number;
  /** Automática (mantener el gatillo) o semiautomática. */
  auto: boolean;
  recoil: number;
  /** Zombis que atraviesa el proyectil (0 = se para en el primero). */
  pierce: number;
  /** Multiplicador de daño en la cabeza. */
  headshot: number;
  /** Zoom al apuntar (1 = sin zoom). */
  adsZoom: number;
  /** Largo del modelo y colores base (el modelo 3D está en `model.ts`). */
  look: { length: number; color: number; body: number };
  /** Color de la estela y el fogonazo (el mejorado lo cambia). */
  tint: number;
  upgraded: boolean;
}

type Base = Omit<WeaponDef, "tint" | "upgraded">;

const BASE: Record<WeaponId, Base> = {
  pistol: {
    id: "pistol",
    name: "P-9 REGLAMENTARIA",
    damage: 34,
    rpm: 340,
    magSize: 8,
    reserveMax: 96,
    reloadTime: 1.35,
    spread: 0.012,
    pellets: 1,
    range: 90,
    price: 0,
    ammoPrice: 250,
    auto: false,
    recoil: 0.9,
    pierce: 0,
    headshot: 3.4,
    adsZoom: 1.15,
    look: { length: 0.34, color: 0x2a2f36, body: 0x3c444e },
  },
  revolver: {
    id: "revolver",
    name: "MAGNUM M-44",
    damage: 98,
    rpm: 160,
    magSize: 6,
    reserveMax: 54,
    reloadTime: 2.5,
    spread: 0.006,
    pellets: 1,
    range: 110,
    price: 900,
    ammoPrice: 450,
    auto: false,
    recoil: 1.9,
    pierce: 1,
    headshot: 3.8,
    adsZoom: 1.2,
    look: { length: 0.4, color: 0x2c2f33, body: 0x5a5f66 },
  },
  smg: {
    id: "smg",
    name: "AVISPA",
    damage: 22,
    rpm: 880,
    magSize: 32,
    reserveMax: 256,
    reloadTime: 1.9,
    spread: 0.028,
    pellets: 1,
    range: 70,
    price: 1000,
    ammoPrice: 500,
    auto: true,
    recoil: 0.55,
    pierce: 0,
    headshot: 2.8,
    adsZoom: 1.12,
    look: { length: 0.5, color: 0x232a24, body: 0x2f3a33 },
  },
  shotgun: {
    id: "shotgun",
    name: "CORTACERCO",
    damage: 17,
    rpm: 75,
    magSize: 6,
    reserveMax: 48,
    reloadTime: 2.7,
    spread: 0.085,
    pellets: 8,
    range: 34,
    price: 1200,
    ammoPrice: 600,
    auto: false,
    recoil: 2.1,
    pierce: 0,
    headshot: 2.4,
    adsZoom: 1.05,
    look: { length: 0.72, color: 0x4a2b18, body: 0x2c2018 },
  },
  rifle: {
    id: "rifle",
    name: "R-14 DE ASALTO",
    damage: 38,
    rpm: 620,
    magSize: 26,
    reserveMax: 234,
    reloadTime: 2.2,
    spread: 0.017,
    pellets: 1,
    range: 110,
    price: 1500,
    ammoPrice: 700,
    auto: true,
    recoil: 0.85,
    pierce: 1,
    headshot: 3.2,
    adsZoom: 1.3,
    look: { length: 0.64, color: 0x2a2a24, body: 0x3a3a30 },
  },
  lmg: {
    id: "lmg",
    name: "TRITURADORA T-60",
    damage: 31,
    rpm: 700,
    magSize: 75,
    reserveMax: 300,
    reloadTime: 4.2,
    spread: 0.03,
    pellets: 1,
    range: 100,
    price: 0,
    ammoPrice: 1200,
    auto: true,
    recoil: 0.7,
    pierce: 1,
    headshot: 2.8,
    adsZoom: 1.2,
    look: { length: 0.78, color: 0x24282c, body: 0x394048 },
  },
  sniper: {
    id: "sniper",
    name: "SERAFÍN SR-9",
    damage: 260,
    rpm: 55,
    magSize: 5,
    reserveMax: 40,
    reloadTime: 3.2,
    spread: 0.0008,
    pellets: 1,
    range: 200,
    price: 2000,
    ammoPrice: 900,
    auto: false,
    recoil: 2.8,
    pierce: 3,
    headshot: 5,
    adsZoom: 2.6,
    look: { length: 0.95, color: 0x20241f, body: 0x343b30 },
  },
  pulse: {
    id: "pulse",
    name: "CAÑÓN DE PULSO",
    damage: 150,
    rpm: 90,
    magSize: 4,
    reserveMax: 28,
    reloadTime: 2.8,
    spread: 0.004,
    pellets: 1,
    range: 140,
    price: 0,
    ammoPrice: 900,
    auto: false,
    recoil: 2.6,
    pierce: 4,
    headshot: 4,
    adsZoom: 1.6,
    look: { length: 0.8, color: 0x1b2c3a, body: 0x24435c },
  },
};

const TINT: Record<WeaponId, number> = {
  pistol: 0xffd27a,
  revolver: 0xffb060,
  smg: 0xffc070,
  shotgun: 0xffa050,
  rifle: 0xffd090,
  lmg: 0xffb878,
  sniper: 0xffe2b0,
  pulse: 0x66ccff,
};

/** Cómo cambia cada arma al mejorarla. Los números son multiplicadores sobre la base. */
interface Upgrade {
  name: string;
  tint: number;
  damage: number;
  mag: number;
  reserve: number;
  reload: number;
  rpm: number;
  spread: number;
  pierce: number;
  recoil: number;
}

const UPGRADES: Record<WeaponId, Upgrade> = {
  pistol: { name: "P-9 «VERDUGO»", tint: 0xff3a7a, damage: 2.6, mag: 2, reserve: 1.5, reload: 0.6, rpm: 1.25, spread: 0.7, pierce: 1, recoil: 0.8 },
  revolver: { name: "MAGNUM «JUICIO FINAL»", tint: 0xff7a1a, damage: 2.3, mag: 1.5, reserve: 1.5, reload: 0.55, rpm: 1.3, spread: 0.7, pierce: 2, recoil: 0.8 },
  smg: { name: "AVISPA «ENJAMBRE»", tint: 0xffe23a, damage: 2.3, mag: 1.6, reserve: 1.5, reload: 0.7, rpm: 1.15, spread: 0.7, pierce: 1, recoil: 0.8 },
  shotgun: { name: "CORTACERCO «GUILLOTINA»", tint: 0xff4a2a, damage: 2.2, mag: 1.5, reserve: 1.5, reload: 0.6, rpm: 1.3, spread: 0.75, pierce: 1, recoil: 0.85 },
  rifle: { name: "R-14 «SEGADORA»", tint: 0x3affb0, damage: 2.3, mag: 1.6, reserve: 1.4, reload: 0.7, rpm: 1.1, spread: 0.7, pierce: 2, recoil: 0.8 },
  lmg: { name: "T-60 «APOCALIPSIS»", tint: 0xb85aff, damage: 2.2, mag: 1.5, reserve: 1.4, reload: 0.7, rpm: 1.15, spread: 0.7, pierce: 2, recoil: 0.8 },
  sniper: { name: "SR-9 «ARCÁNGEL»", tint: 0x6ab4ff, damage: 2, mag: 2, reserve: 1.5, reload: 0.6, rpm: 1.4, spread: 0.5, pierce: 3, recoil: 0.8 },
  pulse: { name: "PULSO «SUPERNOVA»", tint: 0xff5aff, damage: 2.4, mag: 2, reserve: 1.5, reload: 0.6, rpm: 1.5, spread: 0.7, pierce: 3, recoil: 0.85 },
};

function upgrade(b: Base, u: Upgrade): WeaponDef {
  return {
    ...b,
    name: u.name,
    damage: Math.round(b.damage * u.damage),
    magSize: Math.round(b.magSize * u.mag),
    reserveMax: Math.round(b.reserveMax * u.reserve),
    reloadTime: Math.round(b.reloadTime * u.reload * 100) / 100,
    rpm: Math.round(b.rpm * u.rpm),
    spread: b.spread * u.spread,
    pierce: b.pierce + u.pierce,
    recoil: b.recoil * u.recoil,
    ammoPrice: Math.round(b.ammoPrice * 1.5),
    tint: u.tint,
    upgraded: true,
  };
}

const IDS = Object.keys(BASE) as WeaponId[];

export const WEAPONS = Object.fromEntries(IDS.map((id) => [id, { ...BASE[id], tint: TINT[id], upgraded: false }])) as Record<WeaponId, WeaponDef>;
export const UPGRADED = Object.fromEntries(IDS.map((id) => [id, upgrade(BASE[id], UPGRADES[id])])) as Record<WeaponId, WeaponDef>;

export const STARTING_WEAPON: WeaponId = "pistol";
/** Armas que pueden salir de la caja misteriosa. */
export const BOX_POOL: WeaponId[] = ["revolver", "smg", "shotgun", "rifle", "lmg", "sniper", "pulse"];

/** Precio de la máquina del mejorador y de la caja misteriosa. */
export const UPGRADE_PRICE = 2500;
export const BOX_PRICE = 950;

export const weaponDef = (id: WeaponId, upgraded = false): WeaponDef => (upgraded ? UPGRADED[id] : WEAPONS[id]);

/** Orden estable de las armas al viajar por red (índice ↔ id). */
export const WEAPON_IDS: readonly WeaponId[] = IDS;
export const weaponIndex = (id: WeaponId | null): number => (id ? IDS.indexOf(id) : -1);
export const weaponAt = (k: number): WeaponId | null => IDS[k] ?? null;

/** El cuchillo: siempre disponible (tecla V) y, cuando no queda ni una bala, también con el clic. No gasta munición. */
export const KNIFE = {
  /** Daño de un tajo (mata a los infectados normales de las primeras rondas de un golpe). */
  damage: 150,
  /** Alcance (m), apertura del cono por delante (rad) y segundos entre tajos. */
  reach: 2.0,
  cone: 0.7,
  cooldown: 0.7,
  /** Segundos que dura la animación en primera persona. */
  swing: 0.42,
} as const;

/**
 * Línea de mira de cada arma al apuntar: altura `y` y posición local `z` del punto por el que mira el ojo (z > 0 = hacia
 * el jugador), distancia del ojo a ese punto (`relief`), campo de visión al apuntar (`fov`) y si es una mira telescópica
 * que tapa la pantalla con su retícula (`scope`). El modelo se coloca de forma que ese punto caiga en el centro de la pantalla.
 */
export const SIGHTS: Record<WeaponId, { y: number; z: number; relief: number; fov: number; scope?: boolean }> = {
  pistol: { y: 0.091, z: 0.07, relief: 0.32, fov: 68 },
  revolver: { y: 0.113, z: 0.07, relief: 0.32, fov: 66 },
  smg: { y: 0.15, z: -0.015, relief: 0.3, fov: 62 },
  shotgun: { y: 0.108, z: 0.06, relief: 0.3, fov: 66 },
  rifle: { y: 0.2, z: 0.025, relief: 0.28, fov: 56 },
  lmg: { y: 0.192, z: 0.0, relief: 0.3, fov: 60 },
  sniper: { y: 0.13, z: 0.152, relief: 0.1, fov: 17, scope: true },
  pulse: { y: 0.2, z: 0.025, relief: 0.28, fov: 58 },
};
