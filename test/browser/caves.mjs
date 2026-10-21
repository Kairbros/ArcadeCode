// Escenario de capturas de cuevas, menas, antorchas y horno (npm run shot -- test/browser/caves.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("survival");
  await step(1);
  await draw(20); // construir todos los chunks
  // Una sala de cueva a oscuras, con sitio alrededor; el jugador dentro mirando a lo largo de ella.
  const found = await js(`(() => {
    const g = __arcade.game, w = g.world;
    w.flushLight();
    let best = null, bestN = 0;
    for (let y = 3; y < 18; y++) for (let z = 6; z < 90; z++) for (let x = 6; x < 90; x++) {
      if (w.get(x, y, z) !== 0 || w.get(x, y + 1, z) !== 0 || w.get(x, y - 1, z) === 0 || (w.lightAt(x, y, z) >> 4) > 0) continue;
      let n = 0;
      for (let k = 1; k < 7; k++) if (w.get(x, y, z - k) === 0 && w.get(x, y + 1, z - k) === 0) n++; else break;
      if (n > bestN) { bestN = n; best = [x, y, z]; }
    }
    window.__cave = best;
    return best;
  })()`);
  if (!found) throw new Error("no hay cueva");
  await js(`(() => {
    const g = __arcade.game, [x, y, z] = __cave;
    Object.assign(g.pilot.body, { x: x + 0.5, y, z: z + 0.5, vx: 0, vy: 0, vz: 0 });
    g.pilot.yaw = 0; g.pilot.pitch = -0.1;
    g.mobs.list = [];
  })()`);
  await step(0.2);
  await draw(12);
  await shot("caves-dark");
  // Antorchas: una en el suelo delante y otras en las paredes que haya cerca.
  await js(`(() => {
    const g = __arcade.game, w = g.world, [x, y, z] = __cave;
    const put = (a, b, c) => { if (w.get(a, b, c) === 0 && w.torchSupport(a, b, c) >= 0) w.set(a, b, c, 18); };
    put(x, y, z - 3);
    for (let k = -6; k <= 0; k += 3) for (const dx of [-1, 1, -2, 2]) put(x + dx, y + 1, z + k);
    for (let k = 0; k < 9; k++) g.pilot.inventory.slots[k] = null;
    [18, 17, 116, 118, 119, 123, 128, 124, 15].forEach((id, i) => g.pilot.inventory.slots[i] = { id, n: i < 5 ? 7 : 1 });
  })()`);
  await step(0.1);
  await draw(12);
  await shot("caves-torches");
  // Pantalla del horno con mena de hierro, carbón ardiendo y lingotes.
  await js(`(() => {
    const g = __arcade.game, w = g.world, p = g.pilot, b = p.body;
    const fx = Math.floor(b.x), fy = Math.floor(b.y), fz = Math.floor(b.z) - 1;
    w.set(fx, fy, fz, 17);
    p.yaw = 0; p.pitch = -0.6;
    window.__f = [fx, fy, fz];
  })()`);
  await step(0.1);
  await js(`__arcade.game.input.places = 1`);
  await step(0.05);
  await js(`(() => {
    const f = __arcade.game.pilot.crafter.furnace;
    f.slots[0] = { id: 15, n: 5 }; f.slots[1] = { id: 116, n: 3 }; f.slots[2] = { id: 118, n: 2 };
    f.burn = 25; f.burnMax = 40; f.progress = 3;
  })()`);
  await draw(2);
  await shot("caves-furnace");
}
