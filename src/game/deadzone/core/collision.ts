// Colisiones del mundo: cajas alineadas a los ejes (AABB) contra círculos, suelos, rayos y visión.
// Todo es geometría pura para poder probarla en Vitest sin navegador.
import type { Vec3 } from "./math";

export type ColliderTag = "wall" | "floor" | "prop" | "door" | "window" | "sill" | "ceiling" | "barricade";

export interface Collider {
  min: Vec3;
  max: Vec3;
  tag: ColliderTag;
  /** Una puerta cerrada bloquea; al comprarla se desactiva. */
  enabled: boolean;
  /** Identificador para puertas y ventanas. */
  id?: string;
}

export interface Hit {
  t: number;
  collider: Collider;
  point: Vec3;
  normal: Vec3;
}

export function makeCollider(
  min: Vec3,
  max: Vec3,
  tag: ColliderTag,
  id?: string,
): Collider {
  return { min, max, tag, enabled: true, ...(id ? { id } : {}) };
}

export const colliderFromBox = (
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
  tag: ColliderTag,
  id?: string,
): Collider =>
  makeCollider({ x: cx - w / 2, y: 0, z: cz - d / 2 }, { x: cx + w / 2, y: h, z: cz + d / 2 }, tag, id);

/** ¿El círculo (x,z,r) pisa el AABB en planta? */
export function circleOverlapsXZ(x: number, z: number, r: number, c: Collider): boolean {
  const nx = Math.max(c.min.x, Math.min(x, c.max.x));
  const nz = Math.max(c.min.z, Math.min(z, c.max.z));
  return (x - nx) * (x - nx) + (z - nz) * (z - nz) < r * r;
}

/** Saca un círculo de los AABB activos, eje por el que menos penetra. */
export function resolveCircle(
  pos: { x: number; z: number },
  radius: number,
  yBottom: number,
  yTop: number,
  colliders: readonly Collider[],
  ignore: (c: Collider) => boolean = () => false,
): void {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const c of colliders) {
      if (!c.enabled || ignore(c)) continue;
      if (yBottom >= c.max.y - 0.001 || yTop <= c.min.y + 0.001) continue;
      if (!circleOverlapsXZ(pos.x, pos.z, radius, c)) continue;
      // Penetración por cada eje y empuje por el menor.
      const pxLeft = pos.x + radius - c.min.x;
      const pxRight = c.max.x - (pos.x - radius);
      const pzBack = pos.z + radius - c.min.z;
      const pzFront = c.max.z - (pos.z - radius);
      const px = Math.min(pxLeft, pxRight);
      const pz = Math.min(pzBack, pzFront);
      if (px < pz) pos.x += pxLeft < pxRight ? -px : px;
      else pos.z += pzBack < pzFront ? -pz : pz;
      moved = true;
    }
    if (!moved) break;
  }
}

/** Altura del suelo más alto pisable bajo (x,z) dentro del margen de escalón. */
export function groundHeightAt(
  x: number,
  z: number,
  feetY: number,
  colliders: readonly Collider[],
  maxStep = 0.65,
): number | null {
  let best: number | null = null;
  for (const c of colliders) {
    if (!c.enabled) continue;
    if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue;
    if (c.max.y > feetY + maxStep + 0.001) continue;
    if (best === null || c.max.y > best) best = c.max.y;
  }
  return best;
}

/** Rayo contra un AABB (método de las losas). Devuelve la distancia de entrada o null. */
export function rayAABB(o: Vec3, d: Vec3, c: Collider): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    const origin = o[axis];
    const dir = d[axis];
    const lo = c.min[axis];
    const hi = c.max[axis];
    if (Math.abs(dir) < 1e-8) {
      if (origin < lo || origin > hi) return null;
      continue;
    }
    const inv = 1 / dir;
    let t1 = (lo - origin) * inv;
    let t2 = (hi - origin) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : 0;
}

/** Impacto más cercano del rayo contra el mundo. */
export function raycastWorld(
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  colliders: readonly Collider[],
  filter: (c: Collider) => boolean = (c) => c.tag !== "ceiling",
): Hit | null {
  let best: Hit | null = null;
  for (const c of colliders) {
    if (!c.enabled || !filter(c)) continue;
    const t = rayAABB(origin, dir, c);
    if (t === null || t > maxDist) continue;
    if (best && t >= best.t) continue;
    const point = { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
    const normal = surfaceNormal(point, c);
    best = { t, collider: c, point, normal };
  }
  return best;
}

/** Normal de la cara por la que ha entrado el rayo (aproximada por cercanía al plano). */
export function surfaceNormal(p: Vec3, c: Collider): Vec3 {
  const eps = 0.004;
  if (Math.abs(p.x - c.min.x) < eps) return { x: -1, y: 0, z: 0 };
  if (Math.abs(p.x - c.max.x) < eps) return { x: 1, y: 0, z: 0 };
  if (Math.abs(p.y - c.min.y) < eps) return { x: 0, y: -1, z: 0 };
  if (Math.abs(p.y - c.max.y) < eps) return { x: 0, y: 1, z: 0 };
  if (Math.abs(p.z - c.min.z) < eps) return { x: 0, y: 0, z: -1 };
  if (Math.abs(p.z - c.max.z) < eps) return { x: 0, y: 0, z: 1 };
  return { x: 0, y: 1, z: 0 };
}

/** ¿Hay pared entre dos puntos? Los muros sólidos tapan; suelos no. */
export function hasLineOfSight(
  a: Vec3,
  b: Vec3,
  colliders: readonly Collider[],
  opaque: (c: Collider) => boolean = (c) => c.tag === "wall" || c.tag === "prop" || c.tag === "door" || c.tag === "barricade",
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return true;
  const dir = { x: dx / len, y: dy / len, z: dz / len };
  const hit = raycastWorld(a, dir, len, colliders, opaque);
  return !hit;
}

/** Impacto rayo contra un cilindro vertical (usado para zombis y jugador). */
export function rayCylinder(
  o: Vec3,
  d: Vec3,
  base: Vec3,
  radius: number,
  height: number,
): number | null {
  // Cilindro infinito en Y → intersección 2D, luego recorte vertical.
  const ox = o.x - base.x;
  const oz = o.z - base.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) {
    const inside = ox * ox + oz * oz <= radius * radius;
    if (!inside) return null;
    const t = d.y > 0 ? (base.y + height - o.y) / d.y : (base.y - o.y) / d.y;
    return t >= 0 ? t : null;
  }
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  for (const t of [t1, t2]) {
    if (t < 0) continue;
    const y = o.y + d.y * t;
    if (y >= base.y && y <= base.y + height) return t;
  }
  return null;
}

/** Impacto rayo contra una esfera (la cabeza de los zombis). Devuelve la distancia de entrada o null. */
export function raySphere(o: Vec3, d: Vec3, center: Vec3, radius: number): number | null {
  const ox = o.x - center.x, oy = o.y - center.y, oz = o.z - center.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return c < 0 ? 0 : null;
  return t;
}

/** Cápsula vertical aproximada por dos cilindros (torso y cabeza) para los disparos. */
export function rayCapsule(
  o: Vec3,
  d: Vec3,
  base: Vec3,
  radius: number,
  height: number,
): { t: number; y: number } | null {
  const t = rayCylinder(o, d, base, radius, height);
  if (t === null) return null;
  return { t, y: o.y + d.y * t };
}
