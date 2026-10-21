// Billar 2 contra 2 (npm run shot -- test/browser/pool4.mjs).
export default async function ({ start, step, press, shot }) {
  await start("pool");
  await step(0.2);
  await press("KeyP");
  await step(0.2);
  await shot("pool4-saque");
}
