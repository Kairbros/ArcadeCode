// Poderes que sueltan los zombis (como los del modo Zombies de Call of Duty): munición máxima, Katabum (muere todo),
// muerte instantánea, puntos dobles, munición infinita y carpintero. Lógica pura (sin Three.js): cuándo cae uno,
// cuál, cuánto dura en el suelo, quién lo recoge y cuánto queda de cada efecto. Es de todo el equipo.

export type PowerKind = "maxAmmo" | "nuke" | "instaKill" | "doublePoints" | "infiniteAmmo" | "carpenter" | "bonusPoints" | "fireSale" | "deathMachine";

export interface PowerDef {
  kind: PowerKind;
  name: string;
  /** Segundos que dura el efecto (0 = instantáneo). */
  duration: number;
  /** Color del brillo (0xRRGGBB) y peso al sortear cuál cae. */
  color: number;
  weight: number;
}

export const POWERS: Record<PowerKind, PowerDef> = {
  maxAmmo: { kind: "maxAmmo", name: "MUNICIÓN MÁXIMA", duration: 0, color: 0x5ce28c, weight: 22 },
  nuke: { kind: "nuke", name: "¡KATABUM!", duration: 0, color: 0xff7a24, weight: 12 },
  instaKill: { kind: "instaKill", name: "MUERTE INSTANTÁNEA", duration: 25, color: 0xff4a4a, weight: 18 },
  doublePoints: { kind: "doublePoints", name: "PUNTOS DOBLES", duration: 30, color: 0xffd75e, weight: 20 },
  infiniteAmmo: { kind: "infiniteAmmo", name: "MUNICIÓN INFINITA", duration: 25, color: 0x5adcff, weight: 16 },
  carpenter: { kind: "carpenter", name: "CARPINTERO", duration: 0, color: 0xc89a5a, weight: 12 },
  bonusPoints: { kind: "bonusPoints", name: "PUNTOS DE BONIFICACIÓN", duration: 0, color: 0xffa8ff, weight: 14 },
  fireSale: { kind: "fireSale", name: "LIQUIDACIÓN", duration: 30, color: 0xff9a3a, weight: 8 },
  deathMachine: { kind: "deathMachine", name: "AMETRALLADORA", duration: 25, color: 0xb85aff, weight: 8 },
};

export const POWER_KINDS = Object.keys(POWERS) as PowerKind[];

export const POWER_TUNING = {
  /** Probabilidad de que una baja suelte un poder, y mínimo de bajas entre dos poderes. */
  dropChance: 0.06,
  minKillsBetween: 6,
  /** Si todavía no ha caído ninguno, cae sí o sí con esta baja. */
  firstGuaranteed: 8,
  /** Segundos que dura en el suelo (parpadea los últimos `blinkTime`) y radio para recogerlo (m). */
  lifetime: 28,
  blinkTime: 7,
  pickupRadius: 1.5,
  /** Puntos que recibe cada jugador con el Katabum y con el Carpintero. */
  nukePoints: 400,
  carpenterPoints: 200,
  /** Puntos de bonificación: mínimo, máximo y múltiplo. */
  bonusMin: 100,
  bonusMax: 500,
  bonusStep: 50,
  /** Precio de la caja misteriosa durante la liquidación. */
  fireSalePrice: 10,
} as const;

export interface PowerDrop {
  id: number;
  kind: PowerKind;
  x: number;
  z: number;
  /** Segundos que lleva en el suelo. */
  age: number;
}

/** Efectos con duración: segundos que quedan de cada uno. */
export interface Effects {
  instaKill: number;
  doublePoints: number;
  infiniteAmmo: number;
  fireSale: number;
}

export type TimedKind = keyof Effects;
const TIMED: TimedKind[] = ["instaKill", "doublePoints", "infiniteAmmo", "fireSale"];

export class PowerUps {
  drops: PowerDrop[] = [];
  readonly effects: Effects = { instaKill: 0, doublePoints: 0, infiniteAmmo: 0, fireSale: 0 };
  private nextId = 1;
  private killsSince = 0;
  private dropped = false;
  private kills = 0;

  reset() {
    this.drops = [];
    this.effects.instaKill = this.effects.doublePoints = this.effects.infiniteAmmo = this.effects.fireSale = 0;
    this.nextId = 1;
    this.killsSince = 0;
    this.dropped = false;
    this.kills = 0;
  }

  /** Cuenta una baja y decide si suelta un poder (`rng` 0..1 inyectable para las pruebas). */
  onKill(x: number, z: number, rng: () => number = Math.random): PowerDrop | null {
    this.kills++;
    this.killsSince++;
    const t = POWER_TUNING;
    if (this.killsSince < t.minKillsBetween) return null;
    const forced = !this.dropped && this.kills >= t.firstGuaranteed;
    if (!forced && rng() >= t.dropChance) return null;
    return this.drop(pickPower(rng), x, z);
  }

  drop(kind: PowerKind, x: number, z: number): PowerDrop {
    const d: PowerDrop = { id: this.nextId++, kind, x, z, age: 0 };
    this.drops.push(d);
    this.killsSince = 0;
    this.dropped = true;
    return d;
  }

  /** Avanza el tiempo: envejecen los poderes del suelo y se agotan los efectos. Devuelve los efectos que acaban de terminar. */
  update(dt: number): TimedKind[] {
    for (const d of this.drops) d.age += dt;
    this.drops = this.drops.filter((d) => d.age < POWER_TUNING.lifetime);
    const ended: TimedKind[] = [];
    for (const k of TIMED) {
      if (this.effects[k] <= 0) continue;
      this.effects[k] = Math.max(0, this.effects[k] - dt);
      if (this.effects[k] === 0) ended.push(k);
    }
    return ended;
  }

  /** ¿Algún jugador en pie está al alcance de un poder? Lo quita del suelo y devuelve cuál y quién lo coge. */
  pickup(players: { x: number; z: number; alive: boolean }[]): { drop: PowerDrop; who: number } | null {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      let best = -1, bestD: number = POWER_TUNING.pickupRadius;
      players.forEach((p, who) => {
        if (!p.alive) return;
        const dist = Math.hypot(p.x - d.x, p.z - d.z);
        if (dist < bestD) {
          bestD = dist;
          best = who;
        }
      });
      if (best >= 0) {
        this.drops.splice(i, 1);
        return { drop: d, who: best };
      }
    }
    return null;
  }

  /** Activa un efecto con duración (si ya estaba, se renueva). */
  activate(kind: TimedKind) {
    this.effects[kind] = POWERS[kind].duration;
  }

  get instaKill(): boolean {
    return this.effects.instaKill > 0;
  }

  get doublePoints(): boolean {
    return this.effects.doublePoints > 0;
  }

  get fireSale(): boolean {
    return this.effects.fireSale > 0;
  }

  get infiniteAmmo(): boolean {
    return this.effects.infiniteAmmo > 0;
  }
}

/** Sorteo ponderado del poder que cae. */
export function pickPower(rng: () => number = Math.random): PowerKind {
  const total = POWER_KINDS.reduce((s, k) => s + POWERS[k].weight, 0);
  let r = rng() * total;
  for (const k of POWER_KINDS) {
    r -= POWERS[k].weight;
    if (r <= 0) return k;
  }
  return POWER_KINDS[POWER_KINDS.length - 1];
}
