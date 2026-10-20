// Animales: aparecen en hierba, pasean sin meterse en bloques, se golpean (huyen y salen despedidos), mueren,
// sueltan lo suyo y reaparecen lejos. Golpes de un invitado: los valida el anfitrión (una vez y a su alcance).
import { BlocksGuest, BlocksHost } from "../src/game/blocks/game";
import { AIR, DIRT, GRASS, STONE } from "../src/game/blocks/blocks";
import type { WalkSource } from "../src/game/blocks/input";
import { BEEF, STONE_SWORD, WOOD_SWORD } from "../src/game/blocks/items";
import { COW, DEATH_TIME, MOBS, MOB_TARGET, RESPAWN_EVERY, SPAWN_MIN_DIST } from "../src/game/blocks/mobs";
import { collides } from "../src/game/blocks/player";
import { blocksInput, check, rng, tickClock } from "./lib";

Math.random = rng(5);
const inp = blocksInput();
const host: any = new BlocksHost(inp as unknown as WalkSource, 0, "local", "survival", 777);
const w = host.world, p = host.pilot, mobs = host.mobs;
mobs.hostiles = false; // aquí solo los animales (los monstruos tienen su prueba)
const step = (s: number) => { for (let t = 0; t < s; t += 1 / 30) host.update(1 / 30); };

// 1. Aparecen sobre hierba, siempre los mismos para la misma semilla.
const kinds = new Set(mobs.list.map((m: any) => m.kind));
check(mobs.list.length >= MOB_TARGET && kinds.size >= 3, "aparecen las primeras manadas", `${mobs.list.length} animales, ${kinds.size} tipos`);
check(mobs.list.every((m: any) => w.get(Math.floor(m.body.x), Math.floor(m.body.y) - 1, Math.floor(m.body.z)) === GRASS), "todos sobre hierba");
const again: any = new BlocksHost(blocksInput() as unknown as WalkSource, 0, "local", "survival", 777);
const pos = (h: any) => h.mobs.list.map((m: any) => `${m.kind}:${m.body.x},${m.body.z}`).join(" ");
check(pos(again) === pos(host), "misma semilla, mismos animales");

// 2. Dos minutos de paseo.
const start = new Map(mobs.list.map((m: any) => [m.id, [m.body.x, m.body.z]]));
let inside = 0, out = 0;
for (let s = 0; s < 120; s++) {
  step(1);
  for (const m of mobs.list) {
    const b = m.body;
    if (collides(w, b.x, b.y, b.z, MOBS[m.kind].size)) inside++;
    if (b.y < 1 || b.x < 0 || b.z < 0 || b.x > 96 || b.z > 96) out++;
  }
}
const moved = mobs.list.filter((m: any) => {
  const s = start.get(m.id) as number[] | undefined;
  return s && Math.hypot(m.body.x - s[0], m.body.z - s[1]) > 2;
}).length;
check(moved >= mobs.list.length / 2, "pasean", `${moved}/${mobs.list.length} se han movido más de 2 bloques`);
check(inside === 0 && out === 0, "nunca dentro de un bloque ni fuera del mundo", `${inside} dentro, ${out} fuera`);
const wet = mobs.list.filter((m: any) => m.body.inWater).length;
check(wet === 0, "paseando no se meten en el agua", `${wet} en el agua`);

// 3. Explanada propia con una vaca delante (−z con guiñada 0) a 2 bloques.
const [gx, gz] = w.dryColumn(48, 48);
const sy = w.surface(gx, gz) + 1;
for (let x = gx - 4; x <= gx + 4; x++) for (let z = gz - 7; z <= gz + 3; z++) {
  w.set(x, sy - 1, z, DIRT);
  for (let y = sy; y < sy + 4; y++) w.set(x, y, z, AIR);
}
mobs.list = [];
const cowAt = (cow: any) => {
  Object.assign(cow.body, { x: gx + 0.5, y: sy, z: gz - 1.5, vx: 0, vy: 0, vz: 0 });
  Object.assign(p.body, { x: gx + 0.5, y: sy, z: gz + 0.5, vx: 0, vy: 0, vz: 0 });
  p.yaw = 0;
  p.pitch = Math.atan2(0.7 - 1.62, 2);
};
let cow = mobs.add(COW, gx + 0.5, sy, gz - 1.5);
cowAt(cow);
step(1 / 30);
check(p.mobTarget === cow.id && p.target === null, "apunta a la vaca (no al suelo de detrás)");
inp._dig = 1;
step(1 / 30);
check(cow.hp === 9 && cow.hurt > 0 && cow.panic > 0, "un clic a mano: 1 de daño, se pone roja y huye", `vida ${cow.hp}`);
step(0.4);
const away = Math.hypot(cow.body.x - p.body.x, cow.body.z - p.body.z);
check(away > 3, "sale despedida hacia atrás", `a ${away.toFixed(2)} bloques`);

// 4. Con espada de madera (4): una vaca nueva cae en 3 golpes y suelta ternera.
p.inventory.slots[0] = { id: WOOD_SWORD, n: 1 };
p.slot = 0;
mobs.list = [];
cow = mobs.add(COW, gx + 0.5, sy, gz - 1.5);
let hits = 0;
while (cow.hp > 0 && hits < 10) {
  cowAt(cow);
  step(1 / 30);
  inp._dig = 1;
  step(1 / 30);
  hits++;
  if (cow.hp > 0) step(0.5);
}
check(hits === 3, "espada de madera: vaca en 3 golpes", `${hits} golpes`);
const beef = host.drops.list.filter((d: any) => d.item === BEEF).reduce((a: number, d: any) => a + d.n, 0);
check(beef >= 1 && beef <= 3, "suelta 1–3 de ternera", `${beef}`);
check(mobs.list.length === 1 && mobs.list[0].hp <= 0, "cae de lado antes de desaparecer");
step(DEATH_TIME + 0.1);
check(mobs.list.length === 0, "desaparece al rato");
const d = host.drops.list.find((x: any) => x.item === BEEF);
Object.assign(p.body, { x: d.x, z: d.z });
step(0.3);
check(p.inventory.count(BEEF) === beef, "se recoge la ternera");

// 5. Un bloque entre medias tapa al animal.
cow = mobs.add(COW, gx + 0.5, sy, gz - 2.5);
cowAt(cow);
cow.body.z = gz - 2.5;
w.set(gx, sy, gz - 1, STONE);
w.set(gx, sy + 1, gz - 1, STONE);
step(1 / 30);
check(p.mobTarget === 0 && p.target?.z === gz - 1, "con una pared delante se apunta a la pared");
w.set(gx, sy, gz - 1, AIR);
w.set(gx, sy + 1, gz - 1, AIR);

// 6. Reaparecen lejos de los jugadores si faltan.
mobs.list = [];
step(RESPAWN_EVERY + 0.5);
const near = mobs.list.filter((m: any) => Math.hypot(m.body.x - p.body.x, m.body.z - p.body.z) < SPAWN_MIN_DIST).length;
check(mobs.list.length >= 2 && mobs.list.length <= 4 && near === 0, "reaparece una manada lejos",
  `${mobs.list.length} animales, ${near} cerca`);

// 7. Golpes de un invitado: el anfitrión los aplica una vez, con el daño de lo que lleva y si está cerca.
const h2: any = new BlocksHost(blocksInput() as unknown as WalkSource, 1, "host", "survival", 777);
const r = h2.remotes[0];
const [rx, ry, rz] = [r.x, r.y, r.z]; // los mensajes cambian r
h2.mobs.list = [];
const c2 = h2.mobs.add(COW, rx + 1.5, ry, rz);
const msg = (s: number, e: number[][], dx = 0) => ({ t: "m", x: rx + dx, y: ry, z: rz, a: 0, p: 0, h: 0, e, g: 0, s });
h2.onMessage(1, msg(1, [[1, -2, c2.id, STONE_SWORD, 0, 0]]));
check(c2.hp === 5, "golpe del invitado con espada de piedra: 5 de daño", `vida ${c2.hp}`);
for (let t = 0; t < 1; t += 1 / 30) h2.update(1 / 30);
h2.onMessage(1, msg(2, [[1, -2, c2.id, STONE_SWORD, 0, 0]]));
check(c2.hp === 5, "el mismo golpe reenviado no cuenta dos veces");
Object.assign(c2.body, { x: rx + 1.5, y: ry, z: rz });
h2.onMessage(1, msg(3, [[2, -2, c2.id, STONE_SWORD, 0, 0]], 30));
check(c2.hp === 5, "desde lejos no cuenta");

// El invitado ve los animales y golpea con su propio clic.
r.lastK = 0; // el invitado de verdad numera sus acciones desde 1
const gi = blocksInput();
const guest: any = new BlocksGuest(1, gi as unknown as WalkSource, "survival");
Object.assign(c2.body, { x: rx + 1.5, y: ry, z: rz, vx: 0, vy: 0, vz: 0 });
c2.hurt = 0;
guest.onSnap(JSON.parse(JSON.stringify(h2.frame().snap)));
check(guest.mobs.length === h2.mobs.list.length && guest.mobs[0].kind === COW, "el invitado recibe los animales");
const gp = guest.pilot;
Object.assign(gp.body, { x: rx, y: ry, z: rz, vx: 0, vy: 0, vz: 0 });
const ex = c2.body.x - rx, ey = c2.body.y + 0.7 - (ry + 1.62), ez = c2.body.z - rz;
gp.yaw = Math.atan2(-ex, -ez);
gp.pitch = Math.atan2(ey, Math.hypot(ex, ez));
gi._dig = 1;
guest.update(1 / 30);
tickClock(1000);
const out2 = guest.outgoing("p2p");
check(JSON.stringify(out2).length <= 300 && out2.e.some((e: number[]) => e[1] === -2), "el clic del invitado viaja como golpe");
h2.onMessage(1, { ...out2, s: 10 });
check(c2.hp === 4, "el anfitrión aplica el golpe a mano del invitado", `vida ${c2.hp}`);
