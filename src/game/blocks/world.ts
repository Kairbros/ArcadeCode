// El mundo de bloques: generación desde una semilla (relieve, cuevas, menas y árboles), lectura/escritura de
// bloques, luz (del cielo y de las antorchas), chunks que hay que volver a dibujar y el rayo para saber a qué
// bloque se apunta. Sin DOM ni WebGL (se usa en Node).
import { Rng } from "../core/rng";
import {
  AIR, BEDROCK, BLOCKS, COAL_ORE, DIAMOND_ORE, DIRT, GRASS, IRON_ORE, LEAVES, LOG, SAND, STONE, WATER,
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
  /** Distancia desde el origen del rayo hasta la cara. */
  t: number;
}

export const CHUNKS_X = WX / CHUNK;
export const CHUNKS_Z = WZ / CHUNK;
/** Hasta dónde llega la luz (una antorcha da 14 y baja 1 por bloque). */
const LIGHT_REACH = 15;
/** Las hojas y el agua frenan la luz un punto más por bloque. */
const dims = (b: number) => b === LEAVES || b === WATER;

/** Dónde se apoya una antorcha: 0 = suelo, 1..4 = pared en +x, −x, +z, −z; -1 = en ningún sitio. */
export const TORCH_WALLS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class World {
  readonly data = new Uint8Array(WX * WY * WZ);
  /** Luz de cada casilla: la del cielo en los 4 bits altos y la de las antorchas en los 4 bajos (0–15). */
  readonly light = new Uint8Array(WX * WY * WZ);
  /** El mundo tal como se generó (para saber qué bloques ha cambiado alguien). */
  private readonly gen: Uint8Array;
  /** Bloques distintos de los generados: índice → bloque. */
  readonly diff = new Map<number, number>();
  /** Chunks que hay que volver a dibujar (cx + cz * CHUNKS_X). */
  readonly dirty = new Set<number>();
  /** La luz se calcula al pedirla (`flushLight`): todo la primera vez y luego la zona de los cambios. */
  private lightReady = false;
  private lightBox: [number, number, number, number] | null = null;

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
    this.markDirty(x, z);
    // La luz de alrededor se recalcula cuando haga falta.
    if (this.lightReady) {
      const r = LIGHT_REACH, box = this.lightBox;
      this.lightBox = box
        ? [Math.min(box[0], x - r), Math.max(box[1], x + r), Math.min(box[2], z - r), Math.max(box[3], z + r)]
        : [x - r, x + r, z - r, z + r];
    }
  }

  /** El chunk de la casilla y los vecinos si está en el borde (sus caras y su luz suave dependen de ella). */
  private markDirty(x: number, z: number) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const xs = [cx], zs = [cz];
    if (x % CHUNK === 0 && cx > 0) xs.push(cx - 1);
    if (x % CHUNK === CHUNK - 1 && cx < CHUNKS_X - 1) xs.push(cx + 1);
    if (z % CHUNK === 0 && cz > 0) zs.push(cz - 1);
    if (z % CHUNK === CHUNK - 1 && cz < CHUNKS_Z - 1) zs.push(cz + 1);
    for (const a of xs) for (const c of zs) this.dirty.add(a + c * CHUNKS_X);
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
      if (b !== AIR && b !== LEAVES && b !== WATER && BLOCKS[b].solid) return y;
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

  /** Dónde se apoyaría una antorcha en (x, y, z): 0 = suelo, 1..4 = una pared (`TORCH_WALLS`), -1 = nada. */
  torchSupport(x: number, y: number, z: number): number {
    const holds = (bx: number, by: number, bz: number) => World.inside(bx, by, bz) && BLOCKS[this.get(bx, by, bz)].solid;
    if (holds(x, y - 1, z)) return 0;
    for (let k = 0; k < 4; k++) if (holds(x + TORCH_WALLS[k][0], y, z + TORCH_WALLS[k][1])) return k + 1;
    return -1;
  }

  // --- luz ---
  /** Luz guardada de una casilla (fuera del mundo, cielo pleno a los lados y arriba; nada debajo). */
  lightAt(x: number, y: number, z: number): number {
    if (y >= WY) return 0xf0;
    if (y < 0) return 0;
    if (x < 0 || z < 0 || x >= WX || z >= WZ) return 0xf0;
    return this.light[World.index(x, y, z)];
  }

  /** Pone la luz al día: todo el mundo la primera vez; luego, la zona de los últimos cambios. */
  flushLight() {
    if (!this.lightReady) {
      this.relight(0, WX - 1, 0, WZ - 1);
      this.lightReady = true;
      this.lightBox = null;
      return;
    }
    const box = this.lightBox;
    if (!box) return;
    this.lightBox = null;
    const x0 = Math.max(0, box[0]), x1 = Math.min(WX - 1, box[1]), z0 = Math.max(0, box[2]), z1 = Math.min(WZ - 1, box[3]);
    // Se guarda la de antes para rehacer solo los chunks donde ha cambiado algo.
    const before = new Uint8Array((x1 - x0 + 1) * WY * (z1 - z0 + 1));
    let k = 0;
    for (let y = 0; y < WY; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) before[k++] = this.light[World.index(x, y, z)];
    this.relight(x0, x1, z0, z1);
    k = 0;
    for (let y = 0; y < WY; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) if (before[k++] !== this.light[World.index(x, y, z)]) this.markDirty(x, z);
      }
    }
  }

  /** Recalcula la luz de una zona (con toda su altura); la de fuera se queda como estaba y entra por el borde. */
  private relight(x0: number, x1: number, z0: number, z1: number) {
    for (let y = 0; y < WY; y++) for (let z = z0; z <= z1; z++) this.light.fill(0, World.index(x0, y, z), World.index(x1, y, z) + 1);
    this.spread(x0, x1, z0, z1, true);
    this.spread(x0, x1, z0, z1, false);
  }

  /**
   * Reparte un canal de luz (cielo o antorchas) por la zona, de más a menos (cola por niveles): cada casilla se
   * fija una sola vez con su mejor valor. Baja 1 por bloque (2 por hojas y agua) y no entra en bloques opacos.
   */
  private spread(x0: number, x1: number, z0: number, z1: number, sky: boolean) {
    const L = this.light, D = this.data;
    const level = (i: number) => (sky ? L[i] >> 4 : L[i] & 15);
    const put = (i: number, v: number) => (L[i] = sky ? (L[i] & 15) | (v << 4) : (L[i] & 240) | v);
    const buckets: number[][] = Array.from({ length: 16 }, () => []);
    if (sky) {
      // Altura de lo primero que tapa el cielo en cada columna (con un margen de una alrededor de la zona).
      const cw = x1 - x0 + 3;
      const cover = new Int16Array(cw * (z1 - z0 + 3)).fill(WY);
      const covered = (x: number, z: number) => cover[x - x0 + 1 + (z - z0 + 1) * cw];
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        for (let x = x0 - 1; x <= x1 + 1; x++) {
          if (x < 0 || z < 0 || x >= WX || z >= WZ) continue;
          let y = WY - 1;
          while (y >= 0 && D[World.index(x, y, z)] === AIR) y--;
          cover[x - x0 + 1 + (z - z0 + 1) * cw] = y;
        }
      }
      // El cielo baja recto por cada columna hasta el primer bloque opaco (las hojas y el agua lo atenúan).
      // El cielo pleno solo hace falta repartirlo junto a una columna tapada a esa altura (si no, ya está a 15).
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          let lv = 15;
          for (let y = WY - 1; y >= 0 && lv > 0; y--) {
            const i = World.index(x, y, z), b = D[i];
            if (BLOCKS[b].opaque) break;
            if (b !== AIR) lv -= dims(b) ? 1 : 0;
            if (lv <= 0) break;
            put(i, lv);
            const edge = lv < 15 || b !== AIR ||
              (x > 0 && covered(x - 1, z) >= y) || (x < WX - 1 && covered(x + 1, z) >= y) ||
              (z > 0 && covered(x, z - 1) >= y) || (z < WZ - 1 && covered(x, z + 1) >= y);
            if (edge) buckets[lv].push(i);
          }
        }
      }
    } else {
      for (let y = 0; y < WY; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const i = World.index(x, y, z), e = BLOCKS[D[i]].light;
            if (!e) continue;
            put(i, e);
            buckets[e].push(i);
          }
        }
      }
    }
    // La luz de fuera de la zona entra por el borde (sin tocarla).
    const edge = (x: number, z: number) => {
      if (x < 0 || z < 0 || x >= WX || z >= WZ) return;
      for (let y = 0; y < WY; y++) {
        const i = World.index(x, y, z), v = level(i);
        if (v > 1) buckets[v].push(i);
      }
    };
    for (let z = z0; z <= z1; z++) {
      edge(x0 - 1, z);
      edge(x1 + 1, z);
    }
    for (let x = x0; x <= x1; x++) {
      edge(x, z0 - 1);
      edge(x, z1 + 1);
    }
    const plane = WX * WZ;
    for (let lv = 15; lv >= 2; lv--) {
      const q = buckets[lv];
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        if (level(i) !== lv) continue; // ya mejorada por otro camino
        const x = i % WX, z = Math.floor(i / WX) % WZ, y = Math.floor(i / plane);
        for (let n = 0; n < 6; n++) {
          const nx = x + (n === 0 ? 1 : n === 1 ? -1 : 0);
          const ny = y + (n === 2 ? 1 : n === 3 ? -1 : 0);
          const nz = z + (n === 4 ? 1 : n === 5 ? -1 : 0);
          if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || ny < 0 || ny >= WY) continue;
          const j = World.index(nx, ny, nz), b = D[j];
          if (BLOCKS[b].opaque) continue;
          const v = lv - 1 - (dims(b) ? 1 : 0);
          if (v > level(j)) {
            put(j, v);
            if (v >= 2) buckets[v].push(j);
          }
        }
      }
    }
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
    const rng = new Rng(s * 7 + 3);
    this.ores(rng);
    this.caves(rng, heights);
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

  /** Vetas de mineral dentro de la piedra: carbón por todas partes, hierro más abajo, diamante junto al fondo. */
  private ores(r: Rng) {
    const vein = (ore: number, count: number, size: number, maxY: number) => {
      for (let c = 0; c < count; c++) {
        let x = Math.floor(r.uniform(1, WX - 1)), y = 1 + Math.floor(r.next() * (maxY - 1)), z = Math.floor(r.uniform(1, WZ - 1));
        for (let k = 0; k < size; k++) {
          if (World.inside(x, y, z) && this.data[World.index(x, y, z)] === STONE) this.data[World.index(x, y, z)] = ore;
          const a = Math.floor(r.next() * 6);
          if (a < 2) x += a ? 1 : -1;
          else if (a < 4) y += a === 3 ? 1 : -1;
          else z += a === 5 ? 1 : -1;
        }
      }
    };
    vein(COAL_ORE, 130, 9, 44);
    vein(IRON_ORE, 90, 6, 30);
    vein(DIAMOND_ORE, 16, 4, 10);
  }

  /**
   * Cuevas: túneles que serpentean (algunos empiezan en la superficie y hacen de entrada) con alguna sala más
   * ancha. No se vacía nada pegado al agua (no quedan huecos bajo el mar) ni la roca madre.
   */
  private caves(r: Rng, heights: Int32Array) {
    const carve = (cx: number, cy: number, cz: number, rad: number) => {
      const r2 = rad * rad;
      for (let y = Math.max(1, Math.floor(cy - rad)); y <= Math.ceil(cy + rad); y++) {
        for (let z = Math.floor(cz - rad); z <= Math.ceil(cz + rad); z++) {
          for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
            if (!World.inside(x, y, z) || x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
            const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.25, dz = z + 0.5 - cz;
            if (dx * dx + dy * dy + dz * dz > r2) continue;
            const i = World.index(x, y, z), b = this.data[i];
            if (b === AIR || b === WATER || b === BEDROCK) continue;
            const wet = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
              .some(([ax, ay, az]) => this.get(x + ax, y + ay, z + az) === WATER);
            if (!wet) this.data[i] = AIR;
          }
        }
      }
    };
    const worms = 18;
    for (let w = 0; w < worms; w++) {
      let x = r.uniform(6, WX - 6), z = r.uniform(6, WZ - 6);
      const h = heights[Math.floor(x) + Math.floor(z) * WX];
      const entrance = w < 6 && h > SEA + 1;
      let y = entrance ? h + 1 : r.uniform(3, Math.max(4, h - 6));
      let yaw = r.next() * Math.PI * 2;
      let pitch = entrance ? -0.5 - r.next() * 0.3 : (r.next() - 0.5) * 0.5;
      const rad = 1.3 + r.next() * 1.2;
      const len = 50 + Math.floor(r.next() * 90);
      for (let step = 0; step < len; step++) {
        carve(x, y, z, rad * (0.8 + 0.35 * Math.sin(step * 0.31 + w)));
        if (r.next() < 0.012) carve(x, y, z, 3.5 + r.next() * 1.8); // sala
        x += Math.cos(pitch) * Math.cos(yaw);
        z += Math.cos(pitch) * Math.sin(yaw);
        y += Math.sin(pitch);
        yaw += (r.next() - 0.5) * 0.5;
        pitch = pitch * 0.92 + (r.next() - 0.5) * 0.22;
        // Sin salir por abajo ni volver a la superficie (salvo la entrada, que baja).
        if (y < 3) pitch = Math.abs(pitch) * 0.5 + 0.05;
        const top = heights[Math.floor(x) + Math.floor(z) * WX] ?? 0;
        if (!entrance || step > 8) if (y > top - 4) pitch = -Math.abs(pitch) * 0.5 - 0.05;
        if (x < 3 || z < 3 || x > WX - 3 || z > WZ - 3) break;
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
      if (b !== AIR && b !== WATER && World.inside(x, y, z)) return { x, y, z, nx, ny, nz, t };
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
