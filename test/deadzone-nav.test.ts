import { describe, expect, it } from "./vitest-shim";
import { NavGrid } from "../src/game/deadzone/world/nav";
import { makeCollider } from "../src/game/deadzone/core/collision";

function grid(): NavGrid {
  const floor = makeCollider({ x: 0, y: -0.5, z: 0 }, { x: 20, y: 0, z: 20 }, "floor");
  // Muro en x = 10 con un hueco entre z = 9 y z = 11.
  const wallA = makeCollider({ x: 9.8, y: 0, z: 0 }, { x: 10.2, y: 3, z: 9 }, "wall");
  const wallB = makeCollider({ x: 9.8, y: 0, z: 11 }, { x: 10.2, y: 3, z: 20 }, "wall");
  return new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, 0.5, [floor, wallA, wallB]);
}

describe("rejilla de navegación", () => {
  it("encuentra ruta por el único hueco del muro", () => {
    const nav = grid();
    const path = nav.findPath({ x: 2, y: 0, z: 10 }, { x: 18, y: 0, z: 10 });
    expect(path).not.toBeNull();
    const pts = path!;
    expect(pts.length).toBeGreaterThanOrEqual(2);
    const last = pts[pts.length - 1];
    expect(last.x).toBeGreaterThan(16);
    // Todo paso por el muro tiene que ir por el hueco.
    for (const p of pts) {
      if (p.x > 9.4 && p.x < 10.6) {
        expect(p.z).toBeGreaterThan(8.4);
        expect(p.z).toBeLessThan(11.6);
      }
    }
  });

  it("no atraviesa el muro: sin hueco no hay ruta", () => {
    const floor = makeCollider({ x: 0, y: -0.5, z: 0 }, { x: 20, y: 0, z: 20 }, "floor");
    const wall = makeCollider({ x: 9.8, y: 0, z: 0 }, { x: 10.2, y: 3, z: 20 }, "wall");
    const nav = new NavGrid({ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, 0.5, [floor, wall]);
    expect(nav.findPath({ x: 2, y: 0, z: 10 }, { x: 18, y: 0, z: 10 })).toBeNull();
  });

  it("los bloqueos dinámicos cierran el paso (barricada con tablones)", () => {
    const nav = grid();
    nav.blockArea(10, 10, 1.2, 2.4, true);
    expect(nav.findPath({ x: 2, y: 0, z: 10 }, { x: 18, y: 0, z: 10 })).toBeNull();
    nav.blockArea(10, 10, 1.2, 2.4, false);
    expect(nav.findPath({ x: 2, y: 0, z: 10 }, { x: 18, y: 0, z: 10 })).not.toBeNull();
  });

  it("la ruta es más corta que recorrer la rejilla celda a celda", () => {
    const nav = grid();
    const path = nav.findPath({ x: 2, y: 0, z: 10 }, { x: 18, y: 0, z: 10 })!;
    expect(path.length).toBeLessThan(10);
  });
});
