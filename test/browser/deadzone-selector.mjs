// Selector de mapa (npm run shot -- test/browser/deadzone-selector.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await step(0.3);
  await draw(5);
  await shot("s-0-granja");
  for (const [i, name] of [[1, "pueblo"], [2, "terminal"], [3, "sector09"]]) {
    await js(`(() => { __arcade.game.menuIndex = ${i}; })()`);
    await step(0.1);
    await draw(3);
    await shot(`s-${i}-${name}`);
  }
}
