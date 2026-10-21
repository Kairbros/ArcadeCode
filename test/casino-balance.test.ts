// Economía del casino: balance por jugadores y rondas, ventanilla, mesas con depósito, borrachos y mecanismos.
import { check, rng } from "./lib";
import {
  clamp, DEPOSIT_STEPS, goalFor, jailLoss, JAIL_PENALTY, LIMITS, params, ROUND_COUNT, ROUNDS, START_COINS, TIERS,
} from "../src/game/casino/balance";
import { Ventanilla, WIN_BLOCKED, WIN_CLOSED, WIN_OPEN } from "../src/game/casino/ventanilla";
import { GAMES_LIST, Table } from "../src/game/casino/table";
import { PH_BET } from "../src/game/casino/config";

const reason = (r: { ok: boolean; reason?: string }) => (r.ok ? "" : r.reason);

// --- 1 · Tabla de referencia de la ronda 1 -----------------------------------------------------------
console.log("Economía por número de jugadores (ronda 1)");
for (const n of [1, 2, 3, 4]) {
  const p = params(1, n);
  check(p.cap === TIERS[n].cap && p.limit === TIERS[n].limit, `${n} jugador(es): tope ${p.cap}, límite ${p.limit}`);
  check(p.limit === p.cap / 2, `${n}: el límite individual es la mitad del tope`);
}
check(START_COINS === 100, "todos empiezan con 100 monedas");

// --- 2 · Progresión de las cinco rondas --------------------------------------------------------------
console.log("Progresión entre rondas");
for (const n of [1, 2, 3, 4]) {
  const ps = Array.from({ length: ROUND_COUNT }, (_, k) => params(k + 1, n));
  check(ps.every((p, k) => k === 0 || p.cap > ps[k - 1].cap), `${n}: el tope sube en cada ronda`, ps.map((p) => p.cap).join(" < "));
  check(ps.every((p, k) => k === 0 || p.ret < ps[k - 1].ret), `${n}: el retorno baja en cada ronda`, ps.map((p) => p.ret).join(" > "));
  check(ps.every((p, k) => k === 0 || (p.guardBoost >= ps[k - 1].guardBoost && p.jailTime >= ps[k - 1].jailTime)), `${n}: guardias y cárcel no bajan`);
  check(ps.every((p, k) => k === 0 || p.drunk.chance >= ps[k - 1].drunk.chance), `${n}: los borrachos no disminuyen`);
}
check(params(1, 1).guards === 4 && params(1, 4).guards === 4, "ronda 1: dos guardias por piso (4 en total) con cualquier número de jugadores");
const mechRounds = ROUNDS.map((r) => [r.mech.leverOpen > 0, r.mech.lure > 0, r.mech.seqLen > 0]);
check(!mechRounds[0].some(Boolean), "ronda 1 sin mecanismos");
check(mechRounds[1][0] && !mechRounds[1][1] && !mechRounds[1][2], "ronda 2 estrena la palanca");
check(mechRounds[2][1] && !mechRounds[2][2], "ronda 3 estrena el timbre");
check(mechRounds[3][2] && mechRounds[4].every(Boolean), "ronda 4 estrena la alarma; la 5 los junta todos");
check(params(5, 4).ret >= LIMITS.ret[0] && params(5, 4).cap <= LIMITS.cap[1], "las fórmulas respetan sus cotas");
check(clamp(999, LIMITS.cap) === LIMITS.cap[1] && clamp(-5, LIMITS.cap) === LIMITS.cap[0], "clamp aplica mínimo y máximo");
check(params(3, 4).drunk.chance > params(3, 1).drunk.chance, "más jugadores = más borrachos");
check(params(2, 4).guards > params(2, 1).guards, "más jugadores = más guardias desde la ronda 2");

// --- 3 · Ventanilla ----------------------------------------------------------------------------------
console.log("Ventanilla");
{
  const v = new Ventanilla();
  const p = params(1, 4);
  v.open(p.cap, p.limit);
  const w = [100, 100, 100, 100];
  check(reason(v.deposit(0, 200, w, WIN_OPEN)) === "saldo", "no se puede depositar más que el saldo");
  w[0] = 500;
  check(reason(v.deposit(0, 151, w, WIN_OPEN)) === "limite", "no se puede superar el límite individual (150)");
  check(v.deposit(0, 150, w, WIN_OPEN).ok && w[0] === 350 && v.stake[0] === 150, "depósito válido: se descuenta de la cartera");
  check(reason(v.deposit(0, 1, w, WIN_OPEN)) === "limite", "límite individual agotado");
  w[1] = 500;
  check(v.deposit(1, 150, w, WIN_OPEN).ok, "el segundo jugador llega al tope global (300)");
  check(v.total() === v.cap, "tope global alcanzado");
  w[2] = 100;
  check(reason(v.deposit(2, 1, w, WIN_OPEN)) === "tope" && w[2] === 100 && v.stake[2] === 0, "con el tope lleno nadie más deposita (y no se cobra)");
  check(!v.deposit(3, 0, w, WIN_OPEN).ok && !v.deposit(3, -5, w, WIN_OPEN).ok && !v.deposit(3, 2.5, w, WIN_OPEN).ok && !v.deposit(3, NaN, w, WIN_OPEN).ok, "importes 0, negativos, decimales y NaN rechazados");
  check(w.every((x) => x >= 0), "ningún saldo negativo");
  // Cerrada o bloqueada.
  const v2 = new Ventanilla();
  v2.open(300, 150);
  const w2 = [100, 100, 100, 100];
  check(!v2.deposit(0, 10, w2, WIN_CLOSED).ok && !v2.deposit(0, 10, w2, WIN_BLOCKED).ok && w2[0] === 100, "cerrada/bloqueada: no se deposita");
  check(!v2.deposit(0, 10, w2, WIN_OPEN, { watched: true }).ok && !v2.deposit(0, 10, w2, WIN_OPEN, { jailed: true }).ok, "vigilada o preso: no se deposita");
  // Operaciones repetidas.
  check(v2.deposit(0, 10, w2, WIN_OPEN, { op: 1 }).ok, "operación 1 aceptada");
  check(!v2.deposit(0, 10, w2, WIN_OPEN, { op: 1 }).ok && w2[0] === 90, "la misma operación recibida dos veces no se cobra dos veces");
  // Llegadas simultáneas: cuatro jugadores piden el máximo a la vez; la suma nunca pasa del tope.
  const v3 = new Ventanilla();
  const p3 = params(3, 4);
  v3.open(p3.cap, p3.limit);
  const w3 = [1000, 1000, 1000, 1000];
  let ok = 0;
  for (let i = 0; i < 4; i++) if (v3.deposit(i, v3.limit, w3, WIN_OPEN).ok) ok++;
  check(v3.total() <= v3.cap && v3.deposited.every((d) => d <= v3.limit), `4 depósitos simultáneos: tope ${v3.cap}, aceptados ${ok}, total ${v3.total()}`);
  check(w3.every((x, i) => x === 1000 - v3.deposited[i]), "la cartera de cada uno baja exactamente lo depositado");
  check(v3.room(3, 1000) === Math.max(0, Math.min(v3.limit, v3.cap - v3.total())), "room() calcula lo que queda");
  check(v3.pick(DEPOSIT_STEPS.length - 1, 3, 1000) === v3.room(3, 1000), "la opción MAX del selector es lo que queda");
  // Liquidación.
  const before = w3.slice();
  const back = v3.settle(w3);
  check(w3.every((x, i) => x === before[i] + back[i]) && v3.stake.every((s) => s === 0), "fin de ronda: el depósito vuelve a la cartera");
}

// --- 4 · Mesas con depósito, retorno y borrachos -----------------------------------------------------
console.log("Mesas");
{
  const t = new Table("moneda");
  t.sit(0, true);
  const stake = [30, 0, 0, 0];
  t.setAmount(0, 999, stake[0]);
  check(t.bets[0].amount === 30, "no se puede apostar más que el depósito (clamp)");
  t.toggleLock(0, stake[0]);
  check(t.bets[0].locked, "apuesta confirmada");
  // Interrupción: pierde lo comprometido una sola vez.
  const lost = t.interrupt(stake);
  check(lost[0] === 30 && stake[0] === 0 && !t.bets[0].locked && t.blocked, "borracho: pierde la apuesta comprometida (30) y la mesa se bloquea");
  const again = t.interrupt(stake);
  check(again[0] === 0 && stake[0] === 0, "una segunda interrupción no vuelve a cobrar la misma apuesta");
  t.setAmount(0, 5, 100);
  t.toggleLock(0, 100);
  check(!t.bets[0].locked, "mesa bloqueada: no se puede apostar");
  const t0 = t.t;
  t.update(10, stake);
  check(t.t === t0 && t.phase === PH_BET, "mesa bloqueada: el reloj de apuestas se detiene");
  t.release();
  stake[0] = 40;
  t.setAmount(0, 10, stake[0]);
  t.toggleLock(0, stake[0]);
  check(t.bets[0].locked, "mesa liberada: se vuelve a apostar");
  // Monedas sin comprometer no se pierden.
  const t2 = new Table("dados");
  t2.sit(0, true);
  t2.sit(1, true);
  const st2 = [50, 50, 0, 0];
  t2.setAmount(1, 20, st2[1]);
  t2.toggleLock(1, st2[1]);
  const l2 = t2.interrupt(st2);
  check(l2[0] === 0 && st2[0] === 50 && l2[1] === 20 && st2[1] === 30, "solo pierde quien tenía apuesta confirmada; el otro conserva todo");
  // Retorno: la ganancia depende de la ronda.
  const win = (ret: number) => {
    const tb = new Table("moneda");
    tb.sit(0, true);
    const s = [100, 0, 0, 0];
    tb.setAmount(0, 100, 100);
    tb.toggleLock(0, 100);
    const orig = Math.random;
    Math.random = () => 0.1; // cara
    tb.update(0.01, s, undefined, ret);
    Math.random = orig;
    return s[0] - 100;
  };
  check(win(1.4) === 140 && win(1) === 100 && win(0.85) === 85, "ganancia = apuesta real × (premio − 1) × retorno de la ronda", `${win(1.4)}/${win(1)}/${win(0.85)}`);
  // Nunca se pierde más que lo apostado.
  const orig = Math.random;
  Math.random = rng(7);
  let neg = 0;
  for (let k = 0; k < 300; k++) {
    const tb = new Table(GAMES_LIST[k % GAMES_LIST.length]);
    tb.sit(0, true);
    const s = [37, 0, 0, 0];
    tb.setSpot(0, k);
    tb.setAmount(0, 1 + (k % 50), s[0]);
    tb.toggleLock(0, s[0]);
    tb.update(0.1, s, undefined, 1.2);
    if (s[0] < 0) neg++;
  }
  Math.random = orig;
  check(neg === 0, "ninguna apuesta deja el depósito en negativo (300 tiradas)");
}

// --- 5 · Cárcel --------------------------------------------------------------------------------------
console.log("Cárcel");
check(JAIL_PENALTY === 0.5 && jailLoss(100) === 50 && jailLoss(1) === 0 && jailLoss(75) === 37 && jailLoss(0) === 0, "la cárcel quita el 50 % de la cartera (hacia abajo)");

// --- 6 · Calibrado: ¿se puede ganar? -----------------------------------------------------------------
// Simulación: cada jugador deposita lo que puede, apuesta el 40 % de su depósito a la primera casilla de moneda/ruleta
// y los borrachos le quitan alguna apuesta; se cuenta cuántas veces se cumple el objetivo de cada ronda.
console.log("Calibrado de objetivos (simulación, 400 partidas por celda)");
{
  const orig = Math.random;
  // Dos flujos independientes: el de las mesas y el de los sucesos (un solo generador de Park-Miller correlaciona tiradas seguidas).
  const r = rng(777);
  Math.random = rng(12345);
  const TRIALS = 400;
  // Jugada competente: tres de cada seis vueltas se apuesta en la mesa caliente (×2) y el resto en cara/cruz o rojo.
  const BET_FRAC = 0.3;
  const rows: string[] = [];
  const rate: Record<number, number[]> = {};
  for (const n of [1, 2, 3, 4]) {
    const rates: number[] = [];
    const medians: string[] = [];
    for (let rd = 1; rd <= ROUND_COUNT; rd++) {
      const p = params(rd, n);
      let pass = 0;
      const growth: number[] = [];
      for (let trial = 0; trial < TRIALS; trial++) {
        const wallets = Array.from({ length: 4 }, (_, i): number => (i < n ? START_COINS : 0));
        const v = new Ventanilla();
        v.open(p.cap, p.limit);
        const start = wallets.reduce((a, b) => a + b, 0);
        for (let i = 0; i < n; i++) v.deposit(i, v.room(i, wallets[i]), wallets, WIN_OPEN);
        const spins = Math.floor(p.time / 26);
        for (let k = 0; k < spins; k++) {
          for (let i = 0; i < n; i++) {
            if (v.stake[i] < 1) continue;
            const tb = new Table(i % 2 ? "ruleta" : "moneda");
            tb.sit(i, true);
            tb.setSpot(i, 0);
            if (k % 2 === 0) tb.boost = 2;
            tb.setAmount(i, Math.max(1, Math.floor(v.stake[i] * BET_FRAC)), v.stake[i]);
            tb.toggleLock(i, v.stake[i]);
            // El borracho interrumpe según la probabilidad de la ronda (cada ~4 vueltas por jugador).
            if (r() < p.drunk.chance * 0.25) tb.interrupt(v.stake);
            else tb.update(0.1, v.stake, undefined, p.ret);
          }
        }
        // Capturas: cada jugador cae con una probabilidad que crece con los guardias (pierde el 50 % de la cartera).
        for (let i = 0; i < n; i++) if (r() < 0.04 * p.guards) wallets[i] -= jailLoss(wallets[i]);
        v.settle(wallets);
        const total = wallets.reduce((a, b) => a + b, 0);
        growth.push(total / start - 1);
        if (total >= goalFor(p, start)) pass++;
      }
      rates.push(pass / TRIALS);
      growth.sort((a, b) => a - b);
      medians.push([0.25, 0.4, 0.5, 0.6].map((q) => `p${q * 100}:${(growth[Math.floor(TRIALS * q)] * 100).toFixed(0)}%`).join("/"));
    }
    rate[n] = rates;
    rows.push(`  ${n} jugador(es): ${rates.map((x, k) => `R${k + 1} ${(x * 100).toFixed(0)}%`).join("  ")}
     crecimiento (cuantiles): ${medians.join(" ")}`);
  }
  Math.random = orig;
  console.log(rows.join("\n"));
  for (const n of [1, 2, 3, 4]) {
    const rr = rate[n];
    check(rr[0] >= 0.45 && rr[0] <= 0.92, `${n}: la ronda 1 se supera con frecuencia razonable`, `${(rr[0] * 100).toFixed(0)}%`);
    check(rr[4] < rr[0], `${n}: la ronda 5 es más difícil que la 1`, `${(rr[4] * 100).toFixed(0)}% < ${(rr[0] * 100).toFixed(0)}%`);
    check(rr.every((x) => x <= 0.95), `${n}: ninguna ronda es un regalo (≤ 95 %)`);
  }
}
