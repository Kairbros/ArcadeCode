import { describe, expect, it } from "./vitest-shim";
import { Player, PLAYER } from "../src/game/deadzone/player/player";
import { makeCollider } from "../src/game/deadzone/core/collision";
import type { Input } from "../src/game/deadzone/core/input";

type InputLike = Pick<Input, "moveAxis" | "isDown"> & { mouseLeft: boolean };

const idle = (): Input => ({ moveAxis: () => ({ x: 0, z: 0 }), isDown: () => false, mouseLeft: false } as unknown as Input);
const forward = (): Input =>
  ({ moveAxis: () => ({ x: 0, z: 1 }), isDown: (c: string) => c === "KeyW", mouseLeft: false } as unknown as Input);

const world = [
  makeCollider({ x: -26, y: -0.5, z: -38 }, { x: 26, y: 0, z: 20 }, "floor"),
  makeCollider({ x: -8, y: 0, z: 8 }, { x: 8, y: 4.2, z: 8.35 }, "wall"),
];

const step = (p: Player, input: Input, frames: number, dt = 1 / 60): void => {
  for (let i = 0; i < frames; i++) p.update(dt, input, world);
};

describe("jugador", () => {
  it("se queda quieto sobre el suelo (el suelo no lo empuja fuera del mapa)", () => {
    const p = new Player();
    p.reset(0, 12, 0);
    step(p, idle(), 120);
    expect(p.position.x).toBeCloseTo(0, 3);
    expect(p.position.z).toBeCloseTo(12, 3);
    expect(p.position.y).toBeCloseTo(0, 3);
    expect(p.onGround).toBe(true);
  });

  it("no atraviesa una pared al caminar contra ella", () => {
    const p = new Player();
    p.reset(0, 12, 0);
    // Mirando hacia −Z, la pared está en z = 8.
    step(p, forward(), 240);
    expect(p.position.z).toBeGreaterThan(8.35);
    expect(p.position.z).toBeLessThan(9.2);
  });

  it("salta y vuelve al suelo", () => {
    const p = new Player();
    p.reset(0, 12, 0);
    const jumpInput = {
      moveAxis: () => ({ x: 0, z: 0 }),
      isDown: (c: string) => c === "Space",
      mouseLeft: false,
    } as unknown as Input;
    step(p, jumpInput, 8);
    expect(p.position.y).toBeGreaterThan(0.3);
    step(p, idle(), 120);
    expect(p.position.y).toBeCloseTo(0, 2);
  });

  it("la salud baja con el daño y no pasa de 0", () => {
    const p = new Player();
    p.reset(0, 12, 0);
    p.damage(30);
    expect(p.health).toBe(PLAYER.maxHealth - 30);
    p.damage(1000);
    expect(p.health).toBe(0);
    expect(p.alive).toBe(false);
    p.heal(50);
    expect(p.health).toBe(50);
  });

  it("correr es más rápido que andar", () => {
    const walk = new Player();
    walk.reset(0, 12, 0);
    step(walk, forward(), 90);
    const run = new Player();
    run.reset(0, 12, 0);
    const runInput = {
      moveAxis: () => ({ x: 0, z: 1 }),
      isDown: (c: string) => c === "KeyW" || c === "ShiftLeft",
      mouseLeft: false,
    } as unknown as Input;
    step(run, runInput, 90);
    const walkSpeed = Math.hypot(walk.velocity.x, walk.velocity.z);
    const runSpeed = Math.hypot(run.velocity.x, run.velocity.z);
    expect(runSpeed).toBeGreaterThan(walkSpeed);
  });
});

// Silencia el tipo no usado si la firma cambia.
export type { InputLike };
