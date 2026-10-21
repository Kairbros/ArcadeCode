// Dead Zone: validación de cada mapa — sitios libres (inicio, caja, máquinas, compras), conectividad por la rejilla de rutas con
// todo abierto, encierro con puertas y ventanas cerradas, ventanas bien orientadas y sin identificadores repetidos.
import { check } from "./lib";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneHost } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";
import { MAP_IDS } from "../src/game/deadzone/world/maps";
import { inRooms } from "../src/game/deadzone/world/mapdata";
import { PERK_IDS } from "../src/game/deadzone/game/perks";
import type { Collider } from "../src/game/deadzone/core/collision";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const priv = (x: unknown) => x as Any;
const kb = { isDown: () => false, anyDown: () => false } as unknown as Keyboard;

for (const id of MAP_IDS) {
  console.log(`Mapa ${id}`);
  const host = new DeadZoneHost(new Input(kb), 0, "local", id);
  const map = host.stage.map;
  const def = host.stage.def;
  const nav = host.stage.nav!;
  const solid = (): Collider[] => map.colliders.filter((c) => c.enabled && c.tag !== "floor" && c.tag !== "ceiling" && c.min.y < 1.8);
  const blockedBy = (x: number, z: number, r = 0.34, skip?: Collider): Collider | undefined =>
    solid().find((c) => c !== skip && x > c.min.x - r && x < c.max.x + r && z > c.min.z - r && z < c.max.z + r);
  const label = (c?: Collider) => (c ? `${c.tag}@${c.min.x.toFixed(1)},${c.min.z.toFixed(1)}→${c.max.x.toFixed(1)},${c.max.z.toFixed(1)}` : "");
  const inBounds = (x: number, z: number) => x > def.bounds.minX + 0.5 && x < def.bounds.maxX - 0.5 && z > def.bounds.minZ + 0.5 && z < def.bounds.maxZ - 0.5;

  // --- Identificadores y huecos ---
  const ids = [...map.doors.map((d) => d.id), ...map.windows.map((w) => w.id)];
  check(new Set(ids).size === ids.length, `${id}: puertas y ventanas sin repetir`, ids.filter((v, i) => ids.indexOf(v) !== i).join(","));
  check(map.windows.length >= 8 && map.doors.length >= 3, `${id}: hay ventanas y puertas de pago`, `${map.windows.length} ventanas, ${map.doors.length} puertas`);
  const badWin = map.windows.filter((w) => inRooms(def.rooms, w.inner.x, w.inner.z) === null || inRooms(def.rooms, w.outer.x, w.outer.z) !== null);
  check(badWin.length === 0, `${id}: cada ventana tiene el interior dentro y el exterior fuera`, badWin.map((w) => w.id).join(","));

  // --- Sitios libres ---
  for (let k = 0; k < 4; k++) {
    const x = def.playerSpawn.x + (k - 1.5) * 1.3;
    const c = blockedBy(x, def.playerSpawn.z);
    check(!c, `${id}: sitio de salida del jugador ${k + 1} libre`, label(c));
  }
  check(inRooms(def.rooms, def.playerSpawn.x, def.playerSpawn.z) !== null, `${id}: se empieza dentro de un edificio (las ventanas importan)`);
  def.boxSpots.forEach((sp, i) => {
    map.moveBox(i);
    const mine = map.colliders.find((c) => c.tag === "prop" && c.max.y === 1.1 && Math.abs((c.min.x + c.max.x) / 2 - sp.x) < 0.01 && Math.abs((c.min.z + c.max.z) / 2 - sp.z) < 0.01);
    check(!!mine, `${id}: caja ${sp.name}: tiene colisionador`);
    const others = solid().filter((c) => c !== mine && mine && c.min.x < mine.max.x + 0.05 && c.max.x > mine.min.x - 0.05 && c.min.z < mine.max.z + 0.05 && c.max.z > mine.min.z - 0.05);
    check(others.length === 0, `${id}: caja ${sp.name}: libre de muros y objetos`, others.map(label).join(" "));
    const fx = sp.x + Math.sin(sp.rot) * 1.5;
    const fz = sp.z + Math.cos(sp.rot) * 1.5;
    const front = blockedBy(fx, fz, 0.3, mine);
    check(!front, `${id}: caja ${sp.name}: sitio delante`, label(front));
    check(inBounds(sp.x, sp.z), `${id}: caja ${sp.name}: dentro del mapa`);
  });
  map.moveBox(0);
  const dirs: [string, number, number, number, number][] = PERK_IDS.map((p) => {
    const s = def.perkSpots[p];
    return [p, s.x, s.z, Math.sin(s.rot), Math.cos(s.rot)];
  });
  for (const [p, x, z, dx, dz] of dirs) {
    const mach = map.perks.find((m) => m.id === p)!;
    const mine = map.colliders.find((c) => c.tag === "prop" && Math.abs((c.min.x + c.max.x) / 2 - x) < 0.01 && Math.abs((c.min.z + c.max.z) / 2 - z) < 0.01 && c.max.y === 2.4);
    const others = solid().filter((c) => c !== mine && mine && c.min.x < mine.max.x + 0.02 && c.max.x > mine.min.x - 0.02 && c.min.z < mine.max.z + 0.02 && c.max.z > mine.min.z - 0.02 && c.tag !== "wall");
    const wallOverlap = solid().filter((c) => c !== mine && mine && c.tag === "wall" && c.min.x < mine.max.x - 0.05 && c.max.x > mine.min.x + 0.05 && c.min.z < mine.max.z - 0.05 && c.max.z > mine.min.z + 0.05);
    check(!!mach && others.length === 0 && wallOverlap.length === 0, `${id}: ${p}: libre de objetos y muros`, [...others, ...wallOverlap].map(label).join(" "));
    const front = blockedBy(x + dx * 1.5, z + dz * 1.5, 0.3, mine);
    check(!front, `${id}: ${p}: sitio delante`, label(front));
  }
  const up = def.upgrader;
  check(!blockedBy(up.x + Math.cos(up.facing) * 1.7, up.z + Math.sin(up.facing) * 1.7, 0.3, map.colliders.find((c) => c.tag === "prop" && c.max.y === 2.6)), `${id}: mejorador: sitio delante`);
  const pw = def.powerSwitch;
  check(!blockedBy(pw.x + Math.cos(pw.facing) * 1.8, pw.z + Math.sin(pw.facing) * 1.8, 0.3), `${id}: interruptor: sitio delante`);
  for (const b of map.buys) {
    const c = blockedBy(b.position.x + b.normal.x * 0.9, b.position.z + b.normal.z * 0.9, 0.3);
    check(!c, `${id}: compra ${b.spec.id}: sitio delante`, label(c));
  }

  // --- Todo abierto: se puede llegar a todas partes ---
  for (const d of map.doors) {
    d.open = true;
    d.collider.enabled = false;
  }
  for (const w of map.windows) {
    w.planks = 0;
    w.barricade.enabled = false;
  }
  priv(host).syncWindowNav();
  nav.rebuild();
  const start = { x: def.playerSpawn.x, y: 0, z: def.playerSpawn.z };
  const reach = (x: number, z: number) => nav.findPath(start, { x, y: 0, z }) !== null;
  const nope: string[] = [];
  def.spawns.forEach((s, i) => !reach(s.x, s.z) && nope.push(`aparición ${i}`));
  def.boxSpots.forEach((s) => !reach(s.x + Math.sin(s.rot) * 1.5, s.z + Math.cos(s.rot) * 1.5) && nope.push(`caja ${s.name}`));
  for (const [p, x, z, dx, dz] of dirs) !reach(x + dx * 1.5, z + dz * 1.5) && nope.push(`máquina ${p}`);
  !reach(up.x + Math.cos(up.facing) * 1.7, up.z + Math.sin(up.facing) * 1.7) && nope.push("mejorador");
  !reach(pw.x + Math.cos(pw.facing) * 1.8, pw.z + Math.sin(pw.facing) * 1.8) && nope.push("interruptor");
  for (const w of map.windows) (!reach(w.inner.x, w.inner.z) || !reach(w.outer.x, w.outer.z)) && nope.push(`ventana ${w.id}`);
  for (const b of map.buys) !reach(b.position.x + b.normal.x * 0.9, b.position.z + b.normal.z * 0.9) && nope.push(`compra ${b.spec.id}`);
  check(nope.length === 0, `${id}: con todo abierto se llega a todas partes`, nope.join(", "));

  // --- Todo cerrado: el jugador está encerrado y los zombis llegan a las ventanas ---
  for (const d of map.doors) {
    d.open = false;
    d.collider.enabled = true;
  }
  for (const w of map.windows) {
    w.planks = 6;
    w.barricade.enabled = true;
  }
  priv(host).syncWindowNav();
  nav.rebuild();
  const leak = def.spawns.filter((s) => nav.findPath({ x: s.x, y: 0, z: s.z }, start) !== null);
  check(leak.length === 0, `${id}: con todo cerrado nadie llega al jugador sin romper tablones`, leak.map((s) => `${s.x},${s.z}`).join(" "));
  const lost = map.windows.filter((w) => !def.spawns.some((s) => nav.findPath({ x: s.x, y: 0, z: s.z }, { x: w.outer.x, y: 0, z: w.outer.z }) !== null));
  check(lost.length === 0, `${id}: todas las ventanas se alcanzan desde la calle`, lost.map((w) => w.id).join(","));
  host.dispose();
}
