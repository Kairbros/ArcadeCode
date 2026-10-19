// Controles de Bloques: WASD para andar (Shift correr), ratón (capturado o arrastrando) o flechas para
// mirar, romper/poner con clic o Q/E, botón central para copiar el bloque apuntado, 1–9 o la rueda para
// elegir bloque y F para volar.
//
// El ratón funciona de tres maneras, según lo que permita la vista:
// - "locked": el puntero está capturado (navegador). Mirar = mover el ratón; clic = romper.
// - "drag": la vista no deja capturarlo (webview de VS Code): arrastrar con el botón izquierdo mira y un
//   clic sin arrastrar rompe.
// - "click": todavía no se ha pedido; el primer clic lo captura (si se puede).
import type { Keyboard } from "../core/keyboard";
import { VH, VW } from "./config";

const KEYS = {
  forward: ["KeyW"],
  back: ["KeyS"],
  left: ["KeyA"],
  right: ["KeyD"],
  jump: ["Space"],
  down: ["ShiftLeft", "ShiftRight"],
  // Correr con Shift (andando); volando, Shift baja. Ctrl+W cerraría la pestaña en el navegador.
  sprint: ["ShiftLeft", "ShiftRight"],
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
  /** Correr (Shift). */
  readonly sprint: boolean;
  /** Giro con teclas, cada eje en -1..1 (se multiplica por la velocidad de giro). */
  readonly lookX: number;
  readonly lookY: number;
  /** Movimiento del ratón acumulado desde la última llamada (píxeles). */
  takeMouse(): [number, number];
  readonly digHeld: boolean;
  readonly placeHeld: boolean;
  takeDig(): boolean;
  takePlace(): boolean;
  /** Botón central: copiar el bloque apuntado a la barra. */
  takePick(): boolean;
  /** Ranura elegida (0–8) o -1; la rueda da pasos relativos (takeScroll). */
  takeSlot(): number;
  takeScroll(): number;
  takeFly(): boolean;
  /** Último clic con el inventario abierto (coordenadas lógicas), o null. */
  takeUiClick(): [number, number] | null;
  /** Posición del ratón en coordenadas lógicas (para dibujar el montón del cursor). */
  uiPos(): [number, number];
}

// --- Ratón: estado compartido, enganchado una sola vez al lienzo del juego ---
const mouse = {
  dx: 0, dy: 0, digs: 0, places: 0, picks: 0, dig: false, place: false, scroll: 0, attached: false,
  /** El puntero no se puede capturar en esta vista: se mira arrastrando. */
  noLock: false,
  /** Botón que está arrastrando (0 = ninguno) y cuánto se ha movido desde que se pulsó. */
  drag: 0, dragged: 0, lastX: 0, lastY: 0,
  /** Inventario abierto: el ratón es del panel, no de la cámara. */
  uiOpen: false,
  uiX: VW / 2, uiY: VH / 2,
  uiClicks: [] as [number, number][],
};

/** Abre o cierra el modo interfaz: los clics van al panel y no se captura el puntero. */
export function setUiOpen(open: boolean) {
  mouse.uiOpen = open;
  mouse.dig = mouse.place = false;
  mouse.dx = mouse.dy = 0;
  mouse.uiClicks.length = 0;
  if (open) releasePointer();
}

/** Pasa un evento del ratón a coordenadas lógicas del lienzo. */
function logical(ev: MouseEvent): [number, number] {
  const c = typeof document !== "undefined" ? (document.getElementById("game") as HTMLCanvasElement | null) : null;
  if (!c) return [VW / 2, VH / 2];
  const r = c.getBoundingClientRect();
  return [((ev.clientX - r.left) / Math.max(1, r.width)) * VW, ((ev.clientY - r.top) / Math.max(1, r.height)) * VH];
}

/** Cómo se mira con el ratón ahora mismo (el HUD avisa según el caso). */
export function lookMode(): "locked" | "drag" | "click" {
  if (pointerLocked()) return "locked";
  return mouse.noLock ? "drag" : "click";
}

/** ¿El puntero está capturado por el juego? */
export function pointerLocked(): boolean {
  return typeof document !== "undefined" && !!document.pointerLockElement;
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
    // Si a los 400 ms no hay captura (la vista no lo permite y no avisa), se pasa a arrastrar.
    window.setTimeout(() => {
      if (!mouse.noLock && document.pointerLockElement !== canvas && !pointerLocked()) mouse.noLock = true;
    }, 400);
  };

  canvas.addEventListener("mousedown", (ev) => {
    if (mouse.uiOpen) {
      // Con el inventario abierto, el clic es para el panel (coordenadas lógicas del lienzo).
      mouse.uiClicks.push(logical(ev));
      ev.preventDefault();
      return;
    }
    if (ev.button === 1) {
      mouse.picks++; // botón central: copiar bloque (no arrastra ni rompe)
      ev.preventDefault();
      return;
    }
    if (!pointerLocked() && !mouse.noLock) {
      // El primer clic solo captura el puntero; el siguiente ya rompe/coloca.
      requestLock();
      return;
    }
    mouse.drag = ev.button;
    mouse.dragged = 0;
    mouse.lastX = ev.clientX;
    mouse.lastY = ev.clientY;
    if (ev.button === 0) mouse.dig = true;
    else if (ev.button === 2) mouse.place = true;
  });

  window.addEventListener("mouseup", (ev) => {
    if (ev.button === 0) mouse.dig = false;
    if (ev.button === 2) mouse.place = false;
    if (mouse.drag !== ev.button) return;
    // Un clic sin arrastrar cuenta como pulsación; si se ha arrastrado, era para mirar.
    if (mouse.dragged <= 4) {
      if (ev.button === 0) mouse.digs++;
      else if (ev.button === 2) mouse.places++;
    }
    mouse.drag = 0;
  });

  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());

  document.addEventListener("mousemove", (ev) => {
    if (mouse.uiOpen) {
      mouse.uiX = logical(ev)[0];
      mouse.uiY = logical(ev)[1];
      return;
    }
    if (pointerLocked()) {
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
    mouse.dx += dx;
    mouse.dy += dy;
  });

  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    if (!mouse.uiOpen) mouse.scroll += Math.sign(ev.deltaY);
  }, { passive: false });

  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas) return;
    mouse.dig = mouse.place = false;
    mouse.drag = 0;
  });
  document.addEventListener("pointerlockerror", () => (mouse.noLock = true));
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
  sprint = false;
  lookX = 0;
  lookY = 0;
  digHeld = false;
  placeHeld = false;
  private held = new Set<string>();
  private digs = 0;
  private places = 0;
  private picks = 0;
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
    this.forward = mouse.uiOpen ? 0 : axis(KEYS.forward, KEYS.back);
    this.right = mouse.uiOpen ? 0 : axis(KEYS.right, KEYS.left);
    this.jump = kb.anyDown(KEYS.jump);
    this.down = kb.anyDown(KEYS.down);
    this.sprint = kb.anyDown(KEYS.sprint);
    this.lookX = mouse.uiOpen ? 0 : axis(KEYS.lookRight, KEYS.lookLeft);
    this.lookY = mouse.uiOpen ? 0 : axis(KEYS.lookUp, KEYS.lookDown);
    if (this.pressed(KEYS.dig)) this.digs++;
    if (this.pressed(KEYS.place)) this.places++;
    if (this.pressed(KEYS.fly)) this.flies++;
    DIGITS.forEach((code, i) => {
      if (this.pressed([code])) this.slot = i;
    });
    if (!mouse.uiOpen) {
      this.digs += mouse.digs;
      this.places += mouse.places;
      this.picks += mouse.picks;
    }
    mouse.digs = mouse.places = mouse.picks = 0;
    this.digHeld = !mouse.uiOpen && (kb.anyDown(KEYS.dig) || mouse.dig);
    this.placeHeld = !mouse.uiOpen && (kb.anyDown(KEYS.place) || mouse.place);
  }

  takeUiClick(): [number, number] | null {
    const c = mouse.uiClicks.shift();
    return c ?? null;
  }

  uiPos(): [number, number] {
    return [mouse.uiX, mouse.uiY];
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

  takePick(): boolean {
    if (this.picks <= 0) return false;
    this.picks--;
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

export const BLOCKS_HINT_1 = "WASD andar · SHIFT correr · ESPACIO saltar · F volar";
export const BLOCKS_HINT_2 = "CLIC o Q romper · CLIC DER. o E poner · RUEDA bloque";
export const BLOCKS_HINT_3 = "1-9 bloque · CLIC CENTRAL copiar · J cambiar de juego";

// Supervivencia: no se vuela y se mina con tiempo; I abre la mochila.
export const BLOCKS_HINT_SURV_1 = "WASD andar · SHIFT correr · ESPACIO saltar · CLIC romper";
export const BLOCKS_HINT_SURV_2 = "CLIC DER. o E poner/comer · RUEDA o 1-9 objeto";
export const BLOCKS_HINT_SURV_3 = "I o C: mochila y fabricar · J cambiar de juego";
