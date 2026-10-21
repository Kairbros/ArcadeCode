// Gestor de enemigos: alta, actualización con separación, impactos por rayo y limpieza.
import * as THREE from "three";
import { rayCylinder, type Collider } from "../core/collision";
import type { NavGrid } from "../world/nav";
import { Zombie, type ZombieState, type ZombieTarget } from "./zombie";
import type { ZombieKind } from "./defs";

export interface ZombieHit {
  zombie: Zombie;
  t: number;
  head: boolean;
  point: THREE.Vector3;
}

export interface ManagerHooks {
  /** Un zombi suelta el golpe; `target` es el jugador al que apuntaba. */
  onStrike: (z: Zombie, target: number) => void;
  onGrowl: (z: Zombie) => void;
}

/** Orden de los estados al viajar por red. */
export const ZOMBIE_STATES: ZombieState[] = ["spawning", "chasing", "attacking", "hurt", "dying", "dead"];
export const ZOMBIE_KINDS: ZombieKind[] = ["walker", "runner", "brute"];

export class ZombieManager {
  readonly list: Zombie[] = [];
  /** Aviso cuando un zombi empieza a morir (mancha de sangre en el suelo). */
  onDie?: (z: Zombie) => void;
  private poolCleared = 0;

  constructor(
    private scene: THREE.Scene,
    private nav: NavGrid | null,
  ) {}

  spawn(kind: ZombieKind, round: number, x: number, z: number): Zombie {
    const z0 = new Zombie(kind, round, x, z);
    z0.onDie = (q) => this.onDie?.(q);
    this.scene.add(z0.group);
    this.list.push(z0);
    return z0;
  }

  get aliveCount(): number {
    return this.list.reduce((n, z) => n + (z.alive ? 1 : 0), 0);
  }

  update(
    dt: number,
    players: ZombieTarget[],
    colliders: readonly Collider[],
    hooks: ManagerHooks,
    objectives: { x: number; z: number }[] = [],
  ): void {
    const nav = this.nav;
    if (!nav) throw new Error("ZombieManager.update necesita la rejilla de rutas (solo el anfitrión simula)");
    for (const z of this.list) {
      z.onGrowl = hooks.onGrowl;
      z.update(dt, { players, colliders, nav, neighbors: this.list, objectives });
      if (z.pendingStrike) {
        z.pendingStrike = false;
        hooks.onStrike(z, z.strikeTarget);
      }
    }
    // Retirada de cadáveres ya desvanecidos.
    this.poolCleared = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      if (z.state === "dead" && z.stateT > 2.6) {
        z.dispose();
        this.list.splice(i, 1);
        this.poolCleared++;
      }
    }
  }

  /** Todos los zombis vivos que corta el rayo, ordenados por distancia. */
  hitscan(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): ZombieHit[] {
    const hits: ZombieHit[] = [];
    for (const z of this.list) {
      if (!z.alive || z.state === "spawning") continue;
      const base = new THREE.Vector3(z.position.x, z.position.y, z.position.z);
      const t = rayCylinder(origin, dir, base, z.radius * 1.15, z.def.height);
      if (t === null || t > maxDist) continue;
      const y = origin.y + dir.y * t;
      const head = y > z.position.y + z.def.height * 0.8;
      hits.push({ zombie: z, t, head, point: origin.clone().addScaledVector(dir, t) });
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  /**
   * Invitado: pone la lista de zombis como la manda el anfitrión (`[id, tipo, x, z, giro, estado]`): crea los
   * que faltan, mueve y anima los que están y quita los que ya no vienen.
   */
  sync(dt: number, rows: number[][], colliders: readonly Collider[], round: number): void {
    const seen = new Set<number>();
    for (const r of rows) {
      const [id, k, x, z, yaw, st] = r;
      seen.add(id);
      let zb = this.list.find((q) => q.id === id);
      if (!zb) {
        zb = new Zombie(ZOMBIE_KINDS[k] ?? "walker", round, x, z);
        zb.id = id;
        zb.onDie = (q) => this.onDie?.(q);
        this.scene.add(zb.group);
        this.list.push(zb);
      }
      zb.puppet(dt, x, z, yaw, ZOMBIE_STATES[st] ?? "chasing", colliders);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (seen.has(this.list[i].id)) continue;
      this.list[i].dispose();
      this.list.splice(i, 1);
    }
  }

  clear(): void {
    for (const z of this.list) z.dispose();
    this.list.length = 0;
  }

  get removedCount(): number {
    return this.poolCleared;
  }
}
