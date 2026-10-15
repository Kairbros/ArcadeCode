// Fuentes de intención: teclado local o jugador remoto. El juego no distingue entre ellas.
import type { Dir } from "./components";
import type { ControlScheme } from "./config";
import type { Keyboard } from "../core/keyboard";

export interface IntentSource {
  /** Actualiza el estado desde su origen (teclado, red...). Se llama una vez por frame. */
  poll(): void;
  readonly dx: number;
  readonly dy: number;
  readonly alt: Dir | null;
  /** Consume una pulsación de bomba pendiente. */
  takeBomb(): boolean;
}

function mergeSchemes(schemes: ControlScheme[]): ControlScheme {
  return {
    up: schemes.flatMap((s) => s.up),
    down: schemes.flatMap((s) => s.down),
    left: schemes.flatMap((s) => s.left),
    right: schemes.flatMap((s) => s.right),
    bomb: schemes.flatMap((s) => s.bomb),
  };
}

/** Teclado local. Admite varios esquemas a la vez (en red: WASD o flechas). */
export class LocalController implements IntentSource {
  dx = 0;
  dy = 0;
  alt: Dir | null = null;
  private readonly scheme: ControlScheme;
  private prev = new Map<string, boolean>();
  private priority: "h" | "v" = "h";
  private bombHeld = false;
  private pendingBombs = 0;

  constructor(private keyboard: Keyboard, ...schemes: ControlScheme[]) {
    this.scheme = mergeSchemes(schemes);
  }

  poll() {
    const kb = this.keyboard;
    const s = this.scheme;
    // La última tecla pulsada decide el eje prioritario (giros fluidos en esquinas).
    const axes: [string[], "h" | "v"][] = [[s.left, "h"], [s.right, "h"], [s.up, "v"], [s.down, "v"]];
    for (const [codes, axis] of axes) {
      for (const code of codes) {
        const down = kb.isDown(code);
        if (down && !this.prev.get(code)) this.priority = axis;
        this.prev.set(code, down);
      }
    }

    const h = Number(kb.anyDown(s.right)) - Number(kb.anyDown(s.left));
    const v = Number(kb.anyDown(s.down)) - Number(kb.anyDown(s.up));
    this.alt = null;
    if (h && v) {
      if (this.priority === "h") {
        [this.dx, this.dy, this.alt] = [h, 0, [0, v]];
      } else {
        [this.dx, this.dy, this.alt] = [0, v, [h, 0]];
      }
    } else {
      [this.dx, this.dy] = [h, v];
    }

    const bombDown = kb.anyDown(s.bomb);
    if (bombDown && !this.bombHeld) this.pendingBombs++;
    this.bombHeld = bombDown;
  }

  takeBomb(): boolean {
    if (this.pendingBombs <= 0) return false;
    this.pendingBombs--;
    return true;
  }
}

/** Mensaje de entrada que un invitado envía al anfitrión. */
export interface InputMessage {
  t: "in";
  dx: number;
  dy: number;
  ax: number; // alt (0,0 = sin alternativa)
  ay: number;
  b: number; // contador acumulado de pulsaciones de bomba
  s?: number; // número de secuencia: por el relé pueden llegar desordenados
}

const unit = (v: unknown) => Math.sign(Number(v)) || 0;

/** Jugador remoto: su estado lo rellenan los mensajes de red. */
export class RemoteController implements IntentSource {
  dx = 0;
  dy = 0;
  alt: Dir | null = null;
  connected = true;
  private lastBombCount = 0;
  private pendingBombs = 0;
  private lastSeq = -1;

  poll() {
    if (!this.connected) {
      this.dx = this.dy = 0;
      this.alt = null;
    }
  }

  apply(msg: InputMessage) {
    if (msg.s !== undefined) {
      const s = Number(msg.s);
      if (!(s > this.lastSeq)) return; // mensaje antiguo que llegó tarde
      this.lastSeq = s;
    }
    this.dx = unit(msg.dx);
    this.dy = unit(msg.dy);
    const ax = unit(msg.ax);
    const ay = unit(msg.ay);
    this.alt = ax || ay ? [ax, ay] : null;
    const b = Math.floor(Number(msg.b)) || 0;
    if (b > this.lastBombCount) {
      this.pendingBombs += Math.min(b - this.lastBombCount, 3);
      this.lastBombCount = b;
    }
  }

  takeBomb(): boolean {
    if (this.pendingBombs <= 0) return false;
    this.pendingBombs--;
    return true;
  }
}
