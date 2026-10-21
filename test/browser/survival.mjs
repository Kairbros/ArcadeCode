// Escenario de capturas de Bloques en supervivencia (npm run shot -- test/browser/survival.mjs).
export default async function ({ js, start, step, draw, hold, press, mouse, shot }) {
  await start("survival");
  await step(1);
  await draw(20); // construir todos los chunks
  await shot("survival-start");
  // Capturar el puntero, mirar al suelo y romper el bloque de delante con el clic mantenido.
  await mouse("click");
  const locked = await js("!!document.pointerLockElement");
  if (!locked) throw new Error("el clic no capturó el puntero");
  await js("__arcade.game.pilot.pitch = -0.9");
  await step(0.1);
  await mouse("down");
  await step(0.4);
  await shot("survival-crack");
  await step(1);
  await mouse("up");
  await shot("survival-drop");
  await hold("KeyW", 1);
  await step(1);
  await shot("survival-picked");
  await press("KeyE");
  await shot("survival-inventory");
}
