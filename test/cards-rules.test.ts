// Reglas de «Mazo Loco» (cartas de colores): baraja, jugadas legales, efectos de las cartas de acción,
// el aviso de UNO, los puntos y la progresión de ronda/partida. Todo con tiradas fijas.
import { describe, expect, it } from "./vitest-shim";
import { rng } from "./lib";
import { buildDeck, canPlay, cardName, cardPoints, colorOf, DRAW2, DECK_SIZE, isWild, rankOf, REVERSE, SKIP, WILD, WILD4 } from "../src/game/cards/deck";
import { RULES, CW, CH } from "../src/game/cards/config";
import { actionRects, colorRects, handPoses, handRects, hitHand, hitRect } from "../src/game/cards/layout";
import { CardTable } from "../src/game/cards/table";

/** Mesa a medida: mano y carta de arriba puestas a mano para probar una jugada concreta. */
function mesa(players = 3) {
  const t = new CardTable(players, [false, false, false, false].slice(0, players), rng(11));
  t.deck = buildDeck();
  t.discard = [4]; // un 4 rojo
  t.color = 0;
  t.dir = 1;
  t.phase = 0;
  t.winner = -1;
  t.turn = 0;
  t.uno = t.uno.map(() => true);
  t.unoT = t.unoT.map(() => 0);
  t.drew = t.drew.map(() => false);
  for (const hand of t.hands) hand.length = 0;
  return t;
}

const red = (rank: number) => rank;
const yellow = (rank: number) => 13 + rank;

describe("baraja", () => {
  it("son 108 cartas: 25 por color, 4 comodines y 4 comodines +4", () => {
    const deck = buildDeck();
    expect(deck.length).toBe(DECK_SIZE);
    for (let color = 0; color < 4; color++) {
      const mine = deck.filter((id) => colorOf(id) === color);
      expect(mine.length).toBe(25);
      expect(mine.filter((id) => rankOf(id) === 0).length).toBe(1);
      for (let rank = 1; rank < 13; rank++) expect(mine.filter((id) => rankOf(id) === rank).length).toBe(2);
    }
    expect(deck.filter((id) => id === WILD).length).toBe(4);
    expect(deck.filter((id) => id === WILD4).length).toBe(4);
  });

  it("los puntos de cada carta son los del reglamento", () => {
    expect(cardPoints(red(0))).toBe(0);
    expect(cardPoints(red(7))).toBe(7);
    expect(cardPoints(red(SKIP))).toBe(20);
    expect(cardPoints(yellow(DRAW2))).toBe(20);
    expect(cardPoints(WILD)).toBe(50);
    expect(cardPoints(WILD4)).toBe(50);
  });

  it("se lee el nombre de cada carta", () => {
    expect(cardName(red(7))).toBe("7 ROJO");
    expect(cardName(yellow(SKIP))).toBe("BLOQUEO AMARILLO");
    expect(cardName(WILD4)).toBe("COMODÍN +4");
  });
});

describe("jugadas legales", () => {
  it("vale el mismo color o el mismo número", () => {
    expect(canPlay(red(9), red(4), 0)).toBeTruthy(); // mismo color
    expect(canPlay(yellow(4), red(4), 0)).toBeTruthy(); // mismo número
    expect(canPlay(yellow(9), red(4), 0)).toBeFalsy();
    expect(canPlay(yellow(SKIP), red(REVERSE), 0)).toBeFalsy();
    expect(canPlay(yellow(SKIP), red(SKIP), 0)).toBeTruthy();
  });

  it("el color activo manda cuando la de arriba es un comodín", () => {
    expect(canPlay(yellow(3), WILD, 1)).toBeTruthy();
    expect(canPlay(yellow(3), WILD, 2)).toBeFalsy();
  });

  it("un comodín siempre se puede jugar", () => {
    expect(canPlay(WILD, red(4), 0)).toBeTruthy();
    expect(canPlay(WILD4, red(4), 0)).toBeTruthy();
    expect(isWild(WILD4)).toBeTruthy();
  });
});

describe("reparto", () => {
  it("7 cartas por asiento, mazo cuadrado y una carta de arriba que no es comodín", () => {
    const t = new CardTable(4, [false, false, false, false], rng(5));
    expect(t.hands.every((h) => h.length === RULES.handSize)).toBeTruthy();
    expect(t.discard.length).toBe(1);
    expect(isWild(t.top)).toBeFalsy();
    expect(rankOf(t.top) <= 9).toBeTruthy();
    expect(t.deck.length).toBe(DECK_SIZE - 4 * RULES.handSize - 1);
    expect(t.color).toBe(colorOf(t.top));
    expect(t.turn).toBe(0);
  });

  it("la ronda siguiente empieza por otro asiento", () => {
    const t = new CardTable(3, [false, false, false], rng(9));
    expect(t.round).toBe(1);
    t.newRound();
    expect(t.round).toBe(2);
    expect(t.turn).toBe(1);
  });
});

describe("efectos de las cartas", () => {
  it("+2: el siguiente roba dos y pierde el turno", () => {
    const t = mesa(3);
    t.hands[0] = [red(DRAW2), red(1)];
    t.hands[1] = [yellow(1)];
    t.hands[2] = [yellow(2)];
    expect(t.play(0, 0, -1)).toBeTruthy();
    expect(t.hands[1].length).toBe(3);
    expect(t.turn).toBe(2);
  });

  it("+4: el siguiente roba cuatro, cambia el color y pierde el turno", () => {
    const t = mesa(3);
    t.hands[0] = [WILD4, red(1)];
    t.hands[1] = [yellow(1)];
    t.hands[2] = [yellow(2)];
    expect(t.play(0, 0, 2)).toBeTruthy();
    expect(t.hands[1].length).toBe(5);
    expect(t.turn).toBe(2);
    expect(t.color).toBe(2);
    expect(isWild(t.top)).toBeTruthy();
  });

  it("bloqueo: el siguiente no juega", () => {
    const t = mesa(3);
    t.hands[0] = [red(SKIP), red(1)];
    expect(t.play(0, 0, -1)).toBeTruthy();
    expect(t.turn).toBe(2);
  });

  it("reversa con tres jugadores cambia el sentido", () => {
    const t = mesa(3);
    t.hands[0] = [red(REVERSE)];
    expect(t.play(0, 0, -1)).toBeTruthy();
    expect(t.dir).toBe(-1);
    expect(t.turn).toBe(2);
  });

  it("reversa con dos jugadores hace de bloqueo", () => {
    const t = mesa(2);
    t.hands[0] = [red(REVERSE), red(1)];
    expect(t.play(0, 0, -1)).toBeTruthy();
    expect(t.turn).toBe(0);
  });

  it("no se puede jugar fuera de turno ni una carta que no está en la mano", () => {
    const t = mesa(3);
    t.hands[0] = [red(4)];
    expect(t.play(1, 0, -1)).toBeFalsy();
    expect(t.play(0, 5, -1)).toBeFalsy();
  });

  it("no se puede jugar una carta que no liga", () => {
    const t = mesa(3);
    t.hands[0] = [yellow(9)];
    expect(t.play(0, 0, -1)).toBeFalsy();
  });
});

describe("robar y pasar", () => {
  it("si la carta robada no liga, se pasa solo", () => {
    const t = mesa(3);
    t.hands[0] = [yellow(9)];
    t.deck = [red(1), yellow(8)]; // el siguiente robo (pop) es un 8 amarillo: no liga con el 4 rojo
    expect(t.draw(0)).toBeTruthy();
    expect(t.hands[0].length).toBe(2);
    expect(t.turn).toBe(1);
  });

  it("si liga, sigues en tu turno y puedes pasar", () => {
    const t = mesa(3);
    t.hands[0] = [yellow(9)];
    t.deck = [red(6)];
    expect(t.draw(0)).toBeTruthy();
    expect(t.turn).toBe(0);
    expect(t.draw(0)).toBeFalsy(); // solo se roba una vez
    expect(t.pass(0)).toBeTruthy();
    expect(t.turn).toBe(1);
  });

  it("no se pasa sin haber robado", () => {
    const t = mesa(3);
    t.hands[0] = [red(1)];
    expect(t.pass(0)).toBeFalsy();
  });

  it("cuando el mazo se acaba se recicla el descarte sin perder la carta de arriba", () => {
    const t = mesa(3);
    t.hands[0] = [yellow(9)];
    t.deck = [];
    t.discard = [red(4), yellow(3), yellow(9)];
    t.hands[1] = [red(1), red(2)];
    expect(t.draw(0)).toBeTruthy();
    expect(t.hands[0].length).toBe(2);
    expect(t.top).toBe(yellow(9));
  });
});

describe("UNO", () => {
  it("quedarse con una carta abre la ventana; sin decir UNO caen dos", () => {
    const t = mesa(3);
    t.hands[0] = [red(5), red(7)];
    t.hands[1] = [yellow(1), yellow(2)];
    t.hands[2] = [yellow(3), yellow(4)];
    expect(t.play(0, 0, -1)).toBeTruthy();
    expect(t.hands[0].length).toBe(1);
    t.update(0.5);
    expect(t.hands[0].length).toBe(1); // aún a tiempo
    t.update(RULES.unoWindow + 0.1);
    expect(t.hands[0].length).toBe(3); // +2 de castigo
  });

  it("si dice UNO a tiempo no hay castigo", () => {
    const t = mesa(3);
    t.hands[0] = [red(5), red(7)];
    t.hands[1] = [yellow(1), yellow(2)];
    expect(t.play(0, 0, -1)).toBeTruthy();
    expect(t.sayUno(0)).toBeTruthy();
    t.update(RULES.unoWindow + 1);
    expect(t.hands[0].length).toBe(1);
  });
});

describe("mesa dibujada", () => {
  it("la mano cabe en el lienzo y el ratón pulsa justo la carta que se ve", () => {
    for (const n of [1, 5, 7]) {
      const rects = handRects(n);
      expect(rects.length).toBe(n);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(4);
        expect(r.x + r.w).toBeLessThanOrEqual(CW - 4);
        expect(r.y + r.h).toBeLessThanOrEqual(CH - 8);
      }
      // Sin solape, el centro de cada carta devuelve su índice.
      rects.forEach((r, i) => expect(hitRect(rects, r.x + r.w / 2, r.y + r.h / 2)).toBe(i));
    }
    // Manos llenas: se solapan, pero la última (la de arriba) siempre se puede pulsar.
    for (const n of [12, 20]) {
      const rects = handRects(n);
      expect(rects.length).toBe(n);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(2);
        expect(r.x + r.w).toBeLessThanOrEqual(CW - 2);
      }
      expect(hitRect(rects, rects[n - 1].x + rects[n - 1].w / 2, rects[n - 1].y + rects[n - 1].h / 2)).toBe(n - 1);
    }
  });

  it("el ratón acierta la carta girada del abanico (no su caja)", () => {
    for (const n of [3, 7]) {
      handPoses(n).forEach((p, i) => expect(hitHand(n, p.x, p.y)).toBe(i));
      expect(hitHand(n, 2, 2)).toBe(-1);
    }
    // Mano llena: se solapan, pero la última (la de arriba) siempre se pulsa.
    const full = handPoses(15)[14];
    expect(hitHand(15, full.x, full.y)).toBe(14);
  });

  it("los botones y los colores del comodín también están dentro y se pueden pulsar", () => {
    const ids = ["draw", "pass", "uno"] as const;
    for (const { r } of actionRects([...ids])) {
      expect(r.x).toBeGreaterThanOrEqual(4);
      expect(r.x + r.w).toBeLessThanOrEqual(CW - 4);
      expect(r.y + r.h).toBeLessThanOrEqual(CH - 8);
      expect(hitRect(actionRects([...ids]).map((b) => b.r), r.x + 2, r.y + 2) >= 0).toBeTruthy();
    }
    colorRects().forEach((r, i) => {
      expect(r.y + r.h).toBeLessThanOrEqual(CH - 8);
      expect(hitRect(colorRects(), r.x + r.w / 2, r.y + r.h / 2)).toBe(i);
    });
  });
});

describe("rondas y partida", () => {
  it("quien se queda sin cartas gana los puntos de los demás", () => {
    const t = mesa(3);
    t.hands[0] = [red(4)];
    t.hands[1] = [yellow(1), yellow(2)]; // 3 puntos
    t.hands[2] = [yellow(SKIP), yellow(WILD - 40)]; // 20 + 14
    expect(t.play(0, 0, -1)).toBeTruthy();
    expect(t.phase).toBe(1);
    expect(t.winner).toBe(0);
    expect(t.score[0]).toBe(43);
    expect(t.hands[0].length).toBe(0);
  });

  it("tras la pausa se reparte otra ronda y al llegar a los puntos se acaba la partida", () => {
    const t = mesa(2);
    t.score[0] = RULES.targetPoints - 1;
    t.hands[0] = [red(4)];
    t.hands[1] = [yellow(1)];
    expect(t.play(0, 0, -1)).toBeTruthy();
    expect(t.phase).toBe(2);
    expect(t.score[0]).toBeGreaterThanOrEqual(RULES.targetPoints);
  });

  it("una partida de bots termina y nunca se pierden ni se duplican cartas", () => {
    const t = new CardTable(4, [true, true, true, true], rng(2026));
    const total = () => t.deck.length + t.discard.length + t.hands.reduce((a, h) => a + h.length, 0);
    let guard = 0;
    let roto = false;
    while (t.phase !== 2 && guard++ < 400000) {
      if (total() !== DECK_SIZE) roto = true;
      const action = t.botAction(t.turn);
      if (action) t.act(t.turn, action);
      t.update(1 / 30);
    }
    expect(roto).toBeFalsy();
    expect(t.phase).toBe(2);
    expect(total()).toBe(DECK_SIZE);
    expect(Math.max(...t.score)).toBeGreaterThanOrEqual(RULES.targetPoints);
  });
});
