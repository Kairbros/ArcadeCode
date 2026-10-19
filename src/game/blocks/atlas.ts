// Atlas de texturas de Bloques: 4 × 4 casillas de 16 px dibujadas píxel a píxel con ruido fijo (siempre
// iguales). Se crea la primera vez que se pide (toca el DOM).
import type { RGB } from "../core/config";
import {
  T_BEDROCK, T_BRICK, T_COBBLE, T_DIRT, T_GLASS, T_GRASS_SIDE, T_GRASS_TOP, T_LEAVES, T_LOG_SIDE, T_LOG_TOP,
  T_PLANKS, T_SAND, T_STONE, T_WATER,
} from "./blocks";

export const TILE_PX = 16;
const N = 4;

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
    default:
      return [255, 0, 255, 255];
  }
}

let atlas: HTMLCanvasElement | null = null;

export function atlasCanvas(): HTMLCanvasElement {
  if (atlas) return atlas;
  const c = document.createElement("canvas");
  c.width = c.height = TILE_PX * N;
  const g = c.getContext("2d")!;
  const img = g.createImageData(c.width, c.height);
  for (let tile = 0; tile < N * N; tile++) {
    const ox = (tile % N) * TILE_PX, oy = Math.floor(tile / N) * TILE_PX;
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

/** Esquina de una casilla en el atlas (para dibujar iconos en el HUD). */
export function tileOrigin(tile: number): [number, number] {
  return [(tile % N) * TILE_PX, Math.floor(tile / N) * TILE_PX];
}
