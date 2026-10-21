// Mecanismos de la ventanilla: reja con palanca, timbre señuelo y alarma con secuencia de botones. Código puro
// (sin DOM ni red); solo corre en el anfitrión. Cada ronda trae los suyos (`RoundDef.mech`): ninguno es decorativo.
//   · Palanca: la reja de la ventanilla se abre `leverOpen` s y luego se cierra sola (quien deposita necesita
//     que alguien tire de ella, y está lejos).
//   · Timbre: los guardias de la planta baja acuden a él `lure` s (recarga `lureCd`): sirve para depositar sin vigilancia.
//   · Alarma: cada `alarmEvery` s bloquea la ventanilla `alarmTime` s, salvo que alguien teclee en el entrepiso la
//     secuencia de colores (que ven todos). Un botón equivocado reinicia la secuencia.
import type { MechDef } from "./balance";
import { WIN_BLOCKED, WIN_CLOSED, WIN_OPEN, type WinGate } from "./ventanilla";

/** Botones de la secuencia (colores). */
export const SEQ_BUTTONS = 4;
export const SEQ_NAMES = ["ROJO", "AZUL", "VERDE", "AMARILLO"] as const;
/** Pausa mínima entre dos tirones de palanca (s). */
export const LEVER_CD = 1.5;

export type SeqResult = "none" | "idle" | "ok" | "wrong" | "done";

export class Mechanisms {
  def!: MechDef;
  leverT = 0;
  leverCd = 0;
  lureT = 0;
  lureCd = 0;
  /** Alarma: segundos de bloqueo que quedan, cuenta atrás hasta la próxima y secuencia pedida con su progreso. */
  alarmT = 0;
  nextAlarm = 0;
  order: number[] = [];
  progress = 0;
  /** La alarma acaba de caducar sin que nadie la apagara (el anfitrión lo recoge y lo apaga). */
  expired = false;

  constructor(private rand: () => number = Math.random) {}

  /** Empieza una ronda con sus mecanismos (todo a cero). */
  start(def: MechDef) {
    this.def = def;
    this.leverT = 0;
    this.leverCd = 0;
    this.lureT = 0;
    this.lureCd = 0;
    this.alarmT = 0;
    this.order = [];
    this.progress = 0;
    this.expired = false;
    this.nextAlarm = def.seqLen > 0 ? def.alarmEvery : 0;
  }

  hasLever = () => this.def.leverOpen > 0;
  hasLure = () => this.def.lure > 0;
  hasAlarm = () => this.def.seqLen > 0;

  tick(dt: number) {
    this.leverT = Math.max(0, this.leverT - dt);
    this.leverCd = Math.max(0, this.leverCd - dt);
    this.lureT = Math.max(0, this.lureT - dt);
    this.lureCd = Math.max(0, this.lureCd - dt);
    if (!this.hasAlarm()) return;
    if (this.alarmT > 0) {
      this.alarmT = Math.max(0, this.alarmT - dt);
      if (this.alarmT === 0) {
        this.endAlarm();
        this.expired = true;
      }
      return;
    }
    this.nextAlarm -= dt;
    if (this.nextAlarm <= 0) this.startAlarm();
  }

  /** Estado de la ventanilla: la alarma manda sobre la reja. */
  gate(): WinGate {
    if (this.alarmT > 0) return WIN_BLOCKED;
    if (this.hasLever() && this.leverT <= 0) return WIN_CLOSED;
    return WIN_OPEN;
  }

  /** Tira de la palanca: abre la reja el tiempo de la ronda. Falso si no hay reja o es muy pronto. */
  pullLever(): boolean {
    if (!this.hasLever() || this.leverCd > 0) return false;
    this.leverT = this.def.leverOpen;
    this.leverCd = LEVER_CD;
    return true;
  }

  /** Pulsa el timbre: 'ok' (los guardias acuden), 'cd' (recargando) o 'none' (no hay timbre esta ronda). */
  pressLure(): "ok" | "cd" | "none" {
    if (!this.hasLure()) return "none";
    if (this.lureCd > 0) return "cd";
    this.lureT = this.def.lure;
    this.lureCd = this.def.lureCd;
    return "ok";
  }

  private startAlarm() {
    this.alarmT = this.def.alarmTime;
    this.progress = 0;
    // Orden al azar de los botones: solo los primeros `seqLen` cuentan.
    const all = Array.from({ length: SEQ_BUTTONS }, (_, k) => k);
    for (let k = all.length - 1; k > 0; k--) {
      const j = Math.floor(this.rand() * (k + 1));
      [all[k], all[j]] = [all[j], all[k]];
    }
    this.order = all.slice(0, this.def.seqLen);
  }

  private endAlarm() {
    this.alarmT = 0;
    this.order = [];
    this.progress = 0;
    this.nextAlarm = this.def.alarmEvery;
  }

  /** Pulsa el botón `b` de la secuencia. */
  pressSeq(b: number): SeqResult {
    if (!this.hasAlarm() || b < 0 || b >= SEQ_BUTTONS) return "none";
    if (this.alarmT <= 0) return "idle";
    if (b !== this.order[this.progress]) {
      this.progress = 0;
      return "wrong";
    }
    this.progress++;
    if (this.progress < this.order.length) return "ok";
    this.endAlarm();
    return "done";
  }

  /** Para el estado de red: `[reja (s), timbre (s), recarga del timbre (s), alarma (s), progreso, ...orden]`. */
  snap(): number[] {
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return [r1(this.leverT), r1(this.lureT), r1(this.lureCd), r1(this.alarmT), this.progress, ...this.order];
  }
}
