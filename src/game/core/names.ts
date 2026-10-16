// Nombres de los jugadores de la partida actual. Todos los juegos leen PLAYER_NAMES al dibujar;
// aquí se rellena: el propio nombre en local, y en red la lista que reparte el anfitrión.
import { PLAYER_NAMES } from "./config";
import { cleanName, settings } from "./settings";

export const defaultName = (index: number) => `Jugador ${index + 1}`;

export function resetNames() {
  PLAYER_NAMES.forEach((_, i) => (PLAYER_NAMES[i] = defaultName(i)));
}

export function setName(index: number, raw: unknown) {
  if (index < 0 || index >= PLAYER_NAMES.length) return;
  PLAYER_NAMES[index] = cleanName(raw) || defaultName(index);
}

/** El nombre elegido en el menú, o el de por defecto para ese número de jugador. */
export function myName(index: number): string {
  return settings.name || defaultName(index);
}
