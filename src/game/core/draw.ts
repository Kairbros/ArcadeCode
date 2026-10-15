// Primitivas de dibujo sobre Canvas 2D (equivalentes a pygame.draw).
import type { RGB } from "./config";

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

export function text(
  ctx: Ctx, str: string, x: number, y: number, color: RGB, font: string,
  align: CanvasTextAlign = "left", baseline: CanvasTextBaseline = "top",
) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = css(color);
  ctx.fillText(str, x, y);
}
