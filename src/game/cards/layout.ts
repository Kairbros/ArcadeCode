// Geometría de la mesa de «Mazo Loco», compartida por el dibujo y el ratón (una sola fuente de verdad
// para que lo que se ve y lo que se puede pulsar coincidan).
import { CARD_H, CARD_W, CH, CW, HUD_H } from "./config";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mazo (boca abajo) y descarte: centros de cada pila. */
export const DECK_AT = { x: 104, y: 100 };
export const DISCARD_AT = { x: 256, y: 100 };
/** Centro de la mesa entre las dos pilas (color activo y sentido). */
export const MID_AT = { x: 180, y: 100 };

/** Franja del HUD. */
export const HUD: Rect = { x: 0, y: 0, w: CW, h: HUD_H };

/** Fila de cartas de la mano. */
export const HAND_Y = 160;
export const HAND_LIFT = 14;
/** Pie con las teclas. */
export const FOOT_Y = CH - 12;

/** Panel de un rival: se reparten en la franja de arriba. */
export function panelRect(slot: number, total: number): Rect {
  const gap = 6;
  const w = Math.floor((CW - 8 - gap * (total - 1)) / total);
  return { x: 4 + slot * (w + gap), y: HUD_H + 4, w, h: 26 };
}

/** Botones de acción, centrados. Las claves son las que usa el ratón. */
export type BtnId = "draw" | "pass" | "uno" | "next";
export const BTN_H = 18;
const BTN_W: Record<BtnId, number> = { draw: 86, pass: 70, uno: 66, next: 128 };

export function actionRects(ids: BtnId[]): { id: BtnId; r: Rect }[] {
  const gap = 7;
  const total = ids.reduce((a, id) => a + BTN_W[id], 0) + gap * (ids.length - 1);
  let x = Math.round((CW - total) / 2);
  return ids.map((id) => {
    const r = { x, y: 122, w: BTN_W[id], h: BTN_H };
    x += r.w + gap;
    return { id, r };
  });
}

/** Los cuatro colores del comodín, para elegir con el ratón (mismo sitio en el que se dibujan). */
export const PICK_PANEL: Rect = { x: CW / 2 - 96, y: HAND_Y - 66, w: 192, h: 56 };

export function colorRects(): Rect[] {
  const w = 34;
  const gap = 8;
  const x0 = Math.round((CW - (w * 4 + gap * 3)) / 2);
  return [0, 1, 2, 3].map((i) => ({ x: x0 + i * (w + gap), y: PICK_PANEL.y + 22, w, h: 24 }));
}

/** Pose de una carta de la mano (centro en el lienzo y giro en radianes): abanico suave, más caído en los extremos. */
export interface HandPose {
  x: number;
  y: number;
  rot: number;
}

export function handPoses(n: number): HandPose[] {
  if (n <= 0) return [];
  const step = Math.min(CARD_W + 6, (CW - 36 - CARD_W) / Math.max(1, n - 1));
  const rotStep = Math.min(0.075, 0.5 / Math.max(1, n - 1));
  return Array.from({ length: n }, (_, i) => {
    const k = i - (n - 1) / 2;
    const dx = k * step;
    const arc = (dx / (CW / 2)) ** 2 * 10;
    return { x: CW / 2 + dx, y: HAND_Y + CARD_H / 2 + arc, rot: k * rotStep };
  });
}

/** Rectángulo (caja) de cada carta de la mano, sin el levantamiento del ratón. */
export function handRects(n: number): Rect[] {
  return handPoses(n).map((p) => {
    const c = Math.abs(Math.cos(p.rot));
    const s = Math.abs(Math.sin(p.rot));
    const w = CARD_W * c + CARD_H * s;
    const h = CARD_W * s + CARD_H * c;
    return { x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), w: Math.round(w), h: Math.round(h) };
  });
}

/** Carta de la mano bajo el punto (la de más arriba): usa la carta girada de verdad, no su caja. */
export function hitHand(n: number, x: number, y: number): number {
  const poses = handPoses(n);
  for (let i = poses.length - 1; i >= 0; i--) {
    const p = poses[i];
    const dx = x - p.x;
    const dy = y - p.y;
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    if (Math.abs(lx) <= CARD_W / 2 && Math.abs(ly) <= CARD_H / 2) return i;
  }
  return -1;
}

/** Índice del rectángulo que contiene el punto (-1 si ninguno). */
export function hitRect(rects: readonly Rect[], x: number, y: number): number {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

/** Punto del panel de un asiento (para animar de dónde sale cada carta). */
export function panelCenter(slot: number, total: number): { x: number; y: number } {
  const r = panelRect(slot, total);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
