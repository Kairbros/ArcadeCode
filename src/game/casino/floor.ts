// Simulación de Casino de deudas (anfitrión o local): jugadores andando por la sala, máquinas, banco común
// y el día con su cuota. El anfitrión decide todas las tiradas; los invitados solo mandan su teclado.
import { Rng } from "../core/rng";
import {
  CH, COIN, COIN_PAY, COIN_WIN, COLLECT_TIME, CW, DAY_TIME, DICE, DICE_PAY, FEET_H, FEET_W, FLOOR_Y, INTRO_TIME,
  MACHINES, ONE_CHERRY, PAID_TIME, SHOW_TIME, SLOT, SPEED, START_BANK, SYMBOL_WEIGHT, THREE_PAY, TWO_CHERRIES, TWO_SAME, quotaOf,
  type MachineKind,
} from "./config";
import type { CasinoSource } from "./input";

export type SeatKind = "local" | "remote" | "empty";

/** Fases: cartel del día, jugando, el prestamista cobra, cuota pagada, sin dinero (fin). */
export const PH_INTRO = 0;
export const PH_DAY = 1;
export const PH_COLLECT = 2;
export const PH_PAID = 3;
export const PH_OVER = 4;

export interface Gambler {
  index: number;
  kind: SeatKind;
  x: number; // centro de los pies
  y: number;
  face: number; // -1 izquierda, 1 derecha
  moving: boolean;
  remote: { seq: number; dx: number; dy: number; uses: number };
  pendingUses: number;
}

export interface Machine {
  kind: MachineKind;
  x: number; // esquina superior izquierda
  y: number;
  /** Quién juega (-1 libre). */
  user: number;
  /** Segundos desde que empezó la jugada. */
  t: number;
  /** Resultado decidido al empezar: rodillos, dados o moneda. */
  res: number[];
  pay: number;
}

export interface CasinoMsg {
  t: "c";
  x: number;
  y: number;
  u: number;
  s: number;
}

/** Distribución de la sala: tragaperras contra la pared, mesas en medio. */
export const LAYOUT: [MachineKind, number, number][] = [
  [SLOT, 14, FLOOR_Y + 2], [SLOT, 34, FLOOR_Y + 2], [SLOT, 54, FLOOR_Y + 2], [SLOT, 74, FLOOR_Y + 2],
  [SLOT, 230, FLOOR_Y + 2], [SLOT, 250, FLOOR_Y + 2], [SLOT, 270, FLOOR_Y + 2], [SLOT, 290, FLOOR_Y + 2],
  [COIN, 60, 104], [COIN, 234, 104],
  [DICE, 143, 96],
];
const SPAWNS: [number, number][] = [[136, 170], [184, 170], [112, 180], [208, 180]];

/** Máquina delante de la que está alguien en (x, y) (la más cercana), o -1. También la usa el render. */
export function machineAt(machines: readonly { kind: MachineKind; x: number; y: number }[], x: number, y: number): number {
  let best = -1, bestD = Infinity;
  machines.forEach((m, i) => {
    const s = MACHINES[m.kind];
    // Zona de uso: una franja justo debajo de la máquina.
    if (x < m.x - 4 || x > m.x + s.w + 4 || y < m.y + s.h || y > m.y + s.h + 12) return;
    const d = Math.abs(x - (m.x + s.w / 2)) + (y - m.y - s.h);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

export class Casino {
  phase = PH_INTRO;
  timer = INTRO_TIME;
  day = 1;
  quota = quotaOf(1);
  bank = START_BANK;
  /** Lo ganado en premios en toda la partida (para el resumen). */
  won = 0;
  paidTotal = 0;
  readonly gamblers: Gambler[];
  readonly machines: Machine[];
  private rng: Rng;

  constructor(seats: SeatKind[], private local: CasinoSource, seed = (Math.random() * 2 ** 32) >>> 0) {
    this.rng = new Rng(seed);
    this.gamblers = seats.map((kind, index) => ({
      index, kind, x: SPAWNS[index][0], y: SPAWNS[index][1], face: 1, moving: false,
      remote: { seq: 0, dx: 0, dy: 0, uses: 0 }, pendingUses: 0,
    }));
    this.machines = LAYOUT.map(([kind, x, y]) => ({ kind, x, y, user: -1, t: 0, res: [], pay: 0 }));
  }

  get over() {
    return this.phase === PH_OVER;
  }

  applyRemote(index: number, msg: CasinoMsg) {
    const g = this.gamblers[index];
    if (!g || g.kind !== "remote" || msg?.t !== "c") return;
    const nums = [msg.x, msg.y, msg.u, msg.s].map(Number);
    if (!nums.every(Number.isFinite) || nums[3] <= g.remote.seq) return;
    const r = g.remote;
    r.seq = nums[3];
    r.dx = Math.max(-1, Math.min(1, Math.round(nums[0])));
    r.dy = Math.max(-1, Math.min(1, Math.round(nums[1])));
    // El contador solo crece: las pulsaciones que falten se aplican aquí.
    if (nums[2] > r.uses) g.pendingUses += Math.min(2, nums[2] - r.uses);
    r.uses = Math.max(r.uses, nums[2]);
  }

  /** Un invitado se ha ido: su jugador desaparece (lo que estuviera jugando se cobra igual). */
  leave(index: number) {
    const g = this.gamblers[index];
    if (g) g.kind = "empty";
  }

  machineAt(x: number, y: number): number {
    return machineAt(this.machines, x, y);
  }

  /** Puede jugar en la máquina: fase de juego, libre y con dinero para la apuesta. */
  canUse(i: number): boolean {
    const m = this.machines[i];
    return !!m && this.phase === PH_DAY && m.user < 0 && this.bank >= MACHINES[m.kind].bet;
  }

  update(dt: number) {
    this.local.poll();
    for (const g of this.gamblers) {
      if (g.kind === "empty") continue;
      const src = g.kind === "local" ? this.local : g.remote;
      let dx = src.dx, dy = src.dy;
      if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
      this.move(g, dx * SPEED * dt, dy * SPEED * dt);
      g.moving = dx !== 0 || dy !== 0;
      if (dx) g.face = Math.sign(dx);
      let uses = g.pendingUses;
      g.pendingUses = 0;
      if (g.kind === "local") while (this.local.takeUse()) uses++;
      if (uses > 0) this.use(g);
    }
    for (const m of this.machines) {
      if (m.user < 0) continue;
      const before = m.t;
      m.t += dt;
      const dur = MACHINES[m.kind].dur;
      if (before < dur && m.t >= dur) {
        this.bank += m.pay;
        this.won += m.pay;
      }
      if (m.t >= dur + SHOW_TIME) m.user = -1;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.phase === PH_INTRO) {
      this.phase = PH_DAY;
      this.timer = DAY_TIME;
    } else if (this.phase === PH_DAY) {
      this.phase = PH_COLLECT;
      this.timer = COLLECT_TIME;
    } else if (this.phase === PH_COLLECT) {
      // Las jugadas en marcha ya han terminado (duran menos que COLLECT_TIME).
      if (this.bank >= this.quota) {
        this.bank -= this.quota;
        this.paidTotal += this.quota;
        this.phase = PH_PAID;
        this.timer = PAID_TIME;
      } else {
        this.phase = PH_OVER;
        this.timer = Infinity;
      }
    } else if (this.phase === PH_PAID) {
      this.day++;
      this.quota = quotaOf(this.day);
      this.phase = PH_INTRO;
      this.timer = INTRO_TIME;
    }
  }

  private use(g: Gambler) {
    const i = this.machineAt(g.x, g.y);
    if (i < 0 || !this.canUse(i)) return;
    const m = this.machines[i];
    const bet = MACHINES[m.kind].bet;
    this.bank -= bet;
    m.user = g.index;
    m.t = 0;
    [m.res, m.pay] = this.play(m.kind, bet);
  }

  /** Tirada de una máquina: resultado y premio (0 si no gana). */
  play(kind: MachineKind, bet: number): [number[], number] {
    if (kind === SLOT) {
      const total = SYMBOL_WEIGHT.reduce((a, b) => a + b, 0);
      const reel = () => {
        let r = this.rng.next() * total;
        for (let s = 0; s < SYMBOL_WEIGHT.length; s++) if ((r -= SYMBOL_WEIGHT[s]) < 0) return s;
        return 0;
      };
      const res = [reel(), reel(), reel()];
      const cherries = res.filter((s) => s === 0).length;
      const pair = res[0] === res[1] || res[1] === res[2] || res[0] === res[2];
      const pay = res[0] === res[1] && res[1] === res[2] ? THREE_PAY[res[0]] * bet
        : cherries === 2 ? TWO_CHERRIES * bet : pair ? TWO_SAME * bet : cherries === 1 ? ONE_CHERRY * bet : 0;
      return [res, pay];
    }
    if (kind === COIN) {
      const win = this.rng.next() < COIN_WIN;
      return [[win ? 1 : 0], win ? COIN_PAY : 0];
    }
    if (kind === DICE) {
      const a = 1 + Math.floor(this.rng.next() * 6), b = 1 + Math.floor(this.rng.next() * 6);
      return [[a, b], (DICE_PAY[a + b] ?? 0) * bet];
    }
    return [[], 0];
  }

  /** Mueve con colisión contra paredes y máquinas, eje por eje. */
  private move(g: Gambler, dx: number, dy: number) {
    const blocked = (x: number, y: number) => {
      if (x - FEET_W / 2 < 2 || x + FEET_W / 2 > CW - 2 || y - FEET_H < FLOOR_Y + 2 || y > CH - 2) return true;
      return this.machines.some((m) => {
        const s = MACHINES[m.kind];
        // Se choca con la base de la máquina (la parte de arriba se dibuja por detrás: se puede pasar "por detrás").
        return x + FEET_W / 2 > m.x && x - FEET_W / 2 < m.x + s.w && y > m.y + s.h - 6 && y - FEET_H < m.y + s.h;
      });
    };
    if (dx && !blocked(g.x + dx, g.y)) g.x += dx;
    if (dy && !blocked(g.x, g.y + dy)) g.y += dy;
  }
}
