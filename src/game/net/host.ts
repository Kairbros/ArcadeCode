// Anfitrión: abre sala, acepta invitados (WebRTC directo o relé por Vercel), ejecuta el juego
// elegido y reparte su estado. No sabe de qué juego se trata: eso lo aporta un HostGame.
import { MAX_PLAYERS, PLAYER_NAMES, SNAPSHOT_HZ } from "../core/config";
import { myName, resetNames, setName } from "../core/names";
import { cleanName } from "../core/settings";
import { createHostGame, type GameId, type GameOptions } from "../hub";
import type { Keyboard } from "../core/keyboard";
import { TRANSPORT_LABEL, type HostMessage, type Transport } from "./protocol";
import { RELAY_HZ, RELAY_MAX_IN_FLIGHT, RELAY_STALE_MS } from "./relay";
import { acceptOffer, isClosedState } from "./rtc";
import type { SignalClient } from "./signaling";
import type { HostGame, NetFrame } from "./types";

export interface Peer {
  guestId: string;
  transport: Transport;
  pc: RTCPeerConnection | null;
  channel: RTCDataChannel | null;
  /** Número de jugador asignado al empezar (1..3). */
  index: number;
  /** Listo para jugar: canal directo abierto, o relé solicitado. */
  ready: boolean;
  connected: boolean;
  sentBase: number; // última base enviada por canal directo
  lastSeen: number; // última entrada recibida por relé
  /** Nombre que eligió el invitado ("" hasta que lo envíe). */
  name: string;
}

const MAX_BUFFERED = 256 * 1024; // si un invitado va lento, se saltan envíos en vez de acumular

export class HostSession {
  code = "";
  peers: Peer[] = [];
  game: HostGame | null = null;
  /** Se llama cuando cambia la lista de jugadores (para refrescar la sala). */
  onChange: () => void = () => {};
  onError: (msg: string) => void = () => {};
  private hostKey = "";
  private polling = false;
  private closed = false;
  private lastFrame: NetFrame | null = null;
  private snapTimer = 0;
  // Relé
  private relayTimer = 0;
  private relayInFlight = 0;
  private relayBaseSent = -1;
  private relayFailures = 0;
  private pendingWelcomes: Record<string, number> = {};
  private keyboard: Keyboard | null = null;
  // Cada juego numera sus estados y bases desde 1: al cambiar de juego se suma un desfase para que
  // los invitados (que descartan secuencias viejas) acepten los del juego nuevo.
  private seqOffset = 0;
  private baseOffset = 0;
  private lastSeq = 0;
  private lastBase = 0;

  constructor(private signal: SignalClient, public gameId: GameId, private opts: GameOptions = {}) {}

  async open() {
    ({ code: this.code, hostKey: this.hostKey } = await this.signal.create());
    this.polling = true;
    void this.pollLoop();
  }

  /** Invitados listos para jugar. */
  get readyPeers(): Peer[] {
    return this.peers.filter((p) => p.connected && p.ready);
  }

  private get freeSlots(): number {
    return MAX_PLAYERS - 1 - this.peers.filter((p) => p.connected).length;
  }

  private async pollLoop() {
    let failures = 0;
    while (this.polling && !this.closed) {
      try {
        const { offers, relays } = await this.signal.offers(this.code, this.hostKey);
        failures = 0;
        for (const guestId of relays) this.acceptRelay(guestId);
        for (const { guestId, offer } of offers) if (this.freeSlots > 0) void this.acceptOffer(guestId, offer);
      } catch (err) {
        if (++failures === 5) this.onError((err as Error).message);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  private addPeer(guestId: string, transport: Transport, pc: RTCPeerConnection | null): Peer {
    const peer: Peer = {
      guestId, transport, pc, channel: null, index: 0,
      ready: transport === "relay", connected: true, sentBase: -1, lastSeen: performance.now(), name: "",
    };
    this.peers.push(peer);
    return peer;
  }

  private drop(peer: Peer) {
    if (!peer.connected) return;
    peer.connected = false;
    peer.pc?.close();
    if (this.game && peer.index) this.game.onDisconnect(peer.index);
    this.updateLabel();
    this.onChange();
  }

  private receive(peer: Peer, msg: unknown) {
    // El invitado adjunta su nombre (campo nm) hasta ver que el anfitrión lo reparte.
    const nm = cleanName((msg as { nm?: unknown } | null)?.nm);
    if (nm && nm !== peer.name) {
      peer.name = nm;
      if (peer.index) setName(peer.index, nm);
      this.onChange();
    }
    if ((msg as { t?: unknown } | null)?.t === "hello") return;
    if (this.game && peer.index && peer.connected) this.game.onMessage(peer.index, msg);
  }

  private async acceptOffer(guestId: string, offer: string) {
    try {
      const { pc, answer, channel } = await acceptOffer(offer);
      const peer = this.addPeer(guestId, "p2p", pc);
      pc.addEventListener("connectionstatechange", () => isClosedState(pc) && this.drop(peer));
      await this.signal.answer(this.code, this.hostKey, guestId, answer);
      const ch = await channel;
      peer.channel = ch;
      ch.addEventListener("message", (ev) => {
        try {
          this.receive(peer, JSON.parse(String(ev.data)));
        } catch {
          // mensaje inválido: se ignora
        }
      });
      ch.addEventListener("close", () => this.drop(peer));
      const ready = () => {
        peer.ready = true;
        this.onChange();
      };
      if (ch.readyState === "open") ready();
      else ch.addEventListener("open", ready, { once: true });
    } catch (err) {
      console.warn("Invitado rechazado:", err);
    }
  }

  /** El invitado no pudo conectar directo (o no tiene WebRTC): pasa a relé. */
  private acceptRelay(guestId: string) {
    const previous = this.peers.find((p) => p.guestId === guestId && p.connected);
    if (previous) {
      // Sustituye su intento directo fallido sin avisar de desconexión.
      previous.connected = false;
      previous.pc?.close();
    } else if (this.freeSlots <= 0) {
      return;
    }
    this.addPeer(guestId, "relay", null);
    this.onChange();
  }

  /** Cierra la sala a nuevos jugadores y arranca el juego con los que están listos. */
  start(keyboard: Keyboard) {
    this.polling = false;
    void this.signal.close(this.code, this.hostKey).catch(() => {});
    const players = this.readyPeers;
    for (const p of this.peers) if (!players.includes(p)) p.pc?.close();
    this.peers = players;
    resetNames();
    setName(0, myName(0));
    players.forEach((p, i) => {
      p.index = i + 1;
      setName(p.index, p.name);
      p.lastSeen = performance.now();
      if (p.transport === "p2p") this.send(p, { t: "welcome", index: p.index });
      else this.pendingWelcomes[p.guestId] = p.index;
    });
    this.keyboard = keyboard;
    this.switchGame(this.gameId);
  }

  /** Arranca otro juego con los mismos jugadores, sin cerrar la sala. */
  switchGame(id: GameId) {
    if (!this.keyboard) return;
    this.gameId = id;
    this.seqOffset = this.lastSeq;
    this.baseOffset = this.lastBase;
    this.lastFrame = null;
    const game = createHostGame(id, this.keyboard, this.peers.length, this.opts);
    // Quien se fue sigue fuera en el juego nuevo.
    for (const p of this.peers) if (!p.connected) game.onDisconnect(p.index);
    this.game = game;
    this.updateLabel();
  }

  /** Aplica el desfase de secuencias del juego actual. */
  private stamp({ snap, base }: NetFrame): NetFrame {
    const out = {
      ...snap, seq: snap.seq + this.seqOffset, base: snap.base < 0 ? snap.base : snap.base + this.baseOffset,
      n: PLAYER_NAMES.slice(0, this.peers.length + 1), // nombres de todos los jugadores
    };
    const b = base && { ...base, seq: base.seq + this.baseOffset };
    this.lastSeq = out.seq;
    if (b) this.lastBase = Math.max(this.lastBase, b.seq);
    return { snap: out, base: b };
  }

  private updateLabel() {
    if (!this.game) return;
    const live = this.peers.filter((p) => p.connected);
    const direct = live.filter((p) => p.transport === "p2p").length;
    const relay = live.length - direct;
    const parts = [direct && `${direct} ${TRANSPORT_LABEL.p2p}`, relay && `${relay} ${TRANSPORT_LABEL.relay}`];
    this.game.netLabel = `Anfitrión · ${parts.filter(Boolean).join(", ") || "sin invitados"}`;
  }

  update(dt: number) {
    const game = this.game;
    if (!game) return;
    game.update(dt);

    this.snapTimer += dt;
    if (this.snapTimer >= 1 / SNAPSHOT_HZ) {
      this.snapTimer = 0;
      this.lastFrame = this.stamp(game.frame(performance.now()));
      this.sendDirect(this.lastFrame);
    }

    this.relayTimer += dt;
    if (this.relayTimer >= 1 / RELAY_HZ && this.relayInFlight < RELAY_MAX_IN_FLIGHT && this.lastFrame) {
      const relayPeers = this.peers.filter((p) => p.connected && p.transport === "relay");
      if (relayPeers.length) {
        this.relayTimer = 0;
        void this.syncRelay(this.lastFrame, relayPeers);
      }
    }
  }

  private sendDirect({ snap, base }: NetFrame) {
    const snapJson = JSON.stringify({ t: "snap", d: snap } satisfies HostMessage);
    for (const p of this.peers) {
      const ch = p.channel;
      if (!p.connected || p.transport !== "p2p" || ch?.readyState !== "open" || ch.bufferedAmount > MAX_BUFFERED) continue;
      if (base && p.sentBase !== base.seq) {
        ch.send(JSON.stringify({ t: "base", b: base } satisfies HostMessage));
        p.sentBase = base.seq;
      }
      ch.send(snapJson);
    }
  }

  private async syncRelay({ snap, base }: NetFrame, relayPeers: Peer[]) {
    this.relayInFlight++;
    const sendBase = base !== null && this.relayBaseSent < base.seq;
    const welcomes = this.pendingWelcomes;
    try {
      const { msgs } = await this.signal.hostSync(
        this.code, this.hostKey, JSON.stringify(snap), snap.base,
        sendBase ? JSON.stringify(base) : undefined,
        Object.keys(welcomes).length ? welcomes : undefined,
      );
      this.relayFailures = 0;
      if (sendBase) this.relayBaseSent = Math.max(this.relayBaseSent, base.seq);
      if (welcomes === this.pendingWelcomes) this.pendingWelcomes = {};
      const now = performance.now();
      for (const { g, m } of msgs) {
        const peer = relayPeers.find((p) => p.guestId === g);
        if (!peer) continue;
        peer.lastSeen = now;
        this.receive(peer, m);
      }
      for (const p of relayPeers) if (now - p.lastSeen > RELAY_STALE_MS) this.drop(p);
    } catch (err) {
      if (++this.relayFailures === 10) console.warn("El relé no responde:", err);
    } finally {
      this.relayInFlight--;
    }
  }

  private send(peer: Peer, msg: HostMessage) {
    if (peer.channel?.readyState === "open") peer.channel.send(JSON.stringify(msg));
  }

  close() {
    this.closed = true;
    this.polling = false;
    if (this.code && !this.game) void this.signal.close(this.code, this.hostKey).catch(() => {});
    for (const p of this.peers) p.pc?.close();
    this.peers = [];
  }
}
