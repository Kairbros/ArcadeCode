// Props de La Granja, El Pueblo y La Terminal: balas de heno, silo, tractor, pozo, abrevadero, árboles, sofá, cama,
// surtidor, máquina expendedora, maletas, taburetes, torre del reloj y barreras de hormigón. Se construyen igual que los
// del SECTOR 09 (cajas y cilindros con materiales compartidos) pero viven aparte para no engordar `map.ts`.
import * as THREE from "three";
import type { MatKind, PropSpec } from "./mapdata";

export interface PropKit {
  /** Añade un objeto al grupo del prop (en su espacio local). */
  add(m: THREE.Object3D, x: number, y: number, z: number): void;
  /** Material liso de un color (compartido). */
  flat(color: number, rough?: number, metal?: number): THREE.MeshStandardMaterial;
  /** Caja con el material del mapa (texturado). */
  box(w: number, h: number, d: number, mat: MatKind): THREE.Mesh;
  /** Material del mapa por nombre. */
  mat(kind: MatKind): THREE.Material;
  /** Colisionador alineado a los ejes en la posición del prop. */
  collide(w: number, d: number, h: number): void;
}

const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt: number, rb: number, h: number, m: THREE.Material, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);

/** Devuelve true si el tipo es uno de estos props (y ya lo ha construido). */
export function buildExtraProp(spec: PropSpec, k: PropKit): boolean {
  const v = spec.v ?? 0;
  const { add, flat, collide } = k;
  switch (spec.kind) {
    case "hay": {
      const straw = flat(0xc2a047, 0.95);
      const band = flat(0x6a4a22, 0.9);
      if (v === 0) {
        // Bala redonda tumbada.
        const bale = cyl(0.78, 0.78, 1.5, straw, 20);
        bale.rotation.z = Math.PI / 2;
        add(bale, 0, 0.8, 0);
        for (const bx of [-0.45, 0.45]) {
          const ring = cyl(0.8, 0.8, 0.05, band, 20);
          ring.rotation.z = Math.PI / 2;
          add(ring, bx, 0.8, 0);
        }
        collide(1.6, 1.6, 1.6);
      } else {
        // Pila de balas cuadradas.
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2 - i; j++) {
          add(box(1.2, 0.55, 0.8, straw), -0.65 + j * 1.3 + i * 0.65, 0.28 + i * 0.56, 0);
          add(box(1.22, 0.06, 0.82, band), -0.65 + j * 1.3 + i * 0.65 - 0.3, 0.28 + i * 0.56, 0);
        }
        collide(2.7, 0.9, 1.15);
      }
      return true;
    }
    case "silo": {
      const steel = k.mat("metal");
      add(cyl(2.4, 2.4, 9, steel, 24), 0, 4.5, 0);
      add(cyl(0.2, 2.4, 1.4, steel, 24), 0, 9.7, 0);
      for (let i = 0; i < 5; i++) add(cyl(2.45, 2.45, 0.12, flat(0x1c1f23, 0.6, 0.7), 24), 0, 1.5 + i * 1.7, 0);
      add(box(0.12, 9, 0.5, flat(0x23262a, 0.7, 0.6)), 2.45, 4.5, 0); // escalera
      collide(4.8, 4.8, 9.5);
      return true;
    }
    case "tractor": {
      const paint = flat(0x9a2a1c, 0.45, 0.35);
      const tire = flat(0x151515, 0.9, 0.05);
      const glass = flat(0x8fb6c9, 0.1, 0.5);
      add(box(1.2, 0.8, 2.1, paint), 0, 0.95, -0.6); // capó y motor
      add(box(1.6, 1.5, 1.4, paint), 0, 1.7, 1.0); // cabina
      add(box(1.5, 0.9, 1.3, glass), 0, 1.9, 1.0);
      add(box(1.9, 0.1, 1.7, paint), 0, 2.5, 1.0); // techo
      add(cyl(0.07, 0.07, 1.0, flat(0x222222), 8), 0.4, 1.9, -1.4); // escape
      for (const sx of [-1, 1]) {
        const big = cyl(0.78, 0.78, 0.5, tire, 18);
        big.rotation.z = Math.PI / 2;
        add(big, sx * 1.0, 0.78, 1.15);
        const hub = cyl(0.3, 0.3, 0.52, flat(0xd2b03a, 0.5, 0.5), 12);
        hub.rotation.z = Math.PI / 2;
        add(hub, sx * 1.0, 0.78, 1.15);
        const small = cyl(0.42, 0.42, 0.3, tire, 14);
        small.rotation.z = Math.PI / 2;
        add(small, sx * 0.75, 0.42, -1.4);
      }
      collide(2.5, 3.8, 2.6);
      return true;
    }
    case "well": {
      add(cyl(0.9, 0.95, 1.0, k.mat("concrete"), 16), 0, 0.5, 0);
      add(cyl(0.7, 0.7, 0.04, flat(0x0b1a1a, 0.1, 0.3), 16), 0, 0.98, 0);
      for (const sx of [-0.85, 0.85]) add(box(0.1, 2.2, 0.1, k.mat("wood")), sx, 1.6, 0);
      add(box(2.0, 0.1, 1.3, flat(0x5a3a22, 0.8)), 0, 2.7, 0);
      add(cyl(0.05, 0.05, 1.8, flat(0x2a2a2a), 6), 0, 2.2, 0);
      collide(2.0, 2.0, 1.1);
      return true;
    }
    case "trough": {
      add(box(2.6, 0.6, 0.8, k.mat("wood")), 0, 0.3, 0);
      add(box(2.4, 0.04, 0.6, flat(0x16323a, 0.1, 0.3)), 0, 0.58, 0);
      collide(2.7, 0.9, 0.65);
      return true;
    }
    case "tree": {
      const bark = flat(0x3a2a1c, 0.95);
      const leaf = [0xa8541c, 0x8a6a22, 0x6b3a18, 0x93481a][v % 4];
      add(cyl(0.22, 0.32, 3.2, bark, 8), 0, 1.6, 0);
      for (const [lx, ly, lz, r] of [[0, 3.6, 0, 1.5], [0.9, 3.2, 0.5, 1.0], [-0.8, 3.3, -0.5, 1.1], [0.2, 4.4, -0.2, 0.9]] as const) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), flat(leaf, 0.95));
        add(blob, lx, ly, lz);
      }
      for (const a of [0.6, 2.4, 4.2]) {
        const branch = cyl(0.05, 0.1, 1.2, bark, 6);
        branch.rotation.z = 1.0;
        branch.rotation.y = a;
        add(branch, Math.cos(a) * 0.5, 2.6, Math.sin(a) * 0.5);
      }
      collide(0.7, 0.7, 3.2);
      return true;
    }
    case "sofa": {
      const cloth = flat([0x6a3a30, 0x3a4a5a, 0x5a5a3a][v % 3], 0.95);
      add(box(2.1, 0.45, 0.9, cloth), 0, 0.25, 0);
      add(box(2.1, 0.7, 0.25, cloth), 0, 0.65, -0.38);
      for (const sx of [-1.0, 1.0]) add(box(0.2, 0.6, 0.9, cloth), sx, 0.5, 0);
      collide(2.2, 0.95, 0.9);
      return true;
    }
    case "bed": {
      add(box(2.0, 0.35, 1.2, k.mat("wood")), 0, 0.2, 0);
      add(box(1.9, 0.2, 1.1, flat(0xb8b2a2, 0.95)), 0, 0.48, 0);
      add(box(0.5, 0.14, 0.9, flat(0xd8d4c8, 0.95)), -0.7, 0.62, 0);
      add(box(0.12, 0.9, 1.2, k.mat("wood")), -1.0, 0.6, 0);
      collide(2.1, 1.3, 0.7);
      return true;
    }
    case "pump": {
      const paint = flat([0xc23a2a, 0x2a6aa8][v % 2], 0.4, 0.4);
      add(box(0.7, 1.5, 0.45, paint), 0, 0.8, 0);
      add(box(0.5, 0.3, 0.05, flat(0x66ffaa, 0.3, 0.1)), 0, 1.3, 0.25);
      add(box(0.8, 0.12, 0.55, flat(0x1a1a1a, 0.6, 0.5)), 0, 1.58, 0);
      add(box(0.9, 0.12, 0.7, k.mat("concrete")), 0, 0.06, 0);
      collide(0.9, 0.7, 1.6);
      return true;
    }
    case "vending": {
      add(box(0.95, 1.9, 0.8, flat([0xb82a2a, 0x2a4ab8, 0x2ab86a][v % 3], 0.4, 0.4)), 0, 0.95, 0);
      add(box(0.7, 1.2, 0.04, flat(0xffe8b0, 0.3, 0.1)), 0, 1.15, 0.41);
      add(box(0.5, 0.2, 0.1, flat(0x14161a, 0.6, 0.5)), 0, 0.3, 0.4);
      collide(1.0, 0.85, 1.9);
      return true;
    }
    case "luggage": {
      const cols = [0x6a2a2a, 0x2a3a5a, 0x3a5a3a, 0x5a4a22];
      add(box(0.7, 0.45, 0.25, flat(cols[v % 4], 0.8)), 0, 0.23, 0);
      add(box(0.55, 0.38, 0.22, flat(cols[(v + 1) % 4], 0.8)), 0.1, 0.64, 0.02);
      add(box(0.6, 0.4, 0.3, flat(cols[(v + 2) % 4], 0.8)), -0.8, 0.2, 0.1);
      collide(2.0, 0.6, 0.8);
      return true;
    }
    case "stool": {
      add(cyl(0.2, 0.2, 0.08, flat(0x7a2a24, 0.7), 12), 0, 0.72, 0);
      add(cyl(0.04, 0.05, 0.7, flat(0x8c9096, 0.3, 0.9), 8), 0, 0.36, 0);
      add(cyl(0.18, 0.18, 0.04, flat(0x8c9096, 0.3, 0.9), 12), 0, 0.03, 0);
      return true;
    }
    case "clocktower": {
      add(box(6, 12, 6, k.mat("plaster")), 0, 6, 0);
      add(box(6.6, 0.6, 6.6, flat(0x2a2622, 0.8)), 0, 12.3, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 3.4, 4), flat(0x3a2a24, 0.8));
      roof.rotation.y = Math.PI / 4;
      add(roof, 0, 14.3, 0);
      const face = cyl(1.4, 1.4, 0.1, flat(0xf0e6c8, 0.5), 24);
      face.rotation.x = Math.PI / 2;
      add(face, 0, 9.8, 3.06);
      add(box(0.12, 1.1, 0.05, flat(0x111111)), 0, 10.2, 3.15);
      add(box(0.9, 0.12, 0.05, flat(0x111111)), 0.4, 9.8, 3.15);
      collide(6.2, 6.2, 12);
      return true;
    }
    case "jersey": {
      add(box(2.6, 0.45, 0.6, k.mat("concrete")), 0, 0.22, 0);
      add(box(2.6, 0.45, 0.3, k.mat("concrete")), 0, 0.68, 0);
      add(box(2.4, 0.08, 0.04, flat(0xd8a02a, 0.5)), 0, 0.6, 0.31);
      collide(2.7, 0.7, 0.9);
      return true;
    }
    default:
      return false;
  }
}
