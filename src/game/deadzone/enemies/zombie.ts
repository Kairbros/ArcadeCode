// Un zombi: modelo procedural animado, rutas con la rejilla de navegación, ataque con aviso y
// muerte. La IA no persigue en línea recta: pide una ruta y la sigue por nodos.
import * as THREE from "three";
import { groundHeightAt, hasLineOfSight, resolveCircle, type Collider } from "../core/collision";
import { clamp, damp, dist2D } from "../core/math";
import type { Vec3 } from "../core/math";
import type { NavGrid } from "../world/nav";
import { scaledDamage, scaledHp, scaledSpeed, ZOMBIES, type ZombieDef, type ZombieKind } from "./defs";
import { modelFor, ZOMBIE_VARIANTS, zombieRig } from "./model";

export type ZombieState = "spawning" | "chasing" | "attacking" | "hurt" | "dying" | "dead";

/** Un jugador al que puede perseguir (pies del jugador y si sigue en pie). */
export interface ZombieTarget {
  pos: THREE.Vector3;
  alive: boolean;
}

export interface ZombieContext {
  players: ZombieTarget[];
  colliders: readonly Collider[];
  nav: NavGrid;
  neighbors: Zombie[];
  /** Puntos a los que ir cuando no hay ruta (los huecos de las ventanas). */
  objectives: { x: number; z: number }[];
}

let zombieSeq = 0;

let houndEyeShared: THREE.MeshBasicMaterial | null = null;
/** Ojos de los perros infernales: naranja incandescente. */
function cachedHoundEyeMat(): THREE.MeshBasicMaterial {
  if (!houndEyeShared) {
    houndEyeShared = new THREE.MeshBasicMaterial({ toneMapped: false });
    houndEyeShared.color.setRGB(3.2, 0.8, 0.12);
  }
  return houndEyeShared;
}

let eyeMatShared: THREE.MeshBasicMaterial | null = null;
/** Ojos rojos incandescentes: un material para todos (el bloom los hace brillar). */
function cachedEyeMat(): THREE.MeshBasicMaterial {
  if (!eyeMatShared) eyeMatShared = new THREE.MeshBasicMaterial({ color: 0xeef27a });
  return eyeMatShared;
}

export class Zombie {
  /** Identificador de red: en el anfitrión sale de aquí; en los invitados lo pone el estado recibido. */
  id = ++zombieSeq;
  readonly def: ZombieDef;
  readonly position = new THREE.Vector3();
  readonly group = new THREE.Group();
  yaw = 0;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  state: ZombieState = "spawning";
  /** Tiempo en el estado actual. */
  stateT = 0;
  private repathT = 0;
  private path: Vec3[] = [];
  private pathIdx = 0;
  private swing = 0;
  private attackCd = 0;
  private hurtFlash = 0;
  private growlT = 2 + Math.random() * 6;
  /** Tiempo restante del aturdimiento (golpe de culata, por ejemplo). */
  stunT = 0;
  private limbs: { lArm: THREE.Object3D; rArm: THREE.Object3D; lLeg: THREE.Object3D; rLeg: THREE.Object3D; head: THREE.Object3D };
  /** Aspecto (ropa, pelo, heridas) y materiales propios para poder parpadear en rojo y desvanecerse. */
  readonly variant = Math.floor(Math.random() * ZOMBIE_VARIANTS);
  private bodyMat!: THREE.MeshStandardMaterial;
  private eyes!: THREE.Mesh;
  private stump!: THREE.Mesh;
  /** Sacudida al recibir un impacto (s) y sentido en que cae al morir. */
  private stagger = 0;
  private fallDir = 1;
  /** Cabeza reventada por un disparo. */
  headless = false;
  /** Aviso al empezar a morir (sangre en el suelo): lo pone el gestor. */
  onDie?: (z: Zombie) => void;
  private diedAnnounced = false;
  /** Hundimiento al desvanecerse el cadáver. */
  private sink = 0;
  /** Jugador al que persigue ahora (índice en `ctx.players`) y a quién golpea el ataque en curso. */
  target = -1;
  strikeTarget = -1;
  /** Última posición (para animar al recibirla por red). */
  private lastX = 0;
  private lastZ = 0;
  private puppeted = false;
  onGrowl?: (z: Zombie) => void;

  constructor(kind: ZombieKind, round: number, x: number, z: number) {
    this.def = ZOMBIES[kind];
    this.hp = scaledHp(kind, round);
    this.maxHp = this.hp;
    this.speed = scaledSpeed(kind, round);
    this.damage = scaledDamage(kind, round);
    this.position.set(x, 0, z);
    this.build();
    // Aparece agachado y se incorpora.
    this.limbs = this.buildLimbRefs();
    this.state = "spawning";
    this.stateT = 0;
  }

  private buildLimbRefs(): Zombie["limbs"] {
    const find = (name: string): THREE.Object3D =>
      this.group.getObjectByName(name) ?? new THREE.Object3D();
    return {
      lArm: find("lArm"),
      rArm: find("rArm"),
      lLeg: find("lLeg"),
      rLeg: find("rLeg"),
      head: find("head"),
    };
  }

  /** Cuerpo de cajas fusionadas (una malla por miembro) con el aspecto que toca; ver `model.ts`. */
  private build(): void {
    const d = this.def;
    this.group.rotation.order = "YXZ";
    const rig = zombieRig(d.kind, this.variant);
    const M = modelFor(d.kind);
    const hound = d.kind === "hound";
    const s = d.height / M.height;
    this.bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
    const eyeMat = hound ? cachedHoundEyeMat() : cachedEyeMat();
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material = this.bodyMat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      return m;
    };
    const torso = mesh(rig.torso);
    torso.name = "torso";
    this.group.add(torso);

    const head = new THREE.Group();
    head.name = "head";
    head.position.set(0, M.headY, -M.headF);
    head.add(mesh(rig.head));
    this.eyes = mesh(rig.eyes, eyeMat);
    this.eyes.castShadow = false;
    head.add(this.eyes);
    this.group.add(head);
    this.stump = mesh(rig.stump);
    this.stump.position.set(0, hound ? M.headY : M.neckY + 0.06, -M.headF);
    this.stump.visible = false;
    this.group.add(this.stump);

    const limb = (name: string, x: number, y: number, geo: THREE.BufferGeometry): void => {
      const pivot = new THREE.Group();
      pivot.name = name;
      pivot.position.set(x, y, 0);
      pivot.add(mesh(geo));
      this.group.add(pivot);
    };
    const armX = d.kind === "brute" ? 0.52 : d.kind === "runner" ? 0.34 : 0.4;
    const legX = d.kind === "brute" ? 0.22 : d.kind === "runner" ? 0.13 : 0.17;
    const pivot = (name: string, x: number, y: number, z: number, geo: THREE.BufferGeometry): void => {
      const p = new THREE.Group();
      p.name = name;
      p.position.set(x, y, z);
      p.add(mesh(geo));
      this.group.add(p);
    };
    if (hound) {
      // Patas delanteras (en el pecho) y traseras (en la grupa).
      pivot("lArm", -0.13, M.shoulderY, -0.32, rig.lArm);
      pivot("rArm", 0.13, M.shoulderY, -0.32, rig.rArm);
      pivot("lLeg", -0.14, M.hipY, 0.32, rig.lLeg);
      pivot("rLeg", 0.14, M.hipY, 0.32, rig.rLeg);
    } else {
      limb("lArm", -armX, M.shoulderY, rig.lArm);
      limb("rArm", armX, M.shoulderY, rig.rArm);
      limb("lLeg", -legX, M.hipY, rig.lLeg);
      limb("rLeg", legX, M.hipY, rig.rLeg);
    }

    this.group.scale.setScalar(s);
    this.group.position.set(this.position.x, 0, this.position.z);
  }

  /** Golpe de cuchillo: lo empuja un poco hacia `dir` y lo aturde un instante. */
  knock(dirX: number, dirZ: number, push = 0.45, stun = 0.7): void {
    if (!this.alive) return;
    const len = Math.hypot(dirX, dirZ) || 1;
    this.position.x += (dirX / len) * push;
    this.position.z += (dirZ / len) * push;
    this.stunT = Math.max(this.stunT, stun);
    this.stagger = Math.max(this.stagger, 0.3);
  }

  /** La cabeza vuela: queda el muñón y la mirada se apaga. */
  popHead(): void {
    if (this.headless) return;
    this.headless = true;
    this.limbs.head.visible = false;
    this.stump.visible = true;
  }

  get alive(): boolean {
    return this.state !== "dead" && this.state !== "dying";
  }

  get radius(): number {
    return this.def.radius;
  }

  /** Golpe: resta vida y decide si muere. Devuelve true si ha caído con este impacto. */
  hit(damage: number, headshot: boolean): boolean {
    if (!this.alive) return false;
    this.hp -= damage;
    this.hurtFlash = 0.12;
    this.stagger = headshot ? 0.26 : 0.16;
    if (this.hp <= 0) {
      this.state = "dying";
      this.stateT = 0;
      this.fallDir = Math.random() < 0.75 ? 1 : -1;
      if (headshot) this.popHead();
      this.announceDeath();
      return true;
    }
    // Un impacto fuerte lo aturde un instante (no interrumpe el ataque si ya está en el aire).
    this.stunT = Math.max(this.stunT, headshot ? 0.22 : 0.06);
    if (this.state === "chasing") this.stateT = 0;
    return false;
  }

  private announceDeath(): void {
    if (this.diedAnnounced) return;
    this.diedAnnounced = true;
    this.eyes.visible = false;
    this.onDie?.(this);
  }

  update(dt: number, ctx: ZombieContext): void {
    this.stateT += dt;
    this.swing += dt * (this.state === "attacking" ? 9 : 5.5);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.stunT = Math.max(0, this.stunT - dt);
    this.stagger = Math.max(0, this.stagger - dt);

    switch (this.state) {
      case "spawning":
        this.animateSpawn();
        if (this.stateT > 0.9) {
          this.state = "chasing";
          this.stateT = 0;
        }
        break;
      case "dying":
        this.animateDeath();
        if (this.stateT > 2.4) this.state = "dead";
        break;
      case "dead":
        break;
      default:
        this.think(dt, ctx);
    }

    this.position.y = groundHeightAt(this.position.x, this.position.z, this.position.y + 0.4, ctx.colliders, 0.7) ?? 0;
    this.group.position.set(this.position.x, this.position.y + this.sink, this.position.z);
    this.group.rotation.y = this.yaw;
    this.applyHurtTint();
  }

  /** Sonido de gruñido cada pocos segundos si está cerca. */
  private maybeGrowl(dt: number, ctx: ZombieContext): void {
    this.growlT -= dt;
    if (this.growlT > 0) return;
    this.growlT = 3 + Math.random() * 7;
    this.onGrowl?.(this);
  }

  /** El jugador en pie más cercano (o -1 si no queda ninguno). */
  private nearestPlayer(ctx: ZombieContext): number {
    let best = -1;
    let bestD = Infinity;
    ctx.players.forEach((p, i) => {
      if (!p.alive) return;
      const d = dist2D(this.position.x, this.position.z, p.pos.x, p.pos.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /**
   * Sin camino hasta el jugador (la ventana que tendría enfrente aún tiene tablones): se busca la ruta a
   * la ventana exterior más cercana a la que sí se pueda llegar, para ir a romper la barricada en vez de
   * quedarse empujando el muro de al lado.
   */
  private pathToWindow(ctx: ZombieContext): Vec3[] | null {
    if (!ctx.objectives.length) return null;
    const near = [...ctx.objectives].sort(
      (a, b) => dist2D(this.position.x, this.position.z, a.x, a.z) - dist2D(this.position.x, this.position.z, b.x, b.z),
    );
    for (let i = 0; i < Math.min(3, near.length); i++) {
      const path = ctx.nav.findPath(this.position, { x: near[i].x, y: 0, z: near[i].z });
      if (path && path.length > 1) return path;
    }
    return null;
  }

  private think(dt: number, ctx: ZombieContext): void {
    // Cada poco (y si el objetivo cae) vuelve a elegir al jugador más cercano.
    if (this.target < 0 || !ctx.players[this.target]?.alive || this.repathT <= 0) this.target = this.nearestPlayer(ctx);
    if (this.target < 0) {
      // Todos caídos: se queda merodeando.
      this.animateWalk(0);
      return;
    }
    const playerPos = ctx.players[this.target].pos;
    const dist = dist2D(this.position.x, this.position.z, playerPos.x, playerPos.z);
    this.maybeGrowl(dt, ctx);
    const eye = { x: this.position.x, y: this.position.y + 1.5, z: this.position.z };
    const target = { x: playerPos.x, y: playerPos.y + 1.2, z: playerPos.z };
    // Los tablones no tapan la vista: un zombi pegado a la ventana golpea al jugador que está justo detrás.
    const los = hasLineOfSight(eye, target, ctx.colliders, (c) => c.tag === "wall" || c.tag === "prop" || c.tag === "door");

    // Ataque: pega si está al alcance y lo ve.
    if (this.attackCd <= 0 && dist <= this.def.attackRange && los && this.state !== "attacking") {
      this.state = "attacking";
      this.stateT = 0;
      return;
    }

    if (this.state === "attacking") {
      // Viento de 0,28 s, golpe, y recuperación (el daño lo aplica el gestor con `strikeNow`).
      const wind = this.def.kind === "hound" ? 0.16 : 0.28;
      if (this.stateT > wind && !this.struck) {
        this.struck = true;
        this.pendingStrike = dist <= this.def.attackRange + 0.5;
        this.strikeTarget = this.target;
      }
      if (this.stateT > (this.def.kind === "hound" ? 0.4 : 0.55)) {
        this.state = "chasing";
        this.stateT = 0;
        this.struck = false;
        this.attackCd = this.def.attackCooldown;
      }
    }

    if (this.stunT > 0) {
      this.animateWalk(0);
      return;
    }

    // Ruta: se recalcula cada 0,45–0,8 s (o si se queda sin nodos). Si el jugador no es alcanzable
    // (ventanas con tablones, puertas cerradas), se va a la ventana más cercana a la que sí se llegue.
    this.repathT -= dt;
    if (this.repathT <= 0 || this.path.length === 0) {
      this.repathT = 0.45 + Math.random() * 0.35;
      this.path = ctx.nav.findPath(this.position, playerPos) ?? this.pathToWindow(ctx) ?? [];
      this.pathIdx = 0;
    }

    let moveX = 0;
    let moveZ = 0;
    if (this.path.length > 0 && this.pathIdx < this.path.length) {
      const node = this.path[this.pathIdx];
      const d = dist2D(this.position.x, this.position.z, node.x, node.z);
      if (d < 0.35) {
        this.pathIdx++;
      } else {
        moveX = (node.x - this.position.x) / d;
        moveZ = (node.z - this.position.z) / d;
      }
    } else if (los) {
      // Sin ruta pero con visión clara: recto.
      const d = Math.max(0.001, dist);
      moveX = (playerPos.x - this.position.x) / d;
      moveZ = (playerPos.z - this.position.z) / d;
    } else {
      // Sin ruta y sin visión: a por el hueco más cercano para romper la barricada.
      let best: { x: number; z: number } | null = null;
      let bestD = Infinity;
      for (const o of ctx.objectives) {
        const d = dist2D(this.position.x, this.position.z, o.x, o.z);
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      if (best && bestD > 0.6) {
        moveX = (best.x - this.position.x) / bestD;
        moveZ = (best.z - this.position.z) / bestD;
      }
    }

    // Separación: se aparta de los demás para no apilarse en un punto.
    let sepX = 0;
    let sepZ = 0;
    for (const other of ctx.neighbors) {
      if (other === this || !other.alive) continue;
      const dx = this.position.x - other.position.x;
      const dz = this.position.z - other.position.z;
      const d = Math.hypot(dx, dz);
      const minD = this.radius + other.radius + 0.15;
      if (d > 0.0001 && d < minD) {
        const push = (minD - d) / minD;
        sepX += (dx / d) * push;
        sepZ += (dz / d) * push;
      }
    }

    const speed = this.speed * (this.state === "attacking" ? 0.25 : 1);
    this.position.x += (moveX * speed + sepX * 1.7) * dt;
    this.position.z += (moveZ * speed + sepZ * 1.7) * dt;

    // Colisión con el escenario (radio propio, sin atravesar muros). El alféizar de las ventanas no
    // cuenta: los zombis trepan por el hueco cuando la barricada está rota (los tablones son `barricade`).
    resolveCircle(
      this.position,
      this.radius,
      this.position.y + 0.1,
      this.position.y + this.def.height,
      ctx.colliders,
      (c) => c.tag === "floor" || c.tag === "ceiling" || c.tag === "window" || c.max.y <= this.position.y + 0.45,
    );

    // Orientación hacia donde anda.
    if (Math.abs(moveX) + Math.abs(moveZ) > 0.01) {
      const want = Math.atan2(-moveX, -moveZ);
      this.yaw = damp(this.yaw, want, 8, dt);
    }
    this.animateWalk(Math.hypot(moveX, moveZ));
    this.state = this.state === "attacking" ? "attacking" : "chasing";
    // Detector de atascos: cada segundo mide cuánto se ha movido; lejos de su objetivo y casi quieto suma.
    this.probeT += dt;
    if (this.probeT >= 1) {
      const moved = dist2D(this.position.x, this.position.z, this.probeX, this.probeZ);
      this.stuckT = moved < 0.35 && dist > 2.5 && this.stunT <= 0 ? this.stuckT + this.probeT : 0;
      this.probeX = this.position.x;
      this.probeZ = this.position.z;
      this.probeT = 0;
    }
  }

  /** Segundos seguidos persiguiendo sin avanzar (atascado detrás de una puerta cerrada, por ejemplo): el gestor lo rescata. */
  stuckT = 0;
  private probeX = 0;
  private probeZ = 0;
  private probeT = 0;

  /** Lo coloca en otro punto (rescate de un zombi atascado) y lo hace volver a calcular la ruta. */
  teleport(x: number, z: number): void {
    this.position.set(x, 0, z);
    this.path = [];
    this.pathIdx = 0;
    this.repathT = 0;
    this.stuckT = 0;
    this.probeX = x;
    this.probeZ = z;
    this.probeT = 0;
  }

  /** Marca si ya ha soltado el golpe en este ataque. */
  struck = false;
  /** El gestor lo lee y lo limpia para aplicar daño. */
  pendingStrike = false;

  /** Galope del perro: patas delanteras y traseras alternas, cuerpo que cabecea y salto al morder. */
  private animateHound(amount: number): void {
    const moving = amount > 0.05;
    const ph = this.swing * (moving ? 2.4 : 1);
    const amp = moving ? 0.95 : 0.06;
    const sw = Math.sin(ph);
    this.limbs.lArm.rotation.x = sw * amp;
    this.limbs.rArm.rotation.x = Math.sin(ph + 0.45) * amp;
    this.limbs.lLeg.rotation.x = -Math.sin(ph + 0.9) * amp;
    this.limbs.rLeg.rotation.x = -Math.sin(ph + 1.35) * amp;
    this.limbs.head.rotation.x = 0.12 + Math.sin(ph * 2) * 0.05;
    this.limbs.head.rotation.z = 0;
    this.group.rotation.x = moving ? -0.05 + Math.sin(ph * 2) * 0.07 : 0.02;
    this.group.rotation.z = 0;
    if (this.state === "attacking") {
      const t = this.stateT;
      const lunge = t < 0.16 ? -0.3 * (t / 0.16) : 0.35;
      this.group.rotation.x = lunge;
      this.limbs.lArm.rotation.x = this.limbs.rArm.rotation.x = t < 0.16 ? 0.6 : -1.2;
      this.limbs.head.rotation.x = t < 0.16 ? 0.4 : -0.2;
    }
    if (this.stagger > 0) this.group.rotation.x -= this.stagger * 1.4;
  }

  private animateWalk(amount: number): void {
    if (this.def.kind === "hound") {
      this.animateHound(amount);
      return;
    }
    const run = this.def.kind === "runner";
    const amp = amount > 0.05 ? (run ? 1.0 : 0.8) : 0.1;
    const swing = Math.sin(this.swing * 1.6);
    const limp = this.variant === 1 ? 0.45 : 1;
    this.limbs.lLeg.rotation.x = swing * amp * limp;
    this.limbs.rLeg.rotation.x = -swing * amp;
    // Brazos extendidos hacia delante (con asimetría según el aspecto) que cabecean al andar.
    const reach = (run ? 0.85 : 1.25) + (this.variant % 2 ? 0.12 : -0.1);
    this.limbs.lArm.rotation.x = reach + swing * amp * 0.2;
    this.limbs.rArm.rotation.x = reach - 0.12 - swing * amp * 0.2;
    this.limbs.lArm.rotation.z = 0.12;
    this.limbs.rArm.rotation.z = -0.12;
    this.limbs.head.rotation.z = Math.sin(this.swing * 0.8) * 0.1;
    this.limbs.head.rotation.x = 0.28 + (this.variant % 3) * 0.06;
    // Cuerpo inclinado hacia delante y balanceo al andar.
    this.group.rotation.x = amount > 0.05 ? (run ? 0.3 : 0.12) + Math.abs(swing) * 0.04 : 0.05;
    this.group.rotation.z = amount > 0.05 ? swing * (this.variant === 1 ? 0.12 : 0.05) : 0;
    if (this.state === "attacking") {
      // Brazos al cielo en el viento del golpe y tajo hacia abajo.
      const t = this.stateT;
      const up = t < 0.28 ? 1.25 + (t / 0.28) * 1.1 : 2.35 - clamp((t - 0.28) / 0.14, 0, 1) * 1.7;
      this.limbs.lArm.rotation.x = up;
      this.limbs.rArm.rotation.x = up;
      this.group.rotation.x = t < 0.28 ? -0.1 : 0.3;
    }
    if (this.stagger > 0) this.group.rotation.x -= this.stagger * 1.4;
  }

  private animateSpawn(): void {
    const k = clamp(this.stateT / 0.9, 0, 1);
    this.group.position.y = -0.9 * (1 - k);
    if (this.def.kind === "hound") {
      this.group.rotation.x = (1 - k) * 0.5;
      return;
    }
    this.group.rotation.x = (1 - k) * 0.5;
    this.limbs.lArm.rotation.x = 2.1 * (1 - k) + 1.1 * k;
    this.limbs.rArm.rotation.x = 1.8 * (1 - k) + 1.0 * k;
  }

  private animateDeath(): void {
    const k = clamp(this.stateT / 0.55, 0, 1);
    if (this.def.kind === "hound") {
      // El perro cae de costado con las patas estiradas.
      this.group.rotation.x = 0;
      this.group.rotation.z = this.fallDir * k * Math.PI * 0.46;
      this.limbs.lArm.rotation.x = -0.6 * k;
      this.limbs.rArm.rotation.x = -0.9 * k;
      this.limbs.lLeg.rotation.x = 0.7 * k;
      this.limbs.rLeg.rotation.x = 0.5 * k;
      if (this.stateT > 1.5) {
        const fade = clamp((this.stateT - 1.5) / 1.0, 0, 1);
        this.bodyMat.transparent = true;
        this.bodyMat.opacity = 1 - fade;
        this.sink = -fade * 1.0;
      }
      return;
    }
    // Cae hacia atrás (o de bruces) con una ligera torsión y los brazos sueltos.
    this.group.rotation.x = this.fallDir * k * Math.PI * 0.49;
    this.group.rotation.z = Math.sin(k * Math.PI) * 0.25 * this.fallDir;
    this.limbs.lArm.rotation.x = 1.25 + (this.fallDir > 0 ? -2.2 : 0.6) * k;
    this.limbs.rArm.rotation.x = 1.0 + (this.fallDir > 0 ? -1.8 : 0.9) * k;
    this.limbs.lLeg.rotation.x = 0.2 * k;
    this.limbs.rLeg.rotation.x = -0.35 * k;
    if (this.stateT > 1.5) {
      const fade = clamp((this.stateT - 1.5) / 1.0, 0, 1);
      this.bodyMat.transparent = true;
      this.bodyMat.opacity = 1 - fade;
      this.sink = -fade * 1.0;
    }
  }

  /**
   * Invitado: el zombi lo mueve el anfitrión. Aquí solo se coloca donde dice el estado y se anima (andar,
   * aparecer, morir) con la misma pose que en el anfitrión.
   */
  puppet(dt: number, x: number, z: number, yaw: number, state: ZombieState, colliders: readonly Collider[]): void {
    if (state !== this.state) {
      this.state = state;
      this.stateT = 0;
      if (state === "dying" || state === "dead") this.announceDeath();
    }
    this.stateT += dt;
    this.stagger = Math.max(0, this.stagger - dt);
    this.swing += dt * (state === "attacking" ? 9 : 5.5);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    // Entre estados (unas 20 veces por segundo) se suaviza el movimiento; la primera vez, de golpe.
    const k = this.puppeted ? 1 - Math.exp(-14 * dt) : 1;
    this.puppeted = true;
    this.position.x += (x - this.position.x) * k;
    this.position.z += (z - this.position.z) * k;
    this.yaw += (((yaw - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * k;
    x = this.position.x;
    z = this.position.z;
    yaw = this.yaw;
    const moved = Math.hypot(x - this.lastX, z - this.lastZ);
    this.lastX = x;
    this.lastZ = z;
    if (state === "spawning") this.animateSpawn();
    else if (state === "dying" || state === "dead") this.animateDeath();
    else this.animateWalk(moved > 0.002 ? 1 : 0);
    this.position.y = groundHeightAt(x, z, this.position.y + 0.4, colliders, 0.7) ?? 0;
    this.group.position.set(x, this.position.y + this.sink, z);
    this.group.rotation.y = yaw;
    this.applyHurtTint();
  }

  /** El anfitrión avisa de un impacto (parpadeo rojo y sacudida). */
  flash(): void {
    this.hurtFlash = 0.12;
    this.stagger = 0.16;
  }

  private applyHurtTint(): void {
    this.bodyMat.emissive.setHex(this.hurtFlash > 0 ? 0x882222 : 0x000000);
  }

  /** Limpieza al quitarlo de la escena. */
  dispose(): void {
    // Las geometrías son compartidas (model.ts): solo se libera el material propio.
    this.bodyMat.dispose();
    this.group.removeFromParent();
  }
}
