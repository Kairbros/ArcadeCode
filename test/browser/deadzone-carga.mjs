// Coste de dibujo por mapa: mallas, luces y ms por fotograma (npm run shot -- test/browser/deadzone-carga.mjs).
export default async function ({ js, start, step, draw }) {
  await start("deadzone");
  for (const id of ["sector09", "granja", "pueblo", "terminal"]) {
    await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap("${id}"); g.rounds.state = "intermission"; g.rounds.timer = 9999; })()`);
    await step(0.5);
    await draw(20);
    const info = await js(`(() => { const st = __arcade.game.stage; let meshes = 0, tris = 0, inst = 0, mats = new Set(); st.scene.traverse((o) => { if (o.isMesh && o.visible) { meshes++; mats.add(o.material); const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? 1 : 1); if (o.isInstancedMesh) inst++; } });
      return JSON.stringify({ meshes, tris: Math.round(tris), inst, mats: mats.size, windows: st.map.windows.length }); })()`);
    const ms = await js(`(() => { const t = performance.now(); for (let i = 0; i < 30; i++) { __arcade.draw(1); } return (performance.now() - t) / 30; })()`);
    console.log(id.padEnd(10), info, Math.round(ms * 10) / 10, "ms");
  }
}
