// Perros infernales: modelo, galope, ataque y la ronda de perros (npm run shot -- test/browser/deadzone-perros.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap(window.__dzMap || "sector09"); })()`);
  await step(0.5);
  await js(`(() => { const g = __arcade.game; g.rounds.state = "intermission"; g.rounds.timer = 9999; })()`);
  await js(`(() => { const g = __arcade.game, p = g.seats[0].p; g.stage.zombies.clear(); p.position.set(0, 0, 6); p.yaw = 0; p.pitch = -0.05;
    for (const [x, z] of [[-1.2, 2.2], [1.1, 1.2], [0.1, -0.6]]) { const q = g.stage.zombies.spawn("hound", 5, x, z); q.state = "chasing"; q.stunT = 99; } })()`);
  await step(0.6);
  await draw(30);
  await shot("h-0-perros");
  await js(`(() => { const g = __arcade.game, p = g.seats[0].p; g.stage.zombies.clear(); p.position.set(2.2, 0, 4.6); p.yaw = 0.9; p.pitch = -0.1;
    const q = g.stage.zombies.spawn("hound", 5, 0.3, 2.6); q.state = "chasing"; q.stunT = 99; q.yaw = 0.8; })()`);
  await step(0.6);
  await draw(30);
  await shot("h-1-perfil");
  await js(`(() => { const g = __arcade.game, p = g.seats[0].p; g.stage.zombies.clear(); p.position.set(0, 0, 4); p.yaw = 0; p.pitch = 0;
    const q = g.stage.zombies.spawn("hound", 5, 0, 2.2); q.state = "chasing"; })()`);
  await step(1.3);
  await draw(10);
  await shot("h-2-ataque");
}
