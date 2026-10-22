// Dead Zone: solo dos armas, cuchillo con V o Q, abatido que sigue disparando, pausa y cambio de ronda al estilo CoD.
import { check } from "./lib";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneGuest, DeadZoneHost, type DzMsg } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";
import { MAX_SLOTS, WeaponSystem } from "../src/game/deadzone/weapons/system";
import { WEAPONS } from "../src/game/deadzone/weapons/defs";
import { PERK_TUNING } from "../src/game/deadzone/game/perks";
import { PLAYER_SPAWN } from "../src/game/deadzone/world/mapdata";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const priv = (x: unknown) => x as Any;
const down = new Set<string>();
const kb = { isDown: (c: string) => down.has(c), anyDown: (cs: readonly string[]) => cs.some((c) => down.has(c)) } as unknown as Keyboard;

function make(players: number) {
  const host = new DeadZoneHost(new Input(kb), players - 1, "host", "sector09");
  host.rounds.state = "intermission" as never;
  host.rounds.timer = 99999;
  const ids = [0, 0, 0, 0];
  const send = (i: number, extra: Partial<DzMsg> = {}, at?: { x?: number; z?: number; yaw?: number; pitch?: number; fl?: number }) => {
    const p = host.seats[i].p;
    host.onMessage(i, { t: "z", i: ++ids[i], s: 0, x: at?.x ?? p.position.x, y: p.position.y, z: at?.z ?? p.position.z, yaw: at?.yaw ?? p.yaw, pitch: at?.pitch ?? p.pitch, fl: at?.fl ?? 0, rv: host.seats[i].reviveSeq, ...extra });
  };
  const step = (secs: number, dt = 1 / 30) => {
    for (let t = 0; t < secs; t += dt) host.update(dt);
  };
  const tap = (code: string) => {
    down.add(code);
    host.update(1 / 30);
    down.delete(code);
    host.update(1 / 30);
  };
  return { host, send, step, tap };
}

console.log("Dos armas");
{
  const w = new WeaponSystem();
  check(MAX_SLOTS === 2 && w.slots.length === 2, "solo hay dos ranuras");
  w.give("smg");
  check(w.slots[0] === "pistol" && w.slots[1] === "smg", "la segunda arma ocupa la segunda ranura");
  w.give("shotgun");
  check(w.slots.length === 2 && w.slots[1] === "shotgun" && !w.has("smg"), "una tercera sustituye a la que llevas en la mano", w.slots.join(","));
  check(!w.select(2), "no existe la tercera ranura");
  const { host } = make(1);
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check(snap.wp[0][2] === -1, "el estado de red nunca trae una tercera arma");
  host.dispose();
}

console.log("Cuchillo con botón");
{
  const { host, step } = make(1);
  step(0.3);
  const s = host.seats[0];
  host.stage.zombies.clear();
  s.p.yaw = 0;
  const z = host.stage.zombies.spawn("walker", 1, s.p.position.x, s.p.position.z - 1.4);
  z.state = "chasing";
  const hp = z.hp;
  const mag = s.weapons.currentAmmo.mag;
  check(!s.weapons.outOfAmmo, "con balas en el cargador");
  down.add("KeyQ");
  step(0.1);
  down.delete("KeyQ");
  check(z.hp < hp || !z.alive, "Q da un tajo aunque haya munición");
  check(s.weapons.currentAmmo.mag === mag, "sin gastar balas");
  host.dispose();
}

console.log("Abatido: disparar y revivir");
{
  const { host, send, step } = make(2);
  step(0.3);
  const a = host.seats[0];
  const b = host.seats[1];
  a.p.reset(PLAYER_SPAWN.x, PLAYER_SPAWN.z, 0);
  b.p.reset(PLAYER_SPAWN.x + 0.8, PLAYER_SPAWN.z, 0);
  b.weapons.give("smg");
  b.weapons.ammo.pistol.mag = 3;
  b.weapons.ammo.pistol.reserve = 2;
  priv(host).damageSeat(1, 9999);
  check(b.p.downed && b.down > 0 && !b.p.alive, "queda abatido (vivo para revivir)");
  check(b.weapons.sidearm && b.weapons.currentId === "pistol", "pasa a la pistola");
  check(b.weapons.currentAmmo.mag === WEAPONS.pistol.magSize && b.weapons.currentAmmo.reserve > 0, "con cargador lleno y algo de reserva");
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check((snap.pl[1][6] & 16) !== 0 && (snap.pl[1][6] & 1) === 0, "el estado de red marca abatido");
  check(snap.wp[1][0] === 0 || snap.wp[1][snap.wp[1][3]] === 0, "y la mano lleva la pistola", JSON.stringify(snap.wp[1]));

  // Sigue disparando.
  host.stage.zombies.clear();
  const z = host.stage.zombies.spawn("walker", 1, b.p.position.x, b.p.position.z - 5);
  z.state = "chasing";
  const hp = z.hp;
  const mag0 = b.weapons.currentAmmo.mag;
  send(1, { ca: 1 }, { x: b.p.position.x, z: b.p.position.z, yaw: 0, pitch: 0, fl: 8 });
  step(0.15);
  check(b.weapons.currentAmmo.mag < mag0 && (z.hp < hp || !z.alive), "el abatido dispara y daña", `${mag0} → ${b.weapons.currentAmmo.mag}`);
  // No usa ni se acuchilla.
  const pts = b.points.balance;
  send(1, { ca: 6 });
  send(1, { ca: 3 });
  step(0.1);
  check(b.points.balance === pts && b.meleeCd === 0, "pero no usa nada ni da tajos");
  // Se arrastra despacio.
  const x0 = b.p.position.x;
  send(1, {}, { x: x0 + 0.5, z: b.p.position.z });
  check(Math.abs(b.p.position.x - (x0 + 0.5)) < 1e-6, "su posición la manda el invitado mientras se arrastra");

  // El compañero lo revive: vuelve con todas sus armas y la pistola como estaba.
  const downFor = b.down;
  void downFor;
  b.p.position.set(a.p.position.x + 0.5, 0, a.p.position.z);
  down.add("KeyE");
  step(PERK_TUNING.reviveTime + 0.5);
  down.delete("KeyE");
  check(b.p.alive && !b.p.downed && !b.weapons.sidearm, "tras revivirlo vuelve a jugar");
  check(b.weapons.slots[1] === "smg" && b.weapons.currentId !== null, "con sus dos armas");
  check(b.weapons.ammo.pistol.mag === 3 && b.weapons.ammo.pistol.reserve === 2, "y la munición que tenía", JSON.stringify(b.weapons.ammo.pistol));

  // Si se desangra, muere; con un compañero vivo reaparece al acabar la ronda.
  priv(host).damageSeat(1, 9999);
  a.p.position.set(a.p.position.x + 25, 0, a.p.position.z);
  step(PERK_TUNING.bleedOut + 1);
  check(!b.p.alive && !b.p.downed && b.down === 0 && !b.weapons.sidearm, "sin ayuda a tiempo, muere");
  priv(host).applyRoundEvents([{ type: "roundEnd", round: 1 }]);
  check(b.p.alive && b.weapons.slots[1] === null, "al acabar la ronda reaparece (con la pistola)");
  host.dispose();
}

console.log("Abatido por red");
{
  const { host, step } = make(2);
  const guest = new DeadZoneGuest(1, new Input({ isDown: () => false, anyDown: () => false } as unknown as Keyboard));
  step(0.3);
  priv(host).damageSeat(1, 9999);
  step(0.1);
  guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  guest.update(1 / 30);
  const hv = priv(guest).hudView();
  check(hv.downed === true && hv.alive === false && hv.down?.t > 0, "el invitado abatido ve su estado y sigue con la pistola");
  check(hv.weaponName.length > 0 && hv.slots.length === 2, "con su arma y solo dos ranuras");
  guest.dispose();
  host.dispose();
}

console.log("Pausa");
{
  const { host, step, tap } = make(1);
  step(0.3);
  const t0 = priv(host).time as number;
  check(host.escape() === true && host.paused, "Esc abre la pausa");
  step(1);
  check(Math.abs(priv(host).time - t0) < 1e-6, "en solitario la partida se detiene");
  tap("ArrowDown");
  check(host.pauseIndex === 1, "las flechas mueven la selección");
  down.add("Enter");
  host.update(1 / 30);
  down.delete("Enter");
  check(!host.paused, "Enter sobre «reiniciar» cierra la pausa y reinicia");
  host.update(1 / 30);
  tap("KeyP");
  check(host.paused, "P también pausa");
  tap("KeyP");
  check(!host.paused, "y reanuda");
  const view = priv(host).hudView();
  check(view.pause === null, "sin pausa, el HUD no la dibuja");
  host.dispose();

  const co = make(2);
  co.step(0.3);
  const tt = priv(co.host).time as number;
  co.host.escape();
  co.step(1);
  check(priv(co.host).time > tt + 0.9, "con compañeros la partida sigue en segundo plano");
  check(priv(co.host).hudView().pause?.coop === true, "y el menú avisa de ello");
  co.host.dispose();
}

console.log("Cambio de ronda");
{
  const { host, step } = make(1);
  step(0.3);
  priv(host).emit(8, 4, 0);
  check(priv(host).fb.roundFx?.kind === "start" && priv(host).fb.roundFx.num === 4, "al empezar la ronda se enseñan las marcas de la ronda nueva");
  step(5.6);
  check(priv(host).fb.roundFx === null, "y desaparecen solas");
  priv(host).emit(9, 4);
  check(priv(host).fb.roundFx?.kind === "end", "al acabar, las de la ronda superada");
  host.dispose();
}
