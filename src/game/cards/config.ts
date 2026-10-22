// Configuración de «Mazo Loco» (cartas de colores del hub): lienzo, paleta de la baraja, geometría de
// las cartas y tiempos de las reglas. Nada de literales repartidos por el render.
import type { RGB } from "../core/config";

/** Tamaño lógico del lienzo (4:3, como el resto de juegos de mesa del hub). */
export const CW = 360;
export const CH = 270;

/** Colores de la baraja en orden: 0 rojo, 1 amarillo, 2 verde, 3 azul. */
export const CARD_COLORS: RGB[] = [
  [214, 56, 52],
  [232, 176, 34],
  [44, 158, 84],
  [44, 108, 208],
];
/** El mismo color oscurecido para bordes y sombras de la carta. */
export const CARD_DARK: RGB[] = [
  [128, 26, 24],
  [138, 100, 12],
  [20, 92, 46],
  [20, 60, 126],
];
export const COLOR_NAMES = ["ROJO", "AMARILLO", "VERDE", "AZUL"] as const;

/** Crema de la carta y tinta de los rótulos. */
export const C_CARD: RGB = [252, 246, 232];
export const C_INK: RGB = [24, 20, 28];
export const C_FELT: RGB = [24, 52, 44];
export const C_FELT_LINE: RGB = [58, 104, 86];
export const C_DEALER: RGB = [34, 16, 40];

export const RULES = {
  /** Cartas en la mano de cada asiento al repartir. */
  handSize: 7,
  /** Puntos para ganar la partida (se juega a rondas). */
  targetPoints: 500,
  /** Segundos para decir «UNO» antes de que te caigan dos de castigo. */
  unoWindow: 2.6,
  /** Espera de un bot antes de mover (mínimo y máximo). */
  botWait: [0.7, 1.25] as [number, number],
  /** Cuánto se queda el cartel de fin de ronda antes de repartir otra. */
  roundEnd: 5.5,
};

/** Geometría de las cartas (2,5:3,5 como las de verdad). */
export const CARD_W = 50;
export const CARD_H = 70;
export const CARD_R = 4;

/** Franja de arriba del HUD. */
export const HUD_H = 17;

/** Puntos de cada carta al cerrar la ronda. */
export const CARD_POINTS = {
  number: 1,
  action: 20,
  wild: 50,
};
