// Humo del resto de juegos: las rondas terminan, los bots se respetan y el cambio de juego en red funciona.
import { Arena } from "../src/game/balls/arena";
import { Fight } from "../src/game/stick/fight";
import { Race } from "../src/game/karts/race";
import { HostSession } from "../src/game/net/host";
import { GuestSession } from "../src/game/net/guest";
import { Keyboard } from "../src/game/core/keyboard";
import { World } from "../src/game/blocks/world";
import { meshChunk } from "../src/game/blocks/mesher";
import { check } from "./lib";

// Sumo: 4 IA, la ronda siempre acaba con un ganador antes de 2 min.
{
  const idle = { dx: 0, dy: 0, poll() {}, takeDash: () => false };
  let open = 0, noWinner = 0;
  for (let r = 0; r < 60; r++) {
    const a = new Arena(["ai", "ai", "ai", "ai"], idle);
    let steps = 0;
    while (a.phase !== 2 && steps < 60 * 120) { a.update(1 / 60); steps++; }
    if (a.phase !== 2) open++;
    if (!a.slots.some((s) => s.place === 1)) noWinner++;
  }
  check(open === 0 && noWinner === 0, "sumo: 60 rondas de IA terminan con ganador", `sin acabar ${open}, sin ganador ${noWinner}`);
}

// Monigotes: 4 IA en los 3 escenarios, las peleas acaban.
{
  const idle = { dx: 0, down: false, poll() {}, takeJump: () => false, takeAttack: () => false };
  let open = 0;
  for (let r = 0; r < 30; r++) {
    const f = new Fight(["ai", "ai", "ai", "ai"], idle, undefined, true, r % 3);
    while (f.phase !== 2 && f.time < 100) f.update(1 / 60);
    if (f.phase !== 2) open++;
  }
  check(open === 0, "monigotes: 30 peleas de IA terminan", `sin acabar ${open}`);
}

// Bots activados o no.
{
  const idle = { dx: 1, dy: 0, poll() {}, takeDash: () => false };
  check(new Arena(["local"], idle, undefined, true).slots.length === 4, "sumo con bots: 4 bolas");
  check(new Arena(["local"], idle, undefined, false).slots.length === 1, "sumo sin bots: 1 bola");
  check(new Race(1, ["local"], null, true).slots.length === 4, "karts con bots: 4 karts");
  check(new Race(1, ["local", "remote"], null, false).slots.length === 2, "karts sin bots: 2 karts");
}

// Cambio de juego con la sala abierta (canal directo falso).
{
  const kb = new Keyboard({ addEventListener() {} } as unknown as Window, new Set());
  const signal = { close: async () => ({}) } as never;
  const host = new HostSession(signal, "bomber");
  const guest = new GuestSession(signal, kb);
  (guest as any).transport = "p2p";
  const channel = { readyState: "open", bufferedAmount: 0, send: (d: string) => (guest as any).onMessage(d) };
  host.peers = [{ guestId: "g", transport: "p2p", pc: null, channel: channel as any, index: 0, ready: true, connected: true, sentBase: -1, lastSeen: 0 } as any];
  (guest as any).channel = { readyState: "open", send: (d: string) => host.game?.onMessage(1, JSON.parse(d)) };
  host.start(kb);
  const run = (s: number) => { for (let i = 0; i < s * 60; i++) { host.update(1 / 60); guest.update(1 / 60); } };
  run(1);
  check(guest.game?.id === "bomber" && !!guest.game.ready, "red: el invitado entra en bomber");
  for (const id of ["karts", "survival", "deadzone", "casino", "bomber"] as const) {
    host.switchGame(id); run(1);
    check(guest.game?.id === id && !!guest.game.ready, `red: cambio a ${id}`, `${guest.size.join("×")}`);
  }
}

// Malla de bloques: los dos triángulos de cada cara miran al mismo lado y ninguno es degenerado.
{
  const w = new World(12345);
  const { solid } = meshChunk(w, 3, 3);
  const P = solid.positions, I = solid.indices;
  const nrm = (a: number, b: number, c: number) => {
    const ax = P[b * 3] - P[a * 3], ay = P[b * 3 + 1] - P[a * 3 + 1], az = P[b * 3 + 2] - P[a * 3 + 2];
    const bx = P[c * 3] - P[a * 3], by = P[c * 3 + 1] - P[a * 3 + 1], bz = P[c * 3 + 2] - P[a * 3 + 2];
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx].map((v) => Math.sign(Math.round(v * 1000)));
  };
  let bad = 0, flat = 0;
  for (let q = 0; q < I.length; q += 6) {
    const n1 = nrm(I[q], I[q + 1], I[q + 2]), n2 = nrm(I[q + 3], I[q + 4], I[q + 5]);
    if (n1.join() !== n2.join()) bad++;
    if (n1.every((v) => v === 0) || n2.every((v) => v === 0)) flat++;
  }
  check(bad === 0 && flat === 0, "malla de bloques sin triángulos girados ni degenerados", `${I.length / 6} caras`);
}
