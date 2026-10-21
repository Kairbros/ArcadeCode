// Gestor de rondas independiente: cuántos zombis, cada cuánto y cuántos a la vez.
// Es lógica pura (sin Three.js) para poder probar la progresión.

export interface RoundTuning {
  /** Enemigos de la ronda 1. */
  baseCount: number;
  /** Enemigos extra por ronda lineal. */
  perRound: number;
  /** Crecimiento exponencial suave (exponente de la ronda). */
  growthPow: number;
  /** Zombis vivos a la vez. */
  maxAliveBase: number;
  maxAlivePerRound: number;
  maxAliveCap: number;
  /** Segundos entre apariciones. */
  intervalStart: number;
  intervalStep: number;
  intervalMin: number;
  /** Descanso entre rondas. */
  intermission: number;
  /** Vida extra al terminar la ronda (pequeña recompensa por aguantar). */
  healOnRoundEnd: number;
}

export const ROUNDS: RoundTuning = {
  baseCount: 6,
  perRound: 4,
  growthPow: 1.55,
  maxAliveBase: 10,
  maxAlivePerRound: 1.5,
  maxAliveCap: 24,
  intervalStart: 2.1,
  intervalStep: 0.11,
  intervalMin: 0.45,
  intermission: 6,
  healOnRoundEnd: 12,
};

export function roundTotal(round: number, tune: RoundTuning = ROUNDS): number {
  const r = Math.max(1, Math.floor(round));
  return Math.floor(tune.baseCount + tune.perRound * (r - 1) + Math.pow(r, tune.growthPow));
}

export function spawnInterval(round: number, tune: RoundTuning = ROUNDS): number {
  const r = Math.max(1, Math.floor(round));
  return Math.max(tune.intervalMin, tune.intervalStart - tune.intervalStep * (r - 1));
}

export function maxAlive(round: number, tune: RoundTuning = ROUNDS): number {
  const r = Math.max(1, Math.floor(round));
  return Math.min(tune.maxAliveCap, Math.round(tune.maxAliveBase + tune.maxAlivePerRound * (r - 1)));
}

export type RoundState = "waiting" | "intermission" | "spawning";

export type RoundEvent =
  | { type: "roundStart"; round: number; total: number }
  | { type: "spawn" }
  | { type: "roundEnd"; round: number };

export class RoundManager {
  round = 0;
  state: RoundState = "waiting";
  /** Enemigos que faltan por aparecer. */
  toSpawn = 0;
  /** Enemigos vivos (los zombis ya no vuelven a contarse al morir). */
  alive = 0;
  timer = 0;
  /** Total de la ronda en curso (para el HUD). */
  total = 0;
  /** Muertes de la ronda en curso. */
  killed = 0;
  readonly tune: RoundTuning;

  constructor(tune: RoundTuning = ROUNDS) {
    this.tune = tune;
  }

  start(): RoundEvent[] {
    this.round = 0;
    this.state = "waiting";
    this.alive = 0;
    this.killed = 0;
    return this.beginRound();
  }

  private beginRound(): RoundEvent[] {
    this.round += 1;
    this.total = roundTotal(this.round, this.tune);
    this.toSpawn = this.total;
    this.alive = 0;
    this.killed = 0;
    this.state = "spawning";
    // Un respiro al empezar la ronda.
    this.timer = this.round === 1 ? 2.5 : 1.4;
    return [{ type: "roundStart", round: this.round, total: this.total }];
  }

  onZombieDead(): void {
    this.alive = Math.max(0, this.alive - 1);
    this.killed += 1;
  }

  /** Avanza el reloj. Devuelve los eventos del fotograma (aparición, fin de ronda...). */
  update(dt: number): RoundEvent[] {
    const events: RoundEvent[] = [];
    if (this.state === "waiting") return events;

    if (this.state === "intermission") {
      this.timer -= dt;
      if (this.timer <= 0) events.push(...this.beginRound());
      return events;
    }

    this.timer -= dt;
    if (this.state === "spawning") {
      const cap = maxAlive(this.round, this.tune);
      if (this.timer <= 0 && this.toSpawn > 0 && this.alive < cap) {
        this.toSpawn -= 1;
        this.alive += 1;
        events.push({ type: "spawn" });
        this.timer = spawnInterval(this.round, this.tune);
      }
      // La ronda acaba cuando han aparecido todos y no queda ninguno vivo.
      if (this.toSpawn === 0 && this.alive === 0) {
        this.state = "intermission";
        this.timer = this.tune.intermission;
        events.push({ type: "roundEnd", round: this.round });
      }
      return events;
    }

    return events;
  }

  /** Enemigos que quedan en la ronda (por aparecer + vivos). */
  get remaining(): number {
    return this.toSpawn + this.alive;
  }
}

/** Dificultad de las rondas para `n` jugadores (1..4): más zombis y más a la vez, con un tope mayor. */
export function tuneFor(n: number): RoundTuning {
  const players = Math.max(1, Math.min(4, Math.round(n) || 1));
  const total = 1 + 0.65 * (players - 1);
  const alive = 1 + 0.45 * (players - 1);
  return {
    ...ROUNDS,
    baseCount: Math.round(ROUNDS.baseCount * total),
    perRound: Math.round(ROUNDS.perRound * total),
    maxAliveBase: Math.round(ROUNDS.maxAliveBase * alive),
    maxAlivePerRound: ROUNDS.maxAlivePerRound * alive,
    maxAliveCap: Math.round(ROUNDS.maxAliveCap * alive),
  };
}
