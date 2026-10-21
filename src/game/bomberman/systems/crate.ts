import { Burning, Destructible, GridCell } from "../components";
import type { System, World } from "../ecs";
import { createPowerUp } from "../prefabs";

/** Las cajas en llamas desaparecen y sueltan su botín (si tienen). */
export class CrateSystem implements System {
  update(world: World, dt: number) {
    for (const [e, burn, cell, crate] of world.query(Burning, GridCell, Destructible)) {
      burn.timer -= dt;
      if (burn.timer <= 0) {
        world.destroy(e);
        if (crate.loot) createPowerUp(world, cell.col, cell.row, crate.loot);
      }
    }
  }
}
