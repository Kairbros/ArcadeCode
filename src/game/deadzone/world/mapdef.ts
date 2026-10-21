// Definición de un mapa en datos puros: muros con huecos, puertas comprables, ventanas barricables, compras de pared,
// sitios de las máquinas, props, aparición de zombis y luces. Cada mapa (SECTOR 09, La Granja, El Pueblo, La Terminal) es un
// `MapDef`; `world/map.ts` lo construye en la escena y el resto del juego lee lo que necesita de `BuiltMap.def`.
import type * as THREE from "three";
import type { PerkId } from "../game/perks";
import type { BuySpec, LightSpec, MatKind, PropSpec, WallRun } from "./mapdata";

export type MapId = "sector09" | "granja" | "pueblo" | "terminal";

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Room extends Rect {
  name: string;
}

export interface Interior extends Rect {
  mat: "tile" | "concrete" | "wood" | "plank";
}

export interface BoxSpot {
  x: number;
  z: number;
  rot: number;
  /** Solo el sitio central lleva plataforma. */
  dais: boolean;
  name: string;
}

export interface MapDef {
  id: MapId;
  name: string;
  /** Línea corta para el selector. */
  tagline: string;
  /** Descripción para el selector (2–3 líneas). */
  desc: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Material del suelo exterior y horizonte (ciudad en ruinas, colinas con granjas o pueblo bajo). */
  ground: MatKind;
  sky?: "city" | "hills" | "town";
  rooms: Room[];
  interiors: Interior[];
  /** Suelos sin techo (aceras, caminos de tierra, patios): planos de un material sobre el suelo exterior. */
  floors?: { x0: number; z0: number; x1: number; z1: number; mat: MatKind }[];
  playerSpawn: { x: number; y: number; z: number; yaw: number };
  walls: WallRun[];
  spawns: { x: number; z: number }[];
  buys: BuySpec[];
  /** El primero es donde empieza la caja. */
  boxSpots: BoxSpot[];
  upgrader: { x: number; z: number; facing: number };
  powerSwitch: { x: number; z: number; facing: number };
  perkSpots: Record<PerkId, { x: number; z: number; rot: number }>;
  props: PropSpec[];
  lights: LightSpec[];
  /** Pintadas, sangre y marcas del mapa. */
  decorate: (root: THREE.Object3D, dyn: THREE.Object3D, animated: ((dt: number, time: number) => void)[]) => void;
}
