// Puertas comprables: cerradas, con cartel, y abiertas (npm run shot -- test/browser/deadzone-puertas.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap(window.__dzMap || "sector09"); })()`);
  await step(0.5);
  await js(`(() => { const g = __arcade.game; g.rounds.state = "intermission"; g.rounds.timer = 9999; g.seats[0].points.add(20000); })()`);
  const ids = JSON.parse(await js(`JSON.stringify(__arcade.game.stage.map.doors.map(d => [d.id, d.x, d.z, d.nx, d.nz]))`));
  for (const [id, x, z, nx, nz] of ids) {
    for (const side of [1, -1]) {
      await js(`(() => { const g = __arcade.game, p = g.seats[0].p; g.stage.zombies.clear(); const d = g.stage.map.doors.find(q => q.id === "${id}");
        d.open = false; d.collider.enabled = true; d.k = 0; d.panel.position.y = 0;
        p.position.set(${x + nx * side * 2.2}, 0, ${z + nz * side * 2.2}); p.yaw = Math.atan2(${nx * side}, ${nz * side}); p.pitch = -0.05; p.velocity.set(0,0,0); })()`);
      await step(0.3);
      await draw(20);
      await shot(`d-${id}-${side > 0 ? "a" : "b"}-cerrada`);
    }
    await js(`(() => { const g = __arcade.game, d = g.stage.map.doors.find(q => q.id === "${id}"); d.open = true; d.collider.enabled = false; })()`);
    await step(0.8);
    await draw(20);
    await shot(`d-${id}-abierta`);
  }
}
