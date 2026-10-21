// HUD de Dead Zone dibujado en el lienzo 2D encima de la escena 3D, con la fuente de píxeles del hub:
// salud, munición, puntos, ronda, equipo, carteles de compra, avisos, banner de ronda y pantallas de abatido / fin.
import { fitText, line, roundRect, shadowText, text, textWidth, type Ctx } from "../core/draw";
import type { RGB } from "../core/config";
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
  prompt: { label: string; cost: number; hold: boolean; info?: boolean } | null;
  affordable: boolean;
  barricade: { planks: number; max: number } | null;
  toasts: HudToast[];
  banner: { num: number; sub: string; t: number } | null;
  /** Segundos desde el último impacto y el último daño recibido (para el marcador y el rojo de pantalla). */
  hitT: number;
  hitHead: boolean;
  damageT: number;
  ads: boolean;
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
  if (v.alive) drawCrosshair(ctx, v);
  drawTop(ctx, v);
  drawTeam(ctx, v);
  drawBottom(ctx, v);
  drawPrompt(ctx, v);
  drawToasts(ctx, v);
  if (v.banner && v.banner.t > 0) drawBanner(ctx, v.banner);
  if (!v.alive && !v.over) drawDown(ctx, v);
  if (v.over) drawOver(ctx, v);
  if (v.look !== "locked" && v.alive && !v.over) {
    text(ctx, v.look === "drag" ? "MIRA ARRASTRANDO CON EL RATÓN" : "CLIC PARA CAPTURAR EL RATÓN", VW / 2, 52, C_YELLOW, TINY, "center");
  }
  text(ctx, "ESC MENÚ · E USAR · R RECARGAR · F LINTERNA · M SONIDO", VW / 2, VH - 7, C_DIM, TINY, "center");
  if (v.netLabel) text(ctx, v.netLabel, VW - 4, 3, C_DIM, TINY, "right");
}

function drawCrosshair(ctx: Ctx, v: DzHudView): void {
  const cx = VW / 2;
  const cy = VH / 2;
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
  const zl = v.roundState === 1 ? "DESCANSO" : `ZOMBIS ${v.remaining}`;
  shadowText(ctx, zl, 5, 14, v.roundState === 1 ? C_GREEN : C_TEXT, SMALL);
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
  shadowText(ctx, `${v.mag}`, ax + 4, y + 1, v.reload >= 0 ? C_YELLOW : low ? C_RED : C_TEXT, BIG);
  text(ctx, `/ ${v.reserve}`, ax + 4 + textWidth(ctx, `${v.mag}`, BIG) + 4, y + 6, C_DIM, SMALL);
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
  shadowText(ctx, "ABATIDO", VW / 2, 92, C_RED, "16px", "center");
  text(ctx, "TUS COMPAÑEROS SIGUEN VIVOS", VW / 2, 114, C_TEXT, SMALL, "center");
  text(ctx, "REAPARECES AL EMPEZAR LA SIGUIENTE RONDA", VW / 2, 124, C_DIM, TINY, "center");
  void v;
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
  text(ctx, v.isHost ? "R: NUEVA PARTIDA · J: CAMBIAR DE JUEGO" : "ESPERA AL ANFITRIÓN · ESC: MENÚ", VW / 2, 134, C_DIM, TINY, "center");
}
