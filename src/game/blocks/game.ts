// Bloques en el hub. El mundo sale de una semilla, así que por la red solo viajan las posiciones y
// los cambios de bloques:
// - Cada jugador mueve a su muñeco en su equipo (sin retraso) y manda su posición.
// - Los cambios los ordena el anfitrión en un registro numerado (n). Cada estado lleva los últimos
//   EDITS_IN_SNAP; si a un invitado le falta alguno, se pone al día con la base: la lista completa de
//   bloques distintos de los generados, que se renueva como mucho cada REBASE_EVERY s si hubo cambios.
// - El invitado aplica sus cambios al momento y los reenvía (numerados con k) hasta ver en `ak` que el
//   anfitrión los ha recibido.
// - Supervivencia: los objetos del suelo los simula y reparte el anfitrión (`drops.ts`). Al romper, el
//   cambio lleva el objeto que suelta; tirar algo viaja en la misma cola ([k, -1, objeto, cantidad, 0, 0]).
//   Lo que recoge un invitado le llega como entrega numerada (`gr`) hasta que la confirma (`g`).
// - Supervivencia: los animales también los simula el anfitrión (`mobs.ts`) y viajan en cada estado (`mb`).
//   Un invitado pide un golpe en la misma cola ([k, -2, animal, objeto en la mano, 0, 0]); el daño lo
//   calcula el anfitrión.
// - Supervivencia: la vida y el hambre son de cada uno (`vitals.ts`). Quien muere suelta su inventario en la
//   misma cola ([k, -1, objeto, cantidad, 1, 0]) y avisa con `d`: mientras, no se le dibuja ni recoge nada.
// - Supervivencia: los monstruos también los simula el anfitrión. Sus golpes a un invitado le llegan como lista
//   numerada (`hd`: id, daño, empuje x, empuje z) hasta que la confirma (`hk`); las flechas (`ar`) y las
//   explosiones recientes (`bx`) viajan para dibujarlas. Una explosión rompe bloques como cambios del registro.
// - El reloj del día (`dc`) lo lleva el anfitrión (también en creativo).
import type { Transport } from "../net/protocol";
import { RELAY_KEEPALIVE_MS } from "../net/relay";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { AIR, BEDROCK, BLOCKS, HOTBAR, TORCH, WATER, dropOf, isBlock } from "./blocks";
import { ATTACK_REACH, EDITS_IN_SNAP, EDITS_PER_MSG, EYE, REBASE_EVERY, VH, VW } from "./config";
import { DAY_LENGTH, MORNING, daylight } from "./daycycle";
import { Drops } from "./drops";
import { attackDamage, isItem } from "./items";
import type { WalkSource } from "./input";
import { BOOM_RADIUS, HURT_TIME, Mobs, type MobView, type Target } from "./mobs";
import { Pilot, type Edit } from "./pilot";
import { BlocksRenderer, type ArrowView, type Avatar, type BlastView, type BlocksView, type DropSprite } from "./render";
import { World } from "./world";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Segundos sin recibir otro golpe de un monstruo tras uno. */
const PLAYER_HIT_COOL = 0.5;
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
  g: BlocksMode;
  seq: number;
  base: number;
  sd: number; // semilla
  n: number; // último cambio del registro
  ed: number[]; // últimos cambios: n, x, y, z, bloque...
  /** Por jugador: x, y, z, guiñada, cabeceo, bloque en la mano (vacío = no está). */
  p: number[][];
  ak: number[]; // último cambio recibido de cada invitado (k)
  t: number;
  dr: number[]; // objetos en el suelo: id, objeto, cantidad, x, y, z...
  gr: number[][]; // por jugador, entregas sin confirmar: g, objeto, cantidad...
  /** Animales y monstruos: id, tipo, x, y, z, guiñada, estado (0 normal, 1 golpeado, 2 muerto, 3 mecha, 4 ardiendo)... */
  mb: number[];
  dc: number; // reloj del día (s)
  ar: number[]; // flechas: x, y, z, vx, vy, vz...
  bx: number[]; // explosiones recientes: id, x, y, z...
  hd: number[][]; // por jugador, golpes sin confirmar: id, daño, empuje x, empuje z...
}

/**
 * Mensaje de un invitado: posición, mirada, bloque en la mano, acciones pendientes ([k, x, y, z, b, suelta],
 * [k, -1, objeto, cantidad, 0, 0] para tirar o [k, -2, animal, objeto en la mano, 0, 0] para golpear) y la
 * última entrega recibida (g).
 */
interface BlocksMsg {
  t: "m";
  x: number;
  y: number;
  z: number;
  a: number;
  p: number;
  h: number;
  e: number[][];
  g: number;
  /** Último golpe de monstruo recibido. */
  hk: number;
  /** 1 = está muerto. */
  d?: number;
  s: number;
}

interface Remote extends Avatar {
  connected: boolean;
  seq: number;
  lastK: number;
  seen: boolean; // ya mandó su posición
  dead: boolean;
  grants: number[][]; // entregas sin confirmar: [g, objeto, cantidad]
  lastGrant: number;
  hurts: number[][]; // golpes sin confirmar: [id, daño, empuje x, empuje z]
  lastHurt: number;
}

/** ¿Es válido este cambio sobre el mundo actual? (también lo comprueba el invitado al pedirlo) */
function validEdit(w: World, x: number, y: number, z: number, b: number): boolean {
  if (![x, y, z].every(Number.isInteger) || !World.inside(x, y, z) || !isBlock(b) || b === BEDROCK || b === WATER) return false;
  const cur = w.get(x, y, z);
  if (b === AIR) return cur !== AIR && cur !== WATER && !BLOCKS[cur].unbreakable;
  if (b === TORCH) return (cur === AIR) && w.torchSupport(x, y, z) >= 0;
  return cur === AIR || cur === WATER;
}

/** Lo que se ve del mundo además del propio jugador. */
interface Scene {
  drops: DropSprite[];
  mobs: MobView[];
  clock: number;
  arrows: ArrowView[];
  blasts: BlastView[];
}

function viewOf(
  world: World, me: number, pilot: Pilot, input: WalkSource, others: Avatar[], netLabel: string, time: number, scene: Scene,
): BlocksView {
  const b = pilot.body;
  return {
    world, me, x: b.x, y: b.y, z: b.z, yaw: pilot.yaw, pitch: pilot.pitch, slot: pilot.slot, flying: b.flying,
    target: pilot.target, others, netLabel, time, survival: pilot.survival, inventory: pilot.inventory,
    crafter: pilot.crafter, digProgress: pilot.digProgress, held: pilot.held, cursor: input.cursor, ...scene,
    vitals: pilot.survival ? pilot.vitals : null, deadFor: pilot.deadFor,
  };
}

/** Creativo ("blocks") o supervivencia ("survival"): mismo juego, distinto identificador en el hub. */
export type BlocksMode = "blocks" | "survival";

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
  readonly drops = new Drops();
  readonly mobs = new Mobs();
  /** Reloj del día (s, de 0 a DAY_LENGTH). */
  clock = MORNING;
  /** Por jugador: segundos hasta poder recibir otro golpe de monstruo. */
  private hurtCool: number[] = [];
  private blasts: (BlastView & { at: number })[] = [];
  private blastId = 0;

  constructor(
    private input: WalkSource, remoteCount: number, private mode: "local" | "host", readonly gameId: BlocksMode = "blocks",
    seed?: number,
  ) {
    this.world = new World(seed ?? 1 + Math.floor(Math.random() * 999_999));
    this.pilot = new Pilot(this.world, 0, gameId === "survival");
    this.remotes = Array.from({ length: remoteCount }, (_, i) => {
      const p = new Pilot(this.world, i + 1).body;
      return {
        index: i + 1, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, block: HOTBAR[0], connected: true, seq: -1, lastK: 0, seen: false, dead: false,
        grants: [], lastGrant: 0, hurts: [], lastHurt: 0,
      };
    });
    if (gameId === "survival") this.mobs.populate(this.world, [this.pilot.body, ...this.remotes]);
  }

  private apply([x, y, z, b, drop]: Edit): boolean {
    if (!validEdit(this.world, x, y, z, b)) return false;
    this.world.set(x, y, z, b);
    if (this.gameId === "survival" && drop && isItem(drop)) this.drops.spawn(drop, 1, x + 0.5, y + 0.5, z + 0.5);
    this.log.push(++this.n, x, y, z, b);
    if (this.log.length > EDITS_IN_SNAP * 5) this.log.splice(0, this.log.length - EDITS_IN_SNAP * 5);
    // Las antorchas que se apoyaban en el bloque roto caen (como un cambio más del registro).
    if (b === AIR) {
      for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
        const tx = x + dx, ty = y + dy, tz = z + dz;
        if (this.world.get(tx, ty, tz) === TORCH && this.world.torchSupport(tx, ty, tz) < 0) this.apply([tx, ty, tz, AIR, TORCH]);
      }
    }
    return true;
  }

  /** Lanza un objeto desde los ojos de un jugador, hacia donde mira. */
  private throwFrom(index: number, x: number, y: number, z: number, yaw: number, pitch: number, item: number, n: number) {
    if (!isItem(item) || !(n > 0)) return;
    const c = Math.cos(pitch), dx = -Math.sin(yaw) * c, dy = Math.sin(pitch), dz = -Math.cos(yaw) * c;
    this.drops.spawn(item, Math.min(64, Math.floor(n)), x + dx * 0.4, y + EYE - 0.3, z + dz * 0.4, dx * 4.5, dy * 4.5 + 1.5, dz * 4.5, index);
  }

  /** Al morir, lo que llevaba cae a sus pies, desparramado. */
  private spill(index: number, x: number, y: number, z: number, item: number, n: number) {
    if (isItem(item) && n > 0) this.drops.spawn(item, Math.min(64, Math.floor(n)), x, y + 1, z, undefined, 3, undefined, index);
  }

  private get others(): Avatar[] {
    return this.remotes.filter((r) => r.connected && r.seen && !r.dead);
  }

  /** Golpe de un monstruo a un jugador (con medio segundo de respiro entre golpes). Al invitado se le manda. */
  private hurtPlayer(index: number, damage: number, kx: number, kz: number) {
    if ((this.hurtCool[index] ?? 0) > 0 || !(damage > 0)) return;
    this.hurtCool[index] = PLAYER_HIT_COOL;
    if (index === 0) {
      if (!this.pilot.dead) {
        this.pilot.vitals.damage(damage);
        this.pilot.knock(kx, kz);
      }
      return;
    }
    const r = this.remotes[index - 1];
    if (r && !r.dead) r.hurts.push([++r.lastHurt, damage, r2(kx), r2(kz)]);
  }

  /** Explosión de un petardo: rompe los bloques de alrededor (un 30 % suelta algo) y daña y empuja a quien esté cerca. */
  private explode(x: number, y: number, z: number) {
    const R = BOOM_RADIUS;
    for (let cy = Math.floor(y - R); cy <= Math.ceil(y + R); cy++) {
      for (let cz = Math.floor(z - R); cz <= Math.ceil(z + R); cz++) {
        for (let cx = Math.floor(x - R); cx <= Math.ceil(x + R); cx++) {
          if ((cx + 0.5 - x) ** 2 + (cy + 0.5 - y) ** 2 + (cz + 0.5 - z) ** 2 > R * R) continue;
          const bl = this.world.get(cx, cy, cz);
          if (!World.inside(cx, cy, cz) || bl === AIR || bl === WATER || BLOCKS[bl].unbreakable) continue;
          this.apply([cx, cy, cz, AIR, Math.random() < 0.3 ? dropOf(bl, 9) : 0]);
        }
      }
    }
    const blast = (px: number, py: number, pz: number) => {
      const d = Math.hypot(px - x, py + 0.9 - y, pz - z);
      return d < 6 ? 1 - d / 6 : 0;
    };
    for (const p of this.targets()) {
      const k = blast(p.x, p.y, p.z), h = Math.hypot(p.x - x, p.z - z) || 1;
      if (!k) continue;
      this.hurtCool[p.index] = 0;
      this.hurtPlayer(p.index, Math.round(14 * k), ((p.x - x) / h) * 10 * k, ((p.z - z) / h) * 10 * k);
    }
    for (const m of this.mobs.list) {
      const k = blast(m.body.x, m.body.y, m.body.z);
      if (k) this.mobs.hit(m.id, x, z, Math.round(14 * k), this.drops);
    }
    this.blasts.push({ id: ++this.blastId, x: r2(x), y: r2(y), z: r2(z), at: this.time });
  }

  /** Jugadores vivos (a los que persiguen los monstruos). */
  private targets(): Target[] {
    const b = this.pilot.body;
    return [
      ...(this.pilot.dead ? [] : [{ index: 0, x: b.x, y: b.y, z: b.z }]),
      ...this.others.map((r) => ({ index: r.index, x: r.x, y: r.y, z: r.z })),
    ];
  }

  /** Golpe de un invitado: el animal tiene que estar a su alcance (con margen por el retraso). */
  private remoteHit(r: Remote, id: number, item: number) {
    const m = this.mobs.get(id);
    if (!m || Math.hypot(m.body.x - r.x, m.body.y - r.y, m.body.z - r.z) > ATTACK_REACH + 2.5) return;
    this.mobs.hit(id, r.x, r.z, attackDamage(item), this.drops);
  }

  update(dt: number) {
    this.time += dt;
    this.clock = (this.clock + dt) % DAY_LENGTH;
    this.renderer.update(dt);
    const mobs = this.gameId === "survival" ? this.mobs.views() : [];
    for (const e of this.pilot.update(this.input, this.world, this.others, dt, mobs)) this.apply(e);
    if (this.gameId === "survival") {
      const p = this.pilot, b = p.body;
      for (const t of p.throws) {
        if (t.spill) this.spill(0, b.x, b.y, b.z, t.id, t.n);
        else this.throwFrom(0, b.x, b.y, b.z, p.yaw, p.pitch, t.id, t.n);
      }
      p.throws = [];
      for (const id of p.hits) this.mobs.hit(id, b.x, b.z, attackDamage(p.held), this.drops);
      p.hits = [];
      this.mobs.update(dt, this.world, this.targets(), daylight(this.clock));
      this.mobs.dropPending(this.drops);
      const events = this.mobs.events;
      this.mobs.events = [];
      for (const e of events) {
        if (e.kind === "hurt") this.hurtPlayer(e.index, e.damage, e.kx, e.kz);
        else this.explode(e.x, e.y, e.z);
      }
      this.hurtCool = this.hurtCool.map((c) => Math.max(0, c - dt));
      this.blasts = this.blasts.filter((x) => this.time - x.at < 1.5);
      this.drops.update(dt, this.world);
      const pickers = [...(p.dead ? [] : [{ index: 0, x: b.x, y: b.y, z: b.z }]), ...this.others];
      this.drops.collect(pickers, (index, item, n) => {
        if (index === 0) return n - p.inventory.add(item, n);
        // A un invitado se le entrega todo; si no le cabe, lo vuelve a tirar.
        const r = this.remotes[index - 1];
        r.grants.push([++r.lastGrant, item, n]);
        return n;
      });
    }
    if (this.base.n !== this.n && this.time - this.baseAt >= REBASE_EVERY) {
      this.base = { seq: this.base.seq + 1, n: this.n, d: this.world.diffList() };
      this.baseAt = this.time;
    }
  }

  key() {}

  /** Esc con el inventario abierto lo cierra (en vez de salir al menú). */
  escape(): boolean {
    return this.pilot.closeUi(this.input);
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const drops = this.drops.list.map((d) => ({ id: d.id, item: d.item, x: d.x, y: d.y, z: d.z }));
    const scene = { drops, mobs: this.mobs.views(), clock: this.clock, arrows: this.mobs.arrows, blasts: this.blasts };
    const view = viewOf(this.world, 0, this.pilot, this.input, this.others, this.netLabel, this.time, scene);
    this.renderer.draw(ctx, view, pixelScale);
  }

  frame(): NetFrame {
    const b = this.pilot.body;
    const me = this.pilot.dead ? [] : [r2(b.x), r2(b.y), r2(b.z), r2(this.pilot.yaw), r2(this.pilot.pitch), this.pilot.block];
    const snap: BlocksSnap = {
      g: this.gameId,
      seq: ++this.seq,
      base: this.base.seq,
      sd: this.world.seed,
      n: this.n,
      ed: this.log,
      p: [me, ...this.remotes.map((r) => (r.connected && r.seen && !r.dead ? [r2(r.x), r2(r.y), r2(r.z), r2(r.yaw), r2(r.pitch), r.block] : []))],
      ak: [0, ...this.remotes.map((r) => r.lastK)],
      t: Math.round(this.time),
      dr: this.drops.list.flatMap((d) => [d.id, d.item, d.n, r2(d.x), r2(d.y), r2(d.z)]),
      gr: [[], ...this.remotes.map((r) => r.grants.flat())],
      mb: this.mobs.list.flatMap((m) => [
        m.id, m.kind, r2(m.body.x), r2(m.body.y), r2(m.body.z), r2(m.yaw),
        m.hp <= 0 ? 2 : m.hurt > 0 ? 1 : m.fuse > 0 ? 3 : m.burning ? 4 : 0,
      ]),
      dc: r2(this.clock),
      ar: this.mobs.arrows.flatMap((a) => [r2(a.x), r2(a.y), r2(a.z), r1(a.vx), r1(a.vy), r1(a.vz)]),
      bx: this.blasts.flatMap((x) => [x.id, x.x, x.y, x.z]),
      hd: [[], ...this.remotes.map((r) => r.hurts.flat())],
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
    r.dead = m.d === 1;
    if (isBlock(Number(m.h))) r.block = Number(m.h);
    // Entregas confirmadas: ya no hace falta reenviarlas.
    const g = Number(m.g);
    if (Number.isFinite(g)) r.grants = r.grants.filter((e) => e[0] > g);
    const hk = Number(m.hk);
    if (Number.isFinite(hk)) r.hurts = r.hurts.filter((e) => e[0] > hk);
    // Acciones en orden: solo la siguiente a la última recibida (las demás se reenviarán).
    for (const e of Array.isArray(m.e) ? m.e.slice(0, EDITS_PER_MSG) : []) {
      if (!Array.isArray(e) || e.length < 5 || e.length > 6) break;
      const [k, x, y, z, b, drop] = e.map(Number);
      if (k <= r.lastK) continue;
      if (k !== r.lastK + 1) break;
      r.lastK = k;
      if (x === -1) {
        if (this.gameId !== "survival") continue;
        if (b === 1) this.spill(index, r.x, r.y, r.z, y, z);
        else this.throwFrom(index, r.x, r.y, r.z, r.yaw, r.pitch, y, z);
      } else if (x === -2) {
        if (this.gameId === "survival") this.remoteHit(r, y, z);
      } else {
        this.apply([x, y, z, b, drop || 0]);
      }
    }
  }

  onDisconnect(index: number) {
    const r = this.remotes[index - 1];
    if (!r) return;
    r.connected = false;
    // Lo que se le dio y no llegó a confirmar vuelve al suelo donde estaba (no se pierde).
    for (const [, item, n] of r.grants) this.drops.spawn(item, n, r.x, r.y + 0.5, r.z);
    r.grants = [];
    r.hurts = [];
  }

  get isLocal() {
    return this.mode === "local";
  }
}

/** Invitado: copia del mundo al día con el registro del anfitrión, y su propio jugador. */
export class BlocksGuest implements GuestGame {
  readonly size = [VW, VH] as const;
  netLabel = "";
  private world: World | null = null;
  private pilot: Pilot | null = null;
  private applied = 0; // último cambio del registro aplicado
  private gap = false; // faltan cambios: hay que esperar a una base
  private lastBase: BlocksBase | null = null;
  private others: Avatar[] = [];
  private pending: number[][] = []; // [k, x, y, z, b, suelta], [k, -1, objeto, cantidad, 0, 0] o [k, -2, animal, objeto, 0, 0]
  private lastGrant = 0;
  private drops: DropSprite[] = [];
  private mobs: MobView[] = [];
  private arrows: ArrowView[] = [];
  private blasts: BlastView[] = [];
  private clock = MORNING;
  private lastHurt = 0;
  /** Animales que acabo de golpear → hasta cuándo se ven rojos (sin esperar al anfitrión). */
  private flash = new Map<number, number>();
  private k = 0;
  private seq = 0;
  private lastInput = "";
  private lastSentAt = 0;
  private time = 0;
  private readonly renderer = new BlocksRenderer();

  constructor(private index: number, private input: WalkSource, readonly id: BlocksMode = "blocks") {}

  get ready() {
    return this.world !== null;
  }

  escape(): boolean {
    return !!this.pilot?.closeUi(this.input);
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
      this.pilot = new Pilot(this.world, this.index, this.id === "survival");
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
    // Objetos del suelo y lo que el anfitrión me ha dado al recogerlos.
    this.drops = [];
    const dr = s.dr ?? [];
    for (let i = 0; i + 5 < dr.length; i += 6) this.drops.push({ id: dr[i], item: dr[i + 1], x: dr[i + 3], y: dr[i + 4], z: dr[i + 5] });
    const mine = s.gr?.[this.index] ?? [];
    for (let i = 0; i + 2 < mine.length; i += 3) {
      const [g, item, n] = [mine[i], mine[i + 1], mine[i + 2]];
      if (g <= this.lastGrant || !this.pilot) continue;
      this.lastGrant = g;
      const left = isItem(item) ? this.pilot.inventory.add(item, n) : 0;
      if (left > 0) this.pending.push([++this.k, -1, item, left, 0, 0]); // no cabe: al suelo otra vez
    }
    this.mobs = [];
    const mb = s.mb ?? [];
    for (let i = 0; i + 6 < mb.length; i += 7) {
      const st = mb[i + 6];
      this.mobs.push({
        id: mb[i], kind: mb[i + 1], x: mb[i + 2], y: mb[i + 3], z: mb[i + 4], yaw: mb[i + 5],
        hurt: st === 1, dead: st === 2, fuse: st === 3, burning: st === 4,
      });
    }
    if (Number.isFinite(s.dc)) this.clock = s.dc;
    this.arrows = [];
    const ar = s.ar ?? [];
    for (let i = 0; i + 5 < ar.length; i += 6) this.arrows.push({ x: ar[i], y: ar[i + 1], z: ar[i + 2], vx: ar[i + 3], vy: ar[i + 4], vz: ar[i + 5] });
    this.blasts = [];
    const bx = s.bx ?? [];
    for (let i = 0; i + 3 < bx.length; i += 4) this.blasts.push({ id: bx[i], x: bx[i + 1], y: bx[i + 2], z: bx[i + 3] });
    // Golpes de los monstruos: cada uno una vez (aunque llegue repetido hasta que lo confirmo).
    const hd = s.hd?.[this.index] ?? [];
    for (let i = 0; i + 3 < hd.length; i += 4) {
      if (hd[i] <= this.lastHurt) continue;
      this.lastHurt = hd[i];
      if (this.pilot && !this.pilot.dead) {
        this.pilot.vitals.damage(hd[i + 1]);
        this.pilot.knock(hd[i + 2], hd[i + 3]);
      }
    }
  }

  update(dt: number) {
    this.time += dt;
    this.clock = (this.clock + dt) % DAY_LENGTH;
    this.renderer.update(dt);
    if (!this.world || !this.pilot) return;
    // Lo que soltó al morir tiene que llegar al anfitrión (desde donde murió) antes de reaparecer.
    this.pilot.holdRespawn = this.pending.some((e) => e[1] === -1 && e[4] === 1);
    for (const [x, y, z, b, drop] of this.pilot.update(this.input, this.world, this.others, dt, this.mobs)) {
      if (!validEdit(this.world, x, y, z, b)) continue;
      this.world.set(x, y, z, b); // se ve al momento; el anfitrión lo confirma
      this.pending.push([++this.k, x, y, z, b, drop ?? 0]);
    }
    for (const t of this.pilot.throws) this.pending.push([++this.k, -1, t.id, t.n, t.spill ? 1 : 0, 0]);
    this.pilot.throws = [];
    for (const id of this.pilot.hits) {
      this.pending.push([++this.k, -2, id, this.pilot.held, 0, 0]);
      this.flash.set(id, this.time + HURT_TIME);
    }
    this.pilot.hits = [];
  }

  outgoing(transport: Transport): object | undefined {
    const p = this.pilot;
    if (!p) return undefined;
    const b = p.body;
    const now = performance.now();
    const pose = [r2(b.x), r2(b.y), r2(b.z), r2(p.yaw), r2(p.pitch), p.block];
    const dead = p.dead ? 1 : 0;
    const key = pose.join(",") + this.pending.length + "/" + this.lastGrant + "/" + dead + "/" + this.lastHurt;
    const every = transport === "p2p" ? P2P_SEND_MS : 0;
    const keepalive = transport === "p2p" ? 100 : RELAY_KEEPALIVE_MS;
    if (now - this.lastSentAt < every) return undefined;
    if (key === this.lastInput && !this.pending.length && now - this.lastSentAt < keepalive) return undefined;
    this.lastInput = key;
    this.lastSentAt = now;
    const msg: BlocksMsg = {
      t: "m", x: pose[0], y: pose[1], z: pose[2], a: pose[3], p: pose[4], h: pose[5],
      e: this.pending.slice(0, EDITS_PER_MSG), g: this.lastGrant, hk: this.lastHurt, s: ++this.seq,
      ...(dead ? { d: 1 } : {}),
    };
    return msg;
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    if (!this.world || !this.pilot) return;
    for (const [id, until] of this.flash) if (until < this.time) this.flash.delete(id);
    const mobs = this.mobs.map((m) => (this.flash.has(m.id) ? { ...m, hurt: true } : m));
    const scene = { drops: this.drops, mobs, clock: this.clock, arrows: this.arrows, blasts: this.blasts };
    const view = viewOf(this.world, this.index, this.pilot, this.input, this.others, this.netLabel, this.time, scene);
    this.renderer.draw(ctx, view, pixelScale);
  }
}
