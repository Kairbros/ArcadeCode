// Carrera: estado autoritativo (lo ejecuta el anfitrión o el modo local).
// Decide cajas, objetos, golpes, posiciones y llegada. Los karts remotos los mueve su dueño
// y aquí solo se recibe su posición.
import type { DriveSource } from "./input";
import {
  BLAST_TIME, BOLT_TIME, BOMB_FUSE, BOMB_RADIUS, BOX_RESPAWN, COUNTDOWN, FINISH_GRACE, ITEM_BANANA, ITEM_BOLT, ITEM_BOMB, ITEM_NONE,
  ITEM_RED, ITEM_SHELL, ITEM_STAR, ITEM_TURBO, KART_R, LAPS, MAX_BANANAS, MAX_BOMBS, MAX_SPEED, RACERS, RED_LIFE, RED_TURN,
  SHELL_LIFE, SHELL_SPEED, SPIN_TIME, STAR_TIME, TRACK_W, TURBO_TIME, WALL_MARGIN, type ItemKind,
} from "./config";
import { NO_INPUT, bump, makeKart, stepKart, updateTrackPosition, wrapAngle, type DriveInput, type Kart } from "./physics";
import { hazardAt, hazardHits } from "./hazards";
import { generateTrack, locate, type Track } from "./track";

export type SlotKind = "local" | "remote" | "ai";
export type Phase = 0 | 1 | 2; // cuenta atrás, carrera, terminada

export interface Slot {
  index: number;
  kind: SlotKind;
  kart: Kart;
  item: ItemKind;
  spinSeq: number; // se incrementa en cada golpe (el invitado lo usa para hacer el trompo)
  place: number; // 0 = aún corriendo
  finishTime: number;
  lastUse: number; // último contador de uso de objeto recibido de un invitado
  slowSeq: number; // se incrementa con cada rayo recibido (el invitado frena su kart al verlo)
  ai: AIDriver | null;
}

export interface Shell {
  x: number;
  y: number;
  a: number;
  life: number;
  owner: number;
  seg: number;
  /** Caparazón rojo: persigue a `target` (índice de kart). */
  target: number;
}

export interface Bomb {
  x: number;
  y: number;
  t: number;
  owner: number;
}

/** Explosión reciente (solo para dibujarla). */
export interface Blast {
  x: number;
  y: number;
  age: number;
}

/** Mensaje del invitado: su kart y el contador de uso de objeto. */
export interface KartMsg {
  t: "k";
  x: number;
  y: number;
  a: number;
  v: number;
  p: number;
  u: number;
  ut: number;
  s: number;
  /** Altura del salto. */
  z?: number;
}

export class Race {
  readonly track: Track;
  readonly slots: Slot[];
  phase: Phase = 0;
  countdown = COUNTDOWN;
  time = 0;
  boxCool: number[];
  bananas: { x: number; y: number }[] = [];
  shells: Shell[] = [];
  bombs: Bomb[] = [];
  blasts: Blast[] = [];
  private finished = 0;
  private firstFinishAt = -1;
  private remoteSeq: number[] = [];

  /** Con bots, la IA rellena hasta RACERS; sin ellos corren solo los de kinds. */
  constructor(
    readonly seed: number, kinds: SlotKind[], private localInput: DriveSource | null, bots = true, readonly themeIdx = -1,
  ) {
    this.track = generateTrack(seed, themeIdx);
    this.slots = Array.from({ length: bots ? RACERS : Math.max(1, kinds.length) }, (_, i) => {
      const kind = kinds[i] ?? "ai";
      return {
        index: i, kind, kart: makeKart(this.track.grid[i], this.track.coins.length), item: ITEM_NONE, spinSeq: 0, place: 0, finishTime: 0,
        lastUse: 0, slowSeq: 0, ai: kind === "ai" ? new AIDriver() : null,
      };
    });
    this.boxCool = this.track.boxes.map(() => 0);
  }

  update(dt: number) {
    if (this.phase === 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.phase = 1;
    } else if (this.phase === 1) {
      this.time += dt;
    }
    const racing = this.phase === 1;

    for (const s of this.slots) {
      if (s.kind === "remote") {
        // Su dueño lo mueve; aquí solo se llevan los temporizadores que afectan a golpes y dibujo.
        const rk = s.kart;
        rk.spin = Math.max(0, rk.spin - dt);
        rk.star = Math.max(0, rk.star - dt);
        rk.shrink = Math.max(0, rk.shrink - dt);
        rk.turbo = Math.max(0, rk.turbo - dt);
        continue;
      }
      let input: DriveInput = NO_INPUT;
      if (s.kind === "local" && this.localInput) {
        const c = this.localInput;
        c.poll();
        input = { steer: c.steer, throttle: c.throttle, drift: c.drift };
        if (c.takeItem()) this.useItem(s.index, s.item);
        if (s.place) input = autopilot(s, this.track); // tras llegar, conduce solo
      } else if (s.ai) {
        input = s.ai.drive(s, this, dt);
      }
      stepKart(s.kart, input, this.track, dt, racing || this.phase === 2);
      bump(s.kart, this.slots.filter((o) => o !== s).map((o) => o.kart));
    }

    this.updateBoxes(dt);
    this.updateHazards(dt);
    if (racing) this.updateFinish();
  }

  private updateBoxes(dt: number) {
    this.boxCool = this.boxCool.map((c) => Math.max(0, c - dt));
    this.track.boxes.forEach((b, bi) => {
      if (this.boxCool[bi] > 0) return;
      for (const s of this.slots) {
        if (Math.hypot(s.kart.x - b.x, s.kart.y - b.y) > KART_R + 7) continue;
        this.boxCool[bi] = BOX_RESPAWN;
        if (s.item === ITEM_NONE && !s.place) s.item = this.randomItem(s);
        break;
      }
    });
  }

  private updateHazards(dt: number) {
    this.bananas = this.bananas.filter((b) => {
      const hit = this.slots.find((s) => Math.hypot(s.kart.x - b.x, s.kart.y - b.y) < KART_R + 5 && s.kart.z < 6);
      if (hit) this.spin(hit);
      return !hit;
    });
    const limit = TRACK_W / 2 + WALL_MARGIN;
    this.shells = this.shells.filter((sh) => {
      sh.life -= dt;
      this.steerShell(sh, dt);
      sh.x += Math.cos(sh.a) * SHELL_SPEED * dt;
      sh.y += Math.sin(sh.a) * SHELL_SPEED * dt;
      const loc = locate(this.track, sh.x, sh.y, sh.seg);
      sh.seg = loc.i;
      if (sh.life <= 0 || loc.d > limit) return false;
      const age = (sh.target >= 0 ? RED_LIFE : SHELL_LIFE) - sh.life;
      const hit = this.slots.find(
        (s) => !(age < 0.25 && s.index === sh.owner) && s.kart.z < 8 && Math.hypot(s.kart.x - sh.x, s.kart.y - sh.y) < KART_R + 5,
      );
      if (hit) this.spin(hit);
      return !hit;
    });
    this.bombs = this.bombs.filter((b) => {
      b.t -= dt;
      const touch = b.t < BOMB_FUSE - 0.6 && this.slots.some((s) => s.kart.z < 8 && Math.hypot(s.kart.x - b.x, s.kart.y - b.y) < KART_R + 6);
      if (b.t > 0 && !touch) return true;
      this.blasts.push({ x: b.x, y: b.y, age: 0 });
      for (const s of this.slots) if (Math.hypot(s.kart.x - b.x, s.kart.y - b.y) < BOMB_RADIUS) this.spin(s);
      return false;
    });
    // Chomps, thwomps y meteoros: golpean a quien toquen mientras no esté ya dando vueltas.
    if (this.phase === 1) {
      for (const h of this.track.hazards) {
        const st = hazardAt(this.track, h, this.time);
        if (!st.deadly) continue;
        for (const s of this.slots) {
          if (s.kart.spin > 0 || s.kart.star > 0 || s.place || s.kart.fall) continue;
          if (hazardHits(this.track, h, st, s.kart.x, s.kart.y, s.kart.z)) this.spin(s);
        }
      }
    }
    for (const bl of this.blasts) bl.age += dt;
    this.blasts = this.blasts.filter((bl) => bl.age < BLAST_TIME);
  }

  /** El caparazón rojo sigue la pista hacia su objetivo y, cuando lo tiene cerca, va a por él. */
  private steerShell(sh: Shell, dt: number) {
    if (sh.target < 0) return;
    const t = this.slots[sh.target]?.kart;
    if (!t) return;
    let tx = t.x, ty = t.y;
    if (Math.hypot(t.x - sh.x, t.y - sh.y) > 70) {
      const j = (sh.seg + 7) % this.track.n;
      tx = this.track.px[j];
      ty = this.track.py[j];
    }
    const diff = wrapAngle(Math.atan2(ty - sh.y, tx - sh.x) - sh.a);
    sh.a += Math.max(-RED_TURN * dt, Math.min(RED_TURN * dt, diff));
  }

  private updateFinish() {
    const goal = LAPS * this.track.n;
    for (const s of this.slots) {
      if (!s.place && s.kart.progress >= goal) {
        s.place = ++this.finished;
        s.finishTime = this.time;
        s.item = ITEM_NONE;
        if (this.firstFinishAt < 0) this.firstFinishAt = this.time;
      }
    }
    const humans = this.slots.filter((s) => s.kind !== "ai");
    const humansDone = humans.length > 0 && humans.every((s) => s.place);
    const graceOver = this.firstFinishAt >= 0 && this.time - this.firstFinishAt > FINISH_GRACE;
    if (humansDone || graceOver || this.finished === this.slots.length) {
      // Los que no llegaron se ordenan por lo que recorrieron.
      for (const s of this.standings()) if (!s.place) s.place = ++this.finished;
      this.phase = 2;
    }
  }

  /** Clasificación actual: primero los que llegaron, luego por progreso. */
  standings(): Slot[] {
    return [...this.slots].sort((a, b) => {
      if (a.place && b.place) return a.place - b.place;
      if (a.place || b.place) return a.place ? -1 : 1;
      return b.kart.progress - a.kart.progress;
    });
  }

  rankOf(index: number): number {
    return this.standings().findIndex((s) => s.index === index) + 1;
  }

  /** Los de atrás reciben objetos más útiles para remontar (peso por objeto: primero → último). */
  private randomItem(s: Slot): ItemKind {
    const rank = this.rankOf(s.index);
    const behind = (rank - 1) / Math.max(1, this.slots.length - 1); // 0 = primero, 1 = último
    const table: [ItemKind, number, number][] = [
      [ITEM_BANANA, 0.28, 0.05], [ITEM_SHELL, 0.26, 0.1], [ITEM_TURBO, 0.2, 0.2], [ITEM_BOMB, 0.16, 0.1],
      [ITEM_RED, 0.1, 0.2], [ITEM_STAR, 0, 0.2], [ITEM_BOLT, 0, rank > 1 ? 0.15 : 0],
    ];
    const weights = table.map(([, a, b]) => a + (b - a) * behind);
    let r = Math.random() * weights.reduce((x, y) => x + y, 0);
    for (let i = 0; i < table.length; i++) {
      r -= weights[i];
      if (r <= 0) return table[i][0];
    }
    return ITEM_BANANA;
  }

  useItem(index: number, item: number) {
    const s = this.slots[index];
    if (!s || this.phase !== 1 || item === ITEM_NONE || s.item !== item) return;
    s.item = ITEM_NONE;
    const k = s.kart;
    if (item === ITEM_TURBO) {
      k.turbo = TURBO_TIME; // al invitado se le aplica también en su pantalla; aquí solo cuenta para dibujarlo
    } else if (item === ITEM_BANANA) {
      this.bananas.push({ x: k.x - Math.cos(k.a) * 14, y: k.y - Math.sin(k.a) * 14 });
      if (this.bananas.length > MAX_BANANAS) this.bananas.shift();
    } else if (item === ITEM_SHELL || item === ITEM_RED) {
      // El rojo persigue al que va justo delante; si va primero, sale recto como el verde.
      const ahead = item === ITEM_RED ? this.standings()[this.rankOf(index) - 2] : undefined;
      this.shells.push({
        x: k.x + Math.cos(k.a) * 14, y: k.y + Math.sin(k.a) * 14, a: k.a, life: ahead ? RED_LIFE : SHELL_LIFE, owner: index,
        seg: k.seg, target: ahead ? ahead.index : -1,
      });
    } else if (item === ITEM_STAR) {
      k.star = STAR_TIME; // el invitado ya se la aplicó en su pantalla; aquí cuenta para ignorar golpes
    } else if (item === ITEM_BOMB) {
      this.bombs.push({ x: k.x - Math.cos(k.a) * 16, y: k.y - Math.sin(k.a) * 16, t: BOMB_FUSE, owner: index });
      if (this.bombs.length > MAX_BOMBS) this.bombs.shift();
    } else if (item === ITEM_BOLT) {
      // Frena a todos los que van por delante.
      const mine = this.rankOf(index);
      for (const o of this.slots) {
        if (o.index === index || this.rankOf(o.index) >= mine || o.kart.star > 0) continue;
        o.kart.shrink = BOLT_TIME;
        o.slowSeq++;
      }
    }
  }

  private spin(s: Slot) {
    if (s.kart.star > 0) return; // la estrella aguanta los golpes
    s.spinSeq++;
    // En karts remotos solo es visual: el trompo de verdad lo hace el invitado al ver spinSeq.
    s.kart.spin = SPIN_TIME;
    s.kart.turbo = 0;
  }

  /** Posición que manda un invitado de su propio kart. */
  applyRemote(index: number, msg: KartMsg) {
    const s = this.slots[index];
    if (!s || s.kind !== "remote" || msg?.t !== "k") return;
    const nums = [msg.x, msg.y, msg.a, msg.v, msg.p, msg.s, msg.z ?? 0].map(Number);
    if (!nums.every(Number.isFinite)) return;
    if (nums[5] <= (this.remoteSeq[index] ?? -1)) return; // llegó tarde
    this.remoteSeq[index] = nums[5];
    const k = s.kart;
    [k.x, k.y, k.a, k.v] = nums;
    k.z = Math.max(-300, Math.min(80, nums[6]));
    k.ma = k.a;
    if (!s.place) k.progress = Math.min(nums[4], LAPS * this.track.n + 1);
    k.seg = locate(this.track, k.x, k.y, k.seg).i;
    const u = Number(msg.u) || 0;
    if (u > s.lastUse) {
      s.lastUse = u;
      this.useItem(index, Number(msg.ut));
    }
  }

  /** Un invitado se fue: su kart pasa a la IA. */
  toAI(index: number) {
    const s = this.slots[index];
    if (!s || s.kind !== "remote") return;
    s.kind = "ai";
    s.ai = new AIDriver();
    updateTrackPosition(s.kart, this.track);
  }
}

/** Piloto automático: sigue la línea central con un desvío lateral propio. */
class AIDriver {
  private lateral = (Math.random() - 0.5) * 26;
  private skill = 0.84 + Math.random() * 0.13;
  private itemTimer = 1 + Math.random() * 3;

  drive(s: Slot, race: Race, dt: number): DriveInput {
    const input = steerTo(s.kart, race.track, this.lateral + Math.sin(race.time * 0.7 + s.index) * 6);
    const target = Math.min(MAX_SPEED * this.skill, cornerSpeed(s.kart, race.track));
    if (s.kart.v > target + 25) input.throttle = -1; // frena antes de la curva
    else if (s.kart.v > target) input.throttle = 0;
    if (s.item !== ITEM_NONE) {
      this.itemTimer -= dt;
      if (this.itemTimer <= 0) {
        race.useItem(s.index, s.item);
        this.itemTimer = 2 + Math.random() * 4;
      }
    }
    return input;
  }
}

function steerTo(k: Kart, track: Track, lateral: number): DriveInput {
  const j = (k.seg + 9) % track.n;
  const tx = track.px[j] - Math.sin(track.dir[j]) * lateral;
  const ty = track.py[j] + Math.cos(track.dir[j]) * lateral;
  const diff = wrapAngle(Math.atan2(ty - k.y, tx - k.x) - k.a);
  return {
    steer: Math.max(-1, Math.min(1, diff * 2.5)),
    throttle: Math.abs(diff) > 0.9 && k.v > 80 ? 0 : 1,
    drift: false,
  };
}

/** Velocidad segura según lo que gira la pista en los próximos ~150 unidades. */
function cornerSpeed(k: Kart, track: Track): number {
  const n = track.n;
  let turn = 0;
  for (const ahead of k.turbo > 0 || k.v > 200 ? [4, 10, 16, 22, 30, 38] : [4, 10, 16, 22]) {
    const a = track.dir[(k.seg + ahead) % n];
    const b = track.dir[(k.seg + ahead + 10) % n];
    turn = Math.max(turn, Math.abs(wrapAngle(b - a)));
  }
  return turn > 1.3 ? 95 : turn > 0.9 ? 120 : turn > 0.55 ? 155 : MAX_SPEED * 2;
}

function autopilot(s: Slot, track: Track): DriveInput {
  const input = steerTo(s.kart, track, 0);
  if (s.kart.v > Math.min(MAX_SPEED * 0.6, cornerSpeed(s.kart, track))) input.throttle = 0;
  return input;
}
