// Efectos visuales: trazadoras, chispas y polvo de los impactos (con su agujero de bala), sangre que salpica y deja
// charcos, humo de la boca del cañón, casquillos con física, trozos de cabeza, brasas de los barriles. Las
// partículas son una nube en la GPU (`particles.ts`) y las manchas, mallas instanciadas (`DecalPool`): el coste no
// crece con la cantidad de sangre.
import * as THREE from "three";
import { raycastWorld, type Collider } from "../core/collision";
import { DecalPool } from "../world/decals";
import { Particles } from "./particles";

const TRACERS = 24;
const DEBRIS = 72;
const UP = new THREE.Vector3(0, 1, 0);

interface Chunk {
  life: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  sx: number;
  sy: number;
  sz: number;
  bounces: number;
}

export class Effects {
  readonly particles: Particles;
  readonly decals: DecalPool;
  private readonly tracers: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  private readonly debris: THREE.InstancedMesh;
  private readonly chunks: Chunk[] = [];
  private chunkCursor = 0;
  private readonly group = new THREE.Group();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private groundBudget = 0;
  private readonly tmpN = new THREE.Vector3();
  private colliders: readonly Collider[] = [];
  private wallBudget = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.particles = new Particles(this.group);
    this.decals = new DecalPool(this.group);

    const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffdca8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(tracerGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.tracers.push({ mesh, life: 0, max: 0.07 });
    }

    // Casquillos y trozos: una sola malla instanciada con color por instancia.
    this.debris = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.6 }),
      DEBRIS,
    );
    this.debris.frustumCulled = false;
    this.debris.castShadow = false;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < DEBRIS; i++) {
      this.debris.setMatrixAt(i, this.m);
      this.debris.setColorAt(i, this.c.setHex(0xb8903c));
      this.chunks.push({ life: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, sx: 1, sy: 1, sz: 1, bounces: 0 });
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.group.add(this.debris);
  }

  /** Tamaño del buffer y campo de visión de la cámara (para el tamaño de las partículas). */
  setView(pixelH: number, fov: number): void {
    this.particles.setView(pixelH, fov);
  }

  /** Trazadora de A a B (dura un instante). */
  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffdca8, thickness = 0.022): void {
    const slot = this.tracers.find((t) => t.life <= 0);
    if (!slot) return;
    const dist = from.distanceTo(to);
    if (dist < 0.2) return;
    slot.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    slot.mesh.scale.set(thickness, thickness, dist);
    slot.mesh.lookAt(to);
    (slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (slot.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
    slot.mesh.visible = true;
    slot.life = slot.max;
  }

  /** Escenario contra el que la sangre salpica las paredes. */
  setWorld(colliders: readonly Collider[]): void {
    this.colliders = colliders;
  }

  /** Chispas o salpicadura genérica: `n` partículas desde un punto (color 0xRRGGBB). */
  burst(at: THREE.Vector3, n = 6, color = 0xffaa55, spread = 2.2): void {
    this.c.setHex(color);
    for (let i = 0; i < n; i++) {
      this.particles.add.emit({
        x: at.x, y: at.y, z: at.z,
        vx: (Math.random() - 0.5) * spread, vy: Math.random() * spread, vz: (Math.random() - 0.5) * spread,
        life: 0.25 + Math.random() * 0.3, s0: 0.05, s1: 0.015, r: this.c.r, g: this.c.g, b: this.c.b, gravity: 9, drag: 1,
      });
    }
  }

  /** Impacto en una superficie (pared, suelo, puerta): chispas, polvo, esquirlas y agujero de bala. */
  impact(at: THREE.Vector3, normal: THREE.Vector3, metal = false): void {
    const n = this.tmpN.copy(normal);
    this.decals.hole(at, n);
    const sparks = metal ? 9 : 5;
    for (let i = 0; i < sparks; i++) {
      const sp = 2 + Math.random() * 4;
      this.particles.add.emit({
        x: at.x, y: at.y, z: at.z,
        vx: n.x * sp + (Math.random() - 0.5) * 3, vy: n.y * sp + Math.random() * 2, vz: n.z * sp + (Math.random() - 0.5) * 3,
        life: 0.2 + Math.random() * 0.3, s0: 0.05, s1: 0.012, r: 1, g: 0.72, b: 0.32, gravity: 9, drag: 0.8,
      });
    }
    // Polvo del revoque.
    for (let i = 0; i < 4; i++) {
      this.particles.mix.emit({
        x: at.x, y: at.y, z: at.z,
        vx: n.x * 0.9 + (Math.random() - 0.5) * 0.8, vy: n.y * 0.9 + Math.random() * 0.7, vz: n.z * 0.9 + (Math.random() - 0.5) * 0.8,
        life: 0.5 + Math.random() * 0.4, s0: 0.08, s1: 0.34, r: 0.62, g: 0.6, b: 0.55, a: 0.32, drag: 2.2, gravity: -0.2,
      });
    }
    // Una esquirla.
    if (Math.random() < 0.6) this.chunk(at, n, 0x8a8478, 0.02, 0.02, 0.02, 2.5, 3);
  }

  /** Sangre al dar a un zombi: chorro rojo vivo en la dirección del tiro, bruma, manchas en el suelo y en la pared de detrás. */
  blood(at: THREE.Vector3, dir: THREE.Vector3, amount = 9, head = false): void {
    const n = Math.round(amount * (head ? 2 : 1.4));
    for (let i = 0; i < n; i++) {
      const sp = 1.6 + Math.random() * 4.6;
      this.particles.mix.emit({
        x: at.x, y: at.y, z: at.z,
        vx: dir.x * sp + (Math.random() - 0.5) * 2.4, vy: dir.y * sp + Math.random() * 2, vz: dir.z * sp + (Math.random() - 0.5) * 2.4,
        life: 0.6 + Math.random() * 0.8, s0: 0.06 + Math.random() * 0.07, s1: 0.045, r: 0.85 + Math.random() * 0.15, g: 0.03, b: 0.04, a: 1, gravity: 9.5, drag: 0.45, ground: true,
      });
    }
    // Bruma roja que se queda un instante en el aire.
    for (let i = 0; i < (head ? 7 : 4); i++) {
      this.particles.mix.emit({
        x: at.x, y: at.y, z: at.z,
        vx: dir.x * 1.2 + (Math.random() - 0.5) * 0.9, vy: 0.4 + Math.random() * 0.7, vz: dir.z * 1.2 + (Math.random() - 0.5) * 0.9,
        life: 0.4 + Math.random() * 0.3, s0: 0.16, s1: 0.6, r: 0.8, g: 0.03, b: 0.04, a: 0.55, drag: 3, gravity: 0.4,
      });
    }
    // Mancha en el suelo bajo el impacto y, si hay pared detrás, salpicadura en ella.
    if (Math.random() < (head ? 1 : 0.6)) this.decals.splat(this.v.set(at.x + dir.x * 0.5, 0.02, at.z + dir.z * 0.5), UP, 0.35 + Math.random() * 0.6, 1);
    if (this.wallBudget > 0 && this.colliders.length && (head || Math.random() < 0.45)) {
      const hit = raycastWorld(at, this.tmpN.set(dir.x, dir.y * 0.4, dir.z).normalize(), 4.5, this.colliders, (c) => c.tag === "wall" || c.tag === "prop" || c.tag === "door");
      if (hit) {
        this.wallBudget--;
        this.decals.splat(this.v.set(hit.point.x, hit.point.y, hit.point.z), this.tmpN.set(hit.normal.x, hit.normal.y, hit.normal.z), (head ? 0.9 : 0.55) + Math.random() * 0.6, 1);
      }
    }
  }

  /** Charco bajo un zombi caído y salpicaduras alrededor. */
  corpseBlood(x: number, z: number): void {
    this.decals.splat(this.v.set(x, 0.02, z), UP, 2.2 + Math.random() * 1.2, 1);
    for (let i = 0; i < 5; i++) this.decals.splat(this.v.set(x + (Math.random() - 0.5) * 2.2, 0.02, z + (Math.random() - 0.5) * 2.2), UP, 0.5 + Math.random() * 0.7, 0.95);
  }

  /** Cabeza reventada: trozos que vuelan, una nube roja y varias manchas. */
  gibs(at: THREE.Vector3, dir: THREE.Vector3): void {
    for (let i = 0; i < 7; i++) {
      this.v.set(dir.x + (Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.2, dir.z + (Math.random() - 0.5) * 1.6);
      const dark = Math.random() < 0.5;
      this.chunk(at, this.v, dark ? 0x5a0f12 : 0xb09a86, 0.05 + Math.random() * 0.05, 0.04 + Math.random() * 0.04, 0.05 + Math.random() * 0.05, 2 + Math.random() * 3, 9);
    }
    this.blood(at, dir, 14, true);
  }

  /** Humo de la boca del cañón (vuelve a salir tras el fogonazo). */
  muzzleSmoke(at: THREE.Vector3, dir: THREE.Vector3, n = 3): void {
    for (let i = 0; i < n; i++) {
      this.particles.mix.emit({
        x: at.x, y: at.y, z: at.z,
        vx: dir.x * 0.6 + (Math.random() - 0.5) * 0.3, vy: 0.35 + Math.random() * 0.3, vz: dir.z * 0.6 + (Math.random() - 0.5) * 0.3,
        life: 0.7 + Math.random() * 0.5, s0: 0.05, s1: 0.26, r: 0.7, g: 0.7, b: 0.72, a: 0.22, drag: 1.4, gravity: -0.12,
      });
    }
  }

  /** Casquillo que sale expulsado hacia `right` (lado derecho del tirador). */
  casing(at: THREE.Vector3, right: THREE.Vector3, shell = false): void {
    this.v.set(right.x * (1.2 + Math.random() * 0.8), 1.1 + Math.random() * 0.8, right.z * (1.2 + Math.random() * 0.8));
    if (shell) this.chunk(at, this.v, 0xb02820, 0.02, 0.02, 0.06, 1, 6);
    else this.chunk(at, this.v, 0xc99a3c, 0.012, 0.012, 0.04, 1, 6);
  }

  /** Brasa que sube de un barril en llamas. */
  ember(x: number, y: number, z: number): void {
    this.particles.add.emit({
      x, y, z,
      vx: (Math.random() - 0.5) * 0.6, vy: 0.9 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.6,
      life: 1.4 + Math.random() * 1.6, s0: 0.035, s1: 0.01, r: 1, g: 0.45 + Math.random() * 0.2, b: 0.12, a: 0.95, drag: 0.4, gravity: -0.2,
    });
  }

  smoke(x: number, y: number, z: number): void {
    this.particles.mix.emit({
      x, y, z,
      vx: 0.25 + (Math.random() - 0.5) * 0.3, vy: 0.9 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.3,
      life: 2.2 + Math.random() * 1.4, s0: 0.25, s1: 1.4, r: 0.16, g: 0.16, b: 0.17, a: 0.3, drag: 0.5, gravity: -0.05,
    });
  }

  private chunk(at: THREE.Vector3, vel: THREE.Vector3, color: number, sx: number, sy: number, sz: number, speed: number, life: number): void {
    const i = this.chunkCursor;
    this.chunkCursor = (this.chunkCursor + 1) % DEBRIS;
    const c = this.chunks[i];
    c.life = life;
    c.px = at.x; c.py = at.y; c.pz = at.z;
    c.vx = vel.x * speed;
    c.vy = vel.y * speed;
    c.vz = vel.z * speed;
    c.rx = Math.random() * 6; c.ry = Math.random() * 6; c.rz = Math.random() * 6;
    c.wx = (Math.random() - 0.5) * 24; c.wy = (Math.random() - 0.5) * 24; c.wz = (Math.random() - 0.5) * 24;
    c.sx = sx; c.sy = sy; c.sz = sz;
    c.bounces = 0;
    this.debris.setColorAt(i, this.c.setHex(color));
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t.life / t.max) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    this.groundBudget = 4;
    this.wallBudget = 2;
    this.particles.update(dt, (x, z) => {
      if (this.groundBudget <= 0 || Math.random() > 0.5) return;
      this.groundBudget--;
      this.decals.splat(this.v.set(x, 0.02, z), UP, 0.28 + Math.random() * 0.6, 1);
    });

    // Casquillos y trozos: caen, rebotan y se quedan quietos.
    let dirty = false;
    for (let i = 0; i < DEBRIS; i++) {
      const c = this.chunks[i];
      if (c.life <= 0) continue;
      dirty = true;
      c.life -= dt;
      if (c.life <= 0) {
        this.m.makeScale(0, 0, 0);
        this.debris.setMatrixAt(i, this.m);
        continue;
      }
      const moving = Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.vz) > 0.15 || c.py > 0.03;
      if (moving) {
        c.vy -= 9.5 * dt;
        c.px += c.vx * dt;
        c.py += c.vy * dt;
        c.pz += c.vz * dt;
        c.rx += c.wx * dt;
        c.ry += c.wy * dt;
        c.rz += c.wz * dt;
        const floor = Math.max(c.sx, c.sy, c.sz) * 0.5;
        if (c.py < floor) {
          c.py = floor;
          c.vy = -c.vy * 0.35;
          c.vx *= 0.55;
          c.vz *= 0.55;
          c.wx *= 0.4;
          c.wy *= 0.4;
          c.wz *= 0.4;
          if (++c.bounces > 3) {
            c.vx = c.vy = c.vz = 0;
            c.wx = c.wy = c.wz = 0;
          }
        }
      }
      this.e.set(c.rx, c.ry, c.rz);
      this.q.setFromEuler(this.e);
      this.s.set(c.sx, c.sy, c.sz);
      this.m.compose(this.v.set(c.px, c.py, c.pz), this.q, this.s);
      this.debris.setMatrixAt(i, this.m);
    }
    if (dirty) this.debris.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.particles.clear();
    this.decals.clear();
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < DEBRIS; i++) {
      this.chunks[i].life = 0;
      this.debris.setMatrixAt(i, this.m);
    }
    this.debris.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.particles.dispose();
    this.decals.dispose();
    this.debris.geometry.dispose();
    (this.debris.material as THREE.Material).dispose();
    this.debris.dispose();
    for (const t of this.tracers) (t.mesh.material as THREE.Material).dispose();
    this.tracers[0]?.mesh.geometry.dispose();
    this.group.removeFromParent();
  }
}
