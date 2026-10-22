// Sangre: chorros, manchas en suelo y pared, cuerpos teñidos (npm run shot -- test/browser/deadzone-sangre.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap("sector09"); g.rounds.state = "intermission"; g.rounds.timer = 9999; })()`);
  await step(0.5);
  await js(`(() => { const g = __arcade.game, p = g.seats[0].p; g.stage.zombies.clear(); p.position.set(0, 0, -8.6); p.yaw = 0; p.pitch = -0.08;
    for (const [x, z] of [[-1.4, -11.5], [1.4, -12.5], [0, -13.6]]) { const q = g.stage.zombies.spawn("walker", 4, x, z); q.state = "chasing"; q.stunT = 99; q.hp = 9999; } })()`);
  await step(0.4);
  await js(`(() => { const g = __arcade.game; const zs = g.stage.zombies.list; const V = g.stage.camera.position.constructor;
    for (let k = 0; k < 9; k++) for (const z of zs) { z.hit(5, false); g.stage.effects.blood(new V(z.position.x, 1.2, z.position.z), new V(0.1 * (k % 3 - 1), 0.1, -1), 8, k % 4 === 0); } })()`);
  await step(0.25); await draw(10); await shot("b-0-chorros");
  await step(1.5); await draw(10); await shot("b-1-manchas");
}
