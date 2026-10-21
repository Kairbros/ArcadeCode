// Malla de un chunk: solo las caras que se ven (las que dan a un bloque que no tapa), con oclusión
// ambiental por vértice (las esquinas metidas entre bloques salen más oscuras), sombra fija por cara y la luz
// del mundo (suavizada por vértice) horneadas en dos colores: `colors` con la del cielo (el shader la multiplica
// por la luz del día) y `blocks` con la de las antorchas (cálida); se ve la mayor. Las antorchas son un palito.
// El agua va en una malla aparte (transparente). Código puro: devuelve arrays, no toca WebGL.
import { AIR, ATLAS_COLS, ATLAS_ROWS, BLOCKS, LEAVES, T_TORCH, WATER } from "./blocks";
import { CHUNK, WY } from "./config";
import { TORCH_WALLS, type World } from "./world";

export interface MeshData {
  positions: number[];
  uvs: number[];
  colors: number[];
  /** Luz de las antorchas por vértice (rgb). */
  blocks: number[];
  indices: number[];
}

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
/** Color de la luz de las antorchas (la del cielo es blanca). */
const WARM = [1, 0.84, 0.62];

/** Brillo de un nivel de luz 0–15 (curva parecida a la de Minecraft: a oscuras casi negro). */
export function brightness(level: number): number {
  const f = Math.max(0, Math.min(15, level)) / 15;
  return 0.03 + 0.97 * (f / (3 - 2 * f));
}

/** Brillo de una casilla para objetos sueltos (animales, muñecos): el mayor de cielo (por `sky`, la luz del día) y antorchas. */
export function brightnessAt(w: World, x: number, y: number, z: number, sky = 1): number {
  const l = w.lightAt(Math.floor(x), Math.floor(y), Math.floor(z));
  return Math.max(brightness(l >> 4) * sky, brightness(l & 15));
}

function empty(): MeshData {
  return { positions: [], uvs: [], colors: [], blocks: [], indices: [] };
}

/** ¿Se dibuja la cara de `b` que da a `nb`? */
function faceVisible(b: number, nb: number): boolean {
  if (nb === AIR) return true;
  if (b === WATER) return nb !== WATER && !BLOCKS[nb].opaque;
  if (BLOCKS[nb].opaque) return false;
  // Cristal junto a cristal: sin la cara de en medio. Las hojas sí se ven a través de otras hojas.
  return nb !== b || b === LEAVES;
}

/** Coordenadas de textura del píxel (px, py) de una casilla (v crece hacia arriba: el lienzo se voltea al subirlo). */
function tileUV(tile: number, px: number, py: number): [number, number] {
  const tu = tile % ATLAS_COLS, tv = Math.floor(tile / ATLAS_COLS);
  return [(tu * 16 + px) / (16 * ATLAS_COLS), 1 - (tv * 16 + py) / (16 * ATLAS_ROWS)];
}

// Caja de la antorcha: esquinas por bits (1 = +x, 2 = +y, 4 = +z) y caras en el mismo orden que FACES.
const BOX_FACES = [[5, 1, 3, 7], [0, 4, 6, 2], [4, 5, 7, 6], [1, 0, 2, 3], [6, 7, 3, 2], [0, 1, 5, 4]];

/** Palito de 2/16 × 10/16 con la llama arriba; en una pared se inclina con el pie pegado a ella. */
function torch(out: MeshData, w: World, x: number, y: number, z: number) {
  const k = w.torchSupport(x, y, z);
  const [wx, wz] = k > 0 ? TORCH_WALLS[k - 1] : [0, 0];
  const h = 1 / 16, len = 10 / 16, y0 = y + (k > 0 ? 0.2 : 0);
  const corner = (i: number): [number, number, number] => {
    const up = (i & 2) >> 1;
    // Pie junto a la pared y cabeza hacia dentro (en el suelo, recto).
    const lean = k > 0 ? (up ? 0.15 : 0.4) : 0;
    return [x + 0.5 + wx * lean + (i & 1 ? h : -h), y0 + up * len, z + 0.5 + wz * lean + (i & 4 ? h : -h)];
  };
  BOX_FACES.forEach((f, n) => {
    const start = out.positions.length / 3;
    const top = n === 4, bottom = n === 5;
    f.forEach((c, j) => {
      out.positions.push(...corner(c));
      const [cu, cv] = CORNERS[j];
      const px = 7 + cu * 2;
      const py = top ? 6 + cv * 2 : bottom ? 14 + cv * 2 : 16 - cv * 10;
      out.uvs.push(...tileUV(T_TORCH, px, py));
      out.colors.push(1, 1, 1); // da luz: siempre brillante
      out.blocks.push(1, 1, 1);
    });
    out.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  });
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
        if (info.shape === "torch") {
          torch(solid, w, x, y, z);
          continue;
        }
        const out = b === WATER ? water : solid;
        for (const f of FACES) {
          const fx = x + f.n[0], fy = y + f.n[1], fz = z + f.n[2];
          if (fy < 0) continue; // la cara de abajo del todo no se ve nunca
          const nb = w.get(fx, fy, fz);
          if (!faceVisible(b, nb)) continue;
          const tile = info.tiles[f.tile];
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
            out.uvs.push(...tileUV(tile, (EPS + cu * (1 - 2 * EPS)) * 16, (EPS + (1 - cv) * (1 - 2 * EPS)) * 16));
            // Oclusión: bloques a los dos lados de la esquina y en diagonal, delante de la cara.
            const du = cu ? 1 : -1, dv = cv ? 1 : -1;
            const a1: [number, number, number] = [fx + f.u[0] * du, fy + f.u[1] * du, fz + f.u[2] * du];
            const a2: [number, number, number] = [fx + f.v[0] * dv, fy + f.v[1] * dv, fz + f.v[2] * dv];
            const ac: [number, number, number] = [a1[0] + f.v[0] * dv, a1[1] + f.v[1] * dv, a1[2] + f.v[2] * dv];
            const s1 = opaque(...a1), s2 = opaque(...a2), c = opaque(...ac);
            const level = b === WATER ? 3 : s1 && s2 ? 0 : 3 - Number(s1) - Number(s2) - Number(c);
            ao.push(level);
            // Luz suave: media de las casillas de delante que no tapan (la diagonal solo si se ve).
            let sky = 0, blk = 0, n = 0;
            const add = (p: [number, number, number]) => {
              const l = w.lightAt(...p);
              sky += l >> 4;
              blk += l & 15;
              n++;
            };
            add([fx, fy, fz]);
            if (!s1) add(a1);
            if (!s2) add(a2);
            if (!c && !(s1 && s2)) add(ac);
            const bs = brightness(sky / n), bb = brightness(blk / n);
            const k = f.shade * AO_LEVEL[level];
            out.colors.push(bs * k, bs * k, bs * k);
            out.blocks.push(bb * WARM[0] * k, bb * WARM[1] * k, bb * WARM[2] * k);
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
