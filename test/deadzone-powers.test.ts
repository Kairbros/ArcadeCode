// Dead Zone: poderes que sueltan los zombis (munición máxima, Katabum, muerte instantánea, puntos dobles, munición
// infinita, carpintero), cuchillo sin balas y cabeza distinta del cuerpo (zombi «poroto» con cuello).
import { check } from "./lib";
import * as THREE from "three";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneGuest, DeadZoneHost, type DzMsg } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";
import { POWERS, POWER_KINDS, POWER_TUNING, PowerUps, pickPower } from "../src/game/deadzone/game/powerups";
import { KNIFE, WEAPONS } from "../src/game/deadzone/weapons/defs";
import { ZOMBIES } from "../src/game/deadzone/enemies/defs";
import { MAX_PLANKS } from "../src/game/deadzone/world/map";
import { PLAYER_SPAWN } from "../src/game/deadzone/world/mapdata";
import { seededRandom } from "../src/game/deadzone/core/math";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const priv = (x: unknown) => x as Any;

const fakeKeyboard = () => {
  const down = new Set<string>();
  const kb = { isDown: (c: string) => down.has(c), anyDown: (cs: readonly string[]) => cs.some((c) => down.has(c)) };
  return { kb: kb as unknown as Keyboard, down };
};

function makeHost(players: number) {
  const { kb, down } = fakeKeyboard();
  const host = new DeadZoneHost(new Input(kb), players - 1, "host");
  const ids = [0, 0, 0, 0];
  const send = (i: number, extra: Partial<DzMsg> = {}, at?: { x?: number; z?: number; yaw?: number; pitch?: number; fl?: number }) => {
    const p = host.seats[i].p;
    host.onMessage(i, {
      t: "z", i: ++ids[i], s: 0, x: at?.x ?? p.position.x, y: p.position.y, z: at?.z ?? p.position.z,
      yaw: at?.yaw ?? p.yaw, pitch: at?.pitch ?? p.pitch, fl: at?.fl ?? 0, rv: host.seats[i].reviveSeq, ...extra,
    });
  };
  const step = (secs: number, dt = 1 / 30) => {
    for (let t = 0; t < secs; t += dt) host.update(dt);
  };
  return { host, send, step, down };
}

// --- 1 · Lógica pura de los poderes ---------------------------------------------------------------------
console.log("Poderes (lógica)");
{
  const pu = new PowerUps();
  let first = 0;
  for (let k = 1; k <= POWER_TUNING.firstGuaranteed && !first; k++) if (pu.onKill(1, 2, () => 0.99)) first = k;
  check(first === POWER_TUNING.firstGuaranteed, "el primer poder cae sí o sí con la baja garantizada", `baja ${first}`);
  check(pu.onKill(1, 2, () => 0) === null, "no caen dos poderes seguidos (mínimo de bajas entre ambos)");
  for (let k = 0; k < POWER_TUNING.minKillsBetween; k++) pu.onKill(0, 0, () => 0.99);
  check(pu.onKill(3, 4, () => 0) !== null, "pasado el mínimo de bajas, la suerte decide");

  const rnd = seededRandom(5);
  const seen = new Set(Array.from({ length: 600 }, () => pickPower(rnd)));
  check(POWER_KINDS.every((k) => seen.has(k)), "el sorteo puede dar los seis poderes");

  const q = new PowerUps();
  const d = q.drop("nuke", 5, 5);
  check(q.pickup([{ x: 20, z: 20, alive: true }]) === null, "lejos no se coge");
  check(q.pickup([{ x: 5.2, z: 5, alive: false }]) === null, "un jugador abatido no lo coge");
  const got = q.pickup([{ x: 30, z: 0, alive: true }, { x: 5.4, z: 5, alive: true }]);
  check(got?.drop.id === d.id && got.who === 1, "lo coge el jugador que está cerca");
  check(q.drops.length === 0, "al cogerlo desaparece del suelo");
  q.drop("maxAmmo", 0, 0);
  q.update(POWER_TUNING.lifetime + 0.1);
  check(q.drops.length === 0, "si nadie lo coge, desaparece");
  q.activate("instaKill");
  check(q.instaKill && !q.doublePoints, "el efecto queda activo");
  const ended = q.update(POWERS.instaKill.duration + 0.1);
  check(!q.instaKill && ended.includes("instaKill"), "el efecto se agota y se avisa");
}

// --- 2 · En la partida: cada poder hace lo suyo ----------------------------------------------------------
console.log("Poderes (partida)");
{
  const { host, step, send } = makeHost(2);
  step(1);
  const s0 = host.seats[0];
  const s1 = host.seats[1];
  const at = (kind: Parameters<PowerUps["drop"]>[0]) => {
    host.powers.drop(kind, s0.p.position.x, s0.p.position.z);
    step(0.1);
  };
  /** Agota el tiempo de los efectos sin simular segundos (los zombis acabarían la partida). */
  const expire = (secs: number) => {
    host.powers.update(secs);
    step(0.05);
  };
  const gx = PLAYER_SPAWN.x;
  const gz = PLAYER_SPAWN.z;
  /** El invitado 1 dispara de frente (como en la prueba de red). */
  const shoot = () => {
    send(1, { ca: 1 }, { x: gx, z: gz, yaw: 0, pitch: -0.14, fl: 8 });
    step(0.3);
  };

  // Munición máxima: llena a todo el equipo.
  s0.weapons.ammo.pistol.mag = 1;
  s0.weapons.ammo.pistol.reserve = 0;
  s1.weapons.ammo.pistol.mag = 0;
  s1.weapons.ammo.pistol.reserve = 3;
  at("maxAmmo");
  const pist = WEAPONS.pistol;
  check(s0.weapons.ammo.pistol.mag === pist.magSize && s0.weapons.ammo.pistol.reserve === pist.reserveMax, "munición máxima rellena al que la coge", JSON.stringify(s0.weapons.ammo.pistol));
  check(s1.weapons.ammo.pistol.mag === pist.magSize && s1.weapons.ammo.pistol.reserve === pist.reserveMax, "y también a su compañero");

  // Puntos dobles.
  at("doublePoints");
  const p0 = s0.points.balance;
  s0.points.add(100);
  check(s0.points.balance - p0 === 200 && s1.points.multiplier === 2, "puntos dobles duplica lo que se gana", `${s0.points.balance - p0}`);
  expire(POWERS.doublePoints.duration + 0.5);
  check(s0.points.multiplier === 1, "al acabar vuelve a ganar normal");

  // Munición infinita: se dispara sin gastar.
  at("infiniteAmmo");
  check(host.powers.infiniteAmmo, "munición infinita activa");
  const m0 = s1.weapons.currentAmmo.mag;
  const r0 = s1.weapons.currentAmmo.reserve;
  const f0 = s1.fireSeq;
  for (let k = 0; k < 8; k++) shoot();
  check(s1.fireSeq - f0 >= 6, "dispara varias veces", `${s1.fireSeq - f0}`);
  check(s1.weapons.currentAmmo.mag === m0 && s1.weapons.currentAmmo.reserve === r0, "con munición infinita no baja el cargador ni la reserva", `${s1.weapons.currentAmmo.mag}/${s1.weapons.currentAmmo.reserve}`);
  expire(POWERS.infiniteAmmo.duration + 0.5);
  shoot();
  check(s1.weapons.currentAmmo.mag < m0, "al acabar vuelve a gastar munición");

  // Muerte instantánea: un tiro mata a un bruto.
  host.stage.zombies.clear();
  const brute = host.stage.zombies.spawn("brute", 8, gx, gz - 6);
  brute.state = "chasing";
  const hp = brute.hp;
  at("instaKill");
  check(host.powers.instaKill, "muerte instantánea activa");
  s1.weapons.ammo.pistol.mag = 5;
  send(1, { ca: 1 }, { x: gx, z: gz, yaw: 0, pitch: -0.14, fl: 8 });
  step(0.1);
  check(hp > pist.damage * 2 && !brute.alive, "un solo disparo mata a un bruto", `hp ${hp}`);
  expire(POWERS.instaKill.duration + 0.5);

  // Carpintero: barricadas enteras.
  for (const w of host.stage.map.windows) w.planks = 0;
  at("carpenter");
  check(host.stage.map.windows.every((w) => w.planks === MAX_PLANKS), "carpintero arregla todas las barricadas");

  // Katabum: mueren todos y cobra el equipo.
  host.stage.zombies.clear();
  const zs = [0, 1, 2, 3].map((k) => host.stage.zombies.spawn("walker", 1, 2 + k, 3));
  const before = s1.points.balance;
  const killed0 = host.rounds.killed;
  at("nuke");
  check(zs.every((z) => !z.alive), "katabum mata a todos los zombis");
  check(host.rounds.killed - killed0 >= 4, "y cuentan para la ronda");
  check(s1.points.balance - before >= POWER_TUNING.nukePoints, "todo el equipo cobra puntos");
  host.dispose();
}

// --- 3 · Cuchillo ---------------------------------------------------------------------------------------
console.log("Cuchillo");
{
  const { host, step, send, down } = makeHost(2);
  step(1);
  const s0 = host.seats[0];
  host.stage.zombies.clear();
  s0.p.yaw = 0;
  s0.p.pitch = 0;
  const near = host.stage.zombies.spawn("walker", 1, s0.p.position.x, s0.p.position.z - 1.4);
  near.state = "chasing";
  const behind = host.stage.zombies.spawn("walker", 1, s0.p.position.x, s0.p.position.z + 1.4);
  behind.state = "chasing";
  const m = s0.weapons.currentAmmo.mag;
  const hpNear = near.hp;
  const hpBehind = behind.hp;
  down.add("KeyV");
  step(0.1);
  down.delete("KeyV");
  check(near.hp < hpNear || !near.alive, "V corta al zombi de delante", `${hpNear} → ${near.hp}`);
  check(behind.hp === hpBehind && behind.alive, "no corta al de detrás");
  check(s0.weapons.currentAmmo.mag === m, "el cuchillo no gasta munición");
  check(KNIFE.damage >= ZOMBIES.walker.hp, "un tajo basta para un infectado normal", `${KNIFE.damage} vs ${ZOMBIES.walker.hp}`);

  // Sin balas: el clic saca el cuchillo; con balas, dispara.
  host.stage.zombies.clear();
  const gx = PLAYER_SPAWN.x;
  const gz = PLAYER_SPAWN.z;
  const sg = host.seats[1];
  const z = host.stage.zombies.spawn("walker", 1, gx, gz - 1.3);
  z.state = "chasing";
  step(KNIFE.cooldown + 0.1);
  sg.weapons.ammo.pistol.mag = 0;
  sg.weapons.ammo.pistol.reserve = 0;
  check(sg.weapons.outOfAmmo, "sin cargador ni reserva se detecta «sin balas»");
  const kills0 = sg.kills;
  send(1, { ca: 1 }, { x: gx, z: gz, yaw: 0, pitch: 0 });
  step(0.1);
  check(!z.alive && sg.kills === kills0 + 1, "sin balas el clic da un tajo y mata al zombi");

  // Un invitado también puede (acción 6).
  const z2 = host.stage.zombies.spawn("walker", 1, PLAYER_SPAWN.x + 0.4, PLAYER_SPAWN.z - 1.3);
  z2.state = "chasing";
  const g = host.seats[1];
  g.meleeCd = 0;
  send(1, { ca: 6 }, { x: PLAYER_SPAWN.x + 0.4, z: PLAYER_SPAWN.z, yaw: 0, pitch: 0 });
  step(0.05);
  check(z2.hp < z2.def.hp || !z2.alive, "el invitado usa el cuchillo por red");
  host.dispose();
}

// --- 4 · Red: snapshot con poderes ----------------------------------------------------------------------
console.log("Poderes por red");
{
  const { host, step } = makeHost(2);
  const { kb } = fakeKeyboard();
  const guest = new DeadZoneGuest(1, new Input(kb));
  step(2);
  host.powers.drop("nuke", PLAYER_SPAWN.x + 6, PLAYER_SPAWN.z - 6);
  host.powers.activate("doublePoints");
  step(0.1);
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check(Array.isArray(snap.pw) && snap.pw.length === 1 && snap.fx.length === 4 && snap.fx[1] > 0, "el estado trae poderes del suelo y efectos activos");
  guest.onSnap(snap);
  guest.update(1 / 30);
  const meshes = priv(guest).stage.powerDrops.group.children.length;
  check(meshes === 1, "el invitado dibuja el poder del suelo", `${meshes}`);
  const hv = priv(guest).hudView();
  check(hv.fx[1] > 0 && hv.noAmmo === false, "el HUD del invitado muestra los efectos");
  guest.dispose();
  host.dispose();
}

// --- 5 · Cabeza y cuerpo ---------------------------------------------------------------------------------
console.log("Cabeza y cuello");
{
  const { host, step } = makeHost(1);
  step(1);
  host.stage.zombies.clear();
  const s0 = host.seats[0];
  const z = host.stage.zombies.spawn("walker", 1, s0.p.position.x, s0.p.position.z - 8);
  z.state = "idle" as never;
  const eye = s0.p.eyePosition();
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const fwd = V(0, 0, -1);
  const origin = V(eye.x, z.position.y + 1.1, eye.z);
  const body = host.stage.zombies.hitscan(origin, fwd, 20);
  check(body.length === 1 && !body[0].head, "a la altura del pecho es cuerpo");
  const headO = V(eye.x, z.position.y + z.def.height * 0.97, eye.z);
  const head = host.stage.zombies.hitscan(headO, fwd, 20);
  check(head.length === 1 && head[0].head, "a la altura de la bola de la cabeza es cabeza");
  const neckO = V(eye.x, z.position.y + z.def.height * 0.72, eye.z); // hombros: justo debajo de la cabeza
  const neck = host.stage.zombies.hitscan(neckO, fwd, 20);
  check(neck.length === 1 && !neck[0].head, "a la altura de los hombros (bajo la cabeza) es cuerpo");
  check(WEAPONS.pistol.headshot >= 2.4, "la cabeza hace mucho más daño", `x${WEAPONS.pistol.headshot}`);
  host.dispose();
}

// --- 6 · Bonificaciones: puntos extra, liquidación y ametralladora -----------------------------------------
console.log("Bonificaciones");
{
  const { host, step, send } = makeHost(2);
  step(1);
  const s0 = host.seats[0];
  const s1 = host.seats[1];
  const gx = PLAYER_SPAWN.x;
  const gz = PLAYER_SPAWN.z;
  const at = (kind: Parameters<PowerUps["drop"]>[0]) => {
    host.powers.drop(kind, s0.p.position.x, s0.p.position.z);
    step(0.1);
  };
  const p0 = [s0.points.balance, s1.points.balance];
  at("bonusPoints");
  const g0 = s0.points.balance - p0[0];
  check(g0 >= POWER_TUNING.bonusMin && g0 <= POWER_TUNING.bonusMax && s1.points.balance - p0[1] === g0, "puntos de bonificación: lo mismo para todo el equipo", `+${g0}`);

  const price = host.stage.map.box.price;
  at("fireSale");
  check(host.stage.map.box.price === POWER_TUNING.fireSalePrice, "liquidación: la caja cuesta 10", `${price} → ${host.stage.map.box.price}`);
  host.powers.update(POWERS.fireSale.duration + 0.5);
  step(0.1);
  check(host.stage.map.box.price === price, "al acabar la liquidación, vuelve el precio");

  at("deathMachine");
  check(s0.deathT > 0 && s1.deathT === 0, "ametralladora: solo la tiene quien coge el poder");
  check(s0.weapons.autoAll, "…dispara en automático", "");
  // El invitado dispara a ráfagas con la pistola: sin la ametralladora solo un tiro por clic.
  s0.weapons.ammo.pistol.mag = 3;
  s0.weapons.ammo.pistol.reserve = 0;
  step(2);
  check(s0.weapons.currentAmmo.mag === 8, "…y el cargador se mantiene lleno (munición infinita)", `${s0.weapons.currentAmmo.mag}`);
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check(snap.dm[0] > 0 && snap.dm[1] === 0, "el estado de red lleva los segundos de ametralladora");
  send(1, {}, { x: gx, z: gz });
  s0.deathT = 0.2;
  step(0.6);
  check(s0.deathT === 0 && !s0.weapons.autoAll, "al acabar, vuelve el arma normal");
  host.dispose();
}
