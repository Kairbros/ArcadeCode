// Objetos: los bloques que se pueden llevar, las herramientas y la comida. Todo lo que va en el
// inventario tiene un id de esta tabla (los bloques usan su propio id; los objetos, de 100 en adelante).
import { AIR, BEDROCK, BLOCKS, WATER } from "./blocks";

export type ToolKind = "pick" | "axe" | "shovel" | "sword";

export interface Tool {
  kind: ToolKind;
  /** Nivel: 0 madera, 1 piedra. */
  tier: number;
  /** Multiplicador de velocidad al romper lo que le toca. */
  speed: number;
  /** Usos antes de romperse. */
  dur: number;
}

export interface ItemInfo {
  id: number;
  name: string;
  /** Máximo por montón. */
  stack: number;
  /** Bloque que coloca (si es un bloque). */
  block?: number;
  /** Casilla del atlas de objetos (solo objetos). */
  icon?: number;
  tool?: Tool;
  /** Puntos de vida que cura al comérselo. */
  heal?: number;
  /** Puntos de hambre que quita al comérselo. */
  food?: number;
  /** Daño por golpe (espadas; a mano se pega 1). */
  damage?: number;
}

export const I_APPLE = 100;
export const I_STICK = 101;
export const I_INGOT = 102;
export const I_MEAT = 103;
export const I_COOKED = 104;
export const I_WOOD_PICK = 110, I_WOOD_AXE = 111, I_WOOD_SHOVEL = 112;
export const I_STONE_PICK = 113, I_STONE_AXE = 114, I_STONE_SHOVEL = 115;
export const I_IRON_PICK = 116, I_IRON_AXE = 117, I_IRON_SHOVEL = 118;
export const I_WOOD_SWORD = 120, I_STONE_SWORD = 121, I_IRON_SWORD = 122;

const INFO = new Map<number, ItemInfo>();

// Los bloques colocables son objetos con su propio id (agua, aire y roca madre no).
for (let id = 1; id < BLOCKS.length; id++) {
  if (id === AIR || id === WATER || id === BEDROCK) continue;
  INFO.set(id, { id, name: BLOCKS[id].name, stack: 64, block: id });
}

function add(info: ItemInfo) {
  INFO.set(info.id, info);
}

function tool(id: number, name: string, kind: ToolKind, tier: number, speed: number, dur: number, icon: number) {
  add({ id, name, stack: 1, icon, tool: { kind, tier, speed, dur } });
}

add({ id: I_APPLE, name: "Manzana", stack: 16, icon: 3, heal: 4, food: 4 });
add({ id: I_STICK, name: "Palo", stack: 64, icon: 4 });
add({ id: I_INGOT, name: "Lingote de hierro", stack: 64, icon: 8 });
add({ id: I_MEAT, name: "Carne cruda", stack: 32, icon: 9, heal: 1, food: 3 });
add({ id: I_COOKED, name: "Carne asada", stack: 32, icon: 10, heal: 3, food: 7 });
tool(I_WOOD_PICK, "Pico de madera", "pick", 0, 2.2, 60, 0);
tool(I_WOOD_AXE, "Hacha de madera", "axe", 0, 2.2, 60, 1);
tool(I_WOOD_SHOVEL, "Pala de madera", "shovel", 0, 2.2, 60, 2);
tool(I_STONE_PICK, "Pico de piedra", "pick", 1, 4.2, 132, 5);
tool(I_STONE_AXE, "Hacha de piedra", "axe", 1, 4.2, 132, 6);
tool(I_STONE_SHOVEL, "Pala de piedra", "shovel", 1, 4.2, 132, 7);
tool(I_IRON_PICK, "Pico de hierro", "pick", 2, 6.5, 250, 14);
tool(I_IRON_AXE, "Hacha de hierro", "axe", 2, 6.5, 250, 15);
tool(I_IRON_SHOVEL, "Pala de hierro", "shovel", 2, 6.5, 250, 16);
// Espadas: se gastan como las herramientas, pero no sirven para picar (solo pegan).
const sword = (id: number, name: string, tier: number, dur: number, dmg: number, icon: number) => {
  add({ id, name, stack: 1, icon, damage: dmg, tool: { kind: "sword", tier, speed: 1, dur } });
};
sword(I_WOOD_SWORD, "Espada de madera", 0, 60, 3, 11);
sword(I_STONE_SWORD, "Espada de piedra", 1, 132, 4, 12);
sword(I_IRON_SWORD, "Espada de hierro", 2, 250, 5, 13);

/** Información de un objeto (undefined si el id no existe). */
export function itemInfo(id: number): ItemInfo | undefined {
  return INFO.get(id);
}

export function itemName(id: number): string {
  return INFO.get(id)?.name ?? "?";
}

/** ¿Es un bloque colocable? */
export function itemBlock(id: number): number {
  return INFO.get(id)?.block ?? 0;
}

export const ALL_ITEMS: ItemInfo[] = [...INFO.values()];
