// «Mazo Loco» en red: el invitado manda su jugada, el anfitrión la arbitra y el estado vuelve con acuse.
// Se simula el viaje completo (mensaje → mesa → estado) sin navegador.
import { describe, expect, it } from "./vitest-shim";
import { CardsGuest, CardsHost } from "../src/game/cards/game";
import { CardsInput } from "../src/game/cards/input";
import type { CardsSnap } from "../src/game/cards/state";

type Any = Record<string, unknown>;

const fakeKeyboard = () => {
  const down = new Set<string>();
  return {
    down,
    kb: { isDown: (c: string) => down.has(c), anyDown: (cs: readonly string[]) => cs.some((c) => down.has(c)) },
  };
};

const snapOf = (host: CardsHost): CardsSnap => host.frame().snap as CardsSnap;
const J = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

/** Anfitrión con `players` asientos (el 0 es este equipo; el resto, invitados de prueba). */
function mesa(players: number) {
  const { kb } = fakeKeyboard();
  const host = new CardsHost(new CardsInput(kb as never), players - 1, "host", false);
  return host;
}

describe("red: jugada de un invitado", () => {
  it("el anfitrión acepta la jugada, la mesa cambia y el invitado ve su mano nueva", () => {
    const host = mesa(2);
    const { kb, down } = fakeKeyboard();
    const input = new CardsInput(kb as never);
    const guest = new CardsGuest(1, input);
    const antes = snapOf(host);
    guest.onSnap(J(antes));
    expect(guest.ready).toBeTruthy();
    // Se fuerza el turno del invitado y se le pone una carta que liga seguro.
    host.table.turn = 1;
    host.table.hands[1][0] = host.table.color * 13 + 3;
    const mano = host.table.hands[1];
    const before = mano.length;
    const idx = 0;
    const s = snapOf(host);
    guest.onSnap(J(s));
    input.hover = idx;
    down.add("Space");
    guest.update(1 / 30);
    down.delete("Space");
    const msg = guest.outgoing("p2p") as Any;
    expect(!!msg).toBeTruthy();
    host.onMessage(1, J(msg));
    const despues = snapOf(host);
    expect(despues.hd[1].length).toBe(before - 1);
    expect(despues.ak[1]).toBe(1);
    // El invitado recibe el estado nuevo y limpia lo pendiente.
    guest.onSnap(J(despues));
    expect(guest.outgoing("p2p")).toBeUndefined();
  });

  it("el mismo mensaje repetido no juega dos veces", () => {
    const host = mesa(2);
    host.table.turn = 1;
    host.table.hands[1][0] = host.table.color * 13 + 3;
    const before = host.table.hands[1].length;
    const msg = { t: "c", i: 7, a: 1, c: 0, k: -1, s: 1 };
    host.onMessage(1, msg);
    host.table.turn = 1; // aunque volviera a tocarle
    host.onMessage(1, msg);
    expect(host.table.hands[1].length).toBe(before - 1);
  });

  it("fuera de turno la jugada se ignora (pero se acusa)", () => {
    const host = mesa(2);
    host.table.turn = 0;
    host.table.hands[1][0] = host.table.color * 13 + 3;
    const before = host.table.hands[1].length;
    host.onMessage(1, { t: "c", i: 3, a: 1, c: 0, k: -1, s: 1 });
    expect(host.table.hands[1].length).toBe(before);
    expect(snapOf(host).ak[1]).toBe(3);
  });

  it("una carta que no está en la mano no cambia la mesa", () => {
    const host = mesa(2);
    host.table.turn = 1;
    const hand = host.table.hands[1].slice();
    host.onMessage(1, { t: "c", i: 4, a: 1, c: 99, k: -1, s: 1 });
    expect(host.table.hands[1]).toEqual(hand);
  });

  it("el comodín llega con el color elegido", () => {
    const host = mesa(2);
    host.table.turn = 1;
    host.table.hands[1] = [53, ...host.table.hands[1]];
    host.onMessage(1, { t: "c", i: 5, a: 1, c: 0, k: 3, s: 1 });
    expect(host.table.color).toBe(3);
    expect(host.table.discard[host.table.discard.length - 1]).toBe(53);
  });
});

describe("red: estado y desconexiones", () => {
  it("el estado cabe en un mensaje pequeño y trae lo que se dibuja", () => {
    const host = mesa(4);
    const s = snapOf(host);
    const size = JSON.stringify(s).length;
    expect(size).toBeLessThan(400);
    expect(s.hd.length).toBe(4);
    expect(s.hd.every((h) => h.length === 7)).toBeTruthy();
    expect(s.tp).toBeGreaterThanOrEqual(0);
    expect(s.dp).toBe(108 - 4 * 7 - 1);
  });

  it("si se cae un invitado, su silla pasa a un bot", () => {
    const host = mesa(3);
    host.onDisconnect(2);
    const s = snapOf(host);
    expect(s.on[2]).toBe(0);
    expect(s.bo[2]).toBe(1);
    // La mesa no se queda esperando: el asiento juega solo.
    host.table.turn = 2;
    for (let i = 0; i < 60 * 30; i++) host.update(1 / 30);
    expect(host.table.turn !== 2 || host.table.phase !== 0).toBeTruthy();
  });

  it("con cuatro jugadores la reversa cambia el sentido y el turno", () => {
    const host = mesa(4);
    const t = host.table;
    t.turn = 0;
    t.discard = [2]; // un 2 rojo arriba
    t.color = 0;
    t.hands[0] = [11, ...t.hands[0].slice(1)];
    host.onMessage(1, { t: "c", i: 9, a: 0, s: 1 }); // mensaje vacío: no hace nada
    expect(t.play(0, 0, -1)).toBeTruthy();
    expect(t.dir).toBe(-1);
    expect(t.turn).toBe(3);
  });

  it("R reinicia la partida con los mismos asientos", () => {
    const host = mesa(3);
    host.table.score = [120, 0, 0];
    host.table.phase = 2;
    host.key("KeyR");
    expect(host.finished).toBeFalsy();
    expect(host.table.round).toBe(1);
    expect(host.table.score).toEqual([0, 0, 0]);
    expect(host.table.count).toBe(3);
  });
});
