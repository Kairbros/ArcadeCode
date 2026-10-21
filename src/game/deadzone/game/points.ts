// Economía de puntos: impactos, muertes, reparación de barricadas y ronda superada.
// Clase mínima y pura, con pruebas.

export const POINTS = {
  start: 500,
  hit: 10,
  /** Extra por rematar de un tiro a la cabeza. */
  headshotBonus: 20,
  killMultiplier: 1,
  repair: 15,
  roundBonus: 100,
  /** Puntos por sobrevivir a la ronda completos (se suman al final). */
  perRoundKillBonus: 0,
} as const;

export class Points {
  private value: number = POINTS.start;

  get balance(): number {
    return this.value;
  }

  add(amount: number): number {
    this.value += Math.max(0, Math.round(amount));
    return this.value;
  }

  /** Gasta si hay saldo. Devuelve false y no toca el saldo si no llega. */
  spend(amount: number): boolean {
    const cost = Math.max(0, Math.round(amount));
    if (this.value < cost) return false;
    this.value -= cost;
    return true;
  }

  canAfford(amount: number): boolean {
    return this.value >= Math.max(0, Math.round(amount));
  }

  reset(to: number = POINTS.start): void {
    this.value = to;
  }
}
