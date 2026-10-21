import { Collider, Dying, Enemy, Explosion, GridCell, Killable, Player, Transform } from "../components";
import { DEATH_TIME } from "../config";
import type { Entity, System, World } from "../ecs";
import { toCell } from "../grid";

export function kill(world: World, e: Entity) {
  world.add(e, new Dying(DEATH_TIME));
  const player = world.get(e, Player);
  if (player) player.alive = false;
}

/** Muertes por llamas y por contacto con enemigos. */
export class DamageSystem implements System {
  update(world: World) {
    const cols = world.index.cols;
    const fire = new Set(world.query(Explosion, GridCell).map(([, , c]) => c.row * cols + c.col));
    if (fire.size) {
      for (const [e, t, col] of world.query(Transform, Collider, Killable)) {
        if (world.has(e, Dying)) continue;
        const h = col.half * 0.45; // caja reducida: perdona roces
        const burned = [-h, h].some((ox) =>
          [-h, h].some((oy) => {
            const [c, r] = toCell(t.x + ox, t.y + oy);
            return fire.has(r * cols + c);
          }),
        );
        if (burned) kill(world, e);
      }
    }

    const enemies = world
      .query(Enemy, Transform, Collider)
      .filter(([e]) => !world.has(e, Dying))
      .map(([, , t, c]) => [t, c] as const);
    for (const [e, , t, c] of world.query(Player, Transform, Collider)) {
      if (world.has(e, Dying)) continue;
      for (const [et, ec] of enemies) {
        const reach = (c.half + ec.half) * 0.75;
        if (Math.abs(et.x - t.x) < reach && Math.abs(et.y - t.y) < reach) {
          kill(world, e);
          break;
        }
      }
    }
  }
}
