// Sistema de armas: munición, recarga, cadencia, cambio de arma y mejora. Sin Three.js ni DOM, para poder
// probarlo con Vitest (nada de munición negativa ni duplicada al cambiar de arma).
import { STARTING_WEAPON, WEAPONS, weaponDef, type WeaponDef, type WeaponId } from "./defs";

export interface Ammo {
  mag: number;
  reserve: number;
}

export interface Shot {
  def: WeaponDef;
  pellets: number;
  spread: number;
}

/** Un arma sacada de la mano (la tiene el mejorador): qué es y con cuánta munición. */
export interface Held {
  id: WeaponId;
  upgraded: boolean;
  slot: number;
  mag: number;
  reserve: number;
}

export type WeaponState = "ready" | "reloading" | "switching";

/** Como en Black Ops 2: solo se llevan dos armas. */
export const MAX_SLOTS = 2;

const IDS = Object.keys(WEAPONS) as WeaponId[];

export class WeaponSystem {
  readonly slots: (WeaponId | null)[] = [STARTING_WEAPON, null];
  /** Abatido: solo dispara la pistola (con su propia munición) hasta que lo revivan. */
  sidearm = false;
  private savedPistol: Ammo | null = null;
  readonly ammo: Record<WeaponId, Ammo>;
  /** Qué armas están mejoradas. */
  readonly upg: Record<WeaponId, boolean>;
  index = 0;
  state: WeaponState = "ready";
  /** Segundos que quedan de la recarga o del cambio. */
  timer = 0;
  private cooldown = 0;
  /** Ventajas: Speed Cola (tiempo de recarga ×) y Double Tap (cadencia ×); y disparo automático forzado (ametralladora). */
  reloadScale = 1;
  rateScale = 1;
  autoAll = false;
  private reloadLen = 1;
  /** ¿El gatillo ya estaba pulsado? Para las semiautomáticas. */
  private held = false;

  constructor() {
    this.ammo = {} as Record<WeaponId, Ammo>;
    this.upg = {} as Record<WeaponId, boolean>;
    this.reset();
  }

  /** Definición viva de un arma (la mejorada si lo está). */
  def(id: WeaponId): WeaponDef {
    return weaponDef(id, this.upg[id]);
  }

  get currentId(): WeaponId | null {
    return this.sidearm ? STARTING_WEAPON : this.slots[this.index];
  }

  get current(): WeaponDef | null {
    const id = this.currentId;
    return id ? this.def(id) : null;
  }

  get currentAmmo(): Ammo {
    const id = this.currentId;
    return id ? this.ammo[id] : { mag: 0, reserve: 0 };
  }

  has(id: WeaponId): boolean {
    return this.slots.includes(id);
  }

  /** Bit por ranura con las mejoradas (para el snapshot). */
  get upgradeMask(): number {
    return this.slots.reduce<number>((m, id, i) => (id && this.upg[id] ? m | (1 << i) : m), 0);
  }

  /** Entrega un arma nueva (con su cargador y reserva) o, si ya la tiene, munición. */
  give(id: WeaponId, upgraded = false): boolean {
    const free = this.slots.findIndex((s) => s === null);
    if (this.has(id)) {
      const def = this.def(id);
      this.ammo[id].reserve = Math.min(def.reserveMax, this.ammo[id].reserve + def.magSize * 2);
      return true;
    }
    if (free < 0) {
      // Sin hueco: sustituye a la que lleva en la mano y esa pierde su mejora.
      const old = this.slots[this.index];
      if (old) this.upg[old] = false;
    }
    this.upg[id] = upgraded;
    const def = this.def(id);
    if (free >= 0) this.slots[free] = id;
    else this.slots[this.index] = id;
    this.ammo[id] = { mag: def.magSize, reserve: Math.round(def.reserveMax * 0.6) };
    if (free >= 0) this.select(free);
    else this.cancelTimers();
    return true;
  }

  /** Compra de munición: llena la reserva sin pasar del máximo del arma. */
  buyAmmo(id: WeaponId): void {
    this.ammo[id].reserve = this.def(id).reserveMax;
  }

  /** Mejora el arma que lleva en la mano y la deja con el cargador y la reserva llenos. */
  upgrade(id: WeaponId): void {
    if (!this.has(id)) return;
    this.upg[id] = true;
    const def = this.def(id);
    this.ammo[id] = { mag: def.magSize, reserve: def.reserveMax };
  }

  /** Saca el arma de la ranura (el mejorador se la queda). Pasa a otra si hay. */
  detach(slot: number): Held | null {
    const id = this.slots[slot];
    if (!id) return null;
    const out: Held = { id, upgraded: this.upg[id], slot, mag: this.ammo[id].mag, reserve: this.ammo[id].reserve };
    this.slots[slot] = null;
    this.upg[id] = false;
    this.cancelTimers();
    if (slot === this.index) {
      const next = this.slots.findIndex((s) => s !== null);
      if (next >= 0) {
        this.index = next;
        this.state = "switching";
        this.timer = 0.42;
      }
    }
    return out;
  }

  /** Devuelve un arma sacada (mejorada o no) a su ranura, o a otra libre, y la pone en la mano. */
  attach(h: Held, upgraded: boolean): void {
    if (this.has(h.id)) {
      // Ya tiene otra copia (compró una en la pared mientras tanto): se queda con la mejor.
      this.upg[h.id] = this.upg[h.id] || upgraded;
      const def = this.def(h.id);
      this.ammo[h.id] = { mag: def.magSize, reserve: def.reserveMax };
      return;
    }
    let slot = this.slots[h.slot] === null ? h.slot : this.slots.findIndex((s) => s === null);
    if (slot < 0) slot = this.index;
    const old = this.slots[slot];
    if (old) this.upg[old] = false;
    this.slots[slot] = h.id;
    this.upg[h.id] = upgraded;
    const def = this.def(h.id);
    this.ammo[h.id] = upgraded ? { mag: def.magSize, reserve: def.reserveMax } : { mag: h.mag, reserve: h.reserve };
    this.index = slot;
    this.state = "switching";
    this.timer = 0.42;
  }

  /** Pasa a la pistola de emergencia del abatido (cargador lleno y algo de reserva). */
  enterSidearm(): void {
    if (this.sidearm) return;
    this.savedPistol = { ...this.ammo[STARTING_WEAPON] };
    const def = weaponDef(STARTING_WEAPON, this.upg[STARTING_WEAPON]);
    this.ammo[STARTING_WEAPON] = { mag: def.magSize, reserve: 24 };
    this.sidearm = true;
    this.state = "ready";
    this.timer = 0;
  }

  /** Vuelve a las armas de siempre (con la munición de la pistola que tenía). */
  leaveSidearm(): void {
    if (!this.sidearm) return;
    if (this.savedPistol) this.ammo[STARTING_WEAPON] = this.savedPistol;
    this.savedPistol = null;
    this.sidearm = false;
    this.state = "ready";
    this.timer = 0;
  }

  select(slot: number): boolean {
    if (this.sidearm || slot < 0 || slot >= MAX_SLOTS) return false;
    const id = this.slots[slot];
    if (!id || slot === this.index) return false;
    this.index = slot;
    this.state = "switching";
    this.timer = 0.42;
    return true;
  }

  private cancelTimers(): void {
    if (this.state === "reloading") {
      this.state = "ready";
      this.timer = 0;
    }
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.state === "switching") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.state = "ready";
      }
    } else if (this.state === "reloading") {
      this.timer -= dt;
      if (this.timer <= 0) this.finishReload();
    }
  }

  startReload(): boolean {
    const def = this.current;
    if (!def || this.state !== "ready") return false;
    const a = this.ammo[def.id];
    if (a.mag >= def.magSize || a.reserve <= 0) return false;
    this.state = "reloading";
    this.reloadLen = def.reloadTime * this.reloadScale;
    this.timer = this.reloadLen;
    return true;
  }

  /** Vuelca reserva al cargador respetando los límites del arma. */
  private finishReload(): void {
    const def = this.current;
    this.state = "ready";
    this.timer = 0;
    if (!def) return;
    const a = this.ammo[def.id];
    const need = def.magSize - a.mag;
    const take = Math.min(need, a.reserve);
    a.mag += take;
    a.reserve -= take;
  }

  /**
   * Intenta disparar. `down` es el gatillo mantenido y `pressed` el flanco del clic.
   * Devuelve el disparo o null si no toca.
   */
  fire(down: boolean, pressed: boolean, free = false): Shot | null {
    const def = this.current;
    if (!def) return null;
    if (this.state !== "ready" || this.cooldown > 0) return null;
    const allowed = def.auto || this.autoAll ? down : pressed || (down && !this.held);
    this.held = down;
    if (!allowed) return null;
    const a = this.ammo[def.id];
    if (a.mag <= 0) {
      return null;
    }
    if (!free) a.mag -= 1; // con munición infinita no se gasta
    this.cooldown = 60 / (def.rpm * this.rateScale);
    return { def, pellets: def.pellets, spread: def.spread };
  }

  /** Sin una sola bala (ni en el cargador ni de reserva): toca el cuchillo. */
  get outOfAmmo(): boolean {
    const a = this.currentAmmo;
    return a.mag <= 0 && a.reserve <= 0;
  }

  /** Poder «munición máxima»: todas las armas que lleva, con el cargador y la reserva llenos. */
  refillAll(): void {
    for (const id of this.slots) {
      if (!id) continue;
      const def = this.def(id);
      this.ammo[id] = { mag: def.magSize, reserve: def.reserveMax };
    }
    if (this.state === "reloading") {
      this.state = "ready";
      this.timer = 0;
    }
  }

  /** Llena el cargador del arma de la mano (al empezar la munición infinita). */
  fillMag(): void {
    const def = this.current;
    if (def) this.ammo[def.id].mag = def.magSize;
  }

  /** ¿Está el cargador vacío? (para el chasquido en seco). */
  get empty(): boolean {
    return this.currentAmmo.mag <= 0;
  }

  get reloadProgress(): number {
    const def = this.current;
    if (!def || this.state !== "reloading") return 0;
    return 1 - this.timer / this.reloadLen;
  }

  /** Reinicio de partida. */
  reset(): void {
    this.slots[0] = STARTING_WEAPON;
    this.slots[1] = null;
    this.sidearm = false;
    this.savedPistol = null;
    this.index = 0;
    this.state = "ready";
    this.timer = 0;
    this.cooldown = 0;
    this.held = false;
    for (const id of IDS) {
      this.upg[id] = false;
      this.ammo[id] = { mag: WEAPONS[id].magSize, reserve: 0 };
    }
    this.ammo[STARTING_WEAPON] = { mag: WEAPONS[STARTING_WEAPON].magSize, reserve: 64 };
  }
}
