// Simulación de Monigotes: movimiento con plataformas, golpes, armas, cajas, bots y árbitro.
// Solo la ejecuta el anfitrión (o el modo local); los invitados envían su teclado y dibujan.
import {
  AIR_ACCEL, AIR_DRAG, AMMO, ATTACK_ANIM, BLAST_X, BLAST_Y, BODY_H, BODY_HW, BOMB_COOLDOWN, BOMB_DAMAGE, BOMB_FUSE, BOMB_KNOCK,
  BOMB_RADIUS, BULLET_DAMAGE, BULLET_KNOCK, BULLET_LIFE, BULLET_SPEED, COUNTDOWN, CRATE_EVERY, DOUBLE_JUMP_V,
  DROP_TIME, END_DELAY, EXPLOSION_TIME, FIGHTERS, GRAVITY, GROUND_ACCEL, GROUND_FRICTION, HITSTUN, HIT_AT, HP, JUMP_V,
  KICK, KNOCK_SCALE, MAX_CRATES, MAX_FALL, PISTOL_COOLDOWN, PUNCH, ROUND_TIME, RUN_SPEED, SW, SWORD, W_BOMB, W_NONE,
  W_PISTOL, W_SWORD, type AttackSpec, type Weapon,
} from "./config";
import type { FightSource } from "./input";
import { STAGES, type Platform, type Stage } from "./stages";

export type SlotKind = "local" | "remote" | "ai";

/** Animación de ataque en curso: 0 puñetazo, 1 patada aérea, 2 espadazo, 3 disparo, 4 lanzamiento. */
export type AttackKind = 0 | 1 | 2 | 3 | 4;
const MELEE: Record<number, AttackSpec> = { 0: PUNCH, 1: KICK, 2: SWORD };

export interface Fighter {
  index: number;
  kind: SlotKind;
  x: number; // pies
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  ground: boolean;
  airJumps: number;
  dropT: number;
  hp: number;
  dead: boolean;
  /** Ya fuera del escenario: no se simula ni se dibuja. */
  gone: boolean;
  angle: number; // giro del cuerpo inerte
  av: number;
  weapon: Weapon;
  ammo: number;
  cool: number;
  attackT: number; // tiempo desde el último ataque (-1 = ninguno)
  attackKind: AttackKind;
  hitDone: boolean;
  hitT: number; // aturdido tras un golpe
  place: number;
  remote: { dx: number; down: boolean; jumps: number; attacks: number; seq: number };
  pendingJumps: number;
  pendingAttacks: number;
  bot: { aim: number; react: number };
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  owner: number;
  life: number;
}

export interface Bomb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuse: number;
}

export interface Crate {
  x: number;
  y: number;
  vy: number;
  kind: Weapon;
}

export interface Explosion {
  x: number;
  y: number;
  t: number;
}

/** Mensaje de un invitado: dirección, ¿abajo?, saltos y ataques pulsados (acumulados) y secuencia. */
export interface StickMsg {
  t: "f";
  x: number;
  d: number;
  j: number;
  a: number;
  s: number;
}

interface Intent {
  dx: number;
  down: boolean;
  jump: boolean;
  attack: boolean;
}
const NO_INTENT: Intent = { dx: 0, down: false, jump: false, attack: false };

export class Fight {
  phase: 0 | 1 | 2 = 0;
  countdown = COUNTDOWN;
  time = 0;
  readonly stageIndex: number;
  readonly stage: Stage;
  fighters: Fighter[];
  bullets: Bullet[] = [];
  bombs: Bomb[] = [];
  crates: Crate[] = [];
  explosions: Explosion[] = [];
  private crateTimer = 2;
  private endTimer: number | null = null;

  /** kinds[i] dice quién controla al luchador i; con bots, la IA rellena los huecos hasta FIGHTERS. */
  constructor(
    kinds: SlotKind[], private local: FightSource, readonly wins: number[] = Array<number>(FIGHTERS).fill(0),
    bots = true, stageIndex = Math.floor(Math.random() * STAGES.length),
  ) {
    this.stageIndex = stageIndex;
    this.stage = STAGES[stageIndex];
    const count = bots ? FIGHTERS : Math.max(1, kinds.length);
    this.fighters = Array.from({ length: count }, (_, i) => {
      const [x, y] = this.stage.spawns[i];
      return {
        index: i, kind: kinds[i] ?? "ai", x, y, vx: 0, vy: 0, facing: x < SW / 2 ? 1 : -1, ground: true, airJumps: 1,
        dropT: 0, hp: HP, dead: false, gone: false, angle: 0, av: 0, weapon: W_NONE, ammo: 0, cool: 0, attackT: -1,
        attackKind: 0, hitDone: true, hitT: 0, place: 0,
        remote: { dx: 0, down: false, jumps: 0, attacks: 0, seq: -1 }, pendingJumps: 0, pendingAttacks: 0,
        bot: { aim: (Math.random() - 0.5) * 10, react: 0.12 + Math.random() * 0.18 },
      };
    });
  }

  get alive(): Fighter[] {
    return this.fighters.filter((f) => !f.dead);
  }

  applyRemote(index: number, msg: StickMsg) {
    const f = this.fighters[index];
    if (!f || f.kind !== "remote" || msg?.t !== "f") return;
    const nums = [msg.x, msg.d, msg.j, msg.a, msg.s].map(Number);
    if (!nums.every(Number.isFinite)) return;
    if (nums[4] <= f.remote.seq) return; // llegó tarde
    const r = f.remote;
    r.seq = nums[4];
    r.dx = Math.max(-1, Math.min(1, Math.round(nums[0])));
    r.down = nums[1] === 1;
    // Los contadores solo crecen: las pulsaciones que falten se aplican aquí.
    if (nums[2] > r.jumps) f.pendingJumps += Math.min(2, nums[2] - r.jumps);
    if (nums[3] > r.attacks) f.pendingAttacks += Math.min(2, nums[3] - r.attacks);
    r.jumps = Math.max(r.jumps, nums[2]);
    r.attacks = Math.max(r.attacks, nums[3]);
  }

  /** Un invitado se ha ido: lo maneja un bot. */
  toAI(index: number) {
    const f = this.fighters[index];
    if (f && f.kind === "remote") f.kind = "ai";
  }

  update(dt: number) {
    this.local.poll();
    if (this.phase === 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.phase = 1;
    } else if (this.phase === 1) {
      this.time += dt;
      this.spawnCrates(dt);
    }
    for (const f of this.fighters) {
      if (f.gone) continue;
      if (!f.dead) this.control(f, this.intent(f), dt);
      this.move(f, dt);
    }
    this.updateBullets(dt);
    this.updateBombs(dt);
    this.updateCrates(dt);
    this.explosions = this.explosions.filter((e) => (e.t += dt) < EXPLOSION_TIME);
    if (this.phase === 1) this.referee(dt);
  }

  // --- entrada ---
  private intent(f: Fighter): Intent {
    let it: Intent;
    if (f.kind === "local") {
      const c = this.local;
      it = { dx: c.dx, down: c.down, jump: c.takeJump(), attack: c.takeAttack() };
    } else if (f.kind === "remote") {
      it = { dx: f.remote.dx, down: f.remote.down, jump: f.pendingJumps > 0, attack: f.pendingAttacks > 0 };
      if (it.jump) f.pendingJumps--;
      if (it.attack) f.pendingAttacks--;
    } else {
      it = this.phase === 1 ? this.bot(f) : NO_INTENT;
    }
    // Las pulsaciones durante la cuenta atrás o un aturdimiento se pierden.
    return this.phase === 1 && f.hitT <= 0 ? it : NO_INTENT;
  }

  // --- control ---
  private control(f: Fighter, it: Intent, dt: number) {
    f.cool = Math.max(0, f.cool - dt);
    f.dropT = Math.max(0, f.dropT - dt);
    f.hitT = Math.max(0, f.hitT - dt);
    if (f.attackT >= 0) {
      f.attackT += dt;
      if (!f.hitDone && f.attackT >= HIT_AT) this.meleeHit(f);
      if (f.attackT > ATTACK_ANIM) f.attackT = -1;
    }
    const accel = f.ground ? GROUND_ACCEL : AIR_ACCEL;
    if (it.dx !== 0) {
      if (f.attackT < 0 || f.attackKind >= 3) f.facing = it.dx > 0 ? 1 : -1;
      const target = it.dx * RUN_SPEED;
      if (it.dx > 0 && f.vx < target) f.vx = Math.min(target, f.vx + accel * dt);
      if (it.dx < 0 && f.vx > target) f.vx = Math.max(target, f.vx - accel * dt);
    }
    // Rozamiento en el suelo (también frena el empuje de los golpes).
    if (f.ground && (it.dx === 0 || Math.abs(f.vx) > RUN_SPEED)) {
      const fr = GROUND_FRICTION * dt;
      f.vx = Math.abs(f.vx) <= fr ? 0 : f.vx - Math.sign(f.vx) * fr;
    }
    if (it.down && f.ground && !this.platformAt(f.x, f.y)?.solid) {
      f.dropT = DROP_TIME;
      f.ground = false;
      f.y += 1;
    }
    if (it.jump) {
      if (f.ground) {
        f.vy = -JUMP_V;
        f.ground = false;
      } else if (f.airJumps > 0) {
        f.vy = -DOUBLE_JUMP_V;
        f.airJumps--;
      }
    }
    if (it.attack && f.cool <= 0) this.attack(f);
  }

  private attack(f: Fighter) {
    f.attackT = 0;
    f.hitDone = true;
    if (f.weapon === W_PISTOL) {
      f.attackKind = 3;
      f.cool = PISTOL_COOLDOWN;
      this.bullets.push({ x: f.x + f.facing * 10, y: f.y - 19, vx: f.facing * BULLET_SPEED, owner: f.index, life: BULLET_LIFE });
      this.useAmmo(f);
    } else if (f.weapon === W_BOMB) {
      f.attackKind = 4;
      f.cool = BOMB_COOLDOWN;
      this.bombs.push({ x: f.x + f.facing * 6, y: f.y - 22, vx: f.facing * 150 + f.vx * 0.5, vy: -230, fuse: BOMB_FUSE });
      this.useAmmo(f);
    } else {
      f.attackKind = f.weapon === W_SWORD ? 2 : f.ground ? 0 : 1;
      f.cool = MELEE[f.attackKind].cooldown;
      f.hitDone = false;
    }
  }

  private useAmmo(f: Fighter) {
    if (--f.ammo <= 0) f.weapon = W_NONE;
  }

  private meleeHit(f: Fighter) {
    f.hitDone = true;
    const spec = MELEE[f.attackKind];
    for (const o of this.fighters) {
      if (o === f || o.dead) continue;
      const ahead = (o.x - f.x) * f.facing;
      const dy = (o.y - BODY_H / 2) - (f.y - 16);
      if (ahead < -4 || ahead > spec.range + BODY_HW || Math.abs(dy) > 16) continue;
      this.damage(o, spec.damage, f.facing * spec.knock, spec.lift);
    }
  }

  private damage(o: Fighter, dmg: number, kx: number, lift: number) {
    if (o.dead) return;
    o.hp -= dmg;
    const k = KNOCK_SCALE(o.hp);
    o.vx = kx * k;
    o.vy = -lift * k;
    o.ground = false;
    o.hitT = HITSTUN + dmg / 100;
    o.attackT = -1;
    if (o.hp <= 0) this.kill(o);
  }

  private kill(o: Fighter) {
    o.dead = true;
    o.hp = 0;
    o.av = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6);
    o.vy -= 80;
    // Suelta el arma: vuelve a caer como caja.
    if (o.weapon !== W_NONE && this.crates.length < MAX_CRATES + 1) {
      this.crates.push({ x: o.x, y: o.y - 20, vy: -120, kind: o.weapon });
    }
    o.weapon = W_NONE;
  }

  // --- física ---
  /** Plataforma sobre la que se apoya un punto (pies justo encima de su borde). */
  platformAt(x: number, y: number): Platform | undefined {
    return this.stage.platforms.find((p) => x >= p.x - 2 && x <= p.x + p.w + 2 && Math.abs(y - p.y) < 1);
  }

  /** Plataforma bajo el punto como mucho maxDrop más abajo (la más cercana). */
  platformBelow(x: number, y: number, maxDrop = 999): Platform | undefined {
    let best: Platform | undefined;
    for (const p of this.stage.platforms) {
      if (x < p.x - 2 || x > p.x + p.w + 2 || p.y < y - 1 || p.y - y > maxDrop) continue;
      if (!best || p.y < best.y) best = p;
    }
    return best;
  }

  /** Mueve un cuerpo con gravedad y lo apoya en las plataformas al caer sobre ellas. */
  private land(b: { x: number; y: number; vy: number }, prevY: number, dropping: boolean): Platform | undefined {
    if (b.vy < 0) return undefined;
    for (const p of this.stage.platforms) {
      if (dropping && !p.solid) continue;
      if (prevY <= p.y + 0.5 && b.y >= p.y && b.x >= p.x - 2 && b.x <= p.x + p.w + 2) {
        b.y = p.y;
        return p;
      }
    }
    return undefined;
  }

  private move(f: Fighter, dt: number) {
    f.vy = Math.min(MAX_FALL, f.vy + GRAVITY * dt);
    // Resistencia del aire al salir despedido (no frena el movimiento normal).
    if (!f.ground && Math.abs(f.vx) > RUN_SPEED) f.vx *= Math.exp(-AIR_DRAG * dt);
    const prevY = f.y;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    const p = this.land(f, prevY, f.dropT > 0);
    f.ground = !!p;
    if (p) {
      if (f.dead) {
        // Cuerpo inerte: rebota un poco y se queda tumbado.
        f.vy = f.vy > 90 ? -f.vy * 0.3 : 0;
        f.vx *= 0.7;
        f.av *= 0.5;
        f.angle += (Math.sign(f.angle || 1) * Math.PI / 2 - f.angle) * 0.3;
        if (f.vy < 0) f.ground = false;
      } else {
        f.vy = 0;
        f.airJumps = 1;
      }
    }
    if (f.dead) f.angle += f.av * dt;
    if (f.y > BLAST_Y || f.x < -BLAST_X || f.x > SW + BLAST_X) {
      if (!f.dead) this.kill(f);
      f.gone = true;
    }
  }

  private updateBullets(dt: number) {
    this.bullets = this.bullets.filter((b) => {
      b.x += b.vx * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > SW + 20) return false;
      const hit = this.fighters.find(
        (o) => !o.dead && o.index !== b.owner && Math.abs(o.x - b.x) < BODY_HW + 2 && b.y >= o.y - BODY_H && b.y <= o.y,
      );
      if (hit) this.damage(hit, BULLET_DAMAGE, Math.sign(b.vx) * BULLET_KNOCK, 50);
      return !hit;
    });
  }

  private updateBombs(dt: number) {
    this.bombs = this.bombs.filter((b) => {
      b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
      const prevY = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (this.land(b, prevY, false)) {
        b.vy = b.vy > 60 ? -b.vy * 0.4 : 0;
        b.vx *= 0.7;
      }
      b.fuse -= dt;
      if (b.y > BLAST_Y) return false;
      if (b.fuse > 0) return true;
      this.explode(b.x, b.y - 3);
      return false;
    });
  }

  private explode(x: number, y: number) {
    this.explosions.push({ x, y, t: 0 });
    for (const o of this.fighters) {
      if (o.gone) continue;
      const dx = o.x - x;
      const dy = o.y - BODY_H / 2 - y;
      const d = Math.hypot(dx, dy);
      if (d > BOMB_RADIUS) continue;
      const k = 1 - d / BOMB_RADIUS;
      const nx = d > 1 ? dx / d : 0;
      const ny = d > 1 ? dy / d : -1;
      if (o.dead) {
        // Los cuerpos también salen volando.
        o.vx += nx * BOMB_KNOCK * k;
        o.vy -= 200 * k;
        o.ground = false;
      } else {
        this.damage(o, Math.round(BOMB_DAMAGE * k + 5), nx * BOMB_KNOCK * (0.5 + k * 0.5), 120 - ny * 120);
      }
    }
  }

  private spawnCrates(dt: number) {
    this.crateTimer -= dt;
    if (this.crateTimer > 0) return;
    this.crateTimer = CRATE_EVERY;
    if (this.crates.length >= MAX_CRATES) return;
    // Cae sobre una plataforma al azar.
    const p = this.stage.platforms[Math.floor(Math.random() * this.stage.platforms.length)];
    const kind = (1 + Math.floor(Math.random() * 3)) as Weapon;
    this.crates.push({ x: p.x + 8 + Math.random() * (p.w - 16), y: -10, vy: 0, kind });
  }

  private updateCrates(dt: number) {
    this.crates = this.crates.filter((c) => {
      c.vy = Math.min(MAX_FALL, c.vy + GRAVITY * dt);
      const prevY = c.y;
      c.y += c.vy * dt;
      if (this.land(c, prevY, false)) c.vy = 0;
      if (c.y > BLAST_Y) return false;
      const taker = this.fighters.find(
        (f) => !f.dead && f.weapon === W_NONE && Math.abs(f.x - c.x) < 11 && c.y >= f.y - BODY_H - 4 && c.y <= f.y + 6,
      );
      if (!taker) return true;
      taker.weapon = c.kind;
      taker.ammo = AMMO[c.kind];
      return false;
    });
  }

  // --- árbitro ---
  private referee(dt: number) {
    const alive = this.alive.length;
    for (const f of this.fighters) if (f.dead && !f.place) f.place = alive + 1;
    if (this.time >= ROUND_TIME) return this.finish();
    // Solo, sin bots (entrenamiento): la ronda dura hasta caer o agotar el tiempo.
    if (alive > (this.fighters.length === 1 ? 0 : 1)) return;
    this.endTimer ??= END_DELAY;
    this.endTimer -= dt;
    if (this.endTimer <= 0) this.finish();
  }

  private finish() {
    for (const f of this.fighters) if (!f.place) f.place = 1;
    const solo = this.fighters.length === 1;
    for (const f of this.fighters) if (f.place === 1 && (!solo || !f.dead)) this.wins[f.index]++;
    this.phase = 2;
  }

  standings(): Fighter[] {
    return [...this.fighters].sort((a, b) => (a.place || 99) - (b.place || 99) || a.index - b.index);
  }

  // --- bots ---
  private bot(f: Fighter): Intent {
    const it: Intent = { dx: 0, down: false, jump: false, attack: false };
    // En el aire sin suelo debajo: volver hacia la plataforma más cercana (con el doble salto).
    if (!f.ground && !this.platformBelow(f.x, f.y)) {
      const p = this.nearestPlatform(f.x, f.y);
      if (p) {
        it.dx = Math.sign(p.x + p.w / 2 - f.x);
        it.jump = f.vy > 0 && f.airJumps > 0 && f.y > p.y - 12;
      }
      return it;
    }
    // Objetivo: una caja de armas cercana si va desarmado; si no, el rival vivo más cercano.
    let tx = 0, ty = 0, enemy: Fighter | null = null, best = Infinity;
    if (f.weapon === W_NONE) {
      for (const c of this.crates) {
        const d = Math.hypot(c.x - f.x, c.y - f.y);
        if (d < 110 && d < best) [best, tx, ty] = [d, c.x, c.y];
      }
    }
    if (best === Infinity) {
      for (const o of this.fighters) {
        if (o === f || o.dead) continue;
        const d = Math.hypot(o.x - f.x, o.y - f.y);
        if (d < best) [best, tx, ty, enemy] = [d, o.x + f.bot.aim, o.y, o];
      }
    }
    if (best === Infinity) return it;
    const dx = tx - f.x;
    const dy = ty - f.y;
    const range = f.weapon === W_SWORD ? SWORD.range : f.weapon === W_PISTOL ? 150 : f.weapon === W_BOMB ? 110 : PUNCH.range;
    const close = enemy && Math.abs(dx) < range - 2 && Math.abs(dy) < 14;
    if (!close && Math.abs(dx) > 5) it.dx = Math.sign(dx);
    // No tirarse por el borde salvo que el objetivo esté por ahí abajo.
    if (it.dx && f.ground && !this.platformBelow(f.x + it.dx * 10, f.y, 60)) {
      if (dy < -10 || Math.abs(dx) > 40) it.jump = true;
      else it.dx = 0;
    }
    if (f.ground && dy < -20 && Math.abs(dx) < 70) it.jump = true;
    if (f.ground && dy > 20 && Math.abs(dx) < 50) it.down = true;
    // Sin ataques los primeros instantes: da tiempo a los jugadores a reaccionar.
    if (enemy && this.time > 1.5) {
      const facingIt = Math.sign(dx) === f.facing || Math.abs(dx) < 3;
      if (!facingIt && close) it.dx = Math.sign(dx); // darse la vuelta
      const r = Math.random();
      if (f.weapon === W_PISTOL) it.attack = facingIt && Math.abs(dy) < 10 && Math.abs(dx) < 170 && r < 0.08;
      else if (f.weapon === W_BOMB) it.attack = Math.abs(dx) > 35 && Math.abs(dx) < 120 && r < 0.03;
      else it.attack = !!close && facingIt && r < f.bot.react;
    }
    return it;
  }

  private nearestPlatform(x: number, y: number): Platform | undefined {
    let best: Platform | undefined;
    let bestD = Infinity;
    for (const p of this.stage.platforms) {
      const cx = Math.max(p.x, Math.min(p.x + p.w, x));
      const d = Math.hypot(cx - x, (p.y - y) * 0.5);
      if (d < bestD) [bestD, best] = [d, p];
    }
    return best;
  }
}
