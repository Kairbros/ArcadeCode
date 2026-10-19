// Tipos de bloque: qué casilla del atlas usa cada cara y cómo se comporta.

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

// Casillas del atlas (4 × 4 de 16 px).
export const T_GRASS_TOP = 0, T_GRASS_SIDE = 1, T_DIRT = 2, T_STONE = 3, T_SAND = 4, T_LOG_SIDE = 5, T_LOG_TOP = 6,
  T_LEAVES = 7, T_PLANKS = 8, T_COBBLE = 9, T_GLASS = 10, T_BRICK = 11, T_WATER = 12, T_BEDROCK = 13;

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
}

export const BLOCKS: BlockInfo[] = [
  { name: "Aire", tiles: [0, 0, 0], solid: false, opaque: false },
  { name: "Hierba", tiles: [T_GRASS_TOP, T_GRASS_SIDE, T_DIRT], solid: true, opaque: true },
  { name: "Tierra", tiles: [T_DIRT, T_DIRT, T_DIRT], solid: true, opaque: true },
  { name: "Piedra", tiles: [T_STONE, T_STONE, T_STONE], solid: true, opaque: true },
  { name: "Arena", tiles: [T_SAND, T_SAND, T_SAND], solid: true, opaque: true },
  { name: "Tronco", tiles: [T_LOG_TOP, T_LOG_SIDE, T_LOG_TOP], solid: true, opaque: true },
  { name: "Hojas", tiles: [T_LEAVES, T_LEAVES, T_LEAVES], solid: true, opaque: false },
  { name: "Tablones", tiles: [T_PLANKS, T_PLANKS, T_PLANKS], solid: true, opaque: true },
  { name: "Adoquín", tiles: [T_COBBLE, T_COBBLE, T_COBBLE], solid: true, opaque: true },
  { name: "Cristal", tiles: [T_GLASS, T_GLASS, T_GLASS], solid: true, opaque: false },
  { name: "Ladrillo", tiles: [T_BRICK, T_BRICK, T_BRICK], solid: true, opaque: true },
  { name: "Agua", tiles: [T_WATER, T_WATER, T_WATER], solid: false, opaque: false, liquid: true },
  { name: "Roca madre", tiles: [T_BEDROCK, T_BEDROCK, T_BEDROCK], solid: true, opaque: true, unbreakable: true },
];

/** Bloques de la barra (teclas 1–9). Más adelante saldrán del inventario. */
export const HOTBAR = [STONE, DIRT, GRASS, COBBLE, PLANKS, LOG, LEAVES, GLASS, BRICK];

export const isBlock = (b: number) => Number.isInteger(b) && b >= 0 && b < BLOCKS.length;
