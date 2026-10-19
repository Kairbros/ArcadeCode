// Render 3D de Bloques (Three.js): cada chunk es una malla con el atlas de texturas (la luz y la
// oclusión van horneadas en los colores de los vértices, así que no hacen falta luces para el mundo),
// el agua en otra malla transparente, contorno del bloque al que se apunta, muñecos de bloques para los
// demás jugadores, objetos en el suelo y nubes. El HUD (cruz, barra, corazones) se dibuja en 2D encima.
// Coordenadas: 1 unidad = 1 bloque; x, z en el suelo e y hacia arriba (igual que el mundo).
import * as THREE from "three";
import { PLAYER_COLORS, PLAYER_NAMES } from "../core/config";
import { badge, fitText, panel, shadowText, text, type Ctx } from "../core/draw";
import { disposeScene, glRenderer, projectTo, renderInto } from "../core/three";
import { atlasCanvas, ATLAS_COLS, ATLAS_ROWS } from "./atlas";
import { BLOCKS, WATER } from "./blocks";
import { EYE, VH, VW, WX, WY, WZ } from "./config";
import type { Drop } from "./drops";
import { drawSlot } from "./icons";
import {
  BLOCKS_HINT_1, BLOCKS_HINT_2, BLOCKS_HINT_3, BLOCKS_HINT_SURV_1, BLOCKS_HINT_SURV_2, BLOCKS_HINT_SURV_3,
  lookMode,
} from "./input";
import type { Stack } from "./inventory";
import { I_APPLE, I_COOKED, I_MEAT, I_STONE_AXE, I_STONE_PICK, I_STONE_SHOVEL, itemInfo, itemName } from "./items";
import { meshChunk, type MeshData } from "./mesher";
import type { Mob, MobKind } from "./mobs";
import { MAX_AIR, MAX_HUNGER, MAX_HP } from "./survival";
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
  /** Barra rápida: objetos con cantidad y desgaste (en creativo, cantidad 0 = infinitos). */
  slots: (Stack | null)[];
  flying: boolean;
  target: RayHit | null;
  others: Avatar[];
  netLabel: string;
  time: number;
  /** Hay que confirmar el mundo nuevo (se pulsó N hace poco). */
  prompt: boolean;
  /** Partida en este equipo (se puede guardar y empezar mundos nuevos). */
  local: boolean;
  /** Modo supervivencia. */
  survival: boolean;
  /** Vida, aire, hambre y daño (solo en supervivencia). */
  vitals: { hp: number; air: number; hunger: number; hurt: number; dead: boolean; deadT: number } | null;
  /** Progreso de minado 0..1 (null si no se está rompiendo nada). */
  mining: number | null;
  /** Objetos en el suelo. */
  drops: Drop[];
  /** Animales. */
  mobs: Mob[];
}

const TINY = "7px";
const SMALL = "8px";
const SKY = 0x8ec8f2;
const CHUNKS_PER_FRAME = 4; // chunks que se vuelven a mallar como mucho en cada frame

function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(m.uvs, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(m.colors, 3));
  g.setIndex(m.indices);
  g.computeBoundingSphere();
  return g;
}

interface Person {
  root: THREE.Group;
  head: THREE.Group;
  arms: THREE.Group[];
  legs: THREE.Group[];
  held: THREE.Mesh;
  last: [number, number];
  stride: number;
}

/** Muñeco de bloques (cabeza, cuerpo, brazos y piernas que giran en hombros y caderas). Pies en y = 0, mirando a −z. */
function buildPerson(color: number, blockMat: THREE.Material): Person {
  const mat = (hex: number) => new THREE.MeshLambertMaterial({ color: hex });
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
  return { root, head, arms, legs, held, last: [0, 0], stride: 0 };
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

/** La escena: chunks, agua, contorno, jugadores, objetos en el suelo y cielo. Se rehace si cambia el mundo. */
/** Animal de bloques: cuerpo, cabeza, morro y cuatro patas. */
interface Critter {
  root: THREE.Group;
  legs: THREE.Mesh[];
}

function buildAnimal(kind: MobKind): Critter {
  const fur = kind === "cow" ? 0xf2f2ee : 0xf0a3a8;
  const patch = kind === "cow" ? 0x2f2f2f : 0xd07f88;
  const box = (w: number, h: number, d: number, c: number) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));
  const g = new THREE.Group();
  const body = box(0.75, 0.7, 1.15, fur);
  body.position.y = 0.95;
  g.add(body);
  const spot = box(0.78, 0.42, 0.5, patch);
  spot.position.set(0, 1.0, 0.16);
  g.add(spot);
  const head = box(0.5, 0.5, 0.45, fur);
  head.position.set(0, 1.12, -0.72);
  g.add(head);
  const snout = box(0.32, 0.24, 0.14, patch);
  snout.position.set(0, 1.0, -0.95);
  g.add(snout);
  // Orejas (vaca) o morro redondo (cerdo): dos cajas pequeñas a los lados de la cabeza.
  for (const s of [-1, 1]) {
    const ear = box(0.1, 0.16, 0.1, kind === "cow" ? 0xe6e6e0 : 0xe08f97);
    ear.position.set(0.22 * s, 1.4, -0.7);
    g.add(ear);
  }
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.24, -0.4], [0.24, -0.4], [-0.24, 0.4], [0.24, 0.4]]) {
    const leg = box(0.17, 0.6, 0.17, fur);
    leg.position.set(x, 0.3, z);
    legs.push(leg);
    g.add(leg);
  }
  return { root: g, legs };
}

class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, VW / VH, 0.05, 170);
  private readonly tex: THREE.CanvasTexture;
  private readonly solidMat: THREE.MeshBasicMaterial;
  private readonly waterMat: THREE.MeshBasicMaterial;
  /** Bloque en la mano de los muñecos: sin colores por vértice (su caja no los tiene), con luz. */
  private readonly heldMat: THREE.MeshLambertMaterial;
  private readonly heldGeoms = new Map<number, THREE.BufferGeometry>();
  private readonly dropMats = new Map<number, THREE.MeshLambertMaterial>();
  private dropMeshes = new Map<Drop, THREE.Mesh>();
  private critters = new Map<number, Critter>();
  private chunks = new Map<number, THREE.Mesh[]>();
  private outline: THREE.LineSegments;
  private people = new Map<number, Person>();
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
    this.solidMat = new THREE.MeshBasicMaterial({ map: this.tex, vertexColors: true, alphaTest: 0.5, toneMapped: false });
    this.waterMat = new THREE.MeshBasicMaterial({
      map: this.tex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    });
    this.heldMat = new THREE.MeshLambertMaterial({ map: this.tex, alphaTest: 0.5 });
    // Luz solo para los muñecos y los objetos del suelo (el mundo lleva la luz horneada).
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.5, 1, 0.3);
    sc.add(sun, new THREE.HemisphereLight(0xbfe0ff, 0x6a5a40, 1.4));

    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 }),
    );
    sc.add(this.outline);

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
    // Sol: un cuadrado lejano sin niebla.
    const sunBox = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 1), new THREE.MeshBasicMaterial({ color: 0xfff2a0, fog: false, toneMapped: false }));
    sunBox.position.set(WX / 2 + 70, 110, WZ / 2 - 90);
    sunBox.lookAt(WX / 2, 0, WZ / 2);
    sc.add(sunBox);
  }

  dispose() {
    disposeScene(this.scene);
  }

  /** Vuelve a mallar los chunks cambiados, los más cercanos a la cámara primero. */
  private remesh(cx: number, cz: number) {
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

  /** Material de un objeto del suelo: bloques con textura, herramientas y comida de un color. */
  private dropMaterial(id: number): THREE.Material {
    const info = itemInfo(id);
    if (info?.block !== undefined) return this.heldMat;
    const color = id === I_APPLE
      ? 0xd64237
      : id === I_MEAT ? 0xc0504f
      : id === I_COOKED ? 0x9a5a2c
      : id === I_STONE_PICK || id === I_STONE_AXE || id === I_STONE_SHOVEL ? 0x9a9a9a : 0xa9743e;
    let m = this.dropMats.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      this.dropMats.set(color, m);
    }
    return m;
  }

  private dropGeometry(id: number): THREE.BufferGeometry {
    const info = itemInfo(id);
    return info?.block !== undefined ? this.heldGeometry(info.block) : new THREE.BoxGeometry(0.2, 0.2, 0.2);
  }

  /** Sincroniza los cubitos de los objetos en el suelo. */
  private syncDrops(drops: Drop[]) {
    const alive = new Set(drops);
    for (const [d, mesh] of this.dropMeshes) {
      if (alive.has(d)) continue;
      this.scene.remove(mesh);
      this.dropMeshes.delete(d);
    }
    for (const d of drops) {
      let mesh = this.dropMeshes.get(d);
      if (!mesh) {
        mesh = new THREE.Mesh(this.dropGeometry(d.id), this.dropMaterial(d.id));
        this.scene.add(mesh);
        this.dropMeshes.set(d, mesh);
      }
      // Flotan y giran despacio.
      mesh.position.set(d.x, d.y + 0.2 + Math.sin(d.age * 3) * 0.05, d.z);
      mesh.rotation.y = d.age * 1.6;
    }
  }

  /** Sincroniza los animales (cubo con patas) con los del jugador. */
  private syncMobs(list: Mob[], time: number) {
    const alive = new Set(list.map((m) => m.id));
    for (const [id, c] of this.critters) {
      if (alive.has(id)) continue;
      this.scene.remove(c.root);
      this.critters.delete(id);
    }
    for (const m of list) {
      let c = this.critters.get(m.id);
      if (!c) {
        c = buildAnimal(m.kind);
        this.scene.add(c.root);
        this.critters.set(m.id, c);
      }
      c.root.position.set(m.x, m.y, m.z);
      c.root.rotation.y = m.yaw + Math.PI;
      const speed = Math.hypot(m.vx, m.vz);
      const swing = Math.sin(time * 9) * Math.min(0.55, speed * 0.35);
      c.legs.forEach((leg, i) => {
        leg.rotation.x = (i === 0 || i === 3 ? swing : -swing);
      });
      // Al recibir un golpe el bicho da un salto pequeño (parpadeo de escala).
      c.root.scale.setScalar(m.hurt > 0 ? 1 + Math.sin(m.hurt * 42) * 0.07 : 1);
    }
  }

  update(v: BlocksView, time: number) {
    this.remesh(v.x, v.z);
    this.camera.position.set(v.x, v.y + EYE, v.z);
    this.camera.rotation.set(v.pitch, v.yaw, 0, "YXZ");

    const t = v.target;
    this.outline.visible = !!t;
    if (t) this.outline.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);

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

    this.syncDrops(v.drops);
    this.syncMobs(v.mobs, time);

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

/** Corazón (lleno, medio o vacío) centrado en (cx, cy). */
function heart(ctx: Ctx, cx: number, cy: number, k: number) {
  const r = 3;
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.85);
    ctx.bezierCurveTo(cx - r * 1.5, cy - r * 0.35, cx - r * 0.65, cy - r * 1.25, cx, cy - r * 0.4);
    ctx.bezierCurveTo(cx + r * 0.65, cy - r * 1.25, cx + r * 1.5, cy - r * 0.35, cx, cy + r * 0.85);
    ctx.closePath();
  };
  shape();
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (k <= 0) return;
  ctx.save();
  shape();
  ctx.clip();
  if (k < 1) {
    // Medio corazón: solo la mitad izquierda.
    ctx.beginPath();
    ctx.rect(cx - r * 2, cy - r * 2, r * 2, r * 4);
    ctx.clip();
  }
  ctx.fillStyle = k < 1 ? "#ff5f5f" : "#e8323f";
  shape();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(cx - r * 0.9, cy - r * 0.7, r * 0.7, r * 0.45);
  ctx.restore();
}

/** Muslo de pollo (hambre) centrado en (cx, cy): lleno, medio (mitad izquierda) o vacío. */
function drumstick(ctx: Ctx, cx: number, cy: number, k: number) {
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(cx - 3.4, cy + 2.6); // hueso
    ctx.lineTo(cx - 1.4, cy + 0.9);
    ctx.ellipse(cx + 0.8, cy - 0.9, 2.9, 2.3, -0.6, 0, Math.PI * 2);
    ctx.closePath();
  };
  shape();
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  if (k <= 0) return;
  ctx.save();
  shape();
  ctx.clip();
  if (k < 1) {
    ctx.beginPath();
    ctx.rect(cx - 5, cy - 5, 5, 10);
    ctx.clip();
  }
  shape();
  ctx.fillStyle = k < 1 ? "#c9822f" : "#a45f1e";
  ctx.fill();
  ctx.fillStyle = "rgba(255,235,200,0.35)";
  ctx.fillRect(cx - 1.6, cy - 2.4, 1.6, 1.1);
  ctx.restore();
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

  private drawHud(ctx: Ctx, v: BlocksView, loading: number) {
    // Daño reciente: destello rojo.
    if (v.vitals && v.vitals.hurt > 0) {
      ctx.fillStyle = `rgba(190,20,30,${Math.min(0.5, v.vitals.hurt * 1.1)})`;
      ctx.fillRect(0, 0, VW, VH);
    }

    // Cruz en el centro + progreso de minado.
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(VW / 2 - 5, VH / 2 - 1, 11, 3);
    ctx.fillRect(VW / 2 - 1, VH / 2 - 5, 3, 11);
    ctx.fillStyle = "#fff";
    ctx.fillRect(VW / 2 - 4, VH / 2 - 0.5, 9, 1);
    ctx.fillRect(VW / 2 - 0.5, VH / 2 - 4, 1, 9);
    if (v.mining !== null) {
      const w = 28, x = VW / 2 - w / 2, y = VH / 2 + 8;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = "#ffcf50";
      ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v.mining)), 3);
    }

    // Barra rápida: la del jugador (cantidad y desgaste en supervivencia).
    const bar = v.slots;
    const n = bar.length, cell = 18, w = n * cell + 4;
    const x0 = (VW - w) / 2, y0 = VH - cell - 6;
    panel(ctx, x0, y0, w, cell + 4, [120, 120, 140], 0.7);
    bar.forEach((s, i) => {
      drawSlot(ctx, x0 + 2 + i * cell, y0 + 2, cell, s, i === v.slot);
    });
    if (v.slot !== this.lastSlot) {
      this.lastSlot = v.slot;
      this.slotShownAt = this.time;
    }
    const heldId = bar[v.slot]?.id ?? 0;
    if (this.time - this.slotShownAt < 1.8) {
      shadowText(ctx, heldId ? itemName(heldId).toUpperCase() : "MANOS VACÍAS", VW / 2, y0 - 10, [255, 255, 255], SMALL, "center");
    }

    // Vida, hambre y aire (supervivencia), encima de la barra.
    if (v.vitals) {
      const hp = v.vitals.hp;
      const hearts = MAX_HP / 2;
      for (let i = 0; i < hearts; i++) heart(ctx, x0 + 6 + i * 8, y0 - 9, Math.max(0, Math.min(1, hp / 2 - i)));
      // Hambre: muslos a la derecha, como los corazones pero al otro lado.
      const drumsticks = MAX_HUNGER / 2;
      for (let i = 0; i < drumsticks; i++) {
        drumstick(ctx, x0 + w - 6 - (drumsticks - 1 - i) * 8, y0 - 9, Math.max(0, Math.min(1, v.vitals.hunger / 2 - i)));
      }
      if (v.vitals.air < MAX_AIR) {
        const bubbles = Math.ceil((v.vitals.air / MAX_AIR) * 10);
        for (let i = 0; i < 10; i++) {
          ctx.beginPath();
          ctx.arc(x0 + 6 + i * 8, y0 - 19, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = i < bubbles ? "rgba(120,200,255,0.95)" : "rgba(0,0,0,0.45)";
          ctx.fill();
        }
      }
    }

    // Posición, modo y bloque apuntado, arriba a la izquierda; jugadores a la derecha.
    shadowText(ctx, `X ${Math.floor(v.x)}  Y ${Math.floor(v.y)}  Z ${Math.floor(v.z)}${v.flying ? "  · VOLANDO" : ""}`, 4, 4, [235, 235, 245], TINY);
    const t = v.target;
    if (t) shadowText(ctx, `MIRAS: ${BLOCKS[v.world.get(t.x, t.y, t.z)].name.toUpperCase()}`, 4, 13, [200, 210, 235], "6px");
    const players = [{ index: v.me }, ...v.others].sort((a, b) => a.index - b.index);
    players.forEach((p, i) => {
      const y = 4 + i * 9;
      badge(ctx, VW - 8, y + 3.5, 3.5, PLAYER_COLORS[p.index], String(p.index + 1));
      const name = PLAYER_NAMES[p.index] + (p.index === v.me ? " (tú)" : "");
      shadowText(ctx, fitText(ctx, name, 80, TINY), VW - 14, y, [235, 235, 245], TINY, "right");
    });

    if (v.netLabel) shadowText(ctx, v.netLabel, VW - 4, y0 - 10, [200, 200, 220], TINY, "right");
    if (v.time < 12) {
      const hints = v.survival
        ? [BLOCKS_HINT_SURV_1, BLOCKS_HINT_SURV_2, BLOCKS_HINT_SURV_3]
        : [BLOCKS_HINT_1, BLOCKS_HINT_2, BLOCKS_HINT_3];
      hints.forEach((h, i) => {
        shadowText(ctx, fitText(ctx, h, VW - 10, TINY), VW / 2, 26 + i * 9, [255, 255, 255], TINY, "center");
      });
    }
    // Aviso del ratón solo al principio, según lo que deje hacer la vista (webview o navegador).
    const look = lookMode();
    if (look !== "locked" && v.time < 12 && Math.floor(this.time * 1.5) % 2 === 0) {
      const msg = look === "drag" ? "ARRASTRA CON EL RATÓN PARA MIRAR" : "CLIC PARA USAR EL RATÓN";
      shadowText(ctx, msg, VW / 2, VH / 2 + 12, [255, 236, 150], TINY, "center");
    }
    if (loading > 0.05) shadowText(ctx, `CONSTRUYENDO EL MUNDO… ${Math.round((1 - loading) * 100)}%`, VW / 2, VH / 2 - 20, [255, 255, 255], SMALL, "center");
    if (v.local) shadowText(ctx, "N: MUNDO NUEVO", 4, VH - 14, [150, 150, 170], "6px");
    if (v.prompt) {
      panel(ctx, VW / 2 - 92, VH / 2 + 18, 184, 24, [255, 120, 120], 0.85);
      shadowText(ctx, "N OTRA VEZ: MUNDO NUEVO", VW / 2, VH / 2 + 21, [255, 220, 220], "8px", "center");
      shadowText(ctx, "SE BORRAN SUS BLOQUES GUARDADOS", VW / 2, VH / 2 + 31, [235, 235, 245], "6px", "center");
    }

    // Muerte: pantalla oscura y cuenta atrás hasta reaparecer.
    if (v.vitals?.dead) {
      ctx.fillStyle = "rgba(90,0,10,0.62)";
      ctx.fillRect(0, 0, VW, VH);
      shadowText(ctx, "HAS CAÍDO", VW / 2, VH / 2 - 16, [255, 120, 120], "18px", "center");
      shadowText(ctx, `REAPARECES EN ${Math.ceil(v.vitals.deadT)}`, VW / 2, VH / 2 + 8, [240, 240, 250], SMALL, "center");
      shadowText(ctx, "CONSERVAS LA MOCHILA", VW / 2, VH / 2 + 20, [200, 200, 220], "6px", "center");
    }
  }
}
