import { Intent, PlayerControl } from "../components";
import type { System, World } from "../ecs";

/** Fuente de intención (teclado o red) -> Intent de cada jugador. */
export class InputSystem implements System {
  update(world: World) {
    for (const [, ctrl, intent] of world.query(PlayerControl, Intent)) {
      const src = ctrl.source;
      src.poll();
      intent.dx = src.dx;
      intent.dy = src.dy;
      intent.alt = src.alt;
      if (src.takeBomb()) intent.placeBomb = true;
    }
  }
}
