// Render de Karts: la escena 3D está en stage.ts; aquí van la cámara, los rótulos de los rivales, el HUD
// (vuelta, tiempo, puesto, objeto, monedas, minimapa) y los resultados, dibujados en 2D encima.
import { C_DIM, C_GOLD, C_LINE, C_MUTE, C_TEXT } from "../core/theme";
import { PLAYER_COLORS, PLAYER_NAMES } from "../core/config";
import { badge, css, fillCircle, fitText, panel, polygon, shadowText, text, textWidth, titleText, type Ctx, hudStrip } from "../core/draw";
import { disposeScene, glRenderer, projectTo, renderInto } from "../core/three";
import {
  ITEM_BANANA, ITEM_BOLT, ITEM_BOMB, ITEM_RED, ITEM_SHELL, ITEM_STAR, ITEM_TURBO, KH, KW, LAPS, MAX_COINS, type ItemKind,
} from "./config";
import { wrapAngle } from "./physics";
import { Stage, at } from "./stage";
import type { Track } from "./track";

export interface KartSprite {
  index: number;
  x: number;
  y: number;
  a: number;
  spin: number;
  /** Altura del salto. */
  z: number;
  /** Efectos que se ven desde fuera: 1 estrella, 2 rayo, 4 turbo, 8 truco. */
  fx: number;
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
    offroad: boolean; v: number; hop: number; drift: number; driftTime: number; z: number; vz: number; trick: boolean;
    trickT: number; star: number; shrink: number; coins: number; taken: Uint8Array; seg: number; drop: number; fall: boolean;
  };
  others: KartSprite[];
  boxes: { x: number; y: number; active: boolean }[];
  bananas: { x: number; y: number }[];
  shells: { x: number; y: number; red: boolean }[];
  bombs: { x: number; y: number; t: number }[];
  blasts: { x: number; y: number; age: number }[];
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

export class KartsRenderer {
  time = 0;
  private stage: Stage | null = null;
  private camA = 0;
  private pitch = -0.27;
  private camReady = false;
  // Estado de los avisos del HUD.
  private prevItem = 0;
  private rouletteUntil = 0;
  private lastLap = 0;
  private lapBannerUntil = 0;
  private wrongT = 0;
  private lastDraw = 0;

  reset() {
    this.camReady = false;
    this.prevItem = 0;
    this.rouletteUntil = 0;
    this.lastLap = 0;
    this.lapBannerUntil = 0;
    this.wrongT = 0;
  }

  update(dt: number) {
    this.time += dt;
  }

  draw(ctx: Ctx, v: RaceView, pixelScale = 1) {
    const me = v.me;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, KW, KH);
    const gl = glRenderer();
    if (!gl) {
      text(ctx, "Este equipo no puede mostrar gráficos 3D (WebGL)", KW / 2, KH / 2 - 10, [255, 200, 160], SMALL, "center");
      this.drawHud(ctx, v);
      return;
    }
    if (!this.stage || this.stage.track !== v.track) {
      if (this.stage) disposeScene(this.stage.scene);
      this.stage = new Stage(v.track, gl.capabilities.getMaxAnisotropy());
      this.camReady = false;
    }
    // La cámara sigue la dirección de avance (no el morro): en un derrape el kart se ve cruzado.
    // Tampoco gira con los trompos.
    if (!this.camReady) {
      this.camA = me.ma;
      this.pitch = this.stage.lookPitch(v, me.ma);
      this.camReady = true;
    } else if (me.spin <= 0) {
      this.camA += wrapAngle(me.ma - this.camA) * 0.2;
    }
    this.pitch += (this.stage.lookPitch(v, this.camA) - this.pitch) * 0.15;
    this.stage.update(v, this.time, { a: this.camA, pitch: this.pitch });
    renderInto(ctx, this.stage.scene, this.stage.camera, KW, KH, pixelScale, 1.05);
    this.drawLabels(ctx, v, this.stage);
    this.drawHud(ctx, v);
  }

  /** Número de cada kart rival encima de él (también identifica en escala de grises). */
  private drawLabels(ctx: Ctx, v: RaceView, stage: Stage) {
    for (const k of v.others) {
      const p = projectTo(stage.camera, at(k.x, k.y, stage.groundAt(k.x, k.y) + 24), KW, KH);
      if (!p || p[2] > 30) continue;
      const r = Math.max(2.5, Math.min(5, 40 / p[2]));
      badge(ctx, p[0], p[1], r, PLAYER_COLORS[k.index], String(k.index + 1));
    }
  }

  // --- HUD ---
  private drawHud(ctx: Ctx, v: RaceView) {
    hudStrip(ctx, KW, 28);
    // Vuelta y tiempo
    const lap = `VUELTA ${Math.min(LAPS, Math.max(1, v.lap))}/${LAPS}`;
    panel(ctx, 3, 3, Math.max(textWidth(ctx, lap, SMALL), textWidth(ctx, "0:00.0", SMALL)) + 10, 22, C_LINE, 0.7);
    shadowText(ctx, lap, 7, 5, [255, 255, 255], SMALL);
    shadowText(ctx, formatTime(v.time), 7, 14, [255, 230, 120], SMALL);
    // Posición
    const pos = `${v.rank}º`;
    titleText(ctx, pos, KW - 24, 2, v.rank === 1 ? C_GOLD : [255, 255, 255], "20px", "right");
    shadowText(ctx, `/${v.aiSlots.length}`, KW - 5, 10, [255, 255, 255], SMALL, "right");
    // Objeto
    const bx = KW / 2 - 12;
    panel(ctx, bx, 3, 24, 22, C_GOLD, 0.85);
    // Ruleta de objetos: al recoger uno, los iconos giran un momento antes de quedarse el tuyo.
    if (v.item && !this.prevItem) this.rouletteUntil = this.time + 0.9;
    this.prevItem = v.item;
    const rolling = this.time < this.rouletteUntil;
    if (v.item || rolling) drawItemIcon(ctx, rolling ? ((Math.floor(this.time * 16) % 7) + 1) : v.item, KW / 2, 14, 16);
    // Monedas: cada una sube un poco la velocidad máxima.
    fillCircle(ctx, 8, 32, 3.2, [255, 206, 74]);
    fillCircle(ctx, 8, 32, 1.6, [255, 232, 140]);
    shadowText(ctx, `${v.me.coins}/${MAX_COINS}`, 14, 29, v.me.coins >= MAX_COINS ? C_GOLD : C_TEXT, SMALL);
    // Estado del momento.
    const me = v.me;
    const dt = Math.min(0.1, Math.max(0, this.time - this.lastDraw));
    this.lastDraw = this.time;
    this.drawBanners(ctx, v, dt);
    const blink = Math.floor(this.time * 6) % 2 === 0;
    const status = me.fall ? "¡AL VACÍO!" : me.drop > 0 ? "¡LAKITU!" : me.star > 0 ? "¡ESTRELLA!" : me.shrink > 0 ? "¡RAYO ENCIMA!" : me.trick ? "¡TRUCO!" : me.turbo > 0 ? "¡TURBO!" : "";
    if (status && (blink || me.star <= 0)) shadowText(ctx, status, KW / 2, 29, me.shrink > 0 ? [120, 220, 255] : C_GOLD, SMALL, "center");

    this.drawMinimap(ctx, v);

    if (v.netLabel) shadowText(ctx, v.netLabel, KW - 4, KH - 10, C_DIM, "7px", "right");
    if (v.footer && v.phase !== 2) shadowText(ctx, fitText(ctx, v.footer, KW - 6, "7px"), KW / 2, KH - 10, C_TEXT, "7px", "center");

    if (v.phase === 0) {
      titleText(ctx, String(Math.ceil(v.countdown)), KW / 2, 78, C_GOLD, "40px");
    } else if (v.phase === 1 && v.time < 0.8) {
      titleText(ctx, "¡YA!", KW / 2, 82, [120, 255, 120], "32px");
    }
    if (v.results) this.drawResults(ctx, v);
  }

  /** Título del circuito, aviso de vuelta y de contramano. */
  private drawBanners(ctx: Ctx, v: RaceView, dt: number) {
    const me = v.me;
    // Título del circuito durante la cuenta atrás y los primeros segundos.
    if (v.phase === 0 || v.time < 2.5) {
      titleText(ctx, v.track.theme.name.toUpperCase(), KW / 2, 36, C_GOLD, "14px");
      shadowText(ctx, "CIRCUITO", KW / 2, 56, C_DIM, SMALL, "center");
    }
    // Vuelta nueva.
    if (v.lap > this.lastLap) {
      if (this.lastLap > 0 && v.phase === 1) this.lapBannerUntil = this.time + 2.2;
      this.lastLap = v.lap;
    }
    if (this.time < this.lapBannerUntil && v.phase === 1) {
      const last = v.lap >= LAPS;
      titleText(ctx, last ? "¡ÚLTIMA VUELTA!" : `VUELTA ${v.lap}`, KW / 2, 44, last ? [255, 120, 100] : C_GOLD, "12px");
    }
    // Contramano: apuntando al revés de la pista un rato seguido.
    const wrong = v.phase === 1 && me.v > 25 && me.z >= 0 && me.spin <= 0
      && Math.abs(wrapAngle(me.a - v.track.dir[me.seg % v.track.n])) > 2.2;
    this.wrongT = wrong ? this.wrongT + dt : 0;
    if (this.wrongT > 0.7 && Math.floor(this.time * 4) % 2 === 0) titleText(ctx, "¡CONTRAMANO!", KW / 2, 100, [255, 80, 80], "12px");
  }

  /** Minimapa arriba a la derecha: trazado, meta y karts (el propio, más grande y con borde). */
  private drawMinimap(ctx: Ctx, v: RaceView) {
    const m = minimapOf(v.track);
    const x0 = KW - MINIMAP - 4;
    const y0 = 26;
    panel(ctx, x0 - 2, y0 - 2, MINIMAP + 4, MINIMAP + 4, C_MUTE, 0.5);
    ctx.save();
    ctx.translate(x0, y0);
    // Trazado con esquinas a inglete y marcas cuadradas, como un minimapa de 16 bits.
    ctx.lineJoin = "miter";
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2.5;
    ctx.stroke(m.path);
    ctx.strokeStyle = "rgb(110,110,125)";
    ctx.lineWidth = 1.2;
    ctx.stroke(m.path);
    const [fx, fy] = m.map(v.track.px[0], v.track.py[0]);
    ctx.fillStyle = "#fff";
    ctx.fillRect(fx - 1.5, fy - 1.5, 3, 3);
    for (const k of v.others) {
      const [kx, ky] = m.map(k.x, k.y);
      ctx.fillStyle = "#000";
      ctx.fillRect(kx - 2, ky - 2, 4, 4);
      ctx.fillStyle = css(PLAYER_COLORS[k.index]);
      ctx.fillRect(kx - 1.5, ky - 1.5, 3, 3);
    }
    const [mx, my] = m.map(v.me.x, v.me.y);
    const blink = Math.floor(this.time * 4) % 2 === 0;
    ctx.fillStyle = blink ? "#fff" : "#000";
    ctx.fillRect(mx - 3, my - 3, 6, 6);
    ctx.fillStyle = css(PLAYER_COLORS[v.me.index]);
    ctx.fillRect(mx - 2, my - 2, 4, 4);
    ctx.restore();
  }

  private drawResults(ctx: Ctx, v: RaceView) {
    panel(ctx, 24, 40, KW - 48, 30 + v.results!.length * 18, C_LINE, 0.85);
    titleText(ctx, "RESULTADOS", KW / 2, 46, C_GOLD, MID);
    v.results!.forEach((r, i) => {
      const y = 66 + i * 18;
      const color = PLAYER_COLORS[r.index];
      badge(ctx, 40, y + 4.5, 5, color, String(r.index + 1));
      text(ctx, `${r.place}º`, 50, y, [255, 255, 255], MID);
      text(ctx, racerName(r.index, r.ai) + (r.index === v.me.index ? " (tú)" : ""), 72, y, color, MID);
      text(ctx, r.time ? formatTime(r.time) : "--", KW - 32, y, [220, 220, 230], MID, "right");
    });
    const lit = Math.floor(this.time * 2) % 2 === 0; // parpadea como un "PULSA START"
    text(ctx, fitText(ctx, v.footer, KW - 56, "7px"), KW / 2, 52 + v.results!.length * 18 + 20, lit ? C_TEXT : C_MUTE, "7px", "center");
  }
}

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

/** Icono del objeto en el HUD. */
export function drawItemIcon(ctx: Ctx, item: number, cx: number, cy: number, size: number) {
  const s = size / 10;
  if (item === ITEM_TURBO) {
    polygon(ctx, [[cx - 4 * s, cy + 4 * s], [cx, cy - 5 * s], [cx + 4 * s, cy + 4 * s], [cx, cy + 1.5 * s]], [255, 140, 30], [255, 230, 120], 1);
  } else if (item === ITEM_BANANA) {
    ctx.fillStyle = "rgb(242,207,42)";
    ctx.fillRect(cx - 4 * s, cy, 8 * s, 2.4 * s);
    ctx.fillRect(cx - 5 * s, cy - 2.4 * s, 2.4 * s, 2.6 * s);
    ctx.fillRect(cx + 2.6 * s, cy - 2.4 * s, 2.4 * s, 2.6 * s);
  } else if (item === ITEM_SHELL || item === ITEM_RED) {
    ctx.fillStyle = item === ITEM_RED ? "rgb(230,40,58)" : "rgb(40,190,70)";
    ctx.fillRect(cx - 4 * s, cy - 2 * s, 8 * s, 5 * s);
    ctx.fillStyle = "rgb(235,255,235)";
    ctx.fillRect(cx - 2.5 * s, cy - 3.5 * s, 5 * s, 2 * s);
    if (item === ITEM_RED) {
      ctx.fillStyle = "rgb(255,240,200)";
      ctx.fillRect(cx - 1 * s, cy - 1 * s, 2 * s, 2 * s);
    }
  } else if (item === ITEM_STAR) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = (i % 2 ? 2.2 : 5) * s;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    polygon(ctx, pts, [255, 214, 60], [255, 250, 190], 1);
  } else if (item === ITEM_BOMB) {
    ctx.fillStyle = "rgb(200,50,42)";
    ctx.fillRect(cx - 4 * s, cy - 3 * s, 8 * s, 7 * s);
    ctx.fillStyle = "rgb(245,230,190)";
    ctx.fillRect(cx - 4 * s, cy - 0.8 * s, 8 * s, 2.6 * s);
    ctx.fillStyle = "rgb(255,160,40)";
    ctx.fillRect(cx - 0.5 * s, cy - 5.5 * s, 1.4 * s, 2.5 * s);
  } else if (item === ITEM_BOLT) {
    polygon(ctx, [[cx + 1 * s, cy - 5 * s], [cx - 3 * s, cy + 0.5 * s], [cx - 0.2 * s, cy + 0.5 * s], [cx - 1.5 * s, cy + 5 * s], [cx + 3.5 * s, cy - 1 * s], [cx + 0.6 * s, cy - 1 * s]], [120, 220, 255], [235, 250, 255], 1);
  }
}
