// Tipos de bloque: qué casilla del atlas usa cada cara, cómo se comporta y cuánto cuesta romperlo.
// La dureza y la herramienta las usa mining.ts; los objetos que suelta, también.
import type { ToolKind } from "./items";

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const SAND = 4;
export const LOG = 5;
export const LEAVES = 6;
export const PLANKS = 7;
export const COBBLE = 8;
export const GLASS = 9;
export const BRICK = 10;
export const WATER = 11;
export const BEDROCK = 12;
export const IRON_ORE = 13;
export const FURNACE = 14;

// Casillas del atlas (8 columnas × 4 filas de 16 px).
export const T_GRASS_TOP = 0, T_GRASS_SIDE = 1, T_DIRT = 2, T_STONE = 3, T_SAND = 4, T_LOG_SIDE = 5, T_LOG_TOP = 6,
  T_LEAVES = 7, T_PLANKS = 8, T_COBBLE = 9, T_GLASS = 10, T_BRICK = 11, T_WATER = 12, T_BEDROCK = 13,
  T_IRON_ORE = 14, T_FURNACE = 15;

export interface BlockInfo {
  name: string;
  /** Casillas del atlas: arriba, lados, abajo. */
  tiles: [number, number, number];
  /** Choca con los jugadores. */
  solid: boolean;
  /** Tapa del todo las caras vecinas (las hojas y el cristal dejan ver a través). */
  opaque: boolean;
  liquid?: boolean;
  unbreakable?: boolean;
  /** Segundos con la herramienta adecuada de primer nivel (a mano o con otra, más; ver mining.ts). */
  hardness: number;
  /** Herramienta que lo rompe bien. */
  tool?: ToolKind;
  /** Nivel mínimo (0 = cualquier herramienta del tipo) para que suelte objeto. Sin esto, suelta siempre. */
  req?: number;
  /** Qué suelta al romperse (por defecto, él mismo). */
  drop?: number;
  dropN?: number;
}

export const BLOCKS: BlockInfo[] = [
  { name: "Aire", tiles: [0, 0, 0], solid: false, opaque: false, hardness: 0 },
  { name: "Hierba", tiles: [T_GRASS_TOP, T_GRASS_SIDE, T_DIRT], solid: true, opaque: true, hardness: 0.45, tool: "shovel", drop: DIRT },
  { name: "Tierra", tiles: [T_DIRT, T_DIRT, T_DIRT], solid: true, opaque: true, hardness: 0.4, tool: "shovel" },
  { name: "Piedra", tiles: [T_STONE, T_STONE, T_STONE], solid: true, opaque: true, hardness: 0.9, tool: "pick", req: 0, drop: COBBLE },
  { name: "Arena", tiles: [T_SAND, T_SAND, T_SAND], solid: true, opaque: true, hardness: 0.4, tool: "shovel" },
  { name: "Tronco", tiles: [T_LOG_TOP, T_LOG_SIDE, T_LOG_TOP], solid: true, opaque: true, hardness: 0.6, tool: "axe" },
  { name: "Hojas", tiles: [T_LEAVES, T_LEAVES, T_LEAVES], solid: true, opaque: false, hardness: 0.12 },
  { name: "Tablones", tiles: [T_PLANKS, T_PLANKS, T_PLANKS], solid: true, opaque: true, hardness: 0.5, tool: "axe" },
  { name: "Adoquín", tiles: [T_COBBLE, T_COBBLE, T_COBBLE], solid: true, opaque: true, hardness: 0.9, tool: "pick", req: 0 },
  { name: "Cristal", tiles: [T_GLASS, T_GLASS, T_GLASS], solid: true, opaque: false, hardness: 0.12 },
  { name: "Ladrillo", tiles: [T_BRICK, T_BRICK, T_BRICK], solid: true, opaque: true, hardness: 1, tool: "pick", req: 0 },
  { name: "Agua", tiles: [T_WATER, T_WATER, T_WATER], solid: false, opaque: false, liquid: true, hardness: 0 },
  { name: "Roca madre", tiles: [T_BEDROCK, T_BEDROCK, T_BEDROCK], solid: true, opaque: true, hardness: 0, unbreakable: true },
  { name: "Mena de hierro", tiles: [T_IRON_ORE, T_IRON_ORE, T_IRON_ORE], solid: true, opaque: true, hardness: 1.6, tool: "pick", req: 0 },
  { name: "Horno", tiles: [T_FURNACE, T_FURNACE, T_FURNACE], solid: true, opaque: true, hardness: 1.1, tool: "pick", req: 0 },
];

/** Bloques de la barra al empezar (teclas 1–9); con el botón central se cambia lo que hay en cada casilla. */
export const HOTBAR = [STONE, DIRT, GRASS, COBBLE, PLANKS, LOG, LEAVES, GLASS, BRICK];

export const isBlock = (b: number) => Number.isInteger(b) && b >= 0 && b < BLOCKS.length;

/** ¿Se puede llevar en la mano (no es aire, agua ni roca madre)? */
export function isPlaceable(b: number): boolean {
  return isBlock(b) && b !== AIR && b !== WATER && b !== BEDROCK;
}
