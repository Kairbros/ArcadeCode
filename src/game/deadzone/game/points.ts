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
  /** Extra por rematar a un infectado con el cuchillo (arriesgas más). */
  knifeBonus: 60,
} as const;

export class Points {
  private value: number = POINTS.start;
  /** Multiplicador de lo que se gana (2 con el poder de puntos dobles). */
  multiplier = 1;

  get balance(): number {
    return this.value;
  }

  add(amount: number): number {
    this.value += Math.max(0, Math.round(amount * this.multiplier));
    return this.value;
  }

  /** Devuelve puntos tal cual (reembolso: no se multiplican con puntos dobles). */
  refund(amount: number): void {
    this.value += Math.max(0, Math.round(amount));
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
    this.multiplier = 1;
  }
}
