// Billar en el hub: el anfitrión (o el modo local) simula la mesa y arbitra; el invitado que tiene el
// turno envía su puntería y su tiro, y todos dibujan el estado recibido suavizándolo.
import type { Transport } from "../net/protocol";
import { RELAY_KEEPALIVE_MS } from "../net/relay";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { PH, PW } from "./config";
import { POOL_HINT, POOL_PLACE_HINT } from "./input";
import { Match, seatName, type PoolControl, type PoolMsg, type SeatKind } from "./match";
import { PoolRenderer, type PoolView } from "./render";
import { Table, groupLeft } from "./table";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const P2P_RESEND_MS = 100;
const FOOTER_OVER = "R: otra partida · J: cambiar juego · Esc: menú";

/** Estado de la mesa que reciben los invitados. */
interface PoolSnap {
  g: "pool";
  base: -1;
  seq: number;
  ph: number;
  tu: number;
  /** Número de turno (los mensajes del invitado lo citan). */
  tn: number;
  gr: number[];
  pl: number;
  hd: number;
  /** Puntería: ángulo, potencia, efecto (arriba, lado) y tronera marcada. */
  ag: number;
  pw: number;
  tp: number;
  sd: number;
  cl: number;
  tm: number;
  wn: number;
  m: string;
  /** Asiento que se muestra por equipo. */
  sw: number[];
  wi: number[];
  sh: number;
  ai: number[];
  /** Por bola: x, y, tronera. */
  b: number[][];
}

/** Anfitrión (o partida local): con un solo jugador la CPU hace de rival; sin bots, se juega por turnos en el mismo equipo. */
export class PoolHost implements HostGame {
  readonly size = [PW, PH] as const;
  netLabel = "";
  match: Match;
  private seq = 0;
  private readonly renderer = new PoolRenderer();
  private four: boolean;

  constructor(private input: PoolControl, private remoteCount: number, private mode: "local" | "host", private bots = true) {
    // Con 3 o 4 personas se juega siempre 2 contra 2; con menos, 1 contra 1 (P cambia a 2 contra 2 antes del saque).
    this.four = remoteCount >= 2;
    this.match = new Match(this.seats(this.four));
  }

  /** Asientos: 0 es este equipo, 1.. los invitados; el resto, IA (o este mismo equipo si no hay bots). */
  private seats(four: boolean): SeatKind[] {
    const n = four ? 4 : 2;
    return Array.from({ length: n }, (_, i): SeatKind =>
      i === 0 ? "local" : i <= this.remoteCount ? "remote" : this.bots ? "ai" : "local");
  }

  get finished() {
    return this.match.phase === 2;
  }

  get isLocal() {
    return this.mode === "local";
  }

  update(dt: number) {
    this.match.update(dt, this.input);
    this.renderer.update(dt);
  }

  key(code: string) {
    if (code === "KeyR" && this.match.phase === 2) {
      const old = this.match;
      // Quien se desconectó sigue siendo IA; saca el otro jugador.
      this.match = new Match(old.kinds.slice(), old.wins, (old.breaker + 1) % old.kinds.length);
      this.renderer.reset();
    } else if (code === "KeyP" && this.remoteCount < 2 && this.match.phase === 0 && this.match.shots === 0) {
      this.four = !this.four;
      this.match = new Match(this.seats(this.four), this.match.wins);
      this.renderer.reset();
    }
  }

  onMessage(index: number, msg: unknown) {
    this.match.applyRemote(index, msg as PoolMsg);
  }

  onDisconnect(index: number) {
    this.match.toAI(index);
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const m = this.match;
    const hotseat = m.kinds.every((k) => k === "local");
    const mine = m.phase === 0 && m.seat === "local";
    const name = m.name(m.turn);
    const view: PoolView = {
      balls: m.table.balls,
      me: hotseat ? m.turn : 0,
      shooters: [m.shooterOf(0), m.shooterOf(1)],
      mine,
      turn: m.turn,
      phase: m.phase,
      groups: m.groups,
      placing: m.placing,
      head: m.head,
      aim: m.aim,
      timer: m.timer,
      winner: m.winner,
      msg: m.msgT > 0 || m.phase === 2 ? m.msg : "",
      wins: m.wins,
      names: m.kinds.map((_, i) => m.name(i)),
      left: [groupLeft(m.table.balls, m.groups[0]), groupLeft(m.table.balls, m.groups[1])],
      shots: m.shots,
      ai: m.kinds.map((k) => k === "ai"),
      netLabel: this.netLabel,
      footer: m.phase === 2 ? FOOTER_OVER : footerFor(m.phase, mine, m.placing, m.head, name, this.remoteCount < 2 && m.shots === 0 ? (this.four ? "P: 1 contra 1" : "P: 2 contra 2") : ""),
    };
    this.renderer.draw(ctx, view, pixelScale);
  }

  frame(): NetFrame {
    const m = this.match;
    const snap: PoolSnap = {
      g: "pool",
      base: -1,
      seq: ++this.seq,
      ph: m.phase,
      tu: m.turn,
      tn: m.turnNo,
      gr: m.groups,
      pl: m.placing ? 1 : 0,
      hd: m.head ? 1 : 0,
      ag: r3(m.aim.angle),
      pw: r3(m.aim.power),
      tp: r3(m.aim.top),
      sd: r3(m.aim.side),
      cl: m.aim.call,
      tm: r1(m.timer),
      wn: m.winner,
      m: m.msgT > 0 || m.phase === 2 ? m.msg : "",
      sw: [m.shooterOf(0), m.shooterOf(1)],
      wi: m.wins,
      sh: m.shots,
      ai: m.kinds.map((k) => (k === "ai" ? 1 : 0)),
      b: m.table.balls.map((b) => [r1(b.x), r1(b.y), b.pocket]),
    };
    return { snap, base: null };
  }
}

function footerFor(phase: number, mine: boolean, placing: boolean, head: boolean, name: string, extra = ""): string {
  if (phase !== 0) return "";
  if (!mine) return `Turno de ${name}`;
  if (placing) return head ? `Saque: clic para colocar la blanca${extra ? " · " + extra : ""}` : POOL_PLACE_HINT;
  return POOL_HINT;
}

/** Invitado: apunta y tira cuando le toca; el resto del tiempo mira la partida. */
export class PoolGuest implements GuestGame {
  readonly id = "pool" as const;
  readonly size = [PW, PH] as const;
  readonly baseSeq = -1;
  netLabel = "";
  private state: PoolSnap | null = null;
  private snapAt = 0;
  private readonly renderer = new PoolRenderer();
  /** Posiciones suavizadas; también sirve para comprobar dónde cabe la blanca. */
  private readonly table = new Table();
  private vel: [number, number][] = Array.from({ length: 16 }, () => [0, 0]);
  private target: [number, number][] = Array.from({ length: 16 }, () => [0, 0]);
  private aim = { angle: 0, power: 0.45, top: 0, side: 0, call: -1 };
  private fires = 0;
  private places = 0;
  private turnNo = -1;
  private seq = 0;
  private lastInput = "";
  private lastSentAt = 0;
  private placed: [number, number] = [0, 0];

  constructor(private index: number, private controller: PoolControl) {}

  get ready() {
    return this.state !== null;
  }

  onBase() {}

  onSnap(snap: unknown) {
    const s = snap as PoolSnap;
    const now = performance.now();
    const gap = this.state ? (now - this.snapAt) / 1000 : 0;
    s.b.forEach((row, i) => {
      const b = this.table.balls[i];
      const first = !this.state;
      // Velocidad aparente entre dos estados: se extrapola hasta el siguiente.
      this.vel[i] = !first && gap > 0.005 && gap < 0.4 && row[2] < 0 && b.pocket < 0
        ? [(row[0] - this.target[i][0]) / gap, (row[1] - this.target[i][1]) / gap]
        : [0, 0];
      this.target[i] = [row[0], row[1]];
      if (first || row[2] !== b.pocket || Math.hypot(b.x - row[0], b.y - row[1]) > 60) {
        b.x = row[0];
        b.y = row[1];
      }
      b.pocket = row[2];
    });
    if (s.tn !== this.turnNo) {
      this.turnNo = s.tn;
      this.fires = this.places = 0;
    }
    if (this.state && s.sh < this.state.sh) this.renderer.reset();
    this.state = s;
    this.snapAt = now;
  }

  private get mine() {
    const s = this.state;
    return !!s && s.ph === 0 && s.tu === this.index && this.index < s.ai.length;
  }

  update(dt: number) {
    this.renderer.update(dt);
    const s = this.state;
    const c = this.controller;
    if (!s) return;
    if (s.ph === 0) s.tm = Math.max(0, s.tm - dt);
    const ahead = Math.min(0.12, (performance.now() - this.snapAt) / 1000);
    const k = Math.min(1, dt * 20);
    const cue = this.table.balls[0];
    this.table.balls.forEach((b, i) => {
      if (b.pocket >= 0) return;
      if (i === 0 && this.mine && s.pl) return; // la blanca la lleva el cursor
      b.x += (this.target[i][0] + this.vel[i][0] * ahead - b.x) * k;
      b.y += (this.target[i][1] + this.vel[i][1] * ahead - b.y) * k;
    });
    if (this.mine) {
      c.poll(cue.x, cue.y, !!s.pl);
      if (s.pl) {
        const cur = c.cursor;
        if (cur) this.placed = this.table.nearestPlace(cur[0], cur[1], !!s.hd);
        [cue.x, cue.y] = this.placed;
        c.takeFire();
        if (c.takePlace()) this.places++;
      } else {
        this.aim = { angle: c.angle, power: c.power, top: c.top, side: c.side, call: c.call };
        c.takePlace();
        if (c.takeFire()) {
          this.fires++;
          c.clearSpin();
        }
      }
    } else {
      // Mira cómo apunta el rival, con giro suave.
      const a = this.aim;
      const d = Math.atan2(Math.sin(s.ag - a.angle), Math.cos(s.ag - a.angle));
      this.aim = { angle: a.angle + d * Math.min(1, dt * 14), power: s.pw, top: s.tp, side: s.sd, call: s.cl };
    }
  }

  outgoing(transport: Transport): object | undefined {
    const s = this.state;
    if (!s || !this.mine) return undefined;
    const a = this.aim;
    const cue = this.table.balls[0];
    const px = s.pl ? r1(this.placed[0] || cue.x) : 0, py = s.pl ? r1(this.placed[1] || cue.y) : 0;
    const json = `${r3(a.angle)},${r3(a.power)},${r3(a.side)},${r3(a.top)},${a.call},${this.fires},${this.places},${px},${py},${this.turnNo}`;
    const now = performance.now();
    const resend = transport === "p2p" ? P2P_RESEND_MS : RELAY_KEEPALIVE_MS;
    if (json === this.lastInput && now - this.lastSentAt < resend) return undefined;
    this.lastInput = json;
    this.lastSentAt = now;
    const msg: PoolMsg = {
      t: "p", s: ++this.seq, u: this.turnNo, a: r3(a.angle), w: r3(a.power), x: r3(a.side), y: r3(a.top), c: a.call,
      f: this.fires, k: this.places, px, py,
    };
    return msg;
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const s = this.state;
    if (!s) return;
    const ai = s.ai.map((v) => v === 1);
    const names = ai.map((isAi, i) => seatName(isAi ? "ai" : "remote", i));
    const mine = this.mine;
    const view: PoolView = {
      balls: this.table.balls,
      me: this.index,
      mine,
      turn: s.tu,
      phase: s.ph,
      groups: s.gr,
      placing: !!s.pl,
      head: !!s.hd,
      aim: this.aim,
      timer: s.tm,
      winner: s.wn,
      msg: s.m,
      wins: s.wi,
      names,
      shooters: s.sw,
      left: [groupLeft(this.table.balls, s.gr[0]), groupLeft(this.table.balls, s.gr[1])],
      shots: s.sh,
      ai,
      netLabel: this.netLabel,
      footer: s.ph === 2 ? "Esperando al anfitrión · Esc: menú" : footerFor(s.ph, mine, !!s.pl, !!s.hd, names[s.tu]),
    };
    this.renderer.draw(ctx, view, pixelScale);
  }
}
