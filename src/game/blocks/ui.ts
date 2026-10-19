// Interfaz del inventario, la fabricación y el horno (solo supervivencia): un panel con la mochila a la
// izquierda y las recetas a la derecha, en dos pestañas (FABRICAR / HORNO). Se maneja con el ratón (un clic
// coge el montón, otro lo suelta) y no necesita rejilla de fabricación: en 320×240 se ve el precio de cada
// receta y se pulsa, que es más claro. Se ven 8 recetas por página (las 15 no caben) con flechas para pasar.
import { fitText, panel, shadowText, type Ctx } from "../core/draw";
import { canCraft, canSmelt, craft, RECIPES, SMELTING, smelt, type Recipe } from "./crafting";
import { drawItemIcon, drawSlot } from "./icons";
import type { Inventory, SlotRef, Stack } from "./inventory";
import { itemInfo, itemName } from "./items";

const CELL = 16;
const GAP = 1;
const PANEL = { x: 4, y: 30, w: 312, h: 176 };
const TITLE = "8px";
const SMALL = "6px";
const TINY = "5px";
/** Recetas que caben en una página. */
const PER_PAGE = 8;

export type UiTab = "craft" | "smelt";

interface CellBox {
  x: number;
  y: number;
  ref: SlotRef;
}

interface RecipeBox {
  x: number;
  y: number;
  w: number;
  h: number;
  i: number;
}

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TAB_CRAFT: Zone = { x: 168, y: 34, w: 62, h: 11 };
const TAB_SMELT: Zone = { x: 232, y: 34, w: 48, h: 11 };
const PREV: Zone = { x: 284, y: 34, w: 12, h: 11 };
const NEXT: Zone = { x: 298, y: 34, w: 12, h: 11 };

const hit = (z: Zone, x: number, y: number) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

/** Posición de cada casilla y de cada receta (la misma para dibujar y para el clic). */
function layout(inv: Inventory, tab: UiTab, page: number): { cells: CellBox[]; recipes: RecipeBox[] } {
  const cells: CellBox[] = [];
  const refs = inv.slots(); // 27 de mochila y luego 9 de barra
  const x0 = 10, y0 = 46;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 9; col++) {
      const ref = refs[row * 9 + col];
      if (ref) cells.push({ x: x0 + col * (CELL + GAP), y: y0 + row * (CELL + GAP), ref });
    }
  }
  const yBar = y0 + 3 * (CELL + GAP) + 5;
  for (let col = 0; col < 9; col++) {
    const ref = refs[27 + col];
    if (ref) cells.push({ x: x0 + col * (CELL + GAP), y: yBar, ref });
  }
  const from = page * PER_PAGE;
  const recipes: RecipeBox[] = list(tab)
    .slice(from, from + PER_PAGE)
    .map((_, i) => ({ x: 168, y: y0 + i * (CELL + GAP), w: 144, h: CELL, i: from + i }));
  return { cells, recipes };
}

export function list(tab: UiTab): Recipe[] {
  return tab === "craft" ? RECIPES : SMELTING;
}

export class BlocksUi {
  open = false;
  tab: UiTab = "craft";
  page = 0;
  /** Montón que lleva el ratón. */
  cursor: Stack | null = null;

  toggle() {
    this.open = !this.open;
  }

  /** ¿Se puede abrir el horno? (hace falta uno cerca) */
  get canSmeltTab(): boolean {
    return this.nearFurnace;
  }

  nearFurnace = false;

  private setTab(t: UiTab) {
    if (this.tab === t) return;
    this.tab = t;
    this.page = 0;
  }

  /** Cierra el panel; si llevas algo en el cursor y no cabe en la mochila, no se cierra. */
  close(inv: Inventory): boolean {
    if (this.cursor) {
      const left = inv.add(this.cursor.id, this.cursor.n, this.cursor.dur);
      if (left > 0) return false;
      this.cursor = null;
    }
    this.open = false;
    return true;
  }

  /** Un clic con el puntero libre (coordenadas lógicas). */
  click(x: number, y: number, inv: Inventory) {
    if (hit(TAB_CRAFT, x, y)) return this.setTab("craft");
    if (hit(TAB_SMELT, x, y)) {
      if (this.canSmeltTab) this.setTab("smelt");
      return;
    }
    const pages = Math.max(1, Math.ceil(list(this.tab).length / PER_PAGE));
    if (hit(PREV, x, y)) {
      this.page = (this.page + pages - 1) % pages;
      return;
    }
    if (hit(NEXT, x, y)) {
      this.page = (this.page + 1) % pages;
      return;
    }
    const { cells, recipes } = layout(inv, this.tab, this.page);
    for (const c of cells) {
      if (x < c.x || y < c.y || x > c.x + CELL || y > c.y + CELL) continue;
      this.move(c.ref, inv);
      return;
    }
    const all = list(this.tab);
    for (const r of recipes) {
      if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue;
      const recipe = all[r.i];
      if (!recipe) return;
      const ok = this.tab === "craft" ? craft(inv, recipe) : smelt(inv, recipe);
      if (ok) this.cursor = null;
      return;
    }
  }

  /** Coge, suelta, junta o intercambia el montón de una casilla. */
  private move(ref: SlotRef, inv: Inventory) {
    const slot = ref.list[ref.i];
    if (ref.list === inv.hotbar) inv.sel = ref.i;
    if (!this.cursor) {
      if (!slot) return;
      this.cursor = slot;
      ref.list[ref.i] = null;
      return;
    }
    if (!slot) {
      ref.list[ref.i] = this.cursor;
      this.cursor = null;
      return;
    }
    const info = itemInfo(slot.id);
    if (slot.id === this.cursor.id && info && info.stack > 1 && slot.n < info.stack) {
      const take = Math.min(info.stack - slot.n, this.cursor.n);
      slot.n += take;
      this.cursor.n -= take;
      if (this.cursor.n <= 0) this.cursor = null;
      return;
    }
    // Intercambio
    ref.list[ref.i] = this.cursor;
    this.cursor = slot;
  }

  draw(ctx: Ctx, inv: Inventory, mx: number, my: number) {
    const { x, y, w, h } = PANEL;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, 320, 240);
    panel(ctx, x, y, w, h, [255, 61, 139], 0.94, [12, 12, 28], 1);
    shadowText(ctx, "MOCHILA", 10, y + 6, [255, 207, 80], TITLE);

    // Pestañas y páginas.
    const tabStyle = (z: Zone, active: boolean, enabled: boolean) => {
      ctx.fillStyle = active ? "rgba(61,242,255,0.22)" : enabled ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)";
      ctx.fillRect(z.x, z.y, z.w, z.h);
      if (active) {
        ctx.fillStyle = "#3df2ff";
        ctx.fillRect(z.x, z.y + z.h - 1, z.w, 1);
      }
    };
    tabStyle(TAB_CRAFT, this.tab === "craft", true);
    tabStyle(TAB_SMELT, this.tab === "smelt", this.canSmeltTab);
    shadowText(ctx, "FABRICAR", TAB_CRAFT.x + 4, TAB_CRAFT.y + 2, this.tab === "craft" ? [220, 255, 255] : [170, 170, 190], SMALL);
    shadowText(ctx, "HORNO", TAB_SMELT.x + 4, TAB_SMELT.y + 2, this.canSmeltTab ? (this.tab === "smelt" ? [220, 255, 255] : [170, 170, 190]) : [90, 90, 105], SMALL);
    const pages = Math.max(1, Math.ceil(list(this.tab).length / PER_PAGE));
    if (pages > 1) {
      shadowText(ctx, "<", PREV.x + 4, PREV.y + 3, [200, 200, 220], SMALL);
      shadowText(ctx, ">", NEXT.x + 4, NEXT.y + 3, [200, 200, 220], SMALL);
      shadowText(ctx, `${this.page + 1}/${pages}`, NEXT.x - 2, PREV.y + 3, [140, 140, 160], TINY);
    }
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(164, y + 6, 1, h - 14);

    const { cells, recipes } = layout(inv, this.tab, this.page);
    for (const c of cells) {
      const selected = c.ref.list === inv.hotbar && c.ref.i === inv.sel;
      drawSlot(ctx, c.x, c.y, CELL, c.ref.list[c.ref.i], selected);
    }
    // Recetas
    const all = list(this.tab);
    for (const box of recipes) {
      const r = all[box.i];
      if (!r) continue;
      const ok = this.tab === "craft" ? canCraft(inv, r) : canSmelt(inv, r);
      ctx.fillStyle = ok ? "rgba(70,130,90,0.35)" : "rgba(255,255,255,0.05)";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      drawItemIconBox(ctx, box.x + 8, box.y + CELL / 2, r.out);
      const name = itemName(r.out).toUpperCase() + (r.n > 1 ? ` ×${r.n}` : "");
      shadowText(ctx, fitText(ctx, name, box.w - 22, SMALL), box.x + 17, box.y + 2, ok ? [235, 245, 235] : [150, 150, 165], SMALL);
      const extra = this.tab === "smelt" ? ` + 1 COMBUSTIBLE` : "";
      const cost = r.need.map(([id, n]) => `${itemName(id).toUpperCase()} ×${n}`).join(" + ") + extra;
      shadowText(ctx, fitText(ctx, cost, box.w - 20, TINY), box.x + 17, box.y + 9, ok ? [160, 220, 170] : [130, 130, 145], TINY);
    }
    const hint = this.tab === "craft"
      ? "CLIC EN UNA RECETA: FABRICAR · CLIC EN UNA CASILLA: COGER / SOLTAR"
      : this.canSmeltTab ? "HORNO: GASTA 1 COMBUSTIBLE (PALO, TABLÓN O TRONCO) POR PIEZA" : "NECESITAS UN HORNO CERCA PARA FUNDIR";
    shadowText(ctx, fitText(ctx, `${hint} · I o ESC: CERRAR`, w - 16, TINY), 10, y + h - 11, [150, 150, 175], TINY);
    // Montón que lleva el ratón
    if (this.cursor) {
      drawSlot(ctx, mx - CELL / 2, my - CELL / 2, CELL, this.cursor, true);
    }
  }
}

/** Icono centrado en una receta (los bloques son isométricos y las herramientas, planas). */
export function drawItemIconBox(ctx: Ctx, cx: number, cy: number, id: number) {
  const info = itemInfo(id);
  if (!info) return;
  drawItemIcon(ctx, cx, cy, info.block !== undefined ? 6 : 7, id);
}
