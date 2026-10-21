// Mundo de Bloques: cuevas y menas al generar, luz (cielo y antorchas), antorchas que necesitan apoyo, menas que
// piden un pico de cierto nivel y el horno (pantalla, funde con la pantalla cerrada, cocina, y si lo rompen).
import { BlocksHost } from "../src/game/blocks/game";
import {
  AIR, COAL, COAL_ORE, COBBLE, DIAMOND, DIAMOND_ORE, DIRT, FURNACE, IRON_ORE, STONE, TORCH, WATER, dropOf,
} from "../src/game/blocks/blocks";
import { WX, WY, WZ } from "../src/game/blocks/config";
import { craftResult } from "../src/game/blocks/crafting";
import { layout, type CraftKind } from "../src/game/blocks/craftui";
import type { WalkSource } from "../src/game/blocks/input";
import { BEEF, COOKED_BEEF, IRON_INGOT, IRON_PICK, STICK, STONE_PICK } from "../src/game/blocks/items";
import { World } from "../src/game/blocks/world";
import { blocksInput, check, rng } from "./lib";

// 1. Generación.
let t0 = Date.now();
const w = new World(777);
const genMs = Date.now() - t0;
const count = (b: number) => w.data.reduce((a, v) => a + (v === b ? 1 : 0), 0);
let caveAir = 0, holes = 0, diamondTop = 0, ironTop = 0;
for (let z = 0; z < WZ; z++) {
  for (let x = 0; x < WX; x++) {
    const top = w.surface(x, z);
    for (let y = 1; y < WY; y++) {
      const b = w.get(x, y, z);
      if (b === AIR && y < top - 1) caveAir++;
      if (b === WATER && w.get(x, y - 1, z) === AIR) holes++;
      if (b === DIAMOND_ORE) diamondTop = Math.max(diamondTop, y);
      if (b === IRON_ORE) ironTop = Math.max(ironTop, y);
    }
  }
}
check(caveAir > 3000, "hay cuevas bajo tierra", `${caveAir} casillas de aire bajo la superficie, ${genMs.toFixed(0)} ms`);
check(holes === 0, "el agua nunca queda sobre un hueco");
const ores = [count(COAL_ORE), count(IRON_ORE), count(DIAMOND_ORE)];
check(ores[0] > ores[1] && ores[1] > ores[2] && ores[2] > 10, "menas: carbón > hierro > diamante", ores.join(" / "));
check(diamondTop <= 10 && ironTop <= 31, "diamante solo en lo hondo, hierro hasta media altura", `diamante ≤ y ${diamondTop}, hierro ≤ y ${ironTop}`);
check(new World(777).data.every((v, i) => v === w.data[i]), "misma semilla, mismo mundo");

// 2. Luz.
t0 = Date.now();
w.flushLight();
const lightMs = Date.now() - t0;
const sky = (x: number, y: number, z: number) => w.lightAt(x, y, z) >> 4;
const blk = (x: number, y: number, z: number) => w.lightAt(x, y, z) & 15;
const [sx, sz] = w.dryColumn(48, 48);
check(sky(sx, w.surface(sx, sz) + 1, sz) === 15, "al aire libre, luz del cielo plena", `${lightMs.toFixed(0)} ms todo el mundo`);
// Una casilla de cueva a oscuras con suelo debajo.
let dark: number[] | null = null;
for (let y = 3; y < 20 && !dark; y++) for (let z = 4; z < WZ - 4 && !dark; z++) for (let x = 4; x < WX - 4 && !dark; x++) {
  if (w.get(x, y, z) === AIR && w.get(x, y + 1, z) === AIR && w.get(x, y - 1, z) === STONE && sky(x, y, z) === 0) dark = [x, y, z];
}
check(!!dark, "en las cuevas hondas está oscuro", JSON.stringify(dark));
const [dx, dy, dz] = dark!;
w.dirty.clear();
w.set(dx, dy, dz, TORCH);
t0 = Date.now();
w.flushLight();
const editMs = Date.now() - t0;
check(blk(dx, dy, dz) === 14 && blk(dx, dy + 1, dz) === 13, "una antorcha da luz 14 y baja 1 por bloque", `${editMs.toFixed(1)} ms al poner`);
check(w.dirty.size >= 1 && w.dirty.size <= 9, "solo se rehacen los chunks de alrededor", `${w.dirty.size} chunks`);
w.set(dx, dy, dz, AIR);
w.flushLight();
check(blk(dx, dy + 1, dz) === 0, "al quitarla vuelve la oscuridad");
t0 = Date.now();
for (let k = 0; k < 20; k++) {
  w.set(dx, dy, dz, k % 2 ? AIR : TORCH);
  w.flushLight();
}
const avg = (Date.now() - t0) / 20;
// Solo informativo: con las demás pruebas en paralelo el tiempo varía mucho (sola, ~2 ms).
console.log(`  · luz de un cambio: ${avg.toFixed(1)} ms de media`);

// 3. Menas: sin el pico del nivel adecuado se rompen pero no sueltan nada.
check(dropOf(COAL_ORE, 0) === 0 && dropOf(COAL_ORE, 1) === COAL, "carbón: con pico de madera");
check(dropOf(IRON_ORE, 1) === 0 && dropOf(IRON_ORE, 2) === IRON_ORE, "hierro: con pico de piedra (suelta la mena)");
check(dropOf(DIAMOND_ORE, 2) === 0 && dropOf(DIAMOND_ORE, 3) === DIAMOND, "diamante: con pico de hierro");

// 4. Recetas nuevas.
const C = COBBLE;
check(craftResult([C, C, C, C, 0, C, C, C, C], 3)?.id === FURNACE, "8 adoquines en anillo → horno");
check(craftResult([COAL, 0, STICK, 0], 2)?.n === 4, "carbón sobre palo → 4 antorchas");
check(craftResult([IRON_INGOT, IRON_INGOT, IRON_INGOT, 0, STICK, 0, 0, STICK, 0], 3)?.id === IRON_PICK, "pico de hierro");

// 5. En la partida: explanada, antorchas, picar hierro y el horno.
Math.random = rng(4);
const inp = blocksInput();
const host: any = new BlocksHost(inp as unknown as WalkSource, 0, "local", "survival", 777);
host.mobs.list = [];
host.mobs.update = () => {};
const hw = host.world, p = host.pilot;
const step = (s: number) => { for (let t = 0; t < s; t += 1 / 30) host.update(1 / 30); };
const [gx, gz] = hw.dryColumn(30, 60);
const gy = hw.surface(gx, gz) + 1;
for (let x = gx - 4; x <= gx + 4; x++) for (let z = gz - 5; z <= gz + 4; z++) {
  hw.set(x, gy - 1, z, DIRT);
  for (let y = gy; y < gy + 5; y++) hw.set(x, y, z, AIR);
}
const stand = () => { Object.assign(p.body, { x: gx + 0.5, y: gy, z: gz + 0.5, vx: 0, vy: 0, vz: 0 }); };
const aim = (bx: number, by: number, bz: number) => {
  stand();
  const ex = bx + 0.5 - p.body.x, ey = by + 0.5 - (gy + 1.62), ez = bz + 0.5 - p.body.z;
  p.yaw = Math.atan2(-ex, -ez);
  p.pitch = Math.atan2(ey, Math.hypot(ex, ez));
  step(1 / 30);
  return p.target?.x === bx && p.target.y === by && p.target.z === bz;
};

// Antorchas: en el suelo o en una pared, y caen al romper su apoyo.
check(host.apply([gx + 2, gy + 2, gz, TORCH]) === false, "una antorcha en el aire no se puede poner");
check(host.apply([gx + 2, gy, gz, TORCH]) === true, "en el suelo sí");
hw.set(gx - 2, gy + 1, gz - 2, STONE);
check(host.apply([gx - 1, gy + 1, gz - 2, TORCH]) === true, "y en una pared");
host.apply([gx + 2, gy - 1, gz, AIR, DIRT]);
host.apply([gx - 2, gy + 1, gz - 2, AIR, COBBLE]);
const torches = host.drops.list.filter((d: any) => d.item === TORCH).length;
check(hw.get(gx + 2, gy, gz) === AIR && hw.get(gx - 1, gy + 1, gz - 2) === AIR && torches === 2,
  "al romper su apoyo, las antorchas caen y se pueden recoger", `${torches} antorchas en el suelo`);
hw.set(gx + 2, gy - 1, gz, DIRT);
host.drops.list = [];

// Picar hierro con pico de piedra: ≈ 1,7 s y suelta la mena.
p.inventory.slots[0] = { id: STONE_PICK, n: 1 };
p.slot = 0;
hw.set(gx, gy, gz - 2, IRON_ORE);
check(aim(gx, gy, gz - 2), "apunta a la mena de hierro");
inp.digMouse = true;
let t = 0;
while (hw.get(gx, gy, gz - 2) !== AIR && t < 20) { host.update(1 / 30); t += 1 / 30; }
inp.digMouse = false;
step(0.1);
check(t > 1.6 && t < 1.8 && host.drops.list.some((d: any) => d.item === IRON_ORE), "hierro con pico de piedra ≈ 1,7 s", `${t.toFixed(2)} s`);
host.drops.list = [];

// Horno: clic derecho lo abre; Mayús+clic manda la mena a la entrada y el carbón al combustible.
const clickAt = (kind: CraftKind, target: string, i: number, shift = false) => {
  const r = layout(kind).rects.find((r) => r.t.kind === target && (target === "out" || (r.t as { i?: number }).i === i))!;
  inp._clicks.push({ x: r.x + 8, y: r.y + 8, button: 0, shift });
  step(1 / 30);
};
p.inventory.slots[1] = { id: IRON_ORE, n: 3 };
p.inventory.slots[2] = { id: COAL, n: 1 };
const fx = gx, fy = gy, fz = gz - 2;
hw.set(fx, fy, fz, FURNACE);
aim(fx, fy, fz);
inp._place = 1;
step(1 / 30);
const f = p.crafter?.furnace;
check(!!f && p.crafter.size === "furnace" && inp.ui, "clic derecho en el horno abre su pantalla");
clickAt("furnace", "inv", 1, true);
clickAt("furnace", "inv", 2, true);
check(f.slots[0]?.id === IRON_ORE && f.slots[1]?.id === COAL && !p.inventory.slots[1] && !p.inventory.slots[2],
  "Mayús+clic: mena a la entrada, carbón al combustible");
inp._inv = 1;
step(1 / 30);
check(!p.crafter && f.slots[0]?.n === 3, "al cerrar, lo de dentro se queda en el horno");
step(5.2);
check(f.slots[2]?.id === IRON_INGOT && f.slots[2].n === 1, "funde con la pantalla cerrada: 1 lingote en 5 s");
step(10.2);
check(f.slots[2]?.n === 3 && !f.slots[0] && f.burning, "3 lingotes; al carbón le queda fuego", `fuego ${f.burn.toFixed(1)} s`);
aim(fx, fy, fz);
inp._place = 1;
step(1 / 30);
clickAt("furnace", "out", 0, true);
check(p.inventory.count(IRON_INGOT) === 3 && !f.slots[2], "Mayús+clic en la salida: lingotes al inventario");

// Cocinar: con el fuego que queda, la ternera sale filete (+8 de hambre).
p.inventory.slots[3] = { id: BEEF, n: 1 };
clickAt("furnace", "inv", 3, true);
inp._inv = 1;
step(5.3);
check(f.slots[2]?.id === COOKED_BEEF, "la ternera se cocina");
aim(fx, fy, fz);
inp._place = 1;
step(1 / 30);
clickAt("furnace", "out", 0, true);
inp._inv = 1;
step(1 / 30);
p.vitals.hunger = 10;
p.slot = p.inventory.slots.findIndex((s: any) => s?.id === COOKED_BEEF);
p.pitch = 1.4; // mirando al cielo (mirando al horno, el clic derecho lo abriría)
inp.placeHeld = true;
step(1.7);
inp.placeHeld = false;
check(p.vitals.hunger === 18, "el filete da 8 de hambre", `hambre ${p.vitals.hunger}`);

// Si alguien rompe el horno, lo de dentro vuelve al inventario.
f.slots[0] = { id: BEEF, n: 2 };
host.apply([fx, fy, fz, AIR, FURNACE]);
step(1 / 30);
check(p.furnaces.size === 0 && p.inventory.count(BEEF) === 2, "horno roto: lo de dentro vuelve al inventario");
