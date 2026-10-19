// Objetos en el suelo: al romper un bloque sale su objeto, cae con gravedad y se queda girando hasta que
// el jugador pasa cerca. Solo existen en el equipo de cada jugador (no viajan por la red).
import type { World } from "./world";

export interface Drop {
  id: number;
  n: number;
  /** Usos que le quedan si es una herramienta. */
  dur?: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Segundos desde que apareció (no se puede recoger al principio). */
  age: number;
}

/** Tope de objetos en el suelo (los más viejos desaparecen). */
export const MAX_DROPS = 200;
const GRAVITY = 22;
const PICK_DELAY = 0.35;
const PICK_RADIUS = 1.5;
const LIFE = 300;

export class Drops {
  list: Drop[] = [];

  spawn(id: number, x: number, y: number, z: number, n = 1, dur?: number) {
    if (this.list.length >= MAX_DROPS) this.list.shift();
    this.list.push({
      id, n, dur, x, y, z, age: 0,
      vx: (Math.random() - 0.5) * 1.6, vy: 2.2, vz: (Math.random() - 0.5) * 1.6,
    });
  }

  /** Mueve los objetos (gravedad y choque con el mundo) y devuelve los que el jugador puede coger. */
  update(dt: number, w: World, px: number, py: number, pz: number): Drop[] {
    const near: Drop[] = [];
    const cy = py + 0.9;
    this.list = this.list.filter((d) => {
      d.age += dt;
      if (d.age > LIFE) return false;
      // Caída
      d.vy -= GRAVITY * dt;
      const ny = d.y + d.vy * dt;
      if (w.solidAt(Math.floor(d.x), Math.floor(ny), Math.floor(d.z))) {
        d.y = Math.floor(ny) + 1.01;
        d.vy = 0;
      } else {
        d.y = ny;
      }
      // Deriva con rozamiento
      d.vx *= 1 - Math.min(1, dt * 6);
      d.vz *= 1 - Math.min(1, dt * 6);
      const nx = d.x + d.vx * dt;
      if (!w.solidAt(Math.floor(nx), Math.floor(d.y), Math.floor(d.z))) d.x = nx;
      else d.vx = 0;
      const nz = d.z + d.vz * dt;
      if (!w.solidAt(Math.floor(d.x), Math.floor(d.y), Math.floor(nz))) d.z = nz;
      else d.vz = 0;
      // ¿A mano?
      if (d.age > PICK_DELAY && Math.hypot(d.x - px, d.y - cy, d.z - pz) < PICK_RADIUS) near.push(d);
      return true;
    });
    return near;
  }

  remove(d: Drop) {
    const i = this.list.indexOf(d);
    if (i >= 0) this.list.splice(i, 1);
  }

  clear() {
    this.list = [];
  }
}
