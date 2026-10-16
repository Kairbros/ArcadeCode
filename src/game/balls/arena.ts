// Simulación de Sumo de bolas: física de las bolas, caídas a la lava, IA y árbitro de la ronda.
// Solo la ejecuta el anfitrión (o el modo local); los invitados envían su dirección y dibujan.
import {
  ACCEL, ARENA_MIN_R, ARENA_R, BALLS, BALL_R, BUMP, COUNTDOWN, DASH_COOLDOWN, DASH_SPEED, DRAG, END_DELAY, GRAVITY,
  LAVA_DROP, MAX_SPEED, RESTITUTION, ROUND_TIME, SHRINK_START, SPAWN_R,
} from "./config";
import type { RollSource } from "./input";

export type SlotKind = "local" | "remote" | "ai";

/** 0 = rodando, 1 = cayendo, 2 = en la lava. */
export type BallState = 0 | 1 | 2;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Altura respecto a la plataforma (negativa al caer). */
  z: number;
  vz: number;
  state: BallState;
  dashCool: number;
}

/** Mensaje de un invitado: dirección, embestidas pulsadas (acumulado) y secuencia. */
export interface BallMsg {
  t: "b";
  x: number;
  y: number;
  d: number;
  s: number;
}

interface Intent {
  dx: number;
  dy: number;
  dash: boolean;
}

export interface Slot {
  index: number;
  kind: SlotKind;
  ball: Ball;
  /** Puesto en la ronda (1 = ganador); 0 mientras sigue en juego. */
  place: number;
  // Entrada remota
  remote: { dx: number; dy: number; dashes: number; seq: number };
  pendingDashes: number;
  // Carácter de la IA
  aggression: number;
  wobble: number;
}

export class Arena {
  phase: 0 | 1 | 2 = 0;
  countdown = COUNTDOWN;
  time = 0;
  radius = ARENA_R;
  slots: Slot[];
  private endTimer: number | null = null;

  /** kinds[i] dice quién controla la bola i; con bots, la IA rellena los huecos hasta BALLS. */
  constructor(
    kinds: SlotKind[], private local: RollSource, readonly wins: number[] = Array<number>(BALLS).fill(0), bots = true,
  ) {
    const start = Math.random() * Math.PI * 2;
    const count = bots ? BALLS : Math.max(1, kinds.length);
    this.slots = Array.from({ length: count }, (_, i) => {
      const a = start + (i / count) * Math.PI * 2;
      return {
        index: i,
        kind: kinds[i] ?? "ai",
        ball: {
          x: Math.cos(a) * ARENA_R * SPAWN_R, y: Math.sin(a) * ARENA_R * SPAWN_R,
          vx: 0, vy: 0, z: 0, vz: 0, state: 0, dashCool: 0,
        },
        place: 0,
        remote: { dx: 0, dy: 0, dashes: 0, seq: -1 },
        pendingDashes: 0,
        aggression: 0.5 + Math.random() * 0.5,
        wobble: (Math.random() - 0.5) * 0.6,
      };
    });
  }

  get rolling(): Slot[] {
    return this.slots.filter((s) => s.ball.state === 0);
  }

  applyRemote(index: number, msg: BallMsg) {
    const s = this.slots[index];
    if (!s || s.kind !== "remote" || msg?.t !== "b") return;
    const nums = [msg.x, msg.y, msg.d, msg.s].map(Number);
    if (!nums.every(Number.isFinite)) return;
    if (nums[3] <= s.remote.seq) return; // llegó tarde
    s.remote.seq = nums[3];
    s.remote.dx = Math.max(-1, Math.min(1, nums[0]));
    s.remote.dy = Math.max(-1, Math.min(1, nums[1]));
    // El contador de embestidas solo crece: las que falten se aplican aquí.
    if (nums[2] > s.remote.dashes) {
      s.pendingDashes += Math.min(3, nums[2] - s.remote.dashes);
      s.remote.dashes = nums[2];
    }
  }

  /** Un invitado se ha ido: su bola pasa a la IA. */
  toAI(index: number) {
    const s = this.slots[index];
    if (s && s.kind === "remote") s.kind = "ai";
  }

  update(dt: number) {
    this.local.poll();
    if (this.phase === 0) {
      this.countdown -= dt;
      this.local.takeDash(); // no se acumulan embestidas durante la cuenta atrás
      if (this.countdown <= 0) this.phase = 1;
      return;
    }
    if (this.phase === 1) {
      this.time += dt;
      const t = Math.max(0, Math.min(1, (this.time - SHRINK_START) / (ROUND_TIME - SHRINK_START)));
      this.radius = ARENA_R + (ARENA_MIN_R - ARENA_R) * t;
    }
    for (const s of this.slots) if (s.ball.state === 0) this.steer(s, dt);
    this.physics(dt);
    if (this.phase === 1) this.referee(dt);
  }

  // --- entrada ---
  private intent(s: Slot): Intent {
    if (this.phase !== 1) return { dx: 0, dy: 0, dash: false };
    if (s.kind === "local") return { dx: this.local.dx, dy: this.local.dy, dash: this.local.takeDash() };
    if (s.kind === "remote") {
      const dash = s.pendingDashes > 0;
      if (dash) s.pendingDashes--;
      return { dx: s.remote.dx, dy: s.remote.dy, dash };
    }
    return this.ai(s);
  }

  private steer(s: Slot, dt: number) {
    const b = s.ball;
    const { dx, dy, dash } = this.intent(s);
    const len = Math.hypot(dx, dy);
    b.dashCool = Math.max(0, b.dashCool - dt);
    if (len > 0.01) {
      const ux = dx / Math.max(1, len);
      const uy = dy / Math.max(1, len);
      // Solo se acelera mientras no se supere la velocidad máxima en esa dirección.
      if (b.vx * ux + b.vy * uy < MAX_SPEED) {
        b.vx += ux * ACCEL * dt;
        b.vy += uy * ACCEL * dt;
      }
    }
    if (dash && b.dashCool <= 0) {
      // Embestida hacia donde se apunta (o hacia donde se rueda si no se pulsa dirección).
      const sp = Math.hypot(b.vx, b.vy);
      const [ux, uy] = len > 0.01 ? [dx / len, dy / len] : sp > 1 ? [b.vx / sp, b.vy / sp] : [0, 0];
      b.vx += ux * DASH_SPEED;
      b.vy += uy * DASH_SPEED;
      b.dashCool = DASH_COOLDOWN;
    }
  }

  // --- física ---
  private physics(dt: number) {
    const damp = Math.exp(-DRAG * dt);
    for (const { ball: b } of this.slots) {
      if (b.state === 2) continue;
      if (b.state === 0) {
        b.vx *= damp;
        b.vy *= damp;
      } else {
        b.vz -= GRAVITY * dt;
        b.z += b.vz * dt;
        if (b.z < -(LAVA_DROP + BALL_R * 2)) b.state = 2;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    // Choques entre bolas que ruedan: rebote con un empujón extra.
    const live = this.rolling.map((s) => s.ball);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const c = live[j];
        let nx = c.x - a.x;
        let ny = c.y - a.y;
        const d = Math.hypot(nx, ny);
        if (d >= BALL_R * 2 || d < 1e-6) continue;
        nx /= d;
        ny /= d;
        const overlap = BALL_R * 2 - d;
        a.x -= nx * overlap / 2;
        a.y -= ny * overlap / 2;
        c.x += nx * overlap / 2;
        c.y += ny * overlap / 2;
        const vn = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny; // > 0 si se acercan
        if (vn <= 0) continue;
        const j2 = (vn * (1 + RESTITUTION)) / 2 + BUMP;
        a.vx -= nx * j2;
        a.vy -= ny * j2;
        c.vx += nx * j2;
        c.vy += ny * j2;
      }
    }
    // Fuera del borde: a caer.
    for (const b of live) {
      if (Math.hypot(b.x, b.y) > this.radius) {
        b.state = 1;
        b.vz = 0;
        b.vx *= 0.6;
        b.vy *= 0.6;
      }
    }
  }

  // --- árbitro ---
  private referee(dt: number) {
    const alive = this.rolling.length;
    // Los que acaban de caer comparten el puesto que dejan libre.
    for (const s of this.slots) if (s.ball.state !== 0 && !s.place) s.place = alive + 1;
    if (this.time >= ROUND_TIME) return this.finish();
    // Solo, sin bots (entrenamiento): la ronda dura hasta caer o agotar el tiempo.
    if (alive > (this.slots.length === 1 ? 0 : 1)) return;
    this.endTimer ??= END_DELAY;
    this.endTimer -= dt;
    if (this.endTimer <= 0) this.finish();
  }

  private finish() {
    for (const s of this.slots) if (!s.place) s.place = 1;
    // Solo (sin bots) gana quien aguanta hasta el final sin caer.
    const solo = this.slots.length === 1;
    for (const s of this.slots) if (s.place === 1 && (!solo || s.ball.state === 0)) this.wins[s.index]++;
    this.phase = 2;
  }

  /** Clasificación de la ronda, del ganador al primero en caer. */
  standings(): Slot[] {
    return [...this.slots].sort((a, b) => (a.place || 99) - (b.place || 99) || a.index - b.index);
  }

  // --- IA ---
  private ai(s: Slot): Intent {
    const b = s.ball;
    const R = this.radius;
    // Posición prevista: si se va a salir, vuelve hacia el centro (embistiendo si es urgente).
    const fx = b.x + b.vx * 0.35;
    const fy = b.y + b.vy * 0.35;
    const fd = Math.hypot(fx, fy);
    if (fd > R - BALL_R * 1.3) {
      const urgent = fd > R + BALL_R && b.dashCool <= 0;
      return { dx: -fx / fd, dy: -fy / fd, dash: urgent };
    }
    // Rival más cercano.
    let target: Ball | null = null;
    let best = Infinity;
    for (const o of this.slots) {
      if (o === s || o.ball.state !== 0) continue;
      const d = Math.hypot(o.ball.x - b.x, o.ball.y - b.y);
      if (d < best) {
        best = d;
        target = o.ball;
      }
    }
    if (!target) return { dx: -b.x / R, dy: -b.y / R, dash: false };
    // Colocarse entre el rival y el centro para empujarle hacia fuera; luego cargar.
    const od = Math.hypot(target.x, target.y) || 1;
    const px = target.x - (target.x / od) * BALL_R * 2.6;
    const py = target.y - (target.y / od) * BALL_R * 2.6;
    const charge = Math.hypot(px - b.x, py - b.y) < BALL_R * 1.5 || best < BALL_R * 3;
    let tx = (charge ? target.x : px) - b.x;
    let ty = (charge ? target.y : py) - b.y;
    // Cada IA apunta con un pequeño desvío propio.
    const c = Math.cos(s.wobble);
    const sn = Math.sin(s.wobble);
    [tx, ty] = [tx * c - ty * sn, tx * sn + ty * c];
    const len = Math.hypot(tx, ty) || 1;
    // Sin embestidas los primeros segundos: da tiempo a los jugadores a reaccionar.
    const dash = charge && this.time > 2 && best < 48 && b.dashCool <= 0 && Math.random() < s.aggression * 0.08;
    return { dx: tx / len, dy: ty / len, dash };
  }
}
