// Túnel (cueva) del circuito: un arco de roca irregular sobre la pista con un portal de piedra en cada boca,
// cristales y farolas que dan luz de colores por dentro. La física lo conoce (muros más cerca de la pista).
import * as THREE from "three";
import { glowSprite } from "../core/three";
import { TUNNEL_R } from "./config";
import type { Theme, Track, Tunnel } from "./track";

const RING = 18; // vértices por arco (de un lado del suelo al otro, por arriba)

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Color de la roca según el tema. */
function rockColor(theme: Theme): number {
  return theme.name === "Desierto" ? 0xc79360 : theme.name === "Nieve" ? 0xb4c6de : theme.name === "Volcán" ? 0x5a4048 : 0x8c919e;
}

/**
 * Arma el túnel: `groundAt(x, y)` da la altura del suelo (unidades de mundo) y `S` pasa de unidades de mundo
 * a metros de la escena. Cada anillo del arco sale de un punto de la línea central.
 */
export function buildTunnel(
  track: Track, tunnel: Tunnel, groundAt: (x: number, y: number) => number, S: number,
): { group: THREE.Group; lights: THREE.PointLight[] } {
  const group = new THREE.Group();
  const lights: THREE.PointLight[] = [];
  const base = new THREE.Color(rockColor(track.theme));
  const rings = tunnel.to - tunnel.from + 1;
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  const ringCenter = (i: number): [number, number, number, number, number] => {
    const x = track.px[i], y = track.py[i], d = track.dir[i];
    return [x, y, groundAt(x, y), -Math.sin(d), Math.cos(d)];
  };
  for (let k = 0; k < rings; k++) {
    const i = tunnel.from + k;
    const [cx, cy, gh, nx, ny] = ringCenter(i);
    for (let j = 0; j < RING; j++) {
      const th = (j / (RING - 1)) * Math.PI;
      const bump = (hash(i, j) - 0.5) * 7 + Math.sin(i * 0.6 + j) * 3;
      const lateral = Math.cos(th) * (TUNNEL_R + bump);
      const up = Math.sin(th) * (TUNNEL_R - 2 + bump);
      pos.push((cx + nx * lateral) * S, (gh + up) * S, (cy + ny * lateral) * S);
      const v = 0.78 + hash(j, i * 3) * 0.3 + Math.sin(th) * 0.1;
      c.copy(base).multiplyScalar(v);
      col.push(c.r, c.g, c.b);
    }
  }
  const idx: number[] = [];
  for (let k = 0; k < rings - 1; k++) {
    for (let j = 0; j < RING - 1; j++) {
      const a = k * RING + j, b = a + 1, d = a + RING, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const shell = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  shell.castShadow = shell.receiveShadow = true;
  group.add(shell);

  // Portales de piedra en las dos bocas.
  const stone = new THREE.MeshStandardMaterial({ color: new THREE.Color(rockColor(track.theme)).multiplyScalar(1.25), roughness: 0.8 });
  for (const i of [tunnel.from, tunnel.to]) {
    const [cx, cy, gh] = ringCenter(i);
    const arch = new THREE.Mesh(new THREE.TorusGeometry((TUNNEL_R + 1) * S, 4.5 * S, 8, 20, Math.PI), stone);
    arch.position.set(cx * S, gh * S, cy * S);
    arch.rotation.y = Math.PI / 2 - track.dir[i];
    arch.castShadow = true;
    group.add(arch);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(4.5 * S, 5 * S, 3 * S, 10), stone);
      post.position.set((cx - Math.sin(track.dir[i]) * side * (TUNNEL_R + 1)) * S, (gh + 0.5) * S, (cy + Math.cos(track.dir[i]) * side * (TUNNEL_R + 1)) * S);
      group.add(post);
    }
  }

  // Cristales y farolas de colores en el techo y las paredes.
  const palette = [0x4ff0ff, 0xff5ad8, 0xffb040, 0x8cff6a];
  for (let k = 1; k < rings - 1; k += 3) {
    const i = tunnel.from + k;
    const [cx, cy, gh, nx, ny] = ringCenter(i);
    const color = palette[(k / 3) % palette.length | 0];
    const side = k % 2 ? 1 : -1;
    const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(2.6 * S), new THREE.MeshBasicMaterial({ color }));
    lamp.position.set((cx + nx * side * (TUNNEL_R - 8)) * S, (gh + 18 + (k % 4) * 3) * S, (cy + ny * side * (TUNNEL_R - 8)) * S);
    lamp.scale.y = 1.8;
    group.add(lamp);
    const halo = glowSprite(color, 1.4, 0.85);
    halo.position.copy(lamp.position);
    group.add(halo);
  }
  for (const f of [0.18, 0.5, 0.82]) {
    const i = tunnel.from + Math.round(f * (rings - 1));
    const [cx, cy, gh] = ringCenter(i);
    const light = new THREE.PointLight(palette[Math.round(f * 3) % palette.length], 7, 9, 2);
    light.position.set(cx * S, (gh + 26) * S, cy * S);
    group.add(light);
    lights.push(light);
  }
  return { group, lights };
}
