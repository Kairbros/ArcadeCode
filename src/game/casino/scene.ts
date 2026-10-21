// Escena 3D del casino (Three.js): la sala con sus mesas, los crupiers, los muñecos de los jugadores y las
// animaciones de cada juego. Todo con cajas grandes y simples (estilo del hub), cámara en tercera persona.
import * as THREE from "three";
import { PLAYER_COLORS } from "../core/config";
import { disposeScene, glowSprite, glRenderer, projectTo, renderInto } from "../core/three";
import { BANANA_MAX, CH, CW, DROP_MAX, EMOTES, EYE_H, ITEM_COST, NPC_LURED, NPC_OFF, RUN_FOV, VAULT_CD, WALK_FOV, GUARD_FOV, GUARD_SIGHT, HOT_BOOST, NPC_CHASE, NPC_DISTRACTED, HEAD_BOB, PH_BET, PH_PAY, PH_SPIN, SLOT_BAT, SLOT_HAND, SPIN_TIME } from "./config";
import {
  ATRIUM, BATH, croupierSpot, HALL, JAIL, JAIL_LEVER, JAIL_SWITCH, JAIL_TRASH, LEVER, LITTER, LURE, MANNEQUINS, onStair, PILLARS, ROUTES, SEQ_X, SEQ_Z,
  STAIRS, tablePoint, TABLES, UPPER_Y, VAULT, VAULT_PADS, WINDOW, ZONES, type TableDef,
} from "./world3d";
import { DRUNK_POOL, roundDef } from "./balance";
import { DR_ASLEEP, DR_GONE, DR_GROGGY, DR_SIT } from "./drunk";
import { WIN_BLOCKED, WIN_CLOSED } from "./ventanilla";
import { PLINKO_MULT, RED_NUMBERS, SLOT_SYMBOLS, type CasinoSnap, type TableSnap } from "./table";

/** Todo lo que necesita la escena para dibujar un fotograma. */
export interface SceneView {
  s: CasinoSnap;
  /** Jugador propio. */
  me: number;
  /** Mesa en la que estoy sentado (-1 = de pie). */
  myTable: number;
  /** Mesa a la que apunto (para resaltar su neón). */
  near: number;
  time: number;
  /** Ranura elegida (0 monedas, 1 mano, 2 bate): decide qué se ve en la mano. */
  slot: number;
  /** Segundos del golpe en curso (animación del bate en primera persona). */
  swing: number;
  /** Basura que llevo en la mano (índice de la de la celda) o -1. */
  trashTaken: number;
  /** Cabeceo de la vista (rad; + arriba). Lo mueve el ratón y no viaja por la red. */
  pitch: number;
  /** Corre ahora mismo (la cámara abre el campo de visión). */
  running: boolean;
  /** Altura de mi salto (la cámara sube con él). */
  jumpY: number;
  /** Mi piso (la cámara va a su altura). */
  level: number;
  /** Llevo basura en la mano (se ve en primera persona y, al soltarla, sale volando). */
  carry: boolean;
}

interface Character {
  root: THREE.Group;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  head: THREE.Object3D;
  /** Bate que lleva en la mano derecha (los crupiers no). */
  bat: THREE.Object3D | null;
  /** Móvil del crupier (solo se ve mientras está distraído). */
  phone: THREE.Object3D | null;
  /** Basura en la mano derecha (cuando la lleva). */
  held: THREE.Object3D | null;
  /** Sombrero (se quita al ponerse la peluca) y piezas de los tres disfraces (bigote, peluca, gafas). */
  hat: THREE.Object3D | null;
  looks: THREE.Group[];
  stride: number;
  /** Última posición (para saber cuánto se ha andado). */
  lastX: number;
  lastZ: number;
}

interface TableRig {
  def: TableDef;
  group: THREE.Group;
  /** Pieza que se anima en cada juego. */
  spin: THREE.Object3D | null;
  /** Moneda: grupo que sube y baja en el lanzamiento. */
  coin: THREE.Object3D | null;
  ball: THREE.Mesh | null;
  reels: THREE.Mesh[];
  /** Material del rodillo (se le cambia el mapa con el símbolo que toca). */
  reelMats: THREE.MeshLambertMaterial[];
  /** Dados: grupo que bota y malla que rueda. */
  dice: THREE.Group[];
  label: CanvasLabel;
  croupier: Character;
  glow: THREE.MeshBasicMaterial | null;
  /** Halo del cartel de neón (parpadea). */
  signGlow: THREE.Sprite;
  /** Cartel de la mesa (se oculta al sentarse en las mesas con mueble alto, que lo taparían). */
  sign: THREE.Mesh;
  tallSign: boolean;
  /** Halo sobre la pieza del juego (se enciende al girar y al pagar). */
  pieceGlow: THREE.Sprite | null;
  /** Materiales que lucen al ganar (línea de pago, bocas, aros). */
  lit: THREE.MeshBasicMaterial[];
  /** Aura de fuego de la mesa caliente (late mientras lo es). */
  hotGlow: THREE.Sprite;
  /** Carrera de patos: los cuatro patos (vacío en las demás mesas). */
  ducks: THREE.Object3D[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Color 0xRRGGBB a partir de sus componentes. */
const rgb = (c: readonly [number, number, number]) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);

/** Textura de un cartel que se actualiza solo cuando cambia el texto. */
class CanvasLabel {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private last = "";

  constructor(private w = 256, private h = 64) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    this.ctx = c.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
  }

  set(text: string, color: string) {
    if (text === this.last) return;
    this.last = text;
    const g = this.ctx;
    const { w, h } = this;
    g.clearRect(0, 0, w, h);
    // Cartel de feria: tablero burdeos redondeado con filo crema y letra gorda con contorno.
    const r = Math.min(16, h / 3);
    const board = (inset: number) => {
      g.beginPath();
      g.roundRect(inset, inset, w - inset * 2, h - inset * 2, Math.max(2, r - inset));
    };
    board(1);
    g.fillStyle = "#2a0e1c";
    g.fill();
    board(4);
    g.fillStyle = "#5a1a34";
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "#ffe2a8";
    g.stroke();
    // Bombillas en las esquinas (el toque de marquesina).
    g.fillStyle = "#fff2c8";
    for (const [x, y] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    const font = (s: number) => `900 ${s}px "Arial Black", "Segoe UI Black", Impact, sans-serif`;
    // Carteles largos («CARA O CRUZ · CRUZ»): se reduce la letra en vez de salirse del cartel.
    let size = Math.round(h * 0.5);
    g.font = font(size);
    while (size > 12 && g.measureText(text).width > w - 30) {
      size -= 2;
      g.font = font(size);
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = Math.max(4, size * 0.22);
    g.strokeStyle = "#2a0e1c";
    g.fillStyle = "#2a0e1c";
    g.fillText(text, w / 2 + 2, h / 2 + 4);
    g.strokeText(text, w / 2, h / 2 + 2);
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2);
    this.texture.needsUpdate = true;
  }
}

/** Aleatorio con semilla: los estampados salen igual en todos los equipos. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Lienzo envuelto en textura que se repite. */
function tiledTexture(size: number, rx: number, ry: number, draw: (g: CanvasRenderingContext2D, n: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Alfombra de casino de dibujo animado: azul noche con cartas, dados rosas, fichas y confeti tirados por
 * el suelo. Cada pieza se dibuja también desplazada un lienzo para que el mosaico no deje costuras.
 */
function carpetTexture(base = "#141a3c"): THREE.CanvasTexture {
  return tiledTexture(256, 6, 5, (g, n) => {
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    const rnd = seeded(7);
    const wrap = (x: number, y: number, piece: () => void) => {
      for (const dx of [-n, 0, n]) {
        for (const dy of [-n, 0, n]) {
          g.save();
          g.translate(x + dx, y + dy);
          piece();
          g.restore();
        }
      }
    };
    // Confeti.
    const confetti = ["#3fd8e8", "#ff4f9a", "#ffd14a", "#7a6cff"];
    for (let i = 0; i < 70; i++) {
      g.fillStyle = confetti[i % confetti.length];
      const x = rnd() * n, y = rnd() * n, a = rnd() * Math.PI;
      wrap(x, y, () => {
        g.rotate(a);
        g.fillRect(-2, -2, 5, 5);
      });
    }
    // Cartas, dados y fichas, en ese orden para que alguna ficha caiga encima de una carta.
    const kinds = ["carta", "dado", "ficha", "carta", "ficha", "dado", "carta", "ficha", "dado", "ficha"];
    kinds.forEach((kind, i) => {
      const x = ((i % 5) + 0.15 + rnd() * 0.7) * (n / 5);
      const y = (Math.floor(i / 5) * 0.5 + 0.08 + rnd() * 0.34) * n;
      const a = rnd() * Math.PI * 2;
      wrap(x, y, () => {
        g.rotate(a);
        if (kind === "carta") {
          g.fillStyle = "#e9f1ff";
          g.beginPath();
          g.roundRect(-14, -19, 28, 38, 4);
          g.fill();
          g.strokeStyle = "#141a3c";
          g.lineWidth = 1.5;
          g.strokeRect(-10, -15, 20, 30);
          g.fillStyle = i % 2 ? "#e83e54" : "#141a3c";
          g.beginPath();
          g.moveTo(0, -7);
          g.lineTo(6, 0);
          g.lineTo(0, 7);
          g.lineTo(-6, 0);
          g.fill();
        } else if (kind === "dado") {
          g.fillStyle = "#b8124e";
          g.fillRect(-11, -11, 26, 26);
          g.fillStyle = "#ff3f86";
          g.fillRect(-14, -14, 26, 26);
          g.fillStyle = "#2a0e1c";
          for (const [px, py] of [[-7, -7], [0, 0], [6, 6]]) {
            g.beginPath();
            g.arc(px - 1, py - 1, 2.4, 0, Math.PI * 2);
            g.fill();
          }
        } else {
          const col = ["#3fd8e8", "#ff4f9a", "#4a6cff"][i % 3];
          g.fillStyle = col;
          g.beginPath();
          g.arc(0, 0, 13, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = "#ffffff";
          g.lineWidth = 3;
          g.setLineDash([4, 4]);
          g.beginPath();
          g.arc(0, 0, 11, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = "rgba(255,255,255,0.35)";
          g.beginPath();
          g.arc(0, 0, 6, 0, Math.PI * 2);
          g.fill();
        }
      });
    });
  });
}

/**
 * Estampados de cada zona temática (suelos y paredes), en lienzos de 128 px que se repiten cada
 * `tile` metros: tablas del bar tropical, rejilla de neón, mármol, parquet, baldosa rosa, terciopelo…
 */
function patternTexture(kind: string, w: number, h: number, tile = 4): THREE.CanvasTexture {
  if (kind === "alfombra" || kind === "alfombra2") {
    const t = carpetTexture(kind === "alfombra" ? "#141a3c" : "#2a1438");
    t.repeat.set(w / 5.6, h / 5.6);
    return t;
  }
  if (kind === "zigzag") {
    const t = wallpaperTexture();
    t.repeat.set(w / 2.8, h / 2.5);
    return t;
  }
  const rnd = seeded(kind.length * 97);
  return tiledTexture(128, w / tile, h / tile, (g, n) => {
    const q = n / 4;
    if (kind === "tablas") {
      // Tablas de madera tostada, con juntas y vetas.
      for (let r = 0; r < 8; r++) {
        g.fillStyle = ["#8a5232", "#9a6038", "#7a462a", "#a86a3e"][r % 4];
        g.fillRect(0, r * 16, n, 16);
        g.fillStyle = "rgba(40,20,10,0.6)";
        g.fillRect(0, r * 16 + 15, n, 1);
        g.fillRect(((r * 37) % n), r * 16, 1, 16);
      }
    } else if (kind === "neon") {
      // Suelo negro con rejilla de neón rosa y turquesa.
      g.fillStyle = "#0c0a18";
      g.fillRect(0, 0, n, n);
      g.strokeStyle = "#ff3f9a";
      g.lineWidth = 2;
      g.strokeRect(1, 1, n - 2, n - 2);
      g.strokeStyle = "#3fd8e8";
      g.beginPath();
      g.moveTo(n / 2, 0);
      g.lineTo(n / 2, n);
      g.moveTo(0, n / 2);
      g.lineTo(n, n / 2);
      g.stroke();
    } else if (kind === "marmol") {
      // Damero de mármol crema y negro, con vetas.
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        g.fillStyle = (x + y) % 2 ? "#2a2430" : "#efe6d8";
        g.fillRect(x * n / 2, y * n / 2, n / 2, n / 2);
      }
      g.strokeStyle = "rgba(150,140,160,0.45)";
      g.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(rnd() * n, rnd() * n);
        g.bezierCurveTo(rnd() * n, rnd() * n, rnd() * n, rnd() * n, rnd() * n, rnd() * n);
        g.stroke();
      }
    } else if (kind === "parquet") {
      // Parquet en espiga claro.
      g.fillStyle = "#c89a62";
      g.fillRect(0, 0, n, n);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = (x + y) % 2 ? "#d8ab70" : "#b8884e";
        if ((x + y) % 2) g.fillRect(x * q + 2, y * q + 2, q - 4, q / 2 - 3);
        else g.fillRect(x * q + 2, y * q + 2, q / 2 - 3, q - 4);
      }
    } else if (kind === "rosa") {
      // Baldosa rosa y lila de boutique.
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = (x + y) % 2 ? "#f2a8c8" : "#c8a0e8";
        g.fillRect(x * q, y * q, q, q);
      }
      g.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 4; i++) g.fillRect(i * q + q / 2 - 1, 0, 2, n);
    } else if (kind === "terciopelo") {
      // Terciopelo rojo con rombos dorados.
      g.fillStyle = "#6a0e22";
      g.fillRect(0, 0, n, n);
      g.strokeStyle = "#e0a848";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(n / 2, 4);
      g.lineTo(n - 4, n / 2);
      g.lineTo(n / 2, n - 4);
      g.lineTo(4, n / 2);
      g.closePath();
      g.stroke();
      g.fillStyle = "#e0a848";
      g.fillRect(n / 2 - 3, n / 2 - 3, 6, 6);
    } else if (kind === "bambu") {
      // Cañas de bambú verticales con sus nudos.
      for (let i = 0; i < 6; i++) {
        g.fillStyle = ["#6a8a3a", "#7a9a42", "#5a7a32"][i % 3];
        g.fillRect(i * (n / 6), 0, n / 6 - 2, n);
        g.fillStyle = "#3a5020";
        g.fillRect(i * (n / 6), ((i * 29) % n), n / 6 - 2, 4);
        g.fillRect(i * (n / 6), ((i * 29 + 64) % n), n / 6 - 2, 4);
      }
    } else if (kind === "noche") {
      // Pared azul noche con líneas de neón.
      g.fillStyle = "#141432";
      g.fillRect(0, 0, n, n);
      g.fillStyle = "#ff3f9a";
      g.fillRect(0, n * 0.3, n, 3);
      g.fillStyle = "#3fd8e8";
      g.fillRect(0, n * 0.7, n, 3);
    } else {
      // «galeria»: pared crema con rayas finas.
      g.fillStyle = "#efe2c8";
      g.fillRect(0, 0, n, n);
      g.fillStyle = "#e0cfa8";
      for (let i = 0; i < 8; i++) g.fillRect(i * (n / 8), 0, 3, n);
    }
  });
}

/** Cuadro abstracto de la galería (formas de colores con semilla, uno distinto por marco). */
function drawPainting(g: CanvasRenderingContext2D, w: number, h: number, k: number) {
  const rnd = seeded(31 + k * 7);
  const palette = ["#ff3f86", "#3fd8e8", "#ffd14a", "#7a6cff", "#2ebd6c", "#ff8a24"];
  g.fillStyle = ["#f2e6d0", "#1a1432", "#fff4e0", "#2a0e1c", "#e8f0ff"][k % 5];
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) {
    g.fillStyle = palette[(i + k) % palette.length];
    const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 26;
    g.beginPath();
    if (i % 2) g.arc(x, y, r, 0, Math.PI * 2);
    else g.rect(x - r, y - r * 0.6, r * 2, r * 1.2);
    g.fill();
  }
}

/** Tema de cada zona: estampado del suelo y de la pared. */
const THEMES: Record<string, { floor: string; wall: string }> = {
  "SALÓN REAL": { floor: "alfombra", wall: "zigzag" },
  "BAR TROPICAL": { floor: "tablas", wall: "bambu" },
  "ZONA NEÓN": { floor: "neon", wall: "noche" },
  "SALA DE MÁQUINAS": { floor: "alfombra2", wall: "zigzag" },
  "VESTÍBULO": { floor: "marmol", wall: "galeria" },
  "GALERÍA": { floor: "parquet", wall: "galeria" },
  "BOUTIQUE": { floor: "rosa", wall: "rosa" },
  "SALA VIP": { floor: "terciopelo", wall: "terciopelo" },
  "MIRADOR": { floor: "marmol", wall: "zigzag" },
};

/** Papel pintado en zigzag dorado y ciruela (como los salones de la torre del casino). */
function wallpaperTexture(): THREE.CanvasTexture {
  return tiledTexture(128, 12, 3, (g, n) => {
    g.fillStyle = "#3a1636";
    g.fillRect(0, 0, n, n);
    const bands = ["#c88a2e", "#6a2448", "#e0a848", "#4a1a40"];
    const step = n / 8;
    for (let b = 0; b < 8; b++) {
      g.strokeStyle = bands[b % bands.length];
      g.lineWidth = step * 0.42;
      g.beginPath();
      for (let x = 0; x <= n; x += step) {
        const y = b * step + ((x / step) % 2 === 0 ? 0 : step * 0.5);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

/** Cartel de neón dibujado (corona, dólar o palmera): trazo de color con halo, sobre fondo transparente. */
function drawNeon(g: CanvasRenderingContext2D, w: number, h: number, kind: string, color: string) {
  g.clearRect(0, 0, w, h);
  g.lineCap = g.lineJoin = "round";
  const path = () => {
    g.beginPath();
    if (kind === "corona") {
      g.moveTo(w * 0.15, h * 0.75);
      g.lineTo(w * 0.1, h * 0.3);
      g.lineTo(w * 0.32, h * 0.52);
      g.lineTo(w * 0.5, h * 0.18);
      g.lineTo(w * 0.68, h * 0.52);
      g.lineTo(w * 0.9, h * 0.3);
      g.lineTo(w * 0.85, h * 0.75);
      g.closePath();
      g.moveTo(w * 0.2, h * 0.86);
      g.lineTo(w * 0.8, h * 0.86);
    } else if (kind === "dolar") {
      g.moveTo(w * 0.68, h * 0.28);
      g.bezierCurveTo(w * 0.6, h * 0.16, w * 0.3, h * 0.16, w * 0.32, h * 0.36);
      g.bezierCurveTo(w * 0.34, h * 0.52, w * 0.68, h * 0.46, w * 0.68, h * 0.64);
      g.bezierCurveTo(w * 0.68, h * 0.84, w * 0.36, h * 0.84, w * 0.3, h * 0.72);
      g.moveTo(w * 0.5, h * 0.08);
      g.lineTo(w * 0.5, h * 0.92);
    } else {
      // Palmera: tronco curvo y cinco hojas.
      g.moveTo(w * 0.5, h * 0.95);
      g.quadraticCurveTo(w * 0.42, h * 0.6, w * 0.52, h * 0.32);
      for (const [ex, ey] of [[0.12, 0.42], [0.25, 0.18], [0.55, 0.08], [0.82, 0.2], [0.9, 0.46]]) {
        g.moveTo(w * 0.52, h * 0.32);
        g.quadraticCurveTo(w * (0.52 + ex) / 2, h * 0.1, w * ex, h * ey);
      }
    }
  };
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.lineWidth = w * 0.06;
  path();
  g.stroke();
  // Núcleo claro del tubo.
  g.shadowBlur = 0;
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = w * 0.022;
  path();
  g.stroke();
}

// --- Texturas dibujadas -------------------------------------------------------------------
// Caras de dados, moneda, símbolos de la tragaperras, rueda y bocas del plinko se dibujan en un
// lienzo una sola vez por clave y se liberan con la escena. Con texturas las piezas se leen desde
// lejos; con cajas lisas no hay manera de saber qué ha salido.

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** Puntos de cada cara del dado, en coordenadas 0..1 de la cara. */
const DIE_PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.26, 0.26], [0.74, 0.26], [0.26, 0.5], [0.74, 0.5], [0.26, 0.74], [0.74, 0.74]],
};

/** Cara de un dado: marfil con marco y los puntos grabados (con su brillo). */
function drawDieFace(g: CanvasRenderingContext2D, w: number, h: number, v: number) {
  g.fillStyle = "#f7f2e6";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "#cdc3aa";
  g.lineWidth = w * 0.05;
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
  const r = w * 0.085;
  for (const [px, py] of DIE_PIPS[v]) {
    g.fillStyle = "#12131c";
    g.beginPath();
    g.arc(px * w, py * h, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(150,170,215,0.55)";
    g.beginPath();
    g.arc(px * w - r * 0.3, py * h - r * 0.3, r * 0.3, 0, Math.PI * 2);
    g.fill();
  }
}

/** Cara de la moneda: oro con un sol sonriente (CARA) o un aspa (CRUZ), y su nombre grabado. */
function drawCoinFace(g: CanvasRenderingContext2D, w: number, h: number, cruz: boolean) {
  const cx = w / 2, cy = h / 2, r = w * 0.47;
  const gold = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.06, cx, cy, r);
  gold.addColorStop(0, "#fff8cc");
  gold.addColorStop(0.45, "#f3c74a");
  gold.addColorStop(0.82, "#c08a18");
  gold.addColorStop(1, "#8a5c10");
  g.fillStyle = gold;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(96,62,10,0.9)";
  g.lineWidth = w * 0.03;
  g.beginPath();
  g.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "rgba(255,248,206,0.8)";
  g.lineWidth = w * 0.012;
  g.beginPath();
  g.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  g.stroke();
  if (cruz) {
    // Aspa: primero la sombra hundida y encima el brillo.
    g.lineCap = "round";
    for (const [color, lw, k] of [["#7a5410", 0.09, 1], ["#ffeaa4", 0.035, 0.92]] as const) {
      g.strokeStyle = color;
      g.lineWidth = w * lw;
      g.beginPath();
      g.moveTo(cx - r * 0.34 * k, cy - r * 0.34 * k);
      g.lineTo(cx + r * 0.34 * k, cy + r * 0.34 * k);
      g.moveTo(cx + r * 0.34 * k, cy - r * 0.34 * k);
      g.lineTo(cx - r * 0.34 * k, cy + r * 0.34 * k);
      g.stroke();
    }
  } else {
    g.fillStyle = "#8a6010";
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(cx + s * r * 0.19, cy - r * 0.2, r * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "#8a6010";
    g.lineWidth = w * 0.026;
    g.beginPath();
    g.arc(cx, cy - r * 0.02, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    // Rayos del sol alrededor de la cara.
    g.strokeStyle = "rgba(122,84,16,0.85)";
    g.lineWidth = w * 0.02;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5);
      g.lineTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
      g.stroke();
    }
  }
  g.fillStyle = "#6d4a08";
  g.font = `bold ${Math.round(w * 0.1)}px monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(cruz ? "CRUZ" : "CARA", cx, cy + r * 0.62);
}

/** Símbolo de la tragaperras (0..5), grande y con formas simples. */
function drawSlotSymbol(g: CanvasRenderingContext2D, w: number, h: number, i: number) {
  g.fillStyle = "#f8f4e8";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "#dcd4be";
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, w - 3, h - 3);
  const cx = w / 2, cy = h / 2, s = Math.min(w, h * 0.72) * 0.34;
  if (i === 0) {
    // CEREZA: dos cerezas y el rabo.
    g.strokeStyle = "#3f8f3a";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx - s * 0.5, cy + s * 0.25);
    g.quadraticCurveTo(cx + s * 0.1, cy - s * 1.05, cx + s * 0.9, cy - s * 1.15);
    g.stroke();
    for (const [dx, dy] of [[-0.55, 0.6], [0.5, 0.72]] as const) {
      g.fillStyle = "#d6243c";
      g.beginPath();
      g.arc(cx + dx * s, cy + dy * s, s * 0.46, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.beginPath();
      g.arc(cx + dx * s - s * 0.14, cy + dy * s - s * 0.16, s * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  } else if (i === 1) {
    // LIMÓN con su hoja.
    g.fillStyle = "#f5c518";
    g.beginPath();
    g.ellipse(cx, cy + s * 0.12, s * 0.82, s * 0.66, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fdf3a8";
    g.beginPath();
    g.ellipse(cx - s * 0.22, cy - s * 0.05, s * 0.3, s * 0.2, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#4f9a3c";
    g.beginPath();
    g.ellipse(cx + s * 0.5, cy - s * 0.72, s * 0.42, s * 0.19, -0.5, 0, Math.PI * 2);
    g.fill();
  } else if (i === 2) {
    // CAMPANA.
    g.fillStyle = "#e8b52c";
    g.beginPath();
    g.moveTo(cx - s * 0.8, cy + s * 0.5);
    g.quadraticCurveTo(cx - s * 0.2, cy + s * 0.2, cx - s * 0.48, cy - s * 0.72);
    g.quadraticCurveTo(cx, cy - s * 1.12, cx + s * 0.48, cy - s * 0.72);
    g.quadraticCurveTo(cx + s * 0.2, cy + s * 0.2, cx + s * 0.8, cy + s * 0.5);
    g.closePath();
    g.fill();
    g.fillStyle = "#b8891a";
    g.fillRect(cx - s * 0.92, cy + s * 0.5, s * 1.84, s * 0.18);
    g.beginPath();
    g.arc(cx, cy + s * 0.78, s * 0.18, 0, Math.PI * 2);
    g.fill();
  } else if (i === 3) {
    // DIAMANTE.
    g.fillStyle = "#3ecfe8";
    g.beginPath();
    g.moveTo(cx, cy - s * 1.02);
    g.lineTo(cx + s * 0.82, cy - s * 0.1);
    g.lineTo(cx, cy + s * 0.98);
    g.lineTo(cx - s * 0.82, cy - s * 0.1);
    g.closePath();
    g.fill();
    g.fillStyle = "#c2f8ff";
    g.beginPath();
    g.moveTo(cx, cy - s * 1.02);
    g.lineTo(cx + s * 0.82, cy - s * 0.1);
    g.lineTo(cx, cy + s * 0.12);
    g.closePath();
    g.fill();
  } else if (i === 4) {
    // SIETE.
    g.fillStyle = "#e0253c";
    g.beginPath();
    g.moveTo(cx - s * 0.7, cy - s * 0.9);
    g.lineTo(cx + s * 0.82, cy - s * 0.9);
    g.lineTo(cx + s * 0.1, cy + s * 0.95);
    g.lineTo(cx - s * 0.34, cy + s * 0.95);
    g.lineTo(cx + s * 0.32, cy - s * 0.48);
    g.lineTo(cx - s * 0.72, cy - s * 0.48);
    g.closePath();
    g.fill();
  } else {
    // ESTRELLA.
    g.fillStyle = "#ffd23a";
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? s * 1.08 : s * 0.45;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = "#b8860b";
    g.lineWidth = 2;
    g.stroke();
  }
}

/**
 * Rueda de la ruleta vista desde arriba: 13 sectores (el 0 verde) con sus números y el aro de madera.
 * El lienzo se pega en un CircleGeometry, donde +X del mundo es +X del lienzo y −Z es «arriba».
 */
function drawWheel(g: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2, cy = h / 2, R = w / 2;
  const seg = (Math.PI * 2) / 13;
  // Aro de madera y pista de la bola.
  g.fillStyle = "#4a2a16";
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#c8a24a";
  g.lineWidth = R * 0.022;
  g.beginPath();
  g.arc(cx, cy, R * 0.97, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#22150c";
  g.beginPath();
  g.arc(cx, cy, R * 0.9, 0, Math.PI * 2);
  g.fill();
  // Sectores entre r = 0,32 y r = 0,86 del radio.
  for (let n = 0; n < 13; n++) {
    const a = (n + 0.5) * seg; // mundo: x = sin a, z = cos a → lienzo: θ = π/2 − a
    const th = Math.PI / 2 - a;
    g.beginPath();
    g.arc(cx, cy, R * 0.86, th - seg / 2, th + seg / 2);
    g.arc(cx, cy, R * 0.32, th + seg / 2, th - seg / 2, true);
    g.closePath();
    g.fillStyle = n === 0 ? "#2ebd6c" : RED_NUMBERS.has(n) ? "#c8182e" : "#191a22";
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.lineWidth = R * 0.008;
    g.stroke();
    // Número en el aro, con la «arriba» hacia el centro para que se lea desde el asiento.
    g.save();
    g.translate(cx + Math.cos(th) * R * 0.62, cy + Math.sin(th) * R * 0.62);
    g.rotate(th - Math.PI / 2);
    g.fillStyle = "#fff8e6";
    g.font = `bold ${Math.round(R * 0.19)}px monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), 0, 0);
    g.restore();
  }
  // Cono central.
  const hub = g.createRadialGradient(cx - R * 0.06, cy - R * 0.08, R * 0.02, cx, cy, R * 0.32);
  hub.addColorStop(0, "#ffe9a8");
  hub.addColorStop(1, "#a8761a");
  g.fillStyle = hub;
  g.beginPath();
  g.arc(cx, cy, R * 0.32, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#6b4a10";
  g.lineWidth = R * 0.014;
  g.stroke();
}

/** Cartelito del multiplicador de una boca del plinko. */
function drawBucketLabel(g: CanvasRenderingContext2D, w: number, h: number, text: string, top: boolean) {
  g.fillStyle = top ? "#ffce4a" : "#0e2830";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = top ? "#fff2c0" : "#35e0c8";
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, w - 3, h - 3);
  g.fillStyle = top ? "#20140a" : "#9cf8ec";
  g.font = `bold ${Math.round(h * 0.52)}px monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 1);
}

/** Giros que dejan cada cara del dado mirando al jugador (cubo: +X, −X, +Y, −Y, +Z, −Z). */
const FACE_ALIGN: Record<number, readonly [number, number]> = {
  1: [0, -Math.PI / 2],
  2: [Math.PI / 2, 0],
  3: [0, 0],
  4: [0, Math.PI],
  5: [-Math.PI / 2, 0],
  6: [0, Math.PI / 2],
};
/** La cara se inclina un poco hacia la cámara (que está por encima y delante de la mesa). */
const FACE_TILT = -0.26;
const restQuats = new Map<number, THREE.Quaternion>();

/** Giro de reposo que deja la cara `v` mirando al jugador. */
function dieRestQuat(v: number): THREE.Quaternion {
  let q = restQuats.get(v);
  if (!q) {
    const [ax, ay] = FACE_ALIGN[v] ?? [0, 0];
    q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ax, ay, 0, "YXZ"));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), FACE_TILT));
    restQuats.set(v, q);
  }
  return q;
}

export class CasinoStage {
  readonly scene = new THREE.Scene();

  readonly camera = new THREE.PerspectiveCamera(68, CW / CH, 0.1, 120);
  private readonly rigs: TableRig[] = [];
  private readonly people: Character[] = [];
  private readonly camPos = new THREE.Vector3(0, 3, 14);
  private readonly camAt = new THREE.Vector3(0, 1, 8);
  private readonly mat = new Map<string, THREE.Material>();
  /** Texturas dibujadas en lienzo (una por clave). */
  private readonly tex = new Map<string, THREE.CanvasTexture>();
  /** Caras de los dados: seis materiales que comparten los dos dados. */
  private diceMats: THREE.MeshLambertMaterial[] | null = null;
  /** Metros andados del jugador propio (vaivén de la cabeza). */
  private myStride = 0;
  /** Monedas del suelo: pool de mallas que se muestran u ocultan. */
  private readonly coinPool: THREE.Mesh[] = [];
  /** Lo que se ve en la mano (bate, mano o basura), colgado de la cámara. */
  private readonly view = { bat: null as THREE.Object3D | null, hand: null as THREE.Object3D | null, trash: null as THREE.Object3D | null };
  /** Basura repartida por la celda. */
  private readonly jailTrash: THREE.Mesh[] = [];
  /** Halos de la basura (se apagan al cogerla). */
  private readonly jailTrashGlow: THREE.Sprite[] = [];
  /** Basura lanzada (solo la ve quien la tira; es un adorno local). */
  private thrownMesh: THREE.Mesh | null = null;
  private thrownT = -1;
  private readonly thrownVel = new THREE.Vector3();
  private prevTrash = -1;
  private prevCarry = false;
  /**
   * Cámara de emote: 0 primera persona, 1 tercera persona girando alrededor de tu muñeco (para verte
   * bailar). Se mezcla poco a poco al entrar y al salir. `orbitA` es el ángulo de la vuelta.
   */
  private orbit = 0;
  private orbitA = 0;
  /** Basura del casino (latas y bolsas en su sitio de LITTER). */
  private readonly litter: THREE.Object3D[] = [];
  /** Jaula: sirena y halo de la caja de la fuga (laten al forzarla). */
  private jailSiren: THREE.Sprite | null = null;
  private switchGlow: THREE.Sprite | null = null;
  /** Bóveda: bisagra de la puerta, volante, los dos paneles del suelo y la luz de alarma. */
  private vaultHinge: THREE.Group | null = null;
  private vaultWheel: THREE.Group | null = null;
  private readonly vaultPads: THREE.MeshBasicMaterial[] = [];
  private vaultAlarm: THREE.Sprite | null = null;
  /** Luces «OCUPADO» de las dos cabinas del baño. */
  private readonly bathLamps: THREE.MeshBasicMaterial[] = [];
  /** Guardias (uno por ronda, en el orden de los NPC) y el cono de visión de cada uno pintado en el suelo. */
  private readonly guards: { c: Character; cone: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> }[] = [];
  /** Cáscaras de banana del suelo: pool de mallas. */
  private readonly bananaPool: THREE.Object3D[] = [];
  /** Ventanilla: reja que sube y baja, lámpara de estado y cartel con el estado. */
  private winShutter: THREE.Mesh | null = null;
  private winLamp: THREE.MeshBasicMaterial | null = null;
  private winGlow: THREE.Sprite | null = null;
  private readonly winLabel = new CanvasLabel(256, 64);
  /** Palanca de la reja (brazo y lámpara), timbre (botón y halo) y botones de la alarma. */
  private leverArm: THREE.Group | null = null;
  private leverLamp: THREE.MeshBasicMaterial | null = null;
  private lureBtn: THREE.MeshBasicMaterial | null = null;
  private lureGlow: THREE.Sprite | null = null;
  private readonly seqBtns: { mat: THREE.MeshBasicMaterial; label: CanvasLabel; color: number }[] = [];
  private seqAlarm: THREE.Sprite | null = null;
  /** Borrachos (la reserva del anfitrión). */
  private readonly drunks: Character[] = [];

  constructor() {
    const sc = this.scene;
    sc.background = new THREE.Color(0x1a0c24);
    sc.fog = new THREE.Fog(0x2a1238, 40, 110);
    // Luz: una principal desde arriba y un relleno cálido, sin sombras (todo es de cajas).
    const key = new THREE.DirectionalLight(0xfff0d0, 1.9);
    key.position.set(10, 30, 12);
    // Sombras suaves: dan profundidad al salón y a los muñecos (el renderer ya las tiene activadas).
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -34;
    key.shadow.camera.right = 34;
    key.shadow.camera.top = 34;
    key.shadow.camera.bottom = -34;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 80;
    key.shadow.bias = -0.0006;
    // Techo violeta y azul que baña la sala; el suelo devuelve un rebote cálido.
    const warm = new THREE.PointLight(0xff7a3a, 44, 34, 2);
    warm.position.set(0, 8, -8);
    const cool = new THREE.PointLight(0x7a5aff, 38, 34, 2);
    cool.position.set(0, 8, 8);
    sc.add(key, warm, cool, new THREE.HemisphereLight(0x8a70d8, 0x4a1a2a, 2.3));
    this.buildRoom();
    TABLES.forEach((def) => this.rigs.push(this.buildTable(def)));
    this.buildJail();
    this.buildWindow();
    this.buildMechanisms();
    this.buildViewModel();
    // Monedas del suelo (las tira un golpe): un pool de mallas que se enciende y apaga.
    for (let i = 0; i < DROP_MAX; i++) {
      const coin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.045, 16),
        this.paint(0xffce4a, { emissive: 0x4a2c08 }),
      );
      coin.visible = false;
      coin.add(glowSprite(0xffd070, 0.9, 0.75));
      // Columna de luz: en primera persona una moneda en el suelo casi no se ve, el haz la delata a distancia.
      const beam = glowSprite(0xffc040, 1, 0.35);
      beam.scale.set(0.45, 2.6, 1);
      beam.position.y = 1.2;
      coin.add(beam);
      this.scene.add(coin);
      this.coinPool.push(coin);
    }
    // Cáscaras de banana: media rosca amarilla con la punta oscura y un halo para verla en el suelo.
    for (let i = 0; i < BANANA_MAX; i++) {
      const peel = new THREE.Group();
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 14, Math.PI * 1.1), this.paint(0xffd84a, { emissive: 0x3a2a04 }));
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.06;
      peel.add(arc);
      this.put(peel, 0.05, 0.05, 0.08, 0x3a2a12, 0.2, 0.06, 0);
      peel.add(glowSprite(0xffe070, 0.9, 0.4));
      peel.visible = false;
      this.scene.add(peel);
      this.bananaPool.push(peel);
    }
    // Basura del casino: latas y bolsas en el suelo de cada piso, con un halo verde para verlas.
    LITTER.forEach(([x, z, lv], k) => {
      const g = new THREE.Group();
      g.position.set(x, lv * UPPER_Y, z);
      if (k % 2) {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 10), this.paint([0xc8324a, 0x3a8ac8, 0x6a9a3a][k % 3], { emissive: 0x141414 }));
        can.rotation.z = Math.PI / 2;
        can.rotation.y = k;
        can.position.y = 0.1;
        g.add(can);
      } else {
        const bag = this.sphere(g, 0.2, 0x1a1a22, 0, 0.18, 0);
        bag.scale.set(1, 0.85, 1);
        this.put(g, 0.08, 0.1, 0.08, 0x1a1a22, 0, 0.38, 0);
      }
      g.add(glowSprite(0xa8d47a, 0.7, 0.35));
      this.scene.add(g);
      this.litter.push(g);
    });
    for (let i = 0; i < 4; i++) {
      const p = this.character(rgb(PLAYER_COLORS[i] ?? PLAYER_COLORS[0]), i === 0);
      p.root.visible = false;
      this.people.push(p);
    }
    // Guardias: uniforme azul marino, gorra y porra, con el cono de lo que ven en el suelo (amarillo de
    // ronda, rojo cuando persiguen): así se sabe dónde no hay que hacer trampas.
    for (let k = 0; k < ROUTES.length; k++) {
      const c = this.character(0x2a3a8a, false, false, true);
      c.root.visible = false;
      const cone = new THREE.Mesh(
        new THREE.CircleGeometry(GUARD_SIGHT, 28, Math.PI / 2 - GUARD_FOV, GUARD_FOV * 2),
        new THREE.MeshBasicMaterial({ color: 0xfff07a, transparent: true, opacity: 0.12, depthWrite: false }),
      );
      cone.rotation.x = -Math.PI / 2;
      cone.position.y = 0.05;
      c.root.add(cone);
      this.guards.push({ c, cone });
    }
    // Borrachos: poroto verdoso con una botella en la mano (sin bate).
    for (let k = 0; k < DRUNK_POOL; k++) {
      const c = this.character(0x8aa84a, false);
      if (c.bat) c.bat.visible = false;
      this.put(c.arms[1], 0.09, 0.3, 0.09, 0x40e080, 0, -0.6, -0.12, { emissive: 0x0a3a1a });
      this.put(c.arms[1], 0.05, 0.12, 0.05, 0x40e080, 0, -0.8, -0.12, { emissive: 0x0a3a1a });
      c.root.visible = false;
      this.drunks.push(c);
    }
    // Todo proyecta y recibe sombra (menos los halos y lo que llevas en la mano).
    const inView = (o: THREE.Object3D) => {
      let p: THREE.Object3D | null = o;
      while (p) {
        if (p === this.camera) return true;
        p = p.parent;
      }
      return false;
    };
    // Las piezas pequeñas (botellas, cantos, remaches, focos) no proyectan sombra: no se notaría y con el
    // mapa grande cada malla con sombra se dibuja dos veces por fotograma.
    sc.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || inView(o)) return;
      m.receiveShadow = true;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const scale = Math.max(m.scale.x, m.scale.y, m.scale.z);
      m.castShadow = (m.geometry.boundingSphere?.radius ?? 1) * scale > 0.3;
    });
    for (const g of this.guards) g.cone.castShadow = false;
    // La basura de la jaula no hace sombra (la reja sí: se dibuja en la alfombra).
    for (const t of this.jailTrash) t.castShadow = false;
  }

  dispose() {
    disposeScene(this.scene);
  }

  // --- Piezas básicas ---------------------------------------------------------------------
  /** Material plano por color (se reutiliza: hay pocos colores). */
  private paint(color: number, opts: { emissive?: number; basic?: boolean } = {}): THREE.Material {
    const k = `${color}-${opts.emissive ?? 0}-${opts.basic ? 1 : 0}`;
    let m = this.mat.get(k);
    if (!m) {
      m = opts.basic
        ? new THREE.MeshBasicMaterial({ color })
        : new THREE.MeshLambertMaterial({ color, emissive: opts.emissive ?? 0x000000 });
      this.mat.set(k, m);
    }
    return m;
  }

  private box(w: number, h: number, d: number, color: number, opts?: { emissive?: number; basic?: boolean }): THREE.Mesh {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.paint(color, opts));
  }

  /** Atajo: caja colocada. */
  private put(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number,
    opts?: { emissive?: number; basic?: boolean }): THREE.Mesh {
    const m = this.box(w, h, d, color, opts);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /** Textura dibujada en un lienzo: se crea la primera vez y se reutiliza. */
  private texture(key: string, w: number, h: number, draw: Draw): THREE.CanvasTexture {
    let t = this.tex.get(key);
    if (!t) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      draw(c.getContext("2d")!, w, h);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.anisotropy = 4;
      this.tex.set(key, t);
    }
    return t;
  }

  /** Los seis materiales de un dado, en el orden de caras de BoxGeometry (+X, −X, +Y, −Y, +Z, −Z). */
  private diceMaterials(): THREE.MeshLambertMaterial[] {
    if (!this.diceMats) {
      this.diceMats = [1, 6, 2, 5, 3, 4].map(
        (v) => new THREE.MeshLambertMaterial({ map: this.texture(`dado-${v}`, 96, 96, (g, w, h) => drawDieFace(g, w, h, v)) }),
      );
    }
    return this.diceMats;
  }

  // --- Cárcel del techo y objeto en la mano ------------------------------------------------
  /** Tira la basura desde la cámara hacia donde mira el jugador. */
  private throwTrash() {
    if (!this.thrownMesh) {
      this.thrownMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.13, 0.17), new THREE.MeshLambertMaterial({ color: 0x6a8a4a }));
      this.scene.add(this.thrownMesh);
    }
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.thrownMesh.visible = true;
    this.thrownMesh.position.copy(this.camera.position).addScaledVector(dir, 0.5);
    this.thrownMesh.rotation.set(0, 0, 0);
    this.thrownVel.copy(dir).multiplyScalar(7.5);
    this.thrownT = 1.4;
  }

  /** Vuelo de la basura lanzada (gravedad sencilla). */
  private tickThrown(dt: number) {
    if (!this.thrownMesh || this.thrownT <= 0) return;
    this.thrownT -= dt;
    this.thrownMesh.position.addScaledVector(this.thrownVel, dt);
    this.thrownVel.y -= 11 * dt;
    this.thrownMesh.rotation.x += dt * 9;
    this.thrownMesh.rotation.z += dt * 6;
    if (this.thrownT <= 0) this.thrownMesh.visible = false;
  }

  /**
   * Jaula colgada del techo del salón: reja por los seis lados (suelo y techo incluidos) y cadenas.
   * El preso ve todo el casino a sus pies y desde abajo todos ven quién está encerrado.
   */
  private buildJail() {
    const { w, d, h } = JAIL;
    const g = new THREE.Group();
    g.position.set(JAIL.x, JAIL.y, JAIL.z);
    this.scene.add(g);
    const iron = 0x3a3444;
    const gold = 0xc8a050;
    // Suelo y techo de reja (marco de hierro, barrotes dorados cada 0,3 m y travesaños): todo se ve entre
    // los barrotes, de arriba abajo y de abajo arriba. Su sombra en la alfombra dibuja la reja.
    const rx = Math.round(w / 0.3);
    const rz = Math.round(d / 0.6);
    for (const y of [-0.04, h]) {
      for (const s of [-1, 1]) {
        this.put(g, w + 0.2, 0.14, 0.14, iron, 0, y - 0.04, (s * d) / 2);
        this.put(g, 0.14, 0.14, d, iron, (s * w) / 2, y - 0.04, 0);
      }
      for (let i = 1; i < rx; i++) this.put(g, 0.05, 0.05, d, gold, -w / 2 + (i * w) / rx, y, 0, { emissive: 0x1a1004 });
      for (let i = 1; i < rz; i++) this.put(g, w, 0.04, 0.04, iron, 0, y - 0.04, -d / 2 + (i * d) / rz);
    }
    // Cadenas hasta el techo del salón.
    const chain = HALL.h - (JAIL.y + h);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      this.put(g, 0.05, chain, 0.05, 0x9a9aa8, (sx * w) / 2.4, h + chain / 2, (sz * d) / 2.4);
    }
    // Barrotes en los cuatro lados, con travesaños abajo, a media altura y arriba.
    const nx = Math.round(w / 0.42);
    const nz = Math.round(d / 0.42);
    for (const s of [-1, 1]) {
      for (let i = 0; i < nx; i++) this.put(g, 0.06, h, 0.06, gold, -w / 2 + ((i + 0.5) * w) / nx, h / 2, (s * d) / 2, { emissive: 0x1a1004 });
      for (let i = 0; i < nz; i++) this.put(g, 0.06, h, 0.06, gold, (s * w) / 2, h / 2, -d / 2 + ((i + 0.5) * d) / nz, { emissive: 0x1a1004 });
      for (const y of [0.1, h / 2, h - 0.08]) {
        this.put(g, w, 0.07, 0.07, gold, 0, y, (s * d) / 2, { emissive: 0x1a1004 });
        this.put(g, 0.07, 0.07, d, gold, (s * w) / 2, y, 0, { emissive: 0x1a1004 });
      }
    }
    // Banco al fondo.
    this.put(g, 1.4, 0.12, 0.45, 0x6a4030, -0.6, 0.45, d / 2 - 0.45);
    for (const s of [-1, 1]) this.put(g, 0.1, 0.42, 0.36, iron, -0.6 + s * 0.55, 0.21, d / 2 - 0.45);
    // Palanca en un poste del lado del salón: acertarle con la basura acorta la condena.
    const lx = JAIL_LEVER[0] - JAIL.x;
    const lz = JAIL_LEVER[2] - JAIL.z;
    this.put(g, 0.16, JAIL_LEVER[1] - JAIL.y, 0.12, iron, lx, (JAIL_LEVER[1] - JAIL.y) / 2, lz - 0.06);
    const lever = this.put(g, 0.18, 0.42, 0.1, 0xff5560, lx, JAIL_LEVER[1] - JAIL.y, lz, { emissive: 0x401018 });
    lever.name = "palanca";
    const halo = glowSprite(0xff5560, 1.2, 0.5);
    halo.position.set(lever.position.x, lever.position.y, lever.position.z + 0.1);
    g.add(halo);
    // Cartel «CÁRCEL» encima, por las dos caras: hacia el salón y hacia dentro.
    const sign = new CanvasLabel(256, 64);
    sign.set("CÁRCEL", "#ff5560");
    for (const out of [true, false]) {
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 0.5),
        new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true }),
      );
      plate.position.set(0, h - 0.4, -d / 2 + (out ? -0.06 : 0.06));
      plate.rotation.y = out ? Math.PI : 0;
      g.add(plate);
    }
    // Sirena roja en el techo de la jaula (gira cuando alguien fuerza la caja de la fuga).
    const siren = glowSprite(0xff3040, 2.6, 0.25);
    siren.position.set(0, h + 0.3, 0);
    g.add(siren);
    this.jailSiren = siren;
    // Luces de la jaula.
    const lamp = new THREE.PointLight(0xffd8a0, 40, 9, 2);
    lamp.position.set(0, h - 0.35, 0);
    g.add(lamp);
    // Basura por el suelo (se coge y se tira), con un halo para que se vea a la primera.
    for (const [x, z] of JAIL_TRASH) {
      const t = this.put(this.scene, 0.2, 0.15, 0.2, [0x6a8a4a, 0x8a6a3a, 0x5a6a8a, 0x8a4a4a][this.jailTrash.length % 4], x, JAIL.y + 0.08, z);
      t.rotation.y = this.jailTrash.length * 0.9;
      this.jailTrash.push(t);
      const h2 = glowSprite(0xa8d47a, 0.55, 0.35);
      h2.position.set(x, JAIL.y + 0.12, z);
      this.scene.add(h2);
      this.jailTrashGlow.push(h2);
    }
    // Caja de la fuga, en la pared del fondo: roja, con palanca y cartel; late cuando alguien la fuerza.
    const [sx, sy, sz] = JAIL_SWITCH;
    const box = new THREE.Group();
    box.position.set(sx, sy, sz);
    box.rotation.y = Math.PI;
    this.scene.add(box);
    this.put(box, 0.62, 0.8, 0.18, 0x8a1a2a, 0, 0, 0);
    this.put(box, 0.5, 0.66, 0.04, 0x2a0e1c, 0, 0, 0.1);
    this.put(box, 0.08, 0.36, 0.08, 0xd8d8e0, 0.12, 0.06, 0.16);
    this.put(box, 0.16, 0.12, 0.12, 0xffce4a, 0.12, 0.26, 0.18, { basic: true });
    const tag = new CanvasLabel(256, 64);
    tag.set("FUGA", "#ffce4a");
    const tagMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: tag.texture, transparent: true }));
    tagMesh.position.set(0, 0.62, 0.1);
    box.add(tagMesh);
    const boxGlow = glowSprite(0xff4050, 1.8, 0.3);
    boxGlow.position.set(0, 0, 0.3);
    box.add(boxGlow);
    this.switchGlow = boxGlow;
  }

  /** Lo que se ve en la mano: el bate, la mano abierta o la basura de la celda. */
  private buildViewModel() {
    // La cámara tiene que estar en la escena para que sus hijos se dibujen.
    this.scene.add(this.camera);

    const bat = new THREE.Group();
    bat.position.set(0.4, -0.18, -0.75);
    bat.rotation.set(-0.18, -0.45, 0.5);
    this.put(bat, 0.08, 0.52, 0.08, 0xc89a5a, 0, 0.08, 0, { basic: true });
    this.put(bat, 0.065, 0.24, 0.065, 0x2a1a12, 0, -0.24, 0, { basic: true });
    this.camera.add(bat);
    this.view.bat = bat;

    const hand = new THREE.Group();
    hand.position.set(0.4, -0.13, -0.64);
    hand.rotation.set(-0.2, -0.35, 0.22);
    // Guante redondo de dibujo animado: palma, tres dedos gordos y el pulgar.
    const palm = this.sphere(hand, 0.11, 0xfff2dc, 0, 0, 0, { basic: true }, 0.7);
    palm.scale.y = 1.1;
    for (let i = 0; i < 3; i++) this.sphere(hand, 0.045, 0xf4e2c6, -0.06 + i * 0.06, 0.13, -0.01, { basic: true });
    this.sphere(hand, 0.045, 0xf4e2c6, -0.11, 0.02, -0.02, { basic: true });
    this.put(hand, 0.14, 0.08, 0.1, 0xc8324a, 0, -0.13, 0, { basic: true });
    this.camera.add(hand);
    this.view.hand = hand;

    const trash = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), new THREE.MeshBasicMaterial({ color: 0x7a9a52 }));
    trash.position.set(0.42, -0.13, -0.62);
    trash.rotation.set(0.3, 0.6, 0.2);
    this.camera.add(trash);
    this.view.trash = trash;
  }

  // --- Sala ---------------------------------------------------------------------------------
  /**
   * El casino entero: el salón real de doble altura con las mesas, el anillo de zonas temáticas en planta
   * baja y entrepiso (cada una con su suelo, sus paredes y su decoración), las columnas, el forjado del
   * entrepiso con su barandilla de cristal, las dos escaleras y el techo con plafones de luz.
   */
  private buildRoom() {
    const sc = this.scene;
    const HX = HALL.w / 2;
    const HZ = HALL.d / 2;
    const AX = ATRIUM.w / 2;
    const AZ = ATRIUM.d / 2;
    // Caja exterior oscura (que no se vea el vacío por ninguna junta).
    for (const [w, d, x, z] of [[HALL.w + 1, 0.5, 0, -HZ - 0.25], [HALL.w + 1, 0.5, 0, HZ + 0.25], [0.5, HALL.d, -HX - 0.25, 0], [0.5, HALL.d, HX + 0.25, 0]] as const) {
      this.put(sc, w, HALL.h, d, 0x1a0c24, x, HALL.h / 2, z);
    }
    // Suelo y paredes de cada zona, con su tema.
    for (const zn of ZONES) {
      const theme = THEMES[zn.name] ?? THEMES["SALÓN REAL"];
      const w = zn.x1 - zn.x0;
      const d = zn.z1 - zn.z0;
      const cx = (zn.x0 + zn.x1) / 2;
      const cz = (zn.z0 + zn.z1) / 2;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: patternTexture(theme.floor, w, d) }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, zn.lv * UPPER_Y + 0.006, cz);
      sc.add(floor);
      const y0 = zn.lv ? UPPER_Y : 0;
      const h = (zn.lv ? HALL.h : UPPER_Y) - y0;
      const wall = (len: number, x: number, z: number, ry: number) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), new THREE.MeshLambertMaterial({ map: patternTexture(theme.wall, len, h, 3) }));
        m.position.set(x, y0 + h / 2, z);
        m.rotation.y = ry;
        sc.add(m);
        // Zócalo dorado.
        const base = this.put(sc, len, 0.18, 0.06, 0xe0a848, x, y0 + 0.09, z, { emissive: 0x3a2008 });
        base.rotation.y = ry;
      };
      if (zn.x0 === -HX) wall(d, -HX + 0.01, cz, Math.PI / 2);
      if (zn.x1 === HX) wall(d, HX - 0.01, cz, -Math.PI / 2);
      if (zn.z0 === -HZ) wall(w, cx, -HZ + 0.01, 0);
      if (zn.z1 === HZ) wall(w, cx, HZ - 0.01, Math.PI);
    }
    // Forjado del entrepiso (cuatro losas alrededor del hueco), con un canto dorado y una tira de luz
    // turquesa hacia el salón real, y focos empotrados en su cara de abajo (el techo de la planta baja).
    const slabY = UPPER_Y - 0.15;
    for (const [w, d, x, z] of [
      [HX - AX, HALL.d, -(HX + AX) / 2, 0], [HX - AX, HALL.d, (HX + AX) / 2, 0],
      [ATRIUM.w, HZ - AZ, 0, -(HZ + AZ) / 2], [ATRIUM.w, HZ - AZ, 0, (HZ + AZ) / 2],
    ] as const) {
      this.put(sc, w, 0.3, d, 0x2a1430, x, slabY, z);
    }
    for (const s of [-1, 1]) {
      this.put(sc, ATRIUM.w + 0.1, 0.42, 0.1, 0xe0a848, 0, slabY, s * (AZ + 0.02), { emissive: 0x3a2008 });
      this.put(sc, 0.1, 0.42, ATRIUM.d + 0.1, 0xe0a848, s * (AX + 0.02), slabY, 0, { emissive: 0x3a2008 });
      this.put(sc, ATRIUM.w, 0.06, 0.12, 0x3fd8e8, 0, slabY - 0.24, s * (AZ + 0.03), { basic: true });
      this.put(sc, 0.12, 0.06, ATRIUM.d, 0x3fd8e8, s * (AX + 0.03), slabY - 0.24, 0, { basic: true });
    }
    for (let x = -HX + 3; x < HX; x += 6) {
      for (let z = -HZ + 3; z < HZ; z += 6) {
        if (Math.abs(x) < AX && Math.abs(z) < AZ) continue;
        const spot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), this.paint(0xfff2d0, { basic: true }));
        spot.rotation.x = Math.PI / 2;
        spot.position.set(x, slabY - 0.16, z);
        sc.add(spot);
      }
    }
    // Barandilla de cristal alrededor del hueco (con huecos donde llegan las escaleras).
    const glass = new THREE.MeshLambertMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.18, depthWrite: false });
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.Group();
      g.position.set((x0 + x1) / 2, UPPER_Y, (z0 + z1) / 2);
      g.rotation.y = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
      const pane = new THREE.Mesh(new THREE.BoxGeometry(len, 1.0, 0.04), glass);
      pane.position.y = 0.55;
      g.add(pane);
      this.put(g, len, 0.08, 0.12, 0xe0a848, 0, 1.08, 0, { emissive: 0x3a2008 });
      for (let k = 0; k <= Math.floor(len / 2); k++) this.put(g, 0.08, 1.1, 0.08, 0xe0a848, -len / 2 + k * (len / Math.max(1, Math.floor(len / 2))), 0.55, 0, { emissive: 0x3a2008 });
      sc.add(g);
    };
    rail(-AX, -AZ, AX, -AZ);
    rail(-AX, AZ, AX, AZ);
    for (const s of [-1, 1]) {
      rail(s * AX, -AZ, s * AX, -3.8);
      rail(s * AX, -2.2, s * AX, AZ);
    }
    // Columnas de mármol de suelo a techo, con anillos dorados.
    for (const [x, z] of PILLARS) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, HALL.h, 14), this.paint(0xe8dccc));
      col.position.set(x, HALL.h / 2, z);
      sc.add(col);
      for (const y of [0.15, UPPER_Y - 0.4, HALL.h - 0.4]) this.put(sc, 1.3, 0.3, 1.3, 0xe0a848, x, y, z, { emissive: 0x3a2008 });
    }
    this.buildStairs();
    // Techo con dos plafones sobre el salón real que brillan en violeta y azul.
    this.put(sc, HALL.w, 0.3, HALL.d, 0x241030, 0, HALL.h, 0);
    for (const [z, inner, edge] of [[-5.5, 0x5a3ad8, 0xb08aff], [5.5, 0x3a5ae0, 0x8ab0ff]] as const) {
      this.put(sc, ATRIUM.w - 4, 0.05, 9, inner, 0, HALL.h - 0.16, z, { basic: true });
      for (const s of [-1, 1]) {
        this.put(sc, ATRIUM.w - 3.6, 0.18, 0.22, edge, 0, HALL.h - 0.3, z + s * 4.6, { basic: true });
        this.put(sc, 0.22, 0.18, 9.4, edge, s * (AX - 1.9), HALL.h - 0.3, z, { basic: true });
      }
      const wash = new THREE.PointLight(edge, 40, 22, 2);
      wash.position.set(0, HALL.h - 1.5, z);
      sc.add(wash);
    }
    // Luz de relleno en cada zona (planta baja bajo el forjado y entrepiso).
    for (const zn of ZONES) {
      if (zn.name === "SALÓN REAL") continue;
      const l = new THREE.PointLight(zn.lv ? 0xffd0a0 : 0xffb070, zn.lv ? 34 : 26, 22, 2);
      l.position.set((zn.x0 + zn.x1) / 2, zn.lv ? HALL.h - 1.5 : UPPER_Y - 0.8, (zn.z0 + zn.z1) / 2);
      sc.add(l);
    }
    // Lámparas de araña colgando sobre las mesas.
    for (const [x, z] of [[-8, -1.5], [8, -1.5], [0, -4]] as const) {
      this.put(sc, 0.05, 2.4, 0.05, 0xe0a848, x, HALL.h - 1.2, z);
      const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.2, 10, 1, true), this.paint(0xfff2d0, { basic: true }));
      lamp.rotation.x = Math.PI;
      lamp.position.set(x, HALL.h - 2.9, z);
      sc.add(lamp);
      this.put(sc, 1.8, 0.1, 1.8, 0xe0a848, x, HALL.h - 2.4, z, { emissive: 0x3a2008 });
      const halo = glowSprite(0xffe0a0, 5, 0.5);
      halo.position.set(x, HALL.h - 3.1, z);
      sc.add(halo);
    }
    // Cartel grande colgado sobre el salón, mirando a la entrada.
    const sign = new CanvasLabel(512, 128);
    sign.set("CASINO ENTRE AMIGOS", "#ff8a24");
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true }));
    signMesh.position.set(0, 8.6, -AZ + 0.3);
    sc.add(signMesh);
    // Pasillo de moqueta roja con ribete dorado: de la puerta del vestíbulo a la carrera de patos.
    this.put(sc, 4.4, 0.02, HZ - 2.4, 0xe0a848, 0, 0.012, (HZ + 2.4) / 2);
    this.put(sc, 4.0, 0.024, HZ - 2.4, 0x8a1a34, 0, 0.016, (HZ + 2.4) / 2);
    this.buildZones();
    this.buildBath();
    this.buildVault();
    this.buildBoutique();
    this.buildDecor();
  }

  /** Cartel de zona (tablero burdeos con letras gordas) colgado en (x, y, z) mirando hacia `ry`. */
  private zoneSign(text: string, color: string, x: number, y: number, z: number, ry: number, w = 4) {
    const label = new CanvasLabel(512, 128);
    label.set(text, color);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.scene.add(m);
  }

  /** Neón dibujado (corona, dólar o palmera) con su halo. */
  private neon(kind: string, color: number, size: number, x: number, y: number, z: number, ry: number) {
    const css = `#${color.toString(16).padStart(6, "0")}`;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: this.texture(`neon-${kind}-${color}`, 256, 256, (g, w, h) => drawNeon(g, w, h, kind, css)),
        transparent: true,
        depthWrite: false,
      }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.scene.add(m);
    const halo = glowSprite(color, size * 1.5, 0.28);
    halo.position.copy(m.position);
    this.scene.add(halo);
  }

  /**
   * Las dos escaleras del salón real: peldaños de moqueta roja con canto dorado, barandillas inclinadas y
   * el rellano que las une con el balcón del entrepiso.
   */
  private buildStairs() {
    const steps = 20;
    for (const st of STAIRS) {
      const bx = (st.x0 + st.x1) / 2;
      const bz = st.zBottom;
      const run = st.zBottom - st.zTop;
      const rise = UPPER_Y / steps;
      const depth = run / steps;
      for (let i = 0; i < steps; i++) {
        const top = (i + 1) * rise;
        const z = bz - (i + 0.5) * depth;
        this.put(this.scene, 3, top, depth + 0.01, 0x8a1a34, bx, top / 2, z);
        this.put(this.scene, 3.02, 0.05, 0.06, 0xe0a848, bx, top, z + depth / 2 - 0.03, { emissive: 0x3a2008 });
      }
      // Rellano arriba (une la escalera con el balcón), con barandilla en su fondo y en el lado del hueco.
      const lz = (st.landing[0] + st.landing[1]) / 2;
      const ld = st.landing[1] - st.landing[0];
      this.put(this.scene, st.x1 - st.x0, 0.3, ld, 0x8a1a34, bx, UPPER_Y - 0.15, lz);
      this.put(this.scene, st.x1 - st.x0, 0.08, 0.08, 0xe0a848, bx, UPPER_Y + 1.05, st.landing[0], { emissive: 0x3a2008 });
      const innerX = st.side < 0 ? st.x1 : st.x0;
      this.put(this.scene, 0.08, 0.08, ld, 0xe0a848, innerX, UPPER_Y + 1.05, lz, { emissive: 0x3a2008 });
      // Barandillas doradas a los dos lados.
      const len = Math.hypot(run, UPPER_Y);
      const tilt = Math.atan2(UPPER_Y, run);
      for (const side of [-1, 1]) {
        const r = this.put(this.scene, 0.08, 0.08, len, 0xe0a848, bx + side * 1.45, UPPER_Y / 2 + 1.0, bz - run / 2, { emissive: 0x3a2008 });
        r.rotation.x = tilt;
      }
    }
  }

  /** Decoración de cada zona temática: barra, neones, máquinas, puertas, cuadros, sofás… */
  private buildZones() {
    const sc = this.scene;
    const HX = HALL.w / 2;
    const HZ = HALL.d / 2;
    const AX = ATRIUM.w / 2;
    const U = UPPER_Y;
    // --- BAR TROPICAL (planta baja, oeste): barra con techo de paja, botellas, taburetes y antorchas.
    const bx = -HX + 1.6;
    this.put(sc, 2.2, 1.1, 12, 0x6a2a1e, bx, 0.55, 0);
    this.put(sc, 2.5, 0.18, 12.3, 0xd89a52, bx, 1.17, 0);
    this.put(sc, 0.3, 2.6, 12, 0x3a1424, -HX + 0.3, 2.0, 0);
    for (const y of [1.7, 2.5]) this.put(sc, 0.36, 0.1, 12, 0xe0a848, -HX + 0.4, y, 0, { emissive: 0x3a2008 });
    const bottleColors = [0x40e080, 0xffc040, 0xe04060, 0x60a0ff, 0xff80c0];
    for (let i = 0; i < 32; i++) {
      const h = 0.36 + (i % 3) * 0.1;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, h, 8), this.paint(bottleColors[i % bottleColors.length], { emissive: 0x181018 }));
      b.position.set(-HX + 0.45, (i < 16 ? 1.75 : 2.55) + h / 2, -5 + (i % 16) * 0.66);
      sc.add(b);
    }
    for (let i = 0; i < 6; i++) {
      const z = -5 + i * 2;
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 14), this.paint(0xc8324a));
      seat.position.set(bx + 1.9, 0.78, z);
      sc.add(seat);
      this.put(sc, 0.1, 0.72, 0.1, 0xe0a848, bx + 1.9, 0.36, z, { emissive: 0x2a1804 });
    }
    const thatch = this.put(sc, 3.6, 0.25, 13, 0xc89a4a, bx + 0.4, 3.4, 0);
    thatch.rotation.z = -0.25;
    // Palmeras fuera de la ronda del guardia (x = −19,5, z = ±17,5): no tienen colisión.
    for (const [x, z] of [[-HX + 4, -12], [-HX + 4, 12], [-AX - 4, -20.5], [-AX - 4, 20.5]] as const) this.palm(x, z);
    for (const z of [-8, 8]) {
      this.put(sc, 0.12, 2.0, 0.12, 0x6a4426, -HX + 4.5, 1.0, z);
      const fire = glowSprite(0xff8a24, 1.2, 0.8);
      fire.position.set(-HX + 4.5, 2.15, z);
      sc.add(fire);
    }
    this.zoneSign("BAR TROPICAL", "#ffd23a", -HX + 0.35, 4.2, 0, Math.PI / 2, 4.4);
    this.zoneSign(`TRUCOS · ${ITEM_COST}`, "#ff8a24", -HX + 0.35, 3.0, -9, Math.PI / 2, 2.8);
    this.neon("palmera", 0x4aff8a, 2.2, -HX + 0.3, 3.2, 10, Math.PI / 2);
    // --- ZONA NEÓN (planta baja, este): tubos de neón por las paredes, arcos de luz y los baños.
    for (const [y, color] of [[1.2, 0xff3f9a], [2.6, 0x3fd8e8], [4.0, 0xff3f9a]] as const) {
      for (const [z0, z1] of [[-HZ + 1, -3], [3, HZ - 1]] as const) {
        this.put(sc, 0.06, 0.08, z1 - z0, color, HX - 0.1, y, (z0 + z1) / 2, { basic: true });
      }
    }
    for (const z of [-12, 12]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.07, 8, 24, Math.PI), this.paint(z < 0 ? 0xff3f9a : 0x3fd8e8, { basic: true }));
      arch.position.set(AX + 6, 0, z);
      arch.rotation.y = Math.PI / 2;
      sc.add(arch);
      const glow = glowSprite(z < 0 ? 0xff3f9a : 0x3fd8e8, 4, 0.25);
      glow.position.set(AX + 6, 1.6, z);
      sc.add(glow);
    }
    this.zoneSign("ZONA NEÓN", "#ff3f9a", HX - 0.35, 4.2, -9, -Math.PI / 2, 4);
    this.neon("corona", 0x3fd8e8, 2.2, HX - 0.3, 3.0, 9, -Math.PI / 2);
    // --- SALA DE MÁQUINAS (planta baja, norte): filas de tragaperras de adorno con la pantalla encendida.
    [-9, -4.5, 4.5, 9].forEach((x, k) => {
      const z = -HZ + 1.4;
      this.put(sc, 1.4, 2.0, 1.2, [0x8a1a34, 0x2a3a8a, 0x1a6a4a, 0x6a2a8a][k], x, 1.0, z);
      this.put(sc, 1.0, 0.7, 0.05, [0xffce4a, 0x3fd8e8, 0xff3f9a, 0x7aff8a][k], x, 1.3, z + 0.62, { basic: true });
      this.put(sc, 1.5, 0.25, 1.3, 0xe0a848, x, 2.1, z, { emissive: 0x3a2008 });
      const glow = glowSprite(0xffce4a, 1.6, 0.35);
      glow.position.set(x, 2.4, z);
      sc.add(glow);
    });
    this.zoneSign("SALA DE MÁQUINAS", "#3fd8e8", 0, 4.2, -HZ + 0.35, 0, 5);
    // --- VESTÍBULO (planta baja, sur): puerta dorada de entrada, bienvenida y macetas.
    this.put(sc, 5.4, 4.0, 0.2, 0x8a6a2a, 0, 2.0, HZ - 0.15, { emissive: 0x2a1804 });
    for (const s of [-1, 1]) this.put(sc, 2.4, 3.6, 0.1, 0xe0a848, s * 1.25, 1.8, HZ - 0.3, { emissive: 0x3a2008 });
    this.zoneSign("BIENVENIDOS", "#ffd23a", 0, 4.4, HZ - 0.35, Math.PI, 4.6);
    for (const x of [-11, 11]) this.palm(x, HZ - 2);
    // --- GALERÍA (entrepiso, oeste): cuadros con marco dorado.
    for (let k = 0; k < 5; k++) {
      const z = -16 + k * 8;
      this.put(sc, 0.12, 2.4, 3.2, 0xe0a848, -HX + 0.1, U + 2.8, z, { emissive: 0x3a2008 });
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(2.8, 2.0),
        new THREE.MeshBasicMaterial({ map: this.texture(`cuadro-${k}`, 128, 96, (g, w, h) => drawPainting(g, w, h, k)) }),
      );
      art.position.set(-HX + 0.18, U + 2.8, z);
      art.rotation.y = Math.PI / 2;
      sc.add(art);
    }
    this.zoneSign("GALERÍA", "#ffd23a", -HX + 0.35, U + 5.0, 0, Math.PI / 2, 4);
    // --- SALA VIP (entrepiso, norte): sofás de terciopelo, cordones y la bóveda.
    for (const x of [-8, 8]) {
      this.put(sc, 3.2, 0.5, 1.2, 0xa8183a, x, U + 0.25, -HZ + 2);
      this.put(sc, 3.2, 0.9, 0.3, 0xa8183a, x, U + 0.7, -HZ + 1.55);
    }
    for (const x of [-4, -2.6, 2.6, 4]) {
      this.put(sc, 0.12, 1.0, 0.12, 0xe0a848, x, U + 0.5, -HZ + 3.4, { emissive: 0x3a2008 });
    }
    for (const s of [-1, 1]) this.put(sc, 1.4, 0.06, 0.06, 0xc8243a, s * 3.3, U + 0.85, -HZ + 3.4);
    this.zoneSign("SALA VIP", "#ffd23a", -9, U + 4.6, -HZ + 0.35, 0, 4);
    this.neon("corona", 0xffd23a, 2.4, 9, U + 4.4, -HZ + 0.3, 0);
    // --- MIRADOR (entrepiso, sur): bancos mirando al salón.
    for (const x of [-6, 6]) {
      this.put(sc, 2.6, 0.45, 0.9, 0x6a4030, x, U + 0.22, HZ - 1.4);
      this.put(sc, 2.6, 0.7, 0.15, 0x6a4030, x, U + 0.6, HZ - 0.95);
    }
    this.zoneSign("MIRADOR", "#3fd8e8", 0, U + 4.6, HZ - 0.35, Math.PI, 4);
    this.neon("dolar", 0x5aff7a, 2.2, -HX + 0.3, U + 4.4, -14, Math.PI / 2);
  }

  // --- Mobiliario ---------------------------------------------------------------------------
  /** Silla con respaldo (mirando hacia `ry`). */
  private chair(x: number, y: number, z: number, ry: number, color = 0xa8183a) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this.put(g, 0.5, 0.08, 0.5, color, 0, 0.46, 0);
    this.put(g, 0.5, 0.55, 0.07, color, 0, 0.75, 0.22);
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) this.put(g, 0.05, 0.44, 0.05, 0xe0a848, lx, 0.22, lz, { emissive: 0x2a1804 });
    this.scene.add(g);
  }

  /** Mesita redonda con dos copas de colores. */
  private sideTable(x: number, y: number, z: number) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 18), this.paint(0xe8dccc));
    top.position.set(x, y + 0.75, z);
    this.scene.add(top);
    this.put(this.scene, 0.08, 0.72, 0.08, 0xe0a848, x, y + 0.37, z, { emissive: 0x2a1804 });
    for (const [dx, color] of [[-0.15, 0xff3f86], [0.17, 0x3fd8e8]] as const) {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.16, 8), this.paint(color, { emissive: 0x2a1020 }));
      glass.position.set(x + dx, y + 0.86, z + 0.05);
      this.scene.add(glass);
    }
  }

  /** Mesita con cuatro sillas alrededor (un rincón para sentarse a charlar). */
  private lounge(x: number, y: number, z: number, color?: number) {
    this.sideTable(x, y, z);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      // La silla mira a la mesa: su respaldo queda hacia fuera.
      this.chair(x + Math.sin(a) * 0.95, y, z + Math.cos(a) * 0.95, a + Math.PI, color);
    }
  }

  /** Planta en maceta dorada. */
  private plant(x: number, y: number, z: number) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.55, 12), this.paint(0xe0a848, { emissive: 0x2a1804 }));
    pot.position.set(x, y + 0.28, z);
    this.scene.add(pot);
    for (let k = 0; k < 4; k++) this.sphere(this.scene, 0.32 - k * 0.04, k % 2 ? 0x3aa848 : 0x4ac25a, x + Math.sin(k * 2) * 0.12, y + 0.75 + k * 0.28, z + Math.cos(k * 2) * 0.12);
  }

  /** Lámpara de pie con pantalla y su halo. */
  private floorLamp(x: number, y: number, z: number) {
    this.put(this.scene, 0.06, 1.7, 0.06, 0xe0a848, x, y + 0.85, z, { emissive: 0x2a1804 });
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.4, 12, 1, true), this.paint(0xfff2d0, { basic: true }));
    shade.position.set(x, y + 1.8, z);
    this.scene.add(shade);
    const halo = glowSprite(0xffd8a0, 1.6, 0.4);
    halo.position.set(x, y + 1.75, z);
    this.scene.add(halo);
  }

  /** Papelera verde con tapa. */
  private bin(x: number, y: number, z: number) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.7, 12), this.paint(0x2a6a3a));
    can.position.set(x, y + 0.35, z);
    this.scene.add(can);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), this.paint(0x1a4a2a));
    lid.position.set(x, y + 0.72, z);
    this.scene.add(lid);
  }

  /**
   * Mobiliario por todo el casino, sobre todo en el entrepiso (que sin él parecía vacío): rincones con
   * mesitas y sillas, plantas, lámparas de pie, percheros, telescopios mirando al salón y papeleras.
   * Es decoración: se atraviesa (no tiene colisión) para no estorbar a nadie.
   */
  private buildDecor() {
    const U = UPPER_Y;
    const HX = HALL.w / 2;
    const HZ = HALL.d / 2;
    // --- Galería (oeste, arriba).
    for (const z of [-19.5, 19.5]) this.lounge(-18.5, U, z, 0x2a3a8a);
    for (const z of [-21, 21]) this.plant(-HX + 1, U, z);
    for (const z of [-12, -4, 4, 12]) this.floorLamp(-HX + 0.8, U, z);
    // Busto sobre una peana.
    this.put(this.scene, 0.7, 1.1, 0.7, 0xe8dccc, -17.5, U + 0.55, 0);
    this.sphere(this.scene, 0.32, 0xd8ccbc, -17.5, U + 1.45, 0);
    // --- Boutique (este, arriba): percheros con camisas, caja registradora y pufs.
    for (const z of [-12.5, 12.5]) {
      this.put(this.scene, 0.06, 1.7, 0.06, 0xd8d8e0, HX - 1.2, U + 0.85, z - 1.1);
      this.put(this.scene, 0.06, 1.7, 0.06, 0xd8d8e0, HX - 1.2, U + 0.85, z + 1.1);
      this.put(this.scene, 0.06, 0.06, 2.3, 0xd8d8e0, HX - 1.2, U + 1.68, z);
      for (let k = 0; k < 5; k++) this.put(this.scene, 0.12, 0.9, 0.36, [0xff6ab8, 0x3fd8e8, 0xffd14a, 0xa894ff, 0x7aff8a][k], HX - 1.2, U + 1.2, z - 0.8 + k * 0.4);
    }
    this.put(this.scene, 2.4, 1.0, 0.9, 0xc8a0e8, HX - 2.5, U + 0.5, 17);
    this.put(this.scene, 0.5, 0.35, 0.4, 0x2a2434, HX - 2.5, U + 1.18, 17);
    for (const z of [-19.5, 19.5]) {
      const pouf = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.45, 14), this.paint(0xff8ac8));
      pouf.position.set(19.5, U + 0.22, z);
      this.scene.add(pouf);
    }
    this.plant(HX - 1, U, -21);
    // --- Sala VIP (norte, arriba): plantas, lámparas y un carrito de bebidas.
    for (const x of [-13.5, 13.5]) this.plant(x, U, -HZ + 1.4);
    for (const x of [-5, 5]) this.floorLamp(x, U, -HZ + 0.7);
    this.put(this.scene, 1.0, 0.8, 0.6, 0xe0a848, 5.5, U + 0.45, -12.5, { emissive: 0x2a1804 });
    this.sideTable(-5.5, U, -12.6);
    // --- Mirador (sur, arriba): rincón entre los bancos y telescopios hacia el salón.
    this.lounge(0, U, 19.5, 0x8a1a34);
    for (const x of [-13, 13]) {
      this.put(this.scene, 0.06, 1.2, 0.06, 0x2a2434, x, U + 0.6, 12.4);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.8, 10), this.paint(0xe0a848, { emissive: 0x3a2008 }));
      tube.rotation.x = Math.PI / 2 - 0.3;
      tube.position.set(x, U + 1.3, 12.1);
      this.scene.add(tube);
    }
    for (const x of [-14, 14]) this.plant(x, U, HZ - 1);
    // --- Papeleras junto a la basura de cada piso.
    for (const [x, z, lv] of LITTER) {
      if ((Math.round(x) + Math.round(z)) % 2 === 0) this.bin(x + 0.9, lv * U, z + 0.6);
    }
    // --- Planta baja: sofás en el vestíbulo, taburetes en la sala de máquinas y mesas altas en la zona neón.
    // Lejos de la caja de la fuga (x = 6) para no taparla.
    for (const x of [-7, 13]) {
      this.put(this.scene, 2.6, 0.5, 1.0, 0x8a1a34, x, 0.25, HZ - 1.3);
      this.put(this.scene, 2.6, 0.8, 0.25, 0x8a1a34, x, 0.6, HZ - 0.85);
    }
    for (const x of [-9, -4.5, 4.5, 9]) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), this.paint(0xc8324a));
      stool.position.set(x, 0.7, -HZ + 3);
      this.scene.add(stool);
      this.put(this.scene, 0.08, 0.66, 0.08, 0xe0a848, x, 0.33, -HZ + 3, { emissive: 0x2a1804 });
    }
    for (const z of [-8, 8]) {
      this.sideTable(23, 0, z);
      this.chair(23.9, 0, z, Math.PI / 2, 0x3fd8e8);
      this.chair(22.1, 0, z, -Math.PI / 2, 0xff3f9a);
    }
    for (const z of [-17.5, 17.5]) this.lounge(-23, 0, z, 0x6a2a1e);
  }

  /**
   * Boutique de disfraces (entrepiso, este): un maniquí por disfraz (con el bigote, la peluca o las gafas
   * puestos), un espejo grande, el mostrador y su cartel. Se compra poniéndose delante del maniquí.
   */
  private buildBoutique() {
    const sc = this.scene;
    const U = UPPER_Y;
    const HX = HALL.w / 2;
    MANNEQUINS.forEach(({ at }, k) => {
      const g = new THREE.Group();
      g.position.set(at[0], U, at[1]);
      g.rotation.y = Math.PI / 2;
      // Peana, cuerpo de poroto blanco y la cara con el disfraz.
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16), this.paint(0xe0a848, { emissive: 0x3a2008 }));
      base.position.y = 0.1;
      g.add(base);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 8, 16), this.paint(0xf2eef2));
      body.position.y = 0.95;
      g.add(body);
      const head = new THREE.Group();
      head.position.y = 1.45;
      g.add(head);
      this.disguiseParts(head, k + 1);
      const spot = glowSprite(0xffd8f0, 1.8, 0.3);
      spot.position.set(0, 2.2, 0);
      g.add(spot);
      sc.add(g);
      const price = new CanvasLabel(256, 64);
      price.set(`${["BIGOTE", "PELUCA", "GAFAS"][k]} · 20`, "#ff8ac8");
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: price.texture, transparent: true }));
      tag.position.set(at[0] - 0.55, U + 2.5, at[1]);
      tag.rotation.y = -Math.PI / 2;
      sc.add(tag);
    });
    // Espejo y cartel.
    this.put(sc, 0.08, 2.6, 2.0, 0xd8e8f4, HX - 0.1, U + 1.8, -9, { emissive: 0x405060 });
    this.zoneSign("BOUTIQUE · DISFRACES", "#ff8ac8", HX - 0.35, U + 4.6, 0, -Math.PI / 2, 5.2);
    this.neon("palmera", 0xff4fb0, 2.2, HX - 0.3, U + 4.4, 12, -Math.PI / 2);
  }

  /**
   * Piezas de un disfraz sobre un grupo «cabeza» (mismo origen que la de los muñecos): 1 bigote, 2 peluca
   * rosa, 3 gafas de sol. Devuelve el grupo para poder encenderlo y apagarlo.
   */
  private disguiseParts(head: THREE.Object3D, kind: number): THREE.Group {
    const g = new THREE.Group();
    if (kind === 1) {
      // Bigotazo negro de dos puntas.
      for (const s of [-1, 1]) {
        const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), this.paint(0x141018));
        tip.rotation.z = (s * Math.PI) / 2.3;
        tip.position.set(0.12 * s, -0.17, -0.42);
        g.add(tip);
      }
    } else if (kind === 2) {
      // Peluca rizada rosa.
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        this.sphere(g, 0.17, 0xff6ab8, Math.cos(a) * 0.3, 0.32 + Math.sin(k) * 0.04, Math.sin(a) * 0.3 + 0.05);
      }
      this.sphere(g, 0.28, 0xff6ab8, 0, 0.44, 0.05);
    } else {
      // Gafas de sol negras con montura dorada.
      for (const s of [-1, 1]) {
        const lens = this.put(g, 0.24, 0.16, 0.04, 0x0a0a10, 0.16 * s, 0.06, -0.47);
        lens.rotation.y = s * 0.15;
      }
      this.put(g, 0.6, 0.04, 0.04, 0xe0a848, 0, 0.11, -0.47, { emissive: 0x3a2008 });
    }
    head.add(g);
    return g;
  }

  /**
   * Baños contra la pared derecha: dos cabinas de azulejo con la puerta hacia el salón, cartel y una luz
   * de «ocupado» encima de cada puerta. Dentro te escondes del que te persigue.
   */
  private buildBath() {
    const { x, z, w, d, h } = BATH;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.scene.add(g);
    const tile = 0xe2ecf2;
    const trim = 0x3fd8e8;
    // Laterales, tabique del medio y techo.
    for (const s of [-1, 1]) this.put(g, w, h, 0.12, tile, 0, h / 2, (s * d) / 2);
    this.put(g, w, h, 0.08, tile, 0, h / 2, 0);
    this.put(g, w + 0.1, 0.12, d + 0.1, 0xc8d4dc, 0, h, 0);
    // Frente (hacia el salón, −X) con dos huecos de puerta de 0,9 m en z = ±1,1.
    const fx = -w / 2;
    for (const [pz, pd] of [[-1.875, 0.65], [0, 1.3], [1.875, 0.65]] as const) this.put(g, 0.12, h, pd, tile, fx, h / 2, pz);
    for (const s of [-1, 1]) {
      this.put(g, 0.12, h - 2.0, 0.9, tile, fx, 2.0 + (h - 2.0) / 2, s * 1.1);
      // Puerta (azul la de la izquierda, rosa la de la derecha) con su pomo dorado.
      this.put(g, 0.06, 1.95, 0.86, s < 0 ? 0x3a7ac8 : 0xe85a8a, fx - 0.05, 0.98, s * 1.1);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), this.paint(0xffce4a, { emissive: 0x3a2a04 }));
      knob.position.set(fx - 0.1, 1.0, s * 1.1 + 0.3);
      g.add(knob);
      // Luz de «ocupado»: verde libre, roja si hay alguien escondido.
      const lampMat = new THREE.MeshBasicMaterial({ color: 0x2ebd6c });
      this.bathLamps.push(lampMat);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), lampMat);
      lamp.position.set(fx - 0.1, 2.2, s * 1.1);
      g.add(lamp);
    }
    // Zócalo turquesa y cartel «BAÑOS» mirando al salón.
    this.put(g, 0.14, 0.12, d, trim, fx - 0.02, 0.06, 0, { emissive: 0x0a3a40 });
    const sign = new CanvasLabel(256, 64);
    sign.set("BAÑOS", "#3fd8e8");
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true }));
    plate.position.set(fx - 0.08, h + 0.45, 0);
    plate.rotation.y = -Math.PI / 2;
    g.add(plate);
    const glow = glowSprite(0x3fd8e8, 2.6, 0.25);
    glow.position.set(fx - 0.3, h + 0.45, 0);
    g.add(glow);
  }

  /**
   * Bóveda en la pared del fondo: marco de acero, puerta redonda con volante y remaches, lingotes
   * detrás, cartel, dos paneles en el suelo (uno por jugador) y una luz de alarma.
   */
  private buildVault() {
    const g = new THREE.Group();
    g.position.set(VAULT.x, UPPER_Y + VAULT.y, VAULT.z);
    this.scene.add(g);
    const steel = 0x8a90a0;
    this.put(g, 3.0, 2.7, 0.2, 0x4a4a58, 0, 0, 0);
    // Lingotes dentro (se ven al abrir).
    for (let i = 0; i < 6; i++) {
      this.put(g, 0.42, 0.16, 0.22, 0xffce4a, -0.5 + (i % 3) * 0.48, -0.75 + Math.floor(i / 3) * 0.17, 0.14, { emissive: 0x5a3a04 });
    }
    // Puerta redonda en una bisagra a la izquierda (se abre hacia el salón).
    const hinge = new THREE.Group();
    hinge.position.set(-1.15, 0, 0.14);
    g.add(hinge);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.22, 36), this.paint(steel, { emissive: 0x14161c }));
    door.rotation.x = Math.PI / 2;
    door.position.set(1.15, 0, 0.11);
    hinge.add(door);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), this.paint(0x5a5e6a));
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(1.15 + Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.24);
      hinge.add(bolt);
    }
    const wheel = new THREE.Group();
    wheel.position.set(1.15, 0, 0.28);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.045, 8, 24), this.paint(0xe0a848, { emissive: 0x3a2008 }));
    wheel.add(ring);
    for (let k = 0; k < 3; k++) {
      const spoke = this.put(wheel, 0.76, 0.05, 0.05, 0xe0a848, 0, 0, 0, { emissive: 0x3a2008 });
      spoke.rotation.z = (k / 3) * Math.PI;
    }
    hinge.add(wheel);
    this.vaultHinge = hinge;
    this.vaultWheel = wheel;
    // Cartel y alarma.
    const sign = new CanvasLabel(256, 64);
    sign.set("BÓVEDA", "#ffce4a");
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true }));
    plate.position.set(0, 1.7, 0.12);
    g.add(plate);
    const alarm = glowSprite(0xff3040, 2.4, 0);
    alarm.position.set(0, 2.2, 0.3);
    g.add(alarm);
    this.vaultAlarm = alarm;
    // Paneles del suelo: grises vacíos, verdes cuando alguien los pisa.
    for (const [px, pz] of VAULT_PADS) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x5a5a68 });
      this.vaultPads.push(mat);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), mat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(px, UPPER_Y + 0.03, pz);
      this.scene.add(pad);
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.8, 24), this.paint(0xffce4a, { basic: true }));
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(px, UPPER_Y + 0.031, pz);
      this.scene.add(rim);
    }
  }

  // --- Ventanilla, palanca, timbre y alarma ------------------------------------------------
  /**
   * La ventanilla: mostrador de madera con marco burdeos contra la pared sur del vestíbulo, reja que sube y baja,
   * cartel «VENTANILLA» con su estado, lámpara verde/amarilla/roja y montones de monedas. No es la tienda
   * (la barra del bar): aquí solo se deposita para apostar.
   */
  private buildWindow() {
    const g = new THREE.Group();
    g.position.set(WINDOW[0], 0, WINDOW[1]);
    g.rotation.y = Math.PI;
    this.scene.add(g);
    this.put(g, 4.6, 1.1, 0.9, 0x6a2a1e, 0, 0.55, 0.35);
    this.put(g, 5.0, 0.14, 1.25, 0xd89a52, 0, 1.17, 0.42);
    this.put(g, 0.3, 3.1, 0.5, 0x8a1a34, -2.2, 1.55, 0);
    this.put(g, 0.3, 3.1, 0.5, 0x8a1a34, 2.2, 1.55, 0);
    this.put(g, 4.7, 0.7, 0.5, 0x8a1a34, 0, 3.15, 0);
    // Hueco oscuro y, dentro, el cajero (una silueta) con un montón de monedas.
    this.put(g, 4.1, 1.55, 0.06, 0x140a18, 0, 2.0, -0.2);
    this.put(g, 0.7, 0.9, 0.3, 0x2a3a8a, 0.9, 1.75, -0.05);
    this.sphere(g, 0.26, 0xf2cc4a, 0.9, 2.35, -0.05);
    for (let k = 0; k < 4; k++) this.put(g, 0.5, 0.07 + k * 0.001, 0.5, 0xffce4a, -1.2 + (k % 2) * 0.1, 1.28 + k * 0.08, 0.2, { emissive: 0x4a3004 });
    // Reja: se recoge hacia el dintel cuando la ventanilla abre.
    const shutter = this.put(g, 4.2, 1.6, 0.1, 0x6a6a7a, 0, 2.1, 0.3, { emissive: 0x14161c });
    for (let k = 0; k < 8; k++) this.put(shutter, 4.2, 0.04, 0.12, 0x3a3a46, 0, -0.7 + k * 0.2, 0);
    this.winShutter = shutter;
    // Cartel del dintel y estado.
    const sign = new CanvasLabel(512, 128);
    sign.set("VENTANILLA", "#ffd23a");
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true }));
    plate.position.set(0, 3.15, 0.27);
    g.add(plate);
    const status = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: this.winLabel.texture, transparent: true }));
    status.position.set(0, 0.8, 0.82);
    g.add(status);
    const lamp = new THREE.MeshBasicMaterial({ color: 0x2ebd6c });
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.14), lamp);
    bulb.position.set(-1.95, 3.15, 0.3);
    g.add(bulb);
    this.winLamp = lamp;
    const glow = glowSprite(0x2ebd6c, 1.6, 0.35);
    glow.position.set(-1.95, 3.15, 0.5);
    g.add(glow);
    this.winGlow = glow;
    this.zoneSign("DEPÓSITOS · NO ES LA TIENDA", "#ff8a24", WINDOW[0], 4.35, WINDOW[1] - 0.45, Math.PI, 4.2);
  }

  /**
   * Palanca de la reja (pared este), timbre señuelo (pared oeste) y panel de la alarma de cuatro botones de colores
   * (mirador del entrepiso). Cada uno cambia de aspecto con el estado real que manda el anfitrión.
   */
  private buildMechanisms() {
    // --- Palanca ---
    const lg = new THREE.Group();
    lg.position.set(LEVER[0] + 0.35, 0, LEVER[1]);
    lg.rotation.y = -Math.PI / 2;
    this.scene.add(lg);
    this.put(lg, 1.0, 1.5, 0.2, 0x4a4a58, 0, 1.4, 0);
    this.put(lg, 0.16, 0.9, 0.06, 0x120810, 0, 1.4, 0.12);
    const arm = new THREE.Group();
    arm.position.set(0, 1.4, 0.16);
    this.put(arm, 0.1, 0.8, 0.1, 0xd8d8e0, 0, 0.4, 0);
    this.sphere(arm, 0.14, 0xe83e54, 0, 0.84, 0);
    lg.add(arm);
    this.leverArm = arm;
    const lamp = new THREE.MeshBasicMaterial({ color: 0xff3040 });
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.1), lamp);
    bulb.position.set(0, 2.35, 0.12);
    lg.add(bulb);
    this.leverLamp = lamp;
    const lsign = new CanvasLabel(256, 64);
    lsign.set("PALANCA · REJA", "#ffce4a");
    const lplate = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshBasicMaterial({ map: lsign.texture, transparent: true }));
    lplate.position.set(0, 2.8, 0.12);
    lg.add(lplate);
    // --- Timbre ---
    const bg = new THREE.Group();
    bg.position.set(LURE[0] - 0.35, 0, LURE[1]);
    bg.rotation.y = Math.PI / 2;
    this.scene.add(bg);
    this.put(bg, 0.9, 1.1, 0.2, 0x4a4a58, 0, 1.4, 0);
    const bmat = new THREE.MeshBasicMaterial({ color: 0xe83e54 });
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.18), bmat);
    btn.position.set(0, 1.4, 0.16);
    bg.add(btn);
    this.lureBtn = bmat;
    const bglow = glowSprite(0xe83e54, 1.6, 0.35);
    bglow.position.set(0, 1.4, 0.4);
    bg.add(bglow);
    this.lureGlow = bglow;
    const bsign = new CanvasLabel(256, 64);
    bsign.set("TIMBRE", "#ffce4a");
    const bplate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), new THREE.MeshBasicMaterial({ map: bsign.texture, transparent: true }));
    bplate.position.set(0, 2.2, 0.12);
    bg.add(bplate);
    // --- Panel de la alarma (entrepiso, pared sur) ---
    const pg = new THREE.Group();
    pg.position.set(0, UPPER_Y, SEQ_Z + 0.3);
    pg.rotation.y = Math.PI;
    this.scene.add(pg);
    this.put(pg, 11, 1.7, 0.2, 0x2a1e34, 0, 1.4, 0);
    const colors = [0xe83e54, 0x4a7aff, 0x3ad06a, 0xffce4a];
    SEQ_X.forEach((x, k) => {
      const mat = new THREE.MeshBasicMaterial({ color: colors[k] });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.2), mat);
      b.position.set(-x, 1.4, 0.16);
      pg.add(b);
      const label = new CanvasLabel(64, 64);
      label.set("", "#ffffff");
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true }));
      num.position.set(-x, 2.45, 0.12);
      pg.add(num);
      this.seqBtns.push({ mat, label, color: colors[k] });
    });
    const asign = new CanvasLabel(512, 128);
    asign.set("ALARMA · SECUENCIA", "#ff6a7a");
    const aplate = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: asign.texture, transparent: true }));
    aplate.position.set(0, 3.0, 0.12);
    pg.add(aplate);
    const alarm = glowSprite(0xff3040, 2.6, 0);
    alarm.position.set(0, 2.3, 0.5);
    pg.add(alarm);
    this.seqAlarm = alarm;
  }

  /** Reja, lámpara, palanca, timbre y botones según el estado de la ventanilla y los mecanismos. */
  private tickMechanisms(s: CasinoSnap, time: number) {
    const vn = s.vn;
    const mc = s.mc ?? [];
    if (vn && this.winShutter && this.winLamp && this.winGlow) {
      const gate = vn[0];
      // Reja: sube al abrir (el hueco se queda libre) y baja al cerrar o bloquear.
      const open = gate === 0 ? 1 : 0;
      const sy = lerp(this.winShutter.scale.y, open ? 0.12 : 1, 0.12);
      this.winShutter.scale.y = sy;
      this.winShutter.position.y = 2.9 - 0.8 * sy;
      const c = gate === WIN_BLOCKED ? 0xff3040 : gate === WIN_CLOSED ? 0xffc040 : vn[6] ? 0xff8a24 : 0x2ebd6c;
      this.winLamp.color.setHex(c);
      this.winGlow.material.color.setHex(c);
      this.winGlow.material.opacity = gate === WIN_BLOCKED ? 0.35 + Math.abs(Math.sin(time * 10)) * 0.5 : 0.35;
      this.winLabel.set(gate === WIN_BLOCKED ? "BLOQUEADA" : gate === WIN_CLOSED ? "CERRADA" : vn[6] ? "¡VIGILADA!" : "ABIERTA", `#${c.toString(16).padStart(6, "0")}`);
    }
    if (this.leverArm && this.leverLamp) {
      const open = (mc[0] ?? 0) > 0;
      this.leverArm.rotation.z = lerp(this.leverArm.rotation.z, open ? -0.9 : 0.9, 0.12);
      this.leverLamp.color.setHex(open ? 0x2ebd6c : 0xff3040);
    }
    if (this.lureBtn && this.lureGlow) {
      const active = (mc[1] ?? 0) > 0;
      const cooling = (mc[2] ?? 0) > 0;
      this.lureBtn.color.setHex(active ? 0x2ebd6c : cooling ? 0x5a5a68 : 0xe83e54);
      this.lureGlow.material.color.setHex(active ? 0x2ebd6c : 0xe83e54);
      this.lureGlow.material.opacity = cooling && !active ? 0.05 : 0.3 + Math.sin(time * 4) * 0.1;
    }
    if (this.seqAlarm) {
      const alarm = (mc[3] ?? 0) > 0;
      const order = mc.slice(5);
      this.seqAlarm.material.opacity = alarm ? 0.4 + Math.abs(Math.sin(time * 9)) * 0.5 : 0;
      this.seqBtns.forEach((b, k) => {
        const at = order.indexOf(k);
        // Con la alarma, cada botón enseña su número en la secuencia y los ya acertados se apagan.
        b.mat.color.setHex(alarm ? (at >= 0 && at < (mc[4] ?? 0) ? 0x3a3a44 : b.color) : (b.color >> 1) & 0x7f7f7f);
        b.label.set(alarm && at >= 0 ? `${at + 1}` : "", "#ffffff");
      });
    }
  }

  /** Borrachos: tambaleándose, desplomados sobre la mesa, dormidos en el suelo o grogui, según el anfitrión. */
  private animateDrunks(s: CasinoSnap, time: number) {
    const list = s.dk ?? [];
    this.drunks.forEach((c, k) => {
      const d = list[k];
      if (!d || d[3] === DR_GONE) {
        c.root.visible = false;
        return;
      }
      c.root.visible = true;
      const [x, z, yaw, state] = d;
      const base = (d[5] ?? 0) * UPPER_Y;
      const moved = Math.hypot(x - c.lastX, z - c.lastZ);
      c.lastX = x;
      c.lastZ = z;
      if (moved < 1.5) c.stride += moved;
      c.root.position.set(x, base, z);
      c.root.rotation.set(0, yaw, 0);
      const walking = moved > 0.001;
      c.legs.forEach((leg, i) => (leg.rotation.x = walking ? Math.sin(c.stride * 3.2) * 0.7 * (i === 0 ? 1 : -1) : 0));
      c.arms[0].rotation.x = walking ? Math.sin(c.stride * 3.2) * 0.5 : -0.1;
      c.arms[1].rotation.x = -0.9 + Math.sin(time * 3 + k) * 0.15;
      c.head.rotation.x = 0;
      if (state === DR_SIT) {
        // Desplomado sobre la mesa: inclinado hacia delante con los brazos colgando.
        c.root.rotation.x = 1.15;
        c.root.position.y = base + 0.95 + Math.sin(time * 1.4 + k) * 0.02;
        c.arms.forEach((a) => (a.rotation.x = -2.6));
        c.head.rotation.z = Math.sin(time * 1.1 + k) * 0.2;
      } else if (state === DR_ASLEEP) {
        // Tumbado de lado, respirando.
        c.root.rotation.z = 1.5;
        c.root.position.y = base + 0.32 + Math.sin(time * 2 + k) * 0.03;
        c.legs.forEach((leg) => (leg.rotation.x = 0.2));
        c.arms.forEach((a) => (a.rotation.x = 0.1));
      } else if (state === DR_GROGGY) {
        // Aturdido: sentado, con la cabeza dando vueltas.
        c.root.rotation.x = -0.25;
        c.root.position.y = base + 0.18;
        c.head.rotation.y = Math.sin(time * 6 + k) * 0.5;
        c.arms.forEach((a, i) => (a.rotation.x = -0.4 + Math.sin(time * 5 + i) * 0.2));
      } else {
        // Andando a trompicones: bamboleo de lado a lado.
        c.root.rotation.z = Math.sin(time * 4.5 + k) * 0.16;
        c.root.position.x += Math.cos(yaw) * Math.sin(time * 3 + k) * 0.05;
        c.head.rotation.z = Math.sin(time * 3.7 + k) * 0.18;
      }
    });
  }

  /** Bóveda y baño según el estado: volante, puerta, paneles, alarma y luces de «ocupado». */
  private tickProps(s: CasinoSnap, time: number) {
    this.tickMechanisms(s, time);
    const vt = s.vt;
    if (vt && this.vaultHinge && this.vaultWheel && this.vaultAlarm) {
      const [progress, cd, a, b] = vt;
      this.vaultWheel.rotation.z = progress * Math.PI * 6;
      this.vaultHinge.rotation.y = lerp(this.vaultHinge.rotation.y, cd > 0 ? -1.9 : 0, 0.06);
      this.vaultPads.forEach((m, k) => m.color.setHex(cd > 0 ? 0x3a3a44 : (k === 0 ? a : b) >= 0 ? 0x2ebd6c : 0x5a5a68));
      // Alarma: parpadea los primeros segundos después de abrirla.
      this.vaultAlarm.material.opacity = cd > VAULT_CD - 10 ? 0.4 + Math.abs(Math.sin(time * 10)) * 0.6 : 0;
    }
    const busy = (s.hd ?? []).filter((v) => v > 0).length;
    this.bathLamps.forEach((m, k) => m.color.setHex(k < busy ? 0xff3040 : 0x2ebd6c));
  }

  /** Palmera de dibujo animado en maceta (como las del vestíbulo del casino). */
  private palm(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.38, 0.8, 10), this.paint(0xc8324a));
    pot.position.y = 0.4;
    g.add(pot);
    this.put(g, 1.06, 0.12, 1.06, 0xe0a848, 0, 0.82, 0, { emissive: 0x2a1804 });
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.14 - i * 0.012, 0.17 - i * 0.012, 0.6, 7), this.paint(i % 2 ? 0x8a5a32 : 0x6a4426));
      seg.position.set(Math.sin(i * 0.4) * 0.12, 1.1 + i * 0.58, 0);
      seg.rotation.z = -0.08;
      g.add(seg);
    }
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Group();
      leaf.position.set(0.2, 3.9, 0);
      leaf.rotation.y = (k / 7) * Math.PI * 2;
      const blade = this.put(leaf, 1.7, 0.06, 0.42, k % 2 ? 0x3aa848 : 0x4ac25a, 0.85, 0, 0);
      blade.rotation.z = -0.45;
      g.add(leaf);
    }
    this.scene.add(g);
  }

  // --- Muñecos -----------------------------------------------------------------------------
  /** Esfera colocada (ojos, manos, nariz): achatada en Z si se pide. */
  private sphere(parent: THREE.Object3D, r: number, color: number, x: number, y: number, z: number,
    opts?: { emissive?: number; basic?: boolean }, flat = 1): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), this.paint(color, opts));
    m.position.set(x, y, z);
    m.scale.z = flat;
    parent.add(m);
    return m;
  }

  /**
   * Muñeco «poroto» al estilo de Gamble With Your Friends: cuerpo de cápsula del color del jugador, ojos
   * saltones enormes, guantes redondos, piececitos y sombrero. El crupier es un botones amarillo con
   * esmoquin, pajarita roja, bigote y fez. La cara mira al -Z (hacia donde anda).
   */
  private character(color: number, me: boolean, croupier = false, guard = false): Character {
    const root = new THREE.Group();
    let hat: THREE.Object3D | null = null;
    const looks: THREE.Group[] = [];
    // Con luz propia en el crupier: detrás de la mesa casi no llega la luz.
    const lit = (e: number) => (croupier ? { emissive: e } : undefined);
    const body = croupier ? 0xf2cc4a : color;
    const glove = 0xfff2dc;
    const dark = 0x2a0e1c;
    // Piececitos (las «piernas» que se balancean al andar).
    const legs: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.17 * s, 0.36, 0);
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), this.paint(croupier ? 0x1c1a24 : dark, lit(0x141218)));
      stub.position.y = -0.15;
      hip.add(stub);
      const foot = this.sphere(hip, 0.14, croupier ? 0x0e0e14 : dark, 0, -0.31, -0.06, lit(0x0a0a10));
      foot.scale.set(1, 0.6, 1.5);
      root.add(hip);
      legs.push(hip);
    }
    // Cuerpo de cápsula.
    const bean = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.76, 8, 18), this.paint(body, lit(0x4a3a10)));
    bean.position.y = 1.05;
    root.add(bean);
    if (croupier) {
      // Esmoquin: la mitad baja del poroto, con pechera blanca, botones y pajarita roja.
      const suit = new THREE.Mesh(new THREE.CylinderGeometry(0.445, 0.445, 0.86, 18, 1, true), this.paint(0x1c1a24, lit(0x22202c)));
      suit.position.y = 0.72;
      root.add(suit);
      const skirt = new THREE.Mesh(new THREE.SphereGeometry(0.445, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.paint(0x1c1a24, lit(0x22202c)));
      skirt.position.y = 0.29;
      root.add(skirt);
      this.put(root, 0.32, 0.5, 0.05, 0xf8f4ee, 0, 0.92, -0.42, lit(0x6a6660));
      for (let k = 0; k < 3; k++) this.sphere(root, 0.035, 0x141018, 0, 0.98 - k * 0.15, -0.46);
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 8), this.paint(0xd8243a, lit(0x3a0810)));
        wing.rotation.z = (s * Math.PI) / 2;
        wing.position.set(0.08 * s, 1.2, -0.45);
        root.add(wing);
      }
      this.sphere(root, 0.045, 0xd8243a, 0, 1.2, -0.46, lit(0x3a0810));
    }
    // Brazos finos con guante redondo (la mano es lo que se ve de lejos).
    const arms: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.44 * s, 1.2, 0);
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.42, 8), this.paint(croupier ? 0x1c1a24 : body, lit(0x22202c)));
      limb.position.y = -0.21;
      shoulder.add(limb);
      this.sphere(shoulder, 0.14, glove, 0, -0.46, 0, lit(0x5a5048));
      root.add(shoulder);
      arms.push(shoulder);
    }
    // Cara: ojos saltones con pupila, cejas, nariz redonda y sombrero. Gira entera (el crupier mira alrededor).
    const head = new THREE.Group();
    head.position.y = 1.55;
    root.add(head);
    for (const s of [-1, 1]) {
      this.sphere(head, 0.16, 0xffffff, 0.16 * s, 0.05, -0.33, lit(0x7a7a7a), 0.7);
      this.sphere(head, 0.065, 0x141018, 0.15 * s, 0.03, -0.44);
      // Brillo del ojo.
      this.sphere(head, 0.02, 0xffffff, 0.13 * s, 0.07, -0.49, { basic: true });
      const brow = this.put(head, 0.18, 0.045, 0.05, dark, 0.16 * s, 0.25, -0.38);
      brow.rotation.z = -0.18 * s;
    }
    this.sphere(head, 0.075, croupier ? 0xff6a5a : 0xff7a8a, 0, -0.12, -0.42, lit(0x3a1410));
    if (croupier) {
      // Bigote de manillar y fez con borla.
      for (const s of [-1, 1]) {
        const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), this.paint(0x2a1a12));
        tip.rotation.z = (s * Math.PI) / 2.6;
        tip.position.set(0.1 * s, -0.2, -0.4);
        head.add(tip);
      }
      const fez = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 16), this.paint(0xb81a2a, lit(0x3a0810)));
      fez.position.set(0, 0.48, 0);
      head.add(fez);
      this.put(head, 0.03, 0.18, 0.03, 0x141018, 0.12, 0.55, 0.08);
      this.sphere(head, 0.05, 0x141018, 0.14, 0.45, 0.1);
    } else if (guard) {
      // Gorra de policía con visera y escudo dorado, gafas de sol y placa en el pecho.
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.27, 0.18, 16), this.paint(0x141c3a));
      cap.position.set(0, 0.42, 0.02);
      head.add(cap);
      const visor = this.put(head, 0.42, 0.04, 0.2, 0x0a0e1e, 0, 0.34, -0.3);
      visor.rotation.x = 0.25;
      this.put(head, 0.1, 0.1, 0.03, 0xffce4a, 0, 0.44, -0.3, { emissive: 0x3a2a04 });
      this.put(head, 0.56, 0.12, 0.05, 0x0a0a10, 0, 0.05, -0.5);
      this.put(root, 0.12, 0.14, 0.03, 0xffce4a, 0.17, 1.15, -0.42, { emissive: 0x3a2a04 });
    } else {
      // Bombín oscuro con cinta del color del jugador.
      hat = new THREE.Group();
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.26, 16), this.paint(dark));
      crown.position.set(0, 0.5, 0.02);
      hat.add(crown);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 18), this.paint(dark));
      brim.position.set(0, 0.38, 0.02);
      hat.add(brim);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.07, 16), this.paint(0xfff2dc));
      band.position.set(0, 0.42, 0.02);
      hat.add(band);
      head.add(hat);
      // Los tres disfraces de la boutique, apagados hasta que se compra uno.
      for (let k = 1; k <= 3; k++) {
        const look = this.disguiseParts(head, k);
        look.visible = false;
        looks.push(look);
      }
    }
    // Ficha dorada en el pecho del jugador propio.
    if (!croupier && me) {
      const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 16), this.paint(0xffce4a, { basic: true }));
      chip.rotation.x = Math.PI / 2;
      chip.position.set(0, 1.02, -0.43);
      root.add(chip);
    }
    // Bate en la mano derecha (los jugadores lo llevan siempre; el crupier no).
    let bat: THREE.Object3D | null = null;
    if (!croupier) {
      const stick = new THREE.Group();
      this.put(stick, 0.07, 0.26, 0.07, 0x2a1a12, 0, -0.02, 0, { emissive: 0x0a0608 });
      this.put(stick, 0.1, 0.5, 0.1, 0xc89a5a, 0, -0.4, 0, { emissive: 0x201408 });
      stick.name = "bate";
      stick.position.set(0, -0.48, -0.02);
      stick.rotation.x = -0.35;
      arms[1].add(stick);
      bat = stick;
    }
    // Móvil del crupier: se lo lleva a la cara cuando se distrae.
    let phone: THREE.Object3D | null = null;
    if (croupier) {
      phone = this.put(arms[1], 0.12, 0.2, 0.03, 0x3fd8e8, 0, -0.5, -0.14, { basic: true });
      phone.visible = false;
    }
    this.scene.add(root);
    // Lata de basura en el guante derecho (solo los jugadores la cogen).
    let held: THREE.Object3D | null = null;
    if (!croupier && !guard) {
      held = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10), this.paint(0x6a9a3a, { emissive: 0x1a2a0a }));
      held.position.set(0, -0.5, -0.15);
      held.visible = false;
      arms[1].add(held);
    }
    return { root, legs, arms, head, bat, phone, held, hat, looks, stride: 0, lastX: 0, lastZ: 0 };
  }

  // --- Mesas -------------------------------------------------------------------------------
  private buildTable(def: TableDef): TableRig {
    const g = new THREE.Group();
    const base = def.lv * UPPER_Y;
    g.position.set(def.x, base, def.z);
    g.rotation.y = def.yaw;
    this.scene.add(g);
    const neon = rgb(def.color);
    // Mueble de dibujo animado: base burdeos con moldura dorada, tablero de madera y baranda acolchada.
    this.put(g, 3.3, 0.86, 2.0, 0x5a1a2a, 0, 0.47, 0);
    this.put(g, 3.36, 0.08, 2.06, 0xe0a848, 0, 0.62, 0, { emissive: 0x3a2008 });
    this.put(g, 3.4, 0.08, 2.1, 0x2a0e1c, 0, 0.04, 0);
    // Tira de neón al ras del suelo: el color de la mesa se reconoce desde lejos.
    this.put(g, 3.42, 0.04, 2.12, neon, 0, 0.1, 0, { basic: true });
    this.put(g, 3.6, 0.14, 2.3, 0x8a4a28, 0, 0.97, 0);
    // Fieltro del color de la mesa (vivo, no apagado).
    const felt = rgb([def.color[0] * 0.55, def.color[1] * 0.55, def.color[2] * 0.55]);
    this.put(g, 3.0, 0.04, 1.7, felt, 0, 1.08, 0);
    for (const [w, d, x, z] of [[3.6, 0.3, 0, 1.0], [3.6, 0.3, 0, -1.0], [0.3, 1.7, 1.65, 0], [0.3, 1.7, -1.65, 0]] as const) {
      this.put(g, w, 0.12, d, 0x4a1424, x, 1.1, z);
    }
    // Cartel encima (detrás de la pieza: si va delante, tapa el juego al sentarse).
    const tall = def.kind === "plinko" || def.kind === "slots";
    const signY = 2.95;
    const signZ = -1.0;
    const label = new CanvasLabel(256, 64);
    label.set(def.label, `rgb(${def.color[0]},${def.color[1]},${def.color[2]})`);
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.65),
      new THREE.MeshBasicMaterial({ map: label.texture, transparent: true }),
    );
    signMesh.position.set(0, signY, signZ);
    g.add(signMesh);
    // Poste del cartel.
    this.put(g, 0.1, signY - 1.05, 0.1, 0xe0a848, 0, (signY + 1.05) / 2, signZ, { emissive: 0x2a1804 });
    // Foco de la mesa: la ilumina con su color para que se vea desde lejos.
    const lamp = new THREE.PointLight(neon, 26, 9, 2);
    lamp.position.set(0, 2.5, 0.6);
    g.add(lamp);
    // Halo de la mesa (se enciende cuando estás cerca o jugando).
    const glowMat = new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.0 });
    const glow = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.5, 24), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    g.add(glow);
    // Crupier detrás (mirando a la mesa).
    const [cx, cz] = croupierSpot(def);
    const c = this.character(0x1a1a24, false, true);
    c.root.scale.setScalar(1.15);
    c.root.position.set(cx, base, cz);
    c.root.rotation.y = def.yaw + Math.PI;
    // Halo del cartel de la mesa (neón).
    // Aura de la mesa caliente (apagada hasta que le toca).
    const hotGlow = glowSprite(0xff7a20, 6, 0);
    hotGlow.position.set(0, 1.4, 0);
    g.add(hotGlow);
    const signGlow = glowSprite(neon, 3.2, 0.32);
    signGlow.position.set(0, signY, signZ + 0.05);
    g.add(signGlow);
    // Taburetes en los cuatro asientos.
    for (let i = 0; i < 4; i++) {
      const lx = (i - 1.5) * 1.15;
      const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.14, 14), this.paint(0xc8324a));
      cushion.position.set(lx, 0.54, 1.95);
      g.add(cushion);
      this.put(g, 0.08, 0.5, 0.08, 0xe0a848, lx, 0.26, 1.95, { emissive: 0x2a1804 });
      this.put(g, 0.46, 0.42, 0.08, 0x8a1a34, lx, 0.78, 2.16);
    }
    // Paño con filo del color de la mesa y pilas de fichas en las esquinas.
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      this.put(g, 1.12, 0.012, 0.012, neon, dx * 1.2, 1.085, dz * 0.5, { basic: true });
      this.put(g, 0.012, 0.012, 0.72, neon, dx * 1.76, 1.085, dz * 0.0, { basic: true });
    }
    const chipColors = [0xffce4a, 0xff4f9a, 0x3fd8e8, 0x4a6cff];
    // En las mesas con máquina (plinko, tragaperras) todas las fichas van detrás: delante taparían el juego.
    for (let s = 0; s < 4; s++) {
      const sx = (s % 2 === 0 ? -1 : 1) * (0.95 + (s > 1 ? 0.28 : 0));
      const sz = tall ? -0.62 - (s % 2) * 0.16 : (s < 2 ? -1 : 1) * 0.5;
      const many = 3 + (s % 3);
      for (let k = 0; k < many; k++) {
        const chip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 0.045, 12),
          this.paint(chipColors[(s + k) % 4], { emissive: 0x141414 }),
        );
        chip.position.set(sx, 1.125 + k * 0.045, sz);
        chip.rotation.y = k * 0.6;
        g.add(chip);
      }
    }
    // Sin foco propio para el crupier: con doce mesas serían doce luces más (cada píxel las recorre todas)
    // y sus materiales ya tienen brillo propio para no quedarse en penumbra detrás de la mesa.
    // --- Piezas del juego ---------------------------------------------------------------
    let spin: THREE.Object3D | null = null;
    let coin: THREE.Object3D | null = null;
    let ball: THREE.Mesh | null = null;
    const reels: THREE.Mesh[] = [];
    const reelMats: THREE.MeshLambertMaterial[] = [];
    const dice: THREE.Group[] = [];
    const lit: THREE.MeshBasicMaterial[] = [];
    const ducks: THREE.Object3D[] = [];
    let pieceGlow: THREE.Sprite | null = null;
    /** Halo encima de la pieza del juego (se enciende al girar y al pagar). */
    const halo = (x: number, y: number, z: number, size: number) => {
      pieceGlow = glowSprite(neon, size, 0);
      pieceGlow.position.set(x, y, z);
      g.add(pieceGlow);
    };

    if (def.kind === "ruleta") {
      // Plato con los 13 sectores y sus números, aro de madera y cono central.
      const wheel = new THREE.Group();
      wheel.position.set(0, 1.17, -0.02);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.82, 64),
        new THREE.MeshLambertMaterial({ map: this.texture("ruleta", 512, 512, drawWheel), emissive: 0x2c2836 }),
      );
      disc.rotation.x = -Math.PI / 2;
      wheel.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.055, 10, 44), this.paint(0x6b4a20, { emissive: 0x201406 }));
      rim.rotation.x = -Math.PI / 2;
      wheel.add(rim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.13, 12), this.paint(0xd8a83a, { emissive: 0x342608 }));
      cone.position.y = 0.085;
      wheel.add(cone);
      g.add(wheel);
      spin = wheel;
      // La bola va fuera del grupo que gira: corre por el aro y cae en la casilla ganadora.
      ball = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), this.paint(0xfdfdff, { basic: true }));
      ball.position.set(0, 1.24, 0.66);
      ball.add(glowSprite(0xfff2c8, 0.62, 0.8));
      g.add(ball);
      halo(0, 1.7, -0.02, 2.4);
    } else if (def.kind === "plinko") {
      // Tablero con marco de neón, clavijas de verdad y nueve bocas con su multiplicador.
      const board = new THREE.Group();
      board.position.set(0, 2.06, -0.5);
      // Ligeramente inclinado hacia el jugador: desde la silla se ven las bocas y no las tapa la mesa.
      board.rotation.x = 0.16;
      this.put(board, 2.12, 1.9, 0.1, 0x3a1a3a, 0, 0, -0.07);
      this.put(board, 2.4, 2.18, 0.08, 0x8a4a28, 0, 0, -0.13);
      for (const [w, h, x, y] of [[2.24, 0.08, 0, 0.96], [2.24, 0.08, 0, -0.96], [0.08, 1.98, -1.08, 0], [0.08, 1.98, 1.08, 0]] as const) {
        this.put(board, w, h, 0.16, neon, x, y, -0.02, { basic: true });
      }
      for (let r = 0; r < 7; r++) {
        for (let k = 0; k <= r; k++) {
          const peg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.036, 0.036, 0.16, 8),
            this.paint(0xaebccd, { emissive: 0x141a24 }),
          );
          peg.rotation.x = Math.PI / 2;
          peg.position.set((k - r / 2) * 0.255, 0.68 - r * 0.195, 0.03);
          board.add(peg);
        }
      }
      // Bocas: fondo, separadores y el cartel del multiplicador.
      for (let b = 0; b < 9; b++) {
        const x = (b - 4) * 0.235;
        const top = PLINKO_MULT[b] >= 3;
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 });
        lit.push(mat);
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.235, 0.19), mat);
        plate.position.set(x, -0.82, 0.06);
        board.add(plate);
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(0.235, 0.19),
          new THREE.MeshBasicMaterial({ map: this.texture(`boca-${b}`, 96, 72, (gg, w, h) => drawBucketLabel(gg, w, h, `×${PLINKO_MULT[b]}`.replace(".", ","), top)) }),
        );
        face.position.set(x, -0.82, 0.07);
        board.add(face);
        if (b > 0) this.put(board, 0.02, 0.3, 0.14, 0x24485a, x - 0.1175, -0.82, 0.02);
      }
      g.add(board);
      spin = board;
      ball = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), this.paint(0xffb040, { basic: true }));
      ball.add(glowSprite(0xff8a20, 0.7, 0.85));
      // La bola va dentro del tablero: así sigue su inclinación sin cálculos.
      ball.position.set(0, 0.72, 0.14);
      board.add(ball);
      halo(0, 1.95, -0.4, 2.6);
    } else if (def.kind === "slots") {
      // Máquina: cuerpo, marquesina, ventanas con rodillos y palanca.
      const cab = new THREE.Group();
      cab.position.set(0, 1.95, -0.35);
      this.put(cab, 1.5, 2.0, 0.66, 0x8a1a34, 0, 0, 0);
      this.put(cab, 1.62, 0.24, 0.72, 0xffce4a, 0, 1.04, 0.02, { basic: true });
      this.put(cab, 1.62, 0.16, 0.72, 0x2a0e1c, 0, -1.0, 0.02);
      // Ventana negra con el marco de neón y los tres rodillos dentro.
      this.put(cab, 1.36, 0.9, 0.12, 0x080610, 0, 0.05, 0.34);
      for (const [w, h, x, y] of [[1.42, 0.07, 0, 0.5], [1.42, 0.07, 0, -0.4], [0.05, 0.97, -0.71, 0.05], [0.05, 0.97, 0.71, 0.05]] as const) {
        const m = new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.22 });
        lit.push(m);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), m);
        bar.position.set(x, 0.05 + y, 0.4);
        cab.add(bar);
      }
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.44;
        const mat = new THREE.MeshLambertMaterial({
          map: this.texture("sim-0", 72, 132, (gg, w, h) => drawSlotSymbol(gg, w, h, 0)),
          emissive: 0x2a2a30,
        });
        reelMats.push(mat);
        const reel = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.72), mat);
        reel.position.set(x, 0.05, 0.41);
        cab.add(reel);
        reels.push(reel);
      }
      // Línea de pago (late cuando hay premio).
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xff5560, transparent: true, opacity: 0.25 });
      lit.push(lineMat);
      const payline = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.012, 0.02), lineMat);
      payline.position.set(0, 0.05, 0.47);
      cab.add(payline);
      // Palanca a la derecha y bandeja de monedas.
      this.put(cab, 0.08, 0.5, 0.08, 0x8a8a98, 0.85, 0.45, 0.2);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), this.paint(0xe83e54, { emissive: 0x2a0a10 }));
      knob.position.set(0.85, 0.76, 0.2);
      cab.add(knob);
      this.put(cab, 0.9, 0.1, 0.3, 0x140e1c, 0, -0.62, 0.34);
      g.add(cab);
      spin = cab;
      halo(0, 2.0, 0.2, 2.6);
    } else if (def.kind === "moneda") {
      // Moneda en su peana, con las dos caras dibujadas y el nombre en el paño.
      this.put(g, 1.0, 0.06, 0.52, 0x2a2438, 0, 1.11, -0.02);
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 16), this.paint(0x3c3450, { emissive: 0x141020 }));
      pedestal.position.set(0, 1.2, -0.02);
      g.add(pedestal);
      const pivot = new THREE.Group();
      pivot.position.set(0, 1.63, -0.02);
      // Canto dorado + dos discos con las caras dibujadas (el plano no gira la textura: se lee derecha).
      const coinMesh = new THREE.Group();
      const edge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.07, 40, 1, true),
        this.paint(0xc9971e, { emissive: 0x2a1c04 }),
      );
      edge.rotation.x = Math.PI / 2;
      coinMesh.add(edge);
      const faceMat = (cruz: boolean) => new THREE.MeshLambertMaterial({
        map: this.texture(cruz ? "cruz" : "cara", 256, 256, (gg, w, h) => drawCoinFace(gg, w, h, cruz)),
        emissive: 0x2a2410,
      });
      const front = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), faceMat(false));
      front.position.z = 0.036;
      coinMesh.add(front);
      const back = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), faceMat(true));
      back.position.z = -0.036;
      back.rotation.y = Math.PI;
      coinMesh.add(back);
      pivot.add(coinMesh);
      g.add(pivot);
      spin = pivot;
      coin = coinMesh;
      // Carteles de las dos caras sobre el paño.
      for (const [side, text] of [[-1, "CARA"], [1, "CRUZ"]] as const) {
        const cap = new CanvasLabel(128, 64);
        cap.set(text, side < 0 ? "#ffe08a" : "#d8d8e6");
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: cap.texture, transparent: true }));
        plate.rotation.x = -Math.PI / 2;
        plate.position.set(side * 0.78, 1.1, 0.28);
        plate.rotation.z = side < 0 ? 0.1 : -0.1;
        g.add(plate);
      }
      halo(0, 1.66, -0.02, 2.4);
    } else if (def.kind === "patos") {
      // Pista de cuatro carriles de colores, salida blanca, meta a cuadros y un pato por carril.
      const lanes = [0xe83e54, 0x4a6cff, 0x2ebd6c, 0xa894ff];
      this.put(g, 2.9, 0.03, 1.4, 0x2a5a3a, 0, 1.105, -0.05);
      this.put(g, 0.06, 0.035, 1.4, 0xffffff, -1.32, 1.12, -0.05, { basic: true });
      const finish = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 1.4),
        new THREE.MeshBasicMaterial({
          map: this.texture("meta", 32, 128, (gg, w, h) => {
            for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 4; xx++) {
              gg.fillStyle = (xx + yy) % 2 ? "#111" : "#fff";
              gg.fillRect((xx * w) / 4, (yy * h) / 16, w / 4, h / 16);
            }
          }),
        }),
      );
      finish.rotation.x = -Math.PI / 2;
      finish.position.set(1.32, 1.124, -0.05);
      g.add(finish);
      lanes.forEach((color, k) => {
        const z = -0.57 + k * 0.345;
        this.put(g, 2.6, 0.02, 0.06, color, 0, 1.125, z + 0.15, { basic: true });
        // Número del carril al principio (el mismo que la casilla «PATO N»).
        const num = new THREE.Mesh(
          new THREE.PlaneGeometry(0.2, 0.2),
          new THREE.MeshBasicMaterial({
            map: this.texture(`pato-${k}`, 64, 64, (gg, w, h) => {
              gg.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
              gg.beginPath();
              gg.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
              gg.fill();
              gg.fillStyle = "#fff";
              gg.font = "900 40px Arial Black, sans-serif";
              gg.textAlign = "center";
              gg.textBaseline = "middle";
              gg.fillText(String(k + 1), w / 2, h / 2 + 2);
            }),
            transparent: true,
          }),
        );
        num.rotation.x = -Math.PI / 2;
        num.position.set(-1.45, 1.13, z);
        g.add(num);
        // El pato: cuerpo, cabeza, pico naranja, ojos y un pañuelo del color de su carril.
        const duck = new THREE.Group();
        duck.position.set(-1.25, 1.16, z);
        const body = this.sphere(duck, 0.1, 0xfff4d8, 0, 0.06, 0, { emissive: 0x2a2418 });
        body.scale.set(1.35, 0.9, 1);
        this.sphere(duck, 0.07, 0xfff4d8, 0.09, 0.17, 0, { emissive: 0x2a2418 });
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 8), this.paint(0xff8a24, { emissive: 0x3a1a04 }));
        beak.rotation.z = -Math.PI / 2;
        beak.position.set(0.17, 0.16, 0);
        duck.add(beak);
        for (const s of [-1, 1]) this.sphere(duck, 0.015, 0x141018, 0.13, 0.19, s * 0.04);
        this.put(duck, 0.05, 0.03, 0.15, color, 0.06, 0.12, 0, { basic: true });
        g.add(duck);
        ducks.push(duck);
      });
      halo(0, 1.6, -0.05, 2.6);
    } else {
      // Bandeja de dados con borde, y dos dados con sus seis caras.
      this.put(g, 1.9, 0.05, 1.25, 0x14402a, 0, 1.11, -0.08);
      for (const [w, h, d, x, z] of [[2.0, 0.1, 0.08, 0, 0.56], [2.0, 0.1, 0.08, 0, -0.72], [0.08, 0.1, 1.3, -0.96, -0.08], [0.08, 0.1, 1.3, 0.96, -0.08]] as const) {
        this.put(g, w, h, d, 0x6b4a20, x, 1.15, z, { emissive: 0x1a1004 });
      }
      const mats = this.diceMaterials();
      for (let i = 0; i < 2; i++) {
        const grp = new THREE.Group();
        grp.position.set(i === 0 ? -0.34 : 0.34, 1.5, -0.1);
        const die = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), mats);
        die.quaternion.copy(dieRestQuat(1));
        grp.add(die);
        g.add(grp);
        dice.push(grp);
      }
      halo(0, 1.75, -0.1, 2.4);
    }
    return { def, group: g, spin, coin, ball, reels, reelMats, dice, label, croupier: c, glow: glowMat, signGlow, sign: signMesh, tallSign: tall, pieceGlow, lit, hotGlow, ducks };
  }

  // --- Animación ---------------------------------------------------------------------------
  update(v: SceneView, dt: number) {
    const s = v.s;
    // Jugadores
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      const pl = s.pl[i];
      const on = s.on[i] === 1 && pl;
      p.root.visible = !!on;
      if (!on) continue;
      const [x, z, yaw] = pl;
      const seated = pl[3] >= 0;
      const jailed = (s.ja?.[i] ?? 0) > 0;
      // En primera persona tu muñeco no se dibuja (lo ves todo desde sus ojos).
      // Escondido en el baño: no se le ve.
      // Haciendo un emote, la cámara sale de tu cabeza y tu muñeco sí se ve.
      p.root.visible = (i !== v.me || this.orbit > 0.35) && !((s.hd?.[i] ?? 0) > 0);
      const moved = Math.hypot(x - p.lastX, z - p.lastZ);
      p.lastX = x;
      p.lastZ = z;
      if (!seated && moved < 1.5) p.stride += moved;
      if (i === v.me) this.myStride = p.stride;
      // Pelea: golpe en curso, aturdido y agarrado.
      const fight = s.cg?.[i] ?? null;
      const stun = fight ? fight[0] ?? 0 : 0;
      const swing = fight ? fight[2] ?? 0 : 0;
      const grabbed = fight ? (fight[1] ?? -1) >= 0 : false;
      // Respiración: un balanceo mínimo cuando está quieto.
      const breathe = Math.sin(v.time * 2.1 + i * 1.7) * 0.018;
      const hop = pl[4] ?? 0;
      const floorY = jailed ? JAIL.y : (pl[5] ?? 0) * UPPER_Y;
      p.root.position.set(x, floorY + (seated ? -0.3 : 0) + breathe + hop, z);
      p.root.rotation.y = yaw;
      // Balanceo de piernas y brazos: mientras anda, sube y baja; quieto, respira.
      const walking = !seated && moved > 0.002;
      const swingLeg = walking ? Math.sin(p.stride * 3.2) * 0.62 : 0;
      p.legs.forEach((leg, k) => (leg.rotation.x = seated ? -1.35 : swingLeg * (k === 0 ? 1 : -1)));
      p.arms.forEach((arm, k) => {
        arm.rotation.x = seated ? -0.75 : walking ? swingLeg * (k === 0 ? -0.7 : 0.7) : 0;
        arm.rotation.z = walking ? 0 : Math.sin(v.time * 1.5 + k * 2 + i) * 0.05;
      });
      // Golpe: el brazo derecho (el del bate) barre de arriba abajo.
      if (swing > 0) {
        const prog = clamp01(1 - swing / 0.38);
        p.arms[1].rotation.x = -0.4 - Math.sin(prog * Math.PI) * 2.3;
        p.arms[1].rotation.z = 0;
      }
      // Agarrado: los brazos arriba y un temblor; aturdido: se tambalea.
      if (grabbed) {
        p.arms.forEach((arm) => (arm.rotation.x = -1.6));
        p.root.position.x += Math.sin(v.time * 26) * 0.02;
      } else if (stun > 0) {
        p.root.rotation.z = Math.sin(v.time * 22) * 0.16;
      } else {
        p.root.rotation.z = 0;
      }
      if (p.bat) p.bat.visible = !seated;
      // En el aire, las piernas recogidas; con la zancadilla, la pierna derecha estirada hacia delante.
      // En el aire, piernas recogidas (en la escalera no: ahí la altura es la del peldaño y anda normal).
      if (hop > 0.05 && !STAIRS.some((st) => onStair(st, x, z))) p.legs.forEach((leg) => (leg.rotation.x = -0.6));
      if (p.held) p.held.visible = (s.cy?.[i] ?? -1) >= 0;
      if (s.tr?.[i]) p.legs[1].rotation.x = -1.35;
      // Disfraz de la boutique: la peluca quita el bombín.
      const dg = s.dg?.[i]?.[0] ?? 0;
      p.looks.forEach((look, k) => (look.visible = dg === k + 1));
      if (p.hat) p.hat.visible = dg !== 2;
      // Emote (si no anda): bailar, saludar, festejar o burlarse.
      const em = s.em?.[i] ?? 0;
      p.root.rotation.x = 0;
      p.head.rotation.y = 0;
      if (em > 0 && !walking && !seated) this.emotePose(p, em, v.time + i);
    }
    // Lo que llevas en la mano (primera persona).
    const inJail = (s.ja?.[v.me] ?? 0) > 0;
    const prog = v.swing > 0 ? clamp01(1 - v.swing / 0.38) : 0;
    if (this.view.bat) {
      this.view.bat.visible = !inJail && v.slot === SLOT_BAT && this.orbit < 0.05;
      // Golpe de arriba abajo: primero se eleva sobre la cabeza y luego cae de frente.
      // Se mantiene casi vertical (poco giro en X) para que no se pierda de vista al bajar.
      const lift = prog < 0.2 ? prog / 0.2 : 1;
      const down = prog < 0.2 ? 0 : (prog - 0.2) / 0.8;
      this.view.bat.position.set(0.4 - down * 0.06, -0.18 + lift * 0.50 - down * 0.62, -0.75 + down * 0.12);
      this.view.bat.rotation.set(-0.18 - lift * 0.25 + down * 0.42, -0.45 + down * 0.2, 0.5 - down * 0.12);
    }
    if (this.view.hand) this.view.hand.visible = !inJail && v.slot === SLOT_HAND && this.orbit < 0.05;
    // En la mano: la basura de la celda o la que has cogido por el casino.
    if (this.view.trash) this.view.trash.visible = inJail ? v.trashTaken >= 0 : v.carry;
    // La basura que llevas en la mano desaparece del suelo.
    for (let k = 0; k < this.jailTrash.length; k++) this.jailTrash[k].visible = k !== v.trashTaken;
    for (let k = 0; k < this.jailTrashGlow.length; k++) this.jailTrashGlow[k].visible = inJail && k !== v.trashTaken;
    // Al soltarla, vuela hacia donde miras (adorno local: el acierto lo decide el anfitrión).
    if (this.prevTrash >= 0 && v.trashTaken < 0 && inJail) this.throwTrash();
    if (this.prevCarry && !v.carry && !inJail) this.throwTrash();
    this.prevTrash = v.trashTaken;
    this.prevCarry = v.carry;
    this.tickLitter(s);
    this.tickThrown(dt);
    this.tickCoins(s, v.time);
    this.tickBananas(s, v.time);
    const hot = s.ht?.[0] ?? -1;
    // Mesas
    for (let i = 0; i < this.rigs.length; i++) {
      const rig = this.rigs[i];
      const t = s.tb[i];
      // La mesa caliente se nota aunque esté vacía: aura de fuego, aro latiendo y «×2» en el cartel.
      const isHot = hot === i;
      // Un borracho encima: la mesa lo dice en su cartel y el neón se pone rojo.
      const blocked = s.bk?.[i] === 1;
      const pulse = 0.5 + Math.sin(v.time * 5 + i) * 0.5;
      rig.hotGlow.material.opacity = lerp(rig.hotGlow.material.opacity, isHot ? 0.28 + pulse * 0.2 : 0, Math.min(1, dt * 4));
      rig.hotGlow.scale.setScalar(isHot ? 5.5 + pulse * 1.2 : 5.5);
      if (!t) {
        if (blocked) rig.label.set(`${rig.def.label} · BLOQUEADA`, "rgb(255,86,96)");
        else rig.label.set((isHot ? `×${HOT_BOOST} ` : "") + rig.def.label, `rgb(${rig.def.color[0]},${rig.def.color[1]},${rig.def.color[2]})`);
        if (rig.glow) rig.glow.opacity = lerp(rig.glow.opacity, blocked ? 0.35 + pulse * 0.2 : isHot ? 0.2 + pulse * 0.25 : 0, Math.min(1, dt * 4));
        continue;
      }
      const p = t.ph === PH_SPIN ? clamp01(t.pt / SPIN_TIME) : 1;
      const active = t.pr.some((x) => x === 1);
      // Neón: brilla si estás en ella o cerca.
      if (rig.glow) {
        const on = Math.max(v.myTable === i ? 0.55 : v.near === i || active ? 0.22 : 0.0, isHot ? 0.2 + pulse * 0.25 : 0, blocked ? 0.35 + pulse * 0.2 : 0);
        rig.glow.opacity = lerp(rig.glow.opacity, on, Math.min(1, dt * 4));
      }
      // Cartel: nombre y estado.
      const phase = t.ph === PH_BET ? "" : t.ph === PH_SPIN ? " · GIRANDO" : t.lb ? ` · ${t.lb}` : "";
      if (blocked) rig.label.set(`${rig.def.label} · BLOQUEADA`, "rgb(255,86,96)");
      else rig.label.set((isHot ? `×${HOT_BOOST} ` : "") + rig.def.label + phase, `rgb(${rig.def.color[0]},${rig.def.color[1]},${rig.def.color[2]})`);
      // Crupier: se balancea y, al girar, levanta los brazos; al pagar da un bote.
      const c = rig.croupier;
      const jump = t.ph === PH_PAY ? Math.max(0, 0.12 - t.pt) * 0.9 : 0;
      c.root.position.y = rig.def.lv * UPPER_Y + Math.sin(v.time * 1.6 + i) * 0.03 + jump;
      c.arms.forEach((arm, k) => {
        const up = t.ph === PH_SPIN ? -1.5 : t.ph === PH_PAY ? -1.1 : -0.15;
        arm.rotation.x = lerp(arm.rotation.x, up + (k === 0 ? 0 : 0.1), Math.min(1, dt * 5));
        arm.rotation.z = Math.sin(v.time * 1.4 + k + i) * 0.08;
      });
      c.head.rotation.y = Math.sin(v.time * 0.7 + i) * 0.25;
      // El neón del cartel parpadea muy poco (vida).
      const flicker = 0.3 + Math.sin(v.time * 3.1 + i * 2.3) * 0.04;
      rig.signGlow.material.opacity = flicker;
      // En las mesas con mueble alto el cartel quedaría tapado o cortado al sentarse.
      rig.sign.visible = rig.signGlow.visible = !(rig.tallSign && v.myTable === i);
      this.animateGame(rig, t, p, v.time);
    }
    this.animateNpcs(s, v.time);
    this.animateDrunks(s, v.time);
    this.tickProps(s, v.time);
    // Fuga en curso: la sirena de la jaula y la caja laten en rojo.
    const breaking = (s.jb ?? []).some((p) => p > 0);
    const blink = 0.5 + Math.sin(v.time * 12) * 0.5;
    if (this.jailSiren) this.jailSiren.material.opacity = breaking ? 0.3 + blink * 0.6 : 0.2;
    if (this.switchGlow) {
      this.switchGlow.material.opacity = breaking ? 0.4 + blink * 0.5 : 0.3;
      this.switchGlow.scale.setScalar(breaking ? 1.8 + blink : 1.8);
    }
    this.followCamera(v, dt);
  }

  /**
   * Crupieres y guardia según el anfitrión: posición, giro y pose (andando, persiguiendo con los brazos
   * por delante o mirando el móvil). Va después de las mesas para mandar sobre su pose de crupier.
   */
  private animateNpcs(s: CasinoSnap, time: number) {
    const list = s.np;
    if (!list) return;
    list.forEach((n, k) => {
      const guard = k >= this.rigs.length ? this.guards[k - this.rigs.length] : null;
      const c = guard ? guard.c : this.rigs[k]?.croupier;
      if (!c) return;
      const [x, z, yaw, state] = n;
      // Guardia fuera de servicio: no se dibuja (entra cuando sube el turno).
      if (guard) c.root.visible = state !== NPC_OFF;
      if (state === NPC_OFF) return;
      const base = (n[6] ?? 0) * UPPER_Y;
      const moved = Math.hypot(x - c.lastX, z - c.lastZ);
      c.lastX = x;
      c.lastZ = z;
      if (moved < 1.5) c.stride += moved;
      c.root.position.x = x;
      c.root.position.z = z;
      c.root.rotation.y = yaw;
      const walking = moved > 0.002;
      const swing = walking ? Math.sin(c.stride * 3.2) * 0.7 : 0;
      c.legs.forEach((leg, i) => (leg.rotation.x = swing * (i === 0 ? 1 : -1)));
      const chasing = state === NPC_CHASE;
      const distracted = state === NPC_DISTRACTED;
      if (c.phone) c.phone.visible = distracted;
      c.head.rotation.x = distracted ? 0.35 : 0;
      if (chasing) {
        // Brazos por delante y saltitos: va a por ti.
        c.arms.forEach((arm, i) => {
          arm.rotation.x = -1.45 + Math.sin(time * 14 + i * Math.PI) * 0.2;
          arm.rotation.z = 0;
        });
        c.root.position.y = base + Math.abs(Math.sin(c.stride * 3.2)) * 0.1;
        c.head.rotation.y = 0;
      } else if (distracted) {
        // Mirando el móvil, de espaldas a la mesa.
        c.arms[1].rotation.x = -2.15;
        c.arms[1].rotation.z = 0.45;
        c.arms[0].rotation.x = -0.2;
        c.head.rotation.y = Math.sin(time * 0.8 + k) * 0.08;
      } else if (walking) {
        c.arms.forEach((arm, i) => {
          arm.rotation.x = swing * (i === 0 ? -0.7 : 0.7);
          arm.rotation.z = 0;
        });
        if (guard) c.root.position.y = base;
      } else if (guard) {
        // Guardia parado: brazos quietos y respiración.
        c.arms.forEach((arm) => (arm.rotation.x = lerp(arm.rotation.x, 0, 0.2)));
        c.root.position.y = base + Math.sin(time * 2) * 0.015;
      }
      // Zancadilla: tumbado en el suelo hasta que se levanta.
      c.root.rotation.z = n[5] ? 1.4 : 0;
      if (n[5]) c.root.position.y = base + 0.3;
      if (guard) {
        // Cono: amarillo de ronda, rojo persiguiendo, verde distraído por el timbre; crece con la ronda.
        guard.cone.material.color.setHex(chasing ? 0xff4050 : state === NPC_LURED ? 0x7affb0 : 0xfff07a);
        guard.cone.material.opacity = chasing ? 0.18 : 0.12;
        guard.cone.scale.setScalar(roundDef(s.qs?.[0] ?? 1).sightMul);
      }
    });
  }

  /** Pose de cada emote (sobre la pose de quieto): bailar, saludar, festejar y burlarse. */
  private emotePose(p: Character, em: number, t: number) {
    const name = EMOTES[em - 1];
    if (name === "BAILAR") {
      p.root.rotation.y += Math.sin(t * 6) * 0.5;
      p.root.position.y += Math.abs(Math.sin(t * 6)) * 0.12;
      p.arms.forEach((arm, k) => {
        arm.rotation.x = -2.4 + Math.sin(t * 6 + k * Math.PI) * 0.6;
        arm.rotation.z = (k === 0 ? -1 : 1) * 0.3;
      });
      p.legs.forEach((leg, k) => (leg.rotation.x = Math.sin(t * 6 + k * Math.PI) * 0.4));
    } else if (name === "SALUDAR") {
      p.arms[1].rotation.x = -2.8;
      p.arms[1].rotation.z = 0.4 + Math.sin(t * 10) * 0.45;
    } else if (name === "FESTEJAR") {
      p.root.position.y += Math.abs(Math.sin(t * 7)) * 0.3;
      p.arms.forEach((arm, k) => {
        arm.rotation.x = -2.9;
        arm.rotation.z = (k === 0 ? -1 : 1) * 0.35;
      });
    } else {
      // Burlarse: se echa hacia atrás con las manos en la cintura y la cabeza que no para.
      p.root.rotation.x = -0.18;
      p.arms.forEach((arm, k) => {
        arm.rotation.x = -0.3;
        arm.rotation.z = (k === 0 ? 1 : -1) * 0.9;
      });
      p.head.rotation.y = Math.sin(t * 12) * 0.35;
      return;
    }
    p.root.rotation.x = 0;
    p.head.rotation.y = 0;
  }

  /** Animación propia de cada juego según la fase y el resultado. */
  private animateGame(rig: TableRig, t: TableSnap, p: number, time: number) {
    const spinning = t.ph === PH_SPIN;
    const paying = t.ph === PH_PAY;
    const win = paying && t.ml.some((m) => m > 1);
    // Halo de la pieza: se enciende mientras gira y da un fogonazo al pagar premio.
    if (rig.pieceGlow) {
      const target = spinning ? 0.3 : win ? 0.45 : 0;
      rig.pieceGlow.material.opacity = lerp(rig.pieceGlow.material.opacity, target, 0.09);
    }
    // Marcos y línea de pago: latido cuando hay premio.
    const glow = win ? 0.55 + Math.sin(time * 9) * 0.4 : spinning ? 0.45 : 0.18;
    for (const m of rig.lit) m.opacity = glow;

    if (rig.def.kind === "ruleta" && rig.spin) {
      const num = t.rs[0] ?? 0;
      const seg = (Math.PI * 2) / 13;
      // La casilla ganadora acaba delante del jugador: al girar la rueda su ángulo se anula.
      const target = -((num + 0.5) * seg);
      const turns = spinning || paying ? Math.PI * 2 * 4 : 0;
      rig.spin.rotation.y = target - turns * (1 - easeOut(p));
      if (rig.ball) {
        // La bola corre por el aro al revés que el plato y cae en la casilla.
        const prog = spinning ? p : 1;
        const a = Math.pow(1 - prog, 1.5) * Math.PI * 2 * 2.2;
        const r = 0.68 - 0.17 * clamp01((prog - 0.7) / 0.3);
        const drop = prog > 0.9 ? (prog - 0.9) * 4 : 0;
        rig.ball.position.set(Math.sin(a) * r, 1.24 - drop * 0.02, Math.cos(a) * r - 0.02);
      }
    } else if (rig.def.kind === "plinko" && rig.ball) {
      const bucket = t.rs[0] ?? 4;
      const landing = (bucket - 4) * 0.235;
      const prog = spinning ? p : 1;
      // Cae en zigzag (rebotes en las clavijas) y aterriza en su boca. Va en coordenadas del tablero.
      const zig = Math.sin(prog * Math.PI * 7) * 0.1 * (1 - prog * 0.5);
      rig.ball.position.set(landing * easeOut(prog) + zig, 0.74 - 1.56 * prog, 0.14);
    } else if (rig.def.kind === "slots") {
      const stops = [0.42, 0.6, 0.78];
      rig.reels.forEach((reel, i) => {
        const mat = rig.reelMats[i];
        const done = !spinning || p > stops[i];
        if (done) {
          const sym = t.rs[i] ?? 0;
          mat.map = this.texture(`sim-${sym}`, 72, 132, (gg, w, h) => drawSlotSymbol(gg, w, h, sym));
          reel.scale.y = lerp(reel.scale.y, 1, 0.22);
        } else {
          // Girando: cambia de símbolo a toda velocidad y se estira (desenfoque de movimiento).
          const k = Math.floor(time * 18 + i * 2.5) % SLOT_SYMBOLS.length;
          mat.map = this.texture(`sim-${k}`, 72, 132, (gg, w, h) => drawSlotSymbol(gg, w, h, k));
          reel.scale.y = 1.16;
        }
        mat.needsUpdate = true;
        reel.scale.x = 1;
      });
    } else if (rig.def.kind === "moneda" && rig.coin && rig.spin) {
      const face = t.rs[0] ?? 0;
      // Gira sobre su eje vertical: al parar enseña CARA o CRUZ sin que el dibujo quede del revés.
      const k = spinning ? easeOut(p) : 1;
      const turns = spinning || paying ? 4 : 0;
      const target = face === 1 ? Math.PI : 0;
      rig.coin.rotation.y = target - Math.PI * 2 * turns * (1 - k);
      // Lanzamiento: sube y vuelve a caer en la peana.
      rig.spin.position.y = 1.63 + (spinning ? Math.sin(clamp01(p) * Math.PI) * 0.34 : 0);
    } else if (rig.def.kind === "patos") {
      const w = t.rs[0] ?? 0;
      const prog = spinning ? p : paying ? 1 : 0;
      rig.ducks.forEach((duck, k) => {
        const seed = t.rs[k + 1] ?? k * 17;
        // Cada pato acaba en su sitio (el ganador en la meta) pero con acelerones y frenazos por el
        // camino: hay adelantamientos y el ganador no se sabe hasta el final.
        const final = k === w ? 1 : 0.6 + (seed % 30) / 100;
        const surge = Math.sin(prog * Math.PI * (2 + (seed % 3)) + seed) * 0.08 * Math.sin(prog * Math.PI);
        duck.position.x = -1.25 + 2.5 * clamp01(prog * final + surge);
        duck.position.y = 1.16 + (spinning ? Math.abs(Math.sin(time * 14 + k * 1.3)) * 0.05 : 0);
        duck.rotation.z = spinning ? Math.sin(time * 14 + k) * 0.15 : 0;
        // El ganador da saltitos en la meta al pagar.
        if (paying && k === w) duck.position.y += Math.abs(Math.sin(time * 8)) * 0.08;
      });
    } else if (rig.def.kind === "dados") {
      rig.dice.forEach((grp, i) => {
        const v = Math.max(1, Math.min(6, Math.round(t.rs[i] ?? (i === 0 ? 5 : 2))));
        const stop = i === 0 ? 0.52 : 0.68;
        const k = !spinning || p > stop ? 1 : easeOut(clamp01(p / stop));
        const die = grp.children[0] as THREE.Mesh;
        // Rueda tres vueltas y frena justo con la cara del resultado mirando al jugador.
        const spinQ = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.PI * 2 * 3 * (1 - k), Math.PI * 2 * 2 * (1 - k), 0, "YXZ"),
        );
        die.quaternion.copy(dieRestQuat(v)).multiply(spinQ);
        // Bote: los dados saltan y caen en la bandeja.
        const hop = spinning ? Math.abs(Math.sin(p * Math.PI * (2.5 + i * 0.7))) * 0.2 * (1 - k) : 0;
        grp.position.y = 1.5 + hop;
      });
    }
  }

  /** Basura en el suelo: se ve si está en su sitio (no la lleva nadie ni se está reponiendo). */
  private tickLitter(s: CasinoSnap) {
    this.litter.forEach((g, k) => (g.visible = (s.lt?.[k] ?? 0) === 0));
  }

  /** Cáscaras de banana del suelo (posiciones del anfitrión). */
  private tickBananas(s: CasinoSnap, time: number) {
    const list = s.bn ?? [];
    for (let k = 0; k < this.bananaPool.length; k++) {
      const m = this.bananaPool[k];
      const b = list[k];
      m.visible = !!b;
      if (!b) continue;
      m.position.set(b[0], (b[2] ?? 0) * UPPER_Y, b[1]);
      m.rotation.y = k * 1.7 + Math.sin(time * 2 + k) * 0.1;
    }
  }

  /** Monedas del suelo: giran, flotan un poco y parpadean cuando están a punto de desaparecer. */
  private tickCoins(s: CasinoSnap, time: number) {
    const list = s.co ?? [];
    for (let k = 0; k < this.coinPool.length; k++) {
      const m = this.coinPool[k];
      const c = list[k];
      if (!c) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.set(c[0], (c[3] ?? 0) * UPPER_Y + 0.18 + Math.abs(Math.sin(time * 3 + k)) * 0.06, c[1]);
      m.rotation.y = time * 3.5 + k;
      const left = c[2] ?? 0;
      m.scale.setScalar(left < 2.5 ? 0.7 + Math.abs(Math.sin(time * 9)) * 0.3 : 1);
    }
  }

  // --- Cámara ---------------------------------------------------------------------------------
  private followCamera(v: SceneView, dt: number) {
    const me = v.s.pl[v.me];
    if (!me) return;
    const [x, z, yaw, table] = me;
    const seat = table >= 0 ? TABLES[table] : null;
    const t = table >= 0 ? v.s.tb[table] : null;
    const spinP = t && t.ph === PH_SPIN ? clamp01(t.pt / SPIN_TIME) : 0;
    // Primera persona: al sentarse se cierra el campo (tele sobre el mecanismo).
    // De pie, al correr la cámara se abre: se nota la velocidad.
    const fovTarget = seat ? lerp(56, 46, spinP) : v.running ? RUN_FOV : WALK_FOV;
    if (Math.abs(this.camera.fov - fovTarget) > 0.03) {
      this.camera.fov = lerp(this.camera.fov, fovTarget, Math.min(1, dt * 5));
      this.camera.updateProjectionMatrix();
    }
    let ex: number, ey: number, ez: number, ax: number, ay: number, az: number;
    if (seat) {
      // Sentado: el ojo en la silla, echado un poco hacia la mesa y mirando al mecanismo del puesto.
      const [lean, eyeY, fx, fy, fz] = seat.cam;
      const [fxw, fzw] = tablePoint(seat, fx, fz);
      ex = x - Math.sin(yaw) * lean;
      ez = z - Math.cos(yaw) * lean;
      ey = eyeY + seat.lv * UPPER_Y;
      ax = fxw;
      ay = fy + seat.lv * UPPER_Y;
      az = fzw;
    } else {
      // De pie: los ojos del muñeco, con vaivén al andar y la mirada del ratón (guiñada + cabeceo).
      const jailed = (v.s.ja?.[v.me] ?? 0) > 0;
      const bob = Math.sin(this.myStride * 3.2) * HEAD_BOB;
      const cp = Math.cos(v.pitch);
      ex = x;
      ez = z;
      ey = (jailed ? JAIL.y : v.level * UPPER_Y) + EYE_H + bob + v.jumpY;
      ax = x - Math.sin(yaw) * cp * 3;
      ay = ey + Math.sin(v.pitch) * 3;
      az = z - Math.cos(yaw) * cp * 3;
      // Emote: la cámara se pone delante de ti y da una vuelta lenta alrededor mientras dura.
      const emoting = (v.s.em?.[v.me] ?? 0) > 0 && !jailed && !((v.s.hd?.[v.me] ?? 0) > 0);
      if (emoting && this.orbit === 0) this.orbitA = yaw;
      this.orbit = emoting ? Math.min(1, this.orbit + dt * 4) : Math.max(0, this.orbit - dt * 5);
      if (this.orbit > 0) {
        this.orbitA += dt * 0.7;
        const k = easeOut(this.orbit);
        const base = (jailed ? JAIL.y : v.level * UPPER_Y) + v.jumpY;
        const r = 3.2;
        ex = lerp(ex, x - Math.sin(this.orbitA) * r, k);
        ez = lerp(ez, z - Math.cos(this.orbitA) * r, k);
        ey = lerp(ey, base + 2.2, k);
        ax = lerp(ax, x, k);
        ay = lerp(ay, base + 1.15, k);
        az = lerp(az, z, k);
      }
    }
    // Temblor si te están pegando.
    const fight = v.s.cg?.[v.me] ?? null;
    const stun = fight ? fight[0] ?? 0 : 0;
    if (stun > 0) {
      const k = Math.min(1, stun * 2.2);
      ax += Math.sin(v.time * 38) * 0.1 * k;
      ay += Math.cos(v.time * 31) * 0.08 * k;
    }
    // La cámara no se sale de la sala (ni de la celda, que está por encima del techo).
    const jailed = (v.s.ja?.[v.me] ?? 0) > 0;
    const mx = HALL.w / 2 - 0.8, mz = HALL.d / 2 - 0.8;
    ex = Math.max(-mx, Math.min(mx, ex));
    ez = Math.max(-mz, Math.min(mz, ez));
    ey = Math.max(0.9, Math.min((jailed ? JAIL.y + JAIL.h - 0.4 : HALL.h - 1), ey));
    // Andando va pegada a la cabeza; al sentarse entra con una transición corta.
    const k = seat ? Math.min(1, dt * 9) : 1;
    this.camPos.set(lerp(this.camPos.x, ex, k), lerp(this.camPos.y, ey, k), lerp(this.camPos.z, ez, k));
    const ka = Math.min(1, dt * 26);
    this.camAt.set(lerp(this.camAt.x, ax, ka), lerp(this.camAt.y, ay, ka), lerp(this.camAt.z, az, ka));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camAt);
  }

  /** Dibuja la escena en el lienzo 2D (el renderer WebGL es único y compartido). */
  render(ctx: CanvasRenderingContext2D, pixelScale: number) {
    if (!glRenderer()) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, CW, CH);
      return;
    }
    // Se pide resolución interna de más (el hub la limita a 3×): así el 3D sale más nítido.
    renderInto(ctx, this.scene, this.camera, CW, CH, pixelScale * 1.7, 1.02);
  }

  /** Proyecta un punto del mundo a la pantalla (para etiquetas del HUD). */
  project(x: number, y: number, z: number): [number, number, number] | null {
    return projectTo(this.camera, [x, y, z], CW, CH);
  }
}
