import {
  Bomb, BombBag, Burning, Collider, Destructible, Dying, GridCell, Intent, PowerUp, Solid, Transform, Wall,
} from "../components";
import { CRATE_BURN_TIME, TILE } from "../config";
import type { Entity, System, World } from "../ecs";
import { DIRECTIONS, toCell } from "../grid";
import { createBomb, createExplosion } from "../prefabs";

function overlapsCell(world: World, e: Entity, col: number, row: number): boolean {
  const t = world.get(e, Transform);
  const c = world.get(e, Collider);
  if (!t || !c) return false;
  const left = col * TILE;
  const top = row * TILE;
  return t.x + c.half > left && t.x - c.half < left + TILE && t.y + c.half > top && t.y - c.half < top + TILE;
}

/** Coloca bombas si el jugador lo pide y le quedan en la bolsa. */
export class BombPlacementSystem implements System {
  update(world: World) {
    const index = world.index;
    for (const [e, intent, bag, t] of world.query(Intent, BombBag, Transform)) {
      if (!intent.placeBomb) continue;
      intent.placeBomb = false;
      if (world.has(e, Dying) || bag.active >= bag.capacity) continue;
      const [col, row] = toCell(t.x, t.y);
      if (index.at(col, row).some((o) => world.has(o, Solid))) continue;
      // Quien esté encima puede salir de la bomba sin quedarse atrapado.
      const passable = new Set<Entity>();
      for (const [a] of world.query(Transform, Collider)) {
        if (overlapsCell(world, a, col, row)) passable.add(a);
      }
      createBomb(world, col, row, e, bag.range, passable);
      bag.active++;
    }
  }
}

/** Cuenta atrás, detonación, propagación de llamas y reacciones en cadena. */
export class BombSystem implements System {
  update(world: World, dt: number) {
    const pending: Entity[] = [];
    for (const [e, bomb, cell] of world.query(Bomb, GridCell)) {
      for (const a of [...bomb.passable]) {
        if (!world.alive(a) || !overlapsCell(world, a, cell.col, cell.row)) bomb.passable.delete(a);
      }
      bomb.timer -= dt;
      if (bomb.timer <= 0) pending.push(e);
    }

    const done = new Set<Entity>();
    while (pending.length) {
      const b = pending.pop()!;
      if (done.has(b) || !world.alive(b)) continue;
      done.add(b);
      pending.push(...this.detonate(world, b));
    }
  }

  private detonate(world: World, b: Entity): Entity[] {
    const index = world.index;
    const bomb = world.get(b, Bomb)!;
    const cell = world.get(b, GridCell)!;
    const bag = world.get(bomb.owner, BombBag);
    if (bag) bag.active = Math.max(0, bag.active - 1);
    world.destroy(b);

    const chained: Entity[] = [];
    createExplosion(world, cell.col, cell.row, "center", [0, 0]);
    for (const [dx, dy] of DIRECTIONS) {
      const flames: [number, number][] = [];
      for (let i = 1; i <= bomb.range; i++) {
        const c = cell.col + dx * i;
        const r = cell.row + dy * i;
        if (!index.inBounds(c, r)) break;
        const ents = [...index.at(c, r)];
        if (ents.some((o) => world.has(o, Wall))) break;
        const crate = ents.find((o) => world.has(o, Destructible));
        if (crate !== undefined) {
          if (!world.has(crate, Burning)) world.add(crate, new Burning(CRATE_BURN_TIME));
          break;
        }
        const other = ents.find((o) => world.has(o, Bomb));
        if (other !== undefined) {
          chained.push(other);
          break;
        }
        for (const o of ents) if (world.has(o, PowerUp)) world.destroy(o); // las llamas queman los buffs del suelo
        flames.push([c, r]);
      }
      flames.forEach(([c, r], i) => {
        createExplosion(world, c, r, i === flames.length - 1 ? "end" : "arm", [dx, dy]);
      });
    }
    return chained;
  }
}
