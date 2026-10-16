// Controles de Monigotes: mover, saltar (doble salto), bajar de plataformas y atacar/usar arma.
import type { Keyboard } from "../core/keyboard";

const KEYS = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  attack: ["Space", "Enter", "NumpadEnter", "KeyE", "KeyK"],
};

/** Entrada de un luchador: la usan el teclado, los invitados y los bots. */
export interface FightSource {
  poll(): void;
  readonly dx: number;
  readonly down: boolean;
  takeJump(): boolean;
  takeAttack(): boolean;
}

export class StickInput implements FightSource {
  dx = 0;
  down = false;
  private jumpHeld = false;
  private attackHeld = false;
  private jumps = 0;
  private attacks = 0;

  constructor(private keyboard: Keyboard) {}

  poll() {
    const kb = this.keyboard;
    this.dx = Number(kb.anyDown(KEYS.right)) - Number(kb.anyDown(KEYS.left));
    this.down = kb.anyDown(KEYS.down);
    const jump = kb.anyDown(KEYS.up);
    if (jump && !this.jumpHeld) this.jumps++;
    this.jumpHeld = jump;
    const attack = kb.anyDown(KEYS.attack);
    if (attack && !this.attackHeld) this.attacks++;
    this.attackHeld = attack;
  }

  takeJump(): boolean {
    if (this.jumps <= 0) return false;
    this.jumps--;
    return true;
  }

  takeAttack(): boolean {
    if (this.attacks <= 0) return false;
    this.attacks--;
    return true;
  }
}

export const STICK_HINT = "← → mover · ↑ saltar (doble) · ↓ bajar · ESPACIO golpe/arma";
