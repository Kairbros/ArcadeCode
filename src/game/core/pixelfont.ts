// Fuente de píxeles propia (5×7, solo mayúsculas) para que todo el texto de los juegos tenga aire de
// recreativa. Cada glifo es una lista de filas separadas por "|" ("#" = punto encendido). Las minúsculas
// se dibujan como mayúsculas; tildes, diéresis y virgulilla van en las dos filas de encima (-2 y -1).
// Un punto mide size/9 píxeles lógicos y se redondea a píxeles de pantalla para que salga nítido.

const GLYPHS: Record<string, string> = {
  A: ".###.|#...#|#...#|#####|#...#|#...#|#...#",
  B: "####.|#...#|#...#|####.|#...#|#...#|####.",
  C: ".###.|#...#|#....|#....|#....|#...#|.###.",
  D: "####.|#...#|#...#|#...#|#...#|#...#|####.",
  E: "#####|#....|#....|####.|#....|#....|#####",
  F: "#####|#....|#....|####.|#....|#....|#....",
  G: ".###.|#...#|#....|#.###|#...#|#...#|.####",
  H: "#...#|#...#|#...#|#####|#...#|#...#|#...#",
  I: "###|.#.|.#.|.#.|.#.|.#.|###",
  J: "..###|...#.|...#.|...#.|#..#.|#..#.|.##..",
  K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
  L: "#....|#....|#....|#....|#....|#....|#####",
  M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
  N: "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#",
  O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
  P: "####.|#...#|#...#|####.|#....|#....|#....",
  Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
  R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
  S: ".####|#....|#....|.###.|....#|....#|####.",
  T: "#####|..#..|..#..|..#..|..#..|..#..|..#..",
  U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
  V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
  W: "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.",
  X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
  Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
  Z: "#####|....#|...#.|..#..|.#...|#....|#####",
  "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
  "1": "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
  "2": ".###.|#...#|....#|...#.|..#..|.#...|#####",
  "3": "#####|...#.|..#..|...#.|....#|#...#|.###.",
  "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
  "5": "#####|#....|####.|....#|....#|#...#|.###.",
  "6": "..##.|.#...|#....|####.|#...#|#...#|.###.",
  "7": "#####|....#|...#.|..#..|.#...|.#...|.#...",
  "8": ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
  "9": ".###.|#...#|#...#|.####|....#|...#.|.##..",
  " ": "...|...|...|...|...|...|...",
  ".": ".|.|.|.|.|.|#",
  ",": "..|..|..|..|..|.#|#.",
  ":": ".|#|.|.|.|#|.",
  ";": "..|.#|..|..|..|.#|#.",
  "!": "#|#|#|#|#|.|#",
  "¡": "#|.|#|#|#|#|#",
  "?": ".###.|#...#|....#|...#.|..#..|.....|..#..",
  "¿": "..#..|.....|..#..|.#...|#....|#...#|.###.",
  "-": "....|....|....|####|....|....|....",
  "+": ".....|..#..|..#..|#####|..#..|..#..|.....",
  "±": "..#..|..#..|#####|..#..|..#..|.....|#####",
  "=": "....|....|####|....|####|....|....",
  "/": "....#|....#|...#.|..#..|.#...|#....|#....",
  "(": "..#|.#.|#..|#..|#..|.#.|..#",
  ")": "#..|.#.|..#|..#|..#|.#.|#..",
  "[": "###|#..|#..|#..|#..|#..|###",
  "]": "###|..#|..#|..#|..#|..#|###",
  "<": "...#|..#.|.#..|#...|.#..|..#.|...#",
  ">": "#...|.#..|..#.|...#|..#.|.#..|#...",
  "'": "#|#|.|.|.|.|.",
  '"': "#.#|#.#|...|...|...|...|...",
  "%": "##..#|##..#|...#.|..#..|.#...|#..##|#..##",
  "#": ".#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.",
  "*": ".....|#.#.#|.###.|#####|.###.|#.#.#|.....",
  $: "..#..|.####|#.#..|.###.|..#.#|####.|..#..",
  _: ".....|.....|.....|.....|.....|.....|#####",
  "|": "#|#|#|#|#|#|#",
  "º": ".#.|#.#|.#.|...|###|...|...",
  ª: ".##|#.#|.##|...|###|...|...",
  "°": ".#.|#.#|.#.|...|...|...|...",
  "²": "##.|..#|.#.|###|...|...|...",
  "·": ".|.|.|#|.|.|.",
  "…": ".....|.....|.....|.....|.....|.....|#.#.#",
  "×": ".....|#...#|.#.#.|..#..|.#.#.|#...#|.....",
  "«": ".....|..#.#|.#.#.|#.#..|.#.#.|..#.#|.....",
  "»": ".....|#.#..|.#.#.|..#.#|.#.#.|#.#..|.....",
  "★": "..#..|..#..|#####|.###.|.###.|##.##|#...#",
  "▼": ".....|.....|#####|.###.|..#..|.....|.....",
  "▲": ".....|.....|..#..|.###.|#####|.....|.....",
  "←": ".....|..#..|.#...|#####|.#...|..#..|.....",
  "→": ".....|..#..|...#.|#####|...#.|..#..|.....",
  "↑": "..#..|.###.|#.#.#|..#..|..#..|..#..|.....",
  "↓": "..#..|..#..|..#..|#.#.#|.###.|..#..|.....",
  "↔": ".......|..#.#..|.#...#.|#######|.#...#.|..#.#..|.......",
  "♥": ".....|.#.#.|#####|#####|.###.|..#..|.....",
  "■": ".....|.###.|.###.|.###.|.....|.....|.....",
};

// Letras con signos encima: letra base + dos filas por encima.
const ACUTE = "...#.|..#..";
const MARKS: Record<string, [string, string]> = {
  Á: ["A", ACUTE], É: ["E", ACUTE], Ó: ["O", ACUTE], Ú: ["U", ACUTE], Í: ["I", "..#|.#."],
  Ñ: ["N", ".##.#|#..#."], Ü: ["U", ".....|.#.#."],
};

const ALIASES: Record<string, string> = { "−": "-", "–": "-", "—": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "\t": " " };

type Run = readonly [x: number, y: number, len: number];
interface Glyph {
  w: number;
  runs: Run[];
}

function parse(rows: string[], top: number, runs: Run[]) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "#") continue;
      let end = x;
      while (row[end + 1] === "#") end++;
      runs.push([x, y + top, end - x + 1]);
      x = end;
    }
  });
}

const glyphs = new Map<string, Glyph>();
for (const [ch, def] of Object.entries(GLYPHS)) {
  const rows = def.split("|");
  const runs: Run[] = [];
  parse(rows, 0, runs);
  glyphs.set(ch, { w: rows[0].length, runs });
}
for (const [ch, [base, mark]] of Object.entries(MARKS)) {
  const g = glyphs.get(base)!;
  const runs = [...g.runs];
  parse(mark.split("|"), -2, runs);
  glyphs.set(ch, { w: g.w, runs });
}
/** Carácter desconocido: un cuadro hueco. */
const UNKNOWN: Glyph = (() => {
  const runs: Run[] = [];
  parse("####|#..#|#..#|#..#|#..#|#..#|####".split("|"), 0, runs);
  return { w: 4, runs };
})();

function glyphOf(ch: string): Glyph {
  return glyphs.get(ch) ?? glyphs.get(ALIASES[ch] ?? "") ?? glyphs.get(ch.toUpperCase()) ?? UNKNOWN;
}

/** Tamaño en píxeles de una fuente CSS ("bold 8px Arial" → 8). */
export function fontSize(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 10;
}

function scaleOf(ctx: CanvasRenderingContext2D): number {
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b) || 1;
}

/**
 * Lado de un punto en unidades lógicas. Se redondea a píxeles de pantalla enteros (nítido) salvo en
 * pantallas muy pequeñas, donde redondear cambiaría demasiado el tamaño del texto.
 */
export function pixelDot(ctx: CanvasRenderingContext2D, size: number): number {
  const scale = scaleOf(ctx);
  const dev = (size / 9) * scale;
  return (dev >= 1.5 ? Math.round(dev) : dev) / scale;
}

/** Ancho del texto en unidades lógicas. `gap`: puntos entre letras. */
export function measurePixelText(ctx: CanvasRenderingContext2D, str: string, size: number, gap = 1): number {
  let dots = 0;
  for (const ch of str) dots += glyphOf(ch).w + gap;
  return Math.max(0, dots - gap) * pixelDot(ctx, size);
}

/** Dibuja el texto con el fillStyle actual. La línea base imita a la de Canvas (top, middle, alphabetic...). */
export function drawPixelText(
  ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size: number,
  align: CanvasTextAlign = "left", baseline: CanvasTextBaseline = "top", gap = 1,
) {
  const scale = scaleOf(ctx);
  const dot = pixelDot(ctx, size);
  const width = measurePixelText(ctx, str, size, gap);
  let x0 = align === "center" ? x - width / 2 : align === "right" || align === "end" ? x - width : x;
  // La caja de las letras ocupa 7 puntos; "top" deja uno libre encima, como el hueco de una fuente normal.
  let y0 = baseline === "middle" ? y - dot * 3.5 : baseline === "top" || baseline === "hanging" ? y + dot : y - dot * 7;
  x0 = Math.round(x0 * scale) / scale;
  y0 = Math.round(y0 * scale) / scale;
  ctx.beginPath();
  for (const ch of str) {
    const g = glyphOf(ch);
    for (const [gx, gy, len] of g.runs) ctx.rect(x0 + gx * dot, y0 + gy * dot, len * dot, dot);
    x0 += (g.w + gap) * dot;
  }
  ctx.fill();
}
