// Malla de un chunk: solo las caras que se ven (las que dan a un bloque que no tapa), con oclusión
// ambiental por vértice (las esquinas metidas entre bloques salen más oscuras) y luz fija por cara.
// El agua va en una malla aparte (transparente). Código puro: devuelve arrays, no toca WebGL.
import { AIR, BLOCKS, LEAVES, WATER } from "./blocks";
import { CHUNK, WY } from "./config";
import type { World } from "./world";

export interface MeshData {
  positions: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

const ATLAS_N = 4; // casillas por lado del atlas
const EPS = 0.002; // margen dentro de cada casilla para que no se cuele la vecina

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

export function meshChunk(w: World, cx: number, cz: number): { solid: MeshData; water: MeshData } {
  const solid = empty(), water = empty();
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const opaque = (x: number, y: number, z: number) => BLOCKS[w.get(x, y, z)].opaque;
  for (let y = 0; y < WY; y++) {
    for (let z = z0; z < z0 + CHUNK; z++) {
      for (let x = x0; x < x0 + CHUNK; x++) {
        const b = w.get(x, y, z);
        if (b === AIR) continue;
        const info = BLOCKS[b];
        const out = b === WATER ? water : solid;
        for (const f of FACES) {
          const fx = x + f.n[0], fy = y + f.n[1], fz = z + f.n[2];
          if (fy < 0) continue; // la cara de abajo del todo no se ve nunca
          const nb = w.get(fx, fy, fz);
          if (!faceVisible(b, nb)) continue;
          const tile = info.tiles[f.tile];
          const tu = tile % ATLAS_N, tv = Math.floor(tile / ATLAS_N);
          const start = out.positions.length / 3;
          const ao: number[] = [];
          // La superficie del agua queda un poco más baja que un bloque entero.
          const top = b === WATER && f.n[1] === 1 && w.get(x, y + 1, z) !== WATER ? 0.88 : 1;
          for (const [cu, cv] of CORNERS) {
            const px = x + f.base[0] + f.u[0] * cu + f.v[0] * cv;
            let py = y + f.base[1] + f.u[1] * cu + f.v[1] * cv;
            const pz = z + f.base[2] + f.u[2] * cu + f.v[2] * cv;
            if (top < 1 && py > y) py = y + top;
            out.positions.push(px, py, pz);
            // Coordenadas de textura: v crece hacia arriba (la textura del lienzo se voltea al subirla).
            out.uvs.push(
              (tu + EPS + cu * (1 - 2 * EPS)) / ATLAS_N,
              1 - (tv + EPS + (1 - cv) * (1 - 2 * EPS)) / ATLAS_N,
            );
            // Oclusión: bloques a los dos lados de la esquina y en diagonal, delante de la cara.
            const du = cu ? 1 : -1, dv = cv ? 1 : -1;
            const s1 = opaque(fx + f.u[0] * du, fy + f.u[1] * du, fz + f.u[2] * du);
            const s2 = opaque(fx + f.v[0] * dv, fy + f.v[1] * dv, fz + f.v[2] * dv);
            const c = opaque(fx + f.u[0] * du + f.v[0] * dv, fy + f.u[1] * du + f.v[1] * dv, fz + f.u[2] * du + f.v[2] * dv);
            const level = b === WATER ? 3 : s1 && s2 ? 0 : 3 - Number(s1) - Number(s2) - Number(c);
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
