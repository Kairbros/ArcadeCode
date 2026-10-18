// Relieve del circuito: alturas en una rejilla que cubre la textura y un margen alrededor. Se calcula
// desde la semilla del circuito, así anfitrión e invitados ven lo mismo. Es solo visual (la física de
// los karts sigue siendo plana).
//
// - La pista sube y baja con ondulaciones suaves, pero es plana de lado a lado (sin peraltes raros):
//   cerca de la pista la altura es la del punto más cercano de la línea central.
// - Lejos de la pista el terreno sigue las ondulaciones y se levanta en colinas.
import { Rng } from "../core/rng";
import { CURB_W, TERRAIN_MARGIN, TERRAIN_SEG, TEX, TRACK_W } from "./config";
import type { Track } from "./track";

export interface Terrain {
  x0: number; // esquina de la rejilla (unidades de mundo; igual en x e y)
  step: number; // lado de cada casilla
  seg: number; // casillas por lado
  h: Float32Array; // (seg+1)² alturas, fila a fila (y), columna a columna (x)
  min: number;
  max: number;
}

const cache = new WeakMap<Track, Terrain>();

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function terrainOf(track: Track): Terrain {
  const cached = cache.get(track);
  if (cached) return cached;
  const rng = new Rng(track.seed ^ 0x7e11a1);
  // Ondulaciones: tres ondas largas en direcciones al azar (pendientes de hasta ~20°).
  const waves = ([[950, 20], [620, 13], [400, 7]] as const).map(([len, amp]) => {
    const dir = rng.next() * Math.PI * 2;
    return { kx: (Math.cos(dir) * Math.PI * 2) / len, ky: (Math.sin(dir) * Math.PI * 2) / len, amp, ph: rng.next() * Math.PI * 2 };
  });
  const base = (x: number, y: number) => waves.reduce((s, w) => s + w.amp * Math.sin(x * w.kx + y * w.ky + w.ph), 0);
  // Colinas repartidas por el mapa (solo cuentan lejos de la pista).
  const span = TEX + TERRAIN_MARGIN * 2;
  const bumps = Array.from({ length: 46 }, () => ({
    x: rng.uniform(-TERRAIN_MARGIN, TEX + TERRAIN_MARGIN), y: rng.uniform(-TERRAIN_MARGIN, TEX + TERRAIN_MARGIN),
    r: rng.uniform(120, 340), h: rng.uniform(35, 140),
  }));
  const hills = (x: number, y: number) =>
    bumps.reduce((s, b) => s + b.h * Math.max(0, 1 - ((x - b.x) ** 2 + (y - b.y) ** 2) / (b.r * b.r)) ** 2, 0);

  // Altura de la pista en cada punto de la línea central, suavizada a lo largo de la vuelta.
  const { n, px, py } = track;
  const raw = Float32Array.from({ length: n }, (_, i) => base(px[i], py[i]));
  const along = Float32Array.from({ length: n }, (_, i) => {
    let s = 0;
    for (let k = -14; k <= 14; k++) s += raw[(i + k + n) % n];
    return s / 29;
  });

  const seg = TERRAIN_SEG;
  const step = span / seg;
  const x0 = -TERRAIN_MARGIN;
  const h = new Float32Array((seg + 1) * (seg + 1));
  const near = TRACK_W / 2 + CURB_W + 14; // hasta aquí, plano de lado a lado
  const far = 230; // desde aquí, terreno libre
  let min = Infinity, max = -Infinity;
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const x = x0 + i * step, y = x0 + j * step;
      let best = Infinity, bk = 0;
      for (let k = 0; k < n; k += 2) {
        const d2 = (px[k] - x) ** 2 + (py[k] - y) ** 2;
        if (d2 < best) {
          best = d2;
          bk = k;
        }
      }
      const d = Math.sqrt(best);
      const w = smooth(near, far, d);
      const v = along[bk] * (1 - w) + (base(x, y) + hills(x, y) * smooth(near, near + 260, d)) * w;
      h[j * (seg + 1) + i] = v;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  const t: Terrain = { x0, step, seg, h, min, max };
  cache.set(track, t);
  return t;
}

/**
 * Altura del terreno en (x, y). Interpola dentro del mismo triángulo que dibuja la malla (la diagonal
 * de cada casilla va de (i+1, j) a (i, j+1)), así los karts apoyan justo sobre el suelo que se ve.
 */
export function heightAt(t: Terrain, x: number, y: number): number {
  const fx = Math.max(0, Math.min(t.seg - 1e-6, (x - t.x0) / t.step));
  const fy = Math.max(0, Math.min(t.seg - 1e-6, (y - t.x0) / t.step));
  const i = Math.floor(fx), j = Math.floor(fy);
  const u = fx - i, v = fy - j;
  const row = t.seg + 1;
  const h00 = t.h[j * row + i], h10 = t.h[j * row + i + 1], h01 = t.h[(j + 1) * row + i], h11 = t.h[(j + 1) * row + i + 1];
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}
