// Iconos 2D de bloques y objetos (barra rápida, inventario y montones). Sin DOM al importarse: los
// atlas se crean la primera vez que se dibuja.
import { text, type Ctx } from "../core/draw";
import { atlasCanvas, itemAtlasCanvas, itemTileOrigin, tileOrigin, TILE_PX } from "./atlas";
import { BLOCKS } from "./blocks";
import type { Stack } from "./inventory";
import { itemInfo } from "./items";

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

/** Icono de cualquier objeto: los bloques en isométrico y las herramientas/comida con su dibujo. */
export function drawItemIcon(ctx: Ctx, cx: number, cy: number, s: number, id: number) {
  const info = itemInfo(id);
  if (!info) return;
  if (info.block !== undefined) {
    drawBlockIcon(ctx, cx, cy, s, info.block);
    return;
  }
  const tile = info.icon ?? 0;
  const atlas = itemAtlasCanvas();
  const [sx, sy] = itemTileOrigin(tile);
  const side = Math.round(s * 2);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, Math.round(cx - side / 2), Math.round(cy - side / 2), side, side);
  ctx.restore();
}

/**
 * Casilla de la barra o de la mochila: fondo, icono, cantidad y barra de desgaste de las herramientas.
 * El tamaño de la casilla va en unidades lógicas (16 px es lo normal).
 */
export function drawSlot(ctx: Ctx, x: number, y: number, size: number, stack: Stack | null, selected = false) {
  ctx.fillStyle = selected ? "rgba(255,255,255,0.22)" : "rgba(8,8,18,0.72)";
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = selected ? "#ffffff" : "rgba(150,150,180,0.55)";
  ctx.lineWidth = selected ? 1.2 : 0.8;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  if (!stack) return;
  drawItemIcon(ctx, x + size / 2, y + size / 2, size * 0.36, stack.id);
  if (stack.n > 1) {
    text(ctx, String(stack.n), x + size - 1, y + size - 7, [255, 255, 255], "5px", "right");
  }
  const info = itemInfo(stack.id);
  if (info?.tool && stack.dur !== undefined) {
    const k = Math.max(0, Math.min(1, stack.dur / info.tool.dur));
    const w = size - 6;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(x + 3, y + size - 3.5, w, 2);
    ctx.fillStyle = k > 0.5 ? "#6edc6e" : k > 0.22 ? "#ffcf50" : "#ff5f5f";
    ctx.fillRect(x + 3, y + size - 3.5, w * k, 2);
  }
}
