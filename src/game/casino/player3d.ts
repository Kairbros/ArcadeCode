// Muñeco del jugador en el casino: anda por el plano de la sala con giro tipo tanque (A/D o ← →), no
// atraviesa muebles ni paredes y no se mete dentro de otro jugador. Código puro para simularlo en Node.
import { BODY_R, RUN, TURN, WALK } from "./config";
import { clampToHall, type Collider } from "./world3d";

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
}

export interface Move3 {
  /** -1 atrás, 0 quieto, 1 adelante. */
  forward: number;
  /** -1 izquierda, 0, 1 derecha. */
  turn: number;
  run: boolean;
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
  const step = m.forward * speed * dt;
  const shoved = shove(b, dt, colliders);
  if (!step) return shoved;
  const dx = -Math.sin(b.yaw) * step;
  const dz = -Math.cos(b.yaw) * step;
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
