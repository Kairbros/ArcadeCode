// Capturas y partida de verdad en «Mazo Loco» (3D en primera persona): mesa recién repartida, carta jugada con el
// ratón, comodín pidiendo color, robo con D y fin de ronda / partida. (npm run shot -- test/browser/cards.mjs)
export default async function ({ js, start, step, draw, shot, mouse }) {
  // Posición de pantalla (px de página) del centro de la carta `i` de mi mano.
  const cardAt = (i) => js(`(() => { const g = __arcade.game, hand = g.table.hands[0];
    const [lx, ly] = g.handCenters(0)[${i}];
    const c = document.getElementById("game"), r = c.getBoundingClientRect();
    return JSON.stringify({ n: hand.length, cx: Math.round(r.left + (lx / 360) * r.width), cy: Math.round(r.top + (ly / 270) * r.height) }); })()`).then(JSON.parse);

  await start("cards");
  await step(0.4);
  await draw(6);
  await shot("cards-0-mesa");

  // --- Jugar una carta con el ratón de verdad (el lienzo está escalado: se pasa a coordenadas de página).
  const idx = Number(await js(`(() => { const t = __arcade.game.table, hand = t.hands[0];
    return Math.max(0, hand.findIndex((id) => id < 52 && (Math.floor(id / 13) === t.color || (id % 13) === (t.top % 13)))); })()`));
  const p = await cardAt(idx);
  console.log("carta a pulsar:", idx, p);
  await mouse("move", "left", p.cx, p.cy);
  await step(0.3);
  await draw(4);
  await shot("cards-1-hover");
  await mouse("click", "left", p.cx, p.cy);
  await step(0.1);
  console.log("tras el clic:", await js(`JSON.stringify({ mano: __arcade.game.table.hands[0].length, antes: ${p.n}, msg: __arcade.game.table.msg, turno: __arcade.game.table.turn })`));
  await step(0.15);
  await draw(4);
  await shot("cards-2-vuelo");
  await step(0.5);
  await draw(6);
  await shot("cards-2-jugada");

  // --- Turno ajeno: la mano baja y la cámara mira al centro.
  await js(`(() => { const t = __arcade.game.table; t.turn = 1; })()`);
  await step(0.1);
  await draw(40);
  await shot("cards-2b-turno-ajeno");

  // --- Comodín: se pone uno en la mano y se abre el selector con el ratón.
  await js(`(() => { const g = __arcade.game, t = g.table;
    t.phase = 0; t.turn = 0; t.drew[0] = false; t.hands[0] = [53, ...t.hands[0]]; })()`);
  await step(0.5);
  const p2 = await cardAt(0);
  await mouse("click", "left", p2.cx, p2.cy);
  await step(0.02);
  await draw(4);
  await shot("cards-3-color");
  console.log("eligiendo color:", await js(`JSON.stringify({ picking: __arcade.game.input.picking })`));
  // Tercer color (verde): 34 px de ancho, 8 de hueco, panel a HAND_Y-66.
  const p3 = JSON.parse(await js(`(() => { const c = document.getElementById("game"), r = c.getBoundingClientRect();
    const x0 = Math.round((360 - (34 * 4 + 8 * 3)) / 2);
    return JSON.stringify({ cx: Math.round(r.left + ((x0 + 2 * (34 + 8) + 17) / 360) * r.width), cy: Math.round(r.top + ((160 - 66 + 22 + 12) / 270) * r.height) }); })()`));
  await mouse("click", "left", p3.cx, p3.cy);
  await step(0.02);
  console.log("tras elegir:", await js(`JSON.stringify({ picking: __arcade.game.input.picking, color: __arcade.game.table.color, top: __arcade.game.table.top })`));
  await step(0.5);
  await draw(6);
  await shot("cards-4-comodin");

  // --- Robar con D.
  await js(`(() => { const g = __arcade.game, t = g.table; t.turn = 0; t.drew[0] = false; })()`);
  await js(`__arcade.key("KeyD")`);
  await step(0.02);
  await js(`__arcade.key("KeyD", false)`);
  await step(0.2);
  console.log("tras robar:", await js(`JSON.stringify({ mano: __arcade.game.table.hands[0].length, robo: __arcade.game.table.drew[0] })`));
  await draw(4);
  await shot("cards-5-robo");

  // --- Mano grande y UNO de un rival.
  await js(`(() => { const t = __arcade.game.table; t.phase = 0; t.turn = 0; t.drew[0] = false;
    t.hands[0] = [...t.hands[0], 3, 17, 25, 30, 44, 8, 52, 53, 12, 20]; t.hands[2] = [t.hands[2][0]]; })()`);
  await step(0.6);
  await draw(6);
  await shot("cards-5b-manogrande");

  // --- Fin de ronda y fin de partida.
  await js(`(() => { const g = __arcade.game, t = g.table;
    t.phase = 0; t.hands[0] = [t.top]; t.turn = 0; t.play(0, 0, -1); })()`);
  await step(0.2);
  await draw(6);
  await shot("cards-6-ronda");
  await js(`(() => { const g = __arcade.game, t = g.table;
    t.score = t.score.map((p, i) => (i === 0 ? 520 : p)); t.phase = 2; t.winner = 0; })()`);
  await step(0.1);
  await draw(6);
  await shot("cards-7-final");
}
