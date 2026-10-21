// El oso de la caja y la caja en otros sitios (npm run shot -- test/browser/deadzone-oso.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap(window.__dzMap || "sector09"); })()`);
  await step(0.5);
  await js(`(() => { const g = __arcade.game; g.rounds.state = "intermission"; g.rounds.timer = 9999; })()`);
  // El oso en la plaza.
  await js(`(() => { const g = __arcade.game, p = g.seats[0].p, b = g.stage.map.box; g.stage.zombies.clear();
    p.position.set(b.position.x, 0, b.position.z + 3.6); p.yaw = 0; p.pitch = -0.18; b.phase = 3; b.teddy = true; b.left = 3; })()`);
  await step(0.9);
  await draw(25);
  await shot("o-0-oso");
  await js(`(() => { const b = __arcade.game.stage.map.box; b.phase = 0; b.teddy = false; })()`);
  // La caja en cada sitio nuevo.
  const names = ["patio", "tienda", "armeria", "bloqueb", "pasaje"];
  for (let i = 1; i <= 5; i++) {
    await js(`(() => { const g = __arcade.game, p = g.seats[0].p; g.stage.map.moveBox(${i}); const b = g.stage.map.box; const sp = { rot: b.group.rotation.y };
      p.position.set(b.position.x + Math.sin(sp.rot) * 3.2, 0, b.position.z + Math.cos(sp.rot) * 3.2); p.yaw = Math.atan2(Math.sin(sp.rot), Math.cos(sp.rot)); p.pitch = -0.2; })()`);
    await step(0.4);
    await draw(20);
    await shot(`o-${i}-${names[i - 1]}`);
  }
}
