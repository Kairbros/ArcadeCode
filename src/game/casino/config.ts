// Configuración del Casino entre amigos: tamaño de la vista, tiempos de las mesas y economía de fichas.

// --- Pantalla ---
export const CW = 320;
export const CH = 240;

// --- Jugadores ---
export const MAX_SEATS = 4;
/** Altura de los ojos del muñeco (para la cámara en tercera persona). */
export const EYE = 1.55;

// --- Fichas ---
/** Fichas con las que se empieza. */
export const START_CHIPS = 100;
/** Bono de la casa si te sientas sin fichas. */
export const RESCUE = 25;
/** Cantidades que se recorren con ↑ ↓. */
export const BET_STEPS = [1, 5, 10, 25, 50, 100];

// --- Fases de cada mesa ---
export const PH_BET = 0; // se apuesta
export const PH_SPIN = 1; // la mesa está girando / repartiendo
export const PH_PAY = 2; // se enseña lo que ha ganado cada uno

// --- Tiempos (s) ---
export const BET_TIME = 20;
export const SPIN_TIME = 3.2;
export const PAY_TIME = 2.6;

// --- Movimiento ---
export const WALK = 4.2;
export const RUN = 6.4;
export const TURN = 2.8; // rad/s girando con A/D o ← →
/** Distancia a la que uno se puede sentar en una mesa. */
export const REACH = 3.0;
export const BODY_R = 0.34;

// --- Cámara en primera persona ---
/** Altura de los ojos andando y sentado (metros). */
export const EYE_H = 1.58;
export const EYE_SEAT = 1.34;
/** Vaivén de la cabeza al andar. */
export const HEAD_BOB = 0.035;

// --- Manos: ranuras del HUD, golpes y agarres ---
/** Ranuras de la barra: monedas, mano y bate. */
export const SLOT_NAMES = ["MONEDAS", "MANO", "BATE"] as const;
export const SLOT_COINS = 0;
export const SLOT_HAND = 1;
export const SLOT_BAT = 2;
/** Alcance del bate y de la mano (metros) y medio cono frontal. */
export const HIT_REACH = 2.0;
export const GRAB_REACH = 1.5;
export const HIT_ARC = 0.95;
/** Segundos que deja aturdido un bate o un agarre. */
export const HIT_STUN = 0.6;
export const GRAB_HOLD = 1.4;
/** Recargas (segundos). */
export const BAT_CD = 1.1;
export const GRAB_CD = 2.0;
/** Monedas que suelta como mucho un golpe y fichas por agarre. */
export const STEAL_MAX = 4;
export const GRAB_STEAL = 1;
/** Empujones: velocidad (m/s) y tiempo; el choque entre jugadores es más suave. */
export const KNOCK = 6.5;
export const KNOCK_TIME = 0.28;
export const BUMP = 2.6;
export const BUMP_TIME = 0.16;
/** Monedas en el suelo: vida (s), máximo a la vez y radio para recogerlas. */
export const DROP_LIFE = 12;
export const DROP_MAX = 8;
export const PICK_REACH = 0.85;

// --- Ratón (mirar) ---
/** Grados de giro por píxel de ratón y límites del cabeceo (rad). */
export const MOUSE_TURN = 0.0042;
export const MOUSE_PITCH = 0.0034;
export const PITCH_MAX = 1.05;
/** Cuánto se puede mirar con el ratón sentado (solo un poco, para no perder el mecanismo). */
export const SEAT_PITCH = 0.45;

// --- Robar: minijuego y cárcel ---
/** Alcance para robar y fichas que se llevan si sale bien. */
export const ROB_REACH = 2.2;
export const ROB_MIN = 2;
export const ROB_MAX = 4;
/** Segundos de condena al fallar el minijuego. */
export const JAIL_TIME = 16;
/** Distancia para coger la basura del suelo de la celda. */
export const JAIL_PICK = 1.8;
/** El minijuego: la marca va y viene y hay que pararla en la zona buena. */
export const ROB_SPEED = 1.15;
export const ROB_ZONE = 0.24;

// --- Colores (diseño minimalista: fondo casi negro, líneas finas y un acento) ---
export const C_BG = [10, 11, 16] as const;
export const C_PANEL = [17, 19, 27] as const;
export const C_LINE = [36, 40, 56] as const;
export const C_TEXT = [232, 234, 244] as const;
export const C_DIM = [138, 143, 166] as const;
export const C_ACCENT = [53, 224, 200] as const; // turquesa neón
export const C_GOLD = [255, 206, 74] as const;
export const C_RED = [232, 62, 84] as const;
export const C_GREEN = [46, 189, 108] as const;
export const C_BLACK = [42, 45, 58] as const;
export const C_LOSE = [255, 86, 96] as const;
export const C_WIN = [86, 226, 138] as const;
