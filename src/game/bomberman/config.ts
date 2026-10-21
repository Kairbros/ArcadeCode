// Constantes de Bomberman. Reexporta las comunes para que el juego las tome de un solo sitio.
import type { RGB } from "../core/config";

export * from "../core/config";

// --- Pantalla / mapa ---
export const TILE = 48;
export const COLS = 15; // impar: los pilares quedan simétricos
export const ROWS = 13; // impar
export const HUD_HEIGHT = 56;
export const SCREEN_W = COLS * TILE;
export const SCREEN_H = ROWS * TILE + HUD_HEIGHT;

// --- Tiempos (s) ---
export const BOMB_FUSE = 2.5;
export const EXPLOSION_TIME = 0.55;
export const CRATE_BURN_TIME = 0.45;
export const DEATH_TIME = 0.9;
export const ROUND_END_DELAY = 1.5;
export const TEXT_TIME = 1.0;
export const HINT_TIME = 6.0;

// --- Jugador ---
export const PLAYER_HITBOX = 0.78; // fracción del tile
export const PLAYER_BASE_SPEED = 140;
export const PLAYER_SPEED_STEP = 22;
export const PLAYER_MAX_SPEED = 280;
export const BASE_RANGE = 2;
export const MAX_RANGE = 10;
export const BASE_BOMBS = 1;
export const MAX_BOMBS = 8;

// --- Enemigos ---
export const ENEMY_HITBOX = 0.7;
export const ENEMY_SPEED = 85;
export const ENEMIES_1P = 5;
export const ENEMIES_MULTI = 2;

export function enemiesFor(nPlayers: number): number {
  return nPlayers === 1 ? ENEMIES_1P : ENEMIES_MULTI;
}

// --- Colores ---
export const HUD_BG: RGB = [28, 28, 40];
export const HUD_LINE: RGB = [70, 70, 95];
export const TEXT_COLOR: RGB = [235, 235, 245];
export const TEXT_DIM: RGB = [150, 150, 170];

export const FLOOR_A: RGB = [58, 138, 66];
export const FLOOR_B: RGB = [64, 148, 72];
export const FLOOR_TUFT: RGB = [48, 118, 56];
export const FLOOR_SHADOW: RGB = [38, 92, 44];

export const WALL_BASE: RGB = [88, 88, 100];
export const WALL_LIGHT: RGB = [140, 140, 155];
export const WALL_DARK: RGB = [55, 55, 66];

export const CRATE_BASE: RGB = [176, 116, 60];
export const CRATE_DARK: RGB = [112, 68, 32];
export const CRATE_LIGHT: RGB = [206, 150, 90];

export const FIRE_OUTER: RGB = [255, 110, 20];
export const FIRE_MID: RGB = [255, 200, 60];
export const FIRE_CORE: RGB = [255, 250, 220];

export const ENEMY_COLOR: RGB = [170, 90, 220];
