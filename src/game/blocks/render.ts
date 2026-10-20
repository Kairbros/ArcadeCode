// Render 3D de Bloques (Three.js): cada chunk es una malla con el atlas de texturas (la luz y la
// oclusión van horneadas en los colores de los vértices, así que no hacen falta luces para el mundo),
// el agua en otra malla transparente, contorno del bloque al que se apunta, muñecos de bloques para los
// demás jugadores, animales y monstruos de cajas, flechas, explosiones y nubes. El HUD (cruz, barra de bloques,
// jugadores) se dibuja en 2D encima. Día y noche: la luz del cielo horneada se multiplica en el shader por la luz
// del día (`daySky`), sin rehacer mallas; el cielo cambia de color y el sol, la luna y las estrellas giran.
// Coordenadas: 1 unidad = 1 bloque; x, z en el suelo e y hacia arriba (igual que el mundo).
import * as THREE from "three";
import { PLAYER_COLORS, PLAYER_NAMES } from "../core/config";
import { badge, fitText, panel, shadowText, text, titleText, type Ctx } from "../core/draw";
import { disposeScene, glRenderer, projectTo, renderInto } from "../core/three";
import { atlasCanvas, crackCanvas, CRACK_STAGES } from "./atlas";
import { ATLAS_COLS, ATLAS_ROWS, BLOCKS, HOTBAR, WATER } from "./blocks";
import { EYE, VH, VW, WY } from "./config";
import { drawCrafter, drawStack, type Crafter } from "./craftui";
import { drawBlockIcon, drawItemIcon } from "./icons";
import { BLOCKS_HINT_1, BLOCKS_HINT_2, SURVIVAL_HINT_1, SURVIVAL_HINT_2, pointerLocked } from "./input";
import type { Inventory } from "./inventory";
import { itemInfo } from "./items";
import { DAY_LENGTH, daylight, skyFactor, sunHeight } from "./daycycle";
import { brightness, brightnessAt, meshChunk, type MeshData } from "./mesher";
import { CHICKEN, COW, CREEPER, MOBS, PIG, SKELETON, SPIDER, ZOMBIE, type MobView } from "./mobs";
import { EAT_TIME, HURT_FLASH, MAX_AIR, MAX_HEALTH, MAX_HUNGER, RESPAWN_DELAY, type Vitals } from "./vitals";
import { CHUNKS_X, CHUNKS_Z, World, type RayHit } from "./world";

/** Otro jugador, tal como se dibuja. */
export interface Avatar {
  index: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  block: number;
}

/** Objeto tirado en el suelo. */
export interface DropSprite {
  id: number;
  item: number;
  x: number;
  y: number;
  z: number;
}

/** Flecha en vuelo. */
export interface ArrowView {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** Explosión reciente. */
export interface BlastView {
  id: number;
  x: number;
  y: number;
  z: number;
}

/** Todo lo necesario para dibujar un frame desde los ojos del jugador propio. */
export interface BlocksView {
  world: World;
  me: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  slot: number;
  flying: boolean;
  target: RayHit | null;
  others: Avatar[];
  netLabel: string;
  time: number;
  /** Supervivencia: inventario, pantalla abierta, progreso al romper y objeto en la mano. */
  survival: boolean;
  inventory: Inventory;
  crafter: Crafter | null;
  digProgress: number;
  held: number;
  cursor: [number, number];
  drops: DropSprite[];
  mobs: MobView[];
  /** Vida, hambre y aire (solo en supervivencia) y segundos muerto (-1 = vivo). */
  vitals: Vitals | null;
  deadFor: number;
  /** Reloj del día, flechas y explosiones. */
  clock: number;
  arrows: ArrowView[];
  blasts: BlastView[];
}

const TINY = "7px";
const SMALL = "8px";
const SKY = 0x8ec8f2;
const NIGHT = 0x0a0f24;
const SUNSET = 0xf09a5a;
const CHUNKS_PER_FRAME = 4; // chunks que se vuelven a mallar como mucho en cada frame

function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(m.uvs, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(m.colors, 3));
  g.setAttribute("blockLight", new THREE.Float32BufferAttribute(m.blocks, 3));
  g.setIndex(m.indices);
  g.computeBoundingSphere();
  return g;
}

/**
 * El color por vértice es la luz del cielo y `blockLight` la de las antorchas: el shader multiplica la del cielo
 * por la luz del día y se queda con la mayor de las dos.
 */
function skyLit<M extends THREE.Material>(m: M, daySky: { value: number }): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.daySky = daySky;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 blockLight;\nuniform float daySky;")
      .replace("#include <color_vertex>", "#include <color_vertex>\nvColor.rgb = max(vColor.rgb * daySky, blockLight);");
  };
  return m;
}

/** Material con luz que se oscurece según la luz del sitio (guarda su color de base). */
function litMaterial(hex: number, mats: THREE.MeshLambertMaterial[]): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: hex });
  m.userData.base = new THREE.Color(hex);
  mats.push(m);
  return m;
}

/** Oscurece (o aclara) unos materiales según la luz de donde está el objeto. */
function shadeMaterials(mats: THREE.MeshLambertMaterial[], k: number) {
  for (const m of mats) m.color.copy(m.userData.base as THREE.Color).multiplyScalar(k);
}

interface Person {
  root: THREE.Group;
  mats: THREE.MeshLambertMaterial[];
  head: THREE.Group;
  arms: THREE.Group[];
  legs: THREE.Group[];
  held: THREE.Mesh;
  last: [number, number];
  stride: number;
}

/** Muñeco de bloques (cabeza, cuerpo, brazos y piernas que giran en hombros y caderas). Pies en y = 0, mirando a −z. */
function buildPerson(color: number, blockMat: THREE.Material): Person {
  const mats: THREE.MeshLambertMaterial[] = [];
  const mat = (hex: number) => litMaterial(hex, mats);
  const box = (s: [number, number, number], m: THREE.Material, p: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...s), m);
    mesh.position.set(...p);
    return mesh;
  };
  const shirt = mat(color), skin = mat(0xe8b890), pants = mat(0x34345a), hair = mat(0x3a2818), dark = mat(0x1c1c24);
  const root = new THREE.Group();
  root.add(box([0.5, 0.72, 0.26], shirt, [0, 1.11, 0]));
  const head = new THREE.Group();
  head.position.set(0, 1.47, 0);
  head.add(
    box([0.5, 0.5, 0.5], skin, [0, 0.25, 0]),
    box([0.52, 0.14, 0.52], hair, [0, 0.46, 0.01]),
    box([0.08, 0.08, 0.02], dark, [-0.11, 0.26, -0.255]),
    box([0.08, 0.08, 0.02], dark, [0.11, 0.26, -0.255]),
  );
  root.add(head);
  const limb = (x: number, y: number, m: THREE.Material) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(box([0.24, 0.72, 0.24], m, [0, -0.36, 0]));
    root.add(pivot);
    return pivot;
  };
  const arms = [limb(-0.37, 1.46, shirt), limb(0.37, 1.46, shirt)];
  const legs = [limb(-0.13, 0.75, pants), limb(0.13, 0.75, pants)];
  // Bloque en la mano derecha (un cubito con la textura del bloque elegido).
  const held = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), blockMat);
  held.position.set(0, -0.72, -0.12);
  arms[1].add(held);
  return { root, mats, head, arms, legs, held, last: [0, 0], stride: 0 };
}

interface Beast {
  root: THREE.Group;
  head: THREE.Group;
  /** Patas: delante izquierda, delante derecha, detrás izquierda, detrás derecha (la gallina, solo 2). */
  legs: THREE.Group[];
  /** Sus materiales (propios: el destello rojo es solo suyo). */
  mats: THREE.MeshLambertMaterial[];
  yaw: number;
  stride: number;
  /** Momento en que se le vio muerto (-1 = vivo). */
  diedAt: number;
  /** Sentido del balanceo de cada pata (las diagonales a la vez). */
  phase: number[];
}

/** Animal de cajas: pies en y = 0, mirando a −z. Patas que giran en la cadera y cabeza que baja a pastar. */
function buildBeast(kind: number): Beast {
  const mats: THREE.MeshLambertMaterial[] = [];
  const mat = (hex: number) => litMaterial(hex, mats);
  const box = (parent: THREE.Object3D, s: [number, number, number], m: THREE.Material, p: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...s), m);
    mesh.position.set(...p);
    parent.add(mesh);
  };
  const root = new THREE.Group(), head = new THREE.Group();
  root.add(head);
  const legs: THREE.Group[] = [];
  const leg = (x: number, z: number, hip: number, w: number, m: THREE.Material) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, hip, z);
    box(pivot, [w, hip, w], m, [0, -hip / 2, 0]);
    root.add(pivot);
    legs.push(pivot);
  };
  const four = (hip: number, dx: number, dz: number, w: number, m: THREE.Material) => {
    for (const z of [-dz, dz]) for (const x of [-dx, dx]) leg(x, z, hip, w, m);
  };
  const eyes = (y: number, z: number, dx: number, m: THREE.Material) => {
    box(head, [0.08, 0.08, 0.02], m, [-dx, y, z]);
    box(head, [0.08, 0.08, 0.02], m, [dx, y, z]);
  };
  const black = mat(0x15151a);
  if (kind === COW) {
    const hide = mat(0x4a3426), spot = mat(0xe8e4dc), snout = mat(0xc89a8a), horn = mat(0xd8d0b8);
    box(root, [0.9, 0.8, 1.3], hide, [0, 0.95, 0]);
    box(root, [0.02, 0.36, 0.44], spot, [0.46, 1.0, 0.18]);
    box(root, [0.02, 0.3, 0.36], spot, [-0.46, 0.9, -0.22]);
    box(root, [0.46, 0.02, 0.4], spot, [0.1, 1.36, 0.3]);
    four(0.55, 0.27, 0.45, 0.24, hide);
    head.position.set(0, 1.12, -0.62);
    box(head, [0.6, 0.6, 0.42], hide, [0, 0, -0.2]);
    box(head, [0.42, 0.24, 0.08], snout, [0, -0.15, -0.44]);
    box(head, [0.1, 0.16, 0.1], horn, [-0.33, 0.32, -0.16]);
    box(head, [0.1, 0.16, 0.1], horn, [0.33, 0.32, -0.16]);
    box(head, [0.22, 0.16, 0.02], spot, [0, 0.16, -0.415]);
    eyes(0.05, -0.415, 0.2, black);
  } else if (kind === PIG) {
    const skin = mat(0xf0a2aa), snout = mat(0xd8727e);
    box(root, [0.78, 0.6, 1.1], skin, [0, 0.6, 0]);
    four(0.3, 0.24, 0.36, 0.24, skin);
    head.position.set(0, 0.72, -0.52);
    box(head, [0.56, 0.52, 0.46], skin, [0, 0, -0.16]);
    box(head, [0.3, 0.2, 0.08], snout, [0, -0.08, -0.43]);
    box(head, [0.05, 0.08, 0.02], black, [-0.07, -0.08, -0.475]);
    box(head, [0.05, 0.08, 0.02], black, [0.07, -0.08, -0.475]);
    eyes(0.1, -0.395, 0.17, black);
  } else if (kind === CHICKEN) {
    const white = mat(0xf4f4f0), beak = mat(0xf0a830), red = mat(0xd83030);
    box(root, [0.4, 0.36, 0.5], white, [0, 0.44, 0.02]);
    box(root, [0.06, 0.24, 0.34], white, [-0.23, 0.46, 0.04]);
    box(root, [0.06, 0.24, 0.34], white, [0.23, 0.46, 0.04]);
    leg(-0.1, 0.02, 0.26, 0.06, beak);
    leg(0.1, 0.02, 0.26, 0.06, beak);
    head.position.set(0, 0.6, -0.2);
    box(head, [0.26, 0.32, 0.22], white, [0, 0.06, -0.04]);
    box(head, [0.14, 0.08, 0.12], beak, [0, 0.06, -0.2]);
    box(head, [0.08, 0.1, 0.06], red, [0, -0.04, -0.17]);
    eyes(0.12, -0.155, 0.09, black);
  } else if (kind === ZOMBIE || kind === SKELETON) {
    // Monigote como los jugadores: el zombi verde con los brazos al frente, el esqueleto flaco con un arco.
    const zombie = kind === ZOMBIE;
    const skin = mat(zombie ? 0x5f9a4a : 0xd8d6cc), shirt = zombie ? mat(0x2f8a9a) : skin, pants = mat(zombie ? 0x3a3a8c : 0xbab8ae);
    const limbW = zombie ? 0.24 : 0.12;
    box(root, [0.5, 0.72, zombie ? 0.26 : 0.16], shirt, [0, 1.11, 0]);
    if (!zombie) for (let k = 0; k < 3; k++) box(root, [0.52, 0.04, 0.2], mat(0x8e8c84), [0, 0.95 + k * 0.18, 0]); // costillas
    leg(-0.13, 0.75, 0.75, limbW, pants);
    leg(0.13, 0.75, 0.75, limbW, pants);
    for (const x of [-0.37, 0.37]) {
      const arm = new THREE.Group();
      arm.position.set(x, 1.4, 0);
      arm.rotation.x = zombie ? -Math.PI / 2 : -0.9;
      box(arm, [limbW, 0.72, limbW], zombie ? skin : skin, [0, -0.36, 0]);
      root.add(arm);
      if (!zombie && x > 0) box(arm, [0.05, 0.05, 0.9], mat(0x6a4a2a), [0, -0.7, 0]); // arco
    }
    head.position.set(0, 1.47, 0);
    box(head, [0.5, 0.5, 0.5], skin, [0, 0.25, 0]);
    const eye = zombie ? black : mat(0x101010);
    box(head, [0.1, zombie ? 0.08 : 0.12, 0.02], eye, [-0.11, 0.27, -0.255]);
    box(head, [0.1, zombie ? 0.08 : 0.12, 0.02], eye, [0.11, 0.27, -0.255]);
    if (!zombie) box(head, [0.26, 0.04, 0.02], eye, [0, 0.1, -0.255]); // dientes
  } else if (kind === SPIDER) {
    const hide = mat(0x2a2422), red = mat(0xd82020);
    box(root, [0.8, 0.5, 0.9], hide, [0, 0.5, 0.35]);
    box(root, [0.5, 0.4, 0.4], hide, [0, 0.5, -0.25]);
    // Ocho patas largas que salen de los lados hacia abajo.
    for (const z of [-0.3, -0.1, 0.1, 0.3]) {
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(s * 0.25, 0.55, z);
        pivot.rotation.z = s * -0.55;
        box(pivot, [0.9, 0.07, 0.07], hide, [s * 0.45, 0, 0]);
        root.add(pivot);
        legs.push(pivot);
      }
    }
    head.position.set(0, 0.5, -0.45);
    box(head, [0.45, 0.36, 0.2], hide, [0, 0, 0]);
    eyes(0.06, -0.105, 0.12, red);
    box(head, [0.06, 0.06, 0.02], red, [-0.05, -0.04, -0.105]);
    box(head, [0.06, 0.06, 0.02], red, [0.05, -0.04, -0.105]);
  } else if (kind === CREEPER) {
    const green = mat(0x4fae46), dark = mat(0x2f7a2a);
    box(root, [0.5, 0.8, 0.3], green, [0, 0.74, 0]);
    box(root, [0.52, 0.12, 0.32], dark, [0, 0.55, 0]);
    four(0.34, 0.13, 0.13, 0.22, dark);
    head.position.set(0, 1.14, 0);
    box(head, [0.5, 0.48, 0.5], green, [0, 0.24, 0]);
    // Cara: ojos cuadrados y boca en forma de T (cajitas negras pegadas a la cara).
    box(head, [0.12, 0.12, 0.02], black, [-0.12, 0.32, -0.255]);
    box(head, [0.12, 0.12, 0.02], black, [0.12, 0.32, -0.255]);
    box(head, [0.12, 0.14, 0.02], black, [0, 0.18, -0.255]);
    box(head, [0.26, 0.08, 0.02], black, [0, 0.08, -0.255]);
  } else {
    const wool = mat(0xeeeeea), face = mat(0xcbb9a2);
    box(root, [0.92, 0.76, 1.22], wool, [0, 0.86, 0]);
    four(0.5, 0.26, 0.42, 0.22, face);
    head.position.set(0, 1.04, -0.6);
    box(head, [0.44, 0.48, 0.42], face, [0, 0, -0.16]);
    box(head, [0.52, 0.2, 0.36], wool, [0, 0.24, -0.1]);
    eyes(0.04, -0.375, 0.13, black);
  }
  const phase = legs.length === 4 ? [1, -1, -1, 1] : legs.map((_, i) => (i % 2 ? -1 : 1) * (Math.floor(i / 2) % 2 ? -1 : 1));
  return { root, head, legs, mats, yaw: 0, stride: 0, diedAt: -1, phase };
}

/** UV de las 6 caras de una caja de Three (+x, −x, +y, −y, +z, −z) para un tipo de bloque. */
function blockBoxGeometry(size: number, block: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(size, size, size);
  const uv = g.attributes.uv;
  const tiles = BLOCKS[block].tiles;
  const faceTile = [tiles[1], tiles[1], tiles[0], tiles[2], tiles[1], tiles[1]];
  for (let f = 0; f < 6; f++) {
    const t = faceTile[f], tu = t % ATLAS_COLS, tv = Math.floor(t / ATLAS_COLS);
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (tu + uv.getX(i)) / ATLAS_COLS, 1 - (tv + 1 - uv.getY(i)) / ATLAS_ROWS);
    }
  }
  return g;
}

/** La escena: chunks, agua, contorno, jugadores y cielo. Se rehace si cambia el mundo. */
class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, VW / VH, 0.05, 170);
  private readonly tex: THREE.CanvasTexture;
  private readonly solidMat: THREE.MeshBasicMaterial;
  private readonly waterMat: THREE.MeshBasicMaterial;
  /** Bloque en la mano de los muñecos: sin colores por vértice (su caja no los tiene), con luz. */
  private readonly heldMat: THREE.MeshLambertMaterial;
  private readonly heldGeoms = new Map<number, THREE.BufferGeometry>();
  /** Luz del día que multiplica la del cielo en el shader del mundo. */
  private readonly daySky = { value: 1 };
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sunBox: THREE.Mesh;
  private readonly moonBox: THREE.Mesh;
  private readonly stars: THREE.InstancedMesh;
  /** Lo oscuro que está alrededor de la cámara (bajo tierra el cielo y la niebla se apagan). */
  private cave = 1;
  private arrows: THREE.Mesh[] = [];
  private readonly arrowGeom = new THREE.BoxGeometry(0.05, 0.05, 0.6);
  private readonly arrowMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  private blasts = new Map<number, { mesh: THREE.Mesh; start: number }>();
  private readonly blastGeom = new THREE.BoxGeometry(1, 1, 1);
  private chunks = new Map<number, THREE.Mesh[]>();
  private outline: THREE.LineSegments;
  private crack: THREE.Mesh;
  private crackTex: THREE.CanvasTexture;
  private people = new Map<number, Person>();
  private drops = new Map<number, THREE.Object3D>();
  private beasts = new Map<number, Beast>();
  private iconTex = new Map<number, THREE.CanvasTexture>();
  private clouds: THREE.InstancedMesh;
  private cloudPos: [number, number, number, number][] = [];
  private readonly o = new THREE.Object3D();

  constructor(readonly world: World) {
    const sc = this.scene;
    sc.background = new THREE.Color(SKY);
    sc.fog = new THREE.Fog(SKY, 34, 80);
    this.tex = new THREE.CanvasTexture(atlasCanvas());
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.solidMat = skyLit(new THREE.MeshBasicMaterial({ map: this.tex, vertexColors: true, alphaTest: 0.5, toneMapped: false }), this.daySky);
    this.waterMat = skyLit(new THREE.MeshBasicMaterial({
      map: this.tex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    }), this.daySky);
    this.heldMat = new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5 });
    // Luz solo para los muñecos (el mundo lleva la luz horneada).
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(0.5, 1, 0.3);
    this.hemi = new THREE.HemisphereLight(0xbfe0ff, 0x6a5a40, 1.4);
    sc.add(this.sun, this.hemi);

    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 }),
    );
    sc.add(this.outline);
    // Grietas del bloque que se rompe: una caja algo mayor con la tira de fases (se elige la fase con el desplazamiento).
    this.crackTex = new THREE.CanvasTexture(crackCanvas());
    this.crackTex.magFilter = this.crackTex.minFilter = THREE.NearestFilter;
    this.crackTex.generateMipmaps = false;
    this.crackTex.repeat.set(1 / CRACK_STAGES, 1);
    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.004, 1.004, 1.004),
      new THREE.MeshBasicMaterial({
        map: this.crackTex, transparent: true, depthWrite: false, toneMapped: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      }),
    );
    this.crack.visible = false;
    sc.add(this.crack);

    // Nubes de bloques planos que avanzan despacio.
    for (let i = 0; i < 26; i++) {
      const h = (k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
      this.cloudPos.push([h(1) * 220 - 60, WY + 10 + h(2) * 6, h(3) * 220 - 60, 6 + h(4) * 10]);
    }
    this.clouds = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1.2, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, fog: false, toneMapped: false }),
      this.cloudPos.length,
    );
    sc.add(this.clouds);
    // Sol y luna: cuadrados lejanos sin niebla que giran alrededor de la cámara; estrellas de noche.
    const flat = (color: number, size: number) => new THREE.Mesh(
      new THREE.BoxGeometry(size, size, 1), new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false }),
    );
    this.sunBox = flat(0xfff2a0, 10);
    this.moonBox = flat(0xe8ecf4, 7);
    sc.add(this.sunBox, this.moonBox);
    const starCount = 140;
    this.stars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, toneMapped: false }),
      starCount,
    );
    for (let i = 0; i < starCount; i++) {
      const h = (k: number) => Math.abs(Math.sin(i * 91.17 + k * 47.31) * 24634.6345) % 1;
      const a = h(1) * Math.PI * 2, e = 0.12 + h(2) * 1.3;
      this.o.position.set(Math.cos(a) * Math.cos(e) * 140, Math.sin(e) * 140, Math.sin(a) * Math.cos(e) * 140);
      this.o.scale.setScalar(0.6 + h(3) * 0.9);
      this.o.updateMatrix();
      this.stars.setMatrixAt(i, this.o.matrix);
    }
    this.stars.frustumCulled = false;
    sc.add(this.stars);
  }

  /** Cielo, niebla, sol, luna, estrellas y luces según la hora; bajo tierra el cielo y la niebla se apagan. */
  private updateSky(v: BlocksView) {
    const day = daylight(v.clock), sf = skyFactor(v.clock), h = sunHeight(v.clock);
    this.daySky.value = sf;
    const cam = this.camera.position;
    const camSky = this.world.lightAt(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z)) >> 4;
    this.cave += (Math.max(0.06, brightness(camSky)) - this.cave) * 0.08;
    const sky = new THREE.Color(NIGHT).lerp(new THREE.Color(SKY), day);
    sky.lerp(new THREE.Color(SUNSET), Math.max(0, 1 - Math.abs(h) / 0.25) * 0.45);
    sky.multiplyScalar(this.cave);
    (this.scene.background as THREE.Color).copy(sky);
    this.scene.fog!.color.copy(sky);
    const a = (v.clock / DAY_LENGTH) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), -0.35).normalize();
    this.sunBox.position.copy(cam).addScaledVector(dir, 120);
    this.moonBox.position.copy(cam).addScaledVector(dir, -120);
    this.sunBox.lookAt(cam);
    this.moonBox.lookAt(cam);
    this.sunBox.visible = h > -0.12;
    this.moonBox.visible = h < 0.12;
    this.stars.position.copy(cam);
    (this.stars.material as THREE.MeshBasicMaterial).opacity = (1 - day) * 0.9 * this.cave;
    this.stars.visible = day < 0.97;
    // Luz de los muñecos: del sol de día y de la luna (más tenue y azulada) de noche.
    const above = h >= 0 ? dir : dir.clone().negate();
    this.sun.position.copy(above);
    this.sun.intensity = 0.25 + 1.35 * day;
    this.sun.color.setHex(h >= 0 ? 0xffffff : 0xaabbff);
    this.hemi.intensity = 1.4 * Math.max(0.25, sf);
    (this.clouds.material as THREE.MeshBasicMaterial).color.setScalar(Math.max(0.2, sf));
  }

  /** Flechas: cajitas alargadas orientadas según su velocidad. */
  private updateArrows(v: BlocksView) {
    while (this.arrows.length < v.arrows.length) {
      const m = new THREE.Mesh(this.arrowGeom, this.arrowMat);
      this.scene.add(m);
      this.arrows.push(m);
    }
    this.arrows.forEach((m, i) => {
      const a = v.arrows[i];
      m.visible = !!a;
      if (!a) return;
      m.position.set(a.x, a.y, a.z);
      m.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz);
    });
  }

  /** Explosiones: una caja naranja que crece y se desvanece en medio segundo (una vez por explosión). */
  private updateBlasts(v: BlocksView, time: number) {
    for (const b of v.blasts) {
      if (this.blasts.has(b.id)) continue;
      const mesh = new THREE.Mesh(this.blastGeom, new THREE.MeshBasicMaterial({
        color: 0xffb040, transparent: true, depthWrite: false, fog: false, toneMapped: false,
      }));
      mesh.position.set(b.x, b.y, b.z);
      this.scene.add(mesh);
      this.blasts.set(b.id, { mesh, start: time });
    }
    for (const [id, b] of this.blasts) {
      const k = (time - b.start) / 0.5;
      b.mesh.visible = k < 1;
      if (k < 1) {
        b.mesh.scale.setScalar(1 + k * 5);
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      } else if (!v.blasts.some((x) => x.id === id)) {
        this.scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.blasts.delete(id);
      }
    }
  }

  dispose() {
    disposeScene(this.scene);
  }

  /** Vuelve a mallar los chunks cambiados, los más cercanos a la cámara primero. */
  private remesh(cx: number, cz: number) {
    this.world.flushLight(); // la luz que cambió también marca chunks
    const dirty = [...this.world.dirty];
    if (!dirty.length) return;
    const dist = (i: number) => Math.hypot((i % CHUNKS_X) * 16 + 8 - cx, Math.floor(i / CHUNKS_X) * 16 + 8 - cz);
    // Los cambios de bloques (pocos chunks) se rehacen enseguida; la carga inicial, poco a poco.
    const budget = dirty.length <= 3 ? dirty.length : CHUNKS_PER_FRAME;
    dirty.sort((a, b) => dist(a) - dist(b));
    for (const i of dirty.slice(0, budget)) {
      this.world.dirty.delete(i);
      for (const m of this.chunks.get(i) ?? []) {
        m.geometry.dispose();
        this.scene.remove(m);
      }
      const { solid, water } = meshChunk(this.world, i % CHUNKS_X, Math.floor(i / CHUNKS_X));
      const meshes: THREE.Mesh[] = [];
      if (solid.indices.length) meshes.push(new THREE.Mesh(toGeometry(solid), this.solidMat));
      if (water.indices.length) {
        const w = new THREE.Mesh(toGeometry(water), this.waterMat);
        w.renderOrder = 1;
        meshes.push(w);
      }
      for (const m of meshes) this.scene.add(m);
      this.chunks.set(i, meshes);
    }
  }

  get loading(): number {
    return this.world.dirty.size / (CHUNKS_X * CHUNKS_Z);
  }

  private person(index: number): Person {
    let p = this.people.get(index);
    if (p) return p;
    const c = PLAYER_COLORS[index];
    p = buildPerson((c[0] << 16) | (c[1] << 8) | c[2], this.heldMat);
    this.scene.add(p.root);
    this.people.set(index, p);
    return p;
  }

  private heldGeometry(block: number) {
    let g = this.heldGeoms.get(block);
    if (!g) {
      g = blockBoxGeometry(0.22, block);
      this.heldGeoms.set(block, g);
    }
    return g;
  }

  /** Cubito con la textura del bloque, o el icono (palos, herramientas) como sprite que mira a la cámara. */
  private dropObject(item: number): THREE.Object3D {
    if (item > 0 && item < BLOCKS.length) {
      const m = new THREE.Mesh(this.heldGeometry(item), this.heldMat);
      m.scale.setScalar(25 / 22); // cubito de 0,25
      return m;
    }
    let tex = this.iconTex.get(item);
    if (!tex) {
      const c = document.createElement("canvas");
      c.width = c.height = 32;
      const g = c.getContext("2d")!;
      g.imageSmoothingEnabled = false;
      drawItemIcon(g, 16, 16, 14, item);
      tex = new THREE.CanvasTexture(c);
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.iconTex.set(item, tex);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 }));
    sp.scale.setScalar(0.4);
    return sp;
  }

  /** Objetos del suelo: aparecen, se deslizan hacia su posición, flotan y giran despacio. */
  private updateDrops(v: BlocksView, time: number) {
    const seen = new Set<number>();
    for (const d of v.drops) {
      seen.add(d.id);
      let o = this.drops.get(d.id);
      if (!o) {
        o = this.dropObject(d.item);
        o.position.set(d.x, d.y, d.z);
        this.scene.add(o);
        this.drops.set(d.id, o);
      }
      const bob = Math.sin(time * 2.5 + d.id) * 0.05 + 0.06;
      o.position.x += (d.x - o.position.x) * 0.35;
      o.position.z += (d.z - o.position.z) * 0.35;
      o.position.y += (d.y + bob - o.position.y) * 0.35;
      o.rotation.y = time * 1.6 + d.id;
    }
    for (const [id, o] of this.drops) {
      if (seen.has(id)) continue;
      this.scene.remove(o);
      if (o instanceof THREE.Sprite) o.material.dispose();
      this.drops.delete(id);
    }
  }

  /**
   * Animales y monstruos: se deslizan hacia su posición, giran, mueven las patas, pastan, se ven rojos al recibir y
   * caen de lado al morir. El petardo encendido parpadea en blanco y se hincha; los que arden, en naranja.
   */
  private updateBeasts(v: BlocksView, time: number) {
    const sf = skyFactor(v.clock);
    const seen = new Set<number>();
    for (const m of v.mobs) {
      if (!MOBS[m.kind]) continue;
      seen.add(m.id);
      let o = this.beasts.get(m.id);
      if (!o) {
        o = buildBeast(m.kind);
        o.root.position.set(m.x, m.y, m.z);
        o.yaw = m.yaw;
        this.scene.add(o.root);
        this.beasts.set(m.id, o);
      }
      const r = o.root;
      const px = r.position.x, pz = r.position.z;
      r.position.x += (m.x - px) * 0.35;
      r.position.z += (m.z - pz) * 0.35;
      r.position.y += (m.y - r.position.y) * 0.35;
      const moved = Math.hypot(r.position.x - px, r.position.z - pz);
      o.stride += moved < 1 ? moved : 0;
      o.yaw += Math.atan2(Math.sin(m.yaw - o.yaw), Math.cos(m.yaw - o.yaw)) * 0.35;
      r.rotation.y = o.yaw;
      const swing = Math.sin(o.stride * (m.kind === CHICKEN || m.kind === SPIDER ? 9 : 5)) * Math.min(0.6, moved * 30);
      // La araña mueve las patas hacia delante y atrás (giran sobre la vertical); los demás, en la cadera.
      o.legs.forEach((l, i) => {
        if (m.kind === SPIDER) l.rotation.y = swing * 0.6 * o.phase[i];
        else l.rotation.x = swing * o.phase[i];
      });
      const hostile = !!MOBS[m.kind].hostile;
      const graze = !hostile && moved < 0.002 && Math.sin(time * 0.6 + m.id * 1.7) > 0.55 ? 0.6 : 0;
      o.head.rotation.x += (graze - o.head.rotation.x) * 0.1;
      const blink = Math.sin(time * 22) > 0;
      const glow = m.hurt || m.dead ? 0x8a0000 : m.fuse ? (blink ? 0x909090 : 0) : m.burning ? (blink ? 0x803000 : 0x502000) : 0;
      for (const mat of o.mats) mat.emissive.setHex(glow);
      r.scale.setScalar(m.fuse ? 1.08 + (blink ? 0.04 : 0) : 1);
      shadeMaterials(o.mats, brightnessAt(this.world, m.x, m.y + 0.5, m.z, sf));
      if (m.dead) {
        if (o.diedAt < 0) o.diedAt = time;
        const k = Math.min(1, (time - o.diedAt) / 0.25);
        r.rotation.z = (k * Math.PI) / 2;
        r.position.y = m.y + k * MOBS[m.kind].size.hw;
      }
    }
    for (const [id, o] of this.beasts) {
      if (seen.has(id)) continue;
      this.scene.remove(o.root);
      o.root.traverse((c) => {
        if (c instanceof THREE.Mesh) c.geometry.dispose();
      });
      for (const mat of o.mats) mat.dispose();
      this.beasts.delete(id);
    }
  }

  update(v: BlocksView, time: number) {
    this.remesh(v.x, v.z);
    this.updateDrops(v, time);
    this.updateBeasts(v, time);
    this.updateArrows(v);
    this.updateBlasts(v, time);
    // Al recibir daño la cámara se ladea un poco; muerto, queda tumbado en el suelo.
    const dead = v.deadFor >= 0;
    const hurt = v.vitals ? v.vitals.hurt / HURT_FLASH : 0;
    this.camera.position.set(v.x, v.y + (dead ? 0.3 : EYE), v.z);
    this.camera.rotation.set(v.pitch, v.yaw, dead ? Math.min(1, v.deadFor * 3) * 1.2 : hurt * 0.12, "YXZ");
    this.updateSky(v);

    const t = v.target;
    this.outline.visible = !!t;
    if (t) this.outline.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
    this.crack.visible = !!t && v.digProgress > 0;
    if (t && v.digProgress > 0) {
      this.crack.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
      this.crackTex.offset.x = Math.min(CRACK_STAGES - 1, Math.floor(v.digProgress * CRACK_STAGES)) / CRACK_STAGES;
    }

    // Muñecos: brazos y piernas se balancean según lo que andan.
    const seen = new Set<number>();
    for (const a of v.others) {
      seen.add(a.index);
      const p = this.person(a.index);
      p.root.visible = true;
      const moved = Math.hypot(a.x - p.last[0], a.z - p.last[1]);
      p.stride += moved < 2 ? moved : 0;
      p.last = [a.x, a.z];
      p.root.position.set(a.x, a.y, a.z);
      shadeMaterials(p.mats, brightnessAt(this.world, a.x, a.y + 1, a.z, skyFactor(v.clock)));
      p.root.rotation.y = a.yaw;
      p.head.rotation.x = a.pitch * 0.8;
      const swing = Math.sin(p.stride * 3.2) * Math.min(0.7, moved * 25);
      p.legs[0].rotation.x = swing;
      p.legs[1].rotation.x = -swing;
      p.arms[0].rotation.x = -swing;
      p.arms[1].rotation.x = swing * 0.5 - 0.35;
      p.held.visible = a.block > 0;
      if (a.block > 0) p.held.geometry = this.heldGeometry(a.block);
    }
    for (const [i, p] of this.people) if (!seen.has(i)) p.root.visible = false;

    this.cloudPos.forEach(([x, y, z, s], i) => {
      const cx = ((x + time * 0.8 + 60) % 220) - 60;
      this.o.position.set(cx, y, z);
      this.o.scale.set(s, 1, s * 0.7);
      this.o.updateMatrix();
      this.clouds.setMatrixAt(i, this.o.matrix);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}

export class BlocksRenderer {
  private stage: Stage | null = null;
  private slotShownAt = -9;
  private lastSlot = -1;
  private time = 0;

  update(dt: number) {
    this.time += dt;
  }

  dispose() {
    this.stage?.dispose();
    this.stage = null;
  }

  draw(ctx: Ctx, v: BlocksView, pixelScale = 1) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, VW, VH);
    if (!glRenderer()) {
      text(ctx, "Este equipo no puede mostrar gráficos 3D (WebGL)", VW / 2, VH / 2, [255, 200, 160], SMALL, "center");
      return;
    }
    if (this.stage && this.stage.world !== v.world) this.dispose(); // mundo nuevo
    const stage = (this.stage ??= new Stage(v.world));
    stage.update(v, this.time);
    renderInto(ctx, stage.scene, stage.camera, VW, VH, pixelScale, 1);
    // Bajo el agua: tinte azul.
    if (v.world.get(Math.floor(v.x), Math.floor(v.y + EYE), Math.floor(v.z)) === WATER) {
      ctx.fillStyle = "rgba(30,70,180,0.45)";
      ctx.fillRect(0, 0, VW, VH);
    }
    // Daño: pantalla roja que se apaga enseguida.
    if (v.vitals && v.vitals.hurt > 0) {
      ctx.fillStyle = `rgba(200,0,0,${(0.35 * v.vitals.hurt) / HURT_FLASH})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    this.drawLabels(ctx, v, stage);
    this.drawHud(ctx, v, stage.loading);
  }

  /** Número y nombre sobre cada jugador (también identifica en escala de grises). */
  private drawLabels(ctx: Ctx, v: BlocksView, stage: Stage) {
    for (const a of v.others) {
      const p = projectTo(stage.camera, [a.x, a.y + 2.25, a.z], VW, VH);
      if (!p || p[2] > 40) continue;
      const [x, y] = p;
      badge(ctx, x - 1, y, 4, PLAYER_COLORS[a.index], String(a.index + 1));
      shadowText(ctx, fitText(ctx, PLAYER_NAMES[a.index], 60, TINY), x + 5, y - 3, [235, 235, 245], TINY);
    }
  }

  /** Corazones (izquierda), muslos (derecha) y, bajo el agua, burbujas, encima de la barra (x0..x1, y0 = su borde). */
  private drawVitals(ctx: Ctx, vt: Vitals, x0: number, x1: number, y0: number): number {
    const y = y0 - 9;
    const shake = (low: boolean, i: number) => (low && !vt.dead ? Math.round(Math.sin(this.time * 30 + i * 2.3)) : 0);
    for (let i = 0; i < MAX_HEALTH / 2; i++) {
      const k = vt.health - i * 2;
      const yy = y + shake(vt.health <= 4, i);
      pixels(ctx, x0 + i * 8, yy, HEART, { "#": vt.hurt > 0 ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)" });
      if (k > 0) pixels(ctx, x0 + i * 8, yy, HEART, { "#": "#e02828", o: "#ffb0b0" }, k >= 2 ? 7 : 4);
    }
    for (let i = 0; i < MAX_HUNGER / 2; i++) {
      const k = vt.hunger - i * 2, x = x1 - 7 - i * 8;
      const yy = y + shake(vt.hunger <= 0, i);
      pixels(ctx, x, yy, SHANK, { "#": "rgba(0,0,0,0.65)", b: "rgba(0,0,0,0.65)" });
      if (k > 0) pixels(ctx, x, yy, SHANK, { "#": "#b8662c", b: "#efe6d2" }, 7, k >= 2 ? 0 : 3);
    }
    if (vt.air >= MAX_AIR) return y;
    const n = Math.ceil(vt.air);
    for (let i = 0; i < n; i++) pixels(ctx, x1 - 7 - i * 8, y - 9, BUBBLE, { "#": "#9ad8ff", o: "#ffffff" });
    return y - 9;
  }

  /** Muerto: velo rojo, cartel y, pasado un momento, cómo reaparecer. */
  private drawDeath(ctx: Ctx, v: BlocksView) {
    ctx.fillStyle = "rgba(110,0,0,0.5)";
    ctx.fillRect(0, 0, VW, VH);
    titleText(ctx, "HAS MUERTO", VW / 2, VH / 2 - 34, [255, 90, 90], "16px");
    shadowText(ctx, "TUS COSAS HAN QUEDADO DONDE CAÍSTE", VW / 2, VH / 2 - 8, [255, 220, 220], TINY, "center");
    if (v.deadFor >= RESPAWN_DELAY && Math.floor(this.time * 2) % 2 === 0) {
      shadowText(ctx, "ESPACIO O CLIC: REAPARECER", VW / 2, VH / 2 + 6, [255, 236, 150], SMALL, "center");
    }
  }

  private drawHud(ctx: Ctx, v: BlocksView, loading: number) {
    const dead = v.deadFor >= 0;
    // Cruz en el centro.
    if (!dead) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(VW / 2 - 5, VH / 2 - 1, 11, 3);
      ctx.fillRect(VW / 2 - 1, VH / 2 - 5, 3, 11);
      ctx.fillStyle = "#fff";
      ctx.fillRect(VW / 2 - 4, VH / 2 - 0.5, 9, 1);
      ctx.fillRect(VW / 2 - 0.5, VH / 2 - 4, 1, 9);
    }
    // Comiendo: barrita bajo la cruz.
    if (v.vitals && v.vitals.eating > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(VW / 2 - 11, VH / 2 + 8, 22, 4);
      ctx.fillStyle = "#e8a050";
      ctx.fillRect(VW / 2 - 10, VH / 2 + 9, (20 * Math.min(1, v.vitals.eating / EAT_TIME)), 2);
    }

    // Barra: los bloques fijos (creativo) o las 9 primeras ranuras del inventario (supervivencia).
    const n = HOTBAR.length, cell = 18, w = n * cell + 4;
    const x0 = (VW - w) / 2, y0 = VH - cell - 6;
    panel(ctx, x0, y0, w, cell + 4, [120, 120, 140], 0.7);
    HOTBAR.forEach((b, i) => {
      const cx = x0 + 2 + i * cell + cell / 2, cy = y0 + 2 + cell / 2;
      const s = v.inventory.slots[i];
      if (!v.survival) drawBlockIcon(ctx, cx, cy, 6, b);
      else if (s) drawStack(ctx, s, cx, cy);
      text(ctx, String(i + 1), x0 + 3 + i * cell, y0 + 3, [220, 220, 230], "5px");
      if (i === v.slot) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x0 + 2 + i * cell + 0.6, y0 + 2.6, cell - 1.2, cell - 1.2);
      }
    });
    if (v.slot !== this.lastSlot) {
      this.lastSlot = v.slot;
      this.slotShownAt = this.time;
    }
    // En supervivencia, encima de la barra van la vida y el hambre; los avisos, más arriba.
    // Con una pantalla abierta no se dibujan (quedarían bajo el panel).
    const top = v.vitals && !v.crafter ? this.drawVitals(ctx, v.vitals, x0 + 2, x0 + w - 2, y0) : y0;
    if (this.time - this.slotShownAt < 1.6 && v.held && !v.crafter) shadowText(ctx, itemInfo(v.held).name, VW / 2, top - 10, [255, 255, 255], SMALL, "center");

    // Posición y modo, arriba a la izquierda; jugadores a la derecha.
    shadowText(ctx, `X ${Math.floor(v.x)}  Y ${Math.floor(v.y)}  Z ${Math.floor(v.z)}${v.flying ? "  · VOLANDO" : ""}`, 4, 4, [235, 235, 245], TINY);
    const players = [{ index: v.me }, ...v.others].sort((a, b) => a.index - b.index);
    players.forEach((p, i) => {
      const y = 4 + i * 9;
      badge(ctx, VW - 8, y + 3.5, 3.5, PLAYER_COLORS[p.index], String(p.index + 1));
      const name = PLAYER_NAMES[p.index] + (p.index === v.me ? " (tú)" : "");
      shadowText(ctx, fitText(ctx, name, 80, TINY), VW - 14, y, [235, 235, 245], TINY, "right");
    });

    if (v.netLabel) shadowText(ctx, v.netLabel, VW - 4, 6 + players.length * 9, [200, 200, 220], TINY, "right");
    if (v.time < 12) {
      shadowText(ctx, v.survival ? SURVIVAL_HINT_1 : BLOCKS_HINT_1, VW / 2, 18, [255, 255, 255], TINY, "center");
      shadowText(ctx, v.survival ? SURVIVAL_HINT_2 : BLOCKS_HINT_2, VW / 2, 27, [255, 255, 255], TINY, "center");
    }
    // Sin el puntero capturado no se puede mirar con el ratón: se avisa (sin tapar el centro).
    if (!pointerLocked() && !v.crafter && !dead) {
      shadowText(ctx, "CLIC PARA USAR EL RATÓN", VW / 2, top - 20, [255, 236, 150], TINY, "center");
    }
    if (loading > 0.05) shadowText(ctx, `CONSTRUYENDO EL MUNDO… ${Math.round((1 - loading) * 100)}%`, VW / 2, VH / 2 - 20, [255, 255, 255], SMALL, "center");
    if (v.crafter) drawCrafter(ctx, v.crafter, v.inventory, v.cursor);
    if (dead) this.drawDeath(ctx, v);
  }
}

// Iconos de 7 × 7 de la vida, el hambre y el aire (# = relleno, o = brillo, b = hueso).
const HEART = [".##.##.", "#o#####", "#######", "#######", ".#####.", "..###..", "...#..."];
const SHANK = ["...###.", "..#####", "..#####", "..#####", "..b###.", ".bb....", "bb....."];
const BUBBLE = ["..###..", ".#ooo#.", "#o...##", "#....##", "#...###", ".#####.", "..###.."];

/** Dibuja un icono de píxeles (1 px lógico por píxel) con las columnas [from, to). */
function pixels(ctx: Ctx, x: number, y: number, rows: string[], colors: Record<string, string>, to = 7, from = 0) {
  rows.forEach((row, j) => {
    for (let i = from; i < Math.min(to, row.length); i++) {
      const c = colors[row[i]] ?? (row[i] === "." ? undefined : colors["#"]);
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  });
}
