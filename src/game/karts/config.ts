// Constantes de Karts.

// --- Pantalla (resolución interna estilo SNES; se escala al lienzo) ---
export const KW = 256;
export const KH = 224;

// --- Cámara 3D: detrás del kart, sigue la dirección de avance y el relieve ---
export const FOV = 73; // campo de visión vertical (grados)
export const CAM_HEIGHT = 24; // altura sobre el suelo (unidades de mundo)
export const CAM_DIST = 36; // distancia detrás del kart
export const CAM_LOOK = 40; // mira a este punto por delante del kart
export const FOG_START = 350;
export const FOG_END = 1500;

// --- Relieve (solo visual: la física sigue siendo plana) ---
export const TERRAIN_MARGIN = 512; // el relieve se extiende más allá de la textura
export const TERRAIN_SEG = 160; // casillas por lado de la rejilla de alturas

// --- Circuito ---
export const TEX = 1536; // la textura del circuito mide TEX×TEX unidades (1 px = 1 unidad)
export const TRACK_W = 64; // ancho del asfalto
export const CURB_W = 6;
export const WALL_MARGIN = 46; // más allá del borde del asfalto hay un muro invisible
export const POINT_STEP = 6; // separación entre puntos de la línea central
export const LAPS = 3; // los circuitos son largos (~2.400–5.600 unidades por vuelta)

// --- Kart ---
export const KART_R = 6; // radio de colisión
export const MAX_SPEED = 185;
export const OFFROAD_MAX = 70;
export const REVERSE_MAX = 45;
export const ACCEL = 120;
export const BRAKE = 240;
export const FRICTION = 55;
export const STEER_RATE = 2.5; // rad/s a velocidad de agarre completa

// --- Derrape ---
export const HOP_TIME = 0.16; // saltito al pulsar derrape
export const HOP_HEIGHT = 4;
export const DRIFT_MIN_SPEED = 75;
// Giro derrapando, en fracción de STEER_RATE: sin tocar el volante, cerrando la curva y abriéndola.
export const DRIFT_TURN = 0.62;
export const DRIFT_TURN_IN = 0.95;
export const DRIFT_TURN_OUT = 0.32;
export const DRIFT_FOLLOW = 4.5; // lo rápido que la dirección de avance sigue al morro derrapando (1/s)
export const DRIFT_MAX_SLIP = 0.45; // ángulo máximo entre morro y dirección de avance (~26°)
export const MINI_TURBO_1 = 0.8; // segundos derrapando para chispas azules
export const MINI_TURBO_2 = 1.7; // ... y naranjas
export const MINI_TURBO_TIME_1 = 0.45;
export const MINI_TURBO_TIME_2 = 0.95;

// --- Objetos ---
export const ITEM_NONE = 0;
export const ITEM_TURBO = 1;
export const ITEM_BANANA = 2;
export const ITEM_SHELL = 3;
export type ItemKind = 0 | 1 | 2 | 3;
export const ITEM_NAMES = ["", "Turbo", "Plátano", "Proyectil"];

export const TURBO_TIME = 1.4;
export const TURBO_SPEED = 265;
export const SPIN_TIME = 1.1;
export const SHELL_SPEED = 320;
export const SHELL_LIFE = 3;
export const BOX_RESPAWN = 3;
export const MAX_BANANAS = 12;

// --- Carrera ---
export const RACERS = 4; // los huecos sin jugador los ocupa la IA
export const COUNTDOWN = 3;
export const FINISH_GRACE = 25; // segundos que esperan los demás tras el primero en llegar
