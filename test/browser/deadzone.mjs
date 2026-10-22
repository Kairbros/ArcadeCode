// Capturas de Dead Zone en el hub: salida, zombis, disparo, compra y pantalla de abatido (npm run shot -- test/browser/deadzone.mjs).
export default async function ({ js, start, step, draw, shot, press }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap(window.__dzMap || "sector09"); })()`);
  await step(1);
  await draw(10);
  await shot("dz-0-inicio");
  // Zombis delante.
  await js(`(() => { const g = __arcade.game; g.stage.zombies.clear();
    for (const [x, z, k] of [[-2, 8, "walker"], [1.5, 6, "runner"], [0, 3, "brute"]]) { const zb = g.stage.zombies.spawn(k, 1, x, z); zb.state = "chasing"; zb.stateT = 1; }
    const p = g.seats[0].p; p.yaw = 0; p.pitch = -0.05; })()`);
  await step(0.3);
  await draw(10);
  await shot("dz-1-zombis");
  // Dos disparos (por la API del anfitrión: el ratón real no se simula aquí).
  await js(`(() => { const g = __arcade.game, s = g.seats[0]; const shot = s.weapons.fire(true, true); if (shot) g.resolveShot(0, shot); })()`);
  await step(0.4);
  await js(`(() => { const g = __arcade.game, s = g.seats[0]; const shot = s.weapons.fire(true, true); if (shot) g.resolveShot(0, shot); })()`);
  await step(0.05);
  await shot("dz-2-disparo");
  console.log("estado:", await js(`JSON.stringify({ points: __arcade.game.seats[0].points.balance, mag: __arcade.game.seats[0].weapons.currentAmmo.mag, zombies: __arcade.game.stage.zombies.list.length })`));
  // Una compra de pared.
  await js(`(() => { const g = __arcade.game; g.stage.zombies.clear(); const b = g.stage.map.buys.find((q) => q.spec.weaponId !== "pistol");
    const p = g.seats[0].p; p.position.set(b.position.x + b.normal.x * 1.4, 0, b.position.z + b.normal.z * 1.4); p.yaw = Math.atan2(b.normal.x, b.normal.z); p.pitch = 0; })()`);
  await step(0.2);
  await draw(10);
  await shot("dz-3-compra");
  // Caído.
  await js(`(() => { const g = __arcade.game; g.seats[0].p.health = 0; })()`);
  await step(0.1);
  await draw(25);
  await shot("dz-4-abatido");

  // --- Ronda de verdad: los zombis salen, rompen la barricada y entran -----------------------------
  // (regresión: la rejilla de rutas no veía los muros finos y los zombis se quedaban fuera pegados a
  // la pared; además el alféizar los frenaba y nunca entraban).
  await js(`(() => { const g = __arcade.game; g.restart(); const p = g.seats[0].p;
    p.position.set(1.5, 0, 13); p.yaw = -Math.PI / 2; p.pitch = -0.04; })()`);
  const estado = async () =>
    js(`(() => { const g = __arcade.game, p = g.seats[0].p;
      const cerca = g.stage.zombies.list.filter((z) => z.alive)
        .map((z) => Math.round(Math.hypot(z.position.x - p.position.x, z.position.z - p.position.z) * 10) / 10)
        .sort((a, b) => a - b);
      return JSON.stringify({ ronda: g.rounds.round, zombis: g.stage.zombies.list.length, vivos: g.stage.zombies.aliveCount,
        planks: g.stage.map.windows.map((w) => w.planks).join(""), distancias: cerca.slice(0, 4), vida: Math.round(p.health) }); })()`);
  // Avanza hasta que un zombi esté a menos de 9 m del jugador (llegan andando desde fuera).
  const espera = (meters, frames) => js(`(() => { const g = __arcade.game, p = g.seats[0].p;
    for (let i = 0; i < ${frames}; i++) {
      p.health = 100;                       // invulnerable: la captura es del arte, no de la dificultad
      __arcade.step(1);
      const z = g.stage.zombies.list.find((q) => q.alive && q.state !== "spawning"
        && Math.hypot(q.position.x - p.position.x, q.position.z - p.position.z) < ${meters});
      if (z) { const dx = z.position.x - p.position.x, dz = z.position.z - p.position.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = -0.02;
        return JSON.stringify({ frames: i, zombi: [Math.round(z.position.x * 10) / 10, Math.round(z.position.z * 10) / 10], estado: z.state }); }
    }
    return null; })()`);
  console.log("llega el primero:", await espera(9, 60 * 45));
  await draw(10);
  await shot("dz-5-zombis-llegan");
  console.log("t≈llegada:", await estado());
  // Ahora que entren: espera a tener uno dentro del patio (pegado) y captura.
  console.log("entra:", await espera(3.5, 60 * 40));
  await draw(10);
  await shot("dz-6-zombi-dentro");
  console.log("t≈dentro:", await estado());
  // Cruzando una ventana: se mira la ventana del callejón desde dentro (la que rompen antes).
  await js(`(() => { const g = __arcade.game, p = g.seats[0].p;
    p.position.set(-15, 0, 15.4); p.yaw = Math.PI; p.pitch = -0.02; g.stage.zombies.clear(); g.restart(); })()`);
  const cruzando = await js(`(() => { const g = __arcade.game, p = g.seats[0].p;
    const w = g.stage.map.windows.find((q) => q.id === "w_callejon_s");
    for (let i = 0; i < 60 * 60; i++) {
      p.health = 100;
      __arcade.step(1);
      const z = g.stage.zombies.list.find((q) => q.alive && q.state !== "spawning"
        && Math.abs(q.position.x - w.x) < 0.7 && Math.abs(q.position.z - w.z) < 0.3);
      if (z) return JSON.stringify({ frames: i, zombi: [Math.round(z.position.x * 10) / 10, Math.round(z.position.z * 10) / 10],
        planks: w.planks, ventanas: g.stage.map.windows.map((q) => q.planks).join("") });
    }
    return null; })()`);
  console.log("cruzando la ventana:", cruzando);
  await draw(10);
  await shot("dz-7-cruzando-ventana");
}
