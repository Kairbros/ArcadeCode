// Controles de Billar: el taco apunta al cursor, la barra de la izquierda da la potencia (arrastra y suelta
// para tirar), la bola de abajo a la izquierda da el efecto. Sin ratón: A/D giran, W/S potencia, Espacio tira.
import type { Keyboard } from "../core/keyboard";
import type { PoolControl } from "./match";
import { BAR, PH, POCKET_PICK, POCKETS, PW, SPIN, TH, TW, toWorld } from "./config";

const KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  fire: ["Space", "Enter", "NumpadEnter"],
  slow: ["ShiftLeft", "ShiftRight"],
  nextPocket: ["KeyE"],
  prevPocket: ["KeyQ"],
  resetSpin: ["KeyX"],
  spinLeft: ["KeyZ"],
  spinRight: ["KeyC"],
  spinUp: ["KeyF"],
  spinDown: ["KeyV"],
};

const mouse = {
  attached: false,
  /** Posición en el lienzo lógico (null = sin ratón). */
  at: null as [number, number] | null,
  moved: false,
  barDrag: false,
  spinDrag: false,
  releaseBar: false,
  /** Botón derecho mantenido: puntería fina. */
  right: false,
  clicks: [] as [number, number][],
  spinResets: 0,
  wheel: 0,
};

function logical(canvas: HTMLElement, ev: MouseEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((ev.clientX - r.left) / r.width) * PW, ((ev.clientY - r.top) / r.height) * PH];
}

const inBar = (x: number, y: number) => x >= BAR.x - 3 && x <= BAR.x + BAR.w + 5 && y >= BAR.y - 6 && y <= BAR.y + BAR.h + 6;
const inSpin = (x: number, y: number) => Math.hypot(x - SPIN.x, y - SPIN.y) <= SPIN.r + 3;

function attachMouse() {
  if (mouse.attached || typeof document === "undefined") return;
  const canvas = document.getElementById("game");
  if (!canvas) return;
  mouse.attached = true;
  canvas.addEventListener("mousedown", (ev) => {
    const p = logical(canvas, ev);
    mouse.at = p;
    mouse.moved = true;
    if (ev.button === 2) {
      if (inSpin(p[0], p[1])) mouse.spinResets++;
      else mouse.right = true;
      return;
    }
    if (ev.button !== 0) return;
    if (inBar(p[0], p[1])) mouse.barDrag = true;
    else if (inSpin(p[0], p[1])) mouse.spinDrag = true;
    else mouse.clicks.push(p);
  });
  window.addEventListener("mousemove", (ev) => {
    mouse.at = logical(canvas, ev);
    mouse.moved = true;
  });
  window.addEventListener("mouseup", (ev) => {
    if (ev.button === 2) mouse.right = false;
    if (ev.button !== 0) return;
    if (mouse.barDrag) mouse.releaseBar = true;
    mouse.barDrag = false;
    mouse.spinDrag = false;
  });
  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      mouse.wheel += Math.sign(ev.deltaY);
    },
    { passive: false },
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class PoolInput implements PoolControl {
  angle = 0;
  power = 0.45;
  top = 0;
  side = 0;
  call = -1;
  cursor: [number, number] | null = null;
  private fires = 0;
  private places = 0;
  private fireHeld = false;
  private mode: "mouse" | "keys" = "keys";
  private wasPlacing = false;
  private last = 0;
  private holdT = 0;
  private lastTarget = NaN;

  constructor(private keyboard: Keyboard) {
    attachMouse();
  }

  poll(cueX: number, cueY: number, placing: boolean) {
    const now = performance.now();
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    const kb = this.keyboard;
    const slow = kb.anyDown(KEYS.slow) ? 0.2 : 1;

    const fire = kb.anyDown(KEYS.fire);
    if (fire && !this.fireHeld) {
      this.fires++;
      this.places++;
    }
    this.fireHeld = fire;

    // Ratón: barra de potencia, efecto, rueda y clics en la mesa.
    const m = mouse.at;
    if (mouse.moved) {
      mouse.moved = false;
      this.mode = "mouse";
    }
    if (m && mouse.barDrag) this.power = clamp((m[1] - BAR.y) / BAR.h, 0, 1);
    if (mouse.releaseBar) {
      mouse.releaseBar = false;
      if (this.power > 0.05) this.fires++;
    }
    if (m && mouse.spinDrag) {
      let sx = (m[0] - SPIN.x) / SPIN.r, sy = (m[1] - SPIN.y) / SPIN.r;
      const l = Math.hypot(sx, sy);
      if (l > 1) {
        sx /= l;
        sy /= l;
      }
      this.side = sx;
      this.top = -sy;
    }
    // Efecto con teclado: Z/C lado, F/V arriba (sigue) y abajo (retrocede).
    const sk = Number(kb.anyDown(KEYS.spinRight)) - Number(kb.anyDown(KEYS.spinLeft));
    const tk = Number(kb.anyDown(KEYS.spinUp)) - Number(kb.anyDown(KEYS.spinDown));
    if (sk || tk) {
      this.side = clamp(this.side + sk * 1.2 * dt, -1, 1);
      this.top = clamp(this.top + tk * 1.2 * dt, -1, 1);
    }
    if (mouse.spinResets > 0 || kb.anyDown(KEYS.resetSpin)) {
      mouse.spinResets = 0;
      this.side = this.top = 0;
    }
    if (mouse.wheel) {
      this.power = clamp(this.power - mouse.wheel * (slow < 1 || mouse.right ? 0.01 : 0.04), 0, 1);
      mouse.wheel = 0;
    }
    for (const c of mouse.clicks.splice(0)) {
      const [wx, wy] = toWorld(c[0], c[1]);
      const onTable = Math.abs(wx) <= TW / 2 + 12 && Math.abs(wy) <= TH / 2 + 12;
      if (!onTable) continue;
      const near = placing ? -1 : POCKETS.findIndex(([px, py]) => Math.hypot(px - wx, py - wy) < POCKET_PICK);
      if (near >= 0) this.call = near;
      else this.places++;
    }

    // Teclado.
    const turn = Number(kb.anyDown(KEYS.right)) - Number(kb.anyDown(KEYS.left));
    const lift = Number(kb.anyDown(KEYS.up)) - Number(kb.anyDown(KEYS.down));
    if (placing) {
      if (!this.wasPlacing || !this.cursor) this.cursor = [cueX, cueY];
      if (turn || lift) {
        this.mode = "keys";
        this.cursor = [this.cursor[0] + turn * 70 * dt * slow, this.cursor[1] - lift * 70 * dt * slow];
      } else if (this.mode === "mouse" && m) {
        this.cursor = toWorld(m[0], m[1]);
      }
    } else {
      this.cursor = null;
      const fine = slow < 1 || mouse.right;
      if (turn) {
        // Un toque mueve poco; sostener acelera. Con Shift va todo cinco veces más lento.
        this.mode = "keys";
        this.holdT += dt;
        this.angle += turn * Math.min(1.2, 0.12 + this.holdT * 1.1) * dt * (fine ? 0.2 : 1);
      } else {
        this.holdT = 0;
      }
      if (lift) this.power = clamp(this.power + lift * 0.5 * dt * (fine ? 0.2 : 1), 0, 1);
      if (this.mode === "mouse" && m && !mouse.barDrag) {
        const [wx, wy] = toWorld(m[0], m[1]);
        if (Math.hypot(wx - cueX, wy - cueY) > 14) {
          const target = Math.atan2(wy - cueY, wx - cueX);
          if (fine) {
            // Puntería fina: el taco gira solo una fracción de lo que gira el cursor alrededor de la blanca.
            if (!Number.isNaN(this.lastTarget)) this.angle += wrap(target - this.lastTarget) * 0.15;
          } else {
            // Sigue al cursor con suavizado: sin temblores ni saltos al cruzar cerca de la blanca.
            this.angle += wrap(target - this.angle) * Math.min(1, dt * 26);
          }
          this.lastTarget = target;
        } else {
          this.lastTarget = NaN;
        }
      } else {
        this.lastTarget = NaN;
      }
      const pk = Number(kb.anyDown(KEYS.nextPocket)) - Number(kb.anyDown(KEYS.prevPocket));
      if (pk && now - this.pocketAt > 180) {
        this.pocketAt = now;
        this.call = (((this.call + pk) % 6) + 6) % 6;
      }
    }
    this.wasPlacing = placing;
    if (!placing && this.fires === 0) this.places = 0;
  }

  private pocketAt = 0;

  takeFire(): boolean {
    if (this.fires <= 0) return false;
    this.fires--;
    return true;
  }

  takePlace(): boolean {
    if (this.places <= 0) return false;
    this.places--;
    return true;
  }

  clearSpin() {
    this.top = this.side = 0;
    this.call = -1;
  }
}

export const POOL_HINT = "RATON apuntar (SHIFT o clic dcho: fino) · BARRA potencia";
export const POOL_SPIN_HINT = "EFECTO: clic en la bola · Z C F V · X centro";
export const POOL_PLACE_HINT = "Coloca la blanca: mueve y haz clic · ESPACIO";