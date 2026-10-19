// El jugador propio (anfitrión o invitado): mirada, movimiento, bloque al que apunta y cambios que pide.
// Cada uno mueve a su jugador en su equipo, sin esperar a la red; los cambios de bloques los ordena el anfitrión.
import { AIR, BLOCKS, HOTBAR, WATER } from "./blocks";
import { EDIT_REPEAT, EYE, LOOK_SPEED, MOUSE_SENS, REACH, WX, WZ } from "./config";
import type { WalkSource } from "./input";
import { makeBody, overlapsCell, stepBody, type Body } from "./player";
import { World, type RayHit } from "./world";

/** Cambio de un bloque: x, y, z, bloque nuevo (0 = romperlo). */
export type Edit = [number, number, number, number];

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
  private digCool = 0;
  private placeCool = 0;

  constructor(world: World, index: number) {
    // Aparecen cerca del centro, separados según su número, mirando al centro.
    const a = (index / 4) * Math.PI * 2;
    const [x, z] = world.dryColumn(Math.floor(WX / 2 + Math.cos(a) * 3), Math.floor(WZ / 2 + Math.sin(a) * 3));
    this.body = makeBody(x + 0.5, world.surface(x, z) + 1, z + 0.5);
    this.yaw = Math.atan2(this.body.x - WX / 2, this.body.z - WZ / 2) || a;
  }

  get block(): number {
    return HOTBAR[this.slot];
  }

  /** Avanza un frame y devuelve los cambios de bloques que pide el jugador. */
  update(input: WalkSource, world: World, others: Occupant[], dt: number): Edit[] {
    input.poll();
    const [mx, my] = input.takeMouse();
    this.yaw -= mx * MOUSE_SENS + input.lookX * LOOK_SPEED * dt;
    this.pitch -= my * MOUSE_SENS - input.lookY * LOOK_SPEED * dt;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    const slot = input.takeSlot();
    if (slot >= 0) this.slot = slot;
    const scroll = input.takeScroll();
    if (scroll) this.slot = (this.slot + scroll + HOTBAR.length * 4) % HOTBAR.length;
    if (input.takeFly()) this.body.flying = !this.body.flying;

    const b = this.body;
    const px = b.x, pz = b.z;
    stepBody(b, { forward: input.forward, right: input.right, yaw: this.yaw, jump: input.jump, down: input.down }, world, dt);
    if (b.ground || b.flying) this.stride += Math.hypot(b.x - px, b.z - pz);
    // Si algo lo deja fuera del mundo (no debería), vuelve arriba.
    if (b.y < -5) Object.assign(b, makeBody(b.x, world.surface(Math.floor(b.x), Math.floor(b.z)) + 1, b.z));

    const [dx, dy, dz] = this.look();
    this.target = world.raycast(b.x, b.y + EYE, b.z, dx, dy, dz, REACH);
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
    if (place && t && !dig) {
      const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
      const free = World.inside(x, y, z) && [AIR, WATER].includes(world.get(x, y, z));
      const blocked = [b, ...others].some((o) => overlapsCell(o, x, y, z));
      if (free && !blocked) {
        edits.push([x, y, z, this.block]);
        this.placeCool = EDIT_REPEAT;
      }
    }
    return edits;
  }

  /** Dirección de la mirada (vector unitario). */
  look(): [number, number, number] {
    const c = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c];
  }
}
