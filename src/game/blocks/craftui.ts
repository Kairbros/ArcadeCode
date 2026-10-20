// Pantalla de inventario y crafteo (supervivencia), con ratón como en Minecraft:
// - Clic izquierdo: coger el montón / dejarlo / juntarlo / cambiarlo por el que llevas.
// - Clic derecho: coger la mitad / dejar uno.
// - Mayús + clic: mandar el montón a la otra parte (barra ↔ mochila, cuadrícula → inventario);
//   en el resultado, fabricar todos los que se pueda; desde el inventario con el horno abierto, a la entrada
//   (si se funde) o al combustible.
// La misma pantalla sirve para el horno: sus ranuras (entrada, combustible) hacen de cuadrícula y la salida de
// resultado; lo que hay dentro se queda en el horno al cerrar.
// La lógica (Crafter) no toca el DOM; el dibujo usa solo el contexto 2D.
import { badge, fitText, panel, shadowText, text, type Ctx } from "../core/draw";
import { VH, VW } from "./config";
import { craftResult } from "./crafting";
import { FUEL, FUEL_SLOT, IN, OUT, SMELT, SMELT_TIME, type Furnace } from "./furnace";
import { drawItemIcon } from "./icons";
import { HOTBAR_SLOTS, INV_SLOTS, Inventory, range, type Slot, type Stack } from "./inventory";
import { itemInfo } from "./items";

export type Target = { kind: "inv"; i: number } | { kind: "grid"; i: number } | { kind: "out" };
/** Inventario (2×2), mesa de trabajo (3×3) u horno. */
export type CraftKind = 2 | 3 | "furnace";

const CELL = 18;
const PANEL_W = 176;
const PANEL_H = 162;

interface Rect {
  x: number;
  y: number;
  t: Target;
}

/** Posición de cada ranura en pantalla (unidades lógicas), para dibujar y para saber dónde se hace clic. */
export function layout(size: CraftKind): { x0: number; y0: number; rects: Rect[]; out: Rect } {
  const x0 = Math.round((VW - PANEL_W) / 2), y0 = Math.round((VH - PANEL_H) / 2);
  const rects: Rect[] = [];
  if (size === "furnace") {
    // Entrada arriba y combustible abajo, con la llama en medio.
    rects.push({ x: x0 + 52, y: y0 + 16, t: { kind: "grid", i: IN } }, { x: x0 + 52, y: y0 + 16 + 2 * CELL, t: { kind: "grid", i: FUEL_SLOT } });
  } else {
    const gx = x0 + (size === 3 ? 22 : 40), gy = y0 + 16 + (size === 3 ? 0 : 9);
    for (let i = 0; i < size * size; i++) rects.push({ x: gx + (i % size) * CELL, y: gy + Math.floor(i / size) * CELL, t: { kind: "grid", i } });
  }
  const out: Rect = { x: x0 + 122, y: y0 + 16 + CELL, t: { kind: "out" } };
  const iy = y0 + 16 + 3 * CELL + 10;
  for (let i = HOTBAR_SLOTS; i < INV_SLOTS; i++) {
    const k = i - HOTBAR_SLOTS;
    rects.push({ x: x0 + 7 + (k % 9) * CELL, y: iy + Math.floor(k / 9) * CELL, t: { kind: "inv", i } });
  }
  for (let i = 0; i < HOTBAR_SLOTS; i++) rects.push({ x: x0 + 7 + i * CELL, y: iy + 3 * CELL + 5, t: { kind: "inv", i } });
  rects.push(out);
  return { x0, y0, rects, out };
}

export class Crafter {
  grid: Slot[];
  cursor: Slot = null;

  constructor(readonly size: CraftKind, readonly furnace: Furnace | null = null) {
    // El horno guarda sus ranuras: la pantalla trabaja directamente sobre ellas.
    this.grid = furnace ? furnace.slots : Array<Slot>((size as number) * (size as number)).fill(null);
  }

  get result(): Stack | null {
    if (this.furnace) return this.furnace.slots[OUT];
    return craftResult(this.grid.map((s) => s?.id ?? 0), this.size as number);
  }

  /** Ranura bajo el punto (x, y), o null. */
  hit(x: number, y: number): Target | null {
    const r = layout(this.size).rects.find((r) => x >= r.x && x < r.x + CELL - 1 && y >= r.y && y < r.y + CELL - 1);
    return r?.t ?? null;
  }

  /** Devuelve lo que se tira al suelo (clic fuera del panel con algo en la mano), o null. */
  click(x: number, y: number, button: number, shift: boolean, inv: Inventory): Stack | null {
    const t = this.hit(x, y);
    if (!t) {
      const { x0, y0 } = layout(this.size);
      const outside = x < x0 || y < y0 || x > x0 + PANEL_W || y > y0 + PANEL_H;
      const c = this.cursor;
      if (!outside || !c) return null;
      // Fuera del panel: izquierdo tira el montón, derecho tira uno.
      const n = button === 2 ? 1 : c.n;
      c.n -= n;
      if (c.n <= 0) this.cursor = null;
      return { id: c.id, n };
    }
    this.apply(t, button, shift, inv);
    return null;
  }

  private apply(t: Target, button: number, shift: boolean, inv: Inventory) {
    if (t.kind === "out") return this.furnace ? this.takeOutput(inv, shift) : this.takeResult(inv, shift);
    const slots = t.kind === "inv" ? inv.slots : this.grid;
    if (shift && button === 0) return this.quickMove(t, inv);
    const s = slots[t.i];
    const c = this.cursor;
    if (button === 2) {
      // Derecho: coger la mitad, o dejar uno.
      if (!c && s) {
        const half = Math.ceil(s.n / 2);
        this.cursor = { id: s.id, n: half };
        s.n -= half;
        if (s.n <= 0) slots[t.i] = null;
      } else if (c && (!s || (s.id === c.id && s.n < itemInfo(c.id).max))) {
        if (s) s.n++;
        else slots[t.i] = { id: c.id, n: 1 };
        c.n--;
        if (c.n <= 0) this.cursor = null;
      }
      return;
    }
    // Izquierdo: coger, dejar, juntar o cambiar.
    if (!c) {
      this.cursor = s;
      slots[t.i] = null;
    } else if (!s) {
      slots[t.i] = c;
      this.cursor = null;
    } else if (s.id === c.id) {
      const k = Math.min(c.n, itemInfo(s.id).max - s.n);
      s.n += k;
      c.n -= k;
      if (c.n <= 0) this.cursor = null;
    } else {
      slots[t.i] = c;
      this.cursor = s;
    }
  }

  /** Mayús + clic: barra ↔ mochila; de la cuadrícula, al inventario. */
  private quickMove(t: Target, inv: Inventory) {
    if (t.kind === "out") return;
    const slots = t.kind === "inv" ? inv.slots : this.grid;
    const s = slots[t.i];
    if (!s) return;
    if (this.furnace && t.kind === "inv") {
      // Con el horno abierto: lo que se funde, a la entrada; el combustible, a su ranura.
      const dest = SMELT[s.id] ? IN : FUEL[s.id] ? FUEL_SLOT : -1;
      const d = dest >= 0 ? this.grid[dest] : null;
      if (dest >= 0 && (!d || d.id === s.id)) {
        const k = Math.min(s.n, itemInfo(s.id).max - (d?.n ?? 0));
        if (d) d.n += k;
        else this.grid[dest] = { id: s.id, n: k };
        s.n -= k;
        if (s.n <= 0) slots[t.i] = null;
        return;
      }
    }
    const order = t.kind === "grid" ? range(INV_SLOTS) : t.i < HOTBAR_SLOTS ? range(INV_SLOTS - HOTBAR_SLOTS, HOTBAR_SLOTS) : range(HOTBAR_SLOTS);
    slots[t.i] = null;
    const left = inv.add(s.id, s.n, order);
    if (left) slots[t.i] = { id: s.id, n: left };
  }

  /** Fabricar: gasta uno de cada ranura de la cuadrícula. Con Mayús, todos los posibles al inventario. */
  private takeResult(inv: Inventory, all: boolean) {
    for (let guard = 0; guard < 64; guard++) {
      const r = this.result;
      if (!r) return;
      if (all) {
        // Solo si cabe entero (si no, se deja de fabricar y no se pierde nada).
        const probe = new Inventory();
        probe.slots = inv.slots.map((s) => (s ? { ...s } : null));
        if (probe.add(r.id, r.n) > 0) return;
        inv.add(r.id, r.n);
      } else {
        const c = this.cursor;
        if (c && (c.id !== r.id || c.n + r.n > itemInfo(r.id).max)) return;
        this.cursor = c ? { id: c.id, n: c.n + r.n } : r;
      }
      this.grid.forEach((s, i) => {
        if (!s) return;
        s.n--;
        if (s.n <= 0) this.grid[i] = null;
      });
      if (!all) return;
    }
  }

  /** Coger lo que ha salido del horno (con Mayús, directo al inventario). */
  private takeOutput(inv: Inventory, shift: boolean) {
    const out = this.grid[OUT];
    if (!out) return;
    const c = this.cursor;
    if (shift) {
      const left = inv.add(out.id, out.n);
      this.grid[OUT] = left ? { id: out.id, n: left } : null;
    } else if (!c) {
      this.cursor = out;
      this.grid[OUT] = null;
    } else if (c.id === out.id) {
      const k = Math.min(out.n, itemInfo(c.id).max - c.n);
      c.n += k;
      out.n -= k;
      if (out.n <= 0) this.grid[OUT] = null;
    }
  }

  /**
   * Al cerrar, lo que quede en la cuadrícula y en la mano vuelve al inventario; lo que no cabe se tira.
   * Lo del horno se queda dentro.
   */
  close(inv: Inventory): Stack[] {
    const left: Stack[] = [];
    for (const s of [...(this.furnace ? [] : this.grid), this.cursor]) {
      if (!s) continue;
      const n = inv.add(s.id, s.n);
      if (n) left.push({ id: s.id, n });
    }
    if (!this.furnace) this.grid.fill(null);
    this.cursor = null;
    return left;
  }
}

function slotBox(ctx: Ctx, x: number, y: number, hover: boolean) {
  ctx.fillStyle = "#1a1a26";
  ctx.fillRect(x, y, CELL - 2, CELL - 2);
  ctx.fillStyle = "#4a4a60";
  ctx.fillRect(x + 1, y + CELL - 3, CELL - 3, 1);
  ctx.fillRect(x + CELL - 3, y + 1, 1, CELL - 3);
  if (hover) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x, y, CELL - 2, CELL - 2);
  }
}

const FLAME = ["...#...", "..##...", "..###..", ".####..", ".#####.", "#######", ".#####."];

/** Llama del horno: gris si está apagado y, encendido, llena hasta la fracción `k` (de abajo arriba). */
function drawFlame(ctx: Ctx, cx: number, cy: number, k: number) {
  const top = Math.ceil(7 * (1 - k));
  FLAME.forEach((row, y) => {
    for (let x = 0; x < 7; x++) {
      if (row[x] !== "#") continue;
      ctx.fillStyle = y >= top && k > 0 ? (y < 3 ? "#ffd84a" : "#ff8a1e") : "#3a3a4c";
      ctx.fillRect(cx - 3.5 + x * 1.2, cy - 4 + y * 1.2, 1.2, 1.2);
    }
  });
}

export function drawStack(ctx: Ctx, s: Stack, cx: number, cy: number) {
  drawItemIcon(ctx, cx, cy, 6, s.id);
  if (s.n > 1) shadowText(ctx, String(s.n), cx + 8, cy + 2, [255, 255, 255], "6px", "right");
}

export function drawCrafter(ctx: Ctx, c: Crafter, inv: Inventory, mouse: [number, number]) {
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, VW, VH);
  const { x0, y0, rects, out } = layout(c.size);
  panel(ctx, x0, y0, PANEL_W, PANEL_H, [255, 61, 139], 0.94);
  const title = c.furnace ? "HORNO" : c.size === 3 ? "MESA DE TRABAJO" : "INVENTARIO";
  text(ctx, title, x0 + 7, y0 + 5, [255, 207, 80], "7px");
  if (c.size === 2) text(ctx, "CREAR", x0 + 40, y0 + 15, [170, 170, 190], "5px");
  // Flecha hacia el resultado (en el horno se va llenando con lo que lleva fundido).
  const ay = out.y + CELL / 2 - 1;
  const arrow = (x: number, w: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, ay - 1, Math.min(w, 12), 3);
    for (let k = 0; k < 4 && 12 + k < w; k++) ctx.fillRect(x + 12 + k, ay - 3 + k, 1, 7 - k * 2);
  };
  arrow(x0 + 100, 16, c.furnace ? "#5a5a70" : "#c8c8dc");
  if (c.furnace) {
    arrow(x0 + 100, (16 * c.furnace.progress) / SMELT_TIME, "#ffffff");
    drawFlame(ctx, x0 + 52 + CELL / 2 - 1, y0 + 16 + CELL + CELL / 2 - 1, c.furnace.burnMax ? c.furnace.burn / c.furnace.burnMax : 0);
  }
  const hover = c.hit(...mouse);
  const result = c.result;
  let tip = "";
  for (const r of rects) {
    const isHover = !!hover && JSON.stringify(hover) === JSON.stringify(r.t);
    slotBox(ctx, r.x, r.y, isHover);
    const s = r.t.kind === "out" ? result : r.t.kind === "inv" ? inv.slots[r.t.i] : c.grid[r.t.i];
    if (s) {
      drawStack(ctx, s, r.x + CELL / 2 - 1, r.y + CELL / 2 - 1);
      if (isHover) tip = itemInfo(s.id).name;
    }
  }
  if (out) {
    // Marco del resultado más grueso.
    ctx.strokeStyle = "#ffcf50";
    ctx.lineWidth = 1;
    ctx.strokeRect(out.x - 1.5, out.y - 1.5, CELL + 1, CELL + 1);
  }
  text(ctx, "MOCHILA", x0 + 7, y0 + 16 + 3 * CELL + 3, [170, 170, 190], "5px");
  badge(ctx, x0 + PANEL_W - 10, y0 + 8, 3.5, [255, 61, 139], "E");
  text(ctx, "ESC/E CERRAR · MAYÚS+CLIC MOVER · CLIC FUERA TIRAR", x0 + PANEL_W / 2, y0 + PANEL_H + 4, [235, 235, 245], "5px", "center");
  if (tip && !c.cursor) {
    const w = Math.min(120, tip.length * 4.6 + 6);
    panel(ctx, mouse[0] + 6, mouse[1] - 12, w, 10, [120, 120, 140], 0.95);
    text(ctx, fitText(ctx, tip, w - 4, "6px"), mouse[0] + 8, mouse[1] - 10, [255, 255, 255], "6px");
  }
  // Lo que llevas en la mano sigue al puntero (con el puntero libre se ve el del sistema).
  if (c.cursor) drawStack(ctx, c.cursor, mouse[0], mouse[1]);
}
