import { describe, expect, it } from "./vitest-shim";
import { maxAlive, roundTotal, spawnInterval, RoundManager } from "../src/game/deadzone/game/rounds";
import { Points } from "../src/game/deadzone/game/points";
import { kindWeights, pickKind, scaledHp, scaledSpeed, ZOMBIES } from "../src/game/deadzone/enemies/defs";
import { seededRandom } from "../src/game/deadzone/core/math";

describe("rondas", () => {
  it("la dificultad crece de forma monótona", () => {
    for (let r = 1; r < 25; r++) {
      expect(roundTotal(r + 1)).toBeGreaterThan(roundTotal(r));
      expect(spawnInterval(r + 1)).toBeLessThanOrEqual(spawnInterval(r));
      expect(maxAlive(r + 1)).toBeGreaterThanOrEqual(maxAlive(r));
    }
    expect(roundTotal(1)).toBe(7);
    expect(maxAlive(1)).toBe(14);
    expect(spawnInterval(1)).toBeLessThan(1.2); // salen rápido desde la primera ronda
  });

  it("la ronda no termina hasta que aparecen todos y mueren todos", () => {
    const rm = new RoundManager();
    rm.start();
    expect(rm.round).toBe(1);
    expect(rm.toSpawn).toBe(roundTotal(1));

    // Avanza hasta que hayan aparecido todos.
    let spawned = 0;
    for (let i = 0; i < 4000 && rm.toSpawn > 0; i++) {
      for (const e of rm.update(0.05)) if (e.type === "spawn") spawned++;
    }
    expect(spawned).toBe(roundTotal(1));
    expect(rm.toSpawn).toBe(0);
    // Siguen vivos: no hay fin de ronda.
    let ended = false;
    for (let i = 0; i < 20; i++) for (const e of rm.update(0.05)) if (e.type === "roundEnd") ended = true;
    expect(ended).toBe(false);

    // Mueren todos los de esta ronda.
    for (let i = 0; i < spawned; i++) rm.onZombieDead();
    expect(rm.alive).toBe(0);
    let endEvents = 0;
    for (let i = 0; i < 3; i++) for (const e of rm.update(0.05)) if (e.type === "roundEnd") endEvents++;
    expect(endEvents).toBe(1);
    expect(rm.state).toBe("intermission");
  });

  it("nunca pasa del máximo de zombis vivos", () => {
    const rm = new RoundManager();
    rm.start();
    let alive = 0;
    let max = 0;
    for (let i = 0; i < 2000; i++) {
      for (const e of rm.update(0.05)) if (e.type === "spawn") alive++;
      max = Math.max(max, alive);
    }
    expect(max).toBeLessThanOrEqual(maxAlive(1));
    expect(max).toBeGreaterThan(1);
  });

  it("tras el descanso arranca la siguiente ronda", () => {
    const rm = new RoundManager();
    rm.start();
    for (let i = 0; i < 4000 && rm.toSpawn > 0; i++) for (const e of rm.update(0.05)) void e;
    for (let i = 0; i < 100; i++) rm.onZombieDead();
    for (let i = 0; i < 2; i++) for (const e of rm.update(0.05)) void e;
    let next = 0;
    for (let i = 0; i < 400; i++) for (const e of rm.update(0.05)) if (e.type === "roundStart") next = e.round;
    expect(next).toBe(2);
  });
});

describe("puntos", () => {
  it("no se puede gastar de más", () => {
    const p = new Points();
    expect(p.balance).toBe(500);
    expect(p.spend(500)).toBe(true);
    expect(p.balance).toBe(0);
    expect(p.spend(1)).toBe(false);
    expect(p.balance).toBe(0);
  });

  it("suma y reinicia", () => {
    const p = new Points();
    p.add(40);
    expect(p.balance).toBe(540);
    p.reset();
    expect(p.balance).toBe(500);
  });
});

describe("enemigos", () => {
  it("la vida, la velocidad y el daño crecen con la ronda y tienen tope de velocidad", () => {
    expect(scaledHp("walker", 2)).toBeGreaterThan(ZOMBIES.walker.hp);
    expect(scaledSpeed("walker", 10)).toBeGreaterThan(scaledSpeed("walker", 1));
    expect(scaledSpeed("walker", 60)).toBeLessThanOrEqual(ZOMBIES.walker.speed * 1.46);
  });

  it("los corredores no salen antes de la ronda 3 y los brutos antes de la 7", () => {
    const rnd = seededRandom(9);
    for (let i = 0; i < 300; i++) expect(pickKind(1, rnd)).toBe("walker");
    for (let i = 0; i < 300; i++) expect(pickKind(2, rnd)).toBe("walker");
    const r3 = new Set(Array.from({ length: 500 }, () => pickKind(3, rnd)));
    expect(r3.has("walker")).toBe(true);
    expect(r3.has("runner")).toBe(true);
    expect(r3.has("brute")).toBe(false);
    const r8 = new Set(Array.from({ length: 800 }, () => pickKind(8, rnd)));
    expect(r8.has("brute")).toBe(true);
  });

  it("los pesos suman uno", () => {
    for (const r of [1, 4, 9, 20]) {
      const sum = kindWeights(r).reduce((s, w) => s + w.weight, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });
});
