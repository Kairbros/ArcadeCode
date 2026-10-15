/*
 * Generación procedural de mapas a partir de una semilla.
 *
 * Pasos:
 *   1. Borde de muros + pilares (con probabilidad) + muros extra aleatorios.
 *   2. Simetría aleatoria (ninguna, espejo, cuadrantes, rotación) para mapas justos.
 *   3. Zonas seguras en las esquinas de aparición.
 *   4. Garantía de conectividad: se abren muros hasta que todo el suelo sea alcanzable.
 *   5. Cajas con densidad modulada por ruido (agrupaciones naturales).
 *   6. Botín repartido equilibrado entre los 3 tipos de buff.
 */
import { POWERUP_KINDS, type PowerUpKind } from "./components";
import { DIRECTIONS } from "./grid";
import { Rng } from "../core/rng";

export const FLOOR = 0;
export const WALL = 1;
export const CRATE = 2;
export type Tile = typeof FLOOR | typeof WALL | typeof CRATE;

export const SYMMETRIES = ["ninguna", "espejo", "cuadrantes", "rotación"] as const;
export type SymmetryKind = (typeof SYMMETRIES)[number];

type Cell = [number, number];

export interface MapData {
  cols: number;
  rows: number;
  seed: number;
  symmetry: SymmetryKind;
  tiles: Tile[][]; // tiles[row][col]
  loot: (PowerUpKind | null)[][]; // loot[row][col]
  playerSpawns: Cell[];
  enemySpawns: Cell[];
}

/** Ruido de valor 2D (interpolación bilineal suavizada) en [0, 1]. */
class ValueNoise {
  private lattice: number[][];

  constructor(rng: Rng, cols: number, rows: number, private scale: number) {
    const w = Math.floor(cols / scale) + 2;
    const h = Math.floor(rows / scale) + 2;
    this.lattice = Array.from({ length: h }, () => Array.from({ length: w }, () => rng.next()));
  }

  sample(x: number, y: number): number {
    const fx = x / this.scale;
    const fy = y / this.scale;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const l = this.lattice;
    const top = l[y0][x0] + (l[y0][x0 + 1] - l[y0][x0]) * tx;
    const bottom = l[y0 + 1][x0] + (l[y0 + 1][x0 + 1] - l[y0 + 1][x0]) * tx;
    return top + (bottom - top) * ty;
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

class Symmetry {
  constructor(readonly kind: SymmetryKind, private cols: number, private rows: number) {}

  images(x: number, y: number): Cell[] {
    const mx = this.cols - 1 - x;
    const my = this.rows - 1 - y;
    let cells: Cell[];
    switch (this.kind) {
      case "espejo":
        cells = [[x, y], [mx, y]];
        break;
      case "cuadrantes":
        cells = [[x, y], [mx, y], [x, my], [mx, my]];
        break;
      case "rotación":
        cells = [[x, y], [mx, my]];
        break;
      default:
        cells = [[x, y]];
    }
    return cells;
  }

  /** Representante canónico (mínimo lexicográfico) del grupo de celdas simétricas. */
  canon(x: number, y: number): Cell {
    return this.images(x, y).reduce((a, b) => (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? b : a));
  }
}

export function generateMap(cols: number, rows: number, seed: number, nPlayers = 2, nEnemies = 3): MapData {
  const rng = new Rng(seed);
  const symmetry = rng.choice(SYMMETRIES);
  const pillarProb = rng.uniform(0.65, 1.0);
  const extraWallProb = rng.uniform(0.0, 0.1);
  const crateDensity = rng.uniform(0.45, 0.8);
  const lootRatio = rng.uniform(0.3, 0.5);
  const noise = new ValueNoise(rng, cols, rows, rng.uniform(2.5, 5.0));
  const sym = new Symmetry(symmetry, cols, rows);
  const key = (x: number, y: number) => y * cols + x;

  // Tiradas por celda canónica -> las celdas simétricas comparten resultado.
  const rolls = new Map<number, [number, number]>();
  const roll = (x: number, y: number): [number, number] => {
    const [cx, cy] = sym.canon(x, y);
    const k = key(cx, cy);
    let r = rolls.get(k);
    if (!r) {
      r = [rng.next(), rng.next()];
      rolls.set(k, r);
    }
    return r;
  };

  // 1. Muros
  const tiles: Tile[][] = Array.from({ length: rows }, () => Array<Tile>(cols).fill(FLOOR));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x === 0 || x === cols - 1 || y === 0 || y === rows - 1) {
        tiles[y][x] = WALL;
        continue;
      }
      const [rWall] = roll(x, y);
      if (x % 2 === 0 && y % 2 === 0) {
        if (rWall < pillarProb) tiles[y][x] = WALL;
      } else if (rWall < extraWallProb) {
        tiles[y][x] = WALL;
      }
    }
  }

  // 2. Zonas seguras en las 4 esquinas (en L, para poder escapar de la 1ª bomba)
  const corners: Cell[] = [
    [1, 1],
    [cols - 2, rows - 2],
    [cols - 2, 1],
    [1, rows - 2],
  ];
  const safe = new Set<number>();
  const offsets: Cell[] = [[0, 0], [1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, 2], [0, -1], [0, -2]];
  for (const [cx, cy] of corners) {
    for (const [dx, dy] of offsets) {
      const x = cx + dx;
      const y = cy + dy;
      if (x > 0 && x < cols - 1 && y > 0 && y < rows - 1) {
        tiles[y][x] = FLOOR;
        safe.add(key(x, y));
      }
    }
  }

  // 3. Conectividad
  ensureConnected(tiles, sym, rng, corners[0]);

  // 4. Enemigos lejos de los jugadores
  const playerSpawns = corners.slice(0, nPlayers);
  const enemySpawns = pickEnemySpawns(tiles, safe, playerSpawns, nEnemies, rng);
  for (const [ex, ey] of enemySpawns) {
    safe.add(key(ex, ey));
    const free = DIRECTIONS.map(([dx, dy]): Cell => [ex + dx, ey + dy]).filter(([x, y]) => tiles[y][x] !== WALL);
    if (free.length) {
      const [fx, fy] = rng.choice(free);
      safe.add(key(fx, fy)); // deja un hueco para que pueda moverse
    }
  }

  // 5. Cajas
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (tiles[y][x] !== FLOOR || safe.has(key(x, y))) continue;
      const [, rCrate] = roll(x, y);
      const [cx, cy] = sym.canon(x, y);
      const p = crateDensity * (0.5 + noise.sample(cx, cy));
      if (rCrate < p) tiles[y][x] = CRATE;
    }
  }

  // 6. Botín equilibrado
  const crates: Cell[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (tiles[y][x] === CRATE) crates.push([x, y]);
  rng.shuffle(crates);
  const nLoot = Math.min(crates.length, Math.max(3, Math.round(crates.length * lootRatio)));
  const kinds: PowerUpKind[] = [];
  while (kinds.length < nLoot) kinds.push(...rng.shuffle([...POWERUP_KINDS]));
  const loot: (PowerUpKind | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (let i = 0; i < nLoot; i++) {
    const [x, y] = crates[i];
    loot[y][x] = kinds[i];
  }

  return { cols, rows, seed, symmetry, tiles, loot, playerSpawns, enemySpawns };
}

export function flood(tiles: Tile[][], start: Cell): Set<number> {
  const rows = tiles.length;
  const cols = tiles[0].length;
  const seen = new Set<number>([start[1] * cols + start[0]]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      const k = ny * cols + nx;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !seen.has(k) && tiles[ny][nx] !== WALL) {
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

function ensureConnected(tiles: Tile[][], sym: Symmetry, rng: Rng, start: Cell) {
  const rows = tiles.length;
  const cols = tiles[0].length;
  const key = (x: number, y: number) => y * cols + x;
  for (;;) {
    const reached = flood(tiles, start);
    const unreached: Cell[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (tiles[y][x] !== WALL && !reached.has(key(x, y))) unreached.push([x, y]);
      }
    }
    if (!unreached.length) return;
    const unreachedSet = new Set(unreached.map(([x, y]) => key(x, y)));

    const bridges: Cell[] = [];
    const touching: Cell[] = [];
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (tiles[y][x] !== WALL) continue;
        const nbrs = DIRECTIONS.map(([dx, dy]) => key(x + dx, y + dy));
        if (nbrs.some((n) => reached.has(n))) {
          touching.push([x, y]);
          if (nbrs.some((n) => unreachedSet.has(n))) bridges.push([x, y]);
        }
      }
    }

    let target: Cell;
    if (bridges.length) {
      target = rng.choice(bridges);
    } else {
      // Ningún muro separa directamente: abrir el más cercano a la zona aislada.
      const dist = ([wx, wy]: Cell) => Math.min(...unreached.map(([ux, uy]) => Math.abs(wx - ux) + Math.abs(wy - uy)));
      const best = Math.min(...touching.map(dist));
      target = rng.choice(touching.filter((w) => dist(w) === best));
    }
    for (const [ix, iy] of sym.images(target[0], target[1])) {
      if (ix > 0 && ix < cols - 1 && iy > 0 && iy < rows - 1) tiles[iy][ix] = FLOOR;
    }
  }
}

function pickEnemySpawns(tiles: Tile[][], safe: Set<number>, playerSpawns: Cell[], n: number, rng: Rng): Cell[] {
  const rows = tiles.length;
  const cols = tiles[0].length;
  const candidates: Cell[] = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (tiles[y][x] === WALL || safe.has(y * cols + x)) continue;
      const minDist = Math.min(...playerSpawns.map(([px, py]) => Math.abs(x - px) + Math.abs(y - py)));
      if (minDist >= 7) candidates.push([x, y]);
    }
  }
  rng.shuffle(candidates);
  const chosen: Cell[] = [];
  for (const c of candidates) {
    if (chosen.every((o) => Math.hypot(c[0] - o[0], c[1] - o[1]) >= 3)) {
      chosen.push(c);
      if (chosen.length === n) break;
    }
  }
  return chosen;
}
