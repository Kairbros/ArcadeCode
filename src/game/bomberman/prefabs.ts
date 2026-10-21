// Fábricas de entidades: qué componentes forman cada cosa del juego.
import {
  Bomb, BombBag, Collider, Destructible, Enemy, Explosion, FloatingText, GridCell, Intent, Killable,
  Lifetime, Movement, Player, PlayerControl, PowerUp, Solid, Sprite, Transform, Wall,
  type Dir, type ExplosionShape, type PowerUpKind,
} from "./components";
import {
  BASE_BOMBS, BASE_RANGE, BOMB_FUSE, ENEMY_COLOR, ENEMY_HITBOX, ENEMY_SPEED, EXPLOSION_TIME,
  PLAYER_BASE_SPEED, PLAYER_COLORS, PLAYER_HITBOX, PLAYER_NAMES, TEXT_TIME, TILE, type RGB,
} from "./config";
import type { Entity, World } from "./ecs";
import { cellCenter } from "./grid";
import type { IntentSource } from "./input";

export function createWall(world: World, col: number, row: number): Entity {
  return world.create(new GridCell(col, row), new Solid(), new Wall(), new Sprite("wall", 0));
}

export function createCrate(world: World, col: number, row: number, loot: PowerUpKind | null): Entity {
  return world.create(new GridCell(col, row), new Solid(), new Destructible(loot), new Sprite("crate", 0));
}

export function createPlayer(world: World, index: number, col: number, row: number, source: IntentSource): Entity {
  const [x, y] = cellCenter(col, row);
  return world.create(
    new Transform(x, y),
    new Collider((TILE * PLAYER_HITBOX) / 2),
    new Movement(PLAYER_BASE_SPEED),
    new Intent(),
    new PlayerControl(source),
    new Player(index, PLAYER_NAMES[index]),
    new BombBag(BASE_BOMBS, BASE_RANGE),
    new Killable(),
    new Sprite("player", 3, PLAYER_COLORS[index]),
  );
}

export function createEnemy(world: World, col: number, row: number): Entity {
  const [x, y] = cellCenter(col, row);
  return world.create(
    new Transform(x, y),
    new Collider((TILE * ENEMY_HITBOX) / 2),
    new Movement(ENEMY_SPEED),
    new Intent(),
    new Enemy(),
    new Killable(),
    new Sprite("enemy", 3, ENEMY_COLOR),
  );
}

export function createBomb(
  world: World, col: number, row: number, owner: Entity, range: number, passable: Set<Entity>,
): Entity {
  return world.create(
    new GridCell(col, row), new Solid(), new Bomb(owner, BOMB_FUSE, range, passable), new Sprite("bomb", 1),
  );
}

export function createExplosion(world: World, col: number, row: number, shape: ExplosionShape, direction: Dir): Entity {
  return world.create(
    new GridCell(col, row),
    new Explosion(shape, direction, EXPLOSION_TIME),
    new Lifetime(EXPLOSION_TIME),
    new Sprite("explosion", 2),
  );
}

export function createPowerUp(world: World, col: number, row: number, kind: PowerUpKind): Entity {
  return world.create(new GridCell(col, row), new PowerUp(kind), new Sprite("powerup", 1));
}

export function createFloatingText(world: World, x: number, y: number, text: string, color: RGB): Entity {
  return world.create(
    new Transform(x, y), new FloatingText(text, color, TEXT_TIME), new Lifetime(TEXT_TIME), new Sprite("text", 5),
  );
}
