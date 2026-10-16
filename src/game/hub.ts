// Hub de juegos: qué juegos hay y cómo se crea cada uno en local, anfitrión o invitado.
// Cada juego construye su propio control a partir del teclado.
import { BombermanGuest, BombermanHost } from "./bomberman/net";
import { PLAYER_CONTROLS } from "./core/config";
import { LocalController } from "./bomberman/input";
import { KartsGuest, KartsHost } from "./karts/game";
import { KartsInput } from "./karts/input";
import { BallsGuest, BallsHost } from "./balls/game";
import { BallsInput } from "./balls/input";
import { StickGuest, StickHost } from "./stick/game";
import { StickInput } from "./stick/input";
import type { Keyboard } from "./core/keyboard";
import { settings } from "./core/settings";
import type { GuestGame, HostGame } from "./net/types";

export type GameId = "bomber" | "karts" | "balls" | "stick";

export interface GameInfo {
  id: GameId;
  name: string;
  desc: string;
}

export const GAMES: GameInfo[] = [
  { id: "bomber", name: "Bomberman", desc: "Bombas, cajas y buffs · mapas procedurales" },
  { id: "karts", name: "Karts", desc: "Carreras en modo 7 · circuitos procedurales" },
  { id: "balls", name: "Sumo de bolas", desc: "Empuja a los rivales a la lava · modo 7" },
  { id: "stick", name: "Monigotes", desc: "Peleas en plataformas con armas · último en pie" },
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
  // Los bots los decide el anfitrión: los invitados solo dibujan los karts/bolas que reciben.
  if (id === "karts") return new KartsHost(new KartsInput(keyboard), remoteCount, "host", settings.bots);
  if (id === "balls") return new BallsHost(new BallsInput(keyboard), remoteCount, "host", settings.bots);
  if (id === "stick") return new StickHost(new StickInput(keyboard), remoteCount, "host", settings.bots);
  return new BombermanHost(bothSchemes(keyboard), remoteCount);
}

export function createGuestGame(id: GameId, index: number, keyboard: Keyboard): GuestGame {
  if (id === "karts") return new KartsGuest(index, new KartsInput(keyboard));
  if (id === "balls") return new BallsGuest(index, new BallsInput(keyboard));
  if (id === "stick") return new StickGuest(index, new StickInput(keyboard));
  return new BombermanGuest(index, bothSchemes(keyboard));
}
