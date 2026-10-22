// Texturas de las cartas de «Mazo Loco» en alta resolución (lienzo 2D → textura): borde blanco, campo de
// color, óvalo inclinado con el símbolo grande, índices en dos esquinas y un dorso propio. Se hacen una vez
// por carta y se guardan, así que el coste está en la primera vez que sale cada una.
import * as THREE from "three";
import { CARD_COLORS, CARD_DARK } from "./config";
import { colorOf, DRAW2, isWild, rankOf, rankShort, REVERSE, SKIP, WILD4 } from "./deck";

export const TEX_W = 320;
export const TEX_H = 448;
const RADIUS = 28;
const BORDER = 16;

const hex = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const FONT = (px: number) => `900 ${px}px "Arial Black", Arial, Helvetica, sans-serif`;

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = TEX_W;
  c.height = TEX_H;
  return [c, c.getContext("2d")!];
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Texto con contorno oscuro y sombra: se lee igual sobre cualquier color. */
function bold(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, fill: string, edge: string, w = 10): void {
  g.font = FONT(px);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = w;
  g.strokeStyle = edge;
  g.strokeText(s, x + 3, y + 5);
  g.fillStyle = fill;
  g.fillText(s, x, y);
}

/** Naipe pequeño inclinado (para el +2 y el +4). */
function miniCard(g: CanvasRenderingContext2D, x: number, y: number, rot: number, color: string): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = "#fff";
  rr(g, -22, -32, 44, 64, 7);
  g.fill();
  g.fillStyle = color;
  rr(g, -17, -27, 34, 54, 4);
  g.fill();
  g.restore();
}

function arrow(g: CanvasRenderingContext2D, cx: number, cy: number, dir: 1 | -1, fill: string): void {
  g.save();
  g.translate(cx, cy);
  g.scale(dir, 1);
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(-52, 22);
  g.quadraticCurveTo(-52, -34, 6, -34);
  g.lineTo(6, -52);
  g.lineTo(50, -20);
  g.lineTo(6, 12);
  g.lineTo(6, -6);
  g.quadraticCurveTo(-24, -6, -24, 22);
  g.closePath();
  g.fill();
  g.restore();
}

/** Cara de una carta (id 0..53). */
export function drawFace(id: number): THREE.CanvasTexture {
  const [c, g] = makeCanvas();
  const wild = isWild(id);
  const color = colorOf(id);
  const main = wild ? "#14101a" : hex(CARD_COLORS[color]);
  const dark = wild ? "#14101a" : hex(CARD_DARK[color]);
  const rank = rankOf(id);

  g.fillStyle = "#fbf7ec";
  rr(g, 0, 0, TEX_W, TEX_H, RADIUS);
  g.fill();
  // Campo de color (comodín: negro, con el óvalo de cuatro colores).
  g.fillStyle = main;
  rr(g, BORDER, BORDER, TEX_W - BORDER * 2, TEX_H - BORDER * 2, RADIUS - 8);
  g.fill();
  // Brillo suave arriba y sombra abajo, para que no sea plano.
  const sheen = g.createLinearGradient(0, BORDER, 0, TEX_H - BORDER);
  sheen.addColorStop(0, "rgba(255,255,255,0.16)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(0,0,0,0.18)");
  g.fillStyle = sheen;
  rr(g, BORDER, BORDER, TEX_W - BORDER * 2, TEX_H - BORDER * 2, RADIUS - 8);
  g.fill();

  // Óvalo inclinado.
  const cx = TEX_W / 2;
  const cy = TEX_H / 2;
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.42);
  g.beginPath();
  g.ellipse(0, 0, 118, 176, 0, 0, Math.PI * 2);
  g.fillStyle = "#fbf7ec";
  g.fill();
  if (wild) {
    // Cuatro cuñas de color dentro del óvalo.
    g.save();
    g.beginPath();
    g.ellipse(0, 0, 104, 162, 0, 0, Math.PI * 2);
    g.clip();
    const q = [0, 1, 3, 2];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = hex(CARD_COLORS[q[i]]);
      g.fillRect(i % 2 === 0 ? -120 : 0, i < 2 ? -180 : 0, 120, 180);
    }
    g.restore();
  } else {
    g.beginPath();
    g.ellipse(0, 0, 104, 162, 0, 0, Math.PI * 2);
    g.fillStyle = "#fbf7ec";
    g.fill();
  }
  g.restore();

  // Símbolo central (sin giro).
  g.save();
  g.translate(cx, cy);
  if (id === WILD4) {
    const cols = [0, 1, 2, 3].map((i) => hex(CARD_COLORS[i]));
    miniCard(g, -44, 40, -0.5, cols[0]);
    miniCard(g, -8, 32, -0.18, cols[1]);
    miniCard(g, 28, 32, 0.18, cols[2]);
    miniCard(g, 62, 40, 0.5, cols[3]);
    bold(g, "+4", 0, -66, 104, "#fbf7ec", "#14101a", 14);
  } else if (wild) {
    bold(g, "?", 0, 0, 150, "#fbf7ec", "#14101a", 14);
  } else if (rank === SKIP) {
    g.lineWidth = 26;
    g.strokeStyle = dark;
    g.beginPath();
    g.arc(4, 5, 66, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(-42, 50);
    g.lineTo(52, -42);
    g.stroke();
    g.lineWidth = 18;
    g.strokeStyle = main;
    g.beginPath();
    g.arc(0, 0, 66, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(-46, 46);
    g.lineTo(46, -46);
    g.stroke();
  } else if (rank === REVERSE) {
    arrow(g, 0, -28, 1, dark);
    arrow(g, 0, 28, -1, dark);
    g.translate(-3, -4);
    arrow(g, 0, -28, 1, main);
    arrow(g, 0, 28, -1, main);
  } else if (rank === DRAW2) {
    miniCard(g, -18, 34, -0.2, hex(CARD_DARK[color]));
    miniCard(g, 16, 28, 0.16, main);
    bold(g, "+2", 0, -58, 100, main, dark, 12);
  } else {
    bold(g, String(rank), 0, 0, rank >= 10 ? 150 : 210, main, dark, 14);
  }
  g.restore();

  // Índices de las esquinas: arriba a la izquierda y abajo a la derecha (boca abajo).
  const label = wild ? (id === WILD4 ? "+4" : "?") : rankShort(id);
  const small = label.length > 1 ? 64 : 76;
  bold(g, label, 56, 62, small, "#fbf7ec", dark, 9);
  g.save();
  g.translate(TEX_W - 56, TEX_H - 62);
  g.rotate(Math.PI);
  bold(g, label, 0, 0, small, "#fbf7ec", dark, 9);
  g.restore();
  return toTexture(c);
}

/** Dorso: fondo oscuro con rayas finas y el óvalo naranja de «MAZO LOCO». */
export function drawBack(): THREE.CanvasTexture {
  const [c, g] = makeCanvas();
  g.fillStyle = "#f4ecdc";
  rr(g, 0, 0, TEX_W, TEX_H, RADIUS);
  g.fill();
  g.fillStyle = "#241028";
  rr(g, BORDER, BORDER, TEX_W - BORDER * 2, TEX_H - BORDER * 2, RADIUS - 8);
  g.fill();
  g.save();
  rr(g, BORDER, BORDER, TEX_W - BORDER * 2, TEX_H - BORDER * 2, RADIUS - 8);
  g.clip();
  g.strokeStyle = "rgba(255,170,60,0.13)";
  g.lineWidth = 3;
  for (let i = -TEX_H; i < TEX_W; i += 22) {
    g.beginPath();
    g.moveTo(i, TEX_H);
    g.lineTo(i + TEX_H, 0);
    g.stroke();
  }
  g.restore();
  g.save();
  g.translate(TEX_W / 2, TEX_H / 2);
  g.rotate(-0.42);
  g.beginPath();
  g.ellipse(0, 0, 112, 172, 0, 0, Math.PI * 2);
  g.fillStyle = "#e5472f";
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = "#f6b434";
  g.stroke();
  g.rotate(0.42);
  g.rotate(-0.42);
  bold(g, "MAZO", -4, -34, 60, "#ffd24a", "#3a0e10", 12);
  bold(g, "LOCO", 4, 38, 60, "#ffd24a", "#3a0e10", 12);
  g.restore();
  return toTexture(c);
}
