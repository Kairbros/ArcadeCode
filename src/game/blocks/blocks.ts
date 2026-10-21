// Tipos de bloque: qué casilla del atlas usa cada cara, cómo se comporta, cómo se rompe en supervivencia y
// cuánta luz da.

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
export const TABLE = 13; // mesa de trabajo
export const COAL_ORE = 14;
export const IRON_ORE = 15;
export const DIAMOND_ORE = 16;
export const FURNACE = 17;
export const TORCH = 18;

// Objetos que sueltan algunos bloques (su ficha está en items.ts; aquí para no importar en círculo).
export const COAL = 116;
export const DIAMOND = 119;

// Atlas: ATLAS_COLS × ATLAS_ROWS casillas de 16 px.
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;
export const T_GRASS_TOP = 0, T_GRASS_SIDE = 1, T_DIRT = 2, T_STONE = 3, T_SAND = 4, T_LOG_SIDE = 5, T_LOG_TOP = 6,
  T_LEAVES = 7, T_PLANKS = 8, T_COBBLE = 9, T_GLASS = 10, T_BRICK = 11, T_WATER = 12, T_BEDROCK = 13,
  T_TABLE_TOP = 14, T_TABLE_SIDE = 15, T_COAL_ORE = 16, T_IRON_ORE = 17, T_DIAMOND_ORE = 18, T_FURNACE_FRONT = 19,
  T_FURNACE_TOP = 20, T_TORCH = 21;

/** Herramienta que acelera romper un bloque (la espada no rompe más rápido: solo pega más fuerte). */
export type ToolKind = "pick" | "axe" | "shovel" | "sword";

export interface BlockInfo {
  name: string;
  /** Casillas del atlas: arriba, lados, abajo. */
  tiles: [number, number, number];
  /** Choca con los jugadores. */
  solid: boolean;
  /** Tapa del todo las caras vecinas y la luz (las hojas, el cristal y el agua dejan ver a través). */
  opaque: boolean;
  liquid?: boolean;
  unbreakable?: boolean;
  /** Segundos para romperlo a mano (supervivencia). */
  hard: number;
  /** Herramienta que lo rompe más rápido. */
  tool?: ToolKind;
  /** Nivel mínimo de esa herramienta para que suelte algo (1 madera, 2 piedra, 3 hierro): sin él se rompe pero no suelta. */
  needsTier?: number;
  /** Lo que suelta al romperse (por defecto, él mismo; 0 = nada). */
  drop?: number;
  /** Luz que da (0–15). */
  light?: number;
  /** Forma especial (no es un cubo entero). */
  shape?: "torch";
}

export const BLOCKS: BlockInfo[] = [
  { name: "Aire", tiles: [0, 0, 0], solid: false, opaque: false, hard: 0 },
  { name: "Hierba", tiles: [T_GRASS_TOP, T_GRASS_SIDE, T_DIRT], solid: true, opaque: true, hard: 0.9, tool: "shovel", drop: DIRT },
  { name: "Tierra", tiles: [T_DIRT, T_DIRT, T_DIRT], solid: true, opaque: true, hard: 0.75, tool: "shovel" },
  { name: "Piedra", tiles: [T_STONE, T_STONE, T_STONE], solid: true, opaque: true, hard: 7.5, tool: "pick", needsTier: 1, drop: COBBLE },
  { name: "Arena", tiles: [T_SAND, T_SAND, T_SAND], solid: true, opaque: true, hard: 0.75, tool: "shovel" },
  { name: "Tronco", tiles: [T_LOG_TOP, T_LOG_SIDE, T_LOG_TOP], solid: true, opaque: true, hard: 3, tool: "axe" },
  { name: "Hojas", tiles: [T_LEAVES, T_LEAVES, T_LEAVES], solid: true, opaque: false, hard: 0.35, drop: 0 },
  { name: "Tablones", tiles: [T_PLANKS, T_PLANKS, T_PLANKS], solid: true, opaque: true, hard: 3, tool: "axe" },
  { name: "Adoquín", tiles: [T_COBBLE, T_COBBLE, T_COBBLE], solid: true, opaque: true, hard: 10, tool: "pick", needsTier: 1 },
  { name: "Cristal", tiles: [T_GLASS, T_GLASS, T_GLASS], solid: true, opaque: false, hard: 0.45, drop: 0 },
  { name: "Ladrillo", tiles: [T_BRICK, T_BRICK, T_BRICK], solid: true, opaque: true, hard: 10, tool: "pick", needsTier: 1 },
  { name: "Agua", tiles: [T_WATER, T_WATER, T_WATER], solid: false, opaque: false, liquid: true, unbreakable: true, hard: 0 },
  { name: "Roca madre", tiles: [T_BEDROCK, T_BEDROCK, T_BEDROCK], solid: true, opaque: true, unbreakable: true, hard: 0 },
  { name: "Mesa de trabajo", tiles: [T_TABLE_TOP, T_TABLE_SIDE, T_PLANKS], solid: true, opaque: true, hard: 3.75, tool: "axe" },
  { name: "Mena de carbón", tiles: [T_COAL_ORE, T_COAL_ORE, T_COAL_ORE], solid: true, opaque: true, hard: 15, tool: "pick", needsTier: 1, drop: COAL },
  { name: "Mena de hierro", tiles: [T_IRON_ORE, T_IRON_ORE, T_IRON_ORE], solid: true, opaque: true, hard: 15, tool: "pick", needsTier: 2 },
  { name: "Mena de diamante", tiles: [T_DIAMOND_ORE, T_DIAMOND_ORE, T_DIAMOND_ORE], solid: true, opaque: true, hard: 15, tool: "pick", needsTier: 3, drop: DIAMOND },
  { name: "Horno", tiles: [T_FURNACE_TOP, T_FURNACE_FRONT, T_FURNACE_TOP], solid: true, opaque: true, hard: 17.5, tool: "pick", needsTier: 1 },
  { name: "Antorcha", tiles: [T_TORCH, T_TORCH, T_TORCH], solid: false, opaque: false, hard: 0.05, light: 14, shape: "torch" },
];

/** Bloques de la barra en modo creativo (teclas 1–9). */
export const HOTBAR = [STONE, DIRT, GRASS, COBBLE, PLANKS, LOG, LEAVES, GLASS, TORCH];

export const isBlock = (b: number) => Number.isInteger(b) && b >= 0 && b < BLOCKS.length;

/** Lo que suelta un bloque al romperlo con una herramienta de su tipo de nivel `tier` (0 = a mano u otra herramienta). */
export function dropOf(b: number, tier: number): number {
  const info = BLOCKS[b];
  if (!info || (info.needsTier && tier < info.needsTier)) return 0;
  return info.drop ?? b;
}
