// Fusión de la geometría estática del mapa: cientos de cajas sueltas se juntan en una malla por material (un
// puñado de llamadas de dibujo en vez de cientos) y, de paso, se recalculan las coordenadas de textura en metros
// del mundo: un ladrillo mide lo mismo en un muro corto que en uno largo y las texturas continúan de una pieza a
// la contigua sin estirarse.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Metros por repetición de textura de un material (undefined: no se recalculan las UV). */
export type TileOf = (m: THREE.Material) => number | undefined;

export function batchStatic(root: THREE.Object3D, tileOf: TileOf): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  let before = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if (!mesh.visible || Array.isArray(mesh.material) || mesh.userData.keep) return;
    before++;
    const list = buckets.get(mesh.material);
    if (list) list.push(mesh);
    else buckets.set(mesh.material, [mesh]);
  });

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  let after = 0;
  for (const [material, meshes] of buckets) {
    const tile = tileOf(material);
    const parts: THREE.BufferGeometry[] = [];
    const allIndexed = meshes.every((m) => m.geometry.index);
    for (const mesh of meshes) {
      let g = mesh.geometry.clone();
      if (!allIndexed && g.index) g = g.toNonIndexed();
      g.applyMatrix4(mesh.matrixWorld);
      // Solo se conservan los atributos comunes.
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (tile) {
        const pos = g.attributes.position;
        const nor = g.attributes.normal;
        const uv = g.attributes.uv as THREE.BufferAttribute;
        const k = 1 / tile;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          n.fromBufferAttribute(nor, i);
          const ax = Math.abs(n.x);
          const ay = Math.abs(n.y);
          const az = Math.abs(n.z);
          if (ay >= ax && ay >= az) uv.setXY(i, v.x * k, v.z * k);
          else if (ax >= az) uv.setXY(i, v.z * k, v.y * k);
          else uv.setXY(i, v.x * k, v.y * k);
        }
      }
      parts.push(g);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    const out = new THREE.Mesh(merged, material);
    out.castShadow = true;
    out.receiveShadow = true;
    out.matrixAutoUpdate = false;
    root.add(out);
    after++;
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  }
  return { before, after };
}
