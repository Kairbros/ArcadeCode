// Vida y hambre: daño por caída, ahogarse, pasar hambre, curarse, comer, morir (suelta todo) y reaparecer;
// y en red, la muerte de un invitado (lo suyo cae donde murió y no reaparece hasta que el anfitrión lo tiene).
import { BlocksGuest, BlocksHost } from "../src/game/blocks/game";
import { AIR, DIRT, LOG, WATER } from "../src/game/blocks/blocks";
import type { WalkSource } from "../src/game/blocks/input";
import { BEEF } from "../src/game/blocks/items";
import { MAX_AIR } from "../src/game/blocks/vitals";
import { blocksInput, check, rng, tickClock } from "./lib";

Math.random = rng(9);
const inp = blocksInput();
const host: any = new BlocksHost(inp as unknown as WalkSource, 0, "local", "survival", 4242);
const w = host.world, p = host.pilot, vt = p.vitals;
const step = (s: number) => { for (let t = 0; t < s; t += 1 / 30) host.update(1 / 30); };
host.mobs.list = [];
host.mobs.update = () => {}; // sin animales que estorben

// Explanada.
const [gx, gz] = w.dryColumn(30, 30);
const sy = w.surface(gx, gz) + 1;
for (let x = gx - 4; x <= gx + 4; x++) for (let z = gz - 4; z <= gz + 4; z++) {
  w.set(x, sy - 1, z, DIRT);
  for (let y = sy; y < sy + 14; y++) w.set(x, y, z, AIR);
}
const put = (y: number, x = gx + 0.5, z = gz + 0.5) => Object.assign(p.body, { x, y, z, vx: 0, vy: 0, vz: 0, ground: false });
const fresh = () => { vt.reset(); };

// 1. Caídas: 3 bloques no hacen daño; 10 bloques, 7.
put(sy); step(0.5); fresh();
put(sy + 3); step(1.5);
check(vt.health === 20, "caer 3 bloques no hace daño", `vida ${vt.health}`);
put(sy + 10); step(2);
check(vt.health === 13 && vt.hurt === 0, "caer 10 bloques quita 7", `vida ${vt.health}`);

// 2. Caer al agua no hace daño. Ahogarse: 10 burbujas (12 s) y luego 2 por segundo.
for (let x = gx - 1; x <= gx + 1; x++) for (let z = gz - 1; z <= gz + 1; z++) for (let y = sy - 4; y < sy; y++) w.set(x, y, z, WATER);
fresh();
put(sy + 10); step(1.5);
check(vt.health === 20, "caer 10 bloques al agua no hace daño", `vida ${vt.health}`);
put(sy - 4); step(11);
check(vt.air > 0 && vt.health === 20, "bajo el agua aguanta 12 s", `burbujas ${vt.air.toFixed(1)}`);
step(4.1);
check(vt.air === 0 && vt.health <= 16 && vt.health >= 13, "sin aire se ahoga", `vida ${vt.health}`);
put(sy, gx + 3.5); step(2.5);
check(vt.air === MAX_AIR, "fuera del agua recupera el aire");

// 3. Hambre: baja sola (un punto cada 80 s sin hacer nada); a 0 quita vida hasta dejar 1.
fresh(); step(160.5);
check(vt.hunger === 18, "sin hacer nada, 2 de hambre en 160 s", `hambre ${vt.hunger}`);
fresh(); vt.hunger = 0; step(8.1);
check(vt.health === 18, "con el hambre a 0 pierde 1 cada 4 s", `vida ${vt.health}`);
vt.health = 3; step(20);
check(vt.health === 1 && !p.dead, "el hambre no mata: deja 1 de vida", `vida ${vt.health}`);

// 4. Curarse con el hambre alta; gasta hambre.
fresh(); vt.health = 10; step(8.1);
check(vt.health === 12 && vt.exhaustion + (20 - vt.hunger) * 4 >= 6, "con hambre ≥ 18 se cura 1 cada 4 s", `vida ${vt.health}, hambre ${vt.hunger}`);

// 5. Comer: clic derecho mantenido 1,6 s con carne en la mano; lleno no come.
fresh(); vt.hunger = 10;
p.inventory.slots[0] = { id: BEEF, n: 2 }; p.slot = 0;
inp.placeHeld = true;
step(1.4);
check(vt.hunger === 10 && vt.eating > 1, "comiendo… (aún no)");
step(0.3);
check(vt.hunger === 13 && p.inventory.count(BEEF) === 1, "ternera cruda: +3 de hambre y gasta una", `hambre ${vt.hunger}`);
vt.hunger = 20; step(2);
check(p.inventory.count(BEEF) === 1, "lleno no come");
inp.placeHeld = false;

// 6. Morir: suelta todo donde cae, no lo recoge muerto, reaparece con ESPACIO/clic tras 1 s.
p.inventory.slots[1] = { id: LOG, n: 5 };
fresh(); vt.health = 2;
put(sy + 10, gx - 2.5);
let t = 0;
while (!p.dead && t < 3) { host.update(1 / 30); t += 1 / 30; }
step(0.1);
const total = () => host.drops.list.reduce((a: number, d: any) => a + d.n, 0);
check(p.dead && p.inventory.slots.every((s: any) => !s) && total() === 6, "al morir suelta todo el inventario", `en el suelo ${total()}`);
check(host.frame().snap.p[0].length === 0, "muerto no se dibuja para los demás");
inp._dig = 1; step(1 / 30);
check(p.dead, "nada más morir, un clic no lo hace reaparecer");
step(3);
check(total() === 6, "muerto no recoge nada");
inp._dig = 1; step(1 / 30);
const sp = (p as any).spawn;
check(!p.dead && vt.health === 20 && vt.hunger === 20 && p.body.x === sp[0] && p.body.z === sp[2], "clic: reaparece entero en su sitio");

// 7. En red: el invitado muere, lo suyo cae donde murió y no reaparece hasta que el anfitrión lo confirma.
const h2: any = new BlocksHost(blocksInput() as unknown as WalkSource, 1, "host", "survival", 4242);
h2.mobs.list = [];
const gi = blocksInput();
const guest: any = new BlocksGuest(1, gi as unknown as WalkSource, "survival");
const sync = () => guest.onSnap(JSON.parse(JSON.stringify(h2.frame().snap)));
const send = () => { tickClock(200); const m = guest.outgoing("relay"); if (m) h2.onMessage(1, JSON.parse(JSON.stringify(m))); return m; };
sync();
const gp = guest.pilot;
for (let k = 0; k < 10; k++) { guest.update(1 / 30); send(); }
const where = [gp.body.x, gp.body.z];
gp.inventory.slots[0] = { id: LOG, n: 3 };
gp.inventory.slots[4] = { id: BEEF, n: 2 };
gp.vitals.health = 0;
guest.update(1 / 30);
check(gp.dead && guest.pending.filter((e: number[]) => e[1] === -1 && e[4] === 1).length === 2, "el invitado muere y pide soltar sus 2 montones");
gi._dig = 1;
for (let k = 0; k < 45; k++) guest.update(1 / 30); // 1,5 s sin que el anfitrión lo sepa
check(gp.dead, "no reaparece hasta que el anfitrión tiene lo que soltó");
const m = send();
check(m?.d === 1 && h2.remotes[0].dead, "el anfitrión sabe que está muerto");
const near = h2.drops.list.filter((d: any) => Math.hypot(d.x - where[0], d.z - where[1]) < 2).reduce((a: number, d: any) => a + d.n, 0);
check(near === 5, "lo soltado aparece donde murió", `${near} objetos`);
check(h2.frame().snap.p[1].length === 0, "muerto no se dibuja");
for (let k = 0; k < 90; k++) h2.update(1 / 30);
check(h2.remotes[0].grants.length === 0, "muerto no recoge nada");
sync();
gi._dig = 1;
guest.update(1 / 30);
check(!gp.dead && gp.vitals.health === 20, "confirmado: con un clic reaparece");
send();
check(!h2.remotes[0].dead, "el anfitrión lo vuelve a ver vivo");
