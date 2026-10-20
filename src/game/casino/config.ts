// Constantes de Casino de deudas.

// --- Pantalla: la sala entera vista desde arriba ---
export const CW = 320;
export const CH = 200;
export const HUD_H = 12; // franja de marcadores
export const WALL_H = 26; // pared del fondo con el mostrador del prestamista
export const FLOOR_Y = HUD_H + WALL_H; // donde empieza la moqueta

// --- Jugadores ---
export const SPEED = 80;
export const FEET_W = 8; // caja de los pies (colisión)
export const FEET_H = 4;

// --- Partida ---
export const INTRO_TIME = 2.5; // cartel "DÍA N"
export const DAY_TIME = 90;
export const COLLECT_TIME = 3; // el prestamista cobra (las máquinas en marcha terminan)
export const PAID_TIME = 2;
export const START_BANK = 100;
/** Cuota del día n (1, 2, 3...). */
export const quotaOf = (day: number) => Math.round((120 * Math.pow(2.1, day - 1)) / 10) * 10;

// --- Máquinas ---
export const SLOT = 0;
export const COIN = 1;
export const DICE = 2;
export type MachineKind = 0 | 1 | 2;

export interface MachineSpec {
  name: string;
  bet: number;
  /** Segundos que tarda una jugada. */
  dur: number;
  w: number;
  h: number;
  /** Tabla de premios, en pocas palabras. */
  rules: string;
}

export const MACHINES: Record<MachineKind, MachineSpec> = {
  [SLOT]: { name: "Tragaperras", bet: 10, dur: 1.3, w: 16, h: 18, rules: "CEREZA $5 · PAREJA $10 · TRÍO $40 A $250" },
  [COIN]: { name: "Doble o nada", bet: 50, dur: 1.2, w: 26, h: 16, rules: "ESTRELLA $110 · CALAVERA NADA" },
  [DICE]: { name: "Dados", bet: 100, dur: 1.6, w: 34, h: 20, rules: "12 ×12 · 11 ×5 · 9-10 ×2 · 7 DEVUELVE" },
};
/** Doble o nada: probabilidad de estrella y lo que paga. */
export const COIN_WIN = 0.5;
export const COIN_PAY = 110;
/** Dados: premio (× apuesta) según la suma de 2d6. */
export const DICE_PAY: Record<number, number> = { 12: 12, 11: 5, 10: 2, 9: 2, 7: 1 };

/** Tras terminar, la máquina enseña el resultado este tiempo antes de quedar libre. */
export const SHOW_TIME = 0.4;

// --- Tragaperras: símbolos, peso en cada rodillo y premio (× apuesta) con tres iguales ---
export const SYMBOLS = ["Cereza", "Limón", "Campana", "BAR", "Siete"];
export const SYMBOL_WEIGHT = [6, 5, 3, 2, 1];
export const THREE_PAY = [4, 4, 8, 12, 25];
export const TWO_CHERRIES = 2;
export const ONE_CHERRY = 0.5;
/** Dos iguales que no son cerezas: devuelve la apuesta. */
export const TWO_SAME = 1;
