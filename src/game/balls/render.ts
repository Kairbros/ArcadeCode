// Render 3D de Sumo de bolas (Three.js, estilo de bloques): plataforma de baldosas sobre un mar de
// lava de cubos, bolas facetadas con su muñeco encima y cámara fija al sur, alta, mirando al norte.
// Las baldosas que quedan fuera del radio tiemblan y caen a la lava. El HUD se dibuja en 2D encima.
// Coordenadas del juego: x a la derecha, y hacia la cámara, z hacia arriba; en la escena se usan
// metros de juguete (× S) con y hacia arriba.
import * as THREE from "three";
import { PLAYER_COLORS, PLAYER_NAMES, type RGB } from "../core/config";
import { badge, fitText, panel, segmentBar, shadowText, text, titleText, type Ctx } from "../core/draw";
import { glRenderer, projectTo, renderInto } from "../core/three";
import {
  ARENA_R, BALL_R, BH, BW, CAM_DIST, CAM_FOLLOW, CAM_HEIGHT, CAM_PITCH, CHECKER, DASH_COOLDOWN, FOV, LAVA_DROP,
  MAX_SPEED, RIM_W, ROUND_TIME, SHRINK_START,
} from "./config";
import type { BallState } from "./arena";

export interface BallSprite {
  index: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  state: BallState;
  dashCool: number;
}

export interface BallsResult {
  index: number;
  place: number;
  ai: boolean;
}

/** Todo lo que hace falta para dibujar un frame desde el punto de vista de un jugador. */
export interface BallsView {
  balls: BallSprite[];
  me: number;
  radius: number;
  phase: number;
  countdown: number;
  time: number;
  wins: number[];
  aiSlots: boolean[];
  results: BallsResult[] | null;
  netLabel: string;
  footer: string;
}

const SMALL = "bold 8px Arial, sans-serif";
const MID = "bold 11px Arial, sans-serif";
const TINY = "bold 7px Arial, sans-serif";

export function ballName(index: number, ai: boolean): string {
  return ai ? `CPU ${index + 1}` : PLAYER_NAMES[index];
}

const S = 0.1; // unidades del juego → escena
const R = BALL_R * S;
const LAVA_Y = -LAVA_DROP * S; // superficie de la lava
const TILE = 6; // lado de cada baldosa (unidades del juego)
const LAVA_CELL = 12;
const LAVA_R = 340;

/** Punto del juego (x, y, altura) en la escena. */
const at = (x: number, y: number, h: number): [number, number, number] => [x * S, h * S, y * S];

/** Valor fijo pseudoaleatorio para cada celda. */
function hash2(x: number, y: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** Paleta cíclica de la lava: rojo oscuro → naranja → amarillo → naranja... */
const LAVA_PALETTE = (() => {
  const stops: RGB[] = [[150, 24, 8], [220, 60, 10], [250, 130, 20], [255, 210, 70], [250, 130, 20], [220, 60, 10]];
  return Array.from({ length: 256 }, (_, i) => {
    const f = (i / 256) * stops.length;
    const a = stops[Math.floor(f)], b = stops[(Math.floor(f) + 1) % stops.length], t = f - Math.floor(f);
    const c = (k: number) => (a[k] + (b[k] - a[k]) * t) / 255;
    return new THREE.Color().setRGB(c(0) * 0.85, c(1) * 0.85, c(2) * 0.85, THREE.SRGBColorSpace);
  });
})();

/** Caja con la cara de arriba más clara que los lados (colores por vértice, multiplicados por el de la instancia). */
function shadedBox(w: number, h: number, d: number, side: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0);
  const n = g.attributes.normal, p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    // Arriba, color pleno; los lados se oscurecen hacia abajo.
    const k = n.getY(i) > 0.5 ? 1 : side * (1 + p.getY(i) / h) * 0.7 + side * 0.3;
    colors.set([k, k, k], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Bola de caras planas (icosaedro) con una franja clara en el ecuador para que se note que rueda. */
function ballGeometry(color: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(R, 1);
  const p = g.attributes.position;
  const base = new THREE.Color(color), band = base.clone().lerp(new THREE.Color(0xffffff), 0.6);
  const colors = new Float32Array(p.count * 3);
  for (let f = 0; f < p.count; f += 3) {
    const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    const c = Math.abs(cy) < R * 0.3 ? band : base;
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Muñeco de bloques que va de pie sobre la bola, mirando a la cámara (+z). Pies en y = 0. */
function buildRider(color: number): { root: THREE.Group; arms: THREE.Group[] } {
  const c = new THREE.Color(color);
  const mat = (hex: number | THREE.Color, rough = 0.8) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough });
  const box = (s: [number, number, number], m: THREE.Material, p: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...s), m);
    mesh.position.set(...p);
    mesh.castShadow = true;
    return mesh;
  };
  const shirt = mat(c.clone().multiplyScalar(0.85)), skin = mat(0xf0c8a0), pants = mat(0x2a2a3a), dark = mat(0x1c1c24);
  const root = new THREE.Group();
  root.add(
    box([0.16, 0.42, 0.18], pants, [-0.11, 0.21, 0]),
    box([0.16, 0.42, 0.18], pants, [0.11, 0.21, 0]),
    box([0.46, 0.46, 0.28], shirt, [0, 0.65, 0]),
    box([0.34, 0.34, 0.32], skin, [0, 1.06, 0]),
    box([0.38, 0.1, 0.36], mat(color), [0, 1.27, 0]),
    box([0.3, 0.04, 0.16], mat(color), [0, 1.23, 0.24]),
    box([0.05, 0.06, 0.02], dark, [-0.08, 1.08, 0.165]),
    box([0.05, 0.06, 0.02], dark, [0.08, 1.08, 0.165]),
  );
  // Brazos abiertos para mantener el equilibrio (giran en el hombro).
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.23, 0.82, 0);
    pivot.add(box([0.38, 0.11, 0.11], shirt, [s * 0.19, 0, 0]));
    root.add(pivot);
    return pivot;
  });
  return { root, arms };
}

interface Tile {
  x: number;
  y: number;
  d: number;
  fall: number; // segundos cayendo (-1 = en su sitio)
  spin: number;
}

interface Bit {
  mesh: THREE.Mesh;
  vel: [number, number, number];
  t: number;
}

interface Player3D {
  ball: THREE.Mesh;
  rider: THREE.Group;
  arms: THREE.Group[];
  q: THREE.Quaternion;
}

/** La escena 3D: se construye una vez y en cada frame solo se recoloca. */
class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, BW / BH, 0.1, 80);
  private tiles: Tile[] = [];
  private tileMesh: THREE.InstancedMesh;
  private lavaCells: { x: number; z: number; n: number }[] = [];
  private lavaMesh: THREE.InstancedMesh;
  private players = new Map<number, Player3D>();
  private bits: Bit[] = [];
  private embers: Bit[] = [];
  private flash = new THREE.PointLight(0xff8030, 0, 14, 1.5);
  private flashT = 9;
  private lastRadius = ARENA_R;
  private readonly o = new THREE.Object3D();
  private readonly c = new THREE.Color();

  constructor() {
    const sc = this.scene;
    sc.background = new THREE.Color(0x1a0606);
    sc.fog = new THREE.Fog(0x2a0905, 20, 48);

    // Luz: sol cálido desde arriba (con sombras) y el resplandor de la lava desde abajo.
    const sun = new THREE.DirectionalLight(0xffe8d0, 1.7);
    sun.position.set(6, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
    sun.shadow.bias = -0.0005;
    sc.add(sun, new THREE.HemisphereLight(0x5a3040, 0xff5020, 1.1), this.flash);

    // Plataforma: baldosas que son columnas hasta la lava.
    for (let x = -ARENA_R; x < ARENA_R; x += TILE) {
      for (let y = -ARENA_R; y < ARENA_R; y += TILE) {
        const cx = x + TILE / 2, cy = y + TILE / 2, d = Math.hypot(cx, cy);
        if (d <= ARENA_R) this.tiles.push({ x: cx, y: cy, d, fall: -1, spin: hash2(cx, cy) - 0.5 });
      }
    }
    this.tileMesh = new THREE.InstancedMesh(
      shadedBox(TILE * S * 0.95, -LAVA_Y + 0.7, TILE * S * 0.95, 0.45),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      this.tiles.length,
    );
    this.tileMesh.castShadow = this.tileMesh.receiveShadow = true;
    sc.add(this.tileMesh);

    // Lava: un mar de cubos luminosos que suben, bajan y cambian de color.
    for (let x = -LAVA_R; x < LAVA_R; x += LAVA_CELL) {
      for (let z = -LAVA_R; z < LAVA_R; z += LAVA_CELL) {
        if (Math.hypot(x, z) <= LAVA_R) this.lavaCells.push({ x: x + LAVA_CELL / 2, z: z + LAVA_CELL / 2, n: hash2(x, z) });
      }
    }
    this.lavaMesh = new THREE.InstancedMesh(
      shadedBox(LAVA_CELL * S * 0.98, 1.2, LAVA_CELL * S * 0.98, 0.6),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
      this.lavaCells.length,
    );
    sc.add(this.lavaMesh);

    // Paredes del volcán: bloques de roca oscura alrededor, perdiéndose en la bruma.
    const rock = new THREE.MeshStandardMaterial({ color: 0x2b2320, roughness: 1 });
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2, r = 38 + hash2(i, 1) * 6, h = 4 + hash2(i, 2) * 12, w = 3 + hash2(i, 3) * 4;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), rock);
      m.position.set(Math.cos(a) * r, LAVA_Y + h / 2 - 1, Math.sin(a) * r);
      m.rotation.y = hash2(i, 4) * 3;
      sc.add(m);
    }
    // Chispas que suben de la lava y salpicaduras.
    const ember = new THREE.MeshBasicMaterial({ color: 0xffb040 });
    for (let i = 0; i < 30; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), ember);
      this.embers.push({ mesh, vel: [0, 0, 0], t: hash2(i, 9) * 4 });
      sc.add(mesh);
    }
    const splash = new THREE.MeshBasicMaterial({ color: 0xff9030 });
    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), splash);
      mesh.visible = false;
      this.bits.push({ mesh, vel: [0, 0, 0], t: 9 });
      sc.add(mesh);
    }
  }

  private player(index: number): Player3D {
    let p = this.players.get(index);
    if (p) return p;
    const color = PLAYER_COLORS[index];
    const hex = (color[0] << 16) | (color[1] << 8) | color[2];
    const ball = new THREE.Mesh(ballGeometry(hex), new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.45, metalness: 0.05,
    }));
    ball.castShadow = true;
    const { root, arms } = buildRider(hex);
    this.scene.add(ball, root);
    p = { ball, rider: root, arms, q: new THREE.Quaternion() };
    this.players.set(index, p);
    return p;
  }

  /** Cubitos de lava que saltan cuando una bola cae. */
  splash(x: number, y: number) {
    const [sx, , sz] = at(x, y, 0);
    let spawned = 0;
    for (const b of this.bits) {
      if (b.t < 1.2 || spawned >= 16) continue;
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 3;
      b.t = 0;
      b.vel = [Math.cos(a) * v, 5 + Math.random() * 4, Math.sin(a) * v];
      b.mesh.position.set(sx, LAVA_Y, sz);
      b.mesh.visible = true;
      spawned++;
    }
    this.flash.position.set(sx, LAVA_Y + 1.5, sz);
    this.flashT = 0;
  }

  update(v: BallsView, time: number, dt: number, camX: number) {
    // --- Baldosas ---
    if (v.radius > this.lastRadius + 1) for (const t of this.tiles) t.fall = -1; // ronda nueva
    this.lastRadius = v.radius;
    const o = this.o;
    this.tiles.forEach((t, i) => {
      if (t.fall < 0 && t.d > v.radius) t.fall = 0;
      if (t.fall >= 0) t.fall += dt;
      o.position.set(t.x * S, 0, t.y * S);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(1);
      if (t.fall >= 0) {
        o.position.y = -6 * t.fall * t.fall;
        o.rotation.set(t.fall * t.spin * 2, 0, t.fall * t.spin * 3);
        if (t.fall > 1.6) o.scale.setScalar(0);
      }
      o.updateMatrix();
      this.tileMesh.setMatrixAt(i, o.matrix);
      const rim = t.d > v.radius - RIM_W;
      const hex = rim
        ? (hash2(t.x, t.y) < 0.5 ? 0x857a74 : 0x6f6864)
        : ((Math.floor(t.x / CHECKER) ^ Math.floor(t.y / CHECKER)) & 1 ? 0xe2ca9e : 0x9e6c48);
      this.c.setHex(hex).multiplyScalar(0.94 + hash2(t.y, t.x) * 0.12);
      this.tileMesh.setColorAt(i, this.c);
    });
    this.tileMesh.instanceMatrix.needsUpdate = true;
    this.tileMesh.instanceColor!.needsUpdate = true;

    // --- Lava ---
    this.lavaCells.forEach((cell, i) => {
      const wave = Math.sin(cell.x * 0.03 + time * 1.3 + cell.n * 6) * 0.5 + 0.5;
      o.position.set(cell.x * S, LAVA_Y - 0.25 + wave * 0.3, cell.z * S);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      this.lavaMesh.setMatrixAt(i, o.matrix);
      const k = (cell.n * 0.6 + wave * 0.3 + time * 0.12) % 1;
      this.lavaMesh.setColorAt(i, LAVA_PALETTE[Math.floor(k * 255)]);
    });
    this.lavaMesh.instanceMatrix.needsUpdate = true;
    this.lavaMesh.instanceColor!.needsUpdate = true;

    // --- Bolas y muñecos ---
    for (const b of v.balls) {
      const p = this.player(b.index);
      const visible = b.state !== 2;
      p.ball.visible = p.rider.visible = visible;
      if (!visible) continue;
      p.ball.position.set(...at(b.x, b.y, BALL_R + b.z));
      // Rueda: gira alrededor del eje perpendicular a la velocidad.
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 1 && b.state === 0) {
        const axis = new THREE.Vector3(b.vy, 0, -b.vx).normalize();
        p.q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, (speed * dt) / BALL_R));
      }
      p.ball.quaternion.copy(p.q);
      p.rider.position.set(...at(b.x, b.y, BALL_R * 2 + b.z - 1));
      const lean = Math.max(-0.45, Math.min(0.45, (b.vx / MAX_SPEED) * 0.45));
      const tilt = Math.max(-0.3, Math.min(0.3, (b.vy / MAX_SPEED) * 0.3));
      p.rider.rotation.set(tilt, 0, -lean);
      const wave = Math.sin(time * 9 + b.index) * 0.35;
      p.arms[0].rotation.z = -0.3 + wave;
      p.arms[1].rotation.z = 0.3 + wave;
    }

    // --- Partículas ---
    for (const b of this.bits) {
      if (b.t >= 1.2) continue;
      b.t += dt;
      b.vel[1] -= 14 * dt;
      b.mesh.position.x += b.vel[0] * dt;
      b.mesh.position.y += b.vel[1] * dt;
      b.mesh.position.z += b.vel[2] * dt;
      b.mesh.rotation.x += dt * 6;
      b.mesh.scale.setScalar(Math.max(0.01, 1 - b.t / 1.2));
      if (b.t >= 1.2 || b.mesh.position.y < LAVA_Y - 0.5) {
        b.t = 9;
        b.mesh.visible = false;
      }
    }
    this.embers.forEach((e, i) => {
      e.t += dt;
      if (e.t > 4) {
        e.t = 0;
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 16;
        e.mesh.position.set(Math.cos(a) * r, LAVA_Y, Math.sin(a) * r - 4);
      }
      e.mesh.position.y += dt * (0.8 + hash2(i, 3) * 0.8);
      e.mesh.position.x += Math.sin(time * 2 + i) * dt * 0.3;
      e.mesh.scale.setScalar(1 - e.t / 4);
    });
    this.flashT += dt;
    this.flash.intensity = this.flashT < 0.6 ? 40 * (1 - this.flashT / 0.6) : 0;

    // --- Cámara fija al sur, siguiendo un poco al jugador de lado ---
    this.camera.position.set(camX * S, CAM_HEIGHT * S, CAM_DIST * S);
    this.camera.rotation.set(CAM_PITCH, 0, 0, "YXZ");
  }
}

export class BallsRenderer {
  time = 0;
  private stage: Stage | null = null;
  private camX = 0;
  private dt = 0;
  // Estado anterior de cada bola (para detectar cuándo toca la lava).
  private prev = new Map<number, { state: BallState }>();
  private outAt = new Map<number, number>();

  reset() {
    this.prev.clear();
    this.outAt.clear();
  }

  update(dt: number) {
    this.time += dt;
    this.dt = dt;
  }

  draw(ctx: Ctx, v: BallsView, pixelScale = 1) {
    const me = v.balls[v.me];
    if (me && me.state === 0) this.camX += (me.x * CAM_FOLLOW - this.camX) * 0.08;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, BW, BH);
    if (!glRenderer()) {
      text(ctx, "Este equipo no puede mostrar gráficos 3D (WebGL)", BW / 2, BH / 2 - 10, [255, 200, 160], SMALL, "center");
      this.drawHud(ctx, v);
      return;
    }
    const stage = (this.stage ??= new Stage());
    this.track(v, stage);
    stage.update(v, this.time, this.dt, this.camX);
    renderInto(ctx, stage.scene, stage.camera, BW, BH, pixelScale, 1.15);
    this.drawLabels(ctx, v, stage);
    this.drawHud(ctx, v);
  }

  /** Chapoteos al tocar la lava. */
  private track(v: BallsView, stage: Stage) {
    for (const b of v.balls) {
      const p = this.prev.get(b.index);
      if (p && p.state !== 2 && b.state === 2) {
        this.outAt.set(b.index, this.time);
        stage.splash(b.x, b.y);
      }
      this.prev.set(b.index, { state: b.state });
    }
  }

  /** Número de cada jugador sobre su muñeco (también identifica en escala de grises) y marca propia. */
  private drawLabels(ctx: Ctx, v: BallsView, stage: Stage) {
    for (const b of v.balls) {
      if (b.state === 2) continue;
      const p = projectTo(stage.camera, at(b.x, b.y, BALL_R * 2 + b.z + 13), BW, BH);
      if (!p) continue;
      const [x, y] = p;
      badge(ctx, x, y, 4.5, PLAYER_COLORS[b.index], String(b.index + 1));
      if (b.index === v.me) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(x - 3.5, y - 10);
        ctx.lineTo(x + 3.5, y - 10);
        ctx.lineTo(x, y - 6);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // --- HUD ---
  private drawHud(ctx: Ctx, v: BallsView) {
    // Tiempo restante en un recuadro, arriba a la izquierda.
    const left = Math.max(0, Math.ceil(ROUND_TIME - v.time));
    panel(ctx, 4, 4, 26, 22, left <= 10 ? [255, 90, 80] : [255, 207, 80], 0.8);
    titleText(ctx, String(left), 17, 15, left <= 10 ? [255, 120, 100] : [255, 255, 255], "12px", "center", "middle");

    const alive = v.balls.filter((b) => b.state === 0).length;
    shadowText(ctx, `EN PIE ${alive}/${v.balls.length}`, BW - 5, 5, [255, 220, 60], SMALL, "right");
    // Victorias acumuladas
    v.balls.forEach((_, i) => {
      const w = v.wins[i] ?? 0;
      const y = 17 + i * 9;
      badge(ctx, BW - 40, y + 3.5, 3.5, PLAYER_COLORS[i], String(i + 1));
      shadowText(ctx, `★${w}`, BW - 5, y, [255, 220, 60], TINY, "right");
      if (i === v.me) shadowText(ctx, "TÚ", BW - 34, y, [235, 235, 245], TINY);
    });

    const me = v.balls[v.me];
    // Embestida lista (barra por segmentos; parpadea cuando está cargada)
    if (me && me.state === 0 && v.phase === 1) {
      const k = 1 - me.dashCool / DASH_COOLDOWN;
      const ready = k >= 1;
      segmentBar(ctx, 6, BH - 22, 44, 5, k, ready ? PLAYER_COLORS[v.me] : [200, 200, 210], 8);
      const blink = !ready || Math.floor(this.time * 3) % 2 === 0;
      if (blink) shadowText(ctx, ready ? "EMBESTIDA ¡LISTA!" : "EMBESTIDA", 5, BH - 31, ready ? [255, 230, 90] : [235, 235, 245], TINY);
    }

    // Encima del texto de ayuda para no pisarse en pantallas estrechas.
    if (v.netLabel) shadowText(ctx, v.netLabel, BW - 4, BH - 20, [200, 200, 220], TINY, "right");
    if (v.footer && !v.results) shadowText(ctx, v.footer, BW / 2, BH - 10, [235, 235, 245], TINY, "center");

    if (v.phase === 0) {
      titleText(ctx, String(Math.ceil(v.countdown)), BW / 2, 66, [255, 230, 80], "40px");
    } else if (v.phase === 1 && v.time < 0.8) {
      titleText(ctx, "¡YA!", BW / 2, 70, [120, 255, 120], "32px");
    } else if (v.phase === 1 && v.time > SHRINK_START && v.time < SHRINK_START + 2.5) {
      titleText(ctx, "¡LA PLATAFORMA SE DESMORONA!", BW / 2, 58, [255, 200, 120], MID);
    }
    const outAt = this.outAt.get(v.me);
    if (me && me.state !== 0 && !v.results) {
      const recent = outAt === undefined || this.time - outAt < 2;
      if (recent) titleText(ctx, "¡A LA LAVA!", BW / 2, 40, [255, 140, 80], "16px");
      else shadowText(ctx, "Eliminado · mirando", BW / 2, 40, [255, 140, 80], SMALL, "center");
    }
    if (v.results) this.drawResults(ctx, v);
  }

  private drawResults(ctx: Ctx, v: BallsView) {
    const res = v.results!;
    const winners = res.filter((r) => r.place === 1);
    const solo = v.balls.length === 1;
    const title = solo
      ? (v.balls[0].state === 0 ? "¡AGUANTASTE!" : `AGUANTASTE ${Math.floor(v.time)} s`)
      : winners.length === 1 ? `¡GANA ${ballName(winners[0].index, winners[0].ai).toUpperCase()}!` : "¡EMPATE!";
    const titleColor: RGB = winners.length === 1 && !solo ? PLAYER_COLORS[winners[0].index] : [235, 235, 245];
    panel(ctx, 20, 40, BW - 40, 46 + res.length * 16, [255, 61, 139], 0.85);
    titleText(ctx, title, BW / 2, 46, titleColor, MID);
    text(ctx, "Victorias", BW - 30, 63, [170, 170, 190], TINY, "right");
    res.forEach((r, i) => {
      const y = 72 + i * 16;
      const color = PLAYER_COLORS[r.index];
      badge(ctx, 36, y + 4.5, 5, color, String(r.index + 1));
      text(ctx, `${r.place}º`, 46, y, [255, 255, 255], MID);
      text(ctx, ballName(r.index, r.ai) + (r.index === v.me ? " (tú)" : ""), 66, y, color, MID);
      text(ctx, String(v.wins[r.index] ?? 0), BW - 30, y, [255, 220, 60], MID, "right");
    });
    const lit = Math.floor(this.time * 2) % 2 === 0; // parpadea como un "PULSA START"
    text(ctx, fitText(ctx, v.footer, BW - 48, TINY), BW / 2, 77 + res.length * 16, lit ? [255, 236, 190] : [140, 130, 105], TINY, "center");
  }
}
