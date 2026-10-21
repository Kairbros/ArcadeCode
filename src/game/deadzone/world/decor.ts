// Decoración que no choca con nada: sangre en el suelo y rastros de arrastre, manos y arañazos en las paredes,
// pintadas con mensajes (algunas guían hacia el mejorador y la energía), marcas de la calzada y charcos que
// reflejan el cielo. Todo con semilla fija: los jugadores ven el mismo sector.
import * as THREE from "three";
import { ROOMS } from "./mapdata";
import { bloodTexture, clawTexture, dashTexture, graffitiTexture, handTexture, puddleTexture } from "./decals";

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
function decalMat(key: string, map: THREE.Texture, rough = 0.85, tint = 0xffffff): THREE.MeshStandardMaterial {
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: rough, metalness: 0.02, color: tint, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mats.set(key, m);
  }
  return m;
}

/** Mancha de sangre en el suelo, en el espacio local de `parent`. */
export function floorDecal(parent: THREE.Object3D, x: number, z: number, size: number, variant: number, spin = x * 7.3 + z * 3.1): THREE.Mesh {
  const v = ((variant % 4) + 4) % 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), decalMat(`blood${v}`, bloodTexture(v), 0.22));
  m.rotation.set(-Math.PI / 2, 0, spin);
  m.position.set(x, 0.03 + (v % 3) * 0.004, z);
  parent.add(m);
  return m;
}

/** Pegatina vertical sobre un muro: (x, z) es el centro del muro y (nx, nz) el lado que mira al recinto. */
function wallDecal(parent: THREE.Object3D, x: number, z: number, nx: number, nz: number, y: number, key: string, map: THREE.Texture, w: number, h: number, rot = 0): void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMat(key, map, 0.9));
  m.position.set(x + nx * 0.19, y, z + nz * 0.19);
  m.rotation.set(0, Math.atan2(nx, nz), rot);
  parent.add(m);
}

const RED = "#b8141b";
const CHALK = "#dfe6ee";

export function buildDecorations(root: THREE.Object3D, dyn: THREE.Object3D, animated: ((dt: number, time: number) => void)[]): void {
  const r = seeded(2025);

  // --- Pintadas: mensajes del sector y flechas que llevan al mejorador y a la energía ---
  const texts: { x: number; z: number; nx: number; nz: number; y: number; text: string; color: string; w: number; arrow?: "left" | "right" }[] = [
    { x: -6.5, z: 8, nx: 0, nz: 1, y: 1.7, text: "ELLOS VIENEN", color: RED, w: 3.0 },
    { x: -8, z: 15.6, nx: 1, nz: 0, y: 1.6, text: "NO SALGAS", color: RED, w: 2.4 },
    { x: 5, z: -5.6, nx: -1, nz: 0, y: 2.4, text: "SECTOR 09", color: CHALK, w: 2.6 },
    { x: 5, z: -5.6, nx: -1, nz: 0, y: 1.6, text: "CUARENTENA", color: CHALK, w: 2.6 },
    { x: -5.5, z: -24, nx: 0, nz: 1, y: 1.9, text: "AYUDA", color: RED, w: 2.0 },
    { x: 5.5, z: -24, nx: 0, nz: 1, y: 1.7, text: "NO HAY SALIDA", color: CHALK, w: 3.0 },
    { x: -14, z: -21.6, nx: 1, nz: 0, y: 2.0, text: "MEJORADOR", color: "#3ac8ff", w: 2.7, arrow: "left" },
    { x: -14, z: -10, nx: 1, nz: 0, y: 1.8, text: "CORRE", color: RED, w: 1.9 },
    { x: 14, z: -22, nx: 1, nz: 0, y: 1.9, text: "ARMERÍA", color: CHALK, w: 2.2 },
    { x: 4, z: -38, nx: 0, nz: 1, y: 1.8, text: "ACTIVA LA ENERGÍA", color: "#ffb03a", w: 3.4, arrow: "left" },
    { x: -9, z: -38, nx: 0, nz: 1, y: 2.3, text: "DEPÓSITO 3", color: CHALK, w: 2.0 },
    { x: -25.8, z: -6, nx: 1, nz: 0, y: 2.6, text: "SECTOR 09 · NO PASAR", color: RED, w: 5.0 },
    { x: 25.8, z: -26, nx: -1, nz: 0, y: 2.6, text: "NO HAY EVACUACIÓN", color: RED, w: 5.0 },
    { x: 8, z: 19.8, nx: 0, nz: -1, y: 2.4, text: "QUÉDATE ADENTRO", color: CHALK, w: 4.0 },
  ];
  for (const t of texts) wallDecal(root, t.x, t.z, t.nx, t.nz, t.y, `txt${t.text}${t.color}`, graffitiTexture(t.text, t.color, t.arrow ?? ""), t.w, t.w / 4);

  // Manos ensangrentadas y arañazos.
  const hand = handTexture();
  const claw = clawTexture();
  for (const [x, z, nx, nz, y] of [[-5.1, -24, 0, 1, 1.2], [-4.7, -24, 0, 1, 0.95], [-8, 10, 1, 0, 1.1], [5, -3.4, -1, 0, 1.3], [-20, -3, 1, 0, 1.2], [12, -4, -1, 0, 1.1], [-12, -38, 0, 1, 1.4]] as const) {
    wallDecal(root, x, z, nx, nz, y, "hand", hand, 0.5, 0.5, (r() - 0.5) * 0.5);
  }
  for (const [x, z, nx, nz, y] of [[-14, -12.5, 1, 0, 1.4], [14, -14, 1, 0, 1.2], [-23, -16, 1, 0, 1.5], [12, -6, -1, 0, 1.3], [-8, 17, 1, 0, 1.3], [5, 5, -1, 0, 1.5]] as const) {
    wallDecal(root, x, z, nx, nz, y, "claw", claw, 0.8, 0.8, (r() - 0.5) * 0.4);
  }

  // --- Sangre en el suelo: charcos repartidos por los recintos y rastros de arrastre ---
  const open = [{ name: "CALLE", x0: -5, z0: -8, x1: 5, z1: 8 }, ...ROOMS];
  const area = open.map((q) => (q.x1 - q.x0) * (q.z1 - q.z0));
  const total = area.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 64; i++) {
    let pick = r() * total;
    let k = 0;
    while (k < open.length - 1 && pick > area[k]) pick -= area[k++];
    const q = open[k];
    floorDecal(root, q.x0 + 0.8 + r() * (q.x1 - q.x0 - 1.6), q.z0 + 0.8 + r() * (q.z1 - q.z0 - 1.6), 0.8 + r() * 2.0, Math.floor(r() * 4), r() * 6.28);
  }
  const trails: [number, number, number, number][] = [
    [-2, 6, -3, -2], [10, -14, 4, -20], [-16, 2, -16, -9], [3, -27, 0, -31], [17, -15, 19, -20], [-5, 14, 2, 10], [-18, -22, -16, -15],
  ];
  for (const [x0, z0, x1, z1] of trails) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      floorDecal(root, x0 + (x1 - x0) * t + (r() - 0.5) * 0.5, z0 + (z1 - z0) * t + (r() - 0.5) * 0.5, 0.45 + r() * 0.5 + (1 - t) * 0.4, Math.floor(r() * 4), r() * 6.28);
    }
  }

  // --- Marcas de la calzada: línea central discontinua y paso de peatones ---
  const dash = dashTexture();
  const lineMat = new THREE.MeshStandardMaterial({ map: dash, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const line = (x: number, z0: number, z1: number) => {
    const len = Math.abs(z1 - z0);
    const geo = new THREE.PlaneGeometry(0.2, len);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 3));
    const m = new THREE.Mesh(geo, lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, (z0 + z1) / 2);
    root.add(m);
  };
  line(0, 7.5, -7.5);
  line(0, -24.5, -31.5);
  const zebra = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.85, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (let i = -4; i <= 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 2.4), zebra);
    m.rotation.x = -Math.PI / 2;
    m.position.set(i * 1.05, 0.021, 6.2);
    root.add(m);
  }
  // Borde de la acera (bordillo) a lo largo de la calle.
  const curb = new THREE.MeshStandardMaterial({ color: 0x6e6c66, roughness: 0.9 });
  for (const sx of [-4.7, 4.7]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 15.8), curb);
    c.position.set(sx, 0.06, 0);
    root.add(c);
  }

  // --- Charcos que reflejan el cielo ---
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x06090d, roughness: 0.02, metalness: 0.15, transparent: true, opacity: 0.78, alphaMap: puddleTexture(), envMapIntensity: 2.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const spots: [number, number, number][] = [
    [-2.5, 10, 2.2], [3, 14, 1.8], [1.5, 1, 2.4], [-3, -6, 1.8], [8, -12, 2.6], [-6, -18, 2.2], [3, -21, 3.0], [11, -9, 1.6],
    [-10, 13, 2.0], [-17, 0, 1.8], [-1, -29, 2.2], [4, -26, 1.6], [-5, 16, 1.6], [6, 4, 1.4], [0, -10.5, 2.2],
  ];
  for (const [x, z, s] of spots) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s * 1.4, s), puddleMat);
    m.rotation.set(-Math.PI / 2, 0, r() * 3.14);
    m.position.set(x, 0.028, z);
    root.add(m);
  }

  // Basura que el viento arrastra: hojas de papel sueltas que giran un poco (dinámico).
  const paperMat = new THREE.MeshBasicMaterial({ color: 0xb8b09c, side: THREE.DoubleSide });
  const papers: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), paperMat);
    p.position.set((r() - 0.5) * 44, 0.05, -34 + r() * 52);
    p.rotation.set(-Math.PI / 2, 0, r() * 6.28);
    dyn.add(p);
    papers.push(p);
  }
  animated.push((dt, time) => {
    papers.forEach((p, i) => {
      // Ráfagas: de vez en cuando levantan los papeles y los llevan un trecho.
      const gust = Math.max(0, Math.sin(time * 0.35 + i * 1.3) - 0.8) * 5;
      if (gust > 0) {
        p.position.x += gust * dt * 2.2;
        p.position.z += Math.sin(time * 3 + i) * gust * dt;
        p.position.y = 0.05 + gust * 0.12 + Math.abs(Math.sin(time * 5 + i)) * gust * 0.08;
        p.rotation.z += dt * gust * 4;
        p.rotation.x = -Math.PI / 2 + Math.sin(time * 7 + i) * 0.5 * gust;
        if (p.position.x > 25) p.position.x = -25;
      } else {
        p.position.y = Math.max(0.03, p.position.y - dt * 0.4);
        p.rotation.x += (-Math.PI / 2 - p.rotation.x) * Math.min(1, dt * 4);
      }
    });
  });
}
