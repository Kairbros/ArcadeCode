// Escenario de capturas del día y la noche y de los monstruos (npm run shot -- test/browser/night.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("survival");
  await step(1);
  await draw(20); // construir todos los chunks
  // Explanada delante con los cuatro monstruos en fila mirando al jugador; nada más alrededor.
  await js(`(() => {
    const g = __arcade.game, w = g.world, p = g.pilot, b = p.body;
    g.mobs.hostiles = false;
    g.mobs.list = [];
    const x0 = Math.floor(b.x), z0 = Math.floor(b.z), y0 = Math.floor(b.y);
    for (let x = x0 - 6; x <= x0 + 6; x++) for (let z = z0 - 9; z <= z0 + 1; z++) {
      w.set(x, y0 - 1, z, 1);
      for (let y = y0; y < y0 + 6; y++) w.set(x, y, z, 0);
    }
    window.__row = () => {
      g.mobs.list = [];
      [4, 5, 6, 7].forEach((k, i) => g.mobs.add(k, x0 - 2.7 + i * 1.8 + 0.5, y0, z0 - 4.5, Math.PI));
      g.mobs.list.forEach((m) => { m.timer = 99; m.moving = false; });
    };
    window.__freeze = () => g.mobs.list.forEach((m) => { m.body.vx = m.body.vz = 0; });
    Object.assign(b, { x: x0 + 0.5, y: y0, z: z0 + 0.5 });
    p.yaw = 0; p.pitch = -0.15;
    window.__spot = [x0, y0, z0];
  })()`);
  await js(`__arcade.game.clock = 600 * 0.48`); // atardecer
  await step(0.1);
  await draw(4);
  await shot("night-sunset");
  // Medianoche con los monstruos delante y dos antorchas.
  await js(`(() => {
    const g = __arcade.game, [x, y, z] = __spot;
    g.clock = 600 * 0.75;
    __row();
    g.world.set(x - 3, y, z - 3, 18);
    g.world.set(x + 3, y, z - 6, 18);
    g.pilot.vitals.hunger = 20;
  })()`);
  // Pasos cortos para que se coloquen sin llegar a atacar (la simulación los movería hacia el jugador).
  await step(0.05);
  await draw(6);
  await shot("night-mobs");
  // El petardo encendido y un zombi ardiendo (de día), y una explosión.
  await js(`(() => {
    const g = __arcade.game;
    g.mobs.list[3].fuse = 1; g.mobs.list[0].burning = true;
  })()`);
  await draw(2);
  await shot("night-fuse");
  await js(`(() => {
    const g = __arcade.game, [x, y, z] = __spot;
    g.mobs.list = [];
    g.clock = 600 * 0.25;
    g.explode(x + 0.5, y + 0.8, z - 5.5);
  })()`);
  await step(0.15);
  await draw(3);
  await shot("night-boom");
  // Noche dentro de una cueva iluminada... y el cielo sin nada encima.
  await js(`__arcade.game.clock = 600 * 0.75; __arcade.game.pilot.pitch = 0.6`);
  await step(0.05);
  await draw(2);
  await shot("night-sky");
}
