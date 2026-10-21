// Monigotes en el hub: el anfitrión (o el modo local) simula la pelea; los invitados envían su
// teclado y dibujan el estado recibido, suavizado.
import type { Transport } from "../net/protocol";
import { RELAY_KEEPALIVE_MS } from "../net/relay";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { SH, SW, type Weapon } from "./config";
import { Fight, type AttackKind, type SlotKind, type StickMsg } from "./fight";
import { STICK_HINT as HINT, type FightSource } from "./input";
import { StickRenderer, type FighterSprite, type StickView } from "./render";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const P2P_RESEND_MS = 100;
const FOOTER_OVER = "R: otra ronda · J: cambiar juego · Esc: menú";

/** Estado de la pelea que reciben los invitados. */
interface StickSnap {
  g: "stick";
  base: -1;
  seq: number;
  st: number;
  ph: number;
  cd: number;
  t: number;
  w: number[];
  /**
   * Por luchador: x, y, vx, vy, mirada, ¿suelo?, vida, ¿KO?, ¿fuera?, giro, arma, munición,
   * tiempo de ataque, tipo de ataque, aturdido, puesto, ¿bot?
   */
  f: number[][];
  bl: number[]; // balas: x, y, vx...
  bm: number[]; // bombas: x, y, mecha...
  cr: number[]; // cajas: x, y, arma...
  ex: number[]; // explosiones: x, y, edad...
}

function sprite(row: number[], index: number): FighterSprite {
  return {
    index, x: row[0], y: row[1], vx: row[2], vy: row[3], facing: row[4], ground: row[5] === 1, hp: row[6],
    dead: row[7] === 1, gone: row[8] === 1, angle: row[9], weapon: row[10] as Weapon, ammo: row[11],
    attackT: row[12], attackKind: row[13] as AttackKind, hitT: row[14],
  };
}

function groups<T>(flat: number[], size: number, make: (g: number[]) => T): T[] {
  const out: T[] = [];
  for (let i = 0; i + size <= flat.length; i += size) out.push(make(flat.slice(i, i + size)));
  return out;
}

/** Anfitrión (o partida local): ejecuta la pelea completa. */
export class StickHost implements HostGame {
  readonly size = [SW, SH] as const;
  netLabel = "";
  fight: Fight;
  private seq = 0;
  private readonly renderer = new StickRenderer();

  constructor(private input: FightSource, remoteCount: number, private mode: "local" | "host", private bots = true) {
    this.fight = new Fight(["local", ...Array<SlotKind>(remoteCount).fill("remote")], input, undefined, bots);
  }

  get finished() {
    return this.fight.phase === 2;
  }

  private newRound() {
    // Las victorias se acumulan; quien se desconectó sigue siendo bot. Escenario nuevo al azar.
    this.fight = new Fight(this.fight.fighters.map((f) => f.kind), this.input, this.fight.wins, this.bots);
    this.renderer.reset();
  }

  update(dt: number) {
    this.fight.update(dt);
    this.renderer.update(dt);
  }

  key(code: string) {
    if (code === "KeyR") this.newRound();
  }

  draw(ctx: CanvasRenderingContext2D) {
    const f = this.fight;
    const view: StickView = {
      stage: f.stageIndex,
      fighters: f.fighters,
      bullets: f.bullets,
      bombs: f.bombs,
      crates: f.crates,
      explosions: f.explosions,
      me: 0,
      phase: f.phase,
      countdown: f.countdown,
      time: f.time,
      wins: f.wins,
      aiSlots: f.fighters.map((x) => x.kind === "ai"),
      results: f.phase === 2 ? f.standings().map((x) => ({ index: x.index, place: x.place, ai: x.kind === "ai" })) : null,
      netLabel: this.netLabel,
      footer: f.phase === 2 ? FOOTER_OVER : f.time < 5 ? HINT : "",
    };
    this.renderer.draw(ctx, view);
  }

  frame(): NetFrame {
    const f = this.fight;
    const snap: StickSnap = {
      g: "stick",
      base: -1,
      seq: ++this.seq,
      st: f.stageIndex,
      ph: f.phase,
      cd: r1(f.countdown),
      t: r1(f.time),
      w: f.wins,
      f: f.fighters.map((x) => [
        r1(x.x), r1(x.y), r1(x.vx), r1(x.vy), x.facing, x.ground ? 1 : 0, Math.max(0, Math.round(x.hp)), x.dead ? 1 : 0,
        x.gone ? 1 : 0, r2(x.angle), x.weapon, x.ammo, r2(x.attackT), x.attackKind, r2(x.hitT), x.place,
        x.kind === "ai" ? 1 : 0,
      ]),
      bl: f.bullets.flatMap((b) => [r1(b.x), r1(b.y), Math.round(b.vx)]),
      bm: f.bombs.flatMap((b) => [r1(b.x), r1(b.y), r2(b.fuse)]),
      cr: f.crates.flatMap((c) => [r1(c.x), r1(c.y), c.kind]),
      ex: f.explosions.flatMap((e) => [r1(e.x), r1(e.y), r2(e.t)]),
    };
    return { snap, base: null };
  }

  onMessage(index: number, msg: unknown) {
    this.fight.applyRemote(index, msg as StickMsg);
  }

  onDisconnect(index: number) {
    this.fight.toAI(index);
  }

  get isLocal() {
    return this.mode === "local";
  }
}

/** Invitado: envía su teclado y dibuja la pelea que reparte el anfitrión. */
export class StickGuest implements GuestGame {
  readonly id = "stick" as const;
  readonly size = [SW, SH] as const;
  readonly baseSeq = -1;
  netLabel = "";
  private state: StickSnap | null = null;
  private snapAt = 0;
  private readonly renderer = new StickRenderer();
  private smooth = new Map<number, FighterSprite>();
  private jumps = 0;
  private attacks = 0;
  private seq = 0;
  private lastInput = "";
  private lastSentAt = 0;

  constructor(private index: number, private controller: FightSource) {}

  get ready() {
    return this.state !== null;
  }

  onBase() {}

  onSnap(snap: unknown) {
    const s = snap as StickSnap;
    // Ronda nueva (otro escenario o vuelta a la cuenta atrás).
    if (this.state && (this.state.st !== s.st || (this.state.ph !== 0 && s.ph === 0))) {
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
    while (c.takeJump()) this.jumps++;
    while (c.takeAttack()) this.attacks++;
    const s = this.state;
    if (!s) return;
    if (s.ph === 0) s.cd = Math.max(0, s.cd - dt);
    else if (s.ph === 1) s.t += dt;
    // Cada luchador va hacia su posición conocida, adelantada según su velocidad.
    const ahead = Math.min(0.12, (performance.now() - this.snapAt) / 1000);
    const k = Math.min(1, dt * 16);
    s.f.forEach((row, i) => {
      const target = sprite(row, i);
      target.x += target.vx * ahead;
      if (!target.ground) target.y += target.vy * ahead;
      const cur = this.smooth.get(i);
      if (!cur || Math.hypot(cur.x - target.x, cur.y - target.y) > 40) {
        this.smooth.set(i, target);
        return;
      }
      const x = cur.x + (target.x - cur.x) * k;
      const y = cur.y + (target.y - cur.y) * k;
      // El ataque avanza también entre estados para que la animación sea fluida.
      const attackT = cur.attackT >= 0 && target.attackT >= 0 && target.attackT <= cur.attackT + 0.05 ? cur.attackT + dt : target.attackT;
      this.smooth.set(i, { ...target, x, y, attackT });
    });
  }

  outgoing(transport: Transport): object | undefined {
    if (!this.state) return undefined;
    const c = this.controller;
    const json = `${c.dx},${c.down},${this.jumps},${this.attacks}`;
    const now = performance.now();
    const resend = transport === "p2p" ? P2P_RESEND_MS : RELAY_KEEPALIVE_MS;
    if (json === this.lastInput && now - this.lastSentAt < resend) return undefined;
    this.lastInput = json;
    this.lastSentAt = now;
    const msg: StickMsg = { t: "f", x: c.dx, d: c.down ? 1 : 0, j: this.jumps, a: this.attacks, s: ++this.seq };
    return msg;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const s = this.state;
    if (!s) return;
    const view: StickView = {
      stage: s.st,
      fighters: s.f.map((row, i) => this.smooth.get(i) ?? sprite(row, i)),
      bullets: groups(s.bl, 3, ([x, y, vx]) => ({ x, y, vx })),
      bombs: groups(s.bm, 3, ([x, y, fuse]) => ({ x, y, fuse })),
      crates: groups(s.cr, 3, ([x, y, kind]) => ({ x, y, kind: kind as Weapon })),
      explosions: groups(s.ex, 3, ([x, y, t]) => ({ x, y, t })),
      me: this.index,
      phase: s.ph,
      countdown: s.cd,
      time: s.t,
      wins: s.w,
      aiSlots: s.f.map((row) => row[16] === 1),
      results: s.ph === 2
        ? s.f.map((row, i) => ({ index: i, place: row[15], ai: row[16] === 1 })).sort((a, b) => a.place - b.place || a.index - b.index)
        : null,
      netLabel: this.netLabel,
      footer: s.ph === 2 ? "Esperando al anfitrión · Esc: menú" : s.t < 5 ? HINT : "",
    };
    this.renderer.draw(ctx, view);
  }
}
