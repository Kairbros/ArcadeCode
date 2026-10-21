// Balance del casino: TODOS los números de la economía, las cinco rondas, la ventanilla, los guardias, los
// borrachos, la cárcel y los mecanismos viven aquí. Código puro (sin DOM ni red): lo leen el anfitrión, el HUD,
// la escena y las pruebas, así que ningún valor se duplica entre interfaz y lógica.
//
// Dificultad = f(ronda, jugadores). Cada fórmula pasa por `clamp` con mínimos y máximos de `LIMITS`.

export const MAX_PLAYERS = 4;
/** Rondas normales. Tras la última queda el punto de extensión del jefe final (ver `BOSS`). */
export const ROUND_COUNT = 5;

/** Monedas con las que empieza cada jugador. */
export const START_COINS = 100;

// --- Economía por número de jugadores (referencia de la ronda 1) ----------------------------------
export interface Tier {
  /** Tope global de depósitos de la ronda (suma de todos). */
  cap: number;
  /** Depósito máximo por jugador en la ronda (la mitad del tope). */
  limit: number;
}
export const TIERS: Record<number, Tier> = {
  1: { cap: 100, limit: 50 },
  2: { cap: 180, limit: 90 },
  3: { cap: 240, limit: 120 },
  4: { cap: 300, limit: 150 },
};

/** Cotas de las fórmulas (nada se sale de aquí, juegue quien juegue). */
export const LIMITS = {
  cap: [50, 900] as const,
  /** Fracción del tope que puede depositar un jugador solo. */
  limitFrac: [0.25, 0.6] as const,
  ret: [0.4, 1.6] as const,
  goalGrowth: [0.05, 0.6] as const,
  guards: [2, 6] as const,
  guardBoost: [0, 1.2] as const,
  sightMul: [0.8, 1.5] as const,
  jailTime: [8, 40] as const,
  drunkChance: [0, 0.9] as const,
  drunkAlive: [0, 4] as const,
  drunkEvery: [8, 60] as const,
  blockTime: [6, 40] as const,
  sleepTime: [5, 30] as const,
  pushSuccess: [0.3, 0.95] as const,
};
export const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, v));

// --- Cárcel -------------------------------------------------------------------------------------
/** Parte de la cartera (monedas actuales) que se pierde al ser capturado, UNA vez por captura. */
export const JAIL_PENALTY = 0.5;

// --- Borrachos ----------------------------------------------------------------------------------
/** «Apartar borracho»: alcance (m), recarga de quien lo intenta (s) y segundos que se queda grogui al despertar. */
export const PUSH_REACH = 2.6;
export const PUSH_CD = 6;
export const DRUNK_GROGGY = 2;
export const DRUNK_WALK = 1.7;
/** Segundos máximos que tarda en llegar a su mesa (si no, se sienta donde esté: nunca se queda atascado). */
export const DRUNK_TRAVEL_MAX = 30;
/** Borrachos que puede haber a la vez como mucho (el tamaño de la reserva). */
export const DRUNK_POOL = 4;

// --- Ventanilla ---------------------------------------------------------------------------------
/** Cantidades del selector (0 = el máximo que permitan saldo, límite y tope). */
export const DEPOSIT_STEPS = [5, 10, 25, 50, 0] as const;
/** Alcance (m) para usar la ventanilla y el resto de mecanismos. */
export const USE_REACH = 2.2;

// --- Mecanismos: tipos --------------------------------------------------------------------------
export interface MechDef {
  /** Palanca de la reja: la ventanilla solo está abierta este tiempo (s) tras tirar de ella (0 = no hay reja). */
  leverOpen: number;
  /** Timbre señuelo: los guardias de la planta baja acuden este tiempo (s) y recarga (0 = no hay timbre). */
  lure: number;
  lureCd: number;
  /** Alarma: cada `alarmEvery` s se bloquea la ventanilla `alarmTime` s salvo que se teclee la secuencia (`seqLen` botones; 0 = sin alarma). */
  seqLen: number;
  alarmEvery: number;
  alarmTime: number;
  /** Con vigilancia: depositar a la vista de un guardia lo delata (hay que distraerlos con el timbre). */
  watched: boolean;
}

export interface RoundDef {
  id: number;
  name: string;
  objective: string;
  /** Duración de la ronda (s). */
  time: number;
  /** Multiplicador del tope de la tabla `TIERS`. */
  capMul: number;
  limitFrac: number;
  /** Retorno: multiplicador sobre la GANANCIA de las mesas: ganancia = apuesta real × (premio − 1) × ret. Baja con la ronda aunque el tope suba. */
  ret: number;
  /** Crecimiento exigido a la cartera + depósitos del equipo respecto al inicio de la ronda. */
  goalGrowth: number;
  /** Guardias de servicio (alternan planta baja y entrepiso: 4 = dos por piso). */
  guards: number;
  /** Velocidad extra al perseguir (m/s), insistencia (× tiempo), alcance de la vista (×), pausa de ronda (s). */
  guardBoost: number;
  chaseMul: number;
  sightMul: number;
  patrolPause: number;
  /** Condena (s). */
  jailTime: number;
  /** Fracción del despiste de los crupieres (1 = normal; menos = se distraen menos rato). */
  focus: number;
  drunk: {
    /** Cada `every` s se tira un dado con probabilidad `chance` para que llegue uno. */
    chance: number;
    every: number;
    maxAlive: number;
    /** Tiempo (s) que bloquea la mesa: entre min y max. */
    block: [number, number];
    /** Sueño (s) tras «apartarlo» y probabilidad de lograrlo. */
    sleep: number;
    push: number;
    /** Probabilidad de volver a una mesa al despertar. */
    rejoin: number;
  };
  mech: MechDef;
}

const NO_MECH: MechDef = { leverOpen: 0, lure: 0, lureCd: 0, seqLen: 0, alarmEvery: 0, alarmTime: 0, watched: false };

/** Las cinco rondas. Mecanismos y presión crecen poco a poco; el retorno (ret) baja aunque el tope suba. */
export const ROUNDS: RoundDef[] = [
  {
    id: 1, name: "INTRODUCCIÓN", objective: "Deposita, apuesta en las mesas y haz crecer el banco",
    time: 150, capMul: 1, limitFrac: 0.5, ret: 1.4, goalGrowth: 0.2,
    guards: 4, guardBoost: 0, chaseMul: 1, sightMul: 1, patrolPause: 1.8, jailTime: 14, focus: 1,
    drunk: { chance: 0.3, every: 30, maxAlive: 1, block: [9, 12], sleep: 12, push: 0.9, rejoin: 0.2 },
    mech: { ...NO_MECH },
  },
  {
    id: 2, name: "MÁS PRESIÓN", objective: "Tira de la palanca para abrir la reja de la ventanilla",
    time: 150, capMul: 1.35, limitFrac: 0.5, ret: 1.2, goalGrowth: 0.22,
    guards: 4, guardBoost: 0.25, chaseMul: 1.1, sightMul: 1, patrolPause: 1.6, jailTime: 16, focus: 0.9,
    drunk: { chance: 0.4, every: 26, maxAlive: 1, block: [10, 14], sleep: 11, push: 0.85, rejoin: 0.3 },
    mech: { ...NO_MECH, leverOpen: 55 },
  },
  {
    id: 3, name: "CON VIGILANCIA", objective: "Distrae a los guardias con el timbre mientras tu equipo deposita",
    time: 155, capMul: 1.7, limitFrac: 0.5, ret: 1.05, goalGrowth: 0.24,
    guards: 5, guardBoost: 0.4, chaseMul: 1.2, sightMul: 1.1, patrolPause: 1.4, jailTime: 18, focus: 0.8,
    drunk: { chance: 0.5, every: 22, maxAlive: 2, block: [11, 16], sleep: 10, push: 0.8, rejoin: 0.4 },
    mech: { ...NO_MECH, leverOpen: 42, lure: 12, lureCd: 24, watched: true },
  },
  {
    id: 4, name: "ALARMA", objective: "Apaga la alarma tecleando la secuencia de botones del entrepiso",
    time: 165, capMul: 2.1, limitFrac: 0.5, ret: 0.95, goalGrowth: 0.26,
    guards: 6, guardBoost: 0.55, chaseMul: 1.3, sightMul: 1.2, patrolPause: 1.2, jailTime: 20, focus: 0.7,
    drunk: { chance: 0.6, every: 19, maxAlive: 2, block: [12, 18], sleep: 9, push: 0.72, rejoin: 0.5 },
    mech: { ...NO_MECH, leverOpen: 32, lure: 10, lureCd: 28, watched: true, seqLen: 3, alarmEvery: 45, alarmTime: 22 },
  },
  {
    id: 5, name: "ANTESALA DEL JEFE", objective: "Coordina palanca, timbre y alarma: es el último ensayo antes del jefe",
    time: 180, capMul: 2.6, limitFrac: 0.5, ret: 0.85, goalGrowth: 0.28,
    guards: 6, guardBoost: 0.7, chaseMul: 1.4, sightMul: 1.3, patrolPause: 1, jailTime: 22, focus: 0.6,
    drunk: { chance: 0.7, every: 16, maxAlive: 3, block: [13, 20], sleep: 8, push: 0.65, rejoin: 0.6 },
    mech: { ...NO_MECH, leverOpen: 24, lure: 8, lureCd: 30, watched: true, seqLen: 4, alarmEvery: 34, alarmTime: 22 },
  },
];

// --- Punto de extensión del jefe final ----------------------------------------------------------
/**
 * Tras superar la ronda 5 el anfitrión entra en «sala del jefe» (`CasinoHost.bossGate`). La fase 2 solo tiene
 * que colgar su lógica de `CasinoHost.onBossReady` y usar `bossEntry()` para el estado de partida heredado
 * (jugadores, cartera, depósito): este módulo no inventa ningún jefe.
 */
export const BOSS = { afterRound: ROUND_COUNT } as const;

// --- Parámetros resueltos (ronda + jugadores) ---------------------------------------------------
export interface RoundParams extends RoundDef {
  players: number;
  cap: number;
  limit: number;
}

export const playerCount = (n: number) => Math.max(1, Math.min(MAX_PLAYERS, Math.round(n) || 1));
export const roundDef = (round: number) => ROUNDS[Math.max(1, Math.min(ROUND_COUNT, Math.round(round))) - 1];

/** Dificultad de la ronda `round` (1..5) con `n` jugadores: nada se sale de `LIMITS`. */
export function params(round: number, n: number): RoundParams {
  const players = playerCount(n);
  const def = roundDef(round);
  const tier = TIERS[players];
  // Más jugadores = más borrachos y (desde la ronda 2, salvo en solitario/dúo) un guardia más, para no regalar la partida.
  const extra = players - 1;
  const cap = clamp(Math.round((tier.cap * def.capMul) / 10) * 10, LIMITS.cap);
  const limit = Math.round(cap * clamp(def.limitFrac, LIMITS.limitFrac));
  const guards = clamp(def.guards + (players >= 3 && def.id >= 2 ? 1 : 0), LIMITS.guards);
  return {
    ...def,
    players,
    cap,
    limit,
    ret: clamp(def.ret, LIMITS.ret),
    goalGrowth: clamp(def.goalGrowth + 0.015 * extra, LIMITS.goalGrowth),
    guards,
    guardBoost: clamp(def.guardBoost, LIMITS.guardBoost),
    sightMul: clamp(def.sightMul, LIMITS.sightMul),
    jailTime: clamp(def.jailTime, LIMITS.jailTime),
    drunk: {
      ...def.drunk,
      chance: clamp(def.drunk.chance * (1 + 0.12 * extra), LIMITS.drunkChance),
      every: clamp(def.drunk.every, LIMITS.drunkEvery),
      maxAlive: clamp(def.drunk.maxAlive + (players >= 3 ? 1 : 0), LIMITS.drunkAlive),
      block: [clamp(def.drunk.block[0], LIMITS.blockTime), clamp(def.drunk.block[1], LIMITS.blockTime)],
      sleep: clamp(def.drunk.sleep, LIMITS.sleepTime),
      push: clamp(def.drunk.push, LIMITS.pushSuccess),
    },
  };
}

/** Objetivo de la ronda: cartera + depósitos del equipo al acabar ≥ lo que había al empezar × (1 + crecimiento). */
export function goalFor(p: RoundParams, startTotal: number): number {
  return Math.ceil(startTotal * (1 + p.goalGrowth));
}

/** Pérdida de la cárcel: la mitad (JAIL_PENALTY) de la cartera, redondeada hacia abajo. */
export function jailLoss(wallet: number): number {
  return Math.floor(Math.max(0, wallet) * JAIL_PENALTY);
}
