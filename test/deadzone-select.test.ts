// Dead Zone: selector de mapa (anfitrión elige, invitado espera y construye el mismo mapa), tablones animados y disparos entre tablas.
import { check } from "./lib";
import * as THREE from "three";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneGuest, DeadZoneHost } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";
import { MAP_IDS } from "../src/game/deadzone/world/maps";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const priv = (x: unknown) => x as Any;
const down = new Set<string>();
const kb = { isDown: (c: string) => down.has(c), anyDown: (cs: readonly string[]) => cs.some((c) => down.has(c)) } as unknown as Keyboard;

console.log("Selector de mapa");
{
  const host = new DeadZoneHost(new Input(kb), 1, "host", null);
  const guest = new DeadZoneGuest(1, new Input({ isDown: () => false, anyDown: () => false } as unknown as Keyboard));
  const tap = (code: string) => {
    down.add(code);
    host.update(1 / 30);
    down.delete(code);
    host.update(1 / 30);
  };
  host.update(1 / 30);
  check(host.phase === "menu", "con null empieza en el selector");
  check(MAP_IDS.length === 4 && MAP_IDS[0] === "granja", "hay cuatro mapas: granja, pueblo, terminal y sector 09", MAP_IDS.join(","));
  const n0 = host.stage.zombies.list.length;
  host.update(1);
  check(host.stage.zombies.list.length === n0 && host.rounds.round <= 1, "en el selector no se simula la partida");
  tap("ArrowRight");
  check(host.menuIndex === 1, "la flecha derecha pasa a la tarjeta siguiente");
  tap("ArrowLeft");
  tap("ArrowLeft");
  check(host.menuIndex === MAP_IDS.length - 1, "y da la vuelta por el otro lado");
  tap("Digit2");
  check(host.menuIndex === 1, "las teclas numéricas eligen directamente");
  guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  guest.update(1 / 30);
  check(priv(guest).hudView().menu?.index === 1 && priv(guest).hudView().menu?.host === false, "el invitado ve qué tarjeta tiene el anfitrión (y no puede elegir)");
  tap("Enter");
  check(host.phase === "play" && host.mapId === MAP_IDS[1], "Enter empieza la partida en el mapa elegido", host.mapId);
  check(host.stage.def.id === MAP_IDS[1], "la escena es la de ese mapa");
  check(host.stage.map.doors.length > 0 && host.interact.map === host.stage.map, "las interacciones apuntan a la escena nueva");
  const sp = host.stage.def.playerSpawn;
  check(Math.hypot(host.seats[0].p.position.x - sp.x, host.seats[0].p.position.z - sp.z) < 2.2, "el jugador sale en el punto de inicio del mapa");
  host.update(1 / 30);
  guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  guest.update(1 / 30);
  check(priv(guest).mapId === MAP_IDS[1] && priv(guest).stage.def.id === MAP_IDS[1], "el invitado construye el mismo mapa");
  check(priv(guest).hudView().menu === null, "y deja de ver el selector");
  // Cambiar de mapa a media partida (fin de partida + N).
  host.over = true;
  host.key("KeyN");
  check(host.phase === "menu", "al acabar, N vuelve al selector");
  down.add("Digit1");
  host.update(1 / 30);
  down.delete("Digit1");
  host.update(1 / 30);
  down.add("Enter");
  host.update(1 / 30);
  down.delete("Enter");
  check(host.mapId === MAP_IDS[0] && !host.over, "se puede elegir otro mapa y empieza de nuevo");
  guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  guest.update(1 / 30);
  check(priv(guest).stage.def.id === MAP_IDS[0], "el invitado lo sigue");
  guest.dispose();
  host.dispose();
}

console.log("Tablones y disparos entre tablas");
{
  const host = new DeadZoneHost(new Input(kb), 0, "local", "sector09");
  host.rounds.state = "intermission" as never;
  host.rounds.timer = 99999;
  const w = host.stage.map.windows[0];
  const rig = w.rig;
  check(rig.count === 6, "la barricada empieza entera");
  host.interact.tearPlank(w);
  host.interact.tearPlank(w);
  check(rig.count === 4 && w.planks === 4, "arrancar tablones baja la cuenta de la animación");
  const slots = priv(rig).slots as { mode: string; mesh: THREE.Mesh }[];
  check(slots[5].mode === "off" && slots[4].mode === "off", "los arrancados salen despedidos");
  for (let i = 0; i < 90; i++) host.update(1 / 30);
  check(slots[5].mode === "ground" && slots[5].mesh.position.y < 0.2, "y acaban tirados en el suelo", `${slots[5].mode} y=${slots[5].mesh.position.y.toFixed(2)}`);
  // Reparar: flotan y se colocan.
  w.planks = 6;
  host.interact.paintPlanks(w);
  check(slots[4].mode === "on" && slots[5].mode === "on", "al reparar, los tablones del suelo se elevan");
  for (let i = 0; i < 11; i++) host.update(1 / 30);
  check(slots[4].mesh.position.y > 0.5, "flotan en el aire un momento", `y=${slots[4].mesh.position.y.toFixed(2)}`);
  for (let i = 0; i < 60; i++) host.update(1 / 30);
  check(slots[4].mode === "slot" && slots[5].mode === "slot", "y quedan colocados en su sitio");
  check(slots[5].mesh.position.distanceTo(new THREE.Vector3(0, 0.25 + 5 * 0.27, 0.04)) < 0.1 || slots[5].mesh.position.y > 1.4, "en la posición de la barricada");

  // Entre las tablas se puede disparar: la bala no se detiene en la barricada.
  const eyeFrom = new THREE.Vector3(w.x + w.nx * 3, 1.5, w.z + w.nz * 3);
  const dir = new THREE.Vector3(-w.nx, 0, -w.nz);
  const colliders = host.stage.map.colliders;
  const hitAll = (priv(host).stage.map as Any).colliders.some((c: Any) => c.tag === "barricade" && c.enabled);
  check(hitAll, "la barricada tiene colisión para el movimiento");
  const z = host.stage.zombies.spawn("walker", 1, w.x - w.nx * 1.8, w.z - w.nz * 1.8);
  z.state = "chasing";
  const hits = host.stage.zombies.hitscan(eyeFrom, dir, 12);
  void colliders;
  check(hits.some((h) => h.zombie === z), "el rayo contra un zombi al otro lado de la ventana lo alcanza");
  host.dispose();
}
