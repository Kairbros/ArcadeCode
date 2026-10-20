// Casino entre amigos en el hub: un salón 3D por el que se anda hasta las mesas. El anfitrión lleva las
// cinco mesas (y tira los dados); cada jugador mueve su muñeco en su pantalla y manda dónde está y qué
// apuesta. Los invitados dibujan el estado que reciben.
import { fitText, shadowText } from "../core/draw";
import type { Transport } from "../net/protocol";
import type { GuestGame, HostGame, NetFrame } from "../net/types";
import {
  BAT_CD, BODY_R, BUMP, CH, CW, DROP_LIFE, DROP_MAX, GRAB_CD, GRAB_HOLD, GRAB_REACH, GRAB_STEAL, HIT_ARC, HIT_REACH,
  HIT_STUN, JAIL_PICK, JAIL_TIME, KNOCK, MOUSE_PITCH, MOUSE_TURN, PICK_REACH, PITCH_MAX, REACH, RESCUE, ROB_MAX, ROB_REACH,
  ROB_SPEED, ROB_ZONE, SLOT_BAT, SLOT_COINS, SLOT_HAND, START_CHIPS, STEAL_MAX,
} from "./config";
import { drawHud, type HudView } from "./hud";
import { lookMode, type CasinoInput } from "./input";
import { stepPlayer, type Body3 } from "./player3d";
import { CasinoStage } from "./scene";
import { GAMES_LIST, SPOTS, Table, type CasinoSnap, type TableSnap } from "./table";
import {
  clampToHall, clampToJail, COLLIDERS, JAIL_LEVER, JAIL_SPOT, JAIL_TRASH, nearTable, seatSpot, SPAWNS, standSpot, TABLES,
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
  /** Golpe con lo que lleva en la mano: 1 bate, 2 mano (0 o ausente = nada). */
  ca?: number;
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
}

/** Cada cuánto se manda la posición. */
const POS_MS = 110;
const r2 = (v: number) => Math.round(v * 100) / 100;
const int = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : def);
const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);

/** Nombre sobre la cabeza de cada jugador (lo usan anfitrión e invitado). */
function drawNames(ctx: CanvasRenderingContext2D, stage: CasinoStage, s: CasinoSnap, me: number) {
  for (let i = 0; i < 4; i++) {
    if (i === me || s.on[i] !== 1) continue;
    const p = s.pl[i];
    if (!p) continue;
    const at = stage.project(p[0], 2.4, p[1]);
    if (!at || at[2] > 26) continue;
    shadowText(ctx, fitText(ctx, `J${i + 1} · ${s.ch[i]}`, 60, "5px"), at[0], at[1], [235, 235, 245], "5px", "center");
  }
}

/** Anfitrión (o partida local): dueño de las mesas y del bolsillo de todos. */
export class CasinoHost implements HostGame {
  readonly size = [CW, CH] as const;
  netLabel = "";
  /** No hay final: se sale con Esc o se cambia de juego con J. */
  readonly finished = true;
  readonly tables = GAMES_LIST.map((g) => new Table(g));
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

  constructor(private input: CasinoInput, remoteCount: number, readonly mode: "local" | "host") {
    this.bodies = SPAWNS.map(([x, z], i) => ({ x, z, yaw: 0, stride: i * 0.7 }));
    for (let i = 1; i <= Math.min(3, remoteCount); i++) this.online[i] = true;
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
    if (this.jail[0] > 0) this.jailInput(dt);
    else if (this.seated[0] >= 0) this.seatedInput();
    else this.walkInput(dt);
    this.tickRob(dt);
    for (const t of this.tables) t.update(dt, this.chips);
    this.tickDrops(dt);
    this.tickBumps();
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
    if (this.input.take("ok")) this.useTrash(0);
    stepPlayer(this.bodies[0], { forward: this.input.move, turn: this.input.turn, run: false }, dt, COLLIDERS);
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
    this.say("BASURA EN LA MANO · ESPACIO: TIRAR");
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
    const stop = this.input.take("ok") || this.input.takeClick();
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
      const near = nearTable(body.x, body.z, REACH);
      if (near >= 0) this.sit(0, near);
      this.input.clear();
      return;
    }
    // Andando, ← → giran: no valen para apostar.
    this.input.take("betLeft");
    this.input.take("betRight");
    this.input.take("betUp");
    this.input.take("betDown");
    // ESPACIO/ENTER: usar lo que llevas en la mano (bate, robar o tirar una moneda).
    if (!this.rob && this.input.take("ok")) this.use(0);
    const stunned = this.fight[0].stun > 0;
    stepPlayer(
      body,
      // Aturdido o agarrado no se anda, pero el empujón sí te mueve.
      stunned ? { forward: 0, turn: 0, run: false } : { forward: this.input.move, turn: this.input.turn, run: this.input.run },
      dt,
      COLLIDERS,
      this.others(0),
    );
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
    if (this.input.take("ok")) t.toggleLock(0, chips);
  }

  /** Los demás cuerpos (para no atravesarlos al andar). */
  private others(me: number): Body3[] {
    return this.bodies.filter((_, i) => i !== me && this.online[i] && this.seated[i] < 0);
  }

  /** Usa lo que lleva en la mano: bate, robar (mano) o tirar monedas. */
  private use(player: number) {
    if (this.seated[player] >= 0 || this.jail[player] > 0) return;
    if (this.slot === SLOT_BAT) this.strike(player, 1);
    else if (this.slot === SLOT_HAND) this.startRob(player);
    else this.toss(player);
  }

  /** Empieza el minijuego del robo: hay que parar la marca en la zona buena. */
  private startRob(player: number) {
    if (this.rob || this.fight[player].grabCd > 0) return;
    const target = this.findTarget(player, ROB_REACH);
    if (target < 0) {
      if (player === 0) this.say("NADIE CERCA PARA ROBAR");
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
      if (target < 0) return;
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
      if (j === me || !this.online[j] || this.seated[j] >= 0) continue;
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
        if (!this.online[j] || this.seated[j] >= 0) continue;
        // Quien la soltó no puede recuperarla de inmediato: hay que ganársela.
        if (j === d.owner && d.lock > 0) continue;
        const b = this.bodies[j];
        if (Math.hypot(b.x - d.x, b.z - d.z) <= PICK_REACH) {
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
    this.seated[player] = table;
    this.tables[table].sit(player, true);
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
    }
    this.drops.length = 0;
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
      pl: this.bodies.map((b, i) => [r2(b.x), r2(b.z), r2(b.yaw), this.seated[i]]),
      ch: [...this.chips],
      // Solo viajan las mesas con alguien sentado; las vacías se quedan como estén en el cliente.
      tb: this.tables.map((t) => (t.players().length ? t.snap() : null)),
      ak: [...this.acks],
      on: this.online.map((o) => (o ? 1 : 0)),
      cg: [0, 1, 2, 3].map((i) => this.fightSnap(i)),
      co: this.drops.map((d) => [Math.round(d.x * 10) / 10, Math.round(d.z * 10) / 10, Math.round(d.t * 10) / 10]),
      ja: this.jail.map((v) => Math.round(v * 10) / 10),
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
      // Mientras estás sentado, la mesa manda: no se acepta que te muevas.
      if (this.seated[index] < 0) {
        body.x = num(m.x, body.x);
        body.z = num(m.z, body.z);
        body.yaw = num(m.yaw, body.yaw);
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
  }

  // --- Dibujo ------------------------------------------------------------------------------
  private view(s: CasinoSnap): HudView {
    const body = this.bodies[0];
    const near = this.seated[0] >= 0 ? -1 : nearTable(body.x, body.z, REACH);
    return {
      s,
      me: 0,
      myTable: this.seated[0],
      near,
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
    };
  }

  draw(ctx: CanvasRenderingContext2D, pixelScale = 1) {
    const s = this.snap();
    const stage = (this.stage ??= new CasinoStage());
    const v = this.view(s);
    stage.update({
      s, me: 0, myTable: v.myTable, near: v.near, time: this.time,
      slot: this.slot, swing: this.fight[0].swing, trashTaken: this.trashTaken, pitch: this.bodies[0].pitch ?? 0,
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
    // Cárcel: si me condenan, el anfitrión me coloca en la celda; al salir, me devuelve al salón.
    const jail = s.ja?.[this.index] ?? 0;
    this.jail = jail;
    if (jail > 0) {
      if (!this.wasJailed) this.pitch = -0.42;
      this.body.x = mine[0];
      this.body.z = mine[1];
      this.body.kx = 0;
      this.body.kz = 0;
      this.myTable = -1;
      this.wasJailed = true;
    } else if (this.wasJailed) {
      this.body.x = mine[0];
      this.body.z = mine[1];
      this.body.yaw = mine[2];
      this.wasJailed = false;
      this.trashTaken = -1;
    }
    if (mine[3] !== this.myTable) {
      // El anfitrión manda: te sienta en su silla (o te levanta).
      this.myTable = mine[3];
      this.body.x = mine[0];
      this.body.z = mine[1];
      this.body.yaw = mine[2];
      this.pending = null;
    } else if (this.myTable >= 0) {
      this.body.x = mine[0];
      this.body.z = mine[1];
      this.body.yaw = mine[2];
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
    };
  }

  /** Usa la ranura elegida: bate (1), robar con la mano (minijuego) o tirar una moneda (3). */
  private use() {
    if (this.myTable >= 0 || this.jail > 0) return;
    if (this.slot === SLOT_HAND) {
      this.startRob();
      return;
    }
    if (this.batCd > 0) return;
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
      if (!p || p[3] >= 0 || (s.ja?.[i] ?? 0) > 0) continue;
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
      this.say("NADIE CERCA PARA ROBAR");
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
    if (!(this.input.take("ok") || this.input.takeClick())) return;
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
    this.say("BASURA EN LA MANO · ESPACIO: TIRAR");
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
    if (this.jail > 0) {
      // En la celda: andar por ella y manejar la basura.
      this.input.take("sit");
      this.look();
      if (!this.rob && this.input.take("ok")) this.useTrash();
      stepPlayer(this.body, { forward: this.input.move, turn: this.input.turn, run: false }, dt, COLLIDERS);
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
      if (this.input.take("ok")) this.send(this.locked() ? 0 : 1);
    } else {
      this.look();
      if (this.input.take("sit")) {
        const near = nearTable(this.body.x, this.body.z, REACH);
        if (near >= 0) {
          const [x, z, yaw] = seatSpot(TABLES[near], this.index);
          this.body.x = x;
          this.body.z = z;
          this.body.yaw = yaw;
          this.myTable = near;
          this.selSpot = 0;
          this.selAmount = 1;
          this.send(0);
        }
        this.input.clear();
        return;
      }
      this.input.take("betLeft");
      this.input.take("betRight");
      this.input.take("betUp");
      this.input.take("betDown");
      // ESPACIO/ENTER: usar lo que llevas en la mano.
      if (!this.rob && this.input.take("ok")) this.use();
      stepPlayer(
        this.body,
        // Aturdido o agarrado no se anda (el empujón del golpe sí te mueve).
        this.stun > 0 ? { forward: 0, turn: 0, run: false } : { forward: this.input.move, turn: this.input.turn, run: this.input.run },
        dt,
        COLLIDERS,
        this.others(),
      );
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
    };
    if (!s) {
      const empty: CasinoSnap = {
        g: "casino", base: -1, seq: 0,
        pl: [[0, 0, 0, -1], [0, 0, 0, -1], [0, 0, 0, -1], [0, 0, 0, -1]],
        ch: [0, 0, 0, 0], tb: [null, null, null, null, null], ak: [0, 0, 0, 0], on: [0, 0, 0, 0],
        cg: [null, null, null, null], co: [], ja: [0, 0, 0, 0],
      };
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, CW, CH);
      drawHud(ctx, { s: empty, me: this.index, myTable: -1, near: -1, selSpot: 0, netLabel: this.netLabel, ready: false, time: this.time, ...hud });
      return;
    }
    // El muñeco propio se dibuja donde lo tengo yo (respuesta inmediata al andar).
    const snap: CasinoSnap = {
      ...s,
      pl: s.pl.map((p, i) => (i === this.index ? [r2(this.body.x), r2(this.body.z), r2(this.body.yaw), this.myTable] : p)),
    };
    const near = this.myTable >= 0 ? -1 : nearTable(this.body.x, this.body.z, REACH);
    const stage = (this.stage ??= new CasinoStage());
    stage.update({
      s: snap, me: this.index, myTable: this.myTable, near, time: this.time,
      slot: this.slot, swing: this.rob ? 0 : this.batCd > 0.15 ? 0.3 : 0, trashTaken: this.trashTaken, pitch: this.pitch,
    }, this.dt);
    stage.render(ctx, pixelScale);
    drawNames(ctx, stage, snap, this.index);
    drawHud(ctx, {
      s: snap,
      me: this.index,
      myTable: this.myTable,
      near,
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
