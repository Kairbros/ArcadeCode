// Escenario de capturas de vida y hambre (npm run shot -- test/browser/vitals.mjs): HUD con medio corazón y
// hambre a medias, bajo el agua con burbujas, recibiendo daño, comiendo y muerto.
export default async function ({ js, start, step, draw, shot }) {
  await start("survival");
  await step(1);
  await draw(20); // construir todos los chunks
  await js(`(() => {
    const g = __arcade.game, v = g.pilot.vitals;
    g.pilot.inventory.slots[0] = { id: 109, n: 3 };
    v.health = 13; v.hunger = 9;
  })()`);
  await step(0.1);
  await draw(2);
  await shot("vitals-hud");
  await js(`(() => { const v = __arcade.game.pilot.vitals; v.air = 4.5; v.damage(1); })()`);
  await draw(1);
  await shot("vitals-hurt-air");
  await js(`(() => { const v = __arcade.game.pilot.vitals; v.air = 10; v.hurt = 0; v.eating = 0.9; })()`);
  await draw(1);
  await shot("vitals-eating");
  await js(`__arcade.game.pilot.vitals.damage(99)`);
  await step(1.5);
  await draw(2);
  await shot("vitals-dead");
}
