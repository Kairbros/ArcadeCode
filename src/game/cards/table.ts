// Mesa de «Mazo Loco»: reglas puras (sin DOM y sin red) para poder simular partidas enteras en Node.
// El anfitrión es el único que mueve esta mesa; los invitados solo ven el estado y mandan su jugada.
//
// Reglas: se juega por turnos al color o al número de la carta de arriba. Bloqueo salta al siguiente,
// reversa cambia el sentido (con dos jugadores salta, como manda el reglamento), +2 hace robar dos y
// saltar, y los comodines cambian el color (+4 además hace robar cuatro y saltar). Si te quedas con una
// carta tienes que decir «UNO» o te caen dos de castigo. Gana la ronda quien se queda sin cartas y se
// lleva los puntos de las que les sobran a los demás; la partida es a `targetPoints`.
import { RULES } from "./config";
import {
  buildDeck, canPlay, cardName, cardPoints, colorAfter, colorOf, DRAW2, isWild, rankOf, REVERSE, shuffle, SKIP, WILD4,
} from "./deck";

export type Phase = 0 | 1 | 2; // 0 jugando · 1 fin de ronda · 2 fin de partida

/** Nombre corto del asiento para los avisos de la mesa. */
export const seatTag = (i: number): string => `J${i + 1}`;

/** Acción de un asiento (la misma en local, en bots y por red). */
export interface TableAction {
  /** 1 jugar · 2 robar · 3 pasar · 4 decir UNO. */
  a: number;
  /** Índice de la carta en la mano. */
  c: number;
  /** Color elegido con un comodín (0..3) o -1. */
  k: number;
}

export class CardTable {
  deck: number[] = [];
  discard: number[] = [];
  hands: number[][] = [];
  bots: boolean[] = [];
  online: boolean[] = [];
  score: number[] = [];
  /** Ya ha dicho «UNO» (o no le hace falta: le quedan 2 o más). */
  uno: boolean[] = [];
  /** Segundos que le quedan para decirlo. */
  unoT: number[] = [];
  /** Ya robó en este turno (no puede volver a robar: juega o pasa). */
  drew: boolean[] = [];
  turn = 0;
  dir = 1;
  color = 0;
  phase: Phase = 0;
  /** Ganador de la ronda (o de la partida en la fase 2). -1 = nadie. */
  winner = -1;
  round = 0;
  msg = "";
  /** Asiento del último aviso (-1 = toda la mesa), para el destello del panel. */
  to = -1;
  /** Cuenta atrás de la fase (fin de ronda). */
  wait = 0;
  /** Contador de cambios: el dibujo anima cuando sube. */
  mv = 0;
  /** Nombres de los asientos para los avisos (los pone el anfitrión). */
  names: string[] = [];

  constructor(count: number, bots: boolean[], private rng: () => number = Math.random) {
    this.hands = Array.from({ length: count }, () => []);
    this.bots = Array.from({ length: count }, (_, i) => bots[i] ?? false);
    this.online = Array.from({ length: count }, () => true);
    this.score = Array.from({ length: count }, () => 0);
    this.uno = Array.from({ length: count }, () => true);
    this.unoT = Array.from({ length: count }, () => 0);
    this.drew = Array.from({ length: count }, () => false);
    this.newRound();
  }

  get count(): number {
    return this.hands.length;
  }

  /** Cómo se llama al asiento en los avisos (nombre real si el anfitrión lo puso). */
  private label(seat: number): string {
    return this.names[seat] ?? seatTag(seat);
  }

  get top(): number {
    return this.discard[this.discard.length - 1] ?? -1;
  }

  /** Asiento `k` pasos por delante en el sentido de juego (sin mover el turno). */
  step(k: number): number {
    const n = this.count;
    return (((this.turn + this.dir * k) % n) + n) % n;
  }

  private advance(k: number): void {
    this.turn = this.step(k);
    this.drew.fill(false);
  }

  private say(text: string, to = -1): void {
    this.msg = text;
    this.to = to;
    this.mv++;
  }

  /** Ronda nueva: se baraja, se reparte y la primera carta es siempre un número (sin efectos raros). */
  newRound(): void {
    this.round += 1;
    this.deck = shuffle(buildDeck(), this.rng);
    this.discard = [];
    for (const hand of this.hands) hand.length = 0;
    for (let k = 0; k < RULES.handSize; k++) {
      for (let s = 0; s < this.count; s++) {
        const card = this.deck.pop();
        if (card !== undefined) this.hands[s].push(card);
      }
    }
    let first = -1;
    while (this.deck.length) {
      const card = this.deck[this.deck.length - 1];
      this.deck.pop();
      if (!isWild(card) && rankOf(card) <= 9) {
        first = card;
        break;
      }
      this.deck.unshift(card); // los comodines y las acciones vuelven al fondo
    }
    if (first < 0) first = 0;
    this.discard = [first];
    this.color = colorOf(first);
    this.dir = 1;
    this.turn = (this.round - 1) % this.count;
    this.uno = this.uno.map(() => true);
    this.unoT = this.unoT.map(() => 0);
    this.drew = this.drew.map(() => false);
    this.phase = 0;
    this.winner = -1;
    this.wait = 0;
    this.msg = `RONDA ${this.round} · EMPIEZA ${this.label(this.turn)}`;
    this.to = -1;
    this.mv++;
  }

  /** Reparte `n` cartas (reciclando el descarte si se acaba el mazo). Devuelve las repartidas. */
  private give(seat: number, n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!this.deck.length) this.recycle();
      const card = this.deck.pop();
      if (card === undefined) break;
      this.hands[seat].push(card);
      out.push(card);
    }
    if (this.hands[seat].length !== 1) {
      this.uno[seat] = true;
      this.unoT[seat] = 0;
    }
    return out;
  }

  /** Baraja el descarte dejando arriba la carta visible. */
  private recycle(): boolean {
    if (this.discard.length <= 1) return false;
    const top = this.discard[this.discard.length - 1];
    const rest = this.discard.slice(0, -1);
    this.discard = [top];
    this.deck = shuffle(rest, this.rng);
    return true;
  }

  /** Juega la carta `idx` de la mano del asiento. Devuelve true si la mesa lo acepta. */
  play(seat: number, idx: number, color: number): boolean {
    if (this.phase !== 0 || seat !== this.turn) return false;
    const hand = this.hands[seat];
    const id = hand[idx];
    if (id === undefined) return false;
    if (!canPlay(id, this.top, this.color)) return false;
    const chosen = color >= 0 && color <= 3 ? color : this.color;
    hand.splice(idx, 1);
    this.discard.push(id);
    this.color = colorAfter(id, chosen);
    this.mv++;
    this.say(`${this.label(seat)} JUEGA ${cardName(id)}`, seat);
    const rank = rankOf(id);
    // La víctima se calcula ANTES de mover el turno (es el siguiente en el sentido de juego).
    const victim = this.step(1);
    if (id === WILD4) {
      this.give(victim, 4);
      this.advance(2);
      this.say(`+4 PARA ${this.label(victim)}`, victim);
    } else if (rank === DRAW2) {
      this.give(victim, 2);
      this.advance(2);
      this.say(`+2 PARA ${this.label(victim)}`, victim);
    } else if (rank === SKIP) {
      this.advance(2);
      this.say(`BLOQUEO A ${this.label(victim)}`, victim);
    } else if (rank === REVERSE) {
      if (this.count === 2) {
        // Con dos jugadores la reversa hace de bloqueo.
        this.advance(2);
        this.say("REVERSA: SALTA", victim);
      } else {
        this.dir = -this.dir;
        this.advance(1);
        this.say("REVERSA");
      }
    } else {
      this.advance(1);
    }
    if (hand.length === 1) {
      if (this.bots[seat]) this.uno[seat] = true;
      else {
        this.uno[seat] = false;
        this.unoT[seat] = RULES.unoWindow;
      }
    }
    if (hand.length === 0) this.closeRound(seat);
    return true;
  }

  /** Robar una carta: si se puede jugar sigues en tu turno; si no, pasas. */
  draw(seat: number): boolean {
    if (this.phase !== 0 || seat !== this.turn || this.drew[seat]) return false;
    const got = this.give(seat, 1)[0];
    if (got === undefined) return false;
    this.drew[seat] = true;
    this.mv++;
    if (canPlay(got, this.top, this.color)) this.say("ROBAS: JUÉGALA O PASA", seat);
    else {
      this.say("ROBAS Y PASAS", seat);
      this.advance(1);
    }
    return true;
  }

  /** Pasar después de robar (solo si robó y no juega). */
  pass(seat: number): boolean {
    if (this.phase !== 0 || seat !== this.turn || !this.drew[seat]) return false;
    this.advance(1);
    this.say("PASA", seat);
    return true;
  }

  /** Decir «UNO» a tiempo. */
  sayUno(seat: number): boolean {
    if (this.hands[seat].length !== 1 || this.uno[seat]) return false;
    this.uno[seat] = true;
    this.unoT[seat] = 0;
    this.say(`¡UNO! ${this.label(seat)}`, seat);
    return true;
  }

  /** Cierra la ronda: el ganador cobra los puntos de las cartas que sobran a los demás. */
  private closeRound(seat: number): void {
    let points = 0;
    for (let i = 0; i < this.count; i++) if (i !== seat) points += this.hands[i].reduce((a, id) => a + cardPoints(id), 0);
    this.score[seat] += points;
    this.winner = seat;
    this.phase = this.score[seat] >= RULES.targetPoints ? 2 : 1;
    this.wait = RULES.roundEnd;
    this.uno = this.uno.map(() => true);
    this.unoT = this.unoT.map(() => 0);
    this.say(this.phase === 2 ? `GANA LA PARTIDA ${this.label(seat)} · +${points}` : `GANA ${this.label(seat)} · +${points}`, seat);
  }

  /** Aplica una acción de cualquier asiento (local, bot o invitado). Devuelve true si valía. */
  act(seat: number, action: TableAction): boolean {
    if (this.phase !== 0) return false;
    if (action.a === 0) {
      // El jugador ha pulsado una carta que no liga: se le dice (no cuesta nada).
      this.say("ESA CARTA NO LIGA", seat);
      return false;
    }
    if (action.a === 1) return this.play(seat, action.c, action.k);
    if (action.a === 2) return this.draw(seat);
    if (action.a === 3) return this.pass(seat);
    if (action.a === 4) return this.sayUno(seat);
    return false;
  }

  /** Lo que elige un bot: jugar lo mejor que tenga, robar si no puede y decir UNO siempre. */
  botAction(seat: number): TableAction | null {
    if (this.phase !== 0 || seat !== this.turn || !this.bots[seat]) return null;
    const hand = this.hands[seat];
    const options = hand.map((id, i) => ({ id, i })).filter(({ id }) => canPlay(id, this.top, this.color));
    if (!options.length) return this.drew[seat] ? { a: 3, c: 0, k: -1 } : { a: 2, c: 0, k: -1 };
    const next = this.step(1);
    const aggro = this.hands[next].length <= 2;
    const value = ({ id }: { id: number }): number => {
      const rank = rankOf(id);
      if (id === WILD4) return aggro ? 100 : 6;
      if (rank === DRAW2) return aggro ? 92 : 44;
      if (rank === SKIP) return aggro ? 74 : 38;
      if (rank === REVERSE) return 30;
      if (isWild(id)) return 10;
      return 20 + rank; // primero los números altos: son los que más puntos le costarían
    };
    let best = options[0];
    for (const option of options) if (value(option) > value(best)) best = option;
    return { a: 1, c: best.i, k: isWild(best.id) ? this.bestColor(seat) : -1 };
  }

  /** El color que más tiene el asiento (para elegir con un comodín). */
  private bestColor(seat: number): number {
    const counts = [0, 0, 0, 0];
    for (const id of this.hands[seat]) if (!isWild(id)) counts[colorOf(id)]++;
    let best = 0;
    for (let c = 1; c < 4; c++) if (counts[c] > counts[best]) best = c;
    return best;
  }

  /** Reloj de la mesa: la ventana de «UNO» y la pausa entre rondas. Los bots los mueve el anfitrión. */
  update(dt: number): void {
    if (this.phase !== 0) {
      if (this.phase === 1) {
        this.wait -= dt;
        if (this.wait <= 0) this.newRound();
      }
      return;
    }
    for (let s = 0; s < this.count; s++) {
      if (this.hands[s].length !== 1 || this.uno[s] || this.unoT[s] <= 0) continue;
      this.unoT[s] -= dt;
      if (this.unoT[s] > 0) continue;
      this.unoT[s] = 0;
      this.uno[s] = true;
      this.give(s, 2);
      this.say(`SIN UNO: +2 A ${this.label(s)}`, s);
    }
  }
}
