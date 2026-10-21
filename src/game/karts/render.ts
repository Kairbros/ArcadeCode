// Render 3D de Karts (Three.js, estilo de bloques): el dibujo del circuito sobre un terreno con relieve
// de caras planas, karts y decorados de cajas, montañas escalonadas y nubes de cubos al fondo, y la
// cámara detrás del kart siguiendo su dirección de avance y el relieve. El HUD se dibuja en 2D encima.
// Coordenadas del juego: x a la derecha, y hacia abajo en el mapa; en la escena x → x, y → z, y la
// altura del terreno → y, todo × S.
import * as THREE from "three";
import { PLAYER_COLORS, PLAYER_NAMES } from "../core/config";
import { badge, css, fitText, panel, polygon, shadowText, text, textWidth, titleText, type Ctx } from "../core/draw";
import { Rng } from "../core/rng";
import { blockGeometry, disposeScene, glRenderer, glowSprite, projectTo, renderInto, type Block } from "../core/three";
import {
  CAM_DIST, CAM_HEIGHT, CAM_LOOK, FOG_END, FOG_START, FOV, HOP_HEIGHT, HOP_TIME, ITEM_BANANA, ITEM_SHELL, ITEM_TURBO,
  KH, KW, LAPS, MAX_BANANAS, MINI_TURBO_1, MINI_TURBO_2, TEX, TRACK_W, type ItemKind,
} from "./config";
import { wrapAngle } from "./physics";
import { heightAt, terrainOf, type Terrain } from "./terrain";
import { trackCanvas, type Deco, type Track } from "./track";

export interface KartSprite {
  index: number;
  x: number;
  y: number;
  a: number;
  spin: number;
}

export interface Standing {
  index: number;
  place: number;
  time: number;
  ai: boolean;
}

/** Todo lo que hace falta para dibujar un frame desde el punto de vista de un jugador. */
export interface RaceView {
  track: Track;
  me: {
    index: number; x: number; y: number; a: number; ma: number; spin: number; steerVis: number; turbo: number;
    offroad: boolean; v: number; hop: number; drift: number; driftTime: number;
  };
  others: KartSprite[];
  boxes: { x: number; y: number; active: boolean }[];
  bananas: { x: number; y: number }[];
  shells: { x: number; y: number }[];
  phase: number;
  countdown: number;
  time: number;
  lap: number;
  rank: number;
  item: ItemKind;
  results: Standing[] | null;
  aiSlots: boolean[];
  netLabel: string;
  footer: string;
}

const MINIMAP = 52; // lado del minimapa (px lógicos)
const SMALL = "bold 8px Arial, sans-serif";
const MID = "bold 11px Arial, sans-serif";

const S = 0.05; // unidades del juego → escena
const at = (x: number, y: number, h: number): [number, number, number] => [x * S, h * S, y * S];
/** Guiñada que hace mirar el eje −z local hacia el rumbo `a` del juego. */
const yawOf = (a: number) => Math.atan2(-Math.cos(a), -Math.sin(a));
const hex = (c: readonly number[]) => (c[0] << 16) | (c[1] << 8) | c[2];
const shadeHex = (c: number, k: number) => {
  const f = (v: number) => Math.min(255, Math.round(v * k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function racerName(index: number, ai: boolean): string {
  return ai ? `CPU ${index + 1}` : PLAYER_NAMES[index];
}

// --- Modelos de bloques (metros; miran hacia −z, apoyados en y = 0) ---

function kartBlocks(color: number): Block[] {
  const dark = shadeHex(color, 0.55), light = shadeHex(color, 1.3), tyre = 0x1a1a1c, metal = 0x6a6c74;
  const b: Block[] = [
    { s: [0.62, 0.14, 0.95], p: [0, 0.17, 0], color },
    { s: [0.42, 0.1, 0.3], p: [0, 0.16, -0.6], color },
    { s: [0.66, 0.08, 0.08], p: [0, 0.12, -0.74], color: 0x333338 },
    { s: [0.36, 0.3, 0.14], p: [0, 0.36, 0.22], color: 0x222226 },
    { s: [0.4, 0.18, 0.22], p: [0, 0.3, 0.44], color: metal },
    { s: [0.72, 0.05, 0.14], p: [0, 0.52, 0.54], color },
    { s: [0.2, 0.04, 0.04], p: [0, 0.44, -0.14], color: 0x222226 },
    // Piloto con casco del color del kart
    { s: [0.32, 0.3, 0.22], p: [0, 0.5, 0.08], color: dark },
    { s: [0.28, 0.26, 0.28], p: [0, 0.78, 0.06], color: light },
    { s: [0.22, 0.08, 0.02], p: [0, 0.78, -0.085], color: 0x101014 },
  ];
  for (const s of [-1, 1]) {
    b.push(
      { s: [0.12, 0.12, 0.5], p: [s * 0.37, 0.18, 0.08], color: dark },
      { s: [0.04, 0.14, 0.04], p: [s * 0.26, 0.44, 0.54], color: dark },
      { s: [0.08, 0.08, 0.14], p: [s * 0.12, 0.34, 0.6], color: 0x88888c },
      { s: [0.08, 0.08, 0.26], p: [s * 0.16, 0.48, -0.06], color: dark },
      { s: [0.16, 0.24, 0.24], p: [s * 0.38, 0.12, -0.36], color: tyre },
      { s: [0.2, 0.26, 0.28], p: [s * 0.4, 0.13, 0.36], color: tyre },
      { s: [0.02, 0.1, 0.1], p: [s * 0.47, 0.12, -0.36], color: 0xbbbbc0 },
      { s: [0.02, 0.1, 0.1], p: [s * 0.51, 0.13, 0.36], color: 0xbbbbc0 },
    );
  }
  return b;
}

/** Decoración en el mundo (árbol, arbusto, cactus, roca, pino), de bloques. */
function decoBlocks(d: Deco, ground: number, rnd: Rng): Block[] {
  const k = d.size * 1.25;
  const [x, y, z] = at(d.x, d.y, ground);
  const yaw = rnd.next() * Math.PI;
  const r: [number, number, number] = [0, yaw, 0];
  const p = (dx: number, dy: number, dz: number): [number, number, number] => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return [x + (dx * c + dz * s) * k, y + dy * k, z + (-dx * s + dz * c) * k];
  };
  const box = (sx: number, sy: number, sz: number, dx: number, dy: number, dz: number, color: number): Block =>
    ({ s: [sx * k, sy * k, sz * k], p: p(dx, dy, dz), color, r });
  switch (d.kind) {
    case "tree":
      return [
        box(0.26, 1.1, 0.26, 0, 0.55, 0, 0x6e4828),
        box(1.4, 0.9, 1.4, 0, 1.45, 0, 0x2f8a3c),
        box(0.9, 0.6, 0.9, 0.1, 2.1, -0.1, 0x46a04a),
      ];
    case "bush":
      return [box(0.8, 0.5, 0.7, -0.2, 0.25, 0, 0x2c8034), box(0.6, 0.6, 0.6, 0.3, 0.3, 0.1, 0x40964a)];
    case "cactus":
      return [
        box(0.32, 1.9, 0.32, 0, 0.95, 0, 0x3c9646),
        box(0.4, 0.2, 0.2, -0.34, 0.8, 0, 0x3c9646), box(0.2, 0.6, 0.2, -0.5, 1.1, 0, 0x3c9646),
        box(0.4, 0.2, 0.2, 0.34, 1.1, 0, 0x3c9646), box(0.2, 0.5, 0.2, 0.5, 1.35, 0, 0x3c9646),
      ];
    case "rock":
      return [box(1.0, 0.55, 0.8, 0, 0.27, 0, 0x807c78), box(0.55, 0.4, 0.55, 0.3, 0.6, 0.1, 0x6e6a66)];
    case "pine": {
      const out = [box(0.22, 0.6, 0.22, 0, 0.3, 0, 0x5a3c24)];
      [[1.5, 0.75], [1.05, 1.25], [0.6, 1.7]].forEach(([w, h]) => {
        out.push(box(w, 0.5, w, 0, h, 0, 0x1e5a3c), box(w * 0.85, 0.08, w * 0.85, 0, h + 0.27, 0, 0xf0f6fc));
      });
      return out;
    }
  }
  return [];
}

function bananaBlocks(): Block[] {
  return [
    { s: [0.12, 0.1, 0.32], p: [0, 0.1, 0], color: 0xf2cf2a },
    { s: [0.12, 0.1, 0.16], p: [0, 0.16, -0.2], color: 0xf2cf2a, r: [0.6, 0, 0] },
    { s: [0.12, 0.1, 0.16], p: [0, 0.16, 0.2], color: 0xf2cf2a, r: [-0.6, 0, 0] },
    { s: [0.06, 0.06, 0.06], p: [0, 0.24, -0.28], color: 0x5a3a14 },
  ];
}

function shellBlocks(): Block[] {
  return [
    { s: [0.42, 0.24, 0.42], p: [0, 0.14, 0], color: 0x28be46 },
    { s: [0.3, 0.1, 0.3], p: [0, 0.3, 0], color: 0xebffeb },
    { s: [0.46, 0.06, 0.46], p: [0, 0.04, 0], color: 0xf0f0f0 },
  ];
}

/** Distancia del punto (x, z) al segmento a–b en el plano. */
function distToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}

/** Lienzo pequeño para texturas (signo "?" de las cajas, cuadros de la meta). */
function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Pool {
  meshes: THREE.Mesh[];
}

/** La escena de un circuito: se construye al empezar la carrera y en cada frame solo se recoloca. */
class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, KW / KH, 0.05, 800);
  readonly terrain: Terrain;
  private sun = new THREE.DirectionalLight(0xfff4e0, 1.9);
  private sky: THREE.Mesh;
  /** Un decorado por malla, para poder ocultar el que tape la vista (x, z y radio en la escena). */
  private decos: { mesh: THREE.Mesh; x: number; z: number; r: number }[] = [];
  private karts = new Map<number, THREE.Mesh>();
  private boxes: THREE.Mesh[] = [];
  private boxMat: THREE.MeshStandardMaterial;
  private bananas: Pool;
  private shells: Pool;
  private sparks: THREE.Mesh[] = [];
  private flames: THREE.Group;
  private flameGlow = glowSprite(0xff9a30, 0.9, 0);

  constructor(readonly track: Track, anisotropy: number) {
    const th = track.theme;
    const t = (this.terrain = terrainOf(track));
    const sc = this.scene;
    sc.fog = new THREE.Fog(hex(th.skyBottom), FOG_START * S, FOG_END * S);

    // Cielo: caja enorme con degradado de arriba abajo (no le afecta la niebla).
    const skyGeo = new THREE.BoxGeometry(700, 700, 700);
    const top = new THREE.Color(hex(th.skyTop)), bottom = new THREE.Color(hex(th.skyBottom));
    const sp = skyGeo.attributes.position;
    const skyColors = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i++) {
      const c = sp.getY(i) > 0 ? top : bottom;
      skyColors.set([c.r, c.g, c.b], i * 3);
    }
    skyGeo.setAttribute("color", new THREE.BufferAttribute(skyColors, 3));
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sc.add(this.sky);

    // Luz: cielo y suelo del tema, y un sol con sombras que acompaña al kart propio.
    sc.add(new THREE.HemisphereLight(hex(th.skyTop), hex(th.grass), 1.3));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0006;
    sc.add(this.sun, this.sun.target);

    // Terreno: rejilla con relieve, caras planas y el dibujo del circuito encima.
    const row = t.seg + 1;
    const pos = new Float32Array(row * row * 3), uv = new Float32Array(row * row * 2);
    for (let j = 0; j < row; j++) {
      for (let i = 0; i < row; i++) {
        const x = t.x0 + i * t.step, y = t.x0 + j * t.step, k = j * row + i;
        pos.set(at(x, y, t.h[k]), k * 3);
        uv.set([x / TEX, 1 - y / TEX], k * 2);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < t.seg; j++) {
      for (let i = 0; i < t.seg; i++) {
        const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const groundGeo = new THREE.BufferGeometry();
    groundGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    groundGeo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    groundGeo.setIndex(idx);
    groundGeo.computeVertexNormals();
    const map = new THREE.CanvasTexture(trackCanvas(track));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map, roughness: 1, flatShading: true }));
    ground.receiveShadow = true;
    sc.add(ground);
    // Más allá del relieve, una llanura que se pierde en la niebla.
    const plain = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: hex(th.grass2), roughness: 1 }));
    plain.position.set(TEX * S / 2, t.min * S - 0.4, TEX * S / 2);
    sc.add(plain);

    // Decorados de bloques (cada uno, una malla de un solo dibujo).
    const rnd = new Rng(track.seed ^ 0xdec0);
    const decoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    for (const d of track.decos) {
      const mesh = new THREE.Mesh(blockGeometry(decoBlocks(d, heightAt(t, d.x, d.y), rnd)), decoMat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.decos.push({ mesh, x: d.x * S, z: d.y * S, r: 0.9 * d.size * 1.25 });
      sc.add(mesh);
    }

    // Montañas escalonadas y nubes de cubos alrededor del mapa (sin niebla: se ven siempre).
    const mountains: Block[] = [];
    const cx = (TEX / 2) * S, cz = (TEX / 2) * S;
    const snowy = th.name === "Nieve";
    for (const [ring, count, color] of [[150, 34, hex(th.hills)], [190, 28, hex(th.hillsFar)]] as const) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rnd.next() * 0.1;
        const r = ring + rnd.next() * 20, w = 18 + rnd.next() * 26, h = 12 + rnd.next() * 30;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, base = t.min * S - 2;
        for (let tier = 0; tier < 3; tier++) {
          const k = 1 - tier * 0.3, th2 = (h / 3) * (tier + 1);
          const capColor = snowy && tier === 2 ? 0xf2f6fc : shadeHex(color, 1 + tier * 0.08);
          mountains.push({ s: [w * k, th2, w * k], p: [x, base + th2 / 2, z], color: capColor, r: [0, a, 0] });
        }
      }
    }
    sc.add(new THREE.Mesh(blockGeometry(mountains), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
    const clouds: Block[] = [];
    for (let i = 0; i < 16; i++) {
      const a = rnd.next() * Math.PI * 2, r = 30 + rnd.next() * 130, y = 45 + rnd.next() * 30;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      for (let k = 0; k < 3; k++) clouds.push({ s: [8 + rnd.next() * 10, 3 + rnd.next() * 2, 6 + rnd.next() * 6], p: [x + k * 6 - 6, y + rnd.next() * 2, z + rnd.next() * 4], color: 0xffffff });
    }
    sc.add(new THREE.Mesh(blockGeometry(clouds), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.85 })));

    // Arco de meta con cuadros, sobre la recta de salida.
    const d0 = track.dir[0], nx = -Math.sin(d0), ny = Math.cos(d0);
    const span = TRACK_W / 2 + 14;
    const h0 = heightAt(t, track.px[0], track.py[0]);
    const post = new THREE.MeshStandardMaterial({ color: 0x9a9aa4, roughness: 0.6 });
    const checker = canvasTexture(64, 16, (g) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? "#111" : "#fff";
        g.fillRect(i * 4, j * 4, 4, 4);
      }
    });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), post);
      p.position.set(...at(track.px[0] + nx * span * s, track.py[0] + ny * span * s, h0 + 26));
      p.castShadow = true;
      sc.add(p);
    }
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(span * 2 * S + 0.4, 0.6, 0.15),
      [post, post, post, post, new THREE.MeshStandardMaterial({ map: checker }), new THREE.MeshStandardMaterial({ map: checker })],
    );
    banner.position.set(...at(track.px[0], track.py[0], h0 + 50));
    banner.rotation.y = yawOf(d0);
    banner.castShadow = true;
    sc.add(banner);

    // Cajas de objetos: cubos de colores que giran, con "?" en cada cara.
    const q = canvasTexture(64, 64, (g) => {
      g.fillStyle = "rgba(255,255,255,0.25)";
      g.fillRect(0, 0, 64, 64);
      g.strokeStyle = "#fff";
      g.lineWidth = 6;
      g.strokeRect(3, 3, 58, 58);
      g.fillStyle = "#fff";
      g.font = "bold 44px Arial, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("?", 32, 35);
    });
    this.boxMat = new THREE.MeshStandardMaterial({ map: q, transparent: true, opacity: 0.9, roughness: 0.3, emissive: 0x222222 });
    for (let i = 0; i < track.boxes.length; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.boxMat);
      m.castShadow = true;
      this.boxes.push(m);
      sc.add(m);
    }

    // Plátanos, proyectiles, chispas del derrape y llamas del turbo.
    const blockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const pool = (count: number, geo: THREE.BufferGeometry): Pool => {
      const meshes = Array.from({ length: count }, () => {
        const m = new THREE.Mesh(geo, blockMat);
        m.castShadow = true;
        m.visible = false;
        sc.add(m);
        return m;
      });
      return { meshes };
    };
    this.bananas = pool(MAX_BANANAS, blockGeometry(bananaBlocks()));
    this.shells = pool(8, blockGeometry(shellBlocks()));
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.visible = false;
      this.sparks.push(m);
      sc.add(m);
    }
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a20 });
    this.flames = new THREE.Group();
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), flameMat);
      f.position.set(s * 0.12, 0.34, 0.8);
      this.flames.add(f);
    }
    this.flames.add(this.flameGlow);
    this.flameGlow.position.set(0, 0.34, 0.85);
    sc.add(this.flames);
  }

  private kart(index: number): THREE.Mesh {
    let m = this.karts.get(index);
    if (!m) {
      m = new THREE.Mesh(blockGeometry(kartBlocks(hex(PLAYER_COLORS[index]))), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
      m.castShadow = true;
      m.rotation.order = "YXZ";
      m.scale.setScalar(0.8);
      this.karts.set(index, m);
      this.scene.add(m);
    }
    return m;
  }

  /** Coloca un kart sobre el relieve: altura del suelo e inclinación según la pendiente. */
  private placeKart(m: THREE.Mesh, x: number, y: number, a: number, yaw: number, lift: number) {
    const t = this.terrain;
    const fx = Math.cos(a), fy = Math.sin(a), rx = -fy, ry = fx;
    const hF = heightAt(t, x + fx * 8, y + fy * 8), hB = heightAt(t, x - fx * 8, y - fy * 8);
    const hR = heightAt(t, x + rx * 6, y + ry * 6), hL = heightAt(t, x - rx * 6, y - ry * 6);
    m.position.set(...at(x, y, heightAt(t, x, y) + lift));
    m.rotation.set(Math.atan2(hF - hB, 16), yaw, Math.atan2(hR - hL, 12), "YXZ");
  }

  update(v: RaceView, time: number, cam: { a: number; pitch: number }) {
    const t = this.terrain;
    const me = v.me;
    // Kart propio: el morro tal cual (cruzado lo justo en el derrape) y un poco girado al dar volante.
    const hop = me.hop > 0 ? Math.sin((me.hop / HOP_TIME) * Math.PI) * HOP_HEIGHT : 0;
    const bounce = me.offroad && Math.abs(me.v) > 20 ? Math.abs(Math.sin(time * 40)) * 0.8 : 0;
    const visA = me.a + me.steerVis * 0.08;
    const mine = this.kart(me.index);
    this.placeKart(mine, me.x, me.y, me.a, yawOf(visA) + (me.spin > 0 ? time * 14 : 0), hop + bounce);
    for (const k of v.others) {
      this.placeKart(this.kart(k.index), k.x, k.y, k.a, yawOf(k.a) + (k.spin > 0 ? time * 14 : 0), 0);
    }

    // Turbo: llamas por los tubos de escape.
    this.flames.visible = me.turbo > 0;
    if (me.turbo > 0) {
      this.flames.position.copy(mine.position);
      this.flames.rotation.copy(mine.rotation);
      const f = 0.8 + Math.random() * 0.6;
      this.flames.children.forEach((c) => c !== this.flameGlow && c.scale.set(1, 1, f));
      this.flameGlow.material.opacity = 0.8;
    }
    // Chispas del derrape: blancas, luego azules (miniturbo) y naranjas (miniturbo largo).
    const sparkColor = me.driftTime > MINI_TURBO_2 ? 0xff9628 : me.driftTime > MINI_TURBO_1 ? 0x50aaff : 0xfffad2;
    const rear = new THREE.Vector3();
    this.sparks.forEach((s, i) => {
      s.visible = !!me.drift && me.spin <= 0;
      if (!s.visible) return;
      (s.material as THREE.MeshBasicMaterial).color.setHex(sparkColor);
      rear.set((i % 2 ? 0.42 : -0.42) + (Math.random() - 0.5) * 0.15, 0.05 + Math.random() * 0.15, 0.4 + Math.random() * 0.2);
      s.position.copy(mine.localToWorld(rear));
      s.scale.setScalar(me.driftTime > MINI_TURBO_1 ? 1.8 : 1);
    });

    // Cajas, plátanos y proyectiles
    this.boxMat.color.setHSL((time * 0.35) % 1, 0.85, 0.6);
    v.boxes.forEach((b, i) => {
      const m = this.boxes[i];
      if (!m) return;
      m.visible = b.active;
      m.position.set(...at(b.x, b.y, heightAt(t, b.x, b.y) + 9 + Math.sin(time * 3 + i) * 1.5));
      m.rotation.set(time * 0.8, time * 1.3 + i, 0);
    });
    const place = (pool: Pool, list: { x: number; y: number }[], spin: number) =>
      pool.meshes.forEach((m, i) => {
        const it = list[i];
        m.visible = !!it;
        if (!it) return;
        m.position.set(...at(it.x, it.y, heightAt(t, it.x, it.y)));
        m.rotation.y = spin * (i + 1);
      });
    place(this.bananas, v.bananas, 0.7);
    place(this.shells, v.shells, time * 10);

    // Cámara detrás del kart, a la altura del relieve, mirando un poco por delante.
    const ca = Math.cos(cam.a), sa = Math.sin(cam.a);
    const cx = me.x - ca * CAM_DIST, cy = me.y - sa * CAM_DIST;
    const hK = heightAt(t, me.x, me.y);
    const camH = Math.max(hK + CAM_HEIGHT, heightAt(t, cx, cy) + 8);
    this.camera.position.set(...at(cx, cy, camH));
    this.camera.rotation.set(cam.pitch, yawOf(cam.a), 0, "YXZ");
    this.sky.position.copy(this.camera.position);
    // Lo que se interpone entre la cámara y el kart propio no se dibuja (karts en la parrilla,
    // árboles y rocas al salirse de la pista).
    const [ax, , az] = at(cx, cy, 0);
    const [bx, , bz] = at(cx + (me.x - cx) * 0.85, cy + (me.y - cy) * 0.85, 0);
    const blocks = (x: number, z: number, r: number) => distToSegment(x, z, ax, az, bx, bz) < r;
    for (const d of this.decos) d.mesh.visible = !blocks(d.x, d.z, d.r);
    for (const k of v.others) {
      const [kx, , kz] = at(k.x, k.y, 0);
      this.kart(k.index).visible = !blocks(kx, kz, 0.55);
    }
    // El sol acompaña al kart para que las sombras de cerca tengan detalle.
    this.sun.target.position.copy(mine.position);
    this.sun.position.set(mine.position.x + 14, mine.position.y + 30, mine.position.z + 9);
  }

  /** Inclinación de la cámara: mira a un punto por delante del kart, siguiendo las cuestas. */
  lookPitch(v: RaceView, camA: number): number {
    const t = this.terrain;
    const me = v.me;
    const ca = Math.cos(camA), sa = Math.sin(camA);
    const cx = me.x - ca * CAM_DIST, cy = me.y - sa * CAM_DIST;
    const hK = heightAt(t, me.x, me.y);
    const camH = Math.max(hK + CAM_HEIGHT, heightAt(t, cx, cy) + 8);
    const hT = heightAt(t, me.x + ca * CAM_LOOK, me.y + sa * CAM_LOOK);
    return Math.atan2(hT + 4 - camH, CAM_DIST + CAM_LOOK);
  }

  groundAt(x: number, y: number): number {
    return heightAt(this.terrain, x, y);
  }
}

export class KartsRenderer {
  time = 0;
  private stage: Stage | null = null;
  private camA = 0;
  private pitch = -0.27;
  private camReady = false;

  reset() {
    this.camReady = false;
  }

  update(dt: number) {
    this.time += dt;
  }

  draw(ctx: Ctx, v: RaceView, pixelScale = 1) {
    const me = v.me;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, KW, KH);
    const gl = glRenderer();
    if (!gl) {
      text(ctx, "Este equipo no puede mostrar gráficos 3D (WebGL)", KW / 2, KH / 2 - 10, [255, 200, 160], SMALL, "center");
      this.drawHud(ctx, v);
      return;
    }
    if (!this.stage || this.stage.track !== v.track) {
      if (this.stage) disposeScene(this.stage.scene);
      this.stage = new Stage(v.track, gl.capabilities.getMaxAnisotropy());
      this.camReady = false;
    }
    // La cámara sigue la dirección de avance (no el morro): en un derrape el kart se ve cruzado.
    // Tampoco gira con los trompos.
    if (!this.camReady) {
      this.camA = me.ma;
      this.pitch = this.stage.lookPitch(v, me.ma);
      this.camReady = true;
    } else if (me.spin <= 0) {
      this.camA += wrapAngle(me.ma - this.camA) * 0.2;
    }
    this.pitch += (this.stage.lookPitch(v, this.camA) - this.pitch) * 0.15;
    this.stage.update(v, this.time, { a: this.camA, pitch: this.pitch });
    renderInto(ctx, this.stage.scene, this.stage.camera, KW, KH, pixelScale, 1.05);
    this.drawLabels(ctx, v, this.stage);
    this.drawHud(ctx, v);
  }

  /** Número de cada kart rival encima de él (también identifica en escala de grises). */
  private drawLabels(ctx: Ctx, v: RaceView, stage: Stage) {
    for (const k of v.others) {
      const p = projectTo(stage.camera, at(k.x, k.y, stage.groundAt(k.x, k.y) + 24), KW, KH);
      if (!p || p[2] > 30) continue;
      const r = Math.max(2.5, Math.min(5, 40 / p[2]));
      badge(ctx, p[0], p[1], r, PLAYER_COLORS[k.index], String(k.index + 1));
    }
  }

  // --- HUD ---
  private drawHud(ctx: Ctx, v: RaceView) {
    // Vuelta y tiempo
    const lap = `VUELTA ${Math.min(LAPS, Math.max(1, v.lap))}/${LAPS}`;
    panel(ctx, 3, 3, Math.max(textWidth(ctx, lap, SMALL), textWidth(ctx, "0:00.0", SMALL)) + 10, 22, [61, 242, 255], 0.7);
    shadowText(ctx, lap, 7, 5, [255, 255, 255], SMALL);
    shadowText(ctx, formatTime(v.time), 7, 14, [255, 230, 120], SMALL);
    // Posición
    const pos = `${v.rank}º`;
    titleText(ctx, pos, KW - 24, 2, v.rank === 1 ? [255, 220, 60] : [255, 255, 255], "20px", "right");
    shadowText(ctx, `/${v.aiSlots.length}`, KW - 5, 10, [255, 255, 255], SMALL, "right");
    // Objeto
    const bx = KW / 2 - 12;
    panel(ctx, bx, 3, 24, 22, [255, 207, 80], 0.85);
    if (v.item) drawItemIcon(ctx, v.item, KW / 2, 14, 16);

    this.drawMinimap(ctx, v);

    if (v.netLabel) shadowText(ctx, v.netLabel, KW - 4, KH - 10, [200, 200, 220], "7px", "right");
    if (v.footer && v.phase !== 2) shadowText(ctx, v.footer, KW / 2, KH - 10, [235, 235, 245], "7px", "center");

    if (v.phase === 0) {
      titleText(ctx, String(Math.ceil(v.countdown)), KW / 2, 78, [255, 230, 80], "40px");
    } else if (v.phase === 1 && v.time < 0.8) {
      titleText(ctx, "¡YA!", KW / 2, 82, [120, 255, 120], "32px");
    }
    if (v.results) this.drawResults(ctx, v);
  }

  /** Minimapa arriba a la derecha: trazado, meta y karts (el propio, más grande y con borde). */
  private drawMinimap(ctx: Ctx, v: RaceView) {
    const m = minimapOf(v.track);
    const x0 = KW - MINIMAP - 4;
    const y0 = 26;
    panel(ctx, x0 - 2, y0 - 2, MINIMAP + 4, MINIMAP + 4, [120, 120, 150], 0.5);
    ctx.save();
    ctx.translate(x0, y0);
    // Trazado con esquinas a inglete y marcas cuadradas, como un minimapa de 16 bits.
    ctx.lineJoin = "miter";
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2.5;
    ctx.stroke(m.path);
    ctx.strokeStyle = "rgb(110,110,125)";
    ctx.lineWidth = 1.2;
    ctx.stroke(m.path);
    const [fx, fy] = m.map(v.track.px[0], v.track.py[0]);
    ctx.fillStyle = "#fff";
    ctx.fillRect(fx - 1.5, fy - 1.5, 3, 3);
    for (const k of v.others) {
      const [kx, ky] = m.map(k.x, k.y);
      ctx.fillStyle = "#000";
      ctx.fillRect(kx - 2, ky - 2, 4, 4);
      ctx.fillStyle = css(PLAYER_COLORS[k.index]);
      ctx.fillRect(kx - 1.5, ky - 1.5, 3, 3);
    }
    const [mx, my] = m.map(v.me.x, v.me.y);
    const blink = Math.floor(this.time * 4) % 2 === 0;
    ctx.fillStyle = blink ? "#fff" : "#000";
    ctx.fillRect(mx - 3, my - 3, 6, 6);
    ctx.fillStyle = css(PLAYER_COLORS[v.me.index]);
    ctx.fillRect(mx - 2, my - 2, 4, 4);
    ctx.restore();
  }

  private drawResults(ctx: Ctx, v: RaceView) {
    panel(ctx, 24, 40, KW - 48, 30 + v.results!.length * 18, [255, 61, 139], 0.85);
    titleText(ctx, "RESULTADOS", KW / 2, 46, [255, 220, 60], MID);
    v.results!.forEach((r, i) => {
      const y = 66 + i * 18;
      const color = PLAYER_COLORS[r.index];
      badge(ctx, 40, y + 4.5, 5, color, String(r.index + 1));
      text(ctx, `${r.place}º`, 50, y, [255, 255, 255], MID);
      text(ctx, racerName(r.index, r.ai) + (r.index === v.me.index ? " (tú)" : ""), 72, y, color, MID);
      text(ctx, r.time ? formatTime(r.time) : "--", KW - 32, y, [220, 220, 230], MID, "right");
    });
    const lit = Math.floor(this.time * 2) % 2 === 0; // parpadea como un "PULSA START"
    text(ctx, fitText(ctx, v.footer, KW - 56, "7px"), KW / 2, 52 + v.results!.length * 18 + 20, lit ? [255, 236, 190] : [140, 130, 105], "7px", "center");
  }
}

interface Minimap {
  path: Path2D;
  map: (x: number, y: number) => [number, number];
}

/** Trazado del circuito escalado al minimapa; se calcula una vez por circuito. */
const minimaps = new WeakMap<Track, Minimap>();
function minimapOf(track: Track): Minimap {
  let m = minimaps.get(track);
  if (m) return m;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.px[i]);
    maxX = Math.max(maxX, track.px[i]);
    minY = Math.min(minY, track.py[i]);
    maxY = Math.max(maxY, track.py[i]);
  }
  const pad = 4;
  const scale = (MINIMAP - pad * 2) / Math.max(maxX - minX, maxY - minY);
  const ox = pad + (MINIMAP - pad * 2 - (maxX - minX) * scale) / 2;
  const oy = pad + (MINIMAP - pad * 2 - (maxY - minY) * scale) / 2;
  const map = (x: number, y: number): [number, number] => [ox + (x - minX) * scale, oy + (y - minY) * scale];
  const path = new Path2D();
  for (let i = 0; i < track.n; i++) {
    const [x, y] = map(track.px[i], track.py[i]);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  m = { path, map };
  minimaps.set(track, m);
  return m;
}

/** Icono del objeto en el HUD. */
export function drawItemIcon(ctx: Ctx, item: number, cx: number, cy: number, size: number) {
  const s = size / 10;
  if (item === ITEM_TURBO) {
    polygon(ctx, [[cx - 4 * s, cy + 4 * s], [cx, cy - 5 * s], [cx + 4 * s, cy + 4 * s], [cx, cy + 1.5 * s]], [255, 140, 30], [255, 230, 120], 1);
  } else if (item === ITEM_BANANA) {
    ctx.fillStyle = "rgb(242,207,42)";
    ctx.fillRect(cx - 4 * s, cy, 8 * s, 2.4 * s);
    ctx.fillRect(cx - 5 * s, cy - 2.4 * s, 2.4 * s, 2.6 * s);
    ctx.fillRect(cx + 2.6 * s, cy - 2.4 * s, 2.4 * s, 2.6 * s);
  } else if (item === ITEM_SHELL) {
    ctx.fillStyle = "rgb(40,190,70)";
    ctx.fillRect(cx - 4 * s, cy - 2 * s, 8 * s, 5 * s);
    ctx.fillStyle = "rgb(235,255,235)";
    ctx.fillRect(cx - 2.5 * s, cy - 3.5 * s, 5 * s, 2 * s);
  }
}
