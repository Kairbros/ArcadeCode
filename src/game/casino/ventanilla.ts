// La ventanilla: donde se depositan monedas para apostar en las mesas. Código puro (sin DOM ni red): el
// anfitrión es el único que lo toca, así que aunque varios jugadores depositen a la vez, cada operación se
// valida y aplica una detrás de otra contra el mismo estado (nunca se pasa del tope ni del saldo).
//
// Dinero de cada jugador: CARTERA (`wallet`, la que roban, la que pierde el 50 % en la cárcel y con la que se
// compra) y DEPÓSITO (`stake`, la que está en la ventanilla: es la única con la que se apuesta en las mesas
// y está a salvo de la cárcel). Al acabar la ronda, el depósito vuelve a la cartera.
import { DEPOSIT_STEPS, MAX_PLAYERS } from "./balance";

/** Estado de la ventanilla: abierta, cerrada temporalmente (reja) o bloqueada por un evento (alarma). */
export const WIN_OPEN = 0;
export const WIN_CLOSED = 1;
export const WIN_BLOCKED = 2;
export type WinGate = typeof WIN_OPEN | typeof WIN_CLOSED | typeof WIN_BLOCKED;

export type DepositFail = "duplicada" | "cerrada" | "bloqueada" | "importe" | "saldo" | "limite" | "tope" | "vigilada" | "preso";
export type DepositResult = { ok: true; amount: number } | { ok: false; reason: DepositFail };

export const FAIL_TEXT: Record<DepositFail, string> = {
  duplicada: "OPERACIÓN REPETIDA",
  cerrada: "VENTANILLA CERRADA",
  bloqueada: "VENTANILLA BLOQUEADA",
  importe: "IMPORTE NO VÁLIDO",
  saldo: "NO TIENES TANTO SALDO",
  limite: "SUPERAS TU LÍMITE DE DEPÓSITO",
  tope: "TOPE GLOBAL ALCANZADO",
  vigilada: "UN GUARDIA TE VE",
  preso: "ESTÁS PRESO",
};

/** Lo que puede depositar uno: min(saldo, lo que le queda de su límite, lo que queda del tope global). */
export function roomFor(wallet: number, limit: number, deposited: number, cap: number, total: number): number {
  return Math.max(0, Math.min(Math.floor(wallet), limit - deposited, cap - total));
}

/** Cantidad de la opción `k` del selector (0 = el máximo permitido `room`). */
export function pickAmount(k: number, room: number): number {
  const step = DEPOSIT_STEPS[Math.max(0, Math.min(DEPOSIT_STEPS.length - 1, k))];
  return step === 0 ? room : step;
}

export class Ventanilla {
  /** Tope global y límite individual de la ronda en curso. */
  cap = 0;
  limit = 0;
  /** Depositado en la ronda por cada jugador (no baja nunca: cuenta para el tope) y depósito vivo para apostar. */
  readonly deposited = Array<number>(MAX_PLAYERS).fill(0);
  readonly stake = Array<number>(MAX_PLAYERS).fill(0);
  /** Última operación aceptada de cada jugador (se ignoran repeticiones y reordenaciones de red). */
  private readonly lastOp = Array<number>(MAX_PLAYERS).fill(0);

  /** Empieza una ronda: nuevos topes y contadores a cero (el depósito vivo se liquida antes con `settle`). */
  open(cap: number, limit: number) {
    this.cap = cap;
    this.limit = limit;
    this.deposited.fill(0);
    this.lastOp.fill(0);
  }

  /** Total depositado entre todos en esta ronda. */
  total(): number {
    return this.deposited.reduce((a, b) => a + b, 0);
  }

  /** Lo que todavía puede depositar el jugador `i`: min(saldo, su límite, tope global). 0 si no puede. */
  room(i: number, wallet: number): number {
    return roomFor(wallet, this.limit, this.deposited[i], this.cap, this.total());
  }

  /** Cantidad que representa la opción `k` del selector (0 = el máximo permitido). */
  pick(k: number, i: number, wallet: number): number {
    return pickAmount(k, this.room(i, wallet));
  }

  /**
   * Deposita `amount` de la cartera `wallets[i]`. Valida TODO antes de tocar nada: si falla, no cambia nada.
   * `op` es el número de operación del jugador (crece siempre): una repetida se rechaza sin cobrar dos veces.
   */
  deposit(i: number, amount: number, wallets: number[], gate: WinGate, opts: { op?: number; watched?: boolean; jailed?: boolean } = {}): DepositResult {
    if (i < 0 || i >= MAX_PLAYERS) return { ok: false, reason: "importe" };
    if (opts.op !== undefined) {
      if (opts.op <= this.lastOp[i]) return { ok: false, reason: "duplicada" };
    }
    if (opts.jailed) return { ok: false, reason: "preso" };
    if (gate === WIN_CLOSED) return { ok: false, reason: "cerrada" };
    if (gate === WIN_BLOCKED) return { ok: false, reason: "bloqueada" };
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 1) return { ok: false, reason: "importe" };
    if (opts.watched) return { ok: false, reason: "vigilada" };
    if (amount > wallets[i]) return { ok: false, reason: "saldo" };
    if (this.deposited[i] + amount > this.limit) return { ok: false, reason: "limite" };
    if (this.total() + amount > this.cap) return { ok: false, reason: "tope" };
    if (opts.op !== undefined) this.lastOp[i] = opts.op;
    wallets[i] -= amount;
    this.deposited[i] += amount;
    this.stake[i] += amount;
    return { ok: true, amount };
  }

  /** Fin de la ronda: lo que quede de depósito (apostado o no) vuelve a la cartera. Devuelve lo devuelto por jugador. */
  settle(wallets: number[]): number[] {
    const back = this.stake.slice();
    for (let i = 0; i < MAX_PLAYERS; i++) {
      wallets[i] += this.stake[i];
      this.stake[i] = 0;
    }
    return back;
  }

  /** Vacía todo (nueva partida). */
  reset() {
    this.deposited.fill(0);
    this.stake.fill(0);
    this.lastOp.fill(0);
  }
}
