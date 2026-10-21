// Constantes de Billar (bola 8): mesa, físicas y diseño de pantalla.

// --- Pantalla ---
export const PW = 320;
export const PH = 200;

// Mesa vista desde arriba, proyección ortogonal: pantalla = centro + mundo × ZOOM.
export const ZOOM = 1.08;
export const TCX = 168; // centro de la mesa en pantalla
export const TCY = 109;

// --- Mesa (unidades del juego, origen en el centro, x a la derecha, y hacia abajo) ---
export const TW = 240; // largo del paño
export const TH = 120; // ancho del paño
export const RAIL = 11; // grosor del marco de madera
export const BALL_R = 4.5;

export const CORNER_R = 10.5; // radio de captura de las troneras de esquina
export const SIDE_R = 9; // radio de captura de las troneras centrales
export const CORNER_MOUTH = 8; // tramo de banda junto a la esquina que no rebota
export const SIDE_MOUTH = 6;

/** Troneras: esquinas y centros de los lados largos. */
export const POCKETS: readonly (readonly [number, number])[] = [
  [-TW / 2, -TH / 2], [0, -TH / 2 - 2], [TW / 2, -TH / 2],
  [-TW / 2, TH / 2], [0, TH / 2 + 2], [TW / 2, TH / 2],
];

export const HEAD_X = -TW / 4; // línea de cabeza: la blanca sale de detrás en el saque
export const RACK_X = TW / 4; // vértice del triángulo

// --- Físicas ---
export const STEP = 1 / 240;
export const MAX_SPEED = 620; // velocidad de la blanca a potencia máxima
export const MIN_SPEED = 28;
export const ROLL_DECEL = 62; // frenado constante del paño al rodar (u/s²)
export const ROLL_DRAG = 0.4; // amortiguación (1/s)
export const BALL_REST = 0.96; // elasticidad entre bolas
export const RAIL_REST = 0.78; // elasticidad de las bandas
export const STOP_SPEED = 3;
export const FOLLOW_K = 0.55; // solo para la línea de tiro: cuánto de la velocidad de impacto se suma o resta con rosca
export const SLIDE_ACC = 230; // aceleración de rozamiento con el paño mientras la bola resbala (u/s²)
export const SPIN_DECAY = 55; // frenado del giro lateral (rad/s²)
export const SPIN_GAIN = 1.5; // el giro que da el taco, algo exagerado para que se note más (como en el móvil)
export const STRIKE_OFFSET = 0.5; // el taco pega hasta medio radio del centro
export const BALL_FRIC = 0.06; // rozamiento entre bolas (arrastre al chocar)
export const RAIL_FRIC = 0.18; // rozamiento bola-banda (da el efecto de banda)
export const JAW_R = 0.8; // radio de los labios de las troneras

// --- Turnos ---
export const SHOT_TIME = 40; // segundos para tirar
export const BOT_THINK = 1.1; // el bot "piensa" antes de apuntar
export const BOT_AIM = 0.9; // y tarda esto en girar el taco

// --- HUD: barra de potencia (izquierda) y bola de efecto (abajo a la izquierda) ---
export const BAR = { x: 3, y: 42, w: 11, h: 108 } as const;
export const SPIN = { x: 11, y: 174, r: 9 } as const;
export const POCKET_PICK = 13; // distancia (unidades) para elegir tronera con el ratón

export const PLAYER_BOT = "CPU";

/** Colores de las bolas 1..8 (las rayadas 9..15 repiten 1..7). */
export const BALL_COLORS = [0xffffff, 0xf2c200, 0x1f5fd0, 0xd8202a, 0x6a2a9a, 0xf07a10, 0x1a8a3a, 0x7a1e18, 0x111114];

export const toWorld = (sx: number, sy: number): [number, number] => [(sx - TCX) / ZOOM, (sy - TCY) / ZOOM];
export const toScreen = (x: number, y: number): [number, number] => [TCX + x * ZOOM, TCY + y * ZOOM];
