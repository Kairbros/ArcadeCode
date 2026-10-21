// Objetos tirados en el suelo (supervivencia). Solo los simula el anfitrión: caen, se apoyan en los
// bloques, se juntan con otros iguales y caducan. Él decide quién recoge cada uno, así que nunca se
// duplican ni se pierden; los invitados solo los dibujan.
import { WATER } from "./blocks";
import { itemInfo } from "./items";
import type { World } from "./world";

export interface Drop {
  id: number;
  item: number;
  n: number;
  x: number;
  y: number; // centro del cubito
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  /** Jugador que lo tiró (-1 = salió de un bloque): tarda más en poder recogerlo él. */
  owner: number;
}

export interface Picker {
  index: number;
  x: number; // pies
  y: number;
  z: number;
}

const HALF = 0.125; // medio lado del cubito
const GRAVITY = 20;
const PICK_RADIUS = 1.5;
const PICK_DELAY = 0.4; // segundos antes de poder recogerlo
const OWNER_DELAY = 1.5; // quien lo tira espera más (si no, lo recogería al momento)
const LIFETIME = 300;
const MERGE_RADIUS = 0.6;
export const MAX_DROPS = 96;

export class Drops {
  list: Drop[] = [];
  private next = 1;

  spawn(item: number, n: number, x: number, y: number, z: number, vx?: number, vy = 3, vz?: number, owner = -1) {
    const a = Math.random() * Math.PI * 2;
    this.list.push({
      id: this.next++, item, n, x, y, z, vx: vx ?? Math.cos(a) * 1.2, vy, vz: vz ?? Math.sin(a) * 1.2, age: 0, owner,
    });
    if (this.list.length > MAX_DROPS) this.list.shift(); // el más viejo desaparece
  }

  update(dt: number, w: World) {
    for (const d of this.list) {
      d.age += dt;
      const inWater = w.get(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)) === WATER;
      d.vy -= (inWater ? 4 : GRAVITY) * dt;
      if (inWater) d.vy = Math.max(d.vy, -1.5);
      // Horizontal: se para contra los bloques.
      const nx = d.x + d.vx * dt, nz = d.z + d.vz * dt;
      if (w.solidAt(Math.floor(nx), Math.floor(d.y - HALF), Math.floor(d.z))) d.vx = 0;
      else d.x = nx;
      if (w.solidAt(Math.floor(d.x), Math.floor(d.y - HALF), Math.floor(nz))) d.vz = 0;
      else d.z = nz;
      // Vertical: se apoya encima del bloque o choca con el de arriba.
      const ny = d.y + d.vy * dt;
      let ground = false;
      if (d.vy < 0 && w.solidAt(Math.floor(d.x), Math.floor(ny - HALF), Math.floor(d.z))) {
        d.y = Math.floor(ny - HALF) + 1 + HALF;
        d.vy = 0;
        ground = true;
      } else if (d.vy > 0 && w.solidAt(Math.floor(d.x), Math.floor(ny + HALF), Math.floor(d.z))) {
        d.vy = 0;
      } else {
        d.y = ny;
      }
      // Si le ponen un bloque encima, sube a la superficie.
      if (w.solidAt(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)) && d.y >= 0) d.y = Math.floor(d.y) + 1 + HALF;
      const fr = Math.exp(-(ground ? 8 : 0.5) * dt);
      d.vx *= fr;
      d.vz *= fr;
    }
    this.list = this.list.filter((d) => d.age < LIFETIME && d.y > -5 && d.n > 0);
    this.merge();
  }

  /** Junta montones iguales que están juntos (menos objetos que mover y que dibujar). */
  private merge() {
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      const max = itemInfo(a.item).max;
      if (a.n >= max || a.age < PICK_DELAY) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (b.item !== a.item || b.n <= 0 || b.age < PICK_DELAY) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > MERGE_RADIUS) continue;
        const k = Math.min(b.n, max - a.n);
        a.n += k;
        b.n -= k;
        if (a.n >= max) break;
      }
    }
    this.list = this.list.filter((d) => d.n > 0);
  }

  /**
   * Reparte los objetos cercanos. `take(index, item, n)` mete en el inventario de ese jugador lo que
   * quepa y devuelve cuántos se ha quedado; el resto sigue en el suelo.
   */
  collect(players: Picker[], take: (index: number, item: number, n: number) => number) {
    for (const d of this.list) {
      for (const p of players) {
        const wait = p.index === d.owner ? OWNER_DELAY : PICK_DELAY;
        if (d.age < wait || d.n <= 0) continue;
        const dy = d.y - (p.y + 0.9);
        if (Math.hypot(d.x - p.x, d.z - p.z) > PICK_RADIUS || Math.abs(dy) > 1.4) continue;
        d.n -= take(p.index, d.item, d.n);
      }
    }
    this.list = this.list.filter((d) => d.n > 0);
  }
}
