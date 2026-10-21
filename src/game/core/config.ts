// Configuración común a todos los juegos del hub.

export type RGB = readonly [number, number, number];

// --- Red ---
export const MAX_PLAYERS = 4;
export const SNAPSHOT_HZ = 30;

// --- Pantalla ---
/** Tamaño lógico del lienzo cuando no hay juego (menú, conectando). */
export const DEFAULT_SIZE = [720, 680] as const;
export const BG_COLOR: RGB = [20, 20, 28];

// --- Jugadores ---
export const PLAYER_NAMES = ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"];
export const PLAYER_COLORS: RGB[] = [
  [80, 170, 255],
  [255, 95, 95],
  [110, 220, 110],
  [255, 210, 70],
];

// --- Controles (KeyboardEvent.code) ---
export interface ControlScheme {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  bomb: string[];
}

/** J1: WASD + Espacio; J2: flechas + Enter. En red cada uno puede usar cualquiera de los dos. */
export const PLAYER_CONTROLS: ControlScheme[] = [
  { up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"], bomb: ["Space", "ShiftLeft"] },
  {
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    bomb: ["Enter", "NumpadEnter", "ControlRight", "Numpad0"],
  },
];
