// Capturas del aspecto de Dead Zone: la plaza con la caja misteriosa, la ruleta, el mejorador, las armas, la lluvia
// y los zombis (npm run shot -- test/browser/deadzone-visual.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await step(0.5);
  const tp = (x, z, yaw, pitch = 0) => js(`(() => { const g = __arcade.game, p = g.seats[0].p; g.stage.zombies.clear();
    p.position.set(${x}, 0, ${z}); p.yaw = ${yaw}; p.pitch = ${pitch}; p.velocity.set(0, 0, 0); })()`);
  const pose = async (name, frames = 30) => { await step(0.3); await draw(frames); await shot(name); };
  await js(`(() => { const g = __arcade.game; g.rounds.state = "intermission"; g.rounds.timer = 9999; g.seats[0].points.add(20000); })()`);

  // Salida y calle.
  await tp(0, 14, 0, -0.02);
  await pose("v-0-patio");
  await tp(0, 7, 0.05);
  await pose("v-1-calle");

  // La plaza: la caja en el centro.
  await tp(0, -8.5, 0, -0.1);
  await pose("v-2-plaza-caja");
  await tp(0, -13.6, 0, -0.16);
  await pose("v-3-caja-cerca");

  // Ruleta de la caja: se paga con E y gira.
  await js(`(() => { const g = __arcade.game, s = g.seats[0], eye = s.p.eyePosition(); s.weapons.reset();
    const pr = g.interact.find(eye, s.p.forward(new (eye.constructor)()), s, 0); if (!pr) throw new Error("sin cartel de caja"); g.interact.use(pr, 0, s); })()`);
  await step(1.4);
  await draw(10);
  await shot("v-4-caja-girando");
  await step(3.4);
  await draw(10);
  await shot("v-5-caja-ofrece");
  console.log("caja:", await js(`JSON.stringify(__arcade.game.interact.machines())`));
  await js(`(() => { const g = __arcade.game, s = g.seats[0], eye = s.p.eyePosition();
    const pr = g.interact.find(eye, s.p.forward(new (eye.constructor)()), s, 0); g.interact.use(pr, 0, s); g.syncView(); })()`);
  await step(0.5);
  await draw(25);
  await shot("v-6-arma-de-la-caja");

  // El interruptor de la energía y el mejorador.
  await tp(-1.5, -35.2, 0, 0);
  await js(`(() => { const g = __arcade.game; g.stage.map.power.on = false; })()`);
  await tp(-1.5, -35.2, 0, 0.02);
  await pose("v-7-interruptor");
  await js(`(() => { const g = __arcade.game, s = g.seats[0], eye = s.p.eyePosition();
    const pr = g.interact.find(eye, s.p.forward(new (eye.constructor)()), s, 0); console.log("cartel:", pr && pr.label); if (pr) g.interact.use(pr, 0, s); })()`);
  await tp(-21.4, -20.4, 0, -0.05);
  await pose("v-8-mejorador");
  await js(`(() => { const g = __arcade.game, s = g.seats[0], eye = s.p.eyePosition();
    const pr = g.interact.find(eye, s.p.forward(new (eye.constructor)()), s, 0); console.log("cartel:", pr && pr.label); if (pr) g.interact.use(pr, 0, s); g.syncView(); })()`);
  await step(1.2);
  await draw(10);
  await shot("v-9-mejorando");
  await step(2.8);
  await draw(10);
  await shot("v-10-mejorada-lista");
  await js(`(() => { const g = __arcade.game, s = g.seats[0], eye = s.p.eyePosition();
    const pr = g.interact.find(eye, s.p.forward(new (eye.constructor)()), s, 0); console.log("cartel:", pr && pr.label); if (pr) g.interact.use(pr, 0, s); g.syncView(); })()`);
  await step(0.6);
  await draw(25);
  await shot("v-11-arma-mejorada");

  // Todas las armas en la mano.
  await tp(0, 14, 0, 0);
  for (const id of ["pistol", "revolver", "smg", "shotgun", "rifle", "lmg", "sniper", "pulse"]) {
    for (const upg of [false, true]) {
      await js(`(() => { const g = __arcade.game, s = g.seats[0]; s.weapons.reset(); s.weapons.slots[0] = "${id}"; s.weapons.upg["${id}"] = ${upg};
        s.weapons.ammo["${id}"] = { mag: 20, reserve: 20 }; g.syncView(); })()`);
      await step(0.6);
      await draw(25);
      await shot(`w-${id}${upg ? "-mej" : ""}`);
    }
  }

  // Zombis y tiros en la plaza, con lluvia y niebla.
  await js(`(() => { const g = __arcade.game, s = g.seats[0]; s.weapons.reset(); s.weapons.slots[0] = "rifle"; s.weapons.ammo.rifle = { mag: 26, reserve: 200 }; g.syncView(); })()`);
  await tp(0, -9, 0, -0.04);
  await js(`(() => { const g = __arcade.game;
    for (const [x, z, k] of [[-3, -14, "walker"], [2.5, -15, "walker"], [0.5, -17.5, "brute"], [-1, -12.5, "runner"], [4, -13, "walker"]]) { const zb = g.stage.zombies.spawn(k, 3, x, z); zb.state = "chasing"; zb.stateT = 1; zb.hp = 9999; } })()`);
  await step(0.3);
  await draw(10);
  await shot("z-0-zombis-plaza");
  for (let i = 0; i < 4; i++) {
    await js(`(() => { const g = __arcade.game, s = g.seats[0]; const shot = s.weapons.fire(true, true); if (shot) g.resolveShot(0, shot); s.weapons.update(1); })()`);
    await step(0.05);
  }
  await draw(3);
  await shot("z-1-disparos");
  await step(0.6);
  await draw(10);
  await shot("z-2-sangre");
  // Relámpago.
  await js(`(() => { const w = __arcade.game.stage.weather; w.flash = 1; })()`);
  await draw(1);
  await shot("z-3-relampago");
  // Poca vida.
  await js(`(() => { const g = __arcade.game; g.seats[0].p.health = 18; g.fb.damageT = 0.05; })()`);
  await step(0.1);
  await draw(10);
  await shot("z-4-poca-vida");

  // Otros jugadores con sus armas en las manos.
  await js(`(() => { const g = __arcade.game; g.stage.zombies.clear(); g.stage.effects.clear(); g.seats[0].p.health = 100;
    const p = g.seats[0].p; p.position.set(0, 0, -6); p.yaw = 0; p.pitch = -0.05;
    for (const [i, id, upg, x] of [[1, "rifle", false, -2.2], [2, "sniper", true, 0.2], [3, "pulse", true, 2.4]]) {
      g.online[i] = true; const q = g.seats[i]; q.weapons.reset(); q.weapons.slots[0] = id; q.weapons.upg[id] = upg; q.weapons.ammo[id] = { mag: 10, reserve: 10 };
      q.p.reset(x, -10, Math.PI); q.p.pitch = 0.05; q.p.yaw = Math.PI; } })()`);
  await step(0.5);
  await draw(25);
  await shot("a-0-otros-jugadores");
  await js(`(() => { const g = __arcade.game; for (const i of [1, 2, 3]) g.stage.avatar(i).fire(); })()`);
  await draw(1);
  await shot("a-1-fogonazo");
}
