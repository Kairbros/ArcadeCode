// Día y noche y monstruos: el reloj, dónde y cuándo aparecen, arder al sol, el zombi pega (no a través de una
// pared), el esqueleto dispara, el petardo explota (y se apaga si te alejas) y en red el golpe le llega al invitado.
import { BlocksGuest, BlocksHost } from "../src/game/blocks/game";
import { AIR, DIRT, STONE } from "../src/game/blocks/blocks";
import { DAY_LENGTH, MORNING, daylight, skyLevel } from "../src/game/blocks/daycycle";
import type { WalkSource } from "../src/game/blocks/input";
import { CREEPER, HOSTILE_MAX, HOSTILE_MIN_DIST, MOBS, Mobs, SKELETON, SPAWN_LIGHT, ZOMBIE } from "../src/game/blocks/mobs";
import { blocksInput, check, rng, tickClock } from "./lib";

const NOON = DAY_LENGTH / 4, MIDNIGHT = (DAY_LENGTH * 3) / 4;

// 1. Reloj.
check(daylight(NOON) === 1 && daylight(MIDNIGHT) === 0 && daylight(MORNING) > 0.5, "mediodía, medianoche y mañana",
  `mañana ${daylight(MORNING).toFixed(2)}`);
check(skyLevel(15, 0) === 4 && skyLevel(15, 1) === 15, "de noche el cielo pleno cuenta como 4");

Math.random = rng(21);
const inp = blocksInput();
const host: any = new BlocksHost(inp as unknown as WalkSource, 0, "local", "survival", 777);
const w = host.world, p = host.pilot, mobs = host.mobs;
const step = (s: number) => { for (let t = 0; t < s; t += 1 / 30) host.update(1 / 30); };
const healthy = () => { p.vitals.reset(); p.deadFor = -1; };

// 2. Aparecen de noche, lejos y a oscuras; de día solo en las cuevas.
const spawns: { x: number; y: number; z: number; day: number; px: number; pz: number }[] = [];
const add = mobs.add.bind(mobs);
mobs.add = (kind: number, x: number, y: number, z: number, yaw?: number) => {
  if (MOBS[kind].hostile) spawns.push({ x, y, z, day: daylight(host.clock), px: p.body.x, pz: p.body.z });
  return add(kind, x, y, z, yaw);
};
mobs.list = [];
host.clock = MIDNIGHT;
step(20);
healthy();
const night = spawns.length;
const hostileNow = mobs.list.filter((m: any) => MOBS[m.kind].hostile && m.hp > 0).length;
const badSpot = (s: typeof spawns[0]) => Mobs.lightNow(w, Math.floor(s.x), Math.floor(s.y), Math.floor(s.z), s.day) > SPAWN_LIGHT ||
  Math.hypot(s.x - s.px, s.z - s.pz) < HOSTILE_MIN_DIST - 1;
check(night > 3 && hostileNow <= HOSTILE_MAX, "de noche aparecen monstruos (sin pasar del máximo)", `${night} aparecidos, ${hostileNow} a la vez`);
check(!spawns.some(badSpot), "siempre a oscuras y lejos del jugador");
const outside = spawns.filter((s) => (w.lightAt(Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)) >> 4) === 15).length;
check(outside > 0, "de noche también al aire libre", `${outside} al aire libre`);
spawns.length = 0;
mobs.list = [];
host.clock = NOON;
step(20);
healthy();
const sunny = spawns.filter((s) => (w.lightAt(Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)) >> 4) >= 12).length;
check(!spawns.some(badSpot) && sunny === 0, "de día solo aparecen en lo oscuro (cuevas)", `${spawns.length} aparecidos`);
mobs.add = add;
mobs.hostiles = false; // a partir de aquí, solo los que ponga la prueba
mobs.list = [];

// Explanada para las peleas.
const [gx, gz] = w.dryColumn(48, 48);
const gy = w.surface(gx, gz) + 1;
const R = 12;
for (let x = gx - R; x <= gx + R; x++) for (let z = gz - R; z <= gz + R; z++) {
  w.set(x, gy - 1, z, DIRT);
  for (let y = gy - 2; y < gy - 1; y++) w.set(x, y, z, STONE);
  for (let y = gy; y < gy + 6; y++) w.set(x, y, z, AIR);
}
const stand = (dx = 0, dz = 0) => Object.assign(p.body, { x: gx + 0.5 + dx, y: gy, z: gz + 0.5 + dz, vx: 0, vy: 0, vz: 0 });

// 3. Al sol, el zombi arde y muere; de noche, no.
host.clock = NOON;
stand(-10, -10);
const sunZombie = mobs.add(ZOMBIE, gx + 8.5, gy, gz + 8.5);
sunZombie.timer = 99;
step(2);
check(sunZombie.burning && sunZombie.hp < 20, "a pleno sol el zombi arde", `vida ${sunZombie.hp}`);
step(22);
check(!mobs.list.includes(sunZombie), "y acaba muriendo");

// 4. De noche el zombi persigue y pega (3 de daño, con empujón).
host.clock = MIDNIGHT;
mobs.list = [];
healthy();
stand();
step(0.1);
mobs.add(ZOMBIE, gx + 5.5, gy, gz + 0.5);
let t = 0;
while (p.vitals.health === 20 && t < 8) { stand(); host.update(1 / 30); t += 1 / 30; }
check(p.vitals.health === 17, "el zombi llega y pega 3", `a los ${t.toFixed(1)} s, vida ${p.vitals.health}`);
let moved = 0;
for (let k = 0; k < 6; k++) { host.update(1 / 30); moved = Math.max(moved, Math.hypot(p.body.x - gx - 0.5, p.body.z - gz - 0.5)); }
check(moved > 0.2, "el golpe empuja", `${moved.toFixed(2)} bloques`);
stand();
step(2.05);
check(p.vitals.health <= 14 && p.vitals.health >= 11, "y sigue pegando cada segundo", `vida ${p.vitals.health}`);

// 5. Con una pared entre medias no pega.
mobs.list = [];
healthy();
stand();
for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  for (let y = gy; y < gy + 3; y++) w.set(gx + dx, y, gz + dz, STONE);
}
w.set(gx, gy + 2, gz, STONE);
const walled = mobs.add(ZOMBIE, gx + 2.5, gy, gz + 0.5);
step(5);
check(p.vitals.health === 20 && Math.hypot(walled.body.x - gx - 0.5, walled.body.z - gz - 0.5) < 2.5,
  "con una pared entre medias no pega (aunque esté al lado)");
for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  for (let y = gy; y < gy + 3; y++) w.set(gx + dx, y, gz + dz, AIR);
}

// 6. El esqueleto dispara desde lejos.
mobs.list = [];
healthy();
stand();
mobs.add(SKELETON, gx + 9.5, gy, gz + 0.5);
let arrows = 0;
t = 0;
while (p.vitals.health === 20 && t < 10) { host.update(1 / 30); t += 1 / 30; arrows = Math.max(arrows, mobs.arrows.length); stand(); }
check(arrows > 0 && p.vitals.health === 17, "el esqueleto dispara y la flecha quita 3", `a los ${t.toFixed(1)} s`);

// 7. El petardo se enciende y explota: rompe bloques y hace mucho daño. Si te alejas, se apaga.
mobs.list = [];
mobs.arrows = [];
healthy();
stand();
const boom = mobs.add(CREEPER, gx + 4.5, gy, gz + 0.5);
t = 0;
while (mobs.list.includes(boom) && boom.hp > 0 && t < 10) { host.update(1 / 30); t += 1 / 30; stand(); }
let holes = 0;
for (let x = gx - 3; x <= gx + 6; x++) for (let z = gz - 4; z <= gz + 4; z++) if (w.get(x, gy - 1, z) === AIR) holes++;
check(boom.hp <= 0 && holes > 3, "el petardo explota y abre un agujero", `${holes} bloques del suelo rotos, a los ${t.toFixed(1)} s`);
check(p.vitals.health < 20 - 4, "la explosión hace mucho daño de cerca", `vida ${p.vitals.health}`);
for (let x = gx - 4; x <= gx + 7; x++) for (let z = gz - 5; z <= gz + 5; z++) {
  w.set(x, gy - 2, z, STONE);
  w.set(x, gy - 1, z, DIRT);
}
mobs.list = [];
healthy();
stand();
const fuse = mobs.add(CREEPER, gx + 3.5, gy, gz + 0.5);
t = 0;
while (fuse.fuse < 0.5 && t < 6) { host.update(1 / 30); t += 1 / 30; stand(); }
check(fuse.fuse >= 0.5, "se enciende al acercarse");
stand(-11, 0);
step(3);
check(fuse.hp > 0 && fuse.fuse === 0 && p.vitals.health === 20, "si te alejas, se apaga sin explotar");

// 8. En red: el golpe del zombi al invitado le llega una vez y lo confirma.
const h2: any = new BlocksHost(blocksInput() as unknown as WalkSource, 1, "host", "survival", 777);
h2.mobs.hostiles = false;
h2.mobs.list = [];
h2.clock = MIDNIGHT;
const gi = blocksInput();
const guest: any = new BlocksGuest(1, gi as unknown as WalkSource, "survival");
const sync = () => guest.onSnap(JSON.parse(JSON.stringify(h2.frame().snap)));
const send = () => { tickClock(200); const m = guest.outgoing("relay"); if (m) h2.onMessage(1, JSON.parse(JSON.stringify(m))); return m; };
sync();
guest.update(1 / 30);
send();
const r = h2.remotes[0];
h2.mobs.add(ZOMBIE, r.x + 1.2, r.y, r.z);
t = 0;
while (!r.hurts.length && t < 5) { h2.update(1 / 30); t += 1 / 30; }
check(r.hurts.length === 1, "el anfitrión apunta el golpe al invitado", `a los ${t.toFixed(1)} s`);
sync();
sync(); // repetido: no cuenta dos veces
check(guest.pilot.vitals.health === 17, "el invitado recibe 3 de daño (una sola vez)", `vida ${guest.pilot.vitals.health}`);
const m = send();
check(m?.hk === 1 && r.hurts.length === 0, "confirma el golpe y el anfitrión deja de mandarlo");
check(Math.abs(guest.clock - h2.clock) < 0.5, "el invitado tiene la misma hora");
