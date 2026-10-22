// Dibujo de «Mazo Loco»: mesa de fieltro, pilas de mazo y descarte, paneles de los rivales, la mano con
// cartas de colores y los carteles de UNO, fin de ronda y fin de partida. Todo sale del estado recibido
// (`CardsSnap`) más los temporizadores locales de animación.
import type { RGB } from "../core/config";
import {
  badge, css, fillEllipse, fitText, line, mix, panel, polygon, roundRect, shadowText, shade, text,
  textWidth, titleText, type Ctx,
} from "../core/draw";
import { C_ACCENT, C_DIM, C_GOLD, C_LINE, C_LOSE, C_MUTE, C_PANEL, C_TEXT, C_WIN } from "../core/theme";
import {
  CARD_COLORS, CARD_DARK, CARD_H, CARD_R, CARD_W, C_CARD, C_DEALER, C_FELT, C_FELT_LINE, C_INK, CH, COLOR_NAMES,
  CW, HUD_H,
} from "./config";
import { glRenderer, renderInto } from "../core/three";
import { canPlay, colorOf, DRAW2, isWild, rankOf, rankShort, REVERSE, SKIP, WILD4 } from "./deck";
import {
  actionRects, colorRects, DISCARD_AT, DECK_AT, FOOT_Y, handPoses, HAND_LIFT, HAND_Y, MID_AT, panelRect, PICK_PANEL,
  type BtnId, type Rect,
} from "./layout";
import { CardsStage } from "./scene";
import { canAct, seatHand, unoPending, type CardsSnap } from "./state";

const TINY = "5px";
const SMALL = "6px";
const MID = "8px";
const BIG = "13px";
const HUGE = "19px";

export interface CardsView {
  s: CardsSnap;
  me: number;
  /** Carta resaltada (ratón o teclado). */
  hover: number;
  /** Eligiendo color de un comodín. */
  picking: boolean;
  pickHover: number;
  netLabel: string;
  footer: string;
  names: readonly string[];
  /** Botones que se ofrecen ahora mismo. */
  buttons: BtnId[];
}

const seatColor = (i: number): RGB => CARD_COLORS[i % 4];

/** Tarjeta boca arriba: cuerpo crema, zona de color, óvalo blanco y el símbolo del rango. */
function drawCardFace(ctx: Ctx, r: Rect, id: number, dim = false): void {
  const { x, y, w, h } = r;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x + 2, y + 2, w, h);
  roundRect(ctx, x, y, w, h, CARD_R, C_CARD, [28, 20, 26], 1);
  const color = colorOf(id);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 2.5, y + 2.5, w - 5, h - 5, CARD_R - 1);
  ctx.clip();
  if (isWild(id)) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    polygon(ctx, [[x, y], [x + w, y], [cx, cy]], CARD_COLORS[0]);
    polygon(ctx, [[x + w, y], [x + w, y + h], [cx, cy]], CARD_COLORS[1]);
    polygon(ctx, [[x + w, y + h], [x, y + h], [cx, cy]], CARD_COLORS[2]);
    polygon(ctx, [[x, y + h], [x, y], [cx, cy]], CARD_COLORS[3]);
  } else {
    ctx.fillStyle = css(CARD_COLORS[color]);
    ctx.fillRect(x + 2.5, y + 2.5, w - 5, h - 5);
  }
  ctx.restore();

  const cx = x + w / 2;
  const cy = y + h / 2;
  const ink = isWild(id) ? C_INK : CARD_DARK[color];
  const dark = isWild(id) ? C_INK : CARD_DARK[color];
  // Óvalo central (como las cartas de verdad, pero con esquinas de píxel).
  roundRect(ctx, cx - w / 2 + 5, cy - 15, w - 10, 30, 10, C_CARD, dark, 1);
  const rank = rankOf(id);
  if (id === WILD4) {
    text(ctx, "+4", cx, cy + 0.5, ink, HUGE, "center", "middle");
    const sq = 3;
    for (let i = 0; i < 4; i++) {
      const px = i % 2 === 0 ? x + 7 : x + w - 7 - sq;
      const py = i < 2 ? y + 9 : y + h - 9 - sq;
      ctx.fillStyle = css(CARD_COLORS[i]);
      ctx.fillRect(px, py, sq, sq);
    }
  } else if (isWild(id)) {
    text(ctx, "COMODÍN", cx, cy, ink, "4px", "center", "middle");
  } else if (rank === SKIP) {
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.strokeStyle = css(ink);
    ctx.lineWidth = 2.6;
    ctx.stroke();
    line(ctx, cx - 5.5, cy + 5.5, cx + 5.5, cy - 5.5, ink, 2.6);
  } else if (rank === REVERSE) {
    // Dos flechas opuestas: el símbolo de la reversa.
    polygon(ctx, [[cx - 9, cy - 3], [cx - 1, cy - 9], [cx - 1, cy + 3]], ink);
    polygon(ctx, [[cx + 9, cy + 3], [cx + 1, cy + 9], [cx + 1, cy - 3]], ink);
    ctx.fillStyle = css(ink);
    ctx.fillRect(cx - 8, cy - 5, 6, 3);
    ctx.fillRect(cx + 2, cy + 2, 6, 3);
  } else if (rank === DRAW2) {
    text(ctx, "+2", cx, cy + 0.5, ink, HUGE, "center", "middle");
  } else {
    text(ctx, String(rank), cx, cy + 0.5, ink, HUGE, "center", "middle");
  }

  // Esquinas: la etiqueta corta va en una pastilla clara para que se lea en cualquier color.
  const corner = rankShort(id);
  const chip = (cx0: number, cy0: number) => {
    roundRect(ctx, cx0, cy0, corner.length > 1 ? 11 : 7, 8, 2, C_CARD, dark, 0.8);
    text(ctx, corner, cx0 + (corner.length > 1 ? 5.5 : 3.5), cy0 + 4.2, dark, "5px", "center", "middle");
  };
  chip(x + 3, y + 2.5);
  chip(x + w - (corner.length > 1 ? 14 : 10), y + h - 10.5);
  if (dim) {
    ctx.fillStyle = "rgba(12,8,14,0.55)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, CARD_R);
    ctx.fill();
  }
}

/** Dorso: ciruela con marco dorado, rayas y la «M» del mazo. */
function drawCardBack(ctx: Ctx, r: Rect): void {
  const { x, y, w, h } = r;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x + 2, y + 2, w, h);
  roundRect(ctx, x, y, w, h, CARD_R, [52, 22, 58], C_GOLD, 1);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 3, w - 6, h - 6, CARD_R - 1);
  ctx.clip();
  for (let i = -h; i < w; i += 7) line(ctx, x + i, y + h, x + i + h, y, [78, 34, 84], 1);
  ctx.restore();
  roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 3, undefined, [255, 214, 150], 1);
  text(ctx, "M", x + w / 2, y + h / 2, C_GOLD, BIG, "center", "middle");
}

/** Fondo: ciruela, fieltro ovalado con costura y un destello de luz en el centro. */
function drawTable(ctx: Ctx): void {
  ctx.fillStyle = css(C_DEALER);
  ctx.fillRect(0, 0, CW, CH);
  // Luz de sala: dos bandas claras muy suaves.
  ctx.fillStyle = "rgba(255,190,120,0.05)";
  ctx.fillRect(0, HUD_H, CW, 70);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, CH - 78, CW, 78);
  const fx = 14;
  const fy = HUD_H + 40;
  const fw = CW - 28;
  const fh = 118;
  fillEllipse(ctx, fx, fy, fw, fh, C_FELT);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(fx + fw / 2, fy + fh / 2, fw / 2 - 3, fh / 2 - 3, 0, 0, Math.PI * 2);
  ctx.strokeStyle = css(C_FELT_LINE, 0.75);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(0, fy + fh - 2, CW, 6);
}

export class CardsRenderer {
  private mv = -1;
  private toastT = 9;
  private popT = 9;
  private flashT = 9;
  private flashSeat = -1;
  private lastMsg = "";
  private dt = 1 / 60;
  private stage: CardsStage | null | undefined;

  update(dt: number): void {
    this.dt = dt;
    this.toastT += dt;
    this.popT += dt;
    this.flashT += dt;
  }

  draw(ctx: Ctx, v: CardsView, pixelScale = 1): void {
    const s = v.s;
    // Cambio de estado: aviso, golpe de la carta nueva y destello del castigado.
    if (s.mv !== this.mv) {
      this.mv = s.mv;
      this.popT = 0;
      if (s.ms && s.ms !== this.lastMsg) {
        this.lastMsg = s.ms;
        this.toastT = 0;
      }
      if (s.to >= 0) {
        this.flashSeat = s.to;
        this.flashT = 0;
      }
    }
    if (this.stage === undefined) this.stage = glRenderer() ? new CardsStage() : null;
    const stage = this.stage;
    if (stage) {
      stage.update({ s, me: v.me, hover: v.hover, picking: v.picking }, Math.min(this.dt, 0.05));
      renderInto(ctx, stage.scene, stage.camera, CW, CH, pixelScale, 1.2);
      this.drawHud(ctx, v);
      this.drawSeatLabels(ctx, v, stage);
      this.drawButtons(ctx, v);
      this.drawUnoCall(ctx, v);
    } else {
      drawTable(ctx);
      this.drawHud(ctx, v);
      this.drawPanels(ctx, v);
      this.drawPiles(ctx, v);
      this.drawMiddle(ctx, v);
      this.drawButtons(ctx, v);
      this.drawHand(ctx, v);
    }
    if (v.picking) this.drawPicker(ctx, v);
    this.drawToast(ctx, v);
    if (s.ph === 1) this.drawRoundOver(ctx, v);
    if (s.ph === 2) this.drawMatchOver(ctx, v);
    this.drawFooter(ctx, v);
  }

  // --- Arriba ------------------------------------------------------------------------------------
  private drawHud(ctx: Ctx, v: CardsView): void {
    const s = v.s;
    ctx.fillStyle = "rgba(34,16,40,0.92)";
    ctx.fillRect(0, 0, CW, HUD_H);
    ctx.fillStyle = "rgba(255,138,36,0.9)";
    ctx.fillRect(0, HUD_H, CW, 1);
    // Adorno de la izquierda: tres cartas en miniatura.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = css(CARD_COLORS[i]);
      ctx.fillRect(5 + i * 3, 4 - (i === 0 ? 0 : 1), 3, 9);
    }
    shadowText(ctx, "MAZO LOCO", 17, 3, C_GOLD, MID, "left");
    text(ctx, `· RONDA ${s.rd}`, 17 + 58, 6, C_DIM, SMALL, "left");
    const miTurno = v.me === s.tu && s.ph === 0;
    const turno = miTurno ? "TU TURNO" : s.ph === 0 ? `JUEGA ${(v.names[s.tu] ?? `J${s.tu + 1}`).toUpperCase()}` : "";
    if (turno) text(ctx, fitText(ctx, turno, 120, SMALL), CW / 2, 5, miTurno ? C_ACCENT : C_DIM, SMALL, "center");
    // Mi marcador, en su pastilla como los rivales.
    const mine = seatHand(s, v.me).length;
    const label = `TÚ · ${s.gl[v.me] ?? 0} PTS · ${mine} CARTAS`;
    const w = textWidth(ctx, label, SMALL) + 10;
    panel(ctx, CW - w - 3, 1, w, HUD_H - 3, C_ACCENT, 0.85, C_PANEL);
    text(ctx, label, CW - 8, 5, C_TEXT, SMALL, "right");
  }

  private drawPanels(ctx: Ctx, v: CardsView): void {
    const s = v.s;
    const others = s.on.map((_, i) => i).filter((i) => i !== v.me);
    others.forEach((seat, slot) => {
      const r = panelRect(slot, others.length);
      const turn = s.ph === 0 && s.tu === seat;
      const flash = this.flashSeat === seat && this.flashT < 0.7;
      const border = flash ? C_LOSE : turn ? C_GOLD : C_MUTE;
      panel(ctx, r.x, r.y, r.w, r.h, border, 0.85, C_PANEL);
      if (flash) {
        ctx.fillStyle = `rgba(255,86,96,${0.35 * (1 - this.flashT / 0.7)})`;
        ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
      const name = fitText(ctx, v.names[seat] ?? `J${seat + 1}`, r.w - 10, SMALL);
      text(ctx, name, r.x + 4, r.y + 3, turn ? C_GOLD : C_TEXT, SMALL, "left");
      // Mini dorso + «7 CARTAS» y el marcador a la derecha.
      drawCardBack(ctx, { x: r.x + 4, y: r.y + 12, w: 9, h: 12 });
      text(ctx, `${seatHand(s, seat).length} CARTAS`, r.x + 16, r.y + 13, C_TEXT, TINY, "left");
      text(ctx, `${s.gl[seat] ?? 0} PTS`, r.x + r.w - 4, r.y + 13, C_DIM, TINY, "right");
      if ((s.bo[seat] ?? 0) === 1) text(ctx, "BOT", r.x + 4, r.y + r.h - 8, C_LINE, TINY, "left");
      if (seatHand(s, seat).length === 1) {
        const w = 22;
        roundRect(ctx, r.x + r.w / 2 - w / 2, r.y + r.h - 10, w, 9, 2, C_LOSE, [255, 190, 190], 1);
        text(ctx, "¡UNO!", r.x + r.w / 2, r.y + r.h - 5.5, C_TEXT, TINY, "center", "middle");
      }
      if (turn && s.ph === 0) polygon(ctx, [[r.x + r.w - 3, r.y + 3], [r.x + r.w - 9, r.y + 3], [r.x + r.w - 3, r.y + 9]], C_GOLD);
      if (unoPending(s, seat)) text(ctx, "¡DILO!", r.x + 16, r.y + r.h - 8, C_ACCENT, TINY, "left");
    });
  }

  // --- Mesa -------------------------------------------------------------------------------------
  private drawPiles(ctx: Ctx, v: CardsView): void {
    const s = v.s;
    const cw = CARD_W;
    const ch = CARD_H;
    // Mazo.
    const dx = DECK_AT.x - cw / 2;
    const dy = DECK_AT.y - ch / 2;
    for (let i = 2; i >= 0; i--) drawCardBack(ctx, { x: dx + i * 1.5, y: dy - i * 1.5, w: cw, h: ch });
    if (s.dp <= 0) {
      roundRect(ctx, dx, dy, cw, ch, CARD_R, undefined, C_MUTE, 1);
      text(ctx, "VACÍO", DECK_AT.x, DECK_AT.y, C_DIM, TINY, "center", "middle");
    }
    text(ctx, `MAZO ${s.dp}`, DECK_AT.x, dy + ch + 5, C_TEXT, TINY, "center");

    // Descarte: la de arriba crece un pelín al llegar.
    const px = DISCARD_AT.x - cw / 2;
    const py = DISCARD_AT.y - ch / 2;
    const pop = Math.max(0, 1 - this.popT / 0.18);
    roundRect(ctx, px - 1.5, py - 1.5, cw + 3, ch + 3, CARD_R + 1, undefined, mix(CARD_COLORS[s.co], [255, 255, 255], 0.25), 1.5);
    drawCardFace(ctx, { x: px, y: py, w: cw, h: ch }, s.tp, false);
    if (pop > 0) {
      ctx.save();
      ctx.globalAlpha = pop * 0.8;
      ctx.strokeStyle = css(C_GOLD);
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 2 - pop * 3, py - 2 - pop * 3, cw + 4 + pop * 6, ch + 4 + pop * 6);
      ctx.restore();
    }
    text(ctx, "DESCARTE", DISCARD_AT.x, py + ch + 5, C_TEXT, TINY, "center");
  }

  private drawMiddle(ctx: Ctx, v: CardsView): void {
    const s = v.s;
    const cx = MID_AT.x;
    const cy = MID_AT.y;
    const color = CARD_COLORS[s.co] ?? CARD_COLORS[0];
    // Sentido de juego: la flecha hacia la que va la ronda va encendida.
    text(ctx, "←", cx - 25, cy, s.dr < 0 ? C_GOLD : mix(C_MUTE, C_DIM, 0.7), MID, "center", "middle");
    text(ctx, "→", cx + 25, cy, s.dr > 0 ? C_GOLD : mix(C_MUTE, C_DIM, 0.7), MID, "center", "middle");
    polygon(ctx, [[cx, cy - 15], [cx + 15, cy], [cx, cy + 15], [cx - 15, cy]], shade(color, 0.55), [12, 8, 14], 2);
    polygon(ctx, [[cx, cy - 11], [cx + 11, cy], [cx, cy + 11], [cx - 11, cy]], color);
    text(ctx, COLOR_NAMES[s.co] ?? "—", cx, cy + 21, C_TEXT, TINY, "center");
  }

  private drawButtons(ctx: Ctx, v: CardsView): void {
    const ids = v.buttons;
    for (const { id, r } of actionRects(ids)) {
      const on = this.buttonOn(id, v);
      const accent = id === "draw" ? C_GOLD : id === "pass" ? [150, 176, 210] as RGB : id === "uno" ? C_LOSE : C_WIN;
      const label = id === "draw" ? "ROBAR (D)" : id === "pass" ? "PASAR (P)" : id === "uno" ? "¡UNO! (U)" : "OTRA RONDA";
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(r.x + 2, r.y + 2, r.w, r.h);
      roundRect(ctx, r.x, r.y, r.w, r.h, 3, on ? shade(accent, 0.38) : [44, 32, 42], on ? accent : C_MUTE, 1);
      if (on) {
        ctx.fillStyle = css(mix(accent, [255, 255, 255], 0.45), 0.5);
        ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 2);
      }
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 0.5, on ? C_TEXT : C_MUTE, SMALL, "center", "middle");
    }
  }

  private buttonOn(id: BtnId, v: CardsView): boolean {
    const s = v.s;
    if (id === "next") return true;
    if (!canAct(s, v.me) || v.picking) return false;
    if (id === "draw") return s.dw[v.me] !== 1;
    if (id === "pass") return s.dw[v.me] === 1;
    return seatHand(s, v.me).length === 1 && s.un[v.me] === 0;
  }

  private drawHand(ctx: Ctx, v: CardsView): void {
    const s = v.s;
    const hand = seatHand(s, v.me);
    const poses = handPoses(hand.length);
    const myTurn = canAct(s, v.me);
    for (let i = 0; i < hand.length; i++) {
      const base = { x: Math.round(poses[i].x - CARD_W / 2), y: Math.round(poses[i].y - CARD_H / 2), w: CARD_W, h: CARD_H };
      const isHover = i === v.hover && !v.picking;
      const r = { x: base.x, y: base.y - (isHover ? HAND_LIFT : 0), w: base.w, h: base.h };
      const playable = myTurn && canPlay(hand[i], s.tp, s.co);
      if (playable) {
        const pulse = 0.55 + 0.35 * Math.sin(performance.now() / 260);
        roundRect(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, CARD_R + 2, undefined, mix(C_GOLD, [255, 255, 255], pulse * 0.4), 1);
      }
      drawCardFace(ctx, r, hand[i], !playable);
      if (isHover) {
        ctx.save();
        ctx.strokeStyle = css(C_TEXT);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, CARD_R + 1);
        ctx.stroke();
        ctx.restore();
      }
    }
    this.drawUnoCall(ctx, v);
  }

  private drawUnoCall(ctx: Ctx, v: CardsView): void {
    if (!unoPending(v.s, v.me)) return;
    const blink = Math.sin(performance.now() / 120) > 0;
    const label = `¡PULSA U! ${Math.ceil((v.s.ut[v.me] ?? 0) / 10)}`;
    text(ctx, label, CW / 2, HAND_Y - 16, blink ? C_LOSE : C_TEXT, MID, "center");
  }

  /** Carteles sobre las cabezas de los rivales: nombre, cartas, puntos y el aviso de UNO. */
  private drawSeatLabels(ctx: Ctx, v: CardsView, stage: CardsStage): void {
    const s = v.s;
    for (let seat = 0; seat < s.on.length; seat++) {
      if (seat === v.me) continue;
      const at = stage.seatLabel(seat);
      if (!at) continue;
      const turn = s.ph === 0 && s.tu === seat;
      const flash = this.flashSeat === seat && this.flashT < 0.7;
      const n = seatHand(s, seat).length;
      const w = 70;
      const h = 21;
      const x = Math.max(3, Math.min(CW - w - 3, at[0] - w / 2));
      const y = Math.max(HUD_H + 10, at[1] - h);
      panel(ctx, x, y, w, h, flash ? C_LOSE : turn ? C_GOLD : C_MUTE, 0.88, C_PANEL);
      text(ctx, fitText(ctx, v.names[seat] ?? `J${seat + 1}`, w - 8, SMALL), x + w / 2, y + 3, turn ? C_GOLD : C_TEXT, SMALL, "center");
      text(ctx, `${n} CARTAS · ${s.gl[seat] ?? 0} PTS`, x + w / 2, y + 12, C_DIM, TINY, "center");
      if (n === 1) {
        roundRect(ctx, x + w / 2 - 12, y - 9, 24, 9, 2, C_LOSE, [255, 190, 190], 1);
        text(ctx, "¡UNO!", x + w / 2, y - 4.5, C_TEXT, TINY, "center", "middle");
      }
      if (unoPending(s, seat)) text(ctx, "¡DILO!", x + w + 2, y + 6, C_ACCENT, TINY, "left");
    }
  }

  private drawPicker(ctx: Ctx, v: CardsView): void {
    panel(ctx, PICK_PANEL.x, PICK_PANEL.y, PICK_PANEL.w, PICK_PANEL.h, C_GOLD, 0.94, C_PANEL);
    text(ctx, "ELIGE EL COLOR", CW / 2, PICK_PANEL.y + 5, C_GOLD, SMALL, "center");
    colorRects().forEach((r, i) => {
      const on = v.pickHover === i;
      const c = CARD_COLORS[i];
      roundRect(ctx, r.x, r.y, r.w, r.h, 3, on ? mix(c, [255, 255, 255], 0.25) : c, on ? C_TEXT : shade(c, 0.5), on ? 2 : 1);
      // En el amarillo el texto claro no se lee: va en tinta oscura.
      text(ctx, COLOR_NAMES[i], r.x + r.w / 2, r.y + r.h - 8, i === 1 ? C_INK : C_CARD, TINY, "center");
    });
    text(ctx, "CLIC O TECLAS 1-4 · ESC CANCELA", CW / 2, PICK_PANEL.y + PICK_PANEL.h - 12, C_DIM, TINY, "center");
  }

  // --- Carteles ---------------------------------------------------------------------------------
  private drawToast(ctx: Ctx, v: CardsView): void {
    const s = v.s;
    if (!s.ms || this.toastT > 2.2) return;
    const alpha = this.toastT < 1.5 ? 1 : 1 - (this.toastT - 1.5) / 0.7;
    const label = s.ms;
    const w = Math.min(CW - 24, textWidth(ctx, label, SMALL) + 16);
    ctx.save();
    ctx.globalAlpha = alpha;
    panel(ctx, CW / 2 - w / 2, HUD_H + 80, w, 15, C_ACCENT, 0.9, C_PANEL);
    text(ctx, label, CW / 2, HUD_H + 87, C_TEXT, SMALL, "center", "middle");
    ctx.restore();
  }

  private drawRoundOver(ctx: Ctx, v: CardsView): void {
    const s = v.s;
    const w = 236;
    const h = 98;
    const x = (CW - w) / 2;
    const y = 74;
    panel(ctx, x, y, w, h, C_GOLD, 0.98, C_PANEL);
    titleText(ctx, `RONDA ${s.rd}`, CW / 2, y + 6, C_GOLD, BIG);
    const winner = v.names[s.wn] ?? `J${s.wn + 1}`;
    text(ctx, `GANA ${winner.toUpperCase()}`, CW / 2, y + 26, C_WIN, MID, "center");
    // Marcador en dos columnas.
    const colW = (w - 24) / 2;
    for (let i = 0; i < s.gl.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const px = x + 12 + col * colW;
      const py = y + 42 + row * 12;
      badge(ctx, px + 5, py + 4, 5, seatColor(i), String(i + 1));
      text(ctx, fitText(ctx, i === v.me ? `${v.names[i] ?? `J${i + 1}`} · TÚ` : v.names[i] ?? `J${i + 1}`, colW - 40, SMALL), px + 14, py, i === s.wn ? C_GOLD : C_TEXT, SMALL);
      text(ctx, String(s.gl[i]), px + colW - 8, py, i === s.wn ? C_GOLD : C_DIM, SMALL, "right");
    }
    const left = Math.max(0, Math.ceil(s.bt / 10));
    text(ctx, `SIGUIENTE RONDA EN ${left}`, CW / 2, y + h - 13, C_DIM, TINY, "center");
  }

  private drawMatchOver(ctx: Ctx, v: CardsView): void {
    const s = v.s;
    const w = 250;
    const h = 112;
    const x = (CW - w) / 2;
    const y = 70;
    panel(ctx, x, y, w, h, C_GOLD, 0.98, [26, 14, 32]);
    titleText(ctx, "FIN DE LA PARTIDA", CW / 2, y + 6, C_GOLD, BIG);
    const winner = v.names[s.wn] ?? `J${s.wn + 1}`;
    text(ctx, `¡GANA ${winner.toUpperCase()}!`, CW / 2, y + 26, C_WIN, MID, "center");
    for (let i = 0; i < s.gl.length; i++) {
      const py = y + 42 + i * 12;
      const name = i === v.me ? `${v.names[i] ?? `J${i + 1}`} · TÚ` : v.names[i] ?? `J${i + 1}`;
      badge(ctx, x + 17, py + 4, 5, seatColor(i), String(i + 1));
      text(ctx, fitText(ctx, name, w - 60, SMALL), x + 26, py, i === s.wn ? C_GOLD : C_TEXT, SMALL);
      text(ctx, `${s.gl[i]} PTS`, x + w - 12, py, i === s.wn ? C_GOLD : C_DIM, SMALL, "right");
    }
  }

  private drawFooter(ctx: Ctx, v: CardsView): void {
    ctx.fillStyle = "rgba(10,4,14,0.78)";
    ctx.fillRect(0, FOOT_Y - 4, CW, CH - FOOT_Y + 4);
    if (v.footer) text(ctx, fitText(ctx, v.footer, CW - 12, SMALL), CW / 2, FOOT_Y - 1, C_DIM, SMALL, "center");
    if (v.netLabel) text(ctx, v.netLabel, CW - 4, FOOT_Y + 6, C_MUTE, TINY, "right");
    ctx.fillStyle = css(C_LINE, 0.25);
    ctx.fillRect(0, FOOT_Y - 4, CW, 1);
  }
}
