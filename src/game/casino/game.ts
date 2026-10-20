// Casino de deudas en el hub: el anfitrión (o el modo local) simula la sala y decide las tiradas;
// los invitados envían su teclado y dibujan el estado recibido, suavizado.
import type { Transport } from "../net/protocol";
import { RELAY_KEEPALIVE_MS } from "../net/relay";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { CH, CW, type MachineKind } from "./config";
import { Casino, LAYOUT, PH_DAY, PH_INTRO, PH_OVER, type CasinoMsg, type SeatKind } from "./floor";
import { CASINO_HINT as HINT, type CasinoSource } from "./input";
import { CasinoRenderer, type CasinoView, type GamblerSprite, type MachineSprite } from "./render";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const P2P_RESEND_MS = 100;
const FOOTER_OVER = "R: otra partida · J: cambiar juego · Esc: menú";

/** Estado de la sala que reciben los invitados. */
interface CasinoSnap {
  g: "casino";
  base: -1;
  seq: number;
  ph: number;
  tm: number; // tiempo que queda de la fase
  d: number; // día
  q: number; // cuota
  b: number; // banco
  w: number; // ganado en premios
  pt: number; // pagado al prestamista
  /** Por jugador: x, y, mirada, ¿anda?, ¿está? */
  p: number[][];
  /** Por máquina: jugador (-1 libre), tiempo, premio, resultado... */
  m: number[][];
}

const footerOf = (phase: number, day: number, timer: number, over: string) =>
  phase === PH_OVER ? over : day === 1 && (phase === PH_INTRO || (phase === PH_DAY && timer > 80)) ? HINT : "";

/** Anfitrión (o partida local): ejecuta la sala completa. */
export class CasinoHost implements HostGame {
  readonly size = [CW, CH] as const;
  netLabel = "";
  casino: Casino;
  private seq = 0;
  private time = 0;
  private readonly renderer = new CasinoRenderer();

  constructor(private input: CasinoSource, remoteCount: number, private mode: "local" | "host", seed?: number) {
    this.casino = new Casino(["local", ...Array<SeatKind>(remoteCount).fill("remote")], input, seed);
  }

  get finished() {
    return this.casino.over;
  }

  update(dt: number) {
    this.time += dt;
    this.casino.update(dt);
  }

  key(code: string) {
    // Otra partida con los mismos jugadores (quien se fue, sigue fuera).
    if (code === "KeyR") this.casino = new Casino(this.casino.gamblers.map((g) => g.kind), this.input);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const c = this.casino;
    const view: CasinoView = {
      phase: c.phase, timer: c.timer, day: c.day, quota: c.quota, bank: c.bank, won: c.won, paidTotal: c.paidTotal,
      gamblers: c.gamblers.map((g) => ({ index: g.index, x: g.x, y: g.y, face: g.face, moving: g.moving, present: g.kind !== "empty" })),
      machines: c.machines,
      me: 0,
      time: this.time,
      netLabel: this.netLabel,
      footer: footerOf(c.phase, c.day, c.timer, FOOTER_OVER),
    };
    this.renderer.draw(ctx, view);
  }

  frame(): NetFrame {
    const c = this.casino;
    const snap: CasinoSnap = {
      g: "casino",
      base: -1,
      seq: ++this.seq,
      ph: c.phase,
      tm: Number.isFinite(c.timer) ? r1(c.timer) : -1,
      d: c.day,
      q: c.quota,
      b: c.bank,
      w: c.won,
      pt: c.paidTotal,
      p: c.gamblers.map((g) => [r1(g.x), r1(g.y), g.face, g.moving ? 1 : 0, g.kind === "empty" ? 0 : 1]),
      m: c.machines.map((m) => (m.user < 0 ? [-1] : [m.user, r2(m.t), m.pay, ...m.res])),
    };
    return { snap, base: null };
  }

  onMessage(index: number, msg: unknown) {
    this.casino.applyRemote(index, msg as CasinoMsg);
  }

  onDisconnect(index: number) {
    this.casino.leave(index);
  }

  get isLocal() {
    return this.mode === "local";
  }
}

/** Invitado: envía su teclado y dibuja la sala que reparte el anfitrión. */
export class CasinoGuest implements GuestGame {
  readonly id = "casino" as const;
  readonly size = [CW, CH] as const;
  readonly baseSeq = -1;
  netLabel = "";
  private state: CasinoSnap | null = null;
  private readonly renderer = new CasinoRenderer();
  private smooth = new Map<number, GamblerSprite>();
  private uses = 0;
  private seq = 0;
  private time = 0;
  private lastInput = "";
  private lastSentAt = 0;

  constructor(private index: number, private controller: CasinoSource) {}

  get ready() {
    return this.state !== null;
  }

  onBase() {}

  onSnap(snap: unknown) {
    this.state = snap as CasinoSnap;
  }

  update(dt: number) {
    this.time += dt;
    const c = this.controller;
    c.poll();
    while (c.takeUse()) this.uses++;
    const s = this.state;
    if (!s) return;
    if (s.tm > 0) s.tm = Math.max(0, s.tm - dt);
    // Las jugadas avanzan entre estados para que los rodillos giren fluidos.
    for (const m of s.m) if (m[0] >= 0) m[1] += dt;
    const k = Math.min(1, dt * 14);
    s.p.forEach((row, i) => {
      const target = sprite(row, i);
      const cur = this.smooth.get(i);
      if (!cur || Math.hypot(cur.x - target.x, cur.y - target.y) > 30) this.smooth.set(i, target);
      else this.smooth.set(i, { ...target, x: cur.x + (target.x - cur.x) * k, y: cur.y + (target.y - cur.y) * k });
    });
  }

  outgoing(transport: Transport): object | undefined {
    if (!this.state) return undefined;
    const c = this.controller;
    const json = `${c.dx},${c.dy},${this.uses}`;
    const now = performance.now();
    const resend = transport === "p2p" ? P2P_RESEND_MS : RELAY_KEEPALIVE_MS;
    if (json === this.lastInput && now - this.lastSentAt < resend) return undefined;
    this.lastInput = json;
    this.lastSentAt = now;
    const msg: CasinoMsg = { t: "c", x: c.dx, y: c.dy, u: this.uses, s: ++this.seq };
    return msg;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const s = this.state;
    if (!s) return;
    const view: CasinoView = {
      phase: s.ph, timer: s.tm < 0 ? Infinity : s.tm, day: s.d, quota: s.q, bank: s.b, won: s.w, paidTotal: s.pt,
      gamblers: s.p.map((row, i) => this.smooth.get(i) ?? sprite(row, i)),
      machines: s.m.map((row, i): MachineSprite => {
        const [kind, x, y] = LAYOUT[i];
        return row[0] < 0
          ? { kind, x, y, user: -1, t: 0, pay: 0, res: [] }
          : { kind: kind as MachineKind, x, y, user: row[0], t: row[1], pay: row[2], res: row.slice(3) };
      }),
      me: this.index,
      time: this.time,
      netLabel: this.netLabel,
      footer: footerOf(s.ph, s.d, s.tm, "Esperando al anfitrión · Esc: menú"),
    };
    this.renderer.draw(ctx, view);
  }
}

function sprite(row: number[], index: number): GamblerSprite {
  return { index, x: row[0], y: row[1], face: row[2], moving: row[3] === 1, present: row[4] === 1 };
}
