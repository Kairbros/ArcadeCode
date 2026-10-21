// Dead Zone: abatidos y revivir compañeros, ventajas de las máquinas (Juggernog, Speed Cola, Double Tap, Quick Revive)
// y regeneración de vida.
import { check } from "./lib";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneGuest, DeadZoneHost } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";
import { PERKS, PERK_IDS, PERK_TUNING, addPerk, hasPerk, maxHealthFor, reviveTimeFor } from "../src/game/deadzone/game/perks";
import { PLAYER_SPAWN } from "../src/game/deadzone/world/mapdata";
import { WEAPONS } from "../src/game/deadzone/weapons/defs";
import * as THREE from "three";

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
  // Ronda en descanso: no salen zombis que molesten.
  host.rounds.state = "intermission" as never;
  host.rounds.timer = 99999;
  const step = (secs: number, dt = 1 / 30) => {
    for (let t = 0; t < secs; t += dt) host.update(dt);
  };
  return { host, step, down };
}

// --- 1 · Reglas de las ventajas -------------------------------------------------------------------------
console.log("Ventajas (reglas)");
{
  let mask = 0;
  for (const id of PERK_IDS) mask = addPerk(mask, id);
  check(PERK_IDS.every((id) => hasPerk(mask, id)), "la máscara guarda las cuatro ventajas");
  check(new Set(PERK_IDS.map((id) => PERKS[id].bit)).size === 4, "cada ventaja tiene su propio bit");
  check(maxHealthFor(addPerk(0, "juggernog")) === PERK_TUNING.juggHealth && maxHealthFor(0) === 100, "Juggernog sube la vida máxima");
  check(reviveTimeFor(addPerk(0, "quickRevive")) < reviveTimeFor(0), "Quick Revive acelera el revivir");
  check(!PERKS.quickRevive.needsPower && PERKS.juggernog.needsPower, "solo Quick Revive funciona sin energía");
}

// --- 2 · Comprar ventajas en la partida -----------------------------------------------------------------
console.log("Comprar ventajas");
{
  const { host, step } = makeHost(1);
  step(0.5);
  const s = host.seats[0];
  const map = host.stage.map;
  check(map.perks.length === 4, "el mapa trae las cuatro máquinas");
  const stand = (id: string) => {
    const m = map.perks.find((x) => x.id === id)!;
    // Delante de la máquina, a 1,2 m, mirando hacia ella.
    const dx = Math.sin(m.group.rotation.y);
    const dz = Math.cos(m.group.rotation.y);
    s.p.reset(m.group.position.x + dx * 1.3, m.group.position.z + dz * 1.3, 0);
    s.p.yaw = Math.atan2(dx, dz);
    s.points.reset(20000);
    return host.interact.find(s.p.eyePosition(), s.p.forward(new THREE.Vector3()), s, 0);
  };
  const jug = stand("juggernog");
  check(jug?.kind === "info", "sin energía, Juggernog no se vende", jug?.label);
  const qr = stand("quickRevive");
  check(qr?.kind === "perk" && qr.cost === PERKS.quickRevive.cost, "Quick Revive se vende sin energía", qr?.label);
  host.interact.use(qr!, 0, s);
  check(hasPerk(s.perks, "quickRevive") && s.points.balance === 20000 - PERKS.quickRevive.cost, "se paga y se obtiene");
  const again = stand("quickRevive");
  check(again?.kind === "info", "no se puede comprar dos veces");
  map.power.on = true;
  for (const id of ["juggernog", "speedCola", "doubleTap"] as const) {
    const p = stand(id);
    check(p?.kind === "perk", `con energía se vende ${id}`, p?.label);
    host.interact.use(p!, 0, s);
  }
  priv(host).perkBought(0);
  check(s.p.maxHealth === PERK_TUNING.juggHealth && s.p.health === PERK_TUNING.juggHealth, "Juggernog: 250 de vida", `${s.p.health}/${s.p.maxHealth}`);
  check(s.weapons.reloadScale === PERK_TUNING.reloadScale, "Speed Cola: recarga a la mitad");
  check(s.weapons.rateScale === PERK_TUNING.rateScale, "Double Tap: más cadencia");
  // Speed Cola: la recarga tarda menos.
  s.weapons.ammo.pistol.mag = 0;
  s.weapons.startReload();
  check(Math.abs(s.weapons.timer - WEAPONS.pistol.reloadTime * PERK_TUNING.reloadScale) < 1e-6, "la recarga dura la mitad", `${s.weapons.timer}`);
  host.dispose();
}

// --- 3 · Abatido y revivir ------------------------------------------------------------------------------
console.log("Abatido y revivir");
{
  const { host, step, down } = makeHost(2);
  step(0.5);
  const a = host.seats[0];
  const b = host.seats[1];
  a.p.reset(PLAYER_SPAWN.x, PLAYER_SPAWN.z, 0);
  b.p.reset(PLAYER_SPAWN.x + 0.8, PLAYER_SPAWN.z, 0);
  b.perks = addPerk(addPerk(0, "juggernog"), "speedCola");
  priv(host).applyPerks(1);
  priv(host).damageSeat(1, 9999);
  check(!b.p.alive && b.down > 0 && !b.selfRevive, "con un compañero vivo, el jugador queda abatido");
  check(b.perks === 0 && b.p.maxHealth === 100, "al caer pierde las ventajas");
  check(!host.over, "la partida sigue: hay quien lo puede revivir");

  // Se desangra si nadie lo atiende.
  const bleed0 = b.down;
  step(2);
  check(b.down < bleed0 - 1.5, "se va desangrando", `${bleed0} → ${b.down}`);
  const prompt0 = (host.frame().snap as Any).dn[1];
  check(prompt0[0] > 0, "el estado de red cuenta los segundos que le quedan");

  // El compañero lo revive manteniendo E.
  down.add("KeyE");
  step(1);
  check(b.reviveProg > 0.1 && b.reviveProg < 1, "mantener E avanza la barra de revivir", `${b.reviveProg.toFixed(2)}`);
  check(a.prompt?.kind === "revive", "el que revive ve el cartel de revivir");
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check(Number(snap.pr[0][6]) > 0, "el cartel de red lleva el progreso");
  step(PERK_TUNING.reviveTime);
  down.delete("KeyE");
  check(b.p.alive && b.p.health === b.p.maxHealth && b.down === 0, "tras 4 s, el compañero vuelve con la vida llena");

  // Si suelta E, el progreso baja.
  priv(host).damageSeat(1, 9999);
  down.add("KeyE");
  step(1);
  down.delete("KeyE");
  const peak = b.reviveProg;
  step(1);
  check(b.reviveProg < peak, "sin atenderlo, el progreso se pierde", `${peak.toFixed(2)} → ${b.reviveProg.toFixed(2)}`);

  // Quick Revive en el que revive: la mitad de tiempo.
  b.reviveProg = 0;
  a.perks = addPerk(0, "quickRevive");
  down.add("KeyE");
  step(PERK_TUNING.reviveTimeQuick + 0.4);
  down.delete("KeyE");
  check(b.p.alive, "con Quick Revive se revive en 2 s");

  // Desangrado del todo: queda fuera hasta la siguiente ronda.
  priv(host).damageSeat(1, 9999);
  a.p.position.set(a.p.position.x + 20, 0, a.p.position.z); // lejos, sin poder atenderlo
  step(PERK_TUNING.bleedOut + 1);
  check(!b.p.alive && b.down === 0, "si nadie lo revive se desangra");
  priv(host).applyRoundEvents([{ type: "roundEnd", round: 1 }]);
  check(b.p.alive, "al acabar la ronda vuelve a la partida");
  host.dispose();
}

// --- 4 · Solo, Quick Revive, y fin de partida -----------------------------------------------------------
console.log("Solo y fin de partida");
{
  const { host, step } = makeHost(1);
  step(0.5);
  const a = host.seats[0];
  priv(host).damageSeat(0, 9999);
  step(0.1);
  check(host.over, "en solitario sin Quick Revive, caer termina la partida");
  host.restart();
  host.rounds.state = "intermission" as never;
  host.rounds.timer = 99999;
  a.perks = addPerk(0, "quickRevive");
  priv(host).damageSeat(0, 9999);
  check(!host.over && a.selfRevive && a.down > 0, "con Quick Revive en solitario, se levanta solo");
  step(PERK_TUNING.soloRevive + 0.5);
  check(a.p.alive && !a.selfRevive && a.perks === 0, "vuelve a levantarse y gasta la ventaja");
  host.dispose();
}

// --- 5 · Regeneración ------------------------------------------------------------------------------------
console.log("Regeneración");
{
  const { host, step } = makeHost(1);
  step(0.5);
  const a = host.seats[0];
  priv(host).damageSeat(0, 60);
  step(PERK_TUNING.regenDelay - 1);
  check(a.p.health === 40, "no regenera nada más recibir daño", `${a.p.health}`);
  step(5);
  check(a.p.health === 100, "pasados unos segundos sin daño, la vida vuelve");
  host.dispose();
}

// --- 6 · Por red ------------------------------------------------------------------------------------------
console.log("Ventajas y abatido por red");
{
  const { host, step } = makeHost(2);
  const { kb } = fakeKeyboard();
  const guest = new DeadZoneGuest(1, new Input(kb));
  step(0.5);
  host.seats[1].perks = addPerk(0, "juggernog");
  priv(host).applyPerks(1);
  step(0.1);
  guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  guest.update(1 / 30);
  let hv = priv(guest).hudView();
  check(hv.perks === host.seats[1].perks && hv.maxHealth === PERK_TUNING.juggHealth, "el invitado ve sus ventajas y su vida máxima");
  priv(host).damageSeat(1, 9999);
  step(0.1);
  guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  guest.update(1 / 30);
  hv = priv(guest).hudView();
  check(hv.down && hv.down.t > 0 && !hv.alive, "el invitado abatido ve cuánto le queda");
  guest.dispose();
  host.dispose();
}
