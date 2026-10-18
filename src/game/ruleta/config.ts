// Configuración de Ruleta de cartuchos: reglas por ronda, tiempos de animación y objetos.

// --- Pantalla ---
export const RW = 320;
export const RH = 240;

// --- Mesa ---
export const SEATS = 4; // personas + el crupier (si hay bots), como mucho 4
export const MAX_ITEMS = 8;

export interface RoundRule {
  lives: number;
  /** Objetos que recibe cada jugador al empezar cada carga. */
  items: number;
  minShells: number;
  maxShells: number;
  /** Cables cortados: con CUT_AT vidas o menos ya no se puede curar. */
  cut: boolean;
}

export const ROUNDS: RoundRule[] = [
  { lives: 2, items: 0, minShells: 2, maxShells: 4, cut: false },
  { lives: 4, items: 2, minShells: 3, maxShells: 6, cut: false },
  { lives: 5, items: 4, minShells: 4, maxShells: 8, cut: true },
];
export const CUT_AT = 2;

// --- Fases ---
export const PH_INTRO = 0; // cartel de la ronda
export const PH_REVEAL = 1; // se enseñan los cartuchos de la carga y se reparten objetos
export const PH_TURN = 2; // turnos (y animaciones de disparos y objetos)
export const PH_ROUND_END = 3;
export const PH_OVER = 4;

// --- Tiempos (s) ---
export const INTRO_TIME = 2.6;
export const REVEAL_TIME = 3.4;
export const SHOT_TIME = 2.2;
export const SHOT_HIT = 1.05; // momento del disparo dentro de la animación
export const ITEM_TIME = 1.4;
export const ITEM_HIT = 0.55; // momento en que el objeto hace efecto
export const ROUND_END_TIME = 3.6;
export const BOT_THINK_MIN = 0.9;
export const BOT_THINK_MAX = 1.7;

// --- Eventos (lo que se está animando): [n, tipo, a, b, c, d, e] ---
// Disparo: a = quien dispara, b = objetivo, c = ¿real? (-1 hasta el disparo), d = daño.
// Objeto: a = quien lo usa, b = objeto, c = objetivo o víctima del robo, d = resultado, e = ¿robado?
export const EV_NONE = 0;
export const EV_SHOT = 1;
export const EV_ITEM = 2;

// --- Objetos ---
export const I_LUPA = 1;
export const I_CIGS = 2;
export const I_BEER = 3;
export const I_SAW = 4;
export const I_CUFFS = 5;
export const I_PHONE = 6;
export const I_INVERTER = 7;
export const I_MEDS = 8;
export const I_ADRENALINE = 9;

export interface ItemInfo {
  name: string;
  desc: string;
  /** Probabilidad relativa al repartir. */
  weight: number;
}

export const ITEMS: Record<number, ItemInfo> = {
  [I_LUPA]: { name: "Lupa", desc: "Mira el cartucho de la recámara", weight: 1 },
  [I_CIGS]: { name: "Cigarrillos", desc: "Recupera 1 vida", weight: 1 },
  [I_BEER]: { name: "Cerveza", desc: "Expulsa el cartucho de la recámara", weight: 1 },
  [I_SAW]: { name: "Sierra", desc: "El próximo disparo quita 2 vidas", weight: 1 },
  [I_CUFFS]: { name: "Esposas", desc: "Un rival pierde su próximo turno", weight: 0.8 },
  [I_PHONE]: { name: "Teléfono", desc: "Revela un cartucho que está por salir", weight: 0.8 },
  [I_INVERTER]: { name: "Inversor", desc: "Cambia el de la recámara: real ↔ fogueo", weight: 0.8 },
  [I_MEDS]: { name: "Medicina caducada", desc: "50 %: +2 vidas · 50 %: −1 vida", weight: 0.7 },
  [I_ADRENALINE]: { name: "Adrenalina", desc: "Roba un objeto a un rival y úsalo", weight: 0.7 },
};

export const ITEM_IDS = Object.keys(ITEMS).map(Number);
