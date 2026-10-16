// Controles de Sumo de bolas: dirección en pantalla (↑ = hacia el fondo de la arena) y embestida.
import type { Keyboard } from "../core/keyboard";

const KEYS = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  dash: ["Space", "Enter", "NumpadEnter", "ShiftLeft", "ShiftRight", "KeyE"],
};

/** Entrada de una bola: la usan el teclado, los invitados y la IA. */
export interface RollSource {
  poll(): void;
  /** Dirección deseada en el mundo (x a la derecha, y hacia la cámara), cada eje en -1..1. */
  readonly dx: number;
  readonly dy: number;
  takeDash(): boolean;
}

export class BallsInput implements RollSource {
  dx = 0;
  dy = 0;
  private dashHeld = false;
  private pendingDashes = 0;

  constructor(private keyboard: Keyboard) {}

  poll() {
    const kb = this.keyboard;
    this.dx = Number(kb.anyDown(KEYS.right)) - Number(kb.anyDown(KEYS.left));
    this.dy = Number(kb.anyDown(KEYS.down)) - Number(kb.anyDown(KEYS.up));
    const dash = kb.anyDown(KEYS.dash);
    if (dash && !this.dashHeld) this.pendingDashes++;
    this.dashHeld = dash;
  }

  takeDash(): boolean {
    if (this.pendingDashes <= 0) return false;
    this.pendingDashes--;
    return true;
  }
}

export const BALLS_HINT = "WASD o FLECHAS rodar · ESPACIO embestida";
