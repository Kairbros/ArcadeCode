// Vectores y giros para colocar cosas en la mesa. Ejes como en Three.js: y hacia arriba y, sin
// girar, se mira hacia -z. Los giros (guiñada, cabeceo, alabeo) equivalen a Euler "YXZ" de Three.

export type V3 = [number, number, number];

export interface Pose {
  pos: V3;
  yaw?: number;
  pitch?: number;
  roll?: number;
}

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const mix = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Gira: primero alabeo (eje z), luego cabeceo (eje x) y por último guiñada (eje y). */
export function rot(v: V3, yaw = 0, pitch = 0, roll = 0): V3 {
  let [x, y, z] = v;
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  if (pitch) {
    const c = Math.cos(pitch), s = Math.sin(pitch);
    [y, z] = [y * c - z * s, y * s + z * c];
  }
  if (yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    [x, z] = [x * c + z * s, -x * s + z * c];
  }
  return [x, y, z];
}

/** Guiñada y cabeceo que hacen apuntar el eje -z local en la dirección d. */
export function aim(d: V3): [number, number] {
  const l = len(d) || 1;
  return [Math.atan2(-d[0], -d[2]), Math.asin(Math.max(-1, Math.min(1, d[1] / l)))];
}

export function transform(v: V3, t: Pose): V3 {
  return add(rot(v, t.yaw, t.pitch, t.roll), t.pos);
}
