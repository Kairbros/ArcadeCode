// Escenario de capturas de Casino de deudas (npm run shot -- test/browser/casino.mjs).
export default async function ({ js, start, step, press, shot }) {
  const at = (x, y) => js(`Object.assign(__arcade.game.casino.gamblers[0], { x: ${x}, y: ${y} })`);
  await start("casino");
  await step(1);
  await shot("casino-intro");
  await step(2);
  await at(22, 62); // delante de la primera tragaperras
  await step(0.1);
  await shot("casino-slot-idle");
  await press("Space");
  await step(0.7);
  await shot("casino-slot-spin");
  await step(0.8);
  await shot("casino-slot-result");
  await js("__arcade.game.casino.bank = 600");
  await at(160, 121); // delante de los dados
  await step(0.6);
  await press("Space");
  await step(0.5);
  await shot("casino-dice-roll");
  await step(1.2);
  await shot("casino-dice-result");
  await at(73, 125); // doble o nada
  await step(0.5);
  await press("Space");
  await step(1.3);
  await shot("casino-coin");
  await js("__arcade.game.casino.timer = 0.01");
  await step(0.5);
  await shot("casino-collect");
  await js("__arcade.game.casino.bank = 0");
  await step(3);
  await shot("casino-over");
}
