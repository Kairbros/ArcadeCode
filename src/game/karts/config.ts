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
/** Caparazón rojo: persigue al kart que va justo por delante. */
export const ITEM_RED = 4;
/** Estrella: invencible y rápido unos segundos. */
export const ITEM_STAR = 5;
/** Bomba TNT: se suelta atrás y explota por contacto o a los pocos segundos. */
export const ITEM_BOMB = 6;
/** Rayo: frena un rato a todos los que van por delante. */
export const ITEM_BOLT = 7;
export type ItemKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const ITEM_NAMES = ["", "Turbo", "Plátano", "Proyectil", "Proyectil teledirigido", "Estrella", "Bomba TNT", "Rayo"];

export const TURBO_TIME = 1.4;
export const TURBO_SPEED = 265;
export const SPIN_TIME = 1.1;
export const SHELL_SPEED = 320;
export const SHELL_LIFE = 3;
export const RED_LIFE = 6;
export const RED_TURN = 3.2; // rad/s
export const BOX_RESPAWN = 3;
export const MAX_BANANAS = 12;
export const STAR_TIME = 6;
export const STAR_SPEED = 235;
export const BOMB_FUSE = 2.8;
export const BOMB_RADIUS = 30;
export const MAX_BOMBS = 6;
export const BLAST_TIME = 0.6;
export const BOLT_TIME = 4;
export const BOLT_FACTOR = 0.6; // velocidad máxima de quien recibe el rayo

// --- Rampas, salto y trucos ---
export const GRAVITY = 210; // unidades/s²
export const RAMP_LEN = 5; // puntos de línea central que mide la rampa
export const RAMP_LAUNCH = 88; // velocidad vertical al saltar a tope de velocidad
export const RAMP_MIN_SPEED = 60;
export const AIR_STEER = 0.3; // fracción del giro que se conserva en el aire
export const TRICK_BOOST = 0.9; // segundos de turbo al aterrizar tras un truco

// --- Zonas de turbo y monedas ---
export const PAD_R = 13; // radio de una placa de turbo
export const PAD_TIME = 1.1;
export const COIN_R = 10;
export const MAX_COINS = 10;
export const COIN_SPEED = 2.4; // velocidad máxima extra por moneda

// --- Vacío del espacio (Lakitu) ---
/** Al caer por debajo de esta altura (unidades) Lakitu recoge al kart y lo devuelve a la pista. */
export const FALL_LIMIT = -140;
export const DROP_TIME = 1.3; // segundos que se ve a Lakitu con la nube
export const RESPAWN_BACK = 8; // puntos de línea central hacia atrás del último tramo seguro
export const CHOMP_R = 11;
/** Semiancho de la cinta del espacio y distancia a la que se empieza a caer (un poco más que el asfalto). */
export const RIBBON_HW = TRACK_W / 2 + 18;
export const FALL_DIST = TRACK_W / 2 + 16;

// --- Túneles (cuevas) ---
/** Dentro del túnel la pared está a esta distancia de la línea central (más cerca que fuera). */
export const TUNNEL_LIMIT = TRACK_W / 2 + 3.3; // justo dentro del borde del asfalto (no cuenta como fuera de pista)
export const TUNNEL_R = TRACK_W / 2 + 14; // radio del arco de roca

// --- Carrera ---
export const RACERS = 4; // los huecos sin jugador los ocupa la IA
export const COUNTDOWN = 3;
export const FINISH_GRACE = 25; // segundos que esperan los demás tras el primero en llegar
