import { describe, expect, it } from "./vitest-shim";
import {
  circleOverlapsXZ,
  groundHeightAt,
  hasLineOfSight,
  makeCollider,
  rayAABB,
  raycastWorld,
  resolveCircle,
} from "../src/game/deadzone/core/collision";

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tag: "wall" | "floor" = "wall") =>
  makeCollider({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 }, tag);

describe("colisiones", () => {
  it("el rayo acierta la caja a la distancia correcta", () => {
    const c = box(2, 0, -1, 3, 2, 1);
    expect(rayAABB({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, c)).toBeCloseTo(2, 3);
    expect(rayAABB({ x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, c)).toBeNull();
    expect(rayAABB({ x: 0, y: 1, z: 5 }, { x: 1, y: 0, z: 0 }, c)).toBeNull();
  });

  it("el rayo devuelve el impacto más cercano", () => {
    const near = box(2, 0, -1, 3, 2, 1);
    const far = box(6, 0, -1, 7, 2, 1);
    const hit = raycastWorld({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 20, [far, near]);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(2, 3);
    expect(hit!.normal.x).toBeCloseTo(-1, 1);
  });

  it("saca al jugador de dentro de una pared", () => {
    const wall = box(1, 0, -1, 3, 3, 1);
    const pos = { x: 2, z: 0 };
    expect(circleOverlapsXZ(pos.x, pos.z, 0.5, wall)).toBe(true);
    resolveCircle(pos, 0.5, 0, 1.8, [wall]);
    expect(circleOverlapsXZ(pos.x, pos.z, 0.5, wall)).toBe(false);
  });

  it("el suelo se detecta por altura", () => {
    const floor = box(-5, -1, -5, 5, 0, 5, "floor");
    const crate = box(0, 0, 0, 1, 0.9, 1);
    expect(groundHeightAt(2, 2, 0.1, [floor, crate])).toBe(0);
    // Con los pies a 0,5 m ya se puede subir (margen de escalón).
    expect(groundHeightAt(0.5, 0.5, 0.5, [floor, crate])).toBeCloseTo(0.9, 3);
  });

  it("una pared tapa la línea de visión y una ventana no", () => {
    const wall = box(1, 0, -1, 2, 3, 1);
    expect(hasLineOfSight({ x: 0, y: 1.6, z: 0 }, { x: 3, y: 1.6, z: 0 }, [wall])).toBe(false);
    expect(hasLineOfSight({ x: 0, y: 1.6, z: 5 }, { x: 3, y: 1.6, z: 5 }, [wall])).toBe(true);
    const window = makeCollider({ x: 1, y: 0, z: -1 }, { x: 2, y: 1.15, z: 1 }, "window");
    expect(hasLineOfSight({ x: 0, y: 1.6, z: 0 }, { x: 3, y: 1.6, z: 0 }, [window])).toBe(true);
  });
});
