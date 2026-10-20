// Controles de Casino de deudas: andar por la sala y jugar en la máquina de delante.
import type { Keyboard } from "../core/keyboard";

const KEYS = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  use: ["Space", "Enter", "NumpadEnter", "KeyE"],
};

/** Entrada de un jugador: la usan el teclado y los invitados. */
export interface CasinoSource {
  poll(): void;
  readonly dx: number;
  readonly dy: number;
  takeUse(): boolean;
}

export class CasinoInput implements CasinoSource {
  dx = 0;
  dy = 0;
  private useHeld = false;
  private uses = 0;

  constructor(private keyboard: Keyboard) {}

  poll() {
    const kb = this.keyboard;
    this.dx = Number(kb.anyDown(KEYS.right)) - Number(kb.anyDown(KEYS.left));
    this.dy = Number(kb.anyDown(KEYS.down)) - Number(kb.anyDown(KEYS.up));
    const use = kb.anyDown(KEYS.use);
    if (use && !this.useHeld) this.uses++;
    this.useHeld = use;
  }

  takeUse(): boolean {
    if (this.uses <= 0) return false;
    this.uses--;
    return true;
  }
}

export const CASINO_HINT = "WASD o FLECHAS andar · ESPACIO jugar en la máquina";
