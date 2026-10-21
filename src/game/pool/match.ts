// Reglas de la bola 8 y árbitro: turnos, grupos (lisas/rayadas), faltas, bola en mano y final con la 8.
// El anfitrión (o la partida local) ejecuta la Match completa; los invitados solo dibujan su estado.
import { PLAYER_NAMES } from "../core/config";
import { HEAD_X, SHOT_TIME } from "./config";
import { PoolBot } from "./bot";
import { Table, bestPocket, groupLeft, groupOf, trace } from "./table";

export type SeatKind = "local" | "remote" | "ai";

/** Entrada de quien tira (teclado y ratón, o un invitado): la leen el anfitrión y los invitados. */
export interface PoolControl {
  /** Se llama cada frame con la posición de la blanca; actualiza ángulo, cursor, etc. */
  poll(cueX: number, cueY: number, placing: boolean): void;
  readonly angle: number;
  readonly power: number;
  /** Efecto: top > 0 sigue, < 0 retrocede; side a los lados (-1..1). */
  readonly top: number;
  readonly side: number;
  /** Tronera elegida para la 8 (-1 = automática). */
  readonly call: number;
  /** Dónde quiere dejar la blanca (mundo), o null. */
  readonly cursor: [number, number] | null;
  takeFire(): boolean;
  takePlace(): boolean;
  /** Tras tirar: efecto a cero. */
  clearSpin(): void;
}

export interface Aim {
  angle: number;
  power: number;
  top: number;
  side: number;
  call: number;
}

/** Mensaje que un invitado envía al anfitrión (≤ 300 caracteres en JSON). */
export interface PoolMsg {
  t: "p";
  s: number;
  a: number;
  w: number;
  x: number;
  y: number;
  c: number;
  /** Turno al que se refiere (el anfitrión descarta mensajes de turnos anteriores). */
  u: number;
  /** Disparos y bolas colocadas en este turno (el anfitrión actúa al verlos crecer). */
  f: number;
  k: number;
  px: number;
  py: number;
}

interface ShotInfo {
  turn: number;
  call: number;
  cleared: boolean;
  brk: boolean;
}

const SETTLE = 0.5; // pausa tras parar las bolas, para ver caer la última

export function seatName(kind: SeatKind, index: number): string {
  return kind === "ai" ? "CPU" : PLAYER_NAMES[index];
}

export class Match {
  table: Table;
  /** 0 = turno (apuntando o colocando), 1 = bolas rodando, 2 = partida terminada. */
  phase = 0;
  turn = 0;
  /** Grupo de cada equipo (asientos pares contra impares): 0 lisas, 1 rayadas, -1 mesa abierta. */
  groups = [-1, -1];
  placing = true;
  /** Solo se puede colocar detrás de la línea de cabeza (saque). */
  head = true;
  brk = true;
  aim: Aim = { angle: 0, power: 0.45, top: 0, side: 0, call: -1 };
  timer = SHOT_TIME;
  winner = -1;
  msg = "";
  msgT = 0;
  wins = [0, 0];
  /** Cuenta tiros: los clientes ven el cambio y animan el golpe. */
  shots = 0;
  /** Cuenta turnos (y repeticiones de saque) para validar los mensajes de los invitados. */
  turnNo = 0;
  breaker = 0;
  /** Quién tira la próxima vez que le toque a cada equipo (en dobles los compañeros se turnan). */
  nextOf = [0, 1];
  private shot: ShotInfo | null = null;
  private settle = 0;
  private bot = new PoolBot();
  private lastS = new Map<number, number>();
  private lastF = 0;
  private lastK = 0;

  constructor(public kinds: SeatKind[], wins?: number[], breaker = 0, private rnd: () => number = Math.random) {
    this.table = new Table(rnd);
    if (wins) this.wins = wins.slice();
    this.breaker = breaker;
    this.turn = breaker;
    this.nextOf[breaker % 2] = this.mate(breaker);
    this.nextOf[1 - (breaker % 2)] = 1 - (breaker % 2);
    this.table.balls[0].x = HEAD_X;
    this.resetAim();
  }

  name(i: number) {
    return seatName(this.kinds[i], i);
  }

  /** Equipo de un asiento: 0 = asientos 1 y 3, 1 = asientos 2 y 4. */
  team(seat: number) {
    return seat % 2;
  }

  /** Compañero de equipo (en partida de 2 es él mismo). */
  mate(seat: number) {
    return this.kinds.length === 4 ? (seat + 2) % 4 : seat;
  }

  /** Asiento que se muestra o juega por un equipo: el que tira ahora o el que tirará después. */
  shooterOf(team: number) {
    return this.team(this.turn) === team ? this.turn : this.nextOf[team];
  }

  teamName(team: number) {
    return this.kinds.length === 4 ? `Equipo ${team + 1}` : this.name(team);
  }

  /** Quedan bolas del grupo del jugador (la 8 no cuenta). */
  remaining(p: number): number {
    return groupLeft(this.table.balls, this.groups[p]);
  }

  /** Solo le queda la 8. */
  cleared(p: number): boolean {
    return this.groups[p] >= 0 && this.remaining(p) === 0;
  }

  private resetAim() {
    this.aim = { angle: 0, power: 0.45, top: 0, side: 0, call: -1 };
    this.timer = SHOT_TIME;
    this.turnNo++;
    this.lastF = this.lastK = 0;
  }

  private say(text: string) {
    this.msg = text;
    this.msgT = 4.5;
  }

  /** Bola(s) que puede tocar primero el jugador de turno. */
  legalFirst(id: number): boolean {
    const t = this.team(this.turn);
    if (this.groups[t] < 0) return id !== 8;
    return this.cleared(t) ? id === 8 : groupOf(id) === this.groups[t];
  }

  get seat() {
    return this.kinds[this.turn];
  }

  update(dt: number, ctl: PoolControl) {
    if (this.msgT > 0) this.msgT -= dt;
    if (this.phase === 1) {
      this.table.update(dt);
      if (!this.table.moving) {
        this.settle += dt;
        if (this.settle >= SETTLE) this.resolve();
      } else {
        this.settle = 0;
      }
      return;
    }
    if (this.phase !== 0) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timeout();
      return;
    }
    const cue = this.table.balls[0];
    if (this.seat === "local") {
      ctl.poll(cue.x, cue.y, this.placing);
      if (this.placing) {
        const c = ctl.cursor;
        if (c) [cue.x, cue.y] = this.table.nearestPlace(c[0], c[1], this.head);
        ctl.takeFire();
        if (ctl.takePlace()) this.placing = false;
      } else {
        this.aim = { angle: ctl.angle, power: ctl.power, top: ctl.top, side: ctl.side, call: ctl.call };
        ctl.takePlace();
        if (ctl.takeFire()) {
          this.fire();
          ctl.clearSpin();
        }
      }
    } else if (this.seat === "ai") {
      this.bot.update(dt, this);
    }
  }

  /** Lanza la tirada con la puntería actual. */
  fire() {
    if (this.phase !== 0 || this.placing) return;
    const me = this.turn;
    const a = this.aim;
    const cleared = this.cleared(this.team(me));
    this.table.shoot(a.angle, a.power, a.top, a.side);
    let call = -1;
    if (cleared) {
      call = a.call >= 0 ? a.call : bestPocket(this.table.balls, trace(this.table.balls, a.angle));
    }
    this.shot = { turn: me, call, cleared, brk: this.brk };
    this.aim.call = call;
    this.phase = 1;
    this.settle = 0;
    this.shots++;
  }

  /** Deja la blanca (bola en mano) y empieza a apuntar. */
  place(x: number, y: number) {
    if (!this.placing) return;
    const [px, py] = this.table.nearestPlace(x, y, this.head);
    const cue = this.table.balls[0];
    cue.x = px;
    cue.y = py;
    this.placing = false;
  }

  /** Mensaje del invitado que tiene el turno. */
  applyRemote(index: number, msg: PoolMsg) {
    if (this.kinds[this.turn] !== "remote" || index !== this.turn || msg?.t !== "p") return;
    const last = this.lastS.get(index) ?? -1;
    if (!(msg.s > last) || msg.u !== this.turnNo) return; // por el relé llegan desordenados
    this.lastS.set(index, msg.s);
    if (this.phase !== 0) return;
    const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
    const cue = this.table.balls[0];
    if (this.placing) {
      [cue.x, cue.y] = this.table.nearestPlace(num(msg.px, -200, 200, cue.x), num(msg.py, -100, 100, cue.y), this.head);
      if (msg.k > this.lastK) this.placing = false;
      this.lastK = Math.max(this.lastK, msg.k | 0);
      this.lastF = Math.max(this.lastF, msg.f | 0);
      return;
    }
    this.aim = {
      angle: num(msg.a, -10, 10, this.aim.angle), power: num(msg.w, 0, 1, this.aim.power),
      side: num(msg.x, -1, 1, 0), top: num(msg.y, -1, 1, 0), call: num(msg.c, -1, 5, -1) | 0,
    };
    if (msg.f > this.lastF) this.fire();
    this.lastF = Math.max(this.lastF, msg.f | 0);
    this.lastK = Math.max(this.lastK, msg.k | 0);
  }

  /** Un invitado se fue: lo sustituye la IA. */
  toAI(index: number) {
    if (index >= this.kinds.length || this.kinds[index] === "ai") return;
    this.kinds[index] = "ai";
  }

  private timeout() {
    this.passTurn(true);
    this.say(`Tiempo agotado. Mano para ${this.name(this.turn)}`);
  }

  /** Pasa el turno; `inHand`: el rival coloca la blanca donde quiera. */
  private passTurn(inHand: boolean) {
    const next = 1 - this.team(this.turn);
    this.turn = this.nextOf[next];
    this.nextOf[next] = this.mate(this.turn);
    this.phase = 0;
    this.placing = inHand;
    this.head = false;
    this.brk = false;
    this.shot = null;
    const cue = this.table.balls[0];
    if (inHand) {
      if (cue.pocket >= 0) {
        cue.pocket = -1;
        cue.vx = cue.vy = 0;
        [cue.x, cue.y] = this.table.nearestPlace(HEAD_X, 0, false);
      }
    }
    this.resetAim();
  }

  private keepTurn() {
    this.phase = 0;
    this.placing = false;
    this.brk = false;
    this.shot = null;
    this.resetAim();
  }

  private finish(winner: number, why: string) {
    this.phase = 2;
    this.winner = winner;
    this.wins[winner]++;
    this.say(`${this.teamName(winner)} gana: ${why}`);
  }

  /** Reglas al parar las bolas. */
  private resolve() {
    const s = this.shot!;
    const t = this.table;
    const log = t.log;
    const me = s.turn, myT = this.team(me), otherT = 1 - myT;
    const cueGone = t.balls[0].pocket >= 0;
    const pocketed = log.pocketed.filter((p) => p.id !== 0);
    const eight = pocketed.find((p) => p.id === 8);
    const open = this.groups[myT] < 0;
    const first = log.first;

    let foul = "";
    if (cueGone) foul = "blanca embolsada";
    else if (!first) foul = "no tocaste ninguna bola";
    else if (open ? first === 8 && !s.brk : s.cleared ? first !== 8 : groupOf(first) !== this.groups[myT]) foul = "bola equivocada";
    else if (!pocketed.length && !log.railAfter) foul = "ninguna bola tocó banda";
    else if (s.brk && !pocketed.length && log.railBalls.size < 4) foul = "saque sin 4 bolas a banda";

    if (eight) {
      if (s.brk) {
        t.rack(this.rnd);
        this.say("La 8 entró en el saque: se rehace el triángulo");
        this.brk = true;
        this.head = true;
        this.placing = true;
        this.phase = 0;
        this.resetAim();
        return;
      }
      const ok = s.cleared && !foul && eight.pocket === s.call;
      const why = ok ? "la 8 en la tronera marcada" : foul ? `la 8 con falta (${foul})` : s.cleared ? "la 8 cayó en otra tronera" : "la 8 antes de tiempo";
      this.finish(ok ? myT : otherT, why);
      return;
    }

    // Red de seguridad: sin bolas en la mesa no hay nada que jugar (una partida de CPU se quedaba así para siempre).
    if (t.balls.every((b, i) => i === 0 || b.pocket >= 0)) {
      this.finish(foul ? otherT : myT, "mesa vacía");
      return;
    }

    if (foul) {
      this.passTurn(true);
      this.say(`Falta: ${foul}. Mano para ${this.name(this.turn)}`);
      return;
    }

    // Mesa abierta: la primera bola metida (sin falta) fija los grupos, salvo en el saque.
    if (open && pocketed.length && !s.brk) {
      const g = groupOf(pocketed[0].id);
      this.groups[myT] = g;
      this.groups[otherT] = 1 - g;
      this.say(`${this.kinds.length === 4 ? this.teamName(myT) : this.name(me)}: ${g === 0 ? "lisas" : "rayadas"}`);
    }
    const mine = pocketed.some((p) => groupOf(p.id) === this.groups[myT]);
    if (mine || (s.brk && pocketed.length)) this.keepTurn();
    else this.passTurn(false);
  }
}
