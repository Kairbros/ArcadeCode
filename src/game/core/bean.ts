// Muñeco «poroto» del casino, compartido por todos los juegos: cuerpo de cápsula del color del jugador, ojos
// saltones, guantes redondos, piececitos y bombín. Mide ~1,95 m con los pies en y = 0 y la cara mira al -Z.
import * as THREE from "three";

export interface Bean {
  root: THREE.Group;
  /** Piernas (izquierda, derecha): giran en la cadera. */
  legs: THREE.Group[];
  /** Brazos (izquierdo, derecho): giran en el hombro; el guante cuelga a ~0,6 m. */
  arms: THREE.Group[];
  /** Cabeza con la cara, las cejas y el sombrero (origen en el cuello, a 1,55 m). */
  head: THREE.Group;
  hat: THREE.Group;
}

export type MakeMat = (color: number, emissive?: number, basic?: boolean) => THREE.Material;

const lambert: MakeMat = (color, emissive = 0, basic = false) =>
  basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, emissive });

/** `mat` deja a cada juego poner sus propios materiales (p. ej. los que se oscurecen de noche). */
export function buildBean(color: number, mat: MakeMat = lambert, croupier = false): Bean {
  const root = new THREE.Group();
  const dark = 0x2a0e1c, glove = 0xfff2dc;
  const suitInk = 0x1c1a24;
  // El crupier es un botones amarillo con esmoquin: con luz propia, porque detrás de la mesa llega poca.
  if (croupier) color = 0xf2cc4a;
  const lit = (c: number, e: number) => mat(c, croupier ? e : 0);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const ball = (parent: THREE.Object3D, r: number, c: number, x: number, y: number, z: number, flat = 1, basic = false) => {
    const o = mesh(new THREE.SphereGeometry(r, 14, 10), mat(c, 0, basic), parent, x, y, z);
    o.scale.z = flat;
    return o;
  };
  const slab = (parent: THREE.Object3D, w: number, h: number, d: number, c: number, x: number, y: number, z: number) =>
    mesh(new THREE.BoxGeometry(w, h, d), mat(c), parent, x, y, z);

  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.17 * s, 0.36, 0);
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), lit(croupier ? suitInk : dark, 0x141218), hip, 0, -0.15, 0);
    ball(hip, 0.14, croupier ? 0x0e0e14 : dark, 0, -0.31, -0.06).scale.set(1, 0.6, 1.5);
    root.add(hip);
    legs.push(hip);
  }
  mesh(new THREE.CapsuleGeometry(0.42, 0.76, 8, 16), lit(color, 0x4a3a10), root, 0, 1.05, 0);
  if (croupier) {
    // Esmoquin (mitad baja del poroto), pechera blanca, botones y pajarita roja.
    mesh(new THREE.CylinderGeometry(0.445, 0.445, 0.86, 18, 1, true), lit(suitInk, 0x22202c), root, 0, 0.72, 0);
    mesh(new THREE.SphereGeometry(0.445, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lit(suitInk, 0x22202c), root, 0, 0.29, 0);
    slab(root, 0.32, 0.5, 0.05, 0xf8f4ee, 0, 0.92, -0.42);
    for (let k = 0; k < 3; k++) ball(root, 0.035, 0x141018, 0, 0.98 - k * 0.15, -0.46);
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.ConeGeometry(0.09, 0.16, 8), lit(0xd8243a, 0x3a0810), root, 0.08 * s, 1.2, -0.45);
      wing.rotation.z = (s * Math.PI) / 2;
    }
    ball(root, 0.045, 0xd8243a, 0, 1.2, -0.46);
  }

  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.44 * s, 1.2, 0);
    mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.42, 8), lit(croupier ? suitInk : color, 0x22202c), shoulder, 0, -0.21, 0);
    ball(shoulder, 0.14, glove, 0, -0.46, 0);
    root.add(shoulder);
    arms.push(shoulder);
  }

  const head = new THREE.Group();
  head.position.y = 1.55;
  root.add(head);
  for (const s of [-1, 1]) {
    ball(head, 0.16, 0xffffff, 0.16 * s, 0.05, -0.33, 0.7);
    ball(head, 0.065, 0x141018, 0.15 * s, 0.03, -0.44);
    ball(head, 0.02, 0xffffff, 0.13 * s, 0.07, -0.49, 1, true);
    slab(head, 0.18, 0.045, 0.05, dark, 0.16 * s, 0.25, -0.38).rotation.z = -0.18 * s;
  }
  ball(head, 0.075, croupier ? 0xff6a5a : 0xff7a8a, 0, -0.12, -0.42);

  const hat = new THREE.Group();
  if (croupier) {
    // Bigote de manillar y fez con borla.
    for (const s of [-1, 1]) {
      const tip = mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), mat(0x2a1a12), head, 0.1 * s, -0.2, -0.4);
      tip.rotation.z = (s * Math.PI) / 2.6;
    }
    mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 16), lit(0xb81a2a, 0x3a0810), hat, 0, 0.48, 0);
    slab(hat, 0.03, 0.18, 0.03, 0x141018, 0.12, 0.55, 0.08);
    ball(hat, 0.05, 0x141018, 0.14, 0.45, 0.1);
  } else {
    // Bombín oscuro con cinta clara.
    mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.26, 16), mat(dark), hat, 0, 0.5, 0.02);
    mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 18), mat(dark), hat, 0, 0.38, 0.02);
    mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.07, 16), mat(glove), hat, 0, 0.42, 0.02);
  }
  head.add(hat);
  return { root, legs, arms, head, hat };
}
