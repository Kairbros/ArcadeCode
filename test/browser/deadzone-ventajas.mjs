// Máquinas de ventajas con y sin energía, abatido y revivir (npm run shot -- test/browser/deadzone-ventajas.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap(window.__dzMap || "sector09"); })()`);
  await step(0.5);
  await js(`(() => { const g = __arcade.game; g.rounds.state = "intermission"; g.rounds.timer = 9999; g.seats[0].points.add(20000); })()`);
  const stand = (id) => js(`(() => { const g = __arcade.game, s = g.seats[0], m = g.stage.map.perks.find(q => q.id === "${id}"); g.stage.zombies.clear();
    const dx = Math.sin(m.group.rotation.y), dz = Math.cos(m.group.rotation.y);
    s.p.position.set(m.group.position.x + dx * 2.2, 0, m.group.position.z + dz * 2.2); s.p.yaw = Math.atan2(dx, dz); s.p.pitch = -0.05; })()`);
  for (const id of ["quickRevive", "juggernog", "speedCola", "doubleTap"]) {
    await js(`(() => { __arcade.game.stage.map.power.on = false; })()`);
    await stand(id);
    await step(0.4);
    await draw(20);
    await shot(`v-${id}-apagada`);
    await js(`(() => { __arcade.game.stage.map.power.on = true; })()`);
    await step(0.6);
    await draw(20);
    await shot(`v-${id}-encendida`);
  }
}
