import { describe, expect, it } from "./vitest-shim";
import { WeaponSystem } from "../src/game/deadzone/weapons/system";
import { WEAPONS } from "../src/game/deadzone/weapons/defs";

const settle = (w: WeaponSystem, seconds = 1): void => {
  // Avanza el reloj en pasos pequeños, como el bucle real.
  for (let t = 0; t < seconds; t += 0.02) w.update(0.02);
};

describe("sistema de armas", () => {
  it("la pistola empieza cargada y con reserva", () => {
    const w = new WeaponSystem();
    expect(w.currentId).toBe("pistol");
    expect(w.currentAmmo.mag).toBe(WEAPONS.pistol.magSize);
    expect(w.currentAmmo.reserve).toBe(64);
  });

  it("dispara, gasta munición y respeta la cadencia", () => {
    const w = new WeaponSystem();
    expect(w.fire(true, true)).not.toBeNull();
    expect(w.currentAmmo.mag).toBe(WEAPONS.pistol.magSize - 1);
    // Segundo clic inmediato: sigue en recarga de cadencia.
    expect(w.fire(true, true)).toBeNull();
    settle(w, 0.4);
    expect(w.fire(true, true)).not.toBeNull();
    expect(w.currentAmmo.mag).toBe(WEAPONS.pistol.magSize - 2);
  });

  it("la pistola es semiautomática: no dispara manteniendo el gatillo", () => {
    const w = new WeaponSystem();
    w.fire(true, true);
    settle(w, 0.4);
    expect(w.fire(true, false)).toBeNull();
  });

  it("recarga transfiriendo reserva y sin pasar del cargador", () => {
    const w = new WeaponSystem();
    for (let i = 0; i < 5; i++) {
      w.fire(true, true);
      settle(w, 0.4);
    }
    expect(w.currentAmmo.mag).toBe(3);
    expect(w.startReload()).toBe(true);
    expect(w.state).toBe("reloading");
    // No se puede disparar recargando.
    expect(w.fire(true, true)).toBeNull();
    settle(w, WEAPONS.pistol.reloadTime + 0.1);
    expect(w.currentAmmo.mag).toBe(WEAPONS.pistol.magSize);
    expect(w.currentAmmo.reserve).toBe(64 - 5);
  });

  it("no recarga con el cargador lleno ni sin reserva", () => {
    const w = new WeaponSystem();
    expect(w.startReload()).toBe(false);
    w.ammo.pistol.reserve = 0;
    w.ammo.pistol.mag = 2;
    expect(w.startReload()).toBe(false);
  });

  it("nunca deja munición negativa al vaciar el cargador", () => {
    const w = new WeaponSystem();
    for (let i = 0; i < WEAPONS.pistol.magSize; i++) {
      w.fire(true, true);
      settle(w, 0.4);
    }
    expect(w.currentAmmo.mag).toBe(0);
    expect(w.empty).toBe(true);
    expect(w.fire(true, true)).toBeNull();
    expect(w.currentAmmo.mag).toBe(0);
  });

  it("cambiar de arma cancela la recarga sin duplicar munición", () => {
    const w = new WeaponSystem();
    w.fire(true, true);
    settle(w, 0.4);
    w.give("smg");
    expect(w.currentId).toBe("smg");
    const before = { ...w.ammo.smg };
    w.fire(true, true);
    settle(w, 0.2);
    w.startReload();
    // Cambio a la pistola en mitad de la recarga.
    expect(w.select(0)).toBe(true);
    expect(w.state).toBe("switching");
    settle(w, 0.6);
    expect(w.currentId).toBe("pistol");
    // La munición del subfusil no ha aparecido de la nada.
    expect(w.ammo.smg.mag).toBeLessThanOrEqual(before.mag);
  });

  it("la munición comprada no pasa del máximo del arma", () => {
    const w = new WeaponSystem();
    w.buyAmmo("pistol");
    expect(w.currentAmmo.reserve).toBe(WEAPONS.pistol.reserveMax);
    w.buyAmmo("pistol");
    expect(w.currentAmmo.reserve).toBe(WEAPONS.pistol.reserveMax);
  });

  it("la escopeta devuelve varios perdigones y el arma especial atraviesa", () => {
    const w = new WeaponSystem();
    w.give("shotgun");
    settle(w, 0.6);
    const shot = w.fire(true, true)!;
    expect(shot.pellets).toBe(WEAPONS.shotgun.pellets);
    const w2 = new WeaponSystem();
    w2.give("pulse");
    settle(w2, 0.6);
    expect(w2.fire(true, true)!.def.pierce).toBeGreaterThan(1);
  });

  it("sin arma en la ranura no hay disparo", () => {
    const w = new WeaponSystem();
    w.slots[0] = null;
    expect(w.current).toBeNull();
    expect(w.fire(true, true)).toBeNull();
  });
});
