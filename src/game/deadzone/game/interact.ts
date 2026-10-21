// Interacciones: puertas comprables, compras de pared (arma/munición), reparación de barricadas y las tres
// máquinas del mapa: la CAJA MISTERIOSA (gira entre armas y se la ofrece a quien paga), el MEJORADOR (necesita la
// energía, se queda el arma unos segundos y la devuelve mejorada) y el INTERRUPTOR de la energía.
// Es lógica del anfitrión: cada jugador tiene sus propios puntos y armas (`PlayerCtx`), y las puertas, ventanas y
// máquinas son de todos. Devuelve el cartel que ve el HUD y ejecuta la acción.
import * as THREE from "three";
import { BOX_POOL, UPGRADE_PRICE, WEAPONS, weaponAt, weaponIndex, weaponDef, type WeaponId } from "../weapons/defs";
import type { Held, WeaponSystem } from "../weapons/system";
import type { Points } from "./points";
import type { BarricadeWindow, BuiltMap } from "../world/map";
import { MAX_PLANKS } from "../world/map";
import { dist2D } from "../core/math";

export type InteractKind = "door" | "buy" | "box" | "boxTake" | "window" | "power" | "upgrade" | "upgradeTake" | "info";

export interface Prompt {
  kind: InteractKind;
  label: string;
  cost: number;
  id: string;
  /** Mantener E en vez de pulsar. */
  hold?: boolean;
}

/** Lo que es propio de cada jugador. */
export interface PlayerCtx {
  points: Points;
  weapons: WeaponSystem;
}

export interface InteractHooks {
  /** Aviso para el jugador `who` (en pantalla) y sonido (comprar, negar, caja, reparar…). */
  toast: (who: number, msg: string, kind?: "info" | "good" | "bad") => void;
  sound: (who: number, name: "buy" | "deny" | "boxOpen" | "repair" | "papStart" | "papDone" | "power" | "boxTick") => void;
  onDoorOpen: (id: string) => void;
  onWeaponChange: (who: number) => void;
  /** Contexto de cada jugador (para entregar el premio de la caja a quien la abrió). */
  ctxOf: (who: number) => PlayerCtx | null;
}

/** Duración de la ruleta de la caja, tiempo que se ofrece el arma y duración del mejorador (s). */
export const BOX_ROLL = 4.2;
export const BOX_OFFER = 9;
export const UPGRADE_WORK = 3.6;
export const UPGRADE_OFFER = 15;

export class Interactions {
  private boxT = 0;
  private boxFinal: WeaponId | null = null;
  private boxWho = -1;
  private boxSwap = 0;
  private upT = 0;
  private upHeld: Held | null = null;
  private upWho = -1;
  private readonly repairT = [0, 0, 0, 0];

  constructor(
    readonly map: BuiltMap,
    private hooks: InteractHooks,
  ) {}

  get boxBusy(): boolean {
    return this.map.box.phase !== 0;
  }

  get upgraderBusy(): boolean {
    return this.map.upgrader.phase !== 0;
  }

  /** Objetivo accionable más cercano al que se mira (se puntúa por dirección y distancia). */
  find(eye: THREE.Vector3, forward: THREE.Vector3, ctx: PlayerCtx, who: number): Prompt | null {
    const weapons = ctx.weapons;
    const candidates: { prompt: Prompt; score: number }[] = [];
    /** Cuanto más al centro de la mira y más cerca, mejor puntuación. */
    const scoreOf = (x: number, z: number, weight = 1): number => {
      const dx = x - eye.x;
      const dz = z - eye.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.001) return 2;
      const facing = (dx / dist) * forward.x + (dz / dist) * forward.z;
      return facing * weight - dist * 0.12;
    };

    // Barricada a medio romper.
    for (const w of this.map.windows) {
      if (w.planks >= MAX_PLANKS) continue;
      const dist = dist2D(eye.x, eye.z, w.inner.x, w.inner.z);
      if (dist > 2.4) continue;
      candidates.push({
        prompt: {
          kind: "window",
          label: `REPARAR BARRICADA (${w.planks}/${MAX_PLANKS})`,
          cost: 0,
          id: w.id,
          hold: true,
        },
        score: scoreOf(w.x, w.z, 0.9) + 0.25,
      });
    }
    // Puertas cerradas.
    for (const d of this.map.doors) {
      if (d.open) continue;
      const dist = dist2D(eye.x, eye.z, d.x, d.z);
      if (dist > 2.8) continue;
      candidates.push({
        prompt: { kind: "door", label: `ABRIR ${d.label}`, cost: d.cost, id: d.id },
        score: scoreOf(d.x, d.z),
      });
    }
    // Compras de pared.
    for (const b of this.map.buys) {
      const dist = Math.hypot(b.position.x - eye.x, b.position.z - eye.z);
      if (dist > 2.6) continue;
      const facing = ((b.position.x - eye.x) / dist) * forward.x + ((b.position.z - eye.z) / dist) * forward.z;
      if (facing < 0.2) continue;
      const def = WEAPONS[b.spec.weaponId as WeaponId];
      const owns = weapons.has(def.id);
      candidates.push({
        prompt: {
          kind: "buy",
          label: owns ? `MUNICIÓN ${def.name}` : `COMPRAR ${def.name}`,
          cost: owns ? def.ammoPrice : def.price,
          id: b.spec.id,
        },
        score: scoreOf(b.position.x, b.position.z),
      });
    }
    // Caja misteriosa.
    const box = this.map.box;
    if (dist2D(eye.x, eye.z, box.position.x, box.position.z) < 2.7) {
      let prompt: Prompt;
      if (box.phase === 0) prompt = { kind: "box", label: "CAJA MISTERIOSA", cost: box.price, id: "mystery_box" };
      else if (box.phase === 2 && this.boxWho === who && this.boxFinal) {
        prompt = { kind: "boxTake", label: `COGER ${weaponDef(this.boxFinal).name}`, cost: 0, id: "mystery_box" };
      } else prompt = { kind: "info", label: box.phase === 1 ? "LA CAJA ESTÁ GIRANDO…" : "ARMA DE OTRO JUGADOR", cost: 0, id: "mystery_box" };
      candidates.push({ prompt, score: scoreOf(box.position.x, box.position.z) + 0.4 });
    }
    // Mejorador de armas.
    const up = this.map.upgrader;
    if (dist2D(eye.x, eye.z, up.position.x, up.position.z) < 2.9) {
      let prompt: Prompt;
      const cur = weapons.currentId;
      if (up.phase === 2 && this.upWho === who && this.upHeld) {
        prompt = { kind: "upgradeTake", label: `COGER ${weaponDef(this.upHeld.id, true).name}`, cost: 0, id: "upgrader" };
      } else if (!this.map.power.on) {
        prompt = { kind: "info", label: "SIN ENERGÍA · ACTIVA EL INTERRUPTOR", cost: 0, id: "upgrader" };
      } else if (up.phase !== 0) {
        prompt = { kind: "info", label: "MEJORADOR OCUPADO", cost: 0, id: "upgrader" };
      } else if (!cur) {
        prompt = { kind: "info", label: "NO LLEVAS ARMA", cost: 0, id: "upgrader" };
      } else if (weapons.upg[cur]) {
        prompt = { kind: "info", label: "ARMA YA MEJORADA", cost: 0, id: "upgrader" };
      } else {
        prompt = { kind: "upgrade", label: `MEJORAR ${WEAPONS[cur].name}`, cost: UPGRADE_PRICE, id: "upgrader" };
      }
      candidates.push({ prompt, score: scoreOf(up.position.x, up.position.z) + 0.4 });
    }
    // Interruptor de la energía.
    const pw = this.map.power;
    if (!pw.on && dist2D(eye.x, eye.z, pw.position.x, pw.position.z) < 2.4) {
      candidates.push({ prompt: { kind: "power", label: "ACTIVAR LA ENERGÍA", cost: 0, id: "power" }, score: scoreOf(pw.position.x, pw.position.z) + 0.4 });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].prompt;
  }

  /** Ejecuta el objetivo para el jugador `who`. Devuelve true si ha hecho algo (aunque sea negar). */
  use(p: Prompt, who: number, ctx: PlayerCtx): boolean {
    const { points, weapons } = ctx;
    const deny = () => {
      this.hooks.sound(who, "deny");
      this.hooks.toast(who, `FALTAN ${p.cost - points.balance} PUNTOS`, "bad");
      return true;
    };
    switch (p.kind) {
      case "door": {
        const door = this.map.doors.find((d) => d.id === p.id);
        if (!door || door.open) return false;
        if (!points.spend(p.cost)) return deny();
        door.open = true;
        door.collider.enabled = false;
        this.hooks.sound(who, "buy");
        this.hooks.onDoorOpen(p.id);
        this.hooks.toast(who, `${door.label} ABIERTA · −${p.cost}`, "good");
        return true;
      }
      case "buy": {
        const item = this.map.buys.find((b) => b.spec.id === p.id);
        if (!item) return false;
        const def = WEAPONS[item.spec.weaponId as WeaponId];
        // El precio se calcula aquí, con lo que lleva ahora (no con lo que vio el cliente).
        const owns = weapons.has(def.id);
        const cost = owns ? weapons.def(def.id).ammoPrice : def.price;
        if (!points.spend(cost)) return deny();
        if (owns) {
          weapons.buyAmmo(def.id);
          this.hooks.sound(who, "buy");
          this.hooks.toast(who, `MUNICIÓN ${weapons.def(def.id).name} · −${cost}`, "good");
        } else {
          weapons.give(def.id);
          this.hooks.sound(who, "buy");
          this.hooks.toast(who, `${def.name} COMPRADA · −${cost}`, "good");
          this.hooks.onWeaponChange(who);
        }
        return true;
      }
      case "box": {
        if (this.boxBusy) return false;
        if (!points.spend(this.map.box.price)) return deny();
        // No sale un arma que ya lleva (salvo que las lleve todas).
        const pool = BOX_POOL.filter((id) => !weapons.has(id));
        const from = pool.length ? pool : BOX_POOL;
        this.boxFinal = from[Math.floor(Math.random() * from.length)];
        this.boxWho = who;
        this.boxT = 0;
        this.boxSwap = 0;
        this.map.box.phase = 1;
        this.map.box.shown = from[Math.floor(Math.random() * from.length)];
        this.hooks.sound(who, "boxOpen");
        this.hooks.toast(who, `LA CAJA ESTÁ GIRANDO… · −${this.map.box.price}`, "info");
        return true;
      }
      case "boxTake": {
        if (this.map.box.phase !== 2 || this.boxWho !== who || !this.boxFinal) return false;
        const id = this.boxFinal;
        this.closeBox();
        weapons.give(id);
        this.hooks.sound(who, "buy");
        this.hooks.toast(who, `¡${WEAPONS[id].name}!`, "good");
        this.hooks.onWeaponChange(who);
        return true;
      }
      case "power": {
        if (this.map.power.on) return false;
        this.map.power.on = true;
        this.hooks.sound(who, "power");
        this.hooks.toast(-1, "¡LA ENERGÍA ESTÁ ACTIVA! EL MEJORADOR FUNCIONA", "good");
        return true;
      }
      case "upgrade": {
        const up = this.map.upgrader;
        const id = weapons.currentId;
        if (!this.map.power.on || up.phase !== 0 || !id || weapons.upg[id]) return false;
        if (!points.spend(UPGRADE_PRICE)) return deny();
        const held = weapons.detach(weapons.index);
        if (!held) return false;
        this.upHeld = held;
        this.upWho = who;
        this.upT = 0;
        up.phase = 1;
        up.shown = held.id;
        up.shownUpgraded = false;
        this.hooks.sound(who, "papStart");
        this.hooks.toast(who, `MEJORANDO ${WEAPONS[held.id].name}… · −${UPGRADE_PRICE}`, "info");
        this.hooks.onWeaponChange(who);
        return true;
      }
      case "upgradeTake": {
        if (this.map.upgrader.phase !== 2 || this.upWho !== who || !this.upHeld) return false;
        this.returnUpgraded(ctx, who);
        return true;
      }
      case "window":
      case "info":
        return false;
    }
  }

  /** Entrega el arma mejorada que tiene el mejorador y libera la máquina. */
  private returnUpgraded(ctx: PlayerCtx | null, who: number): void {
    const held = this.upHeld;
    this.upHeld = null;
    this.upWho = -1;
    const up = this.map.upgrader;
    up.phase = 0;
    up.shown = null;
    if (!held || !ctx) return;
    ctx.weapons.attach(held, true);
    this.hooks.sound(who, "buy");
    this.hooks.toast(who, `¡${weaponDef(held.id, true).name}!`, "good");
    this.hooks.onWeaponChange(who);
  }

  private closeBox(): void {
    const box = this.map.box;
    box.phase = 0;
    box.shown = null;
    box.left = 0;
    this.boxFinal = null;
    this.boxWho = -1;
    this.boxT = 0;
  }

  /** Reparar barricada: hay que mantener E. Devuelve el número de tablones puestos. */
  repair(dt: number, held: boolean, p: Prompt | null, who: number, ctx: PlayerCtx): number {
    if (!held || !p || p.kind !== "window") {
      this.repairT[who] = 0;
      return 0;
    }
    const w = this.map.windows.find((x) => x.id === p.id);
    if (!w || w.planks >= MAX_PLANKS) return 0;
    this.repairT[who] += dt;
    if (this.repairT[who] < 0.42) return 0;
    this.repairT[who] = 0;
    w.planks = Math.min(MAX_PLANKS, w.planks + 1);
    this.paintPlanks(w);
    this.hooks.sound(who, "repair");
    ctx.points.add(15);
    return 1;
  }

  /** Avanza la caja (ruleta y oferta) y el mejorador (trabajo y recogida). */
  update(dt: number): void {
    const box = this.map.box;
    if (box.phase === 1 && this.boxFinal) {
      this.boxT += dt;
      this.boxSwap -= dt;
      if (this.boxT >= BOX_ROLL) {
        box.phase = 2;
        box.shown = this.boxFinal;
        this.boxT = 0;
        box.left = BOX_OFFER;
        this.hooks.sound(this.boxWho, "boxTick");
      } else if (this.boxSwap <= 0) {
        // La ruleta se frena: cada cambio tarda más que el anterior.
        const k = this.boxT / BOX_ROLL;
        this.boxSwap = 0.07 + 0.5 * k * k * k;
        let next = BOX_POOL[Math.floor(Math.random() * BOX_POOL.length)];
        if (next === box.shown) next = BOX_POOL[(BOX_POOL.indexOf(next) + 1) % BOX_POOL.length];
        box.shown = next;
      }
    } else if (box.phase === 2) {
      this.boxT += dt;
      box.left = Math.max(0, BOX_OFFER - this.boxT);
      if (box.left <= 0) {
        // Nadie la cogió: la caja se la lleva (se pierde lo pagado).
        this.hooks.toast(this.boxWho, "LA CAJA SE LLEVÓ EL ARMA", "bad");
        this.closeBox();
      }
    }

    const up = this.map.upgrader;
    if (up.phase === 1) {
      this.upT += dt;
      up.t = this.upT;
      if (this.upT >= UPGRADE_WORK && this.upHeld) {
        up.phase = 2;
        up.shown = this.upHeld.id;
        up.shownUpgraded = true;
        this.upT = 0;
        up.left = UPGRADE_OFFER;
        this.hooks.sound(this.upWho, "papDone");
      }
    } else if (up.phase === 2) {
      this.upT += dt;
      up.left = Math.max(0, UPGRADE_OFFER - this.upT);
      if (up.left <= 0) {
        // Si no la recoge, se la devuelve sola (mejorada) para que no se pierda.
        const who = this.upWho;
        this.returnUpgraded(this.hooks.ctxOf(who), who);
      }
    }
  }

  /** Estado de las máquinas para el snapshot: caja, mejorador y energía. */
  machines(): { bx: number[]; pu: number[] } {
    const box = this.map.box;
    const up = this.map.upgrader;
    return {
      bx: [box.phase, weaponIndex(box.shown), this.boxWho, Math.round(box.left * 10) / 10],
      pu: [this.map.power.on ? 1 : 0, up.phase, this.upWho, weaponIndex(up.shown), up.shownUpgraded ? 1 : 0, Math.round(up.left * 10) / 10],
    };
  }

  /** Tablones visibles según el estado. */
  paintPlanks(w: BarricadeWindow): void {
    w.group.children.forEach((child, i) => {
      child.visible = i < w.planks;
    });
    // Con un solo tablón el hueco sigue cerrado: los zombis trepan el alféizar, así que lo que los frena
    // (a ellos, a las balas y a la vista) es este colisionador. Al arrancar el último se apaga.
    w.barricade.enabled = w.planks > 0;
  }

  /** Los zombis arrancan tablones al llegar a la ventana. */
  tearPlank(w: BarricadeWindow): void {
    if (w.planks <= 0) return;
    w.planks -= 1;
    this.paintPlanks(w);
  }

  reset(): void {
    this.closeBox();
    this.boxSwap = 0;
    this.upHeld = null;
    this.upWho = -1;
    this.upT = 0;
    this.repairT.fill(0);
    const up = this.map.upgrader;
    up.phase = 0;
    up.shown = null;
    up.left = 0;
    this.map.power.on = false;
    up.powered = false;
    for (const w of this.map.windows) {
      w.planks = MAX_PLANKS;
      this.paintPlanks(w);
    }
    for (const d of this.map.doors) {
      d.open = false;
      d.k = 0;
      d.panel.rotation.y = 0;
      d.collider.enabled = true;
    }
  }
}

/** Invitado: pone las máquinas como las manda el anfitrión (caja, mejorador y energía). */
export function applyMachineState(map: BuiltMap, bx: number[], pu: number[]): void {
  const box = map.box;
  const up = map.upgrader;
  box.phase = (bx[0] ?? 0) as 0 | 1 | 2;
  box.shown = weaponAt(bx[1] ?? -1);
  box.left = bx[3] ?? 0;
  map.power.on = pu[0] === 1;
  up.phase = (pu[1] ?? 0) as 0 | 1 | 2;
  up.shown = weaponAt(pu[3] ?? -1);
  up.shownUpgraded = pu[4] === 1;
  up.left = pu[5] ?? 0;
  up.powered = map.power.on;
}
