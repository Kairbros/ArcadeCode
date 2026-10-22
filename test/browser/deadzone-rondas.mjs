// Cambio de ronda con marcas de sangre, pausa y abatido (npm run shot -- test/browser/deadzone-rondas.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap("sector09"); g.rounds.state = "intermission"; g.rounds.timer = 9999; })()`);
  await step(0.5);
  await js(`(() => { const g = __arcade.game; g.emit(9, 7); })()`);
  await step(1.2); await draw(10); await shot("r-0-fin-ronda");
  await js(`(() => { const g = __arcade.game; g.emit(8, 8, 0); g.emit(2, 8, "9 INFECTADOS"); })()`);
  await step(1.0); await draw(10); await shot("r-1-empieza-pintando");
  await step(1.2); await draw(10); await shot("r-2-marcas-grandes");
  await step(2.4); await draw(10); await shot("r-3-bajando");
  await step(1.6); await draw(10); await shot("r-4-esquina");
  await js(`(() => { const g = __arcade.game; g.setPaused(true); })()`);
  await step(0.2); await draw(10); await shot("r-5-pausa");
  await js(`(() => { const g = __arcade.game; g.setPaused(false); })()`);
  await js(`(() => { const g = __arcade.game; g.online[1] = true; g.seats[1].p.reset(0, 14); g.damageSeat(0, 9999); })()`);
  await step(0.6); await draw(10); await shot("r-6-abatido");
}
