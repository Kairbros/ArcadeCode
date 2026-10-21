// Controles de Bloques: WASD para andar, ratón (con el puntero capturado) o flechas para mirar,
// romper con clic/Q, poner con clic derecho/Enter, 1–9 o la rueda para elegir, F para volar (creativo),
// E/Tab/I para el inventario (supervivencia). Con el inventario abierto el puntero queda libre y los
// clics van a las ranuras. La vista de VS Code sí deja capturar el puntero.
import type { Keyboard } from "../core/keyboard";
import { VH, VW } from "./config";

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
  place: ["Enter", "NumpadEnter"],
  fly: ["KeyF"],
  inventory: ["KeyE", "Tab", "KeyI"],
};

/** Clic en la pantalla del inventario, en unidades lógicas del lienzo. */
export interface UiClick {
  x: number;
  y: number;
  button: number;
  shift: boolean;
}
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
  takeInventory(): boolean;
  /** Romper con el ratón (en supervivencia Q no rompe: tira). */
  readonly digMouse: boolean;
  /** Supervivencia: Q tira uno del objeto en la mano (1) o, con Ctrl, el montón entero (2); 0 = nada. */
  takeThrow(): 0 | 1 | 2;
  /** Con el inventario abierto: el ratón no se captura y los clics se guardan para las ranuras. */
  setUi(open: boolean): void;
  takeClicks(): UiClick[];
  /** Posición del puntero libre (unidades lógicas). */
  readonly cursor: [number, number];
}

// --- Ratón: estado compartido, enganchado una sola vez al lienzo del juego ---
const mouse = {
  dx: 0, dy: 0, digs: 0, places: 0, dig: false, place: false, scroll: 0, attached: false,
  ui: false, clicks: [] as UiClick[], cursor: [VW / 2, VH / 2] as [number, number],
};

/** Punto de la pantalla en unidades lógicas del lienzo del juego. */
function logical(canvas: HTMLElement, ev: MouseEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((ev.clientX - r.left) / r.width) * VW, ((ev.clientY - r.top) / r.height) * VH];
}

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
    if (mouse.ui) {
      const [x, y] = logical(canvas, ev);
      mouse.clicks.push({ x, y, button: ev.button, shift: ev.shiftKey });
      return;
    }
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
    if (document.pointerLockElement !== canvas) {
      mouse.cursor = logical(canvas, ev);
      return;
    }
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
  digMouse = false;
  placeHeld = false;
  private held = new Set<string>();
  private throws: (1 | 2)[] = [];
  private digs = 0;
  private places = 0;
  private slot = -1;
  private flies = 0;
  private invs = 0;

  get cursor(): [number, number] {
    return mouse.cursor;
  }

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
    if (this.pressed(KEYS.dig)) {
      this.digs++;
      this.throws.push(kb.anyDown(["ControlLeft", "ControlRight"]) ? 2 : 1);
      if (this.throws.length > 4) this.throws.shift(); // en creativo nadie las recoge
    }
    if (this.pressed(KEYS.place)) this.places++;
    if (this.pressed(KEYS.fly)) this.flies++;
    if (this.pressed(KEYS.inventory)) this.invs++;
    DIGITS.forEach((code, i) => {
      if (this.pressed([code])) this.slot = i;
    });
    this.digs += mouse.digs;
    this.places += mouse.places;
    mouse.digs = mouse.places = 0;
    this.digHeld = kb.anyDown(KEYS.dig) || mouse.dig;
    this.digMouse = mouse.dig;
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

  takeInventory(): boolean {
    if (this.invs <= 0) return false;
    this.invs--;
    return true;
  }

  takeThrow(): 0 | 1 | 2 {
    return this.throws.shift() ?? 0;
  }

  setUi(open: boolean) {
    if (open === mouse.ui) return;
    mouse.ui = open;
    mouse.clicks = [];
    mouse.dig = mouse.place = false;
    if (open) releasePointer();
  }

  takeClicks(): UiClick[] {
    const c = mouse.clicks;
    mouse.clicks = [];
    return c;
  }
}

export const BLOCKS_HINT_1 = "WASD andar · ESPACIO saltar · F volar · RATÓN o FLECHAS mirar";
export const BLOCKS_HINT_2 = "CLIC/Q romper · CLIC DER./ENTER poner · 1-9 o RUEDA bloque · J juego";
export const SURVIVAL_HINT_1 = "WASD andar · ESPACIO saltar · RATÓN mirar · E inventario · Q tirar";
export const SURVIVAL_HINT_2 = "CLIC golpear · MANTÉN romper · CLIC DER. poner/comer/mesa · 1-9";
