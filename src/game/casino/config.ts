// Configuración del Casino entre amigos: tamaño de la vista, tiempos de las mesas y economía de fichas.

// --- Pantalla ---
export const CW = 320;
export const CH = 240;

// --- Jugadores ---
export const MAX_SEATS = 4;
/** Altura de los ojos del muñeco (para la cámara en tercera persona). */
export const EYE = 1.55;

// --- Fichas ---
/** Fichas con las que se empieza, topes, rondas, guardias, borrachos y cárcel: ver `balance.ts`. */
/** Bono de la casa si te sientas sin ninguna ficha (ni cartera ni depósito). */
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
/** Estamina: segundos de carrera seguida, segundos para llenarla otra vez y lo que hay que recuperar si se agota. */
export const STAMINA_TIME = 4.5;
// 6 s y no menos: con 3 s, correr y recuperar en bucle daba ~5,5 m/s de media y nadie te alcanzaba nunca.
export const STAMINA_REGEN = 6;
export const STAMINA_MIN = 0.35;
/** Campo de visión andando y corriendo (la cámara se abre al correr: sensación de velocidad). */
export const WALK_FOV = 68;
export const RUN_FOV = 77;
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
/** Ranuras de la barra: monedas, mano, bate y el objeto comprado en la barra. */
export const SLOT_NAMES = ["MONEDAS", "MANO", "BATE", "OBJETO"] as const;
export const SLOT_COINS = 0;
export const SLOT_HAND = 1;
export const SLOT_BAT = 2;
export const SLOT_ITEM = 3;

// --- Rondas ---
/** Segundos que se ve el cartel de fin de ronda (la duración, el objetivo y el resto están en `balance.ts`). */
export const EVENT_TIME = 3.5;

// --- Mesa caliente ---
/** Cada cuánto cambia la mesa caliente y cuánto multiplica sus premios. */
export const HOT_TIME = 40;
export const HOT_BOOST = 2;

// --- Tienda de trucos (la barra) ---
export const ITEM_COST = 15;
export const ITEM_NONE = 0;
export const ITEM_MAGNET = 1;
export const ITEM_DICE = 2;
export const ITEM_BANANA = 3;
export const ITEM_NAMES = ["", "IMÁN", "DADO CARGADO", "BANANA"] as const;
/** Imán: segundos activo, radio de atracción y de recogida. */
export const MAGNET_TIME = 10;
export const MAGNET_R = 7;
export const MAGNET_PICK = 2.0;
/** Cáscaras de banana: vida, máximo a la vez, radio del resbalón, aturdimiento y monedas que suelta. */
export const BANANA_LIFE = 30;
export const BANANA_MAX = 4;
export const BANANA_R = 0.6;
export const SLIP_STUN = 1.2;
export const SLIP_DROP = 3;
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

// --- NPC: crupieres y guardia ---
/** Estados: en su puesto, distraído (se puede robar la mesa), persiguiendo, volviendo y de ronda (guardia). */
export const NPC_IDLE = 0;
export const NPC_DISTRACTED = 1;
export const NPC_CHASE = 2;
export const NPC_RETURN = 3;
export const NPC_PATROL = 4;
/** Guardia que todavía no ha entrado de servicio (se activan más según el turno). */
export const NPC_OFF = 5;
/** Guardia atraído por el timbre: acude a él y se queda un rato. */
export const NPC_LURED = 6;
/** Segundos entre despistes del crupier (al azar entre los dos) y lo que dura cada despiste. */
export const DISTRACT_MIN = 10;
export const DISTRACT_MAX = 22;
export const DISTRACT_TIME = 6;
/** Velocidades (m/s): todas por debajo de RUN, así que corriendo se escapa. */
export const NPC_WALK = 2.4;
export const CROUPIER_RUN = 4.9;
export const GUARD_RUN = 5.5;
/** Segundos que dura una persecución antes de rendirse (el guardia es mucho más insistente) y distancia a la que te atrapan. */
export const CHASE_TIME = 12;
export const GUARD_CHASE_TIME = 22;
export const CATCH_R = 0.85;
/** Segundos que se queda atontado un NPC al que le pegan (luego sale a por ti). */
export const NPC_HIT_STUN = 0.7;
/** Vista del guardia: alcance (m) y medio ángulo del cono (rad). */
export const GUARD_SIGHT = 9;
export const GUARD_FOV = 0.75;
/** Robar la mesa: distancia al centro, botín (al azar entre los dos) y recarga. */
export const TABLE_ROB_REACH = 3.2;
export const TABLE_ROB_MIN = 8;
export const TABLE_ROB_MAX = 16;
export const TABLE_ROB_CD = 3;

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
/** Distancia para coger la basura del suelo de la celda. */
export const JAIL_PICK = 1.8;
/** Fuga en equipo: segundos que hay que quedarse forzando la caja para abrir la jaula. */
export const BREAK_TIME = 3;

// --- Basura que se coge y se tira ---
/** Segundos hasta que vuelve a su sitio, alcance del tiro (m) y su medio cono (rad). */
export const LITTER_RESPAWN = 20;
export const LITTER_REACH = 8;
export const LITTER_ARC = 0.28;
/** Al que le das: jugador aturdido y monedas que suelta; NPC, segundos en el suelo. */
export const LITTER_STUN = 1.0;
export const LITTER_DROP = 2;
export const LITTER_NPC_STUN = 1.5;

// --- Boutique de disfraces (piso de arriba) ---
/** Disfraces de los maniquíes (el índice + 1 es el que viaja por la red), precio y duración. */
export const DISGUISES = ["BIGOTE", "PELUCA", "GAFAS"] as const;
export const DISGUISE_COST = 20;
export const DISGUISE_TIME = 25;

// --- Emotes (teclas 5–8) ---
/** Nombre de cada emote (el índice + 1 es el que viaja) y lo que dura. */
export const EMOTES = ["BAILAR", "SALUDAR", "FESTEJAR", "BURLARSE"] as const;
export const EMOTE_BUBBLES = ["♪ ♫", "¡HOLA!", "¡BIEN!", "¡JA JA!"] as const;
export const EMOTE_TIME = 2.5;

// --- Salto (Espacio) ---
/** Velocidad inicial (m/s) y gravedad: ~1 m de alto y ~0,75 s en el aire. */
export const JUMP_V = 5.2;
export const GRAVITY = 14;
/** Por encima de esta altura (m) se esquivan bananas y zancadillas. */
export const AIR_SAFE = 0.25;

// --- Zancadilla (Q) ---
/** Segundos con el pie fuera, recarga, distancia del pie y radio en el que tropieza alguien. */
export const TRIP_WINDOW = 0.6;
export const TRIP_CD = 2.5;
export const TRIP_FOOT = 0.65;
export const TRIP_R = 0.7;
/** Al que tropieza: aturdido, monedas que suelta y segundos que un NPC se queda en el suelo. */
export const TRIP_STUN = 1.3;
export const TRIP_DROP = 3;
export const TRIP_NPC_STUN = 2.0;

// --- Baño (escondite) ---
/** Segundos máximos escondido y distancia a la que un NPC te ve entrar (y te saca). */
export const HIDE_MAX = 15;
export const HIDE_SEEN = 3;

// --- Bóveda en equipo ---
/** Segundos con los dos paneles ocupados, botín total (se reparte), recarga y lo que baja si alguien suelta. */
export const VAULT_TIME = 6;
export const VAULT_LOOT = 120;
export const VAULT_CD = 90;
export const VAULT_DECAY = 0.5;
/** El minijuego: la marca va y viene y hay que pararla en la zona buena. */
export const ROB_SPEED = 1.15;
export const ROB_ZONE = 0.24;

// --- Colores (estilo «Gamble With Your Friends»: ciruela y burdeos cálidos, crema y un naranja de cartel) ---
export { C_ACCENT, C_BG, C_DIM, C_GOLD, C_LINE, C_LOSE, C_PANEL, C_TEXT, C_WIN } from "../core/theme";
export const C_RED = [232, 62, 84] as const;
export const C_GREEN = [46, 189, 108] as const;
export const C_BLACK = [42, 45, 58] as const;
