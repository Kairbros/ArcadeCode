// El mundo del casino: la sala, las cinco mesas, los crupiers y las colisiones. Datos puros (sin DOM) para
// que el anfitrión y los invitados calculen lo mismo y para poder probar la lógica en Node.
import type { GameKind } from "./table";

export interface TableDef {
  kind: GameKind;
  /** Centro de la mesa en el suelo. */
  x: number;
  z: number;
  /** Giro de la mesa: los jugadores se sientan del lado local +Z. */
  yaw: number;
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

/** La sala (x e z centrados en 0). */
export const HALL = { w: 34, d: 28, h: 7.5 };

/** Las cinco mesas, dos filas: tres mirando al fondo y dos mirando al centro. */
export const TABLES: TableDef[] = [
  { kind: "ruleta", x: -9, z: -6.5, yaw: 0, label: "RULETA", color: [232, 62, 84], cam: [0.45, 1.82, 0, 1.17, -0.02] },
  { kind: "plinko", x: 0, z: -7.5, yaw: 0, label: "PLINKO", color: [53, 224, 200], cam: [0.15, 1.72, 0, 1.6, -0.45] },
  { kind: "slots", x: 9, z: -6.5, yaw: 0, label: "TRAGAPERRAS", color: [255, 206, 74], cam: [0.2, 1.82, 0, 1.95, -0.3] },
  { kind: "moneda", x: -6.5, z: 6.5, yaw: Math.PI, label: "CARA O CRUZ", color: [168, 148, 255], cam: [0.35, 1.66, 0, 1.64, -0.02] },
  { kind: "dados", x: 6.5, z: 6.5, yaw: Math.PI, label: "DADOS", color: [120, 240, 150], cam: [0.45, 1.8, 0, 1.48, -0.1] },
];

/** Dónde aparece cada jugador (en corro delante de la barra). */
export const SPAWNS: [number, number][] = [
  [-2, 9.0],
  [2, 9.0],
  [-4.5, 10.2],
  [4.5, 10.2],
];

/** Cajas contra las que no se puede andar (centradas, en el plano). */
export interface Collider {
  x: number;
  z: number;
  w: number;
  d: number;
}

export const COLLIDERS: Collider[] = [
  // Mesas (un poco más grandes que el mueble para no meterse debajo).
  ...TABLES.map((t) => ({ x: t.x, z: t.z, w: 3.8, d: 2.6 })),
  // Barra de la izquierda y columnas de las esquinas.
  { x: -15.2, z: 0, w: 2.4, d: 10 },
  { x: -15.2, z: 9.5, w: 2.4, d: 5 },
  { x: -15.2, z: -9.5, w: 2.4, d: 5 },
  { x: -13.5, z: -12.5, w: 1.2, d: 1.2 },
  { x: 13.5, z: -12.5, w: 1.2, d: 1.2 },
  { x: -13.5, z: 12.5, w: 1.2, d: 1.2 },
  { x: 13.5, z: 12.5, w: 1.2, d: 1.2 },
];

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
  const [x, z] = cabinet ? tablePoint(t, 2.3, -0.7) : tablePoint(t, 0, -1.6);
  return [x, z, t.yaw + Math.PI];
}

/** Mesa a la que se puede uno sentar desde (x, z): la más cercana dentro del alcance, o -1. */
export function nearTable(x: number, z: number, reach: number): number {
  let best = -1;
  let bestD = reach;
  for (let i = 0; i < TABLES.length; i++) {
    const t = TABLES[i];
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Limita un punto a la sala (deja un margen respecto a las paredes). */
export function clampToHall(x: number, z: number, margin = 0.8): [number, number] {
  const halfW = HALL.w / 2 - margin;
  const halfD = HALL.d / 2 - margin;
  return [Math.max(-halfW, Math.min(halfW, x)), Math.max(-halfD, Math.min(halfD, z))];
}

// --- La cárcel del techo ------------------------------------------------------------------
/** Celda pequeña encima del salón: quien falla el robo aparece aquí un rato. */
export const JAIL = { x: 0, y: 7.7, z: 11.2, w: 4.4, d: 3.6, h: 2.8 };
/** Dónde aparece el preso dentro de la celda. */
export const JAIL_SPOT: [number, number] = [JAIL.x, JAIL.z + 0.9];
/** Palanca en la pared del fondo: acertarle con la basura acorta la condena. */
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
