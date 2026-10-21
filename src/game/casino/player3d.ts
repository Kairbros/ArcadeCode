// Muñeco del jugador en el casino: anda por el plano de la sala con giro tipo tanque (A/D o ← →), no
// atraviesa muebles ni paredes y no se mete dentro de otro jugador. Código puro para simularlo en Node.
import { BODY_R, GRAVITY, JUMP_V, RUN, STAMINA_MIN, STAMINA_REGEN, STAMINA_TIME, TURN, WALK } from "./config";
import { clampToHall, collidersAt, onStair, STAIR_COLLIDERS, stairHeight, STAIRS, type Collider, type Level } from "./world3d";

export interface Body3 {
  x: number;
  z: number;
  yaw: number;
  /** Metros andados (para balancear las piernas y el vaivén de la cabeza). */
  stride: number;
  /** Velocidad del empujón (m/s): la pone un golpe o un choque y se frena sola. */
  kx?: number;
  kz?: number;
  /** Cabeceo de la vista (rad; + arriba). Solo lo usa el jugador local. */
  pitch?: number;
  /** Altura del salto sobre el suelo (m) y su velocidad vertical. */
  y?: number;
  vy?: number;
  /** Piso en el que está (0 planta baja, 1 entrepiso). */
  lv?: Level;
  /** Escalera por la que va andando (índice en STAIRS) o -1: su altura (y) la da el peldaño que pisa. */
  st?: number;
}

/** Colisiones con las que anda este cuerpo: las de su piso o, en una escalera, solo sus paredes. */
export function bodyColliders(b: Body3): Collider[] {
  return (b.st ?? -1) >= 0 ? STAIR_COLLIDERS : collidersAt(b.lv ?? 0);
}

/**
 * Escaleras andando (se llama después de moverse): si ha entrado en una (por el pie desde abajo o por el
 * rellano desde el balcón), la altura sale del peldaño que pisa; al salir por arriba pasa al entrepiso y
 * al salir por abajo, a la planta baja. Mientras va por ella cuenta como planta baja con altura `y`.
 */
export function stairStep(b: Body3) {
  if ((b.st ?? -1) < 0) {
    const k = STAIRS.findIndex((st) => onStair(st, b.x, b.z));
    if (k < 0) return;
    const st = STAIRS[k];
    const onLanding = b.z >= st.landing[0] && b.z <= st.landing[1];
    // Desde el balcón solo se entra por el rellano; desde abajo, por el pie (las paredes impiden lo demás).
    if ((b.lv ?? 0) === 1 && !onLanding) return;
    b.st = k;
    b.lv = 0;
    b.vy = 0;
  }
  const st = STAIRS[b.st ?? 0];
  // Por abajo: otra vez en el suelo del salón.
  if (b.z > st.zBottom + 0.25) {
    b.st = -1;
    b.y = 0;
    return;
  }
  const onLanding = b.z <= st.landing[1];
  // Por arriba: del rellano al balcón del entrepiso.
  if (onLanding && st.side * b.x >= st.side * st.exitX) {
    b.st = -1;
    b.lv = 1;
    b.y = 0;
    return;
  }
  // Dentro de la escalera: entre sus barandillas (el rellano se abre hacia el balcón).
  const r = BODY_R;
  const outer = st.side < 0 ? st.exitX - 0.5 : st.x0 + r;
  const inner = st.side < 0 ? st.x1 - r : st.exitX + 0.5;
  if (onLanding) {
    b.x = Math.max(outer, Math.min(inner, b.x));
    b.z = Math.max(st.landing[0] + r, b.z);
  } else {
    b.x = Math.max(st.x0 + r, Math.min(st.x1 - r, b.x));
  }
  b.y = stairHeight(st, Math.max(b.z, st.zTop));
}

/** Salta si está en el suelo. Devuelve si ha saltado. */
export function jump(b: Body3): boolean {
  if ((b.y ?? 0) > 0) return false;
  b.vy = JUMP_V;
  b.y = 0.001;
  return true;
}

/** Gravedad del salto: sube, frena y cae al suelo. */
export function stepJump(b: Body3, dt: number) {
  if ((b.y ?? 0) <= 0 && (b.vy ?? 0) <= 0) return;
  b.vy = (b.vy ?? 0) - GRAVITY * dt;
  b.y = (b.y ?? 0) + b.vy * dt;
  if (b.y <= 0) {
    b.y = 0;
    b.vy = 0;
  }
}

export interface Move3 {
  /** -1 atrás, 0 quieto, 1 adelante. */
  forward: number;
  /** -1 izquierda, 0, 1 derecha: gira el cuerpo (solo flechas; el ratón mueve la vista). */
  turn: number;
  /** -1 izquierda, 0, 1 derecha: andar de lado (A/D) sin girar. */
  strafe?: number;
  run: boolean;
}

/**
 * Estamina para correr (Shift): se gasta corriendo y se recupera sin correr. Si se vacía, el jugador queda
 * agotado y no vuelve a correr hasta recuperar un poco: así las persecuciones se pueden perder.
 * La lleva cada equipo para su propio muñeco (los invitados son dueños de su posición).
 */
export class Stamina {
  value = 1;
  tired = false;

  /** Avanza un fotograma. Devuelve si de verdad corre (quiere, se mueve y le queda aguante). */
  step(want: boolean, moving: boolean, dt: number): boolean {
    if (this.tired && this.value >= STAMINA_MIN) this.tired = false;
    const run = want && moving && !this.tired;
    if (run) {
      this.value = Math.max(0, this.value - dt / STAMINA_TIME);
      if (this.value === 0) this.tired = true;
    } else {
      this.value = Math.min(1, this.value + dt / STAMINA_REGEN);
    }
    return run;
  }
}

/** ¿Choza el cuerpo (círculo) con alguna caja? */
export function blocked(x: number, z: number, colliders: Collider[]): boolean {
  for (const c of colliders) {
    const dx = Math.max(Math.abs(x - c.x) - c.w / 2, 0);
    const dz = Math.max(Math.abs(z - c.z) - c.d / 2, 0);
    if (dx * dx + dz * dz < BODY_R * BODY_R) return true;
  }
  return false;
}

/** Avanza un fotograma. Devuelve lo que se ha andado (para la animación). */
export function stepPlayer(b: Body3, m: Move3, dt: number, colliders: Collider[], others: readonly Body3[] = []): number {
  // Ojo con el signo: el muñeco mira al -Z, así que girar a la derecha (turn +1) es RESTAR al giro.
  b.yaw -= m.turn * TURN * dt;
  const speed = m.run ? RUN : WALK;
  let fwd = m.forward;
  let side = m.strafe ?? 0;
  // En diagonal no se corre más: se reparte la velocidad.
  if (fwd && side) {
    fwd *= Math.SQRT1_2;
    side *= Math.SQRT1_2;
  }
  const step = fwd * speed * dt;
  const stepSide = side * speed * dt;
  const shoved = shove(b, dt, colliders);
  if (!step && !stepSide) return shoved;
  // Adelante = hacia donde mira (-Z del muñeco); derecha = perpendicular a la mirada.
  const dx = -Math.sin(b.yaw) * step + Math.cos(b.yaw) * stepSide;
  const dz = -Math.cos(b.yaw) * step - Math.sin(b.yaw) * stepSide;
  const [x0, z0] = [b.x, b.z];
  // Eje a eje: así se desliza por las paredes (y por los demás) en vez de quedarse clavado.
  const nx = b.x + dx;
  if (!blocked(nx, b.z, colliders) && !touches(nx, b.z, others, b)) b.x = nx;
  const nz = b.z + dz;
  if (!blocked(b.x, nz, colliders) && !touches(b.x, nz, others, b)) b.z = nz;
  [b.x, b.z] = clampToHall(b.x, b.z);
  const moved = Math.hypot(b.x - x0, b.z - z0);
  b.stride += moved;
  return moved + shoved;
}

/** Aplica el empujón que lleve el cuerpo y lo frena. Devuelve lo andado. */
export function shove(b: Body3, dt: number, colliders: Collider[]): number {
  const kx = b.kx ?? 0;
  const kz = b.kz ?? 0;
  if (!kx && !kz) return 0;
  const [x0, z0] = [b.x, b.z];
  const nx = b.x + kx * dt;
  if (!blocked(nx, b.z, colliders)) b.x = nx;
  const nz = b.z + kz * dt;
  if (!blocked(b.x, nz, colliders)) b.z = nz;
  [b.x, b.z] = clampToHall(b.x, b.z);
  // Frenado fuerte: el empujón dura unas décimas.
  const damp = Math.max(0, 1 - dt * 7);
  b.kx = Math.abs(kx * damp) < 0.05 ? 0 : kx * damp;
  b.kz = Math.abs(kz * damp) < 0.05 ? 0 : kz * damp;
  const moved = Math.hypot(b.x - x0, b.z - z0);
  b.stride += moved;
  return moved;
}

/** ¿La posición (x, z) pisa a otro jugador? Sirve para no atravesarlo. */
export function touches(x: number, z: number, others: readonly Body3[], skip: Body3): boolean {
  for (const o of others) {
    if (o === skip) continue;
    if (Math.hypot(x - o.x, z - o.z) < BODY_R * 2) return true;
  }
  return false;
}
