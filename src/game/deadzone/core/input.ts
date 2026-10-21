// Entrada de Dead Zone: teclado del hub + ratón con Pointer Lock (o arrastrando si la vista no lo permite,
// como en la webview de VS Code). Acumula el movimiento del ratón por fotograma y distingue pulsaciones de un
// solo uso (comprar, recargar, cambiar de arma) de las teclas mantenidas.
import type { Keyboard } from "../../core/keyboard";

/** Teclas de un solo uso que se cuentan (flanco de bajada). */
const TAPS = ["KeyE", "KeyR", "KeyF", "Digit1", "Digit2", "Digit3"] as const;
export type Tap = (typeof TAPS)[number];

const mouse = {
  dx: 0,
  dy: 0,
  /** Botones mantenidos y clic izquierdo de este fotograma. */
  left: false,
  right: false,
  clicks: 0,
  attached: false,
  /** El navegador no concede Pointer Lock (webview): se mira arrastrando con el botón izquierdo. */
  noLock: false,
  dragged: 0,
  lastX: 0,
  lastY: 0,
  moved: false,
  /** Algún gesto del usuario desde la última lectura (para desbloquear el audio). */
  gesture: false,
};

export const pointerLocked = () => typeof document !== "undefined" && !!document.pointerLockElement;

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
    mouse.gesture = true;
    if (ev.button === 2) {
      mouse.right = true;
      return;
    }
    if (ev.button !== 0) return;
    if (!pointerLocked() && !mouse.noLock) {
      requestLock();
      return;
    }
    mouse.left = true;
    if (pointerLocked()) mouse.clicks++;
    else {
      mouse.dragged = 0;
      mouse.lastX = ev.clientX;
      mouse.lastY = ev.clientY;
    }
  });
  window.addEventListener("mouseup", (ev) => {
    if (ev.button === 2) mouse.right = false;
    if (ev.button !== 0 || !mouse.left) return;
    mouse.left = false;
    // Sin puntero capturado, un clic sin arrastrar es un disparo.
    if (!pointerLocked() && mouse.dragged <= 4) mouse.clicks++;
  });
  document.addEventListener("mousemove", (ev) => {
    if (pointerLocked()) {
      if (ev.movementX || ev.movementY) mouse.moved = true;
      mouse.dx += ev.movementX;
      mouse.dy += ev.movementY;
      return;
    }
    if (!mouse.left) return;
    const dx = Number.isFinite(ev.movementX) ? ev.movementX : ev.clientX - mouse.lastX;
    const dy = Number.isFinite(ev.movementY) ? ev.movementY : ev.clientY - mouse.lastY;
    mouse.lastX = ev.clientX;
    mouse.lastY = ev.clientY;
    mouse.dragged += Math.abs(dx) + Math.abs(dy);
    if (Math.abs(dx) + Math.abs(dy) > 2) mouse.moved = true;
    mouse.dx += dx;
    mouse.dy += dy;
  });
  window.addEventListener("blur", () => {
    mouse.left = mouse.right = false;
  });
  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
  document.addEventListener("pointerlockerror", () => (mouse.noLock = true));
}

/** Cómo se mira ahora mismo (el HUD avisa según el caso). */
export function lookMode(): "locked" | "drag" | "click" {
  if (pointerLocked() || mouse.moved) return "locked";
  return mouse.noLock ? "drag" : "click";
}

export class Input {
  sensitivity = 1;
  private readonly taps = new Map<Tap, number>();
  private readonly held = new Map<Tap, boolean>();

  constructor(private keyboard: Keyboard) {
    for (const k of TAPS) {
      this.taps.set(k, 0);
      this.held.set(k, false);
    }
    attachMouse();
  }

  /** Lee el teclado (una vez por fotograma): cuenta los flancos de las teclas de un solo uso. */
  poll(): void {
    for (const k of TAPS) {
      const down = this.keyboard.isDown(k);
      if (down && !this.held.get(k)) {
        this.taps.set(k, (this.taps.get(k) ?? 0) + 1);
        mouse.gesture = true;
      }
      this.held.set(k, down);
    }
  }

  /** ¿Ha habido un gesto del usuario desde la última vez? (desbloquea el audio). */
  takeGesture(): boolean {
    const g = mouse.gesture;
    mouse.gesture = false;
    return g;
  }

  get locked(): boolean {
    return pointerLocked();
  }

  get mouseLeft(): boolean {
    return mouse.left;
  }

  get mouseRight(): boolean {
    return mouse.right;
  }

  isDown(code: string): boolean {
    return this.keyboard.isDown(code);
  }

  /** Consume una pulsación (solo devuelve true una vez por tecla). */
  take(code: Tap): boolean {
    const n = this.taps.get(code) ?? 0;
    if (n <= 0) return false;
    this.taps.set(code, n - 1);
    return true;
  }

  takeClick(): boolean {
    if (mouse.clicks <= 0) return false;
    mouse.clicks--;
    return true;
  }

  /** Movimiento del ratón acumulado desde la última llamada (píxeles). */
  consumeLook(): { x: number; y: number } {
    const out = { x: mouse.dx, y: mouse.dy };
    mouse.dx = mouse.dy = 0;
    return out;
  }

  /** Dirección de movimiento en el plano: x = lateral, z = adelante (+1 adelante). */
  moveAxis(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.isDown("KeyW") || this.isDown("ArrowUp")) z += 1;
    if (this.isDown("KeyS") || this.isDown("ArrowDown")) z -= 1;
    if (this.isDown("KeyD") || this.isDown("ArrowRight")) x += 1;
    if (this.isDown("KeyA") || this.isDown("ArrowLeft")) x -= 1;
    const len = Math.hypot(x, z);
    return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }

  /** Vacía lo pendiente (al abrir el juego o cuando hay algo encima). */
  clear(): void {
    for (const k of TAPS) this.taps.set(k, 0);
    mouse.clicks = 0;
    mouse.dx = mouse.dy = 0;
  }
}
