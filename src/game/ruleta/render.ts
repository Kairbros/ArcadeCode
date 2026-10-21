// Render de Ruleta de cartuchos: escena 3D (Three.js / WebGL) en primera persona desde tu asiento,
// con la lámpara como única luz fuerte (con sombras), y un HUD 2D encima. Todo se calcula a partir
// del estado de la mesa (RuletaSnap) y del tiempo del último evento, igual en anfitrión e invitado.
// La escena se dibuja en un lienzo WebGL aparte y se copia al lienzo del juego.
import * as THREE from "three";
import { PLAYER_COLORS } from "../core/config";
import { badge, css, fillCircle, fitText, fitTitle, panel, polygon, shadowText, strokeCircle, text, textWidth, titleText, type Ctx } from "../core/draw";
import {
  CUT_AT, EV_ITEM, EV_NONE, EV_SHOT, I_BEER, I_CIGS, I_CUFFS, I_INVERTER, I_LUPA, I_MEDS, I_PHONE, I_SAW, ITEM_HIT,
  ITEM_TIME, ITEMS, PH_INTRO, PH_OVER, PH_REVEAL, PH_ROUND_END, PH_TURN, REVEAL_TIME, ROUNDS, RH, RW, SHOT_HIT,
  SHOT_TIME,
} from "./config";
import type { Focus } from "./input";
import { add, aim, len, mix, mul, rot, sub, transform, type Pose, type V3 } from "./math3d";
import {
  DEALER_SCALE, GUN_GRIP, GUN_PUMP, LAMP_Y, PIVOT, SEAT_R, buildDealer, buildGun, buildHuman, buildItem, buildLamp,
  buildLimb, buildRoom, buildShell, buildTable, gunMuzzle, type Character, type GunModel,
} from "./models";
import { P_CUFF, P_LIVES, P_MAX, P_OUT, P_WINS, isOut, seatName, type RuletaSnap } from "./state";
import { glRenderer, glowSprite, projectTo, renderInto } from "../core/three";

export interface RuletaView {
  s: RuletaSnap;
  me: number;
  focus: Focus;
  /** Selección y teclas en tu turno (vacías si no te toca). */
  label: string;
  hint: string;
  netLabel: string;
  footer: string;
}

const TINY = "bold 6px Arial, sans-serif";
const SMALL = "bold 8px Arial, sans-serif";
const MID = "bold 10px Arial, sans-serif";
const BIG = "bold 22px Arial, sans-serif";

const FOCAL = 170; // píxeles lógicos por unidad a 1 m: fija el campo de visión
const FOV = (2 * Math.atan(RH / 2 / FOCAL) * 180) / Math.PI;
const EYE_Y = 0.62;
const EYE_BACK = 0.27; // la cámara está algo detrás del asiento
const TAU = Math.PI * 2;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const leanPt = (v: V3, lean: number): V3 => add(rot(sub(v, PIVOT), 0, lean), PIVOT);
const GUN_REST: Pose = { pos: [0.05, 0.036, -0.02], yaw: Math.PI / 2 + 0.35, pitch: 0, roll: Math.PI / 2 };
/** Posición del hueco `slot` de objetos, en coordenadas del asiento (2 filas de 4). */
const slotLocal = (slot: number): V3 => [((slot & 3) - 1.5) * 0.15, 0, -(0.62 + (slot >> 2) * 0.15)];

function setPose(o: THREE.Object3D, p: Pose) {
  o.position.set(...p.pos);
  o.rotation.set(p.pitch ?? 0, p.yaw ?? 0, p.roll ?? 0, "YXZ");
}

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
/** Estira una caja unidad entre dos puntos, con grosor `w`. */
function stretch(m: THREE.Object3D, a: V3, b: V3, w: number) {
  const d = sub(b, a);
  const l = len(d) || 1e-4;
  m.position.set(...mix(a, b, 0.5));
  m.quaternion.setFromUnitVectors(UP, tmp.set(d[0] / l, d[1] / l, d[2] / l));
  m.scale.set(w, l, w);
}


interface Seat3D {
  ch: Character;
  hands: THREE.Group[];
  /** Brazo y antebrazo de cada lado (en tu asiento solo se usan los antebrazos). */
  limbs: THREE.Mesh[];
  limbW: number;
  items: (THREE.Group | null)[];
  itemIds: number[];
  eyeGlows: THREE.Sprite[];
}

/** La escena 3D: se construye una vez y se recoloca en cada frame. */
class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, RW / RH, 0.02, 20);
  private gun: GunModel;
  private flash = new THREE.PointLight(0xffb060, 0, 6, 1.5);
  private fill = new THREE.PointLight(0xffe6cc, 0.35, 2.2, 2);
  private muzzleGlow = glowSprite(0xffc070, 0.6, 0);
  private smoke: THREE.Mesh[] = [];
  private dust: THREE.Points;
  private shellPool: THREE.Group[][] = [[], []]; // [fogueo, real]
  private ejected: THREE.Group[];
  private templates = new Map<number, THREE.Group>();
  private using = new Map<number, THREE.Group>();
  private seats: Seat3D[] = [];
  private seatKey = "";
  private seatRoot = new THREE.Group();

  constructor() {
    const sc = this.scene;
    sc.background = new THREE.Color(0x0f0818);
    sc.fog = new THREE.Fog(0x0f0818, 2.4, 6.5);
    sc.add(buildRoom(), buildTable(), buildLamp(), this.seatRoot);

    // Luz: el foco de la lámpara (con sombras) y poco más.
    const spot = new THREE.SpotLight(0xffdcaa, 9, 0, 0.82, 0.6, 1.4);
    spot.position.set(0, LAMP_Y + 0.02, 0);
    spot.target.position.set(0, -1, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.2;
    spot.shadow.camera.far = 4;
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    sc.add(spot, spot.target);
    // La bombilla también alumbra hacia los lados: así se ven las caras de quienes se sientan.
    const bulb = new THREE.PointLight(0xffd8a0, 3.2, 5, 1.7);
    bulb.position.set(0, LAMP_Y - 0.02, 0);
    sc.add(bulb, new THREE.HemisphereLight(0x8890a8, 0x1a1410, 0.35), this.fill, this.flash);
    const lampGlow = glowSprite(0xffd9a0, 0.9, 0.9);
    lampGlow.position.set(0, LAMP_Y + 0.02, 0);
    sc.add(lampGlow, this.muzzleGlow);
    // Neones de casino: verde (izquierda), rojo (derecha), ámbar (fondo).
    const neonGreen = new THREE.PointLight(0x00ff55, 1.1, 5.5, 2);
    neonGreen.position.set(-3.6, 1.5, 0);
    const neonRed = new THREE.PointLight(0xff1133, 0.8, 5.5, 2);
    neonRed.position.set(3.6, 1.5, 0);
    const neonAmber = new THREE.PointLight(0xffaa00, 0.9, 4.5, 2);
    neonAmber.position.set(0, 1.5, -3.6);
    sc.add(neonGreen, neonRed, neonAmber);

    this.gun = buildGun();
    sc.add(this.gun.root);
    for (let live = 0; live < 2; live++) {
      for (let i = 0; i < 8; i++) {
        const s = buildShell(live === 1);
        this.shellPool[live].push(s);
        sc.add(s);
      }
    }
    this.ejected = [buildShell(false), buildShell(true)];
    sc.add(...this.ejected);
    // Humo del disparo: cubitos grises que suben girando y se desvanecen.
    for (let i = 0; i < 10; i++) {
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 1, transparent: true, opacity: 0, depthWrite: false }),
      );
      this.smoke.push(cube);
      sc.add(cube);
    }
    // Polvo flotando en el haz de luz (puntos cuadrados: también son "vóxeles").
    const n = 90;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * 0.8, a = Math.random() * TAU;
      pos.set([Math.cos(a) * r, 0.05 + Math.random() * 1.2, Math.sin(a) * r], i * 3);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xffe6b0, size: 0.006, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sc.add(this.dust);
  }

  private template(id: number): THREE.Group {
    let t = this.templates.get(id);
    if (!t) this.templates.set(id, (t = buildItem(id)));
    return t;
  }

  /** Crea los personajes cuando cambia la mesa (número de asientos, crupier o punto de vista). */
  private setSeats(s: RuletaSnap, me: number) {
    const key = `${s.p.length}:${s.dl}:${me}`;
    if (key === this.seatKey) return;
    this.seatKey = key;
    this.seatRoot.clear();
    this.seats = s.p.map((_, i) => {
      const [r8, g8, b8] = PLAYER_COLORS[i];
      const ch = i === s.dl ? buildDealer() : buildHuman((r8 << 16) | (g8 << 8) | b8);
      if (i !== me) this.seatRoot.add(ch.root);
      const hands = [0, 1].map(() => ch.hand.clone());
      const limbs = [0, 1, 2, 3].map(() => buildLimb(ch.sleeve));
      if (i === me) limbs[0].visible = limbs[2].visible = false;
      this.seatRoot.add(...hands, ...limbs);
      const eyeGlows = ch.eyes.map(() => glowSprite(0xfff0d0, 0.09 * DEALER_SCALE, 0.9));
      this.seatRoot.add(...eyeGlows);
      return {
        ch, hands, limbs, limbW: i === s.dl ? 0.1 : 0.075, items: [], itemIds: [], eyeGlows,
      };
    });
  }

  /** Coloca toda la escena para este frame. Devuelve la función de proyección para el HUD. */
  update(v: RuletaView, time: number, cam: { yaw: number; pitch: number }) {
    const { s, me } = v;
    this.setSeats(s, me);
    const n = s.p.length;
    const angleOf = (i: number) => ((((i - me) % n) + n) % n) * (TAU / n);
    const frame = (i: number): Pose => {
      const a = angleOf(i);
      return { pos: [Math.sin(a) * SEAT_R, 0, Math.cos(a) * SEAT_R], yaw: a };
    };
    const local = (i: number, p: V3) => transform(p, frame(i));
    const eye = local(me, [0, EYE_Y, EYE_BACK]);
    const ev = s.ev;
    const et = s.et;
    const shot = ev[1] === EV_SHOT && et < SHOT_TIME ? ev : null;
    const item = ev[1] === EV_ITEM && et < ITEM_TIME ? ev : null;
    const bang = shot && shot[4] >= 0 ? et - SHOT_HIT : -1; // tiempo desde el disparo
    const liveBang = bang >= 0 && shot![4] === 1;

    // Inclinación de cada cuerpo: caído si está fuera, echado atrás al recibir un disparo.
    const lean = (i: number) => {
      let l = isOut(s, i) ? -0.75 : Math.sin(time * 1.3 + i) * 0.015;
      if (shot && shot[3] === i && liveBang) {
        l += 0.5 * (1 - ease(bang / 0.7));
        if (isOut(s, i)) l = -0.75 * ease((bang - 0.25) / 0.6) + 0.5 * (1 - ease(bang / 0.5));
      }
      return l;
    };
    const head = (i: number): V3 => (i === me ? eye : local(i, leanPt(this.seats[i].ch.head, lean(i))));

    // --- Escopeta ---
    const sawed = s.sw === 1;
    let gun: Pose = GUN_REST;
    let holder = -1;
    if (shot) {
      const [, , a, b] = shot;
      let p: V3;
      let target: V3;
      if (a === b) {
        // Contra uno mismo: el cañón delante de la cara.
        p = a === me ? local(me, [0, EYE_Y - 0.08, EYE_BACK - 0.72]) : local(a, add(leanPt(this.seats[a].ch.head, lean(a)), [0, -0.05, -0.68]));
        target = head(a);
      } else {
        p = local(a, a === me ? [0.07, 0.42, -0.4] : [0.06, 0.5, -0.5]);
        target = head(b);
      }
      const [ay, ap] = aim(sub(target, p));
      const k = ease(et / 0.75) * (1 - ease((et - 1.55) / 0.55));
      gun = {
        pos: mix(GUN_REST.pos, p, k),
        yaw: GUN_REST.yaw! + wrapAngle(ay - GUN_REST.yaw!) * k,
        pitch: ap * k,
        roll: GUN_REST.roll! * (1 - k),
      };
      if (bang >= 0 && bang < 0.25) {
        // Retroceso: el cañón salta hacia arriba y atrás.
        const r = 1 - bang / 0.25;
        const fwd = rot([0, 0, -1], gun.yaw, gun.pitch);
        gun = { ...gun, pos: add(gun.pos, mul(fwd, -0.07 * r)), pitch: gun.pitch! + 0.3 * r };
      }
      if (k > 0.05) holder = a;
    }
    setPose(this.gun.root, gun);
    this.gun.full.visible = !sawed;
    this.gun.sawed.visible = sawed;
    const muzzle = transform(gunMuzzle(sawed), gun);

    // --- Personajes, brazos y manos ---
    for (let i = 0; i < n; i++) {
      const st = this.seats[i];
      const f = frame(i);
      const l = lean(i);
      const out = isOut(s, i);
      setPose(st.ch.root, f);
      st.ch.upper.rotation.x = l;
      // Fuera de la ronda: todo más oscuro y los ojos apagados.
      st.ch.dim(out ? 0.45 : 1);
      st.ch.eyes.forEach((eyePos, k) => {
        const glow = st.eyeGlows[k];
        glow.visible = !out && i !== me;
        glow.position.set(...local(i, leanPt(add(eyePos, [0, 0, -0.012]), l)));
        glow.material.opacity = 0.75 + Math.sin(time * 2.3) * 0.15;
      });
      const right = rot([1, 0, 0], f.yaw);
      const spread = i === s.dl ? 0.33 : 0.23;
      const rest: V3[] = [local(i, [-spread, 0.02, -0.55]), local(i, [spread, 0.02, -0.55])];
      const holding = holder === i;
      const hands = holding ? [transform(GUN_PUMP, gun), transform(GUN_GRIP, gun)] : rest;
      for (let side = 0; side < 2; side++) {
        const hd = hands[side];
        const sign = side ? 1 : -1;
        setPose(st.hands[side], { pos: hd, yaw: holding ? gun.yaw : f.yaw, pitch: holding ? gun.pitch : 0, roll: holding ? sign * 1.2 : 0 });
        st.hands[side].scale.x = sign * Math.abs(st.hands[side].scale.x);
        if (i === me) {
          // Desde tus ojos solo se ven los antebrazos, que entran por abajo.
          stretch(st.limbs[side * 2 + 1], local(me, [sign * 0.3, 0.09, -0.3]), hd, st.limbW * 0.9);
        } else {
          const sh = local(i, leanPt(st.ch.shoulders[side], l));
          const elbow = add(mix(sh, hd, 0.5), add([0, -0.1, 0], mul(right, sign * 0.07)));
          stretch(st.limbs[side * 2], sh, elbow, st.limbW);
          stretch(st.limbs[side * 2 + 1], elbow, hd, st.limbW * 0.85);
        }
      }
      // Objetos de este jugador
      const ids = s.it[i];
      for (let slot = 0; slot < Math.max(ids.length, st.items.length); slot++) {
        const id = ids[slot] ?? 0;
        if (st.itemIds[slot] !== id) {
          if (st.items[slot]) this.seatRoot.remove(st.items[slot]!);
          st.items[slot] = id ? this.template(id).clone() : null;
          st.itemIds[slot] = id;
          if (st.items[slot]) this.seatRoot.add(st.items[slot]!);
        }
        const obj = st.items[slot];
        if (!obj) continue;
        setPose(obj, { pos: local(i, slotLocal(slot)), yaw: angleOf(i) + 0.2 * Math.sin(slot * 2.7) });
        const lit = v.focus.kind === "item" && v.focus.seat === i && v.focus.slot === slot;
        obj.scale.setScalar(lit ? 1.25 + Math.sin(time * 8) * 0.08 : 1);
      }
    }

    // --- Cartuchos ---
    for (const pool of this.shellPool) for (const sh of pool) sh.visible = false;
    if (s.ph === PH_REVEAL) {
      // De pie en el centro de la mesa antes de cargarlos.
      const [lv, bl] = s.ld;
      const total = lv + bl;
      const used = [0, 0];
      for (let k = 0; k < total; k++) {
        const live = k < lv ? 1 : 0;
        const sh = this.shellPool[live][used[live]++];
        if (!sh || s.pt < 0.3 + k * 0.12) continue;
        const into = ease((s.pt - (REVEAL_TIME - 0.7)) / 0.5);
        if (into >= 1) continue;
        const spot = local(me, [(k - (total - 1) / 2) * 0.075, 0, -SEAT_R + 0.12]);
        const pop = ease((s.pt - 0.3 - k * 0.12) / 0.15);
        sh.visible = true;
        setPose(sh, { pos: add(mix(spot, GUN_REST.pos, into), [0, (1 - pop) * 0.08, 0]), yaw: time * 0.4 + k });
      }
    }
    // Cartucho expulsado (al bombear tras el disparo o con la cerveza).
    const ejected = shot && bang >= 0.3 ? { live: shot[4], t: bang - 0.3 } : item && item[3] === I_BEER && item[5] >= 0 ? { live: item[5], t: et - ITEM_HIT } : null;
    this.ejected.forEach((e) => (e.visible = false));
    if (ejected && ejected.t < 0.9) {
      const e = this.ejected[ejected.live];
      const up = Math.sin(clamp01(ejected.t / 0.9) * Math.PI) * 0.35;
      e.visible = true;
      setPose(e, { pos: add(transform([0.06, 0.02, -0.02], gun), [0, up, 0]), yaw: time * 5, roll: ejected.t * 9 });
    }
    // Objeto en uso: sube delante de quien lo usa (si es robado, viene desde la víctima).
    for (const o of this.using.values()) o.visible = false;
    if (item) {
      const [, , user, id, victim, , stolen] = item;
      let o = this.using.get(id);
      if (!o) {
        this.using.set(id, (o = this.template(id).clone()));
        this.scene.add(o);
      }
      const from = stolen ? local(victim, [0, 0.05, -0.68]) : local(user, [0, 0.05, -0.62]);
      const to = user === me ? local(me, [0, 0.45, EYE_BACK - 0.6]) : local(user, [0, 0.45, -0.5]);
      const size = (user === me ? 1.2 : 1.8) * (1 - ease((et - 1.0) / 0.4));
      o.visible = size > 0.02;
      setPose(o, { pos: mix(from, to, ease(et / 0.5)), yaw: time * 2.5, pitch: 0.5 });
      o.scale.setScalar(Math.max(0.001, size));
    }

    // --- Disparo: fogonazo, luz y humo ---
    const flashK = liveBang && bang < 0.15 ? 1 - bang / 0.15 : 0;
    this.flash.intensity = 25 * flashK;
    this.flash.position.set(...muzzle);
    this.muzzleGlow.position.set(...muzzle);
    this.muzzleGlow.material.opacity = flashK;
    this.muzzleGlow.scale.setScalar(0.3 + 0.5 * flashK);
    const fwd = rot([0, 0, -1], gun.yaw, gun.pitch);
    this.smoke.forEach((cube, k) => {
      const t = bang - k * 0.04;
      const on = liveBang && t >= 0 && t < 1.6;
      cube.visible = on;
      if (!on) return;
      const spread: V3 = [Math.sin(k * 2.1) * 0.08 * t, t * 0.2, Math.cos(k * 1.7) * 0.08 * t];
      cube.position.set(...add(muzzle, add(mul(fwd, 0.05 + t * 0.1 + k * 0.012), spread)));
      cube.scale.setScalar(0.02 + t * 0.05);
      cube.rotation.set(t * 2 + k, t * 3 + k * 0.7, 0);
      (cube.material as THREE.MeshStandardMaterial).opacity = 0.6 * (1 - t / 1.6);
    });
    // Polvo: sube y baja despacio.
    this.dust.rotation.y = time * 0.03;
    this.dust.position.y = Math.sin(time * 0.2) * 0.03;

    // --- Cámara ---
    this.fill.position.set(...add(eye, [0, 0.15, 0]));
    let camYaw = cam.yaw, camPitch = cam.pitch;
    const hitMe = !!shot && shot[3] === me && liveBang;
    if (liveBang && bang < 0.35) {
      const k = 1 - bang / 0.35;
      camYaw += Math.sin(time * 87) * 0.025 * k;
      camPitch += Math.sin(time * 71) * 0.025 * k + (hitMe ? 0.3 * k : 0);
    }
    this.camera.position.set(...eye);
    this.camera.rotation.set(camPitch, camYaw, 0, "YXZ");

    return { head, muzzle, hitMe, flashK, bang, local };
  }

  /** Punto del mundo en el lienzo lógico: [x, y, distancia], o null si queda detrás de la cámara. */
  project(p: V3): [number, number, number] | null {
    return projectTo(this.camera, p, RW, RH);
  }
}

export class RuletaRenderer {
  time = 0;
  private stage: Stage | null = null;
  private yaw = 0;
  private pitch = -0.15;
  private dt = 0;

  reset() {
    this.yaw = 0;
  }

  update(dt: number) {
    this.time += dt;
    this.dt = dt;
  }

  /** Hacia dónde mira la cámara: quien tiene el turno, quien apunta o a quien apuntas. */
  private aimCamera(v: RuletaView) {
    const { s, me } = v;
    const n = s.p.length;
    const ev = s.ev;
    const shot = ev[1] === EV_SHOT && s.et < SHOT_TIME ? ev : null;
    const item = ev[1] === EV_ITEM && s.et < ITEM_TIME ? ev : null;
    const myTurn = s.ph === PH_TURN && s.tu === me && !s.bz;
    let look = s.ph === PH_TURN ? s.tu : -1;
    if (shot) look = shot[2] === me ? (shot[3] === me ? -1 : shot[3]) : shot[2];
    if (item) look = item[2] === me ? (item[6] ? item[4] : -1) : item[2];
    if (v.focus.kind === "seat" && myTurn) look = v.focus.seat;
    let wantYaw = 0;
    if (look >= 0 && look !== me) {
      const a = ((((look - me) % n) + n) % n) * (TAU / n);
      const target: V3 = [Math.sin(a) * SEAT_R, 0.8, Math.cos(a) * SEAT_R];
      wantYaw = Math.max(-0.6, Math.min(0.6, aim(sub(target, [0, EYE_Y, SEAT_R + EYE_BACK]))[0])) * 0.8;
    }
    const wantPitch = s.ph === PH_REVEAL ? -0.32 : myTurn && v.focus.kind !== "seat" ? -0.33 : s.ph === PH_INTRO ? -0.06 : -0.13;
    const kc = Math.min(1, this.dt * 3.5);
    this.yaw += wrapAngle(wantYaw - this.yaw) * kc;
    this.pitch += (wantPitch - this.pitch) * kc;
  }

  draw(ctx: Ctx, v: RuletaView, pixelScale = 1) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, RW, RH);
    if (!glRenderer()) {
      text(ctx, "Este equipo no puede mostrar gráficos 3D (WebGL)", RW / 2, RH / 2 - 10, [255, 200, 160], SMALL, "center");
      this.drawHud(ctx, v);
      return;
    }
    const stage = (this.stage ??= new Stage());
    this.aimCamera(v);
    const info = stage.update(v, this.time, { yaw: this.yaw, pitch: this.pitch });
    renderInto(ctx, stage.scene, stage.camera, RW, RH, pixelScale, 1.45);

    // Viñeta de casino
    const vg = ctx.createRadialGradient(RW / 2, RH / 2, RH * 0.12, RW / 2, RH / 2, RW * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(0.5, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, RW, RH);
    // Scanlines CRT
    ctx.fillStyle = "rgba(0,0,0,0.09)";
    for (let sy = 0; sy < RH; sy += 2) ctx.fillRect(0, sy, RW, 1);

    // Fogonazo y golpe recibido
    if (info.flashK > 0) {
      const m = stage.project(info.muzzle);
      if (m) {
        const rad = Math.min(80, 18 + 900 / m[2]) * info.flashK;
        const g = ctx.createRadialGradient(m[0], m[1], 0, m[0], m[1], rad);
        g.addColorStop(0, "rgba(255,250,220,0.9)");
        g.addColorStop(0.4, "rgba(255,190,80,0.5)");
        g.addColorStop(1, "rgba(255,120,40,0)");
        ctx.fillStyle = g;
        ctx.fillRect(m[0] - rad, m[1] - rad, rad * 2, rad * 2);
      }
    }
    if (info.hitMe && info.bang < 1.2) {
      ctx.fillStyle = `rgba(${info.bang < 0.08 ? "255,255,255" : "200,0,0"},${0.85 * (1 - info.bang / 1.2)})`;
      ctx.fillRect(0, 0, RW, RH);
    }
    this.drawLabels(ctx, v, stage, info.head, info.local);
    this.drawHud(ctx, v);
    // Crosshair en primera persona
    if (v.s.ph === PH_TURN && !isOut(v.s, v.me)) {
      ctx.strokeStyle = "rgba(255,255,255,0.30)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(RW / 2 - 4, RH / 2); ctx.lineTo(RW / 2 - 1.5, RH / 2);
      ctx.moveTo(RW / 2 + 1.5, RH / 2); ctx.lineTo(RW / 2 + 4, RH / 2);
      ctx.moveTo(RW / 2, RH / 2 - 4); ctx.lineTo(RW / 2, RH / 2 - 1.5);
      ctx.moveTo(RW / 2, RH / 2 + 1.5); ctx.lineTo(RW / 2, RH / 2 + 4);
      ctx.stroke();
    }
  }

  // --- Marcas sobre la escena ---

  private drawLabels(ctx: Ctx, v: RuletaView, stage: Stage, head: (i: number) => V3, local: (i: number, p: V3) => V3) {
    const { s, me } = v;
    const bracket = (x: number, y: number, hw: number, hh: number) => {
      const pulse = 1 + Math.sin(this.time * 8) * 0.12;
      hw *= pulse;
      hh *= pulse;
      const c = Math.min(hw, hh) * 0.5;
      ctx.strokeStyle = "rgba(255,230,90,0.95)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(x + sx * hw, y + sy * (hh - c));
        ctx.lineTo(x + sx * hw, y + sy * hh);
        ctx.lineTo(x + sx * (hw - c), y + sy * hh);
      }
      ctx.stroke();
    };
    for (let i = 0; i < s.p.length; i++) {
      if (i === me) continue;
      const top = stage.project(add(head(i), [0, i === s.dl ? 0.36 : 0.26, 0]));
      if (!top) continue;
      const [x, y] = top;
      badge(ctx, x, y - 2, 4, isOut(s, i) ? [90, 90, 96] : PLAYER_COLORS[i], String(i + 1));
      shadowText(ctx, seatName(s, i), x, y - 13, isOut(s, i) ? [150, 150, 160] : [235, 235, 245], TINY, "center");
      if (s.ph === PH_TURN && s.tu === i) polygon(ctx, [[x - 3, y - 22], [x + 3, y - 22], [x, y - 18]], [255, 220, 60]);
      if (v.focus.kind === "seat" && v.focus.seat === i) {
        const h = stage.project(head(i));
        const big = i === s.dl ? DEALER_SCALE : 1;
        if (h) bracket(h[0], h[1], (32 * big) / h[2] + 5, (40 * big) / h[2] + 5);
      }
    }
    if (v.focus.kind === "seat" && v.focus.seat === me) shadowText(ctx, "▼ TÚ ▼", RW / 2, RH - 52, [255, 230, 90], SMALL, "center");
    if (v.focus.kind === "gun") {
      const g = stage.project(GUN_REST.pos);
      if (g) bracket(g[0], g[1], 80 / g[2] + 4, 22 / g[2] + 4);
    }
    if (v.focus.kind === "item") {
      const q = stage.project(add(local(v.focus.seat, slotLocal(v.focus.slot)), [0, 0.03, 0]));
      if (q) bracket(q[0], q[1], 13 / q[2] + 3, 11 / q[2] + 3);
    }
  }

  // --- HUD ---

  private drawHud(ctx: Ctx, v: RuletaView) {
    const { s, me } = v;
    const n = s.p.length;
    const rule = ROUNDS[s.rd];
    // Paneles de jugadores: vidas (rayos), rondas ganadas y estado.
    const pw = Math.min(100, (RW - 4) / n);
    for (let i = 0; i < n; i++) {
      const x = 2 + i * pw;
      const row = s.p[i];
      const out = row[P_OUT] === 1;
      const turn = s.ph === PH_TURN && s.tu === i;
      // El panel de quien tiene el turno se enciende y parpadea su borde.
      const lit = turn && Math.floor(this.time * 3) % 2 === 0;
      panel(ctx, x, 2, pw - 2, 22, turn ? (lit ? [255, 215, 60] : [195, 148, 35]) : out ? [70, 60, 80] : [148, 118, 42], 0.9,
        turn ? [38, 22, 6] : [15, 8, 24]);
      badge(ctx, x + 7.5, 9, 4.5, out ? [90, 90, 96] : PLAYER_COLORS[i], String(i + 1));
      const name = fitText(ctx, seatName(s, i) + (i === me ? " (tú)" : ""), pw - 34, TINY);
      text(ctx, name, x + 14, 4, out ? [150, 150, 160] : [235, 235, 245], TINY);
      text(ctx, `★${row[P_WINS]}`, x + pw - 5, 4, [255, 220, 60], TINY, "right");
      for (let k = 0; k < row[P_MAX]; k++) bolt(ctx, x + 14 + k * 7, 13, k < row[P_LIVES]);
      const status = out ? "FUERA" : row[P_CUFF] === 1 ? "ESPOSADO" : rule.cut && row[P_LIVES] <= CUT_AT ? "SIN CURAS" : "";
      if (status) text(ctx, status, x + pw - 5, 15, out ? [200, 120, 110] : [255, 160, 90], TINY, "right");
    }
    shadowText(ctx, `Ronda ${s.rd + 1}/${ROUNDS.length}`, 4, 27, [200, 178, 120], TINY);
    if (s.sw) shadowText(ctx, "SIERRA: el próximo disparo quita 2", RW - 4, 27, [255, 120, 100], TINY, "right");
    // Contador de cartuchos (rojo = real, azul = fogueo)
    if (s.ph === PH_TURN) {
      const [lv, bl] = s.ld;
      const total = lv + bl;
      const cx0 = RW / 2 - (total * 5.5) / 2;
      for (let k = 0; k < total; k++) {
        const live = k < lv;
        fillCircle(ctx, cx0 + k * 5.5 + 2.5, 30, 2.5, live ? [210, 45, 45] : [65, 130, 215]);
        strokeCircle(ctx, cx0 + k * 5.5 + 2.5, 30, 2.5, live ? [255, 110, 110] : [130, 185, 255], 0.7);
      }
    }

    // Carteles de fase
    if (s.ph === PH_INTRO) {
      const k = ease(s.pt / 0.4);
      ctx.globalAlpha = k;
      panel(ctx, -2, 60, RW + 4, 56, [198, 158, 38], 0.9, [20, 8, 32]);
      ctx.globalAlpha = 1;
      titleText(ctx, `RONDA ${s.rd + 1}`, RW / 2, 64, [255, 218, 75], BIG);
      const extra = rule.items ? `${rule.items} objetos por carga` : "sin objetos";
      shadowText(ctx, `${rule.lives} vidas · ${extra}`, RW / 2, 92, [210, 195, 255], SMALL, "center");
      if (rule.cut) shadowText(ctx, `Cables cortados: con ${CUT_AT} vidas o menos no hay curas`, RW / 2, 104, [255, 140, 100], TINY, "center");
    } else if (s.ph === PH_REVEAL) {
      const [lv, bl] = s.ld;
      const a = `${lv} ${lv === 1 ? "REAL" : "REALES"}`;
      const b = `${bl} DE FOGUEO`;
      const wa = textWidth(ctx, a, MID), wb = textWidth(ctx, b, MID), gap = 16;
      const x0 = RW / 2 - (wa + wb + gap) / 2;
      panel(ctx, x0 - 8, 35, wa + wb + gap + 16, 20, [198, 162, 42], 0.92, [20, 8, 32]);
      shadowText(ctx, a, x0, 40, [255, 75, 75], MID);
      shadowText(ctx, "·", x0 + wa + gap / 2, 40, [198, 172, 95], MID, "center");
      shadowText(ctx, b, x0 + wa + gap, 40, [105, 175, 255], MID);
    } else if (s.ph === PH_ROUND_END) {
      const w = s.rw;
      const title = w < 0 ? "RONDA SIN GANADOR" : w === me ? "¡GANAS LA RONDA!" : `${seatName(s, w).toUpperCase()} GANA LA RONDA`;
      panel(ctx, -2, 68, RW + 4, 38, w >= 0 ? PLAYER_COLORS[w] : [198, 162, 42], 0.85, [15, 8, 22]);
      titleText(ctx, fitTitle(ctx, title, RW - 12, "14px"), RW / 2, 74, w >= 0 ? PLAYER_COLORS[w] : [255, 215, 70], "14px");
      if (s.rd + 1 < ROUNDS.length) shadowText(ctx, "Siguiente ronda...", RW / 2, 94, [185, 170, 220], TINY, "center");
    } else if (s.ph === PH_OVER) {
      this.drawResults(ctx, v);
    }

    // Lo que acaba de pasar
    if (s.ph === PH_TURN) {
      const msg = eventText(s, me);
      if (msg) shadowText(ctx, fitText(ctx, msg, RW - 8, SMALL), RW / 2, RH - 64, [245, 240, 225], SMALL, "center");
      if (isOut(s, me)) shadowText(ctx, "Estás fuera esta ronda", RW / 2, 36, [255, 140, 110], SMALL, "center");
    }
    // Lo que sabes de la carga (lupa, teléfono)
    const known: string[] = [];
    const kn = s.kn[me] ?? [];
    for (let k = 0; k + 1 < kn.length; k += 2) {
      const what = kn[k + 1] ? "REAL" : "fogueo";
      known.push(kn[k] === 1 ? `Recámara: ${what}` : `${kn[k]}º cartucho: ${what}`);
    }
    if (known.length && s.ph === PH_TURN) shadowText(ctx, `Sabes: ${known.join(" · ")}`, 4, RH - 36, [170, 230, 180], TINY);
    if (v.netLabel) shadowText(ctx, v.netLabel, RW - 4, RH - 36, [190, 190, 210], TINY, "right");

    // Barra inferior: tu selección, o de quién es el turno.
    panel(ctx, -2, RH - 27, RW + 4, 29, [198, 162, 42], 0.94, [15, 8, 22]);
    let line1 = v.label, line2 = v.hint;
    if (!line1 && s.ph === PH_TURN) {
      line1 = s.tu === me ? (s.bz ? "..." : "Tu turno") : `Turno de ${seatName(s, s.tu)}`;
    }
    if (v.footer) line2 = v.footer;
    if (line1) shadowText(ctx, fitText(ctx, line1, RW - 8, SMALL), RW / 2, RH - 23, [255, 236, 190], SMALL, "center");
    if (line2) text(ctx, fitText(ctx, line2, RW - 8, TINY), RW / 2, RH - 11, [210, 210, 225], TINY, "center");
  }

  private drawResults(ctx: Ctx, v: RuletaView) {
    const { s, me } = v;
    const order = s.p.map((row, i) => ({ i, w: row[P_WINS] })).sort((a, b) => b.w - a.w || a.i - b.i);
    const best = order[0].w;
    const winners = order.filter((o) => o.w === best);
    const title = winners.length > 1 ? "¡EMPATE!" : winners[0].i === me ? "¡HAS GANADO LA PARTIDA!" : `¡GANA ${seatName(s, winners[0].i).toUpperCase()}!`;
    const top = 38;
    panel(ctx, 40, top, RW - 80, 34 + order.length * 14, [198, 158, 38], 0.92, [18, 8, 28]);
    titleText(ctx, fitTitle(ctx, title, RW - 90, MID), RW / 2, top + 5, winners.length === 1 ? PLAYER_COLORS[winners[0].i] : [255, 215, 70], MID);
    text(ctx, "Rondas", RW - 50, top + 20, [170, 170, 190], TINY, "right");
    order.forEach((o, k) => {
      const y = top + 28 + k * 14;
      const place = 1 + order.filter((x) => x.w > o.w).length;
      badge(ctx, 56, y + 4, 4, PLAYER_COLORS[o.i], String(o.i + 1));
      text(ctx, `${place}º`, 64, y, [255, 255, 255], MID);
      text(ctx, seatName(s, o.i) + (o.i === me ? " (tú)" : ""), 82, y, PLAYER_COLORS[o.i], MID);
      text(ctx, String(o.w), RW - 50, y, [255, 220, 60], MID, "right");
    });
  }
}


// --- Textos ---

function bolt(ctx: Ctx, x: number, y: number, on: boolean) {
  const pts: [number, number][] = [[x + 3, y], [x, y + 4.5], [x + 2.2, y + 4.5], [x + 1.4, y + 8], [x + 5, y + 3], [x + 2.8, y + 3], [x + 4, y]];
  if (on) polygon(ctx, pts, [255, 214, 70]);
  else {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
    ctx.closePath();
    ctx.strokeStyle = css([110, 100, 70]);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

/** Frase del último evento (disparo u objeto), mientras dura y un poco después. */
function eventText(s: RuletaSnap, me: number): string {
  const ev = s.ev;
  if (ev[1] === EV_NONE) return "";
  const kind = ev[1];
  if (s.et > (kind === EV_SHOT ? SHOT_TIME : ITEM_TIME) + 1) return "";
  const who = (i: number) => (i === me ? "Tú" : seatName(s, i));
  if (kind === EV_SHOT) {
    const [, , a, b, live, dmg] = ev;
    const msg = a === b
      ? a === me ? "Te apuntas a ti mismo" : `${who(a)} se apunta a sí mismo`
      : a === me ? `Apuntas a ${seatName(s, b)}` : b === me ? `${who(a)} te apunta a ti` : `${who(a)} apunta a ${seatName(s, b)}`;
    if (live < 0) return `${msg}...`;
    if (live === 1) return `¡PUM! Real: ${b === me ? "pierdes" : `${seatName(s, b)} pierde`} ${dmg} vida${dmg > 1 ? "s" : ""}`;
    return a === b ? "Clic... fogueo: repite turno" : "Clic... era de fogueo";
  }
  const [, , user, id, target, result, stolen] = ev;
  const name = ITEMS[id].name;
  const subject = stolen
    ? `${user === me ? "Robas" : `${who(user)} roba`} ${name} a ${target === me ? "ti" : seatName(s, target)}`
    : `${user === me ? "Usas" : `${who(user)} usa`}: ${name}`;
  if (s.et < ITEM_HIT) return subject;
  let res = "";
  if (id === I_CIGS) res = result > 0 ? "+1 vida" : "no hace efecto";
  else if (id === I_BEER) res = result === 1 ? "sale un cartucho REAL" : "sale uno de fogueo";
  else if (id === I_SAW) res = "el próximo disparo quita 2";
  else if (id === I_CUFFS) res = `${target === me ? "pierdes" : `${seatName(s, target)} pierde`} su próximo turno`;
  else if (id === I_PHONE) res = result === 0 ? "no quedan más cartuchos" : `revela el ${result}º cartucho`;
  else if (id === I_LUPA) res = user === me ? "" : "mira la recámara";
  else if (id === I_INVERTER) res = "el de la recámara cambia";
  else if (id === I_MEDS) res = result === 0 ? "−1 vida" : result === 1 ? "+2 vidas" : "no hace efecto";
  return res ? `${subject} → ${res}` : subject;
}
