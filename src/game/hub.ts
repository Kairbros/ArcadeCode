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
import { RuletaGuest, RuletaHost } from "./ruleta/game";
import { RuletaInput } from "./ruleta/input";
import { BlocksGuest, BlocksHost } from "./blocks/game";
import { BlocksInput } from "./blocks/input";
import { PoolGuest, PoolHost } from "./pool/game";
import { PoolInput } from "./pool/input";
import { CasinoGuest, CasinoHost } from "./casino/game";
import { CasinoInput } from "./casino/input";
import { CardsGuest, CardsHost } from "./cards/game";
import { CardsInput } from "./cards/input";
import { DeadZoneGuest, DeadZoneHost } from "./deadzone/game";
import { Input as DeadZoneInput } from "./deadzone/core/input";
import type { Keyboard } from "./core/keyboard";
import { settings } from "./core/settings";
import type { GuestGame, HostGame } from "./net/types";

export type GameId = "bomber" | "karts" | "balls" | "stick" | "ruleta" | "blocks" | "survival" | "casino" | "cards" | "deadzone" | "pool";

export interface GameInfo {
  id: GameId;
  name: string;
  desc: string;
}

export const GAMES: GameInfo[] = [
  { id: "bomber", name: "Bomberman", desc: "Bombas, cajas y buffs · mapas procedurales" },
  { id: "karts", name: "Karts", desc: "Carreras en 3D con relieve · circuitos procedurales" },
  { id: "balls", name: "Sumo de bolas", desc: "Empuja a los rivales a la lava · 3D" },
  { id: "stick", name: "Monigotes", desc: "Peleas en plataformas con armas · último en pie" },
  { id: "ruleta", name: "Ruleta de cartuchos", desc: "Escopeta, cartuchos y objetos contra el crupier · 3D" },
  { id: "blocks", name: "Bloques: creativo", desc: "Mundo de bloques para construir juntos · 3D" },
  { id: "survival", name: "Bloques: supervivencia", desc: "Rompe, recoge y craftea herramientas · 3D" },
  { id: "pool", name: "Billar (bola 8)", desc: "Lisas contra rayadas, efecto y bola en mano · 3D" },
  { id: "casino", name: "Casino entre amigos", desc: "Ruleta, plinko, tragaperras, moneda y dados · 3D · con peleas y robos" },
  { id: "cards", name: "Mazo Loco", desc: "Cartas de colores: +2, +4, bloqueo y reversa · 2–4 jugadores · con bots" },
  { id: "deadzone", name: "Dead Zone: Outbreak", desc: "FPS cooperativo de zombis · rondas, armas y barricadas · 3D · 1–4 jugadores" },
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
  if (id === "ruleta") return new RuletaHost(new RuletaInput(keyboard), remoteCount, "host", settings.bots);
  if (id === "blocks" || id === "survival") return new BlocksHost(new BlocksInput(keyboard), remoteCount, "host", id);
  if (id === "pool") return new PoolHost(new PoolInput(keyboard), remoteCount, "host", settings.bots);
  if (id === "casino") return new CasinoHost(new CasinoInput(keyboard), remoteCount, "host");
  if (id === "cards") return new CardsHost(new CardsInput(keyboard), remoteCount, "host", settings.bots);
  if (id === "deadzone") return new DeadZoneHost(new DeadZoneInput(keyboard), remoteCount, "host");
  return new BombermanHost(bothSchemes(keyboard), remoteCount);
}

export function createGuestGame(id: GameId, index: number, keyboard: Keyboard): GuestGame {
  if (id === "karts") return new KartsGuest(index, new KartsInput(keyboard));
  if (id === "balls") return new BallsGuest(index, new BallsInput(keyboard));
  if (id === "stick") return new StickGuest(index, new StickInput(keyboard));
  if (id === "ruleta") return new RuletaGuest(index, new RuletaInput(keyboard));
  if (id === "blocks" || id === "survival") return new BlocksGuest(index, new BlocksInput(keyboard), id);
  if (id === "pool") return new PoolGuest(index, new PoolInput(keyboard));
  if (id === "casino") return new CasinoGuest(index, new CasinoInput(keyboard));
  if (id === "cards") return new CardsGuest(index, new CardsInput(keyboard));
  if (id === "deadzone") return new DeadZoneGuest(index, new DeadZoneInput(keyboard));
  return new BombermanGuest(index, bothSchemes(keyboard));
}
