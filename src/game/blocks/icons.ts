// Iconos del HUD: bloques en perspectiva isométrica (con el atlas) y herramientas, palos y lo que sueltan los
// animales dibujados píxel a píxel.
import type { RGB } from "../core/config";
import { css, type Ctx } from "../core/draw";
import { atlasCanvas, tileOrigin, TILE_PX } from "./atlas";
import { BLOCKS, TORCH } from "./blocks";
import {
  BEEF, CHARCOAL, CHICKEN_MEAT, COAL, COOKED_BEEF, COOKED_CHICKEN, COOKED_MUTTON, COOKED_PORK, DIAMOND, FEATHER,
  ARROW, BONE, GUNPOWDER, IRON_INGOT, LEATHER, MUTTON, PORK, ROTTEN_FLESH, STICK, STRING, WOOL, itemInfo,
} from "./items";

/** Icono de un bloque en perspectiva isométrica (cara de arriba y dos lados), centrado en (cx, cy). */
export function drawBlockIcon(ctx: Ctx, cx: number, cy: number, s: number, block: number) {
  const atlas = atlasCanvas();
  const [top, side] = BLOCKS[block].tiles;
  const k = 0.866 * s / TILE_PX, h = 0.5 * s / TILE_PX, v = s / TILE_PX;
  const face = (tile: number, a: number, b: number, c: number, d: number, e: number, f: number, dark: number) => {
    const [sx, sy] = tileOrigin(tile);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.transform(a, b, c, d, e, f);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    if (dark) {
      ctx.fillStyle = `rgba(0,0,0,${dark})`;
      ctx.fillRect(0, 0, TILE_PX, TILE_PX);
    }
    ctx.restore();
  };
  face(top, k, h, -k, h, 0, -s, 0); // arriba: de la punta de arriba hacia derecha e izquierda
  face(side, k, h, 0, v, -0.866 * s, -0.5 * s, 0.25); // lado izquierdo
  face(side, k, -h, 0, v, 0, 0, 0.42); // lado derecho
}

/** Casilla del atlas plana (para lo que no es un cubo, como la antorcha). */
function drawFlatTile(ctx: Ctx, cx: number, cy: number, s: number, tile: number) {
  const [sx, sy] = tileOrigin(tile);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlasCanvas(), sx, sy, TILE_PX, TILE_PX, cx - s * 1.2, cy - s * 1.3, s * 2.4, s * 2.4);
  ctx.restore();
}

// Dibujos de 8 × 8: h = cabeza de la herramienta, s = mango.
const SPRITES: Record<string, string[]> = {
  pick: [".hhhhhh.", "hh.ss.hh", "...ss...", "...ss...", "...ss...", "...ss...", "...ss...", "........"],
  axe: ["...hh...", "..hhss..", ".hhhss..", "..hhss..", "....ss..", "....ss..", "....ss..", "........"],
  shovel: ["...hh...", "..hhhh..", "..hhhh..", "...ss...", "...ss...", "...ss...", "...ss...", "........"],
  sword: ["......hh", ".....hhh", "....hhh.", "...hhh..", ".s.hh...", "..ss....", ".s.s....", "s......."],
  stick: ["......s.", ".....s..", "....s...", "...s....", "..s.....", ".s......", "........", "........"],
};
const HANDLE: RGB = [122, 86, 50];
const HEAD: Record<number, RGB> = { 1: [176, 132, 78], 2: [140, 140, 148], 3: [226, 226, 232], 4: [92, 232, 222] };

// Lo que sueltan los animales: dibujo y colores (a = borde, b = relleno, c = vetas o detalle).
const MEAT = ["........", "..aaaa..", ".abbbba.", "abbcbbba", "abbbbcba", ".abbbba.", "..aaaa..", "........"];
const LUMP = ["........", "...aa...", "..abba..", ".abbbba.", ".abbbbba", "..abbba.", "...aa...", "........"];
const DRUMSTICK = ["........", "...bbb..", "..bbbbb.", "..bbbbb.", "...bbb..", "..cc....", ".cc.....", "c......."];
const LOOT: Record<number, [string[], Record<string, RGB>]> = {
  [COAL]: [LUMP, { a: [20, 20, 22], b: [52, 52, 58] }],
  [CHARCOAL]: [LUMP, { a: [36, 26, 18], b: [74, 56, 40] }],
  [IRON_INGOT]: [
    ["........", "........", "...aaaa.", "..abbba.", ".abbba..", ".aaaa...", "........", "........"],
    { a: [150, 150, 158], b: [226, 226, 232] },
  ],
  [DIAMOND]: [
    ["........", "..aaaa..", ".abbbba.", "abbcbbba", ".abbbba.", "..abba..", "...aa...", "........"],
    { a: [40, 150, 150], b: [92, 232, 222], c: [230, 255, 255] },
  ],
  [COOKED_BEEF]: [MEAT, { a: [210, 170, 120], b: [120, 66, 36], c: [168, 108, 60] }],
  [COOKED_PORK]: [MEAT, { a: [236, 200, 150], b: [196, 120, 70], c: [226, 170, 110] }],
  [COOKED_MUTTON]: [MEAT, { a: [170, 100, 60], b: [110, 52, 30], c: [196, 150, 110] }],
  [COOKED_CHICKEN]: [DRUMSTICK, { b: [196, 130, 64], c: [245, 245, 235] }],
  [ROTTEN_FLESH]: [MEAT, { a: [120, 90, 40], b: [150, 80, 50], c: [96, 130, 60] }],
  [BONE]: [
    ["......aa", ".....aaa", "....aaa.", "...aa...", "..aa....", ".aaa....", "aaa.....", "aa......"],
    { a: [236, 232, 214] },
  ],
  [ARROW]: [
    [".....ccc", "......cc", ".....s.c", "....s...", "...s....", "ff.s....", "fff.....", "ff......"],
    { s: [122, 86, 50], c: [170, 170, 176], f: [236, 236, 236] },
  ],
  [STRING]: [
    ["........", ".a......", "..a..a..", "...aa.a.", "...a...a", "..a.....", ".a......", "........"],
    { a: [240, 240, 240] },
  ],
  [GUNPOWDER]: [
    ["........", "...a....", "..aba...", ".abbba..", "abbbbba.", ".aaaaa..", "........", "........"],
    { a: [70, 70, 74], b: [120, 120, 126] },
  ],
  [BEEF]: [MEAT, { a: [236, 226, 210], b: [186, 40, 46], c: [236, 226, 210] }],
  [PORK]: [MEAT, { a: [250, 214, 214], b: [236, 136, 148], c: [250, 200, 206] }],
  [MUTTON]: [MEAT, { a: [214, 92, 78], b: [164, 40, 40], c: [232, 204, 192] }],
  [CHICKEN_MEAT]: [DRUMSTICK, { b: [240, 202, 180], c: [245, 245, 235] }],
  [LEATHER]: [
    ["........", ".aaaaaa.", ".abbbba.", "aabbbbaa", ".abbbba.", ".abbbba.", ".aa..aa.", "........"],
    { a: [110, 62, 34], b: [156, 94, 52] },
  ],
  [WOOL]: [
    ["........", ".aaaaaa.", "aabbabba", "abbbbbba", "abbabbba", "aabbbbaa", ".aaaaaa.", "........"],
    { a: [196, 196, 200], b: [246, 246, 246] },
  ],
  [FEATHER]: [
    ["......aa", ".....aba", "....abba", "...abba.", "..abba..", ".abba...", ".ca.....", "c......."],
    { a: [196, 196, 208], b: [250, 250, 250], c: [120, 120, 120] },
  ],
};

function drawSprite(ctx: Ctx, cx: number, cy: number, s: number, rows: string[], colors: Record<string, RGB>) {
  const px = (s * 2) / 8;
  const x0 = cx - s, y0 = cy - s;
  rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) {
      const ch = row[x];
      if (ch === "." || !colors[ch]) continue;
      // Contorno oscuro de un píxel lógico para que se lea sobre cualquier fondo.
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x0 + x * px + px * 0.35, y0 + y * px + px * 0.35, px, px);
      ctx.fillStyle = css(colors[ch]);
      ctx.fillRect(x0 + x * px, y0 + y * px, px, px);
    }
  });
}

/** Icono de cualquier objeto del inventario, centrado en (cx, cy), de "radio" s. */
export function drawItemIcon(ctx: Ctx, cx: number, cy: number, s: number, id: number) {
  if (id === TORCH) return drawFlatTile(ctx, cx, cy, s, BLOCKS[TORCH].tiles[1]);
  if (id > 0 && id < BLOCKS.length) return drawBlockIcon(ctx, cx, cy, s, id);
  if (id === STICK) return drawSprite(ctx, cx, cy, s, SPRITES.stick, { s: HANDLE });
  if (LOOT[id]) return drawSprite(ctx, cx, cy, s, ...LOOT[id]);
  const tool = itemInfo(id).tool;
  if (tool) drawSprite(ctx, cx, cy, s, SPRITES[tool.kind], { h: HEAD[tool.tier], s: HANDLE });
}
