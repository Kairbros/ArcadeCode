// Capturas de los zombis «poroto» (cuello y cabeza), los poderes del suelo, el efecto activo y el cuchillo
// (npm run shot -- test/browser/deadzone-poderes.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap(window.__dzMap || "sector09"); })()`);
  await step(0.5);
  await js(`(() => { const g = __arcade.game; g.rounds.state = "intermission"; g.rounds.timer = 9999; })()`);
  const tp = (x, z, yaw, pitch = 0) => js(`(() => { const g = __arcade.game, p = g.seats[0].p; g.stage.zombies.clear();
    p.position.set(${x}, 0, ${z}); p.yaw = ${yaw}; p.pitch = ${pitch}; p.velocity.set(0, 0, 0); })()`);

  // Zombis a distancia: se ve la cabeza clara sobre el cuello oscuro.
  await tp(0, 6, 0, -0.04);
  await js(`(() => { const g = __arcade.game; const m = g.stage.zombies;
    for (const [k, x, z] of [["walker", -1.6, 2.2], ["runner", 0, 1.2], ["brute", 1.8, 2.4], ["walker", 0.8, -1.4]]) { const q = m.spawn(k, 3, x, z); q.state = "idle"; q.stunT = 99; } })()`);
  await step(0.3);
  await draw(30);
  await shot("p-0-zombis");

  // Un poder en el suelo.
  await tp(0, 12, 0, -0.1);
  await js(`(() => { const g = __arcade.game; g.powers.drop("nuke", 0, 8.5); g.powers.drop("instaKill", -1.6, 8.2); g.powers.drop("infiniteAmmo", 1.6, 8.2); })()`);
  await step(0.3);
  await draw(30);
  await shot("p-1-poderes");

  // Coger muerte instantánea + munición infinita: efectos en el HUD.
  await js(`(() => { const g = __arcade.game; g.powers.activate("instaKill"); g.powers.activate("infiniteAmmo"); g.powers.activate("doublePoints"); })()`);
  await step(0.3);
  await draw(30);
  await shot("p-2-efectos");

  // Cuchillo sin balas.
  await js(`(() => { const g = __arcade.game, s = g.seats[0]; g.powers.reset(); s.weapons.ammo.pistol.mag = 0; s.weapons.ammo.pistol.reserve = 0; })()`);
  await tp(0, 6, 0, 0);
  await js(`(() => { const g = __arcade.game; const q = g.stage.zombies.spawn("walker", 1, 0, 4.7); q.state = "chasing"; })()`);
  await step(0.3);
  await draw(30);
  await shot("p-3-sin-balas");
  await js(`(() => { __arcade.game.stage.view.slash(); __arcade.game.zombiesFreeze = 1; })()`);
  await step(0.12);
  await draw(3);
  await shot("p-4-cuchillo");
}
