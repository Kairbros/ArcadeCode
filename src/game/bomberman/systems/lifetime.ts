import { Dying, FloatingText, Lifetime, Transform } from "../components";
import type { System, World } from "../ecs";

/** Elimina entidades al terminar su animación de muerte. */
export class DyingSystem implements System {
  update(world: World, dt: number) {
    for (const [e, dying] of world.query(Dying)) {
      dying.timer -= dt;
      if (dying.timer <= 0) world.destroy(e);
    }
  }
}

/** Entidades temporales (llamas, textos flotantes). */
export class LifetimeSystem implements System {
  update(world: World, dt: number) {
    for (const [e, lt] of world.query(Lifetime)) {
      lt.remaining -= dt;
      if (lt.remaining <= 0) world.destroy(e);
    }
    for (const [, , t] of world.query(FloatingText, Transform)) t.y -= 30 * dt;
  }
}
