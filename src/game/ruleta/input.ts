// Controles de Ruleta de cartuchos y selector de acciones del turno: escopeta u objeto, después
// el objetivo y, con la adrenalina, el objeto que se roba. Lo usan igual anfitrión e invitados.
import type { Keyboard } from "../core/keyboard";
import { I_ADRENALINE, I_CUFFS, ITEMS } from "./config";
import type { Action } from "./match";
import { isOut, seatName, stealable, usable, type RuletaSnap } from "./state";

const KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  ok: ["Space", "Enter", "NumpadEnter", "KeyE"],
  back: ["ArrowDown", "KeyS", "Backspace", "KeyQ"],
};
type Key = keyof typeof KEYS;

/** Cuenta pulsaciones (no teclas mantenidas) para que nada se repita solo. */
export class RuletaInput {
  private held: Record<Key, boolean> = { left: false, right: false, ok: false, back: false };
  private presses: Record<Key, number> = { left: 0, right: 0, ok: 0, back: 0 };

  constructor(private keyboard: Keyboard) {}

  poll() {
    for (const k of Object.keys(KEYS) as Key[]) {
      const down = this.keyboard.anyDown(KEYS[k]);
      if (down && !this.held[k]) this.presses[k]++;
      this.held[k] = down;
    }
  }

  take(k: Key): boolean {
    if (this.presses[k] <= 0) return false;
    this.presses[k]--;
    return true;
  }

  clear() {
    for (const k of Object.keys(KEYS) as Key[]) this.presses[k] = 0;
  }
}

/** Qué resaltar en la mesa. */
export type Focus =
  | { kind: "none" }
  | { kind: "gun" }
  | { kind: "item"; seat: number; slot: number }
  | { kind: "seat"; seat: number };

export class Picker {
  mode: "main" | "target" | "steal" = "main";
  private cursor = 0; // 0 = escopeta, 1.. = objetos
  private tcur = 0;
  private scur = 0;
  private slot = -1; // objeto elegido (-1 = escopeta)
  private victim = -1;

  reset() {
    this.mode = "main";
    this.cursor = this.tcur = this.scur = 0;
  }

  /** Objetivos válidos para lo elegido: primero los rivales y al final uno mismo (escopeta). */
  private targets(s: RuletaSnap, me: number): number[] {
    const rivals = s.p.map((_, i) => i).filter((i) => i !== me && !isOut(s, i));
    if (this.slot < 0) return [...rivals, me];
    const item = s.it[me][this.slot];
    if (item === I_CUFFS) return rivals.filter((i) => usable(s, I_CUFFS, i));
    if (item === I_ADRENALINE) return rivals.filter((i) => stealable(s, i).length > 0);
    return [];
  }

  /** Procesa las pulsaciones y devuelve la acción elegida, si la hay. */
  step(input: RuletaInput, s: RuletaSnap, me: number, active: boolean): Action | null {
    if (!active) {
      this.mode = "main";
      input.clear();
      return null;
    }
    const items = s.it[me];
    const wrap = (v: number, n: number) => ((v % n) + n) % n;
    const move = (v: number, n: number) => wrap(v + Number(input.take("right")) - Number(input.take("left")), n);
    if (this.mode === "main") {
      this.cursor = move(Math.min(this.cursor, items.length), items.length + 1);
      input.take("back");
      if (!input.take("ok")) return null;
      this.slot = this.cursor - 1;
      if (this.slot < 0) return this.enter("target");
      const item = items[this.slot];
      if (item === I_CUFFS || item === I_ADRENALINE) {
        return this.targets(s, me).length ? this.enter("target") : null;
      }
      return usable(s, item, -1) ? { k: 1, a: this.slot } : null;
    }
    if (this.mode === "target") {
      const list = this.targets(s, me);
      if (!list.length || input.take("back")) return this.enter("main");
      this.tcur = move(Math.min(this.tcur, list.length - 1), list.length);
      if (!input.take("ok")) return null;
      const t = list[this.tcur];
      if (this.slot < 0) {
        this.enter("main");
        return { k: 0, a: t };
      }
      if (items[this.slot] === I_CUFFS) {
        this.enter("main");
        return { k: 1, a: this.slot, b: t };
      }
      this.victim = t;
      return this.enter("steal");
    }
    const list = stealable(s, this.victim);
    if (!list.length || input.take("back")) return this.enter("target");
    this.scur = move(Math.min(this.scur, list.length - 1), list.length);
    if (!input.take("ok")) return null;
    this.enter("main");
    return { k: 1, a: this.slot, b: this.victim, c: list[this.scur] };
  }

  private enter(mode: Picker["mode"]): null {
    if (mode === "target" && this.mode === "main") this.tcur = 0;
    if (mode === "steal") this.scur = 0;
    this.mode = mode;
    return null;
  }

  focus(s: RuletaSnap, me: number): Focus {
    if (this.mode === "main") {
      const slot = Math.min(this.cursor, s.it[me].length) - 1;
      return slot < 0 ? { kind: "gun" } : { kind: "item", seat: me, slot };
    }
    if (this.mode === "target") {
      const list = this.targets(s, me);
      return list.length ? { kind: "seat", seat: list[Math.min(this.tcur, list.length - 1)] } : { kind: "none" };
    }
    const list = stealable(s, this.victim);
    return list.length ? { kind: "item", seat: this.victim, slot: list[Math.min(this.scur, list.length - 1)] } : { kind: "none" };
  }

  /** Texto de lo seleccionado y de las teclas. */
  describe(s: RuletaSnap, me: number): [string, string] {
    const f = this.focus(s, me);
    if (this.mode === "main") {
      if (f.kind === "item") {
        const info = ITEMS[s.it[f.seat][f.slot]];
        return [`${info.name}: ${info.desc}`, "← → elegir · ESPACIO usar"];
      }
      return ["Escopeta", "← → elegir objeto · ESPACIO coger la escopeta"];
    }
    if (this.mode === "target" && f.kind === "seat") {
      const who = f.seat === me ? "A ti mismo" : seatName(s, f.seat);
      if (this.slot < 0) return [`Apuntar: ${who}`, "← → apuntar · ESPACIO disparar · ↓ soltar"];
      const item = ITEMS[s.it[me][this.slot]];
      return [`${item.name}: ${who}`, "← → elegir rival · ESPACIO confirmar · ↓ volver"];
    }
    if (this.mode === "steal" && f.kind === "item") {
      const info = ITEMS[s.it[f.seat][f.slot]];
      return [`Robar: ${info.name} (${info.desc})`, "← → elegir · ESPACIO robar y usar · ↓ volver"];
    }
    return ["", ""];
  }
}
