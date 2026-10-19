// El jugador propio (anfitrión o invitado): mirada, movimiento, inventario, minado con herramientas,
// vida y bloque apuntado. Cada uno mueve a su jugador en su equipo, sin esperar a la red; los cambios de
// bloques los ordena el anfitrión.
//
// Creativo: bloques infinitos, sin daño, vuelo y rotura instantánea.
// Supervivencia: inventario, dureza de bloques (con la herramienta buena se tarda menos), objetos que
// caen al romper, desgaste de herramientas, vida, caídas, ahogo y manzanas para curarse.
import { AIR, BLOCKS, FURNACE, HOTBAR, isPlaceable, LEAVES, WATER } from "./blocks";
import { EDIT_REPEAT, EYE, HOTBAR_SLOTS, LOOK_SPEED, MINING_GRACE, MOUSE_SENS, REACH, WX, WZ } from "./config";
import { Drops } from "./drops";
import { Inventory } from "./inventory";
import { I_APPLE, I_MEAT, itemBlock, itemInfo } from "./items";
import type { WalkSource } from "./input";
import { breakSeconds, dropOf } from "./mining";
import { Mobs } from "./mobs";
import { makeBody, overlapsCell, stepBody, type Body } from "./player";
import { Survival } from "./survival";
import { World, type RayHit } from "./world";

/** Cambio de un bloque: x, y, z, bloque nuevo (0 = romperlo). */
export type Edit = [number, number, number, number];

/** Posición de otro jugador (para no ponerle un bloque encima). */
export interface Occupant {
  x: number;
  y: number;
  z: number;
}

/** Lo que se está rompiendo ahora mismo (para la barra de progreso del HUD). */
export interface Mining {
  x: number;
  y: number;
  z: number;
  /** 0..1 */
  k: number;
}

export class Pilot {
  body: Body;
  yaw = 0;
  pitch = 0;
  slot = 0;
  /** Barra del modo creativo (bloques infinitos; el botón central cambia lo que hay en cada casilla). */
  slots: number[] = HOTBAR.slice(0, HOTBAR_SLOTS);
  /** Inventario de la supervivencia (en creativo está vacío y no se usa). */
  readonly inv = new Inventory();
  /** Objetos en el suelo de este jugador. */
  readonly drops = new Drops();
  /** Animales de este jugador. */
  readonly mobs = new Mobs();
  /** ¿Hay un horno cerca? (para poder fundir desde el inventario) */
  nearFurnace = false;
  /** Estado de vida (null en creativo). */
  readonly survival: Survival | null;
  target: RayHit | null = null;
  mining: Mining | null = null;
  /** Distancia andada (para balancear brazos y piernas del muñeco). */
  stride = 0;
  private digCool = 0;
  private placeCool = 0;
  private eatCool = 0;
  /** Enfriamiento entre golpes a los animales. */
  private attackCool = 0;
  /** Cada cuánto se mira si hay un horno cerca. */
  private furnaceT = 0;
  /** Cada cuánto se repone la manada. */
  private mobT = 45;
  private sprinting = false;
  /** Tiempo que se guarda el progreso de minado al soltar (para minar a clics). */
  private grace = 0;
  private readonly spawn: [number, number, number];

  constructor(world: World, index: number, survival: boolean) {
    // Aparecen cerca del centro, separados según su número, mirando al centro.
    const a = (index / 4) * Math.PI * 2;
    const [x, z] = world.dryColumn(Math.floor(WX / 2 + Math.cos(a) * 3), Math.floor(WZ / 2 + Math.sin(a) * 3));
    this.body = makeBody(x + 0.5, world.surface(x, z) + 1, z + 0.5);
    this.yaw = Math.atan2(this.body.x - WX / 2, this.body.z - WZ / 2) || a;
    this.spawn = [this.body.x, this.body.y, this.body.z];
    this.survival = survival ? new Survival() : null;
    // Animales alrededor del punto de aparición (solo en supervivencia).
    if (this.survival) this.mobs.spawnAround(world, this.body.x, this.body.z, 7);
  }

  get survivalMode(): boolean {
    return this.survival !== null;
  }

  /** Objeto en la mano (0 = nada). */
  get heldId(): number {
    if (this.survival) return this.inv.held?.id ?? 0;
    return this.slots[this.slot] ?? 0;
  }

  /** Bloque que pone al colocar (0 = lo que lleva no es un bloque). */
  get heldBlock(): number {
    return itemBlock(this.heldId);
  }

  /** Avanza un frame y devuelve los cambios de bloques que pide el jugador. */
  update(input: WalkSource, world: World, others: Occupant[], dt: number, uiOpen = false): Edit[] {
    input.poll();
    if (this.survival) this.slot = this.inv.sel;
    if (uiOpen) {
      // Con el inventario abierto no se mira ni se toca nada, pero el jugador sigue cayendo.
      stepBody(this.body, { forward: 0, right: 0, yaw: this.yaw, jump: false, down: false }, world, dt);
      this.target = null;
      this.mining = null;
      this.tickSurvival(world, dt);
      this.tickDrops(world, dt);
      return [];
    }

    const [mx, my] = input.takeMouse();
    this.yaw -= mx * MOUSE_SENS + input.lookX * LOOK_SPEED * dt;
    this.pitch -= my * MOUSE_SENS - input.lookY * LOOK_SPEED * dt;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    const count = this.survival ? this.inv.hotbar.length : this.slots.length;
    const slot = input.takeSlot();
    if (slot >= 0 && slot < count) this.setSlot(slot);
    const scroll = input.takeScroll();
    if (scroll) this.setSlot((this.slot + scroll + count * 4) % count);
    if (input.takeFly() && !this.survival) this.body.flying = !this.body.flying;

    const b = this.body;
    const px = b.x, pz = b.z;
    this.sprinting = input.sprint && !b.flying;
    stepBody(b, {
      forward: input.forward, right: input.right, yaw: this.yaw, jump: input.jump, down: input.down,
      sprint: input.sprint,
    }, world, dt);
    if (b.ground || b.flying) this.stride += Math.hypot(b.x - px, b.z - pz);
    // Si algo lo deja fuera del mundo (no debería), vuelve arriba.
    if (b.y < -5) Object.assign(b, makeBody(b.x, world.surface(Math.floor(b.x), Math.floor(b.z)) + 1, b.z));

    const [dx, dy, dz] = this.look();
    this.target = world.raycast(b.x, b.y + EYE, b.z, dx, dy, dz, REACH);
    // Botón central: copiar el bloque apuntado a la barra (solo en creativo).
    if (input.takePick() && !this.survival) this.pick(world);

    const edits = this.survival
      ? this.mineAndBuild(input, world, others, dt)
      : this.buildInstant(input, world, others, dt);
    this.tickSurvival(world, dt);
    this.tickDrops(world, dt);
    this.tickMobs(world, dt);
    return edits;
  }

  private setSlot(i: number) {
    this.slot = i;
    if (this.survival) this.inv.sel = i;
  }

  // --- Creativo: romper y poner al momento -------------------------------------------------
  private buildInstant(input: WalkSource, world: World, others: Occupant[], dt: number): Edit[] {
    const edits: Edit[] = [];
    const b = this.body;
    this.digCool -= dt;
    this.placeCool -= dt;
    const dig = input.takeDig() || (input.digHeld && this.digCool <= 0);
    const place = input.takePlace() || (input.placeHeld && this.placeCool <= 0);
    const t = this.target;
    if (dig && t && !BLOCKS[world.get(t.x, t.y, t.z)].unbreakable) {
      edits.push([t.x, t.y, t.z, AIR]);
      this.digCool = EDIT_REPEAT;
    }
    if (place && t && !dig) {
      const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
      if (this.canPlace(world, b, others, x, y, z)) {
        edits.push([x, y, z, this.heldBlock]);
        this.placeCool = EDIT_REPEAT;
      }
    }
    return edits;
  }

  // --- Supervivencia: minar con tiempo, soltar objetos, gastar herramientas ----------------
  private mineAndBuild(input: WalkSource, world: World, others: Occupant[], dt: number): Edit[] {
    const edits: Edit[] = [];
    const b = this.body;
    const t = this.target;
    const held = this.heldId;
    this.digCool -= dt;
    this.placeCool -= dt;
    this.eatCool -= dt;
    const digClick = input.takeDig();
    // Si el clic da a un animal, pega en vez de minar.
    if (digClick && this.tryAttack(world)) {
      this.mining = null;
      return edits;
    }
    const holding = digClick || input.digHeld;
    const place = input.takePlace() || (input.placeHeld && this.placeCool <= 0);
    if (digClick) this.grace = MINING_GRACE;
    else this.grace -= dt;

    // Minar: el bloque se rompe cuando el progreso llega a 1. Al soltar, el progreso se guarda un
    // momento (MINING_GRACE) para que minar a clics también avance.
    const block = t ? world.get(t.x, t.y, t.z) : AIR;
    const usable = !!t && block !== AIR && !BLOCKS[block].unbreakable;
    if (!usable || (!holding && this.grace <= 0)) {
      this.mining = null;
      if (!usable) this.grace = 0;
    } else if (holding) {
      if (!this.mining || this.mining.x !== t!.x || this.mining.y !== t!.y || this.mining.z !== t!.z) {
        this.mining = { x: t!.x, y: t!.y, z: t!.z, k: 0 };
      }
      this.mining.k += dt / breakSeconds(block, held);
      if (this.mining.k >= 1) {
        edits.push([t!.x, t!.y, t!.z, AIR]);
        this.afterBreak(t!.x, t!.y, t!.z, block, held);
        this.mining = null;
        this.grace = 0;
      }
    }
    // Poner o comer (el clic que pone no mina a la vez).
    if (place && !digClick && t) {
      const stack = this.inv.held;
      const info = stack ? itemInfo(stack.id) : undefined;
      if (stack && info?.food && this.survival && this.eatCool <= 0 && this.survival.eat(info.food, info.heal ?? 0)) {
        this.inv.consumeHeld(1);
        this.eatCool = 0.4;
        this.placeCool = 0.4;
      } else if (stack && isPlaceable(stack.id)) {
        const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
        if (this.canPlace(world, b, others, x, y, z)) {
          edits.push([x, y, z, stack.id]);
          this.inv.consumeHeld(1);
          this.placeCool = EDIT_REPEAT;
        }
      }
    }
    return edits;
  }

  /** ¿Se puede poner un bloque en (x, y, z)? */
  private canPlace(world: World, b: Body, others: Occupant[], x: number, y: number, z: number): boolean {
    const free = World.inside(x, y, z) && [AIR, WATER].includes(world.get(x, y, z));
    if (!free) return false;
    if (!isPlaceable(this.heldBlock)) return false;
    return ![b, ...others].some((o) => overlapsCell(o, x, y, z));
  }

  /** Objetos que salen al romper, y desgaste de la herramienta. */
  private afterBreak(x: number, y: number, z: number, block: number, held: number) {
    if (!this.survival) return;
    const drop = dropOf(block, held);
    if (drop) this.drops.spawn(drop.id, x + 0.5, y + 0.5, z + 0.5, drop.n);
    if (block === LEAVES && Math.random() < 0.12) this.drops.spawn(I_APPLE, x + 0.5, y + 0.9, z + 0.5);
    if (itemInfo(held)?.tool) this.inv.damageHeld(1);
  }

  /** Golpe con lo que se lleva en la mano (espada o puño). True si ha dado a un animal. */
  private tryAttack(world: World): boolean {
    if (this.attackCool > 0) return false;
    const [dx, dy, dz] = this.look();
    const b = this.body;
    const mob = this.mobs.hitAt(b.x, b.y + EYE, b.z, dx, dy, dz, 3.2);
    if (!mob) return false;
    // Si hay un bloque más cerca que el animal, el clic va al bloque.
    const t = this.target;
    if (t) {
      const dist = Math.hypot(t.x + 0.5 - b.x, t.y + 0.5 - (b.y + EYE), t.z + 0.5 - b.z);
      if (dist < Math.hypot(mob.x - b.x, mob.y + 0.5 - (b.y + EYE), mob.z - b.z)) return false;
    }
    const info = itemInfo(this.heldId);
    this.attackCool = 0.45;
    this.digCool = 0.45;
    const dead = this.mobs.damage(mob, info?.damage ?? 1, b);
    if (info?.tool) this.inv.damageHeld(1); // las espadas se gastan
    if (dead) {
      const n = 1 + (Math.random() < 0.45 ? 1 : 0);
      this.drops.spawn(I_MEAT, mob.x, mob.y + 0.5, mob.z, n);
    }
    return true;
  }

  /** Mueve a los animales, repone la manada y mira si hay un horno cerca. */
  private tickMobs(world: World, dt: number) {
    if (!this.survival) return;
    this.attackCool -= dt;
    this.mobs.update(dt, world, this.body.x, this.body.z);
    // Si se han cazado casi todos, vuelven a aparecer cerca (si no, no habría comida).
    this.mobT -= dt;
    if (this.mobT <= 0) {
      this.mobT = 45;
      if (this.mobs.list.length < 4) this.mobs.spawnAround(world, this.body.x, this.body.z, 4);
    }
    this.furnaceT -= dt;
    if (this.furnaceT <= 0) {
      this.furnaceT = 0.5;
      this.nearFurnace = this.findFurnace(world);
    }
  }

  /** ¿Hay un horno a menos de 4 bloques? */
  private findFurnace(world: World): boolean {
    const b = this.body;
    const r = 4;
    const x0 = Math.floor(b.x), y0 = Math.floor(b.y), z0 = Math.floor(b.z);
    for (let y = y0 - 2; y <= y0 + 2; y++) {
      for (let x = x0 - r; x <= x0 + r; x++) {
        for (let z = z0 - r; z <= z0 + r; z++) {
          if (world.get(x, y, z) === FURNACE) return true;
        }
      }
    }
    return false;
  }

  /** Vida, caídas, ahogo y reaparición. */
  private tickSurvival(world: World, dt: number) {
    const s = this.survival;
    if (!s) return;
    const b = this.body;
    const head = world.get(Math.floor(b.x), Math.floor(b.y + EYE), Math.floor(b.z));
    s.update(dt, { ground: b.ground, inWater: b.inWater, headWater: head === WATER, vy: b.vy, sprinting: this.sprinting });
    if (s.dead) {
      this.mining = null;
      return;
    }
    if (s.takeRevive()) {
      // Reaparece en el punto de inicio, con la vida llena.
      Object.assign(b, makeBody(this.spawn[0], this.spawn[1], this.spawn[2]));
      this.mining = null;
    }
  }

  /** Mueve los objetos del suelo y recoge los que se puedan. */
  private tickDrops(world: World, dt: number) {
    if (!this.survival) return;
    const b = this.body;
    for (const d of this.drops.update(dt, world, b.x, b.y, b.z)) {
      const left = this.inv.add(d.id, d.n, d.dur);
      if (left <= 0) this.drops.remove(d);
      else d.n = left;
    }
  }

  /** El bloque al que se apunta pasa a la mano: a su casilla si ya estaba en la barra, si no a la actual. */
  private pick(world: World) {
    const t = this.target;
    if (!t) return;
    const b = world.get(t.x, t.y, t.z);
    if (!isPlaceable(b)) return;
    const at = this.slots.indexOf(b);
    if (at >= 0) this.setSlot(at);
    else this.slots[this.slot] = b;
  }

  /** Dirección de la mirada (vector unitario). */
  look(): [number, number, number] {
    const c = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c];
  }
}
