// Serialización del estado visible del mundo (anfitrión -> invitados).
// Los muros no viajan: el invitado los regenera desde la semilla.
import {
  Bomb, BombBag, Burning, Dying, Enemy, Explosion, FloatingText, GridCell, Lifetime, Movement, Player, PowerUp,
  Sprite, Transform, Wall, type ExplosionShape, type PowerUpKind, type SpriteKind,
} from "./components";
import { PLAYER_NAMES, type RGB } from "./config";
import { World } from "./ecs";
import type { Game } from "./game";
import { SpatialIndex } from "./grid";
import { WALL, type MapData } from "./mapgen";
import { createWall } from "./prefabs";

const SHAPES: ExplosionShape[] = ["center", "arm", "end"];

export interface EntityRecord {
  id: number;
  k: SpriteKind;
  l: number;
  c?: RGB;
  g?: [number, number]; // GridCell
  t?: [number, number]; // Transform
  b?: number; // Bomb.timer
  x?: [number, number, number, number, number]; // Explosion: forma, dx, dy, duración, restante
  bu?: number; // Burning.timer
  p?: PowerUpKind;
  m?: [number, number, number, number]; // Movement: fx, fy, moving, speed
  dd?: number; // Dying.timer
  en?: [number, number]; // Enemy dx, dy
  pl?: [number, number]; // Player: índice, vivo
  bb?: [number, number, number]; // BombBag: capacidad, activas, rango
  ft?: [string, RGB, number, number]; // FloatingText + Lifetime
}

export interface SnapshotHeader {
  seed: number;
  n: number;
  pids: number[];
  rt: number;
  over: boolean;
  res: [string, RGB] | null;
  paused: boolean;
}

export interface Snapshot extends SnapshotHeader {
  e: EntityRecord[];
}

/** Estado completo de referencia. Se reenvía solo cuando el delta crece demasiado. */
export interface SnapshotBase {
  seq: number;
  e: EntityRecord[];
}

/** Diferencia respecto a una base: entidades nuevas/cambiadas (u) y borradas (d). */
export interface SnapshotDelta {
  seq: number;
  base: number;
  h: SnapshotHeader;
  u: EntityRecord[];
  d: number[];
}

const REBASE_UPDATES = 40; // con más cambios que esto sale más barato mandar una base nueva
const REBASE_MS = 5000;

/** Anfitrión: genera deltas contra una base que se renueva cuando conviene. */
export class SnapshotEncoder {
  base: SnapshotBase | null = null;
  private baseJson = new Map<number, string>();
  private baseAt = 0;
  private seq = 0;
  private baseSeq = 0;

  encode(game: Game, now: number): SnapshotDelta {
    const records = encodeRecords(game);
    const json = records.map((r) => JSON.stringify(r));
    let u: EntityRecord[] = [];
    const d: number[] = [];
    if (this.base) {
      const seen = new Set<number>();
      records.forEach((r, i) => {
        seen.add(r.id);
        if (this.baseJson.get(r.id) !== json[i]) u.push(r);
      });
      for (const id of this.baseJson.keys()) if (!seen.has(id)) d.push(id);
    }
    if (!this.base || u.length > REBASE_UPDATES || now - this.baseAt > REBASE_MS) {
      this.base = { seq: ++this.baseSeq, e: records };
      this.baseJson = new Map(records.map((r, i) => [r.id, json[i]]));
      this.baseAt = now;
      u = [];
      d.length = 0;
    }
    return { seq: ++this.seq, base: this.base.seq, h: encodeHeader(game), u, d };
  }
}

/** Invitado: reconstruye snapshots completos aplicando deltas sobre la base recibida. */
export class SnapshotDecoder {
  baseSeq = -1;
  private base = new Map<number, EntityRecord>();

  setBase(b: SnapshotBase) {
    this.baseSeq = b.seq;
    this.base = new Map(b.e.map((r) => [r.id, r]));
  }

  /** null si el delta es de otra base (llegará la nueva en breve). */
  apply(delta: SnapshotDelta): Snapshot | null {
    if (delta.base !== this.baseSeq) return null;
    const merged = new Map(this.base);
    for (const id of delta.d) merged.delete(id);
    for (const r of delta.u) merged.set(r.id, r);
    return { ...delta.h, e: [...merged.values()] };
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function encodeHeader(game: Game): SnapshotHeader {
  return {
    seed: game.seed,
    n: game.nPlayers,
    pids: game.playerIds,
    rt: r1(game.roundTime),
    over: game.over,
    res: game.result,
    paused: game.paused,
  };
}

function encodeRecords(game: Game): EntityRecord[] {
  const w = game.world;
  const e: EntityRecord[] = [];
  for (const [id, spr] of w.query(Sprite)) {
    if (w.has(id, Wall)) continue;
    const rec: EntityRecord = { id, k: spr.kind, l: spr.layer };
    if (spr.kind === "player" || spr.kind === "enemy") rec.c = spr.color;
    const g = w.get(id, GridCell);
    if (g) rec.g = [g.col, g.row];
    const t = w.get(id, Transform);
    if (t) rec.t = [r1(t.x), r1(t.y)];
    const bomb = w.get(id, Bomb);
    if (bomb) rec.b = r2(bomb.timer);
    const ex = w.get(id, Explosion);
    const lt = w.get(id, Lifetime);
    if (ex && lt) rec.x = [SHAPES.indexOf(ex.shape), ex.direction[0], ex.direction[1], ex.duration, r2(lt.remaining)];
    const burn = w.get(id, Burning);
    if (burn) rec.bu = r2(burn.timer);
    const pu = w.get(id, PowerUp);
    if (pu) rec.p = pu.kind;
    const mov = w.get(id, Movement);
    if (mov) rec.m = [mov.facing[0], mov.facing[1], mov.moving ? 1 : 0, mov.speed];
    const dying = w.get(id, Dying);
    if (dying) rec.dd = r2(dying.timer);
    const en = w.get(id, Enemy);
    if (en) rec.en = [en.dx, en.dy];
    const pl = w.get(id, Player);
    if (pl) rec.pl = [pl.index, pl.alive ? 1 : 0];
    const bag = w.get(id, BombBag);
    if (bag) rec.bb = [bag.capacity, bag.active, bag.range];
    const ft = w.get(id, FloatingText);
    if (ft && lt) rec.ft = [ft.text, ft.color, ft.duration, r2(lt.remaining)];
    e.push(rec);
  }
  return e;
}

/** Reconstruye un mundo dibujable (sin sistemas) a partir de un snapshot. */
export function decodeSnapshot(s: Snapshot, map: MapData): World {
  const w = new World();
  w.mapInfo = map;
  w.index = new SpatialIndex(w, map.cols, map.rows);
  for (const r of s.e) {
    const comps: object[] = [new Sprite(r.k, r.l, r.c)];
    if (r.g) comps.push(new GridCell(r.g[0], r.g[1]));
    if (r.t) comps.push(new Transform(r.t[0], r.t[1]));
    if (r.b !== undefined) comps.push(new Bomb(-1, r.b, 0, new Set()));
    if (r.x) {
      comps.push(new Explosion(SHAPES[r.x[0]] ?? "center", [r.x[1], r.x[2]], r.x[3]));
      comps.push(new Lifetime(r.x[4]));
    }
    if (r.bu !== undefined) comps.push(new Burning(r.bu));
    if (r.p) comps.push(new PowerUp(r.p));
    if (r.m) {
      const mov = new Movement(r.m[3]);
      mov.facing = [r.m[0], r.m[1]];
      mov.moving = r.m[2] === 1;
      comps.push(mov);
    }
    if (r.dd !== undefined) comps.push(new Dying(r.dd));
    if (r.en) {
      const en = new Enemy();
      [en.dx, en.dy] = r.en;
      comps.push(en);
    }
    if (r.pl) {
      const pl = new Player(r.pl[0], PLAYER_NAMES[r.pl[0]] ?? `Jugador ${r.pl[0] + 1}`);
      pl.alive = r.pl[1] === 1;
      comps.push(pl);
    }
    if (r.bb) {
      const bag = new BombBag(r.bb[0], r.bb[2]);
      bag.active = r.bb[1];
      comps.push(bag);
    }
    if (r.ft) {
      comps.push(new FloatingText(r.ft[0], r.ft[1], r.ft[2]));
      comps.push(new Lifetime(r.ft[3]));
    }
    w.spawn(r.id, ...comps);
  }
  // Muros estáticos: ids nuevos por encima de los del snapshot.
  map.tiles.forEach((row, y) => row.forEach((tile, x) => tile === WALL && createWall(w, x, y)));
  return w;
}
