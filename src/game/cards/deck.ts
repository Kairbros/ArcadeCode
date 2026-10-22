// Baraja de «Mazo Loco» en datos puros (sin DOM): las 108 cartas, su valor, su nombre y qué se puede
// jugar sobre la mesa. Los ids caben en un número y viajan así por la red.
//
//   id 0..51  → carta de color:  color * 13 + rango  (rango 0..9 número, 10 bloqueo, 11 reversa, 12 +2)
//   id 52     → comodín (cambia el color)
//   id 53     → comodín +4 (cambia el color y el siguiente roba 4)
import { CARD_POINTS, COLOR_NAMES } from "./config";

export const RANKS_PER_COLOR = 13;
export const SKIP = 10;
export const REVERSE = 11;
export const DRAW2 = 12;
export const WILD = 52;
export const WILD4 = 53;
export const DECK_SIZE = 108;

export const colorOf = (id: number): number => (id >= 0 && id < 52 ? Math.floor(id / RANKS_PER_COLOR) : -1);
export const rankOf = (id: number): number => (id >= 0 && id < 52 ? id % RANKS_PER_COLOR : -1);
export const isWild = (id: number): boolean => id === WILD || id === WILD4;
export const isDraw = (id: number): boolean => id === WILD4 || rankOf(id) === DRAW2;

/** Puntos que vale la carta al cerrar la ronda (lo que paga a quien gana). */
export function cardPoints(id: number): number {
  if (isWild(id)) return CARD_POINTS.wild;
  return rankOf(id) <= 9 ? CARD_POINTS.number * Math.max(0, rankOf(id)) : CARD_POINTS.action;
}

/** Baraja completa: por color un 0, dos de cada 1..9 y dos de cada acción, más 4 comodines de cada. */
export function buildDeck(): number[] {
  const out: number[] = [];
  for (let color = 0; color < 4; color++) {
    out.push(color * RANKS_PER_COLOR); // el 0 va una sola vez
    for (let rank = 1; rank < RANKS_PER_COLOR; rank++) {
      out.push(color * RANKS_PER_COLOR + rank, color * RANKS_PER_COLOR + rank);
    }
  }
  for (let i = 0; i < 4; i++) out.push(WILD, WILD4);
  return out;
}

/** Barajado Fisher-Yates con un `rng` inyectable (0..1): misma tirada en las pruebas. */
export function shuffle<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Texto del rango tal y como se lee en el HUD y en los avisos. */
export function rankName(id: number): string {
  if (id === WILD) return "COMODÍN";
  if (id === WILD4) return "COMODÍN +4";
  const rank = rankOf(id);
  if (rank === SKIP) return "BLOQUEO";
  if (rank === REVERSE) return "REVERSA";
  if (rank === DRAW2) return "+2";
  return String(rank);
}

/** Etiqueta corta (la que cabe en la esquina de la carta). */
export function rankShort(id: number): string {
  if (id === WILD) return "C";
  if (id === WILD4) return "+4";
  const rank = rankOf(id);
  if (rank === SKIP) return "X";
  if (rank === REVERSE) return "R";
  if (rank === DRAW2) return "+2";
  return String(rank);
}

/** Nombre completo: «+2 VERDE», «COMODÍN +4»... */
export function cardName(id: number): string {
  if (isWild(id)) return rankName(id);
  return `${rankName(id)} ${COLOR_NAMES[colorOf(id)]}`;
}

/**
 * ¿Se puede jugar `id` sobre la mesa? Vale el mismo color, el mismo rango, o un comodín.
 * `color` es el color activo (puede venir de un comodín).
 */
export function canPlay(id: number, top: number, color: number): boolean {
  if (isWild(id)) return true;
  if (colorOf(id) === color) return true;
  const rank = rankOf(id);
  return rank >= 0 && rank === rankOf(top) && !isWild(top);
}

/** Color que queda activo al bajar una carta. */
export function colorAfter(id: number, chosen: number): number {
  return isWild(id) ? chosen : colorOf(id);
}
