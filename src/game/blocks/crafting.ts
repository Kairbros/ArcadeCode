// Recetas de crafteo. Las de 2×2 se hacen desde el inventario; las de 3×3, en la mesa de trabajo.
// Con forma: da igual dónde se pongan dentro de la cuadrícula, y se aceptan reflejadas (izquierda ↔ derecha).
// Lo que se funde o se cocina va en el horno (furnace.ts).
import { COAL, COBBLE, FURNACE, LOG, PLANKS, TABLE, TORCH } from "./blocks";
import type { Stack } from "./inventory";
import {
  CHARCOAL, DIAMOND, DIAMOND_AXE, DIAMOND_PICK, DIAMOND_SHOVEL, DIAMOND_SWORD, IRON_AXE, IRON_INGOT, IRON_PICK,
  IRON_SHOVEL, IRON_SWORD, STICK, STONE_AXE, STONE_PICK, STONE_SHOVEL, STONE_SWORD, WOOD_AXE, WOOD_PICK, WOOD_SHOVEL,
  WOOD_SWORD,
} from "./items";

export interface Recipe {
  /** Filas del dibujo (0 = vacío). */
  shape: number[][];
  out: Stack;
}

const _ = 0;
const S = STICK;
const C = COBBLE;

function tools(m: number, pick: number, axe: number, shovel: number, sword: number): Recipe[] {
  return [
    { shape: [[m, m, m], [_, S, _], [_, S, _]], out: { id: pick, n: 1 } },
    { shape: [[m, m], [m, S], [_, S]], out: { id: axe, n: 1 } },
    { shape: [[m], [S], [S]], out: { id: shovel, n: 1 } },
    { shape: [[m], [m], [S]], out: { id: sword, n: 1 } },
  ];
}

export const RECIPES: Recipe[] = [
  { shape: [[LOG]], out: { id: PLANKS, n: 4 } },
  { shape: [[PLANKS], [PLANKS]], out: { id: STICK, n: 4 } },
  { shape: [[PLANKS, PLANKS], [PLANKS, PLANKS]], out: { id: TABLE, n: 1 } },
  { shape: [[C, C, C], [C, _, C], [C, C, C]], out: { id: FURNACE, n: 1 } },
  { shape: [[COAL], [S]], out: { id: TORCH, n: 4 } },
  { shape: [[CHARCOAL], [S]], out: { id: TORCH, n: 4 } },
  ...tools(PLANKS, WOOD_PICK, WOOD_AXE, WOOD_SHOVEL, WOOD_SWORD),
  ...tools(COBBLE, STONE_PICK, STONE_AXE, STONE_SHOVEL, STONE_SWORD),
  ...tools(IRON_INGOT, IRON_PICK, IRON_AXE, IRON_SHOVEL, IRON_SWORD),
  ...tools(DIAMOND, DIAMOND_PICK, DIAMOND_AXE, DIAMOND_SHOVEL, DIAMOND_SWORD),
];

/** Recorta las filas y columnas vacías del borde de una cuadrícula size×size (ids, 0 = vacío). */
function trim(grid: number[], size: number): number[][] {
  let r0 = size, r1 = -1, c0 = size, c1 = -1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r * size + c]) continue;
      r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c);
    }
  }
  const out: number[][] = [];
  for (let r = r0; r <= r1; r++) out.push(grid.slice(r * size + c0, r * size + c1 + 1));
  return out;
}

const same = (a: number[][], b: number[][]) =>
  a.length === b.length && a.every((row, r) => row.length === b[r].length && row.every((v, c) => v === b[r][c]));

/** Lo que sale de una cuadrícula, o null si no es ninguna receta. */
export function craftResult(grid: number[], size: number): Stack | null {
  const t = trim(grid, size);
  if (!t.length) return null;
  const mirrored = t.map((row) => [...row].reverse());
  for (const r of RECIPES) {
    if (r.shape.length > size || r.shape[0].length > size) continue;
    if (same(t, r.shape) || same(mirrored, r.shape)) return { ...r.out };
  }
  return null;
}
