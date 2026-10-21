// NPC del casino: un crupier por mesa y los guardias de ronda de los dos pisos. Código puro (sin DOM ni
// red) que solo corre en el anfitrión; los invitados reciben posición, giro y estado en el snapshot.
//
// Crupier: en su puesto → cada poco se distrae (de espaldas a la mesa: se le puede robar) → vuelve.
// Si le pegas o le intentas robar mirando, te persigue; si te alcanza, a la cárcel.
// Guardias: cada uno con su ronda en su piso; según el turno entran más de servicio. Si ven un delito en su
// cono de visión, persiguen al culpable. Los NPC no cambian de piso: quien huye por la escalera se le
// escapa a su perseguidor (el anfitrión avisa por radio a un guardia del otro piso).
import {
  CATCH_R, CHASE_TIME, CROUPIER_RUN, DISTRACT_MAX, DISTRACT_MIN, DISTRACT_TIME, GUARD_CHASE_TIME, GUARD_FOV, GUARD_RUN,
  GUARD_SIGHT, NPC_CHASE, NPC_DISTRACTED, NPC_HIT_STUN, NPC_IDLE, NPC_LURED, NPC_OFF, NPC_PATROL, NPC_RETURN, NPC_WALK,
} from "./config";
import { blocked } from "./player3d";
import { clampToHall, croupierSpot, HALL, npcCollidersAt, ROUTES, TABLES, type Level } from "./world3d";

export interface Npc {
  x: number;
  z: number;
  /** Hacia dónde mira (mismo convenio que los jugadores: adelante = −sin, −cos). */
  yaw: number;
  /** Piso en el que trabaja (no cambia). */
  lv: Level;
  /** Su puesto (crupier) o el primer punto de su ronda (guardia). */
  homeX: number;
  homeZ: number;
  homeYaw: number;
  guard: boolean;
  /** Ronda del guardia en ROUTES (-1 los crupieres). */
  route: number;
  state: number;
  /** Jugador al que persigue (-1 = nadie). */
  target: number;
  /** Reloj del estado: despiste, persecución o pausa de la ronda. */
  t: number;
  /** Atontado tras un golpe o una zancadilla (no se mueve). */
  stun: number;
  /** Guardia: punto de ronda al que va y hacia dónde miraba al pararse. */
  wp: number;
  lookYaw: number;
  /** Punto del camino al que va y segundos hasta volver a buscar camino. */
  wx: number;
  wz: number;
  repath: number;
  /** Dificultad del turno: velocidad extra al perseguir (guardias) y factor del despiste (crupieres). */
  boost: number;
  focus: number;
  /** Dificultad de la ronda: alcance de la vista (×), insistencia al perseguir (×) y pausa en cada punto de la ronda (s). */
  sightMul: number;
  chaseMul: number;
  pause: number;
  /** Timbre señuelo (guardias): segundos que le quedan acudiendo y adónde. */
  lure: number;
  lureX: number;
  lureZ: number;
}

/** Índice del primer guardia (van detrás de los crupieres, que siguen el orden de TABLES). */
export const GUARD_FIRST = TABLES.length;
/** ¿El NPC `k` es un guardia? */
export const isGuard = (k: number) => k >= GUARD_FIRST;

const r2 = (v: number) => Math.round(v * 100) / 100;
const between = (a: number, b: number) => a + Math.random() * (b - a);
const points = (n: Npc) => ROUTES[n.route].points;

export function makeNpcs(): Npc[] {
  const base = { target: -1, stun: 0, repath: 0, boost: 0, focus: 1, sightMul: 1, chaseMul: 1, pause: 1.8, lure: 0, lureX: 0, lureZ: 0 };
  const list: Npc[] = TABLES.map((def) => {
    const [x, z, yaw] = croupierSpot(def);
    return {
      ...base, x, z, yaw, lv: def.lv, homeX: x, homeZ: z, homeYaw: yaw, guard: false, route: -1,
      state: NPC_IDLE, t: between(DISTRACT_MIN, DISTRACT_MAX), wp: 0, lookYaw: yaw, wx: x, wz: z,
    };
  });
  ROUTES.forEach((r, k) => {
    const [x, z] = r.points[0];
    list.push({
      ...base, x, z, yaw: 0, lv: r.lv, homeX: x, homeZ: z, homeYaw: 0, guard: true, route: k,
      state: NPC_OFF, t: 0, wp: 1, lookYaw: 0, wx: x, wz: z,
    });
  });
  return list;
}

/** Vuelve al puesto o al principio de su ronda, como al empezar (los guardias, fuera de servicio). */
export function resetNpc(n: Npc) {
  n.x = n.homeX;
  n.z = n.homeZ;
  n.yaw = n.homeYaw;
  n.target = -1;
  n.stun = 0;
  n.repath = 0;
  n.state = n.guard ? NPC_OFF : NPC_IDLE;
  n.t = n.guard ? 0 : between(DISTRACT_MIN, DISTRACT_MAX);
  n.wp = 1;
  n.lure = 0;
}

/**
 * Pone de servicio a los primeros `count` guardias (entran por el principio de su ronda) y retira al
 * resto cuando no están ocupados persiguiendo a nadie.
 */
export function setGuardsOn(npcs: Npc[], count: number) {
  npcs.forEach((n, k) => {
    if (!n.guard) return;
    const on = k - GUARD_FIRST < count;
    if (on && n.state === NPC_OFF) {
      resetNpc(n);
      n.state = NPC_PATROL;
    } else if (!on && n.state !== NPC_OFF && n.state !== NPC_CHASE) {
      resetNpc(n);
    }
  });
}

/** Sale a por `player` (si ya le perseguía, se le renueva el tiempo). `stun`: le acaban de pegar. */
export function startChase(n: Npc, player: number, stun = false) {
  n.state = NPC_CHASE;
  n.target = player;
  n.t = (n.guard ? GUARD_CHASE_TIME : CHASE_TIME) * (n.guard ? n.chaseMul : 1);
  n.repath = 0;
  if (stun) n.stun = NPC_HIT_STUN;
}

/**
 * Timbre: los guardias de servicio de ese piso que no persiguen a nadie acuden a (x, z) y esperan allí `time`
 * segundos; luego retoman su ronda. Devuelve cuántos han acudido.
 */
export function lureGuards(npcs: readonly Npc[], lv: Level, x: number, z: number, time: number): number {
  let count = 0;
  for (const n of npcs) {
    if (!n.guard || n.lv !== lv || n.state === NPC_OFF || n.state === NPC_CHASE) continue;
    n.state = NPC_LURED;
    n.lure = time;
    n.lureX = x;
    n.lureZ = z;
    n.target = -1;
    n.repath = 0;
    count++;
  }
  return count;
}

/** ¿Está el punto dentro del cono de visión del NPC? (el piso lo comprueba quien llama). */
export function sees(n: Npc, x: number, z: number): boolean {
  if (n.state === NPC_OFF) return false;
  const dx = x - n.x;
  const dz = z - n.z;
  const d = Math.hypot(dx, dz);
  if (d > GUARD_SIGHT * n.sightMul) return false;
  if (d < 0.5) return true;
  return (dx * -Math.sin(n.yaw) + dz * -Math.cos(n.yaw)) / d > Math.cos(GUARD_FOV);
}

/** NPC de servicio más cercano delante de (x, z, yaw) en ese piso, dentro del alcance y del medio cono `arc`. */
export function npcInFront(npcs: readonly Npc[], x: number, z: number, yaw: number, reach: number, arc: number, lv: Level = 0): number {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let best = -1;
  let bestD = reach;
  npcs.forEach((n, k) => {
    if (n.state === NPC_OFF || n.lv !== lv) return;
    const dx = n.x - x;
    const dz = n.z - z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.01) return;
    if ((dx * fx + dz * fz) / d < Math.cos(arc)) return;
    bestD = d;
    best = k;
  });
  return best;
}

// --- Caminos ---------------------------------------------------------------------------------
// Cada piso se parte en una rejilla de 0,5 m (se calcula una vez: los muebles no se mueven) y se busca el
// camino en anchura. Así el NPC rodea las mesas, las columnas y el hueco central del entrepiso. Las
// escaleras y sus rellanos cuentan como pared para ellos: no cambian de piso.
const CELL = 0.5;
const GW = Math.round(HALL.w / CELL);
const GD = Math.round(HALL.d / CELL);
const cellX = (g: number) => -HALL.w / 2 + (g + 0.5) * CELL;
const cellZ = (g: number) => -HALL.d / 2 + (g + 0.5) * CELL;
const gridX = (x: number) => Math.max(0, Math.min(GW - 1, Math.floor((x + HALL.w / 2) / CELL)));
const gridZ = (z: number) => Math.max(0, Math.min(GD - 1, Math.floor((z + HALL.d / 2) / CELL)));
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
/** Celdas por las que se puede andar (1) en cada piso y de dónde se llegó a cada una en la última búsqueda. */
const open: (Uint8Array | null)[] = [null, null];
const prev = new Int32Array(GW * GD);

function grid(lv: Level): Uint8Array {
  let g = open[lv];
  if (!g) {
    g = new Uint8Array(GW * GD);
    const mx = HALL.w / 2 - 0.8;
    const mz = HALL.d / 2 - 0.8;
    const cols = npcCollidersAt(lv);
    for (let gz = 0; gz < GD; gz++) {
      for (let gx = 0; gx < GW; gx++) {
        const x = cellX(gx);
        const z = cellZ(gz);
        g[gz * GW + gx] = Math.abs(x) <= mx && Math.abs(z) <= mz && !blocked(x, z, cols) ? 1 : 0;
      }
    }
    open[lv] = g;
  }
  return g;
}

/** ¿Se puede ir en línea recta de A a B sin rozar muebles? (se mira cada 0,2 m). */
function clear(lv: Level, ax: number, az: number, bx: number, bz: number): boolean {
  const cols = npcCollidersAt(lv);
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    if (blocked(ax + (bx - ax) * k, az + (bz - az) * k, cols)) return false;
  }
  return true;
}

/** Punto al que andar ahora para llegar de (fx, fz) a (tx, tz): el más lejano del camino que se ve recto. */
function route(lv: Level, fx: number, fz: number, tx: number, tz: number): [number, number] {
  const g = grid(lv);
  const start = gridZ(fz) * GW + gridX(fx);
  // El destino puede caer en una celda cerrada (alguien pegado a una mesa): se acepta igualmente.
  const goal = gridZ(tz) * GW + gridX(tx);
  prev.fill(-1);
  prev[start] = start;
  const queue = [start];
  let found = false;
  for (let qi = 0; qi < queue.length && !found; qi++) {
    const c = queue[qi];
    const x = c % GW;
    const z = (c - x) / GW;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= GW || nz >= GD) continue;
      const ni = nz * GW + nx;
      if (prev[ni] >= 0 || (!g[ni] && ni !== goal)) continue;
      // En diagonal no se cortan esquinas de muebles.
      if (dx && dz && (!g[z * GW + nx] || !g[nz * GW + x])) continue;
      prev[ni] = c;
      queue.push(ni);
      if (ni === goal) {
        found = true;
        break;
      }
    }
  }
  if (!found) return [tx, tz];
  const path: number[] = [];
  for (let c = goal; c !== start; c = prev[c]) path.push(c);
  path.reverse();
  for (let i = Math.min(path.length, 14) - 1; i >= 0; i--) {
    const px = cellX(path[i] % GW);
    const pz = cellZ(Math.floor(path[i] / GW));
    if (i === 0 || clear(lv, fx, fz, px, pz)) return [px, pz];
  }
  return [tx, tz];
}

/** Anda hacia (tx, tz) siguiendo el camino. Devuelve true si ya ha llegado. */
export function walk(n: Npc, tx: number, tz: number, speed: number, dt: number): boolean {
  if (Math.hypot(tx - n.x, tz - n.z) < 0.15) return true;
  n.repath -= dt;
  if (n.repath <= 0 || Math.hypot(n.wx - n.x, n.wz - n.z) < 0.2) {
    [n.wx, n.wz] = clear(n.lv, n.x, n.z, tx, tz) ? [tx, tz] : route(n.lv, n.x, n.z, tx, tz);
    n.repath = 0.25;
  }
  const dx = n.wx - n.x;
  const dz = n.wz - n.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return false;
  const step = Math.min(d, speed * dt);
  const cols = npcCollidersAt(n.lv);
  // Eje a eje, como los jugadores: si roza una esquina, se desliza.
  const nx = n.x + (dx / d) * step;
  if (!blocked(nx, n.z, cols)) n.x = nx;
  const nz = n.z + (dz / d) * step;
  if (!blocked(n.x, nz, cols)) n.z = nz;
  [n.x, n.z] = clampToHall(n.x, n.z);
  n.yaw = Math.atan2(dx, dz) + Math.PI;
  return false;
}

/** Deja la persecución: el crupier vuelve a su mesa y el guardia al punto de su ronda más cercano. */
export function goHome(n: Npc) {
  n.state = NPC_RETURN;
  n.target = -1;
  if (!n.guard) return;
  const pts = points(n);
  let best = 0;
  pts.forEach(([x, z], k) => {
    if (Math.hypot(x - n.x, z - n.z) < Math.hypot(pts[best][0] - n.x, pts[best][1] - n.z)) best = k;
  });
  n.wp = best;
}

/**
 * Avanza un NPC. `bodies` son los jugadores y `valid(i)` dice si a ese todavía se le puede perseguir
 * (conectado, en el salón y en su mismo piso). Devuelve el jugador atrapado este fotograma o -1.
 */
export function tickNpc(n: Npc, dt: number, bodies: readonly { x: number; z: number }[], valid: (i: number) => boolean): number {
  if (n.state === NPC_OFF) return -1;
  n.stun = Math.max(0, n.stun - dt);
  if (n.state === NPC_CHASE) {
    n.t -= dt;
    if (n.target < 0 || !valid(n.target) || n.t <= 0) {
      goHome(n);
      return -1;
    }
    if (n.stun > 0) return -1;
    const b = bodies[n.target];
    walk(n, b.x, b.z, n.guard ? GUARD_RUN + n.boost : CROUPIER_RUN, dt);
    if (Math.hypot(b.x - n.x, b.z - n.z) > CATCH_R) return -1;
    const caught = n.target;
    goHome(n);
    return caught;
  }
  if (n.state === NPC_LURED) {
    n.lure -= dt;
    if (n.lure <= 0) {
      goHome(n);
      return -1;
    }
    // Acude deprisa y, ya en el timbre, se queda mirando a su alrededor.
    if (n.stun > 0) return -1;
    if (walk(n, n.lureX, n.lureZ, NPC_WALK * 1.5, dt)) n.yaw += Math.sin(n.lure * 2.2) * 0.02;
    return -1;
  }
  if (n.state === NPC_RETURN) {
    if (n.guard) {
      const [px, pz] = points(n)[n.wp];
      if (walk(n, px, pz, NPC_WALK, dt)) n.state = NPC_PATROL;
      return -1;
    }
    // El puesto del crupier está pegado a la mesa: a medio metro se le coloca de golpe.
    if (Math.hypot(n.homeX - n.x, n.homeZ - n.z) < 0.6 || walk(n, n.homeX, n.homeZ, NPC_WALK, dt)) {
      n.x = n.homeX;
      n.z = n.homeZ;
      n.yaw = n.homeYaw;
      n.state = NPC_IDLE;
      n.t = between(DISTRACT_MIN, DISTRACT_MAX);
    }
    return -1;
  }
  if (n.guard) {
    // Ronda: anda hasta el siguiente punto y allí se para a mirar a los lados.
    if (n.t > 0) {
      n.t -= dt;
      n.yaw = n.lookYaw + Math.sin(n.t * 2.2) * 0.9;
      return -1;
    }
    const pts = points(n);
    if (walk(n, pts[n.wp][0], pts[n.wp][1], NPC_WALK, dt)) {
      n.wp = (n.wp + 1) % pts.length;
      n.t = n.pause;
      n.lookYaw = n.yaw;
    }
    return -1;
  }
  // Crupier en su puesto: se distrae de vez en cuando (de espaldas a la mesa). Con los turnos, menos rato.
  n.t -= dt;
  if (n.t > 0) return -1;
  if (n.state === NPC_IDLE) {
    n.state = NPC_DISTRACTED;
    n.t = DISTRACT_TIME * n.focus;
    n.yaw = n.homeYaw + Math.PI;
  } else {
    n.state = NPC_IDLE;
    n.t = between(DISTRACT_MIN, DISTRACT_MAX);
    n.yaw = n.homeYaw;
  }
  return -1;
}

/** Estado de un NPC tal como viaja: `[x, z, giro, estado, objetivo, en el suelo 1/0, piso]`. */
export function snapNpc(n: Npc): number[] {
  return [r2(n.x), r2(n.z), r2(n.yaw), n.state, n.target, n.stun > 0 ? 1 : 0, n.lv];
}
