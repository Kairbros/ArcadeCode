// Dead Zone: el oso de la caja misteriosa (reembolso, la caja se va a otro sitio, colisión y red) y que cada sitio
// posible de la caja esté libre.
import { check } from "./lib";
import * as THREE from "three";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneGuest, DeadZoneHost } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";
import { BOX_ROLL, TEDDY_TIME, teddyChance } from "../src/game/deadzone/game/interact";
import { BOX_SPOTS } from "../src/game/deadzone/world/mapdata";
import { BOX_PRICE } from "../src/game/deadzone/weapons/defs";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const priv = (x: unknown) => x as Any;
const kb = { isDown: () => false, anyDown: () => false } as unknown as Keyboard;

console.log("Probabilidad del oso");
{
  check(teddyChance(0) === 0 && teddyChance(1) === 0, "nunca en los dos primeros usos");
  check(teddyChance(2) > 0 && teddyChance(8) > teddyChance(2), "y luego cada vez es más probable");
  check(teddyChance(99) <= 0.5, "con tope");
}

console.log("Sitios de la caja");
{
  const host = new DeadZoneHost(new Input(kb), 0, "local");
  const map = host.stage.map;
  BOX_SPOTS.forEach((sp, i) => {
    map.moveBox(i);
    const box = map.box;
    check(box.spot === i && Math.abs(box.group.position.x - sp.x) < 1e-6 && Math.abs(box.group.position.z - sp.z) < 1e-6, `${sp.name}: la caja se coloca en su sitio`);
    // Su colisionador no debe pisar muros, máquinas ni otros objetos (salvo el suyo).
    const mine = map.colliders.find((c) => c.tag === "prop" && Math.abs((c.min.x + c.max.x) / 2 - sp.x) < 0.01 && Math.abs((c.min.z + c.max.z) / 2 - sp.z) < 0.01 && c.max.y === 1.1);
    check(!!mine, `${sp.name}: el colisionador se mueve con la caja`);
    const clash = map.colliders.filter((c) => c !== mine && c.enabled && c.tag !== "floor" && c.tag !== "ceiling" && c.min.y < 1.1
      && mine && c.min.x < mine.max.x && c.max.x > mine.min.x && c.min.z < mine.max.z && c.max.z > mine.min.z);
    check(clash.length === 0, `${sp.name}: libre de muros y objetos`, clash.map((c) => `${c.tag}@${c.min.x.toFixed(1)},${c.min.z.toFixed(1)}`).join(" "));
    // Delante se puede estar de pie (a 1,4 m de la caja hacia donde mira).
    const fx = sp.x + Math.sin(sp.rot) * 1.5;
    const fz = sp.z + Math.cos(sp.rot) * 1.5;
    const blocked = map.colliders.some((c) => c.enabled && c.tag !== "floor" && c.tag !== "ceiling" && c.min.y < 1 && fx > c.min.x - 0.35 && fx < c.max.x + 0.35 && fz > c.min.z - 0.35 && fz < c.max.z + 0.35);
    check(!blocked, `${sp.name}: hay sitio delante para usarla`);
  });
  host.dispose();
}

console.log("El oso");
{
  const host = new DeadZoneHost(new Input(kb), 1, "host");
  host.rounds.state = "intermission" as never;
  host.rounds.timer = 99999;
  const step = (secs: number, dt = 1 / 30) => {
    for (let t = 0; t < secs; t += dt) host.update(dt);
  };
  step(0.3);
  const s = host.seats[0];
  const box = host.stage.map.box;
  const it = host.interact;
  s.points.reset(10000);
  const stand = () => {
    s.p.reset(box.position.x, box.position.z + 1.6, 0);
    s.p.yaw = 0;
    const eye = s.p.eyePosition();
    // mira a la caja
    const d = new THREE.Vector3(box.position.x - eye.x, 0, box.position.z - eye.z).normalize();
    s.p.yaw = Math.atan2(d.x, d.z) + Math.PI;
    return it.find(eye, s.p.forward(new THREE.Vector3()), s, 0);
  };
  // Dos usos normales: nunca oso.
  it.rng = () => 0; // «mala suerte» máxima: si pudiera tocar el oso, tocaría
  let p = stand();
  check(p?.kind === "box", "se ve el cartel de la caja");
  it.use(p!, 0, s);
  check(box.phase === 1 && !priv(it).boxTeddy, "el primer uso nunca es el oso");
  step(BOX_ROLL + 0.5);
  check(box.phase === 2, "ofrece un arma");
  p = stand();
  it.use(p!, 0, s); // coger
  step(0.1);
  p = stand();
  it.use(p!, 0, s); // segundo uso
  check(!priv(it).boxTeddy, "el segundo uso tampoco");
  step(BOX_ROLL + 0.5);
  p = stand();
  it.use(p!, 0, s);
  step(0.1);

  // Tercer uso con el azar al límite: oso.
  const before = s.points.balance;
  const from = box.spot;
  p = stand();
  it.use(p!, 0, s);
  check(priv(it).boxTeddy && box.phase === 1, "el tercer uso, con mala suerte, es el oso");
  step(BOX_ROLL + 0.4);
  check(box.phase === 3 && box.teddy, "tras girar sale el oso", `fase ${box.phase}`);
  check(s.points.balance === before, "se devuelve lo pagado", `${before} → ${s.points.balance}`);
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check(snap.bx[0] === 3 && snap.bx[4] === from, "el estado de red dice que el oso está a la vista");
  p = stand();
  check(p?.kind === "info" && /OSO/.test(p.label), "el cartel avisa del oso");

  // Un invitado ve la caja moverse.
  const guest = new DeadZoneGuest(1, new Input(kb));
  guest.onSnap(snap);
  guest.update(1 / 30);
  check(priv(guest).stage.map.box.phase === 3 && priv(guest).stage.map.box.teddy, "el invitado ve el oso");

  it.rng = () => 0.5;
  step(TEDDY_TIME + 0.3);
  check(box.phase === 0 && !box.teddy && box.spot !== from, "tras unos segundos la caja se va a otro sitio", `${from} → ${box.spot}`);
  const ok = BOX_SPOTS[box.spot];
  check(Math.abs(box.group.position.x - ok.x) < 1e-6 && Math.abs(box.position.z - ok.z) < 1e-6, "y queda colocada allí");
  check(priv(it).boxUses === 0, "el contador de usos se reinicia");
  guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  guest.update(1 / 30);
  check(priv(guest).stage.map.box.spot === box.spot, "el invitado también la ve en el sitio nuevo");
  // Reinicio: vuelve a la plaza.
  host.restart();
  check(box.spot === 0, "al reiniciar la partida la caja vuelve a la plaza");
  guest.dispose();
  host.dispose();
}
void BOX_PRICE;
