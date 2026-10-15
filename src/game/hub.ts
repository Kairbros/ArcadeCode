// Hub de juegos: qué juegos hay y cómo se crea cada uno en local, anfitrión o invitado.
// Cada juego construye su propio control a partir del teclado.
import { BombermanGuest, BombermanHost } from "./bomberman/net";
import { PLAYER_CONTROLS } from "./core/config";
import { LocalController } from "./bomberman/input";
import { KartsGuest, KartsHost } from "./karts/game";
import { KartsInput } from "./karts/input";
import type { Keyboard } from "./core/keyboard";
import type { GuestGame, HostGame } from "./net/types";

export type GameId = "bomber" | "karts";

export interface GameInfo {
  id: GameId;
  name: string;
  desc: string;
}

export const GAMES: GameInfo[] = [
  { id: "bomber", name: "Bomberman", desc: "Bombas, cajas y buffs · mapas procedurales" },
  { id: "karts", name: "Karts", desc: "Carreras en modo 7 · circuitos procedurales" },
];

export function isGameId(id: unknown): id is GameId {
  return GAMES.some((g) => g.id === id);
}

export function gameName(id: GameId): string {
  return GAMES.find((g) => g.id === id)!.name;
}

/** En red cada jugador está en su equipo: WASD o flechas indistintamente. */
const bothSchemes = (kb: Keyboard) => new LocalController(kb, ...PLAYER_CONTROLS);

export function createHostGame(id: GameId, keyboard: Keyboard, remoteCount: number): HostGame {
  return id === "karts"
    ? new KartsHost(new KartsInput(keyboard), remoteCount, "host")
    : new BombermanHost(bothSchemes(keyboard), remoteCount);
}

export function createGuestGame(id: GameId, index: number, keyboard: Keyboard): GuestGame {
  return id === "karts"
    ? new KartsGuest(index, new KartsInput(keyboard))
    : new BombermanGuest(index, bothSchemes(keyboard));
}
