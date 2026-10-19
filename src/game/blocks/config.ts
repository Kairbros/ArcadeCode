// Constantes de Bloques (mundo de bloques para construir juntos).

// --- Pantalla ---
export const VW = 320;
export const VH = 240;

// --- Mundo: tamaño fijo, generado desde una semilla ---
export const WX = 96;
export const WY = 48;
export const WZ = 96;
export const CHUNK = 16; // los chunks son columnas de CHUNK × WY × CHUNK
export const SEA = 17; // nivel del agua

// --- Jugador (unidades = bloques) ---
export const HALF_W = 0.3; // media anchura de la caja de colisión
export const HEIGHT = 1.8;
export const EYE = 1.62;
export const WALK = 4.3;
export const FLY = 9;
export const GRAVITY = 26;
export const JUMP_V = 8.2;
export const WATER_GRAVITY = 6;
export const SWIM_V = 3;
export const REACH = 5; // distancia para romper y poner
export const EDIT_REPEAT = 0.25; // con la tecla pulsada, se repite cada tanto
export const LOOK_SPEED = 2.4; // giro con las flechas (rad/s)
export const MOUSE_SENS = 0.0028;

// --- Red ---
export const EDITS_IN_SNAP = 48; // últimos cambios de bloques que viajan en cada estado
export const EDITS_PER_MSG = 4; // cambios pendientes por mensaje del invitado (≤ 300 caracteres)
export const REBASE_EVERY = 2; // segundos mínimos entre bases nuevas (mundo completo) si hubo cambios
