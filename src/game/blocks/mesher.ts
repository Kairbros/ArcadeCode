// Malla de un chunk: solo las caras que se ven (las que dan a un bloque que no tapa), con oclusión
// ambiental por vértice (las esquinas metidas entre bloques salen más oscuras) y luz fija por cara.
// El agua va en una malla aparte (transparente). Código puro: devuelve arrays, no toca WebGL.
//
// El chunk se copia antes a un búfer con una capa de un bloque alrededor: dentro del doble bucle todo son
// lecturas de array (la oclusión mira 4 casillas por esquina), en vez de ~300.000 `world.get` por chunk.
import { ATLAS_COLS, ATLAS_ROWS } from "./atlas";
import { AIR, BEDROCK, BLOCKS, LEAVES, WATER } from "./blocks";
import { CHUNK, WY } from "./config";
import type { World } from "./world";

export interface MeshData {
  positions: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

const EPS = 0.002; // margen dentro de cada casilla para que no se cuele la vecina

// Búfer con margen: x y z van de -1 a CHUNK; y, de -1 a WY.
const SX = CHUNK + 2;
const SZ = CHUNK + 2;
const SY = WY + 2;
const SLAB = SX * SZ; // lo que avanza una capa en y
const idx = (x: number, y: number, z: number) => (y + 1) * SLAB + (z + 1) * SX + (x + 1);
/** Opacidad por tipo de bloque (evita mirar el objeto en cada esquina). */
const OPAQUE = BLOCKS.map((b) => (b.opaque ? 1 : 0));

interface Face {
  n: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  base: [number, number, number];
  shade: number;
  /** 0 = arriba, 1 = lado, 2 = abajo (qué casilla de `tiles` usa). */
  tile: 0 | 1 | 2;
}

// Para cada cara, u × v = normal: las esquinas base, +u, +u+v, +v quedan en sentido antihorario vistas
// desde fuera. En los lados v es "arriba" para que la textura no salga girada.
const FACES: Face[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], base: [1, 0, 1], shade: 0.8, tile: 1 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], base: [0, 0, 0], shade: 0.8, tile: 1 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], base: [0, 0, 1], shade: 0.65, tile: 1 },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], base: [1, 0, 0], shade: 0.65, tile: 1 },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], base: [0, 1, 1], shade: 1, tile: 0 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], base: [0, 0, 0], shade: 0.5, tile: 2 },
];
const CORNERS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_LEVEL = [0.45, 0.65, 0.82, 1];

function empty(): MeshData {
  return { positions: [], uvs: [], colors: [], indices: [] };
}

/** ¿Se dibuja la cara de `b` que da a `nb`? */
function faceVisible(b: number, nb: number): boolean {
  if (nb === AIR) return true;
  if (b === WATER) return nb !== WATER && !BLOCKS[nb].opaque;
  if (BLOCKS[nb].opaque) return false;
  // Cristal junto a cristal: sin la cara de en medio. Las hojas sí se ven a través de otras hojas.
  return nb !== b || b === LEAVES;
}

/** Búfer reutilizado entre llamadas (una sola hebra: no hace falta uno por chunk). */
const pad = new Uint8Array(SLAB * SY);

/** Copia el chunk con una capa de margen (aire fuera de los lados, roca madre por debajo). */
function fillPadded(w: World, x0: number, z0: number) {
  for (let y = 0; y < WY; y++) {
    for (let z = -1; z <= CHUNK; z++) {
      for (let x = -1; x <= CHUNK; x++) pad[idx(x, y, z)] = w.get(x0 + x, y, z0 + z);
    }
  }
  for (let z = -1; z <= CHUNK; z++) {
    for (let x = -1; x <= CHUNK; x++) {
      pad[idx(x, -1, z)] = BEDROCK;
      pad[idx(x, WY, z)] = AIR;
    }
  }
}

export function meshChunk(w: World, cx: number, cz: number): { solid: MeshData; water: MeshData } {
  const solid = empty(), water = empty();
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  fillPadded(w, x0, z0);
  for (let y = 0; y < WY; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const b = pad[idx(x, y, z)];
        if (b === AIR) continue;
        const info = BLOCKS[b];
        const out = b === WATER ? water : solid;
        for (const f of FACES) {
          const fx = x + f.n[0], fy = y + f.n[1], fz = z + f.n[2];
          if (fy < 0) continue; // la cara de abajo del todo no se ve nunca
          const fi = idx(fx, fy, fz);
          const nb = pad[fi];
          if (!faceVisible(b, nb)) continue;
          const tile = info.tiles[f.tile];
          const tu = tile % ATLAS_COLS, tv = Math.floor(tile / ATLAS_COLS);
          const start = out.positions.length / 3;
          const ao: number[] = [];
          // Desplazamientos de las esquinas en el búfer (u y v son ejes, no diagonales).
          const du = f.u[2] * SX + f.u[0];
          const dv = f.v[1] * SLAB + f.v[2] * SX + f.v[0];
          // La superficie del agua queda un poco más baja que un bloque entero.
          const top = b === WATER && f.n[1] === 1 && pad[idx(x, y + 1, z)] !== WATER ? 0.88 : 1;
          for (const [cu, cv] of CORNERS) {
            const px = x0 + x + f.base[0] + f.u[0] * cu + f.v[0] * cv;
            let py = y + f.base[1] + f.u[1] * cu + f.v[1] * cv;
            const pz = z0 + z + f.base[2] + f.u[2] * cu + f.v[2] * cv;
            if (top < 1 && py > y) py = y + top;
            out.positions.push(px, py, pz);
            // Coordenadas de textura: v crece hacia arriba (la textura del lienzo se voltea al subirla).
            out.uvs.push(
              (tu + EPS + cu * (1 - 2 * EPS)) / ATLAS_COLS,
              1 - (tv + EPS + (1 - cv) * (1 - 2 * EPS)) / ATLAS_ROWS,
            );
            // Oclusión: bloques a los dos lados de la esquina y en diagonal, delante de la cara.
            const su = cu ? 1 : -1, sv = cv ? 1 : -1;
            const s1 = OPAQUE[pad[fi + du * su]];
            const s2 = OPAQUE[pad[fi + dv * sv]];
            const c = OPAQUE[pad[fi + du * su + dv * sv]];
            const level = b === WATER ? 3 : s1 && s2 ? 0 : 3 - s1 - s2 - c;
            ao.push(level);
            const k = f.shade * AO_LEVEL[level];
            out.colors.push(k, k, k);
          }
          // Se parte el cuadrado por la diagonal que pasa por las esquinas más oscuras: así la sombra se
          // reparte entre los dos triángulos en vez de quedar un triángulo suelto más claro.
          if (ao[0] + ao[2] > ao[1] + ao[3]) out.indices.push(start, start + 1, start + 3, start + 1, start + 2, start + 3);
          else out.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
      }
    }
  }
  return { solid, water };
}
