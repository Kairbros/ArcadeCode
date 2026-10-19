// Animales del mundo (vacas y cerdos): andan a su aire, huyen cuando les pegas y sueltan carne.
// Son de cada jugador (como los objetos del suelo): no viajan por la red todavía.
import { AIR, GRASS, WATER } from "./blocks";
import { World } from "./world";

export type MobKind = "cow" | "pig";

export interface Mob {
  id: number;
  kind: MobKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  hp: number;
  /** Segundos de parpadeo al recibir un golpe. */
  hurt: number;
  /** Segundos que quedan huyendo. */
  flee: number;
  /** Segundos hasta elegir otro rumbo. */
  wander: number;
  ground: boolean;
}

const SPEED = 1.15;
const FLEE_SPEED = 2.2;
const GRAVITY = 22;
const JUMP = 6.2;
/** Cuánto se separa el rayo del centro del bicho para contar como golpe. */
const HIT_RADIUS = 0.8;
const MAX_HP = 10;

export class Mobs {
  list: Mob[] = [];
  private nextId = 1;

  spawn(kind: MobKind, x: number, y: number, z: number): Mob {
    const m: Mob = {
      id: this.nextId++, kind, x, y, z, vx: 0, vy: 0, vz: 0,
      yaw: Math.random() * Math.PI * 2, hp: MAX_HP, hurt: 0, flee: 0, wander: 1 + Math.random() * 3, ground: false,
    };
    this.list.push(m);
    return m;
  }

  /** Coloca animales al azar sobre hierba alrededor de un punto (los del jugador). */
  spawnAround(w: World, x: number, z: number, count: number) {
    for (let i = 0; i < count * 6 && this.list.length < count; i++) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 14;
      const cx = Math.floor(x + Math.cos(a) * r), cz = Math.floor(z + Math.sin(a) * r);
      if (!World.inside(cx, 0, cz)) continue;
      const top = w.surface(cx, cz);
      const ground = w.get(cx, top, cz);
      if (ground !== GRASS || w.get(cx, top + 1, cz) !== AIR || w.get(cx, top + 2, cz) !== AIR) continue; // solo hierba seca
      this.spawn(Math.random() < 0.5 ? "cow" : "pig", cx + 0.5, top + 1, cz + 0.5);
    }
  }

  update(dt: number, w: World, px: number, pz: number) {
    for (const m of this.list) {
      m.hurt = Math.max(0, m.hurt - dt);
      m.flee = Math.max(0, m.flee - dt);
      m.wander -= dt;
      const dx = m.x - px, dz = m.z - pz;
      const dist = Math.hypot(dx, dz);
      if (m.flee > 0) {
        // Huye del jugador.
        m.yaw = Math.atan2(dx, dz);
      } else if (m.wander <= 0) {
        m.wander = 1.5 + Math.random() * 3.5;
        m.yaw += (Math.random() - 0.5) * 2.4;
      }
      const speed = m.flee > 0 ? FLEE_SPEED : SPEED;
      // Si el jugador está muy cerca y no huye, se aparta un poco (no se deja pisar).
      const away = dist < 1.6 && m.flee > 0 ? 1 : 0;
      const vx = Math.sin(m.yaw) * speed * (away ? 1.6 : 1);
      const vz = Math.cos(m.yaw) * speed * (away ? 1.6 : 1);
      m.vx += (vx - m.vx) * Math.min(1, dt * 8);
      m.vz += (vz - m.vz) * Math.min(1, dt * 8);
      m.vy -= GRAVITY * dt;

      // Agua: flota
      if (w.get(Math.floor(m.x), Math.floor(m.y + 0.3), Math.floor(m.z)) === WATER) {
        m.vy = 1.4;
      }

      // Movimiento eje a eje, con salto si hay un escalón.
      const nx = m.x + m.vx * dt;
      if (!this.blocked(w, nx, m.y, m.z)) m.x = nx;
      else if (m.ground) m.vy = JUMP;
      const nz = m.z + m.vz * dt;
      if (!this.blocked(w, m.x, m.y, nz)) m.z = nz;
      else if (m.ground) m.vy = JUMP;
      const ny = m.y + m.vy * dt;
      if (this.blocked(w, m.x, ny, m.z)) {
        if (m.vy < 0) {
          m.y = Math.floor(ny) + 1;
          m.vy = 0;
          m.ground = true;
        } else {
          m.vy = 0;
        }
      } else {
        m.y = ny;
        m.ground = false;
      }
      // Fuera del mundo (no debería): se vuelve a colocar arriba.
      if (m.y < -5) {
        m.y = w.surface(Math.floor(m.x), Math.floor(m.z)) + 1;
        m.vy = 0;
      }
    }
    // Los que se han ido muy lejos (o han muerto) fuera.
    this.list = this.list.filter((m) => m.hp > 0);
  }

  /** ¿La caja del bicho choca en esa posición? (pies en y, 0,9 de alto, 0,7 de ancho) */
  private blocked(w: World, x: number, y: number, z: number): boolean {
    const h = 0.35;
    for (const dy of [0.1, 0.85]) {
      for (const ox of [-h, h]) {
        for (const oz of [-h, h]) {
          if (w.solidAt(Math.floor(x + ox), Math.floor(y + dy), Math.floor(z + oz))) return true;
        }
      }
    }
    return false;
  }

  /** Primer animal que corta el rayo de la mirada (para pegarle). */
  hitAt(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): Mob | null {
    let best: Mob | null = null;
    let bestT = maxDist;
    for (const m of this.list) {
      // Dos esferas por bicho (lomo y panza): así se acierta mirando a cualquier parte del cuerpo.
      for (const lift of [0.45, 1.0]) {
        const cx = m.x - ox, cy = m.y + lift - oy, cz = m.z - oz;
        const t = cx * dx + cy * dy + cz * dz;
        if (t < 0 || t > bestT) continue;
        const px = cx - dx * t, py = cy - dy * t, pz = cz - dz * t;
        if (Math.hypot(px, py, pz) > HIT_RADIUS) continue;
        best = m;
        bestT = t;
      }
    }
    return best;
  }

  /** Golpe: quita vida y lo pone a huir. Devuelve true si ha muerto. */
  damage(m: Mob, dmg: number, from: { x: number; z: number }): boolean {
    m.hp -= dmg;
    m.hurt = 0.35;
    // Huye en dirección contraria al que le pega.
    m.yaw = Math.atan2(m.x - from.x, m.z - from.z);
    m.flee = 3.5;
    if (m.hp > 0) return false;
    this.list = this.list.filter((x) => x !== m);
    return true;
  }

  clear() {
    this.list = [];
  }
}
