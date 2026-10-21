// Escena 3D de Dead Zone, común al anfitrión y a los invitados: el SECTOR 09 con su cielo de tormenta, la lluvia y
// la niebla, la luna con sombras, las luces más cercanas (un grupo fijo de luces que salta de fuente en fuente), el
// mapa de entorno para los reflejos, la cámara con el arma, los zombis, los demás jugadores y los efectos. Se
// construye con Three.js sin tocar WebGL (se puede crear en Node para las pruebas); el dibujo usa el renderizador
// compartido del hub con una cadena de postproceso propia (resplandor, color, viñeta, grano).
import * as THREE from "three";
import { PLAYER_COLORS } from "../core/config";
import { fitRenderer, projectTo, renderInto } from "../core/three";
import { clamp, damp } from "./core/math";
import { Effects } from "./fx/effects";
import { PostFx, type PostState } from "./fx/post";
import { Weather } from "./fx/weather";
import { ZombieManager } from "./enemies/manager";
import { disposeZombieRigs } from "./enemies/model";
import { Avatar } from "./player/avatar";
import { disposeWeaponAssets } from "./weapons/model";
import { WeaponView } from "./weapons/view";
import { buildMap, type BuiltMap, type LightSource } from "./world/map";
import { MAP_BOUNDS } from "./world/mapdata";
import { NavGrid } from "./world/nav";
import { buildSky, MOON_DIR, type Sky } from "./world/sky";

/** Tamaño lógico del lienzo del juego. */
export const VW = 320;
export const VH = 240;
export const BASE_FOV = 78;
export const ADS_FOV = 58;
const EXPOSURE = 1.7;
/** Luces puntuales que se encienden a la vez (el resto de fuentes cede su sitio a las más cercanas). */
const POOL = 11;

const rgb = (c: readonly [number, number, number]) => (c[0] << 16) | (c[1] << 8) | c[2];

/** Lo que la cámara necesita saber del jugador propio. */
export interface CamState {
  x: number;
  eyeY: number;
  z: number;
  yaw: number;
  pitch: number;
  lean: number;
  shake: number;
  sprinting: boolean;
  ads: boolean;
  alive: boolean;
  /** 0..1: cuánto se mueve (para el vaivén de la cámara). */
  moving?: number;
}

interface Slot {
  light: THREE.PointLight;
  src: LightSource | null;
  k: number;
}

export class DzStage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly map: BuiltMap;
  readonly effects: Effects;
  readonly zombies: ZombieManager;
  readonly view: WeaponView;
  readonly nav: NavGrid | null;
  readonly flashlight: THREE.SpotLight;
  readonly sky: Sky;
  readonly weather: Weather;
  /** Estado que el juego pone cada fotograma para el postproceso (daño, poca vida…). */
  readonly post: PostState = { time: 0, damage: 0, low: 0, flash: 0, ads: 0, sprint: 0 };
  /** Avisos del clima al audio (trueno). */
  onThunder?: (delay: number) => void;
  private readonly avatars: Avatar[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly ambient: THREE.AmbientLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly moon: THREE.DirectionalLight;
  private readonly pool: Slot[] = [];
  private composer: PostFx | null = null;
  private composerFailed = false;
  private envReady = false;
  private time = 0;
  private lastDt = 1 / 60;
  /** Calidad adaptativa (0 mínima … 3 máxima) según los milisegundos reales por fotograma. */
  private quality = 2;
  private ema = 16;
  private lastRender = 0;
  private lastChange = 0;
  private upBlockedUntil = 0;
  private appliedQuality = -1;
  private bob = 0;

  /** `withNav`: el anfitrión necesita la rejilla de rutas de los zombis; los invitados no. */
  constructor(withNav: boolean) {
    this.scene.background = new THREE.Color(0x05070b);
    this.scene.fog = new THREE.FogExp2(0x141a25, 0.021);

    this.sky = buildSky();
    this.scene.add(this.sky.dome, this.sky.skyline);
    this.weather = new Weather({ thunder: (delay) => this.onThunder?.(delay) });
    this.scene.add(this.weather.group);

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, VW / VH, 0.05, 240);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.view = new WeaponView(this.camera);
    // Luz pegada a la cámara: el arma en primera persona siempre se lee, aunque la zona esté a oscuras.
    const gunLight = new THREE.PointLight(0xffe4c4, 2.0, 3, 2);
    gunLight.position.set(0.25, 0.1, 0.2);
    this.camera.add(gunLight);
    // Linterna con sombras (solo se recalculan mientras está encendida).
    this.flashlight = new THREE.SpotLight(0xffeccb, 0, 30, 0.5, 0.5, 1.3);
    this.flashlight.position.set(0.12, -0.06, 0);
    this.flashlight.target.position.set(0, 0, -1);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(768, 768);
    this.flashlight.shadow.camera.near = 0.2;
    this.flashlight.shadow.camera.far = 30;
    this.flashlight.shadow.bias = -0.0006;
    // El mapa de sombras se crea una vez (sin él, el muestreador queda inválido y las mallas iluminadas no se dibujan).
    this.flashlight.shadow.autoUpdate = false;
    this.flashlight.shadow.needsUpdate = true;
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);

    // Luz base de la noche: ambiente frío, hemisférica y luna con sombras que sigue al jugador.
    this.ambient = new THREE.AmbientLight(0x56648a, 1.7);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x46558c, 0x2e1c14, 1.5);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xa9b7e6, 2.1);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1536, 1536);
    const sc = this.moon.shadow.camera;
    sc.left = -28;
    sc.right = 28;
    sc.top = 28;
    sc.bottom = -28;
    sc.near = 1;
    sc.far = 110;
    this.moon.shadow.bias = -0.0005;
    this.moon.shadow.normalBias = 0.05;
    this.scene.add(this.moon, this.moon.target);

    this.map = buildMap(this.scene);
    // Grupo fijo de luces puntuales: cada fotograma se reparten entre las fuentes más cercanas.
    for (let i = 0; i < POOL; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      this.scene.add(light);
      this.pool.push({ light, src: null, k: 0 });
    }
    this.nav = withNav
      ? new NavGrid({ minX: MAP_BOUNDS.minX, maxX: MAP_BOUNDS.maxX, minZ: MAP_BOUNDS.minZ, maxZ: MAP_BOUNDS.maxZ }, 0.5, this.map.colliders)
      : null;
    this.zombies = new ZombieManager(this.scene, this.nav);
    this.effects = new Effects(this.scene);
    this.zombies.onDie = (z) => this.effects.corpseBlood(z.position.x, z.position.z);
    for (let i = 0; i < 4; i++) {
      const a = new Avatar(rgb(PLAYER_COLORS[i] ?? PLAYER_COLORS[0]));
      a.group.visible = false;
      this.scene.add(a.group);
      this.avatars.push(a);
    }
    this.updateLights(0);
  }

  avatar(i: number): Avatar {
    return this.avatars[i];
  }

  /** Linterna: enciende o apaga (las sombras solo se calculan encendida). */
  setFlashlight(on: boolean): void {
    this.flashlight.intensity = on ? 46 : 0;
    this.flashlight.shadow.autoUpdate = on;
    if (on) this.flashlight.shadow.needsUpdate = true;
  }

  /** Cámara en los ojos del jugador propio (con sacudida al recibir daño y zoom al apuntar). */
  updateCamera(s: CamState, dt: number): void {
    const cam = this.camera;
    const moving = s.moving ?? 0;
    this.bob += dt * (s.sprinting ? 12 : 8) * (moving > 0.05 ? 1 : 0);
    const bobY = Math.sin(this.bob) * 0.028 * moving;
    const bobX = Math.cos(this.bob * 0.5) * 0.018 * moving;
    if (s.alive) {
      cam.position.set(
        s.x + (Math.random() - 0.5) * s.shake * 0.09 + bobX * Math.cos(s.yaw),
        s.eyeY + (Math.random() - 0.5) * s.shake * 0.07 + bobY,
        s.z + (Math.random() - 0.5) * s.shake * 0.09 - bobX * Math.sin(s.yaw),
      );
      cam.rotation.set(clamp(s.pitch + s.shake * (Math.random() - 0.5) * 0.05, -1.5, 1.5), s.yaw, -s.lean - s.shake * 0.02 + bobX * 0.4);
    } else {
      // Abatido: la cámara cae al suelo y se ladea.
      cam.position.set(s.x, damp(cam.position.y, 0.35, 6, dt), s.z);
      cam.rotation.set(-0.25, s.yaw, damp(cam.rotation.z, 0.9, 5, dt));
    }
    const target = s.ads ? ADS_FOV : s.sprinting ? BASE_FOV + 5 : BASE_FOV;
    if (Math.abs(cam.fov - target) > 0.05) {
      cam.fov = damp(cam.fov, target, 9, dt);
      cam.updateProjectionMatrix();
    }
  }

  /** Cada fotograma: clima, cielo, sombras de la luna, luces cercanas y brasas de los barriles. */
  update(dt: number): void {
    this.time += dt;
    this.lastDt = Math.max(1e-4, dt);
    const cam = this.camera.position;
    this.weather.update(dt, this.time, cam);
    const flash = this.weather.flash;
    this.sky.update(this.time, flash, cam.x, cam.z);
    this.map.camPos.copy(cam);
    // La luna (con sus sombras) sigue al jugador, pegada a una rejilla de 1 m para que no «bailen».
    const sx = Math.round(cam.x);
    const sz = Math.round(cam.z);
    this.moon.target.position.set(sx, 0, sz);
    this.moon.position.set(sx + MOON_DIR.x * 60, MOON_DIR.y * 60, sz + MOON_DIR.z * 60);
    this.moon.intensity = 2.1 + flash * 5;
    this.ambient.intensity = 1.7 + flash * 2.2;
    this.hemi.intensity = 1.5 + flash * 1.4;
    this.updateLights(dt);
    for (const f of this.map.fires) {
      if (Math.random() < dt * 8) this.effects.ember(f.x + (Math.random() - 0.5) * 0.3, f.y + 0.1, f.z + (Math.random() - 0.5) * 0.3);
      if (Math.random() < dt * 1.6) this.effects.smoke(f.x, f.y + 0.4, f.z);
    }
    this.effects.update(dt);
    this.post.time = this.time;
    this.post.flash = flash;
  }

  /** Reparte el grupo de luces entre las fuentes del mapa más cercanas a la cámara. */
  private updateLights(dt: number): void {
    const cam = this.camera.position;
    const src = this.map.lights;
    // Las más cercanas (por distancia a su alcance).
    const scored = src
      .map((s) => {
        const d = Math.hypot(s.x - cam.x, s.z - cam.z);
        return { s, score: (s.distance * 1.15 + 6) / (d + 1) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, POOL);
    const keep = new Set(scored.map((q) => q.s));
    // Las que ya tienen sitio lo conservan; las nuevas ocupan los huecos.
    const free: Slot[] = [];
    for (const slot of this.pool) {
      if (slot.src && keep.has(slot.src)) keep.delete(slot.src);
      else free.push(slot);
    }
    for (const s of keep) {
      const slot = free.pop();
      if (!slot) break;
      slot.src = s;
      slot.k = 0;
      slot.light.position.set(s.x, s.y, s.z);
      slot.light.color.setHex(s.color);
      slot.light.distance = s.distance * 1.15;
    }
    for (const slot of free) {
      slot.src = null;
      slot.light.intensity = 0;
    }
    for (const slot of this.pool) {
      const s = slot.src;
      if (!s) continue;
      slot.k = Math.min(1, slot.k + dt * 4);
      let m = 1;
      if (s.flicker) {
        const n = Math.sin(this.time * 11 + s.seed) * Math.sin(this.time * 2.7 + s.seed * 3);
        m = 0.55 + Math.abs(n) * 0.75;
      }
      slot.light.intensity = s.intensity * 2.4 * m * slot.k;
    }
  }

  /** Mapa de entorno a partir del cielo: da reflejos al metal, la pintura y los charcos. */
  private initEnv(r: THREE.WebGLRenderer): void {
    this.envReady = true;
    try {
      const pm = new THREE.PMREMGenerator(r);
      const rt = pm.fromScene(this.sky.envScene(), 0, 0.1, 400);
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = 0.55;
      pm.dispose();
    } catch (err) {
      console.warn("Sin mapa de entorno:", err);
    }
  }

  /** Ajusta la calidad al rendimiento: baja si los fotogramas van lentos y sube con margen de sobra. */
  private adapt(now: number): void {
    if (this.lastRender) {
      const d = Math.min(120, now - this.lastRender);
      this.ema += (d - this.ema) * 0.06;
    }
    this.lastRender = now;
    if (now - this.lastChange < 2500) return;
    if (this.ema > 25 && this.quality > 0) {
      // Si acaba de subir y no aguanta, se queda abajo un buen rato.
      if (now - this.lastChange < 12000) this.upBlockedUntil = now + 60000;
      this.quality--;
      this.lastChange = now;
    } else if (this.ema < 17.8 && this.quality < 3 && now > this.upBlockedUntil && now - this.lastChange > 10000) {
      this.quality++;
      this.lastChange = now;
    }
  }

  /** Dibuja la escena en el lienzo del hub; devuelve false si no hay WebGL. */
  render(ctx: CanvasRenderingContext2D, pixelScale: number): boolean {
    this.adapt(performance.now());
    // Resolución interna: ×3 solo con margen de sobra; ×2 normal y en calidad media; ×1 en emergencia.
    const cap = this.quality >= 3 ? 3 : this.quality >= 1 ? 2 : 1;
    const fit = fitRenderer(VW, VH, Math.min(pixelScale, cap));
    if (!fit) return false;
    const { r, k } = fit;
    if (!this.envReady) this.initEnv(r);
    this.effects.setView(VH * k, this.camera.fov);
    this.weather.setView(VH * k, this.camera.fov);
    r.toneMappingExposure = EXPOSURE;
    if (!this.composerFailed) {
      try {
        if (!this.composer) this.composer = new PostFx(r, this.scene, this.camera, VW * k, VH * k);
        else this.composer.resize(VW * k, VH * k);
        if (this.appliedQuality !== this.quality) {
          this.appliedQuality = this.quality;
          this.composer.setQuality(this.quality >= 2 ? 4 : 0, this.quality >= 1);
        }
        this.composer.render(this.lastDt, this.post);
        ctx.drawImage(r.domElement, 0, 0, VW, VH);
        return true;
      } catch (err) {
        console.warn("Postproceso no disponible; se dibuja sin él:", err);
        this.composerFailed = true;
        this.composer?.dispose();
        this.composer = null;
      }
    }
    return renderInto(ctx, this.scene, this.camera, VW, VH, pixelScale, EXPOSURE);
  }

  /** Punto del mundo en el lienzo lógico (para los nombres sobre los jugadores). */
  project(x: number, y: number, z: number): [number, number, number] | null {
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    return projectTo(this.camera, [x, y, z], VW, VH);
  }

  /** Posición del ojo y dirección de la mirada de la cámara (para disparar). */
  aim(eye = this.tmp): { eye: THREE.Vector3; dir: THREE.Vector3 } {
    const e = this.camera.getWorldPosition(eye.clone());
    const d = this.camera.getWorldDirection(new THREE.Vector3());
    return { eye: e, dir: d };
  }

  dispose(): void {
    this.zombies.clear();
    for (const a of this.avatars) a.dispose();
    this.composer?.dispose();
    this.composer = null;
    this.effects.dispose();
    this.weather.dispose();
    this.sky.dispose();
    this.view.dispose();
    this.map.dispose();
    this.scene.environment?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    disposeZombieRigs();
    disposeWeaponAssets();
  }
}
