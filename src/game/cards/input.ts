// Controles de «Mazo Loco»: el ratón elige carta y botones (es lo natural para una mano de cartas) y el
// teclado hace lo mismo sin ratón. Las pulsaciones se cuentan por flanco para que nada se repita solo.
import type { Keyboard } from "../core/keyboard";
import { CH, CW } from "./config";
import { canPlay, isWild } from "./deck";
import { actionRects, colorRects, hitHand, hitRect, type BtnId } from "./layout";
import { canAct, seatHand, type CardsSnap } from "./state";

/** Acción de un asiento: 1 jugar (carta `c`, color `k`) · 2 robar · 3 pasar · 4 decir UNO. */
export interface CardsAction {
  a: number;
  c: number;
  k: number;
}

const KEYS = {
  left: ["ArrowLeft"],
  right: ["ArrowRight"],
  ok: ["Space", "Enter", "NumpadEnter"],
  draw: ["KeyD"],
  pass: ["KeyP"],
  uno: ["KeyU"],
  cancel: ["Escape", "Backspace"],
} as const;
type Key = keyof typeof KEYS;

type Point = [number, number];
const mouse = {
  at: null as Point | null,
  moved: 0,
  clicks: [] as Point[],
  attached: false,
};

function logical(canvas: HTMLElement, ev: MouseEvent): Point {
  const r = canvas.getBoundingClientRect();
  return [((ev.clientX - r.left) / Math.max(1, r.width)) * CW, ((ev.clientY - r.top) / Math.max(1, r.height)) * CH];
}

function attachMouse(): void {
  if (mouse.attached || typeof document === "undefined") return;
  const canvas = document.getElementById("game");
  if (!canvas) return;
  mouse.attached = true;
  canvas.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    mouse.clicks.push(logical(canvas, ev));
  });
  canvas.addEventListener("mousemove", (ev) => {
    mouse.at = logical(canvas, ev);
    mouse.moved++;
  });
  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
}

export class CardsInput {
  /** Carta resaltada (la que se jugaría con ESPACIO). */
  hover = -1;
  /** Eligiendo color: `card` es el comodín que se va a bajar. */
  picking = false;
  pickHover = -1;
  private card = -1;
  private mode: "mouse" | "keys" = "mouse";
  private seenMoved = 0;
  private held: Record<Key, boolean> = { left: false, right: false, ok: false, draw: false, pass: false, uno: false, cancel: false };
  private presses: Record<Key, number> = { left: 0, right: 0, ok: 0, draw: 0, pass: 0, uno: 0, cancel: 0 };
  private digits = [0, 0, 0, 0];

  constructor(private keyboard: Keyboard) {
    attachMouse();
    mouse.clicks.length = 0; // clics gastados en el menú
    this.seenMoved = mouse.moved;
  }

  /** Lee el teclado una vez por fotograma (flancos de bajada). */
  poll(): void {
    for (const k of Object.keys(KEYS) as Key[]) {
      const down = this.keyboard.anyDown(KEYS[k]);
      if (down && !this.held[k]) this.presses[k]++;
      this.held[k] = down;
    }
    for (let i = 0; i < 4; i++) {
      const down = this.keyboard.isDown(`Digit${i + 1}`) || this.keyboard.isDown(`Numpad${i + 1}`);
      if (!down) this.digits[i] = 0;
      else if (this.digits[i] === 0) this.digits[i] = 1;
    }
  }

  private take(k: Key): boolean {
    if (this.presses[k] <= 0) return false;
    this.presses[k]--;
    return true;
  }

  /** ¿Se ha pulsado el número `i` (0..3) en este fotograma? */
  private takeDigit(i: number): boolean {
    if (this.digits[i] !== 1) return false;
    this.digits[i] = 2;
    return true;
  }

  clear(): void {
    for (const k of Object.keys(KEYS) as Key[]) this.presses[k] = 0;
    this.digits = [0, 0, 0, 0];
    mouse.clicks.length = 0;
  }

  /** Acción elegida este fotograma (o null). `buttons` son los que se ofrecen ahora. */
  step(s: CardsSnap, me: number, buttons: BtnId[]): CardsAction | null {
    const hand = seatHand(s, me);
    const myTurn = canAct(s, me);

    // Ratón: solo manda cuando se mueve (si no, la selección de teclado se quedaría pisada).
    if (mouse.moved !== this.seenMoved) {
      this.seenMoved = mouse.moved;
      this.mode = "mouse";
    }
    const m = mouse.at;
    if (this.mode === "mouse" && m) {
      if (this.picking) this.pickHover = hitRect(colorRects(), m[0], m[1]);
      else this.hover = hitHand(hand.length, m[0], m[1]);
    }

    // --- Elegir color del comodín
    if (this.picking) {
      if (this.take("cancel")) {
        this.picking = false;
        this.card = -1;
        return null;
      }
      for (let i = 0; i < 4; i++) if (this.takeDigit(i)) return this.finishPick(i);
      for (const [x, y] of mouse.clicks.splice(0)) {
        const i = hitRect(colorRects(), x, y);
        if (i >= 0) return this.finishPick(i);
        if (this.card >= 0) {
          this.picking = false;
          this.card = -1;
        }
        return null;
      }
      return null;
    }

    // --- Teclado
    const n = hand.length;
    if (n > 0) {
      if (this.take("right")) {
        this.mode = "keys";
        this.hover = this.hover < 0 ? 0 : (this.hover + 1) % n;
      }
      if (this.take("left")) {
        this.mode = "keys";
        this.hover = this.hover < 0 ? n - 1 : (this.hover + n - 1) % n;
      }
    }
    if (this.take("ok") && myTurn && this.hover >= 0 && this.hover < n && canPlay(hand[this.hover], s.tp, s.co)) {
      return this.play(hand, this.hover);
    }
    if (this.take("draw") && myTurn && s.dw[me] !== 1 && buttons.includes("draw")) return { a: 2, c: 0, k: -1 };
    if (this.take("pass") && myTurn && s.dw[me] === 1 && buttons.includes("pass")) return { a: 3, c: 0, k: -1 };
    if (this.take("uno") && buttons.includes("uno")) return { a: 4, c: 0, k: -1 };

    // --- Clics: primero los botones y después las cartas
    for (const [x, y] of mouse.clicks.splice(0)) {
      for (const { id, r } of actionRects(buttons)) {
        if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
        if (id === "draw") return { a: 2, c: 0, k: -1 };
        if (id === "pass") return { a: 3, c: 0, k: -1 };
        if (id === "uno") return { a: 4, c: 0, k: -1 };
        return null;
      }
      const i = hitHand(hand.length, x, y);
      if (i < 0 || !myTurn) continue;
      // Carta que no liga: la mesa avisa (acción 0) en vez de no hacer nada.
      if (!canPlay(hand[i], s.tp, s.co)) return { a: 0, c: i, k: -1 };
      return this.play(hand, i);
    }
    return null;
  }

  /** Bajar una carta: si es comodín se abre el selector de color. */
  private play(hand: number[], index: number): CardsAction | null {
    const id = hand[index];
    if (id === undefined) return null;
    if (isWild(id)) {
      this.picking = true;
      this.card = index;
      this.pickHover = -1;
      return null;
    }
    return { a: 1, c: index, k: -1 };
  }

  private finishPick(color: number): CardsAction {
    const card = this.card;
    this.picking = false;
    this.card = -1;
    return { a: 1, c: card, k: color };
  }
}
