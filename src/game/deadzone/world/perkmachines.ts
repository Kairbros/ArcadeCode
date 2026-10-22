// Máquinas de ventajas (Juggernog, Speed Cola, Double Tap, Quick Revive): un armario con el cartel luminoso de su
// color, el frente de cristal con la botella y una luz que parpadea. Sin energía están apagadas (Quick Revive no la
// necesita). Aquí solo está lo visual; las reglas son de `game/interact.ts` y `game/perks.ts`.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { glowSprite } from "../../core/three";
import { PERKS, type PerkId } from "../game/perks";
import { sign } from "./centerpiece";

export interface PerkMachine {
  id: PerkId;
  position: THREE.Vector3;
  group: THREE.Group;
  /** Mitad de la huella (m) en X y Z del mundo, para el colisionador. */
  half: { x: number; z: number };
  powered: boolean;
  update(dt: number, time: number): void;
  dispose(): void;
}

const hexOf = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Frente de cristal: fondo oscuro con la botella de la ventaja encendida. */
function frontTexture(id: PerkId): THREE.CanvasTexture {
  const def = PERKS[id];
  const hex = hexOf(def.color);
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 192;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, 192);
  bg.addColorStop(0, "#0a0d12");
  bg.addColorStop(1, "#12161d");
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 192);
  g.shadowColor = hex;
  g.shadowBlur = 16;
  g.fillStyle = hex;
  // Botella: cuello, hombros y cuerpo.
  g.fillRect(56, 26, 16, 26);
  g.beginPath();
  g.moveTo(56, 50);
  g.lineTo(34, 78);
  g.lineTo(34, 160);
  g.quadraticCurveTo(34, 172, 46, 172);
  g.lineTo(82, 172);
  g.quadraticCurveTo(94, 172, 94, 160);
  g.lineTo(94, 78);
  g.lineTo(72, 50);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = "#0a0d12";
  g.font = "bold 46px 'Courier New', monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(def.icon, 64, 122);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildPerkMachine(id: PerkId, spot: { x: number; z: number; rot: number }): PerkMachine {
  const def = PERKS[id];
  const group = new THREE.Group();
  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.rot;
  const col = new THREE.Color(def.color);
  const shell = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.28), roughness: 0.42, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.5, metalness: 0.8 });
  const glowMat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.25), emissive: def.color, emissiveIntensity: 0.2, roughness: 0.3 });

  const body = new THREE.Mesh(new RoundedBoxGeometry(1.15, 2.25, 0.8, 3, 0.05), shell);
  body.position.y = 1.125;
  group.add(body);
  // Zócalo, cornisa y tiras laterales luminosas.
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.14, 0.86), dark);
  base.position.y = 0.07;
  group.add(base);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.1, 0.86), dark);
  cornice.position.y = 2.25;
  group.add(cornice);
  for (const sx of [-0.58, 0.58]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.9, 0.04), glowMat);
    strip.position.set(sx, 1.15, 0.38);
    group.add(strip);
  }
  // Frente de cristal con la botella.
  const frontMap = frontTexture(id);
  const frontMat = new THREE.MeshStandardMaterial({ map: frontMap, emissive: 0xffffff, emissiveMap: frontMap, emissiveIntensity: 0.15, roughness: 0.2, metalness: 0.2 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.3), frontMat);
  front.position.set(0, 1.1, 0.405);
  group.add(front);
  // Cartel superior.
  const signMap = sign(def.name, hexOf(def.color), 256, 64, "bold 30px 'Courier New', monospace");
  const signMat = new THREE.MeshStandardMaterial({ map: signMap, emissive: 0xffffff, emissiveMap: signMap, emissiveIntensity: 0.2, roughness: 0.4 });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.3), signMat);
  board.position.set(0, 1.9, 0.405);
  group.add(board);
  // Rendija para la moneda.
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.06), dark);
  slot.position.set(0, 0.35, 0.4);
  group.add(slot);
  const halo = glowSprite(def.color, 2.6, 0);
  halo.position.set(0, 1.3, 0.9);
  halo.userData.dyn = true;
  group.add(halo);

  const swap = Math.abs(Math.sin(spot.rot)) > 0.5;
  const machine: PerkMachine = {
    id,
    position: new THREE.Vector3(spot.x + Math.sin(spot.rot) * 0.5, 1.1, spot.z + Math.cos(spot.rot) * 0.5),
    group,
    half: swap ? { x: 0.42, z: 0.6 } : { x: 0.6, z: 0.42 },
    powered: false,
    update(_dt, time) {
      const on = machine.powered || !def.needsPower;
      const flick = on ? 1.5 + Math.sin(time * 3 + spot.x) * 0.25 + (Math.sin(time * 17) > 0.96 ? -0.6 : 0) : 0.05;
      glowMat.emissiveIntensity = on ? 2.2 : 0.05;
      frontMat.emissiveIntensity = on ? flick * 0.32 : 0.04;
      signMat.emissiveIntensity = on ? flick * 0.45 : 0.04;
      (halo.material as THREE.SpriteMaterial).opacity = on ? 0.32 : 0;
    },
    dispose() {
      frontMat.map?.dispose();
      signMat.map?.dispose();
    },
  };
  return machine;
}
