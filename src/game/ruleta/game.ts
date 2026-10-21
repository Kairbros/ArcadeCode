// Ruleta de cartuchos en el hub: el anfitrión (o el modo local) arbitra la mesa; los invitados
// eligen su acción en su pantalla y la envían hasta que el anfitrión confirma que la procesó.
import type { Transport } from "../net/protocol";
import { RELAY_KEEPALIVE_MS } from "../net/relay";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { PH_OVER, RH, RW, SEATS } from "./config";
import { Picker, type RuletaInput } from "./input";
import { Match, type Action, type SlotKind } from "./match";
import { RuletaRenderer, type RuletaView } from "./render";
import { canAct, type RuletaSnap } from "./state";

const r2 = (v: number) => Math.round(v * 100) / 100;
const P2P_RESEND_MS = 100;
const FOOTER_OVER = "R: otra partida · J: cambiar juego · Esc: menú";
const FOOTER_GUEST_OVER = "Esperando al anfitrión · Esc: menú";

/** Acción de un invitado. `i` crece con cada acción nueva; se reenvía hasta verla en `ak`. */
export interface RuletaMsg {
  t: "r";
  i: number;
  k: number;
  a: number;
  b: number;
  c: number;
  s: number;
}

const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : -1);

function view(s: RuletaSnap, me: number, picker: Picker, active: boolean, netLabel: string, footer: string): RuletaView {
  const [label, hint] = active ? picker.describe(s, me) : ["", ""];
  return { s, me, focus: active ? picker.focus(s, me) : { kind: "none" }, label, hint, netLabel, footer };
}

/** Anfitrión (o partida local). */
export class RuletaHost implements HostGame {
  readonly size = [RW, RH] as const;
  netLabel = "";
  match: Match;
  private seq = 0;
  private readonly renderer = new RuletaRenderer();
  private readonly picker = new Picker();
  private readonly acks: number[];

  constructor(private input: RuletaInput, remoteCount: number, readonly mode: "local" | "host", bots = true) {
    const kinds: SlotKind[] = ["local", ...Array<SlotKind>(remoteCount).fill("remote")];
    // Sin rival no hay partida: si juegas solo, el crupier se sienta aunque los bots estén desactivados.
    if ((bots || kinds.length === 1) && kinds.length < SEATS) kinds.push("ai");
    this.match = new Match(kinds);
    this.acks = kinds.map(() => 0);
  }

  get finished() {
    return this.match.phase === PH_OVER;
  }

  private newMatch() {
    // Quien se desconectó sigue siendo bot.
    this.match = new Match(this.match.seats.map((s) => s.kind));
    this.picker.reset();
    this.renderer.reset();
  }

  update(dt: number) {
    this.match.update(dt);
    this.renderer.update(dt);
    this.input.poll();
    const s = this.snapshot();
    const action = this.picker.step(this.input, s, 0, canAct(s, 0));
    if (action) this.match.act(0, action);
  }

  key(code: string) {
    if (code === "KeyR") this.newMatch();
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const s = this.snapshot();
    this.renderer.draw(ctx, view(s, 0, this.picker, canAct(s, 0), this.netLabel, this.finished ? FOOTER_OVER : ""), pixelScale);
  }

  private snapshot(): RuletaSnap {
    const m = this.match;
    return {
      g: "ruleta",
      base: -1,
      seq: this.seq,
      ph: m.phase,
      pt: r2(m.phaseT),
      rd: m.round,
      tu: m.turn,
      bz: m.anim ? 1 : 0,
      p: m.seats.map((s) => [s.lives, s.max, s.out ? 1 : 0, s.cuffed, m.wins[s.index], s.kind === "ai" ? 1 : 0]),
      it: m.seats.map((s) => [...s.items]),
      ld: [m.loadLive, m.loadBlank],
      sw: m.saw ? 1 : 0,
      ev: [...m.ev],
      et: r2(m.evT),
      kn: m.seats.map((s) =>
        [...s.known].filter(([i]) => i >= m.pos).sort((a, b) => a[0] - b[0]).flatMap(([i, live]) => [i - m.pos + 1, live ? 1 : 0]),
      ),
      ak: [...this.acks],
      rw: m.roundWinner,
      dl: m.dealer,
    };
  }

  frame(): NetFrame {
    this.seq++;
    return { snap: this.snapshot(), base: null };
  }

  onMessage(index: number, msg: unknown) {
    const m = msg as Partial<RuletaMsg> | null;
    if (m?.t !== "r" || !Number.isInteger(m.i) || m.i! <= this.acks[index]) return;
    this.acks[index] = m.i!;
    const action: Action = { k: m.k === 1 ? 1 : 0, a: int(m.a), b: int(m.b), c: int(m.c) };
    this.match.act(index, action);
  }

  onDisconnect(index: number) {
    this.match.toAI(index);
  }
}

/** Invitado: dibuja la mesa recibida y envía la acción elegida. */
export class RuletaGuest implements GuestGame {
  readonly id = "ruleta" as const;
  readonly size = [RW, RH] as const;
  readonly baseSeq = -1;
  netLabel = "";
  private state: RuletaSnap | null = null;
  private readonly renderer = new RuletaRenderer();
  private readonly picker = new Picker();
  private pending: RuletaMsg | null = null;
  private actionId = 0;
  private seq = 0;
  private lastSentAt = 0;

  constructor(private index: number, private input: RuletaInput) {}

  get ready() {
    return this.state !== null;
  }

  onBase() {}

  onSnap(snap: unknown) {
    const s = snap as RuletaSnap;
    this.state = s;
    if (this.pending && (s.ak[this.index] ?? 0) >= this.pending.i) this.pending = null;
  }

  private get active() {
    return !!this.state && !this.pending && canAct(this.state, this.index);
  }

  update(dt: number) {
    this.renderer.update(dt);
    this.input.poll();
    const s = this.state;
    if (!s) return;
    // Los tiempos avanzan entre estados para que las animaciones vayan fluidas.
    s.pt += dt;
    s.et += dt;
    const action = this.picker.step(this.input, s, this.index, this.active);
    if (action) {
      this.pending = { t: "r", i: ++this.actionId, k: action.k, a: action.a, b: action.b ?? -1, c: action.c ?? -1, s: 0 };
    }
  }

  outgoing(transport: Transport): object | undefined {
    if (!this.state) return undefined;
    const now = performance.now();
    // Una acción pendiente se repite hasta que el anfitrión la confirma; si no, basta con dar señales de vida.
    const every = this.pending ? (transport === "p2p" ? P2P_RESEND_MS : 0) : RELAY_KEEPALIVE_MS;
    if (now - this.lastSentAt < every) return undefined;
    this.lastSentAt = now;
    const msg: RuletaMsg = this.pending ?? { t: "r", i: this.actionId, k: 0, a: -1, b: -1, c: -1, s: 0 };
    return { ...msg, s: ++this.seq };
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const s = this.state;
    if (!s) return;
    const footer = s.ph === PH_OVER ? FOOTER_GUEST_OVER : "";
    this.renderer.draw(ctx, view(s, this.index, this.picker, this.active, this.netLabel, footer), pixelScale);
  }
}
