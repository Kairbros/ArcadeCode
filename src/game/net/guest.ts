// Invitado: conecta con el anfitrión (WebRTC directo; si la red no lo permite, relé por Vercel),
// crea el juego que indique el estado recibido y le pasa estados y entradas.
import { DEFAULT_SIZE } from "../core/config";
import { setName } from "../core/names";
import { settings } from "../core/settings";
import { createGuestGame, isGameId } from "../hub";
import type { Keyboard } from "../core/keyboard";
import { TRANSPORT_LABEL, type HostMessage, type Transport } from "./protocol";
import { P2P_TIMEOUT_MS, RELAY_HZ, RELAY_MAX_IN_FLIGHT, RELAY_STALE_MS } from "./relay";
import { applyAnswer, createOffer, isClosedState } from "./rtc";
import type { SignalClient } from "./signaling";
import type { GuestGame } from "./types";

export type GuestStatus = "connecting" | "relay-fallback" | "waiting" | "playing" | "lost";

const ANSWER_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SnapEnvelope {
  g: string;
  seq: number;
  /** Nombres de los jugadores, por índice (los añade la sesión del anfitrión). */
  n?: unknown[];
}

export class GuestSession {
  status: GuestStatus = "connecting";
  transport: Transport | null = null;
  index = -1;
  game: GuestGame | null = null;
  onStatus: (s: GuestStatus) => void = () => {};
  private code = "";
  private guestId = "";
  private closed = false;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  /** Última base recibida; se guarda por si llega justo antes de un cambio de juego. */
  private lastBase: { seq: number } | null = null;
  private pendingSnap: SnapEnvelope | null = null;
  private lastSeq = -1;
  private nameAcked = false;
  // Relé
  private relayInFlight = 0;
  private relayFailures = 0;
  private relayProgressAt = 0;

  constructor(private signal: SignalClient, private keyboard: Keyboard) {}

  get size(): readonly [number, number] {
    return this.game?.size ?? DEFAULT_SIZE;
  }

  async connect(code: string) {
    this.code = code;
    let offer: Awaited<ReturnType<typeof createOffer>> | null = null;
    try {
      offer = await createOffer();
    } catch (err) {
      console.warn("WebRTC no disponible, se usará el relé:", err);
    }
    this.guestId = (await this.signal.join(code, offer?.offer ?? null)).guestId;
    if (!offer) return this.startRelay(false);

    const { pc, channel } = offer;
    this.pc = pc;
    this.channel = channel;
    channel.addEventListener("message", (ev) => this.onMessage(String(ev.data)));

    const answerDeadline = Date.now() + ANSWER_TIMEOUT_MS;
    let answer: string | null = null;
    while (!answer) {
      if (this.closed) return;
      if (Date.now() > answerDeadline) throw new Error("El anfitrión no respondió");
      await sleep(1000);
      answer = (await this.signal.poll(code, this.guestId)).answer;
    }
    await applyAnswer(pc, answer);

    const opened = await new Promise<boolean>((resolve) => {
      if (channel.readyState === "open") return resolve(true);
      const timer = setTimeout(() => resolve(false), P2P_TIMEOUT_MS);
      channel.addEventListener("open", () => (clearTimeout(timer), resolve(true)), { once: true });
    });
    if (this.closed) return;
    if (!opened) {
      // La red no deja conectar equipo con equipo: seguimos por Vercel.
      pc.close();
      this.pc = this.channel = null;
      return this.startRelay(true);
    }
    this.transport = "p2p";
    // Por directo el nombre ya aparece en la sala de espera del anfitrión.
    if (settings.name) channel.send(JSON.stringify({ t: "hello", nm: settings.name }));
    channel.addEventListener("close", () => this.setStatus("lost"));
    pc.addEventListener("connectionstatechange", () => isClosedState(pc) && this.setStatus("lost"));
    this.setStatus("waiting");
  }

  private async startRelay(fallback: boolean) {
    if (fallback) {
      this.setStatus("relay-fallback");
      await this.signal.relay(this.code, this.guestId);
    }
    this.transport = "relay";
    this.setStatus("waiting");
    void this.relayLoop();
  }

  private get baseSeq(): number {
    return this.game ? this.game.baseSeq : (this.lastBase?.seq ?? -1);
  }

  /** Lanza una sincronización cada 1/RELAY_HZ s, con varias en vuelo para no esperar la latencia. */
  private async relayLoop() {
    this.relayProgressAt = Date.now();
    let lastLaunch = 0;
    while (!this.closed && this.status !== "lost") {
      const playing = this.status === "playing";
      // En la sala de espera basta con mirar dos veces por segundo.
      const due = playing || Date.now() - lastLaunch >= 500;
      if (due && this.relayInFlight < (playing ? RELAY_MAX_IN_FLIGHT : 1)) {
        lastLaunch = Date.now();
        this.relayInFlight++;
        void this.relaySync(playing).finally(() => this.relayInFlight--);
      }
      // Sin estado nuevo durante un rato: el anfitrión se ha ido.
      if (playing && Date.now() - this.relayProgressAt > RELAY_STALE_MS) this.setStatus("lost");
      await sleep(1000 / RELAY_HZ);
    }
  }

  private async relaySync(playing: boolean) {
    try {
      const m = playing ? this.withName(this.game?.outgoing("relay")) : undefined;
      const res = await this.signal.guestSync(this.code, this.guestId, this.baseSeq, m as never);
      this.relayFailures = 0;
      if (res.index !== null && this.index < 0) this.index = res.index;
      if (res.base) this.handleBase(JSON.parse(res.base) as { seq: number });
      if (res.snap) {
        const snap = JSON.parse(res.snap) as SnapEnvelope;
        if (snap.seq > this.lastSeq) {
          this.relayProgressAt = Date.now();
          this.handleSnap(snap);
        }
      }
      this.ensureGame();
    } catch (err) {
      if (++this.relayFailures >= 10) {
        console.warn("Relé sin respuesta:", err);
        this.setStatus("lost");
      }
    }
  }

  private setStatus(s: GuestStatus) {
    if (this.status === s || this.status === "lost") return;
    this.status = s;
    this.onStatus(s);
  }

  private onMessage(data: string) {
    let msg: HostMessage;
    try {
      msg = JSON.parse(data) as HostMessage;
    } catch {
      return;
    }
    if (msg.t === "welcome") {
      this.index = msg.index;
      this.ensureGame();
    } else if (msg.t === "base") {
      this.handleBase(msg.b);
    } else if (msg.t === "snap" && msg.d.seq > this.lastSeq) {
      this.handleSnap(msg.d);
    }
  }

  private handleBase(base: { seq: number }) {
    this.lastBase = base;
    this.game?.onBase(base);
  }

  /** Adjunta el nombre propio hasta que el anfitrión lo reparta en sus estados. */
  private withName(m: object | undefined): object | undefined {
    return m && !this.nameAcked && settings.name ? { ...m, nm: settings.name } : m;
  }

  private handleSnap(snap: SnapEnvelope) {
    this.lastSeq = snap.seq;
    if (Array.isArray(snap.n)) {
      snap.n.forEach((name, i) => setName(i, name));
      this.nameAcked = !settings.name || snap.n[this.index] === settings.name;
    }
    this.pendingSnap = snap;
    this.ensureGame();
  }

  /** Crea el juego cuando se conocen el índice y el tipo de juego (o el anfitrión lo cambia). */
  private ensureGame() {
    const snap = this.pendingSnap;
    if (!snap || this.index < 0 || !isGameId(snap.g)) return;
    if (!this.game || this.game.id !== snap.g) {
      this.game = createGuestGame(snap.g, this.index, this.keyboard);
      this.game.netLabel = this.transport ? `Conexión ${TRANSPORT_LABEL[this.transport]}` : "";
      if (this.lastBase) this.game.onBase(this.lastBase);
    }
    this.game.onSnap(snap);
    this.pendingSnap = null;
    if (this.game.ready) this.setStatus("playing");
  }

  update(dt: number) {
    const game = this.game;
    if (!game) return;
    game.update(dt);
    if (this.transport === "p2p" && this.channel?.readyState === "open") {
      const m = this.withName(game.outgoing("p2p"));
      if (m) this.channel.send(JSON.stringify(m));
    }
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale: number) {
    this.game?.draw(ctx, pixelScale);
  }

  close() {
    this.closed = true;
    this.status = "lost";
    this.pc?.close();
  }
}
