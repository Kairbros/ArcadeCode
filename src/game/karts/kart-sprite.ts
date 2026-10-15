// Sprite del kart estilo SNES: un modelo 3D sencillo (cajas + casco) proyectado desde la cámara,
// prerenderizado en 32 ángulos por color a baja resolución y escalado sin suavizado (pixelado).
import type { RGB } from "../core/config";
import { css, shade } from "../core/draw";

const R = 3; // píxeles del sprite por unidad de mundo
const W = 72;
const H = 66;
const OX = W / 2; // punto de apoyo en el suelo dentro del sprite
const OY = H - 16;
const PITCH = 0.32; // cuánto se ve "desde arriba" (igual que el resto de sprites)
const VIEWS = 32;

/** Pieza del modelo: caja alineada con el kart (avance, lateral, altura). */
interface Box {
  al: [number, number];
  ac: [number, number];
  up: [number, number];
  color: RGB;
  wheel?: boolean; // dibuja llanta en la cara exterior
}

const RUBBER: RGB = [34, 34, 40];
const METAL: RGB = [150, 154, 165];
const DARK: RGB = [48, 50, 58];
const SEAT: RGB = [28, 28, 34];

function model(color: RGB): Box[] {
  const light = shade(color, 1.15);
  const deep = shade(color, 0.7);
  const parts: Box[] = [
    // Ruedas: traseras anchas, delanteras más finas.
    ...[1, -1].flatMap((side): Box[] => [
      { al: [-5.6, -2.4], ac: side > 0 ? [3.3, 5.8] : [-5.8, -3.3], up: [0, 3.1], color: RUBBER, wheel: true },
      { al: [2.6, 5.1], ac: side > 0 ? [3.1, 5.0] : [-5.0, -3.1], up: [0, 2.5], color: RUBBER, wheel: true },
    ]),
    { al: [-5.6, 5.9], ac: [-3.1, 3.1], up: [0.6, 1.4], color: DARK }, // chasis
    { al: [6.5, 7.4], ac: [-3.4, 3.4], up: [0.7, 1.7], color: DARK }, // parachoques
    { al: [-2.6, 2.2], ac: [2.5, 3.7], up: [1.2, 2.5], color: deep }, // pontones
    { al: [-2.6, 2.2], ac: [-3.7, -2.5], up: [1.2, 2.5], color: deep },
    { al: [-3.6, 4.0], ac: [-2.6, 2.6], up: [1.4, 3.0], color }, // carrocería
    { al: [4.0, 6.8], ac: [-1.9, 1.9], up: [1.2, 2.5], color: light }, // morro
    { al: [-6.2, -3.6], ac: [-2.9, 2.9], up: [0.9, 2.2], color: deep }, // carenado trasero (color visible de espaldas)
    { al: [-6.0, -3.8], ac: [-1.5, 1.5], up: [2.2, 3.7], color: METAL }, // motor
    { al: [-7.0, -6.0], ac: [0.4, 1.3], up: [2.4, 3.3], color: [200, 204, 214] }, // escapes
    { al: [-7.0, -6.0], ac: [-1.3, -0.4], up: [2.4, 3.3], color: [200, 204, 214] },
    { al: [-6.3, -5.8], ac: [-2.4, -1.8], up: [3.0, 4.6], color: DARK }, // soportes del alerón
    { al: [-6.3, -5.8], ac: [1.8, 2.4], up: [3.0, 4.6], color: DARK },
    { al: [-7.0, -5.3], ac: [-3.6, 3.6], up: [4.6, 5.6], color }, // alerón
    { al: [-3.7, -2.7], ac: [-1.9, 1.9], up: [3.0, 5.6], color: SEAT }, // respaldo
    { al: [-2.9, -0.8], ac: [-1.7, 1.7], up: [3.0, 5.7], color: [235, 235, 240] }, // piloto (mono)
    { al: [0.1, 0.7], ac: [-1.3, 1.3], up: [3.6, 4.3], color: SEAT }, // volante
  ];
  return parts;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Dibuja el kart con el suelo en (sx, sy). s = píxeles por unidad; rel = rumbo respecto a la cámara. */
export function drawKartSprite(ctx: CanvasRenderingContext2D, sx: number, sy: number, s: number, rel: number, color: RGB) {
  const view = ((Math.round((rel / (Math.PI * 2)) * VIEWS) % VIEWS) + VIEWS) % VIEWS;
  const key = `${color.join(",")}:${view}`;
  let sprite = cache.get(key);
  if (!sprite) {
    sprite = renderView(color, (view / VIEWS) * Math.PI * 2);
    cache.set(key, sprite);
  }
  const k = s / R;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, sx - OX * k, sy - OY * k, W * k, H * k);
  ctx.imageSmoothingEnabled = prev;
}

function renderView(color: RGB, rel: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  const cs = Math.cos(rel);
  const sn = Math.sin(rel);
  const P = (al: number, ac: number, up: number): [number, number] => [
    OX + (ac * cs + al * sn) * R,
    OY - (al * cs - ac * sn) * R * PITCH - up * R,
  ];
  // Profundidad: positiva = más lejos de la cámara.
  const depth = (al: number, ac: number) => al * cs - ac * sn;

  const poly = (pts: [number, number][], fill: RGB, outline = true) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = css(fill);
    c.fill();
    if (outline) {
      c.strokeStyle = "rgba(10,10,16,0.55)";
      c.lineWidth = 0.8;
      c.stroke();
    }
  };

  const drawBox = (b: Box) => {
    const [a0, a1] = b.al;
    const [c0, c1] = b.ac;
    const [u0, u1] = b.up;
    // Caras laterales visibles (la normal mira hacia la cámara), más oscuras que la tapa.
    const faces: { visible: boolean; pts: [number, number][]; tone: number; outer?: boolean }[] = [
      { visible: cs < 0, pts: [P(a1, c0, u0), P(a1, c1, u0), P(a1, c1, u1), P(a1, c0, u1)], tone: 0.62 }, // delante
      { visible: cs > 0, pts: [P(a0, c0, u0), P(a0, c1, u0), P(a0, c1, u1), P(a0, c0, u1)], tone: 0.58 }, // detrás
      { visible: sn > 0, pts: [P(a0, c1, u0), P(a1, c1, u0), P(a1, c1, u1), P(a0, c1, u1)], tone: 0.74, outer: c1 > 0 }, // derecha
      { visible: sn < 0, pts: [P(a0, c0, u0), P(a1, c0, u0), P(a1, c0, u1), P(a0, c0, u1)], tone: 0.8, outer: c0 < 0 }, // izquierda
    ];
    for (const f of faces) {
      if (!f.visible) continue;
      poly(f.pts, shade(b.color, f.tone));
      if (b.wheel && f.outer) {
        // Llanta en la cara exterior de la rueda.
        const cx = f.pts.reduce((s, p) => s + p[0], 0) / 4;
        const cy = f.pts.reduce((s, p) => s + p[1], 0) / 4;
        const w = Math.abs(f.pts[1][0] - f.pts[0][0]);
        const h = Math.abs(f.pts[2][1] - f.pts[1][1]);
        c.fillStyle = css(METAL);
        c.beginPath();
        c.ellipse(cx, cy, Math.max(0.8, w * 0.28), Math.max(0.8, h * 0.28), 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    poly([P(a0, c0, u1), P(a1, c0, u1), P(a1, c1, u1), P(a0, c1, u1)], b.wheel ? shade(b.color, 1.25) : b.color);
    if (b.wheel) {
      // Dibujo del neumático en la banda de rodadura.
      c.strokeStyle = "rgba(0,0,0,0.5)";
      c.lineWidth = 0.6;
      for (let t = 0.25; t < 1; t += 0.25) {
        const a = a0 + (a1 - a0) * t;
        const [x0, y0] = P(a, c0, u1);
        const [x1, y1] = P(a, c1, u1);
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
        c.stroke();
      }
    }
  };

  // Orden del pintor: de lejos a cerca; a igual distancia, lo más bajo primero.
  const parts = model(color)
    .map((b) => ({ b, key: depth((b.al[0] + b.al[1]) / 2, (b.ac[0] + b.ac[1]) / 2) - b.up[0] * 0.35 }))
    .sort((x, y) => y.key - x.key);
  const helmetKey = depth(-1.8, 0) - 5.5 * 0.35;
  let helmetDrawn = false;
  for (const { b, key } of parts) {
    if (!helmetDrawn && key < helmetKey) {
      drawHelmet();
      helmetDrawn = true;
    }
    drawBox(b);
  }
  if (!helmetDrawn) drawHelmet();

  function drawHelmet() {
    const [hx, hy] = P(-1.8, 0, 7.4);
    const r = 2.3 * R;
    c.fillStyle = css(shade(color, 0.55));
    c.beginPath();
    c.arc(hx, hy, r + 0.8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = css(color);
    c.beginPath();
    c.arc(hx, hy, r, 0, Math.PI * 2);
    c.fill();
    // Franja blanca de delante a atrás.
    const [fx, fy] = P(0.5, 0, 8.6);
    const [bx, by] = P(-4.1, 0, 8.6);
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(fx, Math.min(fy, hy - r * 0.2));
    c.lineTo(bx, Math.min(by, hy - r * 0.2));
    c.stroke();
    // Visera: solo si la cara del casco mira hacia la cámara o de lado.
    if (cs < 0.6) {
      const [vx, vy] = P(0.2, 0, 7.2);
      c.fillStyle = "rgb(20,24,40)";
      c.beginPath();
      c.ellipse(vx, vy, r * 0.55 * Math.max(0.35, Math.abs(cs) + Math.abs(sn) * 0.6), r * 0.32, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(140,200,255,0.6)";
      c.fillRect(vx - r * 0.25, vy - r * 0.18, r * 0.2, r * 0.12);
    }
    // Brillo
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.beginPath();
    c.arc(hx - r * 0.35, hy - r * 0.4, r * 0.25, 0, Math.PI * 2);
    c.fill();
  }

  return canvas;
}
