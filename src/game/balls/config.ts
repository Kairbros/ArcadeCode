// Constantes de Sumo de bolas.

// --- Pantalla (misma resolución interna que Karts) ---
export const BW = 256;
export const BH = 224;

// --- Cámara 3D: fija al sur de la arena, alta y mirando hacia abajo al norte ---
export const FOV = 73; // campo de visión vertical (grados)
export const CAM_HEIGHT = 75; // altura sobre la plataforma
export const CAM_DIST = 155; // distancia al centro de la arena
export const CAM_PITCH = -0.6; // inclinación hacia abajo (radianes)
export const CAM_FOLLOW = 0.25; // cuánto se desplaza de lado siguiendo al jugador
export const LAVA_DROP = 20; // la lava está esta altura por debajo de la plataforma

// --- Arena ---
export const ARENA_R = 100; // radio inicial
export const ARENA_MIN_R = 45; // radio al final de la ronda
export const RIM_W = 9; // borde de piedra
export const CHECKER = 20; // lado de las baldosas
export const SHRINK_START = 20; // segundos de ronda a partir de los que encoge
export const ROUND_TIME = 60; // al acabar el tiempo ganan todos los que sigan en pie

// --- Bolas ---
export const BALLS = 4; // los huecos sin jugador los ocupa la IA
export const BALL_R = 11;
export const ACCEL = 300;
export const DRAG = 1.7; // amortiguación (1/s)
export const MAX_SPEED = 150;
export const RESTITUTION = 0.85;
export const BUMP = 70; // empujón extra en cada choque: las bolas rebotan mucho
export const DASH_SPEED = 170; // embestida
export const DASH_COOLDOWN = 1.6;
export const GRAVITY = 260;
export const SPAWN_R = 0.55; // fracción del radio donde aparecen

// --- Ronda ---
export const COUNTDOWN = 3;
export const END_DELAY = 1.4; // pausa entre el último en caer y los resultados
