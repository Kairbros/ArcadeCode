// Sumo de bolas en el hub: el anfitrión (o el modo local) simula todo; los invitados envían su
// dirección y sus embestidas, y dibujan el estado recibido suavizándolo.
import type { Transport } from "../net/protocol";
import { RELAY_KEEPALIVE_MS } from "../net/relay";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { Arena, type BallMsg, type BallState, type SlotKind } from "./arena";
import { BH, BW } from "./config";
import { BALLS_HINT as HINT, type RollSource } from "./input";
import { BallsRenderer, type BallSprite, type BallsView } from "./render";

const r1 = (v: number) => Math.round(v * 10) / 10;
const P2P_RESEND_MS = 100;

/** Estado de la ronda que reciben los invitados. */
interface BallsSnap {
  g: "balls";
  base: -1;
  seq: number;
  ph: number;
  cd: number;
  t: number;
  r: number;
  w: number[];
  /** Por bola: x, y, z, vx, vy, estado, recarga de embestida, puesto, ¿IA? */
  b: number[][];
}

const FOOTER_OVER = "R: otra ronda · J: cambiar juego · Esc: menú";

/** Anfitrión (o partida local contra la IA): ejecuta la ronda completa. */
export class BallsHost implements HostGame {
  readonly size = [BW, BH] as const;
  netLabel = "";
  arena: Arena;
  private seq = 0;
  private readonly renderer = new BallsRenderer();

  constructor(private input: RollSource, remoteCount: number, private mode: "local" | "host", private bots = true) {
    this.arena = new Arena(["local", ...Array<SlotKind>(remoteCount).fill("remote")], input, undefined, bots);
  }

  get finished() {
    return this.arena.phase === 2;
  }

  private newRound() {
    // Las victorias se acumulan; quien se desconectó sigue siendo IA.
    this.arena = new Arena(this.arena.slots.map((s) => s.kind), this.input, this.arena.wins, this.bots);
    this.renderer.reset();
  }

  update(dt: number) {
    this.arena.update(dt);
    this.renderer.update(dt);
  }

  key(code: string) {
    if (code === "KeyR") this.newRound();
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const a = this.arena;
    const view: BallsView = {
      balls: a.slots.map((s) => ({ index: s.index, ...s.ball })),
      me: 0,
      radius: a.radius,
      phase: a.phase,
      countdown: a.countdown,
      time: a.time,
      wins: a.wins,
      aiSlots: a.slots.map((s) => s.kind === "ai"),
      results: a.phase === 2 ? a.standings().map((s) => ({ index: s.index, place: s.place, ai: s.kind === "ai" })) : null,
      netLabel: this.netLabel,
      footer: a.phase === 2 ? FOOTER_OVER : a.time < 5 ? HINT : "",
    };
    this.renderer.draw(ctx, view, pixelScale);
  }

  frame(): NetFrame {
    const a = this.arena;
    const snap: BallsSnap = {
      g: "balls",
      base: -1,
      seq: ++this.seq,
      ph: a.phase,
      cd: r1(a.countdown),
      t: r1(a.time),
      r: r1(a.radius),
      w: a.wins,
      b: a.slots.map(({ ball: b, place, kind }) => [
        r1(b.x), r1(b.y), r1(b.z), r1(b.vx), r1(b.vy), b.state, r1(b.dashCool), place, kind === "ai" ? 1 : 0,
      ]),
    };
    return { snap, base: null };
  }

  onMessage(index: number, msg: unknown) {
    this.arena.applyRemote(index, msg as BallMsg);
  }

  onDisconnect(index: number) {
    this.arena.toAI(index);
  }

  get isLocal() {
    return this.mode === "local";
  }
}

/** Invitado: envía su entrada y dibuja la ronda que reparte el anfitrión. */
export class BallsGuest implements GuestGame {
  readonly id = "balls" as const;
  readonly size = [BW, BH] as const;
  readonly baseSeq = -1;
  netLabel = "";
  private state: BallsSnap | null = null;
  private snapAt = 0;
  private readonly renderer = new BallsRenderer();
  // Posiciones suavizadas para que no vayan a saltos entre estados.
  private smooth = new Map<number, BallSprite>();
  private dashes = 0;
  private seq = 0;
  private lastInput = "";
  private lastSentAt = 0;

  constructor(private index: number, private controller: RollSource) {}

  get ready() {
    return this.state !== null;
  }

  onBase() {}

  onSnap(snap: unknown) {
    const s = snap as BallsSnap;
    // Ronda nueva: fuera chapoteos y giros de la anterior.
    if (this.state && this.state.ph !== 0 && s.ph === 0) {
      this.renderer.reset();
      this.smooth.clear();
    }
    this.state = s;
    this.snapAt = performance.now();
  }

  update(dt: number) {
    this.renderer.update(dt);
    const c = this.controller;
    c.poll();
    while (c.takeDash()) this.dashes++;
    const s = this.state;
    if (!s) return;
    if (s.ph === 0) s.cd = Math.max(0, s.cd - dt);
    else if (s.ph === 1) s.t += dt;
    // Cada bola va hacia su posición conocida, adelantada según su velocidad.
    const ahead = Math.min(0.15, (performance.now() - this.snapAt) / 1000);
    const k = Math.min(1, dt * 14);
    s.b.forEach((row, i) => {
      const tx = row[0] + row[3] * ahead;
      const ty = row[1] + row[4] * ahead;
      const cur = this.smooth.get(i);
      if (!cur || Math.hypot(cur.x - tx, cur.y - ty) > 40) {
        this.smooth.set(i, { index: i, x: tx, y: ty, z: row[2], vx: row[3], vy: row[4], state: row[5] as BallState, dashCool: row[6] });
        return;
      }
      cur.x += (tx - cur.x) * k;
      cur.y += (ty - cur.y) * k;
      cur.z += (row[2] - cur.z) * k;
      cur.vx = row[3];
      cur.vy = row[4];
      cur.state = row[5] as BallState;
      cur.dashCool = row[6];
    });
  }

  outgoing(transport: Transport): object | undefined {
    if (!this.state) return undefined;
    const c = this.controller;
    const json = `${c.dx},${c.dy},${this.dashes}`;
    const now = performance.now();
    const resend = transport === "p2p" ? P2P_RESEND_MS : RELAY_KEEPALIVE_MS;
    if (json === this.lastInput && now - this.lastSentAt < resend) return undefined;
    this.lastInput = json;
    this.lastSentAt = now;
    const msg: BallMsg = { t: "b", x: c.dx, y: c.dy, d: this.dashes, s: ++this.seq };
    return msg;
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const s = this.state;
    if (!s) return;
    const balls = s.b.map((row, i) => this.smooth.get(i) ?? {
      index: i, x: row[0], y: row[1], z: row[2], vx: row[3], vy: row[4], state: row[5] as BallState, dashCool: row[6],
    });
    const view: BallsView = {
      balls,
      me: this.index,
      radius: s.r,
      phase: s.ph,
      countdown: s.cd,
      time: s.t,
      wins: s.w,
      aiSlots: s.b.map((row) => row[8] === 1),
      results: s.ph === 2
        ? s.b.map((row, i) => ({ index: i, place: row[7], ai: row[8] === 1 })).sort((a, b) => a.place - b.place || a.index - b.index)
        : null,
      netLabel: this.netLabel,
      footer: s.ph === 2 ? "Esperando al anfitrión · Esc: menú" : s.t < 5 ? HINT : "",
    };
    this.renderer.draw(ctx, view, pixelScale);
  }
}
