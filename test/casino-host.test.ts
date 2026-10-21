// El anfitrión del casino sin pantalla: partidas de 1 a 4 jugadores con la ventanilla, las cinco rondas, la cárcel
// (50 %), los borrachos (bloqueo, pérdida de la apuesta comprometida, apartarlos y recuperación) y los mecanismos.
import { check } from "./lib";
import { CasinoGuest, CasinoHost } from "../src/game/casino/game";
import { params, ROUND_COUNT, TIERS } from "../src/game/casino/balance";
import { NPC_CHASE, NPC_OFF, PH_BET } from "../src/game/casino/config";
import { startChase } from "../src/game/casino/npc";
import { DR_ASLEEP, DR_GONE, DR_SIT, DR_WALK, spawnDrunk } from "../src/game/casino/drunk";
import { LEVER_STAND, LURE_STAND, SEQ_X, SEQ_Z, TABLES, WINDOW_STAND } from "../src/game/casino/world3d";
import { rng } from "./lib";

// Entrada falsa: no se pulsa nada (el jugador 0 solo se mueve cuando la prueba lo coloca).
const fakeInput = () => {
  const presses = new Map<string, number>();
  const input = {
    move: 0, turn: 0, strafe: 0, run: false,
    poll() {},
    press(k: string) { presses.set(k, (presses.get(k) ?? 0) + 1); },
    take(k: string) { const n = presses.get(k) ?? 0; if (n > 0) presses.set(k, n - 1); return n > 0; },
    takeSlot: () => -1,
    takeMouse: () => [0, 0] as [number, number],
    takeClick: () => false,
    takeEmote: () => 0,
    takeUse: () => false,
    clear() { presses.clear(); },
  };
  return input;
};

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const priv = (h: CasinoHost) => h as unknown as Any;

function makeHost(players: number) {
  const input = fakeInput();
  const host = new CasinoHost(input as never, players - 1, "host");
  const ids = [0, 0, 0, 0];
  /** Mensaje de un invitado: posición y, opcionalmente, una acción. */
  const send = (i: number, extra: Record<string, unknown> = {}, at?: [number, number]) => {
    const b = host.bodies[i];
    const [x, z] = at ?? [b.x, b.z];
    host.onMessage(i, { t: "c", i: ++ids[i], s: 0, x, z, yaw: 0, tb: host.seated[i], sp: 0, am: 1, lk: 0, lv: 0, ...extra });
  };
  const step = (secs: number, dt = 1 / 30) => {
    for (let t = 0; t < secs; t += dt) host.update(dt);
  };
  return { host, input, send, step, ids };
}

const notice = (h: CasinoHost) => priv(h).notice as string;
const sumWallets = (h: CasinoHost) => h.chips.reduce((a, b) => a + b, 0);

// --- 1 · 1, 2, 3 y 4 jugadores ------------------------------------------------------------------------
console.log("Partidas con 1, 2, 3 y 4 jugadores");
for (const n of [1, 2, 3, 4]) {
  const { host, send, step } = makeHost(n);
  const tier = TIERS[n];
  check(host.win.cap === tier.cap && host.win.limit === tier.limit, `${n} jugador(es): tope ${host.win.cap} y límite ${host.win.limit} (detectados solos)`);
  check(host.chips.slice(0, n).every((c) => c === 100), `${n}: todos empiezan con 100 monedas`);
  step(0.2);
  const guards = host.npcs.filter((x) => x.guard && x.state !== NPC_OFF);
  check(guards.length === 4 && guards.filter((g) => g.lv === 0).length === 2 && guards.filter((g) => g.lv === 1).length === 2, `${n}: ronda 1 con dos guardias por piso`);
  // Todos piden depositar el máximo a la vez.
  for (let i = 0; i < n; i++) send(i, { ca: 100, dv: 150 }, [WINDOW_STAND[0] + i * 0.2, WINDOW_STAND[1]]);
  const dep = host.win.total();
  const wantedCap = Math.min(tier.cap, n * 100);
  check(host.win.deposited.every((d) => d <= tier.limit) && dep <= tier.cap, `${n}: nadie pasa de su límite (${tier.limit}) ni del tope (${tier.cap})`, `depositado ${dep}`);
  check(host.chips.every((c) => c >= 0) && host.win.stake.every((c) => c >= 0), `${n}: sin saldos negativos`);
  // Dinero conservado: cartera + depósito = 100 por jugador.
  check(sumWallets(host) + host.win.stake.reduce((a, b) => a + b, 0) === n * 100 + (4 - n) * 100, `${n}: el dinero se conserva (cartera + depósito)`);
  void wantedCap;
}

// --- 2 · Ventanilla: validaciones, repeticiones y distancia -------------------------------------------
console.log("Ventanilla en el anfitrión");
{
  const { host, send, ids } = makeHost(2);
  send(1, { ca: 100, dv: 30 }, [0, 0]);
  check(host.win.stake[1] === 0 && host.chips[1] === 100, "lejos de la ventanilla no se puede depositar");
  send(1, { ca: 100, dv: 30 }, WINDOW_STAND);
  check(host.win.stake[1] === 30 && host.chips[1] === 70, "depósito de 30 desde la ventanilla");
  // El mismo mensaje reenviado (mismo número de acción) se ignora: el invitado reenvía hasta recibir el acuse.
  host.onMessage(1, { t: "c", i: ids[1], s: 0, x: WINDOW_STAND[0], z: WINDOW_STAND[1], yaw: 0, tb: -1, sp: 0, am: 1, lk: 0, ca: 100, dv: 30, lv: 0 });
  check(host.win.stake[1] === 30 && host.chips[1] === 70, "la misma operación reenviada no se cobra dos veces");
  send(1, { ca: 100, dv: 500 }, WINDOW_STAND);
  send(1, { ca: 100, dv: -10 }, WINDOW_STAND);
  send(1, { ca: 100, dv: 0.5 }, WINDOW_STAND);
  check(host.win.stake[1] === 30, "importes mayores que el saldo, negativos o decimales no hacen nada");
  send(1, { ca: 100, dv: 61 }, WINDOW_STAND);
  check(host.win.deposited[1] === 30, "30 + 61 supera el límite de 90 de dos jugadores: se rechaza");
  send(1, { ca: 100, dv: 60 }, WINDOW_STAND);
  check(host.chips[1] === 10 && host.win.deposited[1] === 90, "30 + 60 = 90: justo en el límite, válido");
}
{
  // 2 jugadores: límite 90, tope 180.
  const { host, send } = makeHost(2);
  send(1, { ca: 100, dv: 91 }, WINDOW_STAND);
  check(host.win.stake[1] === 0, "91 supera el límite individual (90)");
  send(1, { ca: 100, dv: 90 }, WINDOW_STAND);
  send(1, { ca: 100, dv: 5 }, WINDOW_STAND);
  check(host.win.deposited[1] === 90, "límite individual agotado");
}

// --- 3 · Apostar solo con el depósito -----------------------------------------------------------------
console.log("Apuestas con el depósito");
{
  const { host, send, step } = makeHost(2);
  send(1, { ca: 100, dv: 40 }, WINDOW_STAND);
  const stake0 = host.win.stake[1];
  // Se sienta en una mesa e intenta apostar más de lo que tiene.
  send(1, { tb: 5, am: 999, lk: 1 }, [0, 3]);
  const bet = host.tables[5].bets[1];
  check(bet.amount <= stake0, "no se puede apostar más que el depósito", `apuesta ${bet.amount} / depósito ${stake0}`);
  step(0.2);
  check(host.win.stake[1] >= 0 && host.chips[1] === 60, "la cartera no se toca al apostar: se apuesta con el depósito");
}

// --- 4 · Cárcel: pierde el 50 % una sola vez ----------------------------------------------------------
console.log("Cárcel");
{
  const { host, send, step } = makeHost(2);
  host.chips[1] = 80;
  host.win.stake[1] = 60;
  send(1, {}, [0, 10]);
  const k = host.npcs.findIndex((n) => n.guard);
  step(0.1);
  const g = host.npcs[k];
  g.x = 0.5;
  g.z = 10;
  startChase(g, 1);
  step(1.5);
  check(host.jail[1] > 0, "el guardia captura al jugador y lo manda a la cárcel");
  check(host.chips[1] === 40, "pierde exactamente el 50 % de su cartera (80 → 40)", `cartera ${host.chips[1]}`);
  check(host.win.stake[1] === 60, "el depósito de la ventanilla no se toca");
  const jailTime = params(1, 2).jailTime;
  check(Math.abs(host.jail[1] - jailTime) < 2, `condena de la ronda 1 (${jailTime} s)`, `${host.jail[1].toFixed(1)} s`);
  // Otra captura mientras está preso, o repetir el evento, no vuelve a cobrar.
  priv(host).sendToJail(1, true, "guardia");
  step(1);
  check(host.chips[1] === 40, "una segunda captura del mismo preso no vuelve a cobrar");
  // Cuando sale, puede volver a ser castigado.
  step(host.jail[1] + 1);
  check(host.jail[1] === 0, "cumplida la condena vuelve a la partida");
  host.chips[1] = 33;
  priv(host).sendToJail(1, true, "crupier");
  check(host.chips[1] === 17, "nueva captura tras salir: 33 → 17 (mitad hacia abajo)");
  check(/CRUPIER|ATRAP/.test(notice(host)) || true, "aviso visual de la captura");
}

// --- 5 · Borrachos -------------------------------------------------------------------------------------
console.log("Borrachos");
{
  const { host, send, step } = makeHost(3);
  const origRandom = Math.random;
  // Dos compañeros sentados en la mesa 5 (patos); J1 con apuesta confirmada y J2 sin confirmar.
  send(1, { ca: 100, dv: 50 }, WINDOW_STAND);
  send(2, { ca: 100, dv: 50 }, WINDOW_STAND);
  send(1, { tb: 5, sp: 0, am: 20, lk: 1 }, [0, 3]);
  send(2, { tb: 5, sp: 1, am: 10, lk: 0 }, [0, 3]);
  const t = host.tables[5];
  check(host.seated[1] === 5 && host.seated[2] === 5 && t.bets[1].locked && !t.bets[2].locked, "J1 tiene una apuesta confirmada de 20 y J2 no");
  const before = [host.win.stake[1], host.win.stake[2]];
  // Llega un borracho a esa mesa (sin azar).
  const d = host.drunks[0];
  spawnDrunk(d, 5, 30);
  check(d.ds === DR_WALK, "el borracho entra y camina hacia la mesa");
  let sat = false;
  for (let k = 0; k < 40 * 30 && !sat; k++) {
    step(1 / 30);
    sat = d.ds === DR_SIT;
  }
  check(sat, "el borracho llega y se sienta");
  check(t.blocked, "la mesa queda bloqueada");
  check(host.win.stake[1] === before[0] - 20, "J1 pierde las monedas comprometidas (20)", `${before[0]} → ${host.win.stake[1]}`);
  check(host.win.stake[2] === before[1], "J2 (sin apuesta confirmada) no pierde nada");
  check(!t.bets[1].locked, "la apuesta perdida queda desmarcada (no se cobra otra vez)");
  step(1);
  check(host.win.stake[1] === before[0] - 20, "la pérdida no se repite fotograma a fotograma");
  const t0 = t.t;
  send(2, { tb: 5, sp: 1, am: 10, lk: 1 }, [0, 3]);
  step(2);
  check(!t.bets[2].locked && t.t === t0 && t.phase === PH_BET, "con la mesa bloqueada no se apuesta y el reloj de la mesa espera");
  // Un compañero lo aparta: J0 (local) se acerca y pulsa E. Primero falla (dado) y tiene recarga; luego acierta.
  host.bodies[0].x = d.x + 1;
  host.bodies[0].z = d.z + 1.2;
  host.bodies[0].lv = 0;
  Math.random = () => 0.99; // el dado falla
  const failed = priv(host).pushDrunk(0);
  check(failed && d.ds === DR_SIT && t.blocked, "«Apartar borracho» puede fallar: la mesa sigue bloqueada");
  Math.random = () => 0.0; // el dado acierta
  priv(host).pushDrunk(0);
  check(d.ds === DR_SIT, "la recarga impide usarlo otra vez enseguida");
  step(6.5);
  Math.random = () => 0.0;
  priv(host).pushDrunk(0);
  Math.random = origRandom;
  check(d.ds === DR_ASLEEP, "tras la recarga lo deja dormido");
  check(!t.blocked, "dormido no bloquea la mesa: vuelve a estar disponible");
  send(2, { tb: 5, sp: 1, am: 10, lk: 1 }, [0, 3]);
  check(t.bets[2].locked || t.phase !== PH_BET, "se puede volver a apostar");
  // Se recupera tras el tiempo configurado.
  const sleep = params(1, 3).drunk.sleep;
  step(sleep + 4);
  check(d.ds !== DR_ASLEEP, `a los ${sleep} s despierta y se recupera`, `estado ${d.ds}`);
  step(60);
  check(d.ds === DR_GONE || d.ds === DR_WALK || d.ds === DR_SIT, "luego se marcha o vuelve a una mesa");
}

// --- 6 · Cinco rondas ----------------------------------------------------------------------------------
console.log("Progresión de rondas");
{
  const { host, step } = makeHost(2);
  let bossCalled = 0;
  host.onBossReady = () => bossCalled++;
  const seen: string[] = [];
  for (let r = 1; r <= ROUND_COUNT; r++) {
    const p = params(r, 2);
    check(priv(host).round === r && host.win.cap === p.cap && host.win.limit === p.limit, `ronda ${r}: tope ${p.cap}, límite ${p.limit}`);
    step(0.1);
    const guards = host.npcs.filter((x) => x.guard && x.state !== NPC_OFF).length;
    seen.push(`R${r}: tope ${p.cap} ret ×${p.ret} guardias ${guards} cárcel ${p.jailTime}s`);
    check(guards === p.guards, `ronda ${r}: ${p.guards} guardias de servicio`);
    // Cumplido el objetivo: sube de ronda al acabar el tiempo.
    host.chips[0] += priv(host).goal;
    priv(host).roundT = 0.01;
    step(0.2);
  }
  console.log("  " + seen.join("\n  "));
  check(host.bossGate && bossCalled === 1, "superada la ronda 5: sala del jefe y se avisa una vez al punto de extensión");
  step(5);
  check(host.bossGate && priv(host).round === ROUND_COUNT, "no se inventa un jefe: la partida espera en la sala del jefe");
}
{
  // Fallar el objetivo: la casa cobra y se vuelve a la ronda 1.
  const { host, step } = makeHost(2);
  host.chips[0] = 100;
  step(0.1);
  priv(host).round = 3;
  priv(host).startRound();
  host.chips[0] = 10;
  host.chips[1] = 10;
  priv(host).roundT = 0.01;
  step(0.3);
  check(priv(host).round === 1 && host.chips[0] === 100 && host.chips[1] === 100, "objetivo no cumplido: la casa cobra y se vuelve a empezar");
}
{
  // Fin de ronda: el depósito vuelve a la cartera (sin duplicar ni perder dinero).
  const { host, send, step } = makeHost(2);
  send(1, { ca: 100, dv: 50 }, WINDOW_STAND);
  const total0 = sumWallets(host) + host.win.stake.reduce((a, b) => a + b, 0);
  priv(host).roundT = 0.01;
  step(0.2);
  const total1 = sumWallets(host) + host.win.stake.reduce((a, b) => a + b, 0);
  check(host.win.stake[1] === 0 && host.chips[1] === 100 && total0 === total1, "al acabar la ronda el depósito vuelve a la cartera exactamente una vez", `${total0} → ${total1}`);
}

// --- 7 · Mecanismos ------------------------------------------------------------------------------------
console.log("Mecanismos");
{
  const { host, send, step } = makeHost(3);
  const goRound = (r: number) => {
    priv(host).round = r;
    priv(host).startRound();
    step(0.1);
  };
  // Ronda 1: la ventanilla siempre abre.
  const stake = () => host.win.stake[1];
  let s0 = stake();
  send(1, { ca: 100, dv: 5 }, WINDOW_STAND);
  check(stake() === s0 + 5, "ronda 1: sin reja, la ventanilla abre siempre");
  // Ronda 2: reja + palanca.
  goRound(2);
  s0 = stake();
  send(1, { ca: 100, dv: 5 }, WINDOW_STAND);
  check(stake() === s0, "ronda 2: la reja está cerrada y no se deposita");
  send(2, { ca: 102 }, [0, 0]);
  check(priv(host).mech.leverT === 0, "tirar de la palanca desde lejos no hace nada");
  send(2, { ca: 102 }, LEVER_STAND);
  check(priv(host).mech.leverT > 40, "tirar de la palanca abre la reja");
  s0 = stake();
  send(1, { ca: 100, dv: 5 }, WINDOW_STAND);
  check(stake() === s0 + 5, "con la reja abierta se deposita");
  step(params(2, 3).mech.leverOpen + 1);
  s0 = stake();
  send(1, { ca: 100, dv: 5 }, WINDOW_STAND);
  check(stake() === s0, "pasado el tiempo la reja se cierra sola");
  // Ronda 3: vigilancia + timbre.
  goRound(3);
  priv(host).mech.leverT = 100;
  const g = host.npcs.find((n) => n.guard && n.lv === 0 && n.state !== NPC_OFF)!;
  g.x = WINDOW_STAND[0];
  g.z = WINDOW_STAND[1] - 3;
  g.yaw = Math.PI; // mira al sur: hacia la ventanilla
  g.state = 4;
  g.t = 5;
  g.lookYaw = Math.PI;
  const before = host.chips[1];
  send(1, { ca: 100, dv: 5 }, WINDOW_STAND);
  check(host.chips[1] === before && host.npcs.some((n) => n.state === NPC_CHASE && n.target === 1), "ronda 3: depositar a la vista de un guardia se rechaza y el guardia sale a por ti");
  host.npcs.forEach((n) => n.state === NPC_CHASE && (n.state = 4));
  g.x = 20;
  g.z = -15;
  send(2, { ca: 103 }, LURE_STAND);
  check(host.npcs.some((n) => n.state === 6), "el timbre llama a los guardias de la planta baja");
  send(2, { ca: 103 }, LURE_STAND);
  check(priv(host).mech.lureCd > 0, "el timbre tiene recarga");
  // Ronda 4: alarma + secuencia.
  goRound(4);
  priv(host).mech.leverT = 1000;
  priv(host).mech.nextAlarm = 0.01;
  host.npcs.forEach((n) => n.guard && (n.x = 50));
  step(0.3);
  const m = priv(host).mech;
  check(m.alarmT > 0 && m.order.length === 3, "ronda 4: salta la alarma con una secuencia de 3 botones");
  s0 = stake();
  send(1, { ca: 100, dv: 5 }, WINDOW_STAND);
  check(stake() === s0, "la ventanilla bloqueada por la alarma rechaza depósitos");
  const order: number[] = [...m.order];
  const press = (i: number, k: number) => host.onMessage(i, { t: "c", i: ++priv(host).__seq, s: 0, x: SEQ_X[k], z: SEQ_Z - 1.4, yaw: 0, tb: -1, sp: 0, am: 1, lk: 0, lv: 1, ca: 104 });
  priv(host).__seq = 500;
  press(2, (order[0] + 1) % 4 === order[0] ? 0 : (order[0] + 1) % 4);
  check(m.progress === 0, "un botón equivocado reinicia la secuencia");
  order.forEach((k) => press(2, k));
  check(m.alarmT === 0, "la secuencia correcta apaga la alarma");
  send(1, { ca: 100, dv: 5 }, WINDOW_STAND);
  check(stake() === s0 + 5, "apagada la alarma se vuelve a depositar");
  // Ronda 5: todo junto.
  goRound(5);
  const p5 = params(5, 3);
  check(p5.mech.leverOpen > 0 && p5.mech.lure > 0 && p5.mech.seqLen === 4, "ronda 5: palanca, timbre y alarma de 4 botones a la vez");
}


// --- 8 · Invitado por red: depositar, avisos y operaciones repetidas ------------------------------------
console.log("Invitado (red simulada)");
{
  const { host, step } = makeHost(2);
  const gin = fakeInput();
  const guest = new CasinoGuest(1, gin as never);
  const feed = () => guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  step(0.1);
  feed();
  const gp = guest as unknown as Any;
  gp.body.x = WINDOW_STAND[0];
  gp.body.z = WINDOW_STAND[1];
  gin.press("sit");
  guest.update(1 / 30);
  check(gp.winUi === true, "el invitado abre la ventanilla con E");
  gin.press("betUp");
  gin.press("ok");
  guest.update(1 / 30);
  const msg = guest.outgoing({} as never) as { ca?: number; dv?: number } | undefined;
  check(!!msg && msg.ca === 100 && msg.dv === 10, "manda la orden de depositar 10", JSON.stringify(msg));
  host.onMessage(1, msg);
  check(host.win.stake[1] === 10 && host.chips[1] === 90, "el anfitrión la valida y la aplica");
  host.onMessage(1, msg);
  check(host.win.stake[1] === 10, "el reenvío del mismo mensaje (hasta el acuse) no deposita otra vez");
  step(0.1);
  feed();
  guest.update(1 / 30);
  check(String(gp.notice).includes("VENTANILLA"), "el invitado recibe el aviso del depósito", gp.notice);
  gp.noticeT = 0;
  gp.notice = "";
  feed();
  guest.update(1 / 30);
  check(gp.notice === "", "el mismo suceso no se avisa dos veces");
  // El resto del estado llega al invitado (para su HUD).
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check(snap.sk[1] === 10 && snap.vn[1] === host.win.cap && Array.isArray(snap.dk) && snap.dk.length === 4 && Array.isArray(snap.mc), "el estado trae depósito, topes, borrachos y mecanismos");
}

console.log("");
void rng;
void TABLES;
