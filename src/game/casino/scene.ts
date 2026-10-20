// Escena 3D del casino (Three.js): la sala con sus mesas, los crupiers, los muñecos de los jugadores y las
// animaciones de cada juego. Todo con cajas grandes y simples (estilo del hub), cámara en tercera persona.
import * as THREE from "three";
import { PLAYER_COLORS } from "../core/config";
import { disposeScene, glowSprite, glRenderer, projectTo, renderInto } from "../core/three";
import { CH, CW, DROP_MAX, EYE_H, HEAD_BOB, PH_BET, PH_PAY, PH_SPIN, SLOT_BAT, SLOT_HAND, SPIN_TIME } from "./config";
import { croupierSpot, HALL, JAIL, JAIL_LEVER, JAIL_TRASH, tablePoint, TABLES, type TableDef } from "./world3d";
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
}

interface Character {
  root: THREE.Group;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  head: THREE.Object3D;
  /** Bate que lleva en la mano derecha (los crupiers no). */
  bat: THREE.Object3D | null;
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
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = "rgba(8,9,14,0.92)";
    g.fillRect(0, 0, this.w, this.h);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, this.w - 3, this.h - 3);
    g.fillStyle = color;
    g.font = "bold 30px monospace";
    // Carteles largos («CARA O CRUZ · CRUZ»): se reduce la letra en vez de salirse del cartel.
    let size = 30;
    while (size > 13 && g.measureText(text).width > this.w - 18) {
      size -= 2;
      g.font = `bold ${size}px monospace`;
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, this.w / 2, this.h / 2 + 1);
    this.texture.needsUpdate = true;
  }
}

/** Textura de alfombra: cuadros con rombos, como los suelos de casino cutres. */
function carpetTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a1030";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#3a1542";
  for (let y = 0; y < 64; y += 32) for (let x = 0; x < 64; x += 32) g.fillRect(x, y, 32, 32);
  g.strokeStyle = "#6a2a6e";
  g.lineWidth = 2;
  for (let y = 0; y < 64; y += 32) {
    for (let x = 0; x < 64; x += 32) {
      g.beginPath();
      g.moveTo(x + 16, y + 4);
      g.lineTo(x + 28, y + 16);
      g.lineTo(x + 16, y + 28);
      g.lineTo(x + 4, y + 16);
      g.closePath();
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 7);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

  constructor() {
    const sc = this.scene;
    sc.background = new THREE.Color(0x080910);
    sc.fog = new THREE.Fog(0x080910, 26, 62);
    // Luz: una principal desde arriba y un relleno cálido, sin sombras (todo es de cajas).
    const key = new THREE.DirectionalLight(0xfff0d0, 1.9);
    key.position.set(6, 14, 8);
    // Sombras suaves: dan profundidad al salón y a los muñecos (el renderer ya las tiene activadas).
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -20;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 45;
    key.shadow.bias = -0.0006;
    const warm = new THREE.PointLight(0xff8040, 40, 34, 2);
    warm.position.set(0, 6, -10);
    const cool = new THREE.PointLight(0x40a0ff, 30, 34, 2);
    cool.position.set(0, 6, 10);
    sc.add(key, warm, cool, new THREE.HemisphereLight(0x606a90, 0x20102a, 2.0));
    // Rellenos de las cuatro esquinas, para que no haya zonas negras.
    for (const [x, z] of [[-13, -11], [13, -11], [-13, 11], [13, 11]] as const) {
      const l = new THREE.PointLight(0xffb070, 22, 24, 2);
      l.position.set(x, 5.5, z);
      sc.add(l);
    }
    this.buildRoom();
    TABLES.forEach((def) => this.rigs.push(this.buildTable(def)));
    this.buildJail();
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
    for (let i = 0; i < 4; i++) {
      const p = this.character(rgb(PLAYER_COLORS[i] ?? PLAYER_COLORS[0]), i === 0);
      p.root.visible = false;
      this.people.push(p);
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
    sc.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || inView(o)) return;
      m.castShadow = true;
      m.receiveShadow = true;
    });
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

  /** Celda pequeña encima del salón: el que falla un robo aparece aquí un rato. */
  private buildJail() {
    const { w, d, h } = JAIL;
    const g = new THREE.Group();
    g.position.set(JAIL.x, JAIL.y, JAIL.z);
    this.scene.add(g);
    // Suelo, techo y tres paredes (la cuarta son barrotes).
    this.put(g, w, 0.2, d, 0x3a3344, 0, -0.1, 0);
    this.put(g, w, 0.2, d, 0x201a2c, 0, h, 0);
    this.put(g, w, h, 0.2, 0x4a4454, 0, h / 2, -d / 2);
    this.put(g, 0.2, h, d, 0x4a4454, -w / 2, h / 2, 0);
    this.put(g, 0.2, h, d, 0x4a4454, w / 2, h / 2, 0);
    // Barrotes por delante y un banco.
    for (let i = 0; i < 7; i++) this.put(g, 0.09, h, 0.09, 0x9aa0b2, -w / 2 + 0.4 + i * 0.56, h / 2, d / 2);
    this.put(g, w, 0.1, 0.1, 0x9aa0b2, 0, h - 0.12, d / 2);
    this.put(g, 1.4, 0.12, 0.45, 0x4a3a2a, -0.6, 0.45, d / 2 - 0.45);
    // Carteles y una mancha en el suelo: que la celda no sea una caja vacía.
    const poster = (texto: string, x: number, y: number, z: number, ry: number, w2 = 1.1) => {
      const l = new CanvasLabel(256, 96);
      l.set(texto, "#ffd8a0");
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w2, w2 * 0.375),
        new THREE.MeshBasicMaterial({ map: l.texture, transparent: true }),
      );
      m.position.set(x, y, z);
      m.rotation.y = ry;
      g.add(m);
    };
    poster("NO ROBES", -w / 2 + 0.13, 1.45, -0.35, Math.PI / 2);
    poster("PAGA TU CONDENA", w / 2 - 0.13, 1.45, -0.35, -Math.PI / 2, 1.35);
    const stain = new THREE.Mesh(new THREE.CircleGeometry(0.58, 14), new THREE.MeshLambertMaterial({ color: 0x2a2436 }));
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(0.25, 0.02, -0.45);
    g.add(stain);
    // Palanca de la pared del fondo: acertarle con la basura acorta la condena.
    const lever = this.put(g, 0.18, 0.42, 0.1, 0xff5560, JAIL_LEVER[0] - JAIL.x, JAIL_LEVER[1] - JAIL.y, -d / 2 + 0.16, { emissive: 0x401018 });
    lever.name = "palanca";
    const halo = glowSprite(0xff5560, 1.2, 0.5);
    halo.position.set(lever.position.x, lever.position.y, lever.position.z + 0.1);
    g.add(halo);
    // Cartel y luces de la celda (que no parezca un agujero negro).
    const sign = new CanvasLabel(256, 64);
    sign.set("CÁRCEL", "#ff5560");
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.42),
      new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true }),
    );
    plate.position.set(0, 1.62, -d / 2 + 0.12);
    g.add(plate);
    const lamp = new THREE.PointLight(0xffd8a0, 60, 13, 2);
    lamp.position.set(0, h - 0.35, 0);
    g.add(lamp);
    const fill = new THREE.PointLight(0xbcd0ff, 24, 9, 2);
    fill.position.set(-w / 2 + 0.5, 0.9, d / 2 - 0.5);
    g.add(fill);
    // Basura por el suelo (se coge y se tira), con un halo para que se vea a la primera.
    for (const [x, z] of JAIL_TRASH) {
      const t = this.put(this.scene, 0.2, 0.15, 0.2, [0x6a8a4a, 0x8a6a3a, 0x5a6a8a, 0x8a4a4a][this.jailTrash.length % 4], x, JAIL.y + 0.08, z);
      t.rotation.y = this.jailTrash.length * 0.9;
      t.castShadow = false;
      this.jailTrash.push(t);
      const h2 = glowSprite(0xa8d47a, 0.55, 0.35);
      h2.position.set(x, JAIL.y + 0.12, z);
      this.scene.add(h2);
      this.jailTrashGlow.push(h2);
    }
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
    this.put(hand, 0.17, 0.2, 0.11, 0xe8b58c, 0, 0, 0, { basic: true });
    for (let i = 0; i < 4; i++) this.put(hand, 0.035, 0.16, 0.06, 0xf2c6a0, -0.06 + i * 0.04, 0.17, -0.01, { basic: true });
    this.camera.add(hand);
    this.view.hand = hand;

    const trash = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), new THREE.MeshBasicMaterial({ color: 0x7a9a52 }));
    trash.position.set(0.42, -0.13, -0.62);
    trash.rotation.set(0.3, 0.6, 0.2);
    this.camera.add(trash);
    this.view.trash = trash;
  }

  // --- Sala ---------------------------------------------------------------------------------
  private buildRoom() {
    const sc = this.scene;
    // Suelo
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALL.w, HALL.d),
      new THREE.MeshLambertMaterial({ map: carpetTexture() }),
    );
    floor.rotation.x = -Math.PI / 2;
    sc.add(floor);
    // Zócalo claro en el borde y paredes.
    const wallColor = 0x1a1424;
    this.put(sc, HALL.w, 0.35, 0.4, 0x6a2040, 0, 0.17, -HALL.d / 2, { emissive: 0x22000a });
    this.put(sc, HALL.w, 0.35, 0.4, 0x6a2040, 0, 0.17, HALL.d / 2, { emissive: 0x22000a });
    this.put(sc, 0.4, 0.35, HALL.d, 0x6a2040, -HALL.w / 2, 0.17, 0, { emissive: 0x22000a });
    this.put(sc, 0.4, 0.35, HALL.d, 0x6a2040, HALL.w / 2, 0.17, 0, { emissive: 0x22000a });
    this.put(sc, HALL.w, HALL.h, 0.5, wallColor, 0, HALL.h / 2, -HALL.d / 2);
    this.put(sc, HALL.w, HALL.h, 0.5, wallColor, 0, HALL.h / 2, HALL.d / 2);
    this.put(sc, 0.5, HALL.h, HALL.d, wallColor, -HALL.w / 2, HALL.h / 2, 0);
    this.put(sc, 0.5, HALL.h, HALL.d, wallColor, HALL.w / 2, HALL.h / 2, 0);
    // Techo oscuro con tiras de neón.
    this.put(sc, HALL.w, 0.3, HALL.d, 0x0c0a12, 0, HALL.h, 0);
    for (let i = -1; i <= 1; i++) {
      this.put(sc, HALL.w - 6, 0.16, 0.3, 0x35e0c8, 0, HALL.h - 0.25, i * 6.5, { basic: true });
    }
    // Cartel grande del fondo.
    const sign = new CanvasLabel(512, 128);
    sign.set("CASINO ENTRE AMIGOS", "#ffce4a");
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 3.5),
      new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true }),
    );
    signMesh.position.set(0, 5.4, -HALL.d / 2 + 0.35);
    sc.add(signMesh);
    // Barra a la izquierda, con botellas y taburetes.
    this.put(sc, 2.2, 1.1, 10, 0x3a2418, -15.2, 0.55, 0);
    this.put(sc, 2.4, 0.16, 10.2, 0x6a4030, -15.2, 1.15, 0);
    this.put(sc, 0.3, 2.4, 10, 0x2a1620, -16.4, 2.6, 0);
    const bottleColors = [0x40e080, 0xffc040, 0xe04060, 0x60a0ff, 0xff80c0];
    for (let i = 0; i < 14; i++) {
      const h = 0.4 + (i % 3) * 0.12;
      this.put(sc, 0.16, h, 0.16, bottleColors[i % bottleColors.length], -16.2, 1.3 + h / 2, -4 + i * 0.62, { emissive: 0x101010 });
    }
    for (let i = 0; i < 5; i++) {
      this.put(sc, 0.5, 0.12, 0.5, 0x503040, -13.9, 0.75, -3.5 + i * 1.7);
      this.put(sc, 0.12, 0.7, 0.12, 0x301820, -13.9, 0.36, -3.5 + i * 1.7);
    }
    // Columnas de las esquinas y plantas.
    for (const [x, z] of [[-13.5, -12.5], [13.5, -12.5], [-13.5, 12.5], [13.5, 12.5]] as const) {
      this.put(sc, 1.1, HALL.h, 1.1, 0x241a2e, x, HALL.h / 2, z);
      this.put(sc, 1.3, 0.12, 1.3, 0xffce4a, x, 3.2, z, { basic: true });
      this.put(sc, 0.9, 0.9, 0.9, 0x2a4a28, x, 0.85, z);
      this.put(sc, 0.45, 1.2, 0.45, 0x3a7a34, x, 1.9, z);
    }
    // Lámparas colgando: cajas brillantes con un halo.
    for (const [x, z] of [[-8, -1], [8, -1], [0, 4]] as const) {
      this.put(sc, 0.1, 2.2, 0.1, 0x30202a, x, HALL.h - 1.1, z);
      this.put(sc, 1.8, 0.24, 1.8, 0xffe6a0, x, HALL.h - 2.3, z, { basic: true });
      const halo = glowSprite(0xffd890, 4.6, 0.5);
      halo.position.set(x, HALL.h - 2.35, z);
      sc.add(halo);
    }
    // Apliques de las paredes laterales.
    for (const z of [-7, 0, 7]) {
      for (const x of [-HALL.w / 2 + 0.4, HALL.w / 2 - 0.4]) {
        this.put(sc, 0.2, 0.5, 0.2, 0xffca70, x, 3.4, z, { basic: true });
        const halo = glowSprite(0xffb060, 2.6, 0.35);
        halo.position.set(x + (x < 0 ? 0.3 : -0.3), 3.4, z);
        sc.add(halo);
      }
    }
    // Alfombra roja hacia las mesas del fondo.
    this.put(sc, 9, 0.02, 12, 0x5a1024, 0, 0.012, -1);
  }

  // --- Muñecos -----------------------------------------------------------------------------
  /** Personaje caricaturesco: piernas, torso, brazos y cabeza grande con ojos. */
  private character(color: number, me: boolean, croupier = false): Character {
    const root = new THREE.Group();
    const skin = 0xe8b58c;
    const body = color;
    const legs: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.15 * s, 0.72, 0);
      this.put(hip, 0.19, 0.72, 0.2, croupier ? 0x2a2230 : 0x30303e, 0, -0.36, 0);
      this.put(hip, 0.21, 0.12, 0.28, croupier ? 0x0e0e14 : 0x14141c, 0, -0.68, -0.04); // zapato
      root.add(hip);
      legs.push(hip);
    }
    // Torso: el crupier va de uniforme oscuro (no del color de la mesa).
    this.put(root, 0.66, 0.72, 0.36, croupier ? 0x14141c : body, 0, 1.06, 0, croupier ? { emissive: 0x2a2a34 } : undefined);
    if (croupier) {
      // Chaleco claro y pajarita (con luz propia: detrás de la mesa casi no llega la luz).
      this.put(root, 0.5, 0.62, 0.06, 0xf2f2f8, 0, 1.08, -0.2, { emissive: 0x60606a });
      this.put(root, 0.16, 0.1, 0.06, 0x141018, 0, 1.34, -0.24);
    } else {
      // Cuello de la camisa.
      this.put(root, 0.3, 0.08, 0.3, 0xf2f2f8, 0, 1.42, 0);
    }
    const arms: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.42 * s, 1.34, 0);
      this.put(shoulder, 0.16, 0.6, 0.18, body, 0, -0.3, 0, croupier ? { emissive: 0x2a2a34 } : undefined);
      this.put(shoulder, 0.15, 0.14, 0.17, skin, 0, -0.62, 0, croupier ? { emissive: 0x241810 } : undefined);
      root.add(shoulder);
      arms.push(shoulder);
    }
    // Cabeza grande (caricaturesca) con ojos, nariz, boca y pelo. La cara mira al -Z (hacia donde anda).
    const head = this.put(root, 0.56, 0.52, 0.5, skin, 0, 1.68, 0, croupier ? { emissive: 0x2a1c12 } : undefined);
    this.put(root, 0.58, 0.2, 0.54, croupier ? 0x141018 : 0x2a1a12, 0, 1.99, 0.02);
    for (const s of [-1, 1]) {
      this.put(root, 0.1, 0.12, 0.04, 0x141018, 0.13 * s, 1.7, -0.26);
      this.put(root, 0.04, 0.04, 0.03, 0xffffff, 0.11 * s, 1.74, -0.28);
    }
    this.put(root, 0.11, 0.09, 0.06, 0xd9a07a, 0, 1.63, -0.28); // nariz
    this.put(root, 0.16, 0.05, 0.04, 0x8a5040, 0, 1.54, -0.26); // boca
    // Chapa dorada sobre el pecho del jugador propio.
    if (!croupier && me) this.put(root, 0.2, 0.2, 0.02, 0xffce4a, 0, 1.42, -0.21, { basic: true });
    // Bate en la mano derecha (los jugadores lo llevan siempre; el crupier no).
    let bat: THREE.Object3D | null = null;
    if (!croupier) {
      const stick = new THREE.Group();
      this.put(stick, 0.07, 0.26, 0.07, 0x2a1a12, 0, -0.02, 0, { emissive: 0x0a0608 });
      this.put(stick, 0.1, 0.5, 0.1, 0xc89a5a, 0, -0.4, 0, { emissive: 0x201408 });
      stick.name = "bate";
      stick.position.set(0, -0.66, -0.02);
      stick.rotation.x = -0.35;
      arms[1].add(stick);
      bat = stick;
    }
    this.scene.add(root);
    void head;
    return { root, legs, arms, head, bat, stride: 0, lastX: 0, lastZ: 0 };
  }

  // --- Mesas -------------------------------------------------------------------------------
  private buildTable(def: TableDef): TableRig {
    const g = new THREE.Group();
    g.position.set(def.x, 0, def.z);
    g.rotation.y = def.yaw;
    this.scene.add(g);
    const neon = rgb(def.color);
    // Mueble: base oscura, tablero y filo de neón.
    this.put(g, 3.4, 0.9, 2.1, 0x201828, 0, 0.45, 0);
    this.put(g, 3.6, 0.14, 2.3, 0x3a2a44, 0, 0.97, 0);
    this.put(g, 3.66, 0.06, 2.36, neon, 0, 1.04, 0, { basic: true });
    // Fieltro del color de la mesa (oscurecido).
    const felt = rgb([def.color[0] * 0.3, def.color[1] * 0.3, def.color[2] * 0.3]);
    this.put(g, 3.0, 0.04, 1.7, felt, 0, 1.08, 0);
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
    this.put(g, 0.1, signY - 1.05, 0.1, 0x30202a, 0, (signY + 1.05) / 2, signZ);
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
    c.root.position.set(cx, 0, cz);
    c.root.rotation.y = def.yaw + Math.PI;
    // Halo del cartel de la mesa (neón).
    const signGlow = glowSprite(neon, 3.2, 0.32);
    signGlow.position.set(0, signY, signZ + 0.05);
    g.add(signGlow);
    // Taburetes en los cuatro asientos.
    for (let i = 0; i < 4; i++) {
      const lx = (i - 1.5) * 1.15;
      this.put(g, 0.46, 0.1, 0.46, 0x3a2030, lx, 0.52, 1.95);
      this.put(g, 0.1, 0.5, 0.1, 0x241820, lx, 0.26, 1.95);
      this.put(g, 0.46, 0.42, 0.08, 0x51283c, lx, 0.78, 2.16);
    }
    // Paño con filo del color de la mesa y pilas de fichas en las esquinas.
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      this.put(g, 1.12, 0.012, 0.012, neon, dx * 1.2, 1.085, dz * 0.5, { basic: true });
      this.put(g, 0.012, 0.012, 0.72, neon, dx * 1.76, 1.085, dz * 0.0, { basic: true });
    }
    const chipColors = [0xffce4a, 0xe83e54, 0x6adcf5, 0x2ebd6c];
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
    // Foco sobre el crupier (si no, se queda en penumbra detrás de la mesa).
    const spot = new THREE.PointLight(0xffd8a0, 14, 7, 2);
    spot.position.set(cx, 2.6, cz);
    this.scene.add(spot);
    // --- Piezas del juego ---------------------------------------------------------------
    let spin: THREE.Object3D | null = null;
    let coin: THREE.Object3D | null = null;
    let ball: THREE.Mesh | null = null;
    const reels: THREE.Mesh[] = [];
    const reelMats: THREE.MeshLambertMaterial[] = [];
    const dice: THREE.Group[] = [];
    const lit: THREE.MeshBasicMaterial[] = [];
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
      this.put(board, 2.12, 1.9, 0.1, 0x0d1a24, 0, 0, -0.07);
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
      this.put(cab, 1.5, 2.0, 0.66, 0x2a1a30, 0, 0, 0);
      this.put(cab, 1.62, 0.24, 0.72, 0xffce4a, 0, 1.04, 0.02, { basic: true });
      this.put(cab, 1.62, 0.16, 0.72, 0x140e1c, 0, -1.0, 0.02);
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
    return { def, group: g, spin, coin, ball, reels, reelMats, dice, label, croupier: c, glow: glowMat, signGlow, sign: signMesh, tallSign: tall, pieceGlow, lit };
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
      p.root.visible = i !== v.me;
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
      p.root.position.set(x, (jailed ? JAIL.y : 0) + (seated ? -0.42 : 0) + breathe, z);
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
    }
    // Lo que llevas en la mano (primera persona).
    const inJail = (s.ja?.[v.me] ?? 0) > 0;
    const prog = v.swing > 0 ? clamp01(1 - v.swing / 0.38) : 0;
    const arc = Math.sin(prog * Math.PI);
    if (this.view.bat) {
      this.view.bat.visible = !inJail && v.slot === SLOT_BAT;
      this.view.bat.rotation.z = 0.5 - arc * 1.7;
      this.view.bat.position.set(0.4 - arc * 0.18, -0.18 + arc * 0.1, -0.75 - arc * 0.18);
    }
    if (this.view.hand) this.view.hand.visible = !inJail && v.slot === SLOT_HAND;
    if (this.view.trash) this.view.trash.visible = inJail && v.trashTaken >= 0;
    // La basura que llevas en la mano desaparece del suelo.
    for (let k = 0; k < this.jailTrash.length; k++) this.jailTrash[k].visible = k !== v.trashTaken;
    for (let k = 0; k < this.jailTrashGlow.length; k++) this.jailTrashGlow[k].visible = inJail && k !== v.trashTaken;
    // Al soltarla, vuela hacia donde miras (adorno local: el acierto lo decide el anfitrión).
    if (this.prevTrash >= 0 && v.trashTaken < 0 && inJail) this.throwTrash();
    this.prevTrash = v.trashTaken;
    this.tickThrown(dt);
    this.tickCoins(s, v.time);
    // Mesas
    for (let i = 0; i < this.rigs.length; i++) {
      const rig = this.rigs[i];
      const t = s.tb[i];
      if (!t) continue;
      const p = t.ph === PH_SPIN ? clamp01(t.pt / SPIN_TIME) : 1;
      const active = t.pr.some((x) => x === 1);
      // Neón: brilla si estás en ella o cerca.
      if (rig.glow) {
        const on = v.myTable === i ? 0.55 : v.near === i || active ? 0.22 : 0.0;
        rig.glow.opacity = lerp(rig.glow.opacity, on, Math.min(1, dt * 4));
      }
      // Cartel: nombre y estado.
      const phase = t.ph === PH_BET ? "" : t.ph === PH_SPIN ? " · GIRANDO" : t.lb ? ` · ${t.lb}` : "";
      rig.label.set(rig.def.label + phase, `rgb(${rig.def.color[0]},${rig.def.color[1]},${rig.def.color[2]})`);
      // Crupier: se balancea y, al girar, levanta los brazos; al pagar da un bote.
      const c = rig.croupier;
      const jump = t.ph === PH_PAY ? Math.max(0, 0.12 - t.pt) * 0.9 : 0;
      c.root.position.y = Math.sin(v.time * 1.6 + i) * 0.03 + jump;
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
    this.followCamera(v, dt);
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
      m.position.set(c[0], 0.18 + Math.abs(Math.sin(time * 3 + k)) * 0.06, c[1]);
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
    const fovTarget = seat ? lerp(56, 46, spinP) : 68;
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
      ey = eyeY;
      ax = fxw;
      ay = fy;
      az = fzw;
    } else {
      // De pie: los ojos del muñeco, con vaivén al andar y la mirada del ratón (guiñada + cabeceo).
      const jailed = (v.s.ja?.[v.me] ?? 0) > 0;
      const bob = Math.sin(this.myStride * 3.2) * HEAD_BOB;
      const cp = Math.cos(v.pitch);
      ex = x;
      ez = z;
      ey = (jailed ? JAIL.y : 0) + EYE_H + bob;
      ax = x - Math.sin(yaw) * cp * 3;
      ay = ey + Math.sin(v.pitch) * 3;
      az = z - Math.cos(yaw) * cp * 3;
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
