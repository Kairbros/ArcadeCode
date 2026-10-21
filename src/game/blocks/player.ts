// Física del jugador: caja de colisión contra los bloques, eje a eje; nado y vuelo.
// Los animales usan la misma con su tamaño y su velocidad.
import { WATER } from "./blocks";
import {
  FLY, GRAVITY, HALF_W, HEIGHT, JUMP_V, SWIM_V, WALK, WATER_GRAVITY,
} from "./config";
import type { World } from "./world";

/** Caja de colisión: media anchura y altura (pies en y). */
export interface Size {
  hw: number;
  h: number;
}

const PLAYER: Size = { hw: HALF_W, h: HEIGHT };

export interface Body {
  x: number; // centro de los pies
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ground: boolean;
  inWater: boolean;
  flying: boolean;
}

export interface Move {
  /** Hacia delante y a la derecha, cada uno en -1..1, relativo a la mirada (guiñada). */
  forward: number;
  right: number;
  yaw: number;
  jump: boolean; // mantenido: salta, nada hacia arriba o sube volando
  down: boolean; // baja volando
  /** Velocidad al andar (por defecto, la del jugador). */
  speed?: number;
}

export function makeBody(x: number, y: number, z: number): Body {
  return { x, y, z, vx: 0, vy: 0, vz: 0, ground: false, inWater: false, flying: false };
}

/** ¿La caja del jugador (o de tamaño `s`) en (x, y, z) se mete en algún bloque sólido? */
export function collides(w: World, x: number, y: number, z: number, s = PLAYER): boolean {
  const x0 = Math.floor(x - s.hw), x1 = Math.floor(x + s.hw - 1e-6);
  const y0 = Math.floor(y), y1 = Math.floor(y + s.h - 1e-6);
  const z0 = Math.floor(z - s.hw), z1 = Math.floor(z + s.hw - 1e-6);
  for (let by = y0; by <= y1; by++) {
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) if (w.solidAt(bx, by, bz)) return true;
    }
  }
  return false;
}

/** ¿La caja del jugador ocupa la casilla (bx, by, bz)? (para no ponerse un bloque encima) */
export function overlapsCell(b: { x: number; y: number; z: number }, bx: number, by: number, bz: number): boolean {
  return b.x + HALF_W > bx && b.x - HALF_W < bx + 1 && b.y + HEIGHT > by && b.y < by + 1 && b.z + HALF_W > bz && b.z - HALF_W < bz + 1;
}

export function stepBody(b: Body, m: Move, w: World, dt: number, s = PLAYER) {
  b.inWater = w.get(Math.floor(b.x), Math.floor(b.y + 0.4), Math.floor(b.z)) === WATER;
  // Dirección deseada en el mundo: la cámara mira hacia −z con guiñada 0.
  const sin = Math.sin(m.yaw), cos = Math.cos(m.yaw);
  let wx = -sin * m.forward + cos * m.right;
  let wz = -cos * m.forward - sin * m.right;
  const len = Math.hypot(wx, wz);
  if (len > 1) {
    wx /= len;
    wz /= len;
  }
  const walk = m.speed ?? WALK;
  const speed = b.flying ? FLY : b.inWater ? walk * 0.6 : walk;
  // Se acerca a la velocidad deseada: rápido en el suelo, más suave en el aire.
  const grip = Math.min(1, (b.ground || b.flying ? 14 : 4) * dt);
  b.vx += (wx * speed - b.vx) * grip;
  b.vz += (wz * speed - b.vz) * grip;

  if (b.flying) {
    const target = (m.jump ? 1 : 0) - (m.down ? 1 : 0);
    b.vy += (target * FLY * 0.8 - b.vy) * Math.min(1, 10 * dt);
  } else if (b.inWater) {
    b.vy -= WATER_GRAVITY * dt;
    if (m.jump) b.vy = Math.max(b.vy, SWIM_V);
    b.vy = Math.max(b.vy, -3);
  } else {
    b.vy -= GRAVITY * dt;
    if (m.jump && b.ground) b.vy = JUMP_V;
    b.vy = Math.max(b.vy, -40);
  }

  // Movimiento eje a eje: si choca, se queda pegado a la cara del bloque.
  b.ground = false;
  b.x = slide(w, b, "x", b.vx * dt, s);
  b.z = slide(w, b, "z", b.vz * dt, s);
  const before = b.vy;
  b.y = slide(w, b, "y", b.vy * dt, s);
  if (b.vy === 0 && before < 0) {
    b.ground = true;
    if (b.flying) b.flying = false; // al tocar suelo volando se aterriza
  }
}

/** Mueve un eje en pasos de como mucho medio bloque; si choca, se detiene junto al bloque. */
function slide(w: World, b: Body, axis: "x" | "y" | "z", delta: number, s: Size): number {
  const vKey = axis === "x" ? "vx" : axis === "y" ? "vy" : "vz";
  let pos = b[axis];
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.45));
  const d = delta / steps;
  for (let i = 0; i < steps; i++) {
    const next = pos + d;
    const [x, y, z] = axis === "x" ? [next, b.y, b.z] : axis === "y" ? [b.x, next, b.z] : [b.x, b.y, next];
    if (!collides(w, x, y, z, s)) {
      pos = next;
      continue;
    }
    // Pegado a la cara: el borde de la caja justo en la frontera entera.
    if (axis === "y") pos = d < 0 ? Math.floor(pos + 1e-6) : Math.ceil(pos + s.h - 1e-6) - s.h - 1e-4;
    else pos = d < 0 ? Math.floor(pos - s.hw + 1e-6) + s.hw + 1e-4 : Math.ceil(pos + s.hw - 1e-6) - s.hw - 1e-4;
    b[vKey] = 0;
    break;
  }
  return pos;
}
