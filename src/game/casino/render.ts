// Render de Casino de deudas: la sala vista desde arriba (pared con el prestamista, moqueta, máquinas y
// jugadores ordenados por profundidad), el HUD del banco y la cuota, y un panel grande con la máquina
// que tienes delante (rodillos, moneda o dados).
import { PLAYER_COLORS, PLAYER_NAMES, type RGB } from "../core/config";
import { badge, css, fillCircle, fitText, panel, segmentBar, shade, shadowText, text, titleText, type Ctx } from "../core/draw";
import { CH, COIN, CW, DAY_TIME, DICE, FLOOR_Y, HUD_H, MACHINES, SLOT, type MachineKind } from "./config";
import { PH_COLLECT, PH_DAY, PH_INTRO, PH_OVER, PH_PAID, machineAt } from "./floor";

export interface GamblerSprite {
  index: number;
  x: number;
  y: number;
  face: number;
  moving: boolean;
  present: boolean;
}

export interface MachineSprite {
  kind: MachineKind;
  x: number;
  y: number;
  user: number;
  t: number;
  pay: number;
  res: number[];
}

/** Todo lo necesario para dibujar un frame. */
export interface CasinoView {
  phase: number;
  timer: number;
  day: number;
  quota: number;
  bank: number;
  won: number;
  paidTotal: number;
  gamblers: GamblerSprite[];
  machines: readonly MachineSprite[];
  me: number;
  time: number;
  netLabel: string;
  footer: string;
}

const TINY = "6px";
const SMALL = "8px";
const WHITE: RGB = [235, 235, 245];
const GOLD: RGB = [255, 210, 70];
const GREEN: RGB = [110, 230, 110];
const RED: RGB = [255, 95, 85];
/** Color de cada símbolo de la tragaperras (para la pantallita de las máquinas). */
const SYMBOL_COLOR: RGB[] = [[220, 40, 60], [250, 230, 60], [255, 180, 40], [40, 40, 50], [235, 50, 50]];
/** Momento en que se para cada rodillo, como fracción de la jugada. */
const REEL_STOP = [0.45, 0.72, 1];

const money = (n: number) => `$${Math.round(n)}`;

/** Pared, mostrador y moqueta: no cambian, se dibujan una vez. */
let room: HTMLCanvasElement | null = null;
function roomCanvas(): HTMLCanvasElement {
  if (room) return room;
  room = document.createElement("canvas");
  room.width = CW;
  room.height = CH;
  const g = room.getContext("2d")!;
  // Moqueta roja con rombos dorados.
  g.fillStyle = "#5a1420";
  g.fillRect(0, FLOOR_Y, CW, CH - FLOOR_Y);
  for (let y = FLOOR_Y; y < CH; y += 10) {
    for (let x = ((y - FLOOR_Y) / 10) % 2 ? 5 : 0; x < CW; x += 10) {
      g.fillStyle = "#6e1a28";
      g.fillRect(x + 3, y + 3, 4, 4);
      g.fillStyle = "#a07a30";
      g.fillRect(x + 4, y + 4, 2, 2);
    }
  }
  // Pared con papel a rayas y zócalo.
  g.fillStyle = "#2a1838";
  g.fillRect(0, HUD_H, CW, FLOOR_Y - HUD_H);
  g.fillStyle = "#33204a";
  for (let x = 0; x < CW; x += 8) g.fillRect(x, HUD_H, 4, FLOOR_Y - HUD_H);
  g.fillStyle = "#140c1c";
  g.fillRect(0, FLOOR_Y - 3, CW, 3);
  // Mostrador del prestamista, en el centro de la pared.
  g.fillStyle = "#3a2414";
  g.fillRect(128, FLOOR_Y - 5, 64, 12);
  g.fillStyle = "#5c3a20";
  g.fillRect(128, FLOOR_Y - 5, 64, 2);
  g.fillStyle = "#1e120a";
  g.fillRect(128, FLOOR_Y + 7, 64, 1);
  return room;
}

export class CasinoRenderer {
  draw(ctx: Ctx, v: CasinoView) {
    ctx.drawImage(roomCanvas(), 0, 0);
    // Cartel luminoso encima del mostrador.
    const blink = Math.floor(v.time * 2) % 2 === 0;
    panel(ctx, 82, HUD_H + 6, 44, 10, blink ? GOLD : shade(GOLD, 0.6), 0.9);
    text(ctx, "PRÉSTAMOS", 104, HUD_H + 8.5, blink ? GOLD : shade(GOLD, 0.7), "5px", "center");
    this.drawShark(ctx, v);
    // Máquinas y jugadores, de atrás hacia delante.
    const items: { y: number; draw: () => void }[] = [];
    v.machines.forEach((m) => items.push({ y: m.y + MACHINES[m.kind].h, draw: () => this.drawMachine(ctx, m, v.time) }));
    for (const g of v.gamblers) if (g.present) items.push({ y: g.y, draw: () => this.drawGambler(ctx, g, v) });
    items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());
    v.machines.forEach((m) => this.drawPayout(ctx, m));

    this.drawHud(ctx, v);
    this.drawFocus(ctx, v);
    if (v.netLabel) shadowText(ctx, v.netLabel, CW - 3, CH - 17, [200, 200, 220], TINY, "right");
    if (v.footer && v.phase !== PH_OVER) shadowText(ctx, v.footer, CW / 2, CH - 9, WHITE, TINY, "center");
    this.drawBanner(ctx, v);
  }

  // --- Sala ---

  /** El prestamista: traje oscuro, sombrero y gafas; extiende la mano cuando cobra. */
  private drawShark(ctx: Ctx, v: CasinoView) {
    const x = 160, y = FLOOR_Y - 5;
    ctx.fillStyle = "#1c1c24";
    ctx.fillRect(x - 8, y - 9, 16, 9); // hombros
    ctx.fillStyle = "#e8e8f0";
    ctx.fillRect(x - 1.5, y - 9, 3, 5); // camisa
    ctx.fillStyle = "#c02030";
    ctx.fillRect(x - 0.5, y - 8, 1, 4); // corbata
    ctx.fillStyle = "#d9a878";
    ctx.fillRect(x - 4, y - 16, 8, 7); // cara
    ctx.fillStyle = "#101014";
    ctx.fillRect(x - 3.5, y - 14, 7, 2); // gafas
    ctx.fillRect(x - 6, y - 17, 12, 1.5); // ala del sombrero
    ctx.fillRect(x - 4, y - 21, 8, 4); // copa
    ctx.fillStyle = "#802030";
    ctx.fillRect(x - 4, y - 18.5, 8, 1);
    if (v.phase === PH_COLLECT) {
      // Mano tendida sobre el mostrador.
      ctx.fillStyle = "#1c1c24";
      ctx.fillRect(x + 6, y - 4, 8, 3);
      ctx.fillStyle = "#d9a878";
      ctx.fillRect(x + 14, y - 5, 4, 4);
    }
  }

  private drawMachine(ctx: Ctx, m: MachineSprite, time: number) {
    const s = MACHINES[m.kind];
    const busy = m.user >= 0;
    const spinning = busy && m.t < s.dur;
    if (m.kind === SLOT) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(m.x + 1, m.y + s.h - 1, s.w, 3);
      ctx.fillStyle = "#4a2a7a";
      ctx.fillRect(m.x, m.y + 2, s.w, s.h - 2);
      ctx.fillStyle = "#6a40a8";
      ctx.fillRect(m.x + 1, m.y + 3, s.w - 2, 2);
      // Rótulo de arriba: parpadea mientras gira.
      const lit = spinning ? Math.floor(time * 10) % 2 === 0 : busy;
      ctx.fillStyle = lit ? "#ffe060" : "#b08a30";
      ctx.fillRect(m.x + 2, m.y, s.w - 4, 3);
      // Pantallita con los tres símbolos.
      ctx.fillStyle = "#101018";
      ctx.fillRect(m.x + 2, m.y + 6, s.w - 4, 6);
      for (let r = 0; r < 3; r++) {
        const sym = this.reelSymbol(m, r, time);
        ctx.fillStyle = css(SYMBOL_COLOR[sym]);
        if (sym === 3) ctx.fillStyle = "#c8c8d0";
        ctx.fillRect(m.x + 3 + r * 4, m.y + 7, 3, 4);
      }
      // Palanca.
      const pulled = spinning && m.t < 0.25;
      ctx.fillStyle = "#909098";
      ctx.fillRect(m.x + s.w, m.y + (pulled ? 9 : 4), 1.5, pulled ? 4 : 8);
      fillCircle(ctx, m.x + s.w + 0.75, m.y + (pulled ? 9 : 4), 1.6, [220, 40, 50]);
      ctx.fillStyle = "#2a1848";
      ctx.fillRect(m.x, m.y + s.h - 4, s.w, 4);
      return;
    }
    // Mesas: patas, borde de madera y tapete verde.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(m.x + 2, m.y + s.h - 1, s.w, 3);
    ctx.fillStyle = "#3a2414";
    ctx.fillRect(m.x + 2, m.y + s.h - 4, 2, 4);
    ctx.fillRect(m.x + s.w - 4, m.y + s.h - 4, 2, 4);
    ctx.fillStyle = "#6a4020";
    ctx.fillRect(m.x, m.y, s.w, s.h - 4);
    ctx.fillStyle = "#1f6a3a";
    ctx.fillRect(m.x + 2, m.y + 2, s.w - 4, s.h - 8);
    ctx.fillStyle = "#28804a";
    ctx.fillRect(m.x + 2, m.y + 2, s.w - 4, 1);
    const cx = m.x + s.w / 2, cy = m.y + (s.h - 4) / 2;
    if (m.kind === COIN) {
      // Moneda que gira (se estrecha) y cae en estrella o calavera.
      const k = spinning ? Math.abs(Math.cos(m.t * 18)) : 1;
      ctx.fillStyle = "#c89a20";
      ctx.fillRect(cx - 3 * k, cy - 3, 6 * k, 6);
      ctx.fillStyle = "#ffd850";
      ctx.fillRect(cx - 2.5 * k, cy - 2.5, 5 * k, 5);
      if (!spinning && busy) {
        ctx.fillStyle = m.res[0] === 1 ? "#a07010" : "#402010";
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
      }
    } else if (m.kind === DICE) {
      const [a, b] = this.diceFaces(m, time);
      this.drawDie(ctx, cx - 6, cy - 2.5, 5, a);
      this.drawDie(ctx, cx + 1, cy - 2.5, 5, b);
    }
  }

  /** "+$80" que sube sobre la máquina al acabar la jugada. */
  private drawPayout(ctx: Ctx, m: MachineSprite) {
    const s = MACHINES[m.kind];
    if (m.user < 0 || m.t < s.dur) return;
    const k = m.t - s.dur;
    const y = m.y - 4 - k * 14;
    if (m.pay > 0) shadowText(ctx, `+${money(m.pay)}`, m.x + s.w / 2, y, m.pay >= s.bet * 5 ? GOLD : GREEN, SMALL, "center");
    else shadowText(ctx, "NADA", m.x + s.w / 2, y, [170, 160, 170], TINY, "center");
  }

  private drawGambler(ctx: Ctx, g: GamblerSprite, v: CasinoView) {
    const color = PLAYER_COLORS[g.index];
    const step = g.moving ? Math.sin(v.time * 14 + g.index) : 0;
    const x = g.x, y = g.y;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x - 4, y - 1, 8, 2);
    // Piernas.
    ctx.fillStyle = "#202030";
    ctx.fillRect(x - 3, y - 5 + Math.max(0, step), 2, 4 - Math.max(0, step));
    ctx.fillRect(x + 1, y - 5 + Math.max(0, -step), 2, 4 - Math.max(0, -step));
    // Cuerpo y brazos.
    ctx.fillStyle = css(color);
    ctx.fillRect(x - 3.5, y - 11, 7, 6);
    ctx.fillStyle = css(shade(color, 0.7));
    ctx.fillRect(x - 4.5, y - 10 - step * 0.5, 1, 4);
    ctx.fillRect(x + 3.5, y - 10 + step * 0.5, 1, 4);
    // Cabeza mirando a su lado.
    ctx.fillStyle = "#e8b890";
    ctx.fillRect(x - 3, y - 16, 6, 5);
    ctx.fillStyle = "#3a2418";
    ctx.fillRect(x - 3, y - 17, 6, 2);
    ctx.fillStyle = "#101014";
    ctx.fillRect(x + (g.face > 0 ? 1 : -2), y - 14, 1, 1);
    // Número y nombre encima.
    badge(ctx, x, y - 21, 2.5, color, String(g.index + 1));
    if (v.gamblers.filter((o) => o.present).length > 1) {
      const name = fitText(ctx, PLAYER_NAMES[g.index], 50, TINY);
      shadowText(ctx, name, x, y - 30, g.index === v.me ? WHITE : [190, 190, 200], TINY, "center");
    }
  }

  // --- Símbolos ---

  /** Símbolo que se ve en el rodillo `r`: girando al azar hasta su momento de parar. */
  private reelSymbol(m: MachineSprite, r: number, time: number): number {
    if (m.user < 0 || !m.res.length) return [4, 2, 0][r];
    if (m.t >= MACHINES[SLOT].dur * REEL_STOP[r]) return m.res[r];
    return Math.floor(time * 20 + r * 7) % 5;
  }

  private diceFaces(m: MachineSprite, time: number): [number, number] {
    if (m.user < 0 || m.res.length < 2) return [5, 2];
    if (m.t >= MACHINES[DICE].dur * 0.8) return [m.res[0], m.res[1]];
    return [1 + (Math.floor(time * 15) % 6), 1 + (Math.floor(time * 13 + 3) % 6)];
  }

  private drawDie(ctx: Ctx, x: number, y: number, s: number, face: number) {
    ctx.fillStyle = "#c8c8d0";
    ctx.fillRect(x, y + s * 0.15, s, s);
    ctx.fillStyle = "#f4f4f8";
    ctx.fillRect(x, y, s, s * 0.9);
    const pip = (px: number, py: number) => {
      ctx.fillStyle = "#181820";
      ctx.fillRect(x + px * s - s * 0.09, y + py * s * 0.9 - s * 0.09, s * 0.18, s * 0.18);
    };
    const lo = 0.25, mid = 0.5, hi = 0.75;
    if (face % 2 === 1) pip(mid, mid);
    if (face >= 2) { pip(lo, lo); pip(hi, hi); }
    if (face >= 4) { pip(hi, lo); pip(lo, hi); }
    if (face === 6) { pip(lo, mid); pip(hi, mid); }
  }

  /** Símbolo grande de la tragaperras dentro de una casilla de `s` de lado. */
  private drawSymbol(ctx: Ctx, x: number, y: number, s: number, sym: number) {
    const cx = x + s / 2, cy = y + s / 2;
    if (sym === 0) {
      // Cereza: dos bolas con rabito.
      ctx.strokeStyle = "#40a040";
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18, cy + s * 0.1);
      ctx.lineTo(cx + s * 0.05, cy - s * 0.32);
      ctx.lineTo(cx + s * 0.2, cy + s * 0.1);
      ctx.stroke();
      fillCircle(ctx, cx - s * 0.18, cy + s * 0.18, s * 0.16, SYMBOL_COLOR[0]);
      fillCircle(ctx, cx + s * 0.2, cy + s * 0.18, s * 0.16, SYMBOL_COLOR[0]);
    } else if (sym === 1) {
      // Limón: óvalo con puntas.
      ctx.fillStyle = css(SYMBOL_COLOR[1]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 0.34, s * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - s * 0.42, cy - s * 0.04, s * 0.84, s * 0.08);
    } else if (sym === 2) {
      // Campana: trapecio con badajo.
      ctx.fillStyle = css(SYMBOL_COLOR[2]);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.12, cy - s * 0.32);
      ctx.lineTo(cx + s * 0.12, cy - s * 0.32);
      ctx.lineTo(cx + s * 0.34, cy + s * 0.22);
      ctx.lineTo(cx - s * 0.34, cy + s * 0.22);
      ctx.fill();
      fillCircle(ctx, cx, cy + s * 0.3, s * 0.08, [200, 130, 30]);
    } else if (sym === 3) {
      ctx.fillStyle = "#202028";
      ctx.fillRect(x + s * 0.1, cy - s * 0.2, s * 0.8, s * 0.4);
      text(ctx, "BAR", cx, cy, WHITE, `${s * 0.32}px`, "center", "middle");
    } else {
      titleText(ctx, "7", cx, cy, SYMBOL_COLOR[4], `${s * 0.7}px`, "center", "middle");
    }
  }

  // --- HUD y paneles ---

  private drawHud(ctx: Ctx, v: CasinoView) {
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, 0, CW, HUD_H);
    text(ctx, `DÍA ${v.day}`, 4, 3, GOLD, TINY);
    const enough = v.bank >= v.quota;
    text(ctx, `BANCO ${money(v.bank)}`, 40, 3, enough ? GREEN : WHITE, TINY);
    text(ctx, `CUOTA ${money(v.quota)}`, 120, 3, enough ? GREEN : RED, TINY);
    segmentBar(ctx, 186, 4, 70, 4, v.bank / v.quota, enough ? GREEN : GOLD, 14);
    const left = v.phase === PH_DAY ? Math.max(0, Math.ceil(v.timer)) : v.phase === PH_INTRO ? DAY_TIME : 0;
    const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    text(ctx, clock, CW - 4, 3, v.phase === PH_DAY && left <= 10 ? RED : WHITE, TINY, "right");
  }

  /** Panel grande con la máquina que estoy usando o tengo delante. */
  private drawFocus(ctx: Ctx, v: CasinoView) {
    const me = v.gamblers[v.me];
    if (!me?.present || v.phase === PH_OVER) return;
    let i = v.machines.findIndex((m) => m.user === v.me);
    if (i < 0) i = machineAt(v.machines, me.x, me.y);
    if (i < 0) return;
    const m = v.machines[i], s = MACHINES[m.kind];
    const w = 150, h = 56, x = (CW - w) / 2, y = CH - h - 14;
    panel(ctx, x, y, w, h, GOLD, 0.88);
    text(ctx, s.name.toUpperCase(), x + 4, y + 3, GOLD, TINY);
    text(ctx, `APUESTA ${money(s.bet)}`, x + w - 4, y + 3, WHITE, TINY, "right");
    const mine = m.user === v.me;
    const show = mine || m.user >= 0 ? m : { ...m, user: -1 };
    const box = 18, top = y + 11;
    if (m.kind === SLOT) {
      for (let r = 0; r < 3; r++) {
        const bx = x + w / 2 - box * 1.5 - 2 + r * (box + 2);
        ctx.fillStyle = "#f0ece0";
        ctx.fillRect(bx, top, box, box);
        this.drawSymbol(ctx, bx, top, box, this.reelSymbol(show, r, v.time));
      }
    } else if (m.kind === COIN) {
      const spinning = show.user >= 0 && show.t < s.dur;
      const k = spinning ? Math.abs(Math.cos(show.t * 18)) : 1;
      const cx = x + w / 2, cy = top + box / 2;
      ctx.fillStyle = "#c89a20";
      ctx.fillRect(cx - 9 * k, cy - 9, 18 * k, 18);
      ctx.fillStyle = "#ffd850";
      ctx.fillRect(cx - 8 * k, cy - 8, 16 * k, 16);
      if (!spinning && show.user >= 0) {
        if (show.res[0] === 1) text(ctx, "★", cx, cy, [150, 90, 10], "14px", "center", "middle");
        else this.drawSkull(ctx, cx, cy);
      }
    } else {
      const [a, b] = this.diceFaces(show, v.time);
      this.drawDie(ctx, x + w / 2 - box - 2, top, box, a);
      this.drawDie(ctx, x + w / 2 + 2, top, box, b);
    }
    // Pie: lo que pasa ahora o cómo jugar.
    let foot: string, color = WHITE;
    if (mine && m.t >= s.dur) [foot, color] = m.pay > 0 ? [`¡GANAS ${money(m.pay)}!`, GREEN] : ["NADA", [170, 160, 170]];
    else if (mine) foot = "...";
    else if (m.user >= 0) [foot, color] = ["OCUPADA", [170, 160, 170]];
    else if (v.phase !== PH_DAY) [foot, color] = ["AÚN NO SE PUEDE JUGAR", [170, 160, 170]];
    else if (v.bank < s.bet) [foot, color] = ["NO HAY DINERO PARA APOSTAR", RED];
    else [foot, color] = [`ESPACIO: JUGAR ${money(s.bet)}`, WHITE];
    text(ctx, fitText(ctx, s.rules, w - 8, TINY), x + w / 2, y + h - 17, [170, 160, 190], TINY, "center");
    text(ctx, fitText(ctx, foot, w - 8, TINY), x + w / 2, y + h - 9, color, TINY, "center");
  }

  private drawSkull(ctx: Ctx, cx: number, cy: number) {
    ctx.fillStyle = "#402818";
    ctx.fillRect(cx - 5, cy - 6, 10, 8);
    ctx.fillRect(cx - 3, cy + 2, 6, 3);
    ctx.fillStyle = "#ffd850";
    ctx.fillRect(cx - 4, cy - 3, 3, 3);
    ctx.fillRect(cx + 1, cy - 3, 3, 3);
    ctx.fillRect(cx - 1, cy + 3, 1, 2);
    ctx.fillRect(cx + 1, cy + 3, 1, 2);
  }

  /** Carteles de fase: el día, el cobro, cuota pagada y el final. */
  private drawBanner(ctx: Ctx, v: CasinoView) {
    if (v.phase === PH_INTRO) {
      titleText(ctx, `DÍA ${v.day}`, CW / 2, 62, GOLD, "24px");
      shadowText(ctx, `EL PRESTAMISTA QUIERE ${money(v.quota)} AL CERRAR`, CW / 2, 92, WHITE, SMALL, "center");
    } else if (v.phase === PH_DAY && v.timer > DAY_TIME - 0.8) {
      titleText(ctx, "¡A JUGAR!", CW / 2, 70, GREEN, "18px");
    } else if (v.phase === PH_COLLECT) {
      panel(ctx, 70, 66, 180, 34, GOLD, 0.9);
      text(ctx, "CIERRE: EL PRESTAMISTA COBRA", CW / 2, 71, GOLD, SMALL, "center");
      text(ctx, `${money(v.bank)} EN EL BANCO · CUOTA ${money(v.quota)}`, CW / 2, 85, v.bank >= v.quota ? GREEN : RED, TINY, "center");
    } else if (v.phase === PH_PAID) {
      titleText(ctx, "¡CUOTA PAGADA!", CW / 2, 66, GREEN, "18px");
      shadowText(ctx, `QUEDAN ${money(v.bank)} PARA MAÑANA`, CW / 2, 92, WHITE, SMALL, "center");
    } else if (v.phase === PH_OVER) {
      const w = 200, h = 82, x = (CW - w) / 2, y = 52;
      panel(ctx, x, y, w, h, [255, 61, 139], 0.92);
      titleText(ctx, "¡NO LLEGASTEIS!", CW / 2, y + 6, RED, "14px");
      text(ctx, `DÍAS PAGADOS: ${v.day - 1}`, CW / 2, y + 28, WHITE, SMALL, "center");
      text(ctx, `PAGADO AL PRESTAMISTA ${money(v.paidTotal)}`, CW / 2, y + 42, GOLD, TINY, "center");
      text(ctx, `GANADO EN PREMIOS ${money(v.won)}`, CW / 2, y + 52, GREEN, TINY, "center");
      const lit = Math.floor(v.time * 2) % 2 === 0;
      text(ctx, fitText(ctx, v.footer, w - 10, TINY), CW / 2, y + h - 11, lit ? [255, 236, 190] : [140, 130, 105], TINY, "center");
    }
  }
}
