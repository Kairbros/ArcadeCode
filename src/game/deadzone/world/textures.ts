// Texturas procedurales dibujadas en canvas: cero archivos externos, 100 % originales. Son de 512 px, se pintan con
// una semilla fija (todos los jugadores ven el mismo sector) y sirven también de mapa de relieve. La repetición la
// decide el mapa en metros (`TILE_M`): así un ladrillo mide lo mismo en cualquier muro, sea largo o corto.
import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();
const S = 512;

/** Metros que cubre una repetición de cada textura. */
export const TILE_M: Record<string, number> = {
  asphalt: 4.5,
  concrete: 3.2,
  brick: 2.4,
  metal: 2.2,
  wood: 1.6,
  tile: 2.0,
  rust: 2.4,
  grass: 5.0,
  dirt: 4.0,
  barn: 2.4,
  siding: 2.2,
  plaster: 3.0,
  cobble: 3.0,
};

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type G = CanvasRenderingContext2D;
type R = () => number;

function makeCanvas(size = S): { c: HTMLCanvasElement; g: G } {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas 2d no disponible");
  return { c, g };
}

function finish(c: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Grano fino: ruido por píxel con puntitos oscuros. */
function noise(g: G, r: R, alpha: number, dark = true): void {
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 255 * alpha;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    if (dark && r() < 0.015) {
      d[i] *= 0.6;
      d[i + 1] *= 0.6;
      d[i + 2] *= 0.6;
    }
  }
  g.putImageData(img, 0, 0);
}

/** Manchas suaves (radiales) de un color. */
function blobs(g: G, r: R, count: number, color: string, min = 8, max = 60): void {
  for (let i = 0; i < count; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = min + r() * (max - min);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
}

/** Gotas de suciedad que chorrean desde lo alto (óxido, hollín, sangre vieja). */
function drips(g: G, r: R, count: number, rgb: string, maxLen = 220): void {
  for (let i = 0; i < count; i++) {
    const x = r() * S;
    const y0 = r() * S * 0.9;
    const len = 30 + r() * maxLen;
    const w = 2 + r() * 7;
    const grad = g.createLinearGradient(0, y0, 0, y0 + len);
    grad.addColorStop(0, `rgba(${rgb},${0.18 + r() * 0.2})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(x, y0, w, len);
  }
}

/** Grietas ramificadas: línea oscura con un filo claro al lado. */
function cracks(g: G, r: R, count: number, long = 1): void {
  for (let i = 0; i < count; i++) {
    let x = r() * S;
    let y = r() * S;
    let a = r() * Math.PI * 2;
    const segs = Math.floor((5 + r() * 9) * long);
    const path: [number, number][] = [[x, y]];
    for (let s = 0; s < segs; s++) {
      a += (r() - 0.5) * 1.1;
      const l = 8 + r() * 22;
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
      path.push([x, y]);
      if (r() < 0.18) {
        // Rama lateral corta.
        let bx = x;
        let by = y;
        let ba = a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6);
        g.beginPath();
        g.moveTo(bx, by);
        for (let k = 0; k < 3; k++) {
          ba += (r() - 0.5) * 0.9;
          bx += Math.cos(ba) * (6 + r() * 12);
          by += Math.sin(ba) * (6 + r() * 12);
          g.lineTo(bx, by);
        }
        g.strokeStyle = "rgba(8,8,10,0.6)";
        g.lineWidth = 0.9;
        g.stroke();
      }
    }
    for (const [off, color, w] of [[1.2, "rgba(255,255,255,0.12)", 1.1], [0, "rgba(6,6,8,0.7)", 1.5 + r()]] as const) {
      g.beginPath();
      path.forEach(([px, py], k) => (k ? g.lineTo(px + off, py + off) : g.moveTo(px + off, py + off)));
      g.strokeStyle = color;
      g.lineWidth = w;
      g.stroke();
    }
  }
}

const build: Record<string, () => THREE.Texture> = {
  asphalt: () => {
    const r = seeded(11);
    const { c, g } = makeCanvas();
    g.fillStyle = "#33363b";
    g.fillRect(0, 0, S, S);
    blobs(g, r, 22, "rgba(70,72,78,0.35)", 30, 120);
    blobs(g, r, 18, "rgba(10,10,12,0.35)", 20, 90);
    // Gravilla.
    for (let i = 0; i < 5200; i++) {
      const v = 40 + r() * 90;
      g.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + r() * 0.5})`;
      g.fillRect(r() * S, r() * S, 1 + r() * 2.2, 1 + r() * 2.2);
    }
    // Parches de alquitrán y manchas de aceite.
    for (let i = 0; i < 5; i++) {
      const x = r() * S;
      const y = r() * S;
      g.fillStyle = "rgba(18,18,20,0.55)";
      g.beginPath();
      g.ellipse(x, y, 20 + r() * 60, 12 + r() * 40, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    blobs(g, r, 8, "rgba(5,8,14,0.55)", 12, 40);
    cracks(g, r, 12, 1.4);
    noise(g, r, 0.28);
    return finish(c);
  },
  concrete: () => {
    const r = seeded(23);
    const { c, g } = makeCanvas();
    g.fillStyle = "#86827a";
    g.fillRect(0, 0, S, S);
    blobs(g, r, 30, "rgba(120,116,108,0.35)", 30, 110);
    blobs(g, r, 18, "rgba(40,36,30,0.28)", 20, 80);
    // Juntas de los paneles.
    for (const p of [0, S / 2]) {
      g.fillStyle = "rgba(20,20,22,0.6)";
      g.fillRect(0, p, S, 3);
      g.fillRect(p, 0, 3, S);
      g.fillStyle = "rgba(255,255,255,0.1)";
      g.fillRect(0, p + 3, S, 1.5);
      g.fillRect(p + 3, 0, 1.5, S);
    }
    drips(g, r, 26, "30,24,18");
    drips(g, r, 8, "120,60,24", 140);
    // Poros.
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(20,20,22,${0.2 + r() * 0.4})`;
      g.beginPath();
      g.arc(r() * S, r() * S, 0.6 + r() * 2, 0, Math.PI * 2);
      g.fill();
    }
    cracks(g, r, 9, 1.2);
    noise(g, r, 0.22);
    return finish(c);
  },
  brick: () => {
    const r = seeded(37);
    const { c, g } = makeCanvas();
    g.fillStyle = "#2a201c";
    g.fillRect(0, 0, S, S);
    const bw = 52;
    const bh = 17;
    for (let row = 0; row * bh < S + bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col * bw < S + bw; col++) {
        const x = col * bw + off;
        const y = row * bh;
        const shade = 0.62 + r() * 0.6;
        const tone = r();
        const rr = Math.round((tone < 0.15 ? 110 : 98) * shade);
        const gg = Math.round((tone < 0.15 ? 62 : 64) * shade);
        const bb = Math.round((tone < 0.15 ? 50 : 54) * shade);
        g.fillStyle = `rgb(${rr},${gg},${bb})`;
        g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        // Desconchones y brillo del borde superior.
        if (r() < 0.2) {
          g.fillStyle = "rgba(20,12,10,0.5)";
          g.fillRect(x + 2 + r() * (bw - 12), y + 2 + r() * (bh - 8), 3 + r() * 8, 2 + r() * 4);
        }
        g.fillStyle = "rgba(255,200,170,0.07)";
        g.fillRect(x + 1.5, y + 1.5, bw - 3, 1.5);
      }
    }
    blobs(g, r, 14, "rgba(14,10,8,0.35)", 20, 90);
    drips(g, r, 22, "10,8,6", 260);
    // Musgo y salitre abajo.
    const moss = g.createLinearGradient(0, S * 0.75, 0, S);
    moss.addColorStop(0, "rgba(40,60,30,0)");
    moss.addColorStop(1, "rgba(40,60,30,0.32)");
    g.fillStyle = moss;
    g.fillRect(0, S * 0.75, S, S * 0.25);
    noise(g, r, 0.22);
    return finish(c);
  },
  metal: () => {
    const r = seeded(41);
    const { c, g } = makeCanvas();
    g.fillStyle = "#4c5159";
    g.fillRect(0, 0, S, S);
    // Chapa ondulada: costillas verticales con luz y sombra.
    const rib = 32;
    for (let x = 0; x < S; x += rib) {
      const grad = g.createLinearGradient(x, 0, x + rib, 0);
      grad.addColorStop(0, "rgba(0,0,0,0.32)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.14)");
      grad.addColorStop(0.65, "rgba(255,255,255,0.04)");
      grad.addColorStop(1, "rgba(0,0,0,0.32)");
      g.fillStyle = grad;
      g.fillRect(x, 0, rib, S);
    }
    for (let i = 0; i < 130; i++) {
      g.strokeStyle = `rgba(${120 + r() * 70},${60 + r() * 40},${30 + r() * 24},${0.05 + r() * 0.2})`;
      g.lineWidth = 0.6 + r() * 3.2;
      const y = r() * S;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(S, y + (r() - 0.5) * 14);
      g.stroke();
    }
    drips(g, r, 30, "140,70,30", 300);
    blobs(g, r, 16, "rgba(110,52,22,0.35)", 14, 70);
    // Remaches en las juntas.
    for (let y = 40; y < S; y += 128) {
      for (let x = 16; x < S; x += 64) {
        g.fillStyle = "rgba(20,22,26,0.85)";
        g.beginPath();
        g.arc(x, y, 3.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.beginPath();
        g.arc(x - 0.8, y - 0.8, 1.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    noise(g, r, 0.18);
    return finish(c);
  },
  wood: () => {
    const r = seeded(53);
    const { c, g } = makeCanvas();
    g.fillStyle = "#5e4126";
    g.fillRect(0, 0, S, S);
    const plank = 86;
    for (let x = 0; x < S; x += plank) {
      const shade = 0.7 + r() * 0.5;
      g.fillStyle = `rgb(${Math.round(110 * shade)},${Math.round(76 * shade)},${Math.round(46 * shade)})`;
      g.fillRect(x + 1, 0, plank - 2, S);
      // Betas.
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(${30 + r() * 40},${18 + r() * 24},${8 + r() * 14},${0.15 + r() * 0.3})`;
        g.lineWidth = 0.7 + r() * 2.2;
        const xx = x + 4 + r() * (plank - 8);
        g.beginPath();
        g.moveTo(xx, 0);
        for (let y = 0; y <= S; y += 32) g.lineTo(xx + Math.sin(y * 0.03 + i) * 3, y);
        g.stroke();
      }
      // Nudo.
      if (r() < 0.6) {
        const ky = r() * S;
        g.fillStyle = "rgba(30,18,8,0.65)";
        g.beginPath();
        g.ellipse(x + plank / 2, ky, 6 + r() * 5, 10 + r() * 8, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(x, 0, 2, S);
      // Clavos.
      for (const ny of [30, S - 30]) {
        g.fillStyle = "rgba(30,30,34,0.9)";
        g.beginPath();
        g.arc(x + plank / 2, ny, 2.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    blobs(g, r, 12, "rgba(20,12,6,0.3)", 18, 70);
    noise(g, r, 0.2);
    return finish(c);
  },
  tile: () => {
    const r = seeded(67);
    const { c, g } = makeCanvas();
    g.fillStyle = "#2b2d2c";
    g.fillRect(0, 0, S, S);
    const t = S / 4;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const dark = (i + j) % 2 === 0;
        const v = (dark ? 112 : 150) * (0.88 + r() * 0.24);
        g.fillStyle = `rgb(${v},${v + 2},${v - 4})`;
        g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      }
    }
    blobs(g, r, 18, "rgba(50,38,28,0.34)", 14, 70);
    // Sangre seca en las juntas.
    blobs(g, r, 5, "rgba(80,10,10,0.42)", 16, 50);
    cracks(g, r, 8, 1);
    noise(g, r, 0.18);
    return finish(c);
  },
  grass: () => {
    const r = seeded(101);
    const { c, g } = makeCanvas();
    g.fillStyle = "#3e4a28";
    g.fillRect(0, 0, S, S);
    blobs(g, r, 60, "rgba(86,96,44,0.45)", 20, 90);
    blobs(g, r, 40, "rgba(24,32,16,0.4)", 20, 80);
    blobs(g, r, 14, "rgba(96,76,44,0.45)", 12, 40); // calvas de tierra
    // Briznas.
    for (let i = 0; i < 2600; i++) {
      const x = r() * S;
      const y = r() * S;
      const l = 4 + r() * 8;
      g.strokeStyle = `rgba(${60 + r() * 60},${80 + r() * 60},${24 + r() * 30},${0.25 + r() * 0.45})`;
      g.lineWidth = 0.8 + r() * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 4, y - l);
      g.stroke();
    }
    blobs(g, r, 4, "rgba(80,10,10,0.28)", 14, 40);
    noise(g, r, 0.2);
    return finish(c);
  },
  dirt: () => {
    const r = seeded(103);
    const { c, g } = makeCanvas();
    g.fillStyle = "#5a4630";
    g.fillRect(0, 0, S, S);
    blobs(g, r, 50, "rgba(120,92,58,0.4)", 20, 100);
    blobs(g, r, 40, "rgba(34,24,16,0.45)", 16, 80);
    // Huellas de rueda y piedrecitas.
    for (const x of [S * 0.3, S * 0.7]) {
      g.fillStyle = "rgba(24,16,10,0.4)";
      g.fillRect(x - 12, 0, 24, S);
    }
    for (let i = 0; i < 380; i++) {
      const v = 100 + r() * 80;
      g.fillStyle = `rgba(${v},${v - 10},${v - 26},${0.3 + r() * 0.4})`;
      g.beginPath();
      g.arc(r() * S, r() * S, 0.8 + r() * 2.6, 0, Math.PI * 2);
      g.fill();
    }
    cracks(g, r, 5, 0.8);
    noise(g, r, 0.24);
    return finish(c);
  },
  barn: () => {
    const r = seeded(107);
    const { c, g } = makeCanvas();
    boards(g, r, [128, 36, 28], 12, "rgba(220,214,200,0.9)");
    blobs(g, r, 30, "rgba(30,16,10,0.34)", 20, 90);
    drips(g, r, 18, "20,10,6", 240);
    cracks(g, r, 4, 0.6);
    noise(g, r, 0.2);
    return finish(c);
  },
  siding: () => {
    const r = seeded(109);
    const { c, g } = makeCanvas();
    boards(g, r, [176, 170, 156], 14, "rgba(90,84,74,0.9)");
    blobs(g, r, 26, "rgba(60,54,40,0.3)", 20, 90);
    drips(g, r, 22, "40,34,22", 260);
    // Salpicaduras de sangre seca.
    blobs(g, r, 5, "rgba(86,10,10,0.42)", 10, 40);
    noise(g, r, 0.2);
    return finish(c);
  },
  plaster: () => {
    const r = seeded(113);
    const { c, g } = makeCanvas();
    g.fillStyle = "#a79c86";
    g.fillRect(0, 0, S, S);
    blobs(g, r, 40, "rgba(190,178,150,0.4)", 30, 110);
    blobs(g, r, 30, "rgba(70,60,44,0.3)", 20, 80);
    // Desconchones que dejan ver el ladrillo.
    for (let i = 0; i < 5; i++) {
      const x = r() * S;
      const y = r() * S;
      g.fillStyle = "rgba(86,64,52,0.7)";
      g.beginPath();
      g.ellipse(x, y, 10 + r() * 26, 8 + r() * 18, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    drips(g, r, 24, "30,24,16", 260);
    cracks(g, r, 8, 1.2);
    noise(g, r, 0.22);
    return finish(c);
  },
  cobble: () => {
    const r = seeded(127);
    const { c, g } = makeCanvas();
    g.fillStyle = "#26231f";
    g.fillRect(0, 0, S, S);
    const t = 42;
    for (let row = 0; row * t < S + t; row++) {
      for (let col = -1; col * t < S + t; col++) {
        const x = col * t + (row % 2 ? t / 2 : 0) + (r() - 0.5) * 4;
        const y = row * t + (r() - 0.5) * 4;
        const v = 84 + r() * 54;
        g.fillStyle = `rgb(${v},${v - 2},${v - 8})`;
        g.beginPath();
        g.ellipse(x + t / 2, y + t / 2, t / 2 - 3, t / 2 - 4, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.07)";
        g.fillRect(x + 8, y + 7, t - 18, 2);
      }
    }
    blobs(g, r, 14, "rgba(18,16,12,0.45)", 20, 70);
    blobs(g, r, 5, "rgba(80,10,10,0.3)", 12, 40);
    noise(g, r, 0.2);
    return finish(c);
  },
  rust: () => {
    const r = seeded(79);
    const { c, g } = makeCanvas();
    g.fillStyle = "#58463b";
    g.fillRect(0, 0, S, S);
    blobs(g, r, 70, "rgba(150,78,30,0.42)", 10, 60);
    blobs(g, r, 30, "rgba(28,18,12,0.5)", 8, 50);
    drips(g, r, 26, "150,74,26", 260);
    // Costuras de chapa.
    for (let y = 0; y < S; y += 170) {
      g.fillStyle = "rgba(10,10,12,0.5)";
      g.fillRect(0, y, S, 3);
    }
    noise(g, r, 0.24);
    return finish(c);
  },
};

/** Tablas pintadas en horizontal (granero rojo, casa blanca): las juntas, la pintura desconchada y la veta. */
function boards(g: G, r: R, base: [number, number, number], count: number, trim: string): void {
  const h = S / count;
  for (let i = 0; i < count; i++) {
    const k = 0.82 + r() * 0.3;
    g.fillStyle = `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
    g.fillRect(0, i * h, S, h);
    // Veta de la madera.
    for (let j = 0; j < 6; j++) {
      g.strokeStyle = `rgba(20,12,8,${0.05 + r() * 0.12})`;
      g.lineWidth = 0.6 + r();
      const y = i * h + 2 + r() * (h - 4);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(S, y + (r() - 0.5) * 3);
      g.stroke();
    }
    g.fillStyle = "rgba(10,6,4,0.7)";
    g.fillRect(0, i * h, S, 2.2);
    g.fillStyle = "rgba(255,255,255,0.07)";
    g.fillRect(0, i * h + 2.2, S, 1.2);
  }
  // Remates verticales de las tablas en alternancia.
  g.fillStyle = trim;
  for (let x = 0; x < S; x += S / 2) g.fillRect(x, 0, 4, S);
}

export type TextureName = keyof typeof build;

/** Textura compartida (se crea una vez por nombre). */
export function texture(name: TextureName): THREE.Texture {
  const hit = cache.get(name);
  if (hit) return hit;
  const tex = build[name]();
  cache.set(name, tex);
  return tex;
}

export function disposeTextures(): void {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}
