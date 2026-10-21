// Casino entre amigos en el hub: un salón 3D por el que se anda hasta las mesas. El anfitrión lleva las
// cinco mesas (y tira los dados); cada jugador mueve su muñeco en su pantalla y manda dónde está y qué
// apuesta. Los invitados dibujan el estado que reciben.
import { fitText, shadowText } from "../core/draw";
import type { Transport } from "../net/protocol";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import {
  LITTER_ARC, LITTER_DROP, LITTER_NPC_STUN, LITTER_REACH, LITTER_RESPAWN, LITTER_STUN,
  DISGUISE_COST, DISGUISE_TIME, DISGUISES, DISTRACT_FLOOR, DISTRACT_STEP, EMOTE_BUBBLES, EMOTE_TIME, EMOTES, GUARD_RUN_BONUS_MAX,
  GUARD_RUN_STEP, GUARDS_MAX, GUARDS_START, NPC_OFF,
  AIR_SAFE, BANANA_LIFE, BANANA_MAX, BANANA_R, BAT_CD, BREAK_TIME, HIDE_MAX, HIDE_SEEN, TRIP_CD, TRIP_DROP, TRIP_FOOT,
  TRIP_NPC_STUN, TRIP_R, TRIP_STUN, TRIP_WINDOW, VAULT_CD, VAULT_DECAY, VAULT_LOOT, VAULT_TIME, BODY_R, BUMP, CH, CW, DROP_LIFE, DROP_MAX, EVENT_TIME, GRAB_CD, GRAB_HOLD,
  GRAB_REACH, GRAB_STEAL, HIT_ARC, HIT_REACH, HIT_STUN, HOT_BOOST, HOT_TIME, ITEM_BANANA, ITEM_COST, ITEM_DICE, ITEM_MAGNET,
  ITEM_NAMES, ITEM_NONE, JAIL_PICK, JAIL_TIME, KNOCK, MAGNET_PICK, MAGNET_R, MAGNET_TIME, MOUSE_PITCH, MOUSE_TURN,
  NPC_CHASE, NPC_DISTRACTED, NPC_IDLE, PICK_REACH, PITCH_MAX, QUOTA_BONUS, QUOTA_GROWTH, QUOTA_PER_PLAYER, REACH, RESCUE,
  ROB_MAX, ROB_REACH, ROB_SPEED, ROB_ZONE, SHIFT_TIME, SLIP_DROP, SLIP_STUN, SLOT_BAT, SLOT_COINS, SLOT_HAND, SLOT_ITEM,
  START_CHIPS, STEAL_MAX, TABLE_ROB_CD, TABLE_ROB_MAX, TABLE_ROB_MIN, TABLE_ROB_REACH,
} from "./config";
import { drawHud, type HudView } from "./hud";
import { lookMode, type CasinoInput } from "./input";
import { goHome, isGuard, makeNpcs, npcInFront, resetNpc, sees, setGuardsOn, snapNpc, startChase, tickNpc } from "./npc";
import { bodyColliders, jump, Stamina, stairStep, stepJump, stepPlayer, type Body3 } from "./player3d";
import { CasinoStage } from "./scene";
import { GAME_TITLE, SPOTS, Table, type CasinoSnap, type TableSnap } from "./table";
import {
  BATH, BATH_DOORS, clampToHall, clampToJail, COLLIDERS, JAIL, JAIL_LEVER, JAIL_SPOT, JAIL_TRASH, nearBath,
  LITTER, nearLitter, nearMannequin, nearShop, nearStairFoot, nearSwitch, nearTable, onVaultPad, seatSpot, SPAWNS, standSpot,
  TABLES, UPPER_Y,
  zoneAt, type Level,
} from "./world3d";

/** Lo que manda un invitado cada poco: dónde está y qué apuesta. */
export interface CasinoMsg {
  t: "c";
  /** Número de acción (crece con cada cambio de apuesta o golpe). */
  i: number;
  /** Número de mensaje (latido). */
  s: number;
  x: number;
  z: number;
  yaw: number;
  /** Mesa en la que está sentado (-1 = andando). */
  tb: number;
  /** Casilla, fichas y listo (1/0). */
  sp: number;
  am: number;
  lk: number;
  /** Acción (golpe, robo, compra…): ver `onMessage` para la lista (0 o ausente = nada). */
  ca?: number;
  /** Altura del salto (m): el invitado es dueño de su cuerpo y los demás le ven saltar. */
  jy?: number;
  /** Piso en el que está (0 planta baja, 1 entrepiso): las escaleras las sube él. */
  lv?: number;
}

/** Estado de pelea de un jugador en el anfitrión. */
interface Fight {
  /** Segundos que le quedan aturdido (golpe o agarrado). */
  stun: number;
  /** Quién le tiene agarrado (-1 = nadie). */
  grabBy: number;
  /** A quién tiene agarrado (-1 = a nadie). */
  grabTarget: number;
  /** Segundos del golpe en curso (para animar el brazo). */
  swing: number;
  /** Recargas. */
  batCd: number;
  grabCd: number;
  /** Acumulador para ir sacándole monedas mientras le agarra. */
  stealT: number;
}

/** Moneda caída en el suelo (la simula el anfitrión; la recoge quien pasa por encima). */
interface Drop {
  x: number;
  z: number;
  vx: number;
  vz: number;
  t: number;
  /** Quien la soltó: no puede recogerla hasta que pase `lock` (si no, se la queda al instante). */
  owner: number;
  lock: number;
  /** Piso en el que cayó. */
  lv: Level;
}

/** Cáscara de banana en el suelo (quien la pisa se resbala y suelta monedas). */
interface Banana {
  x: number;
  z: number;
  t: number;
  /** Quien la tiró: no se resbala con ella hasta que pase `lock`. */
  owner: number;
  lock: number;
  /** Piso en el que está. */
  lv: Level;
}

/** Cada cuánto se manda la posición. */
const POS_MS = 110;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const int = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : def);
const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);

/** Nombre sobre la cabeza de cada jugador (lo usan anfitrión e invitado). */
function drawNames(ctx: CanvasRenderingContext2D, stage: CasinoStage, s: CasinoSnap, me: number) {
  for (let i = 0; i < 4; i++) {
    if (i === me || s.on[i] !== 1) continue;
    const p = s.pl[i];
    if (!p) continue;
    // Los presos llevan el nombre a la altura de la jaula, con lo que les queda de condena.
    const jailed = s.ja?.[i] ?? 0;
    const at = stage.project(p[0], (jailed > 0 ? JAIL.y : (p[5] ?? 0) * UPPER_Y + (p[4] ?? 0)) + 2.4, p[1]);
    if (!at || at[2] > 30) continue;
    // Emote: bocadillo encima del nombre.
    const em = s.em?.[i] ?? 0;
    if (em > 0) shadowText(ctx, EMOTE_BUBBLES[em - 1] ?? "", at[0], at[1] - 8, [255, 214, 120], "6px", "center");
    const label = jailed > 0 ? `J${i + 1} · PRESO ${Math.ceil(jailed)}s` : `J${i + 1} · ${s.ch[i]}`;
    shadowText(ctx, fitText(ctx, label, 70, "5px"), at[0], at[1], jailed > 0 ? [255, 120, 120] : [235, 235, 245], "5px", "center");
  }
  // NPC: «zZ» sobre el crupier distraído (se le puede robar la mesa) y «!» sobre quien persigue a alguien.
  (s.np ?? []).forEach((n, k) => {
    const chasing = n[3] === NPC_CHASE;
    if (!chasing && n[3] !== NPC_DISTRACTED) return;
    const at = stage.project(n[0], (n[6] ?? 0) * UPPER_Y + (isGuard(k) ? 2.45 : 2.7), n[1]);
    if (!at || at[2] > 26) return;
    if (chasing) shadowText(ctx, "!", at[0], at[1] - 4, [255, 86, 96], "8px", "center");
    else shadowText(ctx, "zZ", at[0], at[1] + Math.sin(performance.now() / 300) * 1.5, [255, 214, 120], "6px", "center");
  });
}

/** NPC que me persigue ahora mismo (o -1). */
function chaserOf(s: CasinoSnap, me: number): number {
  return (s.np ?? []).findIndex((n) => n[3] === NPC_CHASE && n[4] === me);
}

/** Anfitrión (o partida local): dueño de las mesas y del bolsillo de todos. */
export class CasinoHost implements HostGame {
  readonly size = [CW, CH] as const;
  netLabel = "";
  /** No hay final: se sale con Esc o se cambia de juego con J. */
  readonly finished = true;
  readonly tables = TABLES.map((t) => new Table(t.kind));
  readonly chips = Array.from({ length: 4 }, () => START_CHIPS);
  readonly bodies: Body3[];
  /** Mesa de cada jugador (-1 = andando). */
  readonly seated = [-1, -1, -1, -1];
  readonly online = [true, false, false, false];
  private readonly acks = [0, 0, 0, 0];
  private stage: CasinoStage | null = null;
  private seq = 0;
  private time = 0;
  private dt = 0;
  /** Ranura elegida de la barra (0 monedas, 1 mano, 2 bate). */
  slot = SLOT_COINS;
  /** Pelea de cada jugador (aturdimiento, agarre, golpe y recargas). */
  private readonly fight: Fight[] = Array.from({ length: 4 }, () => ({
    stun: 0, grabBy: -1, grabTarget: -1, swing: 0, batCd: 0, grabCd: 0, stealT: 0,
  }));
  /** Monedas en el suelo (las tira un golpe y las recoge quien pasa por encima). */
  private readonly drops: Drop[] = [];
  /** Aviso del momento (se dibuja en el HUD y se apaga solo). */
  private notice = "";
  private noticeT = 0;
  /** Condena en la cárcel del techo (segundos; 0 = libre). */
  readonly jail = [0, 0, 0, 0];
  /** Basura que llevo en la mano dentro de la celda (-1 = ninguna). */
  private trashTaken = -1;
  /** Minijuego del robo en curso (solo el jugador local). */
  private rob: { target: number; cursor: number; dir: number; zone: number } | null = null;
  /** Turno en curso, segundos que le quedan y récord de turnos superados. */
  private shift = 1;
  private shiftT = SHIFT_TIME;
  private best = 0;
  /** Cartel de fin de turno (1 cumplida, 2 fallada) y sus segundos. */
  private event = 0;
  private eventT = 0;
  /** Mesa caliente y segundos que le quedan. */
  private hot = 0;
  private hotT = HOT_TIME;
  /** Trucos: objeto en la mano, segundos de imán y dado cargado de cada jugador. */
  readonly items = [ITEM_NONE, ITEM_NONE, ITEM_NONE, ITEM_NONE];
  private readonly magnet = [0, 0, 0, 0];
  private readonly luck = [0, 0, 0, 0];
  private readonly bananas: Banana[] = [];
  /** Crupieres (uno por mesa, en el orden de TABLES) y el guardia al final. */
  readonly npcs = makeNpcs();
  /** Recarga del robo a la mesa de cada jugador. */
  private readonly tableRobCd = [0, 0, 0, 0];
  /** Fuga: segundos que lleva cada jugador forzando la caja de la jaula (0 = no la está forzando). */
  readonly breakT = [0, 0, 0, 0];
  /** Aguante para correr del jugador local y si está corriendo este fotograma. */
  private readonly stamina = new Stamina();
  private running = false;
  /** Zancadilla: segundos con el pie fuera y recarga de cada jugador. */
  private readonly tripT = [0, 0, 0, 0];
  private readonly tripCd = [0, 0, 0, 0];
  /** Baño: segundos que le quedan escondido (0 = fuera) y en qué cabina está. */
  readonly hidden = [0, 0, 0, 0];
  private readonly hideDoor = [0, 0, 0, 0];
  /** Basura: segundos hasta que vuelve cada una a su sitio (0 = en el suelo) y la que lleva cada jugador. */
  private readonly litterT = LITTER.map(() => 0);
  private readonly carry = [-1, -1, -1, -1];
  /** Disfraz de cada jugador (índice en DISGUISES + 1; 0 = ninguno) y segundos que le quedan. */
  private readonly disguise = [0, 0, 0, 0];
  private readonly disguiseT = [0, 0, 0, 0];
  /** Emote en curso de cada jugador (índice en EMOTES + 1; 0 = ninguno) y segundos que le quedan. */
  private readonly emote = [0, 0, 0, 0];
  private readonly emoteT = [0, 0, 0, 0];
  /** Bóveda: segundos acumulados con los dos paneles ocupados, recarga y quién pisa cada panel. */
  private vaultP = 0;
  private vaultCd = 0;
  private readonly vaultOn = [-1, -1];

  constructor(private input: CasinoInput, remoteCount: number, readonly mode: "local" | "host") {
    this.bodies = SPAWNS.map(([x, z], i) => ({ x, z, yaw: 0, stride: i * 0.7 }));
    for (let i = 1; i <= Math.min(3, remoteCount); i++) this.online[i] = true;
    this.pickHot(true);
  }

  // --- Entrada ---------------------------------------------------------------------------
  update(dt: number) {
    this.time += dt;
    this.dt = dt;
    this.noticeT = Math.max(0, this.noticeT - dt);
    this.tickFight(dt);
    this.tickJail(dt);
    this.input.poll();
    const slot = this.input.takeSlot();
    if (slot >= 0) this.slot = slot;
    if (this.hidden[0] > 0) this.hiddenInput(dt);
    else if (this.jail[0] > 0) this.jailInput(dt);
    else if (this.seated[0] >= 0) this.seatedInput();
    else this.walkInput(dt);
    // En la celda o sentado no se corre: se recupera el aliento (en el baño, el doble de rápido).
    if (this.jail[0] > 0 || this.seated[0] >= 0) this.running = this.stamina.step(false, false, dt);
    if (this.hidden[0] > 0) this.running = this.stamina.step(false, false, dt * 2);
    // En la escalera la altura es la del peldaño, no la del salto.
    if ((this.bodies[0].st ?? -1) < 0) stepJump(this.bodies[0], dt);
    this.tickDifficulty();
    this.tickLooks(dt);
    this.tickRob(dt);
    for (const t of this.tables) t.update(dt, this.chips, this.luck);
    for (let i = 0; i < 4; i++) this.magnet[i] = Math.max(0, this.magnet[i] - dt);
    this.tickDrops(dt);
    this.tickBananas(dt);
    this.tickBumps();
    this.tickHot(dt);
    // La zancadilla antes que los NPC: si en el mismo fotograma le tiras y te alcanzaría, gana el pie.
    this.tickTrips(dt);
    this.tickNpcs(dt);
    this.tickBreak(dt);
    this.tickHide(dt);
    this.tickVault(dt);
    this.tickShift(dt);
  }

  /** Fuera del salón (en la jaula o escondido en el baño): ni le ven, ni le pegan, ni choca. */
  private away(i: number): boolean {
    // Subiendo una escalera (o muy alto) tampoco: no se le alcanza desde el suelo.
    // En lo alto de una escalera (o de un salto) tampoco: no se le alcanza desde el suelo.
    return this.jail[i] > 0 || this.hidden[i] > 0 || (this.bodies[i].y ?? 0) > 1.5;
  }

  /** Piso del jugador `i`. */
  private lvOf(i: number): Level {
    return this.bodies[i].lv ?? 0;
  }

  // --- Dificultad por turno ----------------------------------------------------------------
  /** Más turno, más guardias de servicio, más rápidos, y crupieres que se distraen menos rato. */
  private tickDifficulty() {
    const step = this.shift - 1;
    setGuardsOn(this.npcs, Math.min(GUARDS_MAX, GUARDS_START + step));
    for (const n of this.npcs) {
      n.boost = Math.min(GUARD_RUN_BONUS_MAX, GUARD_RUN_STEP * step);
      n.focus = Math.max(DISTRACT_FLOOR, 1 - DISTRACT_STEP * step);
    }
  }

  // --- Disfraces y emotes ------------------------------------------------------------------
  /** Cuenta atrás de disfraces y emotes. */
  private tickLooks(dt: number) {
    for (let k = 0; k < this.litterT.length; k++) this.litterT[k] = Math.max(0, this.litterT[k] - dt);
    for (let i = 0; i < 4; i++) {
      if (!this.online[i] || this.away(i)) this.dropLitter(i);
      if (this.emoteT[i] > 0) {
        this.emoteT[i] = Math.max(0, this.emoteT[i] - dt);
        if (this.emoteT[i] === 0) this.emote[i] = 0;
      }
      if (this.disguiseT[i] > 0) {
        this.disguiseT[i] = Math.max(0, this.disguiseT[i] - dt);
        if (this.disguiseT[i] === 0) {
          this.disguise[i] = 0;
          if (i === 0) this.say("SE ACABÓ EL DISFRAZ");
        }
      }
    }
  }

  /** Corta el emote en curso (al moverse o saltar). */
  private stopEmote(player: number) {
    this.emote[player] = 0;
    this.emoteT[player] = 0;
  }

  /** Emote (1–4): dura unos segundos; sentado, preso o escondido no se puede. */
  private startEmote(player: number, e: number) {
    if (e < 1 || e > EMOTES.length || this.seated[player] >= 0 || this.away(player)) return;
    this.emote[player] = e;
    this.emoteT[player] = EMOTE_TIME;
  }

  /**
   * Boutique: ponerse el disfraz del maniquí `k`. Mientras dura, el primer delito que vea un guardia no
   * le delata (solo se le cae el disfraz) y, al ponérselo, le pierde quien le persiga lejos (> 3 m).
   */
  private buyDisguise(player: number, k: number) {
    if (k < 0 || this.seated[player] >= 0 || this.away(player)) return;
    if (this.chips[player] < DISGUISE_COST) {
      if (player === 0) this.say(`NO TE ALCANZA · CUESTA ${DISGUISE_COST}`);
      return;
    }
    this.chips[player] -= DISGUISE_COST;
    this.disguise[player] = k + 1;
    this.disguiseT[player] = DISGUISE_TIME;
    const b = this.bodies[player];
    let lost = false;
    for (const n of this.npcs) {
      if (n.state !== NPC_CHASE || n.target !== player) continue;
      if (n.lv !== this.lvOf(player) || Math.hypot(n.x - b.x, n.z - b.z) > HIDE_SEEN) {
        goHome(n);
        lost = true;
      }
    }
    if (player === 0) this.say(lost ? `¡${DISGUISES[k]}! TE HAN PERDIDO EL RASTRO` : `¡${DISGUISES[k]}! IRRECONOCIBLE ${DISGUISE_TIME} s`);
  }

  // --- Basura que se coge y se tira --------------------------------------------------------
  /** ¿La basura `k` no está en el suelo (alguien la lleva o se está reponiendo)? */
  private litterTaken(k: number): boolean {
    return this.litterT[k] > 0 || this.carry.includes(k);
  }

  /** Coge la basura `k` del suelo (una cada vez). */
  private pickLitter(player: number, k: number) {
    if (k < 0 || this.carry[player] >= 0 || this.litterTaken(k) || this.seated[player] >= 0 || this.away(player)) return;
    const [x, z, lv] = LITTER[k];
    const b = this.bodies[player];
    if (lv !== this.lvOf(player) || Math.hypot(b.x - x, b.z - z) > 1.6) return;
    this.carry[player] = k;
    if (player === 0) this.say("BASURA EN LA MANO · CLIC: TIRARLA");
  }

  /** Suelta la basura que lleve (al sentarse, esconderse o ir preso): vuelve a su sitio enseguida. */
  private dropLitter(player: number) {
    const k = this.carry[player];
    if (k < 0) return;
    this.carry[player] = -1;
    this.litterT[k] = 3;
  }

  /**
   * Tira la basura hacia delante: al primer jugador del cono (aturdido y suelta monedas) o, si no hay, al
   * primer NPC (al suelo un rato y luego a por ti). Es un delito a la vista de los guardias.
   */
  private throwLitter(player: number) {
    const k = this.carry[player];
    if (k < 0) return;
    this.carry[player] = -1;
    this.litterT[k] = LITTER_RESPAWN;
    const b = this.bodies[player];
    const lv = this.lvOf(player);
    const fx = -Math.sin(b.yaw);
    const fz = -Math.cos(b.yaw);
    let hit = -1;
    let best = LITTER_REACH;
    for (let j = 0; j < 4; j++) {
      if (j === player || !this.online[j] || this.seated[j] >= 0 || this.away(j) || this.lvOf(j) !== lv) continue;
      const dx = this.bodies[j].x - b.x;
      const dz = this.bodies[j].z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > best || d < 0.01 || (dx * fx + dz * fz) / d < Math.cos(LITTER_ARC)) continue;
      best = d;
      hit = j;
    }
    this.witness(player);
    if (hit >= 0) {
      const f = this.fight[hit];
      f.stun = Math.max(f.stun, LITTER_STUN);
      f.grabBy = -1;
      this.knock(hit, player, KNOCK * 0.6);
      this.dropCoins(hit, Math.min(LITTER_DROP, this.chips[hit]));
      if (player === 0) this.say(`¡BASURAZO A J${hit + 1}!`);
      else if (hit === 0) this.say("¡TE TIRARON BASURA!");
      return;
    }
    const n = npcInFront(this.npcs, b.x, b.z, b.yaw, LITTER_REACH, LITTER_ARC, lv);
    if (n >= 0) {
      if (!(this.npcs[n].state === NPC_CHASE && this.npcs[n].target === player)) this.chase(n, player);
      this.npcs[n].stun = LITTER_NPC_STUN;
      if (player === 0) this.say(isGuard(n) ? "¡BASURAZO AL GUARDIA! ¡CORRE!" : "¡BASURAZO AL CRUPIER! ¡CORRE!");
    } else if (player === 0) {
      this.say("¡FALLASTE!");
    }
  }

  // --- Zancadilla --------------------------------------------------------------------------
  /** Saca el pie un momento: quien pase por ahí sin saltar, tropieza. */
  private startTrip(player: number) {
    if (this.seated[player] >= 0 || this.away(player) || this.fight[player].stun > 0 || this.tripCd[player] > 0) return;
    this.tripT[player] = TRIP_WINDOW;
    this.tripCd[player] = TRIP_CD;
  }

  /**
   * El pie fuera: tropieza el primer jugador que lo pise (aturdido, sale despedido y suelta monedas) o el
   * primer NPC (se queda en el suelo; si no te perseguía, se levanta y va a por ti).
   */
  private tickTrips(dt: number) {
    for (let i = 0; i < 4; i++) {
      this.tripCd[i] = Math.max(0, this.tripCd[i] - dt);
      if (this.tripT[i] <= 0) continue;
      this.tripT[i] = Math.max(0, this.tripT[i] - dt);
      const b = this.bodies[i];
      const fx = b.x - Math.sin(b.yaw) * TRIP_FOOT;
      const fz = b.z - Math.cos(b.yaw) * TRIP_FOOT;
      for (let j = 0; j < 4; j++) {
        if (j === i || !this.online[j] || this.seated[j] >= 0 || this.away(j) || this.lvOf(j) !== this.lvOf(i)) continue;
        const o = this.bodies[j];
        if ((o.y ?? 0) > AIR_SAFE || Math.hypot(o.x - fx, o.z - fz) > TRIP_R) continue;
        const f = this.fight[j];
        f.stun = Math.max(f.stun, TRIP_STUN);
        f.grabBy = -1;
        o.kx = -Math.sin(o.yaw) * KNOCK * 0.8;
        o.kz = -Math.cos(o.yaw) * KNOCK * 0.8;
        this.dropCoins(j, Math.min(TRIP_DROP, this.chips[j]));
        if (i === 0) this.say(`¡ZANCADILLA A J${j + 1}!`);
        else if (j === 0) this.say("¡TE HICIERON LA ZANCADILLA!");
        this.witness(i);
        this.tripT[i] = 0;
        break;
      }
      if (this.tripT[i] <= 0) continue;
      const k = this.npcs.findIndex((n) => n.state !== NPC_OFF && n.lv === this.lvOf(i) && n.stun <= 0 && Math.hypot(n.x - fx, n.z - fz) < TRIP_R + 0.1);
      if (k < 0) continue;
      const n = this.npcs[k];
      if (!(n.state === NPC_CHASE && n.target === i)) this.chase(k, i);
      n.stun = TRIP_NPC_STUN;
      if (i === 0) this.say(isGuard(k) ? "¡EL GUARDIA AL SUELO! ¡CORRE!" : "¡EL CRUPIER AL SUELO! ¡CORRE!");
      this.tripT[i] = 0;
    }
  }

  // --- Baño (escondite) --------------------------------------------------------------------
  /**
   * Entra en la cabina `door`. Si un NPC le persigue y está cerca (le ve entrar), le saca y a la cárcel;
   * si está lejos, le pierde el rastro (deja de ser un objetivo válido y vuelve a su puesto).
   */
  private hide(player: number, door: number) {
    if (door < 0 || this.seated[player] >= 0 || this.away(player)) return;
    const b = this.bodies[player];
    const seen = this.npcs.some((n) => n.state === NPC_CHASE && n.target === player && n.lv === this.lvOf(player) && Math.hypot(n.x - b.x, n.z - b.z) < HIDE_SEEN);
    if (seen) {
      this.sendToJail(player, true);
      if (player === 0) this.say("¡TE VIO ENTRAR! A LA CÁRCEL");
      return;
    }
    const chased = this.npcs.some((n) => n.state === NPC_CHASE && n.target === player);
    this.hidden[player] = HIDE_MAX;
    this.hideDoor[player] = door;
    this.breakT[player] = 0;
    this.tripT[player] = 0;
    b.x = BATH.x;
    b.z = BATH_DOORS[door][1];
    b.kx = 0;
    b.kz = 0;
    b.y = 0;
    b.vy = 0;
    if (player === 0) this.say(chased ? "¡LE DESPISTASTE! ESCONDIDO EN EL BAÑO" : "ESCONDIDO EN EL BAÑO · E PARA SALIR");
  }

  /** Sale del baño por su puerta, mirando al salón. */
  private unhide(player: number, kicked: boolean) {
    if (this.hidden[player] <= 0) return;
    this.hidden[player] = 0;
    const [x, z] = BATH_DOORS[this.hideDoor[player]];
    const b = this.bodies[player];
    b.x = x;
    b.z = z;
    b.yaw = Math.PI / 2;
    if (player === 0) this.say(kicked ? "¡OCUPADO! TE ECHAN DEL BAÑO" : "SALES DEL BAÑO");
  }

  private tickHide(dt: number) {
    for (let i = 0; i < 4; i++) {
      if (this.hidden[i] <= 0) continue;
      if (!this.online[i]) {
        this.hidden[i] = 0;
        continue;
      }
      this.hidden[i] = Math.max(0, this.hidden[i] - dt);
      if (this.hidden[i] === 0) {
        // Se acabó el tiempo: fuera (unhide necesita verle dentro todavía).
        this.hidden[i] = 0.001;
        this.unhide(i, true);
      }
    }
  }

  /** Escondido: solo se mira y, con E, se sale. */
  private hiddenInput(dt: number) {
    this.look(dt);
    if (this.input.take("sit")) this.unhide(0, false);
    this.input.take("ok");
    this.input.take("jump");
    this.input.take("trip");
    this.input.takeUse();
  }

  // --- Bóveda en equipo --------------------------------------------------------------------
  /**
   * Dos jugadores distintos, cada uno en su panel, durante VAULT_TIME: se abre, reparten el botín y salta
   * la alarma (el guardia va a por el más cercano). Si alguien se baja, el progreso baja poco a poco.
   */
  private tickVault(dt: number) {
    this.vaultOn[0] = this.vaultOn[1] = -1;
    if (this.vaultCd > 0) {
      this.vaultCd = Math.max(0, this.vaultCd - dt);
      return;
    }
    for (let i = 0; i < 4; i++) {
      if (!this.online[i] || this.seated[i] >= 0 || this.away(i)) continue;
      const pad = onVaultPad(this.bodies[i].x, this.bodies[i].z, this.lvOf(i));
      if (pad >= 0 && this.vaultOn[pad] < 0) this.vaultOn[pad] = i;
    }
    const [a, b] = this.vaultOn;
    if (a < 0 || b < 0 || a === b) {
      this.vaultP = Math.max(0, this.vaultP - dt * VAULT_DECAY);
      return;
    }
    this.vaultP += dt;
    this.witness(a);
    this.witness(b);
    if (this.vaultP < VAULT_TIME) return;
    const half = Math.round(VAULT_LOOT / 2);
    this.chips[a] += half;
    this.chips[b] += half;
    this.vaultP = 0;
    this.vaultCd = VAULT_CD;
    // ¡Alarma! El guardia más cercano del piso de la bóveda sale a por el ladrón que tenga más cerca.
    const g = this.nearestGuard(this.lvOf(a), this.bodies[a].x, this.bodies[a].z, true);
    if (g >= 0) {
      const n = this.npcs[g];
      const da = Math.hypot(this.bodies[a].x - n.x, this.bodies[a].z - n.z);
      const db = Math.hypot(this.bodies[b].x - n.x, this.bodies[b].z - n.z);
      this.chase(g, da <= db ? a : b);
    }
    if (a === 0 || b === 0) this.say(`¡BÓVEDA ABIERTA! +${half} · ¡ALARMA, CORRED!`);
  }
  // --- Fuga en equipo ----------------------------------------------------------------------
  /** Empieza a forzar la caja de la fuga (solo si hay alguien preso que no sea él). */
  private startBreak(player: number) {
    if (this.seated[player] >= 0 || this.jail[player] > 0 || this.breakT[player] > 0) return;
    if (!nearSwitch(this.bodies[player].x, this.bodies[player].z, this.lvOf(player))) return;
    if (!this.jail.some((v, i) => v > 0 && i !== player && this.online[i])) {
      if (player === 0) this.say("NO HAY NADIE PRESO");
      return;
    }
    this.breakT[player] = 0.001;
    if (player === 0) this.say("¡FORZANDO LA CAJA! NO TE MUEVAS");
  }

  /**
   * Forcejeo con la caja: se corta si se aleja, le pegan o le encierran. Es un delito a la vista: si el
   * guardia le ve, sale a por él. Al completarlo, salen todos los presos.
   */
  private tickBreak(dt: number) {
    for (let i = 0; i < 4; i++) {
      if (this.breakT[i] <= 0) continue;
      const b = this.bodies[i];
      if (!this.online[i] || this.jail[i] > 0 || this.seated[i] >= 0 || this.fight[i].stun > 0 || !nearSwitch(b.x, b.z, this.lvOf(i))) {
        this.breakT[i] = 0;
        if (i === 0 && this.jail[0] <= 0) this.say("FUGA INTERRUMPIDA");
        continue;
      }
      this.witness(i);
      this.breakT[i] += dt;
      if (this.breakT[i] < BREAK_TIME) continue;
      this.breakT[i] = 0;
      let freed = 0;
      for (let j = 0; j < 4; j++) {
        if (this.jail[j] <= 0) continue;
        // Un instante y `tickJail` les devuelve al salón como si hubieran cumplido.
        this.jail[j] = 0.01;
        freed++;
      }
      if (i === 0) this.say(`¡FUGA! LIBERASTE A ${freed} PRESO${freed === 1 ? "" : "S"}`);
      else if (this.jail[0] > 0) this.say(`¡J${i + 1} TE HA SACADO DE LA CÁRCEL!`);
    }
  }

  // --- NPC: crupieres y guardia ------------------------------------------------------------
  /** Mueve a los NPC; a quien atrapan, a la cárcel. */
  private tickNpcs(dt: number) {
    for (let i = 0; i < 4; i++) this.tableRobCd[i] = Math.max(0, this.tableRobCd[i] - dt);
    // Radio: si alguien se escapa a otro piso, su perseguidor lo deja y avisa a un guardia de ese piso.
    this.npcs.forEach((n) => {
      if (n.state !== NPC_CHASE || n.target < 0 || this.away(n.target)) return;
      const lv = this.lvOf(n.target);
      if (lv === n.lv) return;
      const target = n.target;
      goHome(n);
      const b = this.bodies[target];
      const g = this.nearestGuard(lv, b.x, b.z, false);
      if (g < 0) return;
      startChase(this.npcs[g], target);
      if (target === 0) this.say("¡AVISO POR RADIO! TE BUSCA OTRO GUARDIA");
    });
    for (const n of this.npcs) {
      const caught = tickNpc(n, dt, this.bodies, (i) => this.online[i] && !this.away(i) && this.lvOf(i) === n.lv);
      if (caught < 0) continue;
      this.sendToJail(caught, true);
      if (caught === 0) this.say(n.guard ? "¡EL GUARDIA TE ATRAPÓ! A LA CÁRCEL" : "¡EL CRUPIER TE ATRAPÓ! A LA CÁRCEL");
    }
  }

  /** El NPC `k` sale a por `player` (con aviso si es el jugador local y no le perseguía ya). */
  private chase(k: number, player: number, hit = false) {
    const n = this.npcs[k];
    const already = n.state === NPC_CHASE && n.target === player;
    startChase(n, player, hit);
    if (player === 0 && !already) this.say(n.guard ? "¡EL GUARDIA TE PERSIGUE! ¡CORRE!" : "¡EL CRUPIER TE PERSIGUE! ¡CORRE!");
  }

  /**
   * Un delito: el primer guardia de ese piso que lo vea (y no esté ocupado con otro) sale a por el
   * culpable. Disfrazado, el guardia solo sospecha: se le cae el disfraz, pero no le persigue.
   */
  private witness(player: number) {
    const b = this.bodies[player];
    const lv = this.lvOf(player);
    const k = this.npcs.findIndex((n) => n.guard && n.state !== NPC_OFF && n.lv === lv
      && !(n.state === NPC_CHASE && n.target !== player) && sees(n, b.x, b.z));
    if (k < 0) return;
    if (this.disguise[player] > 0) {
      this.disguise[player] = 0;
      this.disguiseT[player] = 0;
      if (player === 0) this.say("¡EL GUARDIA SOSPECHA! SE TE CAYÓ EL DISFRAZ");
      return;
    }
    this.chase(k, player);
  }

  /** Guardia de servicio más cercano a (x, z) en ese piso (`busy`: también los que ya persiguen). */
  private nearestGuard(lv: Level, x: number, z: number, busy: boolean): number {
    let best = -1;
    let bestD = Infinity;
    this.npcs.forEach((n, k) => {
      if (!n.guard || n.state === NPC_OFF || n.lv !== lv || (!busy && n.state === NPC_CHASE)) return;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    return best;
  }

  /**
   * Robar la mesa más cercana. Solo sale bien si su crupier no está mirando (distraído o fuera de su
   * puesto persiguiendo a otro): así uno puede hacer de cebo mientras el otro roba.
   */
  private robTable(player: number) {
    if (this.seated[player] >= 0 || this.jail[player] > 0 || this.tableRobCd[player] > 0) return;
    const b = this.bodies[player];
    const table = nearTable(b.x, b.z, TABLE_ROB_REACH, this.lvOf(player));
    if (table < 0) {
      if (player === 0) this.say("NADIE CERCA PARA ROBAR");
      return;
    }
    this.tableRobCd[player] = TABLE_ROB_CD;
    if (this.npcs[table].state === NPC_IDLE) {
      this.chase(table, player);
      if (player === 0) this.say("¡EL CRUPIER TE VIO! ¡CORRE!");
      return;
    }
    const loot = TABLE_ROB_MIN + Math.floor(Math.random() * (TABLE_ROB_MAX - TABLE_ROB_MIN + 1));
    this.chips[player] += loot;
    if (player === 0) this.say(`+${loot} ¡ROBASTE LA MESA!`);
    this.witness(player);
  }

  // --- Turnos con cuota compartida ---------------------------------------------------------
  /** Cuota del turno: crece con los jugadores conectados y con cada turno superado. */
  private quota(): number {
    const players = this.online.filter(Boolean).length;
    return Math.round(QUOTA_PER_PLAYER * players * Math.pow(QUOTA_GROWTH, this.shift - 1));
  }

  /** Fichas de todos los conectados (la cuota se cumple entre todos). */
  private total(): number {
    return this.chips.reduce((sum, c, i) => sum + (this.online[i] ? c : 0), 0);
  }

  /** Reloj del turno: al acabar, premio para todos o la casa cobra (cárcel y vuelta a empezar). */
  private tickShift(dt: number) {
    this.eventT = Math.max(0, this.eventT - dt);
    this.shiftT -= dt;
    if (this.shiftT > 0) return;
    if (this.total() >= this.quota()) {
      for (let i = 0; i < 4; i++) if (this.online[i]) this.chips[i] += QUOTA_BONUS;
      this.best = Math.max(this.best, this.shift);
      this.shift++;
      this.event = 1;
      this.say(`¡CUOTA CUMPLIDA! +${QUOTA_BONUS} A CADA UNO`);
    } else {
      for (let i = 0; i < 4; i++) {
        if (!this.online[i]) continue;
        this.sendToJail(i, false);
        this.chips[i] = START_CHIPS;
        this.items[i] = ITEM_NONE;
        this.magnet[i] = 0;
        this.luck[i] = 0;
      }
      this.drops.length = 0;
      this.bananas.length = 0;
      this.shift = 1;
      this.event = 2;
      this.say("¡LA CASA COBRA! TODOS A LA CÁRCEL");
    }
    this.shiftT = SHIFT_TIME;
    this.eventT = EVENT_TIME;
  }

  // --- Mesa caliente -----------------------------------------------------------------------
  private tickHot(dt: number) {
    this.hotT -= dt;
    if (this.hotT <= 0) this.pickHot(false);
  }

  /** Sortea otra mesa caliente (nunca repite la de antes) y le sube los premios. */
  private pickHot(first: boolean) {
    const n = this.tables.length;
    let next = Math.floor(Math.random() * (first ? n : n - 1));
    if (!first && next >= this.hot) next++;
    this.hot = next;
    this.hotT = HOT_TIME;
    this.tables.forEach((t, i) => (t.boost = i === next ? HOT_BOOST : 1));
    if (!first) this.say(`¡MESA CALIENTE: ${GAME_TITLE[TABLES[next].kind]}${TABLES[next].lv ? " (ARRIBA)" : ""} ×${HOT_BOOST}!`);
  }

  // --- Tienda de trucos --------------------------------------------------------------------
  /** Compra un objeto sorpresa en la barra. */
  private buy(player: number) {
    if (this.seated[player] >= 0 || this.jail[player] > 0) return;
    if (!nearShop(this.bodies[player].x, this.bodies[player].z, this.lvOf(player))) return;
    if (this.items[player] !== ITEM_NONE) {
      if (player === 0) this.say("YA LLEVAS UN OBJETO (TECLA 4)");
      return;
    }
    if (this.chips[player] < ITEM_COST) {
      if (player === 0) this.say(`NO TE ALCANZA · CUESTA ${ITEM_COST}`);
      return;
    }
    this.chips[player] -= ITEM_COST;
    const item = 1 + Math.floor(Math.random() * 3);
    this.items[player] = item;
    if (player === 0) {
      this.slot = SLOT_ITEM;
      this.say(`¡${ITEM_NAMES[item]}! · CLIC PARA USAR`);
    }
  }

  /** Usa el objeto comprado: imán, dado cargado o cáscara de banana. */
  private useItem(player: number) {
    const item = this.items[player];
    if (this.seated[player] >= 0 || this.jail[player] > 0) return;
    if (item === ITEM_NONE) {
      if (player === 0) this.say("SIN OBJETO · CÓMPRALO EN LA BARRA");
      return;
    }
    this.items[player] = ITEM_NONE;
    if (item === ITEM_MAGNET) {
      this.magnet[player] = MAGNET_TIME;
      if (player === 0) this.say("¡IMÁN! LAS MONEDAS VIENEN A TI");
    } else if (item === ITEM_DICE) {
      this.luck[player] = 1;
      if (player === 0) this.say("DADO CARGADO: TU PRÓXIMO PREMIO ×2");
    } else if (item === ITEM_BANANA) {
      // Se deja caer detrás: para que la pise quien te persigue.
      const b = this.bodies[player];
      if (this.bananas.length >= BANANA_MAX) this.bananas.shift();
      const [x, z] = clampToHall(b.x + Math.sin(b.yaw) * 0.8, b.z + Math.cos(b.yaw) * 0.8, 0.6);
      this.bananas.push({ x, z, t: BANANA_LIFE, owner: player, lock: 1.5, lv: this.lvOf(player) });
      if (player === 0) this.say("¡BANANA AL SUELO!");
    }
  }

  /** Cáscaras: caducan y hacen resbalar a quien las pisa (aturdido, empujón y monedas al suelo). */
  private tickBananas(dt: number) {
    for (let k = this.bananas.length - 1; k >= 0; k--) {
      const bn = this.bananas[k];
      bn.t -= dt;
      bn.lock = Math.max(0, bn.lock - dt);
      if (bn.t <= 0) {
        this.bananas.splice(k, 1);
        continue;
      }
      for (let j = 0; j < 4; j++) {
        if (!this.online[j] || this.seated[j] >= 0 || this.away(j) || this.lvOf(j) !== bn.lv) continue;
        if (j === bn.owner && bn.lock > 0) continue;
        // Saltando, la cáscara se esquiva.
        if ((this.bodies[j].y ?? 0) > AIR_SAFE) continue;
        const b = this.bodies[j];
        if (Math.hypot(b.x - bn.x, b.z - bn.z) > BANANA_R) continue;
        const f = this.fight[j];
        f.stun = Math.max(f.stun, SLIP_STUN);
        f.grabBy = -1;
        // Sale despedido hacia donde iba.
        b.kx = -Math.sin(b.yaw) * KNOCK;
        b.kz = -Math.cos(b.yaw) * KNOCK;
        this.dropCoins(j, Math.min(SLIP_DROP, this.chips[j]));
        if (j === 0) this.say("¡TE RESBALASTE!");
        else if (bn.owner === 0) this.say(`¡J${j + 1} SE RESBALÓ!`);
        this.bananas.splice(k, 1);
        break;
      }
    }
  }

  /** Ratón: guiñada y cabeceo del jugador local. */
  private look(dt: number) {
    void dt;
    const [mx, my] = this.input.takeMouse();
    if (!mx && !my) return;
    const b = this.bodies[0];
    b.yaw -= mx * MOUSE_TURN;
    b.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, (b.pitch ?? 0) - my * MOUSE_PITCH));
  }

  /** Condenas: descuenta y, al cumplir, devuelve al salón. */
  private tickJail(dt: number) {
    for (let i = 0; i < 4; i++) {
      if (this.jail[i] <= 0) continue;
      this.jail[i] = Math.max(0, this.jail[i] - dt);
      const b = this.bodies[i];
      [b.x, b.z] = clampToJail(b.x, b.z);
      if (this.jail[i] === 0) {
        // Libre: vuelve a la puerta del salón.
        const [x, z] = SPAWNS[i];
        b.x = x;
        b.z = z;
        b.lv = 0;
        if (i === 0) {
          this.trashTaken = -1;
          this.say("¡LIBRE!");
        }
      }
    }
  }

  /** En la celda: andar por ella, coger basura y tirarla a la palanca. */
  private jailInput(dt: number) {
    this.look(dt);
    this.input.take("jump");
    this.input.take("trip");
    if (this.input.takeUse()) this.useTrash(0);
    stepPlayer(this.bodies[0], { forward: this.input.move, turn: this.input.turn, strafe: this.input.strafe, run: false }, dt, COLLIDERS);
    const b = this.bodies[0];
    [b.x, b.z] = clampToJail(b.x, b.z);
  }

  /** Coger basura del suelo o tirarla a la palanca. */
  private useTrash(player: number) {
    const b = this.bodies[player];
    if (this.trashTaken >= 0) {
      this.trashTaken = -1;
      this.resolveThrow(player);
      return;
    }
    let best = -1;
    let bestD = JAIL_PICK;
    JAIL_TRASH.forEach(([x, z], k) => {
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    if (best < 0) {
      this.say("NO HAY BASURA CERCA");
      return;
    }
    this.trashTaken = best;
    this.say("BASURA EN LA MANO · CLIC: TIRAR");
  }

  /** Tira la basura: a la palanca (te sueltan) o a otro preso (le atonta un poco). */
  private resolveThrow(player: number) {
    if (this.leverHit(player)) {
      this.jail[player] = Math.min(this.jail[player], 1.2);
      this.say("¡PALANCA! TE SUELTAN");
      return;
    }
    const other = this.jailedTarget(player);
    if (other >= 0) {
      this.fight[other].stun = Math.max(this.fight[other].stun, 0.8);
      this.say(other === 0 ? "¡TE DIERON CON LA BASURA!" : "¡LE DISTE!");
    } else {
      this.say("FALLO… APUNTA A LA PALANCA");
    }
  }

  /** Otro preso al que le puedes dar con la basura (en la celda y delante). */
  private jailedTarget(player: number): number {
    const b = this.bodies[player];
    const fx = -Math.sin(b.yaw);
    const fz = -Math.cos(b.yaw);
    let best = -1;
    let bestD = 8;
    for (let i = 0; i < 4; i++) {
      if (i === player || this.jail[i] <= 0) continue;
      const o = this.bodies[i];
      const dx = o.x - b.x;
      const dz = o.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.01 || d > 8) continue;
      if ((dx * fx + dz * fz) / d < Math.cos(0.3)) continue;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** ¿La mirada apunta a la palanca de la celda? */
  private leverHit(player: number): boolean {
    const b = this.bodies[player];
    const dx = JAIL_LEVER[0] - b.x;
    const dz = JAIL_LEVER[2] - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return true;
    const fx = -Math.sin(b.yaw);
    const fz = -Math.cos(b.yaw);
    return (dx * fx + dz * fz) / d > Math.cos(0.17);
  }

  /** Avanza el minijuego del robo y lo resuelve con ESPACIO o clic. */
  private tickRob(dt: number) {
    const r = this.rob;
    if (!r) return;
    r.cursor += r.dir * ROB_SPEED * dt;
    if (r.cursor > 1) {
      r.cursor = 1;
      r.dir = -1;
    } else if (r.cursor < 0) {
      r.cursor = 0;
      r.dir = 1;
    }
    const stop = this.input.takeUse();
    if (!stop) return;
    this.rob = null;
    if (Math.abs(r.cursor - r.zone) <= ROB_ZONE / 2) this.robSuccess(0, r.target);
    else this.sendToJail(0, true);
  }

  /** Aturdimientos, golpes en curso, agarres y recargas. */
  private tickFight(dt: number) {
    for (let i = 0; i < 4; i++) {
      const f = this.fight[i];
      f.stun = Math.max(0, f.stun - dt);
      f.swing = Math.max(0, f.swing - dt);
      f.batCd = Math.max(0, f.batCd - dt);
      f.grabCd = Math.max(0, f.grabCd - dt);
      // Mientras agarra, le va sacando monedas al agarrado.
      if (f.grabTarget >= 0) {
        const victim = f.grabTarget;
        const vf = this.fight[victim];
        if (vf.grabBy !== i || vf.stun <= 0) {
          f.grabTarget = -1;
          f.stealT = 0;
        } else {
          f.stealT += dt;
          if (f.stealT >= 0.5 && this.chips[victim] > 0) {
            f.stealT = 0;
            this.takeCoins(i, victim, GRAB_STEAL);
          }
        }
      }
      // Si se le acabó el aturdimiento, deja de estar agarrado.
      if (f.stun <= 0) f.grabBy = -1;
    }
  }

  private walkInput(dt: number) {
    const body = this.bodies[0];
    this.look(dt);
    if (this.input.take("sit")) {
      const lv = this.lvOf(0);
      const near = nearTable(body.x, body.z, REACH, lv);
      const dummy = nearMannequin(body.x, body.z, lv);
      const litter = nearLitter(body.x, body.z, lv, (k) => this.litterTaken(k));
      if (near >= 0) this.sit(0, near);
      else if (litter >= 0 && this.carry[0] < 0) this.pickLitter(0, litter);
      else if (nearShop(body.x, body.z, lv)) this.buy(0);
      else if (nearSwitch(body.x, body.z, lv)) this.startBreak(0);
      else if (nearBath(body.x, body.z, lv) >= 0) this.hide(0, nearBath(body.x, body.z, lv));
      else if (dummy >= 0) this.buyDisguise(0, dummy);
      this.input.clear();
      return;
    }
    // 5–8: emotes.
    const emote = this.input.takeEmote();
    if (emote) this.startEmote(0, emote);
    // Moverse o saltar corta el emote (y la cámara vuelve a tus ojos).
    if (this.emote[0] && (this.input.move || this.input.strafe || this.input.turn)) this.stopEmote(0);
    // Espacio salta; Q saca el pie (zancadilla).
    if (this.input.take("jump") && this.fight[0].stun <= 0 && (body.st ?? -1) < 0 && jump(body)) this.stopEmote(0);
    if (this.input.take("trip")) this.startTrip(0);
    // Andando, ← → giran: no valen para apostar.
    this.input.take("betLeft");
    this.input.take("betRight");
    this.input.take("betUp");
    this.input.take("betDown");
    // Clic (o F): usar lo que llevas en la mano (bate, robar, objeto o tirar una moneda).
    this.input.take("ok");
    if (!this.rob && this.input.takeUse()) this.use(0);
    const stunned = this.fight[0].stun > 0;
    this.running = this.stamina.step(this.input.run && !stunned, this.input.move !== 0 || this.input.strafe !== 0, dt);
    stepPlayer(
      body,
      // Aturdido o agarrado no se anda, pero el empujón sí te mueve.
      stunned ? { forward: 0, turn: 0, strafe: 0, run: false } : { forward: this.input.move, turn: this.input.turn, strafe: this.input.strafe, run: this.running },
      dt,
      bodyColliders(body),
      this.others(0),
    );
    // Escaleras andando: la altura la da el peldaño y al salir arriba o abajo se cambia de piso.
    stairStep(body);
  }

  private seatedInput() {
    const idx = this.seated[0];
    const t = this.tables[idx];
    if (this.input.take("sit")) {
      this.stand(0);
      this.input.clear();
      return;
    }
    const chips = this.chips[0];
    if (this.input.take("betLeft")) t.setSpot(0, t.bets[0].spot - 1);
    if (this.input.take("betRight")) t.setSpot(0, t.bets[0].spot + 1);
    if (this.input.take("betUp")) t.bump(0, 1, chips);
    if (this.input.take("betDown")) t.bump(0, -1, chips);
    // Enter o clic: listo (o cambiar la apuesta). Saltar y la zancadilla no valen sentado.
    if (this.input.take("ok") || this.input.takeClick()) t.toggleLock(0, chips);
    this.input.take("use");
    this.input.take("jump");
    this.input.take("trip");
  }

  /** Los demás cuerpos (para no atravesarlos al andar). */
  private others(me: number): Body3[] {
    // Los presos están en la jaula, por encima: no chocan con los de abajo (ni al revés).
    return this.bodies.filter((_, i) => i !== me && this.online[i] && this.seated[i] < 0 && this.hidden[i] <= 0
      && (this.jail[i] > 0) === (this.jail[me] > 0) && this.lvOf(i) === this.lvOf(me));
  }

  /** Usa lo que lleva en la mano: bate, robar (mano) o tirar monedas. */
  private use(player: number) {
    if (this.seated[player] >= 0 || this.jail[player] > 0) return;
    // Con basura en la mano, el clic la tira (sea cual sea la ranura).
    if (this.carry[player] >= 0) {
      this.throwLitter(player);
      return;
    }
    if (this.slot === SLOT_BAT) this.strike(player, 1);
    else if (this.slot === SLOT_HAND) this.startRob(player);
    else if (this.slot === SLOT_ITEM) this.useItem(player);
    else this.toss(player);
  }

  /** Empieza el minijuego del robo: hay que parar la marca en la zona buena. */
  private startRob(player: number) {
    if (this.rob || this.fight[player].grabCd > 0) return;
    const target = this.findTarget(player, ROB_REACH);
    if (target < 0) {
      // Nadie delante: se intenta con la mesa (o avisa de que no hay nada que robar).
      this.robTable(player);
      return;
    }
    if (this.chips[target] < 1) {
      if (player === 0) this.say("NO TIENE FICHAS");
      return;
    }
    this.fight[player].grabCd = 1;
    this.rob = { target, cursor: 0, dir: 1, zone: 0.2 + Math.random() * 0.6 };
  }

  /** Robo conseguido: se lleva unas fichas y el otro se queda medio atontado. */
  private robSuccess(to: number, from: number) {
    const n = Math.min(ROB_MAX, this.chips[from]);
    if (n < 1) return;
    this.chips[from] -= n;
    this.chips[to] += n;
    const vf = this.fight[from];
    vf.stun = Math.max(vf.stun, 0.35);
    vf.grabBy = -1;
    if (to === 0) this.say(`+${n} ROBADAS`);
    else if (from === 0) this.say(`¡TE HAN ROBADO ${n}!`);
    this.witness(to);
  }

  /** A la cárcel del techo: aparece en la celda y no sale hasta cumplir. */
  private sendToJail(i: number, caught: boolean) {
    if (i === 0) this.trashTaken = -1;
    this.jail[i] = JAIL_TIME;
    if (this.seated[i] >= 0) this.stand(i);
    const b = this.bodies[i];
    b.x = JAIL_SPOT[0];
    b.z = JAIL_SPOT[1];
    b.yaw = 0;
    b.pitch = -0.42;
    b.kx = 0;
    b.kz = 0;
    b.lv = 0;
    b.y = 0;
    b.vy = 0;
    b.st = -1;
    this.dropLitter(i);
    this.breakT[i] = 0;
    this.fight[i].stun = 0;
    this.fight[i].grabBy = -1;
    this.fight[i].grabTarget = -1;
    if (i === 0) this.say(caught ? "¡TE PILLARON! A LA CÁRCEL" : "¡A LA CÁRCEL!");
  }

  /** Bate (1) o mano (2): busca a quién dar. */
  private strike(player: number, kind: number) {
    if (this.seated[player] >= 0) return;
    const f = this.fight[player];
    if (kind === 1) {
      if (f.batCd > 0) return;
      f.batCd = BAT_CD;
      f.swing = 0.38;
      const target = this.findTarget(player, HIT_REACH);
      if (target < 0) {
        // ¿Le has dado a un NPC? Se queda atontado un momento y luego sale a por ti.
        const b = this.bodies[player];
        const k = npcInFront(this.npcs, b.x, b.z, b.yaw, HIT_REACH, HIT_ARC, this.lvOf(player));
        if (k < 0) return;
        if (player === 0) this.say(isGuard(k) ? "¡LE PEGASTE AL GUARDIA!" : "¡LE PEGASTE AL CRUPIER!");
        this.chase(k, player, true);
        this.witness(player);
        return;
      }
      this.witness(player);
      const tf = this.fight[target];
      tf.stun = Math.max(tf.stun, HIT_STUN);
      tf.grabBy = -1;
      this.knock(target, player, KNOCK);
      // Suelta monedas al suelo: las puede coger cualquiera (por eso hay que correr).
      this.dropCoins(target, Math.min(STEAL_MAX, this.chips[target]));
      if (target === 0) this.say("¡TE HAN GOLPEADO!");
    } else {
      if (f.grabCd > 0) return;
      f.grabCd = GRAB_CD;
      f.swing = 0.3;
      const target = this.findTarget(player, GRAB_REACH);
      if (target < 0) return;
      this.witness(player);
      const tf = this.fight[target];
      tf.stun = Math.max(tf.stun, GRAB_HOLD);
      tf.grabBy = player;
      f.grabTarget = target;
      f.stealT = 0;
      // Primer pellizco inmediato.
      if (this.chips[target] > 0) this.takeCoins(player, target, GRAB_STEAL);
      if (target === 0) this.say("¡TE HAN AGARRADO!");
    }
  }

  /** Tira una moneda propia al suelo adelante (para enseñarla o deshacerte de ellas). */
  private toss(player: number) {
    const f = this.fight[player];
    if (f.batCd > 0 || this.chips[player] < 1) return;
    f.batCd = 0.4;
    f.swing = 0.25;
    const b = this.bodies[player];
    this.drops.push({
      x: b.x - Math.sin(b.yaw) * 0.9,
      z: b.z - Math.cos(b.yaw) * 0.9,
      vx: -Math.sin(b.yaw) * 3.4,
      vz: -Math.cos(b.yaw) * 3.4,
      t: DROP_LIFE,
      owner: player,
      lock: 1.4,
      lv: this.lvOf(player),
    });
    this.chips[player] -= 1;
  }

  /** Jugador más cercano dentro del alcance y del cono frontal (o -1). */
  private findTarget(me: number, reach: number): number {
    const b = this.bodies[me];
    const fx = -Math.sin(b.yaw);
    const fz = -Math.cos(b.yaw);
    let best = -1;
    let bestD = reach;
    for (let j = 0; j < 4; j++) {
      if (j === me || !this.online[j] || this.seated[j] >= 0 || this.away(j) || this.lvOf(j) !== this.lvOf(me)) continue;
      const other = this.bodies[j];
      const dx = other.x - b.x;
      const dz = other.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD || d < 0.01) continue;
      // Medio cono frontal: sólo cuentan los que están delante.
      if ((dx * fx + dz * fz) / d < Math.cos(HIT_ARC)) continue;
      bestD = d;
      best = j;
    }
    return best;
  }

  /** Empuja al jugador `to` en la dirección `from → to`. */
  private knock(to: number, from: number, speed: number) {
    const a = this.bodies[from];
    const b = this.bodies[to];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const body = this.bodies[to];
    body.kx = dx * speed;
    body.kz = dz * speed;
  }

  /** Suelta `n` monedas alrededor de un jugador. */
  private dropCoins(from: number, n: number) {
    if (n <= 0) return;
    this.chips[from] = Math.max(0, this.chips[from] - n);
    const b = this.bodies[from];
    for (let k = 0; k < n; k++) {
      if (this.drops.length >= DROP_MAX) this.drops.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 2.6 + Math.random() * 2.2;
      this.drops.push({
        x: b.x + Math.sin(a) * 0.3,
        z: b.z + Math.cos(a) * 0.3,
        vx: Math.sin(a) * sp,
        vz: Math.cos(a) * sp,
        t: DROP_LIFE,
        owner: from,
        lock: 1.6,
        lv: this.lvOf(from),
      });
    }
  }

  /** Pasa fichas de un jugador a otro (robo). */
  private takeCoins(to: number, from: number, n: number) {
    const give = Math.min(n, this.chips[from]);
    if (give <= 0) return;
    this.chips[from] -= give;
    this.chips[to] += give;
    if (to === 0) this.say(`+${give} ROBADA${give > 1 ? "S" : ""}`);
  }

  /** Las monedas del suelo: se mueven, se frenan y las recoge quien pasa por encima. */
  private tickDrops(dt: number) {
    for (let k = this.drops.length - 1; k >= 0; k--) {
      const d = this.drops[k];
      d.x += d.vx * dt;
      d.z += d.vz * dt;
      const damp = Math.max(0, 1 - dt * 4.5);
      d.vx *= damp;
      d.vz *= damp;
      [d.x, d.z] = clampToHall(d.x, d.z, 0.6);
      d.t -= dt;
      d.lock = Math.max(0, d.lock - dt);
      if (d.t <= 0) {
        this.drops.splice(k, 1);
        continue;
      }
      for (let j = 0; j < 4; j++) {
        if (!this.online[j] || this.seated[j] >= 0 || this.away(j) || this.lvOf(j) !== d.lv) continue;
        // Quien la soltó no puede recuperarla de inmediato: hay que ganársela.
        if (j === d.owner && d.lock > 0) continue;
        const b = this.bodies[j];
        const dist = Math.hypot(b.x - d.x, b.z - d.z);
        const magnet = this.magnet[j] > 0;
        // Imán: la moneda se arrastra hacia él y se recoge desde más lejos.
        if (magnet && dist < MAGNET_R && dist > 0.01) {
          d.vx += ((b.x - d.x) / dist) * 22 * dt;
          d.vz += ((b.z - d.z) / dist) * 22 * dt;
        }
        if (dist <= (magnet ? MAGNET_PICK : PICK_REACH)) {
          this.chips[j] += 1;
          if (j === 0) this.say("+1 MONEDA");
          this.drops.splice(k, 1);
          break;
        }
      }
    }
  }

  /** Choques: si dos se pisan, se empujan (no se atraviesan). */
  private tickBumps() {
    const min = BODY_R * 2 + 0.02;
    for (let a = 0; a < 4; a++) {
      if (!this.online[a] || this.seated[a] >= 0) continue;
      for (let b = a + 1; b < 4; b++) {
        if (!this.online[b] || this.seated[b] >= 0) continue;
        if ((this.jail[a] > 0) !== (this.jail[b] > 0) || this.hidden[a] > 0 || this.hidden[b] > 0 || this.lvOf(a) !== this.lvOf(b)) continue;
        const ba = this.bodies[a];
        const bb = this.bodies[b];
        let dx = bb.x - ba.x;
        let dz = bb.z - ba.z;
        const d = Math.hypot(dx, dz);
        if (d > min || d < 1e-4) continue;
        dx /= d;
        dz /= d;
        const push = BUMP * (1 - d / min);
        // Cada uno para su lado; el empujón se frena solo en `shove`.
        ba.kx = (ba.kx ?? 0) - dx * push;
        ba.kz = (ba.kz ?? 0) - dz * push;
        bb.kx = (bb.kx ?? 0) + dx * push;
        bb.kz = (bb.kz ?? 0) + dz * push;
      }
    }
    // Los empujones de los invitados se frenan aquí: su posición la manda su equipo, pero la velocidad
    // viaja en el estado y hay que apagarla o el empujón no terminaría nunca.
    for (let i = 1; i < 4; i++) this.decayKnock(this.bodies[i], this.dt);
  }

  /** Frena el empujón sin mover el cuerpo (para los invitados, que son dueños de su posición). */
  private decayKnock(b: Body3, dt: number) {
    const damp = Math.max(0, 1 - dt * 7);
    const kx = (b.kx ?? 0) * damp;
    const kz = (b.kz ?? 0) * damp;
    b.kx = Math.abs(kx) < 0.05 ? 0 : kx;
    b.kz = Math.abs(kz) < 0.05 ? 0 : kz;
  }

  private say(text: string) {
    this.notice = text;
    this.noticeT = 1.8;
  }

  /** Se sienta (o se levanta) un jugador. */
  private sit(player: number, table: number) {
    if (table < 0 || table >= this.tables.length) return;
    if (this.seated[player] >= 0) this.stand(player);
    const body = this.bodies[player];
    const [x, z, yaw] = seatSpot(TABLES[table], player);
    body.x = x;
    body.z = z;
    body.yaw = yaw;
    body.lv = TABLES[table].lv;
    body.st = -1;
    body.y = 0;
    this.seated[player] = table;
    this.tables[table].sit(player, true);
    this.dropLitter(player);
    if (this.chips[player] < 1) this.chips[player] += RESCUE;
  }

  private stand(player: number) {
    const table = this.seated[player];
    if (table < 0) return;
    const [x, z] = standSpot(TABLES[table]);
    const body = this.bodies[player];
    body.x = x;
    body.z = z;
    body.yaw = TABLES[table].yaw;
    this.tables[table].sit(player, false);
    this.seated[player] = -1;
  }

  key(code: string) {
    // R: vuelve a empezar (fichas de nuevo y todos de pie, sin monedas en el suelo).
    if (code !== "KeyR") return;
    for (let i = 0; i < 4; i++) {
      if (this.seated[i] >= 0) this.stand(i);
      this.chips[i] = START_CHIPS;
      this.fight[i].stun = 0;
      this.fight[i].grabBy = -1;
      this.fight[i].grabTarget = -1;
      this.bodies[i].kx = 0;
      this.bodies[i].kz = 0;
      this.items[i] = ITEM_NONE;
      this.magnet[i] = 0;
      this.luck[i] = 0;
    }
    this.drops.length = 0;
    this.bananas.length = 0;
    this.npcs.forEach(resetNpc);
    this.tableRobCd.fill(0);
    this.breakT.fill(0);
    this.tripT.fill(0);
    this.tripCd.fill(0);
    this.hidden.fill(0);
    this.disguise.fill(0);
    this.carry.fill(-1);
    this.litterT.fill(0);
    this.disguiseT.fill(0);
    this.emote.fill(0);
    this.emoteT.fill(0);
    this.vaultP = 0;
    this.vaultCd = 0;
    this.shift = 1;
    this.shiftT = SHIFT_TIME;
    this.eventT = 0;
    this.noticeT = 0;
  }

  // --- Estado ----------------------------------------------------------------------------
  /** Pelea de un jugador tal como viaja (null si está limpio). */
  private fightSnap(i: number): number[] | null {
    const f = this.fight[i];
    const b = this.bodies[i];
    const kx = b.kx ?? 0;
    const kz = b.kz ?? 0;
    if (f.stun <= 0.01 && f.swing <= 0.01 && f.grabBy < 0 && !kx && !kz) return null;
    return [r2(f.stun), f.grabBy, r2(f.swing), r2(kx), r2(kz)];
  }

  private snap(): CasinoSnap {
    return {
      g: "casino",
      base: -1,
      seq: this.seq,
      pl: this.bodies.map((b, i) => [r2(b.x), r2(b.z), r2(b.yaw), this.seated[i], r2(b.y ?? 0), b.lv ?? 0]),
      ch: [...this.chips],
      // Solo viajan las mesas con alguien sentado; las vacías se quedan como estén en el cliente.
      tb: this.tables.map((t) => (t.players().length ? t.snap() : null)),
      ak: [...this.acks],
      on: this.online.map((o) => (o ? 1 : 0)),
      cg: [0, 1, 2, 3].map((i) => this.fightSnap(i)),
      co: this.drops.map((d) => [r1(d.x), r1(d.z), r1(d.t), d.lv]),
      ja: this.jail.map((v) => Math.round(v * 10) / 10),
      qs: [this.shift, Math.max(0, Math.ceil(this.shiftT)), this.quota(), this.total(), this.best],
      ht: [this.hot, Math.max(0, Math.ceil(this.hotT))],
      it: this.items.map((v, i) => [v, r1(this.magnet[i]), this.luck[i]]),
      bn: this.bananas.map((b) => [r1(b.x), r1(b.z), b.lv]),
      ev: this.eventT > 0 ? [this.event, r1(this.eventT)] : [],
      np: this.npcs.map(snapNpc),
      jb: this.breakT.map((v) => r2(Math.min(1, v / BREAK_TIME))),
      hd: this.hidden.map((v) => r1(v)),
      tr: this.tripT.map((v) => (v > 0 ? 1 : 0)),
      vt: [r2(Math.min(1, this.vaultP / VAULT_TIME)), Math.ceil(this.vaultCd), this.vaultOn[0], this.vaultOn[1]],
      dg: this.disguise.map((d, i) => [d, Math.ceil(this.disguiseT[i])]),
      em: [...this.emote],
      lt: this.litterT.map((t, k) => (this.litterTaken(k) ? 1 : 0)),
      cy: [...this.carry],
    };
  }

  frame(): NetFrame {
    this.seq++;
    return { snap: this.snap(), base: null };
  }

  onMessage(index: number, msg: unknown) {
    const m = msg as Partial<CasinoMsg> | null;
    if (!m || m.t !== "c" || index < 0 || index > 3) return;
    const body = this.bodies[index];
    if (body) {
      const table = int(m.tb, this.seated[index]);
      if (table !== this.seated[index]) {
        if (table >= 0 && table < this.tables.length) this.sit(index, table);
        else this.stand(index);
      }
      // Mientras estás sentado (o escondido en el baño), manda el anfitrión: no se acepta que te muevas.
      if (this.seated[index] < 0 && this.hidden[index] <= 0) {
        body.x = num(m.x, body.x);
        body.z = num(m.z, body.z);
        body.yaw = num(m.yaw, body.yaw);
        // La altura llega hasta el entrepiso: subiendo la escalera, el invitado va «en planta baja» hasta arriba.
        body.y = Math.max(0, Math.min(UPPER_Y + 1, num(m.jy, 0)));
        body.lv = int(m.lv, 0) === 1 ? 1 : 0;
      }
    }
    const id = int(m.i, -1);
    if (id <= this.acks[index]) return;
    this.acks[index] = id;
    // Golpe con lo que lleva en la mano (el anfitrión decide a quién le da).
    const action = int(m.ca, 0);
    if (action === 1 || action === 2) this.strike(index, action);
    else if (action === 3) this.toss(index);
    else if (action === 4) {
      // Robo conseguido: se comprueba que hay alguien al alcance.
      const target = this.findTarget(index, ROB_REACH);
      if (target >= 0 && this.jail[index] <= 0) this.robSuccess(index, target);
    } else if (action === 5) {
      // El invitado falló el minijuego: a la cárcel.
      this.sendToJail(index, true);
    } else if (action === 6 && this.jail[index] > 0) {
      this.resolveThrow(index);
    } else if (action === 7) {
      this.buy(index);
    } else if (action === 8) {
      this.useItem(index);
    } else if (action === 9) {
      this.robTable(index);
    } else if (action === 10) {
      this.startBreak(index);
    } else if (action === 11) {
      this.startTrip(index);
    } else if (action === 12) {
      this.hide(index, nearBath(body.x, body.z, this.lvOf(index)));
    } else if (action === 13) {
      this.unhide(index, false);
    } else if (action === 20) {
      this.stopEmote(index);
    } else if (action >= 21 && action <= 20 + EMOTES.length) {
      this.startEmote(index, action - 20);
    } else if (action >= 30 && action < 30 + DISGUISES.length) {
      this.buyDisguise(index, action - 30);
    } else if (action >= 40 && action < 40 + LITTER.length) {
      this.pickLitter(index, action - 40);
    } else if (action === 39) {
      this.throwLitter(index);
    }
    const sit = this.seated[index];
    if (sit < 0) return;
    const t = this.tables[sit];
    const lock = int(m.lk, 0) === 1;
    const chips = this.chips[index];
    if (t.bets[index].locked && !lock) t.toggleLock(index, chips);
    t.setSpot(index, int(m.sp, 0));
    t.setAmount(index, int(m.am, 1), chips);
    if (lock && !t.bets[index].locked) t.toggleLock(index, chips);
  }

  onDisconnect(index: number) {
    // El asiento queda libre y el jugador desaparece de la sala.
    this.online[index] = false;
    this.stand(index);
    this.hidden[index] = 0;
  }

  // --- Dibujo ------------------------------------------------------------------------------
  private view(s: CasinoSnap): HudView {
    const body = this.bodies[0];
    const lv = this.lvOf(0);
    const free = this.seated[0] < 0 && !this.away(0);
    const near = this.seated[0] >= 0 ? -1 : nearTable(body.x, body.z, REACH, lv);
    const stair = free && near < 0 && lv === 0 && (body.st ?? -1) < 0 ? nearStairFoot(body.x, body.z) : -1;
    return {
      litter: free && near < 0 && this.carry[0] < 0 && nearLitter(body.x, body.z, lv, (k) => this.litterTaken(k)) >= 0,
      carrying: this.carry[0] >= 0,
      s,
      me: 0,
      zone: this.jail[0] > 0 ? "CÁRCEL" : zoneAt(body.x, body.z, lv),
      stair: stair < 0 ? 0 : lv === 0 ? 1 : 2,
      mannequin: free && near < 0 ? nearMannequin(body.x, body.z, lv) : -1,
      myTable: this.seated[0],
      near,
      shop: free && near < 0 && nearShop(body.x, body.z, lv),
      jailSwitch: free && near < 0 && nearSwitch(body.x, body.z, lv),
      bath: free && near < 0 && nearBath(body.x, body.z, lv) >= 0,
      hidden: this.hidden[0],
      tripCd: this.tripCd[0],
      selSpot: this.seated[0] >= 0 ? this.tables[this.seated[0]].bets[0].spot : 0,
      netLabel: this.netLabel,
      ready: true,
      time: this.time,
      slot: this.slot,
      notice: this.notice,
      noticeT: this.noticeT,
      stun: this.fight[0].stun,
      batCd: this.fight[0].batCd,
      rob: this.rob ? [this.rob.cursor, this.rob.zone] : null,
      jail: this.jail[0],
      trash: this.trashTaken,
      look: lookMode(),
      stamina: this.stamina.value,
      tired: this.stamina.tired,
      running: this.running,
    };
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const s = this.snap();
    const stage = (this.stage ??= new CasinoStage());
    const v = this.view(s);
    stage.update({
      s, me: 0, myTable: v.myTable, near: v.near, time: this.time,
      slot: this.slot, swing: this.fight[0].swing, trashTaken: this.trashTaken, pitch: this.bodies[0].pitch ?? 0,
      running: this.running, jumpY: this.bodies[0].y ?? 0, level: this.lvOf(0), carry: this.carry[0] >= 0,
    }, this.dt);
    stage.render(ctx, pixelScale);
    drawNames(ctx, stage, s, 0);
    drawHud(ctx, v);
  }
}

/** Invitado: mueve su muñeco, manda dónde está y apuesta; dibuja lo que llega del anfitrión. */
export class CasinoGuest implements GuestGame {
  readonly id = "casino" as const;
  readonly size = [CW, CH] as const;
  readonly baseSeq = -1;
  netLabel = "";
  private state: CasinoSnap | null = null;
  private stage: CasinoStage | null = null;
  private readonly body: Body3;
  private myTable = -1;
  private pending: CasinoMsg | null = null;
  private actionId = 0;
  private seq = 0;
  private lastSentAt = -1e9;
  private selSpot = 0;
  private selAmount = 1;
  private time = 0;
  private dt = 0;
  /** Ranura elegida (0 monedas, 1 mano, 2 bate). */
  private slot = SLOT_COINS;
  /** Aturdimiento que manda el anfitrión (no se anda mientras dure). */
  private stun = 0;
  private batCd = 0;
  private notice = "";
  private noticeT = 0;
  private lastChips = -1;
  /** Cabeceo de la vista y estado de la cárcel y del robo. */
  private pitch = 0;
  private jail = 0;
  private wasJailed = false;
  private trashTaken = -1;
  private rob: { cursor: number; dir: number; zone: number } | null = null;
  /** Lo último que se vio de objeto, mesa caliente y fin de turno (para avisar al cambiar). */
  private lastItem = ITEM_NONE;
  private lastHot = -1;
  private lastEvent = 0;
  /** NPC que me perseguía en el último estado (-1 = ninguno). */
  private lastChaser = -1;
  /** Aguante para correr y si estoy corriendo este fotograma. */
  private readonly stamina = new Stamina();
  private running = false;
  /** Segundos escondido en el baño (lo dice el anfitrión) y recarga local de la zancadilla. */
  private hidden = 0;
  private tripCd = 0;
  /** Disfraz que tenía en el último estado (para avisar al ponérmelo o perderlo). */
  private lastDisguise = 0;
  /** Ya he pedido cortar el emote (no repetirlo cada fotograma). */
  private emoteStop = false;

  constructor(private index: number, private input: CasinoInput) {
    const [x, z] = SPAWNS[index] ?? SPAWNS[0];
    this.body = { x, z, yaw: 0, stride: 0 };
  }

  get ready() {
    return this.state !== null;
  }

  onBase() {}

  onSnap(snap: unknown) {
    const s = snap as CasinoSnap;
    this.state = s;
    if (this.pending && (s.ak[this.index] ?? 0) >= this.pending.i) this.pending = null;
    const mine = s.pl[this.index];
    if (!mine) return;
    // Pelea: el anfitrión dice si estoy aturdido/agarrado y con qué empujón salgo.
    const fight = s.cg?.[this.index] ?? null;
    const stun = fight ? fight[0] ?? 0 : 0;
    if (stun > this.stun + 0.05) this.say(fight && (fight[1] ?? -1) >= 0 ? "¡TE HAN AGARRADO!" : "¡TE HAN GOLPEADO!");
    this.stun = stun;
    const kx = fight ? fight[3] ?? 0 : 0;
    const kz = fight ? fight[4] ?? 0 : 0;
    if (kx || kz) {
      this.body.kx = kx;
      this.body.kz = kz;
    }
    // Aviso al ganar o perder monedas de pie (robos y monedas del suelo).
    const chips = s.ch[this.index] ?? 0;
    if (this.lastChips >= 0 && chips !== this.lastChips && this.myTable < 0) {
      const dif = chips - this.lastChips;
      this.say(`${dif > 0 ? "+" : ""}${dif} MONEDA${Math.abs(dif) === 1 ? "" : "S"}`);
    }
    this.lastChips = chips;
    // Trucos, mesa caliente y fin de turno: lo decide el anfitrión, aquí solo se avisa del cambio.
    const item = s.it?.[this.index]?.[0] ?? ITEM_NONE;
    if (item !== ITEM_NONE && this.lastItem === ITEM_NONE) {
      this.slot = SLOT_ITEM;
      this.say(`¡${ITEM_NAMES[item]}! · CLIC PARA USAR`);
    }
    this.lastItem = item;
    const hot = s.ht?.[0] ?? -1;
    if (hot >= 0 && this.lastHot >= 0 && hot !== this.lastHot) this.say(`¡MESA CALIENTE: ${GAME_TITLE[TABLES[hot].kind]}${TABLES[hot].lv ? " (ARRIBA)" : ""} ×${HOT_BOOST}!`);
    this.lastHot = hot;
    const ev = s.ev?.[0] ?? 0;
    if (ev && ev !== this.lastEvent) this.say(ev === 1 ? `¡CUOTA CUMPLIDA! +${QUOTA_BONUS} A CADA UNO` : "¡LA CASA COBRA! TODOS A LA CÁRCEL");
    this.lastEvent = ev;
    // Persecuciones: aviso al empezar y, si acabo en la cárcel con alguien detrás, es que me atrapó.
    const chaser = chaserOf(s, this.index);
    if (chaser >= 0 && this.lastChaser < 0) this.say(isGuard(chaser) ? "¡EL GUARDIA TE PERSIGUE! ¡CORRE!" : "¡EL CRUPIER TE PERSIGUE! ¡CORRE!");
    else if (chaser >= 0 && chaser !== this.lastChaser) this.say("¡AVISO POR RADIO! TE BUSCA OTRO GUARDIA");
    const jail = s.ja?.[this.index] ?? 0;
    if (jail > 0 && !this.wasJailed && this.lastChaser >= 0) {
      this.say(isGuard(this.lastChaser) ? "¡EL GUARDIA TE ATRAPÓ! A LA CÁRCEL" : "¡EL CRUPIER TE ATRAPÓ! A LA CÁRCEL");
    }
    this.lastChaser = chaser;
    // Disfraz: lo decide el anfitrión (al comprarlo o cuando un guardia sospecha).
    const dg = s.dg?.[this.index]?.[0] ?? 0;
    if (dg > 0 && this.lastDisguise === 0) this.say(`¡${DISGUISES[dg - 1]}! IRRECONOCIBLE`);
    else if (dg === 0 && this.lastDisguise > 0) this.say("SE TE CAYÓ EL DISFRAZ");
    this.lastDisguise = dg;
    // Lo que me coloca el anfitrión (cabina, celda, silla o salida) incluye el piso.
    const place = (yaw: boolean) => {
      this.body.x = mine[0];
      this.body.z = mine[1];
      this.body.lv = mine[5] === 1 ? 1 : 0;
      this.body.st = -1;
      this.body.y = 0;
      if (yaw) this.body.yaw = mine[2];
    };
    // Baño: el anfitrión me mete en la cabina y, al salir, me deja en la puerta.
    const hid = s.hd?.[this.index] ?? 0;
    if (hid > 0 || this.hidden > 0) place(hid <= 0);
    if (hid <= 0 && this.hidden > 0) this.say("SALES DEL BAÑO");
    this.hidden = hid;
    // Cárcel: si me condenan, el anfitrión me coloca en la celda; al salir, me devuelve al salón.
    this.jail = jail;
    if (jail > 0) {
      if (!this.wasJailed) this.pitch = -0.42;
      place(false);
      this.body.y = 0;
      this.body.kx = 0;
      this.body.kz = 0;
      this.myTable = -1;
      this.wasJailed = true;
    } else if (this.wasJailed) {
      place(true);
      this.wasJailed = false;
      this.trashTaken = -1;
      this.say("¡LIBRE!");
    }
    if (mine[3] !== this.myTable) {
      // El anfitrión manda: te sienta en su silla (o te levanta).
      this.myTable = mine[3];
      place(true);
      this.pending = null;
    } else if (this.myTable >= 0) {
      place(true);
    }
    // Sin nada pendiente, la mesa manda sobre la apuesta que se ve.
    if (!this.pending && this.myTable >= 0) {
      const bet = s.tb[this.myTable]?.b[this.index];
      if (bet) {
        this.selSpot = bet[0];
        this.selAmount = bet[1];
      }
    }
  }

  private spotCount(): number {
    if (this.myTable < 0) return 1;
    return SPOTS[TABLES[this.myTable].kind].length;
  }

  private locked(): boolean {
    const s = this.state;
    if (!s || this.myTable < 0) return false;
    return (s.tb[this.myTable]?.b[this.index]?.[2] ?? 0) === 1;
  }

  /** Manda posición y apuesta al anfitrión (y el golpe, si toca). */
  private send(lock: number, action = 0) {
    this.pending = {
      t: "c", i: ++this.actionId, s: 0,
      x: r2(this.body.x), z: r2(this.body.z), yaw: r2(this.body.yaw), tb: this.myTable,
      sp: this.selSpot, am: this.selAmount, lk: lock,
      ca: action || undefined,
      jy: r2(this.body.y ?? 0) || undefined,
      lv: this.body.lv ?? 0,
    };
  }

  /** Usa la ranura elegida: bate (1), robar con la mano (minijuego) o tirar una moneda (3). */
  /** ¿Llevo basura en la mano? (lo dice el anfitrión). */
  private carrying(): boolean {
    return (this.state?.cy?.[this.index] ?? -1) >= 0;
  }

  private use() {
    if (this.myTable >= 0 || this.jail > 0) return;
    // Con basura en la mano, el clic la tira.
    if (this.carrying()) {
      if (this.batCd > 0) return;
      this.batCd = 0.45;
      this.send(0, 39);
      return;
    }
    if (this.slot === SLOT_HAND) {
      this.startRob();
      return;
    }
    if (this.batCd > 0) return;
    if (this.slot === SLOT_ITEM) {
      if (this.lastItem === ITEM_NONE) {
        this.say("SIN OBJETO · CÓMPRALO EN LA BARRA");
        return;
      }
      this.batCd = 0.45;
      this.send(0, 8);
      return;
    }
    this.batCd = 0.45;
    this.send(0, this.slot === SLOT_BAT ? 1 : 3);
  }

  /** ¿Hay alguien delante al alcance del robo? (según el último estado que llegó). */
  private robTarget(): boolean {
    const s = this.state;
    if (!s) return false;
    const fx = -Math.sin(this.body.yaw);
    const fz = -Math.cos(this.body.yaw);
    for (let i = 0; i < 4; i++) {
      if (i === this.index || s.on[i] !== 1) continue;
      const p = s.pl[i];
      if (!p || p[3] >= 0 || (s.ja?.[i] ?? 0) > 0 || (s.hd?.[i] ?? 0) > 0 || (p[5] ?? 0) !== (this.body.lv ?? 0)) continue;
      const dx = p[0] - this.body.x;
      const dz = p[1] - this.body.z;
      const d = Math.hypot(dx, dz);
      if (d > ROB_REACH || d < 0.01) continue;
      if ((dx * fx + dz * fz) / d >= Math.cos(HIT_ARC)) return true;
    }
    return false;
  }

  /** Minijuego del robo (local): el anfitrión valida el resultado. */
  private startRob() {
    if (this.rob) return;
    if (!this.robTarget()) {
      // Nadie delante: se intenta robar la mesa (el anfitrión mira si el crupier está distraído).
      if (this.batCd <= 0 && nearTable(this.body.x, this.body.z, TABLE_ROB_REACH, this.body.lv ?? 0) >= 0) {
        this.batCd = 0.6;
        this.send(0, 9);
      } else if (this.batCd <= 0) {
        this.say("NADIE CERCA PARA ROBAR");
      }
      return;
    }
    this.rob = { cursor: 0, dir: 1, zone: 0.2 + Math.random() * 0.6 };
  }

  private tickRob(dt: number) {
    const r = this.rob;
    if (!r) return;
    r.cursor += r.dir * ROB_SPEED * dt;
    if (r.cursor > 1) {
      r.cursor = 1;
      r.dir = -1;
    } else if (r.cursor < 0) {
      r.cursor = 0;
      r.dir = 1;
    }
    if (!this.input.takeUse()) return;
    this.rob = null;
    const ok = Math.abs(r.cursor - r.zone) <= ROB_ZONE / 2;
    this.batCd = 0.6;
    this.send(0, ok ? 4 : 5);
    this.say(ok ? "¡ROBO LIMPIO!" : "¡TE PILLARON!");
  }

  /** Mirar con el ratón. */
  private look() {
    const [mx, my] = this.input.takeMouse();
    if (!mx && !my) return;
    this.body.yaw -= mx * MOUSE_TURN;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch - my * MOUSE_PITCH));
  }

  /** Coger basura de la celda o tirarla a la palanca. */
  private useTrash() {
    if (this.trashTaken >= 0) {
      this.trashTaken = -1;
      this.batCd = 0.5;
      this.send(0, 6);
      this.say("¡TIRADA! SI LE DAS A LA PALANCA, TE SUELTAN");
      return;
    }
    let best = -1;
    let bestD = JAIL_PICK;
    JAIL_TRASH.forEach(([x, z], k) => {
      const d = Math.hypot(this.body.x - x, this.body.z - z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    if (best < 0) {
      this.say("NO HAY BASURA CERCA");
      return;
    }
    this.trashTaken = best;
    this.say("BASURA EN LA MANO · CLIC: TIRAR");
  }

  /** Cuerpos de los demás (para no atravesarlos). */
  private others(): Body3[] {
    const s = this.state;
    if (!s) return [];
    const out: Body3[] = [];
    for (let i = 0; i < 4; i++) {
      if (i === this.index || s.on[i] !== 1) continue;
      const p = s.pl[i];
      if (!p || p[3] >= 0) continue;
      if (((s.ja?.[i] ?? 0) > 0) !== (this.jail > 0) || (s.hd?.[i] ?? 0) > 0 || (p[5] ?? 0) !== (this.body.lv ?? 0)) continue;
      out.push({ x: p[0], z: p[1], yaw: p[2], stride: 0 });
    }
    return out;
  }

  private say(text: string) {
    this.notice = text;
    this.noticeT = 1.8;
  }

  update(dt: number) {
    this.time += dt;
    this.dt = dt;
    this.noticeT = Math.max(0, this.noticeT - dt);
    this.batCd = Math.max(0, this.batCd - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.jail = Math.max(0, this.jail - dt);
    this.input.poll();
    const slot = this.input.takeSlot();
    if (slot >= 0) this.slot = slot;
    this.hidden = Math.max(0, this.hidden - dt);
    this.tripCd = Math.max(0, this.tripCd - dt);
    if ((this.body.st ?? -1) < 0) stepJump(this.body, dt);
    if (this.hidden > 0) {
      // Escondido en el baño: solo mirar y, con E, salir. Se recupera el aliento el doble de rápido.
      this.look();
      this.running = this.stamina.step(false, false, dt * 2);
      if (this.input.take("sit")) this.send(0, 13);
      this.input.take("ok");
      this.input.take("jump");
      this.input.take("trip");
      this.input.takeUse();
      return;
    }
    // Corriendo solo se va andando por el salón; en el resto de casos se recupera el aliento.
    if (this.jail > 0 || this.myTable >= 0) this.running = this.stamina.step(false, false, dt);
    if (this.jail > 0) {
      // En la celda: andar por ella y manejar la basura.
      this.input.take("sit");
      this.look();
      this.input.take("jump");
      this.input.take("trip");
      if (!this.rob && this.input.takeUse()) this.useTrash();
      stepPlayer(this.body, { forward: this.input.move, turn: this.input.turn, strafe: this.input.strafe, run: false }, dt, COLLIDERS);
      [this.body.x, this.body.z] = clampToJail(this.body.x, this.body.z);
      this.tickRob(dt);
      return;
    }
    if (this.myTable >= 0) {
      if (this.input.take("sit")) {
        this.myTable = -1;
        this.send(0);
        this.input.clear();
        return;
      }
      const n = this.spotCount();
      if (!this.locked()) {
        if (this.input.take("betLeft")) {
          this.selSpot = (this.selSpot + n - 1) % n;
          this.send(0);
        }
        if (this.input.take("betRight")) {
          this.selSpot = (this.selSpot + 1) % n;
          this.send(0);
        }
        if (this.input.take("betUp")) {
          this.selAmount = Math.min(100, this.selAmount + 1);
          this.send(0);
        }
        if (this.input.take("betDown")) {
          this.selAmount = Math.max(1, this.selAmount - 1);
          this.send(0);
        }
      } else {
        this.input.take("betLeft");
        this.input.take("betRight");
        this.input.take("betUp");
        this.input.take("betDown");
      }
      // Enter o clic: listo (o cambiar la apuesta).
      if (this.input.take("ok") || this.input.takeClick()) this.send(this.locked() ? 0 : 1);
      this.input.take("use");
      this.input.take("jump");
      this.input.take("trip");
    } else {
      this.look();
      if (this.input.take("sit")) {
        const lv = this.body.lv ?? 0;
        const near = nearTable(this.body.x, this.body.z, REACH, lv);
        const dummy = nearMannequin(this.body.x, this.body.z, lv);
        const litter = this.carrying() ? -1 : nearLitter(this.body.x, this.body.z, lv, (k) => (this.state?.lt?.[k] ?? 0) === 1);
        if (near >= 0) {
          const [x, z, yaw] = seatSpot(TABLES[near], this.index);
          this.body.x = x;
          this.body.z = z;
          this.body.yaw = yaw;
          this.myTable = near;
          this.selSpot = 0;
          this.selAmount = 1;
          this.send(0);
        } else if (litter >= 0) {
          // Coger basura del suelo: el anfitrión comprueba que siga ahí.
          this.send(0, 40 + litter);
        } else if (nearShop(this.body.x, this.body.z, lv)) {
          // Comprar en la barra: el anfitrión cobra y sortea el objeto.
          this.send(0, 7);
        } else if (nearSwitch(this.body.x, this.body.z, lv)) {
          // Forzar la caja de la fuga: el anfitrión lleva el forcejeo y suelta a los presos.
          this.send(0, 10);
          this.say("¡FORZANDO LA CAJA! NO TE MUEVAS");
        } else if (nearBath(this.body.x, this.body.z, lv) >= 0) {
          // Esconderse en el baño: el anfitrión decide si el que te persigue te ha visto entrar.
          this.send(0, 12);
        } else if (dummy >= 0) {
          // Boutique: probarse el disfraz de ese maniquí (el anfitrión cobra).
          this.send(0, 30 + dummy);
        }
        this.input.clear();
        return;
      }
      this.input.take("betLeft");
      this.input.take("betRight");
      this.input.take("betUp");
      this.input.take("betDown");
      // Espacio salta (lo llevo yo y viaja en el latido); Q saca el pie; clic (o F) usa la mano.
      if (this.input.take("jump") && this.stun <= 0 && (this.body.st ?? -1) < 0) jump(this.body);
      if (this.input.take("trip") && this.tripCd <= 0 && this.stun <= 0) {
        this.tripCd = TRIP_CD;
        this.send(0, 11);
      }
      this.input.take("ok");
      if (!this.rob && this.input.takeUse()) this.use();
      // 5–8: emotes (el anfitrión los reparte a todos).
      const emote = this.input.takeEmote();
      if (emote) {
        this.send(0, 20 + emote);
        this.emoteStop = false;
      }
      // Moverse corta el emote: se pide una vez (hasta que el estado lo confirme).
      const emoting = (this.state?.em?.[this.index] ?? 0) > 0;
      if (!emoting) this.emoteStop = false;
      else if (!this.emoteStop && !emote && (this.input.move || this.input.strafe || this.input.turn)) {
        this.emoteStop = true;
        this.send(0, 20);
      }
      this.running = this.stamina.step(this.input.run && this.stun <= 0, this.input.move !== 0 || this.input.strafe !== 0, dt);
      stepPlayer(
        this.body,
        // Aturdido o agarrado no se anda (el empujón del golpe sí te mueve).
        this.stun > 0 ? { forward: 0, turn: 0, strafe: 0, run: false } : { forward: this.input.move, turn: this.input.turn, strafe: this.input.strafe, run: this.running },
        dt,
        bodyColliders(this.body),
        this.others(),
      );
      // Escaleras andando: el piso nuevo viaja en el latido.
      stairStep(this.body);
    }
    this.tickRob(dt);
  }

  outgoing(transport: Transport): object | undefined {
    if (!this.state) return undefined;
    const now = performance.now();
    // Con algo pendiente (apuesta o golpe) se manda de inmediato: un golpe no puede esperar al latido.
    const every = this.pending ? 0 : POS_MS;
    if (now - this.lastSentAt < every) return undefined;
    this.lastSentAt = now;
    const msg: CasinoMsg = this.pending ?? {
      t: "c", i: this.actionId, s: 0,
      x: r2(this.body.x), z: r2(this.body.z), yaw: r2(this.body.yaw), tb: this.myTable,
      sp: this.selSpot, am: this.selAmount, lk: 0,
      jy: r2(this.body.y ?? 0) || undefined,
      lv: this.body.lv ?? 0,
    };
    return { ...msg, s: ++this.seq };
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const s = this.state;
    const hud = {
      slot: this.slot,
      notice: this.notice,
      noticeT: this.noticeT,
      stun: this.stun,
      batCd: this.batCd,
      rob: this.rob ? [this.rob.cursor, this.rob.zone] as [number, number] : null,
      jail: this.jail,
      trash: this.trashTaken,
      look: lookMode(),
      stamina: this.stamina.value,
      tired: this.stamina.tired,
      running: this.running,
      hidden: this.hidden,
      tripCd: this.tripCd,
    };
    if (!s) {
      const empty: CasinoSnap = {
        g: "casino", base: -1, seq: 0,
        pl: [[0, 0, 0, -1], [0, 0, 0, -1], [0, 0, 0, -1], [0, 0, 0, -1]],
        ch: [0, 0, 0, 0], tb: TABLES.map(() => null), ak: [0, 0, 0, 0], on: [0, 0, 0, 0],
        cg: [null, null, null, null], co: [], ja: [0, 0, 0, 0],
      };
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, CW, CH);
      drawHud(ctx, { s: empty, me: this.index, myTable: -1, near: -1, zone: "", stair: 0, mannequin: -1, litter: false, carrying: false, shop: false, jailSwitch: false, bath: false, selSpot: 0, netLabel: this.netLabel, ready: false, time: this.time, ...hud });
      return;
    }
    // El muñeco propio se dibuja donde lo tengo yo (respuesta inmediata al andar).
    const snap: CasinoSnap = {
      ...s,
      pl: s.pl.map((p, i) => (i === this.index ? [r2(this.body.x), r2(this.body.z), r2(this.body.yaw), this.myTable, r2(this.body.y ?? 0), this.body.lv ?? 0] : p)),
    };
    const lv = this.body.lv ?? 0;
    const free = this.myTable < 0 && this.jail <= 0 && this.hidden <= 0;
    const near = this.myTable >= 0 ? -1 : nearTable(this.body.x, this.body.z, REACH, lv);
    const stair = free && near < 0 && lv === 0 && (this.body.st ?? -1) < 0 ? nearStairFoot(this.body.x, this.body.z) : -1;
    const stage = (this.stage ??= new CasinoStage());
    stage.update({
      s: snap, me: this.index, myTable: this.myTable, near, time: this.time,
      slot: this.slot, swing: this.rob ? 0 : this.batCd > 0.15 ? 0.3 : 0, trashTaken: this.trashTaken, pitch: this.pitch,
      running: this.running, jumpY: this.body.y ?? 0, level: lv, carry: this.carrying(),
    }, this.dt);
    stage.render(ctx, pixelScale);
    drawNames(ctx, stage, snap, this.index);
    drawHud(ctx, {
      s: snap,
      me: this.index,
      myTable: this.myTable,
      near,
      zone: this.jail > 0 ? "CÁRCEL" : zoneAt(this.body.x, this.body.z, lv),
      litter: free && near < 0 && !this.carrying() && nearLitter(this.body.x, this.body.z, lv, (k) => (s.lt?.[k] ?? 0) === 1) >= 0,
      carrying: this.carrying(),
      stair: stair < 0 ? 0 : lv === 0 ? 1 : 2,
      mannequin: free && near < 0 ? nearMannequin(this.body.x, this.body.z, lv) : -1,
      shop: free && near < 0 && nearShop(this.body.x, this.body.z, lv),
      jailSwitch: free && near < 0 && nearSwitch(this.body.x, this.body.z, lv),
      bath: free && near < 0 && nearBath(this.body.x, this.body.z, lv) >= 0,
      selSpot: this.selSpot,
      netLabel: this.netLabel,
      ready: true,
      time: this.time,
      ...hud,
    });
  }
}

/** Tipo de una mesa dentro del estado (puede venir vacía). */
export type MaybeTable = TableSnap | null;
