// Atlas de texturas de Bloques: ATLAS_COLS × ATLAS_ROWS casillas de 16 px dibujadas píxel a píxel con ruido fijo (siempre
// iguales). Se crea la primera vez que se pide (toca el DOM).
import type { RGB } from "../core/config";
import {
  ATLAS_COLS, ATLAS_ROWS, T_BEDROCK, T_BRICK, T_COAL_ORE, T_COBBLE, T_DIAMOND_ORE, T_DIRT, T_FURNACE_FRONT,
  T_FURNACE_TOP, T_GLASS, T_GRASS_SIDE, T_GRASS_TOP, T_IRON_ORE, T_LEAVES, T_LOG_SIDE, T_LOG_TOP, T_PLANKS, T_SAND,
  T_STONE, T_TABLE_SIDE, T_TABLE_TOP, T_TORCH, T_WATER,
} from "./blocks";

export const TILE_PX = 16;

/** Color de las motas de cada mena. */
const ORE: Record<number, RGB> = { [T_COAL_ORE]: [34, 34, 36], [T_IRON_ORE]: [222, 176, 140], [T_DIAMOND_ORE]: [96, 232, 224] };

function rnd(x: number, y: number, k: number): number {
  let h = Math.imul(x + 31 * k, 374761393) ^ Math.imul(y + 17 * k, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const vary = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** Color de un píxel (x, y en 0..15) de una casilla; alfa 0 = hueco (hojas, cristal). */
function pixel(tile: number, x: number, y: number): [number, number, number, number] {
  const n = rnd(x, y, tile);
  const op = (c: RGB): [number, number, number, number] => [c[0], c[1], c[2], 255];
  switch (tile) {
    case T_GRASS_TOP:
      return op(vary([96, 160, 60], 0.82 + n * 0.3));
    case T_GRASS_SIDE: {
      // Franja de hierba arriba con flecos irregulares; tierra debajo.
      const fringe = 3 + Math.floor(rnd(x, 0, 99) * 3);
      return y < fringe ? op(vary([96, 160, 60], 0.82 + n * 0.3)) : op(vary([134, 96, 67], 0.8 + n * 0.35));
    }
    case T_DIRT:
      return op(vary(n < 0.12 ? [100, 70, 48] : [134, 96, 67], 0.82 + rnd(x, y, 50) * 0.3));
    case T_STONE: {
      const crack = rnd(Math.floor(x / 3), Math.floor(y / 2), 7) < 0.15 && n < 0.5;
      return op(vary([128, 128, 128], crack ? 0.7 : 0.85 + n * 0.25));
    }
    case T_SAND:
      return op(vary([219, 207, 160], 0.9 + n * 0.14));
    case T_LOG_SIDE: {
      const stripe = (x + Math.floor(rnd(0, y >> 2, 3) * 2)) % 4 === 0;
      return op(vary([104, 80, 50], stripe ? 0.7 : 0.88 + n * 0.2));
    }
    case T_LOG_TOP: {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.5) return op(vary([104, 80, 50], 0.85 + n * 0.15)); // corteza
      return op(vary([180, 144, 92], Math.floor(d) % 2 ? 0.86 : 1 - n * 0.08)); // anillos
    }
    case T_LEAVES: {
      if (n < 0.22) return [0, 0, 0, 0];
      return op(vary([58, 125, 42], 0.7 + rnd(x, y, 60) * 0.45));
    }
    case T_PLANKS: {
      const board = Math.floor(y / 4);
      const seam = y % 4 === 3 || (x + board * 5) % 16 === 0;
      return op(vary([170, 132, 82], seam ? 0.62 : 0.9 + n * 0.15));
    }
    case T_COBBLE: {
      // Piedras redondeadas sobre una cuadrícula irregular, con mortero oscuro.
      const cx = Math.floor((x + (Math.floor(y / 5) % 2) * 3) / 5), cy = Math.floor(y / 5);
      const lx = (x + (Math.floor(y / 5) % 2) * 3) % 5, ly = y % 5;
      const edge = lx === 0 || ly === 0;
      return op(vary([125, 125, 125], edge ? 0.55 : 0.78 + rnd(cx, cy, 9) * 0.35 + n * 0.08));
    }
    case T_GLASS: {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      const streak = (x + y === 11 || x + y === 12) && x > 3 && x < 9;
      if (border) return [210, 235, 245, 255];
      if (streak) return [255, 255, 255, 220];
      return [0, 0, 0, 0];
    }
    case T_BRICK: {
      const row = Math.floor(y / 4);
      const mortar = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
      return op(mortar ? vary([200, 190, 180], 0.9 + n * 0.1) : vary([160, 72, 56], 0.85 + n * 0.25));
    }
    case T_WATER:
      return op(vary([48, 96, 200], 0.85 + n * 0.2));
    case T_BEDROCK:
      return op(vary([70, 70, 70], 0.5 + n * 0.7));
    case T_TABLE_TOP: {
      // Tablero con la cuadrícula de crafteo marcada y el borde más oscuro.
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      const grid = (x > 2 && x < 13 && y > 2 && y < 13) && (x % 3 === 0 || y % 3 === 0);
      return op(vary([150, 108, 64], border ? 0.6 : grid ? 0.7 : 0.92 + n * 0.12));
    }
    case T_TABLE_SIDE: {
      // Tablones con un serrucho y un martillo colgados.
      const top = y < 3;
      const saw = y >= 5 && y <= 9 && x >= 2 && x <= 6 && x - 2 <= (9 - y) * 1.2;
      const hammer = (x === 11 && y >= 5 && y <= 12) || (y === 5 && x >= 9 && x <= 13);
      if (saw) return op([170, 175, 185]);
      if (hammer) return op(y === 5 ? [120, 120, 125] : [90, 62, 36]);
      const seam = (y + 1) % 5 === 0;
      return op(vary([150, 108, 64], top ? 0.7 : seam ? 0.62 : 0.88 + n * 0.15));
    }
    case T_COAL_ORE:
    case T_IRON_ORE:
    case T_DIAMOND_ORE: {
      // Piedra con motas del mineral (pequeños grupos de 2×2 con brillo).
      const spot = rnd(x >> 1, y >> 1, tile + 40) < 0.24 && rnd(x, y, tile + 41) < 0.85;
      if (spot) return op(vary(ORE[tile], 0.8 + n * 0.35));
      return pixel(T_STONE, x, y);
    }
    case T_FURNACE_FRONT: {
      // Adoquín con la boca del horno abajo (rejilla oscura) y una ranura arriba.
      const mouth = x >= 4 && x <= 11 && y >= 8 && y <= 13;
      const rim = (x === 3 || x === 12) && y >= 7 && y <= 14 || (y === 7 || y === 14) && x >= 3 && x <= 12;
      const slot = y === 3 && x >= 5 && x <= 10;
      if (mouth) return op(y % 2 ? [20, 18, 18] : [44, 40, 38]);
      if (rim || slot) return op(vary([70, 70, 72], 0.9 + n * 0.15));
      return pixel(T_COBBLE, x, y);
    }
    case T_FURNACE_TOP: {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      return op(vary([112, 112, 114], border ? 0.7 : 0.9 + n * 0.15));
    }
    case T_TORCH: {
      // Palito en el centro (columnas 7–8) con la llama arriba; el resto, hueco.
      if (x < 7 || x > 8 || y < 6) return [0, 0, 0, 0];
      if (y <= 7) return op(x === 7 ? [255, 236, 120] : [255, 200, 60]);
      if (y === 8) return op([255, 140, 30]);
      return op(vary([122, 86, 48], 0.85 + n * 0.25));
    }
    default:
      return [255, 0, 255, 255];
  }
}

let atlas: HTMLCanvasElement | null = null;

export function atlasCanvas(): HTMLCanvasElement {
  if (atlas) return atlas;
  const c = document.createElement("canvas");
  c.width = TILE_PX * ATLAS_COLS;
  c.height = TILE_PX * ATLAS_ROWS;
  const g = c.getContext("2d")!;
  const img = g.createImageData(c.width, c.height);
  for (let tile = 0; tile <= T_TORCH; tile++) {
    const [ox, oy] = tileOrigin(tile);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const [r, gg, b, a] = pixel(tile, x, y);
        const i = ((oy + y) * c.width + ox + x) * 4;
        img.data[i] = Math.max(0, Math.min(255, r));
        img.data[i + 1] = Math.max(0, Math.min(255, gg));
        img.data[i + 2] = Math.max(0, Math.min(255, b));
        img.data[i + 3] = a;
      }
    }
  }
  g.putImageData(img, 0, 0);
  atlas = c;
  return c;
}

export const CRACK_STAGES = 5;

/** Grietas para el bloque que se está rompiendo: una tira de CRACK_STAGES casillas, cada una con más grietas. */
export function crackCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_PX * CRACK_STAGES;
  c.height = TILE_PX;
  const g = c.getContext("2d")!;
  // Grietas que crecen desde el centro: cada fase añade unos cuantos pasos más.
  const paths: [number, number][][] = [];
  for (let k = 0; k < 6; k++) {
    let x = 7 + Math.floor(rnd(k, 0, 77) * 3), y = 7 + Math.floor(rnd(k, 1, 77) * 3);
    const path: [number, number][] = [[x, y]];
    const dx = rnd(k, 2, 77) < 0.5 ? -1 : 1, dy = rnd(k, 3, 77) < 0.5 ? -1 : 1;
    for (let s = 0; s < 9; s++) {
      if (rnd(k, s, 78) < 0.6) x += dx; else y += dy;
      path.push([x, y]);
    }
    paths.push(path);
  }
  for (let stage = 0; stage < CRACK_STAGES; stage++) {
    g.fillStyle = "rgba(20,14,10,0.85)";
    const len = 2 + stage * 2;
    for (const path of paths.slice(0, 2 + stage)) {
      for (const [x, y] of path.slice(0, len)) {
        if (x >= 0 && y >= 0 && x < TILE_PX && y < TILE_PX) g.fillRect(stage * TILE_PX + x, y, 1, 1);
      }
    }
  }
  return c;
}

/** Esquina de una casilla en el atlas (para dibujar iconos en el HUD). */
export function tileOrigin(tile: number): [number, number] {
  return [(tile % ATLAS_COLS) * TILE_PX, Math.floor(tile / ATLAS_COLS) * TILE_PX];
}
