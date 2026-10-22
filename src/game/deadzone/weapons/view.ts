// Arma en primera persona: modelo propio con manos, retroceso con muelle (y la corredera que se desliza),
// fogonazo con destello en cruz y luz, recarga, cambio y balanceo al andar. El grupo cuelga de la cámara, así que
// siempre va delante de los ojos.
import * as THREE from "three";
import { damp } from "../core/math";
import { KNIFE, SIGHTS, weaponDef, type WeaponDef, type WeaponId } from "./defs";
import { buildWeaponModel, type WeaponModel } from "./model";

let starTex: THREE.CanvasTexture | null = null;

/** Destello de cuatro puntas del fogonazo. */
function star(): THREE.CanvasTexture {
  if (starTex) return starTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,240,200,0.9)");
  grad.addColorStop(0.55, "rgba(255,160,60,0.35)");
  grad.addColorStop(1, "rgba(255,120,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = "rgba(255,230,170,0.9)";
  for (const [w, h] of [[120, 7], [7, 120]]) {
    g.beginPath();
    g.ellipse(64, 64, w / 2, h / 2, 0, 0, Math.PI * 2);
    g.fill();
  }
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

/** Cuchillo de combate con su mano: se ve solo mientras dura el tajo. */
function buildKnife(): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd2d8e0, metalness: 0.85, roughness: 0.28 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8c6a56, roughness: 0.9 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.3), steel);
  blade.position.z = -0.2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 4), steel);
  tip.rotation.x = -Math.PI / 2;
  tip.scale.set(0.75, 1, 1);
  tip.position.z = -0.385;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.02), grip);
  guard.position.z = -0.045;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.04, 0.12), grip);
  handle.position.z = 0.02;
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.09), skin);
  hand.position.set(0, -0.005, 0.03);
  g.add(blade, tip, guard, handle, hand);
  g.visible = false;
  return g;
}

export class WeaponView {
  readonly group = new THREE.Group();
  private readonly holder = new THREE.Group();
  private readonly models = new Map<string, WeaponModel>();
  private cur: WeaponModel | null = null;
  private curKey = "";
  private curDef: WeaponDef | null = null;
  private curId: WeaponId | null = null;
  private readonly flash = new THREE.Group();
  private readonly flashMats: THREE.MeshBasicMaterial[] = [];
  private readonly flashLight: THREE.PointLight;
  private flashT = 0;
  /** Retroceso actual y velocidad (muelle). */
  private kickZ = 0;
  private kickRot = 0;
  private kickQ = 0;
  private slideZ = 0;
  private sway = 0;
  private reloadAnim = 0;
  private switchAnim = 0;
  private ads = 0;
  private time = 0;
  private readonly knife = buildKnife();
  private knifeT = 0;

  constructor(camera: THREE.Camera) {
    this.group.add(this.holder);
    this.group.add(this.knife);
    this.holder.scale.setScalar(0.86);
    camera.add(this.group);
    // Fogonazo: dos planos cruzados con el destello, aditivos.
    const tex = star();
    for (let i = 0; i < 2; i++) {
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffd28a });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), m);
      q.rotation.z = i * Math.PI / 4;
      this.flash.add(q);
      this.flashMats.push(m);
    }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), this.flashMats[0]);
    front.rotation.y = Math.PI / 2;
    this.flash.add(front);
    this.flash.visible = false;
    this.holder.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 7, 2);
    this.holder.add(this.flashLight);
  }

  private model(id: WeaponId, upgraded: boolean): WeaponModel {
    const key = `${id}${upgraded ? "+" : ""}`;
    let m = this.models.get(key);
    if (!m) {
      m = buildWeaponModel(id, upgraded, true);
      this.models.set(key, m);
    }
    return m;
  }

  setWeapon(id: WeaponId | null, upgraded = false): void {
    const key = id ? `${id}${upgraded ? "+" : ""}` : "";
    if (key === this.curKey) return;
    this.curKey = key;
    this.cur?.group.removeFromParent();
    this.cur = null;
    this.curDef = null;
    this.curId = id;
    if (!id) return;
    const m = this.model(id, upgraded);
    this.cur = m;
    this.curDef = weaponDef(id, upgraded);
    this.holder.add(m.group);
    this.switchAnim = 0.42;
    this.flash.position.copy(m.muzzle);
    this.flashLight.position.copy(m.muzzle);
    this.flashMats.forEach((f) => f.color.setHex(this.curDef!.tint));
    this.flashLight.color.setHex(this.curDef!.tint);
  }

  /** Posición de la boca del cañón y de la expulsión de vainas en el mundo (para trazadoras y casquillos). */
  worldMuzzle(out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.cur) return out.set(0, 0, 0);
    this.group.updateWorldMatrix(true, true);
    return this.cur.group.localToWorld(out.copy(this.cur.muzzle));
  }

  worldEject(out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.cur) return out.set(0, 0, 0);
    this.group.updateWorldMatrix(true, true);
    return this.cur.group.localToWorld(out.copy(this.cur.eject));
  }

  /** 0..1: cuánto cubre la pantalla la mira telescópica (solo con armas de mira telescópica, ya casi apuntando). */
  get scopeK(): number {
    if (!this.curId || !SIGHTS[this.curId].scope) return 0;
    return Math.max(0, Math.min(1, (this.ads - 0.8) / 0.2));
  }

  /** Tajo de cuchillo: esconde el arma y cruza el cuchillo por delante de la cámara. */
  slash(): void {
    this.knifeT = KNIFE.swing;
  }

  /** Disparo: retroceso, corredera y fogonazo. */
  kick(def: WeaponDef): void {
    this.kickZ += 0.03 + def.recoil * 0.02;
    this.kickRot += def.recoil * 0.08;
    this.kickQ += def.recoil * 0.5;
    this.slideZ = 0.04;
    this.flashT = def.id === "shotgun" || def.id === "sniper" ? 0.09 : 0.055;
    this.flash.visible = true;
    const s = (def.id === "shotgun" ? 1.5 : def.id === "pistol" ? 0.8 : 1) * (0.8 + Math.random() * 0.6);
    this.flash.scale.setScalar(s);
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flashLight.intensity = 9;
  }

  update(
    dt: number,
    opts: { moving: number; sprinting: boolean; ads: boolean; reloading: boolean; hidden: boolean },
  ): void {
    this.time += dt;
    this.group.visible = !opts.hidden;
    // Muelle del retroceso.
    this.kickQ += (-this.kickZ * 120 - this.kickQ * 14) * dt;
    this.kickZ += this.kickQ * dt;
    this.kickRot = damp(this.kickRot, 0, 9, dt);
    this.slideZ = damp(this.slideZ, 0, 22, dt);
    if (this.cur?.slide) this.cur.slide.position.z = this.slideZ;
    this.ads = damp(this.ads, opts.ads ? 1 : 0, 10, dt);
    this.reloadAnim = damp(this.reloadAnim, opts.reloading ? 1 : 0, 7, dt);
    this.switchAnim = Math.max(0, this.switchAnim - dt);
    this.knifeT = Math.max(0, this.knifeT - dt);
    this.holder.visible = this.knifeT <= 0;
    this.knife.visible = this.knifeT > 0 && !opts.hidden;
    if (this.knife.visible) {
      // Barrido de derecha a izquierda con un pequeño estoque al final.
      const k = 1 - this.knifeT / KNIFE.swing;
      const e = Math.sin(Math.min(1, k) * Math.PI);
      this.knife.position.set(0.3 - k * 0.5, -0.17 + e * 0.07, -0.36 - e * 0.1);
      this.knife.rotation.set(-0.15 - e * 0.25, 0.9 - k * 1.7, 0.55 - k * 1.1);
    }
    this.sway += dt * (2 + opts.moving * 7);
    // Las armas mejoradas laten.
    if (this.cur) for (const g of this.cur.glow) g.emissiveIntensity = 2.2 + Math.sin(this.time * 4.5) * 0.9;

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flash.visible = false;
        this.flashLight.intensity = 0;
      }
    }

    const breathe = Math.sin(this.time * 1.6) * 0.0025;
    const bobX = Math.sin(this.sway) * 0.012 * opts.moving;
    const bobY = Math.cos(this.sway * 2) * 0.008 * opts.moving + breathe;
    const sprintDrop = opts.sprinting ? -0.06 : 0;
    const switchDrop = this.switchAnim * 0.5;

    // Posición: cadera → hombro al apuntar.
    const hipX = 0.19 + bobX;
    const hipY = -0.19 + bobY + sprintDrop - switchDrop - this.reloadAnim * 0.11;
    const hipZ = -0.4 + this.kickZ;
    // Al apuntar, el modelo se coloca para que el punto de su línea de mira quede justo en el centro de la pantalla.
    const sg = this.curId ? SIGHTS[this.curId] : null;
    const sc = this.holder.scale.x;
    const adsX = bobX * 0.2;
    const adsY = (sg ? -sc * sg.y : -0.092) + bobY * 0.25 - switchDrop - this.reloadAnim * 0.1;
    const adsZ = (sg ? -sg.relief - sc * sg.z : -0.28) + this.kickZ * 0.6;

    this.holder.position.set(
      hipX + (adsX - hipX) * this.ads,
      hipY + (adsY - hipY) * this.ads,
      hipZ + (adsZ - hipZ) * this.ads,
    );
    this.holder.rotation.set(
      -this.kickRot + this.reloadAnim * 0.55 + (opts.sprinting ? 0.25 : 0),
      (1 - this.ads) * 0.07 + this.reloadAnim * 0.35 + (opts.sprinting ? -0.5 : 0),
      (1 - this.ads) * 0.03 + this.switchAnim * 0.4,
    );
    // Con la mira telescópica a pantalla completa no se ve el arma (se dibuja la retícula encima).
    if (this.scopeK > 0.6) this.holder.visible = false;
  }

  dispose(): void {
    for (const m of this.models.values()) {
      m.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.models.clear();
    starTex?.dispose();
    starTex = null;
  }
}
