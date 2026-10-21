// Física de Billar: 16 bolas (0 = blanca) sobre un paño con troneras. Cada bola tiene velocidad lineal y angular:
// el rozamiento con el paño (resbalar y luego rodar), el golpe descentrado del taco, el roce entre bolas (throw) y el
// de las bandas dan solos la rosca (seguir/retroceder) y el efecto lateral. Movimiento en 2D; la altura la pone el render.
import {
  BALL_FRIC, BALL_R, BALL_REST, CORNER_MOUTH, CORNER_R, HEAD_X, JAW_R, MAX_SPEED, MIN_SPEED, POCKETS, RACK_X, RAIL_FRIC,
  RAIL_REST, ROLL_DECEL, ROLL_DRAG, SIDE_R, SIDE_MOUTH, SLIDE_ACC, SPIN_DECAY, SPIN_GAIN, STEP, STOP_SPEED, STRIKE_OFFSET, TH, TW,
} from "./config";

export interface PBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Velocidad angular: wx y wy (horizontales, giro hacia delante/atrás) y wz (sobre sí misma, efecto lateral). */
  wx: number;
  wy: number;
  wz: number;
  /** Tronera en la que está (-1 = sobre la mesa). */
  pocket: number;
}

/** Lo que pasó en la tirada, para que el árbitro (match.ts) aplique las reglas. */
export interface ShotLog {
  /** Primera bola tocada por la blanca (0 = ninguna). */
  first: number;
  /** Una bola tocó banda después del primer contacto. */
  railAfter: boolean;
  /** Bolas distintas de la blanca que tocaron banda (para validar el saque). */
  railBalls: Set<number>;
  /** Bolas metidas, por orden, con la tronera. */
  pocketed: { id: number; pocket: number }[];
}

const newLog = (): ShotLog => ({ first: 0, railAfter: false, railBalls: new Set(), pocketed: [] });

const X_MIN = -TW / 2 + BALL_R;
const X_MAX = TW / 2 - BALL_R;
const Y_MIN = -TH / 2 + BALL_R;
const Y_MAX = TH / 2 - BALL_R;
const D2 = (BALL_R * 2) ** 2;

export const isSolid = (id: number) => id >= 1 && id <= 7;
export const isStripe = (id: number) => id >= 9 && id <= 15;
/** Grupo de una bola: 0 lisas, 1 rayadas, -1 la blanca o la 8. */
export const groupOf = (id: number) => (isSolid(id) ? 0 : isStripe(id) ? 1 : -1);

/** Bolas de un grupo que siguen en la mesa (7 si aún no hay grupos). */
export function groupLeft(balls: readonly PBall[], group: number): number {
  if (group < 0) return 7;
  let n = 0;
  for (let id = 1; id < 16; id++) if (groupOf(id) === group && balls[id].pocket < 0) n++;
  return n;
}

function poolRadius(i: number): number {
  return i === 1 || i === 4 ? SIDE_R : CORNER_R;
}

const INERTIA = 0.4 * BALL_R * BALL_R; // bola maciza: I = 2/5 m R² (m = 1)
const R_I = (BALL_R * BALL_R) / INERTIA; // R²/I = 2,5

/** Extremos de las bandas junto a las troneras ("labios"): las bolas rebotan en ellos. */
const JAWS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      out.push([sx * (TW / 2 - CORNER_MOUTH), sy * (TH / 2)]); // banda larga, junto a la esquina
      out.push([sx * (TW / 2), sy * (TH / 2 - CORNER_MOUTH)]); // banda corta, junto a la esquina
      out.push([sx * SIDE_MOUTH, sy * (TH / 2)]); // a cada lado de la tronera central
    }
  }
  return out;
})();

export class Table {
  balls: PBall[] = Array.from({ length: 16 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, pocket: -1 }));
  log: ShotLog = newLog();

  constructor(rnd: () => number = Math.random) {
    this.rack(rnd);
  }

  /** Coloca el triángulo y la blanca en la cabeza. */
  rack(rnd: () => number = Math.random) {
    const solids = [1, 2, 3, 4, 5, 6, 7].sort(() => rnd() - 0.5);
    const stripes = [9, 10, 11, 12, 13, 14, 15].sort(() => rnd() - 0.5);
    const corners = [solids.pop()!, stripes.pop()!].sort(() => rnd() - 0.5);
    const rest = [...solids, ...stripes].sort(() => rnd() - 0.5);
    const dx = BALL_R * 2 * 0.866 + 0.06, dy = BALL_R * 2 + 0.12;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c <= r; c++) {
        const id = r === 2 && c === 1 ? 8 : r === 4 && c === 0 ? corners[0] : r === 4 && c === 4 ? corners[1] : rest.pop()!;
        const b = this.balls[id];
        b.x = RACK_X + r * dx;
        b.y = (c - r / 2) * dy;
        this.stop(b);
        b.pocket = -1;
      }
    }
    const cue = this.balls[0];
    cue.x = HEAD_X;
    cue.y = 0;
    this.stop(cue);
    cue.pocket = -1;
    this.log = newLog();
  }

  /** Copia de la mesa para probar tiros sin tocar la partida (la IA ensaya con ella). */
  clone(): Table {
    const t = Object.create(Table.prototype) as Table;
    t.balls = this.balls.map((b) => ({ ...b }));
    t.log = newLog();
    return t;
  }

  private stop(b: PBall) {
    b.vx = b.vy = b.wx = b.wy = b.wz = 0;
  }

  /** Alguna bola se mueve. */
  get moving(): boolean {
    return this.balls.some((b) => b.pocket < 0 && (b.vx !== 0 || b.vy !== 0 || b.wz !== 0));
  }

  /**
   * Golpe de taco: `power` en 0..1; `top` (-1 retrocede, 1 sigue) y `side` (-1 izquierda, 1 derecha) son el
   * punto de la blanca donde pega la punta, hasta medio radio del centro. Del descentrado salen el giro
   * (arriba/abajo y lateral) y un pequeño desvío de la trayectoria.
   */
  shoot(angle: number, power: number, top: number, side: number) {
    const cue = this.balls[0];
    const v0 = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.max(0, Math.min(1, power));
    const b = Math.max(-1, Math.min(1, side)) * STRIKE_OFFSET * BALL_R;
    const h = Math.max(-1, Math.min(1, top)) * STRIKE_OFFSET * BALL_R;
    const a = angle - (b / BALL_R) * 0.06; // "squirt": la blanca sale algo opuesta al lado golpeado
    const dx = Math.cos(a), dy = Math.sin(a);
    // Un golpe descentrado transmite algo menos de velocidad.
    const sp = v0 * (1 - 0.18 * ((b * b + h * h) / (BALL_R * BALL_R)));
    cue.vx = dx * sp;
    cue.vy = dy * sp;
    // τ = r × J con r = (-R d + b n, -h) y J = v0 d (n = a la derecha de la dirección de tiro).
    cue.wx = (h * v0 * dy * SPIN_GAIN) / INERTIA;
    cue.wy = (-h * v0 * dx * SPIN_GAIN) / INERTIA;
    cue.wz = (-b * v0 * SPIN_GAIN) / INERTIA;
    this.log = newLog();
  }

  /** Avanza `dt` segundos con pasos fijos. */
  update(dt: number) {
    for (let t = dt; t > 0; t -= STEP) this.step(Math.min(STEP, t));
  }

  private step(dt: number) {
    const bs = this.balls;
    for (let i = 0; i < 16; i++) {
      const b = bs[i];
      if (b.pocket >= 0 || (b.vx === 0 && b.vy === 0 && b.wz === 0)) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      this.cloth(b, dt);
      this.pocketOrRail(i, b);
    }
    // Dos pasadas para que los choques de varias bolas pegadas (el triángulo) se asienten.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 16; i++) {
        const a = bs[i];
        if (a.pocket >= 0) continue;
        for (let j = i + 1; j < 16; j++) {
          const c = bs[j];
          if (c.pocket < 0) this.collide(i, a, j, c);
        }
      }
    }
  }

  /**
   * Rozamiento con el paño. Mientras el punto de contacto resbala (u = v + ω × r ≠ 0) el rozamiento lo frena y
   * convierte el giro en avance, o al revés: así salen solos el seguir, el retroceder y el "rodar" tras un golpe
   * seco. Al dejar de resbalar la bola rueda y solo la frena la resistencia del paño.
   */
  private cloth(b: PBall, dt: number) {
    let t = dt;
    const ux = b.vx + BALL_R * b.wy, uy = b.vy - BALL_R * b.wx;
    const us = Math.hypot(ux, uy);
    if (us > 1e-3) {
      // El contacto resbala: tarda us / (3,5·a) en rodar; se aplica ese tramo (o todo dt si no llega).
      const ts = Math.min(t, us / ((1 + R_I) * SLIDE_ACC));
      const fx = -ux / us, fy = -uy / us; // dirección de la fricción
      b.vx += fx * SLIDE_ACC * ts;
      b.vy += fy * SLIDE_ACC * ts;
      b.wx += (BALL_R * SLIDE_ACC * -fy * ts) / INERTIA;
      b.wy += (BALL_R * SLIDE_ACC * fx * ts) / INERTIA;
      t -= ts;
    }
    if (t > 0) {
      const sp = Math.hypot(b.vx, b.vy);
      const ns = sp * (1 - ROLL_DRAG * t) - ROLL_DECEL * t;
      if (ns < STOP_SPEED) {
        b.vx = b.vy = b.wx = b.wy = 0;
      } else {
        b.vx *= ns / sp;
        b.vy *= ns / sp;
        b.wy = -b.vx / BALL_R; // rodando: u = 0
        b.wx = b.vy / BALL_R;
      }
    }
    // El giro sobre sí misma (efecto lateral) se apaga con el tiempo.
    if (b.wz !== 0) {
      const d = SPIN_DECAY * dt;
      b.wz = Math.abs(b.wz) <= d ? 0 : b.wz - Math.sign(b.wz) * d;
    }
  }

  private pocketOrRail(id: number, b: PBall) {
    for (let p = 0; p < 6; p++) {
      const r = poolRadius(p);
      if ((b.x - POCKETS[p][0]) ** 2 + (b.y - POCKETS[p][1]) ** 2 < r * r) {
        b.pocket = p;
        b.x = POCKETS[p][0];
        b.y = POCKETS[p][1];
        this.stop(b);
        this.log.pocketed.push({ id, pocket: p });
        return;
      }
    }
    // Labios de las troneras: rebote contra el extremo redondeado de la banda.
    const lim = BALL_R + JAW_R;
    for (const [jx, jy] of JAWS) {
      const dx = b.x - jx, dy = b.y - jy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= lim * lim || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      this.bounce(id, b, dx / d, dy / d, true);
      b.x = jx + (dx / d) * lim;
      b.y = jy + (dy / d) * lim;
    }
    // Bandas cortas (izquierda y derecha): los tramos junto a las esquinas no rebotan.
    if (b.x < X_MIN || b.x > X_MAX) {
      if (Math.abs(Math.abs(b.y) - TH / 2) >= CORNER_MOUTH) {
        const left = b.x < X_MIN;
        b.x = left ? X_MIN : X_MAX;
        this.bounce(id, b, left ? 1 : -1, 0, false);
      } else if (Math.abs(b.x) > TW / 2 + 3) {
        b.x = Math.sign(b.x) * (TW / 2 + 3); // por si se cuela entre troneras
      }
    }
    if (b.y < Y_MIN || b.y > Y_MAX) {
      const ax = Math.abs(b.x);
      const mouth = ax > TW / 2 - CORNER_MOUTH || ax < SIDE_MOUTH;
      if (!mouth) {
        const top = b.y < Y_MIN;
        b.y = top ? Y_MIN : Y_MAX;
        this.bounce(id, b, 0, top ? 1 : -1, false);
      } else if (Math.abs(b.y) > TH / 2 + 4) {
        b.y = Math.sign(b.y) * (TH / 2 + 4);
      }
    }
  }

  /**
   * Rebote con normal (nx, ny) hacia dentro de la mesa. La banda quita más energía cuanto más fuerte llega, y
   * el roce con el contacto convierte el giro lateral en desvío (y el desvío en giro): el "efecto" de banda.
   */
  private bounce(id: number, b: PBall, nx: number, ny: number, jaw: boolean) {
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return; // ya se aleja
    const e = jaw ? 0.6 : Math.max(0.55, Math.min(0.88, RAIL_REST + 0.1 - 0.0004 * -vn));
    const jn = -(1 + e) * vn;
    b.vx += jn * nx;
    b.vy += jn * ny;
    // Fricción tangencial: t = normal girada 90°; el punto de contacto está a -R·n del centro.
    const tx = -ny, ty = nx;
    const slip = b.vx * tx + b.vy * ty - BALL_R * b.wz;
    const jt = Math.max(-RAIL_FRIC * jn, Math.min(RAIL_FRIC * jn, -slip / (1 + R_I)));
    b.vx += jt * tx;
    b.vy += jt * ty;
    b.wz += (-BALL_R * jt) / INERTIA;
    if (this.log.first !== 0) this.log.railAfter = true;
    if (id !== 0) this.log.railBalls.add(id);
  }

  private collide(i: number, a: PBall, j: number, c: PBall) {
    let dx = c.x - a.x, dy = c.y - a.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= D2 || d2 < 1e-9) return;
    const d = Math.sqrt(d2);
    dx /= d;
    dy /= d;
    const push = (BALL_R * 2 - d) / 2;
    a.x -= dx * push;
    a.y -= dy * push;
    c.x += dx * push;
    c.y += dy * push;
    const vrel = (a.vx - c.vx) * dx + (a.vy - c.vy) * dy;
    if (vrel <= 0) return;
    // Impulso normal (choque casi elástico entre bolas iguales).
    const jn = ((1 + BALL_REST) * vrel) / 2;
    a.vx -= jn * dx;
    a.vy -= jn * dy;
    c.vx += jn * dx;
    c.vy += jn * dy;
    // Rozamiento entre bolas: arrastra la bola golpeada ("throw") y se pasan el giro lateral.
    const tx = -dy, ty = dx;
    const slip = (a.vx - c.vx) * tx + (a.vy - c.vy) * ty + BALL_R * (a.wz + c.wz);
    const jt = Math.max(-BALL_FRIC * jn, Math.min(BALL_FRIC * jn, -slip / (2 + 2 * R_I)));
    a.vx += jt * tx;
    a.vy += jt * ty;
    c.vx -= jt * tx;
    c.vy -= jt * ty;
    a.wz += (BALL_R * jt) / INERTIA;
    c.wz += (BALL_R * jt) / INERTIA;
    if ((i === 0 || j === 0) && this.log.first === 0) this.log.first = i === 0 ? j : i;
  }

  /** ¿Se puede dejar la blanca en (x, y)? `head`: solo detrás de la línea de cabeza (saque). */
  canPlace(x: number, y: number, head: boolean): boolean {
    if (x < X_MIN || x > X_MAX || y < Y_MIN || y > Y_MAX) return false;
    if (head && x > HEAD_X) return false;
    for (let i = 1; i < 16; i++) {
      const b = this.balls[i];
      if (b.pocket < 0 && (b.x - x) ** 2 + (b.y - y) ** 2 < D2 + 0.5) return false;
    }
    return true;
  }

  /** La posición válida más cercana a (x, y) para dejar la blanca. */
  nearestPlace(x: number, y: number, head: boolean): [number, number] {
    let px = Math.max(X_MIN, Math.min(head ? HEAD_X : X_MAX, x));
    let py = Math.max(Y_MIN, Math.min(Y_MAX, y));
    if (this.canPlace(px, py, head)) return [px, py];
    // Espiral hasta encontrar hueco.
    for (let r = 2; r < 140; r += 2) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const cx = Math.max(X_MIN, Math.min(head ? HEAD_X : X_MAX, x + Math.cos(a) * r));
        const cy = Math.max(Y_MIN, Math.min(Y_MAX, y + Math.sin(a) * r));
        if (this.canPlace(cx, cy, head)) return [cx, cy];
      }
    }
    px = head ? HEAD_X : 0;
    py = 0;
    return [px, py];
  }
}

export interface Trace {
  /** Fin de la línea de la blanca: centro de la blanca en el contacto (o en la banda). */
  gx: number;
  gy: number;
  /** Bola que toca primero (0 = ninguna: llega a la banda). */
  hit: number;
  /** Dirección de salida de la bola golpeada, y de la blanca tras el choque (vectores unitarios). */
  ox: number;
  oy: number;
  cx: number;
  cy: number;
}

/** Predicción de la línea de tiro: primer contacto de la blanca con una bola o con la banda. */
export function trace(balls: readonly PBall[], angle: number): Trace {
  const cue = balls[0];
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = Infinity, hit = 0;
  for (let i = 1; i < 16; i++) {
    const b = balls[i];
    if (b.pocket >= 0) continue;
    const fx = b.x - cue.x, fy = b.y - cue.y;
    const t = fx * dx + fy * dy;
    if (t <= 0) continue;
    const perp2 = fx * fx + fy * fy - t * t;
    if (perp2 >= D2) continue;
    const tc = t - Math.sqrt(D2 - perp2);
    if (tc >= 0 && tc < best) {
      best = tc;
      hit = i;
    }
  }
  // Banda: distancia hasta el borde donde puede estar el centro de la blanca.
  const wall = Math.min(
    dx > 0 ? (X_MAX - cue.x) / dx : dx < 0 ? (X_MIN - cue.x) / dx : Infinity,
    dy > 0 ? (Y_MAX - cue.y) / dy : dy < 0 ? (Y_MIN - cue.y) / dy : Infinity,
  );
  if (wall < best) return { gx: cue.x + dx * wall, gy: cue.y + dy * wall, hit: 0, ox: 0, oy: 0, cx: 0, cy: 0 };
  const gx = cue.x + dx * best, gy = cue.y + dy * best;
  const o = balls[hit];
  let nx = o.x - gx, ny = o.y - gy;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  // La blanca sale por la tangente (choque de bolas iguales).
  const dot = dx * nx + dy * ny;
  let cx = dx - nx * dot, cy = dy - ny * dot;
  const cl = Math.hypot(cx, cy);
  if (cl > 1e-3) {
    cx /= cl;
    cy /= cl;
  } else {
    cx = cy = 0;
  }
  return { gx, gy, hit, ox: nx, oy: ny, cx, cy };
}

/** Tronera hacia la que va la bola `id` si la golpea la blanca con ese ángulo (la mejor alineada con su salida). */
export function bestPocket(balls: readonly PBall[], tr: Trace): number {
  if (!tr.hit) return 0;
  const o = balls[tr.hit];
  let best = 0, score = -Infinity;
  POCKETS.forEach(([px, py], p) => {
    const vx = px - o.x, vy = py - o.y;
    const l = Math.hypot(vx, vy) || 1;
    const s = (vx * tr.ox + vy * tr.oy) / l;
    if (s > score) {
      score = s;
      best = p;
    }
  });
  return best;
}
