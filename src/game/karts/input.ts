// Controles de Karts: ejes independientes (↑ y → a la vez acelera girando), derrape y objeto.
import type { Keyboard } from "../core/keyboard";

const KEYS = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  item: ["Space", "Enter", "NumpadEnter", "KeyE"],
  drift: ["ShiftLeft", "ShiftRight", "KeyC", "KeyK"],
};

/** Entrada del kart: lo que necesita la física, venga del teclado o de la IA. */
export interface DriveSource {
  poll(): void;
  readonly steer: number;
  readonly throttle: number;
  readonly drift: boolean;
  takeItem(): boolean;
}

export class KartsInput implements DriveSource {
  steer = 0;
  throttle = 0;
  drift = false;
  private itemHeld = false;
  private pendingItems = 0;

  constructor(private keyboard: Keyboard) {}

  poll() {
    const kb = this.keyboard;
    this.steer = Number(kb.anyDown(KEYS.right)) - Number(kb.anyDown(KEYS.left));
    this.throttle = Number(kb.anyDown(KEYS.up)) - Number(kb.anyDown(KEYS.down));
    this.drift = kb.anyDown(KEYS.drift);
    const item = kb.anyDown(KEYS.item);
    if (item && !this.itemHeld) this.pendingItems++;
    this.itemHeld = item;
  }

  takeItem(): boolean {
    if (this.pendingItems <= 0) return false;
    this.pendingItems--;
    return true;
  }
}

export const KARTS_HINT = "↑ acelerar · ← → girar · SHIFT derrapar · ESPACIO objeto";
