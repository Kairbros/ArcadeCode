// Objetos del suelo en local: lo roto cae y se recoge; Q lo tira y quien lo tira espera 1,5 s para recogerlo.
import { BlocksHost } from "../src/game/blocks/game";
import { AIR, LOG } from "../src/game/blocks/blocks";
import type { WalkSource } from "../src/game/blocks/input";
import { blocksInput, check, rng } from "./lib";

Math.random = rng(3); // el salto de los objetos es al azar: así cae siempre igual
const inp = blocksInput();
const host = new BlocksHost(inp as unknown as WalkSource, 0, "local", "survival", 777);
const w = host.world, p = host.pilot;
const step = (s: number) => { for (let t = 0; t < s; t += 1 / 30) host.update(1 / 30); };
const dist = (d: { x: number; z: number }) => Math.hypot(d.x - p.body.x, d.z - p.body.z);
step(1);

// Tronco flotando a la altura de los ojos, delante (−z con guiñada 0).
p.yaw = 0; p.pitch = 0;
const bx = Math.floor(p.body.x), by = Math.floor(p.body.y) + 1, bz = Math.floor(p.body.z) - 2;
w.set(bx, by, bz, LOG);
w.set(bx, by - 1, bz, AIR);
step(0.1);
check(p.target?.x === bx && p.target.y === by && p.target.z === bz, "apunta al tronco");

inp.digMouse = true;
let t = 0;
while (w.get(bx, by, bz) === LOG && t < 10) { host.update(1 / 30); t += 1 / 30; }
inp.digMouse = false;
check(host.drops.list.length === 1 && p.inventory.count(LOG) === 0, "al romper cae al suelo (no va directo al inventario)",
  `${t.toFixed(2)} s`);
step(0.7);
const fallen = host.drops.list[0];
check(fallen?.y < by, "el objeto salta un poco y cae al suelo", `y ${fallen?.y.toFixed(2)} (bloque roto a y ${by})`);
check(dist(fallen) > 1.5 && p.inventory.count(LOG) === 0, "a más de 1,5 bloques no se recoge", `a ${dist(fallen).toFixed(2)}`);
p.body.z = fallen.z + 1.2;
step(0.2);
check(p.inventory.count(LOG) === 1 && host.drops.list.length === 0, "se recoge al acercarse");

// Tirar con Q.
p.slot = p.inventory.slots.findIndex((s) => s?.id === LOG);
inp._throw = 1;
step(0.3);
const th = host.drops.list[0];
check(!!th && th.owner === 0 && p.inventory.count(LOG) === 0, "Q tira uno hacia delante", th ? `a ${dist(th).toFixed(2)} bloques` : "");
step(0.8);
Object.assign(p.body, { x: th.x, z: th.z });
step(0.2);
check(host.drops.list.length === 1, "encima a 1,3 s: aún no puede recogerlo quien lo tiró");
step(0.5);
check(host.drops.list.length === 0 && p.inventory.count(LOG) === 1, "a 1,8 s ya lo recoge");
