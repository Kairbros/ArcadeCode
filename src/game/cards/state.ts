// Estado que viaja por la red y las lecturas que hacen igual el anfitrión, los invitados y el dibujo.
// Nombres cortos y arrays paralelos a los asientos, como en el resto de juegos del hub.
import type { GameId } from "../hub";

export interface CardsSnap {
  g: GameId;
  base: -1;
  seq: number;
  /** Fase: 0 jugando, 1 fin de ronda, 2 fin de partida. */
  ph: number;
  /** Asiento en turno. */
  tu: number;
  /** Sentido de juego: 1 o -1. */
  dr: number;
  /** Color activo (0..3). */
  co: number;
  /** Mano de cada asiento (ids de carta). */
  hd: number[][];
  /** Cartas que quedan en el mazo. */
  dp: number;
  /** Carta de arriba del descarte. */
  tp: number;
  /** Puntos de cada asiento. */
  gl: number[];
  /** 1 = ha dicho UNO (o no le hace falta). */
  un: number[];
  /** 1 = ya robó en su turno (solo puede jugar o pasar). */
  dw: number[];
  /** Décimas que le quedan para decir UNO. */
  ut: number[];
  /** Conectado (0/1) y bot (0/1). */
  on: number[];
  bo: number[];
  /** Acuse de la última acción aceptada de cada asiento. */
  ak: number[];
  /** Aviso de la mesa. */
  ms: string;
  /** Asiento del aviso (-1 = todos). */
  to: number;
  /** Contador de cambios (animaciones). */
  mv: number;
  /** Ganador de la ronda o de la partida (-1). */
  wn: number;
  /** Décimas de espera de la fase. */
  bt: number;
  /** Ronda. */
  rd: number;
}

export const seatHand = (s: CardsSnap, seat: number): number[] => s.hd[seat] ?? [];

/** ¿Le toca a este asiento y la mesa está en juego? */
export const canAct = (s: CardsSnap, seat: number): boolean => s.ph === 0 && s.tu === seat && s.on[seat] === 1;

/** ¿Está a una carta y sin haber dicho UNO? (para el aviso parpadeante) */
export const unoPending = (s: CardsSnap, seat: number): boolean =>
  s.ph === 0 && seatHand(s, seat).length === 1 && s.un[seat] === 0 && (s.ut[seat] ?? 0) > 0;
