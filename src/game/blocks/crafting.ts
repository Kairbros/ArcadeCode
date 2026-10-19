// Fabricación: cada receta es una lista de ingredientes (objeto y cantidad) y lo que sale. En vez de una
// rejilla 3×3 (que en 320×240 no cabe bien) se fabrica desde la lista del inventario: se ve el precio y
// se pulsa. Es la misma progresión: tronco → tablones → palos → herramientas → hierro.
//
// El horno es otra lista (FUNDIR): mete una pieza y gasta combustible. Solo se puede usar con un horno
// cerca; el combustible vale cualquiera de FUEL (se gasta el más barato primero).
import { COBBLE, FURNACE, IRON_ORE, LOG, PLANKS } from "./blocks";
import type { Inventory } from "./inventory";
import {
  I_COOKED, I_INGOT, I_IRON_AXE, I_IRON_PICK, I_IRON_SHOVEL, I_IRON_SWORD, I_MEAT, I_STICK, I_STONE_AXE,
  I_STONE_PICK, I_STONE_SHOVEL, I_STONE_SWORD, I_WOOD_AXE, I_WOOD_PICK, I_WOOD_SHOVEL, I_WOOD_SWORD,
} from "./items";

export interface Recipe {
  out: number;
  n: number;
  /** Ingredientes: [objeto, cantidad]. */
  need: [number, number][];
}

export const RECIPES: Recipe[] = [
  { out: PLANKS, n: 4, need: [[LOG, 1]] },
  { out: I_STICK, n: 4, need: [[PLANKS, 2]] },
  { out: I_WOOD_PICK, n: 1, need: [[PLANKS, 3], [I_STICK, 2]] },
  { out: I_WOOD_AXE, n: 1, need: [[PLANKS, 3], [I_STICK, 2]] },
  { out: I_WOOD_SHOVEL, n: 1, need: [[PLANKS, 1], [I_STICK, 2]] },
  { out: I_WOOD_SWORD, n: 1, need: [[PLANKS, 2], [I_STICK, 1]] },
  { out: I_STONE_PICK, n: 1, need: [[COBBLE, 3], [I_STICK, 2]] },
  { out: I_STONE_AXE, n: 1, need: [[COBBLE, 3], [I_STICK, 2]] },
  { out: I_STONE_SHOVEL, n: 1, need: [[COBBLE, 1], [I_STICK, 2]] },
  { out: I_STONE_SWORD, n: 1, need: [[COBBLE, 2], [I_STICK, 1]] },
  { out: FURNACE, n: 1, need: [[COBBLE, 8]] },
  { out: I_IRON_PICK, n: 1, need: [[I_INGOT, 3], [I_STICK, 2]] },
  { out: I_IRON_AXE, n: 1, need: [[I_INGOT, 3], [I_STICK, 2]] },
  { out: I_IRON_SHOVEL, n: 1, need: [[I_INGOT, 1], [I_STICK, 2]] },
  { out: I_IRON_SWORD, n: 1, need: [[I_INGOT, 2], [I_STICK, 1]] },
];

/** Combustibles del horno, del más barato al más caro (se gasta el primero que haya). */
export const FUEL = [I_STICK, PLANKS, LOG];

/** Lo que se puede fundir; cada pieza gasta una unidad de combustible. */
export const SMELTING: Recipe[] = [
  { out: I_INGOT, n: 1, need: [[IRON_ORE, 1]] },
  { out: I_COOKED, n: 1, need: [[I_MEAT, 1]] },
];

export function canCraft(inv: Inventory, r: Recipe): boolean {
  return r.need.every(([id, n]) => inv.count(id) >= n);
}

/** Fabrica una unidad. Devuelve false si faltan ingredientes o no cabe el resultado. */
export function craft(inv: Inventory, r: Recipe): boolean {
  if (!canCraft(inv, r)) return false;
  for (const [id, n] of r.need) inv.take(id, n);
  // Si no cabe (mochila llena), se devuelven los ingredientes.
  if (inv.add(r.out, r.n) > 0) {
    for (const [id, n] of r.need) inv.add(id, n);
    return false;
  }
  return true;
}

/** Combustible que se gastaría ahora mismo (0 si no hay ninguno). */
export function fuelInHand(inv: Inventory): number {
  for (const f of FUEL) if (inv.count(f) > 0) return f;
  return 0;
}

export function canSmelt(inv: Inventory, r: Recipe): boolean {
  return canCraft(inv, r) && fuelInHand(inv) !== 0;
}

/** Funde una pieza (gasta el ingrediente y un combustible). */
export function smelt(inv: Inventory, r: Recipe): boolean {
  if (!canSmelt(inv, r)) return false;
  const fuel = fuelInHand(inv);
  for (const [id, n] of r.need) inv.take(id, n);
  inv.take(fuel, 1);
  if (inv.add(r.out, r.n) > 0) {
    // Sin sitio: se devuelve todo.
    for (const [id, n] of r.need) inv.add(id, n);
    inv.add(fuel, 1);
    return false;
  }
  return true;
}
