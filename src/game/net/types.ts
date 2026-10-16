// Contrato entre la capa de red (salas, WebRTC, relé) y cada juego del hub.
import type { GameId } from "../hub";
import type { Transport } from "./protocol";

/** Estado que el anfitrión reparte. `snap` siempre; `base` solo en juegos que envían deltas. */
export interface NetFrame {
  snap: { g: GameId; seq: number; base: number };
  base: { seq: number } | null;
}

/** Juego en el anfitrión (o en local): simula, dibuja y genera el estado para los invitados. */
export interface HostGame {
  readonly size: readonly [number, number];
  netLabel: string;
  /** La ronda o carrera terminó: se puede cambiar de juego sin cerrar la sala. */
  readonly finished: boolean;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, pixelScale: number): void;
  key(code: string): void;
  frame(now: number): NetFrame;
  /** Mensaje de un invitado (index = número de jugador, 1..3). */
  onMessage(index: number, msg: unknown): void;
  onDisconnect(index: number): void;
}

/** Juego en un invitado: recibe estado, dibuja y produce los mensajes que envía al anfitrión. */
export interface GuestGame {
  readonly id: GameId;
  readonly size: readonly [number, number];
  /** Secuencia de la base que tiene (-1 si no usa bases o aún no la tiene). */
  readonly baseSeq: number;
  /** Ya hay algo que dibujar. */
  readonly ready: boolean;
  netLabel: string;
  onBase(base: unknown): void;
  onSnap(snap: unknown): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, pixelScale: number): void;
  /** Mensaje a enviar ahora, o undefined. El juego decide el ritmo según el transporte. */
  outgoing(transport: Transport): object | undefined;
}
