import { BombBag, Dying, Movement, Player, PowerUp, PowerUpKind, Transform } from "../components";
import { MAX_BOMBS, MAX_RANGE, PLAYER_MAX_SPEED, PLAYER_SPEED_STEP, TILE, type RGB } from "../config";
import type { System, World } from "../ecs";
import { toCell } from "../grid";
import { createFloatingText } from "../prefabs";

const LABELS: Record<PowerUpKind, [string, RGB]> = {
  [PowerUpKind.Speed]: ["+VELOCIDAD", [120, 210, 255]],
  [PowerUpKind.Range]: ["+RANGO", [255, 160, 60]],
  [PowerUpKind.Bombs]: ["+BOMBA", [220, 220, 235]],
};

export function applyPowerUp(kind: PowerUpKind, mov: Movement, bag: BombBag) {
  switch (kind) {
    case PowerUpKind.Speed:
      mov.speed = Math.min(PLAYER_MAX_SPEED, mov.speed + PLAYER_SPEED_STEP);
      break;
    case PowerUpKind.Range:
      bag.range = Math.min(MAX_RANGE, bag.range + 1);
      break;
    case PowerUpKind.Bombs:
      bag.capacity = Math.min(MAX_BOMBS, bag.capacity + 1);
      break;
  }
}

/** Recogida de buffs por los jugadores. */
export class PowerUpSystem implements System {
  update(world: World) {
    const index = world.index;
    for (const [e, , t, mov, bag] of world.query(Player, Transform, Movement, BombBag)) {
      if (world.has(e, Dying)) continue;
      const [col, row] = toCell(t.x, t.y);
      for (const o of [...index.at(col, row)]) {
        const pu = world.get(o, PowerUp);
        if (!pu) continue;
        applyPowerUp(pu.kind, mov, bag);
        world.destroy(o);
        const [text, color] = LABELS[pu.kind];
        createFloatingText(world, t.x, t.y - TILE * 0.5, text, color);
      }
    }
  }
}
