// Armas apuntando (mira) y a la cadera (npm run shot -- test/browser/deadzone-miras.mjs).
export default async function ({ js, start, step, draw, shot }) {
  await start("deadzone");
  await js(`(() => { const g = __arcade.game; g.phase = "play"; g.loadMap(window.__dzMap || "sector09"); })()`);
  await step(0.5);
  await js(`(() => { const g = __arcade.game; g.rounds.state = "intermission"; g.rounds.timer = 9999; })()`);
  await js(`(() => { const g = __arcade.game, p = g.seats[0].p; p.position.set(0, 0, 8); p.yaw = 0; p.pitch = 0; })()`);
  const ids = JSON.parse(await js(`JSON.stringify(Object.keys(__arcade.game.seats[0].weapons.def ? {pistol:1,revolver:1,smg:1,shotgun:1,rifle:1,lmg:1,sniper:1,pulse:1} : {}))`));
  const all = JSON.parse(await js(`JSON.stringify(Object.keys(window.__dzWeapons ?? {}))`));
  void ids; void all;
  for (const id of ["pistol", "revolver", "smg", "shotgun", "rifle", "lmg", "sniper", "pulse"]) {
    for (const upg of [false]) {
      for (const ads of [false, true]) {
        await js(`(() => { const g = __arcade.game; const v = g.stage.view; v.setWeapon("${id}", ${upg}); g.stage.zombies.clear();
          for (let i = 0; i < 40; i++) v.update(0.05, { moving: 0, sprinting: false, ads: ${ads}, reloading: false, hidden: false });
          const fov = { pistol: 68, revolver: 66, smg: 62, shotgun: 66, rifle: 56, lmg: 60, sniper: 17, pulse: 58 }; g.stage.camera.fov = ${ads} ? fov["${id}"] : 78; g.stage.camera.updateProjectionMatrix(); })()`);
        await draw(2);
        await shot(`m-${id}-${ads ? "ads" : "cadera"}`);
      }
    }
  }
}
