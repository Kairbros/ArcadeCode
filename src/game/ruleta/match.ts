// Ruleta de cartuchos: reglas y árbitro. Solo lo ejecuta el anfitrión (o el modo local); los
// invitados envían acciones y reciben el estado. El orden de los cartuchos nunca sale de aquí:
// a cada jugador solo se le cuenta lo que sabe (lo que vio con la lupa o el teléfono).
import { Rng } from "../core/rng";
import { decide } from "./bot";
import {
  BOT_THINK_MAX, BOT_THINK_MIN, CUT_AT, EV_ITEM, EV_NONE, EV_SHOT, I_ADRENALINE, I_BEER, I_CIGS, I_CUFFS, I_INVERTER,
  I_LUPA, I_MEDS, I_PHONE, I_SAW, INTRO_TIME, ITEM_HIT, ITEM_IDS, ITEM_TIME, ITEMS, MAX_ITEMS, PH_INTRO, PH_OVER,
  PH_REVEAL, PH_ROUND_END, PH_TURN, REVEAL_TIME, ROUND_END_TIME, ROUNDS, SHOT_HIT, SHOT_TIME,
} from "./config";

export type SlotKind = "local" | "remote" | "ai";

export interface Seat {
  index: number;
  kind: SlotKind;
  lives: number;
  max: number;
  out: boolean;
  /** 0 libre · 1 pierde su próximo turno · 2 ya lo perdió (no se le puede esposar hasta que juegue). */
  cuffed: number;
  items: number[];
  /** Cartuchos que conoce: índice en la carga → ¿real? */
  known: Map<number, boolean>;
}

/** Disparar (k 0, a = objetivo) o usar un objeto (k 1, a = hueco, b = objetivo, c = hueco a robar). */
export interface Action {
  k: 0 | 1;
  a: number;
  b?: number;
  c?: number;
}

interface Anim {
  t: number;
  dur: number;
  hit: number;
  apply: (() => void) | null;
}

export class Match {
  readonly seats: Seat[];
  readonly wins: number[];
  /** Asiento del crupier (el bot inicial), -1 si no hay. */
  readonly dealer: number;
  phase = PH_INTRO;
  phaseT = 0;
  round = 0;
  turn = 0;
  shells: boolean[] = [];
  pos = 0;
  loadLive = 0;
  loadBlank = 0;
  saw = false;
  anim: Anim | null = null;
  /** Último evento: [n, tipo, a, b, c, d, e]; n crece con cada uno (ver config). */
  ev: number[] = [0, EV_NONE, -1, -1, -1, -1, 0];
  evT = 0;
  roundWinner = -1;
  readonly rng = new Rng((Math.random() * 2 ** 32) >>> 0);
  private pendingPass = false;
  private think = BOT_THINK_MAX;

  constructor(kinds: SlotKind[]) {
    this.seats = kinds.map((kind, index) => ({
      index, kind, lives: 0, max: 0, out: false, cuffed: 0, items: [], known: new Map(),
    }));
    this.wins = kinds.map(() => 0);
    this.dealer = kinds.indexOf("ai");
    this.startRound();
  }

  get rule() {
    return ROUNDS[this.round];
  }

  alive(): Seat[] {
    return this.seats.filter((s) => !s.out);
  }

  /** Cartuchos que quedan por salir (lo que cualquiera puede contar). */
  remaining(): { live: number; blank: number } {
    let live = 0;
    for (let i = this.pos; i < this.shells.length; i++) if (this.shells[i]) live++;
    return { live, blank: this.shells.length - this.pos - live };
  }

  /** Cables cortados: en la última ronda, con pocas vidas, no se puede curar. */
  noHeal(s: Seat): boolean {
    return this.rule.cut && s.lives <= CUT_AT;
  }

  canUse(item: number, p: number, target: number): boolean {
    if (item === I_SAW) return !this.saw;
    if (item === I_CUFFS) {
      const t = this.seats[target];
      return !!t && !t.out && t.index !== p && t.cuffed === 0;
    }
    return true;
  }

  toAI(index: number) {
    const s = this.seats[index];
    if (s) s.kind = "ai";
  }

  /** Clasificación final por rondas ganadas. */
  standings(): { index: number; place: number }[] {
    return this.seats
      .map((s) => ({ index: s.index, place: 1 + this.wins.filter((w) => w > this.wins[s.index]).length }))
      .sort((a, b) => a.place - b.place || a.index - b.index);
  }

  update(dt: number) {
    this.phaseT += dt;
    this.evT += dt;
    if (this.phase === PH_INTRO) {
      if (this.phaseT >= INTRO_TIME) this.newLoad();
    } else if (this.phase === PH_REVEAL) {
      if (this.phaseT >= REVEAL_TIME) this.setPhase(PH_TURN);
    } else if (this.phase === PH_TURN) {
      const a = this.anim;
      if (a) {
        a.t += dt;
        if (a.apply && a.t >= a.hit) {
          const apply = a.apply;
          a.apply = null;
          apply();
        }
        if (a.t >= a.dur) {
          this.anim = null;
          this.afterAction();
        }
        return;
      }
      const s = this.seats[this.turn];
      if (s.kind === "ai") {
        this.think -= dt;
        if (this.think <= 0) {
          this.think = this.rng.uniform(BOT_THINK_MIN, BOT_THINK_MAX);
          if (!this.act(s.index, decide(this, s.index))) this.act(s.index, { k: 0, a: this.randomRival(s.index) });
        }
      }
    } else if (this.phase === PH_ROUND_END) {
      if (this.phaseT >= ROUND_END_TIME) {
        if (this.round + 1 < ROUNDS.length) {
          this.round++;
          this.startRound();
        } else {
          this.setPhase(PH_OVER);
        }
      }
    }
  }

  /** Acción del jugador p. Devuelve false si no es su turno o no es válida. */
  act(p: number, a: Action): boolean {
    if (this.phase !== PH_TURN || this.anim || this.turn !== p) return false;
    const me = this.seats[p];
    if (!me || me.out) return false;
    if (a.k === 0) {
      const t = this.seats[a.a];
      if (!t || t.out) return false;
      const dmg = this.saw ? 2 : 1;
      this.start([EV_SHOT, p, t.index, -1, dmg, 0], SHOT_TIME, SHOT_HIT, () => this.resolveShot(p, t.index, dmg));
      return true;
    }
    const item = me.items[a.a];
    if (!item) return false;
    if (item === I_ADRENALINE) {
      // Roba un objeto (que no sea otra adrenalina) y lo usa en el acto contra su dueño.
      const victim = this.seats[a.b ?? -1];
      if (!victim || victim.out || victim.index === p) return false;
      const slot = a.c ?? -1;
      const stolen = victim.items[slot];
      if (!stolen || stolen === I_ADRENALINE || !this.canUse(stolen, p, victim.index)) return false;
      me.items.splice(a.a, 1);
      victim.items.splice(slot, 1);
      this.useItem(p, stolen, victim.index, true);
      return true;
    }
    const target = a.b ?? -1;
    if (!this.canUse(item, p, target)) return false;
    me.items.splice(a.a, 1);
    this.useItem(p, item, target, false);
    return true;
  }

  // --- Desarrollo de la partida ---

  private setPhase(ph: number) {
    this.phase = ph;
    this.phaseT = 0;
  }

  private startRound() {
    const r = this.rule;
    for (const s of this.seats) {
      s.lives = s.max = r.lives;
      s.out = false;
      s.cuffed = 0;
      s.items = [];
      s.known.clear();
    }
    this.saw = false;
    this.anim = null;
    this.pendingPass = false;
    this.roundWinner = -1;
    this.shells = [];
    this.pos = this.loadLive = this.loadBlank = 0;
    this.turn = this.round % this.seats.length;
    this.think = BOT_THINK_MAX;
    this.setPhase(PH_INTRO);
  }

  /** Carga nueva: cartuchos al azar (al menos uno de cada) y objetos para los que siguen vivos. */
  private newLoad() {
    const r = this.rule;
    const total = r.minShells + Math.floor(this.rng.next() * (r.maxShells - r.minShells + 1));
    const live = Math.max(1, Math.min(total - 1, Math.round(total * this.rng.uniform(0.34, 0.66))));
    this.shells = this.rng.shuffle(Array.from({ length: total }, (_, i) => i < live));
    this.pos = 0;
    this.loadLive = live;
    this.loadBlank = total - live;
    this.saw = false;
    for (const s of this.seats) {
      s.known.clear();
      if (s.out) continue;
      for (let i = 0; i < r.items && s.items.length < MAX_ITEMS; i++) s.items.push(this.randomItem());
    }
    this.think = BOT_THINK_MAX;
    this.setPhase(PH_REVEAL);
  }

  private randomItem(): number {
    const total = ITEM_IDS.reduce((sum, id) => sum + ITEMS[id].weight, 0);
    let r = this.rng.next() * total;
    for (const id of ITEM_IDS) {
      r -= ITEMS[id].weight;
      if (r <= 0) return id;
    }
    return ITEM_IDS[0];
  }

  private randomRival(p: number): number {
    const rivals = this.alive().filter((s) => s.index !== p);
    return rivals.length ? this.rng.choice(rivals).index : p;
  }

  private start(ev: number[], dur: number, hit: number, apply: () => void) {
    this.ev = [this.ev[0] + 1, ...ev];
    this.evT = 0;
    this.anim = { t: 0, dur, hit, apply };
  }

  private resolveShot(p: number, t: number, dmg: number) {
    const live = this.shells[this.pos++];
    this.ev[4] = live ? 1 : 0;
    this.saw = false;
    const target = this.seats[t];
    if (live) {
      target.lives = Math.max(0, target.lives - dmg);
      if (target.lives === 0) target.out = true;
    }
    // Dispararse a uno mismo con un cartucho de fogueo da otro turno.
    this.pendingPass = live || t !== p;
  }

  private useItem(p: number, item: number, target: number, stolen: boolean) {
    const victim = item === I_CUFFS || stolen ? target : -1;
    this.start([EV_ITEM, p, item, victim, -1, stolen ? 1 : 0], ITEM_TIME, ITEM_HIT, () => this.applyItem(p, item, target));
  }

  private applyItem(p: number, item: number, target: number) {
    const me = this.seats[p];
    const ev = this.ev;
    switch (item) {
      case I_LUPA:
        me.known.set(this.pos, this.shells[this.pos]);
        break;
      case I_CIGS:
        ev[5] = this.heal(me, 1);
        break;
      case I_BEER:
        ev[5] = this.shells[this.pos++] ? 1 : 0;
        break;
      case I_SAW:
        this.saw = true;
        break;
      case I_CUFFS:
        this.seats[target].cuffed = 1;
        break;
      case I_PHONE: {
        // Posición del cartucho revelado contando desde la recámara (0 = no quedaba ninguno más).
        const left = this.shells.length - this.pos - 1;
        if (left > 0) {
          const j = this.pos + 1 + Math.floor(this.rng.next() * left);
          me.known.set(j, this.shells[j]);
          ev[5] = j - this.pos + 1;
        } else {
          ev[5] = 0;
        }
        break;
      }
      case I_INVERTER: {
        this.shells[this.pos] = !this.shells[this.pos];
        // Quien lo usa sigue sabiendo lo que hay si ya lo sabía; los demás, ya no.
        for (const s of this.seats) {
          const k = s.known.get(this.pos);
          if (k === undefined) continue;
          if (s === me) s.known.set(this.pos, !k);
          else s.known.delete(this.pos);
        }
        break;
      }
      case I_MEDS:
        if (this.rng.next() < 0.5) {
          ev[5] = this.heal(me, 2) ? 1 : 2; // 2 = no hizo efecto
        } else {
          ev[5] = 0;
          me.lives = Math.max(0, me.lives - 1);
          if (me.lives === 0) {
            me.out = true;
            this.pendingPass = true;
          }
        }
        break;
    }
  }

  /** Cura hasta el máximo; devuelve las vidas recuperadas (0 con los cables cortados). */
  private heal(s: Seat, n: number): number {
    if (this.noHeal(s)) return 0;
    const before = s.lives;
    s.lives = Math.min(s.max, s.lives + n);
    return s.lives - before;
  }

  /** Al terminar la animación: fin de ronda, cambio de turno o carga nueva. */
  private afterAction() {
    if (this.alive().length <= 1) return this.endRound();
    if (this.pendingPass) {
      this.pendingPass = false;
      this.passTurn();
    }
    if (this.pos >= this.shells.length) this.newLoad();
  }

  /** Turno al siguiente vivo; quien está esposado se lo salta una vez. */
  private passTurn() {
    const n = this.seats.length;
    let i = this.turn;
    for (let step = 0; step < n * 2; step++) {
      i = (i + 1) % n;
      const s = this.seats[i];
      if (s.out) continue;
      if (s.cuffed === 1) {
        s.cuffed = 2;
        continue;
      }
      break;
    }
    this.turn = i;
    this.seats[i].cuffed = 0;
    this.think = this.rng.uniform(BOT_THINK_MIN, BOT_THINK_MAX);
  }

  private endRound() {
    const alive = this.alive();
    this.roundWinner = alive.length === 1 ? alive[0].index : -1;
    if (this.roundWinner >= 0) this.wins[this.roundWinner]++;
    this.setPhase(PH_ROUND_END);
  }
}
