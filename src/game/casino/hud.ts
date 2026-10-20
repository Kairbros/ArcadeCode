// HUD del casino (2D encima del 3D): barra de objetos (monedas, mano y bate), fichas, aviso de sentarse,
// franja de apuestas, asientos de la mesa, cartel del resultado y avisos de robos. Todo con la fuente de
// píxeles del hub.
import { PLAYER_COLORS, PLAYER_NAMES } from "../core/config";
import { fillCircle, fitText, line, polygon, roundRect, shadowText, text, textWidth, type Ctx } from "../core/draw";
import {
  BET_TIME, C_ACCENT, C_BG, C_DIM, C_GOLD, C_GREEN, C_LINE, C_LOSE, C_PANEL, C_TEXT, C_WIN, CH, CW, PAY_TIME, ROB_ZONE,
  SLOT_BAT, SLOT_HAND, SLOT_NAMES,
} from "./config";
import { GAME_TITLE, SPOTS, type CasinoSnap, type TableSnap } from "./table";
import { TABLES } from "./world3d";

const TINY = "5px";
const SMALL = "6px";
const MID = "8px";

/** Barra de objetos: 3 ranuras de 24 px en el centro de abajo. */
const BAR_Y = 196;
const BAR_SIZE = 24;
const BAR_GAP = 4;
const STRIP_Y = 172;
const SEAT_Y = 126;
/** Línea de teclas y de ESC, debajo de la barra. */
const FOOT_Y = 228;

export interface HudView {
  s: CasinoSnap;
  me: number;
  /** Mesa en la que estoy sentado (-1 = andando). */
  myTable: number;
  /** Mesa a la que estoy apuntando (para sentarme). */
  near: number;
  /** Casilla elegida por mí (si estoy sentado). */
  selSpot: number;
  netLabel: string;
  /** Ya hay algo que dibujar (el invitado espera al primer estado). */
  ready: boolean;
  time: number;
  /** Ranura elegida de la barra (0 monedas, 1 mano, 2 bate). */
  slot: number;
  /** Aviso del momento («+2 MONEDAS», «¡TE HAN GOLPEADO!»). */
  notice: string;
  /** Segundos que le quedan al aviso (0 = oculto). */
  noticeT: number;
  /** Segundos aturdido (0 = normal). */
  stun: number;
  /** Recarga del bate en segundos (0 = listo). */
  batCd: number;
  /** Minijuego del robo: [marca 0..1, centro de la zona buena 0..1] o null. */
  rob: [number, number] | null;
  /** Segundos de condena en la cárcel (0 = libre). */
  jail: number;
  /** Basura que llevo en la mano (índice) o -1. */
  trash: number;
  /** Cómo se mira con el ratón: "locked", "drag" o "click". */
  look: string;
}

/** Fichas del jugador. */
export function chipsOf(s: CasinoSnap, i: number): number {
  return s.ch[i] ?? 0;
}

export function drawHud(ctx: Ctx, v: HudView) {
  const s = v.s;
  const table = v.myTable >= 0 ? s.tb[v.myTable] : null;

  // --- Arriba: mesa y ronda (las fichas van en la ranura de monedas) ---
  ctx.fillStyle = "rgba(8,9,14,0.72)";
  ctx.fillRect(0, 0, CW, 15);
  if (table && v.myTable >= 0) {
    const def = TABLES[v.myTable];
    shadowText(ctx, `${GAME_TITLE[def.kind]} · RONDA ${table.rd}`, 8, 4, C_TEXT, SMALL);
  } else {
    shadowText(ctx, "CASINO ENTRE AMIGOS", 8, 4, C_DIM, SMALL);
  }
  if (v.netLabel) text(ctx, v.netLabel, CW - 6, 5, C_DIM, TINY, "right");

  if (!v.ready) {
    shadowText(ctx, "CONECTANDO…", CW / 2, CH / 2, C_TEXT, MID, "center");
    return;
  }

  if (table && v.myTable >= 0) drawTableUi(ctx, v, table);
  else drawWalkUi(ctx, v);
  drawBar(ctx, v, s);
  drawNotice(ctx, v);
  if (v.rob) drawRob(ctx, v.rob);
  if (v.jail > 0) drawJail(ctx, v);
  else if (!v.rob) drawCrosshair(ctx, v);

  // Aturdido: pantalla teñida de rojo (te están pegando) y aviso.
  if (v.stun > 0.02) {
    ctx.fillStyle = "rgba(255,40,60,0.14)";
    ctx.fillRect(0, 0, CW, CH);
    shadowText(ctx, "¡ATURDIDO!", CW / 2, 42, C_LOSE, MID, "center");
  }

  // --- Teclas ---
  text(ctx, "ESC: MENÚ", 6, FOOT_Y, C_DIM, TINY);
  text(ctx, "R: REINICIAR", CW - 6, FOOT_Y, C_DIM, TINY, "right");
}

/** La barra de objetos: monedas (con las fichas), mano y bate. */
function drawBar(ctx: Ctx, v: HudView, s: CasinoSnap) {
  const total = BAR_SIZE * 3 + BAR_GAP * 2;
  const x0 = CW / 2 - total / 2;
  const seated = v.myTable >= 0;
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (BAR_SIZE + BAR_GAP);
    const on = v.slot === i && !seated;
    roundRect(ctx, x, BAR_Y, BAR_SIZE, BAR_SIZE, 3, on ? C_ACCENT : C_PANEL, on ? C_ACCENT : C_LINE, 1);
    const cx = x + BAR_SIZE / 2;
    const cy = BAR_Y + 10;
    const ink = on ? C_BG : seated ? C_DIM : C_TEXT;
    if (i === 0) {
      // Ficha/moneda: aro dorado con el centro hundido y la cuenta debajo.
      fillCircle(ctx, cx, cy + 1, 7, on ? C_BG : C_GOLD);
      fillCircle(ctx, cx, cy + 1, 4.5, on ? C_GOLD : C_BG);
      fillCircle(ctx, cx, cy + 1, 1.5, on ? C_BG : C_GOLD);
      text(ctx, `${chipsOf(s, v.me)}`, cx, BAR_Y + 16, on ? C_BG : C_GOLD, TINY, "center");
    } else if (i === SLOT_HAND) {
      // Mano abierta: palma y cuatro dedos.
      polygon(ctx, [[cx - 5, cy + 4], [cx - 5, cy], [cx + 5, cy], [cx + 5, cy + 4], [cx, cy + 7]], ink);
      ctx.fillStyle = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
      for (let k = 0; k < 4; k++) ctx.fillRect(cx - 4.5 + k * 3, cy - 6, 2, 6);
      text(ctx, "MANO", cx, BAR_Y + 16, on ? C_BG : C_DIM, TINY, "center");
    } else if (i === SLOT_BAT) {
      // Bate en diagonal con el puño.
      polygon(ctx, [[cx - 6, cy + 4], [cx - 3, cy + 7], [cx + 7, cy - 5], [cx + 4, cy - 8]], ink);
      line(ctx, cx - 6, cy + 5, cx - 8, cy + 8, ink, 2);
      const cd = v.batCd;
      text(ctx, cd > 0.05 ? cd.toFixed(1) : "BATE", cx, BAR_Y + 16, on ? C_BG : cd > 0.05 ? C_LOSE : C_DIM, TINY, "center");
    }
    // Número de tecla, en la esquina.
    text(ctx, `${i + 1}`, x + 2, BAR_Y + 1, on ? C_BG : C_DIM, TINY);
  }
  // Qué se hace con lo que llevas en la mano (encima de la barra).
  const label = v.jail > 0
    ? "EN LA CÁRCEL · A LA PALANCA CON LA BASURA"
    : seated
      ? "A SALVO EN LA MESA"
      : `${SLOT_NAMES[v.slot]} · ${v.slot === SLOT_HAND ? "ESPACIO: ROBAR" : v.slot === SLOT_BAT ? "ESPACIO: PEGAR" : "ESPACIO: TIRAR MONEDA"}`;
  text(ctx, fitText(ctx, label, CW - 24, TINY), CW / 2, BAR_Y - 8, seated ? C_DIM : C_ACCENT, TINY, "center");
}

/** Aviso del momento, arriba en el centro. */
function drawNotice(ctx: Ctx, v: HudView) {
  if (v.noticeT <= 0 || !v.notice) return;
  const bad = v.notice.startsWith("¡");
  const w = Math.min(CW - 30, textWidth(ctx, v.notice, SMALL) + 16);
  ctx.globalAlpha = Math.min(1, v.noticeT * 2.5);
  roundRect(ctx, CW / 2 - w / 2, 18, w, 13, 3, bad ? C_LOSE : C_ACCENT, bad ? C_LOSE : C_ACCENT, 1);
  text(ctx, fitText(ctx, v.notice, w - 8, SMALL), CW / 2, 22, C_BG, SMALL, "center");
  ctx.globalAlpha = 1;
}

/** Andando por la sala: aviso de mesa cercana, ratón y controles. */
function drawWalkUi(ctx: Ctx, v: HudView) {
  const hint = v.near >= 0
    ? `E · SENTARSE EN ${GAME_TITLE[TABLES[v.near].kind]}`
    : "WASD ANDAR · RATÓN MIRAR · 1/2/3 MANOS · ESPACIO USAR";
  const w = Math.min(CW - 20, textWidth(ctx, hint, SMALL) + 18);
  roundRect(ctx, CW / 2 - w / 2, 150, w, 14, 4, v.near >= 0 ? C_ACCENT : C_PANEL, v.near >= 0 ? C_ACCENT : C_LINE, 1);
  text(ctx, fitText(ctx, hint, w - 10, SMALL), CW / 2, 154, v.near >= 0 ? C_BG : C_TEXT, SMALL, "center");
  // La primera vez, cómo se mira según lo que permita la vista.
  if (v.look !== "locked") text(ctx, v.look === "drag" ? "MIRA ARRASTRANDO CON EL RATÓN" : "CLIC PARA MIRAR CON EL RATÓN", CW / 2, 142, C_DIM, TINY, "center");
}

/** Punto de mira (primera persona). */
function drawCrosshair(ctx: Ctx, v: HudView) {
  if (v.myTable >= 0) return;
  const cx = CW / 2;
  const cy = CH / 2;
  const c = v.slot === SLOT_BAT ? C_GOLD : v.slot === SLOT_HAND ? C_ACCENT : C_DIM;
  ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  ctx.fillRect(cx - 3, cy, 7, 1);
  ctx.fillRect(cx, cy - 3, 1, 7);
}

/** Minijuego del robo: para la marca en la zona buena. */
function drawRob(ctx: Ctx, r: [number, number]) {
  const [cursor, zone] = r;
  const w = 190, h = 15;
  const x = CW / 2 - w / 2, y = 104;
  roundRect(ctx, x - 6, y - 18, w + 12, h + 32, 4, C_PANEL, C_ACCENT, 1);
  text(ctx, "¡ROBA! PARA LA MARCA EN LA ZONA", x + w / 2, y - 14, C_ACCENT, SMALL, "center");
  roundRect(ctx, x, y, w, h, 3, C_BG, C_LINE, 1);
  // Zona buena.
  const z0 = x + (zone - ROB_ZONE / 2) * w;
  roundRect(ctx, z0, y + 1, ROB_ZONE * w, h - 2, 2, C_GREEN, C_GREEN, 1);
  // Marca.
  ctx.fillStyle = `rgb(${C_TEXT[0]},${C_TEXT[1]},${C_TEXT[2]})`;
  ctx.fillRect(x + cursor * w - 1, y - 2, 3, h + 4);
  text(ctx, "ESPACIO O CLIC PARA PARAR · SI FALLAS, A LA CÁRCEL", x + w / 2, y + h + 5, C_DIM, TINY, "center");
}

/** En la cárcel del techo: condena, basura y la palanca. */
function drawJail(ctx: Ctx, v: HudView) {
  const label = `CÁRCEL · ${Math.ceil(v.jail)} SEG`;
  const w = Math.min(CW - 40, textWidth(ctx, label, MID) + 18);
  roundRect(ctx, CW / 2 - w / 2, 18, w, 14, 3, C_LOSE, C_LOSE, 1);
  text(ctx, label, CW / 2, 22, C_BG, MID, "center");
  const hint = v.trash >= 0
    ? "TIENES BASURA · APUNTA A LA PALANCA Y PULSA ESPACIO"
    : "ESPACIO: COGER BASURA · TÍRALA A LA PALANCA PARA SALIR ANTES";
  text(ctx, fitText(ctx, hint, CW - 16, TINY), CW / 2, 36, C_TEXT, TINY, "center");
}

/** Sentado en una mesa: asientos, franja de apuestas y estado de la ronda. */
function drawTableUi(ctx: Ctx, v: HudView, t: TableSnap) {
  const seats = t.pr;
  // --- Asientos ocupados (con su apuesta y el resultado de la ronda) ---
  let row = 0;
  for (let i = 0; i < seats.length; i++) {
    if (seats[i] !== 1) continue;
    const y = SEAT_Y + row * 10;
    const me = i === v.me;
    if (me) {
      // Marca del asiento propio: una barra a la izquierda, no una franja que cruce el texto.
      ctx.fillStyle = "rgba(53,224,200,0.85)";
      ctx.fillRect(3, y + 1, 2, 7);
    }
    const color = PLAYER_COLORS[i] ?? PLAYER_COLORS[0];
    ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    ctx.fillRect(7, y + 1, 3, 6);
    text(ctx, fitText(ctx, PLAYER_NAMES[i] + (me ? " (TÚ)" : ""), 66, SMALL), 13, y, me ? C_TEXT : C_DIM, SMALL);
    const bet = t.b[i] ?? [0, 1, 0];
    const spot = SPOTS[TABLES[v.myTable].kind][bet[0]];
    text(ctx, fitText(ctx, `${spot?.label ?? ""} ${bet[1]}`, 70, SMALL), 84, y, C_TEXT, SMALL);
    const delta = t.dl[i] ?? 0;
    if (t.ph !== 0 && delta !== 0) text(ctx, `${delta > 0 ? "+" : ""}${delta}`, CW - 8, y, delta > 0 ? C_WIN : C_LOSE, SMALL, "right");
    else if (t.ph === 0) text(ctx, bet[2] === 1 ? "LISTO" : "…", CW - 8, y, bet[2] === 1 ? C_GREEN : C_DIM, TINY, "right");
    row++;
  }

  // --- Estado de la ronda y cuenta atrás ---
  const left = t.ph === 0 ? Math.max(0, Math.ceil(BET_TIME - t.pt)) : Math.max(0, Math.ceil((t.ph === 1 ? 3.2 : PAY_TIME) - t.pt));
  const state = t.ph === 0 ? (left <= 5 ? `APUESTAS ${left} SEG` : "APUESTAS ABIERTAS") : t.ph === 1 ? "GIRANDO…" : "PAGOS";
  text(ctx, state, 8, SEAT_Y - 10, t.ph === 0 && left <= 5 ? C_GOLD : C_TEXT, TINY);

  // --- Franja de apuestas ---
  const spots = SPOTS[TABLES[v.myTable].kind];
  const n = spots.length;
  const myBet = t.b[v.me] ?? [0, 1, 0];
  const locked = myBet[2] === 1;
  const betting = t.ph === 0;
  const w = Math.min(66, (CW - 20 - (n - 1) * 4) / n);
  const total = n * w + (n - 1) * 4;
  let x = CW / 2 - total / 2;
  spots.forEach((spot, i) => {
    const sel = betting && !locked && i === v.selSpot;
    roundRect(ctx, x, STRIP_Y, w, 16, 3, sel ? C_ACCENT : C_PANEL, sel ? C_ACCENT : C_LINE, 1);
    text(ctx, fitText(ctx, spot.label, w - 4, SMALL), x + w / 2, STRIP_Y + 2, sel ? C_BG : betting ? C_TEXT : C_DIM, SMALL, "center");
    if (spot.mult > 0) text(ctx, `×${spot.mult}`, x + w / 2, STRIP_Y + 9, sel ? C_BG : C_GOLD, TINY, "center");
    x += w + 4;
  });

  // --- Teclas de la mesa ---
  const hint = betting
    ? locked ? "ENTER: CAMBIAR LA APUESTA · E: LEVANTARSE" : "←→ CASILLA · ↑↓ FICHAS · ENTER LISTO · E: LEVANTARSE"
    : "E: LEVANTARSE";
  text(ctx, fitText(ctx, hint, CW - 16, TINY), 8, STRIP_Y - 10, C_DIM, TINY);

  // --- Cartel del resultado ---
  if (t.ph === 2 && t.lb) {
    const label = t.lb.toUpperCase();
    const mine = t.dl[v.me] ?? 0;
    const ww = Math.min(190, textWidth(ctx, label, MID) + 20);
    roundRect(ctx, CW / 2 - ww / 2, 20, ww, 15, 3, mine > 0 ? C_ACCENT : C_PANEL, mine > 0 ? C_ACCENT : C_LINE, 1);
    text(ctx, label, CW / 2, 24, mine > 0 ? C_BG : C_TEXT, MID, "center");
    line(ctx, CW / 2 - ww / 2 + 4, 36, CW / 2 + ww / 2 - 4, 36, C_LINE, 1);
  }
}
