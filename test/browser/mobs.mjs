// Escenario de capturas de los animales (npm run shot -- test/browser/mobs.mjs): los cuatro en fila delante
// del jugador, uno golpeado (rojo) y uno muriendo, y lo que sueltan.
export default async function ({ js, start, step, draw, shot }) {
  await start("survival");
  await step(1);
  await draw(20); // construir todos los chunks
  // Explanada delante (−z) y los cuatro animales en fila, mirando al jugador.
  await js(`(() => {
    const g = __arcade.game, w = g.world, p = g.pilot, b = p.body;
    const x0 = Math.floor(b.x), z0 = Math.floor(b.z), y0 = Math.floor(b.y);
    for (let x = x0 - 5; x <= x0 + 5; x++) for (let z = z0 - 8; z <= z0 + 1; z++) {
      w.set(x, y0 - 1, z, 1);
      for (let y = y0; y < y0 + 6; y++) w.set(x, y, z, 0);
    }
    g.mobs.list = [];
    [0, 1, 2, 3].forEach((k, i) => g.mobs.add(k, x0 - 2.7 + i * 1.8 + 0.5, y0, z0 - 3.5, Math.PI));
    window.__freeze = () => g.mobs.list.forEach((m) => { m.timer = 99; m.moving = false; });
    __freeze();
    Object.assign(b, { x: x0 + 0.5, y: y0, z: z0 + 0.5 });
    p.yaw = 0; p.pitch = -0.32;
  })()`);
  await step(0.5);
  await draw(4);
  await shot("mobs-row");
  // Golpe a la vaca (rojo) y la gallina muerta cayendo de lado.
  await js(`(() => {
    const g = __arcade.game;
    g.mobs.list[0].hurt = 0.4; g.mobs.list[0].panic = 0;
    g.mobs.hit(g.mobs.list[3].id, g.pilot.body.x, g.pilot.body.z, 10, g.drops);
  })()`);
  await step(0.1);
  await draw(2);
  await shot("mobs-hit");
  await step(1.5);
  await draw(2);
  await shot("mobs-loot");
}
