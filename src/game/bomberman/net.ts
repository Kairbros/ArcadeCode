// Adaptadores de Bomberman para la capa de red del hub.
import { Transform } from "./components";
import { COLS, ROWS, SCREEN_H, SCREEN_W, TILE, enemiesFor } from "./config";
import type { Entity } from "./ecs";
import { Game } from "./game";
import { RemoteController, type InputMessage, type IntentSource, type LocalController } from "./input";
import { generateMap, type MapData } from "./mapgen";
import type { Transport } from "../net/protocol";
import { RELAY_KEEPALIVE_MS } from "../net/relay";
import { SnapshotDecoder, SnapshotEncoder, decodeSnapshot, type Snapshot, type SnapshotBase, type SnapshotDelta } from "./snapshot";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { drawGame, type GameView } from "./render/frame";
import { Hud } from "./render/hud";
import { Renderer } from "./render/renderer";

const P2P_RESEND_MS = 100;

/** Anfitrión: la simulación completa con los invitados como RemoteController. */
export class BombermanHost implements HostGame {
  readonly size = [SCREEN_W, SCREEN_H] as const;
  private readonly game: Game;
  private readonly remotes: RemoteController[];
  private readonly encoder = new SnapshotEncoder();

  constructor(hostInput: IntentSource, remoteCount: number) {
    this.remotes = Array.from({ length: remoteCount }, () => new RemoteController());
    this.game = new Game([hostInput, ...this.remotes], remoteCount + 1, undefined, "host");
  }

  get netLabel() {
    return this.game.netLabel;
  }

  set netLabel(v: string) {
    this.game.netLabel = v;
  }

  update(dt: number) {
    this.game.update(dt);
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale: number) {
    this.game.draw(ctx, pixelScale);
  }

  key(code: string) {
    this.game.handleKey(code);
  }

  frame(now: number): NetFrame {
    const delta = this.encoder.encode(this.game, now);
    return { snap: { ...delta, g: "bomber" }, base: this.encoder.base };
  }

  onMessage(index: number, msg: unknown) {
    const m = msg as InputMessage;
    if (m?.t === "in") this.remotes[index - 1]?.apply(m);
  }

  onDisconnect(index: number) {
    const r = this.remotes[index - 1];
    if (r) r.connected = false;
  }
}

/** Invitado: reconstruye el mundo desde base + deltas, interpola y envía su teclado. */
export class BombermanGuest implements GuestGame {
  readonly id = "bomber" as const;
  readonly size = [SCREEN_W, SCREEN_H] as const;
  netLabel = "";
  view: GameView | null = null;
  private readonly decoder = new SnapshotDecoder();
  private map: MapData | null = null;
  private mapKey = "";
  private readonly renderer = new Renderer();
  private readonly hud = new Hud();
  private prevPos = new Map<Entity, [number, number]>();
  private curPos = new Map<Entity, [number, number]>();
  private snapAt = 0;
  private snapInterval = 1000 / 30;
  private bombCount = 0;
  private inputSeq = 0;
  private lastInput = "";
  private lastSentAt = 0;

  constructor(private index: number, private controller: LocalController) {}

  get baseSeq() {
    return this.decoder.baseSeq;
  }

  get ready() {
    return this.view !== null;
  }

  onBase(base: unknown) {
    const b = base as SnapshotBase;
    if (b.seq > this.decoder.baseSeq) this.decoder.setBase(b);
  }

  onSnap(snap: unknown) {
    const s = this.decoder.apply(snap as SnapshotDelta);
    if (s) this.applySnapshot(s); // si falta la base, llegará en el siguiente envío
  }

  private applySnapshot(s: Snapshot) {
    const key = `${s.seed}:${s.n}`;
    if (key !== this.mapKey || !this.map) {
      this.map = generateMap(COLS, ROWS, s.seed, s.n, enemiesFor(s.n));
      this.mapKey = key;
      this.renderer.reset();
      this.prevPos.clear();
      this.curPos.clear();
    }
    const now = performance.now();
    if (this.snapAt) this.snapInterval = this.snapInterval * 0.8 + Math.min(300, now - this.snapAt) * 0.2;
    this.snapAt = now;
    this.prevPos = this.curPos;
    this.curPos = new Map(s.e.filter((r) => r.t).map((r) => [r.id, r.t!]));
    this.view = {
      world: decodeSnapshot(s, this.map),
      playerIds: s.pids,
      roundTime: s.rt,
      over: s.over,
      result: s.res,
      paused: s.paused,
      hint: "Muévete con WASD o FLECHAS · Bomba: ESPACIO o ENTER",
      overSubtitle: "Esperando a que el anfitrión empiece otra ronda...",
      localIndex: this.index,
      netLabel: this.netLabel,
    };
  }

  update(dt: number) {
    this.renderer.update(dt);
    if (this.view) this.view.roundTime += dt;
    // El teclado se lee cada frame para no perder pulsaciones; se envía al ritmo del transporte.
    this.controller.poll();
    while (this.controller.takeBomb()) this.bombCount++;
    this.interpolate();
  }

  outgoing(transport: Transport): object | undefined {
    const c = this.controller;
    const msg: InputMessage = { t: "in", dx: c.dx, dy: c.dy, ax: c.alt?.[0] ?? 0, ay: c.alt?.[1] ?? 0, b: this.bombCount };
    const json = JSON.stringify(msg);
    const now = performance.now();
    const resend = transport === "p2p" ? P2P_RESEND_MS : RELAY_KEEPALIVE_MS;
    if (json === this.lastInput && now - this.lastSentAt < resend) return undefined;
    this.lastInput = json;
    this.lastSentAt = now;
    return { ...msg, s: ++this.inputSeq };
  }

  private interpolate() {
    if (!this.view) return;
    const alpha = Math.min(1, (performance.now() - this.snapAt) / this.snapInterval);
    for (const [e, t] of this.view.world.query(Transform)) {
      const cur = this.curPos.get(e);
      const prev = this.prevPos.get(e);
      if (!cur) continue;
      if (!prev || Math.abs(prev[0] - cur[0]) + Math.abs(prev[1] - cur[1]) > TILE * 2) {
        [t.x, t.y] = cur;
      } else {
        t.x = prev[0] + (cur[0] - prev[0]) * alpha;
        t.y = prev[1] + (cur[1] - prev[1]) * alpha;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale: number) {
    if (this.view) drawGame(ctx, pixelScale, this.view, this.renderer, this.hud);
  }
}
