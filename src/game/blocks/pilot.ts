// El jugador propio (anfitrión o invitado): mirada, movimiento, bloque al que apunta y cambios que pide.
// Cada uno mueve a su jugador en su equipo, sin esperar a la red; los cambios de bloques los ordena el anfitrión.
// En supervivencia lleva además su inventario (local, no viaja por la red), romper cuesta tiempo según el
// bloque y la herramienta, lo roto va al inventario y poner gasta. Un clic sobre un animal lo golpea.
// También lleva su vida y su hambre (`vitals.ts`): con el clic derecho mantenido come lo que tenga en la mano
// y, si muere, suelta todo donde cayó y reaparece en su sitio de salida. Sus hornos (`furnace.ts`) son suyos
// como el inventario: los lleva aquí, por posición, y funcionan aunque no tenga la pantalla abierta.
import { AIR, BLOCKS, FURNACE, HOTBAR, TABLE, TORCH, WATER, dropOf } from "./blocks";
import { ATTACK_COOL, ATTACK_REACH, EDIT_REPEAT, EYE, LOOK_SPEED, MOUSE_SENS, REACH, WX, WZ } from "./config";
import { Crafter, type CraftKind } from "./craftui";
import { Furnace } from "./furnace";
import type { WalkSource } from "./input";
import { Inventory, type Stack } from "./inventory";
import { TOOL_SPEED, isPlaceable, itemInfo } from "./items";
import { rayMobs, type MobView } from "./mobs";
import { makeBody, overlapsCell, stepBody, type Body } from "./player";
import {
  ATTACK_EXHAUST, BREAK_EXHAUST, EAT_TIME, JUMP_EXHAUST, MAX_HUNGER, RESPAWN_DELAY, Vitals,
} from "./vitals";
import { World, type RayHit } from "./world";

/** Objeto que sale del inventario: tirado hacia delante o, al morir, desparramado a los pies (`spill`). */
export interface Thrown extends Stack {
  spill?: boolean;
}

/** Cambio de un bloque: x, y, z, bloque nuevo (0 = romperlo) y, en supervivencia, el objeto que suelta. */
export type Edit = [number, number, number, number] | [number, number, number, number, number];

/** Posición de otro jugador (para no ponerle un bloque encima). */
export interface Occupant {
  x: number;
  y: number;
  z: number;
}

export class Pilot {
  body: Body;
  yaw = 0;
  pitch = 0;
  slot = 0;
  target: RayHit | null = null;
  /** Distancia andada (para balancear brazos y piernas del muñeco). */
  stride = 0;
  readonly inventory = new Inventory();
  /** Hornos de este jugador: "x,y,z" → lo que tiene dentro. */
  readonly furnaces = new Map<string, Furnace>();
  /** Pantalla de inventario o de la mesa de trabajo abierta (supervivencia). */
  crafter: Crafter | null = null;
  /** Progreso al romper el bloque apuntado (0..1). */
  digProgress = 0;
  /** Objetos que el jugador ha tirado este frame (los recoge el juego y los pone en el suelo). */
  throws: Thrown[] = [];
  /** Animal apuntado (0 = ninguno): tapa al bloque de detrás. */
  mobTarget = 0;
  /** Animales golpeados este frame (el juego aplica el daño según lo que hay en la mano). */
  hits: number[] = [];
  readonly vitals = new Vitals();
  /** Segundos muerto (-1 = vivo). */
  deadFor = -1;
  /** El invitado no deja reaparecer hasta que el anfitrión ha recibido todo lo que soltó al morir. */
  holdRespawn = false;
  private digKey = "";
  private digCool = 0;
  private placeCool = 0;
  private attackCool = 0;
  private readonly spawn: [number, number, number];

  constructor(world: World, index: number, readonly survival = false) {
    // Aparecen cerca del centro, separados según su número, mirando al centro.
    const a = (index / 4) * Math.PI * 2;
    const [x, z] = world.dryColumn(Math.floor(WX / 2 + Math.cos(a) * 3), Math.floor(WZ / 2 + Math.sin(a) * 3));
    this.spawn = [x + 0.5, world.surface(x, z) + 1, z + 0.5];
    this.body = makeBody(...this.spawn);
    this.yaw = Math.atan2(this.body.x - WX / 2, this.body.z - WZ / 2) || a;
  }

  get dead(): boolean {
    return this.survival && this.vitals.dead;
  }

  /** Empujón al recibir un golpe (de un monstruo o una explosión): sale despedido y da un saltito. */
  knock(kx: number, kz: number) {
    if (!Number.isFinite(kx) || !Number.isFinite(kz)) return;
    const b = this.body;
    b.vx = kx;
    b.vz = kz;
    b.vy = Math.max(b.vy, 4.5);
    b.ground = false;
  }

  /** Al morir: cierra la pantalla abierta y suelta todo el inventario donde está. */
  private die(input: WalkSource) {
    this.toggleUi(input, null);
    this.throws = this.throws.map((t) => ({ ...t, spill: true }));
    this.inventory.slots.forEach((s, i) => {
      if (s) this.throws.push({ id: s.id, n: s.n, spill: true });
      this.inventory.slots[i] = null;
    });
    this.deadFor = 0;
    this.digProgress = 0;
    this.vitals.eating = 0;
    this.target = null;
    this.mobTarget = 0;
  }

  /** Muerto: no se mueve ni hace nada; pasado un momento, ESPACIO o clic lo hace reaparecer. */
  private whileDead(input: WalkSource, dt: number): Edit[] {
    this.deadFor += dt;
    this.vitals.hurt = Math.max(0, this.vitals.hurt - dt);
    input.takeMouse();
    input.takeInventory();
    input.takeClicks();
    while (input.takeThrow());
    const wants = input.takeDig() || input.takePlace() || input.jump || input.digMouse;
    if (wants && this.deadFor >= RESPAWN_DELAY && !this.holdRespawn) {
      this.body = makeBody(...this.spawn);
      this.vitals.reset();
      this.deadFor = -1;
    }
    return [];
  }

  /** Objeto en la mano (0 = nada). */
  get held(): number {
    return this.survival ? (this.inventory.slots[this.slot]?.id ?? 0) : HOTBAR[this.slot];
  }

  /** Bloque que se pondría (0 si lo que se lleva no es un bloque). */
  get block(): number {
    return isPlaceable(this.held) ? this.held : 0;
  }

  /** Abre (o cierra) el inventario, la mesa de trabajo o un horno. */
  private toggleUi(input: WalkSource, size: CraftKind | null, furnace: Furnace | null = null) {
    if (this.crafter) this.throws.push(...this.crafter.close(this.inventory));
    this.crafter = size ? new Crafter(size, furnace) : null;
    input.setUi(!!this.crafter);
  }

  /** Funde en todos sus hornos. Si alguien rompe uno, lo que tenía vuelve al inventario (o al suelo si no cabe). */
  private tickFurnaces(input: WalkSource, world: World, dt: number) {
    for (const [key, f] of this.furnaces) {
      const [x, y, z] = key.split(",").map(Number);
      if (world.get(x, y, z) === FURNACE) {
        f.update(dt);
        continue;
      }
      if (this.crafter?.furnace === f) this.toggleUi(input, null);
      for (const s of f.slots) {
        const left = s ? this.inventory.add(s.id, s.n) : 0;
        if (s && left) this.throws.push({ id: s.id, n: left });
      }
      this.furnaces.delete(key);
    }
  }

  /** Cierra la pantalla abierta (Esc). Devuelve si había alguna. */
  closeUi(input: WalkSource): boolean {
    if (!this.crafter) return false;
    this.toggleUi(input, null);
    return true;
  }

  /** Avanza un frame y devuelve los cambios de bloques que pide el jugador. */
  update(input: WalkSource, world: World, others: Occupant[], dt: number, mobs: readonly MobView[] = []): Edit[] {
    input.poll();
    if (this.dead) {
      if (this.deadFor < 0) this.die(input);
      return this.whileDead(input, dt);
    }
    if (this.survival) this.tickFurnaces(input, world, dt);
    if (this.survival && input.takeInventory()) this.toggleUi(input, this.crafter ? null : 2);
    const ui = !!this.crafter;
    const [mx, my] = input.takeMouse();
    if (!ui) {
      this.yaw -= mx * MOUSE_SENS + input.lookX * LOOK_SPEED * dt;
      this.pitch -= my * MOUSE_SENS - input.lookY * LOOK_SPEED * dt;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
      const slot = input.takeSlot();
      if (slot >= 0) this.slot = slot;
      const scroll = input.takeScroll();
      if (scroll) this.slot = (this.slot + scroll + HOTBAR.length * 4) % HOTBAR.length;
    }
    if (input.takeFly() && !this.survival) this.body.flying = !this.body.flying;
    if (this.crafter) {
      for (const c of input.takeClicks()) {
        const thrown = this.crafter?.click(c.x, c.y, c.button, c.shift, this.inventory);
        if (thrown) this.throws.push(thrown);
      }
    }

    const b = this.body;
    const px = b.x, pz = b.z;
    const move = ui
      ? { forward: 0, right: 0, yaw: this.yaw, jump: false, down: false }
      : { forward: input.forward, right: input.right, yaw: this.yaw, jump: input.jump, down: input.down };
    const wasGround = b.ground;
    stepBody(b, move, world, dt);
    const walked = b.ground || b.flying ? Math.hypot(b.x - px, b.z - pz) : 0;
    this.stride += walked;
    // Si algo lo deja fuera del mundo (no debería), vuelve arriba.
    if (b.y < -5) Object.assign(b, makeBody(b.x, world.surface(Math.floor(b.x), Math.floor(b.z)) + 1, b.z));
    if (this.survival) {
      if (move.jump && wasGround && !b.ground && b.vy > 0) this.vitals.exhaust(JUMP_EXHAUST);
      const head = world.get(Math.floor(b.x), Math.floor(b.y + EYE), Math.floor(b.z)) === WATER;
      this.vitals.update(dt, b, head, walked);
      if (this.vitals.dead) {
        this.die(input);
        return [];
      }
    }

    const [dx, dy, dz] = this.look();
    this.target = world.raycast(b.x, b.y + EYE, b.z, dx, dy, dz, REACH);
    // Un animal entre los ojos y el bloque apuntado (y a mano) se lleva el clic.
    const mob = this.survival ? rayMobs(mobs, b.x, b.y + EYE, b.z, dx, dy, dz, Math.min(ATTACK_REACH, this.target?.t ?? Infinity)) : null;
    this.mobTarget = mob?.id ?? 0;
    if (mob) this.target = null;
    if (ui) {
      this.digProgress = 0;
      this.vitals.eating = 0;
      while (input.takeThrow()); // Q con el inventario abierto no tira nada
      return [];
    }
    return this.survival ? this.survive(input, world, others, dt) : this.create(input, world, others, dt);
  }

  /** Creativo: romper es instantáneo y poner no gasta. */
  private create(input: WalkSource, world: World, others: Occupant[], dt: number): Edit[] {
    const edits: Edit[] = [];
    this.digCool -= dt;
    this.placeCool -= dt;
    const dig = input.takeDig() || (input.digHeld && this.digCool <= 0);
    const place = input.takePlace() || (input.placeHeld && this.placeCool <= 0);
    const t = this.target;
    if (dig && t && !BLOCKS[world.get(t.x, t.y, t.z)].unbreakable) {
      edits.push([t.x, t.y, t.z, AIR]);
      this.digCool = EDIT_REPEAT;
    }
    if (place && !dig) {
      const e = this.placement(world, others);
      if (e) {
        edits.push(e);
        this.placeCool = EDIT_REPEAT;
      }
    }
    return edits;
  }

  /** Supervivencia: romper lleva tiempo, lo roto va al inventario y poner gasta. */
  private survive(input: WalkSource, world: World, others: Occupant[], dt: number): Edit[] {
    const edits: Edit[] = [];
    const t = this.target;
    // Romper es mantener pulsado; el toque solo cuenta para golpear (un clic rápido puede no verse como mantenido).
    const tap = input.takeDig();
    this.attackCool -= dt;
    if (this.mobTarget && (tap || input.digMouse) && this.attackCool <= 0) {
      this.hits.push(this.mobTarget);
      this.attackCool = ATTACK_COOL;
      this.vitals.exhaust(ATTACK_EXHAUST);
    }
    // Q: tirar uno del objeto en la mano (Ctrl+Q, el montón entero).
    const th = input.takeThrow();
    const hand = this.inventory.slots[this.slot];
    if (th && hand) {
      const n = th === 2 ? hand.n : 1;
      this.throws.push({ id: hand.id, n });
      this.inventory.take(this.slot, n);
    }
    const block = t ? world.get(t.x, t.y, t.z) : AIR;
    const info = BLOCKS[block];
    const key = t ? `${t.x},${t.y},${t.z}` : "";
    if (key !== this.digKey) {
      this.digKey = key;
      this.digProgress = 0;
    }
    if (input.digMouse && t && !info.unbreakable && info.hard > 0) {
      const tool = itemInfo(this.held).tool;
      const tier = tool && tool.kind === info.tool ? tool.tier : 0;
      this.digProgress += (dt * TOOL_SPEED[tier]) / info.hard;
      if (this.digProgress >= 1) {
        // Lo que suelta cae al suelo (lo pone el anfitrión) y se recoge al acercarse.
        edits.push([t.x, t.y, t.z, AIR, dropOf(block, tier)]);
        this.digProgress = 0;
        this.digKey = "";
        this.vitals.exhaust(BREAK_EXHAUST);
      }
    } else {
      this.digProgress = 0;
    }

    this.placeCool -= dt;
    const place = input.takePlace() || (input.placeHeld && this.placeCool <= 0);
    if (place && t && (block === TABLE || block === FURNACE)) {
      this.vitals.eating = 0;
      if (block === TABLE) this.toggleUi(input, 3); // usar la mesa de trabajo
      else {
        const key = `${t.x},${t.y},${t.z}`;
        if (!this.furnaces.has(key)) this.furnaces.set(key, new Furnace());
        this.toggleUi(input, "furnace", this.furnaces.get(key));
      }
      return edits;
    }
    // Comer: clic derecho mantenido con comida en la mano (si hay hambre).
    const food = itemInfo(this.held).food;
    if (food && input.placeHeld && this.vitals.hunger < MAX_HUNGER) {
      this.vitals.eating += dt;
      if (this.vitals.eating >= EAT_TIME) {
        this.vitals.eat(food);
        this.inventory.take(this.slot);
        this.vitals.eating = 0;
      }
    } else {
      this.vitals.eating = 0;
    }
    if (place && this.block) {
      const e = this.placement(world, others);
      if (e) {
        edits.push(e);
        this.inventory.take(this.slot);
        this.placeCool = EDIT_REPEAT;
      }
    }
    return edits;
  }

  /** Dónde iría el bloque elegido (junto a la cara apuntada), si cabe ahí. */
  private placement(world: World, others: Occupant[]): Edit | null {
    const t = this.target;
    if (!t || !this.block) return null;
    const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    const here = world.get(x, y, z);
    const free = World.inside(x, y, z) && (here === AIR || (here === WATER && this.block !== TORCH));
    // La antorcha necesita apoyarse en el suelo o en una pared; como no choca, se puede poner donde hay alguien.
    if (this.block === TORCH && world.torchSupport(x, y, z) < 0) return null;
    const blocked = BLOCKS[this.block].solid && [this.body, ...others].some((o) => overlapsCell(o, x, y, z));
    return free && !blocked ? [x, y, z, this.block] : null;
  }

  /** Dirección de la mirada (vector unitario). */
  look(): [number, number, number] {
    const c = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c];
  }
}
