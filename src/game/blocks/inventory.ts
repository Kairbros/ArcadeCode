// Inventario de la supervivencia: 9 casillas de barra rápida + 27 de mochila. Los montones se apilan
// por objeto (los que no se apilan, como las herramientas, ocupan una casilla cada uno).
import { itemInfo } from "./items";

export interface Stack {
  id: number;
  n: number;
  /** Usos que le quedan (solo herramientas). */
  dur?: number;
}

export const HOTBAR_SIZE = 9;
export const BACKPACK_SIZE = 27;

/** Una casilla concreta (para que la interfaz pueda leerla y escribirla). */
export interface SlotRef {
  list: (Stack | null)[];
  i: number;
}

export class Inventory {
  readonly hotbar: (Stack | null)[] = Array<Stack | null>(HOTBAR_SIZE).fill(null);
  readonly main: (Stack | null)[] = Array<Stack | null>(BACKPACK_SIZE).fill(null);
  sel = 0;

  get held(): Stack | null {
    return this.hotbar[this.sel] ?? null;
  }

  /** Todas las casillas: primero la mochila y después la barra (así se dibuja y se recorre). */
  slots(): SlotRef[] {
    const out: SlotRef[] = [];
    for (let i = 0; i < this.main.length; i++) out.push({ list: this.main, i });
    for (let i = 0; i < this.hotbar.length; i++) out.push({ list: this.hotbar, i });
    return out;
  }

  /** Añade objetos y devuelve cuántos no han cabido. */
  add(id: number, n: number, dur?: number): number {
    const info = itemInfo(id);
    if (!info || n <= 0) return n;
    let left = n;
    if (info.stack > 1) {
      for (const list of [this.hotbar, this.main]) {
        for (const s of list) {
          if (!s || s.id !== id || s.n >= info.stack) continue;
          const take = Math.min(info.stack - s.n, left);
          s.n += take;
          left -= take;
          if (!left) return 0;
        }
      }
    }
    for (const list of [this.hotbar, this.main]) {
      for (let i = 0; i < list.length; i++) {
        if (list[i]) continue;
        const take = Math.min(info.stack, left);
        list[i] = info.stack > 1 ? { id, n: take } : { id, n: 1, dur: dur ?? info.tool?.dur };
        left -= take;
        if (!left) return 0;
      }
    }
    return left;
  }

  count(id: number): number {
    let n = 0;
    for (const list of [this.hotbar, this.main]) for (const s of list) if (s && s.id === id) n += s.n;
    return n;
  }

  /** Quita `n` unidades de un objeto; false si no había tantas. */
  take(id: number, n: number): boolean {
    if (this.count(id) < n) return false;
    let left = n;
    for (const list of [this.hotbar, this.main]) {
      for (let i = 0; i < list.length && left > 0; i++) {
        const s = list[i];
        if (!s || s.id !== id) continue;
        const take = Math.min(s.n, left);
        s.n -= take;
        left -= take;
        if (s.n <= 0) list[i] = null;
      }
    }
    return true;
  }

  /** Gasta unidades del objeto en la mano. */
  consumeHeld(n = 1) {
    const s = this.hotbar[this.sel];
    if (!s) return;
    s.n -= n;
    if (s.n <= 0) this.hotbar[this.sel] = null;
  }

  /** Desgasta la herramienta en la mano; si se rompe, la casilla queda vacía. */
  damageHeld(n = 1) {
    const s = this.hotbar[this.sel];
    if (!s || s.dur === undefined) return;
    s.dur -= n;
    if (s.dur <= 0) this.hotbar[this.sel] = null;
  }

  /** Copia otra mochila encima (al cargar la partida). */
  replaceWith(other: Inventory) {
    for (let i = 0; i < this.hotbar.length; i++) this.hotbar[i] = other.hotbar[i] ?? null;
    for (let i = 0; i < this.main.length; i++) this.main[i] = other.main[i] ?? null;
    this.sel = other.sel;
  }

  clear() {
    for (const list of [this.hotbar, this.main]) list.fill(null);
  }

  toJSON(): { hotbar: (Stack | null)[]; main: (Stack | null)[]; sel: number } {
    const clean = (list: (Stack | null)[]) =>
      list.map((s) => (s ? (s.dur === undefined ? { id: s.id, n: s.n } : { id: s.id, n: s.n, dur: s.dur }) : null));
    return { hotbar: clean(this.hotbar), main: clean(this.main), sel: this.sel };
  }

  static fromJSON(raw: unknown): Inventory {
    const inv = new Inventory();
    const data = raw as { hotbar?: unknown; main?: unknown; sel?: unknown } | null;
    if (!data) return inv;
    const load = (src: unknown, dst: (Stack | null)[]) => {
      if (!Array.isArray(src)) return;
      src.forEach((v, i) => {
        if (i >= dst.length) return;
        const s = v as Partial<Stack> | null;
        if (!s || typeof s.id !== "number" || typeof s.n !== "number" || !itemInfo(s.id) || s.n <= 0) return;
        dst[i] = { id: s.id, n: Math.min(s.n, itemInfo(s.id)!.stack), dur: typeof s.dur === "number" ? s.dur : undefined };
      });
    };
    load(data.hotbar, inv.hotbar);
    load(data.main, inv.main);
    inv.sel = typeof data.sel === "number" && data.sel >= 0 && data.sel < inv.hotbar.length ? data.sel : 0;
    return inv;
  }
}

/** Copia un montón (para el montón del cursor en la interfaz). */
export function cloneStack(s: Stack): Stack {
  return { id: s.id, n: s.n, dur: s.dur };
}
