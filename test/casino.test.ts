// Casino de deudas: premios de las máquinas, economía (días que se aguanta) y red.
import { Casino, PH_DAY, PH_OVER, type SeatKind } from "../src/game/casino/floor";
import { CasinoGuest, CasinoHost } from "../src/game/casino/game";
import { COIN, DICE, MACHINES, SLOT, type MachineKind } from "../src/game/casino/config";
import { check, rng, tickClock } from "./lib";

const idle = () => {
  const s = { dx: 0, dy: 0, uses: 0, poll() {}, takeUse: () => s.uses > 0 && s.uses-- > 0 };
  return s;
};

// 1. Valor esperado de cada máquina (lo que devuelve por cada moneda apostada).
{
  const c = new Casino(["local"], idle(), 1);
  for (const kind of [SLOT, COIN, DICE] as MachineKind[]) {
    const bet = MACHINES[kind].bet, n = 200_000;
    let back = 0;
    for (let i = 0; i < n; i++) back += c.play(kind, bet)[1];
    const ev = back / (n * bet);
    check(ev > 1 && ev < 1.3, `${MACHINES[kind].name}: devuelve algo más de lo apostado`, `${ev.toFixed(3)} por moneda`);
  }
}

/** Partida con jugadores prudentes: la máquina más cara cuya apuesta no pase de 1/4 del banco (teletransportados a su zona). */
function prudent(players: number, seed: number): number {
  const ins = Array.from({ length: players }, idle);
  const c = new Casino(["local", ...Array<SeatKind>(players - 1).fill("remote")], ins[0], seed);
  let s = 0;
  while (c.phase !== PH_OVER && c.day < 30) {
    if (c.phase === PH_DAY) {
      const taken = new Set<number>(); // las elegidas en este paso (se ocupan al actualizar)
      let money = c.bank;
      c.gamblers.forEach((g, gi) => {
        if (c.machines.some((m) => m.user === gi)) return;
        const free = c.machines.map((m, i) => i)
          .filter((i) => c.canUse(i) && !taken.has(i) && MACHINES[c.machines[i].kind].bet <= money &&
            (MACHINES[c.machines[i].kind].bet * 4 <= money || c.machines[i].kind === SLOT))
          .sort((a, b) => MACHINES[c.machines[b].kind].bet - MACHINES[c.machines[a].kind].bet);
        if (!free.length) return;
        const m = c.machines[free[0]], sp = MACHINES[m.kind];
        taken.add(free[0]);
        money -= sp.bet;
        g.x = m.x + sp.w / 2; g.y = m.y + sp.h + 4;
        if (gi === 0) ins[0].uses++;
        else c.applyRemote(gi, { t: "c", x: 0, y: 0, u: g.remote.uses + 1, s: ++s });
      });
    }
    c.update(1 / 30);
  }
  return c.day;
}

// 2. Economía: cuántos días se aguanta jugando con cabeza.
for (const players of [1, 4]) {
  const days: number[] = [];
  for (let r = 0; r < 200; r++) days.push(prudent(players, 1000 + r));
  days.sort((a, b) => a - b);
  const med = days[100], lost1 = days.filter((d) => d === 1).length;
  check(med >= 2 && med <= 6, `${players} jugador(es): mediana de días razonable`,
    `mediana ${med}, máx ${days[199]}, pierden el día 1: ${lost1}/200`);
}

// 3. Red: anfitrión + invitado andando y jugando al azar; mensajes cortos y la vista del invitado al día.
{
  const rnd = rng(5);
  const hi = idle();
  const host = new CasinoHost(hi, 1, "host", 9);
  const keys = { dx: 0, dy: 0, n: 0 };
  const guest = new CasinoGuest(1, { poll() {}, get dx() { return keys.dx; }, get dy() { return keys.dy; }, takeUse: () => keys.n > 0 && keys.n-- > 0 });
  let maxMsg = 0, maxSnap = 0;
  for (let f = 0; f < 60 * 200; f++) {
    tickClock(1000 / 60);
    if (rnd() < 0.03) { keys.dx = Math.round(rnd() * 2 - 1); keys.dy = Math.round(rnd() * 2 - 1); }
    if (rnd() < 0.05) keys.n++;
    if (rnd() < 0.03) { hi.dx = Math.round(rnd() * 2 - 1); hi.dy = Math.round(rnd() * 2 - 1); }
    if (rnd() < 0.05) hi.uses++;
    host.update(1 / 60);
    guest.update(1 / 60);
    if (f % 2 === 0) {
      const j = JSON.stringify(host.frame().snap);
      maxSnap = Math.max(maxSnap, j.length);
      guest.onSnap(JSON.parse(j));
    }
    const m = guest.outgoing("p2p");
    if (m) { const j = JSON.stringify(m); maxMsg = Math.max(maxMsg, j.length); host.onMessage(1, JSON.parse(j)); }
  }
  const c = host.casino;
  const played = c.won > 0 || c.bank !== 100 || c.day > 1;
  check(played, "red: se juega", `día ${c.day}, banco ${c.bank}, ganado ${c.won}`);
  check(maxMsg <= 300 && maxSnap < 2000, "red: mensajes y estados pequeños", `mensaje ${maxMsg}, estado ${maxSnap} car.`);
  const gs = (guest as unknown as { state: { b: number; d: number } }).state;
  check(gs.b === c.bank && gs.d === c.day, "red: el invitado ve el mismo banco y día", `${gs.b}/${c.bank}`);
}
