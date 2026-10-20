// Supervivencia en local: talar, craftear (2×2 y mesa 3×3), poner la mesa, pico de madera, piedra a mano y con pico.
import { BlocksHost } from "../src/game/blocks/game";
import { layout } from "../src/game/blocks/craftui";
import { AIR, COBBLE, DIRT, LOG, PLANKS, STONE, TABLE } from "../src/game/blocks/blocks";
import { STICK, WOOD_PICK } from "../src/game/blocks/items";
import type { WalkSource } from "../src/game/blocks/input";
import { blocksInput, check } from "./lib";

const inp = blocksInput();
const host = new BlocksHost(inp as unknown as WalkSource, 0, "local", "survival", 12345);
const w = host.world, p = host.pilot;
const step = (s = 1 / 30) => { for (let t = 0; t < s; t += 1 / 30) host.update(1 / 30); };
const slotOf = (id: number) => p.inventory.slots.findIndex((s) => s?.id === id);

/** Se pone al lado de (bx, by, bz), de pie en `stand`, y lo mira. */
function aim(bx: number, by: number, bz: number, stand = by): boolean {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = bx + dx, z = bz + dz;
    if (w.get(x, stand, z) !== AIR || w.get(x, stand + 1, z) !== AIR || w.get(x, stand - 1, z) === AIR) continue;
    Object.assign(p.body, { x: x + 0.5, y: stand, z: z + 0.5, vx: 0, vy: 0, vz: 0 });
    const ex = bx + 0.5 - p.body.x, ey = by + 0.5 - (stand + 1.62), ez = bz + 0.5 - p.body.z;
    p.yaw = Math.atan2(-ex, -ez);
    p.pitch = Math.atan2(ey, Math.hypot(ex, ez));
    step();
    return p.target?.x === bx && p.target.y === by && p.target.z === bz;
  }
  return false;
}

/** Mantiene el clic hasta romperlo; luego espera a recoger lo que suelte. Devuelve los segundos (-1 si no pudo apuntar). */
function dig(bx: number, by: number, bz: number, stand = by): number {
  if (!aim(bx, by, bz, stand)) return -1;
  inp.digMouse = true;
  let t = 0;
  while (w.get(bx, by, bz) !== AIR && t < 30) { host.update(1 / 30); t += 1 / 30; }
  inp.digMouse = false;
  step(1.5);
  return t;
}

function clickAt(size: 2 | 3, kind: string, i: number, button = 0, shift = false) {
  const r = layout(size).rects.find((r) => r.t.kind === kind && (kind === "out" || (r.t as { i?: number }).i === i))!;
  inp._clicks.push({ x: r.x + 8, y: r.y + 8, button, shift });
  step();
}

// 1. Talar tres troncos (a la altura de los ojos, desde el suelo).
const logs: number[][] = [];
for (let y = 1; y < 48; y++) for (let z = 0; z < 96; z++) for (let x = 0; x < 96; x++) {
  if (w.get(x, y, z) === LOG && w.get(x, y - 1, z) !== LOG) logs.push([x, y, z]);
}
let cut = 0, first = 0;
for (const [x, y, z] of logs) {
  const t = dig(x, y + 1, z, y);
  if (t > 0 && cut++ === 0) first = t;
  if (cut >= 3) break;
}
check(first > 2.9 && first < 3.2, "tronco a mano ≈ 3 s", `${first.toFixed(2)} s`);
check(p.inventory.count(LOG) === 3, "3 troncos recogidos del suelo", `${p.inventory.count(LOG)}`);

// 2. Inventario 2×2.
inp._inv = 1; step();
check(!!p.crafter && inp.ui, "E abre el inventario y suelta el puntero");
clickAt(2, "inv", slotOf(LOG)); clickAt(2, "grid", 0);
for (let k = 0; k < 3; k++) clickAt(2, "out", 0, 0, true);
check(p.inventory.count(PLANKS) === 12, "3 troncos → 12 tablones", `${p.inventory.count(PLANKS)}`);
let ps = slotOf(PLANKS);
clickAt(2, "inv", ps); clickAt(2, "grid", 0, 2); clickAt(2, "grid", 2, 2); clickAt(2, "inv", ps);
clickAt(2, "out", 0, 0, true);
check(p.inventory.count(STICK) === 4, "2 tablones en vertical → 4 palos", `${p.inventory.count(STICK)}`);
ps = slotOf(PLANKS);
clickAt(2, "inv", ps);
for (const g of [0, 1, 2, 3]) clickAt(2, "grid", g, 2);
clickAt(2, "inv", ps);
clickAt(2, "out", 0, 0, true);
check(p.inventory.count(TABLE) === 1, "4 tablones → mesa");
inp._inv = 1; step();
check(!p.crafter && !inp.ui, "E cierra y vuelve a capturar el puntero");

// 3. Explanada propia para poner la mesa y picar piedra.
const [gx, gz] = w.dryColumn(48, 48);
const sy = w.surface(gx, gz) + 1;
for (let x = gx - 3; x <= gx + 3; x++) for (let z = gz - 4; z <= gz + 3; z++) {
  w.set(x, sy - 1, z, DIRT);
  for (let y = sy; y < sy + 4; y++) w.set(x, y, z, AIR);
}
Object.assign(p.body, { x: gx + 0.5, y: sy, z: gz + 0.5, vx: 0, vy: 0, vz: 0 });
p.yaw = 0; p.pitch = -0.7; step(0.2);
p.slot = slotOf(TABLE);
inp._place = 1; step();
let table: number[] | null = null;
for (let x = gx - 3; x <= gx + 3; x++) for (let z = gz - 4; z <= gz + 3; z++) if (w.get(x, sy, z) === TABLE) table = [x, sy, z];
check(!!table && p.inventory.count(TABLE) === 0, "clic derecho pone la mesa (y la gasta)", JSON.stringify(table));
inp._place = 1; step();
check(p.crafter?.size === 3, "clic derecho en la mesa abre la cuadrícula 3×3");

// Pico de madera: 3 tablones arriba, palos en el centro y abajo.
ps = slotOf(PLANKS);
clickAt(3, "inv", ps);
for (const g of [0, 1, 2]) clickAt(3, "grid", g, 2);
clickAt(3, "inv", ps);
const ss = slotOf(STICK);
clickAt(3, "inv", ss); clickAt(3, "grid", 4, 2); clickAt(3, "grid", 7, 2); clickAt(3, "inv", ss);
check(p.crafter?.result?.id === WOOD_PICK, "la mesa muestra el pico de madera");
clickAt(3, "out", 0, 0, true);
inp._inv = 1; step();
check(p.inventory.count(WOOD_PICK) === 1 && !p.crafter, "pico al inventario y mesa cerrada");

// 4. Piedra a mano (no suelta nada) y con pico (adoquín).
function mine(slot: number): number {
  Object.assign(p.body, { x: gx + 0.5, y: sy, z: gz + 0.5, vx: 0, vy: 0, vz: 0 });
  const x = gx + 1, y = sy + 1, z = gz;
  w.set(x, y, z, STONE); w.set(x, y - 1, z, STONE);
  p.slot = slot;
  return dig(x, y, z, y - 1);
}
const tHand = mine(p.inventory.slots.findIndex((s) => !s));
check(tHand > 7.3 && tHand < 7.7 && p.inventory.count(COBBLE) === 0 && host.drops.list.length === 0,
  "piedra a mano ≈ 7,5 s y no suelta nada", `${tHand.toFixed(2)} s`);
const tPick = mine(slotOf(WOOD_PICK));
check(tPick > 1.4 && tPick < 1.6 && p.inventory.count(COBBLE) === 1, "piedra con pico ≈ 1,5 s → adoquín", `${tPick.toFixed(2)} s`);
