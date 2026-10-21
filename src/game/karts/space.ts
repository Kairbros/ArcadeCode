// Circuito del espacio (estilo Rainbow Road): la pista es una cinta de neón que flota en el vacío, rodeada de
// estrellas, nebulosas y planetas. Fuera del asfalto no hay suelo: se cae y Lakitu te recoge.
import * as THREE from "three";
import { Rng } from "../core/rng";
import { glowSprite } from "../core/three";
import { RIBBON_HW, TEX } from "./config";
import { heightAt, type Terrain } from "./terrain";
import type { Track } from "./track";

const tex = (w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat = false) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/** Asfalto de neón: fondo azul oscuro, bordes de color, línea central y estrellitas. */
function roadTexture(): THREE.CanvasTexture {
  const rng = new Rng(77);
  return tex(128, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, "#20104a");
    grad.addColorStop(0.5, "#161240");
    grad.addColorStop(1, "#20104a");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 256);
    // Franjas de los bordes: magenta a la izquierda, cian a la derecha.
    g.fillStyle = "#ff3df0";
    g.fillRect(0, 0, 7, 256);
    g.fillStyle = "#ffd0fa";
    g.fillRect(7, 0, 2, 256);
    g.fillStyle = "#3df0ff";
    g.fillRect(121, 0, 7, 256);
    g.fillStyle = "#d0fcff";
    g.fillRect(119, 0, 2, 256);
    // Línea central discontinua y chevrones.
    g.fillStyle = "rgba(220,210,255,0.8)";
    for (let y = 0; y < 256; y += 32) g.fillRect(62, y, 4, 16);
    g.strokeStyle = "rgba(120,100,255,0.45)";
    g.lineWidth = 3;
    for (let y = 16; y < 256; y += 64) {
      for (const cx of [32, 96]) {
        g.beginPath();
        g.moveTo(cx - 12, y + 12);
        g.lineTo(cx, y);
        g.lineTo(cx + 12, y + 12);
        g.stroke();
      }
    }
    // Estrellas.
    for (let i = 0; i < 46; i++) {
      const x = 12 + rng.next() * 104, y = rng.next() * 256, r = 1 + rng.next() * 2.4;
      g.fillStyle = ["#ffffff", "#ffe27a", "#9ad8ff", "#ffa8ff"][i % 4];
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.45 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
  }, true);
}

/** Planeta con bandas o continentes pintados (esfera iluminada por el sol). */
function planetTexture(kind: "gas" | "earth" | "mars" | "moon", seed: number): THREE.CanvasTexture {
  const rng = new Rng(seed);
  return tex(256, 128, (g) => {
    if (kind === "gas") {
      const cols = ["#e8b87a", "#c8844a", "#f0d4a0", "#a8683c", "#e0a468"];
      for (let y = 0; y < 128; y += 8) {
        g.fillStyle = cols[Math.floor(rng.next() * cols.length)];
        g.fillRect(0, y, 256, 9);
      }
      g.fillStyle = "rgba(255,255,255,0.18)";
      for (let i = 0; i < 40; i++) g.fillRect(rng.next() * 256, rng.next() * 128, 20 + rng.next() * 40, 2);
      g.fillStyle = "#b8442c";
      g.beginPath();
      g.ellipse(170, 78, 16, 9, 0, 0, Math.PI * 2);
      g.fill();
    } else if (kind === "earth") {
      g.fillStyle = "#2a62d8";
      g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 26; i++) {
        g.fillStyle = i % 3 ? "#3ea850" : "#d6c078";
        g.beginPath();
        g.ellipse(rng.next() * 256, 20 + rng.next() * 88, 8 + rng.next() * 22, 5 + rng.next() * 12, rng.next() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 24; i++) g.fillRect(rng.next() * 256, rng.next() * 128, 14 + rng.next() * 30, 3);
    } else {
      g.fillStyle = kind === "mars" ? "#c8502c" : "#9a98a4";
      g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 30; i++) {
        g.fillStyle = kind === "mars" ? (i % 2 ? "#a03c20" : "#e0703c") : i % 2 ? "#7c7a86" : "#b8b6c2";
        g.beginPath();
        g.arc(rng.next() * 256, rng.next() * 128, 3 + rng.next() * 12, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export interface SpaceScene {
  group: THREE.Group;
  /** Lo que sigue a la cámara (estrellas y nebulosas): se mueve con ella para que parezca infinito. */
  follow: THREE.Group;
  update(time: number): void;
}

/** Cinta de la pista (cara de arriba con textura, laterales, bordes de neón que cambian de color). */
function buildRibbon(track: Track, t: Terrain, S: number): { group: THREE.Group; update(time: number): void } {
  const group = new THREE.Group();
  const n = track.n;
  const hw = RIBBON_HW;
  const top: number[] = [], uv: number[] = [], idx: number[] = [];
  const side: number[] = [], sideCol: number[] = [], sideIdx: number[] = [];
  const edgePos: number[] = [], edgeCol: number[] = [], edgeIdx: number[] = [];
  let dist = 0;
  const THICK = 7;
  const point = (i: number, lat: number, up: number): [number, number, number] => {
    const k = i % n;
    const d = track.dir[k];
    const x = track.px[k] - Math.sin(d) * lat, y = track.py[k] + Math.cos(d) * lat;
    return [x * S, (heightAt(t, track.px[k], track.py[k]) + up) * S, y * S];
  };
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    if (i > 0) dist += Math.hypot(track.px[k] - track.px[(k + n - 1) % n], track.py[k] - track.py[(k + n - 1) % n]);
    const v = dist / 120;
    top.push(...point(i, -hw, 0), ...point(i, hw, 0));
    uv.push(0, v, 1, v);
    side.push(...point(i, -hw, 0), ...point(i, -hw + 5, -THICK), ...point(i, hw, 0), ...point(i, hw - 5, -THICK));
    for (let q = 0; q < 4; q++) sideCol.push(q % 2 ? 0.1 : 0.32, q % 2 ? 0.06 : 0.2, q % 2 ? 0.28 : 0.6);
    // Bordes de neón: dos tiras estrechas pegadas a los lados, algo elevadas.
    edgePos.push(...point(i, -hw, 0.5), ...point(i, -hw + 4, 0.5), ...point(i, hw - 4, 0.5), ...point(i, hw, 0.5));
    for (let q = 0; q < 4; q++) edgeCol.push(1, 1, 1);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      const s = i * 4;
      sideIdx.push(s, s + 4, s + 1, s + 1, s + 4, s + 5, s + 2, s + 3, s + 6, s + 3, s + 7, s + 6);
      edgeIdx.push(s, s + 4, s + 1, s + 1, s + 4, s + 5, s + 2, s + 6, s + 3, s + 3, s + 6, s + 7);
    }
  }
  const mk = (pos: number[], index: number[], extra: Record<string, { v: number[]; n: number }>) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    for (const [name, { v, n: size }] of Object.entries(extra)) g.setAttribute(name, new THREE.Float32BufferAttribute(v, size));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };
  const road = roadTexture();
  const topMesh = new THREE.Mesh(
    mk(top, idx, { uv: { v: uv, n: 2 } }),
    new THREE.MeshStandardMaterial({ map: road, emissiveMap: road, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }),
  );
  topMesh.receiveShadow = true;
  group.add(topMesh);
  const sideMesh = new THREE.Mesh(
    mk(side, sideIdx, { color: { v: sideCol, n: 3 } }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }),
  );
  group.add(sideMesh);
  const edgeGeo = mk(edgePos, edgeIdx, { color: { v: edgeCol, n: 3 } });
  group.add(new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const colors = edgeGeo.attributes.color as THREE.BufferAttribute;
  const c = new THREE.Color();
  return {
    group,
    // Los bordes recorren el arcoíris a lo largo de la vuelta y avanzan con el tiempo.
    update(time) {
      for (let i = 0; i <= n; i++) {
        c.setHSL((((i / n) * 4 - time * 0.18) % 1 + 1) % 1, 1, 0.58);
        for (let q = 0; q < 4; q++) colors.setXYZ(i * 4 + q, c.r, c.g, c.b);
      }
      colors.needsUpdate = true;
    },
  };
}

export function buildSpace(track: Track, t: Terrain, S: number): SpaceScene {
  const group = new THREE.Group();
  const follow = new THREE.Group();
  const rng = new Rng(track.seed ^ 0x5bace);

  // Estrellas: puntos de colores sobre una esfera enorme.
  const N = 2200;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const u = rng.next() * 2 - 1, a = rng.next() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * 420, u * 420, Math.sin(a) * r * 420], i * 3);
    c.setHSL(rng.next() < 0.7 ? 0.6 : rng.next(), 0.5, 0.65 + rng.next() * 0.35);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
  follow.add(stars);
  // Nebulosas: halos grandes de colores.
  for (const [color, x, y, z, s, o] of [
    [0xa83cff, 220, 80, -260, 420, 0.4], [0x2c6cff, -300, 40, -120, 460, 0.38], [0xff3caa, 60, 120, 320, 380, 0.32],
    [0x3cffd0, -120, -60, 300, 320, 0.22], [0x6a3cff, 330, -20, 180, 360, 0.3],
  ] as const) {
    const g = glowSprite(color, s, o);
    g.material.fog = false;
    g.position.set(x, y, z);
    follow.add(g);
  }

  // Planetas por el mapa (se ven siempre, sin niebla).
  const cx = (TEX / 2) * S, cz = (TEX / 2) * S;
  const bodies: { mesh: THREE.Object3D; spin: number }[] = [];
  const planet = (kind: "gas" | "earth" | "mars" | "moon", r: number, x: number, y: number, z: number, ring = false) => {
    const mat = new THREE.MeshLambertMaterial({ map: planetTexture(kind, kind.length * 31 + Math.round(r)), fog: false });
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat);
    m.position.set(cx + x, y, cz + z);
    group.add(m);
    bodies.push({ mesh: m, spin: 0.02 + rng.next() * 0.03 });
    if (ring) {
      const rg = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.4, r * 2.2, 64),
        new THREE.MeshBasicMaterial({ color: 0xe8d0a0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false, depthWrite: false }),
      );
      rg.rotation.x = Math.PI / 2 - 0.35;
      rg.position.copy(m.position);
      group.add(rg);
    }
    return m;
  };
  planet("gas", 46, -210, 40, -150, true);
  planet("earth", 24, 190, 10, -230);
  planet("mars", 15, 230, 70, 140);
  planet("moon", 9, -110, 30, 240);
  const sun = glowSprite(0xfff0c0, 170, 1);
  sun.material.fog = false;
  sun.position.set(cx - 330, 150, cz + 120);
  group.add(sun);

  const ribbon = buildRibbon(track, t, S);
  group.add(ribbon.group);
  return {
    group, follow,
    update(time) {
      ribbon.update(time);
      for (const b of bodies) b.mesh.rotation.y = time * b.spin;
    },
  };
}
