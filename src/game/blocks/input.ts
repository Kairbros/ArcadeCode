// Controles de Bloques: WASD para andar, ratón (con el puntero capturado) o flechas para mirar,
// romper/poner con clic o Q/E, 1–9 o la rueda para elegir bloque, F para volar.
import type { Keyboard } from "../core/keyboard";

const KEYS = {
  forward: ["KeyW"],
  back: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  jump: ["Space"],
  down: ["ShiftLeft", "ShiftRight"],
  lookLeft: ["ArrowLeft"],
  lookRight: ["ArrowRight"],
  lookUp: ["ArrowUp"],
  lookDown: ["ArrowDown"],
  dig: ["KeyQ"],
  place: ["KeyE", "Enter", "NumpadEnter"],
  fly: ["KeyF"],
};
const DIGITS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"];

/** Entrada de un jugador de Bloques (teclado y ratón; en Node se sustituye por una falsa). */
export interface WalkSource {
  poll(): void;
  readonly forward: number;
  readonly right: number;
  readonly jump: boolean;
  readonly down: boolean;
  /** Giro con teclas, cada eje en -1..1 (se multiplica por la velocidad de giro). */
  readonly lookX: number;
  readonly lookY: number;
  /** Movimiento del ratón acumulado desde la última llamada (píxeles). */
  takeMouse(): [number, number];
  readonly digHeld: boolean;
  readonly placeHeld: boolean;
  takeDig(): boolean;
  takePlace(): boolean;
  /** Ranura elegida (0–8) o -1; la rueda da pasos relativos (takeScroll). */
  takeSlot(): number;
  takeScroll(): number;
  takeFly(): boolean;
}

// --- Ratón: estado compartido, enganchado una sola vez al lienzo del juego ---
const mouse = { dx: 0, dy: 0, digs: 0, places: 0, dig: false, place: false, scroll: 0, attached: false };

/** ¿El puntero está capturado por el juego? (el HUD avisa si no). */
export function pointerLocked(): boolean {
  return typeof document !== "undefined" && !!document.pointerLockElement;
}

function attachMouse() {
  if (mouse.attached || typeof document === "undefined") return;
  const canvas = document.getElementById("game");
  if (!canvas) return;
  mouse.attached = true;
  canvas.addEventListener("mousedown", (ev) => {
    if (document.pointerLockElement !== canvas) {
      // El primer clic captura el puntero (si la vista lo permite); no rompe nada.
      try {
        void (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
      } catch {
        // sin pointer lock: se juega con las flechas
      }
      return;
    }
    if (ev.button === 0) {
      mouse.digs++;
      mouse.dig = true;
    } else if (ev.button === 2) {
      mouse.places++;
      mouse.place = true;
    }
  });
  window.addEventListener("mouseup", (ev) => {
    if (ev.button === 0) mouse.dig = false;
    if (ev.button === 2) mouse.place = false;
  });
  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
  document.addEventListener("mousemove", (ev) => {
    if (document.pointerLockElement !== canvas) return;
    mouse.dx += ev.movementX;
    mouse.dy += ev.movementY;
  });
  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    mouse.scroll += Math.sign(ev.deltaY);
  }, { passive: false });
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement) mouse.dig = mouse.place = false;
  });
}

/** Suelta el puntero (al volver a un menú, que se maneja con el ratón). */
export function releasePointer() {
  if (pointerLocked()) document.exitPointerLock();
}

export class BlocksInput implements WalkSource {
  forward = 0;
  right = 0;
  jump = false;
  down = false;
  lookX = 0;
  lookY = 0;
  digHeld = false;
  placeHeld = false;
  private held = new Set<string>();
  private digs = 0;
  private places = 0;
  private slot = -1;
  private flies = 0;

  constructor(private keyboard: Keyboard) {}

  /** Cuenta una pulsación nueva (no mientras se mantiene). */
  private pressed(codes: readonly string[]): boolean {
    const now = this.keyboard.anyDown(codes);
    const key = codes[0];
    const was = this.held.has(key);
    if (now) this.held.add(key);
    else this.held.delete(key);
    return now && !was;
  }

  poll() {
    attachMouse();
    const kb = this.keyboard;
    const axis = (pos: string[], neg: string[]) => Number(kb.anyDown(pos)) - Number(kb.anyDown(neg));
    this.forward = axis(KEYS.forward, KEYS.back);
    this.right = axis(KEYS.right, KEYS.left);
    this.jump = kb.anyDown(KEYS.jump);
    this.down = kb.anyDown(KEYS.down);
    this.lookX = axis(KEYS.lookRight, KEYS.lookLeft);
    this.lookY = axis(KEYS.lookUp, KEYS.lookDown);
    if (this.pressed(KEYS.dig)) this.digs++;
    if (this.pressed(KEYS.place)) this.places++;
    if (this.pressed(KEYS.fly)) this.flies++;
    DIGITS.forEach((code, i) => {
      if (this.pressed([code])) this.slot = i;
    });
    this.digs += mouse.digs;
    this.places += mouse.places;
    mouse.digs = mouse.places = 0;
    this.digHeld = kb.anyDown(KEYS.dig) || mouse.dig;
    this.placeHeld = kb.anyDown(KEYS.place) || mouse.place;
  }

  takeMouse(): [number, number] {
    const d: [number, number] = [mouse.dx, mouse.dy];
    mouse.dx = mouse.dy = 0;
    return d;
  }

  takeDig(): boolean {
    if (this.digs <= 0) return false;
    this.digs--;
    return true;
  }

  takePlace(): boolean {
    if (this.places <= 0) return false;
    this.places--;
    return true;
  }

  takeSlot(): number {
    const s = this.slot;
    this.slot = -1;
    return s;
  }

  takeScroll(): number {
    const s = mouse.scroll;
    mouse.scroll = 0;
    return s;
  }

  takeFly(): boolean {
    if (this.flies <= 0) return false;
    this.flies--;
    return true;
  }
}

export const BLOCKS_HINT_1 = "WASD andar · ESPACIO saltar · F volar · RATÓN o FLECHAS mirar";
export const BLOCKS_HINT_2 = "CLIC/Q romper · CLIC DER./E poner · 1-9 o RUEDA bloque · J juego";
