// Utilidades para escribir mapas en pocas líneas: edificios rectangulares con huecos por lado, huecos de ventana, puerta
// y paso, y perímetros. Los lados se recorren así: N (z = z0) y S (z = z1) de oeste a este; W (x = x0) y E (x = x1) de norte
// a sur, y `from` es la distancia desde el comienzo de cada lado.
import type { Hole, MatKind, WallRun } from "../mapdata";
import type { Interior, Room } from "../mapdef";

/** Ventana barricable de `w` m de ancho a `from` m del comienzo del lado. */
export const win = (from: number, id: string, w = 2): Hole => ({ from, to: from + w, kind: "window", id });
/** Puerta que se abre pagando. */
export const door = (from: number, w: number, id: string, cost: number, label: string): Hole => ({ from, to: from + w, kind: "door", id, cost, label });
/** Paso abierto (con dintel). */
export const gap = (from: number, to: number): Hole => ({ from, to, kind: "open" });

export interface Building {
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  mat: MatKind;
  /** Material sobre los huecos (dintel); por defecto el del muro. */
  matTop?: MatKind;
  floor: Interior["mat"];
  h?: number;
  N?: Hole[];
  S?: Hole[];
  W?: Hole[];
  E?: Hole[];
}

/** Los cuatro muros de un edificio. */
export function wallsOf(b: Building): WallRun[] {
  const base = { mat: b.mat, matTop: b.matTop, h: b.h };
  return [
    { x1: b.x0, z1: b.z0, x2: b.x1, z2: b.z0, ...base, holes: b.N },
    { x1: b.x0, z1: b.z1, x2: b.x1, z2: b.z1, ...base, holes: b.S },
    { x1: b.x0, z1: b.z0, x2: b.x0, z2: b.z1, ...base, holes: b.W },
    { x1: b.x1, z1: b.z0, x2: b.x1, z2: b.z1, ...base, holes: b.E },
  ];
}

export const roomOf = (b: Building): Room => ({ name: b.name, x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
export const interiorOf = (b: Building): Interior => ({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, mat: b.floor });

/** Muro suelto (tabique interior, valla…). */
export const wall = (x1: number, z1: number, x2: number, z2: number, mat: MatKind, holes?: Hole[], h?: number): WallRun => ({ x1, z1, x2, z2, mat, holes, h });

/** Muros altos alrededor del mapa. */
export function perimeter(b: { minX: number; maxX: number; minZ: number; maxZ: number }, mat: MatKind, h = 5): WallRun[] {
  return [
    { x1: b.minX, z1: b.maxZ, x2: b.maxX, z2: b.maxZ, h, mat },
    { x1: b.minX, z1: b.minZ, x2: b.maxX, z2: b.minZ, h, mat },
    { x1: b.minX, z1: b.minZ, x2: b.minX, z2: b.maxZ, h, mat },
    { x1: b.maxX, z1: b.minZ, x2: b.maxX, z2: b.maxZ, h, mat },
  ];
}
