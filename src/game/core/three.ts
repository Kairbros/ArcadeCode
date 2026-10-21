// Utilidades comunes de los juegos en 3D (Three.js): un único contexto WebGL para todo el hub (los
// navegadores limitan cuántos hay a la vez), copiar la escena al lienzo 2D del juego, proyectar
// puntos para el HUD y halos de luz.
import * as THREE from "three";

let gl: THREE.WebGLRenderer | null | undefined;

/** El renderizador compartido, o null si el equipo no tiene WebGL. */
export function glRenderer(): THREE.WebGLRenderer | null {
  if (gl !== undefined) return gl;
  try {
    gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.setClearColor(0x000000, 1);
  } catch (err) {
    console.warn("WebGL no disponible:", err);
    gl = null;
  }
  return gl;
}

const MAX_RES = 3; // resolución interna máxima (× tamaño lógico)
const size = new THREE.Vector2();

/**
 * Dibuja la escena en el lienzo del juego, que mide w×h unidades lógicas, a la resolución real de la
 * pantalla (`pixelScale`). Devuelve false si no hay WebGL.
 */
export function renderInto(
  ctx: CanvasRenderingContext2D, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number, pixelScale: number,
  exposure: number,
): boolean {
  const r = glRenderer();
  if (!r) return false;
  const k = Math.max(1, Math.min(MAX_RES, Math.round(pixelScale)));
  r.getSize(size);
  if (size.x !== w * k || size.y !== h * k) r.setSize(w * k, h * k, false);
  r.toneMappingExposure = exposure;
  r.render(scene, camera);
  ctx.drawImage(r.domElement, 0, 0, w, h);
  return true;
}

/** Punto del mundo en el lienzo lógico (w×h): [x, y, distancia], o null si queda detrás de la cámara. */
export function projectTo(camera: THREE.Camera, p: readonly [number, number, number], w: number, h: number): [number, number, number] | null {
  const v = new THREE.Vector3(...p).applyMatrix4(camera.matrixWorldInverse);
  if (v.z > -0.02) return null;
  const d = -v.z;
  v.applyMatrix4(camera.projectionMatrix);
  return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h, d];
}

/** Una caja de un modelo de bloques: tamaño, centro, color y giro opcional (cabeceo, guiñada, alabeo). */
export interface Block {
  s: [number, number, number];
  p: [number, number, number];
  color: number;
  r?: [number, number, number];
}

/**
 * Junta muchas cajas de colores en una sola geometría (color por vértice): un modelo entero o todos
 * los decorados de un circuito se dibujan de una vez. Usar con `vertexColors: true`.
 */
export function blockGeometry(blocks: Block[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
  for (const b of blocks) {
    const g = new THREE.BoxGeometry(...b.s).toNonIndexed();
    e.set(b.r?.[0] ?? 0, b.r?.[1] ?? 0, b.r?.[2] ?? 0, "YXZ");
    g.applyMatrix4(m.compose(at.set(...b.p), q.setFromEuler(e), one));
    c.setHex(b.color);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return out;
}

/** Libera geometrías, materiales y texturas de una escena que ya no se usa. */
export function disposeScene(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

let glowTex: THREE.CanvasTexture | null = null;

/** Halo redondo (sprite aditivo) para luces: lámparas, ojos, fogonazos, chispas. */
export function glowSprite(color: number, size: number, opacity = 1): THREE.Sprite {
  if (!glowTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
    glowTex.colorSpace = THREE.SRGBColorSpace;
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.scale.setScalar(size);
  return sp;
}

/**
 * Ajusta el tamano del renderizador compartido a w x h unidades logicas a la resolucion de la pantalla y devuelve el
 * factor de resolucion usado (para los juegos que dibujan con su propia cadena de postproceso).
 */
export function fitRenderer(w: number, h: number, pixelScale: number): { r: THREE.WebGLRenderer; k: number } | null {
  const r = glRenderer();
  if (!r) return null;
  const k = Math.max(1, Math.min(MAX_RES, Math.round(pixelScale)));
  r.getSize(size);
  if (size.x !== w * k || size.y !== h * k) r.setSize(w * k, h * k, false);
  return { r, k };
}
