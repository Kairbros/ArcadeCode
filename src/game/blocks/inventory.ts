// Inventario de supervivencia: 9 ranuras de la barra (0–8) y 27 de la mochila (9–35), montones de hasta
// `max` según el objeto. Cada jugador lleva el suyo en su equipo (no viaja por la red).
import { itemInfo } from "./items";

export interface Stack {
  id: number;
  n: number;
}
export type Slot = Stack | null;

export const HOTBAR_SLOTS = 9;
export const INV_SLOTS = 36;

export class Inventory {
  slots: Slot[] = Array<Slot>(INV_SLOTS).fill(null);

  /** Mete `n` objetos (primero en montones del mismo tipo, luego en huecos). Devuelve los que no caben. */
  add(id: number, n: number, order = range(INV_SLOTS)): number {
    const max = itemInfo(id).max;
    for (const i of order) {
      const s = this.slots[i];
      if (n <= 0) break;
      if (s && s.id === id && s.n < max) {
        const k = Math.min(n, max - s.n);
        s.n += k;
        n -= k;
      }
    }
    for (const i of order) {
      if (n <= 0) break;
      if (!this.slots[i]) {
        const k = Math.min(n, max);
        this.slots[i] = { id, n: k };
        n -= k;
      }
    }
    return n;
  }

  /** Quita `n` de la ranura i. */
  take(i: number, n = 1) {
    const s = this.slots[i];
    if (!s) return;
    s.n -= n;
    if (s.n <= 0) this.slots[i] = null;
  }

  count(id: number): number {
    return this.slots.reduce((sum, s) => sum + (s?.id === id ? s.n : 0), 0);
  }
}

export function range(n: number, from = 0): number[] {
  return Array.from({ length: n }, (_, i) => from + i);
}
