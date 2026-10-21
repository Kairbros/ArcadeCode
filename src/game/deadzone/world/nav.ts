// Rejilla de navegación con A* y suavizado de ruta.
// Se construye desde los colisionadores del mapa, así que si una puerta se abre o una barricada
// cambia, basta con `rebuild()`: los zombis nunca atraviesan geometría sólida.

import type { Collider } from "../core/collision";
import type { Vec3 } from "../core/math";

export interface NavBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface HeapItem {
  idx: number;
  f: number;
}

/** Montículo binario mínimo para la lista abierta de A*. */
class MinHeap {
  private items: HeapItem[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: HeapItem): void {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].f <= this.items[i].f) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  pop(): HeapItem | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (!top || !last || this.items.length === 0) return top;
    this.items[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < this.items.length && this.items[l].f < this.items[m].f) m = l;
      if (r < this.items.length && this.items[r].f < this.items[m].f) m = r;
      if (m === i) break;
      [this.items[m], this.items[i]] = [this.items[i], this.items[m]];
      i = m;
    }
    return top;
  }
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly walkable: Uint8Array;
  /** Bloqueos dinámicos (ventanas con tablones): no tocan la geometría, solo la rejilla. */
  private readonly dyn: Uint8Array;
  /**
   * Margen de cuerpo con el que se engordan los colisionadores al rasterizar: una celda se cierra si
   * el muro toca el hueco que ocuparía el zombi, no solo si toca su centro (con 0,5 m de celda y muros
   * de 0,35 m el centro se cuela entre dos celdas y la rejilla no ve la pared).
   */
  private static readonly BODY = 0.3;

  constructor(
    readonly bounds: NavBounds,
    readonly cell: number,
    private colliders: readonly Collider[],
  ) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.walkable = new Uint8Array(this.cols * this.rows);
    this.dyn = new Uint8Array(this.cols * this.rows);
    this.rebuild();
  }

  /**
   * Bloquea o libera una zona rectangular de la rejilla (una ventana con tablones).
   * Los zombis no pueden cruzar mientras haya tablones: se quedan fuera rompiéndolos.
   */
  blockArea(x: number, z: number, halfX: number, halfZ: number, blocked: boolean): void {
    const a = this.cellOf(x - halfX, z - halfZ);
    const b = this.cellOf(x + halfX, z + halfZ);
    for (let iz = Math.min(a.iz, b.iz); iz <= Math.max(a.iz, b.iz); iz++) {
      for (let ix = Math.min(a.ix, b.ix); ix <= Math.max(a.ix, b.ix); ix++) {
        if (ix < 0 || iz < 0 || ix >= this.cols || iz >= this.rows) continue;
        this.dyn[iz * this.cols + ix] = blocked ? 1 : 0;
      }
    }
  }

  /** Recalcula la rejilla (tras abrir una puerta, por ejemplo). */
  rebuild(colliders: readonly Collider[] = this.colliders): void {
    this.colliders = colliders;
    const blockers = colliders.filter(
      (c) => c.enabled && c.tag !== "floor" && c.tag !== "window" && c.tag !== "ceiling" && c.tag !== "barricade",
    );
    const floors = colliders.filter((c) => c.enabled && c.tag === "floor");
    // 1) Celdas con suelo (el suelo es un rectángulo grande: basta su centro).
    for (let iz = 0; iz < this.rows; iz++) {
      for (let ix = 0; ix < this.cols; ix++) {
        const p = this.center(ix, iz);
        let ok = false;
        for (const f of floors) {
          if (p.x >= f.min.x && p.x <= f.max.x && p.z >= f.min.z && p.z <= f.max.z) {
            ok = true;
            break;
          }
        }
        this.walkable[iz * this.cols + ix] = ok ? 1 : 0;
      }
    }
    // 2) Muros, puertas y props: se cierra TODA celda que solape el hueco del colisionador engordado con
    //    el radio del cuerpo. Si solo se mirase el centro de la celda, un muro de 0,35 m cabe entero entre
    //    dos centros separados 0,5 m: la rejilla no lo vería, las rutas cruzarían paredes y los zombis se
    //    quedarían pegados a ellas sin llegar nunca al jugador.
    const margin = NavGrid.BODY;
    for (const b of blockers) {
      // Banda de altura del cuerpo (0,3 a 1,3 m): lo que esté fuera no estorba.
      if (b.max.y <= 0.31 || b.min.y >= 1.3) continue;
      const ix0 = Math.max(0, Math.floor((b.min.x - margin - this.bounds.minX) / this.cell));
      const ix1 = Math.min(this.cols - 1, Math.floor((b.max.x + margin - this.bounds.minX) / this.cell));
      const iz0 = Math.max(0, Math.floor((b.min.z - margin - this.bounds.minZ) / this.cell));
      const iz1 = Math.min(this.rows - 1, Math.floor((b.max.z + margin - this.bounds.minZ) / this.cell));
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) this.walkable[iz * this.cols + ix] = 0;
      }
    }
  }

  center(ix: number, iz: number): Vec3 {
    return {
      x: this.bounds.minX + (ix + 0.5) * this.cell,
      y: 0,
      z: this.bounds.minZ + (iz + 0.5) * this.cell,
    };
  }

  cellOf(x: number, z: number): { ix: number; iz: number } {
    return {
      ix: Math.floor((x - this.bounds.minX) / this.cell),
      iz: Math.floor((z - this.bounds.minZ) / this.cell),
    };
  }

  isWalkable(ix: number, iz: number): boolean {
    if (ix < 0 || iz < 0 || ix >= this.cols || iz >= this.rows) return false;
    const idx = iz * this.cols + ix;
    return this.walkable[idx] === 1 && this.dyn[idx] === 0;
  }

  /** Celda transitable más cercana (espiral) a un punto del mundo. */
  nearestWalkable(x: number, z: number, maxRings = 12): { ix: number; iz: number } | null {
    const { ix, iz } = this.cellOf(x, z);
    if (this.isWalkable(ix, iz)) return { ix, iz };
    for (let r = 1; r <= maxRings; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.isWalkable(ix + dx, iz + dz)) return { ix: ix + dx, iz: iz + dz };
        }
      }
    }
    return null;
  }

  /** A* en 8 direcciones. Devuelve los centros de celda desde el inicio al destino. */
  findPath(from: Vec3, to: Vec3, maxVisited = 9000): Vec3[] | null {
    const start = this.nearestWalkable(from.x, from.z);
    const goal = this.nearestWalkable(to.x, to.z);
    if (!start || !goal) return null;
    const width = this.cols;
    const startIdx = start.iz * width + start.ix;
    const goalIdx = goal.iz * width + goal.ix;
    if (startIdx === goalIdx) return [this.center(goal.ix, goal.iz)];

    const gScore = new Float32Array(this.cols * this.rows).fill(Infinity);
    const cameFrom = new Int32Array(this.cols * this.rows).fill(-1);
    const closed = new Uint8Array(this.cols * this.rows);
    gScore[startIdx] = 0;
    const open = new MinHeap();
    const h = (ix: number, iz: number): number => Math.hypot(ix - goal.ix, iz - goal.iz);
    open.push({ idx: startIdx, f: h(start.ix, start.iz) });

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ] as const;

    let visited = 0;
    while (open.size > 0) {
      const cur = open.pop();
      if (!cur) break;
      if (closed[cur.idx]) continue;
      closed[cur.idx] = 1;
      if (cur.idx === goalIdx) break;
      if (++visited > maxVisited) break;
      const cx = cur.idx % width;
      const cz = Math.floor(cur.idx / width);
      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!this.isWalkable(nx, nz)) continue;
        // Sin cortar esquinas en diagonal.
        if (dx !== 0 && dz !== 0 && (!this.isWalkable(cx + dx, cz) || !this.isWalkable(cx, cz + dz))) continue;
        const nIdx = nz * width + nx;
        if (closed[nIdx]) continue;
        const tentative = gScore[cur.idx] + cost;
        if (tentative < gScore[nIdx]) {
          gScore[nIdx] = tentative;
          cameFrom[nIdx] = cur.idx;
          open.push({ idx: nIdx, f: tentative + h(nx, nz) });
        }
      }
    }
    if (cameFrom[goalIdx] === -1 && startIdx !== goalIdx) return null;

    const path: Vec3[] = [];
    let idx = goalIdx;
    let guard = 0;
    while (idx !== -1 && guard++ < 20000) {
      path.push(this.center(idx % width, Math.floor(idx / width)));
      if (idx === startIdx) break;
      idx = cameFrom[idx];
    }
    path.reverse();
    return this.smooth(path);
  }

  /** Atajo: quita nodos intermedios cuando hay línea recta transitable entre ellos. */
  smooth(path: Vec3[]): Vec3[] {
    if (path.length <= 2) return path;
    const out: Vec3[] = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1;
      for (; j > i + 1; j--) {
        if (this.clearLine(path[i], path[j])) break;
      }
      out.push(path[j]);
      i = j;
    }
    return out;
  }

  /** Línea recta transitable a nivel de rejilla (muestreo fino). */
  clearLine(a: Vec3, b: Vec3): boolean {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(2, Math.ceil(len / (this.cell * 0.5)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const { ix, iz } = this.cellOf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!this.isWalkable(ix, iz)) return false;
    }
    return true;
  }
}
