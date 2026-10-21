// Circuitos procedurales generados desde una semilla.
//
// Trazado: puntos al azar → envolvente convexa → hendiduras hacia dentro/fuera (horquillas, eses,
// chicanes) → suavizado de Chaikin → validación (curvas tomables y tramos que no se tocan ni
// permiten atajar). Si un intento no vale se genera otro con la misma secuencia de azar,
// así la misma semilla da siempre el mismo circuito.
//
// La línea central (puntos equiespaciados) sirve para colisiones, vueltas e IA;
// el dibujo del suelo (pintado con Canvas) se pone sobre el relieve 3D (terrain.ts).
import type { RGB } from "../core/config";
import { css } from "../core/draw";
import { Rng } from "../core/rng";
import { CURB_W, POINT_STEP, RACERS, RAMP_LEN, TEX, TRACK_W, TUNNEL_R, WALL_MARGIN } from "./config";

export type DecoKind = "tree" | "bush" | "cactus" | "rock" | "pine" | "crystal" | "asteroid" | "lavarock" | "torch";
/** Los decorados flotantes o de adorno no chocan con el kart. */
export const SOLID_DECOS: readonly DecoKind[] = ["tree", "bush", "cactus", "rock", "pine", "lavarock", "torch"];

export type HazardKind = "chomp" | "thwomp" | "meteor";

export interface Theme {
  name: string;
  /** Espacio: la pista flota en el vacío (fuera del asfalto se cae). */
  void: boolean;
  /** Volcán: lagos de lava en los valles. */
  lava: boolean;
  /** Multiplica el desnivel de la pista (el espacio, una montaña rusa). */
  relief: number;
  hazard: HazardKind;
  grass: RGB;
  grass2: RGB;
  sand: RGB;
  road: RGB;
  skyTop: RGB;
  skyBottom: RGB;
  hills: RGB;
  hillsFar: RGB;
  decos: DecoKind[];
}

const THEMES: Theme[] = [
  {
    name: "Pradera", void: false, lava: false, relief: 1, hazard: "chomp",
    grass: [84, 192, 70], grass2: [66, 168, 62], sand: [236, 214, 150], road: [92, 96, 116],
    skyTop: [56, 132, 245], skyBottom: [176, 224, 255], hills: [58, 156, 74], hillsFar: [130, 180, 215],
    decos: ["tree", "tree", "bush"],
  },
  {
    name: "Desierto", void: false, lava: false, relief: 1, hazard: "chomp",
    grass: [240, 196, 108], grass2: [222, 174, 92], sand: [252, 226, 164], road: [128, 100, 98],
    skyTop: [255, 128, 64], skyBottom: [255, 214, 150], hills: [214, 120, 70], hillsFar: [236, 170, 120],
    decos: ["cactus", "cactus", "rock"],
  },
  {
    name: "Nieve", void: false, lava: false, relief: 1, hazard: "chomp",
    grass: [236, 244, 255], grass2: [212, 226, 246], sand: [186, 206, 232], road: [84, 96, 128],
    skyTop: [48, 70, 150], skyBottom: [168, 196, 240], hills: [150, 176, 214], hillsFar: [100, 124, 176],
    decos: ["pine", "pine", "rock"],
  },
  {
    name: "Espacio", void: true, lava: false, relief: 1.8, hazard: "meteor",
    grass: [10, 8, 30], grass2: [18, 12, 48], sand: [120, 90, 255], road: [26, 24, 64],
    skyTop: [4, 2, 16], skyBottom: [34, 14, 80], hills: [40, 30, 90], hillsFar: [60, 40, 120],
    decos: ["crystal", "asteroid", "crystal"],
  },
  {
    name: "Volcán", void: false, lava: true, relief: 1.3, hazard: "thwomp",
    grass: [74, 52, 56], grass2: [54, 38, 44], sand: [150, 84, 52], road: [64, 58, 74],
    skyTop: [48, 8, 16], skyBottom: [236, 100, 40], hills: [96, 44, 40], hillsFar: [170, 66, 40],
    decos: ["lavarock", "lavarock", "torch"],
  },
];

/** Peligro del circuito (chomp, thwomp o meteoro): su posición sale solo del tiempo de carrera. */
export interface Hazard {
  kind: HazardKind;
  /** Punto de la línea central donde está y desfase de su movimiento (s). */
  i: number;
  phase: number;
}

/** Rampa de salto: `i` es el punto de la línea central donde empieza. */
export interface Ramp {
  i: number;
}

/** Placa de turbo (flechas en el asfalto): punto de la línea central y desvío lateral. */
export interface Pad {
  i: number;
  off: number;
  x: number;
  y: number;
}

/** Tramo en túnel (cueva): puntos de la línea central desde `from` hasta `to` (sin dar la vuelta). */
export interface Tunnel {
  from: number;
  to: number;
}

export interface Coin {
  x: number;
  y: number;
}

export interface StartSlot {
  x: number;
  y: number;
  a: number;
  seg: number;
  progress: number;
}

export interface Deco {
  x: number;
  y: number;
  kind: DecoKind;
  size: number; // escala (1 = normal)
}

export interface Track {
  seed: number;
  n: number;
  px: Float32Array; // línea central
  py: Float32Array;
  dir: Float32Array; // ángulo de la pista en cada punto
  theme: Theme;
  boxes: { x: number; y: number }[];
  ramps: Ramp[];
  hazards: Hazard[];
  pads: Pad[];
  tunnels: Tunnel[];
  coins: Coin[];
  grid: StartSlot[];
  decos: Deco[];
  canvas: HTMLCanvasElement | null; // dibujo del suelo: se pinta bajo demanda (necesita DOM)
  attempts: number; // intentos que necesitó el generador (0 = óvalo de emergencia)
}

type P = [number, number];

// --- Reglas del trazado ---
const EDGE = 230; // margen de los puntos de control respecto al borde de la textura
const MIN_CTRL_GAP = 125; // separación mínima entre puntos de control
const MIN_RADIUS = 42; // curva más cerrada permitida (unidades)
/** Distancia mínima entre tramos no consecutivos: ni se pisan ni se puede atajar por el césped. */
const MIN_GAP = TRACK_W + WALL_MARGIN + 16;
const MIN_LENGTH = 2400;
const MAX_LENGTH = 5600;
const ATTEMPTS = 120;

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Envolvente convexa (cadena monótona), en orden antihorario. */
function convexHull(points: P[]): P[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Puntos de control del trazado: envolvente con hendiduras para crear curvas con carácter. */
function layout(rng: Rng): P[] {
  const count = 8 + Math.floor(rng.next() * 8);
  const raw: P[] = Array.from({ length: count }, () => [rng.uniform(EDGE, TEX - EDGE), rng.uniform(EDGE, TEX - EDGE)]);
  const hull = convexHull(raw);
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;

  let pts: P[] = [];
  hull.forEach((a, i) => {
    const b = hull[(i + 1) % hull.length];
    pts.push(a);
    const len = dist(a, b);
    if (len < 240) return;
    // Normal del tramo apuntando hacia el centro.
    let nx = -(b[1] - a[1]) / len;
    let ny = (b[0] - a[0]) / len;
    if (nx * (cx - (a[0] + b[0]) / 2) + ny * (cy - (a[1] + b[1]) / 2) < 0) [nx, ny] = [-nx, -ny];
    const at = (t: number, push: number): P => [a[0] + (b[0] - a[0]) * t + nx * push, a[1] + (b[1] - a[1]) * t + ny * push];
    const r = rng.next();
    if (len > 450 && r < 0.4) {
      // Lengua: dos puntos muy hacia dentro → dos rectas paralelas unidas por una horquilla.
      const depth = rng.uniform(0.45, 0.9) * len;
      pts.push(at(0.33, depth * rng.uniform(0.85, 1)), at(0.67, depth * rng.uniform(0.85, 1)));
    } else if (len > 480 && r < 0.65) {
      // Ese: dos empujes en sentidos opuestos.
      const amp = rng.uniform(0.18, 0.4) * len;
      const sign = rng.next() < 0.7 ? 1 : -1;
      pts.push(at(1 / 3, amp * sign), at(2 / 3, -amp * sign * 0.7));
    } else if (r < 0.92) {
      // Hendidura (sobre todo hacia dentro: curvas en U y zonas técnicas).
      pts.push(at(rng.uniform(0.35, 0.65), rng.uniform(-0.25, 0.7) * len));
    }
  });

  // Separa puntos demasiado juntos y los mantiene dentro de la textura.
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = dist(pts[i], pts[j]);
        if (d >= MIN_CTRL_GAP || d === 0) continue;
        const push = (MIN_CTRL_GAP - d) / 2 / d;
        const dx = (pts[j][0] - pts[i][0]) * push;
        const dy = (pts[j][1] - pts[i][1]) * push;
        pts[i] = [pts[i][0] - dx, pts[i][1] - dy];
        pts[j] = [pts[j][0] + dx, pts[j][1] + dy];
      }
    }
    pts = pts.map(([x, y]) => [Math.max(EDGE, Math.min(TEX - EDGE, x)), Math.max(EDGE, Math.min(TEX - EDGE, y))]);
  }
  return pts;
}

/**
 * Trazado "de cuadrícula" (estilo SNES): se hace crecer una forma de casillas sin huecos y se usa
 * su contorno. Da rectas largas, curvas de 90°, horquillas en U y zigzags.
 */
function gridLayout(rng: Rng): P[] {
  const G = 7; // casillas por lado
  const C = 170; // tamaño de casilla (unidades)
  const origin = (TEX - G * C) / 2;
  const inside = new Set<number>();
  const key = (x: number, y: number) => y * G + x;
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < G && y < G && inside.has(key(x, y));

  // ¿Queda algún hueco cerrado (zona vacía sin salida al exterior)?
  const hasHole = () => {
    const W = G + 2;
    const seen = new Uint8Array(W * W);
    const stack = [0];
    seen[0] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const x = (c % W) - 1;
      const y = Math.floor(c / W) - 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < -1 || ny < -1 || nx > G || ny > G || has(nx, ny)) continue;
        const k = (ny + 1) * W + nx + 1;
        if (!seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (!has(x, y) && !seen[(y + 1) * W + x + 1]) return true;
    return false;
  };
  // Dos casillas que solo se tocan por una esquina harían que la pista se cruce consigo misma.
  const hasPinch = () => {
    for (let y = -1; y < G; y++) {
      for (let x = -1; x < G; x++) {
        const a = has(x, y), b = has(x + 1, y), c = has(x, y + 1), d = has(x + 1, y + 1);
        if ((a && d && !b && !c) || (b && c && !a && !d)) return true;
      }
    }
    return false;
  };

  const target = 8 + Math.floor(rng.next() * 12);
  inside.add(key(2 + Math.floor(rng.next() * 3), 2 + Math.floor(rng.next() * 3)));
  for (let tries = 0; tries < 600 && inside.size < target; tries++) {
    const cells = [...inside];
    const c = cells[Math.floor(rng.next() * cells.length)];
    const [dx, dy] = rng.choice([[1, 0], [-1, 0], [0, 1], [0, -1]] as const);
    const x = (c % G) + dx;
    const y = Math.floor(c / G) + dy;
    if (x < 0 || y < 0 || x >= G || y >= G || has(x, y)) continue;
    inside.add(key(x, y));
    if (hasHole() || hasPinch()) inside.delete(key(x, y));
  }

  // Contorno: aristas de casilla sin vecina, encadenadas (cada vértice tiene una sola salida).
  const next = new Map<string, P>();
  const vk = (x: number, y: number) => `${x},${y}`;
  for (const c of inside) {
    const x = c % G;
    const y = Math.floor(c / G);
    if (!has(x, y - 1)) next.set(vk(x + 1, y), [x, y]);
    if (!has(x - 1, y)) next.set(vk(x, y), [x, y + 1]);
    if (!has(x, y + 1)) next.set(vk(x, y + 1), [x + 1, y + 1]);
    if (!has(x + 1, y)) next.set(vk(x + 1, y + 1), [x + 1, y]);
  }
  const startKey = next.keys().next().value!;
  const loop: P[] = [];
  let cur = startKey.split(",").map(Number) as P;
  do {
    loop.push(cur);
    cur = next.get(vk(cur[0], cur[1]))!;
  } while (vk(cur[0], cur[1]) !== startKey && loop.length < 400);

  // Quita vértices intermedios de tramos rectos y pasa a coordenadas de mundo con un poco de desorden.
  const corners = loop.filter((p, i) => {
    const a = loop[(i + loop.length - 1) % loop.length];
    const b = loop[(i + 1) % loop.length];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
  return corners.map(([x, y]) => [origin + x * C + rng.uniform(-22, 22), origin + y * C + rng.uniform(-22, 22)]);
}

/** Suavizado de Chaikin (cerrado): redondea esquinas sin crear bucles. */
function chaikin(pts: P[], iterations: number): P[] {
  let out = pts;
  for (let it = 0; it < iterations; it++) {
    const next: P[] = [];
    out.forEach((a, i) => {
      const b = out[(i + 1) % out.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    });
    out = next;
  }
  return out;
}

/** Re-muestreo a distancia constante: el "progreso" en puntos equivale a distancia recorrida. */
function resample(pts: P[]): { px: Float32Array; py: Float32Array; n: number } {
  const m = pts.length;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) cum[i + 1] = cum[i] + dist(pts[i], pts[(i + 1) % m]);
  const total = cum[m];
  const n = Math.floor(total / POINT_STEP);
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const target = (i * total) / n;
    while (cum[seg + 1] < target) seg++;
    const t = (target - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    const a = pts[seg];
    const b = pts[(seg + 1) % m];
    px[i] = a[0] + (b[0] - a[0]) * t;
    py[i] = a[1] + (b[1] - a[1]) * t;
  }
  return { px, py, n };
}

function directions(px: Float32Array, py: Float32Array, n: number): Float32Array {
  const dir = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    dir[i] = Math.atan2(py[j] - py[i], px[j] - px[i]);
  }
  return dir;
}

/** ¿Es un buen circuito? Longitud razonable, curvas tomables, tramos separados. */
function isValid(px: Float32Array, py: Float32Array, n: number, dir: Float32Array): boolean {
  const length = n * POINT_STEP;
  if (length < MIN_LENGTH || length > MAX_LENGTH) return false;
  // Curvatura: giro acumulado en una ventana de ±6 puntos (72 unidades de arco).
  const w = 6;
  for (let i = 0; i < n; i++) {
    const turn = Math.abs(wrap(dir[(i + w) % n] - dir[(i - w + n) % n]));
    if (turn > 0 && (2 * w * POINT_STEP) / turn < MIN_RADIUS) return false;
  }
  // Separación entre tramos que no son vecinos a lo largo de la pista.
  const minArc = Math.ceil((MIN_GAP * 2.2) / POINT_STEP);
  const gap2 = MIN_GAP * MIN_GAP;
  for (let i = 0; i < n; i += 2) {
    for (let j = i + minArc; j < n; j += 2) {
      if (n - (j - i) < minArc) break;
      const dx = px[i] - px[j];
      const dy = py[i] - py[j];
      if (dx * dx + dy * dy < gap2) return false;
    }
  }
  return true;
}

/** Óvalo de emergencia si ningún intento sale válido (prácticamente no ocurre). */
function fallbackLayout(): P[] {
  return Array.from({ length: 16 }, (_, i): P => {
    const a = (i / 16) * Math.PI * 2;
    return [TEX / 2 + Math.cos(a) * TEX * 0.33, TEX / 2 + Math.sin(a) * TEX * 0.22];
  });
}

/** Índice desde el que hay la recta más larga (ahí va la meta y detrás la parrilla). */
function straightestStart(dir: Float32Array, n: number): number {
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    let score = 0;
    for (let k = -16; k < 10; k++) score += Math.abs(wrap(dir[(i + k + 1 + n) % n] - dir[(i + k + n) % n]));
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export const THEME_NAMES = THEMES.map((t) => t.name);

/** `themeIdx` fuerza el tema (el anfitrión lo elige con T); -1 = al azar según la semilla. */
export function generateTrack(seed: number, themeIdx = -1): Track {
  const rng = new Rng(seed ^ 0x51ed27);
  let shape: { px: Float32Array; py: Float32Array; n: number } | null = null;
  let dir: Float32Array = new Float32Array(0);
  let attempts = 0;
  // Estilo del circuito: de cuadrícula (rectas y curvas marcadas) u orgánico (curvas suaves).
  const gridStyle = rng.next() < 0.7;
  for (let attempt = 1; attempt <= ATTEMPTS && !shape; attempt++) {
    const s = resample(chaikin(gridStyle ? gridLayout(rng) : layout(rng), 4));
    const d = directions(s.px, s.py, s.n);
    if (isValid(s.px, s.py, s.n, d)) {
      shape = s;
      dir = d;
      attempts = attempt;
    }
  }
  if (!shape) {
    shape = resample(chaikin(fallbackLayout(), 5));
    dir = directions(shape.px, shape.py, shape.n);
  }

  // Rota la línea central para que el punto 0 (la meta) esté en la recta más larga.
  const n = shape.n;
  const start = straightestStart(dir, n);
  const rot = (arr: Float32Array) => Float32Array.from({ length: n }, (_, i) => arr[(i + start) % n]);
  const px = rot(shape.px);
  const py = rot(shape.py);
  dir = rot(dir);

  // Cajas de objetos: 3 filas de 3 cajas repartidas por la vuelta.
  const boxes: { x: number; y: number }[] = [];
  for (const f of [0.22, 0.52, 0.8]) {
    const i = Math.floor(f * n);
    const nx = -Math.sin(dir[i]);
    const ny = Math.cos(dir[i]);
    for (const off of [-20, 0, 20]) boxes.push({ x: px[i] + nx * off, y: py[i] + ny * off });
  }

  // Parrilla de salida: 2 columnas, detrás de la meta (progreso negativo).
  const grid: StartSlot[] = [];
  for (let s = 0; s < RACERS; s++) {
    const back = 4 + Math.floor(s / 2) * 4 + (s % 2) * 2;
    const i = n - back;
    const lateral = s % 2 ? 13 : -13;
    grid.push({
      x: px[i] - Math.sin(dir[i]) * lateral,
      y: py[i] + Math.cos(dir[i]) * lateral,
      a: dir[i],
      seg: i,
      progress: -back,
    });
  }

  const picked = rng.choice(THEMES);
  const theme = themeIdx >= 0 ? THEMES[themeIdx % THEMES.length] : picked;
  const line = { n, px, py, dir };
  const { ramps, pads, tunnels, coins, hazards } = placeFeatures(new Rng(seed ^ 0xfea7), line, theme);
  const decos = placeDecos(rng, line, theme, tunnels);
  return { seed, n, px, py, dir, theme, boxes, ramps, hazards, pads, tunnels, coins, grid, decos, canvas: null, attempts };
}

/** Decoración junto a la pista (árboles, cactus...): fuera del asfalto y sin amontonarse. */
function placeDecos(rng: Rng, line: Centerline, theme: Theme, tunnels: Tunnel[]): Deco[] {
  const decos: Deco[] = [];
  const clear = TRACK_W / 2 + CURB_W + 12;
  for (let attempt = 0; attempt < 700 && decos.length < 110; attempt++) {
    const i = Math.floor(rng.next() * line.n);
    const side = rng.next() < 0.5 ? -1 : 1;
    const off = clear + rng.uniform(4, 90);
    const x = line.px[i] - Math.sin(line.dir[i]) * off * side;
    const y = line.py[i] + Math.cos(line.dir[i]) * off * side;
    if (x < 20 || y < 20 || x > TEX - 20 || y > TEX - 20) continue;
    const loc = locate(line, x, y);
    if (loc.d < clear) continue; // cerca de otro tramo de pista
    if (tunnels.some((t) => loc.i >= t.from - 6 && loc.i <= t.to + 6 && loc.d < TUNNEL_R + 28)) continue; // sobre el túnel
    if (decos.some((d) => (d.x - x) ** 2 + (d.y - y) ** 2 < 22 * 22)) continue;
    decos.push({ x, y, kind: rng.choice(theme.decos), size: rng.uniform(0.8, 1.3) });
  }
  return decos;
}

/** Giro acumulado de la pista entre los puntos i y i + len (rad, en valor absoluto del mayor giro de la ventana). */
function turnOver(line: Centerline, i: number, len: number): number {
  let worst = 0;
  const d0 = line.dir[i % line.n];
  for (let k = 0; k <= len; k += 2) worst = Math.max(worst, Math.abs(wrap(line.dir[(i + k) % line.n] - d0)));
  return worst;
}

/**
 * Rampas, placas de turbo, túnel y monedas. Salen de la semilla, así que el anfitrión y los invitados
 * los tienen iguales sin mandarlos por la red. Solo se ponen en tramos rectos (la rampa necesita
 * aterrizar en la pista) y lejos de la meta.
 */
function placeFeatures(
  rng: Rng, line: Centerline, theme: Theme,
): { ramps: Ramp[]; pads: Pad[]; tunnels: Tunnel[]; coins: Coin[]; hazards: Hazard[] } {
  const { n, px, py, dir } = line;
  const lo = Math.floor(n * 0.08), hi = Math.floor(n * 0.94);
  const free = (i: number, len: number, used: number[][]) => used.every(([a, b]) => i + len < a - 8 || i > b + 8);
  const used: number[][] = [];

  // Túnel: ~30 puntos (180 unidades), con curvas suaves permitidas.
  const tunnels: Tunnel[] = [];
  const TLEN = 30;
  for (let tries = 0; tries < 80 && !tunnels.length && !theme.void; tries++) {
    const i = Math.floor(rng.uniform(lo + 6, hi - TLEN - 30));
    if (turnOver(line, i, TLEN) < 0.7 && free(i, TLEN, used)) {
      tunnels.push({ from: i, to: i + TLEN });
      used.push([i, i + TLEN]);
    }
  }
  // Rampas: tramo recto de ~36 puntos para aterrizar en la pista.
  const ramps: Ramp[] = [];
  for (let tries = 0; tries < 160 && ramps.length < 2; tries++) {
    const i = Math.floor(rng.uniform(lo, hi - 40));
    // En el espacio aterrizar fuera de la cinta es caer: ahí la recta de después tiene que ser más limpia.
    const len = theme.void ? 48 : 40;
    if (turnOver(line, i, len) < (theme.void ? 0.3 : 0.6) && free(i, len, used)) {
      ramps.push({ i });
      used.push([i, i + len]);
    }
  }
  // Peligros (chomp, thwomp o meteoro según el tema): en tramos rectos, lejos de rampas y túnel.
  const hazards: Hazard[] = [];
  for (let tries = 0; tries < 300 && hazards.length < 3; tries++) {
    const i = Math.floor(rng.uniform(lo + 20, hi));
    if (turnOver(line, i, 8) > 0.3 || !free(i, 8, used) || hazards.some((h) => Math.abs(h.i - i) < 60)) continue;
    hazards.push({ kind: theme.hazard, i, phase: rng.uniform(0, 6) });
    used.push([i, i + 8]);
  }
  // Placas de turbo: tramos rectos, repartidas por la vuelta.
  const pads: Pad[] = [];
  for (let tries = 0; tries < 300 && pads.length < 6; tries++) {
    const i = Math.floor(rng.uniform(lo, hi));
    // Recta larga por delante: el turbo dura ~300 unidades y no debe lanzar a nadie contra una curva cerrada.
    if (turnOver(line, i, 10) > 0.2 || turnOver(line, i, 56) > 0.6 || !free(i, 4, used)) continue;
    if (pads.some((p) => Math.abs(p.i - i) < 50)) continue;
    const off = rng.choice([-14, 0, 14]);
    pads.push({ i, off, x: px[i] - Math.sin(dir[i]) * off, y: py[i] + Math.cos(dir[i]) * off });
  }
  // Monedas: filas de 5 cada pocos puntos, y un arco sobre cada rampa.
  const coins: Coin[] = [];
  const lane = (i: number, off: number) => ({ x: px[i % n] - Math.sin(dir[i % n]) * off, y: py[i % n] + Math.cos(dir[i % n]) * off });
  for (let g = 0; g < 7; g++) {
    const i0 = Math.floor(lo + ((hi - lo) * (g + rng.next() * 0.6)) / 7);
    const off = rng.choice([-16, 0, 16]);
    if (tunnels.some((t) => i0 + 14 > t.from && i0 < t.to) && g % 2) continue;
    for (let k = 0; k < 5; k++) coins.push(lane(i0 + k * 3, off));
  }
  for (const r of ramps) for (let k = 1; k <= 5; k++) coins.push(lane(r.i + RAMP_LEN + k * 4, 0));
  return { ramps, pads, tunnels, coins, hazards };
}

/** Pinta el suelo del circuito (hierba, arena, pianos, asfalto y meta) en un lienzo TEX×TEX. */
export function trackCanvas(track: Track): HTMLCanvasElement {
  if (track.canvas) return track.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TEX;
  const c = canvas.getContext("2d")!;
  const th = track.theme;
  const rng = new Rng(track.seed);

  c.fillStyle = css(th.grass);
  c.fillRect(0, 0, TEX, TEX);
  // Manchas redondas de otro tono (nada de cuadraditos) y detalles del tema: flores, ondas de arena, destellos.
  c.fillStyle = css(th.grass2, 0.55);
  const patches = Math.round(900 * (TEX / 1024) ** 2);
  for (let i = 0; i < patches; i++) {
    c.beginPath();
    c.arc(rng.next() * TEX, rng.next() * TEX, 6 + rng.next() * 22, 0, Math.PI * 2);
    c.fill();
  }
  const dots = Math.round(1400 * (TEX / 1024) ** 2);
  for (let i = 0; i < dots; i++) {
    const x = rng.next() * TEX, y = rng.next() * TEX;
    if (th.name === "Pradera") {
      c.fillStyle = ["#ffffff", "#ffe066", "#ff8ab8"][i % 3];
      c.beginPath();
      c.arc(x, y, 1.6 + rng.next() * 1.4, 0, Math.PI * 2);
      c.fill();
    } else if (th.name === "Volcán") {
      c.strokeStyle = css([255, 120 + (i % 3) * 30, 30], 0.55);
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rng.next() - 0.5) * 26, y + (rng.next() - 0.5) * 26);
      c.stroke();
    } else if (th.name === "Desierto") {
      c.strokeStyle = css(th.sand, 0.5);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 8 + rng.next() * 10, 0.2, Math.PI - 0.2);
      c.stroke();
    } else {
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.fillRect(x, y, 2, 2);
    }
  }

  // Sombra en el suelo bajo cada decoración.
  c.fillStyle = "rgba(0,0,0,0.18)";
  for (const d of track.decos) {
    c.beginPath();
    c.ellipse(d.x, d.y, 6 * d.size, 4 * d.size, 0, 0, Math.PI * 2);
    c.fill();
  }

  const path = new Path2D();
  path.moveTo(track.px[0], track.py[0]);
  for (let i = 1; i < track.n; i++) path.lineTo(track.px[i], track.py[i]);
  path.closePath();
  c.lineJoin = "round";
  c.lineCap = "round";
  const stroke = (width: number, color: string, dash: number[] = []) => {
    c.setLineDash(dash);
    c.lineWidth = width;
    c.strokeStyle = color;
    c.stroke(path);
  };
  stroke(TRACK_W + 2 * CURB_W + 26, css(th.grass2, 0.5));
  stroke(TRACK_W + 2 * CURB_W + 18, css(th.sand));
  stroke(TRACK_W + 2 * CURB_W, "rgb(245,245,245)");
  stroke(TRACK_W + 2 * CURB_W, "rgb(214,40,40)", [10, 10]);
  stroke(TRACK_W, css(th.road));
  stroke(TRACK_W - 14, css([th.road[0] + 10, th.road[1] + 10, th.road[2] + 12]));
  stroke(3, "rgba(255,255,255,0.7)", [14, 16]);
  c.setLineDash([]);

  // Línea de meta a cuadros.
  c.save();
  c.translate(track.px[0], track.py[0]);
  c.rotate(track.dir[0]);
  const sq = 4;
  for (let row = 0; row < 2; row++) {
    for (let col = -TRACK_W / 2; col < TRACK_W / 2; col += sq) {
      c.fillStyle = (row + Math.round(col / sq)) & 1 ? "#111" : "#fff";
      c.fillRect(-sq + row * sq, col, sq, sq);
    }
  }
  c.restore();
  track.canvas = canvas;
  return canvas;
}

export interface Location {
  i: number; // segmento más cercano
  t: number; // posición dentro del segmento (0..1)
  d: number; // distancia a la línea central
  qx: number; // punto más cercano
  qy: number;
}

/** Lo mínimo para buscar en la línea central. */
interface Centerline {
  n: number;
  px: Float32Array;
  py: Float32Array;
  dir: Float32Array;
}

/** Punto más cercano de la línea central. Con pista (hint) busca solo cerca; sin ella, en toda la vuelta. */
export function locate(track: Centerline, x: number, y: number, hint = -1): Location {
  const { n, px, py } = track;
  const range = hint < 0 ? n : 30;
  const start = hint < 0 ? 0 : hint - range;
  const end = hint < 0 ? n : hint + range;
  let best = Infinity;
  let out: Location = { i: 0, t: 0, d: 0, qx: px[0], qy: py[0] };
  for (let s = start; s < end; s++) {
    const i = ((s % n) + n) % n;
    const j = (i + 1) % n;
    const vx = px[j] - px[i];
    const vy = py[j] - py[i];
    const len2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - px[i]) * vx + (y - py[i]) * vy) / len2));
    const qx = px[i] + vx * t;
    const qy = py[i] + vy * t;
    const d2 = (x - qx) ** 2 + (y - qy) ** 2;
    if (d2 < best) {
      best = d2;
      out = { i, t, d: 0, qx, qy };
    }
  }
  out.d = Math.sqrt(best);
  return out;
}
