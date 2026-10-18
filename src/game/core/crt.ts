// Efecto de pantalla de tubo encima del juego: líneas de barrido y bordes oscurecidos.
// Se dibuja en píxeles de pantalla, así las líneas salen finas y regulares a cualquier escala.

let pattern: CanvasPattern | null = null;
let patternPeriod = 0;
let vignette: { w: number; h: number; canvas: HTMLCanvasElement } | null = null;

function scanlines(ctx: CanvasRenderingContext2D, period: number): CanvasPattern | null {
  if (pattern && patternPeriod === period) return pattern;
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = period;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(0,0,0,0.22)";
  g.fillRect(0, period - Math.max(1, Math.round(period / 3)), 1, Math.max(1, Math.round(period / 3)));
  pattern = ctx.createPattern(c, "repeat");
  patternPeriod = period;
  return pattern;
}

function vignetteOf(w: number, h: number): HTMLCanvasElement {
  if (vignette && vignette.w === w && vignette.h === h) return vignette.canvas;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const r = Math.hypot(w, h) / 2;
  const grad = g.createRadialGradient(w / 2, h / 2, r * 0.55, w / 2, h / 2, r);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.38)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  vignette = { w, h, canvas: c };
  return c;
}

/** Dibuja el efecto sobre todo el lienzo. Con pantallas muy pequeñas solo oscurece los bordes. */
export function drawCrt(ctx: CanvasRenderingContext2D, pixelScale: number) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (pixelScale >= 2.5) {
    const p = scanlines(ctx, Math.max(3, Math.round(pixelScale)));
    if (p) {
      ctx.fillStyle = p;
      ctx.fillRect(0, 0, width, height);
    }
  }
  ctx.drawImage(vignetteOf(width, height), 0, 0);
  ctx.restore();
}
