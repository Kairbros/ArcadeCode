// Texturas generadas con Canvas 2D (sin archivos): tapete, madera, suelo, paredes y etiquetas.
// Se crean la primera vez que se piden y se reutilizan.
import * as THREE from "three";
import { Rng } from "../core/rng";

const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D, rnd: Rng) => void, repeat = 1) {
  let tex = cache.get(key);
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  paint(g, new Rng(key.length * 7919 + w));
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat !== 1) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  cache.set(key, tex);
  return tex;
}

/** Motas de ruido: da textura a superficies lisas. */
function speckle(g: CanvasRenderingContext2D, rnd: Rng, w: number, h: number, n: number, alpha: number, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = rnd.next() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * rnd.next()})`;
    g.fillRect(rnd.next() * w, rnd.next() * h, size * rnd.next() + 0.5, size * rnd.next() + 0.5);
  }
}

/** Manchas difusas (suciedad, humedad). */
function stains(g: CanvasRenderingContext2D, rnd: Rng, w: number, h: number, n: number, color: string, maxR: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd.next() * w, y = rnd.next() * h, r = maxR * (0.3 + rnd.next() * 0.7);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export const feltTexture = () =>
  make("felt", 512, 512, (g, rnd) => {
    g.fillStyle = "#33503d";
    g.fillRect(0, 0, 512, 512);
    speckle(g, rnd, 512, 512, 9000, 0.12, 1.5);
    stains(g, rnd, 512, 512, 14, "rgba(10,20,12,0.35)", 70);
    stains(g, rnd, 512, 512, 6, "rgba(70,40,20,0.25)", 30); // manchas de bebida
    // Gastado en el centro (donde se deja la escopeta) y más oscuro hacia el borde.
    const wear = g.createRadialGradient(256, 256, 20, 256, 256, 330);
    wear.addColorStop(0, "rgba(120,140,110,0.18)");
    wear.addColorStop(0.6, "rgba(0,0,0,0)");
    wear.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = wear;
    g.fillRect(0, 0, 512, 512);
    // Recuadro pintado
    g.strokeStyle = "rgba(200,190,140,0.25)";
    g.lineWidth = 4;
    g.strokeRect(56, 56, 400, 400);
  });

export const woodTexture = () =>
  make("wood", 256, 128, (g, rnd) => {
    g.fillStyle = "#5a3820";
    g.fillRect(0, 0, 256, 128);
    // Vetas: líneas onduladas de distinto tono.
    for (let i = 0; i < 70; i++) {
      const y0 = rnd.next() * 128, amp = 1 + rnd.next() * 3, freq = 0.01 + rnd.next() * 0.03, ph = rnd.next() * 6;
      const dark = rnd.next() < 0.6;
      g.strokeStyle = dark ? `rgba(30,15,5,${0.15 + rnd.next() * 0.25})` : `rgba(140,95,55,${0.1 + rnd.next() * 0.2})`;
      g.lineWidth = 0.5 + rnd.next() * 1.5;
      g.beginPath();
      for (let x = 0; x <= 256; x += 4) g.lineTo(x, y0 + Math.sin(x * freq + ph) * amp);
      g.stroke();
    }
    speckle(g, rnd, 256, 128, 1500, 0.1, 1);
  });

export const floorTexture = () =>
  make("floor", 256, 256, (g, rnd) => {
    // Baldosas a cuadros, gastadas, con juntas oscuras.
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const v = (i + j) % 2 ? 58 : 38;
        g.fillStyle = `rgb(${v},${v - 2},${v - 5})`;
        g.fillRect(i * 64, j * 64, 64, 64);
      }
    }
    speckle(g, rnd, 256, 256, 6000, 0.15, 2);
    stains(g, rnd, 256, 256, 18, "rgba(0,0,0,0.45)", 50);
    g.strokeStyle = "rgba(10,10,10,0.8)";
    g.lineWidth = 2;
    for (let k = 0; k <= 256; k += 64) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, 256);
      g.moveTo(0, k);
      g.lineTo(256, k);
      g.stroke();
    }
  }, 6);

export const wallTexture = () =>
  make("wall", 256, 256, (g, rnd) => {
    // Azulejos verdosos de baño viejo, con churretes de humedad.
    g.fillStyle = "#4a5448";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      for (let x = 0; x < 256; x += 32) {
        const v = rnd.next() * 14 - 7;
        g.fillStyle = `rgb(${74 + v},${84 + v},${72 + v})`;
        g.fillRect(x + 1, y + 1, 30, 30);
      }
    }
    speckle(g, rnd, 256, 256, 4000, 0.12, 1.5);
    for (let i = 0; i < 14; i++) {
      const x = rnd.next() * 256, w = 3 + rnd.next() * 10;
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "rgba(30,25,10,0.5)");
      grad.addColorStop(1, "rgba(30,25,10,0)");
      g.fillStyle = grad;
      g.fillRect(x, 0, w, 120 + rnd.next() * 136);
    }
    stains(g, rnd, 256, 256, 10, "rgba(0,0,0,0.35)", 60);
  }, 3);

/** Etiqueta con una palabra centrada sobre una franja de color. */
const label = (key: string, bg: string, band: string, ink: string, word: string) =>
  make(key, 128, 128, (g, rnd) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = band;
    g.fillRect(0, 44, 128, 40);
    g.fillStyle = ink;
    g.font = "bold 20px Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(word, 64, 65);
    speckle(g, rnd, 128, 128, 400, 0.12, 1.5);
  });

export const canTexture = () => label("can", "#1f6b3a", "#e8e2c8", "#1a1a1a", "CERVEZA");
export const packTexture = () => label("pack", "#a8222a", "#ece8dc", "#a8222a", "TABACO");
export const medsTexture = () => label("meds", "#b4641e", "#efefe8", "#222", "CADUCADA");
