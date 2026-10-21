// Estado de la mesa que reparte el anfitrión. Lo usan igual el anfitrión (para dibujar) y los
// invitados: no incluye el orden de los cartuchos, solo lo que cada jugador sabe.
import { PLAYER_NAMES } from "../core/config";
import { I_ADRENALINE, I_CUFFS, I_SAW, PH_TURN } from "./config";

export interface RuletaSnap {
  g: "ruleta";
  base: -1;
  seq: number;
  ph: number; // fase
  pt: number; // tiempo en la fase
  rd: number; // ronda (0..2)
  tu: number; // turno
  bz: number; // 1 = animando una acción (no se puede actuar)
  /** Por asiento: vidas, máximo, ¿fuera?, esposas (0/1/2), rondas ganadas, ¿bot? */
  p: number[][];
  it: number[][]; // objetos de cada asiento
  ld: number[]; // reales y de fogueo de la carga actual
  sw: number; // sierra puesta
  ev: number[]; // último evento (ver config)
  et: number; // tiempo desde el evento
  /** Por asiento: pares [posición desde la recámara (1 = recámara), ¿real?] de lo que sabe. */
  kn: number[][];
  ak: number[]; // última acción procesada de cada asiento
  rw: number; // ganador de la ronda (-1 si nadie)
  dl: number; // asiento del crupier (-1 si no hay)
}

export const P_LIVES = 0;
export const P_MAX = 1;
export const P_OUT = 2;
export const P_CUFF = 3;
export const P_WINS = 4;
export const P_AI = 5;

export const isOut = (s: RuletaSnap, i: number) => s.p[i][P_OUT] === 1;

export function seatName(s: RuletaSnap, i: number): string {
  if (i === s.dl) return "Crupier";
  return s.p[i][P_AI] ? `CPU ${i + 1}` : PLAYER_NAMES[i];
}

/** Es el turno de `me` y la mesa espera su acción. */
export function canAct(s: RuletaSnap, me: number): boolean {
  return s.ph === PH_TURN && s.tu === me && !s.bz && !isOut(s, me);
}

/** Se puede usar `item` (propio o robado) contra `target`, según lo que se ve en la mesa. */
export function usable(s: RuletaSnap, item: number, target: number): boolean {
  if (item === I_SAW) return !s.sw;
  if (item === I_CUFFS) return target >= 0 && !isOut(s, target) && s.p[target][P_CUFF] === 0;
  return true;
}

/** Objetos que se le pueden robar a `victim` con la adrenalina. */
export function stealable(s: RuletaSnap, victim: number): number[] {
  return s.it[victim].flatMap((item, slot) => (item !== I_ADRENALINE && usable(s, item, victim) ? [slot] : []));
}
