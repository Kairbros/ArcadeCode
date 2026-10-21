// Variantes de enemigo y escalado de dificultad. Datos puros, probados con Vitest.
// Para añadir un tipo nuevo basta con otra entrada en ZOMBIES y un peso en kindWeights.

export type ZombieKind = "walker" | "runner" | "brute" | "hound";

export interface ZombieDef {
  kind: ZombieKind;
  name: string;
  hp: number;
  /** m/s */
  speed: number;
  damage: number;
  /** Distancia a la que golpea (m). */
  attackRange: number;
  /** Segundos entre golpes. */
  attackCooldown: number;
  /** Distancia a la que detecta al jugador (m). */
  detectRange: number;
  /** Puntos al matarlo. */
  points: number;
  radius: number;
  height: number;
  /** Colores del modelo procedural. */
  body: number;
  skin: number;
  shirt: number;
}

export const ZOMBIES = {
  walker: {
    kind: "walker",
    name: "CAMINANTE",
    hp: 110,
    speed: 1.15,
    damage: 22,
    attackRange: 1.45,
    attackCooldown: 1.15,
    detectRange: 40,
    points: 40,
    radius: 0.36,
    height: 1.78,
    body: 0x4b5a3f,
    skin: 0x8a9b6a,
    shirt: 0x3b4236,
  },
  runner: {
    kind: "runner",
    name: "CORREDOR",
    hp: 80,
    speed: 3.1,
    damage: 16,
    attackRange: 1.35,
    attackCooldown: 0.85,
    detectRange: 44,
    points: 60,
    radius: 0.32,
    height: 1.68,
    body: 0x6b3b3b,
    skin: 0xb08a72,
    shirt: 0x53262a,
  },
  brute: {
    kind: "brute",
    name: "BRUTO",
    hp: 520,
    speed: 0.95,
    damage: 52,
    attackRange: 1.85,
    attackCooldown: 1.6,
    detectRange: 38,
    points: 200,
    radius: 0.52,
    height: 2.15,
    body: 0x39424a,
    skin: 0x6f7a72,
    shirt: 0x2b3238,
  },
} as Record<ZombieKind, ZombieDef>;

/** Perro infernal: muy rápido y frágil; solo sale en las rondas de perros (`isDogRound` en rounds.ts). */
ZOMBIES.hound = {
  kind: "hound",
  name: "PERRO INFERNAL",
  hp: 90,
  speed: 4.4,
  damage: 24,
  attackRange: 1.3,
  attackCooldown: 0.7,
  detectRange: 70,
  points: 60,
  radius: 0.36,
  height: 0.95,
  body: 0x2a1e1a,
  skin: 0x3a2820,
  shirt: 0x2a1e1a,
};

export const ENEMY_SCALING = {
  /** +9 % de vida por ronda. */
  hpPerRound: 0.09,
  /** +0.05 m/s por ronda, con tope multiplicador. */
  speedPerRound: 0.05,
  speedMultMax: 1.45,
  /** +2 % de daño por ronda, con tope. */
  damagePerRound: 0.02,
  damageMultMax: 1.7,
} as const;

export function scaledHp(kind: ZombieKind, round: number): number {
  const def = ZOMBIES[kind];
  return Math.round(def.hp * (1 + ENEMY_SCALING.hpPerRound * (round - 1)));
}

export function scaledSpeed(kind: ZombieKind, round: number): number {
  const def = ZOMBIES[kind];
  const mult = Math.min(ENEMY_SCALING.speedMultMax, 1 + ENEMY_SCALING.speedPerRound * (round - 1));
  return def.speed * mult;
}

export function scaledDamage(kind: ZombieKind, round: number): number {
  const def = ZOMBIES[kind];
  const mult = Math.min(ENEMY_SCALING.damageMultMax, 1 + ENEMY_SCALING.damagePerRound * (round - 1));
  return Math.round(def.damage * mult);
}

/** Reparto de variantes por ronda: los corredores aparecen desde la ronda 3 y los brutos desde la 7. */
export function kindWeights(round: number): { kind: ZombieKind; weight: number }[] {
  if (round < 3) return [{ kind: "walker", weight: 1 }];
  if (round < 7) {
    return [
      { kind: "walker", weight: 0.72 },
      { kind: "runner", weight: 0.28 },
    ];
  }
  const brute = Math.min(0.22, 0.06 + (round - 7) * 0.025);
  const runner = Math.min(0.42, 0.26 + (round - 7) * 0.02);
  return [
    { kind: "walker", weight: Math.max(0.25, 1 - brute - runner) },
    { kind: "runner", weight: runner },
    { kind: "brute", weight: brute },
  ];
}

/** Elige variante con un `rng` (0..1) inyectable para pruebas. */
export function pickKind(round: number, rng: () => number = Math.random): ZombieKind {
  const weights = kindWeights(round);
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  let r = rng() * total;
  for (const w of weights) {
    r -= w.weight;
    if (r <= 0) return w.kind;
  }
  return weights[weights.length - 1].kind;
}
