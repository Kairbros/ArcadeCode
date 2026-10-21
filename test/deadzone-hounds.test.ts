// Dead Zone: rondas de perros infernales (calendario, composición, aparición, cabeza adelantada y munición máxima
// al caer el último).
import { check } from "./lib";
import * as THREE from "three";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneGuest, DeadZoneHost } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";
import { DOG_ROUND, ROUNDS, RoundManager, dogTotal, isDogRound, roundTotal, tuneFor } from "../src/game/deadzone/game/rounds";
import { ZOMBIES, scaledSpeed } from "../src/game/deadzone/enemies/defs";
import { ZOMBIE_KINDS } from "../src/game/deadzone/enemies/manager";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const priv = (x: unknown) => x as Any;

const fakeKeyboard = () => {
  const kb = { isDown: () => false, anyDown: () => false };
  return kb as unknown as Keyboard;
};

console.log("Calendario de perros");
{
  const rounds = Array.from({ length: 30 }, (_, i) => i + 1).filter(isDogRound);
  check(rounds.join(",") === "5,9,13,17,21,25,29", "rondas de perros: 5, 9, 13…", rounds.join(","));
  check(dogTotal(5) === 6 && dogTotal(9) === 8 && dogTotal(13) === 10, "6 perros y 2 más cada vez", `${dogTotal(5)},${dogTotal(9)},${dogTotal(13)}`);
  check(dogTotal(5, tuneFor(4)) > dogTotal(5, tuneFor(1)), "más perros con más jugadores");
  const rm = new RoundManager();
  const events = rm.start();
  check(!rm.special && events[0].type === "roundStart" && events[0].special === false, "la ronda 1 es normal");
  // Avanza hasta la ronda 5.
  for (let r = 1; r < 5; r++) {
    for (let i = 0; i < 5000 && rm.round === r; i++) for (const e of rm.update(0.05)) if (e.type === "spawn") rm.onZombieDead();
  }
  check(rm.round === 5 && rm.special && rm.total === dogTotal(5), "la ronda 5 es de perros", `ronda ${rm.round} total ${rm.total}`);
  let peak = 0;
  for (let i = 0; i < 4000 && rm.toSpawn > 0; i++) {
    for (const e of rm.update(0.05)) if (e.type === "spawn") peak = Math.max(peak, rm.alive);
  }
  check(peak <= DOG_ROUND.maxAlive, "nunca pasa del máximo de perros vivos", `${peak}`);
  check(ZOMBIES.hound.speed > ZOMBIES.runner.speed && ZOMBIES.hound.hp < ZOMBIES.walker.hp, "el perro es muy rápido y frágil");
  check(scaledSpeed("hound", 9) > ZOMBIES.hound.speed, "y se acelera con la ronda");
  check(ZOMBIE_KINDS.includes("hound") && roundTotal(5) !== dogTotal(5), "viaja por red como un tipo más");
}

console.log("Ronda de perros en la partida");
{
  const host = new DeadZoneHost(new Input(fakeKeyboard()), 1, "host");
  const step = (secs: number, dt = 1 / 30) => {
    for (let t = 0; t < secs; t += dt) host.update(dt);
  };
  // Salta a la ronda 5.
  host.rounds.round = 4;
  host.rounds.toSpawn = 0;
  host.rounds.alive = 0;
  host.rounds.state = "spawning";
  step(0.2); // acaba la 4
  host.rounds.timer = 0.01;
  step(0.5); // empieza la 5
  check(host.rounds.round === 5 && host.rounds.special, "empieza la ronda de perros");
  step(3);
  const kinds = new Set(host.stage.zombies.list.map((z) => z.def.kind));
  check(kinds.size === 1 && kinds.has("hound"), "solo salen perros infernales", [...kinds].join(","));
  const snap = JSON.parse(JSON.stringify(host.frame().snap));
  check(snap.rd[5] === 1, "el estado de red marca la ronda de perros");
  check(snap.zb.every((row: number[]) => ZOMBIE_KINDS[row[1]] === "hound"), "y los perros viajan con su tipo");

  // Cabeza adelantada: un rayo al hocico es cabeza; uno al lomo, cuerpo.
  host.stage.zombies.clear();
  const hd = host.stage.zombies.spawn("hound", 5, 0, 0);
  hd.state = "chasing";
  hd.yaw = 0; // mira a −Z: la cabeza está delante (z < 0)
  hd.position.y = 0;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const head = host.stage.zombies.hitscan(V(0, 0.74, -6), V(0, 0, 1), 20);
  check(head.length === 1 && head[0].head, "un tiro de frente a la cabeza del perro es cabeza");
  const back = host.stage.zombies.hitscan(V(0, 0.6, 6), V(0, 0, -1), 20);
  check(back.length === 1 && !back[0].head, "un tiro por detrás al lomo es cuerpo");

  // Los demás los ven en un invitado.
  const guest = new DeadZoneGuest(1, new Input(fakeKeyboard()));
  guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)));
  guest.update(1 / 30);
  const gz = priv(guest).stage.zombies.list;
  check(gz.length === 1 && gz[0].def.kind === "hound", "el invitado dibuja al perro");
  guest.dispose();

  // El último perro suelta munición máxima.
  host.stage.zombies.clear();
  host.rounds.toSpawn = 0;
  host.rounds.alive = 1;
  host.powers.drops.length = 0;
  const last = host.stage.zombies.spawn("hound", 5, 3, 3);
  last.state = "chasing";
  const died = last.hit(9999, false);
  check(died, "el perro muere de un tiro");
  priv(host).onZombieKilled(0, last.def.points, false, last.position);
  const drop = host.powers.drops[0];
  check(!!drop && drop.kind === "maxAmmo", "el último perro suelta munición máxima", drop?.kind);
  host.dispose();
}
void ROUNDS;
