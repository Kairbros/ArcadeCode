// Reglas del casino: juegos, casillas de apuesta, multiplicadores y el turno de cada mesa.
// Código puro (sin DOM ni red): se puede simular en Node y lo usan igual el anfitrión y los invitados.
//
// Cada mesa lleva su propia ronda, en paralelo: se apuesta (PH_BET) → se resuelve y se anima (PH_SPIN) →
// se enseña el pago (PH_PAY) → vuelta a apostar. Solo cuentan los jugadores sentados en ella. El
// anfitrión es el único que tira los dados: manda el resultado y todos dibujan la misma animación.
import { BET_STEPS, BET_TIME, MAX_SEATS, PAY_TIME, PH_BET, PH_PAY, PH_SPIN, SPIN_TIME } from "./config";

export type GameKind = "ruleta" | "plinko" | "slots" | "moneda" | "dados" | "patos";

/** Juegos en el orden de las mesas. */
export const GAMES_LIST: GameKind[] = ["ruleta", "plinko", "slots", "moneda", "dados", "patos"];

export const GAME_TITLE: Record<GameKind, string> = {
  ruleta: "RULETA",
  plinko: "PLINKO",
  slots: "TRAGAPERRAS",
  moneda: "CARA O CRUZ",
  dados: "DADOS",
  patos: "CARRERA DE PATOS",
};

export const GAME_DESC: Record<GameKind, string> = {
  ruleta: "Color, par o docena",
  plinko: "La bola cae y multiplica",
  slots: "Tres rodillos, una línea",
  moneda: "Cara o cruz al aire",
  dados: "Dos dados, menos/siete/más",
  patos: "Cuatro patos, apuesta al que gana",
};

export interface Spot {
  label: string;
  /** Multiplicador de la casilla (0 = no se usa, apuesta única). */
  mult: number;
}

/** Lo que paga el pato ganador (cuatro patos, uno gana). */
export const PATO_MULT = 3.5;

/** Casillas de apuesta de cada juego. */
export const SPOTS: Record<GameKind, Spot[]> = {
  ruleta: [
    { label: "ROJO", mult: 2 },
    { label: "NEGRO", mult: 2 },
    { label: "PAR", mult: 2 },
    { label: "IMPAR", mult: 2 },
    { label: "1-4", mult: 3 },
    { label: "5-8", mult: 3 },
    { label: "9-12", mult: 3 },
  ],
  plinko: [{ label: "SOLTAR", mult: 0 }],
  slots: [{ label: "GIRAR", mult: 0 }],
  moneda: [
    { label: "CARA", mult: 2 },
    { label: "CRUZ", mult: 2 },
  ],
  dados: [
    { label: "MENOS DE 7", mult: 2 },
    { label: "SIETE", mult: 5 },
    { label: "MÁS DE 7", mult: 2 },
  ],
  patos: [
    { label: "PATO 1", mult: PATO_MULT },
    { label: "PATO 2", mult: PATO_MULT },
    { label: "PATO 3", mult: PATO_MULT },
    { label: "PATO 4", mult: PATO_MULT },
  ],
};

/** Números rojos de la ruleta (1–12); el resto son negros. Así el color no coincide con par/impar. */
export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12]);

/** Multiplicadores de las bocas de Plinko (9 bocas, de izquierda a derecha). */
export const PLINKO_MULT = [10, 3, 1.5, 0.5, 0.2, 0.5, 1.5, 3, 10];

/** Símbolos de la tragaperras y lo que paga cada trío. */
export const SLOT_SYMBOLS = ["CEREZA", "LIMÓN", "CAMPANA", "DIAMANTE", "SIETE", "ESTRELLA"];
export const SLOT_TRIPLE = [6, 8, 12, 18, 40, 14];
export const SLOT_PAIR = 1.2;

/** Resultado de una ronda: datos para dibujar, texto y multiplicador de cada casilla. */
export interface Outcome {
  /** Datos crudos para la animación (sector, caras, símbolos, boca...). */
  data: number[];
  /** Texto corto del resultado («ROJO 7», «×3», «CRUZ», «4 + 5 = 9»). */
  label: string;
  /** Multiplicador que se aplica a cada casilla esta ronda (0 = pierde). */
  mults: number[];
}

const zero = (n: number) => Array<number>(n).fill(0);

/** Resuelve una ronda de `game` con el generador `rng` (0..1). */
export function resolve(game: GameKind, rng: () => number): Outcome {
  if (game === "ruleta") {
    // 13 sectores: el 0 verde y el 1–12 (rojos y negros). El 0 se lo lleva todo.
    const n = Math.floor(rng() * 13);
    const mults = zero(SPOTS.ruleta.length);
    if (n === 0) return { data: [0], label: "VERDE 0", mults };
    const red = RED_NUMBERS.has(n);
    mults[red ? 0 : 1] = 2; // color
    mults[n % 2 === 0 ? 2 : 3] = 2; // par / impar
    mults[4 + Math.floor((n - 1) / 4)] = 3; // docena
    return { data: [n], label: `${red ? "ROJO" : "NEGRO"} ${n}`, mults };
  }
  if (game === "plinko") {
    // Ocho rebotes: la boca es el número de veces que va a la derecha (distribución binomial).
    let right = 0;
    for (let i = 0; i < 8; i++) if (rng() < 0.5) right++;
    const m = PLINKO_MULT[right];
    return { data: [right], label: `×${m}`, mults: [m] };
  }
  if (game === "slots") {
    const s = [0, 1, 2].map(() => Math.floor(rng() * SLOT_SYMBOLS.length));
    let mult = 0;
    if (s[0] === s[1] && s[1] === s[2]) mult = SLOT_TRIPLE[s[0]];
    else if (s[0] === s[1] || s[1] === s[2] || s[0] === s[2]) mult = SLOT_PAIR;
    const label = mult === 0 ? "NADA" : mult === SLOT_PAIR ? "PAREJA ×1,2" : `TRÍO ×${mult}`;
    return { data: s, label, mults: [mult] };
  }
  if (game === "patos") {
    // Gana uno de los cuatro; los otros números son semillas para que la carrera tenga adelantamientos.
    const w = Math.floor(rng() * 4);
    const mults = zero(SPOTS.patos.length);
    mults[w] = PATO_MULT;
    const seeds = [0, 1, 2, 3].map(() => Math.floor(rng() * 100));
    return { data: [w, ...seeds], label: `GANA EL PATO ${w + 1}`, mults };
  }
  if (game === "moneda") {
    const c = rng() < 0.5 ? 0 : 1; // 0 = cara, 1 = cruz
    return { data: [c], label: c === 0 ? "CARA" : "CRUZ", mults: [c === 0 ? 2 : 0, c === 1 ? 2 : 0] };
  }
  const a = 1 + Math.floor(rng() * 6);
  const b = 1 + Math.floor(rng() * 6);
  const sum = a + b;
  const mults = zero(SPOTS.dados.length);
  if (sum < 7) mults[0] = 2;
  else if (sum === 7) mults[1] = 5;
  else mults[2] = 2;
  return { data: [a, b], label: `${a} + ${b} = ${sum}`, mults };
}

/** Apuesta de un asiento (un asiento por jugador). */
export interface SeatBet {
  spot: number;
  amount: number;
  /** Ya ha dicho que está listo (Enter). La mesa espera a todos o al reloj. */
  locked: boolean;
}

/** Estado de una mesa tal como viaja por la red. */
export interface TableSnap {
  /** Fase: PH_BET / PH_SPIN / PH_PAY. */
  ph: number;
  /** Segundos dentro de la fase. */
  pt: number;
  /** Ronda. */
  rd: number;
  /** Por jugador: [casilla, fichas, listo]. */
  b: number[][];
  /** Resultado: datos para la animación. */
  rs: number[];
  /** Multiplicadores por casilla. */
  ml: number[];
  /** Diferencia de fichas de cada jugador en la última ronda. */
  dl: number[];
  /** Texto del resultado. */
  lb: string;
  /** Quién está sentado (1/0). */
  pr: number[];
}

/** Estado que viaja por la red (lo arma el anfitrión). */
export interface CasinoSnap {
  g: "casino";
  base: number;
  seq: number;
  /** Por jugador: X, Z, giro, mesa en la que está sentado (-1 = de pie), altura del salto y piso (0/1). */
  pl: number[][];
  /** Fichas de cada jugador. */
  ch: number[];
  /** Las cinco mesas (null = sin nadie sentado). */
  tb: (TableSnap | null)[];
  /** Última acción aceptada de cada jugador (para los acuses). */
  ak: number[];
  /** Jugadores conectados (1/0). */
  on: number[];
  /**
   * Pelea de cada jugador: `[aturdido (s), agarrado por (-1), golpe (s), empuje x, empuje z]`,
   * o `null` si está limpio (la mayoría del tiempo).
   */
  cg: (number[] | null)[];
  /** Monedas en el suelo: `[x, z, segundos que quedan, piso]`. Se recogen al pasar por encima. */
  co: number[][];
  /** Segundos de condena en la cárcel del techo por jugador (0 = libre). */
  ja: number[];
  /** Turno: `[número, segundos que quedan, cuota, fichas de todos, récord de turnos superados]`. */
  qs?: number[];
  /** Mesa caliente: `[índice, segundos que le quedan]`. */
  ht?: number[];
  /** Trucos de cada jugador: `[objeto en la mano, segundos de imán, dado cargado 1/0]`. */
  it?: number[][];
  /** Cáscaras de banana en el suelo: `[x, z, piso]`. */
  bn?: number[][];
  /** Cartel de fin de turno: `[1 cumplida / 2 fallada, segundos que quedan]` o vacío. */
  ev?: number[];
  /** NPC (crupieres en el orden de las mesas y el guardia al final): `[x, z, giro, estado, objetivo, en el suelo 1/0]`. */
  np?: number[][];
  /** Fuga: progreso (0..1) de cada jugador forzando la caja de la jaula (0 = no). */
  jb?: number[];
  /** Segundos que le quedan escondido en el baño a cada jugador (0 = fuera). */
  hd?: number[];
  /** Zancadilla: pie fuera (1/0) de cada jugador. */
  tr?: number[];
  /** Bóveda: `[progreso 0..1, segundos de recarga, jugador en el panel 1, en el panel 2]`. */
  vt?: number[];
  /** Disfraz de cada jugador: `[disfraz (DISGUISES + 1; 0 = ninguno), segundos que le quedan]`. */
  dg?: number[][];
  /** Emote en curso de cada jugador (EMOTES + 1; 0 = ninguno). */
  em?: number[];
  /** Basura de LITTER: 1 si no está en el suelo (alguien la lleva o se está reponiendo). */
  lt?: number[];
  /** Basura que lleva cada jugador en la mano (índice en LITTER o -1). */
  cy?: number[];
  /** Depósito de cada jugador en la ventanilla (con lo que se apuesta en las mesas). */
  sk?: number[];
  /**
   * Ventanilla: `[estado (0 abierta / 1 cerrada / 2 bloqueada), tope, depositado entre todos, límite individual,
   * retorno ×100, ronda, vigilada 1/0]`.
   */
  vn?: number[];
  /** Depositado por cada jugador en la ronda. */
  dp?: number[];
  /** Mecanismos: `[reja (s), timbre (s), recarga del timbre (s), alarma (s), progreso, ...orden de la secuencia]`. */
  mc?: number[];
  /** Mesas bloqueadas por un borracho (1/0), en el orden de las mesas. */
  bk?: number[];
  /** Borrachos: `[x, z, giro, estado, mesa, piso, segundos del estado]`. */
  dk?: number[][];
  /** Recarga (s) de «apartar borracho» de cada jugador. */
  pc?: number[];
  /** Sucesos recientes `[número, tipo (EVT_*), jugador, valor]` para que cada pantalla avise a quien toque. */
  ne?: number[][];
  /** Sala del jefe: 1 cuando se ha superado la ronda 5 (punto de extensión de la fase 2). */
  bs?: number;
}

/** Una mesa: apuestas, fases y resultados. El anfitrión tiene cinco; los invitados solo ven el estado. */
export class Table {
  phase = PH_BET;
  /** Tiempo dentro de la fase. */
  t = 0;
  round = 1;
  out: Outcome = { data: [], label: "", mults: [] };
  /** Diferencia de fichas de la última ronda (0 mientras no se ha resuelto). */
  delta: number[];
  readonly bets: SeatBet[];
  /** Qué jugadores están sentados en esta mesa. */
  readonly present: boolean[];
  /** Multiplicador extra de los premios (la mesa caliente paga más). */
  boost = 1;
  /** Un borracho la tiene tomada: no corre el reloj de apuestas, no se puede apostar ni dar a «listo». */
  blocked = false;

  constructor(readonly game: GameKind) {
    this.bets = Array.from({ length: MAX_SEATS }, () => ({ spot: 0, amount: 1, locked: false }));
    this.delta = Array.from({ length: MAX_SEATS }, () => 0);
    this.present = Array.from({ length: MAX_SEATS }, () => false);
  }

  spotCount(): number {
    return SPOTS[this.game].length;
  }

  /** Alguien se sienta (o se levanta). */
  sit(player: number, on: boolean) {
    if (player < 0 || player >= MAX_SEATS) return;
    this.present[player] = on;
    this.bets[player].locked = false;
    if (on) this.bets[player].spot = 0;
  }

  players(): number[] {
    return this.present.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  }

  setSpot(i: number, spot: number) {
    const b = this.bets[i];
    if (!b || !this.present[i] || this.phase !== PH_BET || b.locked || this.blocked) return;
    const n = this.spotCount();
    b.spot = ((Math.floor(spot) % n) + n) % n;
  }

  /** Apuesta una cantidad concreta (se recorta a lo que haya en el bolsillo). */
  setAmount(i: number, amount: number, chips: number) {
    const b = this.bets[i];
    if (!b || !this.present[i] || this.phase !== PH_BET || b.locked || this.blocked) return;
    b.amount = Math.max(1, Math.min(Math.max(1, chips), Math.floor(amount)));
  }

  /** Sube o baja la apuesta por la lista de cantidades. */
  bump(i: number, dir: number, chips: number) {
    const b = this.bets[i];
    if (!b || !this.present[i] || this.phase !== PH_BET || b.locked || this.blocked) return;
    const at = BET_STEPS.indexOf(b.amount);
    const next = at < 0 ? BET_STEPS[0] : BET_STEPS[Math.max(0, Math.min(BET_STEPS.length - 1, at + dir))];
    this.setAmount(i, next, chips);
  }

  /** Enter: me doy por listo (o me lo pienso otra vez). */
  toggleLock(i: number, chips: number) {
    const b = this.bets[i];
    if (!b || !this.present[i] || this.phase !== PH_BET || this.blocked) return;
    if (chips < 1) return;
    if (!b.locked && (b.amount < 1 || b.amount > chips)) this.setAmount(i, chips, chips);
    b.locked = !b.locked;
  }

  allLocked(): boolean {
    const p = this.players();
    return p.length > 0 && p.every((i) => this.bets[i].locked);
  }

  /**
   * Avanza la ronda. `chips` es el depósito de cada jugador (se modifica al pagar), `luck` marca quién
   * lleva el dado cargado (se gasta en su próxima apuesta: si gana, cobra el doble) y `ret` es el retorno de
   * la ronda (multiplica las ganancias: ver `spin`).
   */
  update(dt: number, chips: number[], luck?: number[], ret = 1) {
    // Mesa vacía: no corre el reloj (la ronda espera a que alguien se siente).
    if (this.phase === PH_BET && this.players().length === 0) {
      this.t = 0;
      return;
    }
    // Con un borracho encima, las apuestas se paran: el reloj de la ronda espera a que se vaya.
    if (this.phase === PH_BET && this.blocked) return;
    this.t += dt;
    if (this.phase === PH_BET) {
      if (this.allLocked() || this.t >= BET_TIME) this.spin(chips, luck, ret);
    } else if (this.phase === PH_SPIN) {
      if (this.t >= SPIN_TIME) {
        this.phase = PH_PAY;
        this.t = 0;
      }
    } else if (this.t >= PAY_TIME) {
      this.nextRound();
    }
  }

  /**
   * Un borracho se desploma sobre la mesa: quien tenía una apuesta ya confirmada (comprometida) en la fase de
   * apuestas la pierde (sale de su depósito, UNA sola vez: la apuesta queda desmarcada). Las monedas sin
   * comprometer no se tocan. Devuelve lo perdido por jugador.
   */
  interrupt(chips: number[]): number[] {
    const lost = Array<number>(MAX_SEATS).fill(0);
    this.blocked = true;
    if (this.phase !== PH_BET) return lost;
    for (let i = 0; i < MAX_SEATS; i++) {
      const b = this.bets[i];
      if (!this.present[i] || !b.locked) continue;
      lost[i] = Math.max(0, Math.min(b.amount, chips[i]));
      chips[i] -= lost[i];
      b.locked = false;
    }
    return lost;
  }

  /** La mesa vuelve a estar disponible. */
  release() {
    this.blocked = false;
  }

  /** Fin de ronda: ninguna apuesta se queda confirmada (el depósito se devuelve a la cartera). */
  cancelBets() {
    for (const b of this.bets) b.locked = false;
  }

  /**
   * Resuelve la ronda: resultado, pagos y fichas. Los multiplicadores de las casillas son lo que devuelve la mesa
   * por cada ficha apostada (×2 = la ficha y otra más). La ganancia (lo que supera a la ficha) se multiplica por el
   * retorno de la ronda `ret`; si la mesa devuelve menos de lo apostado, se pierde la diferencia.
   */
  private spin(chips: number[], luck?: number[], ret = 1) {
    this.out = resolve(this.game, Math.random);
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!this.present[i]) {
        this.delta[i] = 0;
        continue;
      }
      const b = this.bets[i];
      const amount = Math.max(0, Math.min(b.amount, chips[i]));
      const mult = this.out.mults[b.spot] ?? 0;
      // Fichas enteras: los multiplicadores con decimales se redondean al pagar.
      const gross = mult * this.boost;
      let net = gross >= 1 ? Math.round(amount * (gross - 1) * ret) : -Math.round(amount * (1 - gross));
      if (luck && luck[i] > 0) {
        if (net > 0) net *= 2;
        luck[i] = 0;
      }
      this.delta[i] = Math.max(-amount, net);
      chips[i] += this.delta[i];
      b.locked = true;
    }
    this.phase = PH_SPIN;
    this.t = 0;
  }

  private nextRound() {
    this.round++;
    this.phase = PH_BET;
    this.t = 0;
    for (let i = 0; i < MAX_SEATS; i++) {
      this.delta[i] = 0;
      this.bets[i].locked = false;
      this.bets[i].spot = 0;
    }
  }

  /** Segundos que quedan de la fase actual. */
  left(): number {
    if (this.phase === PH_BET) return Math.max(0, BET_TIME - this.t);
    if (this.phase === PH_SPIN) return Math.max(0, SPIN_TIME - this.t);
    return Math.max(0, PAY_TIME - this.t);
  }

  snap(): TableSnap {
    return {
      ph: this.phase,
      pt: Math.round(this.t * 100) / 100,
      rd: this.round,
      b: this.bets.map((b) => [b.spot, b.amount, b.locked ? 1 : 0]),
      rs: [...this.out.data],
      ml: [...this.out.mults],
      dl: [...this.delta],
      lb: this.out.label,
      pr: this.present.map((p) => (p ? 1 : 0)),
    };
  }
}
