// Borrachos: NPC que llegan tambaleándose a una mesa, se desploman sobre ella y la bloquean un rato. Código
// puro (sin DOM ni red) que solo corre en el anfitrión; reutiliza el andar y los caminos de los demás NPC.
//
//   GONE (fuera) → WALK (va a su mesa) → SIT (la bloquea) → LEAVE (se marcha) → GONE
//                        un compañero lo «aparta» ──→ ASLEEP (dormido) → GROGGY → (otra mesa | LEAVE)
// Mientras duerme no bloquea nada; al despertar se recupera y puede volver. Todo es caricatura: nadie sufre.
import { DRUNK_GROGGY, DRUNK_TRAVEL_MAX, DRUNK_WALK } from "./balance";
import { NPC_OFF } from "./config";
import { walk, type Npc } from "./npc";
import { clampToHall, HALL, standSpot, tablePoint, TABLES, type Level } from "./world3d";

export const DR_GONE = 0;
export const DR_WALK = 1;
export const DR_SIT = 2;
export const DR_ASLEEP = 3;
export const DR_GROGGY = 4;
export const DR_LEAVE = 5;

/** Qué ha pasado en este fotograma (para que el anfitrión bloquee, desbloquee y avise). */
export const EV_NONE = 0;
export const EV_SAT = 1;
export const EV_LEFT_TABLE = 2;
export const EV_WOKE = 3;
export const EV_GONE = 4;

export interface Drunk extends Npc {
  /** Estado propio (DR_*). */
  ds: number;
  /** Mesa a la que va o en la que está (-1 = ninguna). */
  table: number;
  /** Reloj del estado: tiempo sentado, dormido o grogui. */
  timer: number;
  /** Segundos que lleva caminando hacia la mesa. */
  travel: number;
  /** Tiempo (s) que le toca bloquear la mesa cuando se siente. */
  blockFor: number;
}

/** Por dónde entran y salen (la puerta del vestíbulo, en cada piso). */
const DOOR: [number, number] = [0, HALL.d / 2 - 2.4];

export function makeDrunk(): Drunk {
  return {
    x: DOOR[0], z: DOOR[1], yaw: Math.PI, lv: 0, homeX: DOOR[0], homeZ: DOOR[1], homeYaw: 0, guard: false, route: -1,
    state: NPC_OFF, target: -1, t: 0, stun: 0, wp: 0, lookYaw: 0, wx: DOOR[0], wz: DOOR[1], repath: 0, boost: 0, focus: 1,
    sightMul: 1, chaseMul: 1, pause: 1, lure: 0, lureX: 0, lureZ: 0,
    ds: DR_GONE, table: -1, timer: 0, travel: 0, blockFor: 0,
  };
}

/** Dónde se desploma sobre la mesa y dónde cae al dormirse (junto a ella, del lado de los jugadores). */
export const slumpSpot = (table: number): [number, number] => tablePoint(TABLES[table], 0, 1.15);
const floorSpot = (table: number): [number, number] => tablePoint(TABLES[table], 1.7, 3.2);

/** ¿Está bloqueando su mesa? */
export const blocking = (d: Drunk) => d.ds === DR_SIT;
/** ¿Está en juego (se le ve y cuenta para el máximo)? */
export const alive = (d: Drunk) => d.ds !== DR_GONE;

/** Sale a escena rumbo a la mesa `table`. */
export function spawnDrunk(d: Drunk, table: number, blockFor: number) {
  const lv = TABLES[table].lv as Level;
  d.x = DOOR[0] + (Math.random() - 0.5) * 3;
  d.z = DOOR[1];
  d.lv = lv;
  d.yaw = Math.PI;
  d.ds = DR_WALK;
  d.table = table;
  d.timer = 0;
  d.travel = 0;
  d.blockFor = blockFor;
  d.repath = 0;
  d.wx = d.x;
  d.wz = d.z;
}

/** Cambia de mesa (al despertar con ganas de más). */
export function retarget(d: Drunk, table: number, blockFor: number) {
  d.ds = DR_WALK;
  d.table = table;
  d.lv = TABLES[table].lv as Level;
  d.travel = 0;
  d.blockFor = blockFor;
  d.repath = 0;
}

/** Se queda dormido `sleep` s en el suelo junto a su mesa. Devuelve si estaba bloqueándola. */
export function putToSleep(d: Drunk, sleep: number): boolean {
  const was = d.ds === DR_SIT;
  if (d.table >= 0 && d.ds === DR_SIT) [d.x, d.z] = floorSpot(d.table);
  d.ds = DR_ASLEEP;
  d.timer = sleep;
  return was;
}

/** Se marcha por la puerta. */
export function leave(d: Drunk) {
  d.ds = DR_LEAVE;
  d.repath = 0;
}

/**
 * Avanza al borracho. Devuelve un EV_* cuando ocurre algo que el anfitrión debe saber (se sienta, deja la mesa,
 * despierta o desaparece).
 */
export function tickDrunk(d: Drunk, dt: number): number {
  if (d.ds === DR_GONE) return EV_NONE;
  if (d.ds === DR_WALK) {
    d.travel += dt;
    const [sx, sz] = standSpot(TABLES[d.table]);
    const arrived = walk(d, sx, sz, DRUNK_WALK, dt) || Math.hypot(sx - d.x, sz - d.z) < 0.9;
    if (!arrived && d.travel < DRUNK_TRAVEL_MAX) return EV_NONE;
    // Llega (o se cansa de dar vueltas) y se desploma sobre la mesa.
    [d.x, d.z] = slumpSpot(d.table);
    d.yaw = TABLES[d.table].yaw;
    d.ds = DR_SIT;
    d.timer = d.blockFor;
    return EV_SAT;
  }
  if (d.ds === DR_SIT) {
    d.timer -= dt;
    if (d.timer > 0) return EV_NONE;
    // Se levanta y se aparta de la mesa antes de irse.
    [d.x, d.z] = floorSpot(d.table);
    d.ds = DR_LEAVE;
    return EV_LEFT_TABLE;
  }
  if (d.ds === DR_ASLEEP) {
    d.timer -= dt;
    if (d.timer > 0) return EV_NONE;
    d.ds = DR_GROGGY;
    d.timer = DRUNK_GROGGY;
    return EV_NONE;
  }
  if (d.ds === DR_GROGGY) {
    d.timer -= dt;
    return d.timer > 0 ? EV_NONE : EV_WOKE;
  }
  // DR_LEAVE
  const gone = walk(d, DOOR[0], DOOR[1], DRUNK_WALK * 1.4, dt) || Math.hypot(DOOR[0] - d.x, DOOR[1] - d.z) < 1.4;
  if (!gone) return EV_NONE;
  d.ds = DR_GONE;
  d.table = -1;
  [d.x, d.z] = clampToHall(DOOR[0], DOOR[1]);
  return EV_GONE;
}

/** Para el estado de red: `[x, z, giro, estado, mesa, piso, segundos del estado]`. */
export function snapDrunk(d: Drunk): number[] {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return [r2(d.x), r2(d.z), r2(d.yaw), d.ds, d.table, d.lv, Math.max(0, Math.round(d.timer * 10) / 10)];
}
