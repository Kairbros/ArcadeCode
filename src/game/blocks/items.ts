// Objetos del inventario: los bloques (mismo número que el bloque) y las cosas que no se ponen en el
// mundo (palos, herramientas, minerales y lo que sueltan animales y monstruos, a partir de 100).
import { BEDROCK, BLOCKS, COAL, DIAMOND, WATER, type ToolKind } from "./blocks";

export { COAL, DIAMOND };
export const STICK = 100;
export const WOOD_PICK = 101;
export const STONE_PICK = 102;
export const WOOD_AXE = 103;
export const STONE_AXE = 104;
export const WOOD_SHOVEL = 105;
export const STONE_SHOVEL = 106;
export const WOOD_SWORD = 107;
export const STONE_SWORD = 108;
export const BEEF = 109;
export const LEATHER = 110;
export const PORK = 111;
export const MUTTON = 112;
export const WOOL = 113;
export const CHICKEN_MEAT = 114;
export const FEATHER = 115;
// 116 = COAL (blocks.ts)
export const CHARCOAL = 117;
export const IRON_INGOT = 118;
// 119 = DIAMOND (blocks.ts)
export const IRON_PICK = 120;
export const IRON_AXE = 121;
export const IRON_SHOVEL = 122;
export const IRON_SWORD = 123;
export const DIAMOND_PICK = 124;
export const DIAMOND_AXE = 125;
export const DIAMOND_SHOVEL = 126;
export const DIAMOND_SWORD = 127;
export const COOKED_BEEF = 128;
export const COOKED_PORK = 129;
export const COOKED_MUTTON = 130;
export const COOKED_CHICKEN = 131;
export const ROTTEN_FLESH = 132;
export const BONE = 133;
export const ARROW = 134;
export const STRING = 135;
export const GUNPOWDER = 136;

export interface Tool {
  kind: ToolKind;
  /** 1 = madera, 2 = piedra, 3 = hierro, 4 = diamante. */
  tier: 1 | 2 | 3 | 4;
}

export interface ItemInfo {
  name: string;
  /** Cuántos caben en una ranura. */
  max: number;
  tool?: Tool;
  /** Se come (clic derecho mantenido): puntos de hambre que devuelve. */
  food?: number;
}

const TIER_NAMES = ["", "madera", "piedra", "hierro", "diamante"];
const KIND_NAMES: Record<ToolKind, string> = { pick: "Pico", axe: "Hacha", shovel: "Pala", sword: "Espada" };

/** Las cuatro herramientas de un material: [pico, hacha, pala, espada]. */
const TOOL_IDS: [number, number, number, number][] = [
  [WOOD_PICK, WOOD_AXE, WOOD_SHOVEL, WOOD_SWORD],
  [STONE_PICK, STONE_AXE, STONE_SHOVEL, STONE_SWORD],
  [IRON_PICK, IRON_AXE, IRON_SHOVEL, IRON_SWORD],
  [DIAMOND_PICK, DIAMOND_AXE, DIAMOND_SHOVEL, DIAMOND_SWORD],
];

const OTHER: Record<number, ItemInfo> = {
  [STICK]: { name: "Palo", max: 64 },
  [BEEF]: { name: "Ternera cruda", max: 64, food: 3 },
  [LEATHER]: { name: "Cuero", max: 64 },
  [PORK]: { name: "Chuleta cruda", max: 64, food: 3 },
  [MUTTON]: { name: "Cordero crudo", max: 64, food: 2 },
  [WOOL]: { name: "Lana", max: 64 },
  [CHICKEN_MEAT]: { name: "Pollo crudo", max: 64, food: 2 },
  [FEATHER]: { name: "Pluma", max: 64 },
  [COAL]: { name: "Carbón", max: 64 },
  [CHARCOAL]: { name: "Carbón vegetal", max: 64 },
  [IRON_INGOT]: { name: "Lingote de hierro", max: 64 },
  [DIAMOND]: { name: "Diamante", max: 64 },
  [COOKED_BEEF]: { name: "Filete", max: 64, food: 8 },
  [COOKED_PORK]: { name: "Chuleta asada", max: 64, food: 8 },
  [COOKED_MUTTON]: { name: "Cordero asado", max: 64, food: 6 },
  [COOKED_CHICKEN]: { name: "Pollo asado", max: 64, food: 6 },
  [ROTTEN_FLESH]: { name: "Carne podrida", max: 64, food: 2 },
  [BONE]: { name: "Hueso", max: 64 },
  [ARROW]: { name: "Flecha", max: 64 },
  [STRING]: { name: "Hilo", max: 64 },
  [GUNPOWDER]: { name: "Pólvora", max: 64 },
};
TOOL_IDS.forEach((ids, t) => {
  (["pick", "axe", "shovel", "sword"] as const).forEach((kind, k) => {
    OTHER[ids[k]] = { name: `${KIND_NAMES[kind]} de ${TIER_NAMES[t + 1]}`, max: 1, tool: { kind, tier: (t + 1) as Tool["tier"] } };
  });
});

export function itemInfo(id: number): ItemInfo {
  return OTHER[id] ?? { name: BLOCKS[id]?.name ?? "?", max: 64 };
}

export const isItem = (id: number) => Number.isInteger(id) && ((id > 0 && id < BLOCKS.length) || id in OTHER);

/** ¿Se puede poner en el mundo? */
export const isPlaceable = (id: number) => id > 0 && id < BLOCKS.length && id !== WATER && id !== BEDROCK;

/** Multiplicador de velocidad al romper con la herramienta de su tipo (a mano ×1, madera ×5 … diamante ×16). */
export const TOOL_SPEED = [1, 5, 9, 12, 16];

/** Daño de un golpe con el objeto en la mano: a mano 1; espada 3 + nivel, hacha 2 + nivel, pico y pala 1 + nivel. */
export function attackDamage(id: number): number {
  const t = itemInfo(id).tool;
  if (!t) return 1;
  return (t.kind === "sword" ? 3 : t.kind === "axe" ? 2 : 1) + t.tier;
}
