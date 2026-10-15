import { Dying, Enemy, Intent, Movement, Transform, type Dir } from "../components";
import type { System, World } from "../ecs";
import { DIRECTIONS, cellCenter, toCell } from "../grid";
import type { Rng } from "../../core/rng";

/** Enemigos errantes: eligen dirección al llegar al centro de una celda. */
export class AISystem implements System {
  constructor(private rng: Rng) {}

  update(world: World, dt: number) {
    const index = world.index;
    for (const [e, enemy, t, intent, mov] of world.query(Enemy, Transform, Intent, Movement)) {
      if (world.has(e, Dying)) {
        intent.dx = intent.dy = 0;
        continue;
      }
      enemy.timer -= dt;
      const [col, row] = toCell(t.x, t.y);
      const [cx, cy] = cellCenter(col, row);
      const centered = Math.abs(t.x - cx) <= 2 && Math.abs(t.y - cy) <= 2;

      if (mov.blocked && !centered) {
        enemy.dx = -enemy.dx;
        enemy.dy = -enemy.dy;
      } else if (
        centered &&
        (enemy.timer <= 0 || (enemy.dx === 0 && enemy.dy === 0) || index.isBlocked(col + enemy.dx, row + enemy.dy, e))
      ) {
        const options = DIRECTIONS.filter(([dx, dy]) => !index.isBlocked(col + dx, row + dy, e));
        if (options.length) {
          const forward = options.filter(([dx, dy]) => !(dx === -enemy.dx && dy === -enemy.dy));
          const pool: Dir[] = forward.length && this.rng.next() < 0.85 ? forward : options;
          [enemy.dx, enemy.dy] = this.rng.choice(pool);
          t.x = cx;
          t.y = cy;
        } else {
          enemy.dx = enemy.dy = 0;
        }
        enemy.timer = this.rng.uniform(0.8, 3.0);
      }

      intent.dx = enemy.dx;
      intent.dy = enemy.dy;
    }
  }
}
