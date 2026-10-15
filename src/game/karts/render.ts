// Render en modo 7: el suelo es la textura del circuito proyectada en perspectiva línea a línea
// (como en la SNES), con cielo y montañas que giran con la cámara y los karts/objetos como sprites.
import { PLAYER_COLORS, PLAYER_NAMES, type RGB } from "../core/config";
import { css, fillCircle, fillEllipse, polygon, roundRect, text, type Ctx } from "../core/draw";
import {
  CAM_DIST, CAM_HEIGHT, FOCAL, FOG_END, FOG_START, HOP_HEIGHT, HOP_TIME, HORIZON, ITEM_BANANA, ITEM_SHELL, ITEM_TURBO,
  KH, KW, LAPS, MINI_TURBO_1, MINI_TURBO_2, TEX, type ItemKind,
} from "./config";
import { drawKartSprite } from "./kart-sprite";
import { wrapAngle } from "./physics";
import { trackTexture, type DecoKind, type Track } from "./track";

export interface KartSprite {
  index: number;
  x: number;
  y: number;
  a: number;
  spin: number;
}

export interface Standing {
  index: number;
  place: number;
  time: number;
  ai: boolean;
}

/** Todo lo que hace falta para dibujar un frame desde el punto de vista de un jugador. */
export interface RaceView {
  track: Track;
  me: {
    index: number; x: number; y: number; a: number; ma: number; spin: number; steerVis: number; turbo: number;
    offroad: boolean; v: number; hop: number; drift: number; driftTime: number;
  };
  others: KartSprite[];
  boxes: { x: number; y: number; active: boolean }[];
  bananas: { x: number; y: number }[];
  shells: { x: number; y: number }[];
  phase: number;
  countdown: number;
  time: number;
  lap: number;
  rank: number;
  item: ItemKind;
  results: Standing[] | null;
  aiSlots: boolean[];
  netLabel: string;
  footer: string;
}

const MINIMAP = 52; // lado del minimapa (px lógicos)

interface Minimap {
  path: Path2D;
  map: (x: number, y: number) => [number, number];
}

/** Trazado del circuito escalado al minimapa; se calcula una vez por circuito. */
const minimaps = new WeakMap<Track, Minimap>();
function minimapOf(track: Track): Minimap {
  let m = minimaps.get(track);
  if (m) return m;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.px[i]);
    maxX = Math.max(maxX, track.px[i]);
    minY = Math.min(minY, track.py[i]);
    maxY = Math.max(maxY, track.py[i]);
  }
  const pad = 4;
  const scale = (MINIMAP - pad * 2) / Math.max(maxX - minX, maxY - minY);
  const ox = pad + (MINIMAP - pad * 2 - (maxX - minX) * scale) / 2;
  const oy = pad + (MINIMAP - pad * 2 - (maxY - minY) * scale) / 2;
  const map = (x: number, y: number): [number, number] => [ox + (x - minX) * scale, oy + (y - minY) * scale];
  const path = new Path2D();
  for (let i = 0; i < track.n; i++) {
    const [x, y] = map(track.px[i], track.py[i]);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  m = { path, map };
  minimaps.set(track, m);
  return m;
}

const pack = (c: RGB) => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
const SMALL = "bold 8px Arial, sans-serif";
const MID = "bold 11px Arial, sans-serif";

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function racerName(index: number, ai: boolean): string {
  return ai ? `CPU ${index + 1}` : PLAYER_NAMES[index];
}

export class Mode7Renderer {
  time = 0;
  private readonly img = new ImageData(KW, KH);
  private readonly px = new Uint32Array(this.img.data.buffer);
  private readonly off = document.createElement("canvas");
  private readonly offCtx: CanvasRenderingContext2D;
  private camA = 0;
  private camReady = false;

  constructor() {
    this.off.width = KW;
    this.off.height = KH;
    this.offCtx = this.off.getContext("2d")!;
  }

  reset() {
    this.camReady = false;
  }

  update(dt: number) {
    this.time += dt;
  }

  draw(ctx: Ctx, v: RaceView) {
    const me = v.me;
    // La cámara sigue la dirección de avance (no el morro): en un derrape el kart se ve cruzado.
    // Tampoco gira con los trompos.
    if (!this.camReady) {
      this.camA = me.ma;
      this.camReady = true;
    } else if (me.spin <= 0) {
      this.camA += wrapAngle(me.ma - this.camA) * 0.2;
    }
    const ca = Math.cos(this.camA);
    const sa = Math.sin(this.camA);
    const camX = me.x - ca * CAM_DIST;
    const camY = me.y - sa * CAM_DIST;

    this.drawSky(v.track);
    this.drawFloor(v.track, camX, camY, ca, sa);
    this.offCtx.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, KW, KH);

    this.drawSprites(ctx, v, camX, camY, ca, sa);
    this.drawOwnKart(ctx, v);
    this.drawHud(ctx, v);
  }

  // --- fondo ---
  private drawSky(track: Track) {
    const th = track.theme;
    const px = this.px;
    for (let y = 0; y <= HORIZON; y++) {
      const t = y / HORIZON;
      const c = pack([
        Math.round(th.skyTop[0] + (th.skyBottom[0] - th.skyTop[0]) * t),
        Math.round(th.skyTop[1] + (th.skyBottom[1] - th.skyTop[1]) * t),
        Math.round(th.skyTop[2] + (th.skyBottom[2] - th.skyTop[2]) * t),
      ]);
      px.fill(c, y * KW, (y + 1) * KW);
    }
    // Dos capas de montañas: la lejana gira más despacio (paralaje).
    const layers: [Uint8Array, RGB, number][] = [[track.hillsFar, th.hillsFar, 0.5], [track.hills, th.hills, 1]];
    for (const [heights, color, speed] of layers) {
      const c = pack(color);
      for (let x = 0; x < KW; x++) {
        const ang = this.camA * speed + Math.atan((x - KW / 2) / FOCAL);
        const idx = ((Math.floor((ang / (Math.PI * 2)) * 512) % 512) + 512) % 512;
        for (let y = HORIZON - heights[idx]; y <= HORIZON; y++) px[y * KW + x] = c;
      }
    }
  }

  private drawFloor(track: Track, camX: number, camY: number, ca: number, sa: number) {
    const tex = trackTexture(track);
    const px = this.px;
    const th = track.theme;
    const grassA = pack(th.grass);
    const grassB = pack(th.grass2);
    const fog = th.skyBottom;
    // Vector "derecha" de la cámara: (-sin, cos).
    const rx = -sa;
    const ry = ca;
    for (let y = HORIZON + 1; y < KH; y++) {
      const z = (CAM_HEIGHT * FOCAL) / (y - HORIZON); // distancia de esta fila
      const step = z / FOCAL; // unidades de mundo por píxel
      let wx = camX + ca * z - rx * step * (KW / 2);
      let wy = camY + sa * z - ry * step * (KW / 2);
      const sx = rx * step;
      const sy = ry * step;
      const f = Math.max(0, Math.min(1, (z - FOG_START) / (FOG_END - FOG_START)));
      const fa = Math.round(f * 200);
      let o = y * KW;
      for (let x = 0; x < KW; x++, o++, wx += sx, wy += sy) {
        let c: number;
        if (wx >= 0 && wy >= 0 && wx < TEX && wy < TEX) c = tex[(wy | 0) * TEX + (wx | 0)];
        else c = ((Math.floor(wx / 16) ^ Math.floor(wy / 16)) & 1) ? grassA : grassB;
        if (fa) {
          const r = c & 255;
          const g = (c >> 8) & 255;
          const b = (c >> 16) & 255;
          c = ((255 << 24) |
            (((b * (256 - fa) + fog[2] * fa) >> 8) << 16) |
            (((g * (256 - fa) + fog[1] * fa) >> 8) << 8) |
            ((r * (256 - fa) + fog[0] * fa) >> 8)) >>> 0;
        }
        px[o] = c;
      }
    }
  }

  // --- sprites ---
  private drawSprites(ctx: Ctx, v: RaceView, camX: number, camY: number, ca: number, sa: number) {
    type Item = { depth: number; draw: (sx: number, sy: number, s: number) => void };
    const items: (Item & { x: number; y: number })[] = [];
    v.track.decos.forEach((d) =>
      items.push({ x: d.x, y: d.y, depth: 0, draw: (sx, sy, s) => drawDeco(ctx, d.kind, sx, sy, s * d.size) }),
    );
    v.boxes.forEach((b) => b.active && items.push({ x: b.x, y: b.y, depth: 0, draw: (sx, sy, s) => this.drawBox(ctx, sx, sy, s) }));
    v.bananas.forEach((b) => items.push({ ...b, depth: 0, draw: (sx, sy, s) => drawBanana(ctx, sx, sy, s) }));
    v.shells.forEach((b) => items.push({ ...b, depth: 0, draw: (sx, sy, s) => drawShell(ctx, sx, sy, s) }));
    for (const k of v.others) {
      const rel = wrapAngle(k.a - this.camA) + (k.spin > 0 ? this.time * 14 : 0);
      items.push({ x: k.x, y: k.y, depth: 0, draw: (sx, sy, s) => drawKart(ctx, sx, sy, s, rel, PLAYER_COLORS[k.index], k.index + 1) });
    }
    const visible: { depth: number; sx: number; sy: number; s: number; draw: Item["draw"] }[] = [];
    for (const it of items) {
      const dx = it.x - camX;
      const dy = it.y - camY;
      const depth = dx * ca + dy * sa;
      if (depth < 6 || depth > 900) continue;
      const lateral = dx * -sa + dy * ca;
      const s = FOCAL / depth;
      const sx = KW / 2 + lateral * s;
      if (sx < -40 || sx > KW + 40) continue;
      visible.push({ depth, sx, sy: HORIZON + CAM_HEIGHT * s, s, draw: it.draw });
    }
    visible.sort((a, b) => b.depth - a.depth); // de lejos a cerca
    for (const it of visible) it.draw(it.sx, it.sy, it.s);
  }

  private drawOwnKart(ctx: Ctx, v: RaceView) {
    const me = v.me;
    const s = FOCAL / CAM_DIST;
    const bounce = me.offroad && Math.abs(me.v) > 20 ? Math.sin(this.time * 40) * 1.2 : 0;
    const hop = me.hop > 0 ? Math.sin((me.hop / HOP_TIME) * Math.PI) * HOP_HEIGHT * s : 0;
    // Morro respecto a la cámara: cruzado en el derrape, un poco girado al dar volante.
    // El cruce del derrape se exagera un poco para que se lea en pantallas pequeñas.
    const slip = wrapAngle(me.a - this.camA) * (me.drift ? 2.2 : 1);
    const rel = me.spin > 0 ? this.time * 14 : slip + me.steerVis * 0.15;
    const ground = HORIZON + CAM_HEIGHT * s + bounce;
    if (me.turbo > 0) {
      for (let i = 0; i < 3; i++) {
        const fx = KW / 2 + (Math.random() - 0.5) * 16;
        fillCircle(ctx, fx, ground + 2 + Math.random() * 4, 2 + Math.random() * 3, i % 2 ? [255, 210, 60] : [255, 120, 30]);
      }
    }
    drawKart(ctx, KW / 2, ground - hop, s, rel, PLAYER_COLORS[me.index], 0);
    if (me.drift) this.drawSparks(ctx, ground, s, rel, me.driftTime);
  }

  /** Chispas de las ruedas traseras: blancas, luego azules (miniturbo) y naranjas (miniturbo largo). */
  private drawSparks(ctx: Ctx, ground: number, s: number, rel: number, driftTime: number) {
    const color: RGB = driftTime > MINI_TURBO_2 ? [255, 150, 40] : driftTime > MINI_TURBO_1 ? [80, 170, 255] : [255, 250, 210];
    const big = driftTime > MINI_TURBO_1 ? 1.6 : 1;
    const cs = Math.cos(rel);
    const sn = Math.sin(rel);
    for (const ac of [5, -5]) {
      const wx = KW / 2 + (ac * cs - 4.5 * sn) * s;
      const wy = ground + (-4.5 * cs - ac * sn) * s * 0.32 * -1;
      for (let i = 0; i < 4; i++) {
        const r = (0.5 + Math.random() * 0.8) * s * 0.55 * big;
        fillCircle(ctx, wx + (Math.random() - 0.5) * 3 * s, wy - Math.random() * 2.5 * s, r, color);
      }
    }
  }

  private drawBox(ctx: Ctx, sx: number, sy: number, s: number) {
    const size = 9 * s;
    const lift = 5 * s + Math.sin(this.time * 4) * s;
    const hue = Math.floor(this.time * 120) % 360;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(sx, sy, size * 0.5, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsla(${hue},85%,60%,0.85)`;
    ctx.fillRect(sx - size / 2, sy - lift - size / 2, size, size);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1, s * 0.6);
    ctx.strokeRect(sx - size / 2, sy - lift - size / 2, size, size);
    if (size > 8) text(ctx, "?", sx, sy - lift, [255, 255, 255], `bold ${Math.round(size * 0.7)}px Arial, sans-serif`, "center", "middle");
  }

  // --- HUD ---
  private drawHud(ctx: Ctx, v: RaceView) {
    const shadowText = (str: string, x: number, y: number, color: RGB, font: string, align: CanvasTextAlign = "left") => {
      text(ctx, str, x + 1, y + 1, [0, 0, 0], font, align);
      text(ctx, str, x, y, color, font, align);
    };
    shadowText(`VUELTA ${Math.min(LAPS, Math.max(1, v.lap))}/${LAPS}`, 5, 4, [255, 255, 255], SMALL);
    shadowText(formatTime(v.time), 5, 14, [255, 230, 120], SMALL);
    // Posición
    const suffix = "º";
    shadowText(`${v.rank}${suffix}`, KW - 22, 3, [255, 220, 60], "bold 18px Arial, sans-serif", "right");
    shadowText(`/${v.aiSlots.length}`, KW - 5, 10, [255, 255, 255], SMALL, "right");
    // Objeto
    const bx = KW / 2 - 12;
    roundRect(ctx, bx, 3, 24, 22, 4, [20, 20, 30], [255, 255, 255], 1.5);
    if (v.item) drawItemIcon(ctx, v.item, KW / 2, 14, 16, this.time);

    this.drawMinimap(ctx, v);

    if (v.netLabel) shadowText(v.netLabel, KW - 4, KH - 10, [200, 200, 220], "bold 7px Arial, sans-serif", "right");
    if (v.footer && v.phase !== 2) shadowText(v.footer, KW / 2, KH - 10, [235, 235, 245], "bold 7px Arial, sans-serif", "center");

    if (v.phase === 0) {
      const n = Math.ceil(v.countdown);
      shadowText(String(n), KW / 2, 82, [255, 230, 80], "bold 40px Arial, sans-serif", "center");
    } else if (v.phase === 1 && v.time < 0.8) {
      shadowText("¡YA!", KW / 2, 82, [120, 255, 120], "bold 34px Arial, sans-serif", "center");
    }
    if (v.results) this.drawResults(ctx, v);
  }

  /** Minimapa arriba a la derecha: trazado, meta y karts (el propio, más grande y con borde). */
  private drawMinimap(ctx: Ctx, v: RaceView) {
    const m = minimapOf(v.track);
    const x0 = KW - MINIMAP - 4;
    const y0 = 26;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.roundRect(x0 - 2, y0 - 2, MINIMAP + 4, MINIMAP + 4, 4);
    ctx.fill();
    ctx.save();
    ctx.translate(x0, y0);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2.5;
    ctx.stroke(m.path);
    ctx.strokeStyle = "rgb(110,110,125)";
    ctx.lineWidth = 1.2;
    ctx.stroke(m.path);
    // Meta
    const [fx, fy] = m.map(v.track.px[0], v.track.py[0]);
    ctx.fillStyle = "#fff";
    ctx.fillRect(fx - 1.5, fy - 1.5, 3, 3);
    // Karts: primero los demás, el propio encima.
    for (const k of v.others) {
      const [kx, ky] = m.map(k.x, k.y);
      fillCircle(ctx, kx, ky, 2, PLAYER_COLORS[k.index]);
    }
    const [mx, my] = m.map(v.me.x, v.me.y);
    fillCircle(ctx, mx, my, 3.2, [255, 255, 255]);
    fillCircle(ctx, mx, my, 2.3, PLAYER_COLORS[v.me.index]);
    ctx.restore();
  }

  private drawResults(ctx: Ctx, v: RaceView) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(24, 40, KW - 48, 30 + v.results!.length * 18);
    text(ctx, "RESULTADOS", KW / 2, 47, [255, 220, 60], MID, "center");
    v.results!.forEach((r, i) => {
      const y = 66 + i * 18;
      const color = PLAYER_COLORS[r.index];
      fillCircle(ctx, 40, y + 5, 5, color);
      text(ctx, `${r.place}º`, 50, y, [255, 255, 255], MID);
      text(ctx, racerName(r.index, r.ai) + (r.index === v.me.index ? " (tú)" : ""), 72, y, color, MID);
      text(ctx, r.time ? formatTime(r.time) : "--", KW - 32, y, [220, 220, 230], MID, "right");
    });
    text(ctx, v.footer, KW / 2, 52 + v.results!.length * 18 + 20, [235, 235, 245], SMALL, "center");
  }
}

/** Kart visto desde la cámara. rel = rumbo del kart respecto a la cámara (0 = de espaldas). */
function drawKart(ctx: Ctx, sx: number, sy: number, s: number, rel: number, color: RGB, label: number) {
  if (s < 0.12) return;
  fillEllipse(ctx, sx - 8 * s, sy - 2.2 * s, 16 * s, 4.6 * s, "rgba(0,0,0,0.35)");
  drawKartSprite(ctx, sx, sy, s, rel, color);
  if (label && s > 0.9) {
    text(ctx, String(label), sx, sy - 12.5 * s, [0, 0, 0], `bold ${Math.max(7, Math.round(3 * s))}px Arial, sans-serif`, "center", "middle");
    text(ctx, String(label), sx, sy - 12.8 * s, [255, 255, 255], `bold ${Math.max(7, Math.round(3 * s))}px Arial, sans-serif`, "center", "middle");
  }
}

/** Decoración junto a la pista, apoyada en el suelo en (sx, sy). */
function drawDeco(ctx: Ctx, kind: DecoKind, sx: number, sy: number, s: number) {
  if (s * 14 < 1.5) return; // demasiado lejos para verse
  switch (kind) {
    case "tree":
      ctx.fillStyle = css([110, 72, 40]);
      ctx.fillRect(sx - 1.2 * s, sy - 7 * s, 2.4 * s, 7 * s);
      fillCircle(ctx, sx, sy - 11 * s, 6 * s, [38, 120, 48]);
      fillCircle(ctx, sx - 2 * s, sy - 12.5 * s, 3.2 * s, [70, 160, 70]);
      break;
    case "bush":
      fillCircle(ctx, sx - 2.5 * s, sy - 2.5 * s, 3 * s, [44, 128, 52]);
      fillCircle(ctx, sx + 2.5 * s, sy - 2.5 * s, 3 * s, [44, 128, 52]);
      fillCircle(ctx, sx, sy - 4 * s, 3.4 * s, [64, 150, 64]);
      break;
    case "cactus": {
      const g: RGB = [60, 150, 70];
      roundRect(ctx, sx - 1.6 * s, sy - 13 * s, 3.2 * s, 13 * s, 1.6 * s, g);
      roundRect(ctx, sx - 5 * s, sy - 9 * s, 2.4 * s, 5 * s, 1.2 * s, g);
      roundRect(ctx, sx - 5 * s, sy - 5.6 * s, 4 * s, 1.8 * s, 0.9 * s, g);
      roundRect(ctx, sx + 2.6 * s, sy - 11 * s, 2.4 * s, 5 * s, 1.2 * s, g);
      roundRect(ctx, sx + 1 * s, sy - 7.6 * s, 4 * s, 1.8 * s, 0.9 * s, g);
      break;
    }
    case "rock":
      polygon(ctx, [[sx - 5 * s, sy], [sx - 3.5 * s, sy - 4 * s], [sx, sy - 5.5 * s], [sx + 4 * s, sy - 3.5 * s], [sx + 5 * s, sy]], [128, 124, 120], [90, 86, 84], Math.max(1, s * 0.4));
      break;
    case "pine":
      ctx.fillStyle = css([90, 60, 36]);
      ctx.fillRect(sx - 1 * s, sy - 4 * s, 2 * s, 4 * s);
      for (const [y, w] of [[4, 6], [8.5, 4.6], [12.5, 3.2]]) {
        polygon(ctx, [[sx - w * s, sy - y * s], [sx + w * s, sy - y * s], [sx, sy - (y + 6) * s]], [30, 90, 60]);
        polygon(ctx, [[sx - w * 0.45 * s, sy - (y + 3.3) * s], [sx + w * 0.45 * s, sy - (y + 3.3) * s], [sx, sy - (y + 6) * s]], [240, 246, 252]);
      }
      break;
  }
}

function drawBanana(ctx: Ctx, sx: number, sy: number, s: number) {
  ctx.strokeStyle = css([250, 214, 40]);
  ctx.lineWidth = Math.max(1, 2.2 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(sx, sy - 4 * s, 3.2 * s, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawShell(ctx: Ctx, sx: number, sy: number, s: number) {
  fillEllipse(ctx, sx - 3 * s, sy - 1 * s, 6 * s, 2 * s, "rgba(0,0,0,0.3)");
  fillCircle(ctx, sx, sy - 3 * s, 3.2 * s, [40, 190, 70]);
  fillCircle(ctx, sx, sy - 3.4 * s, 1.8 * s, [235, 255, 235]);
}

export function drawItemIcon(ctx: Ctx, item: number, cx: number, cy: number, size: number, time = 0) {
  const s = size / 10;
  if (item === ITEM_TURBO) {
    polygon(ctx, [[cx - 4 * s, cy + 4 * s], [cx, cy - 5 * s], [cx + 4 * s, cy + 4 * s], [cx, cy + 1.5 * s]], [255, 140, 30], [255, 230, 120], 1);
  } else if (item === ITEM_BANANA) {
    drawBanana(ctx, cx, cy + 4 * s, s * 1.2);
  } else if (item === ITEM_SHELL) {
    fillCircle(ctx, cx, cy, 4.2 * s, [40, 190, 70]);
    fillCircle(ctx, cx, cy - 0.5 * s, 2.3 * s, [235, 255, 235]);
  }
  void time;
}
