// Render en modo 7 de Sumo de bolas. Cámara fija al sur de la arena. Cada píxel del suelo se proyecta
// sobre dos planos: la plataforma y la lava (más abajo). Si el rayo cae fuera de la plataforma pero
// dentro del círculo en la lava, ha atravesado el lateral del cilindro: ahí se pinta la pared.
import { PLAYER_COLORS, PLAYER_NAMES, type RGB } from "../core/config";
import { css, fillCircle, fillEllipse, roundRect, shade, text, type Ctx } from "../core/draw";
import {
  BALL_R, BH, BW, CAM_DIST, CAM_FOLLOW, CAM_HEIGHT, CHECKER, DASH_COOLDOWN, FOCAL, HORIZON, LAVA_DROP, MAX_SPEED,
  RIM_W, ROUND_TIME, SHRINK_START,
} from "./config";
import type { BallState } from "./arena";

export interface BallSprite {
  index: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  state: BallState;
  dashCool: number;
}

export interface BallsResult {
  index: number;
  place: number;
  ai: boolean;
}

/** Todo lo que hace falta para dibujar un frame desde el punto de vista de un jugador. */
export interface BallsView {
  balls: BallSprite[];
  me: number;
  radius: number;
  phase: number;
  countdown: number;
  time: number;
  wins: number[];
  aiSlots: boolean[];
  results: BallsResult[] | null;
  netLabel: string;
  footer: string;
}

const pack = (c: RGB) => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
const SMALL = "bold 8px Arial, sans-serif";
const MID = "bold 11px Arial, sans-serif";
const TINY = "bold 7px Arial, sans-serif";

export function ballName(index: number, ai: boolean): string {
  return ai ? `CPU ${index + 1}` : PLAYER_NAMES[index];
}

// --- Lava: ruido de valor en una baldosa de 128×128 y paleta que se desplaza con el tiempo ---
const LAVA_N = 128;
const lavaHeights = (() => {
  const h = new Uint8Array(LAVA_N * LAVA_N);
  const grid = (cells: number) => {
    const g = Array.from({ length: cells * cells }, () => Math.random());
    return (x: number, y: number) => {
      const fx = (x / LAVA_N) * cells;
      const fy = (y / LAVA_N) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => g[((j % cells) * cells) + (i % cells)];
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return top + (bot - top) * sy;
    };
  };
  const big = grid(8);
  const small = grid(32);
  for (let y = 0; y < LAVA_N; y++) {
    for (let x = 0; x < LAVA_N; x++) h[y * LAVA_N + x] = Math.floor((big(x, y) * 0.7 + small(x, y) * 0.3) * 255);
  }
  return h;
})();

/** Paleta cíclica de la lava: rojo oscuro → naranja → amarillo → naranja... */
const lavaPalette = (() => {
  const p = new Uint32Array(256);
  const stops: RGB[] = [[150, 24, 8], [220, 60, 10], [250, 130, 20], [255, 210, 70], [250, 130, 20], [220, 60, 10]];
  for (let i = 0; i < 256; i++) {
    const f = (i / 256) * stops.length;
    const a = stops[Math.floor(f)];
    const b = stops[(Math.floor(f) + 1) % stops.length];
    const t = f - Math.floor(f);
    p[i] = pack([0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t)) as unknown as RGB);
  }
  return p;
})();

const TILE_A = pack([226, 202, 158]);
const TILE_B = pack([158, 108, 72]);
const RIM_A = pack([132, 122, 116]);
const RIM_B = pack([112, 104, 100]);
const SKY_TOP: RGB = [30, 10, 14];
const SKY_BOTTOM: RGB = [120, 38, 20];
const SMOKE: RGB = [70, 18, 12];
const BRICK: RGB = [150, 70, 50];
const MORTAR: RGB = [70, 40, 34];

interface Splash {
  x: number;
  y: number;
  t: number;
}

export class BallsRenderer {
  time = 0;
  private readonly img = new ImageData(BW, BH);
  private readonly px = new Uint32Array(this.img.data.buffer);
  private readonly off = document.createElement("canvas");
  private readonly offCtx: CanvasRenderingContext2D;
  private camX = 0;
  // Estado anterior de cada bola (para detectar cuándo toca la lava).
  private prev = new Map<number, { state: BallState }>();
  private splashes: Splash[] = [];
  private outAt = new Map<number, number>();

  constructor() {
    this.off.width = BW;
    this.off.height = BH;
    this.offCtx = this.off.getContext("2d")!;
  }

  reset() {
    this.prev.clear();
    this.splashes = [];
    this.outAt.clear();
  }

  update(dt: number) {
    this.time += dt;
    for (const s of this.splashes) s.t += dt;
    this.splashes = this.splashes.filter((s) => s.t < 0.8);
  }

  draw(ctx: Ctx, v: BallsView) {
    const me = v.balls[v.me];
    if (me && me.state === 0) this.camX += (me.x * CAM_FOLLOW - this.camX) * 0.08;
    this.track(v);

    this.drawBackground(v.radius);
    this.offCtx.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, BW, BH);

    this.drawSplashes(ctx);
    // De lejos a cerca.
    const order = [...v.balls].filter((b) => b.state !== 2).sort((a, b) => a.y - b.y);
    for (const b of order) this.drawBall(ctx, b, v);
    this.drawHud(ctx, v);
  }

  /** Proyecta un punto del mundo (h = altura sobre la plataforma). */
  private project(x: number, y: number, h: number): { sx: number; sy: number; s: number; depth: number } {
    const depth = Math.max(8, CAM_DIST - y);
    const s = FOCAL / depth;
    return { sx: BW / 2 + (x - this.camX) * s, sy: HORIZON + (CAM_HEIGHT - h) * s, s, depth };
  }

  /** Chapoteos al tocar la lava. */
  private track(v: BallsView) {
    for (const b of v.balls) {
      const p = this.prev.get(b.index);
      if (p && p.state !== 2 && b.state === 2) {
        this.splashes.push({ x: b.x, y: b.y, t: 0 });
        this.outAt.set(b.index, this.time);
      }
      this.prev.set(b.index, { state: b.state });
    }
  }

  // --- fondo: cielo, plataforma, pared y lava ---
  private drawBackground(radius: number) {
    const px = this.px;
    for (let y = 0; y <= HORIZON; y++) {
      const t = y / HORIZON;
      px.fill(pack([0, 1, 2].map((k) => Math.round(SKY_TOP[k] + (SKY_BOTTOM[k] - SKY_TOP[k]) * t)) as unknown as RGB), y * BW, (y + 1) * BW);
    }
    const R2 = radius * radius;
    const rimIn = Math.max(0, radius - RIM_W);
    const rimIn2 = rimIn * rimIn;
    const flow = this.time * 5;
    const cycle = Math.floor(this.time * 40);
    const camX = this.camX;
    for (let y = HORIZON + 1; y < BH; y++) {
      const dy = y - HORIZON;
      const z1 = (CAM_HEIGHT * FOCAL) / dy; // distancia a la que la fila toca la plataforma
      const z2 = ((CAM_HEIGHT + LAVA_DROP) * FOCAL) / dy; // ... y la lava
      const step1 = z1 / FOCAL;
      const step2 = z2 / FOCAL;
      const wy1 = CAM_DIST - z1;
      const wy2 = CAM_DIST - z2;
      let wx1 = camX - step1 * (BW / 2);
      let wx2 = camX - step2 * (BW / 2);
      // Niebla de humo hacia el horizonte (solo la lava llega tan lejos).
      const fa = Math.round(Math.max(0, Math.min(1, (z2 - 260) / 700)) * 220);
      const lavaRow = ((((wy2 + flow * 0.6) / 2) | 0) & (LAVA_N - 1)) * LAVA_N;
      let o = y * BW;
      for (let x = 0; x < BW; x++, o++, wx1 += step1, wx2 += step2) {
        const d1 = wx1 * wx1 + wy1 * wy1;
        let c: number;
        if (d1 < R2) {
          if (d1 > rimIn2) c = ((Math.floor(wx1 / 7) ^ Math.floor(wy1 / 7)) & 1) ? RIM_A : RIM_B;
          else c = ((Math.floor(wx1 / CHECKER) ^ Math.floor(wy1 / CHECKER)) & 1) ? TILE_A : TILE_B;
        } else if (wx2 * wx2 + wy2 * wy2 < R2) {
          c = this.wall(wx1, wy1, wx2, wy2, d1, R2, radius);
        } else {
          const h = lavaHeights[lavaRow + ((((wx2 + flow) / 2) | 0) & (LAVA_N - 1))];
          c = lavaPalette[(h + cycle) & 255];
          if (fa) c = blend(c, SMOKE, fa);
        }
        px[o] = c;
      }
    }
  }

  /** Lateral del cilindro: ladrillos, más oscuros hacia los lados y con el resplandor de la lava abajo. */
  private wall(x1: number, y1: number, x2: number, y2: number, d1: number, R2: number, radius: number): number {
    // Punto donde el rayo entra en el cilindro: |p1 + t (p2 − p1)| = R.
    const ex = x2 - x1, ey = y2 - y1;
    const a = ex * ex + ey * ey;
    const b = 2 * (x1 * ex + y1 * ey);
    const disc = Math.max(0, b * b - 4 * a * (d1 - R2));
    const t = Math.max(0, Math.min(1, (-b - Math.sqrt(disc)) / (2 * a)));
    const hx = x1 + ex * t, hy = y1 + ey * t;
    const rows = t * 3;
    const row = Math.floor(rows);
    const col = (Math.atan2(hy, hx) * radius) / 14 + (row & 1) * 0.5;
    const mortar = rows - row < 0.14 || col - Math.floor(col) < 0.1;
    const light = 0.35 + 0.65 * Math.max(0, hy / radius);
    let c: RGB = shade(mortar ? MORTAR : BRICK, light);
    const glow = t * t * t;
    c = [c[0] + (255 - c[0]) * glow * 0.6, c[1] + (120 - c[1]) * glow * 0.4, c[2] * (1 - glow * 0.5)].map(Math.round) as unknown as RGB;
    return pack(c);
  }

  private drawSplashes(ctx: Ctx) {
    for (const s of this.splashes) {
      const p = this.project(s.x, s.y, -LAVA_DROP);
      const k = s.t / 0.8;
      ctx.strokeStyle = `rgba(255,200,80,${1 - k})`;
      ctx.lineWidth = Math.max(1, 2 * p.s);
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, BALL_R * p.s * (1 + k * 1.6), BALL_R * p.s * 0.35 * (1 + k * 1.6), 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = BALL_R * p.s * (0.4 + k * 1.2);
        const up = Math.sin(k * Math.PI) * 14 * p.s;
        fillCircle(ctx, p.sx + Math.cos(a) * r, p.sy - up + Math.sin(a) * r * 0.3, 1.4 * p.s * (1 - k), [255, 170, 40]);
      }
    }
  }

  // --- bolas y personajes ---
  private drawBall(ctx: Ctx, b: BallSprite, v: BallsView) {
    const color = PLAYER_COLORS[b.index];
    const g = this.project(b.x, b.y, 0);
    const c = this.project(b.x, b.y, BALL_R + b.z);
    const r = BALL_R * c.s;
    if (r < 1) return;
    ctx.save();
    // Al caer por el fondo, la plataforma tapa la bola.
    if (b.state === 1 && b.y < 0 && Math.abs(b.x) < v.radius) {
      const edge = this.project(b.x, -Math.sqrt(v.radius * v.radius - b.x * b.x), 0);
      ctx.beginPath();
      ctx.rect(0, 0, BW, edge.sy);
      ctx.clip();
    }
    // Sombra sobre la plataforma (aplastada por la perspectiva).
    if (b.state === 0) {
      const hh = r * (CAM_HEIGHT / g.depth);
      fillEllipse(ctx, g.sx - r, g.sy - hh, r * 2, hh * 2, "rgba(0,0,0,0.35)");
    }

    const grad = ctx.createRadialGradient(c.sx - r * 0.35, c.sy - r * 0.4, r * 0.1, c.sx, c.sy, r);
    grad.addColorStop(0, css([Math.min(255, color[0] + 110), Math.min(255, color[1] + 110), Math.min(255, color[2] + 110)]));
    grad.addColorStop(0.55, css(color));
    grad.addColorStop(1, css(shade(color, 0.45)));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, r, 0, Math.PI * 2);
    ctx.fill();
    if (b.state === 0 || b.z > -BALL_R) this.drawRider(ctx, b, c.sx, c.sy - r, c.s, b.index === v.me);
    ctx.restore();
  }

  /** Personaje de pie sobre la bola, haciendo equilibrio (se inclina hacia donde rueda). */
  private drawRider(ctx: Ctx, b: BallSprite, fx: number, fy: number, s: number, mine: boolean) {
    const color = PLAYER_COLORS[b.index];
    const lean = Math.max(-0.45, Math.min(0.45, (b.vx / MAX_SPEED) * 0.45));
    const wave = Math.sin(this.time * 9 + b.index) * 0.25;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(lean);
    ctx.scale(s, s);
    // Piernas
    ctx.fillStyle = "#2a2a3a";
    ctx.fillRect(-2.6, -5, 2, 5);
    ctx.fillRect(0.6, -5, 2, 5);
    // Brazos abiertos para mantener el equilibrio
    ctx.strokeStyle = css(shade(color, 0.8));
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-3, -10);
    ctx.lineTo(-7.5, -12 + wave * 6);
    ctx.moveTo(3, -10);
    ctx.lineTo(7.5, -12 - wave * 6);
    ctx.stroke();
    // Cuerpo con el número del jugador
    roundRect(ctx, -3.6, -12.5, 7.2, 8, 2, shade(color, 0.8), [20, 20, 28], 0.6);
    text(ctx, String(b.index + 1), 0, -8.4, [255, 255, 255], "bold 6px Arial, sans-serif", "center", "middle");
    // Cabeza y gorra
    fillCircle(ctx, 0, -15.5, 3.2, [250, 214, 180]);
    ctx.fillStyle = css(color);
    ctx.beginPath();
    ctx.arc(0, -16.2, 3.4, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-0.5, -16.6, 4.8, 1.2);
    ctx.restore();
    // Marca sobre el propio jugador
    if (mine) {
      const y = fy - 22 * s;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(fx - 3.5, y - 4);
      ctx.lineTo(fx + 3.5, y - 4);
      ctx.lineTo(fx, y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- HUD ---
  private drawHud(ctx: Ctx, v: BallsView) {
    const shadowText = (str: string, x: number, y: number, color: RGB, font: string, align: CanvasTextAlign = "left") => {
      text(ctx, str, x + 1, y + 1, [0, 0, 0], font, align);
      text(ctx, str, x, y, color, font, align);
    };
    // Tiempo restante en un círculo, arriba a la izquierda.
    const left = Math.max(0, Math.ceil(ROUND_TIME - v.time));
    fillCircle(ctx, 16, 16, 12, [20, 20, 30]);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(16, 16, 11, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, String(left), 16, 16.5, left <= 10 ? [255, 120, 100] : [255, 255, 255], "bold 11px Arial, sans-serif", "center", "middle");

    const alive = v.balls.filter((b) => b.state === 0).length;
    shadowText(`EN PIE ${alive}/${v.balls.length}`, BW - 5, 5, [255, 220, 60], SMALL, "right");
    // Victorias acumuladas
    v.balls.forEach((_, i) => {
      const w = v.wins[i] ?? 0;
      const y = 17 + i * 9;
      fillCircle(ctx, BW - 40, y + 3.5, 3, PLAYER_COLORS[i]);
      text(ctx, String(i + 1), BW - 40, y + 3.7, [0, 0, 0], "bold 5px Arial, sans-serif", "center", "middle");
      shadowText(`${w}`, BW - 5, y, [235, 235, 245], TINY, "right");
      if (i === v.me) shadowText("tú", BW - 33, y, [235, 235, 245], TINY);
    });

    const me = v.balls[v.me];
    // Embestida lista (barra)
    if (me && me.state === 0 && v.phase === 1) {
      const k = 1 - me.dashCool / DASH_COOLDOWN;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(5, BH - 22, 44, 6);
      ctx.fillStyle = k >= 1 ? css(PLAYER_COLORS[v.me]) : "rgba(200,200,210,0.7)";
      ctx.fillRect(6, BH - 21, 42 * k, 4);
      shadowText("EMBESTIDA", 5, BH - 31, [235, 235, 245], TINY);
    }

    // Encima del texto de ayuda para no pisarse en pantallas estrechas.
    if (v.netLabel) shadowText(v.netLabel, BW - 4, BH - 20, [200, 200, 220], TINY, "right");
    if (v.footer && !v.results) shadowText(v.footer, BW / 2, BH - 10, [235, 235, 245], TINY, "center");

    if (v.phase === 0) {
      shadowText(String(Math.ceil(v.countdown)), BW / 2, 70, [255, 230, 80], "bold 40px Arial, sans-serif", "center");
    } else if (v.phase === 1 && v.time < 0.8) {
      shadowText("¡YA!", BW / 2, 70, [120, 255, 120], "bold 34px Arial, sans-serif", "center");
    } else if (v.phase === 1 && v.time > SHRINK_START && v.time < SHRINK_START + 2.5) {
      shadowText("¡La plataforma se encoge!", BW / 2, 58, [255, 200, 120], MID, "center");
    }
    const outAt = this.outAt.get(v.me);
    if (me && me.state !== 0 && !v.results) {
      const recent = outAt === undefined || this.time - outAt < 2;
      shadowText(recent ? "¡A LA LAVA!" : "Eliminado · mirando", BW / 2, 40, [255, 140, 80], recent ? "bold 16px Arial, sans-serif" : SMALL, "center");
    }
    if (v.results) this.drawResults(ctx, v);
  }

  private drawResults(ctx: Ctx, v: BallsView) {
    const res = v.results!;
    const winners = res.filter((r) => r.place === 1);
    const solo = v.balls.length === 1;
    const title = solo
      ? (v.balls[0].state === 0 ? "¡AGUANTASTE!" : `AGUANTASTE ${Math.floor(v.time)} s`)
      : winners.length === 1 ? `¡GANA ${ballName(winners[0].index, winners[0].ai).toUpperCase()}!` : "¡EMPATE!";
    const titleColor: RGB = winners.length === 1 && !solo ? PLAYER_COLORS[winners[0].index] : [235, 235, 245];
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(20, 40, BW - 40, 46 + res.length * 16);
    text(ctx, title, BW / 2, 47, titleColor, MID, "center");
    text(ctx, "Victorias", BW - 30, 63, [170, 170, 190], TINY, "right");
    res.forEach((r, i) => {
      const y = 72 + i * 16;
      const color = PLAYER_COLORS[r.index];
      fillCircle(ctx, 36, y + 5, 5, color);
      text(ctx, String(r.index + 1), 36, y + 5.3, [0, 0, 0], "bold 7px Arial, sans-serif", "center", "middle");
      text(ctx, `${r.place}º`, 46, y, [255, 255, 255], MID);
      text(ctx, ballName(r.index, r.ai) + (r.index === v.me ? " (tú)" : ""), 66, y, color, MID);
      text(ctx, String(v.wins[r.index] ?? 0), BW - 30, y, [255, 220, 60], MID, "right");
    });
    text(ctx, v.footer, BW / 2, 76 + res.length * 16, [235, 235, 245], SMALL, "center");
  }
}

function blend(c: number, to: RGB, a: number): number {
  const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  return ((255 << 24) |
    (((b * (256 - a) + to[2] * a) >> 8) << 16) |
    (((g * (256 - a) + to[1] * a) >> 8) << 8) |
    ((r * (256 - a) + to[0] * a) >> 8)) >>> 0;
}
