// Dead Zone: Outbreak en el hub. Un FPS cooperativo de 1 a 4 jugadores contra oleadas de infectados en el SECTOR 09.
//
// El anfitrión (o la partida local) lleva TODA la simulación: zombis, rondas, puntos, armas, compras, puertas y
// barricadas de cada jugador. Cada jugador es dueño de su movimiento y su mirada (los manda en el latido) y avisa
// de lo que hace: gatillo, recarga, cambio de arma y «usar». El anfitrión resuelve los disparos, el daño y las
// compras con su propio estado y lo reparte en el snapshot; los invitados dibujan lo que reciben.
import * as THREE from "three";
import { PLAYER_COLORS, PLAYER_NAMES } from "../core/config";
import type { Transport } from "../net/protocol";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import { AudioSystem } from "./core/audio";
import { hasLineOfSight, raycastWorld } from "./core/collision";
import { clamp, damp, dist2D } from "./core/math";
import { Input, lookMode } from "./core/input";
import { ZOMBIE_KINDS, ZOMBIE_STATES } from "./enemies/manager";
import { MAP_IDS } from "./world/maps";
import type { MapId } from "./world/mapdef";
import type { Zombie } from "./enemies/zombie";
import { pickKind, type ZombieKind } from "./enemies/defs";
import { applyMachineState, Interactions, type PlayerCtx, type Prompt } from "./game/interact";
import { POINTS, Points } from "./game/points";
import { hasPerk, maxHealthFor, PERK_TUNING, reviveTimeFor } from "./game/perks";
import { PowerUps, POWERS, POWER_KINDS, POWER_TUNING, type PowerKind } from "./game/powerups";
import { RoundManager, ROUNDS, tuneFor, type RoundEvent } from "./game/rounds";
import { drawHud, type DzHudView, type HudToast } from "./hud";
import { Player, PLAYER } from "./player/player";
import { DzStage, VH, VW } from "./stage";
import { BOX_PRICE, KNIFE, SIGHTS, weaponAt, weaponDef, weaponIndex } from "./weapons/defs";
import { WeaponSystem, type Shot } from "./weapons/system";
import { MAX_PLANKS } from "./world/map";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;
const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
const int = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : def);

/** Cada cuánto manda el invitado su posición (ms) y cuánto dura el gatillo de un clic corto (s). */
const POS_MS = 60;
const TAP_HOLD = 0.12;
const MAX_PLAYERS = 4;
/** Lo que detiene una bala: todo menos el techo y los tablones (como en CoD, se dispara por entre las tablas). */
const SHOOT_THROUGH = (c: { tag: string }) => c.tag !== "ceiling" && c.tag !== "barricade";
/** Lo que tapa la vista de un golpe: muros, puertas y objetos (no los tablones ni el alféizar). */
const MELEE_OPAQUE = (c: { tag: string }) => c.tag === "wall" || c.tag === "door" || c.tag === "prop";
/** Alcance del golpe de un zombi (m). */
const STRIKE_REACH = 2.1;
/** Arma de la ametralladora (poder): la ametralladora pesada mejorada. */
const DM_DEF = weaponDef("lmg", true);

// --- Mensajes y estado de red ---------------------------------------------------------------------
/** Lo que manda un invitado: dónde está, adónde mira, qué mantiene pulsado y, a veces, una acción. */
export interface DzMsg {
  t: "z";
  /** Número de acción y de mensaje. */
  i: number;
  s: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Banderas: 1 agachado, 2 corre, 4 apunta, 8 gatillo, 16 «usar» mantenido. */
  fl: number;
  /** Última reaparición que conoce (si no coincide con la del anfitrión, se ignora su posición). */
  rv: number;
  /** Acción: 1 gatillo (clic), 2 recargar, 3 usar, 4 elegir ranura `sl`, 5 cambiar de arma al siguiente, 6 cuchillo. */
  ca?: number;
  sl?: number;
}

const F_CROUCH = 1;
const F_SPRINT = 2;
const F_ADS = 4;
const F_FIRE = 8;
const F_USE = 16;

/** Fila de zombi: `[id, tipo, x, z, giro, estado]`. */
export type ZombieRow = number[];

export interface DzSnap {
  g: "deadzone";
  base: number;
  seq: number;
  /** Jugadores conectados (1/0) y última acción aceptada de cada uno. */
  on: number[];
  ak: number[];
  /** Por jugador: `[x, y, z, giro, cabeceo, vida, banderas (1 vivo, 2 agachado, 4 corre, 8 apunta), arma, disparos, reapariciones, bajas, arma mejorada (1/0)]`. */
  pl: number[][];
  /** Puntos de cada jugador. */
  pt: number[];
  /** Por jugador: `[ranura 1, 2, 3 (índice de arma o −1), ranura activa, cargador, reserva, estado (0 lista, 1 recarga, 2 cambio), progreso de recarga ×100, máscara de ranuras mejoradas]`. */
  wp: number[][];
  zb: ZombieRow[];
  /** Ronda: `[número, estado (0 espera, 1 descanso, 2 en curso), zombis que quedan, total, tiempo, ronda de perros (1/0)]`. */
  rd: number[];
  /** Puertas abiertas (1/0) y tablones de cada ventana. */
  dr: number[];
  wn: number[];
  /** Caja misteriosa: `[fase (0 cerrada, 1 girando, 2 ofrece), arma que se ve, jugador que paga, segundos de oferta]`. */
  bx: number[];
  /** Mejorador: `[energía (1/0), fase (0 libre, 1 trabaja, 2 lista), jugador, arma, mejorada (1/0), segundos de espera]`. */
  pu: number[];
  /** Cartel de interacción de cada jugador: `[texto, precio, mantener (1/0), alcanza (1/0), tablones (−1 si no es barricada), informativo (1/0)]` o null. */
  pr: ((number | string)[] | null)[];
  /** Poderes en el suelo `[id, tipo, x, z, segundos]` y segundos que quedan de muerte instantánea, puntos dobles y munición infinita. */
  pw?: number[][];
  fx?: number[];
  /** Ventajas de cada jugador (máscara) y estado de abatido `[segundos, progreso de revivir ×100, se levanta solo (1/0)]`. */
  pk?: number[];
  dn?: number[][];
  /** Mapa que se juega, si está en el selector (0) o jugando (1) y qué tarjeta tiene marcada el anfitrión. */
  mp?: string;
  st?: number;
  mi?: number;
  /** Segundos de ametralladora de cada jugador. */
  dm?: number[];
  /** Sucesos recientes `[número, tipo, ...datos]`. */
  ne: (number | string)[][];
  /** Fin de partida: `[ronda, puntos del equipo, bajas]` o null. */
  ov: number[] | null;
}

// Tipos de suceso.
const EV_TOAST = 1; // [who, texto, tono]
const EV_BANNER = 2; // [número, texto]
const EV_HIT = 3; // [tirador, cabeza, x, y, z, dx, dz, murió, id zombi]
const EV_HURT = 4; // [quien]
const EV_SOUND = 5; // [quien, nombre]
const EV_STRIKE = 6; // [x, z]
const EV_GROWL = 7; // [tono, x, z]
const EV_ROUND_START = 8;
const EV_ROUND_END = 9;
const EV_DOWN = 10; // [quien]
const EV_POWER = 11; // [quien, tipo de poder]
const EV_NUKE = 12;
const EV_KNIFE = 13; // [quien]
const EV_SPAWNFX = 14; // [x, z]: llamarada donde aparece un perro infernal

type Ev = (number | string)[];
const TONES = ["info", "good", "bad"] as const;

// --- Avisos y efectos que ve cada pantalla ------------------------------------------------------
/**
 * Convierte los sucesos del anfitrión en lo que ve y oye ESTE jugador (`me`): avisos, banner, marcador de
 * impacto, rojo de daño, sangre y sonidos. Lo usan igual el anfitrión (para sí mismo) y los invitados.
 */
class Feedback {
  readonly toasts: HudToast[] = [];
  banner: { num: number; sub: string; t: number } | null = null;
  hitT = 9;
  hitHead = false;
  damageT = 9;
  /** Último poder cogido y segundos desde el último Katabum. */
  power: { kind: PowerKind; t: number } | null = null;
  nukeT = 9;

  constructor(
    private audio: AudioSystem,
    private stage: DzStage,
    private me: () => number,
    private mePos: () => { x: number; z: number },
    private onHurt: () => void,
  ) {}

  setStage(stage: DzStage) {
    this.stage = stage;
  }

  tick(dt: number) {
    this.hitT += dt;
    this.damageT += dt;
    this.nukeT += dt;
    if (this.power) {
      this.power.t -= dt;
      if (this.power.t <= 0) this.power = null;
    }
    for (const t of this.toasts) t.t -= dt;
    while (this.toasts.length && this.toasts[0].t <= 0) this.toasts.shift();
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
  }

  toast(text: string, kind: "info" | "good" | "bad" = "info") {
    this.toasts.push({ text, kind, t: 2.6 });
    while (this.toasts.length > 5) this.toasts.shift();
  }

  apply(e: Ev) {
    const me = this.me();
    const near = (x: number, z: number, d: number) => dist2D(x, z, this.mePos().x, this.mePos().z) < d;
    switch (e[1]) {
      case EV_TOAST:
        if (e[2] === me || e[2] === -1) this.toast(String(e[3]), TONES[Number(e[4])] ?? "info");
        break;
      case EV_BANNER:
        this.banner = { num: Number(e[2]), sub: String(e[3]), t: 2.4 };
        break;
      case EV_HIT: {
        const at = new THREE.Vector3(Number(e[4]), Number(e[5]), Number(e[6]));
        const dir = new THREE.Vector3(Number(e[7]) || 0, 0.12, Number(e[8]) || 0);
        this.stage.effects.blood(at, dir, 8, e[3] === 1);
        if (e[9] === 1 && e[3] === 1) {
          this.stage.zombies.list.find((z) => z.id === Number(e[10]))?.popHead();
          this.stage.effects.gibs(at, dir);
        }
        if (e[2] === me) {
          this.hitT = 0;
          this.hitHead = e[3] === 1;
          if (e[3] === 1) this.audio.headshot();
          else this.audio.hit();
        }
        break;
      }
      case EV_HURT:
        if (e[2] === me) {
          this.damageT = 0;
          this.audio.hurt();
          this.onHurt();
        }
        break;
      case EV_SOUND:
        // -2: sonido para todos (tablón arrancado, fin de la partida).
        if (e[2] === me || e[2] === -2) this.sound(String(e[3]));
        break;
      case EV_STRIKE:
        if (near(Number(e[2]), Number(e[3]), 22)) this.audio.attack();
        break;
      case EV_GROWL:
        if (near(Number(e[3]), Number(e[4]), 24)) this.audio.growl(Number(e[2]));
        break;
      case EV_ROUND_START:
        this.audio.roundStart();
        break;
      case EV_ROUND_END:
        this.audio.roundEnd();
        break;
      case EV_DOWN:
        if (e[2] === me) this.audio.death();
        break;
      case EV_POWER: {
        const kind = POWER_KINDS[Number(e[3])];
        if (!kind) break;
        this.power = { kind, t: 2.6 };
        this.audio.powerPick();
        break;
      }
      case EV_NUKE:
        this.nukeT = 0;
        this.audio.nuke();
        this.onHurt();
        break;
      case EV_SPAWNFX: {
        const x = Number(e[2]);
        const z = Number(e[3]);
        for (let k = 0; k < 14; k++) this.stage.effects.ember(x + (Math.random() - 0.5) * 1.2, 0.2 + Math.random() * 1.6, z + (Math.random() - 0.5) * 1.2);
        for (let k = 0; k < 3; k++) this.stage.effects.smoke(x + (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.8, z + (Math.random() - 0.5) * 0.8);
        break;
      }
      case EV_KNIFE:
        if (e[2] === me) {
          this.stage.view.slash();
          this.audio.melee();
        }
        break;
    }
  }

  sound(name: string) {
    const a = this.audio;
    if (name === "buy") a.buy();
    else if (name === "deny") a.deny();
    else if (name === "boxOpen") a.boxOpen();
    else if (name === "repair") a.repair();
    else if (name === "swap") a.swap();
    else if (name === "dry") a.dryFire();
    else if (name === "reload") a.reload();
    else if (name === "reloadDone") a.reloadDone();
    else if (name === "kill") a.kill();
    else if (name === "over") a.death();
    else if (name === "papStart") a.papStart();
    else if (name === "papDone") a.papDone();
    else if (name === "power") a.power();
    else if (name === "boxTick") a.boxTick();
    else if (name === "powerDrop") a.powerDrop();
    else if (name === "powerEnd") a.powerEnd();
    else if (name === "revive") a.revive();
    else if (name === "houndStart") a.houndStart();
    else if (name === "teddy") a.teddy();
    else if (name === "boxMove") a.boxMove();
  }
}

/** Nombres sobre los demás jugadores (con su vida), dibujados en 2D. */
function drawNames(ctx: CanvasRenderingContext2D, stage: DzStage, rows: { name: string; x: number; y: number; z: number; alive: boolean; color: readonly [number, number, number] }[]) {
  for (const r of rows) {
    const at = stage.project(r.x, r.y + 2.0, r.z);
    if (!at || at[2] > 45) continue;
    ctx.save();
    ctx.font = "6px monospace";
    ctx.fillStyle = r.alive ? `rgb(${r.color[0]},${r.color[1]},${r.color[2]})` : "rgb(255,90,74)";
    ctx.textAlign = "center";
    ctx.fillText(r.alive ? r.name : `${r.name} ✝`, at[0], at[1]);
    ctx.restore();
  }
}

/** Dirección de la mirada (con cabeceo) a partir de giro y cabeceo. */
function lookDir(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

// --- Anfitrión ------------------------------------------------------------------------------------
/** Todo lo que es de un jugador en el anfitrión. */
interface Seat extends PlayerCtx {
  p: Player;
  kills: number;
  /** Gatillo mantenido (invitados), clic pendiente y segundos que se mantiene tras un clic corto. */
  fireHeld: boolean;
  firePressed: boolean;
  fireHold: number;
  ads: boolean;
  useHeld: boolean;
  usePressed: boolean;
  reloadReq: boolean;
  /** Pide un tajo de cuchillo y segundos que faltan para el siguiente. */
  meleeReq: boolean;
  meleeCd: number;
  /** Abatido: segundos que quedan antes de desangrarse (0 = no está abatido), progreso de revivir (0..1) y si se levanta solo. */
  down: number;
  /** Segundos que le quedan con la ametralladora (poder). */
  deathT: number;
  reviveProg: number;
  beingRevived: boolean;
  selfRevive: boolean;
  /** Segundos desde el último daño (la vida se regenera pasado un rato). */
  sinceHurt: number;
  selectReq: number;
  /** Veces que ha disparado (los invitados lo usan para el fogonazo y el sonido) y veces que ha reaparecido. */
  fireSeq: number;
  reviveSeq: number;
  /** Lo que tiene delante para interactuar (el invitado recibe su cartel por el snapshot). */
  prompt: Prompt | null;
}

export class DeadZoneHost implements HostGame {
  readonly size = [VW, VH] as const;
  netLabel = "";
  stage: DzStage;
  readonly audio = new AudioSystem();
  readonly input: Input;
  readonly seats: Seat[];
  readonly online = [true, false, false, false];
  readonly rounds = new RoundManager({ ...ROUNDS });
  readonly powers = new PowerUps();
  interact!: Interactions;
  readonly acks = [0, 0, 0, 0];
  /** Selector de mapa (menu) o partida (play), mapa cargado y tarjeta marcada. */
  phase: "menu" | "play" = "play";
  mapId: MapId;
  menuIndex = 0;
  over = false;
  /** Fin de partida (para poder cambiar de juego con J). */
  get finished(): boolean {
    return this.over;
  }
  private seq = 0;
  private time = 0;
  private kills = 0;
  private growlBudget = 0;
  private readonly tearT = new Map<string, number>();
  private objectives: { x: number; z: number }[] = [];
  private readonly events: { e: Ev; at: number }[] = [];
  private evSeq = 0;
  private prompt: Prompt | null = null;
  private ads = 0;
  private flashOn = false;
  private prevState = "";
  private readonly fb: Feedback;
  private readonly lookKey = new THREE.Vector3();

  /** `mapId` null: empieza en el selector de mapa. */
  constructor(input: Input, remoteCount: number, readonly mode: "local" | "host", mapId: MapId | null = "sector09") {
    this.input = input;
    this.mapId = mapId ?? "sector09";
    this.stage = new DzStage(true, this.mapId);
    this.phase = mapId ? "play" : "menu";
    this.seats = Array.from({ length: MAX_PLAYERS }, () => ({
      p: new Player(),
      weapons: new WeaponSystem(),
      points: new Points(),
      kills: 0,
      fireHeld: false, firePressed: false, fireHold: 0, ads: false, useHeld: false, usePressed: false,
      reloadReq: false, meleeReq: false, meleeCd: 0, down: 0, deathT: 0, reviveProg: 0, beingRevived: false, selfRevive: false, sinceHurt: 99, perks: 0, selectReq: -1, fireSeq: 0, reviveSeq: 0, prompt: null,
    }));
    for (let i = 1; i <= Math.min(3, remoteCount); i++) this.online[i] = true;
    this.fb = new Feedback(this.audio, this.stage, () => 0, () => this.seats[0].p.position, () => (this.seats[0].p.shake = Math.min(1, this.seats[0].p.shake + 0.4)));
    this.bindStage();
    this.restart();
  }

  /** Engancha las interacciones, las barricadas y el trueno a la escena actual (al crearla y al cambiar de mapa). */
  private bindStage() {
    this.objectives = this.stage.map.windows.map((w) => ({ ...w.outer }));
    this.interact = new Interactions(this.stage.map, {
      toast: (who, msg, kind = "info") => this.emit(EV_TOAST, who, msg, TONES.indexOf(kind)),
      sound: (who, name) => this.emit(EV_SOUND, who, name),
      onDoorOpen: () => this.stage.nav?.rebuild(),
      onWeaponChange: (who) => {
        if (who === 0) this.syncView();
      },
      onPerk: (who) => this.perkBought(who),
      ctxOf: (who) => (this.online[who] ? this.seats[who] : null),
    });
    this.stage.onThunder = (delay) => setTimeout(() => this.audio.thunder(), delay * 1000);
  }

  /** Carga otro mapa (nueva escena, rutas y máquinas) y empieza la partida desde cero. */
  loadMap(id: MapId) {
    if (id !== this.mapId) {
      this.stage.dispose();
      this.stage = new DzStage(true, id);
      this.mapId = id;
      this.fb.setStage(this.stage);
      this.bindStage();
    }
    this.restart();
  }

  /** Teclas del selector de mapa. */
  private menuControl() {
    const n = MAP_IDS.length;
    if (this.input.take("ArrowLeft") || this.input.take("KeyA")) this.menuIndex = (this.menuIndex + n - 1) % n;
    if (this.input.take("ArrowRight") || this.input.take("KeyD")) this.menuIndex = (this.menuIndex + 1) % n;
    for (let k = 0; k < Math.min(4, n); k++) if (this.input.take(`Digit${k + 1}` as "Digit1")) this.menuIndex = k;
    if (this.input.take("Enter") || this.input.take("Space") || this.input.take("KeyE")) {
      this.phase = "play";
      this.loadMap(MAP_IDS[this.menuIndex]);
    }
  }

  /** El modelo de la mano sigue al arma (y a su mejora) del jugador local. */
  private syncView() {
    const w = this.seats[0].weapons;
    this.stage.view.setWeapon(w.currentId, !!w.currentId && w.upg[w.currentId]);
  }

  // --- Ciclo de vida -------------------------------------------------------------------------
  /** Partida nueva: todos de pie con la pistola, 500 puntos y la ronda 1. */
  restart() {
    this.over = false;
    this.kills = 0;
    this.time = 0;
    this.stage.zombies.clear();
    this.stage.effects.clear();
    this.interact.reset();
    this.powers.reset();
    this.stage.powerDrops.clear();
    this.stage.nav?.rebuild();
    this.syncWindowNav();
    this.seats.forEach((s, i) => {
      s.points.reset();
      s.weapons.reset();
      s.kills = 0;
      s.perks = 0;
      s.down = 0;
      s.deathT = 0;
      s.reviveProg = 0;
      s.selfRevive = false;
      s.sinceHurt = 99;
      this.applyPerks(i);
      this.spawnSeat(i);
    });
    this.fb.toasts.length = 0;
    Object.assign(this.rounds.tune, tuneFor(this.playersNow()));
    this.applyRoundEvents(this.rounds.start());
    this.syncView();
  }

  private playersNow(): number {
    return Math.max(1, this.online.filter(Boolean).length);
  }

  /** Coloca al jugador `i` en la salida (separados un poco) con toda la vida. */
  private spawnSeat(i: number) {
    const s = this.seats[i];
    s.p.reset(this.stage.def.playerSpawn.x + (i - 1.5) * 1.3, this.stage.def.playerSpawn.z, this.stage.def.playerSpawn.yaw);
    s.reviveSeq++;
  }

  // --- Bucle ---------------------------------------------------------------------------------
  update(dtRaw: number) {
    const dt = Math.min(0.05, dtRaw);
    this.time += dt;
    this.input.poll();
    if (this.input.takeGesture()) this.audio.unlock();
    this.fb.tick(dt);
    while (this.events.length && this.time - this.events[0].at > 4) this.events.shift();

    if (this.phase === "menu") this.menuControl();
    if (!this.over && this.phase === "play") {
      this.localControl(dt);
      for (let i = 1; i < MAX_PLAYERS; i++) if (this.online[i]) this.remoteControl(i, dt);
      this.tickPowers(dt);
      this.tickDown(dt);
      this.seatsTick(dt);
      this.stage.zombies.update(
        dt,
        this.seats.map((s, i) => ({ pos: s.p.position, alive: this.online[i] && s.p.alive })),
        this.stage.map.colliders,
        { onStrike: (z, target) => this.zombieStrike(z, target), onGrowl: (z) => this.zombieGrowl(z), onStuck: (z) => this.rescueZombie(z) },
        this.objectives,
      );
      this.tickBarricades(dt);
      this.applyRoundEvents(this.rounds.update(dt));
      const boxFrom = this.stage.map.box.spot;
      this.interact.update(dt);
      if (this.stage.map.box.spot !== boxFrom) this.boxMoved(boxFrom);
      this.checkOver();
    }
    this.stage.map.update(dt, this.time);
    this.updateView(dt);
    this.stage.update(dt);
    this.growlBudget = Math.max(0, this.growlBudget - dt);
    this.input.clear();
  }

  /** Mirar, moverse y teclas del jugador local (el 0). */
  private localControl(dt: number) {
    const s = this.seats[0];
    const p = s.p;
    const look = this.input.consumeLook();
    if (p.alive) p.look(look.x, look.y, this.input.sensitivity);
    p.update(dt, this.input, this.stage.map.colliders);
    p.onStep = (running) => this.audio.step(running);
    // Teclas de un solo uso.
    const wanted = this.input.take("Digit1") ? 0 : this.input.take("Digit2") ? 1 : this.input.take("Digit3") ? 2 : -1;
    s.selectReq = wanted;
    s.reloadReq = this.input.take("KeyR");
    s.meleeReq = this.input.take("KeyV");
    if (this.input.take("KeyF")) {
      this.flashOn = !this.flashOn;
      this.stage.setFlashlight(this.flashOn);
      this.audio.swap();
    }
    s.ads = this.input.mouseRight && s.weapons.state === "ready";
    s.fireHeld = this.input.mouseLeft;
    s.firePressed = this.input.takeClick();
    s.useHeld = this.input.isDown("KeyE");
    s.usePressed = this.input.take("KeyE");
  }

  /** Un jugador remoto: el cuerpo viene del invitado; aquí solo se agota el mantenimiento del gatillo. */
  private remoteControl(i: number, dt: number) {
    const s = this.seats[i];
    s.fireHold = Math.max(0, s.fireHold - dt);
    // Un clic corto se alarga unos instantes (fireHold) para que cuente también en las armas automáticas.
  }

  /** Armas, disparos, recargas e interacciones de cada jugador en pie. */
  private seatsTick(dt: number) {
    this.seats.forEach((s, i) => {
      if (!this.online[i]) return;
      s.weapons.update(dt);
      s.meleeCd = Math.max(0, s.meleeCd - dt);
      s.sinceHurt += dt;
      if (s.p.alive && s.sinceHurt > PERK_TUNING.regenDelay && s.p.health < s.p.maxHealth) s.p.heal(dt * s.p.maxHealth * 0.35);
      if (!s.p.alive) {
        s.firePressed = s.reloadReq = s.usePressed = s.meleeReq = false;
        s.selectReq = -1;
        s.prompt = null;
        if (i === 0) this.prompt = null;
        return;
      }
      if (s.selectReq >= 0 && s.weapons.select(s.selectReq)) {
        if (i === 0) {
          this.audio.swap();
          this.syncView();
        } else this.emit(EV_SOUND, i, "swap");
      }
      s.selectReq = -1;
      if (s.reloadReq && s.weapons.startReload()) {
        if (i === 0) this.audio.reload();
        else this.emit(EV_SOUND, i, "reload");
      }
      s.reloadReq = false;
      // Fin de la recarga (sonido).
      const state = s.weapons.state;
      if (i === 0) {
        if (this.prevState === "reloading" && state !== "reloading") this.audio.reloadDone();
        this.prevState = state;
      }
      // Ametralladora (poder): disparo automático, mucha cadencia y munición infinita mientras dura.
      const dm = s.deathT > 0;
      if (dm) {
        s.deathT = Math.max(0, s.deathT - dt);
        if (s.deathT === 0) this.emit(EV_SOUND, i, "powerEnd");
      }
      s.weapons.autoAll = dm;
      const cur = s.weapons.current;
      s.weapons.rateScale = (hasPerk(s.perks, "doubleTap") ? PERK_TUNING.rateScale : 1) * (dm && cur ? DM_DEF.rpm / cur.rpm : 1);
      const free = this.powers.infiniteAmmo || dm;
      if (free) s.weapons.fillMag();
      const down = s.fireHeld || s.fireHold > 0;
      // Cuchillo: con V, o con el gatillo cuando no queda ni una bala.
      const noAmmo = s.weapons.outOfAmmo && s.weapons.state === "ready";
      if ((s.meleeReq || (noAmmo && (s.firePressed || down))) && s.meleeCd <= 0) {
        this.knife(i);
        s.firePressed = false;
      }
      s.meleeReq = false;
      let shot = s.weapons.fire(down, s.firePressed, free);
      if (shot && dm) shot = { def: DM_DEF, pellets: 1, spread: DM_DEF.spread };
      if (shot) {
        this.resolveShot(i, shot);
      } else if (s.firePressed && s.weapons.empty && s.weapons.state === "ready") {
        if (i === 0) this.audio.dryFire();
        else this.emit(EV_SOUND, i, "dry");
        if (s.weapons.startReload()) {
          if (i === 0) this.audio.reload();
          else this.emit(EV_SOUND, i, "reload");
        }
      }
      s.firePressed = false;
      this.interactSeat(i, dt);
    });
    void dt;
  }

  private interactSeat(i: number, dt: number) {
    const s = this.seats[i];
    // Un compañero abatido al lado: mantener E lo revive (tiene prioridad sobre lo demás).
    const rescue = this.findRescue(i);
    if (rescue >= 0) {
      const t = this.seats[rescue];
      const rp: Prompt = { kind: "revive", label: `REVIVIR A ${PLAYER_NAMES[rescue] ?? `J${rescue + 1}`}`, cost: 0, id: String(rescue), hold: true };
      s.prompt = rp;
      if (i === 0) this.prompt = rp;
      if (s.useHeld) {
        t.beingRevived = true;
        t.reviveProg = Math.min(1, t.reviveProg + dt / reviveTimeFor(s.perks));
        if (t.reviveProg >= 1) this.revive(rescue);
      }
      s.usePressed = false;
      return;
    }
    const eye = s.p.eyePosition();
    const prompt = this.interact.find(eye, s.p.forward(this.lookKey), s, i);
    s.prompt = prompt;
    if (i === 0) this.prompt = prompt;
    if (!prompt) {
      this.interact.repair(dt, false, null, i, s);
      s.usePressed = false;
      return;
    }
    if (s.usePressed && !prompt.hold) this.interact.use(prompt, i, s);
    s.usePressed = false;
    if (prompt.hold && this.interact.repair(dt, s.useHeld, prompt, i, s) > 0) this.syncWindowNav();
  }

  // --- Disparos ------------------------------------------------------------------------------
  /** Resuelve un disparo del jugador `i` con SU posición y mirada y su munición (ya descontada). */
  private resolveShot(i: number, shot: Shot) {
    const s = this.seats[i];
    const def = shot.def;
    s.fireSeq++;
    const eye = s.p.eyePosition();
    const base = lookDir(s.p.yaw, s.p.pitch);
    const right = new THREE.Vector3(Math.cos(s.p.yaw), 0, -Math.sin(s.p.yaw));
    const muzzle = eye.clone().addScaledVector(base, 0.55).addScaledVector(right, 0.2);
    muzzle.y -= 0.14;
    if (i === 0) {
      this.audio.shot(def.id, def.upgraded);
      this.stage.view.kick(def);
      // La boca real del arma (con el modelo ya colocado) y el casquillo que sale por la ventana.
      this.stage.camera.updateMatrixWorld(true);
      this.stage.view.worldMuzzle(muzzle);
      this.stage.effects.casing(this.stage.view.worldEject(), right, def.id === "shotgun");
    } else {
      this.stage.avatar(i).fire();
      this.stage.avatar(i).muzzleWorld(muzzle);
      this.stage.effects.casing(muzzle, right, def.id === "shotgun");
    }
    this.stage.effects.muzzleSmoke(muzzle, base, def.id === "shotgun" ? 4 : 2);
    const spread = shot.spread * (s.ads ? 0.4 : 1) * (s.p.sprinting ? 1.6 : 1);
    for (let pellet = 0; pellet < shot.pellets; pellet++) {
      const dir = base.clone();
      if (spread > 0) {
        dir.x += (Math.random() - 0.5) * 2 * spread;
        dir.y += (Math.random() - 0.5) * 2 * spread;
        dir.z += (Math.random() - 0.5) * spread;
        dir.normalize();
      }
      const wall = raycastWorld(eye, dir, def.range, this.stage.map.colliders, SHOOT_THROUGH);
      const wallPoint = wall ? new THREE.Vector3(wall.point.x, wall.point.y, wall.point.z) : null;
      const limit = wall ? wall.t : def.range;
      const hits = this.stage.zombies.hitscan(eye, dir, limit);
      let pierce = def.pierce;
      let end = wallPoint ? wallPoint.clone() : eye.clone().addScaledVector(dir, def.range);
      let touched = false;
      for (const h of hits) {
        const falloff = clamp(1 - Math.max(0, h.t - def.range * 0.55) / (def.range * 0.5), 0.55, 1);
        const dmg = this.powers.instaKill ? 99999 : def.damage * falloff * (h.head ? def.headshot : 1) * (hasPerk(s.perks, "doubleTap") ? PERK_TUNING.damageScale : 1);
        const died = h.zombie.hit(dmg, h.head);
        s.points.add(POINTS.hit);
        this.emit(EV_HIT, i, h.head ? 1 : 0, r2(h.point.x), r2(h.point.y), r2(h.point.z), r2(dir.x), r2(dir.z), died ? 1 : 0, h.zombie.id);
        if (died) this.onZombieKilled(i, h.zombie.def.points, h.head, h.zombie.position);
        end = h.point.clone();
        touched = true;
        if (pierce <= 0) break;
        pierce -= 1;
      }
      this.stage.effects.tracer(muzzle, end, def.tint, def.damage > 120 ? 0.04 : 0.022);
      if (!touched && wall) this.stage.effects.impact(wallPoint!, this.normalOf(wall.normal), wall.collider.tag === "door");
    }
    // Retroceso sobre la mirada del jugador local (los invitados lo corrigen con el ratón).
    if (i === 0) {
      s.p.pitch = clamp(s.p.pitch + def.recoil * 0.01, -1.4, 1.4);
      s.p.yaw += (Math.random() - 0.5) * def.recoil * 0.005;
    }
  }

  private normalOf(n: { x: number; y: number; z: number }): THREE.Vector3 {
    return new THREE.Vector3(n.x, n.y, n.z);
  }

  /** Tajo de cuchillo del jugador `i`: golpea a los infectados que tiene delante y al alcance. */
  private knife(i: number) {
    const s = this.seats[i];
    s.meleeCd = KNIFE.cooldown;
    this.emit(EV_KNIFE, i);
    const fwd = lookDir(s.p.yaw, 0);
    const dmg = this.powers.instaKill ? 99999 : KNIFE.damage;
    for (const z of this.stage.zombies.list) {
      if (!z.alive) continue;
      const dx = z.position.x - s.p.position.x;
      const dz = z.position.z - s.p.position.z;
      const d = Math.hypot(dx, dz);
      if (d > KNIFE.reach + z.radius) continue;
      if (d > 0.35 && (dx * fwd.x + dz * fwd.z) / d < Math.cos(KNIFE.cone)) continue;
      if (!hasLineOfSight(s.p.eyePosition(), { x: z.position.x, y: z.position.y + 1.1, z: z.position.z }, this.stage.map.colliders, MELEE_OPAQUE)) continue;
      const died = z.hit(dmg, false);
      s.points.add(POINTS.hit);
      this.emit(EV_HIT, i, 0, r2(z.position.x), r2(z.position.y + 1.1), r2(z.position.z), r2(dx / (d || 1)), r2(dz / (d || 1)), died ? 1 : 0, z.id);
      if (died) this.onZombieKilled(i, z.def.points + POINTS.knifeBonus, false, z.position);
      else z.knock(dx, dz);
    }
  }

  /** La caja cambió de sitio: llamaradas en el antiguo y en el nuevo, y las rutas se recalculan (la colisión se movió). */
  private boxMoved(from: number) {
    const a = this.stage.def.boxSpots[from];
    const b = this.stage.def.boxSpots[this.stage.map.box.spot];
    if (a) this.emit(EV_SPAWNFX, r1(a.x), r1(a.z));
    if (b) this.emit(EV_SPAWNFX, r1(b.x), r1(b.z));
    this.stage.nav?.rebuild();
  }

  // --- Poderes -------------------------------------------------------------------------------
  /** Envejecen los poderes del suelo, se agotan los efectos y alguien puede coger uno. */
  private tickPowers(dt: number) {
    if (this.powers.update(dt).length) this.emit(EV_SOUND, -2, "powerEnd");
    this.stage.map.box.price = this.powers.fireSale ? POWER_TUNING.fireSalePrice : BOX_PRICE;
    const mult = this.powers.doublePoints ? 2 : 1;
    for (const q of this.seats) q.points.multiplier = mult;
    const who = () => this.seats.map((q, k) => ({ x: q.p.position.x, z: q.p.position.z, alive: this.online[k] && q.p.alive }));
    for (let got = this.powers.pickup(who()); got; got = this.powers.pickup(who())) this.activatePower(got.drop.kind, got.who);
  }

  private activatePower(kind: PowerKind, who: number) {
    this.emit(EV_POWER, who, POWER_KINDS.indexOf(kind));
    const team = this.seats.filter((_, k) => this.online[k]);
    if (kind === "maxAmmo") {
      for (const q of team) q.weapons.refillAll();
    } else if (kind === "nuke") {
      this.emit(EV_NUKE);
      for (const z of [...this.stage.zombies.list]) {
        if (!z.alive) continue;
        const died = z.hit(99999, false);
        this.emit(EV_HIT, who, 0, r2(z.position.x), r2(z.position.y + 1.1), r2(z.position.z), 0, 0, died ? 1 : 0, z.id);
        if (!died) continue;
        this.kills += 1;
        this.rounds.onZombieDead();
      }
      for (const q of team) q.points.add(POWER_TUNING.nukePoints);
      if (this.rounds.total > 0 && this.rounds.killed === this.rounds.total) this.emit(EV_TOAST, -1, "RONDA LIMPIA", 1);
    } else if (kind === "bonusPoints") {
      const t = POWER_TUNING;
      const steps = (t.bonusMax - t.bonusMin) / t.bonusStep;
      const amount = t.bonusMin + Math.floor(Math.random() * (steps + 1)) * t.bonusStep;
      for (const q of team) q.points.add(amount);
      this.emit(EV_TOAST, -1, `+${amount} PUNTOS PARA TODOS`, 1);
    } else if (kind === "deathMachine") {
      this.seats[who].deathT = POWERS.deathMachine.duration;
    } else if (kind === "carpenter") {
      this.interact.restoreAll();
      this.syncWindowNav();
      for (const q of team) q.points.add(POWER_TUNING.carpenterPoints);
    } else this.powers.activate(kind);
  }

  private onZombieKilled(i: number, base: number, head: boolean, at: { x: number; z: number }) {
    const drop = this.powers.onKill(at.x, at.z);
    if (drop) this.emit(EV_SOUND, -2, "powerDrop");
    const s = this.seats[i];
    this.kills += 1;
    s.kills += 1;
    this.rounds.onZombieDead();
    // El último perro de la ronda suelta munición máxima (como en BO2).
    if (this.rounds.special && this.rounds.remaining === 0) {
      this.powers.drop("maxAmmo", at.x, at.z);
      this.emit(EV_SOUND, -2, "powerDrop");
    }
    s.points.add(base + (head ? POINTS.headshotBonus : 0));
    this.emit(EV_SOUND, i, "kill");
    if (this.rounds.total > 0 && this.rounds.killed === this.rounds.total) this.emit(EV_TOAST, -1, "RONDA LIMPIA", 1);
  }

  // --- Zombis y barricadas -------------------------------------------------------------------
  /** El golpe del zombi: daña al jugador al que apuntaba si sigue al alcance y a la vista. */
  private zombieStrike(z: { damage: number; position: THREE.Vector3 }, target: number) {
    this.emit(EV_STRIKE, r1(z.position.x), r1(z.position.z));
    const s = this.seats[target];
    if (!s || !this.online[target] || !s.p.alive) return;
    const d = dist2D(z.position.x, z.position.z, s.p.position.x, s.p.position.z);
    if (d > STRIKE_REACH) return;
    const eye = s.p.eyePosition();
    const tgt = new THREE.Vector3(z.position.x, z.position.y + 1.2, z.position.z);
    if (!hasLineOfSight(eye, tgt, this.stage.map.colliders, (c) => c.tag === "wall" || c.tag === "door")) return;
    this.damageSeat(target, z.damage);
  }

  /** Daño a un jugador (solo aquí baja la vida). */
  private damageSeat(i: number, amount: number) {
    const s = this.seats[i];
    if (!s.p.alive) return;
    s.p.damage(amount);
    s.sinceHurt = 0;
    this.emit(EV_HURT, i);
    if (!s.p.alive) this.goDown(i);
  }

  // --- Abatidos, revivir y ventajas -----------------------------------------------------------
  private nameOf(i: number): string {
    return PLAYER_NAMES[i] ?? `J${i + 1}`;
  }

  /** Efectos de las ventajas del jugador `i` sobre su vida, recarga y cadencia. */
  private applyPerks(i: number) {
    const s = this.seats[i];
    s.p.maxHealth = maxHealthFor(s.perks);
    if (s.p.health > s.p.maxHealth) s.p.health = s.p.maxHealth;
    s.weapons.reloadScale = hasPerk(s.perks, "speedCola") ? PERK_TUNING.reloadScale : 1;
    s.weapons.rateScale = hasPerk(s.perks, "doubleTap") ? PERK_TUNING.rateScale : 1;
  }

  private perkBought(i: number) {
    const s = this.seats[i];
    const before = s.p.maxHealth;
    this.applyPerks(i);
    if (s.p.maxHealth > before) s.p.health += s.p.maxHealth - before;
  }

  /** El jugador `i` se queda sin vida: abatido (si alguien puede revivirlo) o fuera hasta la siguiente ronda. */
  private goDown(i: number) {
    const s = this.seats[i];
    this.emit(EV_DOWN, i);
    const mates = this.seats.some((q, k) => k !== i && this.online[k] && q.p.alive);
    const quick = hasPerk(s.perks, "quickRevive");
    s.perks = 0; // las ventajas se pierden al caer
    this.applyPerks(i);
    s.reviveProg = 0;
    s.beingRevived = false;
    s.selfRevive = false;
    if (mates) {
      s.down = PERK_TUNING.bleedOut;
      this.emit(EV_TOAST, -1, `${this.nameOf(i)} ESTÁ ABATIDO · ¡REVÍVELO!`, 2);
    } else if (quick) {
      s.down = PERK_TUNING.soloRevive;
      s.selfRevive = true;
      this.emit(EV_TOAST, i, "QUICK REVIVE: TE LEVANTAS EN UNOS SEGUNDOS", 1);
    } else {
      s.down = 0;
      this.emit(EV_TOAST, -1, `${this.nameOf(i)} HA CAÍDO`, 2);
    }
  }

  /** Quien está abatido se desangra, se levanta solo (Quick Revive en solitario) o pierde progreso si nadie lo atiende. */
  private tickDown(dt: number) {
    this.seats.forEach((s, i) => {
      if (!this.online[i] || s.p.alive || s.down <= 0) return;
      if (s.selfRevive) {
        s.down -= dt;
        s.reviveProg = Math.min(1, 1 - s.down / PERK_TUNING.soloRevive);
        if (s.down <= 0) this.revive(i);
        return;
      }
      if (!s.beingRevived) s.reviveProg = Math.max(0, s.reviveProg - dt * 1.5);
      s.beingRevived = false;
      s.down -= dt;
      if (s.down <= 0) {
        s.down = 0;
        s.reviveProg = 0;
        this.emit(EV_TOAST, -1, `${this.nameOf(i)} SE HA DESANGRADO`, 2);
      }
    });
  }

  /** Levanta al jugador `i` donde está, con la vida llena. */
  private revive(i: number) {
    const s = this.seats[i];
    s.p.health = s.p.maxHealth;
    s.down = 0;
    s.reviveProg = 0;
    s.beingRevived = false;
    s.selfRevive = false;
    s.sinceHurt = 0;
    this.emit(EV_SOUND, -2, "revive");
    this.emit(EV_TOAST, -1, `${this.nameOf(i)} HA VUELTO`, 1);
  }

  /** Compañero abatido (y que no se levanta solo) al alcance del jugador `i`, o −1. */
  private findRescue(i: number): number {
    const s = this.seats[i];
    if (!s.p.alive) return -1;
    let best = -1;
    let bestD: number = PERK_TUNING.reviveReach;
    this.seats.forEach((q, k) => {
      if (k === i || !this.online[k] || q.p.alive || q.down <= 0 || q.selfRevive) return;
      const d = dist2D(q.p.position.x, q.p.position.z, s.p.position.x, s.p.position.z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    return best;
  }

  /**
   * Un zombi lleva rato sin avanzar (se quedó tras una puerta cerrada o en un rincón sin ruta): se le coloca en un punto de
   * aparición desde el que sí haya camino hasta un jugador, para que la ronda no se quede bloqueada.
   */
  private rescueZombie(z: Zombie) {
    const alive = this.seats.map((s, i) => ({ s, i })).filter(({ s, i }) => this.online[i] && s.p.alive);
    if (!alive.length || !this.stage.nav) return;
    const goal = alive[Math.floor(Math.random() * alive.length)].s.p.position;
    const spawns = [...this.stage.map.spawns].sort(() => Math.random() - 0.5);
    const reachable = spawns.find((sp) => dist2D(sp.x, sp.z, goal.x, goal.z) > 8 && this.stage.nav!.findPath({ x: sp.x, y: 0, z: sp.z }, goal) !== null);
    const spot = reachable ?? spawns[0];
    this.emit(EV_SPAWNFX, r1(z.position.x), r1(z.position.z));
    z.teleport(spot.x, spot.z);
    this.emit(EV_SPAWNFX, r1(spot.x), r1(spot.z));
  }

  private zombieGrowl(z: { position: THREE.Vector3; def: { kind: ZombieKind } }) {
    if (this.growlBudget > 0) return;
    this.growlBudget = 0.7;
    const pitch = z.def.kind === "hound" ? 1.9 : z.def.kind === "runner" ? 1.5 : z.def.kind === "brute" ? 0.7 : 1;
    this.emit(EV_GROWL, r2(pitch * (0.9 + Math.random() * 0.2)), r1(z.position.x), r1(z.position.z));
  }

  /** Zombis que arrancan tablones al llegar a un hueco. */
  private tickBarricades(dt: number) {
    for (const w of this.stage.map.windows) {
      if (w.planks <= 0) continue;
      let tearing = 0;
      for (const z of this.stage.zombies.list) {
        if (z.alive && dist2D(z.position.x, z.position.z, w.outer.x, w.outer.z) < 1.7) tearing += 1;
      }
      if (tearing === 0) {
        this.tearT.set(w.id, 0);
        continue;
      }
      const t = (this.tearT.get(w.id) ?? 0) + dt * tearing;
      if (t > 0.85) {
        this.interact.tearPlank(w);
        this.emit(EV_SOUND, -2, "repair");
        this.syncWindowNav();
        this.tearT.set(w.id, 0);
      } else this.tearT.set(w.id, t);
    }
  }

  /** Bloquea la rejilla en las ventanas con tablones (los zombis no pueden cruzar). */
  private syncWindowNav() {
    for (const w of this.stage.map.windows) {
      const runsAlongX = Math.abs(w.nz) > 0.5;
      const halfX = runsAlongX ? w.width / 2 + 0.45 : 0.85;
      const halfZ = runsAlongX ? 0.85 : w.width / 2 + 0.45;
      this.stage.nav?.blockArea(w.x, w.z, halfX, halfZ, w.planks > 0);
    }
  }

  // --- Rondas --------------------------------------------------------------------------------
  private applyRoundEvents(events: RoundEvent[]) {
    for (const e of events) {
      if (e.type === "roundStart") {
        this.emit(EV_BANNER, e.round, e.special ? `¡PERROS INFERNALES! · ${e.total}` : `${e.total} INFECTADOS`);
        this.emit(EV_ROUND_START);
        if (e.special) this.emit(EV_SOUND, -2, "houndStart");
        this.emit(EV_TOAST, -1, `RONDA ${e.round}`, 0);
      } else if (e.type === "spawn") {
        this.spawnZombie();
      } else if (e.type === "roundEnd") {
        this.emit(EV_ROUND_END);
        const bonus = POINTS.roundBonus + e.round * 25;
        this.seats.forEach((s, i) => {
          if (!this.online[i]) return;
          // Quien había caído vuelve a la partida (con la pistola); los demás se curan un poco.
          if (!s.p.alive && s.down > 0) {
            // Abatido al acabar la ronda: se levanta donde está, con lo que llevaba.
            this.revive(i);
          } else if (!s.p.alive) {
            s.weapons.reset();
            s.perks = 0;
            s.down = 0;
            this.applyPerks(i);
            this.spawnSeat(i);
            if (i === 0) this.syncView();
            this.emit(EV_TOAST, i, "¡HAS VUELTO A LA PARTIDA!", 1);
          } else s.p.heal(ROUNDS.healOnRoundEnd);
          s.points.add(bonus);
        });
        this.emit(EV_BANNER, e.round, `SUPERADA · +${bonus} PUNTOS`);
        this.emit(EV_TOAST, -1, `RONDA ${e.round} SUPERADA · +${bonus}`, 1);
      }
    }
  }

  private spawnZombie() {
    const alive = this.seats.filter((s, i) => this.online[i] && s.p.alive);
    const who = alive.length ? alive[Math.floor(Math.random() * alive.length)] : this.seats[0];
    const p = who.p.position;
    const fwd = who.p.forward(new THREE.Vector3());
    const spawns = this.stage.map.spawns;
    const pool = spawns.filter((s) => dist2D(s.x, s.z, p.x, p.z) > 11);
    const behind = pool.filter((s) => (s.x - p.x) * fwd.x + (s.z - p.z) * fwd.z < 0.5);
    const candidates = behind.length > 0 ? behind : pool.length > 0 ? pool : spawns;
    const spot = candidates[Math.floor(Math.random() * candidates.length)];
    const kind: ZombieKind = this.rounds.special ? "hound" : pickKind(this.rounds.round);
    this.stage.zombies.spawn(kind, this.rounds.round, spot.x, spot.z);
    if (kind === "hound") this.emit(EV_SPAWNFX, r1(spot.x), r1(spot.z));
  }

  /** Si no queda nadie en pie, se acaba la partida. */
  private checkOver() {
    if (this.over) return;
    if (this.seats.some((s, i) => this.online[i] && (s.p.alive || (s.selfRevive && s.down > 0)))) return;
    this.over = true;
    this.emit(EV_SOUND, -2, "over");
  }

  // --- Red -----------------------------------------------------------------------------------
  /** Registra un suceso para todas las pantallas y, si me afecta, lo aplica aquí. */
  private emit(kind: number, ...data: (number | string)[]) {
    const e: Ev = [++this.evSeq, kind, ...data];
    this.events.push({ e, at: this.time });
    // Sonido global (-2): lo oyen todos.
    this.fb.apply(e);
  }

  key(code: string) {
    if (code === "KeyM") this.audio.setMuted(!this.audio.muted);
    if (code === "KeyR" && this.over) this.restart();
    if (code === "KeyN" && this.over) this.phase = "menu";
  }

  private weaponRow(s: Seat): number[] {
    const w = s.weapons;
    const a = w.currentAmmo;
    return [
      weaponIndex(w.slots[0]), weaponIndex(w.slots[1]), weaponIndex(w.slots[2]), w.index, a.mag, a.reserve,
      w.state === "reloading" ? 1 : w.state === "switching" ? 2 : 0, Math.round(w.reloadProgress * 100), w.upgradeMask,
    ];
  }

  /** Cartel de interacción de un jugador para el snapshot (el invitado lo dibuja tal cual). */
  private promptRow(s: Seat, i: number): (number | string)[] | null {
    const p = s.prompt;
    if (!p || !this.online[i]) return null;
    return [p.label, p.cost, p.hold ? 1 : 0, s.points.canAfford(p.cost) ? 1 : 0, this.barricadeFor(p)?.planks ?? -1, p.kind === "info" ? 1 : 0, p.kind === "revive" ? r2(this.seats[Number(p.id)]?.reviveProg ?? 0) : -1];
  }

  private snap(): DzSnap {
    const rm = this.rounds;
    const map = this.stage.map;
    const machines = this.interact.machines();
    return {
      g: "deadzone",
      base: -1,
      seq: this.seq,
      on: this.online.map((o) => (o ? 1 : 0)),
      ak: [...this.acks],
      pl: this.seats.map((s) => [
        r2(s.p.position.x), r2(s.p.position.y), r2(s.p.position.z), r2(s.p.yaw), r2(s.p.pitch), Math.round(s.p.health),
        (s.p.alive ? 1 : 0) | (s.p.crouching ? 2 : 0) | (s.p.sprinting ? 4 : 0) | (s.ads ? 8 : 0),
        weaponIndex(s.weapons.currentId), s.fireSeq, s.reviveSeq, s.kills, s.weapons.currentId && s.weapons.upg[s.weapons.currentId] ? 1 : 0,
      ]),
      pt: this.seats.map((s) => s.points.balance),
      wp: this.seats.map((s) => this.weaponRow(s)),
      zb: this.stage.zombies.list.map((z) => [z.id, ZOMBIE_KINDS.indexOf(z.def.kind), r2(z.position.x), r2(z.position.z), r2(z.yaw), ZOMBIE_STATES.indexOf(z.state)]),
      rd: [rm.round, rm.state === "waiting" ? 0 : rm.state === "intermission" ? 1 : 2, rm.remaining, rm.total, Math.round(rm.timer), rm.special ? 1 : 0],
      dr: map.doors.map((d) => (d.open ? 1 : 0)),
      wn: map.windows.map((w) => w.planks),
      bx: machines.bx,
      pu: machines.pu,
      pr: this.seats.map((q, i) => this.promptRow(q, i)),
      mp: this.mapId,
      st: this.phase === "menu" ? 0 : 1,
      mi: this.menuIndex,
      pk: this.seats.map((q) => q.perks),
      dn: this.seats.map((q) => [r1(q.down), Math.round(q.reviveProg * 100), q.selfRevive ? 1 : 0]),
      pw: this.powers.drops.map((d) => [d.id, POWER_KINDS.indexOf(d.kind), r1(d.x), r1(d.z), r1(d.age)]),
      fx: [r1(this.powers.effects.instaKill), r1(this.powers.effects.doublePoints), r1(this.powers.effects.infiniteAmmo), r1(this.powers.effects.fireSale)],
      dm: this.seats.map((q) => r1(q.deathT)),
      ne: this.events.map((v) => v.e),
      ov: this.over ? [Math.max(1, rm.round), this.seats.reduce((a, s, i) => a + (this.online[i] ? s.points.balance : 0), 0), this.kills] : null,
    };
  }

  frame(): NetFrame {
    this.seq++;
    return { snap: this.snap(), base: null };
  }

  onMessage(index: number, msg: unknown) {
    const m = msg as Partial<DzMsg> | null;
    if (!m || m.t !== "z" || index < 1 || index > 3 || !this.online[index]) return;
    const s = this.seats[index];
    // Posición y mirada: las manda el invitado (dueño de su cuerpo) salvo que aún no sepa que reapareció.
    if (s.p.alive && int(m.rv, -1) === s.reviveSeq) {
      s.p.position.set(num(m.x, s.p.position.x), clamp(num(m.y, 0), 0, 8), num(m.z, s.p.position.z));
      s.p.yaw = num(m.yaw, s.p.yaw);
      s.p.pitch = clamp(num(m.pitch, 0), -1.45, 1.45);
      const fl = int(m.fl, 0);
      s.p.crouching = (fl & F_CROUCH) !== 0;
      s.p.sprinting = (fl & F_SPRINT) !== 0;
      s.ads = (fl & F_ADS) !== 0 && s.weapons.state === "ready";
      s.fireHeld = (fl & F_FIRE) !== 0;
      s.useHeld = (fl & F_USE) !== 0;
    }
    const id = int(m.i, -1);
    if (id <= this.acks[index]) return;
    this.acks[index] = id;
    const action = int(m.ca, 0);
    if (action === 1) {
      s.firePressed = true;
      s.fireHold = TAP_HOLD;
    } else if (action === 2) s.reloadReq = true;
    else if (action === 3) s.usePressed = true;
    else if (action === 4) s.selectReq = clamp(int(m.sl, -1), -1, 2);
    else if (action === 6) s.meleeReq = true;
  }

  onDisconnect(index: number) {
    this.online[index] = false;
    const s = this.seats[index];
    s.fireHeld = s.useHeld = s.firePressed = false;
  }

  // --- Dibujo --------------------------------------------------------------------------------
  private updateView(dt: number) {
    const s = this.seats[0];
    const p = s.p;
    this.ads = damp(this.ads, s.ads ? 1 : 0, 10, dt);
    const move = clamp(Math.hypot(p.velocity.x, p.velocity.z) / PLAYER.sprint, 0, 1);
    this.stage.updateCamera(
      { x: p.position.x, eyeY: p.eyeY, z: p.position.z, yaw: p.yaw, pitch: p.pitch, lean: p.lean, shake: p.shake, sprinting: p.sprinting, ads: this.ads > 0.5, adsFov: s.weapons.currentId ? SIGHTS[s.weapons.currentId].fov : undefined, alive: p.alive, moving: p.alive ? move : 0 },
      dt,
    );
    this.stagePost(dt, p.health, this.fb.damageT, move);
    const wm = s.weapons;
    if (s.deathT > 0) this.stage.view.setWeapon("lmg", true);
    else this.stage.view.setWeapon(wm.currentId, !!wm.currentId && wm.upg[wm.currentId]);
    this.stage.powerDrops.sync(this.powers.drops, this.time);
    this.stage.view.update(dt, {
      moving: clamp(Math.hypot(p.velocity.x, p.velocity.z) / PLAYER.sprint, 0, 1),
      sprinting: p.sprinting,
      ads: this.ads > 0.5,
      reloading: s.weapons.state === "reloading",
      hidden: !p.alive,
    });
    // Los demás jugadores.
    for (let i = 1; i < MAX_PLAYERS; i++) {
      const av = this.stage.avatar(i);
      const q = this.seats[i];
      av.group.visible = this.online[i];
      if (!this.online[i]) continue;
      if (q.deathT > 0) av.setWeapon("lmg", true);
      else av.setWeapon(q.weapons.currentId, !!q.weapons.currentId && q.weapons.upg[q.weapons.currentId]);
      av.set(dt, q.p.position.x, q.p.position.y, q.p.position.z, q.p.yaw, q.p.pitch, q.p.crouching, q.p.alive);
    }
  }

  /** Pasa al postproceso cómo va el jugador: daño reciente, poca vida, apuntando y corriendo. */
  private stagePost(dt: number, health: number, damageT: number, move: number) {
    const post = this.stage.post;
    post.damage = Math.max(0, 1 - damageT / 0.55);
    post.low = clamp(1 - health / 55, 0, 1);
    post.ads = damp(post.ads, this.ads > 0.5 ? 1 : 0, 8, dt);
    post.sprint = damp(post.sprint, move > 0.8 ? 1 : 0, 6, dt);
  }

  private hudView(): DzHudView {
    const s = this.seats[0];
    const w = s.weapons;
    const a = w.currentAmmo;
    const rm = this.rounds;
    return {
      health: s.p.health,
      maxHealth: s.p.maxHealth,
      points: s.points.balance,
      round: Math.max(1, rm.round),
      remaining: rm.state === "waiting" ? 0 : rm.remaining,
      roundState: rm.state === "waiting" ? 0 : rm.state === "intermission" ? 1 : 2,
      special: rm.special,
      weaponName: w.current ? w.current.name : "SIN ARMA",
      upgraded: !!w.currentId && w.upg[w.currentId],
      slotUpg: w.slots.map((id) => !!id && w.upg[id]),
      power: this.stage.map.power.on,
      slots: w.slots.map((id) => (id ? w.def(id).name.split(" ")[0].replace("«", "") : null)),
      activeSlot: w.index,
      mag: a.mag,
      reserve: a.reserve,
      reload: w.state === "reloading" ? w.reloadProgress : -1,
      prompt: this.prompt ? { label: this.prompt.label, cost: this.prompt.cost, hold: !!this.prompt.hold, info: this.prompt.kind === "info", rv: this.prompt.kind === "revive" ? this.seats[Number(this.prompt.id)]?.reviveProg ?? 0 : undefined } : null,
      affordable: this.prompt ? s.points.canAfford(this.prompt.cost) : true,
      barricade: this.barricadeFor(this.prompt),
      toasts: this.fb.toasts,
      banner: this.fb.banner,
      hitT: this.fb.hitT,
      hitHead: this.fb.hitHead,
      damageT: this.fb.damageT,
      ads: this.ads > 0.5,
      fx: [this.powers.effects.instaKill, this.powers.effects.doublePoints, this.powers.effects.infiniteAmmo, this.powers.effects.fireSale, s.deathT],
      powerMsg: this.fb.power,
      nukeT: this.fb.nukeT,
      scope: this.stage.view.scopeK,
      menu: this.phase === "menu" ? { index: this.menuIndex, host: true } : null,
      perks: s.perks,
      down: !s.p.alive && s.down > 0 ? { t: s.down, prog: s.reviveProg, self: s.selfRevive } : null,
      noAmmo: w.outOfAmmo,
      team: this.seats
        .map((q, i) => ({ q, i }))
        .filter(({ i }) => this.online[i])
        .map(({ q, i }) => ({ name: PLAYER_NAMES[i] ?? `J${i + 1}`, color: PLAYER_COLORS[i] ?? PLAYER_COLORS[0], health: q.p.health, alive: q.p.alive, points: q.points.balance, me: i === 0 })),
      alive: s.p.alive,
      over: this.over ? { round: Math.max(1, rm.round), points: this.seats.reduce((x, q, i) => x + (this.online[i] ? q.points.balance : 0), 0), kills: this.kills } : null,
      netLabel: this.netLabel,
      look: lookMode(),
      isHost: true,
      ready: true,
      time: this.time,
    };
  }

  private barricadeFor(p: Prompt | null): { planks: number; max: number } | null {
    if (!p || p.kind !== "window") return null;
    const w = this.stage.map.windows.find((x) => x.id === p.id);
    return w ? { planks: w.planks, max: MAX_PLANKS } : null;
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    if (!this.stage.render(ctx, pixelScale)) {
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, VW, VH);
    }
    drawNames(
      ctx,
      this.stage,
      this.seats
        .map((q, i) => ({ q, i }))
        .filter(({ q, i }) => i > 0 && this.online[i] && q.p.alive !== undefined)
        .map(({ q, i }) => ({ name: PLAYER_NAMES[i] ?? `J${i + 1}`, x: q.p.position.x, y: q.p.position.y, z: q.p.position.z, alive: q.p.alive, color: PLAYER_COLORS[i] ?? PLAYER_COLORS[0] })),
    );
    drawHud(ctx, this.hudView());
  }

  dispose() {
    this.stage.dispose();
  }
}

// --- Invitado -------------------------------------------------------------------------------------
/** Invitado: mueve su cuerpo y su mirada, avisa de lo que hace y dibuja lo que manda el anfitrión. */
export class DeadZoneGuest implements GuestGame {
  readonly id = "deadzone" as const;
  readonly size = [VW, VH] as const;
  readonly baseSeq = -1;
  netLabel = "";
  private state: DzSnap | null = null;
  private stage = new DzStage(false);
  private mapId: MapId = "sector09";
  private readonly audio = new AudioSystem();
  private readonly player = new Player();
  private readonly fb: Feedback;
  private pending: DzMsg | null = null;
  private actionId = 0;
  private seq = 0;
  private lastSentAt = -1e9;
  private time = 0;
  private lastEvSeq = -1;
  private lastFire = [0, 0, 0, 0];
  private lastRevive = -1;
  private ads = 0;
  private flashOn = false;
  private lastFlags = -1;
  private fireInit = false;

  constructor(private index: number, private input: Input) {
    this.fb = new Feedback(this.audio, this.stage, () => this.index, () => this.player.position, () => (this.player.shake = Math.min(1, this.player.shake + 0.4)));
    this.player.reset(this.stage.def.playerSpawn.x + (index - 1.5) * 1.3, this.stage.def.playerSpawn.z, this.stage.def.playerSpawn.yaw);
    this.stage.onThunder = (delay) => setTimeout(() => this.audio.thunder(), delay * 1000);
  }

  get ready() {
    return this.state !== null;
  }

  onBase() {}

  /** El anfitrión cambió de mapa: se construye la misma escena aquí. */
  private loadMap(id: MapId) {
    this.stage.dispose();
    this.stage = new DzStage(false, id);
    this.mapId = id;
    this.fb.setStage(this.stage);
    this.stage.onThunder = (delay) => setTimeout(() => this.audio.thunder(), delay * 1000);
    const sp = this.stage.def.playerSpawn;
    this.player.reset(sp.x + (this.index - 1.5) * 1.3, sp.z, sp.yaw);
    this.lastFire = [0, 0, 0, 0];
    this.fireInit = false;
  }

  onSnap(snap: unknown) {
    const s = snap as DzSnap;
    if (s.mp && s.mp !== this.mapId && (MAP_IDS as string[]).includes(s.mp)) this.loadMap(s.mp as MapId);
    this.state = s;
    if (this.pending && (s.ak[this.index] ?? 0) >= this.pending.i) this.pending = null;
    const mine = s.pl[this.index];
    if (!mine) return;
    // Sucesos nuevos (cada uno una sola vez).
    const news = s.ne ?? [];
    if (this.lastEvSeq < 0) this.lastEvSeq = news.reduce((m, e) => Math.max(m, Number(e[0])), 0);
    for (const e of news) {
      if (Number(e[0]) <= this.lastEvSeq) continue;
      this.lastEvSeq = Number(e[0]);
      this.fb.apply(e);
    }
    const p = this.player;
    p.health = mine[5];
    // Reaparición: el anfitrión me coloca en la salida.
    if (mine[9] !== this.lastRevive) {
      if (this.lastRevive >= 0) {
        p.reset(this.stage.def.playerSpawn.x + (this.index - 1.5) * 1.3, this.stage.def.playerSpawn.z, this.stage.def.playerSpawn.yaw);
        p.health = mine[5];
      }
      this.lastRevive = mine[9];
    }
  }

  // --- Bucle ---------------------------------------------------------------------------------
  update(dtRaw: number) {
    const dt = Math.min(0.05, dtRaw);
    this.time += dt;
    this.input.poll();
    if (this.input.takeGesture()) this.audio.unlock();
    this.fb.tick(dt);
    const s = this.state;
    const p = this.player;
    if (!s) return;
    if (s.st === 0) {
      // El anfitrión aún elige el mapa: solo se ve el selector.
      this.input.clear();
      this.stage.update(dt);
      return;
    }
    const mine = s.pl[this.index];
    const wp = s.wp[this.index];
    const alive = !!mine && (mine[6] & 1) !== 0 && !s.ov;
    const colliders = this.stage.map.colliders;

    const look = this.input.consumeLook();
    if (alive) p.look(look.x, look.y, this.input.sensitivity);
    if (!s.ov) p.update(dt, this.input, colliders);
    p.onStep = (running) => this.audio.step(running);
    const ready = !!wp && wp[6] === 0;
    this.ads = damp(this.ads, alive && this.input.mouseRight && ready ? 1 : 0, 10, dt);
    // Teclas: cada una es una acción para el anfitrión.
    const wanted = this.input.take("Digit1") ? 0 : this.input.take("Digit2") ? 1 : this.input.take("Digit3") ? 2 : -1;
    if (alive && wanted >= 0) this.send(4, wanted);
    if (this.input.take("KeyR") && alive) this.send(2);
    if (this.input.take("KeyF")) {
      this.flashOn = !this.flashOn;
      this.stage.setFlashlight(this.flashOn);
      this.audio.swap();
    }
    if (this.input.take("KeyE") && alive) this.send(3);
    if (this.input.take("KeyV") && alive) this.send(6);
    if (this.input.takeClick() && alive) this.send(1);
    this.input.clear();

    // Zombis, puertas, ventanas y caja según el anfitrión.
    this.stage.zombies.sync(dt, s.zb, colliders, s.rd[0]);
    s.dr.forEach((open, k) => {
      const d = this.stage.map.doors[k];
      if (!d) return;
      d.open = open === 1;
      d.collider.enabled = !d.open;
    });
    s.wn.forEach((planks, k) => {
      const w = this.stage.map.windows[k];
      if (!w || w.planks === planks) return;
      w.planks = planks;
      w.rig.set(planks);
      // Los tablones también cierran el hueco aquí: si el anfitrión los rompe, deja de frenar.
      w.barricade.enabled = planks > 0;
    });
    applyMachineState(this.stage.map, s.bx, s.pu);
    this.stage.powerDrops.sync((s.pw ?? []).map((r) => ({ id: r[0], kind: POWER_KINDS[r[1]] ?? "maxAmmo", x: r[2], z: r[3], age: r[4] })), this.time);
    this.stage.map.update(dt, this.time);

    // Disparos: el contador de cada jugador sube cada vez que dispara (fogonazo, trazadora y sonido).
    s.pl.forEach((row, i) => {
      if (s.on[i] !== 1) return;
      if (this.fireInit && row[8] !== this.lastFire[i]) this.onShot(i, row);
      this.lastFire[i] = row[8];
    });
    this.fireInit = true;

    // Arma y cámara.
    const wid = weaponAt(wp?.[wp[3]] ?? -1);
    const wupg = !!wp && ((wp[8] ?? 0) & (1 << wp[3])) !== 0;
    if ((s.dm?.[this.index] ?? 0) > 0) this.stage.view.setWeapon("lmg", true);
    else this.stage.view.setWeapon(wid, wupg);
    const move = clamp(Math.hypot(p.velocity.x, p.velocity.z) / PLAYER.sprint, 0, 1);
    this.stage.updateCamera(
      { x: p.position.x, eyeY: p.eyeY, z: p.position.z, yaw: p.yaw, pitch: p.pitch, lean: p.lean, shake: p.shake, sprinting: p.sprinting, ads: this.ads > 0.5, adsFov: wid ? SIGHTS[wid].fov : undefined, alive, moving: alive ? move : 0 },
      dt,
    );
    const post = this.stage.post;
    post.damage = Math.max(0, 1 - this.fb.damageT / 0.55);
    post.low = clamp(1 - p.health / 55, 0, 1);
    post.ads = damp(post.ads, this.ads > 0.5 ? 1 : 0, 8, dt);
    post.sprint = damp(post.sprint, move > 0.8 ? 1 : 0, 6, dt);
    this.stage.update(dt);
    this.stage.view.update(dt, {
      moving: move,
      sprinting: p.sprinting,
      ads: this.ads > 0.5,
      reloading: !!wp && wp[6] === 1,
      hidden: !alive,
    });
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const av = this.stage.avatar(i);
      const row = s.pl[i];
      av.group.visible = i !== this.index && s.on[i] === 1 && !!row;
      if (av.group.visible) {
        if ((s.dm?.[i] ?? 0) > 0) av.setWeapon("lmg", true);
        else av.setWeapon(weaponAt(row[7]), row[11] === 1);
        av.set(dt, row[0], row[1], row[2], row[3], row[4], (row[6] & 2) !== 0, (row[6] & 1) !== 0);
      }
    }
  }

  /** Un jugador acaba de disparar: fogonazo, trazadora e impacto contra la pared, casquillo, humo y sonido. */
  private onShot(i: number, row: number[]) {
    const wid = weaponAt(row[7]);
    if (!wid) return;
    const upg = row[11] === 1;
    const def = weaponDef(wid, upg);
    const mine = i === this.index;
    let eye: THREE.Vector3;
    let dir: THREE.Vector3;
    const muzzle = new THREE.Vector3();
    if (mine) {
      // Lo mío: con la cámara y el arma en primera persona.
      this.audio.shot(wid, upg);
      this.stage.view.kick(def);
      this.stage.camera.updateMatrixWorld(true);
      eye = this.stage.camera.getWorldPosition(new THREE.Vector3());
      dir = this.stage.camera.getWorldDirection(new THREE.Vector3());
      this.stage.view.worldMuzzle(muzzle);
      const right = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
      this.stage.effects.casing(this.stage.view.worldEject(), right, wid === "shotgun");
    } else {
      this.stage.avatar(i).fire();
      eye = new THREE.Vector3(row[0], row[1] + 1.55, row[2]);
      dir = lookDir(row[3], row[4]);
      this.stage.avatar(i).muzzleWorld(muzzle);
      const right = new THREE.Vector3(Math.cos(row[3]), 0, -Math.sin(row[3]));
      this.stage.effects.casing(muzzle, right, wid === "shotgun");
      if (dist2D(row[0], row[2], this.player.position.x, this.player.position.z) < 40) this.audio.shot(wid, upg);
    }
    const wall = raycastWorld(eye, dir, def.range, this.stage.map.colliders, SHOOT_THROUGH);
    const end = wall ? new THREE.Vector3(wall.point.x, wall.point.y, wall.point.z) : eye.clone().addScaledVector(dir, 60);
    this.stage.effects.tracer(muzzle, end, def.tint, def.damage > 120 ? 0.04 : 0.022);
    this.stage.effects.muzzleSmoke(muzzle, dir, wid === "shotgun" ? 4 : 2);
    if (wall) this.stage.effects.impact(end, new THREE.Vector3(wall.normal.x, wall.normal.y, wall.normal.z), wall.collider.tag === "door");
  }

  // --- Red -----------------------------------------------------------------------------------
  private flags(): number {
    const p = this.player;
    return (p.crouching ? F_CROUCH : 0) | (p.sprinting ? F_SPRINT : 0) | (this.input.mouseRight ? F_ADS : 0) | (this.input.mouseLeft ? F_FIRE : 0) | (this.input.isDown("KeyE") ? F_USE : 0);
  }

  private body(): Omit<DzMsg, "i" | "s" | "ca" | "sl"> {
    const p = this.player;
    return { t: "z", x: r2(p.position.x), y: r2(p.position.y), z: r2(p.position.z), yaw: r2(p.yaw), pitch: r2(p.pitch), fl: this.flags(), rv: this.lastRevive };
  }

  private send(action: number, slot = 0) {
    this.pending = { ...this.body(), i: ++this.actionId, s: 0, ca: action, sl: slot };
  }

  outgoing(_transport: Transport): object | undefined {
    if (!this.state) return undefined;
    const now = performance.now();
    const flags = this.flags();
    // Con algo pendiente (un clic, recargar…) se manda ya; si no, al ritmo del latido o cuando cambia un botón.
    const every = this.pending || flags !== this.lastFlags ? 0 : POS_MS;
    if (now - this.lastSentAt < every) return undefined;
    this.lastSentAt = now;
    this.lastFlags = flags;
    const msg: DzMsg = this.pending ?? { ...this.body(), i: this.actionId, s: 0 };
    return { ...msg, s: ++this.seq };
  }

  // --- Dibujo --------------------------------------------------------------------------------
  private hudView(): DzHudView {
    const s = this.state!;
    const mine = s.pl[this.index];
    const wp = s.wp[this.index] ?? [-1, -1, -1, 0, 0, 0, 0, 0];
    const wid = weaponAt(wp[wp[3]] ?? -1);
    const alive = !!mine && (mine[6] & 1) !== 0;
    const rd = s.rd;
    const pr = s.pr?.[this.index] ?? null;
    return {
      health: mine?.[5] ?? 0,
      maxHealth: maxHealthFor(s.pk?.[this.index] ?? 0),
      points: s.pt[this.index] ?? 0,
      round: Math.max(1, rd[0]),
      remaining: rd[1] === 0 ? 0 : rd[2],
      roundState: rd[1],
      special: rd[5] === 1,
      weaponName: wid ? weaponDef(wid, ((wp[8] ?? 0) & (1 << wp[3])) !== 0).name : "SIN ARMA",
      upgraded: ((wp[8] ?? 0) & (1 << wp[3])) !== 0 && !!wid,
      slotUpg: [0, 1, 2].map((k) => ((wp[8] ?? 0) & (1 << k)) !== 0),
      power: s.pu?.[0] === 1,
      slots: [wp[0], wp[1], wp[2]].map((k, ix) => { const id = weaponAt(k); return id ? weaponDef(id, ((wp[8] ?? 0) & (1 << ix)) !== 0).name.split(" ")[0].replace("«", "") : null; }),
      activeSlot: wp[3],
      mag: wp[4],
      reserve: wp[5],
      reload: wp[6] === 1 ? wp[7] / 100 : -1,
      prompt: pr ? { label: String(pr[0]), cost: Number(pr[1]), hold: pr[2] === 1, info: pr[5] === 1, rv: Number(pr[6] ?? -1) >= 0 ? Number(pr[6]) : undefined } : null,
      affordable: pr ? pr[3] === 1 : true,
      barricade: pr && Number(pr[4]) >= 0 ? { planks: Number(pr[4]), max: MAX_PLANKS } : null,
      toasts: this.fb.toasts,
      banner: this.fb.banner,
      hitT: this.fb.hitT,
      hitHead: this.fb.hitHead,
      damageT: this.fb.damageT,
      ads: this.ads > 0.5,
      fx: [...(s.fx ?? [0, 0, 0, 0]), s.dm?.[this.index] ?? 0],
      powerMsg: this.fb.power,
      nukeT: this.fb.nukeT,
      scope: this.stage.view.scopeK,
      menu: s.st === 0 ? { index: s.mi ?? 0, host: false } : null,
      perks: s.pk?.[this.index] ?? 0,
      down: (s.dn?.[this.index]?.[0] ?? 0) > 0 && !alive ? { t: s.dn![this.index][0], prog: (s.dn![this.index][1] ?? 0) / 100, self: s.dn![this.index][2] === 1 } : null,
      noAmmo: wp[4] <= 0 && wp[5] <= 0,
      team: s.pl
        .map((row, i) => ({ row, i }))
        .filter(({ i }) => s.on[i] === 1)
        .map(({ row, i }) => ({ name: PLAYER_NAMES[i] ?? `J${i + 1}`, color: PLAYER_COLORS[i] ?? PLAYER_COLORS[0], health: row[5], alive: (row[6] & 1) !== 0, points: s.pt[i] ?? 0, me: i === this.index })),
      alive: alive && !s.ov,
      over: s.ov ? { round: s.ov[0], points: s.ov[1], kills: s.ov[2] } : null,
      netLabel: this.netLabel,
      look: lookMode(),
      isHost: false,
      ready: true,
      time: this.time,
    };
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const s = this.state;
    if (!s) {
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, VW, VH);
      drawHud(ctx, { ready: false } as unknown as DzHudView);
      return;
    }
    if (!this.stage.render(ctx, pixelScale)) {
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, VW, VH);
    }
    drawNames(
      ctx,
      this.stage,
      s.pl
        .map((row, i) => ({ row, i }))
        .filter(({ i }) => i !== this.index && s.on[i] === 1)
        .map(({ row, i }) => ({ name: PLAYER_NAMES[i] ?? `J${i + 1}`, x: row[0], y: row[1], z: row[2], alive: (row[6] & 1) !== 0, color: PLAYER_COLORS[i] ?? PLAYER_COLORS[0] })),
    );
    drawHud(ctx, this.hudView());
  }

  dispose() {
    this.stage.dispose();
  }
}

