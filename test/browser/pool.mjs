// Capturas de Billar (npm run shot -- test/browser/pool.mjs): saque, apuntando y a mitad de partida.
export default async function ({ js, start, step, shot }) {
  await start("pool");
  await step(0.2);
  await js(`__arcade.game.match.placing = false`);
  await step(0.1);
  await shot("pool-1-saque");
  await js(`(() => { const m = __arcade.game.match; m.aim.angle = 0; m.aim.power = 1; m.fire(); })()`);
  await step(0.6);
  await shot("pool-2-saque-rodando");
  await step(20);
  await shot("pool-3-tras-saque");
  await step(8);
  await shot("pool-4-turno-cpu");
  // Bola en mano para la CPU y partida de 8: mesa casi vacía con la 8 y la tronera marcada.
  await js(`(() => {
    const m = __arcade.game.match;
    m.table.balls.forEach((b, i) => { if (i > 0 && i !== 8 && i !== 9 && i !== 3) b.pocket = 0; });
    m.groups = [0, 1]; m.turn = 0; m.phase = 0; m.placing = false; m.brk = false; m.timer = 30;
    m.table.balls[3].pocket = 2; m.table.balls[1].pocket = 1; m.table.balls[2].pocket = 1;
    m.table.balls[4].pocket = 1; m.table.balls[5].pocket = 1; m.table.balls[6].pocket = 1; m.table.balls[7].pocket = 1;
    Object.assign(m.table.balls[8], { x: 40, y: -20, pocket: -1 });
    Object.assign(m.table.balls[0], { x: -50, y: 10, pocket: -1 });
    m.aim.angle = Math.atan2(-30, 90); m.aim.power = 0.6;
  })()`);
  await step(0.3);
  await shot("pool-5-la-8");
}
