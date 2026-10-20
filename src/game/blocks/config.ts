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
export const SPRINT = 6.6; // andar corriendo (Ctrl)
export const REACH = 5; // distancia para romper y poner
export const EDIT_REPEAT = 0.25; // con la tecla pulsada, se repite cada tanto
/** Al soltar el botón, el progreso de minado se guarda este tiempo (clic tras clic sigue avanzando). */
export const MINING_GRACE = 0.35;
export const LOOK_SPEED = 2.4; // giro con las flechas (rad/s)
export const MOUSE_SENS = 0.0028;
export const ATTACK_REACH = 3.5; // distancia para golpear a un animal
export const ATTACK_COOL = 0.45; // segundos entre golpes (mantener el clic sigue golpeando)

// --- Barra rápida ---
export const HOTBAR_SLOTS = 9; // teclas 1–9

// --- Red ---
export const EDITS_IN_SNAP = 48; // últimos cambios de bloques que viajan en cada estado
export const EDITS_PER_MSG = 4; // cambios pendientes por mensaje del invitado (≤ 300 caracteres)
export const REBASE_EVERY = 2; // segundos mínimos entre bases nuevas (mundo completo) si hubo cambios
/** Cambios propios sin confirmar que guarda el invitado; si se pasan, se tiran los más viejos. */
export const MAX_PENDING = 32;

// --- Guardado del mundo local (localStorage) ---
export const SAVE_EVERY = 4; // segundos mínimos entre guardados si hubo cambios
export const SAVE_MAX_BLOCKS = 20_000; // tope de bloques distintos que se guardan
