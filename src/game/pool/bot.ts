// Jugador de IA de Billar: busca la bola y la tronera con mejor tiro (bola fantasma, línea libre y
// ángulo de corte), calcula la potencia y apunta girando el taco como una persona antes de tirar.
import { BALL_R, BOT_AIM, BOT_THINK, HEAD_X, MAX_SPEED, MIN_SPEED, POCKETS, RACK_X, ROLL_DECEL, TH, TW } from "./config";
import type { Match } from "./match";

interface Plan {
  angle: number;
  power: number;
  call: number;
  score: number;
}

const R2 = BALL_R * 2;
const MARGIN = 1.2;

/** Distancia del punto (px, py) al segmento a→b. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/** Potencia (0..1) para que la bola objetivo recorra `dObj` tras el choque, con la blanca a `dCue` y corte `cos`. */
function powerFor(dCue: number, dObj: number, cos: number): number {
  const vObj = Math.sqrt(2 * ROLL_DECEL * (dObj + 14)) * 1.18;
  const vHit = vObj / Math.max(0.3, cos * 0.97);
  const v0 = Math.sqrt(vHit * vHit + 2 * ROLL_DECEL * dCue) * 1.1;
  return Math.max(0.14, Math.min(1, (v0 - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)));
}

/** Juega el tiro en una copia de la mesa: ¿entra la bola `id` en la tronera `pocket` sin meter la blanca? */
function works(m: Match, angle: number, power: number, id: number, pocket: number): boolean {
  const t = m.table.clone();
  t.shoot(angle, power, 0, 0);
  for (let i = 0; i < 60 * 9 && t.moving; i++) t.update(1 / 30);
  const hit = t.log.pocketed.find((p) => p.id === id);
  return !!hit && hit.pocket === pocket && t.balls[0].pocket < 0 && t.log.first === id;
}

/**
 * Mejor tiro desde (cx, cy), o null si ninguno es limpio. Con `sim`, los mejores candidatos se prueban en una
 * copia de la mesa con varias potencias (como quien ensaya mentalmente) y solo vale uno que entre.
 */
export function bestShot(m: Match, cx: number, cy: number, sim = false): Plan | null {
  const balls = m.table.balls;
  let best: Plan | null = null;
  const all: { plan: Plan; id: number; p: number }[] = [];
  for (let id = 1; id < 16; id++) {
    const o = balls[id];
    if (o.pocket >= 0 || !m.legalFirst(id)) continue;
    for (let p = 0; p < 6; p++) {
      const [px, py] = POCKETS[p];
      let ux = px - o.x, uy = py - o.y;
      const dObj = Math.hypot(ux, uy);
      ux /= dObj;
      uy /= dObj;
      // Ángulo de entrada a la tronera: no se mete de refilón.
      const ix = -px, iy = -py, il = Math.hypot(ix, iy);
      if ((ux * ix + uy * iy) / il > -0.28) continue;
      const gx = o.x - ux * R2, gy = o.y - uy * R2;
      if (Math.abs(gx) > TW / 2 - BALL_R || Math.abs(gy) > TH / 2 - BALL_R) continue;
      const wx = gx - cx, wy = gy - cy;
      const dCue = Math.hypot(wx, wy);
      if (dCue < 1) continue;
      const cos = (wx * ux + wy * uy) / dCue;
      if (cos < 0.14) continue;
      let blocked = false;
      for (let k = 1; k < 16 && !blocked; k++) {
        const b = balls[k];
        if (k === id || b.pocket >= 0) continue;
        if (segDist(b.x, b.y, cx, cy, gx, gy) < R2 + MARGIN || segDist(b.x, b.y, o.x, o.y, px, py) < R2 + MARGIN) blocked = true;
      }
      if (blocked) continue;
      const score = cos * 2 - (dCue + dObj) / 260 + (id === 8 ? 0.2 : 0);
      const plan = { angle: Math.atan2(wy, wx), power: powerFor(dCue, dObj, cos), call: id === 8 ? p : -1, score };
      if (!best || score > best.score) best = plan;
      if (sim) all.push({ plan, id, p });
    }
  }
  if (!sim) return best;
  all.sort((a, c) => c.plan.score - a.plan.score);
  for (const { plan, id, p } of all.slice(0, 5)) {
    for (const k of [1, 0.85, 1.15, 0.7, 1.35]) {
      const power = Math.max(0.12, Math.min(1, plan.power * k));
      if (works(m, plan.angle, power, id, p)) return { ...plan, power };
    }
  }
  return best ? { ...best, score: best.score - 1 } : null;
}

export class PoolBot {
  private t = 0;
  private plan: Plan | null = null;
  private from = 0;

  update(dt: number, m: Match) {
    this.t += dt;
    if (m.placing) {
      if (this.t < 0.8) return;
      const [x, y] = m.brk ? [HEAD_X, (Math.random() - 0.5) * 30] : this.pickSpot(m);
      m.place(x, y);
      this.t = 0;
      this.plan = null;
      return;
    }
    if (!this.plan) {
      if (this.t < BOT_THINK) return;
      this.plan = this.choose(m);
      this.from = m.aim.angle;
      this.t = 0;
      return;
    }
    const k = Math.min(1, this.t / BOT_AIM);
    const e = k * k * (3 - 2 * k);
    const p = this.plan;
    m.aim.angle = lerpAngle(this.from, p.angle, e);
    m.aim.power = 0.3 + (p.power - 0.3) * e;
    m.aim.call = p.call;
    if (this.t >= BOT_AIM + 0.35) {
      m.aim.angle = p.angle;
      m.aim.power = p.power;
      m.fire();
      this.plan = null;
      this.t = 0;
    }
  }

  private choose(m: Match): Plan {
    const cue = m.table.balls[0];
    if (m.brk) return { angle: Math.atan2(-cue.y, RACK_X - cue.x), power: 1, call: -1, score: 0 };
    const shot = bestShot(m, cue.x, cue.y, true);
    // Un jugador humano falla un poco.
    if (shot) return { ...shot, angle: shot.angle + (Math.random() - 0.5) * 0.012 };
    // Sin tiro limpio: golpea suave a la bola legal más cercana.
    let near = 0, nd = Infinity;
    for (let id = 1; id < 16; id++) {
      const b = m.table.balls[id];
      const d = b.pocket < 0 && m.legalFirst(id) ? Math.hypot(b.x - cue.x, b.y - cue.y) : Infinity;
      if (d < nd) {
        nd = d;
        near = id;
      }
    }
    const b = m.table.balls[near || 1];
    return { angle: Math.atan2(b.y - cue.y, b.x - cue.x), power: 0.42, call: -1, score: -1 };
  }

  /** Sitio para la blanca en mano: el que da mejor tiro entre varios al azar. */
  private pickSpot(m: Match): [number, number] {
    let best: [number, number] | null = null, bs = -Infinity;
    for (let i = 0; i < 36; i++) {
      const x = (Math.random() - 0.5) * (TW - 30), y = (Math.random() - 0.5) * (TH - 20);
      if (!m.table.canPlace(x, y, false)) continue;
      const s = bestShot(m, x, y)?.score ?? -5;
      if (s > bs) {
        bs = s;
        best = [x, y];
      }
    }
    return best ?? m.table.nearestPlace(HEAD_X, 0, false);
  }
}
