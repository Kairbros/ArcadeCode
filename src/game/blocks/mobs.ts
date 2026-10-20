// Animales y monstruos (supervivencia). Solo los simula el anfitrión, como los objetos del suelo; los invitados
// solo los dibujan y piden los golpes. Andan con la física de los jugadores (con su tamaño) y saltan escalones.
// - Animales (vaca, cerdo, oveja, gallina): pasean por la hierba, no se meten en el agua ni bajan barrancos
//   paseando, huyen al recibir un golpe. Al empezar salen manadas y, si faltan, vuelven a aparecer lejos.
// - Monstruos (zombi, esqueleto, araña, petardo): aparecen donde hay poca luz (de noche al aire libre, siempre en
//   las cuevas) lejos de los jugadores, persiguen al más cercano y, si lo ven, le pegan (zombi, araña), le
//   disparan flechas (esqueleto) o se encienden y explotan (petardo). Zombis y esqueletos arden al sol.
// Lo que les pasa a los jugadores (golpes, explosiones) sale en `events` y lo aplica el juego.
// Sin DOM ni WebGL (se usa en Node).
import { Rng } from "../core/rng";
import { AIR, BLOCKS, GRASS, WATER } from "./blocks";
import { EYE, HALF_W, HEIGHT, WX, WY, WZ } from "./config";
import { skyLevel } from "./daycycle";
import type { Drops } from "./drops";
import {
  ARROW, BEEF, BONE, CHICKEN_MEAT, FEATHER, GUNPOWDER, LEATHER, MUTTON, PORK, ROTTEN_FLESH, STRING, WOOL,
} from "./items";
import { collides, makeBody, stepBody, type Body, type Size } from "./player";
import type { World } from "./world";

export const COW = 0, PIG = 1, SHEEP = 2, CHICKEN = 3, ZOMBIE = 4, SKELETON = 5, SPIDER = 6, CREEPER = 7;

export interface MobKind {
  name: string;
  size: Size;
  hp: number;
  /** Velocidad paseando y huyendo o persiguiendo (bloques/s). */
  walk: number;
  run: number;
  /** Lo que suelta al morir: objeto, mínimo, máximo. */
  loot: [number, number, number][];
  /** Monstruo: persigue y hace daño. */
  hostile?: boolean;
  /** Daño de su golpe (cuerpo a cuerpo) o de su flecha. */
  damage?: number;
  /** Arde a pleno sol. */
  burns?: boolean;
}

export const MOBS: MobKind[] = [
  { name: "Vaca", size: { hw: 0.45, h: 1.4 }, hp: 10, walk: 1.1, run: 3.2, loot: [[BEEF, 1, 3], [LEATHER, 0, 2]] },
  { name: "Cerdo", size: { hw: 0.45, h: 0.9 }, hp: 10, walk: 1.1, run: 3.2, loot: [[PORK, 1, 3]] },
  { name: "Oveja", size: { hw: 0.45, h: 1.3 }, hp: 8, walk: 1.1, run: 3.2, loot: [[MUTTON, 1, 2], [WOOL, 1, 1]] },
  { name: "Gallina", size: { hw: 0.25, h: 0.7 }, hp: 4, walk: 1, run: 3, loot: [[CHICKEN_MEAT, 1, 1], [FEATHER, 0, 2]] },
  {
    name: "Zombi", size: { hw: 0.3, h: 1.8 }, hp: 20, walk: 1, run: 2.4, loot: [[ROTTEN_FLESH, 0, 2]],
    hostile: true, damage: 3, burns: true,
  },
  {
    name: "Esqueleto", size: { hw: 0.3, h: 1.8 }, hp: 20, walk: 1, run: 2.4, loot: [[BONE, 0, 2], [ARROW, 0, 2]],
    hostile: true, damage: 3, burns: true,
  },
  { name: "Araña", size: { hw: 0.45, h: 0.9 }, hp: 16, walk: 1.2, run: 3.4, loot: [[STRING, 0, 2]], hostile: true, damage: 2 },
  { name: "Petardo", size: { hw: 0.3, h: 1.6 }, hp: 20, walk: 1, run: 2.3, loot: [[GUNPOWDER, 0, 2]], hostile: true },
];

export const MOB_TARGET = 16; // animales que se intenta que haya
export const RESPAWN_EVERY = 20; // cada tanto, si faltan, aparece una manada nueva
export const SPAWN_MIN_DIST = 20; // lejos de los jugadores (que no aparezcan delante)
export const HURT_TIME = 0.4; // destello rojo; mientras dura no recibe más golpes
export const PANIC_TIME = 5;
export const DEATH_TIME = 0.8; // cae de lado y desaparece
export const HOSTILE_MAX = 10; // monstruos a la vez como mucho
export const HOSTILE_SPAWN_EVERY = 0.5; // cada tanto se intenta que aparezca uno
export const HOSTILE_MIN_DIST = 16; // nunca aparecen más cerca de un jugador
export const HOSTILE_DESPAWN_DIST = 48; // más lejos de todos, desaparecen
export const SPAWN_LIGHT = 7; // solo aparecen con esta luz o menos
export const FOLLOW_DIST = 16; // ven a un jugador hasta esta distancia
export const MELEE_REACH = 1.3; // distancia (horizontal, desde el borde) para pegar
export const ATTACK_EVERY = 1; // segundos entre golpes de un monstruo
export const SHOOT_EVERY = 2; // segundos entre flechas del esqueleto
export const SHOOT_DIST = 14;
export const ARROW_SPEED = 18;
export const ARROW_GRAVITY = 12;
export const FUSE_TIME = 1.5; // el petardo se enciende y explota
export const FUSE_DIST = 2.6; // empieza a encenderse a esta distancia
export const BOOM_RADIUS = 2.6; // bloques que rompe
export const BURN_DAMAGE = 1; // por segundo, al sol
const KNOCK_H = 5;
const KNOCK_V = 5.5;
const TURN_RATE = 6; // rad/s al girar hacia donde anda

export interface Mob {
  id: number;
  kind: number;
  body: Body;
  /** Hacia donde mira (gira poco a poco hacia `walk`). */
  yaw: number;
  /** Hacia donde anda. */
  walk: number;
  moving: boolean;
  hp: number;
  /** Segundos hasta decidir otra cosa. */
  timer: number;
  panic: number;
  hurt: number;
  /** Segundos desde que murió (solo si hp ≤ 0). */
  deadFor: number;
  /** Monstruos: espera hasta el siguiente golpe o flecha, mecha encendida (s), si está ardiendo y desde cuándo. */
  cool: number;
  fuse: number;
  burning: boolean;
  burnClock: number;
}

/** Animal o monstruo tal como se dibuja y se apunta (en el anfitrión sale de `Mob`; en el invitado, del estado). */
export interface MobView {
  id: number;
  kind: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hurt: boolean;
  dead: boolean;
  /** Petardo encendido (parpadea e hincha). */
  fuse?: boolean;
  burning?: boolean;
}

/** Flecha en vuelo (la simula el anfitrión). */
export interface Arrow {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
}

export interface Spot {
  x: number;
  z: number;
}

/** Jugador vivo al que pueden perseguir y dañar los monstruos (pies en y). */
export interface Target {
  index: number;
  x: number;
  y: number;
  z: number;
}

/** Lo que los monstruos les hacen a los jugadores: lo aplica el juego. */
export type MobEvent =
  | { kind: "hurt"; index: number; damage: number; kx: number; kz: number }
  | { kind: "boom"; x: number; y: number; z: number };

/** Ángulo `a` acercado a `b` como mucho `step` radianes (por el lado corto). */
function turn(a: number, b: number, step: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}

/** Columna de hierba con hueco encima (para que aparezca un animal). */
function grassAt(w: World, x: number, z: number): boolean {
  if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) return false;
  const top = w.surface(x, z);
  return w.get(x, top, z) === GRASS && w.get(x, top + 1, z) === AIR && w.get(x, top + 2, z) === AIR;
}

/** ¿Se ve (x, y, z) desde (ax, ay, az)? (ningún bloque entre medias) */
function sees(w: World, ax: number, ay: number, az: number, x: number, y: number, z: number): boolean {
  const dx = x - ax, dy = y - ay, dz = z - az, d = Math.hypot(dx, dy, dz);
  if (d < 1e-6) return true;
  return !w.raycast(ax, ay, az, dx / d, dy / d, dz / d, d);
}

/** Tirada de monstruo: zombi 35 %, esqueleto 25 %, araña 25 %, petardo 15 %. */
function hostileKind(r: number): number {
  return r < 0.35 ? ZOMBIE : r < 0.6 ? SKELETON : r < 0.85 ? SPIDER : CREEPER;
}

export class Mobs {
  list: Mob[] = [];
  arrows: Arrow[] = [];
  events: MobEvent[] = [];
  /** Las pruebas que no los quieren lo apagan. */
  hostiles = true;
  /** Muertos al sol, a la espera de soltar lo suyo (`dropPending`). */
  private pendingLoot: Mob[] = [];
  private next = 1;
  private respawnIn = RESPAWN_EVERY;
  private hostileIn = HOSTILE_SPAWN_EVERY;

  /** Primeras manadas, iguales para la misma semilla (lejos del sitio donde aparecen los jugadores). */
  populate(w: World, avoid: Spot[]) {
    const r = new Rng(w.seed * 31 + 7);
    for (let tries = 0; this.list.length < MOB_TARGET && tries < 300; tries++) this.herd(w, () => r.next(), avoid, 8);
  }

  add(kind: number, x: number, y: number, z: number, yaw = 0): Mob {
    const m: Mob = {
      id: this.next++, kind, body: makeBody(x, y, z), yaw, walk: yaw, moving: false, hp: MOBS[kind].hp,
      timer: 0, panic: 0, hurt: 0, deadFor: 0, cool: 0, fuse: 0, burning: false, burnClock: 0,
    };
    this.list.push(m);
    return m;
  }

  /** Una manada de 2 a 4 animales iguales alrededor de una columna al azar. Devuelve cuántos salieron. */
  private herd(w: World, rand: () => number, avoid: Spot[], minDist: number): number {
    const kind = Math.floor(rand() * 4);
    const cx = 3 + Math.floor(rand() * (WX - 6)), cz = 3 + Math.floor(rand() * (WZ - 6));
    if (avoid.some((p) => Math.hypot(p.x - cx, p.z - cz) < minDist)) return 0;
    const n = 2 + Math.floor(rand() * 3);
    let made = 0;
    for (let i = 0; i < n * 3 && made < n; i++) {
      const x = cx + Math.floor(rand() * 7) - 3, z = cz + Math.floor(rand() * 7) - 3;
      if (!grassAt(w, x, z)) continue;
      this.add(kind, x + 0.5, w.surface(x, z) + 1, z + 0.5, rand() * Math.PI * 2);
      made++;
    }
    return made;
  }

  get(id: number): Mob | undefined {
    return this.list.find((m) => m.id === id);
  }

  /** Luz que cuenta para que aparezca (o arda) un monstruo en (x, y, z), con la luz del día `day` (0–1). */
  static lightNow(w: World, x: number, y: number, z: number, day: number): number {
    const l = w.lightAt(x, y, z);
    return Math.max(skyLevel(l >> 4, day), l & 15);
  }

  /** Un monstruo cerca de un jugador (pero no demasiado), en un sitio oscuro con suelo y hueco. */
  private spawnHostile(w: World, players: Target[], day: number) {
    if (!players.length) return;
    w.flushLight();
    const p = players[Math.floor(Math.random() * players.length)];
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, d = HOSTILE_MIN_DIST + Math.random() * 20;
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
      const spots: number[] = [];
      for (let y = 1; y < WY - 2; y++) {
        if (!BLOCKS[w.get(x, y - 1, z)].opaque || w.get(x, y, z) !== AIR || w.get(x, y + 1, z) !== AIR) continue;
        if (Mobs.lightNow(w, x, y, z, day) <= SPAWN_LIGHT) spots.push(y);
      }
      if (!spots.length) continue;
      const y = spots[Math.floor(Math.random() * spots.length)];
      if (players.some((q) => Math.hypot(q.x - x - 0.5, q.y - y, q.z - z - 0.5) < HOSTILE_MIN_DIST)) continue;
      this.add(hostileKind(Math.random()), x + 0.5, y, z + 0.5, Math.random() * Math.PI * 2);
      return;
    }
  }

  /** Avanza: decide, anda, persigue y ataca; aparecen y desaparecen. `players` = jugadores vivos; `day` = luz del día. */
  update(dt: number, w: World, players: Target[], day = 1) {
    for (const m of this.list) {
      if (m.hp <= 0) m.deadFor += dt;
      else if (MOBS[m.kind].hostile) this.stepHostile(m, dt, w, players, day);
      else this.step(m, dt, w);
    }
    this.updateArrows(dt, w, players);
    // Monstruos muy lejos de todos: desaparecen sin más.
    this.list = this.list.filter((m) => (m.hp > 0 || m.deadFor < DEATH_TIME) &&
      !(MOBS[m.kind].hostile && m.hp > 0 && players.length &&
        players.every((p) => Math.hypot(p.x - m.body.x, p.z - m.body.z) > HOSTILE_DESPAWN_DIST)));
    this.respawnIn -= dt;
    if (this.respawnIn <= 0) {
      this.respawnIn = RESPAWN_EVERY;
      const alive = this.list.filter((m) => m.hp > 0 && !MOBS[m.kind].hostile).length;
      if (alive < MOB_TARGET) {
        for (let tries = 0; tries < 30 && !this.herd(w, Math.random, players, SPAWN_MIN_DIST); tries++);
      }
    }
    this.hostileIn -= dt;
    if (this.hostileIn <= 0) {
      this.hostileIn = HOSTILE_SPAWN_EVERY;
      const n = this.list.filter((m) => m.hp > 0 && MOBS[m.kind].hostile).length;
      if (this.hostiles && n < HOSTILE_MAX) this.spawnHostile(w, players, day);
    }
  }

  /** Anda hacia `m.walk` (si se mueve) mirando el camino: salta escalones, gira ante paredes y, si no tiene prisa, no se mete en el agua ni baja barrancos. */
  private move(m: Mob, dt: number, w: World, hurry: boolean, speed: number) {
    const k = MOBS[m.kind], b = m.body, s = k.size;
    let jump = b.inWater;
    if (m.moving) {
      const dx = -Math.sin(m.walk), dz = -Math.cos(m.walk);
      const ax = Math.floor(b.x + dx * (s.hw + 0.4)), az = Math.floor(b.z + dz * (s.hw + 0.4)), fy = Math.floor(b.y + 0.01);
      const free = (y: number) => !w.solidAt(ax, y, az);
      const wall = !free(fy) && (!free(fy + 1) || (s.h > 1 && !free(fy + 2)));
      const wet = w.get(ax, fy, az) === WATER || (free(fy - 1) && w.get(ax, fy - 1, az) === WATER);
      const cliff = free(fy) && free(fy - 1) && free(fy - 2) && free(fy - 3);
      if (wall || (!hurry && b.ground && (wet || cliff))) {
        m.walk += Math.PI / 2 + Math.random() * Math.PI;
        if (!hurry) m.moving = Math.random() < 0.5;
      } else if (!free(fy) && b.ground) {
        jump = true;
      }
    }
    if (m.moving) m.yaw = turn(m.yaw, m.walk, TURN_RATE * dt);
    stepBody(b, { forward: m.moving ? 1 : 0, right: 0, yaw: m.walk, jump, down: false, speed }, w, dt, s);
    if (m.kind === CHICKEN && b.vy < -2.5 && !b.inWater) b.vy = -2.5; // aletea al caer
    // Si le ponen un bloque encima, sube; si sale del mundo (no debería), desaparece.
    if (collides(w, b.x, b.y, b.z, s)) b.y = Math.floor(b.y) + 1;
    if (b.y < -5) {
      m.hp = 0;
      m.deadFor = DEATH_TIME;
    }
  }

  /** Animal: decide, mira el camino y anda. */
  private step(m: Mob, dt: number, w: World) {
    const k = MOBS[m.kind];
    m.hurt = Math.max(0, m.hurt - dt);
    m.timer -= dt;
    if (m.panic > 0) {
      // Huyendo: corre zigzagueando un poco.
      m.panic -= dt;
      m.moving = true;
      if (m.timer <= 0) {
        m.walk += (Math.random() - 0.5) * 1.2;
        m.timer = 0.6 + Math.random() * 0.6;
      }
    } else if (m.timer <= 0) {
      m.moving = Math.random() < 0.45;
      if (m.moving) m.walk = Math.random() * Math.PI * 2;
      m.timer = 2 + Math.random() * 4;
    }
    this.move(m, dt, w, m.panic > 0, m.panic > 0 ? k.run : k.walk);
  }

  /** Monstruo: busca al jugador más cercano; si no hay, pasea. Arde al sol si es de los que arden. */
  private stepHostile(m: Mob, dt: number, w: World, players: Target[], day: number) {
    const k = MOBS[m.kind], b = m.body;
    m.hurt = Math.max(0, m.hurt - dt);
    m.cool -= dt;
    m.timer -= dt;
    // Al sol (luz del cielo plena y de día), zombis y esqueletos arden y pierden vida.
    const head = Math.floor(b.y + k.size.h - 0.2);
    m.burning = !!k.burns && day > 0.6 && !b.inWater && (w.lightAt(Math.floor(b.x), head, Math.floor(b.z)) >> 4) >= 14;
    if (m.burning) {
      m.burnClock += dt;
      if (m.burnClock >= 1) {
        m.burnClock = 0;
        m.hp -= BURN_DAMAGE;
        m.hurt = HURT_TIME;
        if (m.hp <= 0) this.die(m, null);
      }
    }
    if (m.hp <= 0) return;

    let target: Target | null = null, best = FOLLOW_DIST;
    for (const p of players) {
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < best && Math.abs(p.y - b.y) < 8) {
        best = d;
        target = p;
      }
    }
    if (!target) {
      m.fuse = Math.max(0, m.fuse - dt);
      if (m.timer <= 0) {
        m.moving = Math.random() < 0.4;
        if (m.moving) m.walk = Math.random() * Math.PI * 2;
        m.timer = 2 + Math.random() * 4;
      }
      this.move(m, dt, w, false, k.walk);
      return;
    }

    const dx = target.x - b.x, dz = target.z - b.z, dist = Math.hypot(dx, dz);
    const toward = Math.atan2(-dx, -dz);
    const eye = b.y + k.size.h * 0.85;
    const visible = sees(w, b.x, eye, b.z, target.x, target.y + EYE, target.z);
    m.walk = toward;
    m.moving = true;
    if (m.kind === SKELETON) {
      // Guarda las distancias: se acerca si está lejos, se aparta si está cerca y dispara si lo ve.
      if (dist < 5) m.walk = toward + Math.PI;
      else if (dist < 10 && visible) m.moving = false;
      if (visible && dist < SHOOT_DIST && m.cool <= 0) {
        m.cool = SHOOT_EVERY;
        this.shoot(b.x, eye, b.z, target);
      }
    } else if (m.kind === CREEPER) {
      if (dist < FUSE_DIST && visible) {
        m.moving = false;
        m.fuse += dt;
        if (m.fuse >= FUSE_TIME) {
          // Explota: desaparece sin soltar nada y el juego rompe bloques y reparte el daño.
          this.events.push({ kind: "boom", x: b.x, y: b.y + 0.8, z: b.z });
          m.hp = 0;
          m.deadFor = DEATH_TIME;
          return;
        }
      } else {
        m.fuse = Math.max(0, m.fuse - dt);
      }
    } else {
      // Zombi y araña: cuerpo a cuerpo (la araña salta hacia él cuando está cerca).
      const reach = MELEE_REACH + k.size.hw;
      if (dist < reach && Math.abs(target.y - b.y) < 1.5 && visible && m.cool <= 0) {
        m.cool = ATTACK_EVERY;
        this.events.push({ kind: "hurt", index: target.index, damage: k.damage ?? 1, kx: (dx / (dist || 1)) * 6, kz: (dz / (dist || 1)) * 6 });
      }
      if (m.kind === SPIDER && dist < 4 && dist > 1.5 && b.ground && Math.random() < dt * 1.5) b.vy = 6;
    }
    // Mira al jugador mientras lo persigue (o mientras le apunta).
    m.yaw = turn(m.yaw, toward, TURN_RATE * 2 * dt);
    const yaw = m.yaw;
    this.move(m, dt, w, true, k.run);
    m.yaw = yaw;
  }

  /** Flecha desde (x, y, z) hacia los ojos del objetivo, algo más alta para que caiga encima, con un poco de error. */
  private shoot(x: number, y: number, z: number, t: Target) {
    const dx = t.x - x, dy = t.y + 1.2 - y, dz = t.z - z, d = Math.hypot(dx, dy, dz) || 1;
    const time = d / ARROW_SPEED;
    const err = () => (Math.random() - 0.5) * 0.06;
    const vx = (dx / d + err()) * ARROW_SPEED, vz = (dz / d + err()) * ARROW_SPEED;
    const vy = (dy / d + err()) * ARROW_SPEED + 0.5 * ARROW_GRAVITY * time;
    const s = 0.5 / Math.hypot(vx, vz || 1e-6);
    this.arrows.push({ x: x + vx * s, y, z: z + vz * s, vx, vy, vz, age: 0 });
  }

  /** Flechas: caen, se clavan en los bloques (y desaparecen) y dañan al jugador que tocan. */
  private updateArrows(dt: number, w: World, players: Target[]) {
    for (const a of this.arrows) {
      a.age += dt;
      a.vy -= ARROW_GRAVITY * dt;
      const steps = Math.max(1, Math.ceil((Math.hypot(a.vx, a.vy, a.vz) * dt) / 0.25));
      for (let s = 0; s < steps && a.age < 9; s++) {
        a.x += (a.vx * dt) / steps;
        a.y += (a.vy * dt) / steps;
        a.z += (a.vz * dt) / steps;
        if (w.solidAt(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z))) {
          a.age = 9;
          break;
        }
        const hit = players.find((p) => Math.abs(p.x - a.x) < HALF_W + 0.1 && Math.abs(p.z - a.z) < HALF_W + 0.1 && a.y > p.y && a.y < p.y + HEIGHT);
        if (hit) {
          const h = Math.hypot(a.vx, a.vz) || 1;
          this.events.push({ kind: "hurt", index: hit.index, damage: MOBS[SKELETON].damage ?? 3, kx: (a.vx / h) * 4, kz: (a.vz / h) * 4 });
          a.age = 9;
          break;
        }
      }
    }
    this.arrows = this.arrows.filter((a) => a.age < 5 && a.y > -5);
  }

  /** Muere: suelta lo suyo (salvo que se diga lo contrario) y cae de lado. */
  private die(m: Mob, drops: Drops | null) {
    m.deadFor = 0;
    m.fuse = 0;
    if (!drops) return this.pendingLoot.push(m);
    this.loot(m, drops);
  }

  private loot(m: Mob, drops: Drops) {
    const b = m.body, k = MOBS[m.kind];
    for (const [item, lo, hi] of k.loot) {
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (n > 0) drops.spawn(item, n, b.x, b.y + k.size.h / 2, b.z);
    }
  }

  /** Los que murieron sin tener a mano los objetos del suelo (al sol) sueltan lo suyo aquí. */
  dropPending(drops: Drops) {
    for (const m of this.pendingLoot) this.loot(m, drops);
    this.pendingLoot = [];
  }

  /**
   * Golpe desde (fromX, fromZ): resta vida, lo empuja, los animales huyen y, si muere, suelta lo suyo en `drops`.
   * Mientras le dura el destello no recibe más golpes. Devuelve si el golpe contó.
   */
  hit(id: number, fromX: number, fromZ: number, damage: number, drops: Drops): boolean {
    const m = this.get(id);
    if (!m || m.hp <= 0 || m.hurt > 0) return false;
    const b = m.body, hostile = !!MOBS[m.kind].hostile;
    m.hp -= damage;
    m.hurt = HURT_TIME;
    if (!hostile) {
      m.panic = PANIC_TIME;
      m.moving = true;
      m.timer = 0.8;
    }
    const dx = b.x - fromX, dz = b.z - fromZ, d = Math.hypot(dx, dz) || 1;
    if (!hostile) m.walk = Math.atan2(-dx, -dz); // corre en sentido contrario a quien le pega
    b.vx = (dx / d) * KNOCK_H;
    b.vz = (dz / d) * KNOCK_H;
    b.vy = b.inWater ? 2 : KNOCK_V;
    if (m.hp <= 0) this.die(m, drops);
    return true;
  }

  views(): MobView[] {
    return this.list.map((m) => ({
      id: m.id, kind: m.kind, x: m.body.x, y: m.body.y, z: m.body.z, yaw: m.yaw, hurt: m.hurt > 0, dead: m.hp <= 0,
      fuse: m.fuse > 0, burning: m.burning,
    }));
  }
}

/** Primer animal o monstruo vivo que corta el rayo antes de `max` (caja algo mayor que la de colisión, para atinar mejor). */
export function rayMobs(
  mobs: readonly MobView[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number,
): { id: number; t: number } | null {
  let best: { id: number; t: number } | null = null;
  for (const m of mobs) {
    const k = MOBS[m.kind];
    if (!k || m.dead) continue;
    const hw = k.size.hw + 0.1, h = k.size.h + 0.1;
    let t0 = 0, t1 = max;
    const slab = (o: number, d: number, lo: number, hi: number) => {
      if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
      let a = (lo - o) / d, c = (hi - o) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      return t0 <= t1;
    };
    if (slab(ox, dx, m.x - hw, m.x + hw) && slab(oy, dy, m.y, m.y + h) && slab(oz, dz, m.z - hw, m.z + hw) && (!best || t0 < best.t)) {
      best = { id: m.id, t: t0 };
    }
  }
  return best;
}
