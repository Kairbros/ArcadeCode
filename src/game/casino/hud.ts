// HUD del casino (2D encima del 3D): barra de objetos (monedas, mano y bate), fichas, aviso de sentarse,
// franja de apuestas, asientos de la mesa, cartel del resultado y avisos de robos. Todo con la fuente de
// píxeles del hub.
import { PLAYER_COLORS, PLAYER_NAMES } from "../core/config";
import { fillCircle, fitText, line, polygon, roundRect, shadowText, text, textWidth, type Ctx } from "../core/draw";
import {
  BET_TIME, C_ACCENT, C_BG, C_DIM, C_GOLD, C_GREEN, C_LINE, C_LOSE, C_PANEL, C_TEXT, C_WIN, CH, CW, HOT_BOOST, ITEM_BANANA,
  DISGUISE_COST, DISGUISES, EMOTES, ITEM_COST, ITEM_DICE, ITEM_MAGNET, ITEM_NAMES, ITEM_NONE, NPC_CHASE, NPC_IDLE, PAY_TIME, ROB_ZONE, SLOT_BAT, SLOT_HAND, SLOT_ITEM, SLOT_NAMES,
} from "./config";
import { DEPOSIT_STEPS, JAIL_PENALTY, ROUNDS, ROUND_COUNT, roundDef } from "./balance";
import { SEQ_NAMES } from "./mech";
import { DR_GONE, DR_SIT } from "./drunk";
import { pickAmount, roomFor, WIN_BLOCKED, WIN_CLOSED } from "./ventanilla";
import { GAME_TITLE, SPOTS, type CasinoSnap, type TableSnap } from "./table";
import { TABLES, VAULT_PADS } from "./world3d";

const TINY = "5px";
const SMALL = "6px";
const MID = "8px";

/** Barra de objetos: 4 ranuras de 24 px en el centro de abajo. */
const BAR_Y = 196;
const BAR_SIZE = 24;
const BAR_GAP = 4;
const BAR_SLOTS = 4;
const STRIP_Y = 172;
const SEAT_Y = 126;
/** Línea de teclas y de ESC, debajo de la barra. */
const FOOT_Y = 228;
/** Panel del turno (debajo de la franja de arriba) y fila de avisos debajo de él. */
const SHIFT_Y = 18;
const NOTICE_Y = 56;

export interface HudView {
  s: CasinoSnap;
  me: number;
  /** Mesa en la que estoy sentado (-1 = andando). */
  myTable: number;
  /** Mesa a la que estoy apuntando (para sentarme). */
  near: number;
  /** Estoy delante de la barra (se puede comprar un truco). */
  shop: boolean;
  /** Estoy junto a la caja de la fuga (se puede forzar para soltar a los presos). */
  jailSwitch: boolean;
  /** Estoy delante de una puerta del baño (me puedo esconder). */
  bath: boolean;
  /** Ventanilla abierta en mi pantalla y opción elegida del selector. */
  win: boolean;
  winSel: number;
  /** Estoy junto a la ventanilla, la palanca, el timbre, un botón de la alarma (0..3 o -1) o un borracho. */
  nearWin: boolean;
  nearLever: boolean;
  nearLure: boolean;
  nearSeq: number;
  nearDrunk: boolean;
  /** Recarga (s) de «apartar borracho». */
  pushCd: number;
  /** Segundos que me quedan escondido en el baño (0 = fuera). */
  hidden: number;
  /** Recarga de la zancadilla (0 = lista). */
  tripCd: number;
  /** Zona temática en la que estoy (se enseña arriba). */
  zone: string;
  /** Escalera al alcance: 0 ninguna, 1 para subir, 2 para bajar. */
  stair: number;
  /** Maniquí de la boutique al alcance (o -1). */
  mannequin: number;
  /** Hay basura a mi alcance (E para cogerla) y si llevo una en la mano. */
  litter: boolean;
  carrying: boolean;
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
  /** Aguante para correr (0..1), si está agotado y si corre ahora. */
  stamina: number;
  tired: boolean;
  running: boolean;
}

/** Fichas del jugador. */
export function chipsOf(s: CasinoSnap, i: number): number {
  return s.ch[i] ?? 0;
}

export function drawHud(ctx: Ctx, v: HudView) {
  const s = v.s;
  const table = v.myTable >= 0 ? s.tb[v.myTable] : null;

  // --- Arriba: mesa y ronda (las fichas van en la ranura de monedas) ---
  // Franja de arriba: ciruela con un filo naranja, como los carteles del casino.
  ctx.fillStyle = "rgba(34,16,40,0.82)";
  ctx.fillRect(0, 0, CW, 15);
  ctx.fillStyle = "rgba(255,138,36,0.9)";
  ctx.fillRect(0, 15, CW, 1);
  if (table && v.myTable >= 0) {
    const def = TABLES[v.myTable];
    shadowText(ctx, `${GAME_TITLE[def.kind]} · RONDA ${table.rd}`, 8, 4, C_TEXT, SMALL);
  } else {
    // La zona en la que estás y el piso (con tantas zonas, orienta).
    const floor = (s.pl[v.me]?.[5] ?? 0) === 1 ? "ENTREPISO" : "PLANTA BAJA";
    shadowText(ctx, v.zone ? `${v.zone} · ${floor}` : "CASINO ENTRE AMIGOS", 8, 4, v.zone ? C_TEXT : C_DIM, SMALL);
  }
  if (v.netLabel) text(ctx, v.netLabel, CW - 6, 5, C_DIM, TINY, "right");

  if (!v.ready) {
    shadowText(ctx, "CONECTANDO…", CW / 2, CH / 2, C_TEXT, MID, "center");
    return;
  }

  drawShift(ctx, v);
  drawStatus(ctx, v);
  if (v.hidden > 0) drawHidden(ctx, v);
  else if (v.win) drawWindowUi(ctx, v);
  else if (table && v.myTable >= 0) drawTableUi(ctx, v, table);
  else drawWalkUi(ctx, v);
  drawVault(ctx, v);
  drawBar(ctx, v, s);
  drawNotice(ctx, v);
  if (v.rob) drawRob(ctx, v.rob);
  if (v.jail > 0) drawJail(ctx, v);
  else if (!v.rob && v.hidden <= 0) drawCrosshair(ctx, v);

  // Aturdido: pantalla teñida de rojo (te están pegando) y aviso.
  if (v.stun > 0.02) {
    ctx.fillStyle = "rgba(255,40,60,0.14)";
    ctx.fillRect(0, 0, CW, CH);
    shadowText(ctx, "¡ATURDIDO!", CW / 2, NOTICE_Y + 22, C_LOSE, MID, "center");
  }
  drawChased(ctx, v);
  drawBreak(ctx, v);
  drawEvent(ctx, v);

  // --- Teclas ---
  text(ctx, "ESC: MENÚ", 6, FOOT_Y, C_DIM, TINY);
  text(ctx, "R: REINICIAR", CW - 6, FOOT_Y, C_DIM, TINY, "right");
}

/** Reloj de la ronda, objetivo del equipo con su barra, progreso de la ronda y la mesa caliente. */
function drawShift(ctx: Ctx, v: HudView) {
  const q = v.s.qs;
  if (!q) return;
  const [round, left, goal, total] = q;
  const def = roundDef(round);
  const boss = v.s.bs === 1;
  const met = total >= goal;
  const hurry = left <= 20 && !met && !boss;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const label = boss ? `RONDA ${ROUND_COUNT}/${ROUND_COUNT} SUPERADA · JEFE PRÓXIMAMENTE` : `RONDA ${round}/${ROUND_COUNT} · ${clock} · ${total}/${goal}`;
  const w = Math.min(CW - 20, textWidth(ctx, label, SMALL) + 16);
  const x = CW / 2 - w / 2;
  // Parpadea en rojo los últimos segundos si todavía no llegan.
  const blink = hurry && Math.floor(v.time * 4) % 2 === 0;
  roundRect(ctx, x, SHIFT_Y, w, 15, 4, blink ? C_LOSE : C_PANEL, met || boss ? C_GREEN : C_ACCENT, 1);
  text(ctx, fitText(ctx, label, w - 8, SMALL), CW / 2, SHIFT_Y + 2, C_TEXT, SMALL, "center");
  // Dos barras finas: el objetivo del equipo (grande) y el tiempo de la ronda (debajo).
  const k = Math.max(0, Math.min(1, total / Math.max(1, goal)));
  ctx.fillStyle = `rgb(${C_BG[0]},${C_BG[1]},${C_BG[2]})`;
  ctx.fillRect(x + 4, SHIFT_Y + 10, w - 8, 3);
  const c = met || boss ? C_GREEN : C_ACCENT;
  ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  ctx.fillRect(x + 4, SHIFT_Y + 10, Math.round((w - 8) * k), 3);
  const t = boss ? 1 : Math.max(0, Math.min(1, 1 - left / Math.max(1, def.time)));
  ctx.fillStyle = `rgba(${C_LINE[0]},${C_LINE[1]},${C_LINE[2]},0.18)`;
  ctx.fillRect(x + 4, SHIFT_Y + 14, w - 8, 1);
  ctx.fillStyle = `rgb(${C_LINE[0]},${C_LINE[1]},${C_LINE[2]})`;
  ctx.fillRect(x + 4, SHIFT_Y + 14, Math.round((w - 8) * t), 1);
  shadowText(ctx, fitText(ctx, boss ? "SALA DEL JEFE · LA VENTANILLA ESPERA" : `${def.name} · ${def.objective}`, CW - 16, TINY), CW / 2, SHIFT_Y + 18, C_DIM, TINY, "center");
  const hot = v.s.ht;
  if (hot && hot[0] >= 0 && !boss) {
    const name = GAME_TITLE[TABLES[hot[0]].kind] + (TABLES[hot[0]].lv ? " (ARRIBA)" : "");
    shadowText(ctx, `MESA CALIENTE: ${name} ×${HOT_BOOST} · ${hot[1]}s`, CW / 2, SHIFT_Y + 26, C_GOLD, TINY, "center");
  }
}

/** Panel de estado (izquierda): ventanilla, topes, retorno, guardias, borrachos, mesas y mecanismos de la ronda. */
function drawStatus(ctx: Ctx, v: HudView) {
  const s = v.s;
  const vn = s.vn;
  if (!vn || v.win || v.hidden > 0) return;
  const [gate, cap, dep, limit, ret, round, watched] = vn;
  const me = v.me;
  const mine = s.dp?.[me] ?? 0;
  const guards = (s.np ?? []).filter((n, k) => k >= TABLES.length && n[3] !== 5).length;
  const drunks = (s.dk ?? []).filter((d) => d[3] !== DR_GONE).length;
  const seated = v.myTable >= 0;
  const lines: { t: string; c: readonly [number, number, number] }[] = [];
  const gc = gate === WIN_BLOCKED ? C_LOSE : gate === WIN_CLOSED ? C_GOLD : C_GREEN;
  lines.push({ t: `VENTANILLA: ${gate === WIN_BLOCKED ? "BLOQUEADA" : gate === WIN_CLOSED ? "CERRADA" : "ABIERTA"}${watched ? " · VIGILADA" : ""}`, c: watched && gate === 0 ? C_LOSE : gc });
  lines.push({ t: `TOPE ${dep}/${cap} · TU LÍMITE ${mine}/${limit}`, c: C_TEXT });
  lines.push({ t: `EQUIPO ${s.qs?.[3] ?? 0} / OBJETIVO ${s.qs?.[2] ?? 0}`, c: (s.qs?.[3] ?? 0) >= (s.qs?.[2] ?? 1) ? C_GREEN : C_TEXT });
  lines.push({ t: `RETORNO ×${(ret / 100).toFixed(2)} · GUARDIAS ${guards} · BORRACHOS ${drunks}`, c: C_DIM });
  const mc = s.mc ?? [];
  const def = ROUNDS[Math.max(1, Math.min(ROUND_COUNT, round)) - 1];
  if (def.mech.leverOpen > 0) lines.push({ t: mc[0] > 0 ? `REJA ABIERTA ${Math.ceil(mc[0])}s` : "REJA CERRADA · PALANCA (ESTE)", c: mc[0] > 0 ? C_GREEN : C_GOLD });
  if (def.mech.lure > 0) lines.push({ t: mc[1] > 0 ? `TIMBRE: GUARDIAS DISTRAÍDOS ${Math.ceil(mc[1])}s` : mc[2] > 0 ? `TIMBRE RECARGA ${Math.ceil(mc[2])}s` : "TIMBRE LISTO (OESTE)", c: mc[1] > 0 ? C_GREEN : C_DIM });
  if (def.mech.seqLen > 0) {
    const order = mc.slice(5).map((k) => SEQ_NAMES[k]).join("-");
    lines.push({ t: mc[3] > 0 ? `ALARMA ${Math.ceil(mc[3])}s: ${order} (${mc[4]}/${mc.length - 5})` : "ALARMA: EN VIGILANCIA (ENTREPISO)", c: mc[3] > 0 ? C_LOSE : C_DIM });
  }
  lines.push({ t: `RIESGOS: CÁRCEL −${Math.round(JAIL_PENALTY * 100)}% CARTERA · BORRACHO: APUESTA CONFIRMADA`, c: C_DIM });
  const w = 150;
  const x = 3;
  let y = 52 + 7;
  // Sentado, el panel de la mesa ya ocupa la pantalla: solo quedan las lámparas de las mesas.
  const shown = seated ? [] : lines;
  const h = shown.length * 7 + 14;
  ctx.fillStyle = "rgba(34,16,40,0.66)";
  ctx.fillRect(x, y - 3, w + 4, h);
  for (const l of shown) {
    text(ctx, fitText(ctx, l.t, w, TINY), x + 3, y, l.c, TINY);
    y += 7;
  }
  // Mesas: una casilla por mesa (libre, ocupada o bloqueada por un borracho).
  const bk = s.bk ?? [];
  TABLES.forEach((_, i) => {
    const busy = (s.tb[i]?.pr ?? []).some((p) => p === 1);
    const c = bk[i] === 1 ? C_LOSE : busy ? C_GOLD : C_DIM;
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(x + 3 + i * 7, y + 1, 5, 4);
    if (v.myTable === i) {
      ctx.strokeStyle = `rgb(${C_TEXT[0]},${C_TEXT[1]},${C_TEXT[2]})`;
      ctx.strokeRect(x + 2.5 + i * 7, y + 0.5, 6, 5);
    }
  });
  text(ctx, "MESAS", x + 3 + TABLES.length * 7 + 2, y, C_DIM, TINY);
  // Contador de monedas (derecha): cartera y depósito.
  const wallet = chipsOf(s, me);
  const stake = s.sk?.[me] ?? 0;
  roundRect(ctx, 3, 18, 74, 16, 3, C_PANEL, C_GOLD, 1);
  text(ctx, `CARTERA ${wallet}`, 7, 20, C_GOLD, TINY);
  text(ctx, `DEPÓSITO ${stake}`, 7, 27, C_GREEN, TINY);
}

/** Ventanilla: saldos, topes, retorno, selector de cantidad y riesgos. Sirve para depositar, no para comprar. */
function drawWindowUi(ctx: Ctx, v: HudView) {
  const s = v.s;
  const vn = s.vn ?? [0, 0, 0, 0, 100, 1, 0];
  const [gate, cap, dep, limit, ret] = vn;
  const me = v.me;
  const wallet = chipsOf(s, me);
  const mine = s.dp?.[me] ?? 0;
  const room = roomFor(wallet, limit, mine, cap, dep);
  const amount = pickAmount(v.winSel, room);
  const w = 262, h = 134;
  const x = CW / 2 - w / 2, y = 37;
  roundRect(ctx, x, y, w, h, 6, C_BG, C_ACCENT, 2);
  const open = gate === 0;
  const stateText = gate === WIN_BLOCKED ? "BLOQUEADA POR LA ALARMA" : gate === WIN_CLOSED ? "CERRADA · REJA ECHADA" : vn[6] ? "ABIERTA · ¡UN GUARDIA TE VE!" : "ABIERTA";
  const sc = gate === WIN_BLOCKED ? C_LOSE : gate === WIN_CLOSED ? C_GOLD : vn[6] ? C_LOSE : C_GREEN;
  shadowText(ctx, "VENTANILLA · DEPÓSITO DE APUESTAS", x + 8, y + 6, C_TEXT, MID);
  text(ctx, `ESTADO: ${stateText}`, x + 8, y + 18, sc, SMALL);
  // Cifras.
  const row = (label: string, value: string, yy: number, c: readonly [number, number, number] = C_TEXT) => {
    text(ctx, label, x + 8, yy, C_DIM, SMALL);
    text(ctx, value, x + 140, yy, c, SMALL, "right");
  };
  row("CARTERA (SALDO)", `${wallet}`, y + 30, C_GOLD);
  row("DEPOSITADO EN LA RONDA", `${mine}`, y + 40);
  row("TU LÍMITE RESTANTE", `${Math.max(0, limit - mine)} / ${limit}`, y + 50);
  row("TOPE GLOBAL DISPONIBLE", `${Math.max(0, cap - dep)} / ${cap}`, y + 60);
  row("DEPÓSITO PARA APOSTAR", `${s.sk?.[me] ?? 0}`, y + 70, C_GREEN);
  // Barra del tope global.
  const bw = 126;
  ctx.fillStyle = `rgb(${C_PANEL[0]},${C_PANEL[1]},${C_PANEL[2]})`;
  ctx.fillRect(x + 8, y + 80, bw, 4);
  ctx.fillStyle = `rgb(${C_ACCENT[0]},${C_ACCENT[1]},${C_ACCENT[2]})`;
  ctx.fillRect(x + 8, y + 80, Math.round(bw * Math.min(1, dep / Math.max(1, cap))), 4);
  // Retorno y ganancia potencial.
  const r = ret / 100;
  text(ctx, `RETORNO DE LA RONDA ×${r.toFixed(2)}`, x + 152, y + 30, C_GOLD, SMALL);
  text(ctx, `SI ACIERTAS (×2): +${Math.round(amount * r)}`, x + 152, y + 40, C_WIN, SMALL);
  text(ctx, `RECUPERABLE: ${amount}`, x + 152, y + 50, C_TEXT, SMALL);
  text(ctx, "RIESGOS ACTIVOS", x + 152, y + 62, C_LOSE, SMALL);
  text(ctx, fitText(ctx, `CÁRCEL: −${Math.round(JAIL_PENALTY * 100)}% DE LA CARTERA`, 104, TINY), x + 152, y + 71, C_DIM, TINY);
  text(ctx, fitText(ctx, "EL DEPÓSITO ESTÁ A SALVO", 104, TINY), x + 152, y + 78, C_DIM, TINY);
  text(ctx, fitText(ctx, "BORRACHO: APUESTA CONFIRMADA", 104, TINY), x + 152, y + 85, C_DIM, TINY);
  // Selector de cantidad.
  const sw = 34;
  DEPOSIT_STEPS.forEach((st, i) => {
    const sel = i === v.winSel;
    const xx = x + 8 + i * (sw + 4);
    const val = st === 0 ? room : st;
    roundRect(ctx, xx, y + 89, sw, 18, 3, sel ? C_ACCENT : C_PANEL, sel ? C_ACCENT : C_LINE, 1);
    text(ctx, st === 0 ? "MÁX" : `${st}`, xx + sw / 2, y + 92, sel ? C_BG : C_TEXT, SMALL, "center");
    text(ctx, `${val}`, xx + sw / 2, y + 99, sel ? C_BG : C_DIM, TINY, "center");
  });
  const can = open && amount > 0;
  text(ctx, "DEPOSITAR", x + w - 8, y + 89, can ? C_WIN : C_DIM, SMALL, "right");
  text(ctx, `${amount}`, x + w - 8, y + 98, can ? C_WIN : C_DIM, MID, "right");
  // Todos los jugadores: saldo y depósito.
  let col = 0;
  for (let i = 0; i < 4; i++) {
    if (s.on[i] !== 1) continue;
    const color = PLAYER_COLORS[i] ?? PLAYER_COLORS[0];
    ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    const xx = x + 8 + col * 62;
    ctx.fillRect(xx, y + 112, 3, 6);
    text(ctx, fitText(ctx, `${PLAYER_NAMES[i]}${i === me ? "*" : ""} ${s.ch[i] ?? 0}+${s.sk?.[i] ?? 0}`, 56, TINY), xx + 5, y + 113, i === me ? C_TEXT : C_DIM, TINY);
    col++;
  }
  text(ctx, "CARTERA+DEPÓSITO", x + w - 8, y + 113, C_DIM, TINY, "right");
  text(ctx, "↑↓←→ CANTIDAD · ENTER DEPOSITA · E SALE · AQUÍ NO SE COMPRA", x + w / 2, y + 125, C_DIM, TINY, "center");
}

/** Te persigue un NPC: marco rojo que late y aviso de correr. */
function drawChased(ctx: Ctx, v: HudView) {
  if (v.jail > 0 || !(v.s.np ?? []).some((n) => n[3] === NPC_CHASE && n[4] === v.me)) return;
  const k = 0.5 + Math.sin(v.time * 9) * 0.5;
  ctx.fillStyle = `rgba(255,40,60,${0.25 + k * 0.35})`;
  const t = 4;
  ctx.fillRect(0, 0, CW, t);
  ctx.fillRect(0, CH - t, CW, t);
  ctx.fillRect(0, 0, t, CH);
  ctx.fillRect(CW - t, 0, t, CH);
  shadowText(ctx, "¡TE PERSIGUEN! SHIFT PARA CORRER", CW / 2, CH / 2 + 14, C_LOSE, SMALL, "center");
}

/** Fuga: barra de forcejeo para quien fuerza la caja y aviso para los presos de que les están sacando. */
function drawBreak(ctx: Ctx, v: HudView) {
  const jb = v.s.jb ?? [];
  const mine = jb[v.me] ?? 0;
  if (mine > 0) {
    const w = 140, x = CW / 2 - w / 2, y = CH / 2 + 24;
    roundRect(ctx, x - 4, y - 12, w + 8, 22, 4, C_PANEL, C_ACCENT, 1);
    text(ctx, "FORZANDO LA CAJA… ¡QUE NO TE VEA EL GUARDIA!", CW / 2, y - 9, C_TEXT, TINY, "center");
    roundRect(ctx, x, y, w, 6, 2, C_BG, C_LINE, 1);
    ctx.fillStyle = `rgb(${C_ACCENT[0]},${C_ACCENT[1]},${C_ACCENT[2]})`;
    ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * mine), 4);
    return;
  }
  if (v.jail <= 0) return;
  const helper = jb.findIndex((p, i) => p > 0 && i !== v.me);
  if (helper < 0) return;
  const label = `¡${PLAYER_NAMES[helper] ?? `J${helper + 1}`} TE ESTÁ SACANDO! ${Math.round(jb[helper] * 100)}%`;
  shadowText(ctx, fitText(ctx, label, CW - 20, SMALL), CW / 2, CH / 2 + 24, C_GOLD, SMALL, "center");
}

/** Cartel grande de fin de turno: cuota cumplida o la casa cobra. */
function drawEvent(ctx: Ctx, v: HudView) {
  const ev = v.s.ev;
  if (!ev || !ev.length) return;
  const [kind, left] = ev;
  const ok = kind === 1 || kind === 3;
  ctx.globalAlpha = Math.min(1, left * 2);
  const w = 220, h = 40;
  const x = CW / 2 - w / 2, y = CH / 2 - 44;
  roundRect(ctx, x, y, w, h, 6, ok ? C_GREEN : C_LOSE, C_LINE, 2);
  shadowText(ctx, kind === 3 ? "¡PREPARADOS PARA EL JEFE!" : ok ? "¡RONDA SUPERADA!" : "¡LA CASA COBRA!", CW / 2, y + 8, C_TEXT, MID, "center");
  const sub = kind === 3 ? "LAS CINCO RONDAS SUPERADAS" : ok ? `SIGUIENTE: RONDA ${v.s.qs?.[0] ?? 1} · MÁS TOPE, MENOS RETORNO` : `TODOS A LA CÁRCEL · RÉCORD ${v.s.qs?.[4] ?? 0} RONDAS`;
  text(ctx, sub, CW / 2, y + 24, C_TEXT, SMALL, "center");
  ctx.globalAlpha = 1;
}

/** Icono del objeto de la tienda dentro de su ranura. */
function drawItemIcon(ctx: Ctx, item: number, cx: number, cy: number, ink: readonly [number, number, number]) {
  if (item === ITEM_MAGNET) {
    // Herradura roja con puntas plateadas.
    ctx.strokeStyle = `rgb(${C_LOSE[0]},${C_LOSE[1]},${C_LOSE[2]})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI);
    ctx.stroke();
    ctx.fillStyle = "rgb(220,224,236)";
    ctx.fillRect(cx - 6.5, cy - 5, 3, 4);
    ctx.fillRect(cx + 3.5, cy - 5, 3, 4);
  } else if (item === ITEM_DICE) {
    roundRect(ctx, cx - 6, cy - 6, 12, 12, 2, C_TEXT, C_TEXT, 1);
    for (const [dx, dy] of [[-3, -3], [0, 0], [3, 3]]) fillCircle(ctx, cx + dx, cy + dy, 1.1, C_LOSE);
  } else if (item === ITEM_BANANA) {
    ctx.strokeStyle = `rgb(${C_GOLD[0]},${C_GOLD[1]},${C_GOLD[2]})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy - 5, 8, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  } else {
    text(ctx, "?", cx, cy - 3, ink, MID, "center");
  }
}

/** La barra de objetos: monedas (con las fichas), mano, bate y el truco comprado. */
function drawBar(ctx: Ctx, v: HudView, s: CasinoSnap) {
  const total = BAR_SIZE * BAR_SLOTS + BAR_GAP * (BAR_SLOTS - 1);
  const x0 = CW / 2 - total / 2;
  const seated = v.myTable >= 0;
  const tricks = s.it?.[v.me] ?? [ITEM_NONE, 0, 0];
  for (let i = 0; i < BAR_SLOTS; i++) {
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
    } else if (i === SLOT_ITEM) {
      const item = tricks[0];
      drawItemIcon(ctx, item, cx, cy, ink);
      const name = item === ITEM_NONE ? "VACÍO" : ITEM_NAMES[item].split(" ")[0];
      text(ctx, fitText(ctx, name, BAR_SIZE - 2, TINY), cx, BAR_Y + 16, on ? C_BG : item ? C_GOLD : C_DIM, TINY, "center");
    }
    // Número de tecla, en la esquina.
    text(ctx, `${i + 1}`, x + 2, BAR_Y + 1, on ? C_BG : C_DIM, TINY);
  }
  // Qué se hace con lo que llevas en la mano (encima de la barra).
  const use = v.carrying
    ? "CLIC: TIRAR LA BASURA"
    : v.slot === SLOT_HAND
    ? "CLIC: ROBAR"
    : v.slot === SLOT_BAT
      ? "CLIC: PEGAR"
      : v.slot === SLOT_ITEM
        ? tricks[0] === ITEM_NONE ? `CÓMPRALO EN LA BARRA (${ITEM_COST})` : `CLIC: USAR ${ITEM_NAMES[tricks[0]]}`
        : "CLIC: TIRAR MONEDA";
  const label = v.jail > 0
    ? "EN LA CÁRCEL · A LA PALANCA CON LA BASURA"
    : seated
      ? "A SALVO EN LA MESA"
      : `${SLOT_NAMES[v.slot]} · ${use}`;
  text(ctx, fitText(ctx, label, CW - 24, TINY), CW / 2, BAR_Y - 8, seated ? C_DIM : C_ACCENT, TINY, "center");
  // Efectos activos: imán con su cuenta atrás y dado cargado esperando la próxima apuesta.
  const effects: string[] = [];
  if (v.tripCd > 0.05 && !seated) effects.push(`ZANCADILLA ${v.tripCd.toFixed(1)}s`);
  const dg = s.dg?.[v.me] ?? [0, 0];
  if (dg[0] > 0) effects.push(`${DISGUISES[dg[0] - 1]} ${dg[1]}s`);
  const em = s.em?.[v.me] ?? 0;
  if (em > 0) effects.push(EMOTES[em - 1]);
  if (tricks[1] > 0) effects.push(`IMÁN ${Math.ceil(tricks[1])}s`);
  if (tricks[2] > 0) effects.push("DADO CARGADO ×2");
  // Aguante para correr: barra fina bajo la ranuras (solo andando y cuando no está llena o se corre).
  if (!seated && v.jail <= 0 && (v.stamina < 0.999 || v.running)) {
    const y = BAR_Y + BAR_SIZE + 2;
    const c = v.tired ? C_LOSE : v.stamina < 0.3 ? C_GOLD : C_GREEN;
    ctx.fillStyle = `rgb(${C_BG[0]},${C_BG[1]},${C_BG[2]})`;
    ctx.fillRect(x0, y, total, 3);
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(x0, y, Math.round(total * v.stamina), 3);
    if (v.tired) text(ctx, "AGOTADO", x0 + total + 4, y - 2, C_LOSE, TINY);
  }
  const ex = x0 + total + 6;
  if (effects.length) text(ctx, fitText(ctx, effects.join(" · "), CW - ex - 4, TINY), ex, BAR_Y + 9, C_GOLD, TINY);
}

/** Aviso del momento, arriba en el centro. */
function drawNotice(ctx: Ctx, v: HudView) {
  if (v.noticeT <= 0 || !v.notice) return;
  const bad = v.notice.startsWith("¡");
  const w = Math.min(CW - 30, textWidth(ctx, v.notice, SMALL) + 16);
  // Con la ventanilla abierta el aviso va debajo del panel (no tapa las cifras).
  const ny = v.win ? 175 : NOTICE_Y;
  ctx.globalAlpha = Math.min(1, v.noticeT * 2.5);
  roundRect(ctx, CW / 2 - w / 2, ny, w, 13, 3, bad ? C_LOSE : C_ACCENT, bad ? C_LOSE : C_ACCENT, 1);
  text(ctx, fitText(ctx, v.notice, w - 8, SMALL), CW / 2, ny + 4, C_BG, SMALL, "center");
  ctx.globalAlpha = 1;
}

/** Andando por la sala: aviso de mesa cercana, ratón y controles. */
function drawWalkUi(ctx: Ctx, v: HudView) {
  const seqName = v.nearSeq >= 0 ? SEQ_NAMES[v.nearSeq] : "";
  const hint = v.nearDrunk
    ? v.pushCd > 0 ? `APARTAR BORRACHO · RECARGA ${Math.ceil(v.pushCd)} s` : "E · APARTAR BORRACHO (LO DEJAS DORMIDO Y LA MESA QUEDA LIBRE)"
    : v.near >= 0
    ? `E · SENTARSE EN ${GAME_TITLE[TABLES[v.near].kind]}`
    : v.nearWin
    ? "E · VENTANILLA: DEPOSITAR MONEDAS PARA APOSTAR"
    : v.nearLever
    ? "E · PALANCA: ABRE LA REJA DE LA VENTANILLA"
    : v.nearLure
    ? "E · TIMBRE: DISTRAE A LOS GUARDIAS DE LA PLANTA BAJA"
    : v.nearSeq >= 0
    ? `E · BOTÓN ${seqName} (SECUENCIA DE LA ALARMA)`
    : v.shop
      ? `E · COMPRAR TRUCO SORPRESA (${ITEM_COST} FICHAS)`
      : v.jailSwitch
        ? prisoners(v) > 0
          ? `E · FUGA: FORZAR LA CAJA (${prisoners(v)} PRESO${prisoners(v) === 1 ? "" : "S"} ARRIBA)`
          : "CAJA DE LA FUGA · NO HAY NADIE PRESO"
        : v.bath
          ? "E · ESCONDERSE EN EL BAÑO (EL QUE TE PERSIGUE TE PIERDE)"
          : v.litter
            ? "E · AGARRAR LA BASURA (CLIC PARA TIRARLA)"
            : v.mannequin >= 0
              ? `E · PONERTE EL DISFRAZ: ${DISGUISES[v.mannequin]} (${DISGUISE_COST} FICHAS)`
              : v.stair
                ? "ESCALERA AL ENTREPISO · SUBE ANDANDO"
                : "SHIFT CORRER · ESPACIO SALTAR · CLIC USAR · Q ZANCADILLA · 5-8 EMOTES";
  const lit = v.near >= 0 || v.shop || v.bath || v.litter || v.mannequin >= 0 || (v.jailSwitch && prisoners(v) > 0) || v.nearDrunk || v.nearWin || v.nearLever || v.nearLure || v.nearSeq >= 0;
  const w = Math.min(CW - 20, textWidth(ctx, hint, SMALL) + 18);
  roundRect(ctx, CW / 2 - w / 2, 150, w, 14, 4, v.nearDrunk ? C_LOSE : lit ? C_ACCENT : C_PANEL, v.nearDrunk ? C_LOSE : lit ? C_ACCENT : C_LINE, 1);
  text(ctx, fitText(ctx, hint, w - 10, SMALL), CW / 2, 154, lit ? C_BG : C_TEXT, SMALL, "center");
  // Cerca de una mesa: ¿mira el crupier? Si no, se le puede robar con la mano.
  const croupier = v.near >= 0 ? v.s.np?.[v.near] : undefined;
  if (croupier) {
    const watching = croupier[3] === NPC_IDLE;
    const tip = watching
      ? "EL CRUPIER TE VIGILA · ESPERA A QUE SE DISTRAIGA"
      : v.slot === SLOT_HAND ? "¡CRUPIER DISTRAÍDO! CLIC: ROBAR LA MESA" : "¡CRUPIER DISTRAÍDO! MANO (2) PARA ROBAR LA MESA";
    shadowText(ctx, fitText(ctx, tip, CW - 20, TINY), CW / 2, 134, watching ? C_DIM : C_GOLD, TINY, "center");
  }
  // La primera vez, cómo se mira según lo que permita la vista.
  if (v.look !== "locked") text(ctx, v.look === "drag" ? "MIRA ARRASTRANDO CON EL RATÓN" : "CLIC PARA MIRAR CON EL RATÓN", CW / 2, 142, C_DIM, TINY, "center");
}

/** Presos en la jaula (sin contarme a mí). */
function prisoners(v: HudView): number {
  return (v.s.ja ?? []).filter((t, i) => t > 0 && i !== v.me && v.s.on[i] === 1).length;
}

/** Escondido en el baño: pantalla a oscuras con la rendija de la puerta y la cuenta atrás. */
function drawHidden(ctx: Ctx, v: HudView) {
  ctx.fillStyle = "rgba(10,6,14,0.82)";
  ctx.fillRect(0, 16, CW, CH - 16);
  // Rendija de la puerta: se ve un poco del salón.
  ctx.fillStyle = "rgba(255,214,150,0.08)";
  ctx.fillRect(CW / 2 - 3, 40, 6, 120);
  shadowText(ctx, "ESCONDIDO EN EL BAÑO", CW / 2, 100, C_TEXT, MID, "center");
  const left = Math.ceil(v.hidden);
  text(ctx, `${left} s · E PARA SALIR`, CW / 2, 114, left <= 4 ? C_LOSE : C_DIM, SMALL, "center");
  text(ctx, "NADIE TE VE · RECUPERAS EL ALIENTO", CW / 2, 126, C_DIM, TINY, "center");
}

/** Bóveda en equipo: estado y progreso cuando se está cerca de los paneles. */
function drawVault(ctx: Ctx, v: HudView) {
  const vt = v.s.vt;
  const me = v.s.pl[v.me];
  if (!vt || !me || v.myTable >= 0 || v.jail > 0 || v.hidden > 0) return;
  // La bóveda está en la sala VIP (entrepiso).
  const close = (me[5] ?? 0) === 1 && VAULT_PADS.some(([x, z]) => Math.hypot(me[0] - x, me[1] - z) < 3.5);
  if (!close) return;
  const [progress, cd, a, b] = vt;
  const y = 120;
  if (cd > 0) {
    shadowText(ctx, `BÓVEDA VACÍA · SE RELLENA EN ${cd}s`, CW / 2, y, C_DIM, SMALL, "center");
    return;
  }
  const on = (a >= 0 ? 1 : 0) + (b >= 0 ? 1 : 0);
  if (on < 2) {
    shadowText(ctx, `BÓVEDA: UNO EN CADA PANEL (${on}/2) · ¡QUE NO OS VEA EL GUARDIA!`, CW / 2, y, C_GOLD, TINY, "center");
    if (progress <= 0) return;
  }
  const w = 150, x = CW / 2 - w / 2;
  roundRect(ctx, x, y + 8, w, 6, 2, C_BG, C_LINE, 1);
  ctx.fillStyle = `rgb(${C_GOLD[0]},${C_GOLD[1]},${C_GOLD[2]})`;
  ctx.fillRect(x + 1, y + 9, Math.round((w - 2) * progress), 4);
  if (on === 2) shadowText(ctx, `ABRIENDO LA BÓVEDA… ${Math.round(progress * 100)}%`, CW / 2, y, C_GOLD, SMALL, "center");
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
  text(ctx, "CLIC (O F) PARA PARAR · SI FALLAS, A LA CÁRCEL", x + w / 2, y + h + 5, C_DIM, TINY, "center");
}

/** En la cárcel del techo: condena, basura y la palanca. */
function drawJail(ctx: Ctx, v: HudView) {
  const label = `CÁRCEL · ${Math.ceil(v.jail)} SEG`;
  const w = Math.min(CW - 40, textWidth(ctx, label, MID) + 18);
  roundRect(ctx, CW / 2 - w / 2, NOTICE_Y + 16, w, 14, 3, C_LOSE, C_LOSE, 1);
  text(ctx, label, CW / 2, NOTICE_Y + 20, C_BG, MID, "center");
  const hint = v.trash >= 0
    ? "TIENES BASURA · APUNTA A LA PALANCA Y HAZ CLIC"
    : "CLIC: COGER BASURA · TÍRALA A LA PALANCA PARA SALIR ANTES";
  text(ctx, fitText(ctx, hint, CW - 16, TINY), CW / 2, NOTICE_Y + 34, C_TEXT, TINY, "center");
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
      ctx.fillStyle = "rgba(255,138,36,0.9)";
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

  // --- Mesa bloqueada por un borracho ---
  const blocked = (v.s.bk ?? [])[v.myTable] === 1;
  const stakeNow = v.s.sk?.[v.me] ?? 0;
  if (blocked) {
    const dr = (v.s.dk ?? []).find((d) => d[4] === v.myTable && d[3] === DR_SIT);
    const label = `¡MESA BLOQUEADA POR UN BORRACHO!${dr ? ` ${Math.ceil(dr[6])} s` : ""}`;
    const ww = Math.min(CW - 20, textWidth(ctx, label, SMALL) + 18);
    roundRect(ctx, CW / 2 - ww / 2, NOTICE_Y + 16, ww, 14, 3, C_LOSE, C_LOSE, 1);
    text(ctx, label, CW / 2, NOTICE_Y + 20, C_BG, SMALL, "center");
    text(ctx, "NO SE PUEDE APOSTAR · UN COMPAÑERO PUEDE APARTARLO (E)", CW / 2, NOTICE_Y + 33, C_TEXT, TINY, "center");
  } else if (stakeNow < 1 && t.ph === 0) {
    text(ctx, "SIN DEPÓSITO PARA APOSTAR · USA LA VENTANILLA", CW / 2, NOTICE_Y + 20, C_GOLD, SMALL, "center");
  }
  text(ctx, `DEPÓSITO ${stakeNow}`, CW - 8, SEAT_Y - 10, C_GREEN, TINY, "right");
  const retNow = (v.s.vn?.[4] ?? 100) / 100;

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
    // Premio real de la ronda: lo que sobra de la ficha se multiplica por el retorno.
    if (spot.mult > 0) text(ctx, `×${(spot.mult >= 1 ? 1 + (spot.mult - 1) * retNow : spot.mult).toFixed(1)}`, x + w / 2, STRIP_Y + 9, sel ? C_BG : C_GOLD, TINY, "center");
    x += w + 4;
  });

  // --- Teclas de la mesa ---
  const hint = blocked
    ? "E: LEVANTARSE Y AYUDAR · EL RELOJ DE LA MESA ESTÁ PARADO"
    : betting
    ? locked ? "ENTER: CAMBIAR LA APUESTA · E: LEVANTARSE" : "←→ CASILLA · ↑↓ FICHAS · ENTER LISTO · E: LEVANTARSE"
    : "E: LEVANTARSE";
  text(ctx, fitText(ctx, hint, CW - 16, TINY), 8, STRIP_Y - 10, C_DIM, TINY);

  // --- Cartel del resultado ---
  if (t.ph === 2 && t.lb) {
    const label = t.lb.toUpperCase();
    const mine = t.dl[v.me] ?? 0;
    const ww = Math.min(190, textWidth(ctx, label, MID) + 20);
    const ry = NOTICE_Y + 16;
    roundRect(ctx, CW / 2 - ww / 2, ry, ww, 15, 3, mine > 0 ? C_ACCENT : C_PANEL, mine > 0 ? C_ACCENT : C_LINE, 1);
    text(ctx, label, CW / 2, ry + 4, mine > 0 ? C_BG : C_TEXT, MID, "center");
    line(ctx, CW / 2 - ww / 2 + 4, ry + 16, CW / 2 + ww / 2 - 4, ry + 16, C_LINE, 1);
  }
}
