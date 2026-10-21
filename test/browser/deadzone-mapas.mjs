// Vistas de cada mapa (npm run shot -- test/browser/deadzone-mapas.mjs). El mapa se elige con la variable de entorno MAPAS
// (por ejemplo MAPAS=granja,pueblo) o, sin ella, se ven todos.
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  const ids = (process.env.MAPAS || "granja,pueblo,terminal").split(",");
  const views = {
    granja: [
      ["inicio", -14.5, 3.8, 0, -0.05], ["sala", -9, 4.5, 2.4, -0.05], ["porche", -14, 8.4, 0, 0], ["patio", 1, 12, 0, -0.04],
      ["granero", 16, 1, 0, -0.05], ["granero-dentro", 16, -6.5, 0.2, -0.04], ["silo", 20, -26, -1.6, -0.1], ["caseta", 0, -23, 0, -0.04],
      ["casa-fuera", -14, 17, 0.1, -0.04], ["cocina", -14, -7, 0, -0.06],
    ],
    pueblo: [
      ["inicio", -17.5, 9.5, -1.57, -0.05], ["tienda", -12, 12, 2.2, -0.05], ["calle-sur", 0, 19, 0, -0.04], ["calle-centro", 0, 2, 0, -0.03],
      ["fuente", 0, -2, 0, -0.1], ["plaza", 0, -26, 0, 0.0], ["bar", -14, -6, 1.5, -0.04], ["banco", -15, -22, 0, -0.04],
      ["correos", 18, 9, 1.57, -0.05], ["ferreteria", 18, -22, 0, -0.04], ["callejon", -18, 0, 0, -0.03], ["trasera", -28.5, 12, 0, -0.03],
    ],
    terminal: [
      ["inicio", -10, -16.5, 3.14, -0.05], ["sala", -10, -8, 3.14, -0.04], ["taquilla", -8, -12, 0, -0.04], ["puerta", -18, -9, 3.14, -0.04],
      ["lote", 0, 8, 0, -0.04], ["lote-bus", 4, 14, 0.6, -0.04], ["garaje-fuera", 18, 0, 0, -0.04], ["garaje-dentro", 20, -10, 0, -0.04],
      ["gasolinera", -14, 4, 0.5, -0.04], ["gas-dentro", -21, 14, 3.14, -0.04], ["oficina", -21, -17, 0, -0.04], ["andenes", 8.5, -6, 0, -0.03],
    ],
  };
  for (const id of ids) {
    await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap("${id}"); g.rounds.state = "intermission"; g.rounds.timer = 9999; g.seats[0].points.add(30000); })()`);
    await step(0.5);
    for (const [name, x, z, yaw, pitch] of views[id] ?? []) {
      await js(`(() => { const g = __arcade.game, p = g.seats[0].p; g.stage.zombies.clear(); p.position.set(${x}, 0, ${z}); p.yaw = ${yaw}; p.pitch = ${pitch}; p.velocity.set(0, 0, 0); })()`);
      await step(0.3);
      await draw(20);
      await shot(`mp-${id}-${name}`);
    }
  }
}
