// Modelos 3D de las armas, construidos con código: siluetas de perfil extruidas (receptor, culata, cargador),
// cañones torneados y piezas con bordes biselados que atrapan el reflejo del entorno. El mismo modelo sirve para
// la primera persona (con manos), para el arma que flota en la caja y el mejorador, y para los demás jugadores.
// La versión mejorada cambia el metal por uno de color brillante y añade tiras luminosas que laten.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { WEAPONS, UPGRADED, type WeaponId } from "./defs";

export interface WeaponModel {
  group: THREE.Group;
  /** Boca del cañón y expulsión de vainas, en el espacio del modelo. */
  muzzle: THREE.Vector3;
  eject: THREE.Vector3;
  /** Materiales luminosos de la versión mejorada (laten con el tiempo). */
  glow: THREE.MeshStandardMaterial[];
  /** Pieza que se desliza al disparar (corredera, cerrojo…), si el arma la tiene. */
  slide: THREE.Object3D | null;
}

type Pt = [number, number];

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function cached(key: string, make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

export function disposeWeaponAssets(): void {
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
}

/** Perfil lateral (adelante, arriba) extruido a lo ancho: la silueta real de una pieza. */
function slabGeometry(pts: Pt[], width: number, bevel = 0.003): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  pts.forEach(([f, y], i) => (i ? shape.lineTo(f, y) : shape.moveTo(f, y)));
  shape.closePath();
  const depth = Math.max(0.002, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

class Builder {
  readonly g = new THREE.Group();
  readonly glow: THREE.MeshStandardMaterial[] = [];
  readonly steel: THREE.MeshStandardMaterial;
  readonly dark: THREE.MeshStandardMaterial;
  readonly poly: THREE.MeshStandardMaterial;
  readonly wood: THREE.MeshStandardMaterial;
  readonly brass: THREE.MeshStandardMaterial;
  readonly lens: THREE.MeshStandardMaterial;
  readonly accentMat: THREE.MeshStandardMaterial;

  constructor(readonly up: boolean, readonly tint: number, readonly id: WeaponId) {
    const t = new THREE.Color(tint);
    const dim = (k: number) => t.clone().multiplyScalar(k).getHex();
    this.steel = up
      ? cached(`steelU${tint}`, () => new THREE.MeshStandardMaterial({ color: dim(0.55), roughness: 0.18, metalness: 1 }))
      : cached("steel", () => new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.46, metalness: 0.82 }));
    this.dark = up
      ? cached(`darkU${tint}`, () => new THREE.MeshStandardMaterial({ color: dim(0.14), roughness: 0.4, metalness: 0.85 }))
      : cached("dark", () => new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.5, metalness: 0.8 }));
    this.poly = up
      ? cached(`polyU${tint}`, () => new THREE.MeshStandardMaterial({ color: dim(0.08), roughness: 0.55, metalness: 0.3 }))
      : cached("poly", () => new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.82, metalness: 0.1 }));
    this.wood = up ? this.poly : cached("wood", () => new THREE.MeshStandardMaterial({ color: 0x74481f, roughness: 0.62, metalness: 0.04 }));
    this.brass = cached("brass", () => new THREE.MeshStandardMaterial({ color: 0xb88a3c, roughness: 0.32, metalness: 1 }));
    this.lens = cached("lens", () => new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x3a9bff, emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.6 }));
    this.accentMat = cached(`glow${tint}`, () => new THREE.MeshStandardMaterial({ color: dim(0.2), emissive: tint, emissiveIntensity: 2.4, roughness: 0.3 }));
    if (up) this.glow.push(this.accentMat);
  }

  private put<T extends THREE.Object3D>(o: T, x: number, y: number, f: number): T {
    o.position.set(x, y, -f);
    this.g.add(o);
    return o;
  }

  /** Pieza extruida desde un perfil. */
  slab(pts: Pt[], w: number, m: THREE.Material, x = 0, y = 0, f = 0, bevel = 0.003): THREE.Mesh {
    return this.put(new THREE.Mesh(slabGeometry(pts, w, bevel), m), x, y, f);
  }

  /** Caja con bordes redondeados, centrada en (x, y, f). */
  box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, f: number, r = 0.004): THREE.Mesh {
    return this.put(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), m), x, y, f);
  }

  /** Cilindro a lo largo del cañón desde `f0` hasta `f0 + len`. */
  cyl(r: number, len: number, m: THREE.Material, x: number, y: number, f0: number, seg = 14, r2 = r): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(r2, r, len, seg);
    geo.rotateX(-Math.PI / 2);
    return this.put(new THREE.Mesh(geo, m), x, y, f0 + len / 2);
  }

  /** Anillo alrededor del cañón. */
  ring(r: number, tube: number, m: THREE.Material, x: number, y: number, f: number): THREE.Mesh {
    const geo = new THREE.TorusGeometry(r, tube, 8, 16);
    return this.put(new THREE.Mesh(geo, m), x, y, f);
  }

  /** Tira luminosa de la versión mejorada (en la normal, un detalle oscuro). */
  accent(w: number, h: number, d: number, x: number, y: number, f: number): void {
    this.box(w, h, d, this.up ? this.accentMat : this.dark, x, y, f, 0.001);
  }

  /** Guantes y antebrazos de primera persona. */
  hands(rightF: number, leftF: number, leftY: number): void {
    const glove = cached("glove", () => new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.95, metalness: 0.02 }));
    const cloth = cached("cloth", () => new THREE.MeshStandardMaterial({ color: 0x2f3629, roughness: 1 }));
    const strap = cached("strap", () => new THREE.MeshStandardMaterial({ color: 0x8a1f1a, roughness: 0.9 }));
    const rh = this.box(0.085, 0.1, 0.12, glove, 0.012, -0.045, rightF, 0.02);
    rh.rotation.x = 0.2;
    const ra = this.box(0.095, 0.095, 0.4, cloth, 0.04, -0.12, rightF - 0.24, 0.025);
    ra.rotation.set(0.5, 0.1, 0);
    this.box(0.1, 0.03, 0.05, strap, 0.04, -0.12, rightF - 0.1, 0.01).rotation.set(0.5, 0.1, 0);
    const lh = this.box(0.09, 0.085, 0.13, glove, -0.012, leftY, leftF, 0.02);
    lh.rotation.x = -0.05;
    const la = this.box(0.095, 0.09, 0.46, cloth, -0.085, leftY - 0.09, leftF - 0.28, 0.025);
    la.rotation.set(0.34, -0.5, 0.12);
    for (let i = 0; i < 3; i++) this.box(0.02, 0.022, 0.05, glove, -0.012 + i * 0.001, leftY + 0.048, leftF + 0.04 - i * 0.032, 0.006);
  }
}

/** Corredera, cerrojo… que el disparo empuja hacia atrás. */
function mark(o: THREE.Object3D): THREE.Object3D {
  o.name = "slide";
  return o;
}

// --- Cada arma ------------------------------------------------------------------------------------
// Ejes: el origen está en la empuñadura, el cañón apunta a −Z (la «f» de los helpers es hacia delante) y la
// línea de mira va a y ≈ 0,05.
function pistol(b: Builder): { muzzle: number; eject: [number, number, number]; left: [number, number] } {
  // Armazón de polímero con el guardamonte y la empuñadura.
  b.slab([[-0.075, 0.012], [0.19, 0.012], [0.19, 0.04], [0.02, 0.045], [-0.075, 0.045]], 0.03, b.poly);
  b.slab([[0.0, 0.014], [0.07, 0.014], [0.07, -0.012], [0.05, -0.03], [0.012, -0.03], [0.0, -0.01]], 0.022, b.poly); // guardamonte
  b.slab([[-0.078, 0.03], [-0.012, 0.03], [0.004, -0.128], [-0.066, -0.14]], 0.034, b.poly, 0, 0, 0, 0.004);
  for (let i = 0; i < 4; i++) b.accent(0.037, 0.006, 0.05, 0, -0.01 - i * 0.026, -0.036 + i * 0.002);
  b.box(0.034, 0.012, 0.075, b.dark, 0, -0.147, -0.034); // culatín del cargador
  b.box(0.01, 0.034, 0.012, b.dark, 0, 0.0, 0.034); // gatillo
  // Corredera de acero con muescas y miras.
  const slide = new THREE.Group();
  const s = new THREE.Mesh(slabGeometry([[-0.075, 0.04], [0.205, 0.04], [0.205, 0.078], [0.1, 0.084], [-0.075, 0.078]], 0.03, 0.004), b.steel);
  slide.add(s);
  for (let i = 0; i < 5; i++) {
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.036, 0.003), b.dark);
    n.position.set(0, 0.062, 0.062 - i * 0.008);
    slide.add(n);
  }
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.012), b.dark);
  front.position.set(0, 0.088, -0.195);
  slide.add(front);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.01), b.dark);
  rear.position.set(0, 0.086, 0.068);
  slide.add(rear);
  slide.position.z = 0;
  mark(slide);
  b.g.add(slide);
  b.cyl(0.0095, 0.03, b.dark, 0, 0.056, 0.2);
  b.accent(0.032, 0.004, 0.12, 0, 0.0385, 0.06);
  return { muzzle: 0.235, eject: [0.02, 0.08, 0.0], left: [0.025, -0.075] };
}

function revolver(b: Builder): { muzzle: number; eject: [number, number, number]; left: [number, number] } {
  b.slab([[-0.075, -0.015], [0.04, -0.015], [0.075, 0.0], [0.075, 0.075], [-0.03, 0.095], [-0.07, 0.06]], 0.028, b.steel);
  // Tambor con estrías.
  const drum = b.cyl(0.043, 0.075, b.steel, 0, 0.04, 0.0);
  drum.position.z = -0.045;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    const c = b.cyl(0.0095, 0.077, b.dark, Math.cos(a) * 0.036, 0.04 + Math.sin(a) * 0.036, 0.0, 8);
    c.position.z = -0.045;
  }
  b.cyl(0.016, 0.24, b.steel, 0, 0.07, 0.07);
  b.box(0.026, 0.026, 0.2, b.steel, 0, 0.038, 0.19, 0.003); // camisa inferior del cañón
  b.cyl(0.011, 0.012, b.dark, 0, 0.07, 0.309);
  b.box(0.006, 0.014, 0.014, b.dark, 0, 0.095, 0.3);
  b.box(0.01, 0.026, 0.03, b.dark, 0, 0.108, -0.066).rotation.x = -0.5; // martillo
  b.slab([[-0.075, 0.02], [-0.012, 0.02], [0.012, -0.12], [-0.06, -0.145], [-0.095, -0.07]], 0.034, b.wood, 0, 0, 0, 0.005);
  b.accent(0.03, 0.006, 0.18, 0, 0.0955, 0.12);
  return { muzzle: 0.322, eject: [0.0, 0.04, -0.045], left: [0.0, -0.09] };
}

function smg(b: Builder): { muzzle: number; eject: [number, number, number]; left: [number, number] } {
  b.box(0.052, 0.075, 0.34, b.poly, 0, 0.045, 0.08, 0.008); // receptor
  b.box(0.044, 0.03, 0.26, b.steel, 0, 0.098, 0.07, 0.005); // tapa
  b.cyl(0.027, 0.2, b.dark, 0, 0.056, 0.24, 14); // cubierta del cañón
  for (let i = 0; i < 5; i++) b.ring(0.028, 0.004, b.steel, 0, 0.056, 0.27 + i * 0.035);
  b.cyl(0.011, 0.07, b.steel, 0, 0.056, 0.44, 10);
  b.cyl(0.015, 0.03, b.dark, 0, 0.056, 0.495, 10, 0.012);
  b.slab([[-0.04, 0.0], [0.0, 0.0], [0.016, -0.14], [-0.03, -0.15]], 0.034, b.poly); // empuñadura
  b.slab([[0.1, 0.0], [0.145, 0.0], [0.14, -0.17], [0.098, -0.17]], 0.04, b.dark, 0, 0.0, 0.0, 0.003); // cargador recto
  b.box(0.046, 0.016, 0.052, b.steel, 0, -0.17, 0.12, 0.003);
  b.slab([[0.28, 0.01], [0.32, 0.01], [0.325, -0.1], [0.285, -0.1]], 0.03, b.poly); // asa delantera
  // Culata de varilla plegable.
  b.box(0.01, 0.01, 0.15, b.steel, 0.02, 0.07, -0.16, 0.002);
  b.box(0.01, 0.01, 0.15, b.steel, -0.02, 0.07, -0.16, 0.002);
  b.box(0.05, 0.075, 0.016, b.poly, 0, 0.065, -0.245, 0.004);
  // Mira de punto rojo.
  b.box(0.034, 0.036, 0.06, b.dark, 0, 0.14, 0.04, 0.006);
  b.box(0.024, 0.024, 0.004, b.lens, 0, 0.142, 0.012, 0.001);
  b.accent(0.046, 0.008, 0.2, 0, 0.083, 0.08);
  mark(b.box(0.04, 0.02, 0.07, b.steel, 0.0, 0.07, 0.0, 0.003));
  return { muzzle: 0.51, eject: [0.03, 0.08, 0.04], left: [0.3, -0.055] };
}

function shotgun(b: Builder): { muzzle: number; eject: [number, number, number]; left: [number, number] } {
  b.slab([[-0.06, 0.0], [0.15, 0.0], [0.15, 0.09], [-0.06, 0.11]], 0.045, b.steel, 0, 0, 0, 0.004); // receptor
  b.cyl(0.0185, 0.52, b.dark, 0, 0.065, 0.1, 14); // cañón
  b.cyl(0.0165, 0.4, b.steel, 0, 0.022, 0.1, 12); // tubo del cargador
  b.cyl(0.021, 0.014, b.steel, 0, 0.022, 0.5, 12);
  b.box(0.006, 0.014, 0.014, b.brass, 0, 0.093, 0.605); // punto de mira
  b.cyl(0.012, 0.012, b.dark, 0, 0.065, 0.62, 10);
  // Cañón bombeable de madera con estrías.
  const pump = b.box(0.062, 0.058, 0.2, b.wood, 0, 0.034, 0.34, 0.012);
  for (let i = 0; i < 6; i++) b.box(0.064, 0.058, 0.004, b.dark, 0, 0.034, 0.25 + i * 0.032, 0.001);
  mark(pump);
  // Culata y empuñadura de madera.
  b.slab([[-0.06, 0.1], [-0.3, 0.07], [-0.32, -0.06], [-0.27, -0.08], [-0.06, 0.0]], 0.04, b.wood, 0, 0, 0, 0.006);
  b.box(0.044, 0.05, 0.012, b.dark, 0, 0.0, -0.318, 0.003);
  b.slab([[-0.075, 0.0], [-0.03, 0.0], [-0.015, -0.12], [-0.06, -0.13]], 0.034, b.wood, 0, 0, 0, 0.004);
  b.slab([[0.0, 0.0], [0.07, 0.0], [0.07, -0.025], [0.04, -0.04], [0.0, -0.02]], 0.014, b.steel); // guardamonte
  b.accent(0.048, 0.006, 0.17, 0, 0.114, 0.045);
  b.box(0.01, 0.02, 0.04, b.dark, 0.026, 0.07, 0.07); // ventana de expulsión
  return { muzzle: 0.632, eject: [0.03, 0.07, 0.06], left: [0.34, -0.005] };
}

function rifle(b: Builder): { muzzle: number; eject: [number, number, number]; left: [number, number] } {
  b.slab([[-0.09, 0.0], [0.19, 0.0], [0.19, 0.095], [-0.09, 0.1]], 0.044, b.dark, 0, 0, 0, 0.004); // receptor inferior
  b.box(0.04, 0.05, 0.3, b.steel, 0, 0.12, 0.05, 0.005); // tapa superior
  b.box(0.044, 0.016, 0.32, b.steel, 0, 0.152, 0.045, 0.002); // riel
  for (let i = 0; i < 9; i++) b.box(0.046, 0.006, 0.008, b.dark, 0, 0.16, -0.08 + i * 0.034, 0.001);
  b.box(0.05, 0.066, 0.3, b.poly, 0, 0.082, 0.34, 0.012); // guardamanos
  for (let i = 0; i < 4; i++) b.box(0.052, 0.012, 0.012, b.dark, 0, 0.082 + 0.0, 0.22 + i * 0.07, 0.002);
  b.cyl(0.0105, 0.18, b.steel, 0, 0.075, 0.49, 10);
  b.cyl(0.016, 0.06, b.dark, 0, 0.075, 0.62, 10); // apagallamas
  b.box(0.006, 0.05, 0.01, b.dark, 0, 0.1, 0.52); // punto de mira
  // Cargador curvo (perfil con arco) y empuñadura.
  b.slab([[0.1, 0.0], [0.15, 0.0], [0.17, -0.1], [0.185, -0.19], [0.13, -0.19], [0.108, -0.1]], 0.036, b.dark, 0, 0, 0, 0.004);
  b.slab([[-0.06, 0.0], [-0.012, 0.0], [0.004, -0.13], [-0.05, -0.145]], 0.034, b.poly);
  // Culata.
  b.slab([[-0.09, 0.09], [-0.34, 0.07], [-0.34, -0.03], [-0.3, -0.07], [-0.09, 0.0]], 0.04, b.poly, 0, 0, 0, 0.005);
  b.box(0.044, 0.1, 0.014, b.dark, 0, 0.0, -0.343, 0.004);
  // Mira holográfica.
  b.box(0.036, 0.05, 0.07, b.dark, 0, 0.19, 0.0, 0.006);
  b.box(0.026, 0.034, 0.004, b.lens, 0, 0.195, -0.034, 0.001);
  b.accent(0.046, 0.01, 0.22, 0, 0.1, 0.06);
  mark(b.box(0.046, 0.028, 0.07, b.steel, 0.0, 0.112, 0.07, 0.002));
  return { muzzle: 0.66, eject: [0.03, 0.1, 0.05], left: [0.34, 0.0] };
}

function lmg(b: Builder): { muzzle: number; eject: [number, number, number]; left: [number, number] } {
  b.box(0.06, 0.11, 0.42, b.dark, 0, 0.065, 0.06, 0.008); // receptor grande
  b.box(0.052, 0.04, 0.36, b.steel, 0, 0.14, 0.07, 0.006); // tapa
  b.cyl(0.03, 0.34, b.steel, 0, 0.07, 0.27, 16); // cubierta del cañón
  for (let i = 0; i < 9; i++) b.box(0.012, 0.012, 0.016, b.dark, 0.03, 0.07, 0.3 + i * 0.03, 0.001);
  b.cyl(0.014, 0.12, b.dark, 0, 0.07, 0.6, 10);
  b.cyl(0.021, 0.04, b.steel, 0, 0.07, 0.72, 10, 0.017);
  b.box(0.006, 0.05, 0.01, b.dark, 0, 0.11, 0.6);
  // Asa de transporte.
  b.box(0.012, 0.05, 0.012, b.steel, 0, 0.19, 0.2);
  b.box(0.012, 0.05, 0.012, b.steel, 0, 0.19, 0.06);
  b.box(0.018, 0.012, 0.17, b.poly, 0, 0.222, 0.13, 0.004);
  // Caja de munición y cinta.
  b.box(0.07, 0.12, 0.14, b.poly, 0.0, -0.095, 0.12, 0.01);
  for (let i = 0; i < 5; i++) b.cyl(0.006, 0.05, b.brass, 0.03, -0.01 + i * 0.0, 0.0, 6).position.set(0.04, -0.04 - i * 0.004, -0.08 - i * 0.012);
  b.slab([[-0.06, 0.0], [-0.012, 0.0], [0.004, -0.13], [-0.05, -0.145]], 0.034, b.poly);
  b.slab([[0.26, 0.0], [0.31, 0.0], [0.32, -0.09], [0.27, -0.09]], 0.03, b.poly);
  // Culata y bípode plegado.
  b.slab([[-0.1, 0.1], [-0.36, 0.08], [-0.37, -0.04], [-0.32, -0.08], [-0.1, 0.0]], 0.042, b.poly, 0, 0, 0, 0.005);
  b.cyl(0.006, 0.18, b.steel, 0.026, 0.02, 0.4, 6);
  b.cyl(0.006, 0.18, b.steel, -0.026, 0.02, 0.4, 6);
  b.accent(0.054, 0.008, 0.26, 0, 0.162, 0.06);
  mark(b.box(0.056, 0.03, 0.08, b.steel, 0.0, 0.118, 0.1, 0.003));
  return { muzzle: 0.745, eject: [0.04, 0.1, 0.06], left: [0.29, -0.04] };
}

function sniper(b: Builder): { muzzle: number; eject: [number, number, number]; left: [number, number] } {
  b.slab([[-0.08, 0.0], [0.2, 0.0], [0.2, 0.07], [-0.08, 0.085]], 0.04, b.steel, 0, 0, 0, 0.004); // receptor
  b.cyl(0.0125, 0.62, b.dark, 0, 0.056, 0.2, 12); // cañón
  b.cyl(0.0155, 0.08, b.steel, 0, 0.056, 0.2, 12, 0.0125);
  b.cyl(0.02, 0.07, b.dark, 0, 0.056, 0.77, 12); // freno de boca
  for (let i = 0; i < 3; i++) b.box(0.044, 0.006, 0.008, b.steel, 0, 0.056, 0.785 + i * 0.02, 0.001);
  // Mira telescópica: tubo, campanas, lentes y monturas.
  b.cyl(0.021, 0.27, b.dark, 0, 0.13, -0.02, 18);
  b.cyl(0.03, 0.06, b.dark, 0, 0.13, 0.25, 18, 0.021);
  b.cyl(0.027, 0.05, b.dark, 0, 0.13, -0.1, 18, 0.021);
  const lens = b.cyl(0.026, 0.004, b.lens, 0, 0.13, 0.31, 18);
  lens.rotation.set(0, 0, 0);
  b.cyl(0.022, 0.004, b.lens, 0, 0.13, -0.15, 18);
  b.box(0.014, 0.05, 0.025, b.steel, 0, 0.1, 0.1);
  b.box(0.014, 0.05, 0.025, b.steel, 0, 0.1, 0.0);
  b.box(0.012, 0.018, 0.012, b.steel, 0, 0.147, 0.1); // torreta
  // Cerrojo.
  const bolt = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), b.steel);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0.03, 0.065, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), b.dark);
  knob.position.set(0.058, 0.055, 0);
  bolt.add(rod, knob);
  bolt.position.set(0, 0, -0.03);
  mark(bolt);
  b.g.add(bolt);
  // Culata con carrillera, cargador y bípode.
  b.slab([[-0.08, 0.085], [-0.2, 0.1], [-0.37, 0.09], [-0.39, -0.07], [-0.33, -0.095], [-0.12, -0.05], [-0.08, 0.0]], 0.046, b.poly, 0, 0, 0, 0.006);
  b.box(0.044, 0.1, 0.014, b.dark, 0, 0.0, -0.392, 0.004);
  b.slab([[-0.07, 0.0], [-0.01, 0.0], [0.006, -0.12], [-0.055, -0.14]], 0.034, b.poly);
  b.box(0.04, 0.05, 0.1, b.dark, 0, -0.025, 0.09, 0.004);
  b.slab([[0.28, 0.02], [0.52, 0.02], [0.52, -0.02], [0.28, -0.02]], 0.036, b.poly, 0, -0.012, 0, 0.004); // guardamanos inferior
  b.cyl(0.005, 0.16, b.steel, 0.022, -0.06, 0.5, 6).rotation.x = -Math.PI / 2 + 0.3;
  b.accent(0.044, 0.006, 0.2, 0, 0.088, 0.06);
  return { muzzle: 0.81, eject: [0.03, 0.075, 0.02], left: [0.4, -0.04] };
}

function pulse(b: Builder): { muzzle: number; eject: [number, number, number]; left: [number, number] } {
  const glow = b.up ? b.accentMat : cached("pulseGlow", () => new THREE.MeshStandardMaterial({ color: 0x0a2a3c, emissive: 0x4ad0ff, emissiveIntensity: 2.6, roughness: 0.25 }));
  if (!b.up) b.glow.push(glow);
  b.slab([[-0.1, -0.005], [0.2, -0.005], [0.32, 0.03], [0.32, 0.1], [0.1, 0.115], [-0.1, 0.09]], 0.055, b.steel, 0, 0, 0, 0.006); // espina central
  b.slab([[-0.1, 0.09], [-0.14, 0.12], [-0.3, 0.12], [-0.34, 0.03], [-0.34, -0.04], [-0.1, 0.0]], 0.05, b.dark, 0, 0, 0, 0.006); // culata de energía
  b.cyl(0.02, 0.5, glow, 0, 0.066, 0.1, 14); // núcleo luminoso
  for (let i = 0; i < 4; i++) b.ring(0.038 - i * 0.002, 0.007, b.dark, 0, 0.066, 0.14 + i * 0.08);
  b.cyl(0.03, 0.1, b.steel, 0, 0.066, 0.52, 14, 0.036);
  // Dos púas delanteras.
  b.slab([[0.5, 0.15], [0.7, 0.07], [0.7, 0.055], [0.5, 0.12]], 0.012, b.steel, 0.03, 0, 0);
  b.slab([[0.5, 0.15], [0.7, 0.07], [0.7, 0.055], [0.5, 0.12]], 0.012, b.steel, -0.03, 0, 0);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), glow);
  b.g.add(tip);
  tip.position.set(0, 0.066, -0.65);
  b.slab([[-0.06, 0.0], [-0.01, 0.0], [0.006, -0.13], [-0.05, -0.145]], 0.034, b.poly);
  b.box(0.07, 0.05, 0.11, b.dark, 0, 0.14, 0.0, 0.01); // celda de energía
  b.box(0.05, 0.03, 0.08, glow, 0, 0.14, 0.0, 0.004);
  b.box(0.06, 0.012, 0.18, b.steel, 0, 0.125, 0.18, 0.003);
  return { muzzle: 0.68, eject: [0, 0, 0], left: [0.3, -0.03] };
}

const MAKERS: Record<WeaponId, (b: Builder) => { muzzle: number; eject: [number, number, number]; left: [number, number] }> = {
  pistol, revolver, smg, shotgun, rifle, lmg, sniper, pulse,
};

/** Construye el modelo de un arma. `hands`: con guantes y antebrazos (primera persona). */
export function buildWeaponModel(id: WeaponId, upgraded: boolean, hands = false): WeaponModel {
  const def = upgraded ? UPGRADED[id] : WEAPONS[id];
  const b = new Builder(upgraded, def.tint, id);
  const spec = MAKERS[id](b);
  if (hands) b.hands(0, spec.left[0], spec.left[1]);
  b.g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  const slide = b.g.getObjectByName("slide") ?? null;
  return {
    group: b.g,
    muzzle: new THREE.Vector3(0, id === "revolver" ? 0.07 : id === "pistol" ? 0.056 : 0.066, -spec.muzzle),
    eject: new THREE.Vector3(...spec.eject).multiply(new THREE.Vector3(1, 1, -1)),
    glow: b.glow,
    slide,
  };
}
