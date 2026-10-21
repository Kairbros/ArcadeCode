// El mundo del casino: la sala de dos pisos, las mesas, los crupieres, las escaleras, las zonas y las
// colisiones de cada piso. Datos puros (sin DOM) para que el anfitrión y los invitados calculen lo mismo y
// para poder probar la lógica en Node.
//
// Planta: un salón central de doble altura (el «Salón Real», con todas las mesas) rodeado por un anillo
// de zonas temáticas en dos pisos. El piso de arriba (entrepiso) es un balcón alrededor del hueco central:
// desde ahí se ven las mesas (y tiene sus propias mesas). Los dos pisos se unen con dos escaleras dentro
// del salón que se suben andando: la altura sale de dónde pisas en la rampa.
import type { GameKind } from "./table";

export interface TableDef {
  kind: GameKind;
  /** Centro de la mesa en el suelo. */
  x: number;
  z: number;
  /** Giro de la mesa: los jugadores se sientan del lado local +Z. */
  yaw: number;
  /** Piso en el que está. */
  lv: Level;
  label: string;
  /** Color del neón de la mesa (0–255). */
  color: [number, number, number];
  /**
   * Cámara al sentarse, en coordenadas de la mesa: [inclinarse hacia la mesa (m), altura de los ojos,
   * foco x, foco y, foco z]. En primera persona el ojo va en la silla y se echa un poco hacia delante
   * (`lean`) mirando al mecanismo del puesto (el foco).
   */
  cam: [number, number, number, number, number];
}

/** La sala (x e z centrados en 0). `h` es el techo del salón central. */
export const HALL = { w: 56, d: 44, h: 11 };
/** Altura del suelo del entrepiso (piso 1). */
export const UPPER_Y = 5;
/** Hueco de doble altura en el centro (en el piso de arriba es aire, con barandilla). */
export const ATRIUM = { w: 30, d: 22 };

/** Pisos: 0 planta baja, 1 entrepiso. */
export type Level = 0 | 1;

/** Cámara al sentarse de cada juego (la misma en los dos pisos). */
const CAM: Record<GameKind, [number, number, number, number, number]> = {
  ruleta: [0.45, 1.82, 0, 1.17, -0.02],
  plinko: [0.15, 1.72, 0, 1.6, -0.45],
  slots: [0.2, 1.82, 0, 1.95, -0.3],
  moneda: [0.35, 1.66, 0, 1.64, -0.02],
  dados: [0.45, 1.8, 0, 1.48, -0.1],
  patos: [0.45, 1.85, 0, 1.12, -0.05],
};
const COLOR: Record<GameKind, [number, number, number]> = {
  ruleta: [232, 62, 84],
  plinko: [53, 224, 200],
  slots: [255, 206, 74],
  moneda: [168, 148, 255],
  dados: [120, 240, 150],
  patos: [255, 138, 36],
};
const LABEL: Record<GameKind, string> = {
  ruleta: "RULETA", plinko: "PLINKO", slots: "TRAGAPERRAS", moneda: "CARA O CRUZ", dados: "DADOS", patos: "CARRERA DE PATOS",
};
const table = (kind: GameKind, x: number, z: number, yaw: number, lv: Level): TableDef => ({
  kind, x, z, yaw, lv, label: LABEL[kind], color: COLOR[kind], cam: CAM[kind],
});

/**
 * Las mesas: seis en el salón real (planta baja) y seis repetidas por el entrepiso (sala VIP, galería y
 * mirador), cada una con su crupier. Las del entrepiso miran hacia fuera del hueco: sus jugadores
 * se sientan de espaldas a la pared y no al vacío.
 */
export const TABLES: TableDef[] = [
  table("ruleta", -8.5, -6, 0, 0),
  table("plinko", 0, -7, 0, 0),
  table("slots", 8.5, -6, 0, 0),
  table("moneda", -8.5, 5.5, Math.PI, 0),
  table("dados", 8.5, 5.5, Math.PI, 0),
  // En el centro, sobre la moqueta roja: la mesa estrella.
  table("patos", 0, 0, 0, 0),
  // Entrepiso: sala VIP (norte), galería (oeste) y mirador (sur).
  table("ruleta", -9.5, -14.2, Math.PI, 1),
  table("dados", 9.5, -14.2, Math.PI, 1),
  table("slots", -23.5, -7, Math.PI / 2, 1),
  table("moneda", -23.5, 7, Math.PI / 2, 1),
  table("patos", -9.5, 14.2, 0, 1),
  table("plinko", 9.5, 14.2, 0, 1),
];

/** Caja de colisión de una mesa (girada si la mesa está de lado). */
export function tableBox(t: TableDef): Collider {
  const side = Math.abs(Math.sin(t.yaw)) > 0.5;
  return { x: t.x, z: t.z, w: side ? 2.6 : 3.8, d: side ? 3.8 : 2.6 };
}

// --- Zonas temáticas ----------------------------------------------------------------------
export interface Zone {
  name: string;
  lv: Level;
  /** Rectángulo en planta: x0..x1, z0..z1. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const AX = ATRIUM.w / 2;
const AZ = ATRIUM.d / 2;
const HX = HALL.w / 2;
const HZ = HALL.d / 2;

/** Zonas por piso (la primera que contiene el punto manda; el salón central va primero). */
export const ZONES: Zone[] = [
  { name: "SALÓN REAL", lv: 0, x0: -AX, x1: AX, z0: -AZ, z1: AZ },
  { name: "BAR TROPICAL", lv: 0, x0: -HX, x1: -AX, z0: -HZ, z1: HZ },
  { name: "ZONA NEÓN", lv: 0, x0: AX, x1: HX, z0: -HZ, z1: HZ },
  { name: "SALA DE MÁQUINAS", lv: 0, x0: -AX, x1: AX, z0: -HZ, z1: -AZ },
  { name: "VESTÍBULO", lv: 0, x0: -AX, x1: AX, z0: AZ, z1: HZ },
  { name: "GALERÍA", lv: 1, x0: -HX, x1: -AX, z0: -HZ, z1: HZ },
  { name: "BOUTIQUE", lv: 1, x0: AX, x1: HX, z0: -HZ, z1: HZ },
  { name: "SALA VIP", lv: 1, x0: -AX, x1: AX, z0: -HZ, z1: -AZ },
  { name: "MIRADOR", lv: 1, x0: -AX, x1: AX, z0: AZ, z1: HZ },
];

/** Nombre de la zona en la que está (x, z) en ese piso. */
export function zoneAt(x: number, z: number, lv: Level): string {
  const zone = ZONES.find((zn) => zn.lv === lv && x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1);
  return zone?.name ?? "";
}

// --- Escaleras (dentro del salón, pegadas a sus lados oeste y este) -------------------------
/**
 * Rampa de peldaños que se sube andando: va de `zBottom` (suelo) a `zTop` (altura del entrepiso) entre
 * `x0` y `x1`; arriba hay un rellano (`landing`, en z) que sale de lado hasta el balcón por `exitX`.
 */
export interface Stair {
  x0: number;
  x1: number;
  zBottom: number;
  zTop: number;
  landing: [number, number];
  /** Pasada esta x (hacia fuera del hueco), ya se está en el balcón del entrepiso. */
  exitX: number;
  /** -1 la del oeste, 1 la del este (hacia dónde se sale arriba). */
  side: number;
}

export const STAIRS: Stair[] = [-1, 1].map((s) => ({
  x0: Math.min(s * 12, s * 15),
  x1: Math.max(s * 12, s * 15),
  zBottom: 6.6,
  zTop: -2.2,
  landing: [-3.8, -2.2],
  exitX: s * (ATRIUM.w / 2 + 0.35),
  side: s,
}));

/** Altura del peldaño en la z de esa escalera (0 abajo, UPPER_Y en el rellano). */
export function stairHeight(st: Stair, z: number): number {
  return UPPER_Y * Math.max(0, Math.min(1, (st.zBottom - z) / (st.zBottom - st.zTop)));
}

/** ¿(x, z) cae sobre la escalera (rampa o rellano)? */
export function onStair(st: Stair, x: number, z: number): boolean {
  if (z >= st.landing[0] && z <= st.landing[1]) return x >= st.x0 - 0.1 && x <= st.x1 + 0.1;
  return x >= st.x0 && x <= st.x1 && z > st.landing[1] && z <= st.zBottom + 0.25;
}

/** Al pie de una escalera (para el aviso del HUD): índice o -1. */
export function nearStairFoot(x: number, z: number): number {
  return STAIRS.findIndex((st) => x > st.x0 && x < st.x1 && z > st.zBottom && z < st.zBottom + 2);
}

// --- Baño (escondite), planta baja, zona neón contra la pared este ---
/** Bloque de los baños (centro y tamaño en planta): dos cabinas con la puerta hacia el salón (−X). */
export const BATH = { x: HX - 1.4, z: 0, w: 2.8, d: 4.4, h: 2.6 };
/** Delante de cada puerta (donde se pulsa E y donde sales). */
export const BATH_DOORS: [number, number][] = [[BATH.x - 2.05, -1.1], [BATH.x - 2.05, 1.1]];
/** Puerta de baño a tu alcance (o -1). Solo en planta baja. */
export function nearBath(x: number, z: number, lv: Level = 0): number {
  if (lv !== 0) return -1;
  return BATH_DOORS.findIndex(([dx, dz]) => Math.hypot(x - dx, z - dz) < 1.2);
}

// --- Bóveda en equipo, en la sala VIP (piso de arriba), pared norte ---
/** Puerta redonda de la bóveda (centro en la pared, altura sobre su suelo) y los dos paneles. */
export const VAULT = { x: 0, y: 1.35, z: -HZ + 0.3 };
export const VAULT_PADS: [number, number][] = [[-1.5, -HZ + 1.1], [1.5, -HZ + 1.1]];
/** Panel de la bóveda que pisa (x, z) o -1. La bóveda está en el piso de arriba. */
export function onVaultPad(x: number, z: number, lv: Level = 1): number {
  if (lv !== 1) return -1;
  return VAULT_PADS.findIndex(([px, pz]) => Math.hypot(x - px, z - pz) < 0.75);
}

// --- Boutique de disfraces, piso de arriba, pared este: tres maniquíes ---
/** Cada maniquí: dónde está (pegado a la pared) y dónde se pone uno para probárselo. */
export const MANNEQUINS: { at: [number, number]; stand: [number, number] }[] = [-4, 0, 4].map((z) => ({
  at: [HX - 1.2, z],
  stand: [HX - 3.0, z],
}));
/** Maniquí a tu alcance (o -1). Solo en el piso de arriba. */
export function nearMannequin(x: number, z: number, lv: Level): number {
  if (lv !== 1) return -1;
  return MANNEQUINS.findIndex(({ stand }) => Math.hypot(x - stand[0], z - stand[1]) < 1.3);
}

/** Dónde aparece cada jugador (en el vestíbulo, planta baja). */
export const SPAWNS: [number, number][] = [
  [-3, 16],
  [3, 16],
  [-6, 17.5],
  [6, 17.5],
];

/** Cajas contra las que no se puede andar (centradas, en el plano). */
export interface Collider {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Columnas que sostienen el entrepiso, en las esquinas y a mitad de los lados largos del hueco. */
export const PILLARS: [number, number][] = [
  [-AX, -AZ], [AX, -AZ], [-AX, AZ], [AX, AZ], [0, -AZ], [0, AZ],
];

/** Colisiones de la planta baja. */
const GROUND: Collider[] = [
  // Mesas (un poco más grandes que el mueble para no meterse debajo).
  ...TABLES.filter((t) => t.lv === 0).map(tableBox),
  // Escaleras: paredes a los lados y al fondo (por debajo no se pasa; se entra por el pie).
  ...STAIRS.flatMap((st) => [
    { x: st.x0 - 0.1, z: (st.zBottom + st.landing[0]) / 2, w: 0.2, d: st.zBottom - st.landing[0] },
    { x: st.x1 + 0.1, z: (st.zBottom + st.landing[0]) / 2, w: 0.2, d: st.zBottom - st.landing[0] },
    { x: (st.x0 + st.x1) / 2, z: st.landing[0] - 0.1, w: st.x1 - st.x0 + 0.4, d: 0.2 },
  ]),
  // Columnas.
  ...PILLARS.map(([x, z]) => ({ x, z, w: 1.2, d: 1.2 })),
  // Barra del bar tropical (pared oeste) y baños (pared este).
  { x: -HX + 1.6, z: 0, w: 2.4, d: 12 },
  { x: BATH.x, z: BATH.z, w: BATH.w, d: BATH.d },
  // Máquinas de decoración de la sala de máquinas (norte): dos filas.
  ...[-9, -4.5, 4.5, 9].map((x) => ({ x, z: -HZ + 1.4, w: 1.6, d: 1.4 })),
];

/** Colisiones del entrepiso: el hueco central (barandilla, abierta donde llegan las escaleras), mesas, columnas, maniquíes y muebles. */
const UPPER: Collider[] = [
  { x: 0, z: 0, w: 24, d: ATRIUM.d },
  ...[-1, 1].flatMap((s) => [
    { x: s * 13.5, z: (-ATRIUM.d / 2 - 3.8) / 2, w: 3, d: ATRIUM.d / 2 - 3.8 },
    { x: s * 13.5, z: (ATRIUM.d / 2 - 2.2) / 2, w: 3, d: ATRIUM.d / 2 + 2.2 },
  ]),
  ...TABLES.filter((t) => t.lv === 1).map(tableBox),
  ...PILLARS.map(([x, z]) => ({ x, z, w: 1.2, d: 1.2 })),
  ...MANNEQUINS.map(({ at }) => ({ x: at[0], z: at[1], w: 1.0, d: 1.0 })),
  // Sofás de la sala VIP y bancos del mirador.
  { x: -8, z: -HZ + 2, w: 3.2, d: 1.2 },
  { x: 8, z: -HZ + 2, w: 3.2, d: 1.2 },
  { x: -6, z: HZ - 1.4, w: 2.6, d: 0.9 },
  { x: 6, z: HZ - 1.4, w: 2.6, d: 0.9 },
];

/** Colisiones de cada piso. */
export const COLLIDERS_LV: readonly Collider[][] = [GROUND, UPPER];
/** Colisiones de la planta baja (para quien no lleva piso, como la celda). */
export const COLLIDERS = GROUND;
export function collidersAt(lv: Level): Collider[] {
  return COLLIDERS_LV[lv] ?? GROUND;
}
/** Subiendo o bajando una escalera solo valen sus paredes (las mesas de abajo no estorban en el aire). */
export const STAIR_COLLIDERS: Collider[] = [];

/**
 * Colisiones para los NPC: las de su piso más las escaleras (abajo) y sus rellanos (arriba). Los NPC no
 * cambian de piso, así que no deben pisarlas.
 */
const NPC_EXTRA: Collider[][] = [
  STAIRS.map((st) => ({ x: (st.x0 + st.x1) / 2, z: (st.zBottom + st.landing[0]) / 2, w: st.x1 - st.x0 + 0.4, d: st.zBottom - st.landing[0] + 0.4 })),
  STAIRS.map((st) => ({ x: (st.x0 + st.x1) / 2, z: (st.landing[0] + st.landing[1]) / 2, w: st.x1 - st.x0, d: st.landing[1] - st.landing[0] })),
];
export function npcCollidersAt(lv: Level): Collider[] {
  return [...collidersAt(lv), ...NPC_EXTRA[lv]];
}

/** Gira un punto local de la mesa al mundo. */
export function tablePoint(t: TableDef, lx: number, lz: number): [number, number] {
  const c = Math.cos(t.yaw), s = Math.sin(t.yaw);
  return [t.x + lx * c + lz * s, t.z - lx * s + lz * c];
}

/** Sitio del asiento `i` en esa mesa (x, z y hacia dónde mira el jugador). */
export function seatSpot(t: TableDef, i: number): [number, number, number] {
  const lx = (i - 1.5) * 1.15;
  const [x, z] = tablePoint(t, lx, 1.95);
  return [x, z, t.yaw];
}

/** Dónde se queda uno de pie al levantarse. */
export function standSpot(t: TableDef): [number, number] {
  return tablePoint(t, 0, 4.2);
}

/** Dónde se coloca el crupier (detrás de la mesa; en las máquinas, al lado). */
export function croupierSpot(t: TableDef): [number, number, number] {
  const cabinet = t.kind === "plinko" || t.kind === "slots";
  // A 1,7 m: más cerca quedaría encajado en la colisión de la mesa y no podría salir a perseguir.
  const [x, z] = cabinet ? tablePoint(t, 2.3, -0.7) : tablePoint(t, 0, -1.7);
  return [x, z, t.yaw + Math.PI];
}

/** Mesa de ese piso a la que se puede uno sentar desde (x, z): la más cercana dentro del alcance, o -1. */
export function nearTable(x: number, z: number, reach: number, lv: Level = 0): number {
  let best = -1;
  let bestD = reach;
  for (let i = 0; i < TABLES.length; i++) {
    const t = TABLES[i];
    if (t.lv !== lv) continue;
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** ¿Está delante de la barra del bar tropical (la tienda de trucos)? */
export function nearShop(x: number, z: number, lv: Level = 0): boolean {
  return lv === 0 && x < -HX + 4.2 && Math.abs(z) < 6;
}

// --- Ventanilla y mecanismos (vestíbulo, zona neón, bar y mirador) ---------------------------------
/** Ventanilla de depósitos: mostrador pegado a la pared sur del vestíbulo, planta baja (x, z del mostrador). */
export const WINDOW: [number, number] = [-7.5, HZ - 1.1];
/** Dónde se para quien deposita (delante del mostrador). */
export const WINDOW_STAND: [number, number] = [WINDOW[0], HZ - 3.3];
/** ¿Está al alcance de la ventanilla? Solo planta baja. */
export function nearWindow(x: number, z: number, lv: Level = 0): boolean {
  return lv === 0 && Math.abs(x - WINDOW[0]) < 2.4 && z > HZ - 5.2;
}
/** Palanca de la reja: pared este de la zona neón, lejos de la ventanilla (hay que cruzar el casino). */
export const LEVER: [number, number] = [HX - 0.5, 13];
export const LEVER_STAND: [number, number] = [HX - 2.2, 13];
/** Timbre señuelo: pared oeste, junto al bar; los guardias de la planta baja acuden a su pie. */
export const LURE: [number, number] = [-HX + 0.5, 14];
export const LURE_STAND: [number, number] = [-HX + 2.4, 14];
export function nearLever(x: number, z: number, lv: Level = 0): boolean {
  return lv === 0 && Math.hypot(x - LEVER_STAND[0], z - LEVER_STAND[1]) < 2.0;
}
export function nearLure(x: number, z: number, lv: Level = 0): boolean {
  return lv === 0 && Math.hypot(x - LURE_STAND[0], z - LURE_STAND[1]) < 2.0;
}
/** Panel de la alarma: cuatro botones de colores en la pared sur del mirador (entrepiso). */
export const SEQ_X = [-4.5, -1.5, 1.5, 4.5];
export const SEQ_Z = HZ - 0.5;
/** Botón de la secuencia al alcance (0..3) o -1. Solo en el entrepiso. */
export function nearSeq(x: number, z: number, lv: Level = 1): number {
  if (lv !== 1 || z < HZ - 3.4) return -1;
  let best = -1;
  let bestD = 1.0;
  SEQ_X.forEach((bx, k) => {
    const d = Math.abs(x - bx);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  return best;
}

/** Limita un punto a la sala (deja un margen respecto a las paredes). */
export function clampToHall(x: number, z: number, margin = 0.8): [number, number] {
  const halfW = HALL.w / 2 - margin;
  const halfD = HALL.d / 2 - margin;
  return [Math.max(-halfW, Math.min(halfW, x)), Math.max(-halfD, Math.min(halfD, z))];
}

// --- Basura que se coge y se tira (latas y bolsas por los dos pisos) ------------------------
/** Dónde está cada basura (y adónde vuelve al cabo de un rato): x, z y piso. */
export const LITTER: [number, number, Level][] = [
  [-21, -8, 0], [-21, 9, 0], [22, -14, 0], [22, 14, 0], [-5, -16, 0], [6, -16, 0], [-9, 18, 0], [9, 18, 0], [-4, 9, 0], [4, -3, 0],
  [-20, -14, 1], [-20, 14, 1], [19, -19, 1], [19, 19, 1], [0, -17, 1], [-3, 18, 1], [3, 18, 1], [24, 9, 1],
];
/** Basura al alcance en ese piso (la más cercana) o -1. */
export function nearLitter(x: number, z: number, lv: Level, taken: (k: number) => boolean): number {
  let best = -1;
  let bestD = 1.4;
  LITTER.forEach(([lx, lz, llv], k) => {
    if (llv !== lv || taken(k)) return;
    const d = Math.hypot(x - lx, z - lz);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  return best;
}

// --- Patrullas de los guardias -------------------------------------------------------------
/** Rondas: piso y puntos. Los guardias se activan por orden según el turno (más turno, más guardias). */
export const ROUTES: { lv: Level; points: [number, number][] }[] = [
  // 1 · planta baja: el anillo de zonas.
  { lv: 0, points: [[-19.5, -17.5], [19.5, -17.5], [19.5, 17.5], [-19.5, 17.5]] },
  // 2 · entrepiso: el balcón entero.
  { lv: 1, points: [[-21.5, -16.5], [21.5, -16.5], [21.5, 16.5], [-21.5, 16.5]] },
  // 3 · planta baja: entre las mesas del salón real.
  { lv: 0, points: [[-11.2, -2.5], [11.2, -2.5], [11.2, 9.3], [-11.2, 9.3]] },
  // 4 · entrepiso: el balcón al revés (se cruza con el 2).
  { lv: 1, points: [[21.5, 16.5], [21.5, -16.5], [-21.5, -16.5], [-21.5, 16.5]] },
  // 5 · planta baja: el anillo al revés.
  { lv: 0, points: [[19.5, 17.5], [19.5, -17.5], [-19.5, -17.5], [-19.5, 17.5]] },
  // 6 · entrepiso: sala VIP y boutique (lo más valioso).
  { lv: 1, points: [[-6, -17], [21, -17], [21, 6], [17.5, -14]] },
];

// --- La cárcel colgada sobre el salón central ----------------------------------------------
/**
 * Jaula colgada del techo del salón (reja por los seis lados): quien falla un robo o le atrapan aparece
 * aquí un rato. Desde dentro se ve todo el casino y desde abajo (y desde el mirador) todos le ven.
 */
export const JAIL = { x: 0, y: 6.8, z: 7.6, w: 4.4, d: 3.6, h: 2.8 };
/** Caja de la fuga, en la pared sur del vestíbulo: un jugador libre la fuerza para soltar a los presos. */
export const JAIL_SWITCH: [number, number, number] = [6, 1.25, HZ - 0.42];
/** ¿Está al alcance de la caja de la fuga? Planta baja. */
export function nearSwitch(x: number, z: number, lv: Level = 0): boolean {
  return lv === 0 && Math.hypot(x - JAIL_SWITCH[0], z - JAIL_SWITCH[2]) < 1.8;
}
/** Dónde aparece el preso dentro de la celda. */
export const JAIL_SPOT: [number, number] = [JAIL.x, JAIL.z + 0.9];
/** Palanca en la reja del lado del salón: acertarle con la basura acorta la condena. */
export const JAIL_LEVER: [number, number, number] = [JAIL.x + 0.2, JAIL.y + 1.15, JAIL.z - JAIL.d / 2 + 0.18];
/** Basura repartida por el suelo de la celda (coordenadas de mundo). */
export const JAIL_TRASH: [number, number][] = [
  [JAIL.x - 1.1, JAIL.z - 0.5],
  [JAIL.x + 1.2, JAIL.z - 0.8],
  [JAIL.x - 0.3, JAIL.z - 1.1],
  [JAIL.x + 1.5, JAIL.z - 0.2],
];
/** Limita un punto a la celda (para que el preso no se escape andando). */
export function clampToJail(x: number, z: number): [number, number] {
  const mx = JAIL.w / 2 - 0.55;
  const mz = JAIL.d / 2 - 0.55;
  return [Math.max(JAIL.x - mx, Math.min(JAIL.x + mx, x)), Math.max(JAIL.z - mz, Math.min(JAIL.z + mz, z))];
}
