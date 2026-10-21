// Tablones de las barricadas al estilo Call of Duty Zombies: cuando un zombi arranca uno, sale despedido hacia fuera, rebota y
// queda tirado en el suelo; al reparar, el tablón del suelo se eleva flotando, gira un instante y se coloca solo en su hueco
// con un golpe seco. Es solo visual: el estado de verdad es `BarricadeWindow.planks` (el anfitrión) y cada pantalla lo anima.
import * as THREE from "three";

type Mode = "slot" | "off" | "ground" | "on";

interface Slot {
  mesh: THREE.Mesh;
  /** Pose en la barricada. */
  home: { p: THREE.Vector3; r: THREE.Euler };
  mode: Mode;
  /** Tiempo en el modo actual y retraso antes de empezar (reparaciones en cadena). */
  t: number;
  delay: number;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  /** Pose de partida de la subida y punto donde flota. */
  from: { p: THREE.Vector3; r: THREE.Euler };
  hover: THREE.Vector3;
  bounces: number;
  restRot: THREE.Euler;
}

/** Material brillante mientras el tablón flota (compartido, late con el tiempo). */
let hoverMat: THREE.MeshStandardMaterial | null = null;
function hoverMaterial(): THREE.MeshStandardMaterial {
  if (!hoverMat) hoverMat = new THREE.MeshStandardMaterial({ color: 0xd9a566, emissive: 0xffb870, emissiveIntensity: 0.9, roughness: 0.6 });
  return hoverMat;
}

export function disposePlankAssets(): void {
  hoverMat?.dispose();
  hoverMat = null;
}

const GRAVITY = 16;
const HOVER_TIME = 0.42;
const FLY_TIME = 0.3;

const ease = (k: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const lerpAngle = (a: number, b: number, k: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export class PlankRig {
  private readonly slots: Slot[];
  /** Cuántos tablones hay puestos ahora mismo (los índices 0..shown−1). */
  private shown: number;
  private time = 0;

  /**
   * @param planks grupo cuyos hijos son los tablones, de abajo arriba.
   * @param outerSign signo del eje local Z que apunta a la calle (hacia donde salen despedidos).
   * @param width ancho del hueco (m).
   */
  constructor(
    planks: THREE.Group,
    private readonly outerSign: number,
    private readonly width: number,
  ) {
    this.slots = planks.children.map((c) => {
      const mesh = c as THREE.Mesh;
      mesh.userData.baseMat = mesh.material;
      return {
        mesh,
        home: { p: mesh.position.clone(), r: mesh.rotation.clone() },
        mode: "slot" as Mode,
        t: 0,
        delay: 0,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        from: { p: new THREE.Vector3(), r: new THREE.Euler() },
        hover: new THREE.Vector3(),
        bounces: 0,
        restRot: new THREE.Euler(),
      };
    });
    this.shown = this.slots.length;
  }

  get count(): number {
    return this.shown;
  }

  /** Pone todos los tablones sin animar (reinicio de partida). */
  snap(count: number): void {
    this.shown = Math.max(0, Math.min(this.slots.length, count));
    this.slots.forEach((s, i) => {
      s.mode = i < this.shown ? "slot" : "ground";
      s.mesh.material = s.mesh.userData.baseMat ?? s.mesh.material;
      if (i < this.shown) {
        s.mesh.position.copy(s.home.p);
        s.mesh.rotation.copy(s.home.r);
        s.mesh.scale.setScalar(1);
      } else this.settle(s, i);
    });
  }

  /** El estado real cambió: arranca los tablones que sobran o se colocan los que faltan. */
  set(count: number): void {
    const target = Math.max(0, Math.min(this.slots.length, Math.round(count)));
    if (target === this.shown) return;
    if (target < this.shown) {
      for (let i = this.shown - 1; i >= target; i--) this.rip(this.slots[i], i);
    } else {
      let order = 0;
      for (let i = this.shown; i < target; i++) this.build(this.slots[i], order++);
    }
    this.shown = target;
  }

  /** El zombi lo arranca: sale despedido hacia la calle con giro y rebota. */
  private rip(s: Slot, i: number): void {
    s.mode = "off";
    s.t = 0;
    s.delay = 0;
    s.bounces = 0;
    s.mesh.material = s.mesh.userData.baseMat ?? s.mesh.material;
    s.vel.set((Math.random() - 0.5) * 2.4, 2 + Math.random() * 1.8, this.outerSign * (2.6 + Math.random() * 1.6));
    s.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10);
    this.restPose(s, i);
  }

  /** Pose en la que se queda tirado: plano, a un lado, con un giro propio. */
  private restPose(s: Slot, i: number): void {
    s.restRot.set(Math.PI / 2 + (Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 1.1);
    void i;
  }

  /** Se asienta en el suelo (sin simular): lo usa el reinicio. */
  private settle(s: Slot, i: number): void {
    this.restPose(s, i);
    s.mesh.position.set((Math.random() - 0.5) * this.width * 0.7, 0.045, this.outerSign * (0.6 + Math.random() * 0.8));
    s.mesh.rotation.copy(s.restRot);
    s.mesh.scale.setScalar(1);
  }

  /** Repara: el tablón del suelo flota, gira y se coloca en su hueco. */
  private build(s: Slot, order: number): void {
    s.from.p.copy(s.mesh.position);
    s.from.r.copy(s.mesh.rotation);
    s.mode = "on";
    s.t = 0;
    s.delay = order * 0.09;
    // Flota del lado de dentro (donde está quien repara), a altura de pecho y repartido a lo ancho.
    s.hover.set((Math.random() - 0.5) * this.width * 0.5, 1.0 + Math.random() * 0.45, -this.outerSign * (0.55 + Math.random() * 0.3));
    s.spin.set(0, (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3), (Math.random() - 0.5) * 3);
    s.mesh.userData.baseMat ??= s.mesh.material;
  }

  update(dt: number): void {
    this.time += dt;
    for (const s of this.slots) {
      if (s.mode === "slot" || (s.mode === "ground" && s.t > 5)) continue;
      s.t += dt;
      const m = s.mesh;
      if (s.mode === "off") {
        s.vel.y -= GRAVITY * dt;
        m.position.addScaledVector(s.vel, dt);
        m.rotation.x += s.spin.x * dt;
        m.rotation.y += s.spin.y * dt;
        m.rotation.z += s.spin.z * dt;
        if (m.position.y <= 0.045) {
          m.position.y = 0.045;
          if (s.bounces < 2 && Math.abs(s.vel.y) > 1.2) {
            s.vel.y *= -0.32;
            s.vel.x *= 0.55;
            s.vel.z *= 0.55;
            s.bounces++;
          } else {
            // Se desliza un poco y acaba tumbado.
            s.vel.y = 0;
            s.vel.x *= 1 - Math.min(1, dt * 7);
            s.vel.z *= 1 - Math.min(1, dt * 7);
            s.spin.multiplyScalar(1 - Math.min(1, dt * 8));
            m.rotation.x = lerpAngle(m.rotation.x, s.restRot.x, Math.min(1, dt * 9));
            m.rotation.y = lerpAngle(m.rotation.y, 0, Math.min(1, dt * 9));
            m.rotation.z = lerpAngle(m.rotation.z, s.restRot.z, Math.min(1, dt * 9));
            if (s.vel.lengthSq() < 0.02) {
              s.mode = "ground";
              s.t = 0;
            }
          }
        }
        // No se aleja más de lo razonable de la ventana.
        m.position.z = Math.max(-3, Math.min(3, m.position.z));
      } else if (s.mode === "on") {
        const local = s.t - s.delay;
        if (local < 0) continue;
        if (local < HOVER_TIME) {
          // Sube flotando hacia el aire (gira despacio y brilla).
          const k = ease(local / HOVER_TIME);
          m.material = hoverMaterial();
          hoverMaterial().emissiveIntensity = 0.7 + Math.sin(this.time * 18) * 0.3;
          m.position.lerpVectors(s.from.p, s.hover, k);
          m.position.y += Math.sin(this.time * 6 + s.delay * 10) * 0.02 * k;
          m.rotation.x = lerpAngle(s.from.r.x, 0, k);
          m.rotation.y = s.from.r.y + s.spin.y * local * 0.5 * k;
          m.rotation.z = lerpAngle(s.from.r.z, s.spin.z * 0.1, k);
        } else if (local < HOVER_TIME + FLY_TIME) {
          // Se lanza a su sitio con un último giro rápido.
          const k = ease((local - HOVER_TIME) / FLY_TIME);
          const hoverRotY = s.from.r.y + s.spin.y * HOVER_TIME * 0.5;
          m.position.lerpVectors(s.hover, s.home.p, k);
          m.rotation.x = lerpAngle(0, s.home.r.x, k);
          m.rotation.y = lerpAngle(hoverRotY, 0, k);
          m.rotation.z = lerpAngle(s.spin.z * 0.1, s.home.r.z, k);
          m.scale.setScalar(1 + (1 - k) * 0.08);
        } else {
          // Golpe seco: pequeño rebote al encajar.
          m.material = m.userData.baseMat ?? m.material;
          m.position.copy(s.home.p);
          m.rotation.copy(s.home.r);
          m.scale.setScalar(1);
          s.mode = "slot";
          s.t = 0;
        }
      }
    }
  }
}
