// Escena 3D de «Mazo Loco» (Three.js): una mesa redonda de fieltro bajo una lámpara, los rivales sentados con
// sus cartas boca abajo en las manos y tú en primera persona, viendo solo tus manos sosteniendo el abanico
// (como en Liar's Bar). Las cartas de la mano van pegadas a la cámara y se colocan con las mismas poses que
// usa el ratón (`handPoses`), así que lo que se ve y lo que se pulsa coinciden al píxel.
import * as THREE from "three";
import { buildBean } from "../core/bean";
import { PLAYER_COLORS } from "../core/config";
import { projectTo } from "../core/three";
import { drawBack, drawFace } from "./cardtex";
import { CARD_COLORS, CARD_H, CARD_W, CH, CW } from "./config";
import { canPlay } from "./deck";
import { handPoses } from "./layout";
import { canAct, seatHand, type CardsSnap } from "./state";

const FOV = 58;
const HAND_D = 0.62;
const HH = HAND_D * Math.tan((FOV / 2) * (Math.PI / 180));
/** Unidades del mundo por píxel lógico en el plano de la mano. */
const PX = (2 * HH) / CH;
const TABLE_Y = 0.78;
const TABLE_R = 1.1;
const RATIO = CARD_H / CARD_W;
const FLY = 0.42;
/** Escala del poroto (mide ~1,95 m): de pie junto a la mesa le queda a la altura del pecho. */
const BEAN = 0.7;

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

// --- Cartas -------------------------------------------------------------------------------------------
let cardGeo: THREE.BufferGeometry | null = null;

/** Carta de 1 de ancho por 1,4 de alto con las esquinas redondeadas y las UV de 0 a 1. */
function cardGeometry(): THREE.BufferGeometry {
  if (cardGeo) return cardGeo;
  const w = 1;
  const h = RATIO;
  const r = 0.07;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ShapeGeometry(s, 5);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  cardGeo = g;
  return g;
}

type MatKind = "basic" | "lit";

class CardMaterials {
  private readonly faces = new Map<string, THREE.Material>();
  private readonly backs = new Map<MatKind, THREE.Material>();
  private readonly faceTex = new Map<number, THREE.CanvasTexture>();
  private backTex: THREE.CanvasTexture | null = null;

  face(id: number, kind: MatKind): THREE.Material {
    const key = `${kind}${id}`;
    let m = this.faces.get(key);
    if (!m) {
      let t = this.faceTex.get(id);
      if (!t) {
        t = drawFace(id);
        this.faceTex.set(id, t);
      }
      m = this.make(t, kind);
      this.faces.set(key, m);
    }
    return m;
  }

  back(kind: MatKind): THREE.Material {
    let m = this.backs.get(kind);
    if (!m) {
      this.backTex ??= drawBack();
      m = this.make(this.backTex, kind);
      this.backs.set(kind, m);
    }
    return m;
  }

  private make(map: THREE.Texture, kind: MatKind): THREE.Material {
    if (kind === "basic") return new THREE.MeshBasicMaterial({ map, toneMapped: false });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.16 });
  }

  /** Brillo de una cara de la mano (1 = pleno). */
  shade(id: number, v: number): void {
    const m = this.faces.get(`basic${id}`) as THREE.MeshBasicMaterial | undefined;
    if (m) m.color.setScalar(v);
  }

  dispose(): void {
    for (const m of this.faces.values()) m.dispose();
    for (const m of this.backs.values()) m.dispose();
    for (const t of this.faceTex.values()) t.dispose();
    this.backTex?.dispose();
    this.faces.clear();
    this.backs.clear();
    this.faceTex.clear();
    this.backTex = null;
  }
}

/** Una carta: cara hacia +Z y dorso hacia −Z, unidas en un grupo para moverlas y girarlas juntas. */
class CardObj {
  readonly group = new THREE.Group();
  private readonly front: THREE.Mesh;
  private readonly rear: THREE.Mesh;
  id = -1;

  constructor(private readonly mats: CardMaterials, private readonly kind: MatKind) {
    this.front = new THREE.Mesh(cardGeometry(), mats.back(kind));
    this.rear = new THREE.Mesh(cardGeometry(), mats.back(kind));
    this.rear.rotation.y = Math.PI;
    this.rear.position.z = -0.012;
    this.front.position.z = 0.0;
    this.group.add(this.front, this.rear);
    if (kind === "lit") this.front.castShadow = this.rear.castShadow = true;
  }

  /** id ≥ 0 muestra esa cara; −1 deja el dorso por los dos lados. */
  set(id: number): void {
    if (id === this.id) return;
    this.id = id;
    this.front.material = id >= 0 ? this.mats.face(id, this.kind) : this.mats.back(this.kind);
  }
}

// --- Cuerpos ------------------------------------------------------------------------------------------

function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 4, 10), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

interface Seat {
  group: THREE.Group;
  head: THREE.Object3D;
  fan: THREE.Group;
  cards: CardObj[];
  marker: THREE.Mesh;
  seat: number;
}

/** Jugador de pie (el mismo «poroto» de los demás juegos) mirando al centro (+Z): sus guantes sujetan el abanico. */
function buildPerson(seat: number): { group: THREE.Group; head: THREE.Object3D; fan: THREE.Group; marker: THREE.Mesh; arms: THREE.Group[] } {
  const g = new THREE.Group();
  const [r, gr, b] = PLAYER_COLORS[seat % PLAYER_COLORS.length];
  const bean = buildBean((r << 16) | (gr << 8) | b);
  bean.root.scale.setScalar(BEAN);
  bean.root.rotation.y = Math.PI; // la cara del poroto mira a -Z
  g.add(bean.root);
  // Brazos al frente y hacia dentro: los guantes quedan a los lados del abanico.
  bean.arms.forEach((arm, i) => {
    const sx = i === 0 ? -1 : 1;
    arm.rotation.set(1.4, 0, sx * 0.5);
  });
  const fan = new THREE.Group();
  fan.position.set(0, 0.87, 0.36);
  fan.rotation.x = -0.32;
  g.add(fan);
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.14, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, toneMapped: false }),
  );
  marker.rotation.x = Math.PI;
  marker.position.set(0, 1.85, 0);
  marker.visible = false;
  g.add(marker);
  return { group: g, head: bean.head, fan, marker, arms: bean.arms };
}

/** Sitio de cada rival respecto a ti: a la izquierda, enfrente y a la derecha (en el sentido del reloj). */
function seatSpots(others: number): { x: number; z: number }[] {
  if (others <= 1) return [{ x: 0, z: -1.62 }];
  if (others === 2) return [{ x: -1.52, z: -0.28 }, { x: 1.52, z: -0.28 }];
  return [{ x: -1.52, z: 0.12 }, { x: 0, z: -1.62 }, { x: 1.52, z: 0.12 }];
}

// --- Tabla y sala -------------------------------------------------------------------------------------
function feltTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  grad.addColorStop(0, "#2c6a56");
  grad.addColorStop(1, "#173d33");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "0,0,0"},${0.03 + rnd() * 0.04})`;
    g.fillRect(rnd() * 512, rnd() * 512, 1.5, 1.5);
  }
  g.strokeStyle = "rgba(236,190,90,0.55)";
  g.lineWidth = 3;
  g.setLineDash([14, 10]);
  g.beginPath();
  g.arc(256, 256, 232, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4a2a18";
  g.fillRect(0, 0, 256, 64);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${rnd() < 0.5 ? "20,8,2" : "130,76,40"},${0.1 + rnd() * 0.2})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    const y = rnd() * 64;
    g.moveTo(0, y);
    g.bezierCurveTo(80, y + rnd() * 8 - 4, 170, y + rnd() * 8 - 4, 256, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}

interface Flyer {
  obj: CardObj;
  t: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  q0: THREE.Quaternion;
  q1: THREE.Quaternion;
  s0: number;
  s1: number;
  lift: number;
  /** Se muestra la carta de la pila (su descarte) cuando aterriza. */
  land: boolean;
}

interface Slot {
  obj: CardObj;
  id: number;
  x: number;
  y: number;
  rot: number;
  lift: number;
}

export interface StageView {
  s: CardsSnap;
  me: number;
  hover: number;
  picking: boolean;
}

export class CardsStage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, CW / CH, 0.05, 40);
  private readonly mats = new CardMaterials();
  private readonly hand = new THREE.Group();
  private readonly arms = new THREE.Group();
  private slots: Slot[] = [];
  private seatColor = 0;
  private focus = 0;
  private armsBuilt = false;
  private readonly seats = new Map<number, Seat>();
  private others: number[] = [];
  private readonly flyers: Flyer[] = [];
  private readonly deckStack: THREE.Mesh;
  private readonly deckTop: CardObj;
  private readonly pile: CardObj[] = [];
  private readonly colorDisc: THREE.Mesh;
  private readonly colorLight: THREE.PointLight;
  private readonly dirRing: THREE.Group;
  private readonly lamp: THREE.SpotLight;
  private history: number[] = [];
  private lastTop = -2;
  private lastRound = -1;
  private lastMv = -1;
  private prevLens: number[] = [];
  private landDelay = 0;
  private time = 0;

  constructor() {
    const scene = this.scene;
    scene.background = new THREE.Color(0x120816);
    scene.fog = new THREE.FogExp2(0x160a1c, 0.085);
    scene.add(this.camera);
    this.camera.position.set(0, 1.34, 2.3);
    this.camera.lookAt(0, 0.9, 0);

    // Luz: lámpara colgante sobre la mesa y un relleno suave para que los lados no queden negros.
    scene.add(new THREE.HemisphereLight(0xffd8b0, 0x2a1630, 0.9));
    this.lamp = new THREE.SpotLight(0xffe2b8, 70, 7, 0.82, 0.55, 1.6);
    this.lamp.position.set(0, 2.5, 0.2);
    this.lamp.target.position.set(0, TABLE_Y, 0);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.bias = -0.0004;
    scene.add(this.lamp, this.lamp.target);
    const faces = new THREE.PointLight(0xffd6b0, 5, 7, 1.6);
    faces.position.set(0, 1.7, 2.1);
    scene.add(faces);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff0cc, toneMapped: false }));
    bulb.position.copy(this.lamp.position);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.26, 28, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x1c3a30, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 }),
    );
    shade.position.set(0, 2.62, 0.2);
    scene.add(bulb, shade);

    // Suelo y pared al fondo.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshStandardMaterial({ color: 0x1d0f22, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7, 6, 36, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2a1432, side: THREE.BackSide, roughness: 1 }),
    );
    wall.position.y = 2.5;
    scene.add(wall);

    // Mesa: tablero de fieltro con borde de madera y pie central.
    const felt = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.06, 56),
      [new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0x2a160c })],
    );
    felt.position.y = TABLE_Y - 0.03;
    felt.receiveShadow = felt.castShadow = true;
    scene.add(felt);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TABLE_R + 0.02, 0.07, 14, 64),
      new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.4, metalness: 0.05 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = TABLE_Y + 0.0;
    rim.castShadow = true;
    scene.add(rim);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, TABLE_Y, 20), new THREE.MeshStandardMaterial({ color: 0x2c170d, roughness: 0.6 }));
    leg.position.y = TABLE_Y / 2;
    scene.add(leg);

    // Pilas: el mazo (se hace más bajo al gastarse) y el descarte con la última carta boca arriba.
    this.deckStack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1, 0.364), new THREE.MeshStandardMaterial({ color: 0xf1e8d4, roughness: 0.8 }));
    this.deckStack.castShadow = true;
    scene.add(this.deckStack);
    this.deckTop = new CardObj(this.mats, "lit");
    this.deckTop.set(-1);
    this.deckTop.group.rotation.set(-Math.PI / 2, 0, 0.12);
    this.deckTop.group.scale.setScalar(0.26);
    scene.add(this.deckTop.group);
    for (let i = 0; i < 6; i++) {
      const c = new CardObj(this.mats, "lit");
      c.group.scale.setScalar(0.26);
      c.group.visible = false;
      scene.add(c.group);
      this.pile.push(c);
    }
    this.colorDisc = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.31, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }),
    );
    this.colorDisc.rotation.x = -Math.PI / 2;
    this.colorDisc.position.set(0.38, TABLE_Y + 0.003, 0.08);
    scene.add(this.colorDisc);
    this.colorLight = new THREE.PointLight(0xffffff, 1.2, 1.6, 2);
    this.colorLight.position.set(0.38, TABLE_Y + 0.25, 0.08);
    scene.add(this.colorLight);

    // Flechas del sentido de juego: dos puntas que giran por el anillo exterior.
    this.dirRing = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 3), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.85, toneMapped: false }));
      const ang = (i / 3) * Math.PI * 2;
      a.position.set(Math.sin(ang) * 0.82, TABLE_Y + 0.004, Math.cos(ang) * 0.82);
      a.rotation.x = Math.PI / 2;
      a.rotation.z = -ang;
      this.dirRing.add(a);
    }
    scene.add(this.dirRing);

    // Primera persona: la mano de cartas y los antebrazos cuelgan de la cámara.
    this.hand.position.set(0, 0, -HAND_D);
    this.camera.add(this.hand);
    this.arms.position.set(0, 0, -HAND_D);
    const fill = new THREE.PointLight(0xffe6c8, 1.4, 1.4, 1.5);
    fill.position.set(0, 0.05, -0.2);
    this.camera.add(fill);
    this.camera.add(this.arms);
  }

  /** Manos y mangas: las palmas quedan detrás de las cartas y los pulgares delante. */
  private buildArms(): void {
    const px = (x: number, y: number, z = 0) => new THREE.Vector3((x - CW / 2) * PX, (CH / 2 - y) * PX, z);
    const sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color(`rgb(${PLAYER_COLORS[this.seatColor % 4].join(",")})`), roughness: 0.8 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0xf4ecdc, roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xfff2dc, roughness: 0.6, emissive: 0x6a5a48, emissiveIntensity: 0.3 });
    for (const sx of [-1, 1]) {
      const wrist = px(CW / 2 + sx * 46, 250, -0.03);
      const elbow = px(CW / 2 + sx * 120, 330, -0.02);
      this.arms.add(limb(elbow, wrist, 0.032, sleeve));
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.028, 16), cuff);
      c.position.copy(wrist);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), wrist.clone().sub(elbow).normalize());
      this.arms.add(c);
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), skin);
      palm.scale.set(1, 0.9, 0.55);
      palm.position.copy(px(CW / 2 + sx * 34, 240, -0.028));
      palm.rotation.z = -sx * 0.4;
      this.arms.add(palm);
      // Pulgar por delante de las cartas, cruzando el borde inferior.
      const t0 = px(CW / 2 + sx * 30, 238, 0.012);
      const t1 = px(CW / 2 + sx * 22, 226, 0.012);
      this.arms.add(limb(t0, t1, 0.0165, skin));
    }
  }

  private ensureSeats(view: StageView): void {
    const n = view.s.on.length;
    const others: number[] = [];
    for (let k = 1; k < n; k++) others.push((view.me + k) % n);
    if (others.length === this.others.length && others.every((o, i) => o === this.others[i])) return;
    for (const seat of this.seats.values()) this.scene.remove(seat.group);
    this.seats.clear();
    this.others = others;
    const spots = seatSpots(others.length);
    others.forEach((seatId, i) => {
      const p = buildPerson(seatId);
      p.group.position.set(spots[i].x, 0, spots[i].z);
      p.group.lookAt(0, 0, 0);
      this.scene.add(p.group);
      this.seats.set(seatId, { ...p, cards: [], seat: seatId });
    });
  }

  /** Abanico del rival: tantas cartas como tenga (hasta 18 a la vista). */
  private layoutFan(seat: Seat, count: number): void {
    const n = Math.min(count, 18);
    while (seat.cards.length < n) {
      const c = new CardObj(this.mats, "lit");
      c.set(-1);
      c.group.rotation.y = Math.PI;
      c.group.scale.setScalar(0.15);
      seat.fan.add(c.group);
      seat.cards.push(c);
    }
    const step = Math.min(0.05, 0.4 / Math.max(1, n - 1));
    const rot = Math.min(0.1, 0.62 / Math.max(1, n - 1));
    seat.cards.forEach((c, i) => {
      c.group.visible = i < n;
      const k = i - (n - 1) / 2;
      c.group.position.set(k * step, Math.abs(k) * Math.abs(k) * -0.0022 + 0.11, i * 0.004);
      c.group.rotation.z = k * rot;
    });
  }

  private seatWorld(seat: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = this.seats.get(seat);
    if (!s) return out.set(0, TABLE_Y + 0.4, 1.2);
    s.fan.updateWorldMatrix(true, false);
    return s.fan.localToWorld(out.set(0, 0.15, 0));
  }

  private pileTopPose(extraRot: number, k: number, out: { p: THREE.Vector3; q: THREE.Quaternion }): void {
    out.p.set(0.38, TABLE_Y + 0.004 + k * 0.0018, 0.08);
    out.q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, extraRot, "YXZ"));
  }

  private fly(obj: CardObj, from: THREE.Vector3, q0: THREE.Quaternion, s0: number, land: boolean): void {
    const to = new THREE.Vector3();
    const q1 = new THREE.Quaternion();
    const rot = (Math.random() - 0.5) * 0.9;
    this.pileTopPose(rot, this.history.length + 1, { p: to, q: q1 });
    obj.group.removeFromParent();
    this.scene.add(obj.group);
    this.flyers.push({ obj, t: 0, from: from.clone(), to, q0: q0.clone(), q1, s0, s1: 0.26, lift: 0.28, land });
  }

  /** Carta de una mano que vuela a la pila: parte de donde estaba. */
  private flyFrom(obj: CardObj, id: number, land: boolean): void {
    obj.set(id);
    obj.group.updateWorldMatrix(true, false);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    obj.group.matrixWorld.decompose(p, q, s);
    this.fly(obj, p, q, s.x, land);
  }

  private reconcileHand(hand: number[], tp: number): void {
    const next: Slot[] = [];
    const pool = this.slots.slice();
    const poses = handPoses(hand.length);
    hand.forEach((id, i) => {
      const at = pool.findIndex((p) => p.id === id);
      let slot: Slot;
      if (at >= 0) {
        slot = pool.splice(at, 1)[0];
      } else {
        const obj = new CardObj(this.mats, "basic");
        obj.set(id);
        obj.group.scale.setScalar(CARD_W * PX);
        this.hand.add(obj.group);
        // La carta nueva sube desde abajo, de donde llega del mazo.
        slot = { obj, id, x: poses[i].x + 30, y: CH + 70, rot: 0.5, lift: 0 };
      }
      next.push(slot);
    });
    // Las que ya no están: la jugada vuela a la pila; el resto (ronda nueva) se esfuma.
    let used = false;
    for (const gone of pool) {
      if (!used && gone.id === tp) {
        used = true;
        this.flyFrom(gone.obj, gone.id, true);
        this.landDelay = FLY;
      } else {
        gone.obj.group.removeFromParent();
      }
    }
    this.slots = next;
  }

  /** Actualiza la escena con la instantánea y avanza las animaciones. */
  update(v: StageView, dt: number): void {
    const s = v.s;
    this.time += dt;
    if (!this.armsBuilt) {
      this.armsBuilt = true;
      this.seatColor = v.me;
      this.buildArms();
    }
    this.ensureSeats(v);
    const mine = seatHand(s, v.me);

    // Ronda nueva: se limpian el historial y los vuelos.
    if (s.rd !== this.lastRound) {
      this.lastRound = s.rd;
      this.history = [];
      for (const f of this.flyers) f.obj.group.removeFromParent();
      this.flyers.length = 0;
    }
    // Cambios de estado: quién jugó y quién robó.
    if (s.mv !== this.lastMv) {
      const topChanged = s.tp !== this.lastTop;
      if (topChanged && this.lastTop >= 0 && this.lastTop !== -2) {
        this.history.push(this.lastTop);
        if (this.history.length > 5) this.history.shift();
      }
      s.on.forEach((_, seatId) => {
        if (seatId === v.me) return;
        const len = seatHand(s, seatId).length;
        const prev = this.prevLens[seatId] ?? len;
        const seat = this.seats.get(seatId);
        if (!seat) return;
        if (len < prev && topChanged) {
          const c = new CardObj(this.mats, "lit");
          c.group.scale.setScalar(0.15);
          this.scene.add(c.group);
          const from = this.seatWorld(seatId);
          this.fly(c, from, new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 4, 0, 0)), 0.15, true);
          c.set(s.tp);
          this.landDelay = FLY;
        } else if (len > prev) {
          const c = new CardObj(this.mats, "lit");
          c.set(-1);
          this.scene.add(c.group);
          const to = this.seatWorld(seatId);
          this.flyBack(c, to);
        }
      });
      this.lastMv = s.mv;
      this.lastTop = s.tp;
    }
    this.prevLens = s.on.map((_, i) => seatHand(s, i).length);

    // Mi mano.
    if (mine.length !== this.slots.length || mine.some((id, i) => this.slots[i]?.id !== id)) this.reconcileHand(mine, s.tp);
    const poses = handPoses(this.slots.length);
    const myTurn = canAct(s, v.me);
    this.focus = damp(this.focus, myTurn || s.ph !== 0 ? 0 : 1, 4, dt);
    this.aim();
    this.slots.forEach((slot, i) => {
      const pose = poses[i];
      const playable = myTurn && canPlay(slot.id, s.tp, s.co);
      const hover = i === v.hover && !v.picking;
      const lift = hover ? 22 : playable ? 13 : 0;
      slot.lift = damp(slot.lift, lift, 16, dt);
      slot.x = damp(slot.x, pose.x, 14, dt);
      slot.y = damp(slot.y, pose.y - slot.lift + this.focus * 48, 14, dt);
      slot.rot = damp(slot.rot, pose.rot, 14, dt);
      const o = slot.obj.group;
      o.position.set((slot.x - CW / 2) * PX, (CH / 2 - slot.y) * PX, i * 0.0012 + (hover ? 0.02 : 0));
      o.rotation.z = -slot.rot;
      this.mats.shade(slot.id, playable ? 1 : myTurn ? 0.58 : 0.86);
    });
    // Respiración de las manos (casi nada: las cartas no se mueven para que el ratón acierte).
    this.arms.position.y = Math.sin(this.time * 1.4) * 0.0012 - this.focus * 48 * PX;

    this.updatePile(s);
    this.updateSeats(s, v);
    this.updateFlyers(dt);

    this.dirRing.rotation.y = this.time * 0.55 * -(s.dr || 1);
    const col = new THREE.Color(`rgb(${CARD_COLORS[s.co]?.join(",") ?? "255,255,255"})`);
    (this.colorDisc.material as THREE.MeshBasicMaterial).color.copy(col);
    this.colorLight.color.copy(col);
    this.colorLight.intensity = 0.9 + Math.sin(this.time * 3) * 0.15;
    this.camera.updateMatrixWorld();
  }

  /** Cámara: en mi turno mira a la mesa entera; si no, se adelanta y baja la vista hacia las pilas del centro. */
  private aim(): void {
    const f = this.focus;
    this.camera.position.set(0, 1.34 + 0.1 * f, 2.3 - 0.55 * f);
    this.camera.lookAt(0.0, 0.9 - 0.2 * f, 0.0 + 0.08 * f);
    this.camera.updateMatrixWorld();
  }

  /** Carta que vuela del mazo a la mano de un rival y se pierde en el abanico. */
  private flyBack(c: CardObj, to: THREE.Vector3): void {
    const from = new THREE.Vector3(-0.38, TABLE_Y + 0.02, 0.08);
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    c.group.scale.setScalar(0.26);
    this.flyers.push({
      obj: c, t: 0, from, to, q0, q1: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, Math.PI, 0)),
      s0: 0.26, s1: 0.1, lift: 0.22, land: false,
    });
  }

  private updatePile(s: CardsSnap): void {
    const frac = Math.min(1, s.dp / 108);
    const h = 0.004 + frac * 0.07;
    this.deckStack.scale.set(1, h, 1);
    this.deckStack.position.set(-0.38, TABLE_Y + h / 2, 0.08);
    this.deckTop.group.position.set(-0.38, TABLE_Y + h + 0.001, 0.08);
    this.deckStack.visible = this.deckTop.group.visible = s.dp > 0;
    const stack = [...this.history, s.tp];
    const hide = this.landDelay > 0;
    this.pile.forEach((c, i) => {
      const id = stack[stack.length - this.pile.length + i];
      const k = i;
      if (id === undefined || id < 0) {
        c.group.visible = false;
        return;
      }
      const isTop = i === this.pile.length - 1;
      c.group.visible = !(isTop && hide);
      c.set(id);
      const rot = Math.sin(id * 12.9898 + i * 78.233) * 0.7;
      const out = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
      this.pileTopPose(rot, k, out);
      c.group.position.copy(out.p);
      c.group.quaternion.copy(out.q);
    });
  }

  private updateSeats(s: CardsSnap, v: StageView): void {
    for (const seat of this.seats.values()) {
      this.layoutFan(seat, seatHand(s, seat.seat).length);
      const turn = s.ph === 0 && s.tu === seat.seat;
      seat.marker.visible = turn;
      if (turn) seat.marker.position.y = 1.85 + Math.sin(this.time * 4) * 0.03;
      // Los rivales miran hacia la pila cuando les toca y levantan el abanico.
      seat.head.rotation.y = turn ? Math.sin(this.time * 1.5) * 0.15 : 0;
      seat.fan.position.y = damp(seat.fan.position.y, turn ? 0.93 : 0.87, 8, 1 / 60);
    }
    void v;
  }

  private updateFlyers(dt: number): void {
    this.landDelay = Math.max(0, this.landDelay - dt);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t = Math.min(1, f.t + dt / FLY);
      const e = f.t * f.t * (3 - 2 * f.t);
      p.lerpVectors(f.from, f.to, e);
      p.y += Math.sin(f.t * Math.PI) * f.lift;
      q.slerpQuaternions(f.q0, f.q1, e);
      f.obj.group.position.copy(p);
      f.obj.group.quaternion.copy(q);
      f.obj.group.scale.setScalar(f.s0 + (f.s1 - f.s0) * e);
      if (f.t >= 1) {
        f.obj.group.removeFromParent();
        this.flyers.splice(i, 1);
      }
    }
  }

  /** Punto del lienzo (sobre la cabeza) de cada asiento rival, para su cartel. */
  seatLabel(seat: number): [number, number, number] | null {
    const s = this.seats.get(seat);
    if (!s) return null;
    const p = s.head.getWorldPosition(new THREE.Vector3());
    return projectTo(this.camera, [p.x, p.y + 0.55, p.z], CW, CH);
  }

  dispose(): void {
    this.mats.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.geometry !== cardGeo) m.geometry.dispose();
    });
  }
}
