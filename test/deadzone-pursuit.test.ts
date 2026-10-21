// Dead Zone: «no salen los zombis». La rejilla de rutas solo miraba el centro de cada celda y un muro de
// 0,35 m cabe entero entre dos centros separados 0,5 m: las rutas atravesaban las paredes, los zombis se
// quedaban pegados por fuera y no llegaban nunca al jugador. Además el alféizar de las ventanas los frenaba
// (la única entrada al recinto), de modo que no podían entrar ni rompiendo la barricada.
import { describe, expect, it } from "./vitest-shim";
import { makeCollider } from "../src/game/deadzone/core/collision";
import { Input } from "../src/game/deadzone/core/input";
import { DeadZoneHost } from "../src/game/deadzone/game";
import { NavGrid } from "../src/game/deadzone/world/nav";

const fakeKeyboard = () => ({ isDown: () => false, anyDown: () => false }) as never;

describe("rejilla: muros finos", () => {
  it("un muro de 0,35 m entre dos centros de celda también cierra el paso", () => {
    const floor = makeCollider({ x: 0, y: -0.5, z: 0 }, { x: 20, y: 0, z: 20 }, "floor");
    // Muro de 0,35 m justo entre los centros 9,75 y 10,25: mirando solo el centro no se veía.
    const wall = makeCollider({ x: 9.9, y: 0, z: 0 }, { x: 10.25, y: 3, z: 20 }, "wall");
    const nav = new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, 0.5, [floor, wall]);
    expect(nav.findPath({ x: 2, y: 0, z: 10 }, { x: 18, y: 0, z: 10 })).toBeNull();
  });

  it("con un hueco en el muro sí hay ruta, y pasa por el hueco", () => {
    const floor = makeCollider({ x: 0, y: -0.5, z: 0 }, { x: 20, y: 0, z: 20 }, "floor");
    const wallA = makeCollider({ x: 9.9, y: 0, z: 0 }, { x: 10.25, y: 3, z: 8 }, "wall");
    const wallB = makeCollider({ x: 9.9, y: 0, z: 10.5 }, { x: 10.25, y: 3, z: 20 }, "wall");
    const nav = new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, 0.5, [floor, wallA, wallB]);
    const path = nav.findPath({ x: 2, y: 0, z: 10 }, { x: 18, y: 0, z: 10 });
    expect(path).not.toBeNull();
    for (const p of path!) {
      if (p.x > 9.4 && p.x < 10.7) expect(Math.abs(p.z - 9.25)).toBeLessThan(1.6);
    }
  });
});

describe("SECTOR 09: los zombis llegan al jugador", () => {
  const host = new DeadZoneHost(new Input(fakeKeyboard()), 0, "local");
  const nav = host.stage.nav!;
  const me = host.seats[0].p.position;

  it("mientras las ventanas tienen tablones, de fuera no hay ruta hasta el jugador", () => {
    let abiertas = 0;
    for (const s of host.stage.map.spawns) {
      if (nav.findPath({ x: s.x, y: 0, z: s.z }, { x: me.x, y: 0, z: me.z })) abiertas++;
    }
    expect(abiertas).toBe(0);
    expect(host.stage.map.windows.every((w) => w.barricade.enabled)).toBeTruthy();
  });

  it("partida quieta (sin disparar): rompen una ventana, entran y hacen daño", () => {
    const health0 = host.seats[0].p.health;
    const planks0 = host.stage.map.windows.reduce((n, w) => n + w.planks, 0);
    for (let f = 0; f < 45 * 30; f++) host.update(1 / 30);
    const planks = host.stage.map.windows.reduce((n, w) => n + w.planks, 0);
    const dentro = host.stage.zombies.list.filter(
      (z) => z.alive && Math.hypot(z.position.x - me.x, z.position.z - me.z) < 3.5,
    ).length;
    expect(planks).toBeLessThan(planks0);
    expect(dentro).toBeGreaterThan(0);
    expect(host.seats[0].p.health).toBeLessThan(health0);
  });

  it("la ventana abierta deja pasar: hay ruta de fuera a dentro por ese hueco", () => {
    const w = host.stage.map.windows.find((x) => x.planks === 0) ?? host.stage.map.windows[0];
    const desde = { x: w.outer.x, y: 0, z: w.outer.z };
    const hasta = { x: w.inner.x, y: 0, z: w.inner.z };
    expect(host.stage.map.windows.every((x) => x.planks === 0 || x.barricade.enabled)).toBeTruthy();
    expect(nav.findPath(desde, hasta)).not.toBeNull();
  });
});
