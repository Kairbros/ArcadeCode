// Controles del casino: andar (teclas mantenidas), ratón para mirar (capturado o arrastrando) y
// pulsaciones contadas para lo que no debe repetirse (sentarse, apostar, elegir ranura, usar la mano).
import type { Keyboard } from "../core/keyboard";

const HELD = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
};
const PRESS = {
  ok: ["Space", "Enter", "NumpadEnter"],
  // Con ← → también se elige casilla cuando estás sentado; ahí se cuentan pulsaciones.
  betLeft: ["ArrowLeft", "KeyA"],
  betRight: ["ArrowRight", "KeyD"],
  betUp: ["ArrowUp", "KeyW"],
  betDown: ["ArrowDown", "KeyS"],
  sit: ["KeyE"],
  // Barra de objetos: monedas, mano (robar) y bate.
  slot1: ["Digit1"],
  slot2: ["Digit2"],
  slot3: ["Digit3"],
};
type Press = keyof typeof PRESS;

const PRESSES: Press[] = ["ok", "betLeft", "betRight", "betUp", "betDown", "sit", "slot1", "slot2", "slot3"];

// --- Ratón: estado compartido, enganchado una sola vez al lienzo del juego ---
// En el navegador el primer clic captura el puntero; si la vista no lo permite (webview de VS Code) se
// mira arrastrando con el botón izquierdo y un clic sin arrastrar cuenta como pulsación.
const mouse = {
  dx: 0,
  dy: 0,
  clicks: 0,
  attached: false,
  noLock: false,
  drag: 0,
  dragged: 0,
  lastX: 0,
  lastY: 0,
  /** Ya ha mirado con el ratón alguna vez (para no repetir el aviso). */
  moved: false,
};

/** Cómo se mira con el ratón ahora mismo (el HUD avisa según el caso). */
export function lookMode(): "locked" | "drag" | "click" {
  if (pointerLocked() || mouse.moved) return "locked";
  return mouse.noLock ? "drag" : "click";
}

/** ¿El puntero está capturado por el juego? */
export function pointerLocked(): boolean {
  return typeof document !== "undefined" && !!document.pointerLockElement;
}

/** Suelta el puntero (al volver al menú, que se maneja con el ratón). */
export function releasePointer() {
  if (pointerLocked()) document.exitPointerLock();
}

function attachMouse() {
  if (mouse.attached || typeof document === "undefined") return;
  const canvas = document.getElementById("game") as HTMLCanvasElement | null;
  if (!canvas) return;
  mouse.attached = true;

  const requestLock = () => {
    try {
      const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      void p?.catch?.(() => (mouse.noLock = true));
    } catch {
      mouse.noLock = true;
    }
    window.setTimeout(() => {
      if (!mouse.noLock && !pointerLocked()) mouse.noLock = true;
    }, 400);
  };

  canvas.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    if (!pointerLocked() && !mouse.noLock) {
      requestLock();
      return;
    }
    mouse.drag = ev.button;
    mouse.dragged = 0;
    mouse.lastX = ev.clientX;
    mouse.lastY = ev.clientY;
  });

  window.addEventListener("mouseup", (ev) => {
    if (ev.button !== 0 || mouse.drag === 0) return;
    // Un clic sin arrastrar es una pulsación (parar el minijuego del robo, por ejemplo).
    if (mouse.dragged <= 4) mouse.clicks++;
    mouse.drag = 0;
  });

  document.addEventListener("mousemove", (ev) => {
    if (pointerLocked()) {
      if (ev.movementX || ev.movementY) mouse.moved = true;
      mouse.dx += ev.movementX;
      mouse.dy += ev.movementY;
      return;
    }
    if (!mouse.drag) return;
    const dx = Number.isFinite(ev.movementX) ? ev.movementX : ev.clientX - mouse.lastX;
    const dy = Number.isFinite(ev.movementY) ? ev.movementY : ev.clientY - mouse.lastY;
    mouse.lastX = ev.clientX;
    mouse.lastY = ev.clientY;
    mouse.dragged += Math.abs(dx) + Math.abs(dy);
    if (Math.abs(dx) + Math.abs(dy) > 2) mouse.moved = true;
    mouse.dx += dx;
    mouse.dy += dy;
  });

  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
  document.addEventListener("pointerlockerror", () => (mouse.noLock = true));
}

export class CasinoInput {
  private presses: Record<Press, number> = {
    ok: 0, betLeft: 0, betRight: 0, betUp: 0, betDown: 0, sit: 0, slot1: 0, slot2: 0, slot3: 0,
  };
  private held: Record<Press, boolean> = {
    ok: false, betLeft: false, betRight: false, betUp: false, betDown: false, sit: false,
    slot1: false, slot2: false, slot3: false,
  };
  /** Lectura continua de las teclas de andar. */
  forward = 0;
  back = 0;
  left = 0;
  right = 0;
  run = false;

  constructor(private keyboard: Keyboard) {
    for (const k of PRESSES) this.presses[k] = 0;
    attachMouse();
  }

  poll() {
    for (const k of PRESSES) {
      const down = this.keyboard.anyDown(PRESS[k]);
      if (down && !this.held[k]) this.presses[k]++;
      this.held[k] = down;
    }
    this.forward = this.keyboard.anyDown(HELD.forward) ? 1 : 0;
    this.back = this.keyboard.anyDown(HELD.back) ? 1 : 0;
    this.left = this.keyboard.anyDown(HELD.left) ? 1 : 0;
    this.right = this.keyboard.anyDown(HELD.right) ? 1 : 0;
    this.run = this.keyboard.isDown("ShiftLeft") || this.keyboard.isDown("ShiftRight");
  }

  take(k: Press): boolean {
    if (this.presses[k] <= 0) return false;
    this.presses[k]--;
    return true;
  }

  /** Ranura elegida con 1/2/3 este fotograma (0..2) o -1. */
  takeSlot(): number {
    for (let i = 0; i < 3; i++) {
      if (this.take(`slot${i + 1}` as Press)) return i;
    }
    return -1;
  }

  /** Movimiento del ratón acumulado desde la última llamada (píxeles). */
  takeMouse(): [number, number] {
    const d: [number, number] = [mouse.dx, mouse.dy];
    mouse.dx = mouse.dy = 0;
    return d;
  }

  /** Clic izquierdo soltado sin arrastrar (para parar el minijuego del robo). */
  takeClick(): boolean {
    if (mouse.clicks <= 0) return false;
    mouse.clicks--;
    return true;
  }

  /** Lo que se lleva andado este frame: 1 adelante, -1 atrás, 0 quieto. */
  get move(): number {
    return this.forward - this.back;
  }

  /** Giro con las teclas mantenidas (mientras andas). */
  get turn(): number {
    return this.right - this.left;
  }

  clear() {
    for (const k of PRESSES) this.presses[k] = 0;
    mouse.clicks = 0;
  }
}
