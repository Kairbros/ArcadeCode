// Poderes en el suelo: una gema que gira con un anillo, un cartel con la marca del poder que siempre mira a la
// cámara y un haz de luz que se ve de lejos. Parpadean los últimos segundos antes de desaparecer. El color brilla
// (valores por encima de 1) para que el bloom del postproceso los haga destacar en la noche. Solo dibuja: el
// anfitrión decide cuándo caen y quién los recoge (`game/powerups.ts`).
import * as THREE from "three";
import { POWERS, POWER_TUNING, type PowerDrop, type PowerKind } from "../game/powerups";

const LABEL: Record<PowerKind, string> = { maxAmmo: "MAX", nuke: "BOOM", instaKill: "KILL", doublePoints: "2X", infiniteAmmo: "INF", carpenter: "TAB", bonusPoints: "PTS", fireSale: "SALE", deathMachine: "MG" };

function icon(kind: PowerKind): THREE.CanvasTexture {
  const def = POWERS[kind];
  const hex = `#${def.color.toString(16).padStart(6, "0")}`;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(14,10,20,0.92)";
  g.beginPath();
  g.arc(32, 32, 29, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = hex;
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = hex;
  g.font = "bold 17px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(LABEL[kind], 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Item {
  group: THREE.Group;
  sign: THREE.Sprite;
  gem: THREE.Mesh;
  ring: THREE.Mesh;
}

export class PowerDropMeshes {
  readonly group = new THREE.Group();
  private readonly items = new Map<number, Item>();
  private readonly icons = new Map<PowerKind, THREE.CanvasTexture>();
  private readonly gemGeo = new THREE.OctahedronGeometry(0.2, 0);
  private readonly ringGeo = new THREE.TorusGeometry(0.34, 0.025, 8, 28);
  private readonly beamGeo = new THREE.CylinderGeometry(0.18, 0.3, 6, 12, 1, true);

  private make(d: PowerDrop): Item {
    const def = POWERS[d.kind];
    const col = new THREE.Color(def.color);
    const hot = new THREE.Color(col.r * 2.2, col.g * 2.2, col.b * 2.2); // HDR: el bloom lo hace brillar
    const group = new THREE.Group();
    const gem = new THREE.Mesh(this.gemGeo, new THREE.MeshBasicMaterial({ color: hot }));
    gem.scale.y = 1.5;
    group.add(gem);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: hot }));
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    let tex = this.icons.get(d.kind);
    if (!tex) {
      tex = icon(d.kind);
      this.icons.set(d.kind, tex);
    }
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sign.scale.setScalar(0.62);
    sign.position.y = 0.62;
    group.add(sign);
    const beam = new THREE.Mesh(
      this.beamGeo,
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 2.9;
    group.add(beam);
    this.group.add(group);
    return { group, sign, gem, ring };
  }

  /** Pone los poderes del suelo tal como están (altura flotando, giro, parpadeo al final). */
  sync(drops: readonly { id: number; kind: PowerKind; x: number; z: number; age: number }[], time: number): void {
    const live = new Set<number>();
    for (const d of drops) {
      live.add(d.id);
      let it = this.items.get(d.id);
      if (!it) {
        it = this.make(d as PowerDrop);
        this.items.set(d.id, it);
      }
      it.group.position.set(d.x, 0.95 + Math.sin(time * 3 + d.id) * 0.1, d.z);
      it.gem.rotation.y = time * 2.6;
      it.ring.rotation.z = time * 2;
      const left = POWER_TUNING.lifetime - d.age;
      it.group.visible = left > POWER_TUNING.blinkTime || Math.floor(time * (left < 3 ? 10 : 5)) % 2 === 0;
    }
    for (const [id, it] of this.items) {
      if (live.has(id)) continue;
      it.group.removeFromParent();
      (it.sign.material as THREE.SpriteMaterial).dispose();
      (it.gem.material as THREE.Material).dispose();
      (it.ring.material as THREE.Material).dispose();
      it.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m !== it!.gem && m !== it!.ring) (m.material as THREE.Material).dispose();
      });
      this.items.delete(id);
    }
  }

  clear(): void {
    this.sync([], 0);
  }

  dispose(): void {
    this.clear();
    for (const t of this.icons.values()) t.dispose();
    this.icons.clear();
    this.gemGeo.dispose();
    this.ringGeo.dispose();
    this.beamGeo.dispose();
    this.group.removeFromParent();
  }
}
