// Karts en el hub: anfitrión/local (ejecuta la carrera) e invitado (conduce su kart y dibuja el resto).
import { KARTS_HINT as HINT, type DriveSource } from "./input";
import type { Transport } from "../net/protocol";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { BOLT_TIME, ITEM_NONE, ITEM_STAR, ITEM_TURBO, KH, KW, RACERS, SPIN_TIME, STAR_TIME, TURBO_TIME, type ItemKind } from "./config";
import { bump, makeKart, stepKart, type Kart } from "./physics";
import { Race, type KartMsg, type SlotKind } from "./race";
import { KartsRenderer, type KartSprite, type RaceView, type Standing } from "./render";
import { THEME_NAMES, generateTrack, type Track } from "./track";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Estado de la carrera que reciben los invitados. */
interface KartsSnap {
  g: "karts";
  base: -1;
  seq: number;
  seed: number;
  /** Tema forzado por el anfitrión (-1 = según la semilla). */
  th: number;
  ph: number;
  cd: number;
  t: number;
  /** Por kart: x, y, a, v, progreso, golpes, objeto, puesto, tiempo de llegada, ¿IA?, altura, rayos, efectos (bits 1 estrella, 2 rayo, 4 turbo, 8 truco). */
  k: number[][];
  bx: number; // cajas activas (bits)
  bn: number[]; // plátanos x,y,...
  sh: number[]; // proyectiles x,y,rojo(0/1),...
  bm: number[]; // bombas x,y,mecha,...
  ex: number[]; // explosiones x,y,edad,...
}

const newSeed = () => 1 + Math.floor(Math.random() * 999_999);

/** Anfitrión (o partida local contra la IA): ejecuta la carrera completa. */
export class KartsHost implements HostGame {
  readonly size = [KW, KH] as const;
  netLabel = "";
  race: Race;
  private seq = 0;
  private readonly renderer = new KartsRenderer();
  private kinds: SlotKind[];
  /** Circuito elegido con T (-1 = al azar). */
  private themePick = -1;

  constructor(
    private hostInput: DriveSource, remoteCount: number, private mode: "local" | "host", private bots = true,
  ) {
    this.kinds = ["local", ...Array<SlotKind>(remoteCount).fill("remote")];
    this.race = new Race(newSeed(), this.kinds, hostInput, bots);
  }

  private newRace() {
    // Quien se desconectó sigue siendo IA en la siguiente carrera.
    this.kinds = this.race.slots.map((s) => s.kind);
    this.race = new Race(newSeed(), this.kinds, this.hostInput, this.bots, this.themePick);
    this.renderer.reset();
  }

  get finished() {
    return this.race.phase === 2;
  }

  update(dt: number) {
    this.race.update(dt);
    this.renderer.update(dt);
  }

  key(code: string) {
    if (code === "KeyR") this.newRace();
    else if (code === "KeyT") {
      // T: siguiente circuito (Al azar → Pradera → Desierto → …) y carrera nueva.
      this.themePick = ((this.themePick + 2) % (THEME_NAMES.length + 1)) - 1;
      this.newRace();
    }
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const race = this.race;
    const me = race.slots[0];
    const view: RaceView = {
      track: race.track,
      me: { index: 0, ...me.kart },
      others: race.slots.slice(1).map((s) => ({
        index: s.index, x: s.kart.x, y: s.kart.y, a: s.kart.a, spin: s.kart.spin, z: s.kart.z, fx: fxBits(s.kart),
      })),
      boxes: race.track.boxes.map((b, i) => ({ ...b, active: race.boxCool[i] <= 0 })),
      bananas: race.bananas,
      shells: race.shells.map((sh) => ({ x: sh.x, y: sh.y, red: sh.target >= 0 })),
      bombs: race.bombs,
      blasts: race.blasts,
      phase: race.phase,
      countdown: race.countdown,
      time: race.time,
      lap: Math.floor(me.kart.progress / race.track.n) + 1,
      rank: race.rankOf(0),
      item: me.item,
      results: race.phase === 2 ? standings(race) : null,
      aiSlots: race.slots.map((s) => s.kind === "ai"),
      netLabel: this.netLabel,
      footer: race.phase === 2 ? "R: nueva carrera · T: pista · J: juego · Esc: menú" : race.time < 6 ? `${HINT} · T: pista` : "",
    };
    this.renderer.draw(ctx, view, pixelScale);
  }

  frame(): NetFrame {
    const race = this.race;
    const snap: KartsSnap = {
      g: "karts",
      base: -1,
      seq: ++this.seq,
      seed: race.seed,
      th: race.themeIdx,
      ph: race.phase,
      cd: r1(race.countdown),
      t: r1(race.time),
      k: race.slots.map((s) => [
        r1(s.kart.x), r1(s.kart.y), r3(s.kart.a), r1(s.kart.v), r1(s.kart.progress), s.spinSeq, s.item, s.place,
        r1(s.finishTime), s.kind === "ai" ? 1 : 0, r1(s.kart.z), s.slowSeq, fxBits(s.kart),
      ]),
      bx: race.boxCool.reduce((m, c, i) => (c <= 0 ? m | (1 << i) : m), 0),
      bn: race.bananas.flatMap((b) => [r1(b.x), r1(b.y)]),
      sh: race.shells.flatMap((s) => [r1(s.x), r1(s.y), s.target >= 0 ? 1 : 0]),
      bm: race.bombs.flatMap((b) => [r1(b.x), r1(b.y), r1(b.t)]),
      ex: race.blasts.flatMap((b) => [r1(b.x), r1(b.y), r1(b.age)]),
    };
    return { snap, base: null };
  }

  onMessage(index: number, msg: unknown) {
    this.race.applyRemote(index, msg as KartMsg);
  }

  onDisconnect(index: number) {
    this.race.toAI(index);
  }

  get isLocal() {
    return this.mode === "local";
  }
}

/** Efectos de un kart que se ven desde fuera: 1 estrella, 2 rayo, 4 turbo, 8 truco. */
function fxBits(k: Kart): number {
  return (k.star > 0 ? 1 : 0) | (k.shrink > 0 ? 2 : 0) | (k.turbo > 0 ? 4 : 0) | (k.trick ? 8 : 0) | (k.drop > 0 ? 16 : 0);
}

function standings(race: Race): Standing[] {
  return race.standings().map((s) => ({ index: s.index, place: s.place, time: s.finishTime, ai: s.kind === "ai" }));
}

/** Invitado: simula su propio kart (sin retraso) y dibuja a los demás según el anfitrión. */
export class KartsGuest implements GuestGame {
  readonly id = "karts" as const;
  readonly size = [KW, KH] as const;
  readonly baseSeq = -1;
  netLabel = "";
  private track: Track | null = null;
  private trackTheme = -2;
  private me: Kart | null = null;
  private state: KartsSnap | null = null;
  private readonly renderer = new KartsRenderer();
  private lastSpinSeq = 0;
  private lastSlowSeq = 0;
  private useCount = 0;
  private usedItem = 0;
  private pendingUse = 0;
  private seq = 0;
  private lastSentAt = 0;
  // Posiciones suavizadas de los demás karts.
  private smooth = new Map<number, KartSprite>();
  private otherSpinSeq: number[] = [];

  constructor(private index: number, private controller: DriveSource) {}

  get ready() {
    return this.state !== null && this.me !== null;
  }

  onBase() {}

  onSnap(snap: unknown) {
    const s = snap as KartsSnap;
    if (!this.track || this.track.seed !== s.seed || this.trackTheme !== (s.th ?? -1)) {
      // Carrera nueva: circuito nuevo y a la parrilla.
      this.trackTheme = s.th ?? -1;
      this.track = generateTrack(s.seed, this.trackTheme);
      this.me = makeKart(this.track.grid[this.index], this.track.coins.length);
      this.lastSpinSeq = s.k[this.index]?.[5] ?? 0;
      this.lastSlowSeq = s.k[this.index]?.[11] ?? 0;
      this.pendingUse = 0;
      this.smooth.clear();
      this.renderer.reset();
    }
    const mine = s.k[this.index];
    if (mine && this.me) {
      if (mine[5] > this.lastSpinSeq) this.me.spin = SPIN_TIME; // nos dieron
      this.lastSpinSeq = mine[5];
      if ((mine[11] ?? 0) > this.lastSlowSeq && this.me.star <= 0) this.me.shrink = BOLT_TIME; // nos cayó un rayo
      this.lastSlowSeq = mine[11] ?? 0;
      if (mine[6] === ITEM_NONE) this.pendingUse = 0;
    }
    this.state = s;
  }

  update(dt: number) {
    this.renderer.update(dt);
    const c = this.controller;
    c.poll();
    const s = this.state;
    const me = this.me;
    const track = this.track;
    if (!s || !me || !track) return;
    if (s.ph === 0) s.cd = Math.max(0, s.cd - dt);
    else if (s.ph === 1) s.t += dt;

    const item = (s.k[this.index]?.[6] ?? 0) as ItemKind;
    if (c.takeItem() && s.ph === 1 && item !== ITEM_NONE && !this.pendingUse) {
      this.useCount++;
      this.usedItem = item;
      this.pendingUse = item;
      if (item === ITEM_TURBO) me.turbo = TURBO_TIME; // efecto inmediato en nuestra pantalla
      else if (item === ITEM_STAR) me.star = STAR_TIME;
    }
    stepKart(me, { steer: c.steer, throttle: c.throttle, drift: c.drift }, track, dt, s.ph >= 1);

    // Los demás se mueven suavemente hacia su última posición conocida.
    const k = Math.min(1, dt * 12);
    s.k.forEach((row, i) => {
      if (i === this.index) return;
      const cur = this.smooth.get(i);
      if (!cur || Math.hypot(cur.x - row[0], cur.y - row[1]) > 80) {
        this.smooth.set(i, { index: i, x: row[0], y: row[1], a: row[2], spin: 0, z: row[10] ?? 0, fx: row[12] ?? 0 });
        this.otherSpinSeq[i] = row[5];
        return;
      }
      // Trompo de otro kart: solo visual.
      if (row[5] > (this.otherSpinSeq[i] ?? 0)) cur.spin = SPIN_TIME;
      this.otherSpinSeq[i] = row[5];
      cur.spin = Math.max(0, cur.spin - dt);
      cur.x += (row[0] - cur.x) * k;
      cur.y += (row[1] - cur.y) * k;
      cur.a += Math.atan2(Math.sin(row[2] - cur.a), Math.cos(row[2] - cur.a)) * k;
      cur.z += ((row[10] ?? 0) - cur.z) * k;
      cur.fx = row[12] ?? 0;
    });
    bump(me, [...this.smooth.values()]);
  }

  outgoing(transport: Transport): object | undefined {
    const me = this.me;
    if (!me || !this.state) return undefined;
    const now = performance.now();
    if (transport === "p2p" && now - this.lastSentAt < 33) return undefined; // ~30 por segundo
    this.lastSentAt = now;
    const msg: KartMsg = {
      t: "k", x: r1(me.x), y: r1(me.y), a: r3(me.a), v: r1(me.v), p: r1(me.progress), z: r1(me.z),
      u: this.useCount, ut: this.usedItem, s: ++this.seq,
    };
    return msg;
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const s = this.state;
    const me = this.me;
    const track = this.track;
    if (!s || !me || !track) return;
    const mine = s.k[this.index];
    const place = mine?.[7] ?? 0;
    // Posición: con nuestro progreso local (más actual) frente al de los demás.
    const rank = place || 1 + s.k.filter((row, i) => i !== this.index && (row[7] || row[4] > me.progress)).length;
    const results: Standing[] | null = s.ph === 2
      ? s.k.map((row, i) => ({ index: i, place: row[7], time: row[8], ai: row[9] === 1 })).sort((a, b) => a.place - b.place)
      : null;
    const view: RaceView = {
      track,
      me: { index: this.index, ...me },
      others: [...this.smooth.values()],
      boxes: track.boxes.map((b, i) => ({ ...b, active: ((s.bx >> i) & 1) === 1 })),
      bananas: pairs(s.bn),
      shells: triples(s.sh).map(([x, y, r]) => ({ x, y, red: r === 1 })),
      bombs: triples(s.bm ?? []).map(([x, y, t]) => ({ x, y, t, owner: 0 })),
      blasts: triples(s.ex ?? []).map(([x, y, age]) => ({ x, y, age })),
      phase: s.ph,
      countdown: s.cd,
      time: s.t,
      lap: Math.floor(me.progress / track.n) + 1,
      rank: Math.min(rank, RACERS),
      item: (this.pendingUse ? ITEM_NONE : (mine?.[6] ?? 0)) as ItemKind,
      results,
      aiSlots: s.k.map((row) => row[9] === 1),
      netLabel: this.netLabel,
      footer: s.ph === 2 ? "Esperando al anfitrión · Esc: menú" : s.t < 6 ? HINT : "",
    };
    this.renderer.draw(ctx, view, pixelScale);
  }
}

function triples(flat: number[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]);
  return out;
}

function pairs(flat: number[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
}
