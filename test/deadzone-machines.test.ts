// Dead Zone: arsenal y mejora de armas, caja misteriosa en el centro de la plaza (ruleta, oferta, quién la coge),
// interruptor de la energía y mejorador. Con 1 jugador, con un invitado por red simulada y comprobando que el precio
// y el estado los manda siempre el anfitrión.
import { check } from "./lib";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneGuest, DeadZoneHost, type DzMsg } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";
import { BOX_OFFER, BOX_ROLL, UPGRADE_OFFER, UPGRADE_WORK } from "../src/game/deadzone/game/interact";
import { BOX_POOL, BOX_PRICE, UPGRADE_PRICE, UPGRADED, WEAPONS, WEAPON_IDS, weaponDef } from "../src/game/deadzone/weapons/defs";
import { WeaponSystem } from "../src/game/deadzone/weapons/system";
import { buildWeaponModel } from "../src/game/deadzone/weapons/model";
import { MYSTERY_BOX, POWER_SWITCH, UPGRADER } from "../src/game/deadzone/world/mapdata";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const priv = (x: unknown) => x as Any;

const fakeKeyboard = () => {
  const kb = { isDown: () => false, anyDown: () => false };
  return kb as unknown as Keyboard;
};

function makeHost(remote = 0) {
  const host = new DeadZoneHost(new Input(fakeKeyboard()), remote, "host");
  // Sin zombis ni rondas que estorben: descanso largo.
  host.rounds.state = "intermission";
  host.rounds.timer = 1e6;
  const ids = [0, 0, 0, 0];
  const send = (i: number, extra: Partial<DzMsg> = {}, at?: { x?: number; z?: number; yaw?: number; pitch?: number }) => {
    const p = host.seats[i].p;
    host.onMessage(i, {
      t: "z", i: ++ids[i], s: 0, x: at?.x ?? p.position.x, y: p.position.y, z: at?.z ?? p.position.z,
      yaw: at?.yaw ?? p.yaw, pitch: at?.pitch ?? p.pitch, fl: 0, rv: host.seats[i].reviveSeq, ...extra,
    });
  };
  const step = (secs: number, dt = 1 / 30) => {
    for (let t = 0; t < secs; t += dt) host.update(dt);
  };
  /** Coloca a un jugador frente a un punto mirando hacia él (a `dist` metros). */
  const stand = (i: number, x: number, z: number, dist: number, face: "n" | "s" = "n") => {
    const p = host.seats[i].p;
    const zz = face === "n" ? z + dist : z - dist;
    p.position.set(x, 0, zz);
    p.yaw = face === "n" ? 0 : Math.PI;
    p.pitch = -0.1;
    send(i, {}, { x, z: zz, yaw: p.yaw, pitch: -0.1 });
  };
  return { host, send, step, stand };
}

// --- 1 · El arsenal: armas nuevas y versión mejorada ------------------------------------------------------
console.log("Arsenal y mejora");
{
  check(WEAPON_IDS.length === 8 && ["revolver", "lmg", "sniper"].every((id) => WEAPON_IDS.includes(id as never)), "hay 8 armas (revólver, ametralladora y francotirador nuevos)");
  check(WEAPON_IDS.every((id) => UPGRADED[id].damage > WEAPONS[id].damage && UPGRADED[id].magSize >= WEAPONS[id].magSize && UPGRADED[id].name !== WEAPONS[id].name), "cada arma mejorada pega más, carga más y tiene otro nombre");
  check(WEAPON_IDS.every((id) => weaponDef(id, true).upgraded && !weaponDef(id).upgraded), "weaponDef distingue la versión mejorada");
  const ws = new WeaponSystem();
  ws.give("smg");
  check(ws.slots[1] === "smg" && ws.index === 1, "dar un arma la pone en la mano");
  ws.upgrade("smg");
  check(ws.upg.smg && ws.currentAmmo.mag === UPGRADED.smg.magSize && ws.currentAmmo.reserve === UPGRADED.smg.reserveMax, "mejorar deja cargador y reserva llenos del arma mejorada");
  check(ws.current?.name === UPGRADED.smg.name && ws.upgradeMask === 0b010, "el arma viva es la mejorada y la máscara marca su ranura");
  const shot = (() => { ws.update(1); return ws.fire(true, true); })();
  check(!!shot && shot.def.damage === UPGRADED.smg.damage, "dispara con el daño de la mejorada");
  // Sacar el arma (el mejorador se la queda) y devolverla.
  const held = ws.detach(1);
  check(!!held && ws.slots[1] === null && ws.index === 0 && !ws.upg.smg, "sacar el arma pasa a la de la ranura 1");
  ws.attach(held!, true);
  check(ws.slots[1] === "smg" && ws.index === 1 && ws.upg.smg, "devolverla la deja en su ranura, en la mano y mejorada");
  // Con todas las ranuras llenas, una nueva sustituye a la de la mano y esa pierde la mejora.
  ws.give("rifle");
  ws.give("shotgun");
  check(ws.slots.every(Boolean) && !ws.upg.shotgun, "tres armas llenan las ranuras");
  ws.give("lmg");
  check(ws.slots.includes("lmg") && !ws.has("shotgun"), "con las ranuras llenas la nueva sustituye a la de la mano");
  // Los modelos 3D se construyen para todas, normales y mejoradas.
  let okModels = true;
  for (const id of WEAPON_IDS) {
    for (const up of [false, true]) {
      const m = buildWeaponModel(id, up, true);
      okModels &&= m.group.children.length > 6 && m.muzzle.z < -0.2 && (up ? m.glow.length > 0 : true);
    }
  }
  check(okModels, "los 16 modelos (8 armas × normal/mejorada) se construyen con boca de cañón delante");
}

// --- 2 · La caja misteriosa en el centro de la plaza ------------------------------------------------------
console.log("Caja misteriosa");
{
  const { host, step, stand } = makeHost();
  const box = host.stage.map.box;
  check(box.position.x === MYSTERY_BOX.x && box.position.z === MYSTERY_BOX.z && Math.abs(box.position.z - -16) < 1, "la caja está en el centro de la plaza");
  const s = host.seats[0];
  s.points.reset(2000);
  s.weapons.reset();
  stand(0, MYSTERY_BOX.x, MYSTERY_BOX.z, 2.2);
  step(0.1);
  check(s.prompt?.kind === "box" && s.prompt.cost === BOX_PRICE, "frente a la caja sale «CAJA MISTERIOSA» con su precio", s.prompt?.label);
  host.interact.use(s.prompt!, 0, s);
  check(s.points.balance === 2000 - BOX_PRICE && box.phase === 1, "pagar la abre y empieza a girar");
  const shown = new Set<string>();
  for (let t = 0; t < BOX_ROLL - 0.3; t += 1 / 30) {
    step(1 / 30);
    if (box.shown) shown.add(box.shown);
  }
  check(shown.size >= 3 && [...shown].every((id) => BOX_POOL.includes(id as never)), "la ruleta pasa por varias armas de la caja", [...shown].join(" "));
  step(0.5);
  check(box.phase === 2 && !!box.shown && box.left > 0 && box.left <= BOX_OFFER, "tras girar ofrece el arma", `fase ${box.phase}, ${box.shown}`);
  const offered = box.shown!;
  step(0.1);
  check(s.prompt?.kind === "boxTake", "quien pagó puede cogerla", s.prompt?.label);
  host.interact.use(s.prompt!, 0, s);
  check(s.weapons.has(offered) && box.phase === 0 && box.shown === null, "coger el arma la entrega y cierra la caja", `${offered}: ${s.weapons.slots.join(",")}`);
  // Si no se coge, se pierde.
  s.points.reset(2000);
  step(0.1);
  host.interact.use({ kind: "box", label: "", cost: BOX_PRICE, id: "mystery_box" }, 0, s);
  step(BOX_ROLL + BOX_OFFER + 0.5);
  check(box.phase === 0 && s.points.balance === 2000 - BOX_PRICE, "si nadie la coge a tiempo, la caja se la queda");
  // Sin puntos no abre.
  s.points.reset(100);
  host.interact.use({ kind: "box", label: "", cost: BOX_PRICE, id: "mystery_box" }, 0, s);
  check(box.phase === 0 && s.points.balance === 100, "sin puntos suficientes no se abre ni se cobra");
  // No sale un arma que ya lleva.
  s.points.reset(100000);
  let repeated = false;
  for (let k = 0; k < 40; k++) {
    s.weapons.reset();
    s.weapons.give("rifle");
    host.interact.use({ kind: "box", label: "", cost: BOX_PRICE, id: "mystery_box" }, 0, s);
    step(BOX_ROLL + 0.2);
    if (box.shown === "rifle") repeated = true;
    host.interact.reset();
  }
  check(!repeated, "la caja no ofrece un arma que ya llevas (40 tiradas)");
  host.dispose();
}

// --- 3 · Energía y mejorador ----------------------------------------------------------------------------
console.log("Energía y mejorador");
{
  const { host, step, stand } = makeHost();
  const s = host.seats[0];
  const up = host.stage.map.upgrader;
  const power = host.stage.map.power;
  s.points.reset(10000);
  s.weapons.reset();
  s.weapons.give("rifle");
  stand(0, UPGRADER.x, UPGRADER.z, 2.0);
  step(0.1);
  check(s.prompt?.kind === "info" && /ENERG/.test(s.prompt.label), "sin energía el mejorador avisa", s.prompt?.label);
  host.interact.use({ kind: "upgrade", label: "", cost: UPGRADE_PRICE, id: "upgrader" }, 0, s);
  check(up.phase === 0 && s.points.balance === 10000 && !s.weapons.upg.rifle, "sin energía no se puede forzar la mejora (ni se cobra)");
  // El interruptor.
  stand(0, POWER_SWITCH.x, POWER_SWITCH.z + 0.7, 1.4, "n");
  host.seats[0].p.position.set(POWER_SWITCH.x, 0, POWER_SWITCH.z + 1.4);
  step(0.1);
  check(s.prompt?.kind === "power", "junto al interruptor sale «ACTIVAR LA ENERGÍA»", s.prompt?.label);
  host.interact.use(s.prompt!, 0, s);
  check(power.on, "el interruptor da la energía");
  // El mejorador.
  stand(0, UPGRADER.x, UPGRADER.z, 2.0);
  step(0.1);
  check(s.prompt?.kind === "upgrade" && s.prompt.cost === UPGRADE_PRICE, "con energía ofrece mejorar el arma de la mano con su precio", s.prompt?.label);
  const ammoBefore = s.weapons.ammo.rifle.mag;
  host.interact.use(s.prompt!, 0, s);
  check(up.phase === 1 && up.shown === "rifle" && s.points.balance === 10000 - UPGRADE_PRICE, "pagar empieza el trabajo y cobra 2500");
  check(!s.weapons.has("rifle") && s.weapons.currentId === "pistol", "mientras trabaja, el arma no está en la mano (vuelve a la pistola)");
  step(UPGRADE_WORK + 0.3);
  check(up.phase === 2 && up.shownUpgraded && up.left > 0 && up.left <= UPGRADE_OFFER, "termina y la deja lista para recoger");
  step(0.1);
  check(s.prompt?.kind === "upgradeTake", "el dueño puede cogerla", s.prompt?.label);
  host.interact.use(s.prompt!, 0, s);
  check(up.phase === 0 && s.weapons.has("rifle") && s.weapons.upg.rifle && s.weapons.currentId === "rifle", "recogerla devuelve el arma mejorada a la mano");
  check(s.weapons.current!.name === UPGRADED.rifle.name && s.weapons.currentAmmo.mag === UPGRADED.rifle.magSize && ammoBefore <= UPGRADED.rifle.magSize, "con el nombre, el daño y el cargador de la mejorada");
  step(0.1);
  check(s.prompt?.kind === "info" && /YA MEJORADA/.test(s.prompt.label), "una arma mejorada no se puede mejorar otra vez", s.prompt?.label);
  // Si no se recoge, vuelve sola (mejorada).
  s.weapons.reset();
  s.weapons.give("shotgun");
  step(0.1);
  host.interact.use({ kind: "upgrade", label: "", cost: UPGRADE_PRICE, id: "upgrader" }, 0, s);
  step(UPGRADE_WORK + UPGRADE_OFFER + 0.5);
  check(up.phase === 0 && s.weapons.has("shotgun") && s.weapons.upg.shotgun, "si no la recoge, el mejorador se la devuelve mejorada");
  // Reinicio: todo vuelve a empezar.
  host.restart();
  check(!power.on && up.phase === 0 && host.stage.map.box.phase === 0, "reiniciar la partida apaga la energía y libera las máquinas");
  host.dispose();
}

// --- 4 · Con un invitado: precios del anfitrión, carteles y estado por red ------------------------------------
console.log("Máquinas con un invitado");
{
  const { host, step, stand, send } = makeHost(1);
  const guest = new DeadZoneGuest(1, new Input(fakeKeyboard()));
  const feed = () => guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  const gs = host.seats[1];
  gs.points.reset(5000);
  stand(1, MYSTERY_BOX.x, MYSTERY_BOX.z, 2.2);
  step(0.1);
  feed();
  guest.update(1 / 30);
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check(Array.isArray(snap.pr) && snap.pr.length === 4 && snap.pr[1]?.[0] === "CAJA MISTERIOSA" && snap.pr[1][1] === BOX_PRICE, "el estado trae el cartel de cada jugador (el del invitado: la caja)", String(snap.pr[1]?.[0]));
  check(snap.bx.length === 5 && snap.pu.length === 6 && snap.wp[1].length === 9, "y el de la caja, el del mejorador y las ranuras mejoradas");
  const hud = priv(guest).hudView();
  check(hud.prompt?.label === "CAJA MISTERIOSA" && hud.prompt.cost === BOX_PRICE && hud.affordable, "el invitado ve el cartel en su pantalla");
  // El invitado pulsa E: el anfitrión cobra y gira.
  send(1, { ca: 3 }, { x: gs.p.position.x, z: gs.p.position.z, yaw: 0, pitch: -0.1 });
  step(0.2);
  check(host.stage.map.box.phase === 1 && gs.points.balance === 5000 - BOX_PRICE, "el invitado paga la caja y el anfitrión gira");
  step(1.5);
  feed();
  guest.update(1 / 30);
  const gbox = priv(guest).stage.map.box;
  check(gbox.phase === 1 && gbox.shown !== null, "el invitado ve girar la caja", String(gbox.shown));
  step(BOX_ROLL);
  feed();
  guest.update(1 / 30);
  check(gbox.phase === 2 && gbox.shown === host.stage.map.box.shown, "y ve el arma que se ofrece, la misma");
  // Otro jugador (el anfitrión) cerca no puede coger el arma del invitado.
  const hs = host.seats[0];
  stand(0, MYSTERY_BOX.x, MYSTERY_BOX.z, 2.2);
  step(0.1);
  check(hs.prompt?.kind === "info", "otro jugador no puede coger el arma de quien pagó", hs.prompt?.label);
  stand(1, MYSTERY_BOX.x, MYSTERY_BOX.z, 2.2);
  step(0.1);
  send(1, { ca: 3 }, { x: gs.p.position.x, z: gs.p.position.z, yaw: 0, pitch: -0.1 });
  step(0.2);
  check(gs.weapons.slots.some((id, i) => i > 0 && id !== null) && host.stage.map.box.phase === 0, "el que pagó la coge y se queda con ella");
  // Energía: el estado viaja y el invitado ve la máquina encendida.
  host.stage.map.power.on = true;
  step(0.1);
  feed();
  guest.update(1 / 30);
  check(priv(guest).stage.map.power.on === true && priv(guest).hudView().power === true, "la energía activada se ve en el invitado");
  // Un cliente tramposo no puede cambiar el precio ni coger lo que no es suyo.
  gs.points.reset(0);
  stand(1, UPGRADER.x, UPGRADER.z, 2.0);
  step(0.1);
  send(1, { ca: 3, price: 1 } as Partial<DzMsg>, { x: gs.p.position.x, z: gs.p.position.z, yaw: 0, pitch: -0.1 });
  step(0.2);
  check(host.stage.map.upgrader.phase === 0 && gs.points.balance === 0, "sin puntos el invitado no mejora nada, diga lo que diga");
  guest.dispose();
  host.dispose();
}
