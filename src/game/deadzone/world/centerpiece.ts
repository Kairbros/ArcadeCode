// Las tres máquinas del mapa: la CAJA MISTERIOSA del centro de la plaza (con su plataforma y su haz de luz), el
// MEJORADOR de armas y el INTERRUPTOR de la energía. Aquí solo está lo visual y el estado que se dibuja; las
// reglas (precios, quién cobra, tiempos) son de `game/interact.ts` y los invitados reciben el estado por red.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { glowSprite } from "../../core/three";
import { clamp, damp } from "../core/math";
import { WEAPONS, type WeaponId } from "../weapons/defs";
import { buildWeaponModel, type WeaponModel } from "../weapons/model";
import { texture } from "./textures";

/** Texto brillante en un cartel (canvas), para los rótulos de las máquinas. */
function sign(text: string, color: string, w = 256, h = 64, font = "bold 34px 'Courier New', monospace"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#05070a";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = color;
    g.font = font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = color;
    g.shadowBlur = 8;
    g.fillText(text, w / 2, h / 2 + 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rótulo «?» de la caja. */
function questionTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = "#cfe8ff";
    g.shadowColor = "#4ab4ff";
    g.shadowBlur = 14;
    g.font = "bold 104px 'Courier New', monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("?", 64, 70);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Haz de luz vertical con degradado (aditivo): marca la caja desde cualquier punto del mapa. */
function beam(color: number, height: number, radius: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { c: { value: new THREE.Color(color) }, k: { value: 1 }, t: { value: 0 }, cam: { value: new THREE.Vector3() } },
    vertexShader: `
      varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        vY = uv.y;
        vW = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 c; uniform float k; uniform float t; uniform vec3 cam;
      varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float fade = pow(1.0 - vY, 1.7);
        float pulse = 0.85 + 0.15 * sin(t * 2.0 + vY * 12.0);
        float near = smoothstep(2.5, 9.0, distance(vW, cam));
        gl_FragColor = vec4(c * (0.2 + edge) , edge * fade * 0.42 * k * pulse * near);
      }`,
  });
  const geo = new THREE.CylinderGeometry(radius * 0.55, radius, height, 24, 1, true);
  geo.translate(0, height / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.userData.dyn = true;
  return m;
}

// --- Caja misteriosa -------------------------------------------------------------------------------
export type BoxPhase = 0 | 1 | 2;

export interface MysteryBox {
  position: THREE.Vector3;
  group: THREE.Group;
  price: number;
  /** 0 cerrada, 1 girando (cambia de arma), 2 ofreciendo el arma. */
  phase: BoxPhase;
  /** Arma que se ve flotando, y los segundos que quedan de la oferta (para que se hunda al final). */
  shown: WeaponId | null;
  left: number;
  /** Apertura de la tapa (0..1) y animación. */
  openK: number;
  update(dt: number, time: number, camPos?: THREE.Vector3): void;
  dispose(): void;
}

const CAM0 = new THREE.Vector3(0, 2, 20);

export function buildMysteryBox(x: number, z: number, price: number): MysteryBox {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Plataforma circular con aro luminoso.
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.16, 36), new THREE.MeshStandardMaterial({ map: texture("concrete"), roughness: 0.85, metalness: 0.1, color: 0xb8c0c8 }));
  dais.position.y = 0.08;
  dais.userData.dyn = false;
  group.add(dais);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x08202e, emissive: 0x3ab4ff, emissiveIntensity: 2.2, roughness: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.05, 8, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.17;
  group.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.035, 8, 40), ringMat);
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.17;
  group.add(ring2);
  // Doce marcas alrededor del aro grande.
  const tickGeo = new THREE.BoxGeometry(0.14, 0.04, 0.4);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const t = new THREE.Mesh(tickGeo, ringMat);
    t.position.set(Math.cos(a) * 2.1, 0.17, Math.sin(a) * 2.1);
    t.rotation.y = -a;
    group.add(t);
  }

  // Cuerpo de la caja.
  const wood = new THREE.MeshStandardMaterial({ map: texture("wood"), roughness: 0.7, metalness: 0.05, color: 0xb7a089 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.4, metalness: 0.9 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.86, 1.05, 3, 0.04), wood);
  body.position.set(0, 0.61, 0);
  group.add(body);
  // Refuerzos metálicos.
  for (const sx of [-0.78, 0.78]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 1.1), metal);
    band.position.set(sx, 0.61, 0);
    group.add(band);
  }
  for (const sy of [0.22, 1.0]) {
    const belt = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.05, 1.09), metal);
    belt.position.set(0, sy, 0);
    group.add(belt);
  }
  // Interrogantes luminosos en los laterales y el frente.
  const qMat = new THREE.MeshStandardMaterial({ map: questionTexture(), transparent: true, emissive: 0x9fd8ff, emissiveMap: questionTexture(), emissiveIntensity: 1.7, depthWrite: false, roughness: 1 });
  for (const [px, pz, ry] of [[0, 0.535, 0], [0.86, 0, Math.PI / 2], [-0.86, 0, -Math.PI / 2]] as const) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), qMat);
    q.position.set(px, 0.62, pz);
    q.rotation.y = ry;
    group.add(q);
  }
  // Tapa con bisagra atrás.
  const hinge = new THREE.Group();
  hinge.position.set(0, 1.04, -0.52);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(1.74, 0.16, 1.1, 3, 0.04), wood);
  lid.position.set(0, 0.0, 0.53);
  hinge.add(lid);
  const lidTrim = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.05, 1.14), metal);
  lidTrim.position.set(0, 0.07, 0.53);
  hinge.add(lidTrim);
  group.add(hinge);
  // Interior luminoso.
  const innerMat = new THREE.MeshBasicMaterial({ color: 0x7ac8ff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), innerMat);
  inner.rotation.x = -Math.PI / 2;
  inner.position.set(0, 1.045, 0);
  group.add(inner);
  const light = new THREE.PointLight(0x6ec0ff, 0, 11, 2);
  light.position.set(0, 1.9, 0);
  group.add(light);
  const halo = glowSprite(0x6ec0ff, 2.4, 0);
  halo.position.set(0, 1.2, 0);
  halo.userData.dyn = true;
  group.add(halo);
  const bm = beam(0x62b8ff, 46, 1.1);
  bm.position.y = 0.9;
  group.add(bm);

  // Arma que flota sobre la caja.
  const display = new THREE.Group();
  display.visible = false;
  group.add(display);
  const models = new Map<WeaponId, WeaponModel>();
  let shownNow: WeaponId | null = null;

  const box: MysteryBox = {
    position: new THREE.Vector3(x, 0.9, z),
    group,
    price,
    phase: 0,
    shown: null,
    left: 0,
    openK: 0,
    update(dt, time, camPos = CAM0) {
      const open = box.phase === 0 ? 0 : 1;
      box.openK = damp(box.openK, open, 7, dt);
      hinge.rotation.x = -box.openK * 1.95;
      const live = box.openK;
      innerMat.opacity = live * (0.3 + Math.sin(time * 9) * 0.08);
      light.intensity = 4 + live * 13 + Math.sin(time * 2) * 1.0;
      (halo.material as THREE.SpriteMaterial).opacity = 0.2 + live * 0.3;
      const bmat = bm.material as THREE.ShaderMaterial;
      bmat.uniforms.k.value = 0.55 + live * 1.0;
      bmat.uniforms.t.value = time;
      bmat.uniforms.cam.value.copy(camPos);
      ringMat.emissiveIntensity = 1.6 + live * 2.0 + Math.sin(time * 3) * 0.3;
      ring2.rotation.z += dt * (0.4 + live * 3);
      if (shownNow !== box.shown) {
        for (const c of [...display.children]) display.remove(c);
        shownNow = box.shown;
        if (shownNow) {
          let m = models.get(shownNow);
          if (!m) {
            m = buildWeaponModel(shownNow, false);
            models.set(shownNow, m);
          }
          // Centrado: el modelo mide ~lenght hacia −Z; se desplaza a la mitad para girar sobre su centro.
          const holder = new THREE.Group();
          m.group.position.z = WEAPONS[shownNow].look.length * 0.5 - 0.1;
          m.group.scale.setScalar(1.35);
          m.group.position.multiplyScalar(1.35);
          holder.add(m.group);
          display.add(holder);
        }
      }
      display.visible = !!box.shown && box.openK > 0.55;
      if (display.visible) {
        const sink = box.phase === 2 ? clamp(1 - box.left / 3, 0, 1) * 0.5 : 0;
        display.position.set(0, 1.55 + (box.openK - 0.55) * 0.9 - sink + Math.sin(time * 2.4) * 0.05, 0);
        display.rotation.y += dt * (box.phase === 1 ? 7 : 1.6);
        display.rotation.z = Math.sin(time * 1.7) * 0.08;
        // Aviso de que se acaba el tiempo: parpadea.
        display.visible = !(box.phase === 2 && box.left < 2.5 && Math.floor(time * 6) % 2 === 0);
      }
      ring.rotation.z = 0;
    },
    dispose() {
      for (const m of models.values()) m.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      models.clear();
    },
  };
  return box;
}

// --- Mejorador de armas ----------------------------------------------------------------------------
export interface Upgrader {
  position: THREE.Vector3;
  group: THREE.Group;
  /** 0 libre, 1 trabajando, 2 arma lista para recoger. */
  phase: 0 | 1 | 2;
  powered: boolean;
  shown: WeaponId | null;
  shownUpgraded: boolean;
  /** Segundos que lleva en la fase actual y que le quedan a la espera de recogerla. */
  t: number;
  left: number;
  update(dt: number, time: number): void;
  dispose(): void;
}

export function buildUpgrader(x: number, z: number, facing: number): Upgrader {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = Math.atan2(Math.cos(facing), Math.sin(facing));

  const hull = new THREE.MeshStandardMaterial({ color: 0x2c3844, roughness: 0.42, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.55, metalness: 0.8 });
  const rivet = new THREE.MeshStandardMaterial({ color: 0x6a737d, roughness: 0.3, metalness: 1 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x07202c, emissive: 0x39c8ff, emissiveIntensity: 0.15, roughness: 0.3 });
  const lampMats = [0xff3a3a, 0xffd23a, 0x3aff7a].map((c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 0.05 }));
  const add = (m: THREE.Object3D, px: number, py: number, pz: number) => {
    m.position.set(px, py, pz);
    group.add(m);
    return m;
  };
  const rbox = (w: number, h: number, d: number, m: THREE.Material, r = 0.03) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), m);

  // Zócalo, cuerpo, capó y chimenea.
  add(rbox(1.9, 0.3, 1.3, dark, 0.04), 0, 0.15, 0);
  add(rbox(1.7, 1.9, 1.05, hull, 0.05), 0, 1.2, -0.05);
  add(rbox(1.78, 0.28, 1.12, dark, 0.05), 0, 2.28, -0.05);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 12), dark), -0.55, 2.7, -0.2);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 12), dark), -0.2, 2.65, -0.25);
  // Nicho frontal donde se coloca el arma: marco, fondo y brillo.
  add(rbox(1.2, 0.95, 0.1, dark, 0.03), 0, 1.25, 0.5);
  const recess = add(new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.75), glowMat), 0, 1.25, 0.56);
  recess.userData.dyn = true;
  // Pistones y tuberías laterales.
  for (const sx of [-0.95, 0.95]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.7, 10), rivet), sx, 1.2, 0.35);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10), dark), sx, 0.45, 0.35);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10), dark), sx, 1.95, 0.35);
  }
  // Remaches del cuerpo.
  const rg = new THREE.SphereGeometry(0.025, 6, 5);
  for (let i = 0; i < 5; i++) {
    for (const sx of [-0.78, 0.78]) add(new THREE.Mesh(rg, rivet), sx, 0.5 + i * 0.35, 0.49);
  }
  // Rótulo y lámparas de estado.
  const signMat = new THREE.MeshStandardMaterial({ map: sign("MEJORADOR", "#39c8ff", 256, 64), emissive: 0xffffff, emissiveMap: sign("MEJORADOR", "#39c8ff", 256, 64), emissiveIntensity: 0.25 });
  add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.37), signMat), 0, 2.28, 0.52);
  lampMats.forEach((lm, i) => add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), lm), -0.35 + i * 0.35, 1.9, 0.52));
  // Anillos giratorios sobre el nicho (ventilador de energía).
  const rings = new THREE.Group();
  add(rings, 0, 1.25, 0.62);
  const ringGeo = new THREE.TorusGeometry(0.36, 0.015, 6, 28);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(ringGeo, glowMat);
    r.rotation.set(i * 1.05, i * 0.6, 0);
    rings.add(r);
  }
  // Bobina de Tesla en lo alto.
  const coil = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 20), glowMat), 0.5, 2.55, -0.2);
  coil.rotation.x = Math.PI / 2;
  const light = new THREE.PointLight(0x39c8ff, 0, 9, 2);
  light.position.set(0, 2.5, 0.9);
  group.add(light);
  const halo = glowSprite(0x39c8ff, 2.4, 0);
  halo.position.set(0, 1.25, 0.9);
  halo.userData.dyn = true;
  group.add(halo);

  // Arma delante del nicho.
  const display = new THREE.Group();
  display.position.set(0, 1.2, 0.75);
  display.visible = false;
  group.add(display);
  const models = new Map<string, WeaponModel>();
  let shownKey = "";

  const up: Upgrader = {
    position: new THREE.Vector3(x, 1.2, z),
    group,
    phase: 0,
    powered: false,
    shown: null,
    shownUpgraded: false,
    t: 0,
    left: 0,
    update(dt, time) {
      const p = up.powered ? 1 : 0;
      const work = up.phase === 1 ? 1 : 0;
      glowMat.emissiveIntensity = 0.12 + p * (0.32 + work * 0.9 + Math.sin(time * 5) * 0.15 * work);
      signMat.emissiveIntensity = 0.2 + p * 0.55;
      lampMats[0].emissiveIntensity = up.powered ? 0.05 : 1.2 + Math.sin(time * 3) * 0.6;
      lampMats[1].emissiveIntensity = up.phase === 1 ? 1.8 + Math.sin(time * 20) * 1.2 : 0.05;
      lampMats[2].emissiveIntensity = up.powered && up.phase !== 1 ? 1.6 : 0.05;
      light.intensity = p * (1.5 + work * 5 + (up.phase === 2 ? 3 + Math.sin(time * 6) : 0));
      (halo.material as THREE.SpriteMaterial).opacity = p * (0.12 + work * 0.3 + (up.phase === 2 ? 0.25 : 0));
      rings.rotation.y += dt * (0.4 + work * 9) * p;
      rings.rotation.x += dt * (0.2 + work * 5) * p;
      coil.rotation.z += dt * (up.powered ? 2 + work * 12 : 0);
      // La máquina tiembla mientras trabaja.
      group.position.x = x + (work ? (Math.random() - 0.5) * 0.02 : 0);
      group.position.y = work ? (Math.random() - 0.5) * 0.012 : 0;
      const key = up.shown ? `${up.shown}${up.shownUpgraded ? "+" : ""}` : "";
      if (key !== shownKey) {
        for (const c of [...display.children]) display.remove(c);
        shownKey = key;
        if (up.shown) {
          let m = models.get(key);
          if (!m) {
            m = buildWeaponModel(up.shown, up.shownUpgraded);
            models.set(key, m);
          }
          const holder = new THREE.Group();
          m.group.scale.setScalar(1.15);
          m.group.position.z = WEAPONS[up.shown].look.length * 0.5 * 1.15 - 0.15;
          holder.add(m.group);
          display.add(holder);
        }
      }
      display.visible = !!up.shown && up.phase !== 0;
      if (display.visible) {
        // Trabajando: gira dentro del nicho. Lista: sale al frente y se ofrece.
        const out = up.phase === 2 ? 0.55 : 0;
        display.position.z = damp(display.position.z, 0.8 + out * 0.6, 6, dt);
        display.rotation.y = up.phase === 1 ? display.rotation.y + dt * 8 : damp(display.rotation.y, Math.PI / 2 + 0.0, 6, dt);
        display.position.y = 1.2 + Math.sin(time * 3) * 0.03;
        for (const m of models.values()) for (const g of m.glow) g.emissiveIntensity = 1.0 + Math.sin(time * 6) * 0.4;
        display.visible = !(up.phase === 2 && up.left < 3 && Math.floor(time * 6) % 2 === 0);
      }
    },
    dispose() {
      for (const m of models.values()) m.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      models.clear();
    },
  };
  return up;
}

// --- Interruptor de la energía ---------------------------------------------------------------------
export interface PowerSwitch {
  position: THREE.Vector3;
  group: THREE.Group;
  on: boolean;
  update(dt: number, time: number): void;
}

export function buildPowerSwitch(x: number, z: number, facing: number): PowerSwitch {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = Math.atan2(Math.cos(facing), Math.sin(facing));
  const metal = new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.5, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6, metalness: 0.6 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.16), metal);
  board.position.set(0, 1.3, 0.08);
  group.add(board);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.06), dark);
  slot.position.set(0, 1.25, 0.18);
  group.add(slot);
  const lever = new THREE.Group();
  lever.position.set(0, 1.25, 0.24);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.25, metalness: 1 }));
  arm.position.y = 0.25;
  lever.add(arm);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshStandardMaterial({ color: 0xaa1c1c, roughness: 0.35, metalness: 0.2 }));
  knob.position.y = 0.52;
  lever.add(knob);
  group.add(lever);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x220808, emissive: 0xff2a1a, emissiveIntensity: 2 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), lampMat);
  lamp.position.set(0, 1.9, 0.2);
  group.add(lamp);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.2),
    new THREE.MeshStandardMaterial({ map: sign("ENERGÍA", "#ff8a3a", 256, 64, "bold 30px 'Courier New', monospace"), emissive: 0xffffff, emissiveMap: sign("ENERGÍA", "#ff8a3a", 256, 64, "bold 30px 'Courier New', monospace"), emissiveIntensity: 0.6 }),
  );
  label.position.set(0, 0.7, 0.17);
  group.add(label);
  const light = new THREE.PointLight(0xff2a1a, 3, 6, 2);
  light.position.set(0, 1.9, 0.8);
  group.add(light);
  let k = 0;
  const sw: PowerSwitch = {
    position: new THREE.Vector3(x - Math.cos(facing) * 0, 1.25, z),
    group,
    on: false,
    update(dt, time) {
      k = damp(k, sw.on ? 1 : 0, 7, dt);
      lever.rotation.x = (0.65 - k * 1.3);
      const c = sw.on ? 0x3aff7a : 0xff2a1a;
      lampMat.emissive.setHex(c);
      lampMat.emissiveIntensity = sw.on ? 2.2 : 1.5 + Math.sin(time * 4) * 0.8;
      light.color.setHex(c);
      light.intensity = sw.on ? 3 : 2 + Math.sin(time * 4) * 1.2;
    },
  };
  return sw;
}
