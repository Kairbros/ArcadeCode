// Cuerpo de los demás jugadores: soldado de bloques (casco, chaleco, mochila, botas) con el color del jugador en la
// camiseta y el casco, y SU arma de verdad en las manos (el mismo modelo 3D que ve él en primera persona). Se coloca
// según el estado que manda el anfitrión; el cuerpo mira a −Z, como el zombi y la cámara.
import * as THREE from "three";
import { blockGeometry, glowSprite, type Block } from "../../core/three";
import { damp } from "../core/math";
import { weaponDef, type WeaponId } from "../weapons/defs";
import { buildWeaponModel, type WeaponModel } from "../weapons/model";

function shade(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

export class Avatar {
  readonly group = new THREE.Group();
  private readonly legs: THREE.Object3D[] = [];
  private readonly arms: THREE.Object3D[] = [];
  private readonly head: THREE.Group;
  private readonly hand: THREE.Group;
  private readonly flash: THREE.Sprite;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly geos: THREE.BufferGeometry[] = [];
  private weapon: WeaponModel | null = null;
  private weaponKey = "";
  private readonly models = new Map<string, WeaponModel>();
  private swing = 0;
  private lastX = 0;
  private lastZ = 0;
  private placed = false;
  private flashT = 0;
  private time = 0;

  constructor(color: number) {
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.08 });
    const skin = 0xc89a78;
    const dark = 0x1f2329;
    const vest = 0x2c3338;
    const geo = (blocks: Block[]) => {
      const g = blockGeometry(blocks);
      this.geos.push(g);
      return g;
    };
    const mesh = (g: THREE.BufferGeometry) => {
      const m = new THREE.Mesh(g, this.mat);
      m.castShadow = true;
      return m;
    };

    this.group.add(
      mesh(
        geo([
          { s: [0.5, 0.62, 0.28], p: [0, 1.18, 0], color },
          { s: [0.54, 0.4, 0.31], p: [0, 1.24, 0], color: vest },
          { s: [0.5, 0.07, 0.3], p: [0, 0.88, 0], color: dark },
          { s: [0.38, 0.46, 0.2], p: [0, 1.2, 0.24], color: shade(vest, 1.15) },
          { s: [0.4, 0.06, 0.22], p: [0, 1.46, 0.24], color: dark },
          // Bolsillos del chaleco y brazalete del color del jugador.
          { s: [0.12, 0.12, 0.05], p: [-0.12, 1.1, -0.17], color: shade(vest, 1.3) },
          { s: [0.12, 0.12, 0.05], p: [0.12, 1.1, -0.17], color: shade(vest, 1.3) },
        ]),
      ),
    );

    this.head = new THREE.Group();
    this.head.position.y = 1.66;
    this.head.add(
      mesh(
        geo([
          { s: [0.26, 0.28, 0.26], p: [0, 0, 0], color: skin },
          { s: [0.31, 0.13, 0.31], p: [0, 0.12, 0], color: dark },
          { s: [0.32, 0.05, 0.32], p: [0, 0.07, 0], color: color },
          { s: [0.22, 0.06, 0.02], p: [0, 0.03, -0.135], color: 0x0c0e12 },
          { s: [0.05, 0.1, 0.05], p: [0.17, 0.0, 0.0], color: dark },
          { s: [0.05, 0.1, 0.05], p: [-0.17, 0.0, 0.0], color: dark },
        ]),
      ),
    );
    this.group.add(this.head);

    const limb = (x: number, y: number, blocks: Block[], list: THREE.Object3D[]) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      pivot.add(mesh(geo(blocks)));
      this.group.add(pivot);
      list.push(pivot);
      return pivot;
    };
    const leg = (): Block[] => [
      { s: [0.17, 0.46, 0.17], p: [0, -0.23, 0], color: dark },
      { s: [0.16, 0.28, 0.16], p: [0, -0.6, 0], color: shade(dark, 1.2) },
      { s: [0.17, 0.12, 0.27], p: [0, -0.8, -0.04], color: 0x111317 },
      { s: [0.18, 0.05, 0.17], p: [0, -0.46, -0.02], color: vest },
    ];
    limb(-0.14, 0.88, leg(), this.legs);
    limb(0.14, 0.88, leg(), this.legs);
    const arm = (): Block[] => [
      { s: [0.13, 0.34, 0.13], p: [0, -0.17, 0], color },
      { s: [0.115, 0.26, 0.115], p: [0, -0.46, 0], color: skin },
      { s: [0.12, 0.1, 0.12], p: [0, -0.64, 0], color: dark },
    ];
    limb(-0.33, 1.46, arm(), this.arms);
    const right = limb(0.33, 1.46, arm(), this.arms);

    // La mano derecha lleva el arma: el soporte cancela el giro de 90° del brazo para que el cañón mire al frente.
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.6, 0);
    this.hand.rotation.x = -Math.PI / 2;
    right.add(this.hand);
    this.flash = glowSprite(0xffd27a, 0.55, 0.95);
    this.flash.visible = false;
    this.hand.add(this.flash);
  }

  /** Arma que lleva en la mano (null: ninguna). */
  setWeapon(id: WeaponId | null, upgraded = false): void {
    const key = id ? `${id}${upgraded ? "+" : ""}` : "";
    if (key === this.weaponKey) return;
    this.weaponKey = key;
    if (this.weapon) this.hand.remove(this.weapon.group);
    this.weapon = null;
    if (!id) return;
    let m = this.models.get(key);
    if (!m) {
      m = buildWeaponModel(id, upgraded, false);
      this.models.set(key, m);
    }
    this.weapon = m;
    m.group.position.set(0, 0, 0.04);
    this.hand.add(m.group);
    this.flash.position.copy(m.muzzle);
    this.flash.material.color.setHex(weaponDef(id, upgraded).tint);
  }

  /** Coloca al jugador (suavizando el movimiento entre estados) y le da la pose. */
  set(dt: number, x: number, y: number, z: number, yaw: number, pitch: number, crouch: boolean, alive: boolean): void {
    this.time += dt;
    if (!this.placed) {
      this.group.position.set(x, y, z);
      this.lastX = x;
      this.lastZ = z;
      this.placed = true;
    }
    const k = 1 - Math.exp(-16 * dt);
    this.group.position.x += (x - this.group.position.x) * k;
    this.group.position.z += (z - this.group.position.z) * k;
    this.group.position.y += (y - this.group.position.y) * k;
    const moved = Math.hypot(this.group.position.x - this.lastX, this.group.position.z - this.lastZ);
    this.lastX = this.group.position.x;
    this.lastZ = this.group.position.z;
    this.swing += moved * 4.2;
    const walk = moved > 0.002 ? 0.8 : 0.05;
    this.legs[0].rotation.x = Math.sin(this.swing) * walk;
    this.legs[1].rotation.x = -Math.sin(this.swing) * walk;
    // Apunta: los dos brazos al frente, sube con el cabeceo; el izquierdo sostiene el guardamanos.
    const aim = Math.PI / 2 + pitch * 0.9;
    this.arms[1].rotation.x = aim - 0.05;
    this.arms[0].rotation.x = aim - 0.25;
    this.arms[0].rotation.z = -0.38;
    this.head.rotation.x = pitch * 0.6;
    this.group.rotation.y = this.group.rotation.y + angleStep(this.group.rotation.y, yaw, dt);
    this.group.scale.y = crouch ? 0.74 : 1;
    // Abatido: tumbado de espaldas en el suelo.
    this.group.rotation.x = damp(this.group.rotation.x, alive ? 0 : Math.PI / 2, 10, dt);
    this.group.position.y = alive ? this.group.position.y : y + 0.2;
    // Las armas mejoradas laten.
    if (this.weapon) for (const g of this.weapon.glow) g.emissiveIntensity = 2 + Math.sin(this.time * 5) * 0.9;
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.visible = this.flashT > 0;
  }

  /** Fogonazo del arma (cuando dispara). */
  fire(): void {
    this.flashT = 0.06;
  }

  /** Boca del cañón en el mundo (para la trazadora y el humo). */
  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.weapon) return out.set(this.group.position.x, this.group.position.y + 1.4, this.group.position.z);
    this.group.updateWorldMatrix(true, true);
    return this.weapon.group.localToWorld(out.copy(this.weapon.muzzle));
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.models.values()) m.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.models.clear();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}

/** Paso de giro por el camino corto hacia `target` (suavizado). */
function angleStep(from: number, target: number, dt: number): number {
  let d = ((target - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d * (1 - Math.exp(-14 * dt));
}
