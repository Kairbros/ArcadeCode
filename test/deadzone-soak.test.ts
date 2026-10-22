// Dead Zone: partida larga con dos «bots» (uno es el anfitrión, el otro un invitado) en cada mapa para cazar errores de bucle:
// valores raros (NaN, fuera del mapa), zombis atascados, rondas que no avanzan, munición negativa y desbordes.
import { check } from "./lib";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneHost, type DzMsg } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";
import { ZOMBIE_KINDS } from "../src/game/deadzone/enemies/manager";
import { MAP_IDS } from "../src/game/deadzone/world/maps";

const kb = { isDown: () => false, anyDown: () => false } as unknown as Keyboard;

function soak(id: (typeof MAP_IDS)[number], sim: number, minRound: number) {
  console.log(`Partida larga con bots · ${id}`);
  const host = new DeadZoneHost(new Input(kb), 1, "host", id);
  const ids = [0, 0, 0, 0];
  const bot = host.seats[1];
  const sp = host.stage.def.playerSpawn;
  const gx = sp.x + 1.5;
  const gz = sp.z;
  const b = host.stage.def.bounds;

  /** El bot apunta al zombi más cercano (o al sur), dispara a ráfagas y recarga. */
  const botThink = () => {
    const eye = bot.p.eyePosition();
    let best: { x: number; z: number; y: number; d: number } | null = null;
    for (const z of host.stage.zombies.list) {
      if (!z.alive || z.state === "spawning") continue;
      const d = Math.hypot(z.position.x - eye.x, z.position.z - eye.z);
      if (!best || d < best.d) best = { x: z.position.x, z: z.position.z, y: z.position.y + 1.1, d };
    }
    let yaw = bot.p.yaw;
    let pitch = 0;
    let fl = 0;
    let ca = 0;
    if (best) {
      yaw = Math.atan2(-(best.x - eye.x), -(best.z - eye.z));
      pitch = Math.atan2(best.y - eye.y, Math.max(0.5, best.d));
      fl = 8;
      ca = 1;
    }
    if (bot.weapons.currentAmmo.mag === 0 && bot.weapons.state === "ready") ca = 2;
    host.onMessage(1, { t: "z", i: ++ids[1], s: 0, x: gx, y: 0, z: gz, yaw, pitch, fl, rv: bot.reviveSeq, ca } as DzMsg);
  };

  let t = 0;
  let maxRound = 0;
  let bad = "";
  let maxAliveSeen = 0;
  let hounds = 0;
  const stuckAt = new Map<number, { x: number; z: number; t: number }>();
  let stuck = 0;
  const dt = 1 / 30;
  for (let k = 0; k < sim / dt && !host.over; k++) {
    t += dt;
    if (k % 4 === 0) botThink();
    host.update(dt);
    maxRound = Math.max(maxRound, host.rounds.round);
    const list = host.stage.zombies.list;
    maxAliveSeen = Math.max(maxAliveSeen, host.stage.zombies.aliveCount);
    for (const z of list) {
      if (z.def.kind === "hound") hounds++;
      if (![z.position.x, z.position.y, z.position.z, z.yaw, z.hp].every(Number.isFinite)) bad ||= `zombi con valores no numéricos (${z.def.kind})`;
      if (z.position.x < b.minX - 1 || z.position.x > b.maxX + 1 || z.position.z > b.maxZ + 1 || z.position.z < b.minZ - 1 || z.position.y < -3) bad ||= `zombi fuera del mapa en ${z.position.x.toFixed(1)},${z.position.z.toFixed(1)}`;
    }
    for (const s of host.seats) {
      if (![s.p.position.x, s.p.position.y, s.p.position.z, s.p.health].every(Number.isFinite)) bad ||= "jugador con valores no numéricos";
      if (s.points.balance < 0) bad ||= "puntos negativos";
      for (const a of Object.values(s.weapons.ammo)) if (a.mag < 0 || a.reserve < 0) bad ||= "munición negativa";
    }
    // Zombis atascados: vivos, persiguiendo y sin moverse 25 s lejos de todo jugador (el rescate debería evitarlo).
    if (k % 30 === 0) {
      for (const z of list) {
        if (!z.alive || z.state !== "chasing") {
          stuckAt.delete(z.id);
          continue;
        }
        const prev = stuckAt.get(z.id);
        if (!prev || Math.hypot(prev.x - z.position.x, prev.z - z.position.z) > 0.6) stuckAt.set(z.id, { x: z.position.x, z: z.position.z, t });
        else if (t - prev.t > 25) {
          const near = host.seats.some((s, i) => host.online[i] && Math.hypot(s.p.position.x - z.position.x, s.p.position.z - z.position.z) < 3);
          if (!near) {
            stuck++;
            console.log(`  atasco: ${z.def.kind} en ${z.position.x.toFixed(1)},${z.position.z.toFixed(1)} t=${t.toFixed(0)} ronda ${host.rounds.round}`);
            stuckAt.delete(z.id);
          }
        }
      }
    }
    // Inmortales: el objetivo es forzar el bucle, no la dificultad.
    for (const q of host.seats) if (q.p.alive) q.p.health = q.p.maxHealth;
    if (k % 60 === 0) for (const s of host.seats) s.weapons.ammo.pistol.reserve = Math.max(s.weapons.ammo.pistol.reserve, 40);
  }
  check(!bad, `${id}: sin valores raros ni zombis fuera del mapa`, bad);
  check(maxRound >= minRound, `${id}: las rondas avanzan`, `ronda ${maxRound} en ${t.toFixed(0)} s`);
  check(maxAliveSeen <= 40, `${id}: nunca hay un número descontrolado de zombis`, `${maxAliveSeen}`);
  check(stuck <= 2, `${id}: casi ningún zombi se queda atascado lejos de todos`, `${stuck}`);
  check(host.seats.every((s) => ZOMBIE_KINDS.length === 4 && s.kills >= 0), `${id}: contadores sanos`);
  console.log(`  · ronda ${maxRound}, ${host.seats.map((s) => s.kills).join("+")} bajas, ${stuck} atascos, ${hounds ? "con perros" : "sin perros"}`);
  host.dispose();
}

for (const id of MAP_IDS) soak(id, 500, 3);
