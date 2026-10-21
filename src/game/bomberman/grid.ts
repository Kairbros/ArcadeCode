// Utilidades de rejilla e índice espacial.
import { Bomb, GridCell, Solid, type Dir } from "./components";
import { TILE } from "./config";
import type { Entity, World } from "./ecs";

export const DIRECTIONS: Dir[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function toCell(x: number, y: number): [number, number] {
  return [Math.floor(x / TILE), Math.floor(y / TILE)];
}

export function cellCenter(col: number, row: number): [number, number] {
  return [(col + 0.5) * TILE, (row + 0.5) * TILE];
}

const NONE: readonly Entity[] = [];

/** Celda -> entidades con GridCell. Se reconstruye solo cuando el mundo cambia. */
export class SpatialIndex {
  private cells = new Map<number, Entity[]>();
  private syncedVersion = -1;

  constructor(private world: World, readonly cols: number, readonly rows: number) {}

  private sync() {
    if (this.syncedVersion === this.world.version) return;
    const cells = new Map<number, Entity[]>();
    for (const [e, gc] of this.world.query(GridCell)) {
      const key = gc.row * this.cols + gc.col;
      const list = cells.get(key);
      if (list) list.push(e);
      else cells.set(key, [e]);
    }
    this.cells = cells;
    this.syncedVersion = this.world.version;
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  at(col: number, row: number): readonly Entity[] {
    if (!this.inBounds(col, row)) return NONE;
    this.sync();
    return this.cells.get(row * this.cols + col) ?? NONE;
  }

  isBlocked(col: number, row: number, mover?: Entity): boolean {
    if (!this.inBounds(col, row)) return true;
    for (const e of this.at(col, row)) {
      if (!this.world.has(e, Solid)) continue;
      const bomb = this.world.get(e, Bomb);
      if (bomb && mover !== undefined && bomb.passable.has(mover)) continue;
      return true;
    }
    return false;
  }
}
