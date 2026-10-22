// Construye el SECTOR 09 en la escena: muros con huecos, puertas, ventanas barricables, props,
// luces y compras de pared. Devuelve los colisionadores y los objetos interactivos.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { glowSprite } from "../../core/three";
import { makeCollider, type Collider } from "../core/collision";
import { BOX_PRICE, WEAPONS, type WeaponId } from "../weapons/defs";
import { batchStatic } from "./batch";
import { PlankRig } from "./planks";
import { buildExtraProp } from "./props2";
import { buildPerkMachine, type PerkMachine } from "./perkmachines";
import { PERK_IDS } from "../game/perks";
import { buildMysteryBox, buildPowerSwitch, buildUpgrader, type MysteryBox, type PowerSwitch, type Upgrader } from "./centerpiece";
import { floorDecal } from "./decor";
import { TILE_M, texture } from "./textures";
import type { MapDef } from "./mapdef";
import {
  inRooms,
  type BuySpec,
  type Hole,
  type MatKind,
  type PropSpec,
  type WallRun,
} from "./mapdata";

export const MAX_PLANKS = 6;
const WALL_T = 0.35;
const DOOR_H = 2.25;
const SILL_H = 1.15;

export interface Door {
  id: string;
  cost: number;
  label: string;
  x: number;
  z: number;
  nx: number;
  nz: number;
  open: boolean;
  /** 0 cerrada, 1 abierta (animación). */
  k: number;
  panel: THREE.Object3D;
  collider: Collider;
}

export interface BarricadeWindow {
  id: string;
  x: number;
  z: number;
  nx: number;
  nz: number;
  width: number;
  planks: number;
  group: THREE.Group;
  /** Animación de los tablones (salen despedidos al arrancarlos y flotan hasta su sitio al reparar). */
  rig: PlankRig;
  /** Punto interior y exterior del hueco (para la IA y el jugador). */
  inner: { x: number; z: number };
  outer: { x: number; z: number };
  /**
   * Tablones como colisión: mientras queden planks frena a los zombis (que sí trepan el alféizar), a los
   * disparos y a la vista. Al arrancar el último tablón se apaga y el hueco queda abierto.
   */
  barricade: Collider;
}

export interface BuyPoint {
  spec: BuySpec;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

/** Fuente de luz del mapa: la escena solo enciende las más cercanas al jugador (ver `LightPool`). */
export interface LightSource {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
  flicker: boolean;
  seed: number;
}

export interface BuiltMap {
  /** El mapa del que sale (nombre, sitios de las máquinas, aparición del jugador…). */
  def: MapDef;
  root: THREE.Group;
  /** Lo que se mueve (puertas, tablones, fuego): no entra en la fusión de geometría. */
  dyn: THREE.Group;
  colliders: Collider[];
  doors: Door[];
  windows: BarricadeWindow[];
  buys: BuyPoint[];
  box: MysteryBox;
  upgrader: Upgrader;
  power: PowerSwitch;
  perks: PerkMachine[];
  /** Lleva la caja misteriosa al sitio `i` de `BOX_SPOTS` (colisión incluida). */
  moveBox(i: number): void;
  spawns: { x: number; z: number }[];
  lights: LightSource[];
  /** Barriles en llamas (de ellos suben brasas y humo). */
  fires: { x: number; y: number; z: number }[];
  /** Cosas que se animan cada fotograma (llamas, polvo, charcos…). */
  animated: ((dt: number, time: number) => void)[];
  /** Posición de la cámara (la pone el escenario): los haces de luz se apagan cerca de ella. */
  camPos: THREE.Vector3;
  update(dt: number, time: number): void;
  dispose(): void;
}

export type { MysteryBox, PowerSwitch, Upgrader, PerkMachine };

const matCache = new Map<string, THREE.Material>();

/** Acabado de cada superficie: el asfalto mojado y la chapa reflejan; el ladrillo y el hormigón son mates. */
const SURFACE: Record<string, { rough: number; metal: number; bump: number }> = {
  asphalt: { rough: 0.62, metal: 0.08, bump: 1.6 },
  concrete: { rough: 0.9, metal: 0.04, bump: 1.4 },
  brick: { rough: 0.88, metal: 0.03, bump: 2.4 },
  metal: { rough: 0.42, metal: 0.7, bump: 1.6 },
  wood: { rough: 0.78, metal: 0.04, bump: 1.8 },
  tile: { rough: 0.5, metal: 0.05, bump: 1.2 },
  rust: { rough: 0.7, metal: 0.45, bump: 2 },
  grass: { rough: 0.95, metal: 0.0, bump: 1.8 },
  dirt: { rough: 0.95, metal: 0.0, bump: 2.2 },
  barn: { rough: 0.8, metal: 0.02, bump: 2.2 },
  siding: { rough: 0.82, metal: 0.02, bump: 2.0 },
  plaster: { rough: 0.9, metal: 0.02, bump: 1.6 },
  cobble: { rough: 0.7, metal: 0.05, bump: 2.6 },
};

/** Cartel de tiza de una compra de pared: silueta de arma, nombre y precio. */
function chalkTexture(label: string, price: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const g = c.getContext("2d");
  if (g) {
    g.strokeStyle = "rgba(214,232,255,0.9)";
    g.fillStyle = "rgba(214,232,255,0.92)";
    g.lineWidth = 5;
    g.lineJoin = "round";
    g.lineCap = "round";
    // Silueta genérica de arma larga.
    g.beginPath();
    g.moveTo(52, 168);
    g.lineTo(206, 168);
    g.lineTo(206, 146);
    g.lineTo(64, 146);
    g.closePath();
    g.stroke();
    g.strokeRect(30, 168, 26, 12);
    g.beginPath();
    g.moveTo(156, 182);
    g.lineTo(146, 212);
    g.lineTo(178, 212);
    g.lineTo(186, 182);
    g.stroke();
    g.beginPath();
    g.moveTo(196, 168);
    g.lineTo(222, 168);
    g.stroke();
    g.font = "bold 24px 'Courier New', monospace";
    g.textAlign = "center";
    g.fillText(label.split(" ")[0], 128, 44);
    g.font = "bold 34px 'Courier New', monospace";
    g.fillText(String(price), 128, 290);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function material(kind: MatKind): THREE.Material {
  const hit = matCache.get(kind);
  if (hit) return hit;
  let m: THREE.Material;
  switch (kind) {
    case "emissiveRed":
      m = new THREE.MeshStandardMaterial({ color: 0x3a0d0d, emissive: 0xff2a1a, emissiveIntensity: 2.2 });
      break;
    case "emissiveGreen":
      m = new THREE.MeshStandardMaterial({ color: 0x0d2a18, emissive: 0x46ff9c, emissiveIntensity: 1.8 });
      break;
    case "glass":
      m = new THREE.MeshStandardMaterial({
        color: 0x8fb6c9,
        transparent: true,
        opacity: 0.28,
        roughness: 0.1,
        metalness: 0.6,
      });
      break;
    case "dark":
      m = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.85, metalness: 0.35 });
      break;
    default: {
      const tex = texture(kind);
      const surface = SURFACE[kind] ?? { rough: 0.9, metal: 0.05, bump: 1.2 };
      m = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: surface.bump, roughness: surface.rough, metalness: surface.metal });
      m.userData.tile = TILE_M[kind];
    }
  }
  matCache.set(kind, m);
  return m;
}

/** Material liso de un color (compartido): pintura de coches, ropa, goma… */
function flat(color: number, rough = 0.9, metal = 0): THREE.MeshStandardMaterial {
  return cachedMaterial(`flat${color}-${rough}-${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })) as THREE.MeshStandardMaterial;
}

function cachedMaterial(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

function boxMesh(w: number, h: number, d: number, mat: MatKind): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(mat));
  return mesh;
}

/** Caja posicionada por su centro. */
function place(mesh: THREE.Object3D, x: number, y: number, z: number, rotY = 0): THREE.Object3D {
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  return mesh;
}

interface Span {
  a: number;
  b: number;
}

/** Tramos sólidos de un muro, descontando los huecos. */
function solidSpans(length: number, holes: Hole[]): Span[] {
  const sorted = [...holes].sort((p, q) => p.from - q.from);
  const out: Span[] = [];
  let cursor = 0;
  for (const h of sorted) {
    const from = Math.max(0, Math.min(length, h.from));
    const to = Math.max(from, Math.min(length, h.to));
    if (from > cursor) out.push({ a: cursor, b: from });
    cursor = Math.max(cursor, to);
  }
  if (cursor < length) out.push({ a: cursor, b: length });
  return out;
}

export function buildMap(scene: THREE.Scene, def: MapDef): BuiltMap {
  const MAP_BOUNDS = def.bounds;
  const root = new THREE.Group();
  root.name = def.id;
  scene.add(root);
  const dyn = new THREE.Group();
  dyn.name = `${def.id}-dyn`;
  scene.add(dyn);

  const colliders: Collider[] = [];
  const doors: Door[] = [];
  const windows: BarricadeWindow[] = [];
  const lights: LightSource[] = [];
  const fires: { x: number; y: number; z: number }[] = [];
  const animated: ((dt: number, time: number) => void)[] = [];

  // --- Suelo exterior ---
  const groundW = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
  const groundD = MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundW, groundD), material(def.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2, 0, (MAP_BOUNDS.minZ + MAP_BOUNDS.maxZ) / 2);
  root.add(ground);
  colliders.push(
    makeCollider(
      { x: MAP_BOUNDS.minX, y: -0.5, z: MAP_BOUNDS.minZ },
      { x: MAP_BOUNDS.maxX, y: 0, z: MAP_BOUNDS.maxZ },
      "floor",
    ),
  );

  // --- Aceras, caminos y patios (sin techo) ---
  for (const f of def.floors ?? []) {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(f.x1 - f.x0, f.z1 - f.z0), material(f.mat));
    fl.rotation.x = -Math.PI / 2;
    fl.position.set((f.x0 + f.x1) / 2, 0.008, (f.z0 + f.z1) / 2);
    root.add(fl);
  }

  // --- Suelos interiores (hormigón/baldosa) ---
  for (const r of def.interiors) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material(r.mat));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((r.x0 + r.x1) / 2, 0.012, (r.z0 + r.z1) / 2);
    root.add(floor);
    // Techo: da sensación de interior y encierra la luz.
    const roof = boxMesh(w + 0.4, 0.2, d + 0.4, "dark");
    place(roof, (r.x0 + r.x1) / 2, 3.95, (r.z0 + r.z1) / 2);
    root.add(roof);
    colliders.push(
      makeCollider(
        { x: r.x0 - 0.2, y: 3.85, z: r.z0 - 0.2 },
        { x: r.x1 + 0.2, y: 4.15, z: r.z1 + 0.2 },
        "ceiling",
      ),
    );
  }

  // --- Muros ---
  for (const run of def.walls) buildWallRun(run);

  function buildWallRun(run: WallRun): void {
    const dx = run.x2 - run.x1;
    const dz = run.z2 - run.z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return;
    const ux = dx / length;
    const uz = dz / length;
    const h = run.h ?? 4.2;
    const t = run.t ?? WALL_T;
    const rotY = Math.atan2(-uz, ux);
    const holes = run.holes ?? [];

    const put = (a: number, b: number, y0: number, y1: number, mat: MatKind, tag: Collider["tag"], id?: string): void => {
      const len = b - a;
      if (len <= 0.001) return;
      const cx = run.x1 + ux * (a + len / 2);
      const cz = run.z1 + uz * (a + len / 2);
      const mesh = boxMesh(len, y1 - y0, t, mat);
      place(mesh, cx, (y0 + y1) / 2, cz, rotY);
      root.add(mesh);
      // AABB del tramo (los muros del mapa son rectos en X o Z).
      const half = len / 2;
      const hx = Math.abs(ux) * half + Math.abs(uz) * (t / 2);
      const hz = Math.abs(uz) * half + Math.abs(ux) * (t / 2);
      colliders.push(
        makeCollider(
          { x: cx - hx, y: y0, z: cz - hz },
          { x: cx + hx, y: y1, z: cz + hz },
          tag,
          id,
        ),
      );
    };

    for (const s of solidSpans(length, holes)) put(s.a, s.b, 0, h, run.mat, "wall");

    for (const hole of holes) {
      const len = hole.to - hole.from;
      if (len <= 0.001) continue;
      const mid = hole.from + len / 2;
      const cx = run.x1 + ux * mid;
      const cz = run.z1 + uz * mid;
      // Perpendicular al muro: se usa para saber a qué lado está el interior.
      const px = -uz;
      const pz = ux;
      if (hole.kind === "open") {
        // Dintel sobre el paso.
        put(hole.from, hole.to, 2.6, h, run.matTop ?? run.mat, "wall");
        continue;
      }
      // Dintel común a puertas y ventanas.
      put(hole.from, hole.to, hole.kind === "window" ? 1.95 : DOOR_H, h, run.matTop ?? run.mat, "wall");

      if (hole.kind === "window") {
        const sill = boxMesh(len, SILL_H, t, run.mat);
        place(sill, cx, SILL_H / 2, cz, rotY);
        root.add(sill);
        // El alféizar frena al jugador pero la rejilla de navegación lo ignora: los zombis trepan.
        const hx = Math.abs(ux) * (len / 2) + Math.abs(uz) * (t / 2);
        const hz = Math.abs(uz) * (len / 2) + Math.abs(ux) * (t / 2);
        colliders.push(
          makeCollider({ x: cx - hx, y: 0, z: cz - hz }, { x: cx + hx, y: SILL_H, z: cz + hz }, "window", hole.id),
        );
        // Tablones con colisión: cierran el hueco hasta que un zombi arranca el último. Se apagan en
        // `paintPlanks` (interact.ts); la rejilla de rutas los trata como bloqueo dinámico (`blockArea`).
        const barricade = makeCollider(
          { x: cx - hx, y: 0, z: cz - hz },
          { x: cx + hx, y: 1.95, z: cz + hz },
          "barricade",
          hole.id,
        );
        colliders.push(barricade);
        // Marco roto.
        const frame = boxMesh(len, 0.08, t * 0.6, "dark");
        place(frame, cx, 1.9, cz, rotY);
        root.add(frame);

        // El lado interior es el que cae dentro de un recinto (el otro es la calle exterior).
        const probe = 1.3;
        const plusInside = inRooms(def.rooms, cx + px * probe, cz + pz * probe) !== null;
        const minusInside = inRooms(def.rooms, cx - px * probe, cz - pz * probe) !== null;
        const sign = minusInside && !plusInside ? -1 : 1;
        const nx = px * sign;
        const nz = pz * sign;
        const group = new THREE.Group();
        dyn.add(group);
        const planks: THREE.Group = new THREE.Group();
        group.add(planks);
        for (let i = 0; i < MAX_PLANKS; i++) {
          const plank = boxMesh(len * 0.98, 0.17, 0.07, "wood");
          const y = 0.25 + i * 0.27;
          const tilt = (i % 2 ? 1 : -1) * 0.09;
          plank.position.set(0, y, (i % 2 ? 1 : -1) * 0.04);
          plank.rotation.z = tilt;
          planks.add(plank);
        }
        const innerSign = 1;
        // Lado de la calle en el eje local Z del hueco (hacia donde salen despedidos los tablones).
        const localZ = { x: Math.sin(rotY), z: Math.cos(rotY) };
        const outerSign = -(nx * localZ.x + nz * localZ.z) >= 0 ? 1 : -1;
        windows.push({
          id: hole.id ?? `w_${windows.length}`,
          x: cx,
          z: cz,
          nx: nx * innerSign,
          nz: nz * innerSign,
          width: len,
          planks: MAX_PLANKS,
          group: planks,
          rig: new PlankRig(planks, outerSign, len),
          inner: { x: cx + nx * 1.1, z: cz + nz * 1.1 },
          outer: { x: cx - nx * 1.1, z: cz - nz * 1.1 },
          barricade,
        });
        group.position.set(cx, 0, cz);
        group.rotation.y = rotY;
        continue;
      }

      // Puerta comprable: hoja giratoria + colisionador que se desactiva al comprarla.
      const hinge = new THREE.Group();
      hinge.position.set(
        run.x1 + ux * hole.from,
        0,
        run.z1 + uz * hole.from,
      );
      hinge.rotation.y = rotY;
      const leaf = boxMesh(len, DOOR_H, 0.09, "metal");
      leaf.position.set(len / 2, DOOR_H / 2, 0);
      hinge.add(leaf);
      // Cartel de precio en la hoja.
      const plate = boxMesh(0.5, 0.24, 0.03, "emissiveGreen");
      plate.position.set(len / 2, 1.55, 0.07);
      hinge.add(plate);
      dyn.add(hinge);
      const hx = Math.abs(ux) * (len / 2) + Math.abs(uz) * (t / 2);
      const hz = Math.abs(uz) * (len / 2) + Math.abs(ux) * (t / 2);
      const collider = makeCollider(
        { x: cx - hx, y: 0, z: cz - hz },
        { x: cx + hx, y: DOOR_H, z: cz + hz },
        "door",
        hole.id,
      );
      colliders.push(collider);
      doors.push({
        id: hole.id ?? `d_${doors.length}`,
        cost: hole.cost ?? 750,
        label: hole.label ?? "PUERTA",
        x: cx,
        z: cz,
        nx: px,
        nz: pz,
        open: false,
        k: 0,
        panel: hinge,
        collider,
      });
    }
  }

  // --- Props del escenario ---
  for (const spec of def.props) buildProp(spec);

  function addCollider(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    tag: Collider["tag"] = "prop",
    y0 = 0,
  ): void {
    colliders.push(
      makeCollider({ x: x - w / 2, y: y0, z: z - d / 2 }, { x: x + w / 2, y: y0 + h, z: z + d / 2 }, tag),
    );
  }

  /** Colisionador de un prop girado: la caja que envuelve al rectángulo `w × d` girado `rot`. */
  function addRotCollider(x: number, z: number, w: number, d: number, h: number, rot: number): void {
    const c = Math.abs(Math.cos(rot));
    const s = Math.abs(Math.sin(rot));
    addCollider(x, z, w * c + d * s, w * s + d * c, h);
  }

  function buildProp(spec: PropSpec): void {
    const rot = spec.rot ?? 0;
    const g = new THREE.Group();
    g.position.set(spec.x, 0, spec.z);
    g.rotation.y = rot;
    root.add(g);
    const v = spec.v ?? 0;

    const add = (m: THREE.Object3D, x: number, y: number, z: number): void => {
      m.position.set(x, y, z);
      g.add(m);
    };

    switch (spec.kind) {
      case "car": {
        // Coche abandonado: carrocería con capó y maletero, cabina, ventanas rotas, parachoques, faros apagados y una rueda
        // pinchada. La pintura (rojo, azul, taxi) es lisa y refleja el cielo.
        const paint = flat([0x6e2a24, 0x28445f, 0x9a7b22, 0x5a5f66][v % 4], 0.38, 0.55);
        const trim = flat(0x15171a, 0.6, 0.5);
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.4), paint);
        add(body, 0, 0.62, 0);
        const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.3), paint);
        add(hood, 0, 0.93, 1.45);
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.0), paint);
        add(trunk, 0, 0.94, -1.7);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.62, 2.1), paint);
        add(cabin, 0, 1.28, -0.15);
        const glass = boxMesh(1.7, 0.42, 2.02, "glass");
        add(glass, 0, 1.3, -0.15);
        // Montantes de la cabina.
        for (const [px, pz] of [[0.83, 0.85], [-0.83, 0.85], [0.83, -1.12], [-0.83, -1.12]]) add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.09), trim), px, 1.3, pz);
        for (const bz of [2.22, -2.22]) add(new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.2, 0.18), trim), 0, 0.46, bz);
        for (const hx of [-0.65, 0.65]) {
          add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.05), flat(0xb9b09a, 0.2, 0.3)), hx, 0.72, 2.2);
          add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), flat(0x5a0d0d, 0.3, 0.2)), hx, 0.72, -2.22);
        }
        for (const [wx, wz, flatTire] of [[0.95, 1.4, 0], [-0.95, 1.4, 0], [0.95, -1.4, v === 1 ? 1 : 0], [-0.95, -1.4, 0]] as const) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(flatTire ? 0.3 : 0.35, flatTire ? 0.3 : 0.35, 0.25, 14), trim);
          wheel.rotation.z = Math.PI / 2;
          add(wheel, wx, flatTire ? 0.3 : 0.35, wz);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.27, 10), flat(0x8c9096, 0.3, 0.9));
          hub.rotation.z = Math.PI / 2;
          add(hub, wx, flatTire ? 0.3 : 0.35, wz);
        }
        // Puerta del conductor abierta en las variantes impares.
        if (v % 2 === 1) {
          const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 1.0), paint);
          door.rotation.y = 0.9;
          add(door, 1.25, 0.95, 0.2);
        }
        addCollider(spec.x, spec.z, 2.1, 4.5, 1.4);
        break;
      }
      case "van": {
        const body = boxMesh(2.2, 1.9, 5.0, "rust");
        add(body, 0, 1.15, 0);
        const cab = boxMesh(2.1, 0.9, 1.5, "metal");
        add(cab, 0, 0.9, 2.6);
        for (const [wx, wz] of [
          [1.05, 1.9],
          [-1.05, 1.9],
          [1.05, -1.6],
          [-1.05, -1.6],
        ]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 12), material("dark"));
          wheel.rotation.z = Math.PI / 2;
          add(wheel, wx, 0.42, wz);
        }
        addCollider(spec.x, spec.z, 2.4, 5.4, 2.2);
        break;
      }
      case "barrel": {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.95, 12), material(v === 2 ? "emissiveRed" : "rust"));
        add(m, 0, 0.48, 0);
        addCollider(spec.x, spec.z, 0.66, 0.66, 0.95);
        break;
      }
      case "crate": {
        const m = boxMesh(0.9, 0.9, 0.9, "wood");
        add(m, 0, 0.45, 0);
        if (v === 1) {
          const m2 = boxMesh(0.7, 0.7, 0.7, "wood");
          add(m2, 0.1, 1.25, 0.06);
          addCollider(spec.x, spec.z, 1.0, 1.0, 1.6);
        } else addCollider(spec.x, spec.z, 0.95, 0.95, 0.9);
        break;
      }
      case "dumpster": {
        const m = boxMesh(2.0, 1.1, 1.2, "metal");
        add(m, 0, 0.6, 0);
        const lid = boxMesh(2.05, 0.1, 1.25, "dark");
        add(lid, 0, 1.2, 0.06);
        addCollider(spec.x, spec.z, 2.1, 1.3, 1.25);
        break;
      }
      case "sandbag": {
        for (let i = 0; i < 3; i++) {
          const m = boxMesh(0.7, 0.24, 0.42, "brick");
          add(m, (i % 2) * 0.1 - 0.05, 0.14 + i * 0.24, 0);
        }
        addCollider(spec.x, spec.z, 0.8, 0.5, 0.75);
        break;
      }
      case "fence": {
        const post = boxMesh(0.1, 1.5, 0.1, "metal");
        add(post, -0.9, 0.75, 0);
        const post2 = boxMesh(0.1, 1.5, 0.1, "metal");
        add(post2, 0.9, 0.75, 0);
        for (let i = 0; i < 4; i++) {
          const rail = boxMesh(1.9, 0.06, 0.05, "metal");
          add(rail, 0, 0.35 + i * 0.36, 0);
        }
        addCollider(spec.x, spec.z, 2.0, 0.25, 1.5);
        break;
      }
      case "shelf": {
        const back = boxMesh(2.0, 2.0, 0.12, "metal");
        add(back, 0, 1.0, 0);
        for (let i = 0; i < 3; i++) {
          const sh = boxMesh(2.0, 0.07, 0.55, "wood");
          add(sh, 0, 0.45 + i * 0.65, 0.28);
        }
        addCollider(spec.x, spec.z, 2.0, 0.7, 2.0);
        break;
      }
      case "counter": {
        const body = boxMesh(2.4, 1.0, 0.7, "wood");
        add(body, 0, 0.5, 0);
        const top = boxMesh(2.5, 0.08, 0.8, "dark");
        add(top, 0, 1.04, 0);
        addCollider(spec.x, spec.z, 2.4, 0.8, 1.05);
        break;
      }
      case "desk": {
        const top = boxMesh(1.5, 0.08, 0.8, "wood");
        add(top, 0, 0.74, 0);
        for (const [lx, lz] of [
          [-0.66, -0.32],
          [0.66, -0.32],
          [-0.66, 0.32],
          [0.66, 0.32],
        ]) {
          const leg = boxMesh(0.08, 0.74, 0.08, "dark");
          add(leg, lx, 0.37, lz);
        }
        addCollider(spec.x, spec.z, 1.5, 0.8, 0.78);
        break;
      }
      case "table": {
        const top = boxMesh(1.2, 0.08, 1.2, "wood");
        add(top, 0, 0.72, 0);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.72, 8), material("dark"));
        add(leg, 0, 0.36, 0);
        addCollider(spec.x, spec.z, 1.2, 1.2, 0.76);
        break;
      }
      case "container": {
        const body = boxMesh(2.5, 2.4, 6.0, "rust");
        add(body, 0, 1.2, 0);
        for (let i = 0; i < 6; i++) {
          const rib = boxMesh(0.08, 2.3, 0.1, "metal");
          add(rib, 1.26, 1.2, -2.5 + i);
        }
        addCollider(spec.x, spec.z, 2.6, 6.1, 2.4);
        break;
      }
      case "fountain": {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.7, 20), material("concrete"));
        add(base, 0, 0.35, 0);
        const water = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 2.2, 0.08, 20),
          new THREE.MeshStandardMaterial({ color: 0x123a3a, roughness: 0.15, metalness: 0.4 }),
        );
        add(water, 0, 0.7, 0);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.7, 12), material("concrete"));
        add(col, 0, 1.5, 0);
        addCollider(spec.x, spec.z, 5.0, 5.0, 0.8);
        break;
      }
      case "sign": {
        const post = boxMesh(0.08, 2.2, 0.08, "metal");
        add(post, 0, 1.1, 0);
        const board = boxMesh(1.0, 0.7, 0.06, "emissiveRed");
        add(board, 0, 2.0, 0);
        break;
      }
      case "rubble": {
        for (let i = 0; i < 7; i++) {
          const s = 0.2 + Math.random() * 0.4;
          const m = boxMesh(s, s * 0.6, s, "concrete");
          m.rotation.set(Math.random(), Math.random() * 3, Math.random());
          add(m, (Math.random() - 0.5) * 1.8, s * 0.3, (Math.random() - 0.5) * 1.8);
        }
        break;
      }
      case "lamp": {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.4, 8), material("dark"));
        add(post, 0, 2.2, 0);
        const head = boxMesh(0.5, 0.16, 0.3, "emissiveRed");
        add(head, 0, 4.4, 0.2);
        addCollider(spec.x, spec.z, 0.3, 0.3, 4.4);
        break;
      }
      case "corpse": {
        // Cuerpo tendido: camiseta, vaqueros, piel grisácea y un charco debajo.
        const shirt = flat([0x4a4f3a, 0x3a4a63, 0x5a3b2a, 0x6b6b6b][v % 4], 1, 0);
        const jeans = flat(0x232a3a, 1, 0);
        const skin = flat(0x8d9577, 0.95, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.62), shirt), 0, 0.12, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.26), skin), 0.02, 0.13, -0.5);
        for (const sx of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.55), skin);
          arm.rotation.y = sx * (0.5 + (v % 2) * 0.4);
          add(arm, sx * 0.4, 0.08, -0.25);
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.8), jeans);
          leg.rotation.y = sx * 0.12;
          add(leg, sx * 0.14, 0.09, 0.7);
        }
        floorDecal(g, 0, 0, 2.2, v);
        break;
      }
      case "cone": {
        for (let i = 0; i < 3; i++) {
          const ox = (i - 1) * 0.55;
          const oz = (i % 2) * 0.35;
          add(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 12), flat(0xd8601a, 0.6, 0)), ox, 0.36, oz);
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.1, 0.1, 12), flat(0xe8e8e0, 0.6, 0)), ox, 0.4, oz);
          add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), flat(0x1a1a1a, 0.8, 0)), ox, 0.02, oz);
        }
        addCollider(spec.x, spec.z, 1.4, 0.6, 0.6);
        break;
      }
      case "barrelFire": {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 1.0, 14, 1, true), material("rust")), 0, 0.5, 0);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 14), flat(0x1a0d06, 1, 0)), 0, 0.3, 0);
        // Brasas y llamas (sprites aditivos que bailan).
        const embers = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 14), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
        embers.position.set(spec.x, 0.88, spec.z);
        dyn.add(embers);
        const flames: THREE.Sprite[] = [];
        for (let i = 0; i < 4; i++) {
          const sp = glowSprite(i === 0 ? 0xffd27a : 0xff7a2a, 0.9 - i * 0.12, 0.9);
          sp.position.set(spec.x, 1.1, spec.z);
          dyn.add(sp);
          flames.push(sp);
        }
        const seed = Math.random() * 100;
        animated.push((_dt, time) => {
          flames.forEach((f, i) => {
            const t = time * (6 + i * 2) + seed + i * 1.7;
            f.position.set(spec.x + Math.sin(t * 1.3) * 0.08, 1.05 + i * 0.22 + Math.abs(Math.sin(t)) * 0.12, spec.z + Math.cos(t * 1.1) * 0.08);
            f.scale.setScalar((0.9 - i * 0.15) * (0.85 + Math.sin(t * 2.3) * 0.2));
            (f.material as THREE.SpriteMaterial).opacity = 0.55 + Math.sin(t * 3) * 0.25;
          });
        });
        lights.push({ x: spec.x, y: 1.7, z: spec.z, color: 0xff8a3a, intensity: 18, distance: 13, flicker: true, seed });
        fires.push({ x: spec.x, y: 1.1, z: spec.z });
        addCollider(spec.x, spec.z, 0.66, 0.66, 1.0);
        break;
      }
      case "tires": {
        const tire = flat(0x121315, 0.9, 0.1);
        for (let i = 0; i < 3; i++) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.13, 8, 18), tire);
          t.rotation.x = Math.PI / 2;
          add(t, (i === 2 ? 0.1 : 0) + (i % 2) * 0.05, 0.13 + i * 0.26, 0);
        }
        const lying = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.13, 8, 18), tire);
        lying.rotation.set(0.2, 0.5, 0);
        add(lying, 0.95, 0.3, 0.3);
        addCollider(spec.x, spec.z, 0.8, 0.8, 0.8);
        break;
      }
      case "bench": {
        add(boxMesh(1.6, 0.07, 0.42, "wood"), 0, 0.46, 0);
        add(boxMesh(1.6, 0.4, 0.06, "wood"), 0, 0.76, -0.2);
        for (const sx of [-0.7, 0.7]) add(boxMesh(0.08, 0.46, 0.5, "dark"), sx, 0.23, 0);
        addCollider(spec.x, spec.z, 1.7, 0.6, 0.5);
        break;
      }
      case "barbed": {
        // Concertina: postes con tres vueltas de alambre de espino.
        for (const sx of [-1.4, 1.4]) add(boxMesh(0.08, 1.4, 0.08, "metal"), sx, 0.7, 0);
        const wire = flat(0x74777c, 0.35, 0.9);
        for (let i = 0; i < 3; i++) {
          for (let k = -4; k <= 4; k++) {
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 5, 14), wire);
            coil.rotation.y = Math.PI / 2;
            add(coil, k * 0.3, 0.42 + i * 0.3, 0);
          }
        }
        addCollider(spec.x, spec.z, 3.0, 0.5, 1.4);
        break;
      }
      case "deadTree": {
        const bark = flat(0x2c241e, 1, 0);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, 4.2, 8), bark), 0, 2.1, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + v;
          const br = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.08, 1.6 + (i % 3) * 0.4, 5), bark);
          br.rotation.z = Math.cos(a) * 0.9;
          br.rotation.x = Math.sin(a) * 0.9;
          add(br, Math.cos(a) * 0.5, 3.0 + (i % 3) * 0.35, Math.sin(a) * 0.5);
        }
        addCollider(spec.x, spec.z, 0.5, 0.5, 4);
        break;
      }
      case "bus": {
        // Autobús siniestrado, atravesado en la calle.
        const paint = flat(0x8a7a2a, 0.55, 0.35);
        const dirt = flat(0x2a2620, 0.9, 0.2);
        add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.5, 9.6), paint), 0, 1.65, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.5, 9.64), dirt), 0, 0.6, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.14, 9.2), flat(0x1b1d20, 0.6, 0.4)), 0, 2.95, 0);
        for (let i = 0; i < 7; i++) {
          for (const sx of [-1, 1]) {
            add(boxMesh(0.05, 0.7, 0.95, "glass"), sx * 1.32, 1.95, -3.9 + i * 1.3);
            // Algunos cristales rotos: marco vacío más oscuro.
            if ((i + (sx > 0 ? 1 : 0)) % 3 === 0) add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 1.0), dirt), sx * 1.31, 1.95, -3.9 + i * 1.3);
          }
        }
        add(boxMesh(2.2, 0.8, 0.06, "glass"), 0, 1.95, 4.83);
        for (const [wx, wz] of [[1.3, 3.2], [-1.3, 3.2], [1.3, -3.0], [-1.3, -3.0]]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.36, 14), flat(0x101113, 0.9, 0.1));
          wheel.rotation.z = Math.PI / 2;
          add(wheel, wx, 0.55, wz);
        }
        add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 0.06), flat(0x15171a, 0.5, 0.4)), 0, 2.7, 4.83);
        add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xcc3a1a })), 0, 2.68, 4.88);
        addCollider(spec.x, spec.z, 2.8, 9.8, 3.0);
        break;
      }
      case "streetlight": {
        const pole = flat(0x23262b, 0.5, 0.7);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 5.4, 8), pole), 0, 2.7, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), pole), 0, 5.35, 0.5);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.55), flat(0x15171a, 0.5, 0.5)), 0, 5.3, 1.05);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.42), new THREE.MeshBasicMaterial({ color: 0xffe2b0 })), 0, 5.24, 1.05);
        lights.push({ x: spec.x + Math.sin(rot) * 1.05, y: 5.1, z: spec.z + Math.cos(rot) * 1.05, color: v === 1 ? 0xffd9a0 : 0xbfe0ff, intensity: 20, distance: 15, flicker: v === 1, seed: Math.random() * 100 });
        addCollider(spec.x, spec.z, 0.3, 0.3, 5.4);
        break;
      }
      case "tent": {
        // Tienda de campaña militar abandonada: lona verde, dos faldones y un fondo.
        const cloth = flat(0x4a5238, 1, 0);
        for (const sx of [-1, 1]) {
          const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 3.2), cloth);
          side.rotation.z = sx * -0.88;
          add(side, sx * 0.85, 1.15, 0);
        }
        add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 0.05), cloth), 0, 0.75, -1.6);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.0, 0.05), flat(0x5a4a38, 0.8, 0)), 0, 1.0, 1.55);
        floorDecal(g, 0.4, 0.2, 2.0, 1);
        addCollider(spec.x, spec.z, 2.6, 3.3, 2.0);
        break;
      }
      case "generator": {
        add(new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.9, 0.8, 2, 0.05), flat(0x8a3a1a, 0.5, 0.5)), 0, 0.5, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.1, 0.85), flat(0x15171a, 0.6, 0.5)), 0, 1.0, 0);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), flat(0x2a2c30, 0.4, 0.8)), 0.45, 1.3, -0.2);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.45, 0.2), flat(0x3a6a2a, 0.7, 0.2)), -0.9, 0.23, 0.3);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3a1a })), -0.45, 0.8, 0.41);
        addCollider(spec.x, spec.z, 1.4, 0.9, 1.1);
        break;
      }
      case "pipe": {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8), material("rust"));
        add(pipe, 0, 1.2, 0);
        break;
      }
      default:
        buildExtraProp(spec, {
          add: (m, x, y, z) => add(m, x, y, z),
          flat,
          box: boxMesh,
          mat: material,
          collide: (w, d, h) => addRotCollider(spec.x, spec.z, w, d, h, rot),
        });
    }
    g.updateMatrixWorld();
  }

  // --- Compras de pared (tiza + cartel) ---
  const buys: BuyPoint[] = [];
  for (const spec of def.buys) {
    const normal = new THREE.Vector3(Math.cos(spec.facing), 0, Math.sin(spec.facing));
    const group = new THREE.Group();
    group.position.set(spec.x - normal.x * 0.2, 1.35, spec.z - normal.z * 0.2);
    group.rotation.y = Math.atan2(normal.x, normal.z);
    const def = WEAPONS[spec.weaponId as WeaponId];
    const chalk = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.45),
      new THREE.MeshBasicMaterial({
        map: chalkTexture(def.name, def.price || def.ammoPrice),
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    chalk.position.z = 0.02;
    group.add(chalk);
    root.add(group);
    buys.push({ spec, position: new THREE.Vector3(spec.x, 1.2, spec.z), normal });
  }

  // --- Las tres máquinas: caja misteriosa (centro de la plaza), mejorador (Bloque B) e interruptor (depósito) ---
  const BOX0 = def.boxSpots[0];
  const box = buildMysteryBox(BOX0.x, BOX0.z, BOX_PRICE);
  box.moveTo(BOX0.x, BOX0.z, BOX0.rot, BOX0.dais);
  dyn.add(box.group);
  const boxCollider = makeCollider(
    { x: BOX0.x - 0.9, y: 0, z: BOX0.z - 0.58 },
    { x: BOX0.x + 0.9, y: 1.1, z: BOX0.z + 0.58 },
    "prop",
  );
  colliders.push(boxCollider);
  const moveBox = (i: number): void => {
    const sp = def.boxSpots[i];
    if (!sp) return;
    box.spot = i;
    box.moveTo(sp.x, sp.z, sp.rot, sp.dais);
    const turned = Math.abs(Math.sin(sp.rot)) > 0.5;
    const hx = turned ? 0.58 : 0.9;
    const hz = turned ? 0.9 : 0.58;
    boxCollider.min = { x: sp.x - hx, y: 0, z: sp.z - hz };
    boxCollider.max = { x: sp.x + hx, y: 1.1, z: sp.z + hz };
  };
  const UPGRADER = def.upgrader;
  const upgrader = buildUpgrader(UPGRADER.x, UPGRADER.z, UPGRADER.facing);
  dyn.add(upgrader.group);
  const upAlongX = Math.abs(Math.cos(UPGRADER.facing)) < 0.5; // de cara al norte/sur: ancho en X
  colliders.push(
    makeCollider(
      { x: UPGRADER.x - (upAlongX ? 1.0 : 0.66), y: 0, z: UPGRADER.z - (upAlongX ? 0.66 : 1.0) },
      { x: UPGRADER.x + (upAlongX ? 1.0 : 0.66), y: 2.6, z: UPGRADER.z + (upAlongX ? 0.66 : 1.0) },
      "prop",
    ),
  );
  const perks = PERK_IDS.map((id) => {
    const m = buildPerkMachine(id, def.perkSpots[id]);
    dyn.add(m.group);
    colliders.push(
      makeCollider(
        { x: m.group.position.x - m.half.x, y: 0, z: m.group.position.z - m.half.z },
        { x: m.group.position.x + m.half.x, y: 2.4, z: m.group.position.z + m.half.z },
        "prop",
      ),
    );
    return m;
  });
  const POWER_SWITCH = def.powerSwitch;
  const power = buildPowerSwitch(POWER_SWITCH.x, POWER_SWITCH.z, POWER_SWITCH.facing);
  dyn.add(power.group);
  // Un poco hacia dentro de la sala, para que el cartel «ACTIVAR» se lea al acercarse.
  power.position.x = POWER_SWITCH.x + Math.cos(POWER_SWITCH.facing) * 0.7;
  power.position.z = POWER_SWITCH.z + Math.sin(POWER_SWITCH.facing) * 0.7;

  // --- Luces: solo las fuentes; la escena enciende las más cercanas (stage.ts) ---
  for (const spec of def.lights) {
    lights.push({ x: spec.x, y: spec.y, z: spec.z, color: spec.color, intensity: spec.intensity, distance: spec.distance, flicker: !!spec.flicker, seed: Math.random() * 100 });
    // Bombilla visible.
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      cachedMaterial(`bulb${spec.color}`, () => new THREE.MeshStandardMaterial({ color: spec.color, emissive: spec.color, emissiveIntensity: 1.4 })),
    );
    bulb.position.set(spec.x, spec.y, spec.z);
    root.add(bulb);
  }

  // --- Sangre, pintadas, marcas de la calzada y charcos ---
  def.decorate(root, dyn, animated);

  // Fusión de la geometría estática: una malla por material.
  batchStatic(root, (m) => m.userData.tile as number | undefined);

  return {
    root,
    dyn,
    colliders,
    doors,
    windows,
    buys,
    box,
    upgrader,
    power,
    perks,
    moveBox,
    def,
    spawns: def.spawns.map((s) => ({ ...s })),
    lights,
    fires,
    animated,
    camPos: new THREE.Vector3(0, 2, 20),
    update(dt: number, time: number) {
      for (const d of doors) {
        const target = d.open ? 1 : 0;
        if (Math.abs(d.k - target) > 0.002) {
          d.k += (target - d.k) * Math.min(1, dt * 5);
          // La hoja se hunde en el suelo (antes giraba sobre su eje y se quedaba cruzada en el paso).
          d.panel.position.y = -d.k * (DOOR_H + 0.1);
        }
      }
      for (const w of windows) w.rig.update(dt);
      upgrader.powered = power.on;
      for (const m of perks) {
        m.powered = power.on;
        m.update(dt, time);
      }
      box.update(dt, time, this.camPos);
      upgrader.update(dt, time);
      power.update(dt, time);
      for (const f of animated) f(dt, time);
    },
    dispose() {
      box.dispose();
      upgrader.dispose();
      for (const m of perks) m.dispose();
    },
  };
}
