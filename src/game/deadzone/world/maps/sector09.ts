// SECTOR 09: el mapa original (patio, calle principal, tienda, plaza con la caja, armería, bloque B y depósito).
import { PERK_SPOTS } from "../../game/perks";
import { buildDecorations } from "../decor";
import type { MapDef } from "../mapdef";
import { BOX_SPOTS, BUYS, INTERIORS, LIGHTS, MAP_BOUNDS, PLAYER_SPAWN, POWER_SWITCH, PROPS, ROOMS, SPAWNS, UPGRADER, WALLS } from "../mapdata";

export const SECTOR09: MapDef = {
  id: "sector09",
  name: "SECTOR 09",
  tagline: "CIUDAD EN CUARENTENA",
  desc: "Patio, calle, tienda, plaza y depósito.",
  bounds: MAP_BOUNDS,
  ground: "asphalt",
  rooms: ROOMS,
  interiors: INTERIORS,
  playerSpawn: PLAYER_SPAWN,
  walls: WALLS,
  spawns: SPAWNS,
  buys: BUYS,
  boxSpots: BOX_SPOTS,
  upgrader: UPGRADER,
  powerSwitch: POWER_SWITCH,
  perkSpots: PERK_SPOTS,
  props: PROPS,
  lights: LIGHTS,
  decorate: buildDecorations,
};
