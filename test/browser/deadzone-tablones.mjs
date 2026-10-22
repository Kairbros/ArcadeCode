// Barricadas: tablones arrancados, tirados y reparándose en el aire (npm run shot -- test/browser/deadzone-tablones.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap(window.__dzMap || "sector09"); })()`);
  await step(0.5);
  await js(`(() => { const g = __arcade.game; g.rounds.state = "intermission"; g.rounds.timer = 9999; })()`);
  const look = (dist = 3.2, h = 0) => js(`(() => { const g = __arcade.game, p = g.seats[0].p, w = g.stage.map.windows.find(q => q.id === "w_patio_n"); g.stage.zombies.clear();
    p.position.set(w.x + w.nx * ${dist}, 0, w.z + w.nz * ${dist}); p.yaw = Math.atan2(w.nx, w.nz); p.pitch = ${h}; })()`);
  await look();
  await step(0.3);
  await draw(20);
  await shot("t-0-entera");
  // Un zombi arranca tres tablones.
  await js(`(() => { const g = __arcade.game, w = g.stage.map.windows.find(q => q.id === "w_patio_n"); for (let i = 0; i < 3; i++) g.interact.tearPlank(w); })()`);
  await step(0.18);
  await draw(10);
  await shot("t-1-saltando");
  await step(1.4);
  await draw(20);
  await shot("t-2-tirados");
  // Reparar: se elevan y se colocan.
  await js(`(() => { const g = __arcade.game, w = g.stage.map.windows.find(q => q.id === "w_patio_n"); w.planks = 6; g.interact.paintPlanks(w); })()`);
  await step(0.3);
  await draw(10);
  await shot("t-3-flotando");
  await step(0.35);
  await draw(10);
  await shot("t-4-volando");
  await step(1.2);
  await draw(20);
  await shot("t-5-repuestas");
}
