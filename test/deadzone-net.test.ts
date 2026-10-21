// Dead Zone en el hub: partida cooperativa sin pantalla (anfitrión), de 1 a 4 jugadores, con un invitado por red simulada.
import { check } from "./lib";
import { createGuestGame, createHostGame, GAMES, isGameId } from "../src/game/hub";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneGuest, DeadZoneHost, type DzMsg } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";
import { POINTS } from "../src/game/deadzone/game/points";
import { tuneFor, roundTotal, ROUNDS } from "../src/game/deadzone/game/rounds";
import { WEAPONS } from "../src/game/deadzone/weapons/defs";
import { PLAYER_SPAWN } from "../src/game/deadzone/world/mapdata";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const priv = (x: unknown) => x as Any;

/** Teclado que la prueba controla a mano. */
const fakeKeyboard = () => {
  const down = new Set<string>();
  const kb = { isDown: (c: string) => down.has(c), anyDown: (cs: readonly string[]) => cs.some((c) => down.has(c)) };
  return { kb: kb as unknown as Keyboard, down };
};

function makeHost(players: number) {
  const { kb, down } = fakeKeyboard();
  const host = new DeadZoneHost(new Input(kb), players - 1, "host");
  const ids = [0, 0, 0, 0];
  /** Mensaje de un invitado: su cuerpo y, si se pide, una acción. */
  const send = (i: number, extra: Partial<DzMsg> = {}, at?: { x?: number; z?: number; yaw?: number; pitch?: number; fl?: number }) => {
    const p = host.seats[i].p;
    host.onMessage(i, {
      t: "z", i: ++ids[i], s: 0, x: at?.x ?? p.position.x, y: p.position.y, z: at?.z ?? p.position.z,
      yaw: at?.yaw ?? p.yaw, pitch: at?.pitch ?? p.pitch, fl: at?.fl ?? 0, rv: host.seats[i].reviveSeq, ...extra,
    });
  };
  const step = (secs: number, dt = 1 / 30) => {
    for (let t = 0; t < secs; t += dt) host.update(dt);
  };
  return { host, send, step, down, ids };
}

// --- 1 · Está en el menú y se crea como host e invitado ---------------------------------------------------
console.log("Menú y creación");
{
  check(isGameId("deadzone") && GAMES.some((g) => g.id === "deadzone"), "Dead Zone aparece en el menú del hub");
  const { kb } = fakeKeyboard();
  const h = createHostGame("deadzone", kb, 2);
  const g = createGuestGame("deadzone", 1, kb);
  check(h instanceof DeadZoneHost && g instanceof DeadZoneGuest && h.size[0] === 320, "el hub crea el anfitrión y el invitado");
  check(typeof h.dispose === "function" && typeof g.dispose === "function", "ambos liberan la GPU al salir");
  (h as unknown as { dispose(): void }).dispose();
  (g as unknown as { dispose(): void }).dispose();
}

// --- 2 · Dificultad según jugadores ------------------------------------------------------------------------
console.log("Rondas y jugadores");
{
  let prev = 0;
  let ok = true;
  for (const n of [1, 2, 3, 4]) {
    const t = tuneFor(n);
    const total = roundTotal(1, t);
    ok &&= total > prev;
    prev = total;
  }
  check(ok, "más jugadores = más zombis en la ronda 1", [1, 2, 3, 4].map((n) => roundTotal(1, tuneFor(n))).join(" < "));
  check(tuneFor(4).maxAliveCap > ROUNDS.maxAliveCap, "y más a la vez");
  for (const n of [1, 2, 3, 4]) {
    const { host } = makeHost(n);
    check(host.online.filter(Boolean).length === n && host.rounds.round === 1 && host.rounds.total === roundTotal(1, tuneFor(n)), `${n} jugador(es): ronda 1 con ${host.rounds.total} infectados`);
    check(host.seats.slice(0, n).every((s) => s.points.balance === POINTS.start && s.p.health === 100), `${n}: todos empiezan con ${POINTS.start} puntos y 100 de vida`);
  }
}

// --- 3 · Disparos de un invitado: los resuelve el anfitrión ------------------------------------------------
console.log("Disparos y puntos");
{
  const { host, send, step } = makeHost(2);
  step(3.5); // empieza a aparecer gente
  const guest = host.seats[1];
  // Un zombi delante del invitado, a 6 m, y el invitado mirando hacia él.
  host.stage.zombies.clear();
  const z = host.stage.zombies.spawn("walker", 1, PLAYER_SPAWN.x, PLAYER_SPAWN.z - 6);
  z.state = "chasing";
  const gx = PLAYER_SPAWN.x;
  const gz = PLAYER_SPAWN.z;
  send(1, {}, { x: gx, z: gz, yaw: 0, pitch: -0.14 });
  const mag0 = guest.weapons.currentAmmo.mag;
  const pts0 = guest.points.balance;
  const hp0 = z.hp;
  send(1, { ca: 1 }, { x: gx, z: gz, yaw: 0, pitch: -0.14, fl: 8 });
  step(0.1);
  check(guest.weapons.currentAmmo.mag === mag0 - 1, "el disparo gasta munición del invitado en el anfitrión");
  check(guest.fireSeq === 1, "se registra el disparo (los demás ven el fogonazo)");
  check(z.hp < hp0 || (z.state as string) === "dying", "el anfitrión resuelve el impacto contra el zombi");
  check(guest.points.balance > pts0, "el invitado cobra sus puntos", `${pts0} → ${guest.points.balance}`);
  check(host.seats[0].points.balance === POINTS.start, "los puntos del anfitrión no cambian");
  // Munición agotada: no se dispara más y nunca baja de cero.
  guest.weapons.ammo.pistol.mag = 0;
  guest.weapons.ammo.pistol.reserve = 0;
  step(0.5);
  send(1, { ca: 1 }, { fl: 8 });
  step(0.2);
  check(guest.weapons.currentAmmo.mag === 0, "sin munición no hay disparo y no queda en negativo");
  // Un mensaje repetido (mismo número de acción) no dispara dos veces.
  const g2 = makeHost(2);
  g2.step(0.5);
  g2.send(1, { ca: 1 }, { fl: 8 });
  const msg = { t: "z", i: g2.ids[1], s: 0, x: 0, y: 0, z: 14, yaw: 0, pitch: 0, fl: 8, rv: g2.host.seats[1].reviveSeq, ca: 1 } satisfies DzMsg;
  g2.step(0.05);
  const before = g2.host.seats[1].fireSeq;
  g2.host.onMessage(1, msg);
  g2.host.onMessage(1, msg);
  g2.step(0.5);
  check(g2.host.seats[1].fireSeq === before, "el reenvío del mismo mensaje no dispara otra vez");
}

// --- 4 · Compras de cada jugador ---------------------------------------------------------------------------
console.log("Compras");
{
  const { host, send, step } = makeHost(2);
  // Una compra de pared de un arma que nadie tiene al empezar.
  const buy = host.stage.map.buys.find((b) => WEAPONS[b.spec.weaponId as keyof typeof WEAPONS].price > 0)!;
  const def = WEAPONS[buy.spec.weaponId as keyof typeof WEAPONS];
  // El invitado se pone frente a la compra de pared y pulsa E.
  const nx = buy.normal.x;
  const nz = buy.normal.z;
  const px = buy.position.x + nx * 1.4;
  const pz = buy.position.z + nz * 1.4;
  const yaw = Math.atan2(nx, nz);
  host.seats[1].points.add(5000);
  send(1, {}, { x: px, z: pz, yaw, pitch: 0 });
  step(0.1);
  const before = host.seats[1].points.balance;
  const hadSlots = host.seats[1].weapons.slots.filter(Boolean).length;
  send(1, { ca: 3 }, { x: px, z: pz, yaw, pitch: 0 });
  step(0.1);
  const after = host.seats[1].points.balance;
  const price = def.price > 0 ? def.price : def.ammoPrice;
  check(host.seats[1].weapons.has(def.id) && host.seats[1].weapons.slots.filter(Boolean).length >= hadSlots, `compra ${def.name} para el invitado`);
  check(before - after === price, `se cobra el precio real (${price}), no lo que diga el cliente`, `${before} → ${after}`);
  check(!host.seats[0].weapons.has(def.id), "el anfitrión no recibe el arma del invitado");
  // Sin puntos no hay compra.
  host.seats[1].points.reset(0);
  const pre = host.seats[1].points.balance;
  send(1, { ca: 3 }, { x: px, z: pz, yaw, pitch: 0 });
  step(0.1);
  check(host.seats[1].points.balance === pre && pre === 0, "sin puntos la compra se niega y el saldo no baja de cero");
}

// --- 5 · Daño, caída, reaparición y fin de partida ---------------------------------------------------------
console.log("Vida y fin de partida");
{
  const { host, send, step } = makeHost(2);
  step(0.1);
  const s1 = host.seats[1];
  // Un zombi pegado al invitado le hace daño; el otro jugador no se entera.
  send(1, {}, { x: 0, z: 14 });
  host.stage.zombies.clear();
  const z = host.stage.zombies.spawn("brute", 1, 0, 13.2);
  z.state = "chasing";
  step(4);
  check(s1.p.health < 100, "un zombi pegado al invitado le quita vida", `${s1.p.health}`);
  check(host.seats[0].p.health === 100, "el anfitrión no pierde vida por el golpe al invitado");
  host.stage.zombies.clear();
  // Cae el invitado: la partida sigue mientras el anfitrión viva.
  s1.p.health = 0;
  step(0.2);
  check(!host.over, "con uno caído y otro en pie la partida sigue");
  const rv = s1.reviveSeq;
  // Fin de ronda: reaparece.
  host.rounds.toSpawn = 0;
  host.rounds.alive = 0;
  host.rounds.state = "spawning";
  step(0.2);
  check(s1.p.alive && s1.reviveSeq === rv + 1, "al acabar la ronda el caído reaparece");
  // Caen los dos: fin de la partida.
  host.seats[0].p.health = 0;
  s1.p.health = 0;
  step(0.2);
  check(host.over && host.finished, "caen todos: fin de la partida");
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check(Array.isArray(snap.ov) && snap.ov[2] >= 0, "el estado manda las cifras finales");
  host.key("KeyR");
  check(!host.over && host.seats[0].p.alive && host.seats[0].points.balance === POINTS.start && host.rounds.round === 1, "R reinicia la partida");
}

// --- 6 · Invitado por red: estado, avisos y mensajes -------------------------------------------------------
console.log("Invitado (red simulada)");
{
  const { host, step, send } = makeHost(2);
  const { kb } = fakeKeyboard();
  const gin = new Input(kb);
  const guest = new DeadZoneGuest(1, gin);
  const feed = () => guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  step(4);
  feed();
  check(guest.ready, "el invitado recibe el primer estado");
  const gp = priv(guest);
  guest.update(1 / 30);
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check(snap.pl.length === 4 && snap.pt[0] === POINTS.start && Array.isArray(snap.zb) && snap.dr.length === host.stage.map.doors.length && snap.wn.length === host.stage.map.windows.length, "el estado trae jugadores, puntos, zombis, puertas y ventanas");
  // Zombis del anfitrión → copias en el invitado.
  host.stage.zombies.clear();
  host.stage.zombies.spawn("walker", 1, 2, 2);
  host.stage.zombies.spawn("runner", 1, -3, 4);
  step(0.1);
  feed();
  guest.update(1 / 30);
  const guestZ = gp.stage.zombies.list;
  check(guestZ.length === 2 && guestZ.some((q: Any) => q.def.kind === "runner"), "el invitado dibuja los zombis del anfitrión (mismos tipos)");
  host.stage.zombies.clear();
  step(0.1);
  feed();
  guest.update(1 / 30);
  check(gp.stage.zombies.list.length === 0, "los zombis que desaparecen se quitan en el invitado");
  // Una puerta abierta por el anfitrión se abre en el invitado (y deja de bloquear).
  const door = host.stage.map.doors[0];
  door.open = true;
  door.collider.enabled = false;
  step(0.1);
  feed();
  guest.update(1 / 30);
  const gd = gp.stage.map.doors[0];
  check(gd.open && !gd.collider.enabled, "las puertas abiertas se sincronizan");
  // Mensajes del invitado: latido con su cuerpo y acción al pulsar.
  const out = guest.outgoing("p2p") as DzMsg | undefined;
  check(!!out && out.t === "z" && typeof out.x === "number" && out.rv === host.seats[1].reviveSeq, "manda su posición y la reaparición que conoce");
  // Avisos: un aviso del anfitrión para el invitado llega una sola vez.
  host.seats[1].points.reset(0);
  const buy = host.stage.map.buys[0];
  const px = buy.position.x + buy.normal.x * 1.4;
  const pz = buy.position.z + buy.normal.z * 1.4;
  const yaw = Math.atan2(buy.normal.x, buy.normal.z);
  send(1, {}, { x: px, z: pz, yaw });
  step(0.1);
  send(1, { ca: 3 }, { x: px, z: pz, yaw });
  step(0.1);
  feed();
  guest.update(1 / 30);
  check(String(gp.fb.toasts.at(-1)?.text ?? "").includes("FALTAN"), "el invitado ve el aviso «FALTAN PUNTOS»", gp.fb.toasts.at(-1)?.text);
  const n = gp.fb.toasts.length;
  feed();
  guest.update(1 / 30);
  check(gp.fb.toasts.length === n, "el mismo aviso no se repite");
  guest.dispose();
  host.dispose();
}
