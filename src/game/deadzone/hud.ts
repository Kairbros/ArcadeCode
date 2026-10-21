// HUD de Dead Zone dibujado en el lienzo 2D encima de la escena 3D, con la fuente de píxeles del hub:
// salud, munición, puntos, ronda, equipo, carteles de compra, avisos, banner de ronda y pantallas de abatido / fin.
import { fitText, line, roundRect, shadowText, text, textWidth, type Ctx } from "../core/draw";
import type { RGB } from "../core/config";
import { POWERS, type PowerKind } from "./game/powerups";
import { perksIn } from "./game/perks";
import { MAPS, MAP_IDS } from "./world/maps";
import { VH, VW } from "./stage";

const TINY = "5px";
const SMALL = "6px";
const MID = "8px";
const BIG = "14px";

const C_TEXT: RGB = [236, 240, 244];
const C_DIM: RGB = [150, 160, 172];
const C_RED: RGB = [255, 90, 74];
const C_GREEN: RGB = [92, 226, 140];
const C_YELLOW: RGB = [255, 215, 94];
const C_PANEL: RGB = [14, 18, 26];
const C_LINE: RGB = [90, 104, 120];
const C_ORANGE: RGB = [255, 160, 60];
const C_UPG: RGB = [90, 220, 255];

export interface HudTeammate {
  name: string;
  color: RGB;
  health: number;
  alive: boolean;
  points: number;
  me: boolean;
}

export interface HudToast {
  text: string;
  kind: "info" | "good" | "bad";
  t: number;
}

export interface DzHudView {
  health: number;
  maxHealth: number;
  points: number;
  round: number;
  /** Zombis que quedan (por aparecer + vivos) y estado de la ronda (0 esperando, 1 descanso, 2 en curso). */
  remaining: number;
  roundState: number;
  /** Ronda de perros infernales. */
  special: boolean;
  weaponName: string;
  /** El arma de la mano está mejorada (y cuáles de las ranuras lo están). */
  upgraded: boolean;
  slotUpg: boolean[];
  /** Energía del sector activada. */
  power: boolean;
  slots: (string | null)[];
  activeSlot: number;
  mag: number;
  reserve: number;
  /** Progreso de la recarga (0..1) o -1 si no recarga. */
  reload: number;
  /** `rv`: progreso (0..1) de mantener E para revivir, si el cartel es de revivir. */
  prompt: { label: string; cost: number; hold: boolean; info?: boolean; rv?: number } | null;
  affordable: boolean;
  barricade: { planks: number; max: number } | null;
  toasts: HudToast[];
  banner: { num: number; sub: string; t: number } | null;
  /** Segundos desde el último impacto y el último daño recibido (para el marcador y el rojo de pantalla). */
  hitT: number;
  hitHead: boolean;
  damageT: number;
  ads: boolean;
  /** Segundos que quedan de muerte instantánea, puntos dobles, munición infinita, liquidación y (el mío) ametralladora. */
  fx: number[];
  /** Último poder cogido (se enseña grande un momento) y segundos desde el último Katabum. */
  powerMsg: { kind: PowerKind; t: number } | null;
  nukeT: number;
  /** Ventajas que lleva (máscara) y, si está abatido, segundos que le quedan, progreso de revivir y si se levanta solo. */
  /** Selector de mapa antes de empezar (solo el anfitrión elige). */
  menu: { index: number; host: boolean } | null;
  perks: number;
  down: { t: number; prog: number; self: boolean } | null;
  /** 0..1: mira telescópica cubriendo la pantalla. */
  scope: number;
  /** Sin una sola bala: toca el cuchillo. */
  noAmmo: boolean;
  team: HudTeammate[];
  alive: boolean;
  /** Fin de la partida con sus cifras, o null. */
  over: { round: number; points: number; kills: number } | null;
  netLabel: string;
  look: string;
  /** Anfitrión (puede reiniciar) o invitado. */
  isHost: boolean;
  ready: boolean;
  time: number;
}

export function drawHud(ctx: Ctx, v: DzHudView): void {
  if (!v.ready) {
    shadowText(ctx, "CONECTANDO…", VW / 2, VH / 2, C_TEXT, MID, "center");
    return;
  }
  if (v.menu) {
    drawMenu(ctx, v);
    return;
  }
  drawNuke(ctx, v);
  drawScope(ctx, v);
  if (v.alive && v.scope < 0.5) drawCrosshair(ctx, v);
  drawTop(ctx, v);
  drawTeam(ctx, v);
  drawBottom(ctx, v);
  drawPerks(ctx, v);
  drawPrompt(ctx, v);
  drawEffects(ctx, v);
  drawToasts(ctx, v);
  if (v.banner && v.banner.t > 0) drawBanner(ctx, v.banner);
  if (!v.alive && !v.over) drawDown(ctx, v);
  if (v.over) drawOver(ctx, v);
  if (v.look !== "locked" && v.alive && !v.over) {
    text(ctx, v.look === "drag" ? "MIRA ARRASTRANDO CON EL RATÓN" : "CLIC PARA CAPTURAR EL RATÓN", VW / 2, 52, C_YELLOW, TINY, "center");
  }
  text(ctx, "ESC MENÚ · E USAR · R RECARGAR · V CUCHILLO · F LINTERNA · M SONIDO", VW / 2, VH - 7, C_DIM, TINY, "center");
  if (v.netLabel) text(ctx, v.netLabel, VW - 4, 3, C_DIM, TINY, "right");
}

/** Mira telescópica: todo negro salvo un círculo, con retícula fina, marcas de distancia y borde. */
function drawScope(ctx: Ctx, v: DzHudView): void {
  if (v.scope <= 0.01) return;
  const cx = VW / 2;
  const cy = VH / 2;
  const r = VH * 0.47;
  ctx.save();
  ctx.globalAlpha = Math.min(1, v.scope);
  ctx.fillStyle = "rgb(0,0,0)";
  ctx.beginPath();
  ctx.rect(0, 0, VW, VH);
  ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
  const g = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy + 0.5);
  ctx.lineTo(cx + r, cy + 0.5);
  ctx.moveTo(cx + 0.5, cy - r);
  ctx.lineTo(cx + 0.5, cy + r);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.95)";
  for (let i = 1; i <= 4; i++) {
    ctx.fillRect(cx - 1 + 0.5, cy + i * 9, 3, 1);
    ctx.fillRect(cx - 1 + 0.5, cy - i * 9, 3, 1);
    ctx.fillRect(cx + i * 9, cy - 1 + 0.5, 1, 3);
    ctx.fillRect(cx - i * 9, cy - 1 + 0.5, 1, 3);
  }
  ctx.fillStyle = "rgba(255,70,50,0.9)";
  ctx.fillRect(cx - 0.5 + 0.5, cy - 0.5 + 0.5, 1, 1);
  ctx.restore();
}

/** Selector de mapa: cuatro tarjetas con el plano del mapa, su nombre y una descripción. */
function drawMenu(ctx: Ctx, v: DzHudView): void {
  const m = v.menu!;
  ctx.fillStyle = "rgba(4,6,10,0.88)";
  ctx.fillRect(0, 0, VW, VH);
  shadowText(ctx, "ELIGE EL MAPA", VW / 2, 8, C_ORANGE, BIG, "center");
  const n = MAP_IDS.length;
  const cw = Math.floor((VW - 16 - (n - 1) * 5) / n);
  const ch = 118;
  const y0 = 30;
  MAP_IDS.forEach((id, i) => {
    const def = MAPS[id];
    const x0 = 8 + i * (cw + 5);
    const sel = i === m.index;
    roundRect(ctx, x0, y0, cw, ch, 4, sel ? [26, 20, 14] : C_PANEL, sel ? C_ORANGE : C_LINE, sel ? 2 : 1);
    // Plano: muros en gris, puertas en amarillo, ventanas en rojo claro, inicio en verde y caja en azul.
    const b = def.bounds;
    const bw = b.maxX - b.minX;
    const bh = b.maxZ - b.minZ;
    const k = Math.min((cw - 10) / bw, 62 / bh);
    const ox = x0 + (cw - bw * k) / 2 - b.minX * k;
    const oy = y0 + 6 - b.minZ * k;
    ctx.strokeStyle = sel ? "rgb(214,200,176)" : "rgb(120,130,142)";
    ctx.lineWidth = 1;
    for (const w of def.walls) {
      ctx.beginPath();
      ctx.moveTo(ox + w.x1 * k, oy + w.z1 * k);
      ctx.lineTo(ox + w.x2 * k, oy + w.z2 * k);
      ctx.stroke();
      for (const h of w.holes ?? []) {
        if (h.kind === "open") continue;
        const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1) || 1;
        const ux = (w.x2 - w.x1) / len;
        const uz = (w.z2 - w.z1) / len;
        ctx.strokeStyle = h.kind === "door" ? "rgb(255,215,94)" : "rgb(255,120,100)";
        ctx.beginPath();
        ctx.moveTo(ox + (w.x1 + ux * h.from) * k, oy + (w.z1 + uz * h.from) * k);
        ctx.lineTo(ox + (w.x1 + ux * h.to) * k, oy + (w.z1 + uz * h.to) * k);
        ctx.stroke();
        ctx.strokeStyle = sel ? "rgb(214,200,176)" : "rgb(120,130,142)";
      }
    }
    ctx.fillStyle = "rgb(92,226,140)";
    ctx.fillRect(ox + def.playerSpawn.x * k - 1.5, oy + def.playerSpawn.z * k - 1.5, 3, 3);
    ctx.fillStyle = "rgb(90,200,255)";
    ctx.fillRect(ox + def.boxSpots[0].x * k - 1.5, oy + def.boxSpots[0].z * k - 1.5, 3, 3);
    text(ctx, fitText(ctx, def.name, cw - 8, SMALL), x0 + cw / 2, y0 + 72, sel ? C_ORANGE : C_TEXT, SMALL, "center");
    text(ctx, fitText(ctx, def.tagline, cw - 8, TINY), x0 + cw / 2, y0 + 82, C_DIM, TINY, "center");
    const words = def.desc.split(" ");
    let line = "";
    let ly = y0 + 93;
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (textWidth(ctx, t, TINY) > cw - 8 && line) {
        text(ctx, line, x0 + cw / 2, ly, C_DIM, TINY, "center");
        line = w;
        ly += 7;
      } else line = t;
    }
    if (line && ly < y0 + ch - 4) text(ctx, line, x0 + cw / 2, ly, C_DIM, TINY, "center");
    text(ctx, `${i + 1}`, x0 + 4, y0 + 3, sel ? C_ORANGE : C_DIM, TINY);
  });
  text(ctx, m.host ? "← → O 1-4 PARA ELEGIR · ENTER PARA EMPEZAR" : "EL ANFITRIÓN ESTÁ ELIGIENDO EL MAPA…", VW / 2, 160, m.host ? C_YELLOW : C_DIM, SMALL, "center");
  text(ctx, "VERDE: INICIO · AZUL: CAJA · AMARILLO: PUERTAS · ROJO: VENTANAS", VW / 2, 172, C_DIM, TINY, "center");
}

function drawCrosshair(ctx: Ctx, v: DzHudView): void {
  const cx = VW / 2;
  const cy = VH / 2;
  // Apuntando, la mira del arma es la referencia: solo queda un punto fino en el centro.
  if (v.ads) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(cx, cy, 1, 1);
    return;
  }
  const gap = v.ads ? 1 : 3;
  const len = v.ads ? 2 : 4;
  ctx.fillStyle = "rgba(236,240,244,0.85)";
  ctx.fillRect(cx - gap - len, cy, len, 1);
  ctx.fillRect(cx + gap + 1, cy, len, 1);
  ctx.fillRect(cx, cy - gap - len, 1, len);
  ctx.fillRect(cx, cy + gap + 1, 1, len);
  if (v.hitT < 0.18) {
    const c = v.hitHead ? "255,90,74" : "255,255,255";
    ctx.strokeStyle = `rgba(${c},${1 - v.hitT / 0.18})`;
    ctx.lineWidth = 1;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * 3, cy + dy * 3);
      ctx.lineTo(cx + dx * 7, cy + dy * 7);
      ctx.stroke();
    }
  }
}

/** Marcas de recuento de la ronda, como rayas de tiza (grupos de cinco tachados). */
function drawTally(ctx: Ctx, round: number, x: number, y: number): void {
  ctx.strokeStyle = "rgba(214,60,50,0.9)";
  ctx.lineWidth = 1;
  const groups = Math.min(4, Math.floor(round / 5));
  const rest = round % 5;
  let cx = x;
  const stick = (px: number) => {
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + 8);
    ctx.stroke();
  };
  for (let g = 0; g < groups; g++) {
    for (let i = 0; i < 4; i++) stick(cx + i * 2);
    ctx.beginPath();
    ctx.moveTo(cx - 2, y + 7);
    ctx.lineTo(cx + 9, y + 1);
    ctx.stroke();
    cx += 14;
  }
  for (let i = 0; i < rest; i++) stick(cx + i * 2);
}

function drawTop(ctx: Ctx, v: DzHudView): void {
  shadowText(ctx, `RONDA ${v.round}`, 5, 4, C_ORANGE, MID);
  if (v.round <= 24) drawTally(ctx, v.round, 66, 5);
  const zl = v.roundState === 1 ? "DESCANSO" : v.special ? `PERROS ${v.remaining}` : `ZOMBIS ${v.remaining}`;
  shadowText(ctx, zl, 5, 14, v.roundState === 1 ? C_GREEN : v.special ? C_RED : C_TEXT, SMALL);
  shadowText(ctx, `${v.points}`, VW - 5, 4, C_YELLOW, MID, "right");
  text(ctx, "PUNTOS", VW - 5, 14, C_DIM, TINY, "right");
  text(ctx, v.power ? "ENERGÍA ACTIVA" : "SIN ENERGÍA", VW - 5, 22, v.power ? C_GREEN : C_DIM, TINY, "right");
}

/** Equipo: nombre, vida y puntos de cada jugador (solo si hay más de uno). */
function drawTeam(ctx: Ctx, v: DzHudView): void {
  if (v.team.length < 2) return;
  let y = 28;
  for (const t of v.team) {
    ctx.fillStyle = `rgb(${t.color[0]},${t.color[1]},${t.color[2]})`;
    ctx.fillRect(5, y + 1, 3, 6);
    text(ctx, fitText(ctx, t.name + (t.me ? " (TÚ)" : ""), 58, TINY), 11, y, t.me ? C_TEXT : C_DIM, TINY);
    const k = Math.max(0, Math.min(1, t.health / 100));
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(72, y + 1, 26, 4);
    ctx.fillStyle = t.alive ? (k > 0.5 ? "rgb(92,226,140)" : k > 0.25 ? "rgb(255,215,94)" : "rgb(255,90,74)") : "rgb(90,40,40)";
    ctx.fillRect(72, y + 1, Math.round(26 * (t.alive ? k : 1)), 4);
    text(ctx, t.alive ? `${t.points}` : "ABATIDO", 102, y, t.alive ? C_YELLOW : C_RED, TINY);
    y += 8;
  }
}

function drawBottom(ctx: Ctx, v: DzHudView): void {
  // Salud, abajo a la izquierda.
  const x = 6;
  const y = VH - 28;
  const k = Math.max(0, Math.min(1, v.health / v.maxHealth));
  roundRect(ctx, x - 2, y - 3, 96, 20, 3, C_PANEL, C_LINE, 1);
  text(ctx, "SALUD", x + 2, y, C_DIM, TINY);
  text(ctx, `${Math.max(0, Math.round(v.health))}`, x + 90, y, C_TEXT, SMALL, "right");
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x + 2, y + 8, 86, 5);
  ctx.fillStyle = k > 0.6 ? "rgb(92,226,140)" : k > 0.3 ? "rgb(255,215,94)" : "rgb(255,90,74)";
  ctx.fillRect(x + 2, y + 8, Math.round(86 * k), 5);
  // Arma y munición, abajo a la derecha.
  const w = 112;
  const ax = VW - w - 5;
  roundRect(ctx, ax, y - 11, w, 28, 3, C_PANEL, C_LINE, 1);
  text(ctx, fitText(ctx, v.weaponName, w - 8, TINY), ax + 4, y - 8, v.upgraded ? C_UPG : C_DIM, TINY);
  const low = v.mag <= 3;
  if (v.fx[2] > 0) {
    shadowText(ctx, "INF", ax + 4, y + 1, C_UPG, BIG);
    text(ctx, "/ INF", ax + 4 + textWidth(ctx, "INF", BIG) + 4, y + 6, C_UPG, SMALL);
  } else {
    shadowText(ctx, `${v.mag}`, ax + 4, y + 1, v.reload >= 0 ? C_YELLOW : low ? C_RED : C_TEXT, BIG);
    text(ctx, `/ ${v.reserve}`, ax + 4 + textWidth(ctx, `${v.mag}`, BIG) + 4, y + 6, C_DIM, SMALL);
  }
  if (v.reload >= 0) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(ax + 4, y + 14, w - 8, 2);
    ctx.fillStyle = "rgb(255,215,94)";
    ctx.fillRect(ax + 4, y + 14, Math.round((w - 8) * v.reload), 2);
  }
  // Ranuras de armas.
  let sx = ax + w - 4;
  for (let i = v.slots.length - 1; i >= 0; i--) {
    const s = v.slots[i];
    if (!s) continue;
    const label = `${i + 1}·${s}${v.slotUpg[i] ? "★" : ""}`;
    const tw = textWidth(ctx, label, TINY);
    text(ctx, label, sx, y + 2, i === v.activeSlot ? (v.slotUpg[i] ? C_UPG : C_ORANGE) : v.slotUpg[i] ? [120, 190, 230] : C_DIM, TINY, "right");
    sx -= tw + 5;
  }
}

/** Destello blanco-naranja del Katabum que se apaga en un segundo. */
function drawNuke(ctx: Ctx, v: DzHudView): void {
  if (v.nukeT > 1.3) return;
  const a = Math.max(0, 1 - v.nukeT / 1.3);
  ctx.fillStyle = `rgba(255,${Math.round(200 + 55 * (1 - a))},${Math.round(120 + 135 * (1 - a))},${(a * a * 0.92).toFixed(3)})`;
  ctx.fillRect(0, 0, VW, VH);
}

/** Poder recién cogido, temporizadores de los activos, marco rojo de muerte instantánea y aviso del cuchillo. */
function drawEffects(ctx: Ctx, v: DzHudView): void {
  if (!v.alive) return;
  const kinds: PowerKind[] = ["instaKill", "doublePoints", "infiniteAmmo", "fireSale", "deathMachine"];
  if (v.fx[0] > 0) {
    ctx.strokeStyle = `rgba(255,74,74,${0.35 + Math.sin(v.time * 6) * 0.12})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, VW - 3, VH - 3);
  }
  if (v.powerMsg && v.powerMsg.t > 0) {
    const def = POWERS[v.powerMsg.kind];
    const c: RGB = [(def.color >> 16) & 255, (def.color >> 8) & 255, def.color & 255];
    ctx.globalAlpha = Math.min(1, v.powerMsg.t * 2);
    shadowText(ctx, def.name, VW / 2, 36, c, MID, "center");
    ctx.globalAlpha = 1;
  }
  let y = VH - 62;
  kinds.forEach((k, i) => {
    const left = v.fx[i] ?? 0;
    if (left <= 0) return;
    const def = POWERS[k];
    const c: RGB = [(def.color >> 16) & 255, (def.color >> 8) & 255, def.color & 255];
    const blink = left < 5 && Math.floor(v.time * 5) % 2 === 0;
    if (!blink) text(ctx, `${def.name} ${Math.ceil(left)}`, VW / 2, y, c, SMALL, "center");
    y -= 9;
  });
  if (v.noAmmo && Math.floor(v.time * 2.5) % 2 === 0) {
    shadowText(ctx, "SIN BALAS · V O CLIC: CUCHILLO", VW / 2, VH - 47, C_RED, SMALL, "center");
  }
}

/** Iconos de las ventajas encima de la barra de vida. */
function drawPerks(ctx: Ctx, v: DzHudView): void {
  const list = perksIn(v.perks);
  let x = 6;
  const y = VH - 44;
  for (const p of list) {
    const c: RGB = [(p.color >> 16) & 255, (p.color >> 8) & 255, p.color & 255];
    roundRect(ctx, x, y, 14, 14, 3, C_PANEL, c, 1);
    text(ctx, p.icon, x + 7, y + 4, c, SMALL, "center");
    x += 17;
  }
}

function drawPrompt(ctx: Ctx, v: DzHudView): void {
  if (!v.alive || !v.prompt) return;
  const p = v.prompt;
  const label = p.info ? p.label : p.hold ? `${p.label} · MANTÉN E` : `E · ${p.label}${p.cost > 0 ? ` · ${p.cost}` : ""}`;
  const w = Math.min(VW - 20, textWidth(ctx, label, SMALL) + 14);
  const poor = !v.affordable && !p.info;
  roundRect(ctx, VW / 2 - w / 2, 150, w, 13, 3, poor ? [70, 22, 22] : C_PANEL, poor ? C_RED : p.info ? C_LINE : C_ORANGE, 1);
  text(ctx, fitText(ctx, label, w - 8, SMALL), VW / 2, 153, poor ? C_RED : p.info ? C_DIM : C_TEXT, SMALL, "center");
  if (v.barricade) {
    text(ctx, `BARRICADA ${v.barricade.planks}/${v.barricade.max}`, VW / 2, 165, C_DIM, TINY, "center");
  }
  if (p.rv !== undefined) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(VW / 2 - 30, 165, 60, 4);
    ctx.fillStyle = "rgb(92,226,140)";
    ctx.fillRect(VW / 2 - 30, 165, Math.round(60 * Math.max(0, Math.min(1, p.rv))), 4);
  }
}

function drawToasts(ctx: Ctx, v: DzHudView): void {
  let y = 66;
  for (const t of v.toasts.slice(-4)) {
    const a = Math.min(1, t.t * 2.5);
    const c = t.kind === "good" ? C_GREEN : t.kind === "bad" ? C_RED : C_TEXT;
    ctx.globalAlpha = a;
    shadowText(ctx, fitText(ctx, t.text, VW - 20, SMALL), VW / 2, y, c, SMALL, "center");
    ctx.globalAlpha = 1;
    y += 9;
  }
}

function drawBanner(ctx: Ctx, b: { num: number; sub: string; t: number }): void {
  const a = Math.min(1, b.t * 1.5);
  ctx.globalAlpha = a;
  shadowText(ctx, `RONDA ${b.num}`, VW / 2, 74, C_RED, "16px", "center");
  shadowText(ctx, b.sub, VW / 2, 94, C_TEXT, SMALL, "center");
  ctx.globalAlpha = 1;
}

function drawDown(ctx: Ctx, v: DzHudView): void {
  ctx.fillStyle = "rgba(40,0,0,0.35)";
  ctx.fillRect(0, 0, VW, VH);
  shadowText(ctx, "ABATIDO", VW / 2, 82, C_RED, "16px", "center");
  const d = v.down;
  if (d) {
    const line1 = d.self ? `QUICK REVIVE: TE LEVANTAS EN ${Math.ceil(d.t)} S` : `TE DESANGRAS EN ${Math.ceil(d.t)} S`;
    text(ctx, line1, VW / 2, 104, d.self ? C_UPG : C_YELLOW, SMALL, "center");
    if (!d.self) text(ctx, "UN COMPAÑERO PUEDE REVIVIRTE (MANTENIENDO E)", VW / 2, 114, C_DIM, TINY, "center");
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(VW / 2 - 40, 124, 80, 5);
    ctx.fillStyle = d.prog > 0.01 ? "rgb(92,226,140)" : "rgb(255,90,74)";
    const k = d.prog > 0.01 ? d.prog : Math.max(0, Math.min(1, d.t / 30));
    ctx.fillRect(VW / 2 - 40, 124, Math.round(80 * k), 5);
    if (d.prog > 0.01 && !d.self) text(ctx, "TE ESTÁN REVIVIENDO…", VW / 2, 133, C_GREEN, TINY, "center");
  } else {
    text(ctx, "TUS COMPAÑEROS SIGUEN VIVOS", VW / 2, 114, C_TEXT, SMALL, "center");
    text(ctx, "REAPARECES AL EMPEZAR LA SIGUIENTE RONDA", VW / 2, 124, C_DIM, TINY, "center");
  }
}

function drawOver(ctx: Ctx, v: DzHudView): void {
  const o = v.over!;
  ctx.fillStyle = "rgba(10,0,0,0.62)";
  ctx.fillRect(0, 0, VW, VH);
  roundRect(ctx, VW / 2 - 100, 70, 200, 88, 6, C_PANEL, C_RED, 2);
  shadowText(ctx, "FIN DE LA PARTIDA", VW / 2, 80, C_RED, MID, "center");
  text(ctx, `RONDA ${o.round}`, VW / 2, 98, C_ORANGE, MID, "center");
  text(ctx, `${o.kills} BAJAS · ${o.points} PUNTOS`, VW / 2, 112, C_TEXT, SMALL, "center");
  line(ctx, VW / 2 - 80, 126, VW / 2 + 80, 126, C_LINE, 1);
  text(ctx, v.isHost ? "R: NUEVA PARTIDA · N: OTRO MAPA · J: CAMBIAR DE JUEGO" : "ESPERA AL ANFITRIÓN · ESC: MENÚ", VW / 2, 134, C_DIM, TINY, "center");
}
