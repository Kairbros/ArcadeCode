// «Mazo Loco» en el hub: el anfitrión (o la partida local, con bots) lleva la mesa y arbitra; cada
// invitado ve su mano y manda su jugada, que se repite hasta que el anfitrión la acusa.
import { PLAYER_NAMES } from "../core/config";
import type { Transport } from "../net/protocol";
import { RELAY_KEEPALIVE_MS } from "../net/relay";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { CH, CW, RULES } from "./config";
import type { CardsAction, CardsInput } from "./input";
import { actionRects, handPoses, type BtnId } from "./layout";
import { CardsRenderer, type CardsView } from "./render";
import { TableSfx } from "./sfx";
import { canAct, seatHand, unoPending, type CardsSnap } from "./state";
import { CardTable } from "./table";

const int = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : def);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const P2P_RESEND_MS = 100;
const FOOTER_OVER = "R: otra partida · J: cambiar juego · Esc: menú";

/** Lo que manda un invitado: una acción por turno con número creciente. */
export interface CardsMsg {
  t: "c";
  i: number;
  a: number;
  c: number;
  k: number;
  s: number;
}

/** Asientos de la partida: los humanos de la sala y bots hasta cuatro (o dos si no hay bots). */
function seatPlan(remoteCount: number, mode: "local" | "host", bots: boolean): boolean[] {
  const humans = mode === "local" ? 1 : 1 + Math.max(0, Math.min(3, remoteCount));
  const plan = Array.from({ length: humans }, () => false);
  if (bots) while (plan.length < 4) plan.push(true);
  if (plan.length < 2) plan.push(true); // sin rival no hay partida
  return plan;
}

/** Botones que tienen sentido ahora mismo para un asiento. */
function buttonsFor(s: CardsSnap, seat: number): BtnId[] {
  if (s.ph !== 0) return [];
  const out: BtnId[] = [];
  const mine = canAct(s, seat);
  if (mine && s.dw[seat] !== 1) out.push("draw");
  if (mine && s.dw[seat] === 1) out.push("pass");
  if (unoPending(s, seat)) out.push("uno");
  return out;
}

function footerFor(s: CardsSnap, seat: number, over: boolean): string {
  if (over) return FOOTER_OVER;
  if (s.ph === 1) return "REPARTIENDO OTRA RONDA…";
  if (canAct(s, seat)) return "TU TURNO · CLIC EN UNA CARTA · [D] ROBAR · [U] UNO";
  return `ESPERANDO A ${(PLAYER_NAMES[s.tu] ?? `J${s.tu + 1}`).toUpperCase()}…`;
}

export class CardsHost implements HostGame {
  readonly size = [CW, CH] as const;
  netLabel = "";
  table: CardTable;
  private seq = 0;
  private readonly renderer = new CardsRenderer();
  private readonly acks: number[];
  private readonly sfx = new TableSfx();
  private botT = 0;

  constructor(private input: CardsInput, remoteCount: number, readonly mode: "local" | "host", bots = true) {
    const plan = seatPlan(remoteCount, mode, bots);
    this.table = new CardTable(plan.length, plan);
    this.table.names = PLAYER_NAMES.slice(0, plan.length);
    this.acks = plan.map(() => 0);
  }

  /** Centro de cada carta de mi mano en el lienzo (las pruebas del navegador pulsan ahí). */
  handCenters(seat = 0): (readonly [number, number])[] {
    return cardsHandCenters(this.snap(), seat);
  }

  get finished(): boolean {
    return this.table.phase === 2;
  }

  /** Partida nueva con los mismos asientos. */
  restart(): void {
    const bots = this.table.bots.slice();
    this.table = new CardTable(bots.length, bots);
    this.table.names = PLAYER_NAMES.slice(0, bots.length);
    this.sfx.reset();
  }

  update(dt: number): void {
    const t = this.table;
    t.update(dt);
    this.renderer.update(dt);
    this.sfx.update(t.mv, t.msg);
    this.input.poll();
    if (t.phase !== 0) return;
    const s = this.snap();
    // El jugador de este equipo (asiento 0).
    if (canAct(s, 0)) {
      const action = this.input.step(s, 0, buttonsFor(s, 0));
      if (action) t.act(0, action);
      this.botT = RULES.botWait[0];
      return;
    }
    // Los bots juegan con una espera para que se vea la mesa. Un asiento desconectado pasa a bot.
    const turn = t.turn;
    if (!t.bots[turn]) {
      this.botT = RULES.botWait[0];
      return;
    }
    this.botT -= dt;
    if (this.botT > 0) return;
    const action = t.botAction(turn);
    if (action) t.act(turn, action);
    // Si el bot se queda con una carta, la canta (los bots no se despistan).
    if (t.hands[turn].length === 1) t.sayUno(turn);
    this.botT = RULES.botWait[0] + Math.random() * (RULES.botWait[1] - RULES.botWait[0]);
  }

  key(code: string): void {
    if (code === "KeyR") {
      this.restart();
      this.renderer.update(0);
    }
  }

  /** Esc cierra el selector de color del comodín en vez de salir al menú. */
  escape(): boolean {
    if (!this.input.picking) return false;
    this.input.picking = false;
    return true;
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1): void {
    const s = this.snap();
    const view: CardsView = {
      s,
      me: 0,
      hover: this.input.hover,
      picking: this.input.picking,
      pickHover: this.input.pickHover,
      netLabel: this.netLabel,
      footer: footerFor(s, 0, this.finished),
      names: PLAYER_NAMES,
      buttons: buttonsFor(s, 0),
    };
    this.renderer.draw(ctx, view, pixelScale);
  }

  private snap(): CardsSnap {
    const t = this.table;
    return {
      g: "cards",
      base: -1,
      seq: this.seq,
      ph: t.phase,
      tu: t.turn,
      dr: t.dir,
      co: t.color,
      rd: t.round,
      hd: t.hands.map((h) => [...h]),
      dp: t.deck.length,
      tp: t.top,
      gl: [...t.score],
      un: t.uno.map((u, i) => (u || t.hands[i].length !== 1 ? 1 : 0)),
      dw: t.drew.map((d) => (d ? 1 : 0)),
      ut: t.unoT.map((u) => Math.round(u * 10)),
      on: t.online.map((o) => (o ? 1 : 0)),
      bo: t.bots.map((b) => (b ? 1 : 0)),
      ak: [...this.acks],
      ms: t.msg,
      to: t.to,
      mv: t.mv,
      wn: t.winner,
      bt: Math.round(t.wait * 10),
    };
  }

  frame(): NetFrame {
    this.seq++;
    return { snap: this.snap(), base: null };
  }

  onMessage(index: number, msg: unknown): void {
    const m = msg as Partial<CardsMsg> | null;
    if (!m || m.t !== "c" || index < 1 || index > 3 || !this.table.online[index]) return;
    const id = int(m.i, -1);
    if (id <= this.acks[index]) return;
    this.acks[index] = id;
    const a = clamp(int(m.a, 0), 0, 4);
    this.table.act(index, { a, c: clamp(int(m.c, -1), -1, 64), k: clamp(int(m.k, -1), -1, 3) });
  }

  onDisconnect(index: number): void {
    if (index < 0 || index >= this.table.count) return;
    this.table.online[index] = false;
    // Su silla pasa a un bot para que la mesa no se quede esperando.
    this.table.bots[index] = true;
  }
}

export class CardsGuest implements GuestGame {
  readonly id = "cards" as const;
  readonly size = [CW, CH] as const;
  readonly baseSeq = -1;
  netLabel = "";
  private state: CardsSnap | null = null;
  private readonly renderer = new CardsRenderer();
  private readonly sfx = new TableSfx();
  private pending: CardsMsg | null = null;
  private actionId = 0;
  private seq = 0;
  private lastSentAt = -1e9;

  constructor(private index: number, private input: CardsInput) {}

  get ready(): boolean {
    return this.state !== null;
  }

  onBase(): void {}

  onSnap(snap: unknown): void {
    const s = snap as CardsSnap;
    this.state = s;
    if (this.pending && (s.ak[this.index] ?? 0) >= this.pending.i) this.pending = null;
  }

  update(dt: number): void {
    this.renderer.update(dt);
    this.input.poll();
    const s = this.state;
    if (!s) return;
    this.sfx.update(s.mv, s.ms);
    if (s.ph !== 0 || this.pending) return;
    const action: CardsAction | null = this.input.step(s, this.index, buttonsFor(s, this.index));
    if (!action) return;
    this.pending = { t: "c", i: ++this.actionId, a: action.a, c: action.c, k: action.k, s: 0 };
  }

  outgoing(transport: Transport): object | undefined {
    if (!this.state) return undefined;
    const now = performance.now();
    const every = this.pending ? (transport === "p2p" ? P2P_RESEND_MS : 0) : RELAY_KEEPALIVE_MS;
    if (now - this.lastSentAt < every) return undefined;
    this.lastSentAt = now;
    const msg: CardsMsg = this.pending ?? { t: "c", i: this.actionId, a: 0, c: -1, k: -1, s: 0 };
    return { ...msg, s: ++this.seq };
  }

  /** Esc cierra el selector de color del comodín en vez de salir al menú. */
  escape(): boolean {
    if (!this.input.picking) return false;
    this.input.picking = false;
    return true;
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1): void {
    const s = this.state;
    if (!s) {
      ctx.fillStyle = "#22102a";
      ctx.fillRect(0, 0, CW, CH);
      return;
    }
    const view: CardsView = {
      s,
      me: this.index,
      hover: this.input.hover,
      picking: this.input.picking,
      pickHover: this.input.pickHover,
      netLabel: this.netLabel,
      footer: footerFor(s, this.index, s.ph === 2),
      names: PLAYER_NAMES,
      buttons: buttonsFor(s, this.index),
    };
    this.renderer.draw(ctx, view, pixelScale);
  }
}

/** Botones en pantalla (para las pruebas del navegador: pulsar donde dice la geometría). */
export const cardsButtons = (s: CardsSnap, seat: number) => actionRects(buttonsFor(s, seat));
/** Centro en el lienzo de cada carta de la mano (para pulsarlas en las pruebas del navegador). */
export const cardsHandCenters = (s: CardsSnap, seat: number) => handPoses(seatHand(s, seat).length).map((p) => [p.x, p.y] as const);
/** La mano que ve un asiento. */
export const cardsHand = (s: CardsSnap, seat: number) => seatHand(s, seat);
