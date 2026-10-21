// Billar: la física conserva las reglas básicas, la IA juega partidas completas y las faltas se aplican.
import { Match, type PoolControl } from "../src/game/pool/match";
import { Table, trace } from "../src/game/pool/table";
import { HostSession } from "../src/game/net/host";
import { GuestSession } from "../src/game/net/guest";
import { Keyboard } from "../src/game/core/keyboard";
import { check } from "./lib";

const idle: PoolControl = {
  angle: 0, power: 0.5, top: 0, side: 0, call: -1, cursor: null,
  poll() {}, takeFire: () => false, takePlace: () => false, clearSpin() {},
};

// Saque: las bolas se reparten, ninguna se sale de la mesa y todo acaba parando.
{
  const t = new Table();
  t.shoot(0, 1, 0, 0);
  let steps = 0;
  while (t.moving && steps < 60 * 40) { t.update(1 / 60); steps++; }
  const out = t.balls.filter((b) => b.pocket < 0 && (Math.abs(b.x) > 125 || Math.abs(b.y) > 65));
  check(!t.moving, "billar: el saque acaba parando", `${(steps / 60).toFixed(1)} s`);
  check(out.length === 0, "billar: ninguna bola se sale de la mesa");
  check(t.log.first !== 0, "billar: la blanca toca el triángulo");
}

// Rosca: con la misma potencia, el seguir lleva la blanca más allá del contacto y el retroceder la devuelve.
{
  const run = (top: number) => {
    const t = new Table();
    t.balls.forEach((b, i) => { if (i > 0) { b.pocket = 0; } });
    Object.assign(t.balls[0], { x: -60, y: 0, pocket: -1 });
    Object.assign(t.balls[1], { x: 0, y: 0, pocket: -1 });
    t.shoot(0, 0.55, top, 0);
    // Se mide cuando la bola golpeada ya va lejos (antes de que rebote en la banda y vuelva).
    for (let i = 0; i < 60 * 6 && t.balls[1].x < 100; i++) t.update(1 / 60);
    return t.balls[0].x;
  };
  const stun = run(0), follow = run(1), draw = run(-1);
  check(follow > stun + 3 && draw < stun - 15, "billar: seguir, parada y retroceder (rosca)", `retroceder ${draw.toFixed(0)} · parada ${stun.toFixed(0)} · seguir ${follow.toFixed(0)}`);
}

// Efecto lateral: cambia el ángulo de rebote en banda (a derechas y a izquierdas, en sentidos opuestos).
{
  const run = (side: number) => {
    const t = new Table();
    t.balls.forEach((b, i) => { if (i > 0) b.pocket = 0; });
    Object.assign(t.balls[0], { x: 0, y: 30, pocket: -1 });
    t.shoot(-Math.PI / 2 + 0.25, 0.5, 0, side);
    for (let i = 0; i < 60 * 3; i++) {
      t.update(1 / 60);
      if (t.balls[0].vy > 0) return Math.atan2(t.balls[0].vy, t.balls[0].vx); // justo tras la banda
    }
    return NaN;
  };
  const l = run(-1), c = run(0), r = run(1);
  check(Math.abs(l - c) > 0.04 && Math.abs(r - c) > 0.04 && (l - c) * (r - c) < 0, "billar: el efecto lateral cambia el rebote en banda", `${l.toFixed(2)} / ${c.toFixed(2)} / ${r.toFixed(2)}`);
}

// Línea de tiro: apunta a la bola de delante.
{
  const t = new Table();
  const tr = trace(t.balls, Math.atan2(-t.balls[0].y, 60 - t.balls[0].x));
  check(tr.hit !== 0, "billar: la línea de tiro encuentra una bola", `bola ${tr.hit}`);
}

// Dos CPU juegan partidas completas.
{
  let over = 0, fouls = 0, shots = 0, stuck = 0;
  const games = 25;
  for (let g = 0; g < games; g++) {
    const m = new Match(["ai", "ai"]);
    let last = -1;
    for (let i = 0; i < 60 * 60 * 20 && m.phase !== 2; i++) {
      m.update(1 / 60, idle);
      if (m.shots !== last) { last = m.shots; shots++; }
      if (m.msg.startsWith("Falta")) { fouls++; m.msg = ""; }
    }
    if (m.phase === 2) over++; else stuck++;
  }
  check(stuck === 0, `billar: ${games} partidas de CPU contra CPU terminan`, `terminadas ${over}, sin acabar ${stuck}, tiros ${shots}, faltas ${fouls}`);
}

// Dobles: cuatro asientos, los compañeros se turnan y las partidas terminan.
{
  const m = new Match(["ai", "ai", "ai", "ai"]);
  const seen: number[] = [m.turn];
  let over = 0, stuck = 0;
  for (let g = 0; g < 10; g++) {
    const d = new Match(["ai", "ai", "ai", "ai"]);
    let last = d.turn;
    for (let i = 0; i < 60 * 60 * 20 && d.phase !== 2; i++) {
      d.update(1 / 60, idle);
      if (d.turn !== last) { last = d.turn; if (g === 0) seen.push(last); }
    }
    if (d.phase === 2) over++; else stuck++;
  }
  const mates = seen.filter((s) => s % 2 === 0).some((s) => s === 2);
  check(stuck === 0, "billar 2 contra 2: 10 partidas de CPU terminan", `terminadas ${over}`);
  check(new Set(seen).size === 4 || mates, "billar 2 contra 2: los compañeros se turnan", `turnos ${seen.slice(0, 10).join(",")}`);
}

// Reglas: meter la 8 en el saque rehace el triángulo; falta = bola en mano.
{
  const m = new Match(["local", "local"]);
  m.placing = false;
  m.table.balls[0].x = -60;
  m.table.balls[0].y = 0;
  m.aim.angle = Math.PI; // golpea hacia la banda sin tocar nada
  m.aim.power = 0.3;
  m.fire();
  while (m.phase === 1) m.update(1 / 60, idle);
  check(m.turn === 1 && m.placing && !m.head, "billar: sin tocar bola es falta y el rival coloca la blanca");
}

// Red: el invitado ve la mesa, y su tiro llega al anfitrión (canal directo falso).
{
  const kb = new Keyboard({ addEventListener() {} } as unknown as Window, new Set());
  const signal = { close: async () => ({}) } as never;
  const host = new HostSession(signal, "pool");
  const guest = new GuestSession(signal, kb);
  (guest as any).transport = "p2p";
  const channel = { readyState: "open", bufferedAmount: 0, send: (d: string) => (guest as any).onMessage(d) };
  host.peers = [{ guestId: "g", transport: "p2p", pc: null, channel: channel as any, index: 0, ready: true, connected: true, sentBase: -1, lastSeen: 0 } as any];
  (guest as any).channel = { readyState: "open", send: (d: string) => host.game?.onMessage(1, JSON.parse(d)) };
  host.start(kb);
  const run = (s: number) => { for (let i = 0; i < s * 60; i++) { host.update(1 / 60); guest.update(1 / 60); } };
  run(1);
  const m = (host.game as any).match as Match;
  check(m.kinds[1] === "remote" && guest.game?.id === "pool" && !!guest.game.ready, "billar en red: el invitado entra");
  // Turno del invitado, blanca ya colocada, tiro lanzado desde su lado.
  m.turn = 1; m.placing = false; m.brk = false; m.groups = [-1, -1];
  (m as any).resetAim();
  const g = guest.game as any;
  run(0.3);
  g.controller.angle = 0; g.controller.power = 0.6;
  g.controller.takeFire = (() => { let n = 1; return () => n-- > 0; })();
  g.controller.poll = () => {};
  const shots = m.shots;
  run(0.5);
  check(m.shots === shots + 1, "billar en red: el tiro del invitado llega y se ejecuta", `tiros ${m.shots}`);
}
