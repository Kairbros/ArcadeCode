// Capturas del casino: ventanilla, mecanismos de las rondas 2–4 y borrachos (npm run shot -- test/browser/casino.mjs).
export default async function ({ js, start, step, draw, shot: snap, press }) {
  // La cámara se suaviza dibujo a dibujo: se dibuja un rato antes de capturar para que llegue a su sitio.
  const shot = async (name) => {
    await draw(25);
    await snap(name);
  };
  await start("casino");
  await step(0.5);
  await draw(2);
  await shot("casino-0-inicio");

  // Ventanilla: delante del mostrador, mirando al sur, con la E.
  await js(`(() => { const g = __arcade.game, b = g.bodies[0]; Object.assign(b, { x: -7.5, z: 18.4, yaw: Math.PI, pitch: -0.05, lv: 0 }); })()`);
  await step(0.2);
  await shot("casino-1-ventanilla-cerca");
  await press("KeyE");
  await step(0.2);
  await press("ArrowUp");
  await press("Enter");
  await step(0.2);
  await shot("casino-2-ventanilla-ui");
  console.log("estado:", await js(`JSON.stringify({ chips: __arcade.game.chips[0], stake: __arcade.game.win.stake[0], notice: __arcade.game.notice })`));
  await press("KeyE");

  // Ronda 2: reja cerrada y palanca (pared este).
  await js(`(() => { const g = __arcade.game; g.round = 2; g.startRound(); Object.assign(g.bodies[0], { x: 25.8, z: 13, yaw: -Math.PI / 2, pitch: 0 }); })()`);
  await step(0.3);
  await shot("casino-3-palanca");
  await press("KeyE");
  await step(0.5);
  await shot("casino-4-palanca-tirada");
  await js(`(() => { Object.assign(__arcade.game.bodies[0], { x: -7.5, z: 16.5, yaw: Math.PI, pitch: 0 }); })()`);
  await step(1.2);
  await shot("casino-5-reja-abierta");

  // Ronda 3: timbre (pared oeste).
  await js(`(() => { const g = __arcade.game; g.round = 3; g.startRound(); Object.assign(g.bodies[0], { x: -25.6, z: 14, yaw: Math.PI / 2, pitch: 0 }); })()`);
  await step(0.3);
  await shot("casino-6-timbre");

  // Ronda 4: alarma y botones en el mirador (entrepiso).
  await js(`(() => { const g = __arcade.game; g.round = 4; g.startRound(); g.mech.nextAlarm = 0.01; Object.assign(g.bodies[0], { x: 0, z: 19, yaw: Math.PI, pitch: -0.1, lv: 1 }); })()`);
  await step(0.5);
  await shot("casino-7-alarma");

  // Borracho: se sienta en la mesa de patos (centro) con alguien sentado y la apuesta confirmada.
  await js(`(() => { const g = __arcade.game; g.round = 1; g.startRound();
    g.win.stake[0] = 50; g.sit(0, 5); g.tables[5].setAmount(0, 20, 50); g.tables[5].toggleLock(0, 50);
    const d = g.drunks[0]; d.x = 0; d.z = 5; d.lv = 0; d.ds = 1; d.table = 5; d.blockFor = 20; d.travel = 0; })()`);
  await step(3);
  await shot("casino-8-borracho-bloquea");
  console.log("borracho:", await js(`JSON.stringify({ stake: __arcade.game.win.stake[0], blocked: __arcade.game.tables[5].blocked, ds: __arcade.game.drunks[0].ds, notice: __arcade.game.notice })`));

  // Visto desde fuera: el borracho desplomado sobre la mesa.
  await js(`(() => { const g = __arcade.game; g.stand(0); Object.assign(g.bodies[0], { x: 0, z: 8.5, yaw: 0, pitch: -0.2 }); })()`);
  await step(0.1);
  await shot("casino-8b-borracho-visto");
  // De pie junto a la mesa para apartarlo.
  await js(`(() => { const g = __arcade.game; g.stand(0); const d = g.drunks[0]; Object.assign(g.bodies[0], { x: 0, z: 3.4, yaw: 0, pitch: -0.3 }); Math.random = () => 0; })()`);
  await step(0.2);
  await shot("casino-9-apartar-hint");
  await press("KeyE");
  await step(0.3);
  await shot("casino-10-borracho-dormido");
  await js(`(() => { Object.assign(__arcade.game.bodies[0], { x: 0, z: 8.5, yaw: 0, pitch: -0.2 }); })()`);
  await step(0.1);
  await shot("casino-11-borracho-dormido-visto");
  console.log("tras apartar:", await js(`JSON.stringify({ ds: __arcade.game.drunks[0].ds, blocked: __arcade.game.tables[5].blocked, notice: __arcade.game.notice })`));
}
