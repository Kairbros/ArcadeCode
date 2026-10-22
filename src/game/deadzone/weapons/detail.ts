// Realismo de las armas: texturas de superficie (acero cepillado, polímero granulado, madera con veta, tela y cuero) y las
// piezas pequeñas que hacen creíble un arma de cerca (tornillos, ranuras de riel, serraciones, muescas, cargadores con
// nervios, cartuchos, guardamonte, miras con orejas, bocachas ranuradas…) y las manos con dedos. Todo se añade encima de la
// silueta de `model.ts` sin mover nada de lo que fija la línea de mira (`SIGHTS`).
import * as THREE from "three";
import type { WeaponId } from "./defs";
import type { Builder } from "./model";

// --- Texturas de superficie ------------------------------------------------------------------------------------
interface Surfaces {
  metalRough: THREE.CanvasTexture;
  metalBump: THREE.CanvasTexture;
  stipple: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
  cloth: THREE.CanvasTexture;
  leather: THREE.CanvasTexture;
}

let surfaces: Surfaces | null = null;

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, srgb = false, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  let a = 0x9e3779b9;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  draw(g, r);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getSurfaces(): Surfaces {
  if (surfaces) return surfaces;
  const metalLines = (g: CanvasRenderingContext2D, r: () => number, base: number) => {
    g.fillStyle = `rgb(${base},${base},${base})`;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 520; i++) {
      const v = base + (r() - 0.5) * 90;
      g.strokeStyle = `rgba(${v},${v},${v},${0.18 + r() * 0.4})`;
      g.lineWidth = 0.5 + r() * 1.2;
      const y = r() * 256;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y + (r() - 0.5) * 4);
      g.stroke();
    }
    for (let i = 0; i < 700; i++) {
      const v = base + (r() - 0.5) * 120;
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1);
    }
  };
  surfaces = {
    metalRough: canvasTex(256, (g, r) => metalLines(g, r, 128), false, 2),
    metalBump: canvasTex(256, (g, r) => metalLines(g, r, 140), false, 2),
    stipple: canvasTex(128, (g, r) => {
      g.fillStyle = "rgb(128,128,128)";
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 5) {
        for (let x = 0; x < 128; x += 5) {
          const v = 70 + r() * 150;
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.beginPath();
          g.arc(x + (y % 10 ? 2.5 : 0) + r(), y + r(), 1.4 + r() * 0.8, 0, Math.PI * 2);
          g.fill();
        }
      }
    }, false, 3),
    wood: canvasTex(256, (g, r) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#6b3f1c");
      grad.addColorStop(0.5, "#8a5427");
      grad.addColorStop(1, "#5e3517");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 160; i++) {
        const y = r() * 256;
        const dark = r() < 0.6;
        g.strokeStyle = dark ? `rgba(30,16,6,${0.1 + r() * 0.35})` : `rgba(190,130,70,${0.08 + r() * 0.2})`;
        g.lineWidth = 0.6 + r() * 2.2;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(80, y + (r() - 0.5) * 18, 170, y + (r() - 0.5) * 18, 256, y + (r() - 0.5) * 10);
        g.stroke();
      }
      for (let i = 0; i < 3; i++) {
        g.fillStyle = "rgba(34,18,8,0.5)";
        g.beginPath();
        g.ellipse(r() * 256, r() * 256, 5 + r() * 6, 2 + r() * 3, 0, 0, Math.PI * 2);
        g.fill();
      }
    }, true, 1),
    cloth: canvasTex(128, (g, r) => {
      g.fillStyle = "rgb(120,120,120)";
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 128; i += 3) {
        g.fillStyle = `rgba(${r() < 0.5 ? 60 : 200},${r() < 0.5 ? 60 : 200},${r() < 0.5 ? 60 : 200},0.4)`;
        g.fillRect(i, 0, 1.5, 128);
        g.fillRect(0, i, 128, 1.5);
      }
    }, false, 4),
    leather: canvasTex(128, (g, r) => {
      g.fillStyle = "rgb(128,128,128)";
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) {
        const v = 90 + r() * 90;
        g.fillStyle = `rgba(${v},${v},${v},0.7)`;
        g.beginPath();
        g.arc(r() * 128, r() * 128, 0.8 + r() * 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }, false, 3),
  };
  return surfaces;
}

export function disposeDetailAssets(): void {
  if (!surfaces) return;
  for (const t of Object.values(surfaces)) t.dispose();
  surfaces = null;
}

/** Pone a los materiales del arma sus mapas de rugosidad, relieve y veta. */
export function applySurfaces(b: Builder): void {
  const s = getSurfaces();
  for (const m of [b.steel, b.dark]) {
    m.roughnessMap = s.metalRough;
    m.bumpMap = s.metalBump;
    m.bumpScale = 0.5;
    m.envMapIntensity = 1.5;
  }
  b.poly.bumpMap = s.stipple;
  b.poly.bumpScale = 1.4;
  b.poly.roughnessMap = s.stipple;
  if (b.wood !== b.poly) {
    b.wood.map = s.wood;
    b.wood.color.setHex(0xffffff);
    b.wood.bumpMap = s.wood;
    b.wood.bumpScale = 0.6;
  }
  b.brass.roughnessMap = s.metalRough;
  b.brass.envMapIntensity = 1.8;
}

// --- Piezas pequeñas ------------------------------------------------------------------------------------------
class Parts {
  constructor(private readonly b: Builder) {}

  /** Cabeza de tornillo (cilindro corto en el eje X, a un lado). */
  screw(x: number, y: number, f: number, r = 0.0045): void {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.004, 8), this.b.steel);
    m.rotation.z = Math.PI / 2;
    this.b.put(m, x, y, f);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.0045, r * 1.6, 0.0012), this.b.dark);
    this.b.put(slot, x + Math.sign(x) * 0.0014, y, f);
  }

  /** Cilindro a lo ancho (eje X): pasadores, botones, tambores laterales. */
  pin(x: number, y: number, f: number, r: number, len: number, mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    m.rotation.z = Math.PI / 2;
    return this.b.put(m, x, y, f);
  }

  /** Riel Picatinny: base y ranuras transversales. */
  rail(y: number, f0: number, len: number, w = 0.036): void {
    this.b.box(w, 0.012, len, this.b.steel, 0, y, f0 + len / 2, 0.002);
    const n = Math.floor(len / 0.0125);
    for (let i = 0; i < n; i++) this.b.box(w + 0.002, 0.008, 0.0045, this.b.dark, 0, y + 0.004, f0 + 0.008 + i * 0.0125, 0.0008);
  }

  /** Bocacha con ranuras: cilindro y cortes que enseñan el hueco. */
  brake(y: number, f0: number, len: number, r: number, slots = 3, x = 0): void {
    this.b.cyl(r, len, this.b.dark, x, y, f0, 16);
    for (let i = 0; i < slots; i++) {
      this.b.box(r * 2.2, 0.0045, len * 0.16, this.b.steel, x, y + r * 0.9, f0 + len * (0.2 + i * 0.25), 0.0008);
      this.b.box(r * 2.2, 0.0045, len * 0.16, this.b.steel, x, y - r * 0.9, f0 + len * (0.2 + i * 0.25), 0.0008);
    }
    // Boca negra del cañón.
    const bore = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.004, 14), new THREE.MeshBasicMaterial({ color: 0x020202 }));
    bore.rotation.x = Math.PI / 2;
    this.b.put(bore, x, y, f0 + len + 0.001);
  }

  /** Nervios horizontales de un cargador o empuñadura. */
  ribs(x: number, y0: number, f: number, w: number, d: number, count: number, step: number, mat?: THREE.Material): void {
    for (let i = 0; i < count; i++) this.b.box(w, 0.0035, d, mat ?? this.b.steel, x, y0 - i * step, f, 0.0006);
  }

  /** Cartucho de escopeta (rojo con base de latón), tumbado a lo largo de Z. */
  shell(x: number, y: number, f: number): void {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xb0261c, roughness: 0.5 }));
    body.rotation.x = Math.PI / 2;
    this.b.put(body, x, y, f);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.0112, 0.0112, 0.014, 10), this.b.brass);
    base.rotation.x = Math.PI / 2;
    this.b.put(base, x, y, f - 0.03);
  }

  /** Bala de cinta (latón con punta). */
  bullet(x: number, y: number, f: number, rotY = 0): void {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0065, 0.04, 8), this.b.brass);
    c.rotation.z = Math.PI / 2;
    c.rotation.y = rotY;
    this.b.put(c, x, y, f);
  }

  /** Muescas finas en una cara lateral (serraciones, agarres, aletas de refrigeración). */
  notches(x: number, y: number, f0: number, count: number, step: number, h: number, mat?: THREE.Material, w = 0.0016): void {
    for (let i = 0; i < count; i++) this.b.box(w, h, 0.0028, mat ?? this.b.dark, x, y, f0 + i * step, 0.0003);
  }

  /** Orificios de ventilación alargados a un lado del guardamanos. */
  vents(x: number, y: number, f0: number, count: number, step: number, len = 0.03, h = 0.008): void {
    for (let i = 0; i < count; i++) this.b.box(0.0018, h, len, this.b.dark, x, y, f0 + i * step, 0.0004);
  }

  /** Orejas protectoras del punto de mira. */
  frontSight(y: number, f: number, h = 0.032): void {
    this.b.box(0.004, h, 0.006, this.b.dark, 0, y + h / 2, f, 0.0006);
    for (const sx of [-1, 1]) this.b.box(0.003, h * 0.8, 0.012, this.b.dark, sx * 0.011, y + h * 0.4, f, 0.0005);
    this.b.box(0.026, 0.004, 0.012, this.b.dark, 0, y + 0.002, f, 0.0005);
  }

  /** Guardamonte con gatillo (perfil extruido, más fino que la silueta base). */
  trigger(y: number, f: number, curve = 0): void {
    const t = this.b.box(0.007, 0.03, 0.01, this.b.steel, 0, y, f, 0.002);
    t.rotation.x = 0.35 + curve;
  }
}

/** Añade las piezas pequeñas de cada arma (después de su silueta). */
export function addDetails(b: Builder, id: WeaponId): void {
  const p = new Parts(b);
  const red = new THREE.MeshStandardMaterial({ color: 0x401010, emissive: 0xff2a1a, emissiveIntensity: 1.6, roughness: 0.4 });
  const slide = b.g.getObjectByName("slide") as THREE.Group | undefined;
  const onSlide = (o: THREE.Object3D, x: number, y: number, z: number): void => {
    o.position.set(x, y, z);
    (slide ?? b.g).add(o);
  };
  const bx = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  switch (id) {
    case "pistol": {
      // Corredera: serraciones de delante y de detrás, ventana de expulsión, extractor y bocacha negra.
      for (let i = 0; i < 5; i++) onSlide(bx(0.0335, 0.034, 0.0025, b.dark), 0, 0.062, -0.14 - i * 0.009);
      for (const sx of [-1, 1]) onSlide(bx(0.002, 0.024, 0.052, b.dark), sx * 0.0165, 0.06, -0.012);
      onSlide(bx(0.002, 0.005, 0.01, red), 0.0165, 0.073, 0.02);
      onSlide(bx(0.012, 0.004, 0.2, b.dark), 0, 0.0845, -0.06); // planos de la cara superior
      // Marco: pasadores, tornillos y palanca de la corredera.
      p.pin(-0.0185, 0.044, -0.02, 0.004, 0.004, b.steel);
      p.pin(0.0185, 0.044, -0.02, 0.004, 0.004, b.steel);
      b.box(0.004, 0.008, 0.05, b.dark, -0.0185, 0.039, -0.006, 0.001); // palanca
      p.pin(-0.0185, 0.005, -0.012, 0.0055, 0.006, b.steel); // botón del cargador
      p.screw(0.018, -0.06, 0.036);
      p.screw(-0.018, -0.06, 0.036);
      p.screw(0.018, -0.1, 0.03);
      p.screw(-0.018, -0.1, 0.03);
      b.box(0.008, 0.014, 0.014, b.dark, 0, 0.075, 0.084, 0.002); // martillo
      for (let i = 0; i < 4; i++) b.box(0.034, 0.005, 0.01, b.dark, 0, 0.0105, -0.09 - i * 0.022, 0.001); // riel inferior
      p.trigger(0.006, -0.03);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 6, 12), b.steel);
      ring.rotation.y = Math.PI / 2;
      b.put(ring, 0, -0.153, 0.034); // anilla
      // Empuñadura: cuadrícula de agarre en los dos lados.
      for (const sx of [-1, 1]) p.notches(sx * 0.0178, -0.065, 0.024, 7, -0.0095, 0.1, b.dark, 0.0012);
      break;
    }
    case "revolver": {
      // Tambor: aro delante y detrás, estrías y percutor; guardamonte; medallones de latón; palanca del tambor.
      const drumRingA = b.cyl(0.045, 0.006, b.steel, 0, 0.04, 0.0, 20);
      drumRingA.position.z = -0.0075;
      const drumRingB = b.cyl(0.045, 0.006, b.steel, 0, 0.04, 0.0, 20);
      drumRingB.position.z = 0.0255;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.26 + 0.52;
        b.box(0.005, 0.034, 0.05, b.dark, Math.cos(a) * 0.04, 0.04 + Math.sin(a) * 0.04, 0.0, 0.001).rotation.z = a - Math.PI / 2;
      }
      b.slab([[0.0, -0.005], [0.07, -0.005], [0.07, -0.038], [0.04, -0.055], [0.006, -0.04]], 0.012, b.steel, 0, 0, 0, 0.002);
      p.trigger(-0.012, -0.03, 0.1);
      for (const sx of [-1, 1]) p.pin(sx * 0.0175, -0.045, 0.04, 0.0085, 0.004, b.brass);
      b.box(0.004, 0.012, 0.03, b.dark, -0.015, 0.03, -0.11, 0.001); // seguro del tambor
      b.cyl(0.0075, 0.2, b.steel, 0, 0.02, 0.07, 10); // varilla del extractor
      b.box(0.02, 0.014, 0.01, b.dark, 0, 0.098, 0.31, 0.001); // base de la mira
      p.screw(0.015, 0.075, -0.004);
      p.screw(-0.015, 0.075, -0.004);
      p.notches(0.0152, 0.07, 0.12, 8, 0.02, 0.008, b.dark, 0.0012); // ranuras del cañón
      b.cyl(0.0125, 0.004, new THREE.MeshBasicMaterial({ color: 0x020202 }), 0, 0.07, 0.322, 12);
      for (const sx of [-1, 1]) p.notches(sx * 0.0175, -0.07, -0.05, 6, 0.016, 0.09, b.dark, 0.0012);
      break;
    }
    case "smg": {
      // Cargador con nervios y placa, ventana de expulsión con aleta, mecanismo de carga, selector y ventilación.
      p.ribs(0.12, -0.02, 0.0, 0.043, 0.036, 8, 0.02);
      b.box(0.044, 0.01, 0.046, b.dark, 0, 0.134, 0.0, 0.002); // casquillo de cargador
      b.box(0.022, 0.024, 0.07, b.dark, 0.0315, 0.093, 0.1, 0.003); // ventana de expulsión (aleta)
      b.box(0.008, 0.016, 0.03, b.steel, 0.04, 0.095, 0.15, 0.002); // palanca de carga
      p.pin(0.0265, 0.05, 0.012, 0.005, 0.005, b.steel); // selector
      p.vents(0.0265, 0.06, 0.18, 6, 0.032, 0.02, 0.014);
      p.vents(-0.0265, 0.06, 0.18, 6, 0.032, 0.02, 0.014);
      p.rail(0.116, -0.04, 0.22, 0.03);
      p.frontSight(0.083, 0.47, 0.03);
      p.brake(0.056, 0.51, 0.055, 0.0135, 3);
      p.trigger(0.006, -0.0, 0.2);
      b.slab([[0.0, 0.03], [0.1, 0.03], [0.1, 0.0], [0.07, -0.014], [0.0, -0.014]], 0.01, b.steel, 0, 0, 0, 0.002); // guardamonte
      p.screw(0.027, 0.025, 0.07);
      p.screw(-0.027, 0.025, 0.07);
      p.screw(0.027, 0.07, -0.02);
      b.box(0.052, 0.07, 0.004, b.dark, 0, 0.065, -0.253, 0.0008); // culatín
      for (const sx of [-1, 1]) p.notches(sx * 0.0178, -0.06, -0.026, 6, -0.0095, 0.1, b.dark, 0.0012);
      b.box(0.012, 0.012, 0.012, b.steel, 0, 0.0, -0.34, 0.002); // anilla de la correa
      break;
    }
    case "shotgun": {
      // Cartuchos en el lateral, guardamonte, puerto de carga, anillas de la correa, cuña de la culata y cuadrícula de agarre.
      for (let i = 0; i < 4; i++) p.shell(-0.03, 0.04 + i * 0.0, 0.0 + i * 0.026 - 0.02);
      p.shell(0.0, -0.03, 0.04);
      b.slab([[0.0, 0.0], [0.075, 0.0], [0.075, -0.026], [0.04, -0.042], [0.0, -0.022]], 0.012, b.steel, 0, 0, 0, 0.002);
      p.trigger(-0.004, -0.0, 0.1);
      b.box(0.03, 0.01, 0.06, b.dark, 0, -0.012, 0.0, 0.002); // puerto de carga
      p.screw(0.0235, 0.05, 0.04);
      p.screw(-0.0235, 0.05, 0.04);
      p.screw(0.0235, 0.08, 0.1);
      p.pin(-0.0235, 0.06, 0.02, 0.005, 0.005, b.steel); // seguro
      b.cyl(0.021, 0.02, b.steel, 0, 0.022, 0.092, 14); // tapón del cargador
      b.box(0.046, 0.05, 0.01, b.dark, 0, 0.0, -0.31, 0.004); // cantonera
      for (let i = 0; i < 5; i++) {
        p.notches(0.0205, 0.0, -0.12 - i * 0.03, 1, 0, 0.12, b.dark, 0.0012);
        p.notches(-0.0205, 0.0, -0.12 - i * 0.03, 1, 0, 0.12, b.dark, 0.0012);
      }
      break;
    }
    case "rifle": {
      // Fusil de asalto: bloque de gases con punto de mira, tubo de gases, manija de carga, tapa de la ventana, cargador con nervios,
      // bocacha de seis ranuras, ranuras M-LOK, selector, gatillo y tubo del amortiguador.
      b.cyl(0.0085, 0.16, b.steel, 0, 0.1, 0.4, 10); // tubo de gases
      b.box(0.03, 0.03, 0.03, b.dark, 0, 0.082, 0.575, 0.003); // bloque de gases
      p.frontSight(0.092, 0.575, 0.034);
      p.vents(0.0262, 0.082, 0.19, 6, 0.045, 0.028, 0.012);
      p.vents(-0.0262, 0.082, 0.19, 6, 0.045, 0.028, 0.012);
      b.box(0.034, 0.014, 0.05, b.dark, 0, 0.155, -0.12, 0.003); // manija de carga
      b.box(0.012, 0.022, 0.02, b.steel, 0, 0.17, -0.14, 0.002);
      b.box(0.003, 0.03, 0.07, b.dark, 0.0222, 0.12, 0.04, 0.001); // tapa de la ventana
      p.pin(0.0222, 0.12, 0.09, 0.004, 0.004, b.steel);
      b.box(0.01, 0.014, 0.016, b.steel, 0.026, 0.12, -0.0, 0.002); // asistente de cierre
      p.ribs(0.128, -0.02, 0.0, 0.034, 0.03, 7, 0.026);
      b.box(0.04, 0.01, 0.045, b.dark, 0, -0.205, 0.128, 0.002);
      p.brake(0.075, 0.62, 0.06, 0.0165, 4);
      p.trigger(0.004, -0.01, 0.2);
      b.slab([[0.0, 0.02], [0.1, 0.02], [0.1, -0.01], [0.075, -0.028], [0.0, -0.02]], 0.01, b.steel, 0, 0, 0, 0.002);
      p.pin(-0.0225, 0.05, -0.03, 0.005, 0.005, b.steel); // selector
      p.pin(-0.0225, 0.06, 0.07, 0.0045, 0.005, b.steel); // palanca del cerrojo
      p.screw(0.0222, 0.04, -0.07);
      p.screw(-0.0222, 0.04, -0.07);
      // Amortiguador y culata telescópica.
      b.cyl(0.018, 0.2, b.dark, 0, 0.04, -0.3, 12);
      p.notches(0.0185, 0.04, -0.28, 6, -0.02, 0.012, b.steel, 0.0014);
      b.box(0.046, 0.12, 0.012, b.dark, 0, 0.0, -0.343, 0.003);
      p.notches(0.0205, 0.0, -0.14, 5, -0.03, 0.14, b.dark, 0.0012);
      for (const sx of [-1, 1]) p.notches(sx * 0.0178, -0.06, -0.026, 6, -0.0095, 0.1, b.dark, 0.0012);
      b.box(0.014, 0.012, 0.014, b.steel, 0, -0.04, 0.26, 0.002); // anilla de la correa
      break;
    }
    case "lmg": {
      // Cinta de munición hasta la bandeja, bandeja de alimentación con bisagra, escudo térmico ventilado, culata con carrillera.
      for (let i = 0; i < 9; i++) p.bullet(0.04 - i * 0.003, -0.04 + i * 0.018, -0.07 + i * 0.012, 0.3);
      b.box(0.062, 0.016, 0.14, b.dark, 0, 0.16, 0.05, 0.003); // bandeja de alimentación
      p.pin(0.0, 0.168, -0.02, 0.006, 0.07, b.steel); // bisagra
      p.vents(0.034, 0.07, 0.3, 8, 0.036, 0.022, 0.016);
      p.vents(-0.034, 0.07, 0.3, 8, 0.036, 0.022, 0.016);
      b.cyl(0.027, 0.03, b.dark, 0, 0.07, 0.27, 14);
      p.brake(0.07, 0.715, 0.05, 0.0205, 4);
      p.frontSight(0.09, 0.62, 0.04);
      p.trigger(0.0, 0.005, 0.2);
      b.slab([[0.0, 0.03], [0.1, 0.03], [0.1, -0.01], [0.07, -0.03], [0.0, -0.022]], 0.01, b.steel, 0, 0, 0, 0.002);
      p.screw(0.0302, 0.08, 0.0);
      p.screw(-0.0302, 0.08, 0.0);
      p.screw(0.0302, 0.04, 0.2);
      p.ribs(0.0, -0.095, 0.12, 0.072, 0.15, 5, 0.02, b.dark);
      b.box(0.06, 0.03, 0.01, b.steel, 0, 0.0, -0.37, 0.002); // cantonera
      p.notches(0.0215, 0.0, -0.18, 6, -0.03, 0.12, b.dark, 0.0012);
      break;
    }
    case "sniper": {
      // Torretas del visor, anillos, ranuras del riel, estrías del cañón, bocacha, cerrojo con detalle, carrillera.
      p.pin(0.0235, 0.133, 0.095, 0.008, 0.012, b.dark); // torreta de deriva
      b.cyl(0.0095, 0.016, b.dark, 0, 0.1535, 0.095, 12); // torreta de elevación
      for (const f of [0.0, 0.14]) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.0235, 0.004, 8, 20), b.steel);
        b.put(r, 0, 0.13, f);
      }
      p.rail(0.09, -0.07, 0.25, 0.026);
      p.brake(0.056, 0.77, 0.07, 0.0185, 3);
      p.notches(0.0128, 0.056, 0.3, 9, 0.05, 0.008, b.dark, 0.0012);
      p.notches(-0.0128, 0.056, 0.3, 9, 0.05, 0.008, b.dark, 0.0012);
      p.trigger(0.004, 0.02, 0.2);
      b.slab([[0.0, 0.02], [0.1, 0.02], [0.1, -0.012], [0.07, -0.03], [0.0, -0.022]], 0.01, b.steel, 0, 0, 0, 0.002);
      p.screw(0.0202, 0.04, 0.12);
      p.screw(-0.0202, 0.04, 0.12);
      p.screw(0.0202, 0.04, -0.04);
      p.ribs(0.0, -0.045, 0.09, 0.04, 0.09, 4, 0.016, b.dark);
      b.box(0.034, 0.03, 0.2, b.poly, 0, 0.1, -0.26, 0.012); // carrillera
      b.box(0.05, 0.1, 0.016, b.dark, 0, 0.0, -0.393, 0.004);
      p.notches(0.0235, 0.0, -0.2, 8, -0.022, 0.1, b.dark, 0.0012);
      break;
    }
    case "pulse": {
      // Arma de energía: bobinas luminosas, aletas de refrigeración, paneles con barras de carga y cables.
      const coil = b.up ? b.accentMat : b.dark;
      for (let i = 0; i < 7; i++) b.ring(0.036 - i * 0.0015, 0.0035, b.steel, 0, 0.066, 0.12 + i * 0.05);
      for (let i = 0; i < 5; i++) b.box(0.003, 0.016, 0.02, coil, 0.0285, 0.066, 0.0 + i * 0.03 + 0.02, 0.0005);
      for (let i = 0; i < 5; i++) b.box(0.003, 0.016, 0.02, coil, -0.0285, 0.066, 0.0 + i * 0.03 + 0.02, 0.0005);
      p.vents(0.0272, 0.1, 0.1, 5, 0.04, 0.028, 0.01);
      p.vents(-0.0272, 0.1, 0.1, 5, 0.04, 0.028, 0.01);
      for (let i = 0; i < 4; i++) b.box(0.0034, 0.008, 0.022, coil, 0.031, 0.14 - i * 0.012, 0.0, 0.0005);
      const cable = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 6, 18, Math.PI), b.dark);
      cable.rotation.set(0, Math.PI / 2, Math.PI / 2);
      b.put(cable, -0.04, 0.09, 0.14);
      p.trigger(0.004, -0.0, 0.2);
      b.slab([[0.0, 0.02], [0.1, 0.02], [0.1, -0.01], [0.075, -0.03], [0.0, -0.022]], 0.01, b.steel, 0, 0, 0, 0.002);
      p.screw(0.0272, 0.1, 0.0);
      p.screw(-0.0272, 0.1, 0.0);
      b.box(0.014, 0.034, 0.02, coil, 0, 0.0, -0.34, 0.002);
      break;
    }
  }
}

/** Cilindro entre dos puntos del espacio del modelo (antebrazos, puños, correas). */
function limb(b: Builder, a: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number, m: THREE.Material): THREE.Mesh {
  const dir = c.clone().sub(a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 14), m);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  b.g.add(mesh);
  return mesh;
}

// --- Manos con dedos --------------------------------------------------------------------------------------------
/** Guantes con dedos curvados, nudillos y costuras, mangas con puño y reloj en la muñeca izquierda. */
export function buildHands(b: Builder, rightF: number, leftF: number, leftY: number): void {
  const s = getSurfaces();
  const mat = (key: string, make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => b.cachedMat(key, make);
  const glove = mat("glove2", () => new THREE.MeshStandardMaterial({ color: 0x25272c, roughness: 0.9, metalness: 0.02, bumpMap: s.leather, bumpScale: 1.1 }));
  const pad = mat("glovePad", () => new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7, metalness: 0.1, bumpMap: s.leather, bumpScale: 0.8 }));
  const cloth = mat("cloth2", () => new THREE.MeshStandardMaterial({ color: 0x3a4430, roughness: 1, bumpMap: s.cloth, bumpScale: 1.4 }));
  const cuff = mat("cuff", () => new THREE.MeshStandardMaterial({ color: 0x1d2118, roughness: 1, bumpMap: s.cloth, bumpScale: 1.4 }));
  const strap = mat("strap2", () => new THREE.MeshStandardMaterial({ color: 0x8a1f1a, roughness: 0.8 }));
  const watchFace = mat("watchFace", () => new THREE.MeshStandardMaterial({ color: 0x0c1a14, emissive: 0x39ff8a, emissiveIntensity: 0.7, roughness: 0.3 }));
  const metal = mat("watchMetal", () => new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.3, metalness: 0.9 }));

  const finger = (x: number, y: number, f: number, len: number, rotX: number, w = 0.017): void => {
    const seg = (sx: number, sy: number, sf: number, l: number, rx: number): void => {
      const m = b.box(w, w * 0.95, l, glove, sx, sy, sf, 0.006);
      m.rotation.x = rx;
    };
    seg(x, y, f, len * 0.55, rotX);
    seg(x, y - len * 0.42 * Math.sin(rotX + 0.5), f - len * 0.5, len * 0.5, rotX + 0.7);
  };

  // --- Mano derecha (empuñadura) ---
  const rh = b.box(0.08, 0.092, 0.105, glove, 0.012, -0.05, rightF + 0.01, 0.02);
  rh.rotation.x = 0.22;
  b.box(0.075, 0.03, 0.04, pad, 0.012, -0.015, rightF + 0.05, 0.012).rotation.x = 0.2; // talón de la mano
  for (let k = 0; k < 4; k++) finger(0.0, -0.02 - k * 0.02, rightF - 0.05, 0.06, 0.1); // dedos que rodean la empuñadura
  // Nudillos.
  // Pulgar sobre el lado izquierdo y dedo índice estirado junto al guardamonte.
  const thumb = b.box(0.02, 0.018, 0.07, glove, -0.03, -0.012, rightF - 0.02, 0.007);
  thumb.rotation.set(0.1, 0.25, 0);
  const index = b.box(0.015, 0.015, 0.075, glove, 0.032, 0.0, rightF - 0.065, 0.006);
  index.rotation.set(0.05, -0.05, 0);
  // Muñeca y manga (antebrazo que sale hacia la cámara).
  const rz = -rightF;
  const rw = new THREE.Vector3(0.035, -0.1, rz + 0.07);
  const re = new THREE.Vector3(0.13, -0.38, rz + 0.55);
  limb(b, rw, re, 0.036, 0.05, cloth);
  limb(b, rw.clone().add(new THREE.Vector3(0.0, -0.003, 0.0)), rw.clone().lerp(re, 0.14), 0.044, 0.044, cuff);
  limb(b, rw.clone().lerp(re, 0.3), rw.clone().lerp(re, 0.34), 0.05, 0.05, strap);

  // --- Mano izquierda (guardamanos) ---
  const lh = b.box(0.088, 0.075, 0.12, glove, -0.012, leftY, leftF, 0.02);
  lh.rotation.x = -0.05;
  b.box(0.082, 0.026, 0.05, pad, -0.012, leftY - 0.03, leftF + 0.04, 0.012); // talón
  for (let k = 0; k < 4; k++) {
    const m = b.box(0.017, 0.07, 0.019, glove, 0.036, leftY + 0.02, leftF + 0.045 - k * 0.025, 0.006); // dedos por el lado derecho
    m.rotation.z = -0.15;
    b.box(0.018, 0.016, 0.02, pad, 0.032, leftY + 0.055, leftF + 0.045 - k * 0.025, 0.005);
  }
  const lthumb = b.box(0.02, 0.02, 0.07, glove, -0.047, leftY + 0.025, leftF - 0.01, 0.007);
  lthumb.rotation.set(0.0, -0.15, 0.2);
  // Muñeca, reloj y manga remangada.
  const lz = -leftF;
  const lw = new THREE.Vector3(-0.07, leftY - 0.06, lz + 0.09);
  const le = new THREE.Vector3(-0.23, leftY - 0.32, lz + 0.55);
  limb(b, lw, le, 0.037, 0.052, cloth);
  limb(b, lw, lw.clone().lerp(le, 0.13), 0.045, 0.045, cuff);
  const dirL = le.clone().sub(lw).normalize();
  const watchAt = lw.clone().lerp(le, 0.07);
  limb(b, watchAt, watchAt.clone().addScaledVector(dirL, 0.028), 0.046, 0.046, strap);
  const face = b.box(0.034, 0.008, 0.026, watchFace, watchAt.x + 0.012, watchAt.y + 0.04, -watchAt.z - 0.015, 0.002);
  face.rotation.set(-0.1, 0, 0.3);
  const rim = b.box(0.04, 0.005, 0.032, metal, watchAt.x + 0.012, watchAt.y + 0.035, -watchAt.z - 0.015, 0.002);
  rim.rotation.set(-0.1, 0, 0.3);
}
