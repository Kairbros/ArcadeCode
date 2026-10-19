// Bloques en el hub. El mundo sale de una semilla, así que por la red solo viajan las posiciones y
// los cambios de bloques:
// - Cada jugador mueve a su muñeco en su equipo (sin retraso) y manda su posición.
// - Los cambios los ordena el anfitrión en un registro numerado (n). Cada estado lleva los cambios que
//   algún invitado aún no ha aplicado (cada invitado dice por dónde va con `q`), así que cuando todos
//   están al día el estado pesa muy poco. Si a un invitado le falta alguno, se pone al día con la base:
//   la lista completa de bloques distintos de los generados, que se renueva como mucho cada REBASE_EVERY s.
// - El invitado aplica sus cambios al momento y los reenvía (numerados con k) hasta ver en `ak` que el
//   anfitrión los ha recibido.
// - El modo (creativo o supervivencia) lo decide el anfitrión y viaja en el estado (`md`).
// - En local el mundo (semilla + cambios) y la mochila se guardan en localStorage.
import { setUiOpen, type WalkSource } from "./input";
import type { Transport } from "../net/protocol";
import { RELAY_KEEPALIVE_MS } from "../net/relay";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { AIR, BEDROCK, BLOCKS, HOTBAR, WATER, isBlock } from "./blocks";
import {
  EDITS_IN_SNAP, EDITS_PER_MSG, MAX_PENDING, REBASE_EVERY, SAVE_EVERY, VH, VW,
} from "./config";
import { Inventory, type Stack } from "./inventory";
import { Pilot, type Edit } from "./pilot";
import { BlocksRenderer, type Avatar, type BlocksView } from "./render";
import { clearSaved, loadPlayer, loadSaved, savePlayer, saveWorld, savedSeed } from "./save";
import { MAX_HUNGER, MAX_HP } from "./survival";
import { BlocksUi } from "./ui";
import { World } from "./world";

const r2 = (v: number) => Math.round(v * 100) / 100;
const P2P_SEND_MS = 50;
const randomSeed = () => 1 + Math.floor(Math.random() * 999_999);

interface BlocksBase {
  seq: number;
  /** Mundo al que pertenece (una base de otro mundo no vale). */
  sd: number;
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
  /** Modo: 0 creativo, 1 supervivencia. */
  md: number;
  n: number; // último cambio del registro
  ed: number[]; // cambios que algún invitado aún no tiene: n, x, y, z, bloque...
  /** Por jugador: x, y, z, guiñada, cabeceo, bloque en la mano (vacío = no está). */
  p: number[][];
  ak: number[]; // último cambio recibido de cada invitado (k)
  t: number;
}

/** Mensaje de un invitado: posición, mirada, bloque en la mano, cambios pendientes [k, x, y, z, b] y su avance. */
interface BlocksMsg {
  t: "m";
  x: number;
  y: number;
  z: number;
  a: number;
  p: number;
  h: number;
  e: number[][];
  /** Último cambio del anfitrión que ya tiene aplicado (para no reenviarle lo que ya sabe). */
  q: number;
  s: number;
}

interface Remote extends Avatar {
  connected: boolean;
  seq: number;
  lastK: number;
  /** Último cambio del anfitrión que el invitado tiene aplicado. */
  ackN: number;
  seen: boolean; // ya mandó su posición
}

/** ¿Es válido este cambio sobre el mundo actual? (también lo comprueba el invitado al pedirlo) */
function validEdit(w: World, x: number, y: number, z: number, b: number): boolean {
  if (![x, y, z].every(Number.isInteger) || !World.inside(x, y, z) || !isBlock(b) || b === BEDROCK || b === WATER) return false;
  const cur = w.get(x, y, z);
  if (b === AIR) return cur !== AIR && cur !== WATER && !BLOCKS[cur].unbreakable;
  return cur === AIR || cur === WATER;
}

/** Barra rápida tal como se dibuja: en creativo, bloques infinitos (cantidad 0). */
function slotsOf(p: Pilot): (Stack | null)[] {
  return p.survivalMode ? p.inv.hotbar : p.slots.map((id) => ({ id, n: 0 }));
}

function viewOf(
  world: World, me: number, pilot: Pilot, others: Avatar[], netLabel: string, time: number,
  prompt: boolean, local: boolean,
): BlocksView {
  const b = pilot.body;
  const s = pilot.survival;
  return {
    world, me, x: b.x, y: b.y, z: b.z, yaw: pilot.yaw, pitch: pilot.pitch, slot: pilot.slot,
    slots: slotsOf(pilot), flying: b.flying, target: pilot.target, others, netLabel, time, prompt, local,
    survival: !!s,
    vitals: s ? { hp: s.hp, air: s.air, hunger: s.hunger, hurt: s.hurt, dead: s.dead, deadT: s.deadT } : null,
    mining: pilot.mining ? Math.min(1, pilot.mining.k) : null,
    drops: pilot.drops.list,
    mobs: pilot.mobs.list,
  };
}

/** Anfitrión (o partida local): dueño del mundo y del registro de cambios. */
export class BlocksHost implements HostGame {
  readonly size = [VW, VH] as const;
  netLabel = "";
  /** Modo creativo: no hay final, se puede cambiar de juego cuando se quiera. */
  readonly finished = true;
  world: World;
  pilot: Pilot;
  /** Panel de inventario/fabricación (solo supervivencia). */
  readonly ui = new BlocksUi();
  private remotes: Remote[];
  private log: number[] = [];
  private n = 0;
  private base: BlocksBase = { seq: 1, sd: 0, n: 0, d: [] };
  private baseAt = 0;
  private seq = 0;
  private time = 0;
  /** Segundo N para confirmar el mundo nuevo. */
  private confirmAt = -9;
  private savedAt = 0;
  private savedCount = -1;
  private readonly renderer = new BlocksRenderer();

  constructor(
    private input: WalkSource, remoteCount: number, private mode: "local" | "host",
    /** Supervivencia (vida, herramientas, objetos); false = creativo. */
    readonly survival = false, seed?: number,
  ) {
    // En local se retoma el último mundo guardado; en red manda la semilla del anfitrión.
    const chosen = seed ?? (mode === "local" ? savedSeed() ?? randomSeed() : randomSeed());
    this.world = new World(chosen);
    this.base = { seq: 1, sd: chosen, n: 0, d: [] };
    if (mode === "local") loadSaved(this.world);
    this.pilot = new Pilot(this.world, 0, survival);
    if (mode === "local" && survival) this.loadLocalPlayer(chosen);
    this.remotes = this.makeRemotes(remoteCount);
  }

  /** Recupera vida, hambre y mochila del mundo guardado (solo en local). */
  private loadLocalPlayer(seed: number) {
    const p = loadPlayer(seed);
    if (!p) return;
    this.pilot.inv.replaceWith(Inventory.fromJSON(p.inv));
    if (this.pilot.survival) {
      this.pilot.survival.hp = Math.max(1, Math.min(MAX_HP, Math.round(p.hp)));
      this.pilot.survival.hunger = Math.max(0, Math.min(MAX_HUNGER, p.hunger));
    }
  }

  private makeRemotes(count: number): Remote[] {
    return Array.from({ length: count }, (_, i) => {
      const p = new Pilot(this.world, i + 1, false).body;
      return {
        index: i + 1, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, block: HOTBAR[0],
        connected: true, seq: -1, lastK: 0, ackN: 0, seen: false,
      };
    });
  }

  private apply([x, y, z, b]: Edit): boolean {
    if (!validEdit(this.world, x, y, z, b)) return false;
    this.world.set(x, y, z, b);
    this.log.push(++this.n, x, y, z, b);
    if (this.log.length > EDITS_IN_SNAP * 10) this.trimLog();
    return true;
  }

  /** Tira del registro lo que ya tienen todos los invitados (lo que falte lo lleva la base). */
  private trimLog() {
    const ack = this.minAck();
    let cut = 0;
    while (cut + 4 < this.log.length && this.log[cut] <= ack) cut += 5;
    if (cut) this.log.splice(0, cut);
  }

  /** Último cambio del registro que tienen todos los invitados (el propio, si no hay ninguno). */
  private minAck(): number {
    let ack = this.n;
    for (const r of this.remotes) {
      if (!r.connected || !r.seen) continue;
      if (r.ackN < ack) ack = r.ackN;
    }
    return ack;
  }

  private get others(): Avatar[] {
    return this.remotes.filter((r) => r.connected && r.seen);
  }

  update(dt: number) {
    this.time += dt;
    this.renderer.update(dt);
    if (this.ui.open) {
      this.ui.nearFurnace = this.pilot.nearFurnace;
      const c = this.input.takeUiClick();
      if (c) this.ui.click(c[0], c[1], this.pilot.inv);
    }
    for (const e of this.pilot.update(this.input, this.world, this.others, dt, this.ui.open)) this.apply(e);
    if (this.base.n !== this.n && this.time - this.baseAt >= REBASE_EVERY) {
      this.base = { seq: this.base.seq + 1, sd: this.world.seed, n: this.n, d: this.world.diffList() };
      this.baseAt = this.time;
    }
    this.trimLog();
    this.saveLocal();
  }

  /** Guarda el mundo y la mochila de vez en cuando (solo en local). */
  private saveLocal() {
    if (this.mode !== "local" || this.time - this.savedAt < SAVE_EVERY) return;
    const changed = this.world.diff.size !== this.savedCount;
    if (!changed && !this.survival) return;
    this.savedAt = this.time;
    if (saveWorld(this.world)) this.savedCount = this.world.diff.size;
    if (this.survival && this.pilot.survival) savePlayer(this.world.seed, this.pilot.survival.hp, this.pilot.inv.toJSON(), this.pilot.survival.hunger);
  }

  key(code: string) {
    // Mochila y fabricación (en supervivencia).
    if (this.survival && (code === "KeyI" || code === "KeyC" || code === "Tab")) {
      this.toggleUi();
      return;
    }
    // N dos veces seguidas (en 4 s) empieza un mundo nuevo; con una sola, avisa en el HUD.
    if (code !== "KeyN" || this.mode !== "local") return;
    if (this.time - this.confirmAt > 4) {
      this.confirmAt = this.time;
      return;
    }
    this.newWorld();
  }

  private toggleUi() {
    if (this.ui.open) this.ui.close(this.pilot.inv);
    else this.ui.open = true;
    setUiOpen(this.ui.open);
  }

  /** Escape con el panel abierto: se cierra el panel y no se sale al menú. */
  escape(): boolean {
    if (!this.ui.open) return false;
    this.ui.close(this.pilot.inv);
    setUiOpen(this.ui.open);
    return true;
  }

  private newWorld() {
    clearSaved();
    this.world = new World(randomSeed());
    this.pilot = new Pilot(this.world, 0, this.survival);
    this.remotes = this.makeRemotes(this.remotes.length);
    this.log = [];
    this.n = 0;
    this.base = { seq: this.base.seq + 1, sd: this.world.seed, n: 0, d: [] };
    this.baseAt = this.time;
    this.confirmAt = -9;
    this.savedCount = -1;
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const local = this.mode === "local";
    const prompt = local && this.time - this.confirmAt < 4;
    this.renderer.draw(ctx, viewOf(this.world, 0, this.pilot, this.others, this.netLabel, this.time, prompt, local), pixelScale);
    if (this.ui.open) {
      const [mx, my] = this.input.uiPos();
      this.ui.draw(ctx, this.pilot.inv, mx, my);
    }
  }

  frame(): NetFrame {
    const b = this.pilot.body;
    const me = [r2(b.x), r2(b.y), r2(b.z), r2(this.pilot.yaw), r2(this.pilot.pitch), this.pilot.heldBlock];
    // Solo lo que falta por confirmar (los estados dejan de llevar 48 cambios cuando todos están al día).
    const ack = this.minAck();
    const ed: number[] = [];
    for (let i = 0; i < this.log.length; i += 5) {
      if (this.log[i] > ack) ed.push(this.log[i], this.log[i + 1], this.log[i + 2], this.log[i + 3], this.log[i + 4]);
    }
    const tail = Math.max(0, ed.length - EDITS_IN_SNAP * 5);
    const snap: BlocksSnap = {
      g: "blocks",
      seq: ++this.seq,
      base: this.base.seq,
      sd: this.world.seed,
      md: this.survival ? 1 : 0,
      n: this.n,
      ed: tail ? ed.slice(tail) : ed,
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
    const ack = Number(m.q);
    if (Number.isFinite(ack) && ack >= 0) r.ackN = Math.min(this.n, Math.max(r.ackN, ack));
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
  /** Panel de inventario/fabricación. */
  readonly ui = new BlocksUi();
  private world: World | null = null;
  private pilot: Pilot | null = null;
  private survival = false;
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

  constructor(private index: number, private input: WalkSource) {
    this.ui.open = false;
  }

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
    // Una base de otro mundo (o de antes de cambiar de juego) no se aplica.
    if (!this.world || !b || b.sd !== this.world.seed) return;
    if (!(b.n > this.applied || this.gap)) return;
    this.world.loadDiff(b.d);
    this.applied = b.n;
    this.gap = false;
    // Los cambios propios aún sin confirmar se vuelven a aplicar encima.
    for (const [, x, y, z, bl] of this.pending) this.world.set(x, y, z, bl);
  }

  onSnap(snap: unknown) {
    const s = snap as BlocksSnap;
    if (!this.world || this.world.seed !== s.sd) {
      // Mundo nuevo: se tira lo del anterior (sus cambios no valen aquí); la base solo si es del nuevo.
      this.world = new World(s.sd);
      this.survival = s.md === 1;
      this.pilot = new Pilot(this.world, this.index, this.survival);
      if (this.lastBase && this.lastBase.sd !== s.sd) this.lastBase = null;
      this.applied = 0;
      this.gap = false;
      this.pending = [];
      this.k = 0;
      this.others = [];
      this.renderer.dispose();
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
    if (this.ui.open) {
      const c = this.input.takeUiClick();
      if (c) this.ui.click(c[0], c[1], this.pilot.inv);
    }
    for (const [x, y, z, b] of this.pilot.update(this.input, this.world, this.others, dt, this.ui.open)) {
      if (!validEdit(this.world, x, y, z, b)) continue;
      // Con demasiados cambios sin confirmar se dejan de pedir (el orden de `k` no puede tener huecos).
      if (this.pending.length >= MAX_PENDING) continue;
      this.world.set(x, y, z, b); // se ve al momento; el anfitrión lo confirma
      this.pending.push([++this.k, x, y, z, b]);
    }
  }

  key(code: string) {
    if (!this.survival) return;
    if (code === "KeyI" || code === "KeyC" || code === "Tab") {
      if (this.ui.open) this.ui.close(this.pilot!.inv);
      else this.ui.open = true;
      setUiOpen(this.ui.open);
    }
  }

  escape(): boolean {
    if (!this.ui.open) return false;
    this.ui.close(this.pilot!.inv);
    setUiOpen(this.ui.open);
    return true;
  }

  outgoing(transport: Transport): object | undefined {
    const p = this.pilot;
    if (!p) return undefined;
    const b = p.body;
    const now = performance.now();
    const pose = [r2(b.x), r2(b.y), r2(b.z), r2(p.yaw), r2(p.pitch), p.heldBlock];
    const key = pose.join(",") + this.pending.length;
    const every = transport === "p2p" ? P2P_SEND_MS : 0;
    const keepalive = transport === "p2p" ? 100 : RELAY_KEEPALIVE_MS;
    if (now - this.lastSentAt < every) return undefined;
    if (key === this.lastInput && !this.pending.length && now - this.lastSentAt < keepalive) return undefined;
    this.lastInput = key;
    this.lastSentAt = now;
    const msg: BlocksMsg = {
      t: "m", x: pose[0], y: pose[1], z: pose[2], a: pose[3], p: pose[4], h: pose[5],
      e: this.pending.slice(0, EDITS_PER_MSG), q: this.applied, s: ++this.seq,
    };
    return msg;
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    if (!this.world || !this.pilot) return;
    this.renderer.draw(
      ctx, viewOf(this.world, this.index, this.pilot, this.others, this.netLabel, this.time, false, false), pixelScale,
    );
    if (this.ui.open) {
      const [mx, my] = this.input.uiPos();
      this.ui.draw(ctx, this.pilot.inv, mx, my);
    }
  }
}
