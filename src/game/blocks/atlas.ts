// Atlas de texturas de Bloques: 8 × 4 casillas de 16 px dibujadas píxel a píxel con ruido fijo (siempre
// iguales). Se crea la primera vez que se pide (toca el DOM). El de objetos (herramientas, comida y
// lingotes) usa la misma rejilla y se dibuja con rectángulos.
import type { RGB } from "../core/config";
import {
  T_BEDROCK, T_BRICK, T_COBBLE, T_DIRT, T_FURNACE, T_GLASS, T_GRASS_SIDE, T_GRASS_TOP, T_IRON_ORE, T_LEAVES,
  T_LOG_SIDE, T_LOG_TOP, T_PLANKS, T_SAND, T_STONE, T_WATER,
} from "./blocks";

export const TILE_PX = 16;
/** Casillas del atlas: 8 columnas × 4 filas (32 en total). */
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;

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
    case T_IRON_ORE: {
      // Piedra con vetas y pepitas de hierro (naranja herrumbroso).
      const lump = rnd(Math.floor(x / 2), Math.floor(y / 2), 41) < 0.34;
      if (lump) return op(vary(n < 0.3 ? [214, 168, 108] : [176, 124, 74], 0.9 + n * 0.2));
      return op(vary([128, 128, 128], 0.85 + n * 0.25));
    }
    case T_FURNACE: {
      // Piedra con la boca del horno (arco oscuro) y brasas abajo.
      const mouth = y >= 6 && y <= 13 && x >= 4 && x <= 11;
      const arch = y >= 6 && y <= 7 && (x <= 4 || x >= 11);
      if (mouth && !arch) {
        const ember = y >= 11 && rnd(x, y, 17) < 0.5;
        return op(vary(ember ? [230, 120, 40] : [40, 34, 36], 0.9 + n * 0.2));
      }
      const brickish = y % 5 === 4 || (x + (Math.floor(y / 5) % 2) * 3) % 6 === 0;
      return op(vary([118, 118, 122], brickish ? 0.6 : 0.85 + n * 0.2));
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
  for (let tile = 0; tile < ATLAS_COLS * ATLAS_ROWS; tile++) {
    const ox = (tile % ATLAS_COLS) * TILE_PX, oy = Math.floor(tile / ATLAS_COLS) * TILE_PX;
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
  return [(tile % ATLAS_COLS) * TILE_PX, Math.floor(tile / ATLAS_COLS) * TILE_PX];
}

// --- Atlas de objetos -------------------------------------------------------
// Misma rejilla de 8 × 4. Se usa en la barra, en el inventario y en el suelo (ahí las herramientas son
// cubitos de color). Todo se dibuja con rectángulos de 1 px.

const WOOD = "#8a5a2e", WOOD_D = "#4e3018";
const WOOD_HEAD = "#dda05c", WOOD_HEAD_D = "#7a5227", WOOD_EDGE = "#f2c489";
const STONE_HEAD = "#cfcfcf", STONE_HEAD_D = "#5f5f5f", STONE_EDGE = "#f4f4f4";
const IRON_HEAD = "#e4e9ef", IRON_HEAD_D = "#7d8794", IRON_EDGE = "#ffffff";
const APPLE = "#d64237", APPLE_D = "#8a1d16", LEAF = "#4f9c34", STEM = "#6b4523";
const MEAT = "#c14a4a", MEAT_D = "#7d2b2b", COOKED = "#9a5a2c", COOKED_D = "#5f3316", BONE = "#efe7d2";

/** Filas [y, x, ancho] de una silueta de 16×16. */
type Row = [number, number, number];

const AXE_ROWS: Row[] = [
  [0, 7, 2], [1, 9, 5], [2, 9, 6], [3, 9, 6], [4, 9, 6], [5, 10, 5], [6, 11, 3],
];
const SHOVEL_ROWS: Row[] = [
  [0, 6, 5], [1, 5, 7], [2, 5, 7], [3, 5, 7], [4, 6, 5], [5, 7, 3], [6, 8, 1],
];

function iconTool(
  g: CanvasRenderingContext2D, kind: "pick" | "axe" | "shovel",
  head: string, headDark: string, edge: string,
) {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // Mango en diagonal (2 px) con borde oscuro por debajo.
  for (let i = 0; i <= 7; i++) {
    px(3 + i, 13 - i, 2, 2, WOOD);
    px(3 + i, 15 - i, 2, 1, WOOD_D);
  }
  if (kind === "pick") {
    // Cabeza: barra con dos púas que bajan en los extremos, con contorno oscuro.
    px(1, 1, 14, 4, headDark);
    px(2, 2, 12, 2, head);
    px(2, 2, 12, 1, edge);
    px(1, 5, 4, 3, headDark);
    px(2, 5, 2, 2, head);
    px(11, 5, 4, 3, headDark);
    px(12, 5, 2, 2, head);
    px(4, 4, 8, 1, headDark); // sombra bajo la barra
    return;
  }
  // Hacha y pala: silueta de filas, primero el contorno y luego el relleno.
  const rows = kind === "axe" ? AXE_ROWS : SHOVEL_ROWS;
  for (const [y, x, w] of rows) px(x - 1, y, w + 2, 1, headDark);
  for (const [y, x, w] of rows) px(x, y, w, 1, head);
  if (kind === "axe") {
    px(14, 1, 1, 5, edge); // filo
    px(10, 1, 4, 1, edge);
    px(9, 3, 1, 2, headDark); // muesca de la barba
  } else {
    px(9, 1, 1, 4, edge); // brillo de la hoja
    px(7, 2, 2, 1, edge);
    px(8, 6, 1, 1, headDark);
  }
}

/** Espada: hoja en diagonal hacia arriba a la derecha, guarda y puño. */
function iconSword(g: CanvasRenderingContext2D, blade: string, bladeDark: string, edge: string) {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // Puño
  for (let i = 0; i <= 2; i++) px(3 + i, 13 - i, 2, 2, WOOD_D);
  // Guarda (perpendicular a la hoja)
  px(4, 9, 4, 2, "#8a8f98");
  px(6, 7, 2, 4, "#6f747c");
  // Hoja
  for (let i = 0; i <= 7; i++) {
    px(6 + i, 9 - i, 2, 2, blade);
    if (i > 0 && i < 6) px(6 + i, 11 - i, 1, 1, bladeDark);
  }
  px(13, 1, 2, 2, edge); // punta
  px(7, 6, 1, 3, edge); // brillo
}

function iconApple(g: CanvasRenderingContext2D) {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  px(7, 1, 2, 4, STEM);
  px(9, 2, 3, 2, LEAF);
  const rows: [number, number][] = [[5, 4], [4, 7], [3, 8], [3, 9], [3, 9], [4, 8], [5, 7], [6, 4]];
  rows.forEach(([inset, wide], i) => {
    px(inset, 4 + i, wide, 1, APPLE);
    px(inset, 4 + i, 1, 1, APPLE_D);
    px(inset + wide - 1, 4 + i, 1, 1, APPLE_D);
  });
  px(6, 6, 2, 2, "#ff8a7a");
}

function iconStick(g: CanvasRenderingContext2D) {
  for (let i = 0; i <= 9; i++) {
    g.fillStyle = i % 4 === 0 ? WOOD_D : WOOD;
    g.fillRect(4 + i, 13 - i, 2, 2);
  }
}

/** Lingote: barra de metal en perspectiva. */
function iconIngot(g: CanvasRenderingContext2D) {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  px(5, 5, 6, 2, IRON_EDGE);
  px(3, 7, 10, 4, IRON_HEAD);
  px(3, 11, 10, 1, IRON_HEAD_D);
  px(3, 7, 1, 4, IRON_HEAD_D);
  px(12, 7, 1, 4, IRON_HEAD_D);
  px(6, 8, 4, 1, "#ffffff");
}

/** Trozo de carne con hueso (cruda o asada). */
function iconMeat(g: CanvasRenderingContext2D, meat: string, dark: string) {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // Hueso
  px(2, 9, 5, 2, BONE);
  px(1, 8, 3, 4, BONE);
  // Carne
  px(5, 4, 9, 8, dark);
  px(6, 5, 8, 6, meat);
  px(7, 6, 3, 2, "#e8a0a0");
  px(6, 10, 7, 1, dark);
}

function drawItemTile(g: CanvasRenderingContext2D, tile: number) {
  if (tile === 0) iconTool(g, "pick", WOOD_HEAD, WOOD_HEAD_D, WOOD_EDGE);
  else if (tile === 1) iconTool(g, "axe", WOOD_HEAD, WOOD_HEAD_D, WOOD_EDGE);
  else if (tile === 2) iconTool(g, "shovel", WOOD_HEAD, WOOD_HEAD_D, WOOD_EDGE);
  else if (tile === 3) iconApple(g);
  else if (tile === 4) iconStick(g);
  else if (tile === 5) iconTool(g, "pick", STONE_HEAD, STONE_HEAD_D, STONE_EDGE);
  else if (tile === 6) iconTool(g, "axe", STONE_HEAD, STONE_HEAD_D, STONE_EDGE);
  else if (tile === 7) iconTool(g, "shovel", STONE_HEAD, STONE_HEAD_D, STONE_EDGE);
  else if (tile === 8) iconIngot(g);
  else if (tile === 9) iconMeat(g, MEAT, MEAT_D);
  else if (tile === 10) iconMeat(g, COOKED, COOKED_D);
  else if (tile === 11) iconSword(g, WOOD_HEAD, WOOD_HEAD_D, WOOD_EDGE);
  else if (tile === 12) iconSword(g, STONE_HEAD, STONE_HEAD_D, STONE_EDGE);
  else if (tile === 13) iconSword(g, IRON_HEAD, IRON_HEAD_D, IRON_EDGE);
  else if (tile === 14) iconTool(g, "pick", IRON_HEAD, IRON_HEAD_D, IRON_EDGE);
  else if (tile === 15) iconTool(g, "axe", IRON_HEAD, IRON_HEAD_D, IRON_EDGE);
  else if (tile === 16) iconTool(g, "shovel", IRON_HEAD, IRON_HEAD_D, IRON_EDGE);
}

let itemAtlas: HTMLCanvasElement | null = null;

export function itemAtlasCanvas(): HTMLCanvasElement {
  if (itemAtlas) return itemAtlas;
  const c = document.createElement("canvas");
  c.width = TILE_PX * ATLAS_COLS;
  c.height = TILE_PX * ATLAS_ROWS;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  for (let tile = 0; tile < ATLAS_COLS * ATLAS_ROWS; tile++) {
    g.save();
    g.translate((tile % ATLAS_COLS) * TILE_PX, Math.floor(tile / ATLAS_COLS) * TILE_PX);
    drawItemTile(g, tile);
    g.restore();
  }
  itemAtlas = c;
  return c;
}

export function itemTileOrigin(tile: number): [number, number] {
  return [(tile % ATLAS_COLS) * TILE_PX, Math.floor(tile / ATLAS_COLS) * TILE_PX];
}
