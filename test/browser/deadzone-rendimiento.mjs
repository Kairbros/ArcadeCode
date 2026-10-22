// Rendimiento aproximado de Dead Zone: ms por fotograma con zombis, lluvia y postproceso, quitando piezas.
export default async function ({ js, start, step, draw }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap(window.__dzMap || "sector09"); })()`);
  await step(0.5);
  await js(`(() => { const g = __arcade.game; g.rounds.state = "intermission"; g.rounds.timer = 9999; const p = g.seats[0].p; p.position.set(0, 0, -9); p.yaw = 0;
    for (let i = 0; i < 14; i++) { const zb = g.stage.zombies.spawn(["walker","runner","brute"][i % 3], 3, -6 + i * 0.9, -14 - (i % 4)); zb.state = "chasing"; zb.stateT = 1; zb.hp = 9999; } })()`);
  await step(0.5);
  await draw(20);
  const measure = async (name) => {
    await draw(10);
    const ms = await js(`(() => { const t = performance.now(); for (let i = 0; i < 40; i++) { __arcade.draw(1); } return (performance.now() - t) / 40; })()`);
    console.log(name.padEnd(28), Math.round(ms * 10) / 10, "ms");
  };
  await measure("completo");
  await js(`(() => { const st = __arcade.game.stage; st.weather.group.visible = false; })()`);
  await measure("sin clima");
  await js(`(() => { const st = __arcade.game.stage; st.moon.castShadow = false; })()`);
  await measure("sin sombras de luna");
  await js(`(() => { const st = __arcade.game.stage; st.scene.traverse((o) => { if (o.isPointLight && o.parent === st.scene) o.visible = false; }); })()`);
  await measure("sin luces puntuales");
  await js(`(() => { const st = __arcade.game.stage; st.composerFailed = true; })()`);
  await measure("sin postproceso");
}
