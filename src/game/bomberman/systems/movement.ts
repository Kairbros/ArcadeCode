import { Collider, Dying, Intent, Movement, Transform, type Dir } from "../components";
import { TILE } from "../config";
import type { Entity, System, World } from "../ecs";
import { toCell, type SpatialIndex } from "../grid";

const SUBSTEP = 1; // px; evita huecos contra paredes y atravesar esquinas

/** Mueve según Intent con colisión AABB contra celdas sólidas y deslizamiento en esquinas. */
export class MovementSystem implements System {
  update(world: World, dt: number) {
    const index = world.index;
    for (const [e, t, mov, intent, col] of world.query(Transform, Movement, Intent, Collider)) {
      mov.moving = mov.blocked = false;
      if (world.has(e, Dying) || (intent.dx === 0 && intent.dy === 0)) continue;
      const step = mov.speed * dt;
      let direction: Dir = [intent.dx, intent.dy];
      let moved = this.advance(index, e, t, col.half, direction, step);
      if (!moved && intent.alt) {
        direction = intent.alt;
        moved = this.advance(index, e, t, col.half, direction, step);
      }
      mov.facing = moved ? direction : [intent.dx, intent.dy];
      mov.moving = moved;
      mov.blocked = !moved;
    }
  }

  private advance(index: SpatialIndex, e: Entity, t: Transform, half: number, [dx, dy]: Dir, step: number): boolean {
    let moved = false;
    let remaining = step;
    while (remaining > 1e-6) {
      const s = Math.min(SUBSTEP, remaining);
      remaining -= s;
      if (this.tryMove(index, e, t, half, t.x + dx * s, t.y + dy * s) || this.slide(index, e, t, half, dx, dy, s)) {
        moved = true;
      } else {
        break;
      }
    }
    return moved;
  }

  private tryMove(index: SpatialIndex, e: Entity, t: Transform, half: number, nx: number, ny: number): boolean {
    if (collides(index, e, nx, ny, half)) return false;
    t.x = nx;
    t.y = ny;
    return true;
  }

  /** Si choca contra una esquina pero la celda de enfrente está libre, se alinea al carril. */
  private slide(index: SpatialIndex, e: Entity, t: Transform, half: number, dx: number, dy: number, s: number) {
    const [col, row] = toCell(t.x, t.y);
    if (dx) {
      const off = t.y - (row + 0.5) * TILE;
      if (Math.abs(off) < 1e-3 || index.isBlocked(col + dx, row, e)) return false;
      return this.tryMove(index, e, t, half, t.x, t.y - Math.sign(off) * Math.min(s, Math.abs(off)));
    }
    const off = t.x - (col + 0.5) * TILE;
    if (Math.abs(off) < 1e-3 || index.isBlocked(col, row + dy, e)) return false;
    return this.tryMove(index, e, t, half, t.x - Math.sign(off) * Math.min(s, Math.abs(off)), t.y);
  }
}

function collides(index: SpatialIndex, e: Entity, x: number, y: number, half: number): boolean {
  const c0 = Math.floor((x - half) / TILE);
  const c1 = Math.floor((x + half - 1e-3) / TILE);
  const r0 = Math.floor((y - half) / TILE);
  const r1 = Math.floor((y + half - 1e-3) / TILE);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (index.isBlocked(c, r, e)) return true;
    }
  }
  return false;
}
