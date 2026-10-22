// Mapas disponibles y su orden en el selector.
import type { MapDef, MapId } from "../mapdef";
import { GRANJA } from "./granja";
import { PUEBLO } from "./pueblo";
import { SECTOR09 } from "./sector09";
import { TERMINAL } from "./terminal";

export const MAPS: Record<MapId, MapDef> = {
  sector09: SECTOR09,
  granja: GRANJA,
  pueblo: PUEBLO,
  terminal: TERMINAL,
};

export const MAP_IDS: MapId[] = ["granja", "pueblo", "terminal", "sector09"];
export const DEFAULT_MAP: MapId = "sector09";

export function mapDef(id: string | undefined | null): MapDef {
  return (id && (MAPS as Record<string, MapDef>)[id]) || SECTOR09;
}
