// Render 3D de Bloques (Three.js): cada chunk es una malla con el atlas de texturas (la luz y la
// oclusión van horneadas en los colores de los vértices, así que no hacen falta luces para el mundo),
// el agua en otra malla transparente, contorno del bloque al que se apunta, muñecos de bloques para los
// demás jugadores y nubes. El HUD (cruz, barra de bloques, jugadores) se dibuja en 2D encima.
// Coordenadas: 1 unidad = 1 bloque; x, z en el suelo e y hacia arriba (igual que el mundo).
import * as THREE from "three";
import { PLAYER_COLORS, PLAYER_NAMES } from "../core/config";
import { badge, fitText, panel, shadowText, text, type Ctx } from "../core/draw";
import { disposeScene, glRenderer, projectTo, renderInto } from "../core/three";
import { atlasCanvas, tileOrigin, TILE_PX } from "./atlas";
import { BLOCKS, HOTBAR, WATER } from "./blocks";
import { EYE, VH, VW, WX, WY, WZ } from "./config";
import { BLOCKS_HINT_1, BLOCKS_HINT_2, pointerLocked } from "./input";
import { meshChunk, type MeshData } from "./mesher";
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
  flying: boolean;
  target: RayHit | null;
  others: Avatar[];
  netLabel: string;
  time: number;
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
    const t = faceTile[f], tu = t % 4, tv = Math.floor(t / 4);
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (tu + uv.getX(i)) / 4, 1 - (tv + 1 - uv.getY(i)) / 4);
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
    // Luz solo para los muñecos (el mundo lleva la luz horneada).
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
      p.held.geometry = this.heldGeometry(a.block);
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
    // Cruz en el centro.
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(VW / 2 - 5, VH / 2 - 1, 11, 3);
    ctx.fillRect(VW / 2 - 1, VH / 2 - 5, 3, 11);
    ctx.fillStyle = "#fff";
    ctx.fillRect(VW / 2 - 4, VH / 2 - 0.5, 9, 1);
    ctx.fillRect(VW / 2 - 0.5, VH / 2 - 4, 1, 9);

    // Barra de bloques.
    const n = HOTBAR.length, cell = 18, w = n * cell + 4;
    const x0 = (VW - w) / 2, y0 = VH - cell - 6;
    panel(ctx, x0, y0, w, cell + 4, [120, 120, 140], 0.7);
    HOTBAR.forEach((b, i) => {
      const cx = x0 + 2 + i * cell + cell / 2, cy = y0 + 2 + cell / 2;
      drawBlockIcon(ctx, cx, cy, 6, b);
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
    if (this.time - this.slotShownAt < 1.6) shadowText(ctx, BLOCKS[HOTBAR[v.slot]].name, VW / 2, y0 - 10, [255, 255, 255], SMALL, "center");

    // Posición y modo, arriba a la izquierda; jugadores a la derecha.
    shadowText(ctx, `X ${Math.floor(v.x)}  Y ${Math.floor(v.y)}  Z ${Math.floor(v.z)}${v.flying ? "  · VOLANDO" : ""}`, 4, 4, [235, 235, 245], TINY);
    const players = [{ index: v.me }, ...v.others].sort((a, b) => a.index - b.index);
    players.forEach((p, i) => {
      const y = 4 + i * 9;
      badge(ctx, VW - 8, y + 3.5, 3.5, PLAYER_COLORS[p.index], String(p.index + 1));
      const name = PLAYER_NAMES[p.index] + (p.index === v.me ? " (tú)" : "");
      shadowText(ctx, fitText(ctx, name, 80, TINY), VW - 14, y, [235, 235, 245], TINY, "right");
    });

    if (v.netLabel) shadowText(ctx, v.netLabel, VW - 4, y0 - 10, [200, 200, 220], TINY, "right");
    if (v.time < 12) {
      shadowText(ctx, BLOCKS_HINT_1, VW / 2, 18, [255, 255, 255], TINY, "center");
      shadowText(ctx, BLOCKS_HINT_2, VW / 2, 27, [255, 255, 255], TINY, "center");
    }
    // Aviso del ratón solo al principio (se puede jugar entero con el teclado).
    if (!pointerLocked() && v.time < 12 && Math.floor(this.time * 1.5) % 2 === 0) {
      shadowText(ctx, "CLIC PARA USAR EL RATÓN", VW / 2, VH / 2 + 10, [255, 236, 150], TINY, "center");
    }
    if (loading > 0.05) shadowText(ctx, `CONSTRUYENDO EL MUNDO… ${Math.round((1 - loading) * 100)}%`, VW / 2, VH / 2 - 20, [255, 255, 255], SMALL, "center");
  }
}

/** Icono de un bloque en perspectiva isométrica (cara de arriba y dos lados), centrado en (cx, cy). */
export function drawBlockIcon(ctx: Ctx, cx: number, cy: number, s: number, block: number) {
  const atlas = atlasCanvas();
  const [top, side] = BLOCKS[block].tiles;
  const k = 0.866 * s / TILE_PX, h = 0.5 * s / TILE_PX, v = s / TILE_PX;
  const face = (tile: number, a: number, b: number, c: number, d: number, e: number, f: number, dark: number) => {
    const [sx, sy] = tileOrigin(tile);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.transform(a, b, c, d, e, f);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    if (dark) {
      ctx.fillStyle = `rgba(0,0,0,${dark})`;
      ctx.fillRect(0, 0, TILE_PX, TILE_PX);
    }
    ctx.restore();
  };
  face(top, k, h, -k, h, 0, -s, 0); // arriba: de la punta de arriba hacia derecha e izquierda
  face(side, k, h, 0, v, -0.866 * s, -0.5 * s, 0.25); // lado izquierdo
  face(side, k, -h, 0, v, 0, 0, 0.42); // lado derecho
}
