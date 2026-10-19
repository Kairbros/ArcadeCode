// Bloques en el hub. El mundo sale de una semilla, así que por la red solo viajan las posiciones y
// los cambios de bloques:
// - Cada jugador mueve a su muñeco en su equipo (sin retraso) y manda su posición.
// - Los cambios los ordena el anfitrión en un registro numerado (n). Cada estado lleva los últimos
//   EDITS_IN_SNAP; si a un invitado le falta alguno, se pone al día con la base: la lista completa de
//   bloques distintos de los generados, que se renueva como mucho cada REBASE_EVERY s si hubo cambios.
// - El invitado aplica sus cambios al momento y los reenvía (numerados con k) hasta ver en `ak` que el
//   anfitrión los ha recibido.
import type { Transport } from "../net/protocol";
import { RELAY_KEEPALIVE_MS } from "../net/relay";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { AIR, BEDROCK, BLOCKS, HOTBAR, WATER, isBlock } from "./blocks";
import { EDITS_IN_SNAP, EDITS_PER_MSG, REBASE_EVERY, VH, VW } from "./config";
import type { WalkSource } from "./input";
import { Pilot, type Edit } from "./pilot";
import { BlocksRenderer, type Avatar, type BlocksView } from "./render";
import { World } from "./world";

const r2 = (v: number) => Math.round(v * 100) / 100;
const P2P_SEND_MS = 50;

interface BlocksBase {
  seq: number;
  /** Último cambio del registro incluido. */
  n: number;
  /** Bloques distintos de los generados: x, y, z, bloque... */
  d: number[];
}

/** Estado que reciben los invitados. */
interface BlocksSnap {
  g: "blocks";
  seq: number;
  base: number;
  sd: number; // semilla
  n: number; // último cambio del registro
  ed: number[]; // últimos cambios: n, x, y, z, bloque...
  /** Por jugador: x, y, z, guiñada, cabeceo, bloque en la mano (vacío = no está). */
  p: number[][];
  ak: number[]; // último cambio recibido de cada invitado (k)
  t: number;
}

/** Mensaje de un invitado: posición, mirada, bloque en la mano y cambios pendientes [k, x, y, z, b]. */
interface BlocksMsg {
  t: "m";
  x: number;
  y: number;
  z: number;
  a: number;
  p: number;
  h: number;
  e: number[][];
  s: number;
}

interface Remote extends Avatar {
  connected: boolean;
  seq: number;
  lastK: number;
  seen: boolean; // ya mandó su posición
}

/** ¿Es válido este cambio sobre el mundo actual? (también lo comprueba el invitado al pedirlo) */
function validEdit(w: World, x: number, y: number, z: number, b: number): boolean {
  if (![x, y, z].every(Number.isInteger) || !World.inside(x, y, z) || !isBlock(b) || b === BEDROCK || b === WATER) return false;
  const cur = w.get(x, y, z);
  if (b === AIR) return cur !== AIR && cur !== WATER && !BLOCKS[cur].unbreakable;
  return cur === AIR || cur === WATER;
}

function viewOf(world: World, me: number, pilot: Pilot, others: Avatar[], netLabel: string, time: number): BlocksView {
  const b = pilot.body;
  return {
    world, me, x: b.x, y: b.y, z: b.z, yaw: pilot.yaw, pitch: pilot.pitch, slot: pilot.slot, flying: b.flying,
    target: pilot.target, others, netLabel, time,
  };
}

/** Anfitrión (o partida local): dueño del mundo y del registro de cambios. */
export class BlocksHost implements HostGame {
  readonly size = [VW, VH] as const;
  netLabel = "";
  /** Modo creativo: no hay final, se puede cambiar de juego cuando se quiera. */
  readonly finished = true;
  readonly world: World;
  readonly pilot: Pilot;
  private remotes: Remote[];
  private log: number[] = [];
  private n = 0;
  private base: BlocksBase = { seq: 1, n: 0, d: [] };
  private baseAt = 0;
  private seq = 0;
  private time = 0;
  private readonly renderer = new BlocksRenderer();

  constructor(private input: WalkSource, remoteCount: number, private mode: "local" | "host", _bots = true, seed?: number) {
    this.world = new World(seed ?? 1 + Math.floor(Math.random() * 999_999));
    this.pilot = new Pilot(this.world, 0);
    this.remotes = Array.from({ length: remoteCount }, (_, i) => {
      const p = new Pilot(this.world, i + 1).body;
      return { index: i + 1, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, block: HOTBAR[0], connected: true, seq: -1, lastK: 0, seen: false };
    });
  }

  private apply([x, y, z, b]: Edit): boolean {
    if (!validEdit(this.world, x, y, z, b)) return false;
    this.world.set(x, y, z, b);
    this.log.push(++this.n, x, y, z, b);
    if (this.log.length > EDITS_IN_SNAP * 5) this.log.splice(0, this.log.length - EDITS_IN_SNAP * 5);
    return true;
  }

  private get others(): Avatar[] {
    return this.remotes.filter((r) => r.connected && r.seen);
  }

  update(dt: number) {
    this.time += dt;
    this.renderer.update(dt);
    for (const e of this.pilot.update(this.input, this.world, this.others, dt)) this.apply(e);
    if (this.base.n !== this.n && this.time - this.baseAt >= REBASE_EVERY) {
      this.base = { seq: this.base.seq + 1, n: this.n, d: this.world.diffList() };
      this.baseAt = this.time;
    }
  }

  key() {}

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    this.renderer.draw(ctx, viewOf(this.world, 0, this.pilot, this.others, this.netLabel, this.time), pixelScale);
  }

  frame(): NetFrame {
    const b = this.pilot.body;
    const me = [r2(b.x), r2(b.y), r2(b.z), r2(this.pilot.yaw), r2(this.pilot.pitch), this.pilot.block];
    const snap: BlocksSnap = {
      g: "blocks",
      seq: ++this.seq,
      base: this.base.seq,
      sd: this.world.seed,
      n: this.n,
      ed: this.log,
      p: [me, ...this.remotes.map((r) => (r.connected && r.seen ? [r2(r.x), r2(r.y), r2(r.z), r2(r.yaw), r2(r.pitch), r.block] : []))],
      ak: [0, ...this.remotes.map((r) => r.lastK)],
      t: Math.round(this.time),
    };
    return { snap, base: this.base };
  }

  onMessage(index: number, msg: unknown) {
    const r = this.remotes[index - 1];
    const m = msg as BlocksMsg;
    if (!r || m?.t !== "m") return;
    const s = Number(m.s);
    if (!(s > r.seq)) return; // llegó tarde
    r.seq = s;
    const nums = [m.x, m.y, m.z, m.a, m.p].map(Number);
    if (nums.every(Number.isFinite)) {
      [r.x, r.y, r.z, r.yaw, r.pitch] = nums;
      r.seen = true;
    }
    if (isBlock(Number(m.h))) r.block = Number(m.h);
    // Cambios en orden: solo el siguiente al último recibido (los demás se reenviarán).
    for (const e of Array.isArray(m.e) ? m.e.slice(0, EDITS_PER_MSG) : []) {
      if (!Array.isArray(e) || e.length !== 5) break;
      const [k, x, y, z, b] = e.map(Number);
      if (k <= r.lastK) continue;
      if (k !== r.lastK + 1) break;
      r.lastK = k;
      this.apply([x, y, z, b]);
    }
  }

  onDisconnect(index: number) {
    const r = this.remotes[index - 1];
    if (r) r.connected = false;
  }

  get isLocal() {
    return this.mode === "local";
  }
}

/** Invitado: copia del mundo al día con el registro del anfitrión, y su propio jugador. */
export class BlocksGuest implements GuestGame {
  readonly id = "blocks" as const;
  readonly size = [VW, VH] as const;
  netLabel = "";
  private world: World | null = null;
  private pilot: Pilot | null = null;
  private applied = 0; // último cambio del registro aplicado
  private gap = false; // faltan cambios: hay que esperar a una base
  private lastBase: BlocksBase | null = null;
  private others: Avatar[] = [];
  private pending: number[][] = []; // [k, x, y, z, b]
  private k = 0;
  private seq = 0;
  private lastInput = "";
  private lastSentAt = 0;
  private time = 0;
  private readonly renderer = new BlocksRenderer();

  constructor(private index: number, private input: WalkSource) {}

  get ready() {
    return this.world !== null;
  }

  /** Última base recibida (el relé solo la reenvía si cambia). */
  get baseSeq() {
    return this.lastBase?.seq ?? -1;
  }

  onBase(base: unknown) {
    const b = base as BlocksBase;
    if (!b || !Array.isArray(b.d) || (this.lastBase && b.seq <= this.lastBase.seq)) return;
    this.lastBase = b;
    this.applyBase();
  }

  private applyBase() {
    const b = this.lastBase;
    if (!this.world || !b || !(b.n > this.applied || this.gap)) return;
    this.world.loadDiff(b.d);
    this.applied = b.n;
    this.gap = false;
    // Los cambios propios aún sin confirmar se vuelven a aplicar encima.
    for (const [, x, y, z, bl] of this.pending) this.world.set(x, y, z, bl);
  }

  onSnap(snap: unknown) {
    const s = snap as BlocksSnap;
    if (!this.world || this.world.seed !== s.sd) {
      this.world = new World(s.sd);
      this.pilot = new Pilot(this.world, this.index);
      this.applied = 0;
      this.renderer.dispose();
      this.applyBase();
    }
    const w = this.world;
    for (let i = 0; i + 4 < s.ed.length; i += 5) {
      const n = s.ed[i];
      if (n <= this.applied) continue;
      if (n !== this.applied + 1) {
        this.gap = true;
        break;
      }
      w.set(s.ed[i + 1], s.ed[i + 2], s.ed[i + 3], s.ed[i + 4]);
      this.applied = n;
    }
    if (this.gap) this.applyBase();
    const ack = s.ak[this.index] ?? 0;
    this.pending = this.pending.filter((e) => e[0] > ack);
    this.others = s.p.flatMap((row, i) =>
      i === this.index || row.length < 6 ? [] : [{ index: i, x: row[0], y: row[1], z: row[2], yaw: row[3], pitch: row[4], block: row[5] }]);
    this.time = Math.max(this.time, s.t);
  }

  update(dt: number) {
    this.time += dt;
    this.renderer.update(dt);
    if (!this.world || !this.pilot) return;
    for (const [x, y, z, b] of this.pilot.update(this.input, this.world, this.others, dt)) {
      if (!validEdit(this.world, x, y, z, b)) continue;
      this.world.set(x, y, z, b); // se ve al momento; el anfitrión lo confirma
      this.pending.push([++this.k, x, y, z, b]);
    }
  }

  outgoing(transport: Transport): object | undefined {
    const p = this.pilot;
    if (!p) return undefined;
    const b = p.body;
    const now = performance.now();
    const pose = [r2(b.x), r2(b.y), r2(b.z), r2(p.yaw), r2(p.pitch), p.block];
    const key = pose.join(",") + this.pending.length;
    const every = transport === "p2p" ? P2P_SEND_MS : 0;
    const keepalive = transport === "p2p" ? 100 : RELAY_KEEPALIVE_MS;
    if (now - this.lastSentAt < every) return undefined;
    if (key === this.lastInput && !this.pending.length && now - this.lastSentAt < keepalive) return undefined;
    this.lastInput = key;
    this.lastSentAt = now;
    const msg: BlocksMsg = {
      t: "m", x: pose[0], y: pose[1], z: pose[2], a: pose[3], p: pose[4], h: pose[5],
      e: this.pending.slice(0, EDITS_PER_MSG), s: ++this.seq,
    };
    return msg;
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    if (!this.world || !this.pilot) return;
    this.renderer.draw(ctx, viewOf(this.world, this.index, this.pilot, this.others, this.netLabel, this.time), pixelScale);
  }
}
