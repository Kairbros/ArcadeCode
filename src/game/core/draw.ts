// Primitivas de dibujo sobre Canvas 2D (equivalentes a pygame.draw).
import type { RGB } from "./config";
import { C_BG, C_LINE } from "./theme";
import { drawPixelText, fontSize, measurePixelText, pixelDot } from "./pixelfont";

export type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export function css(c: RGB, alpha = 1): string {
  return alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

export function shade(c: RGB, k: number): RGB {
  return [Math.floor(c[0] * k), Math.floor(c[1] * k), Math.floor(c[2] * k)];
}

export function fillRect(ctx: Ctx, x: number, y: number, w: number, h: number, color: RGB) {
  ctx.fillStyle = css(color);
  ctx.fillRect(x, y, w, h);
}

/** Borde dibujado hacia dentro del rectángulo (como pygame). */
export function strokeRect(ctx: Ctx, x: number, y: number, w: number, h: number, color: RGB, width: number) {
  ctx.strokeStyle = css(color);
  ctx.lineWidth = width;
  ctx.strokeRect(x + width / 2, y + width / 2, w - width, h - width);
}

export function roundRect(
  ctx: Ctx, x: number, y: number, w: number, h: number, radius: number, fill?: RGB, stroke?: RGB, width = 2,
) {
  ctx.beginPath();
  if (stroke && !fill) ctx.roundRect(x + width / 2, y + width / 2, w - width, h - width, radius);
  else ctx.roundRect(x, y, w, h, radius);
  if (fill) {
    ctx.fillStyle = css(fill);
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = css(stroke);
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

export function fillCircle(ctx: Ctx, x: number, y: number, r: number, color: RGB) {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = css(color);
  ctx.fill();
}

export function strokeCircle(ctx: Ctx, x: number, y: number, r: number, color: RGB, width: number) {
  if (r <= width / 2) return;
  ctx.beginPath();
  ctx.arc(x, y, r - width / 2, 0, TAU);
  ctx.strokeStyle = css(color);
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Elipse inscrita en el rectángulo (x, y, w, h). */
export function fillEllipse(ctx: Ctx, x: number, y: number, w: number, h: number, color: RGB | string) {
  if (w <= 0 || h <= 0) return;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU);
  ctx.fillStyle = typeof color === "string" ? color : css(color);
  ctx.fill();
}

export function strokeEllipse(ctx: Ctx, x: number, y: number, w: number, h: number, color: RGB, width: number) {
  if (w <= width || h <= width) return;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, (w - width) / 2, (h - width) / 2, 0, 0, TAU);
  ctx.strokeStyle = css(color);
  ctx.lineWidth = width;
  ctx.stroke();
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: RGB, width: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = css(color);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();
}

export function polygon(ctx: Ctx, pts: [number, number][], fill: RGB, stroke?: RGB, width = 2) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = css(fill);
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = css(stroke);
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

// --- Texto y adornos de recreativa ---
// Todo el texto sale con la fuente de píxeles (core/pixelfont): de `font` solo cuenta el tamaño en px.

export function text(
  ctx: Ctx, str: string, x: number, y: number, color: RGB, font: string,
  align: CanvasTextAlign = "left", baseline: CanvasTextBaseline = "top",
) {
  ctx.fillStyle = css(color);
  drawPixelText(ctx, str, x, y, fontSize(font), align, baseline);
}

/** Ancho del texto en unidades lógicas (sustituye a measureText). */
export function textWidth(ctx: Ctx, str: string, font: string): number {
  return measurePixelText(ctx, str, fontSize(font));
}

/** Ancho de un rótulo de titleText (letra gruesa y más separada). */
export function titleWidth(ctx: Ctx, str: string, font: string): number {
  const size = fontSize(font);
  return measurePixelText(ctx, str, size, 2) + pixelDot(ctx, size);
}

/** Recorta el texto con "…" para que quepa en `width` (con `measure = titleWidth` para los rótulos). */
export function fitText(ctx: Ctx, str: string, width: number, font: string, measure = textWidth): string {
  if (measure(ctx, str, font) <= width) return str;
  let s = str;
  while (s.length > 1 && measure(ctx, s + "…", font) > width) s = s.slice(0, -1);
  return s + "…";
}

/** Texto con sombra dura de un punto abajo a la derecha. */
export function shadowText(
  ctx: Ctx, str: string, x: number, y: number, color: RGB, font: string,
  align: CanvasTextAlign = "left", baseline: CanvasTextBaseline = "top",
) {
  const d = pixelDot(ctx, fontSize(font));
  text(ctx, str, x + d, y + d, [0, 0, 0], font, align, baseline);
  text(ctx, str, x, y, color, font, align, baseline);
}

/**
 * Rótulo grande (cuentas atrás, carteles): letra gruesa (trazo de dos puntos), relieve oscuro abajo a la
 * derecha, sombra negra y una franja clara arriba, como los rótulos de las recreativas.
 */
export function titleText(
  ctx: Ctx, str: string, x: number, y: number, color: RGB, font: string,
  align: CanvasTextAlign = "center", baseline: CanvasTextBaseline = "top",
) {
  const size = fontSize(font);
  const d = pixelDot(ctx, size);
  // El trazo doble ensancha un punto: se compensa para que siga centrado/alineado, y las letras van
  // un punto más separadas para que no se peguen.
  const x0 = align === "center" ? x - d / 2 : align === "right" || align === "end" ? x - d : x;
  const bold = (dx: number, dy: number, c: RGB) => {
    ctx.fillStyle = css(c);
    drawPixelText(ctx, str, x0 + dx, y + dy, size, align, baseline, 2);
    drawPixelText(ctx, str, x0 + dx + d, y + dy, size, align, baseline, 2);
  };
  bold(d * 2, d * 2, [0, 0, 0]);
  bold(d, d, shade(color, 0.35));
  bold(0, 0, color);
  // Brillo en las dos filas de arriba de las letras.
  ctx.save();
  const top = baseline === "middle" ? y - d * 3.5 : baseline === "top" || baseline === "hanging" ? y + d : y - d * 7;
  ctx.beginPath();
  ctx.rect(x - 4000, top, 8000, d * 2);
  ctx.clip();
  bold(0, 0, mix(color, [255, 255, 255], 0.6));
  ctx.restore();
}

/** titleText recortado con "…" para que quepa en `width`. */
export function fitTitle(ctx: Ctx, str: string, width: number, font: string): string {
  return fitText(ctx, str, width, font, titleWidth);
}

export function mix(a: RGB, b: RGB, k: number): RGB {
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}

/**
 * Panel de recreativa: fondo oscuro, borde de color con las esquinas recortadas, filete interior
 * más oscuro y sombra dura. `alpha` es la opacidad del fondo; `u`, el grosor del borde (en unidades
 * lógicas: 1 en los juegos de baja resolución, 2 en Bomberman).
 */
export function panel(
  ctx: Ctx, x: number, y: number, w: number, h: number, border: RGB = C_LINE, alpha = 0.8,
  bg: RGB = C_BG, u = 1,
) {
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x + u * 2, y + h, w - u, u * 1.5);
  ctx.fillRect(x + w, y + u * 2, u * 1.5, h - u);
  ctx.fillStyle = css(bg, alpha);
  ctx.fillRect(x + u, y, w - u * 2, h);
  ctx.fillRect(x, y + u, u, h - u * 2);
  ctx.fillRect(x + w - u, y + u, u, h - u * 2);
  ctx.fillStyle = css(border);
  ctx.fillRect(x + u, y, w - u * 2, u);
  ctx.fillRect(x + u, y + h - u, w - u * 2, u);
  ctx.fillRect(x, y + u, u, h - u * 2);
  ctx.fillRect(x + w - u, y + u, u, h - u * 2);
  if (w > u * 6 && h > u * 6) {
    ctx.fillStyle = css(shade(border, 0.4), 0.9);
    ctx.fillRect(x + u, y + u, w - u * 2, u * 0.6);
    ctx.fillRect(x + u, y + u, u * 0.6, h - u * 2);
  }
}

/** Chapa cuadrada de color con el número del jugador (identifica también en escala de grises). */
export function badge(ctx: Ctx, cx: number, cy: number, half: number, color: RGB, label: string) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(cx - half + 1, cy - half + 1, half * 2, half * 2);
  ctx.fillStyle = css(shade(color, 0.45));
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
  ctx.fillStyle = css(color);
  ctx.fillRect(cx - half + 0.7, cy - half + 0.7, half * 2 - 1.4, half * 2 - 1.4);
  text(ctx, label, cx + 0.3, cy + 0.2, [0, 0, 0], `${half * 1.55}px`, "center", "middle");
}

/** Barra por segmentos (vida, carga...). `k` va de 0 a 1. */
export function segmentBar(ctx: Ctx, x: number, y: number, w: number, h: number, k: number, color: RGB, segments = 10) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const gap = Math.min(1, w / segments / 3);
  const sw = (w - gap * (segments - 1)) / segments;
  const on = Math.round(Math.max(0, Math.min(1, k)) * segments);
  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i < on ? css(color) : "rgba(255,255,255,0.12)";
    ctx.fillRect(x + i * (sw + gap), y, sw, h);
    if (i < on) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x + i * (sw + gap), y, sw, Math.min(1, h / 3));
    }
  }
}

/** Franja de arriba del casino: ciruela con un filo naranja debajo (`h` = alto sin contar el filo). */
export function hudStrip(ctx: Ctx, w: number, h: number, u = 1) {
  ctx.fillStyle = "rgba(34,16,40,0.82)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,138,36,0.9)";
  ctx.fillRect(0, h, w, u);
}
