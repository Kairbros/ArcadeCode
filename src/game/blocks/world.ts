// El mundo de bloques: generación desde una semilla, lectura/escritura de bloques, chunks que hay que
// volver a dibujar y el rayo para saber a qué bloque se apunta. Sin DOM ni WebGL (se usa en Node).
import {
  AIR, BEDROCK, BLOCKS, DIRT, GRASS, LEAVES, LOG, SAND, STONE, WATER,
} from "./blocks";
import { CHUNK, SEA, WX, WY, WZ } from "./config";

/** Entero pseudoaleatorio fijo para unas coordenadas y una semilla. */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruido de valor 2D suave (0..1). */
function noise2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = x - x0, tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = hash3(x0, 0, z0, seed), b = hash3(x0 + 1, 0, z0, seed);
  const c = hash3(x0, 0, z0 + 1, seed), d = hash3(x0 + 1, 0, z0 + 1, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
}

/** Ruido fractal: varias octavas de noise2 (0..1). */
function fbm(x: number, z: number, seed: number, octaves: number): number {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise2(x, z, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2;
    z *= 2;
  }
  return sum / norm;
}

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Cara por la que entra el rayo (dónde se pondría un bloque nuevo: x + nx...). */
  nx: number;
  ny: number;
  nz: number;
}

export const CHUNKS_X = WX / CHUNK;
export const CHUNKS_Z = WZ / CHUNK;

export class World {
  readonly data = new Uint8Array(WX * WY * WZ);
  /** El mundo tal como se generó (para saber qué bloques ha cambiado alguien). */
  private readonly gen: Uint8Array;
  /** Bloques distintos de los generados: índice → bloque. */
  readonly diff = new Map<number, number>();
  /** Chunks que hay que volver a dibujar (cx + cz * CHUNKS_X). */
  readonly dirty = new Set<number>();

  constructor(readonly seed: number) {
    this.generate();
    this.gen = this.data.slice();
    for (let i = 0; i < CHUNKS_X * CHUNKS_Z; i++) this.dirty.add(i);
  }

  static inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < WX && y < WY && z < WZ;
  }

  static index(x: number, y: number, z: number): number {
    return (y * WZ + z) * WX + x;
  }

  get(x: number, y: number, z: number): number {
    if (!World.inside(x, y, z)) return y < 0 ? BEDROCK : AIR;
    return this.data[World.index(x, y, z)];
  }

  /** Choca: bloques sólidos y el borde del mundo (pared invisible a los lados y suelo por debajo). */
  solidAt(x: number, y: number, z: number): boolean {
    if (x < 0 || z < 0 || x >= WX || z >= WZ || y < 0) return true;
    if (y >= WY) return false;
    return BLOCKS[this.data[World.index(x, y, z)]].solid;
  }

  set(x: number, y: number, z: number, b: number) {
    if (!World.inside(x, y, z)) return;
    const i = World.index(x, y, z);
    if (this.data[i] === b) return;
    this.data[i] = b;
    if (this.gen[i] === b) this.diff.delete(i);
    else this.diff.set(i, b);
    // El chunk del bloque y, si está en el borde, el vecino (sus caras dependen de este bloque).
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.dirty.add(cx + cz * CHUNKS_X);
    if (x % CHUNK === 0 && cx > 0) this.dirty.add(cx - 1 + cz * CHUNKS_X);
    if (x % CHUNK === CHUNK - 1 && cx < CHUNKS_X - 1) this.dirty.add(cx + 1 + cz * CHUNKS_X);
    if (z % CHUNK === 0 && cz > 0) this.dirty.add(cx + (cz - 1) * CHUNKS_X);
    if (z % CHUNK === CHUNK - 1 && cz < CHUNKS_Z - 1) this.dirty.add(cx + (cz + 1) * CHUNKS_X);
  }

  /** Cambios respecto al mundo generado, en plano: x, y, z, bloque... */
  diffList(): number[] {
    const out: number[] = [];
    for (const [i, b] of this.diff) {
      const x = i % WX, z = Math.floor(i / WX) % WZ, y = Math.floor(i / (WX * WZ));
      out.push(x, y, z, b);
    }
    return out;
  }

  /** Deja el mundo como el generado más `flat` (lista x, y, z, bloque...). */
  loadDiff(flat: number[]) {
    for (const i of [...this.diff.keys()]) {
      const x = i % WX, z = Math.floor(i / WX) % WZ, y = Math.floor(i / (WX * WZ));
      this.set(x, y, z, this.gen[i]);
    }
    for (let k = 0; k + 3 < flat.length; k += 4) this.set(flat[k], flat[k + 1], flat[k + 2], flat[k + 3]);
  }

  /** Altura del primer bloque sólido desde arriba en una columna (para aparecer encima). */
  surface(x: number, z: number): number {
    for (let y = WY - 1; y >= 0; y--) {
      const b = this.get(x, y, z);
      if (b !== AIR && b !== LEAVES && b !== WATER) return y;
    }
    return 0;
  }

  /** Columna de tierra firme (sin agua encima) más cercana a (x, z), buscando en espiral. */
  dryColumn(x: number, z: number): [number, number] {
    for (let r = 0; r < Math.max(WX, WZ); r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cx = x + dx, cz = z + dz;
          if (cx < 1 || cz < 1 || cx >= WX - 1 || cz >= WZ - 1) continue;
          const top = this.surface(cx, cz);
          if (top >= SEA && this.get(cx, top + 1, cz) === AIR && this.get(cx, top, cz) !== LEAVES) return [cx, cz];
        }
      }
    }
    return [x, z];
  }

  // --- generación ---
  private generate() {
    const s = this.seed;
    const heights = new Int32Array(WX * WZ);
    for (let z = 0; z < WZ; z++) {
      for (let x = 0; x < WX; x++) {
        // Llanuras y colinas suaves con algún monte; más bajo hacia el agua.
        const base = fbm(x / 40, z / 40, s, 4);
        const hills = fbm(x / 14, z / 14, s + 7, 2);
        const mount = Math.max(0, fbm(x / 60, z / 60, s + 13, 3) - 0.55) * 40;
        const h = Math.round(11 + base * 16 + hills * 3 + mount);
        heights[x + z * WX] = Math.max(2, Math.min(WY - 10, h));
      }
    }
    for (let z = 0; z < WZ; z++) {
      for (let x = 0; x < WX; x++) {
        const h = heights[x + z * WX];
        const beach = h <= SEA; // arena solo en la orilla y bajo el agua
        for (let y = 0; y <= Math.max(h, SEA); y++) {
          let b = AIR;
          if (y === 0) b = BEDROCK;
          else if (y < h - 3) b = STONE;
          else if (y < h) b = beach ? SAND : DIRT;
          else if (y === h) b = beach ? SAND : h > 30 ? STONE : GRASS;
          else if (y <= SEA) b = WATER;
          this.data[World.index(x, y, z)] = b;
        }
      }
    }
    // Árboles: en hierba, lejos del borde y sin pegarse unos a otros.
    for (let z = 3; z < WZ - 3; z++) {
      for (let x = 3; x < WX - 3; x++) {
        const h = heights[x + z * WX];
        if (this.data[World.index(x, h, z)] !== GRASS || hash3(x, 1, z, s) > 0.018) continue;
        if (hash3(x >> 2, 2, z >> 2, s) < 0.3) continue; // claros sin árboles
        this.tree(x, h + 1, z, 4 + Math.floor(hash3(x, 3, z, s) * 3));
      }
    }
  }

  private tree(x: number, y: number, z: number, trunk: number) {
    const top = y + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy >= 0 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          // Sin las esquinas de arriba: copa algo redondeada.
          if (r === 1 && dy === 1 && dx !== 0 && dz !== 0) continue;
          if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && hash3(x + dx, top + dy, z + dz, this.seed) < 0.6) continue;
          const yy = top + dy;
          if (World.inside(x + dx, yy, z + dz) && this.data[World.index(x + dx, yy, z + dz)] === AIR) {
            this.data[World.index(x + dx, yy, z + dz)] = LEAVES;
          }
        }
      }
    }
    for (let i = 0; i < trunk; i++) if (World.inside(x, y + i, z)) this.data[World.index(x, y + i, z)] = LOG;
  }

  // --- rayo (recorrido de casillas, Amanatides–Woo) ---
  /** Primer bloque que no es aire ni agua en la dirección (dx, dy, dz) normalizada. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity, tdz = sz ? Math.abs(1 / dz) : Infinity;
    let tx = sx > 0 ? (x + 1 - ox) * tdx : sx < 0 ? (ox - x) * tdx : Infinity;
    let ty = sy > 0 ? (y + 1 - oy) * tdy : sy < 0 ? (oy - y) * tdy : Infinity;
    let tz = sz > 0 ? (z + 1 - oz) * tdz : sz < 0 ? (oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= maxDist) {
      const b = this.get(x, y, z);
      if (b !== AIR && b !== WATER && World.inside(x, y, z)) return { x, y, z, nx, ny, nz };
      if (tx < ty && tx < tz) {
        x += sx; t = tx; tx += tdx; [nx, ny, nz] = [-sx, 0, 0];
      } else if (ty < tz) {
        y += sy; t = ty; ty += tdy; [nx, ny, nz] = [0, -sy, 0];
      } else {
        z += sz; t = tz; tz += tdz; [nx, ny, nz] = [0, 0, -sz];
      }
    }
    return null;
  }
}
