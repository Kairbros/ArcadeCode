// Escena 3D de un circuito de Karts: terreno suave con el dibujo de la pista, karts redondeados, decorados
// esponjosos, montañas y nubes, rampas, placas de turbo, monedas, el túnel (cueva) y los objetos. Se
// construye al empezar la carrera y en cada frame solo se recoloca.
// Coordenadas del juego: x a la derecha, y hacia abajo en el mapa; en la escena x → x, y → z, y la altura
// del terreno → y, todo × S.
import * as THREE from "three";
import { PLAYER_COLORS } from "../core/config";
import { Rng } from "../core/rng";
import { glowSprite } from "../core/three";
import {
  BLAST_TIME, BOMB_FUSE, BOMB_RADIUS, CAM_DIST, CAM_HEIGHT, CAM_LOOK, FOG_END, FOG_START, FOV, HOP_HEIGHT, HOP_TIME, KH, KW,
  MAX_BANANAS, MAX_BOMBS, MINI_TURBO_1, MINI_TURBO_2, PAD_R, POINT_STEP, RAMP_LEN, TEX, TRACK_W,
} from "./config";
import {
  DECO_RADIUS, bananaGeometry, buildKart, cloudGeometry, coinGeometry, decoGeometry, mountainGeometry, padTexture, rampGeometry,
  shellGeometry, tntTexture, buildChomp, buildCloud, buildMeteor, buildThwomp, type KartModel,
} from "./models";
import { hazardAt } from "./hazards";
import { buildSpace, type SpaceScene } from "./space";
import { inTunnel } from "./physics";
import type { RaceView } from "./render";
import { heightAt, terrainOf, type Terrain } from "./terrain";
import { trackCanvas, type DecoKind, type Track } from "./track";
import { buildTunnel } from "./tunnel";

/** Unidades del juego → escena. */
export const S = 0.05;
export const at = (x: number, y: number, h: number): [number, number, number] => [x * S, h * S, y * S];
export const yawOf = (a: number) => Math.atan2(-Math.cos(a), -Math.sin(a));
export const hex = (c: readonly number[]) => (c[0] << 16) | (c[1] << 8) | c[2];

const RAMP_H = 8; // altura del labio de la rampa (unidades)
const RAMP_W = TRACK_W - 6;
const RAMP_L = RAMP_LEN * POINT_STEP;

/** Altura extra (unidades) que sube un kart al pasar por una rampa. */
export function rampLift(track: Track, x: number, y: number): { lift: number; slope: number } {
  for (const r of track.ramps) {
    const d = track.dir[r.i], ox = track.px[r.i], oy = track.py[r.i];
    const along = (x - ox) * Math.cos(d) + (y - oy) * Math.sin(d);
    const lat = -(x - ox) * Math.sin(d) + (y - oy) * Math.cos(d);
    if (Math.abs(lat) > RAMP_W / 2 || along < 0) continue;
    if (along <= RAMP_L) return { lift: (RAMP_H * along) / RAMP_L, slope: Math.atan2(RAMP_H, RAMP_L) };
    if (along < RAMP_L + 12) return { lift: RAMP_H * (1 - (along - RAMP_L) / 12), slope: 0 };
  }
  return { lift: 0, slope: 0 };
}

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Distancia del punto (x, z) al segmento a–b en el plano. */
function distToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}

interface Rig {
  model: KartModel;
  last: { x: number; y: number; a: number; z: number };
  wheel: number;
  steer: number;
  star: THREE.Sprite;
  cloud: THREE.Group;
}

const SKY_DARK = 0x160d26;

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, KW / KH, 0.05, 800);
  readonly terrain: Terrain;
  private sun = new THREE.DirectionalLight(0xfff0d8, 1.9);
  private hemi: THREE.HemisphereLight;
  private fog: THREE.Fog;
  private fogColor: THREE.Color;
  private sky: THREE.Mesh;
  /** Decorados: un dibujo por tipo (instanciado). `blocked` = oculto porque tapa la vista. */
  private decos: { mesh: THREE.InstancedMesh; slot: number; m: THREE.Matrix4; x: number; z: number; r: number; hidden: boolean }[] = [];
  private rigs = new Map<number, Rig>();
  private boxes: THREE.Mesh[] = [];
  private boxMat: THREE.MeshStandardMaterial;
  private bananas: THREE.Mesh[];
  private greens: THREE.Mesh[];
  private reds: THREE.Mesh[];
  private bombs: THREE.Mesh[];
  private blasts: { mesh: THREE.Mesh; glow: THREE.Sprite }[] = [];
  private coinMesh: THREE.InstancedMesh | null = null;
  private padMats: THREE.MeshBasicMaterial[] = [];
  private sparks: THREE.Mesh[] = [];
  private tunnelLights: THREE.PointLight[] = [];
  private puffs: { sp: THREE.Sprite; age: number; life: number; size: number; vy: number }[] = [];
  private puffNext = 0;
  private space: SpaceScene | null = null;
  private lava: THREE.Mesh | null = null;
  private lavaTex: THREE.CanvasTexture | null = null;
  private particles: { pts: THREE.Points; vel: Float32Array; kind: "ember" | "snow" } | null = null;
  private hazards: { obj: THREE.Group; shadow: THREE.Mesh | null; chain: THREE.Mesh[]; kind: string }[] = [];
  private fogFar = FOG_END * S;
  private dark = 0;
  private lastTime = 0;
  private fov = FOV;
  private readonly tmp = new THREE.Object3D();

  constructor(readonly track: Track, anisotropy: number) {
    const th = track.theme;
    const t = (this.terrain = terrainOf(track));
    const sc = this.scene;
    this.fogColor = new THREE.Color(th.lava ? 0x7a2a18 : hex(th.skyBottom));
    if (th.void) {
      this.fogColor.set(0x0a0420);
      this.fogFar = 150;
      sc.background = new THREE.Color(0x06021a);
    }
    this.fog = sc.fog = new THREE.Fog(this.fogColor.clone(), (th.void ? 40 : FOG_START * S), this.fogFar);

    // Cielo: caja enorme con degradado (no le afecta la niebla) y un sol grande con halo.
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
    this.sky.visible = !th.void;
    sc.add(this.sky);
    if (!th.void) {
      const sunSprite = glowSprite(th.lava ? 0xff7a30 : 0xfff2b0, th.lava ? 180 : 120, 0.95);
      sunSprite.material.fog = false;
      sunSprite.position.set(140, 200, -220);
      this.sky.add(sunSprite);
    }

    // Luz: cielo y suelo del tema, y un sol con sombras que acompaña al kart propio.
    this.hemi = th.void
      ? new THREE.HemisphereLight(0x8a7aff, 0x281458, 1.15)
      : th.lava
        ? new THREE.HemisphereLight(0xffc8a8, 0x4a2a28, 1.25)
        : new THREE.HemisphereLight(hex(th.skyTop), hex(th.grass), 1.35);
    if (th.void) this.sun.color.set(0xe8e0ff);
    else if (th.lava) this.sun.color.set(0xffb070);
    sc.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0006;
    sc.add(this.sun, this.sun.target);

    // Terreno: rejilla con relieve, sombreado suave y el dibujo del circuito encima.
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
    const groundMap = th.void ? null : trackCanvas(track);
    const map = new THREE.CanvasTexture(groundMap ?? document.createElement("canvas"));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
    ground.receiveShadow = true;
    ground.visible = !th.void;
    sc.add(ground);
    const plain = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: hex(th.grass2), roughness: 1 }));
    plain.position.set(TEX * S / 2, t.min * S - 0.4, TEX * S / 2);
    plain.visible = !th.void;
    sc.add(plain);
    if (th.void) {
      this.space = buildSpace(track, t, S);
      sc.add(this.space.group, this.space.follow);
    }
    if (th.lava) this.buildLava(track, t);
    this.buildAmbient(th.name);

    this.buildDecos(track, t);

    // Montañas redondeadas y nubes esponjosas alrededor del mapa (sin niebla: se ven siempre).
    const rnd = new Rng(track.seed ^ 0xdec0);
    const cx = (TEX / 2) * S, cz = (TEX / 2) * S;
    const snowy = th.name === "Nieve";
    const mountains: Parameters<typeof mountainGeometry>[0] = [];
    const ringCount = th.void ? 0 : 1;
    for (const [ring, count, color] of [[150, 30, hex(th.hills)], [190, 26, hex(th.hillsFar)]] as const) {
      for (let i = 0; i < count * ringCount; i++) {
        const a = (i / count) * Math.PI * 2 + rnd.next() * 0.1;
        const r = ring + rnd.next() * 20;
        mountains.push({
          x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, w: 14 + rnd.next() * 20, h: 14 + rnd.next() * 34, color,
          snow: snowy || th.lava || rnd.next() < 0.35, cap: th.lava ? 0xff6a1a : undefined,
        });
      }
    }
    sc.add(new THREE.Mesh(mountainGeometry(mountains, t.min * S - 2), new THREE.MeshLambertMaterial({ vertexColors: true, fog: false })));
    const clouds: Parameters<typeof cloudGeometry>[0] = [];
    for (let i = 0; i < (th.void || th.lava ? 0 : 14); i++) {
      const a = rnd.next() * Math.PI * 2, r = 30 + rnd.next() * 130;
      clouds.push({ x: cx + Math.cos(a) * r, y: 48 + rnd.next() * 26, z: cz + Math.sin(a) * r, s: 3.5 + rnd.next() * 3 });
    }
    sc.add(new THREE.Mesh(cloudGeometry(clouds), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 })));

    this.buildFinishArch(track, t);
    this.buildRamps(track, t);
    this.buildPads(track, t);
    for (const tun of track.tunnels) {
      const built = buildTunnel(track, tun, (x, y) => heightAt(t, x, y), S);
      sc.add(built.group);
      this.tunnelLights.push(...built.lights);
    }
    this.buildCoins(track);
    this.buildHazards(track);

    // Cajas de objetos: cubos de colores que giran, con "?" en cada cara, y un halo.
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
    this.boxMat = new THREE.MeshStandardMaterial({ map: q, transparent: true, opacity: 0.92, roughness: 0.25, emissive: 0x222222 });
    for (let i = 0; i < track.boxes.length; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.boxMat);
      m.castShadow = true;
      m.add(glowSprite(0xffffff, 1.1, 0.35));
      this.boxes.push(m);
      sc.add(m);
    }

    // Objetos soltados en la pista: plátanos, caparazones, bombas TNT y explosiones.
    const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 });
    const pool = (count: number, geo: THREE.BufferGeometry, mat: THREE.Material = vcMat) =>
      Array.from({ length: count }, () => {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        m.visible = false;
        sc.add(m);
        return m;
      });
    this.bananas = pool(MAX_BANANAS, bananaGeometry());
    this.greens = pool(8, shellGeometry(false));
    this.reds = pool(8, shellGeometry(true));
    const tnt = new THREE.MeshStandardMaterial({ map: tntTexture(), roughness: 0.6 });
    this.bombs = pool(MAX_BOMBS, new THREE.BoxGeometry(0.4, 0.34, 0.4), tnt);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.6, depthWrite: false }));
      mesh.visible = false;
      const glow = glowSprite(0xffd060, 4, 0.9);
      glow.visible = false;
      sc.add(mesh, glow);
      this.blasts.push({ mesh, glow });
    }
    // Humo del derrape y polvo fuera de la pista: sprites que se hinchan y se desvanecen.
    for (let i = 0; i < 48; i++) {
      const sp = glowSprite(0xffffff, 1, 0, false);
      sp.visible = false;
      sc.add(sp);
      this.puffs.push({ sp, age: 1, life: 1, size: 1, vy: 0 });
    }
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.visible = false;
      this.sparks.push(m);
      sc.add(m);
    }
  }

  /** Decorados instanciados: un dibujo por tipo. */
  private buildDecos(track: Track, t: Terrain) {
    const rnd = new Rng(track.seed ^ 0xdec1);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const floaty = track.theme.void;
    const kinds = new Map<DecoKind, number[]>();
    track.decos.forEach((d, i) => kinds.set(d.kind, [...(kinds.get(d.kind) ?? []), i]));
    for (const [kind, list] of kinds) {
      const mesh = new THREE.InstancedMesh(decoGeometry(kind), kind === "crystal" ? glowMat : mat, list.length);
      mesh.castShadow = mesh.receiveShadow = true;
      list.forEach((di, slot) => {
        const d = track.decos[di];
        const k = d.size * 1.25;
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(...at(d.x, d.y, heightAt(t, d.x, d.y) + (floaty ? 4 + rnd.next() * 38 : 0))),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd.next() * Math.PI * 2, 0)),
          new THREE.Vector3(k, k, k),
        );
        mesh.setMatrixAt(slot, m);
        this.decos.push({ mesh, slot, m, x: d.x * S, z: d.y * S, r: DECO_RADIUS[kind] * k, hidden: false });
        if (kind === "torch") {
          const flame = glowSprite(0xff9a30, 2.6, 0.8);
          flame.position.set(...at(d.x, d.y, heightAt(t, d.x, d.y) + 2.1 * k * 20));
          this.scene.add(flame);
        }
      });
      this.scene.add(mesh);
    }
  }

  /** Arco de meta con cuadros, sobre la recta de salida. */
  private buildFinishArch(track: Track, t: Terrain) {
    const d0 = track.dir[0], nx = -Math.sin(d0), ny = Math.cos(d0);
    const span = TRACK_W / 2 + 14;
    const h0 = heightAt(t, track.px[0], track.py[0]);
    const post = new THREE.MeshStandardMaterial({ color: 0xe9ebf2, roughness: 0.35, metalness: 0.4 });
    const checker = canvasTexture(64, 16, (g) => {
      for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 4; j++) {
          g.fillStyle = (i + j) % 2 ? "#111" : "#fff";
          g.fillRect(i * 4, j * 4, 4, 4);
        }
      }
    });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.6, 14), post);
      p.position.set(...at(track.px[0] + nx * span * s, track.py[0] + ny * span * s, h0 + 26));
      p.castShadow = true;
      this.scene.add(p);
    }
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(span * 2 * S + 0.4, 0.6, 0.15),
      [post, post, post, post, new THREE.MeshStandardMaterial({ map: checker }), new THREE.MeshStandardMaterial({ map: checker })],
    );
    banner.position.set(...at(track.px[0], track.py[0], h0 + 50));
    banner.rotation.y = yawOf(d0);
    banner.castShadow = true;
    this.scene.add(banner);
  }

  private buildRamps(track: Track, t: Terrain) {
    const geo = rampGeometry(RAMP_W * S, RAMP_L * S, RAMP_H * S);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const r of track.ramps) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...at(track.px[r.i], track.py[r.i], heightAt(t, track.px[r.i], track.py[r.i]) - 1));
      m.rotation.y = yawOf(track.dir[r.i]);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      // Franjas de aviso en el lomo y banderines en el labio.
      for (let k = 0; k < 3; k++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(RAMP_W * S * 0.92, 0.012, 0.07), new THREE.MeshBasicMaterial({ color: 0x222228 }));
        const f = 0.2 + k * 0.28;
        stripe.position.set(0, RAMP_H * S * f + 0.012, -RAMP_L * S * f);
        stripe.rotation.x = Math.atan2(RAMP_H, RAMP_L);
        m.add(stripe);
      }
      for (const s of [-1, 1]) {
        const flag = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), new THREE.MeshBasicMaterial({ color: s > 0 ? 0xff3a5a : 0x3ad8ff }));
        flag.position.set(s * (RAMP_W * S * 0.5), RAMP_H * S + 0.15, -RAMP_L * S);
        m.add(flag);
      }
    }
  }

  private buildPads(track: Track, t: Terrain) {
    const arrows = padTexture();
    const size = PAD_R * 2 * S * 1.15;
    for (const p of track.pads) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 1.15).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x14143a, transparent: true, opacity: 0.7, depthWrite: false }));
      const mat = new THREE.MeshBasicMaterial({ map: arrows, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 1.15).rotateX(-Math.PI / 2), mat);
      this.padMats.push(mat);
      for (const [m, lift] of [[plate, 0.05], [glow, 0.08]] as const) {
        const a = track.dir[p.i];
        const fx = Math.cos(a), fy = Math.sin(a);
        const hF = heightAt(t, p.x + fx * 8, p.y + fy * 8), hB = heightAt(t, p.x - fx * 8, p.y - fy * 8);
        m.position.set(...at(p.x, p.y, heightAt(t, p.x, p.y) + lift * 20));
        m.rotation.set(Math.atan2(hF - hB, 16), yawOf(a), 0, "YXZ");
        this.scene.add(m);
      }
    }
  }

  private buildCoins(track: Track) {
    if (!track.coins.length) return;
    const mesh = new THREE.InstancedMesh(coinGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.6, emissive: 0x6a4a00 }), track.coins.length);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.coinMesh = mesh;
  }

  private rig(index: number): Rig {
    let r = this.rigs.get(index);
    if (!r) {
      const model = buildKart(hex(PLAYER_COLORS[index]));
      model.root.rotation.order = "YXZ";
      const star = glowSprite(0xffe070, 2.4, 0);
      star.position.y = 0.5;
      model.root.add(star);
      model.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      const cloud = buildCloud();
      cloud.visible = false;
      this.scene.add(cloud);
      r = { model, last: { x: 0, y: 0, a: 0, z: 0 }, wheel: 0, steer: 0, star, cloud };
      this.rigs.set(index, r);
      this.scene.add(model.root);
    }
    return r;
  }

  /** Coloca un kart: suelo, cuesta, rampa, salto, truco y ruedas. `steer` en -1..1. */
  private placeKart(
    index: number, x: number, y: number, a: number, z: number, o: {
      spin: boolean; steer?: number; trick?: number; star: boolean; shrink: boolean; turbo: boolean; hop?: number; bounce?: number;
      lakitu?: boolean;
    }, time: number, dt: number,
  ) {
    const rig = this.rig(index);
    const t = this.terrain;
    const m = rig.model;
    const fx = Math.cos(a), fy = Math.sin(a), rx = -fy, ry = fx;
    const hF = heightAt(t, x + fx * 8, y + fy * 8), hB = heightAt(t, x - fx * 8, y - fy * 8);
    const hR = heightAt(t, x + rx * 6, y + ry * 6), hL = heightAt(t, x - rx * 6, y - ry * 6);
    const ramp = rampLift(this.track, x, y);
    const moved = Math.hypot(x - rig.last.x, y - rig.last.y);
    const speed = dt > 0 ? Math.min(400, moved / dt) : 0;
    const vz = dt > 0 ? (z - rig.last.z) / dt : 0;
    let dyaw = a - rig.last.a;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    rig.last = { x, y, a, z };
    // Ruedas: giran con la velocidad; las de delante giran con el volante (o con el giro que se nota).
    rig.wheel += speed * dt * S / 0.17;
    m.spinners.forEach((w) => (w.rotation.x = -rig.wheel));
    const steer = o.steer ?? Math.max(-1, Math.min(1, (dyaw / Math.max(dt, 1e-3)) * 0.35));
    rig.steer += (steer - rig.steer) * 0.3;
    m.steer.forEach((p) => (p.rotation.y = -rig.steer * 0.45));
    const air = z > 0.5;
    const pitch = Math.atan2(hF - hB, 16) + ramp.slope + (air ? Math.max(-0.45, Math.min(0.45, vz * 0.004)) : 0);
    // Truco: media vuelta de campana por el eje largo del kart.
    const roll = Math.atan2(hR - hL, 12) + (o.trick ? o.trick * Math.PI * 2 : 0) - rig.steer * 0.05;
    m.root.position.set(...at(x, y, heightAt(t, x, y) + ramp.lift + z + (o.hop ?? 0) + (o.bounce ?? 0)));
    m.root.rotation.set(pitch, yawOf(a + rig.steer * 0.08) + (o.spin ? time * 14 : 0), roll, "YXZ");
    m.root.scale.setScalar(o.shrink ? 0.46 : 0.8);
    m.flames.visible = o.turbo;
    m.glider.visible = z > 14 && !o.lakitu;
    // Lakitu: la nube con carita sostiene al kart mientras lo devuelve a la pista.
    rig.cloud.visible = !!o.lakitu;
    if (o.lakitu) {
      rig.cloud.scale.setScalar(0.5);
      rig.cloud.position.set(m.root.position.x, m.root.position.y + 0.85, m.root.position.z + 0.2);
      rig.cloud.rotation.y = m.root.rotation.y;
      rig.cloud.position.y += Math.sin(this.lastTime * 6) * 0.04;
    }
    if (o.turbo) m.flames.children.forEach((c) => c.scale.set(1, 1, 0.8 + Math.random() * 0.7));
    // Estrella: el kart cambia de color y brilla.
    if (o.star) {
      m.bodyMat.emissive.setHSL((time * 1.4) % 1, 1, 0.5);
      m.bodyMat.emissiveIntensity = 0.7;
      rig.star.material.opacity = 0.55 + Math.sin(time * 14) * 0.2;
      rig.star.material.color.setHSL((time * 1.4 + 0.3) % 1, 1, 0.65);
    } else {
      m.bodyMat.emissiveIntensity = 0;
      rig.star.material.opacity = 0;
    }
    return m.root;
  }

  update(v: RaceView, time: number, cam: { a: number; pitch: number }) {
    const t = this.terrain;
    const me = v.me;
    const dt = this.lastTime ? Math.max(0.001, Math.min(0.1, time - this.lastTime)) : 0;
    this.lastTime = time;
    const hop = me.hop > 0 ? Math.sin((me.hop / HOP_TIME) * Math.PI) * HOP_HEIGHT : 0;
    const bounce = me.offroad && Math.abs(me.v) > 20 && me.z <= 0 ? Math.abs(Math.sin(time * 40)) * 0.8 : 0;
    const mine = this.placeKart(me.index, me.x, me.y, me.a, me.z, {
      spin: me.spin > 0, steer: me.steerVis, trick: me.trick ? Math.min(1, me.trickT / 0.55) : 0, star: me.star > 0,
      shrink: me.shrink > 0, turbo: me.turbo > 0, hop, bounce, lakitu: me.drop > 0,
    }, time, dt);
    const alive = new Set([me.index]);
    for (const k of v.others) {
      alive.add(k.index);
      this.placeKart(k.index, k.x, k.y, k.a, k.z, {
        spin: k.spin > 0, star: (k.fx & 1) !== 0, shrink: (k.fx & 2) !== 0, turbo: (k.fx & 4) !== 0,
        trick: (k.fx & 8) !== 0 ? (time * 1.8) % 1 : 0, lakitu: (k.fx & 16) !== 0,
      }, time, dt);
    }

    // Chispas del derrape: blancas, luego azules (miniturbo) y naranjas (miniturbo largo).
    const sparkColor = me.driftTime > MINI_TURBO_2 ? 0xff9628 : me.driftTime > MINI_TURBO_1 ? 0x50aaff : 0xfffad2;
    const rear = new THREE.Vector3();
    this.sparks.forEach((s, i) => {
      s.visible = !!me.drift && me.spin <= 0 && me.z <= 0;
      if (!s.visible) return;
      (s.material as THREE.MeshBasicMaterial).color.setHex(sparkColor);
      rear.set((i % 2 ? 0.42 : -0.42) + (Math.random() - 0.5) * 0.15, 0.05 + Math.random() * 0.15, 0.5 + Math.random() * 0.2);
      s.position.copy(mine.localToWorld(rear));
      s.scale.setScalar(me.driftTime > MINI_TURBO_1 ? 1.8 : 1);
    });

    // Humo blanco al derrapar y polvo del color del suelo al salirse de la pista.
    if (me.z <= 0 && !me.fall && Math.abs(me.v) > 40 && (me.drift || me.offroad)) {
      const side = this.puffNext++ % 2 ? 0.42 : -0.42;
      const p = mine.localToWorld(new THREE.Vector3(side, 0.1, 0.55));
      if (me.drift) this.puff(p, 0xe8e8f0, 0.55, 0.55, 0.25);
      else this.puff(p, hex(this.track.theme.sand), 0.7, 0.7, 0.35);
    }
    for (const q of this.puffs) {
      if (q.age >= q.life) continue;
      q.age += dt;
      const k = Math.min(1, q.age / q.life);
      q.sp.visible = k < 1;
      q.sp.material.opacity = 0.5 * (1 - k);
      q.sp.scale.setScalar(q.size * (1 + k * 1.8));
      q.sp.position.y += q.vy * dt;
    }

    // Cajas, plátanos, caparazones, bombas y explosiones.
    this.boxMat.color.setHSL((time * 0.35) % 1, 0.85, 0.6);
    v.boxes.forEach((b, i) => {
      const m = this.boxes[i];
      if (!m) return;
      m.visible = b.active;
      m.position.set(...at(b.x, b.y, heightAt(t, b.x, b.y) + 9 + Math.sin(time * 3 + i) * 1.5));
      m.rotation.set(time * 0.8, time * 1.3 + i, 0);
    });
    const place = (meshes: THREE.Mesh[], list: { x: number; y: number }[], spin: (i: number) => number, lift = 0) =>
      meshes.forEach((m, i) => {
        const it = list[i];
        m.visible = !!it;
        if (!it) return;
        m.position.set(...at(it.x, it.y, heightAt(t, it.x, it.y) + lift));
        m.rotation.y = spin(i);
      });
    place(this.bananas, v.bananas, (i) => 0.7 * (i + 1));
    place(this.greens, v.shells.filter((s) => !s.red), () => time * 10, 1);
    place(this.reds, v.shells.filter((s) => s.red), () => time * 10, 1);
    place(this.bombs, v.bombs, () => 0, 3);
    this.bombs.forEach((m, i) => {
      const b = v.bombs[i];
      if (!b) return;
      // La mecha corta parpadea en blanco.
      const flash = b.t < BOMB_FUSE * 0.5 && Math.sin(time * (b.t < 1 ? 28 : 14)) > 0;
      (m.material as THREE.MeshStandardMaterial).emissive.setHex(flash ? 0xffffff : 0x000000);
      m.scale.setScalar(1 + (flash ? 0.12 : 0));
    });
    this.blasts.forEach((b, i) => {
      const bl = v.blasts[i];
      b.mesh.visible = b.glow.visible = !!bl;
      if (!bl) return;
      const k = Math.min(1, bl.age / BLAST_TIME);
      const r = BOMB_RADIUS * S * (0.5 + k * 0.9);
      const p = at(bl.x, bl.y, heightAt(t, bl.x, bl.y) + 8);
      b.mesh.position.set(...p);
      b.mesh.scale.setScalar(r);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.65 * (1 - k);
      b.glow.position.set(...p);
      b.glow.scale.setScalar(r * 3.2);
      b.glow.material.opacity = 0.9 * (1 - k);
    });

    this.updateHazards(v.time, time);
    if (this.space) this.space.update(time);
    if (this.lavaTex) {
      this.lavaTex.offset.set(time * 0.012, time * 0.008);
      this.lava!.position.y += Math.sin(time * 1.3) * 0.0008;
    }
    // Monedas (las de cada jugador) y placas de turbo.
    if (this.coinMesh) {
      const cm = this.coinMesh;
      this.track.coins.forEach((c, i) => {
        const o = this.tmp;
        if (me.taken[i]) {
          o.scale.setScalar(0);
        } else {
          o.scale.setScalar(1);
          o.position.set(...at(c.x, c.y, heightAt(t, c.x, c.y) + 10 + Math.sin(time * 3 + i) * 1.2));
          o.rotation.set(0, time * 3 + i, 0);
        }
        o.updateMatrix();
        cm.setMatrixAt(i, o.matrix);
      });
      cm.instanceMatrix.needsUpdate = true;
    }
    this.padMats.forEach((m, i) => (m.opacity = 0.7 + 0.3 * Math.sin(time * 9 + i)));

    // Cámara detrás del kart, a la altura del relieve, mirando un poco por delante.
    const ca = Math.cos(cam.a), sa = Math.sin(cam.a);
    const cx = me.x - ca * CAM_DIST, cy = me.y - sa * CAM_DIST;
    this.camera.position.set(...at(cx, cy, this.camHeight(v, cam.a)));
    this.camera.rotation.set(cam.pitch, yawOf(cam.a), 0, "YXZ");
    this.sky.position.copy(this.camera.position);
    if (this.space) this.space.follow.position.copy(this.camera.position);
    this.updateParticles(dt, time);
    // Campo de visión más abierto con turbo o estrella: sensación de velocidad.
    const wantFov = FOV + (me.turbo > 0 || me.star > 0 ? 9 : 0);
    if (Math.abs(this.fov - wantFov) > 0.05) {
      this.fov += (wantFov - this.fov) * 0.1;
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    // Lo que se interpone entre la cámara y el kart propio no se dibuja (decorados al salirse de la pista).
    const [ax, , az] = at(cx, cy, 0);
    const [bx, , bz] = at(cx + (me.x - cx) * 0.85, cy + (me.y - cy) * 0.85, 0);
    const touched = new Set<THREE.InstancedMesh>();
    for (const d of this.decos) {
      const hide = distToSegment(d.x, d.z, ax, az, bx, bz) < d.r;
      if (hide === d.hidden) continue;
      d.hidden = hide;
      d.mesh.setMatrixAt(d.slot, hide ? ZERO : d.m);
      touched.add(d.mesh);
    }
    touched.forEach((m) => (m.instanceMatrix.needsUpdate = true));
    // Dentro del túnel la luz del día se apaga: solo quedan las lámparas de colores.
    const inside = inTunnel(this.track, me.seg) ? 1 : 0;
    this.dark += (inside - this.dark) * Math.min(1, dt * 5);
    this.hemi.intensity = 1.35 * (1 - 0.72 * this.dark);
    this.sun.intensity = 1.9 * (1 - 0.88 * this.dark);
    this.fog.color.copy(this.fogColor).lerp(new THREE.Color(SKY_DARK), this.dark);
    this.fog.far = this.fogFar * (1 - this.dark) + 16 * this.dark;
    // El sol acompaña al kart para que las sombras de cerca tengan detalle.
    this.sun.target.position.copy(mine.position);
    this.sun.position.set(mine.position.x + 14, mine.position.y + 30, mine.position.z + 9);
  }

  private puff(at3: THREE.Vector3, color: number, size: number, life: number, vy: number) {
    const q = this.puffs.find((p) => p.age >= p.life) ?? this.puffs[0];
    q.age = 0;
    q.life = life;
    q.size = size;
    q.vy = vy;
    q.sp.position.copy(at3);
    q.sp.material.color.setHex(color);
    q.sp.visible = true;
  }

  /** Lava de los valles del volcán: un plano brillante y animado a poca altura. */
  private buildLava(track: Track, t: Terrain) {
    const rng = new Rng(4242);
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#c83a10";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = ["#ff7a20", "#ffb030", "#8a1c08", "#ffd860"][i % 4];
      g.globalAlpha = 0.55;
      g.beginPath();
      g.arc(rng.next() * 128, rng.next() * 128, 4 + rng.next() * 14, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(26, 26);
    // Siempre por debajo de la pista más baja: la lava rodea los valles pero nunca inunda el asfalto.
    let roadMin = Infinity;
    for (let i = 0; i < track.n; i += 3) roadMin = Math.min(roadMin, heightAt(t, track.px[i], track.py[i]));
    const level = (roadMin - 7) * S;
    this.lava = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    this.lava.position.set(TEX * S / 2, level, TEX * S / 2);
    this.scene.add(this.lava);
    this.lavaTex = tex;
  }

  /** Brasas (volcán) o copos de nieve que flotan alrededor de la cámara. */
  private buildAmbient(theme: string) {
    const kind = theme === "Volcán" ? "ember" : theme === "Nieve" ? "snow" : null;
    if (!kind) return;
    const N = 260;
    const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    const rng = new Rng(99);
    for (let i = 0; i < N; i++) {
      pos.set([(rng.next() - 0.5) * 24, rng.next() * 10, (rng.next() - 0.5) * 24], i * 3);
      vel.set([(rng.next() - 0.5) * 0.4, kind === "ember" ? 0.5 + rng.next() * 1.1 : -(0.5 + rng.next() * 0.9), (rng.next() - 0.5) * 0.4], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: kind === "ember" ? 3 : 2.4, sizeAttenuation: false, color: kind === "ember" ? 0xff9a40 : 0xffffff, transparent: true,
      opacity: 0.9, depthWrite: false, fog: false, blending: kind === "ember" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.particles = { pts, vel, kind };
  }

  private updateParticles(dt: number, time: number) {
    const p = this.particles;
    if (!p) return;
    const pos = p.pts.geometry.attributes.position as THREE.BufferAttribute;
    const cam = this.camera.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) + p.vel[i * 3] * dt + Math.sin(time + i) * 0.004;
      let y = pos.getY(i) + p.vel[i * 3 + 1] * dt;
      let z = pos.getZ(i) + p.vel[i * 3 + 2] * dt;
      // Se reciclan dentro de una caja alrededor de la cámara.
      if (Math.abs(x - cam.x) > 12) x = cam.x + (x > cam.x ? -12 : 12);
      if (Math.abs(z - cam.z) > 12) z = cam.z + (z > cam.z ? -12 : 12);
      if (y > cam.y + 8) y = cam.y - 4;
      if (y < cam.y - 5) y = cam.y + 7;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  /** Chomps, thwomps y meteoros del circuito. */
  private buildHazards(track: Track) {
    for (const h of track.hazards) {
      const obj = h.kind === "thwomp" ? buildThwomp() : h.kind === "chomp" ? buildChomp() : buildMeteor();
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.scene.add(obj);
      let shadow: THREE.Mesh | null = null;
      const chain: THREE.Mesh[] = [];
      if (h.kind === "thwomp") {
        shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
        this.scene.add(shadow);
      } else if (h.kind === "chomp") {
        const link = new THREE.MeshStandardMaterial({ color: 0x9a9aa6, roughness: 0.3, metalness: 0.8 });
        for (let k = 0; k < 9; k++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), link);
          this.scene.add(m);
          chain.push(m);
        }
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 10), link);
        stake.position.set(...at(track.px[h.i], track.py[h.i], heightAt(this.terrain, track.px[h.i], track.py[h.i]) + 2));
        this.scene.add(stake);
      }
      this.hazards.push({ obj, shadow, chain, kind: h.kind });
    }
  }

  private updateHazards(raceTime: number, time: number) {
    const t = this.terrain;
    this.track.hazards.forEach((h, i) => {
      const rig = this.hazards[i];
      if (!rig) return;
      const st = hazardAt(this.track, h, raceTime);
      const ground = heightAt(t, st.x, st.y);
      rig.obj.rotation.y = yawOf(st.face);
      if (h.kind === "thwomp") {
        rig.obj.position.set(...at(st.x, st.y, ground + st.z + 14));
        if (rig.shadow) {
          rig.shadow.position.set(...at(st.x, st.y, ground + 0.8));
          rig.shadow.rotation.y = yawOf(this.track.dir[h.i]);
          (rig.shadow.material as THREE.MeshBasicMaterial).opacity = 0.15 + st.drop * 0.35;
        }
      } else {
        const bob = Math.abs(Math.sin(time * 6 + h.phase)) * (h.kind === "chomp" ? 1.4 : 3);
        rig.obj.position.set(...at(st.x, st.y, ground + st.z + 4 + bob));
        if (h.kind === "meteor") rig.obj.rotation.z = time * 3;
        // Cadena: de la estaca del suelo hasta el chomp, con un poco de combado.
        rig.chain.forEach((m, k) => {
          const f = (k + 1) / (rig.chain.length + 1);
          const sag = Math.sin(f * Math.PI) * 3;
          m.position.set(...at(
            st.anchor.x + (st.x - st.anchor.x) * f, st.anchor.y + (st.y - st.anchor.y) * f,
            ground * (1 - f) + (ground + st.z + 4 + bob) * f - sag + 2,
          ));
        });
      }
    });
  }

  /** Altura de la cámara (unidades): sobre el suelo del kart, algo más alta en los saltos. */
  private camHeight(v: RaceView, camA: number): number {
    const me = v.me;
    const ca = Math.cos(camA), sa = Math.sin(camA);
    const cx = me.x - ca * CAM_DIST, cy = me.y - sa * CAM_DIST;
    const hK = heightAt(this.terrain, me.x, me.y) + rampLift(this.track, me.x, me.y).lift * 0.6;
    return Math.max(hK + CAM_HEIGHT + Math.max(0, me.z) * 0.55, heightAt(this.terrain, cx, cy) + 8);
  }

  /** Inclinación de la cámara: mira a un punto por delante del kart, siguiendo las cuestas. */
  lookPitch(v: RaceView, camA: number): number {
    const me = v.me;
    const ca = Math.cos(camA), sa = Math.sin(camA);
    const hT = heightAt(this.terrain, me.x + ca * CAM_LOOK, me.y + sa * CAM_LOOK);
    return Math.atan2(hT + 4 + Math.max(0, me.z) * 0.3 - this.camHeight(v, camA), CAM_DIST + CAM_LOOK);
  }

  groundAt(x: number, y: number): number {
    return heightAt(this.terrain, x, y);
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

