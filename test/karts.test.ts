// Karts: rampas, placas de turbo, monedas, túnel y objetos nuevos (se miran en Node, sin dibujar).
import { Race } from "../src/game/karts/race";
import { makeKart, stepKart, NO_INPUT, type Kart } from "../src/game/karts/physics";
import { generateTrack, type Track } from "../src/game/karts/track";
import {
  ITEM_BANANA, ITEM_BOLT, ITEM_BOMB, ITEM_RED, ITEM_SHELL, ITEM_STAR, ITEM_TURBO, LAPS, MAX_SPEED, TRACK_W, TUNNEL_LIMIT,
} from "../src/game/karts/config";
import { locate } from "../src/game/karts/track";
import { hazardAt, hazardHits } from "../src/game/karts/hazards";
import { KartsGuest, KartsHost } from "../src/game/karts/game";
import { check } from "./lib";

const GO = { steer: 0, throttle: 1, drift: false };
/** Pone un kart en (x, y) mirando a `a`, con el segmento que le toca. */
function putAt(t: Track, x: number, y: number, a: number, v: number): Kart {
  const i = locate(t, x, y).i;
  const k = makeKart({ x, y, a, seg: i, progress: i }, t.coins.length);
  k.v = v;
  return k;
}
/** Pone un kart en el punto i de la línea central, mirando hacia delante. */
const put = (t: Track, i: number, v: number) => putAt(t, t.px[i], t.py[i], t.dir[i], v);
/** Conduce siguiendo la línea central (como la IA, para no salirse en las curvas suaves). */
function follow(k: Kart, t: Track) {
  const j = (k.seg + 6) % t.n;
  const diff = Math.atan2(t.py[j] - k.y, t.px[j] - k.x) - k.a;
  return { steer: Math.max(-1, Math.min(1, Math.atan2(Math.sin(diff), Math.cos(diff)) * 2.5)), throttle: 1, drift: false };
}
const sim = (k: Kart, t: Track, secs: number, watch?: (k: Kart) => void) => {
  for (let f = 0; f < secs * 60; f++) {
    stepKart(k, k.z > 0 ? GO : follow(k, t), t, 1 / 60, true);
    watch?.(k);
  }
};

// Circuitos: lo que se genera es coherente en 60 semillas.
{
  let bad = 0, withRamp = 0, withTunnel = 0, padsOk = true;
  for (let seed = 1; seed <= 60; seed++) {
    const t = generateTrack(seed);
    if (t.ramps.length) withRamp++;
    if (t.tunnels.length) withTunnel++;
    for (const tun of t.tunnels) if (tun.from < 0 || tun.to >= t.n || tun.to <= tun.from) bad++;
    for (const r of t.ramps) for (const tun of t.tunnels) if (r.i + 40 > tun.from - 4 && r.i < tun.to + 4) bad++;
    for (const p of t.pads) if (locate(t, p.x, p.y).d > TRACK_W / 2) padsOk = false;
    for (const c of t.coins) if (locate(t, c.x, c.y).d > TRACK_W / 2) padsOk = false;
  }
  check(bad === 0, "circuitos: túneles y rampas no se pisan", `fallos ${bad}`);
  check(padsOk, "circuitos: placas y monedas caen sobre el asfalto");
  check(withRamp >= 40 && withTunnel >= 35, "circuitos: casi todos tienen rampa y túnel (el espacio no tiene túnel)", `rampa ${withRamp}/60, túnel ${withTunnel}/60`);
}

// Rampa: el kart salta, vuelve al suelo y sigue en la pista.
{
  const t = Array.from({ length: 40 }, (_, s) => generateTrack(s + 1)).find((tr) => tr.ramps.length)!;
  const k = put(t, Math.max(0, t.ramps[0].i - 14), 170);
  let maxZ = 0, air = 0;
  sim(k, t, 2.2, (kk) => {
    maxZ = Math.max(maxZ, kk.z);
    if (kk.z > 0) air++;
  });
  check(maxZ > 15 && air > 30, "rampa: el kart salta", `altura máxima ${maxZ.toFixed(1)}, ${air} fotogramas en el aire`);
  check(k.z === 0 && !k.offroad, "rampa: aterriza en la pista", `z ${k.z}, fuera de pista ${k.offroad}`);
  // Un truco en el aire da turbo al aterrizar.
  const k2 = put(t, Math.max(0, t.ramps[0].i - 14), 170);
  let landedTurbo = 0, held = false;
  for (let f = 0; f < 2.2 * 60; f++) {
    held = true;
    const inp = k2.z > 0 ? GO : follow(k2, t);
    stepKart(k2, { ...inp, drift: k2.z > 8 }, t, 1 / 60, true);
    if (k2.z === 0 && k2.turbo > landedTurbo) landedTurbo = k2.turbo;
  }
  void held;
  check(landedTurbo > 0.5, "truco: turbo al aterrizar", `turbo ${landedTurbo.toFixed(2)}`);
}

// Placa de turbo y monedas.
{
  const t = Array.from({ length: 40 }, (_, s) => generateTrack(s + 1)).find((tr) => tr.pads.length)!;
  const p = t.pads[0];
  const k = putAt(t, p.x - Math.cos(t.dir[p.i]) * 40, p.y - Math.sin(t.dir[p.i]) * 40, t.dir[p.i], 90);
  sim(k, t, 1);
  check(k.turbo > 0 || k.v > MAX_SPEED, "placa de turbo: da turbo", `turbo ${k.turbo.toFixed(2)}, v ${k.v.toFixed(0)}`);
  const c = t.coins[0];
  const k2 = putAt(t, c.x, c.y, 0, 0);
  stepKart(k2, NO_INPUT, t, 1 / 60, true);
  check(k2.coins === 1 && k2.taken[0] === 1, "monedas: se recogen");
}

// Túnel: las paredes están cerca de la pista.
{
  const t = Array.from({ length: 40 }, (_, s) => generateTrack(s + 1)).find((tr) => tr.tunnels.length)!;
  const i = Math.floor((t.tunnels[0].from + t.tunnels[0].to) / 2);
  const k = put(t, i, 120);
  k.x += -Math.sin(t.dir[i]) * 60;
  k.y += Math.cos(t.dir[i]) * 60;
  stepKart(k, NO_INPUT, t, 1 / 60, true);
  check(locate(t, k.x, k.y).d <= TUNNEL_LIMIT + 1, "túnel: la pared frena cerca de la pista", `distancia ${locate(t, k.x, k.y).d.toFixed(1)}`);
}

// Carreras de 4 IA: terminan, no se atascan en rampas ni túneles.
{
  let open = 0, nan = 0, minDone = 99;
  for (let seed = 1; seed <= 12; seed++) {
    const r = new Race(seed, ["ai"], null, true);
    let f = 0;
    while (r.phase !== 2 && f < 60 * 420) {
      r.update(1 / 60);
      f++;
    }
    if (r.phase !== 2) open++;
    if (r.slots.some((s) => !Number.isFinite(s.kart.x + s.kart.y + s.kart.v))) nan++;
    minDone = Math.min(minDone, r.slots.filter((s) => s.kart.progress >= LAPS * r.track.n).length);
  }
  check(open === 0 && nan === 0, "IA: 12 carreras acaban sin valores raros", `sin acabar ${open}, NaN ${nan}`);
  check(minDone >= 1, "IA: al menos uno cruza la meta en cada carrera", `mínimo ${minDone}`);
}

// Objetos nuevos.
{
  const r = new Race(7, ["local", "ai"], null, true);
  r.phase = 1;
  const [a, b] = r.slots;
  // Se pone a b delante de a.
  b.kart.progress = a.kart.progress + 80;
  b.kart.x = a.kart.x + 60;
  b.kart.y = a.kart.y;
  a.item = ITEM_BOLT;
  r.useItem(0, ITEM_BOLT);
  check(b.kart.shrink > 0 && b.slowSeq === 1 && a.kart.shrink === 0, "rayo: frena al de delante y no al que lo usa");
  a.item = ITEM_STAR;
  r.useItem(0, ITEM_STAR);
  check(a.kart.star > 0, "estrella: se activa");
  a.item = ITEM_BOMB;
  r.useItem(0, ITEM_BOMB);
  check(r.bombs.length === 1, "bomba: queda en la pista");
  const bomb = r.bombs[0];
  b.kart.x = bomb.x;
  b.kart.y = bomb.y;
  b.kart.z = 0;
  const before = b.spinSeq;
  b.kind = "remote";
  b.ai = null;
  for (let f = 0; f < 60 && b.spinSeq === before; f++) r.update(1 / 60); // la bomba se arma al cabo de unas décimas
  check(b.spinSeq === before + 1 && r.blasts.length === 1, "bomba: explota al tocarla y lanza a trompos");
  a.kart.x = bomb.x;
  a.kart.y = bomb.y;
  r.bombs.push({ x: a.kart.x, y: a.kart.y, t: 0.01, owner: 1 });
  const sa = a.spinSeq;
  r.update(1 / 30);
  check(a.spinSeq === sa, "estrella: no hay trompo con la bomba al lado");
  // Caparazón rojo: persigue al de delante y le da.
  const r2 = new Race(9, ["local", "ai"], null, true);
  r2.phase = 1;
  const [c, d] = r2.slots;
  const idx = (c.kart.seg + 18) % r2.track.n;
  d.kart.x = r2.track.px[idx];
  d.kart.y = r2.track.py[idx];
  d.kart.seg = idx;
  d.kart.progress = c.kart.progress + 18;
  d.ai = null; // quieto
  d.kind = "remote";
  c.item = ITEM_RED;
  r2.useItem(0, ITEM_RED);
  check(r2.shells.length === 1 && r2.shells[0].target === d.index, "caparazón rojo: elige al de delante");
  const sd = d.spinSeq;
  for (let f = 0; f < 60 * 3 && d.spinSeq === sd; f++) r2.update(1 / 60);
  check(d.spinSeq > sd, "caparazón rojo: alcanza a su objetivo");
  for (const item of [ITEM_TURBO, ITEM_BANANA, ITEM_SHELL] as const) {
    c.item = item;
    r2.useItem(0, item);
  }
  check((c.item as number) === 0, "objetos clásicos siguen funcionando");
}

// Temas nuevos: espacio (caída + Lakitu) y peligros (chomp, thwomp, meteoro).
{
  const themes = new Set<string>();
  let space: Track | null = null, lava: Track | null = null;
  for (let seed = 1; seed <= 80; seed++) {
    const t = generateTrack(seed);
    themes.add(t.theme.name);
    if (t.theme.void && !space && t.ramps.length) space = t;
    if (t.theme.lava && !lava) lava = t;
  }
  check(themes.size === 5, "circuitos: salen los 5 temas", [...themes].join(", "));
  let noHazard = 0;
  for (let seed = 1; seed <= 40; seed++) if (!generateTrack(seed).hazards.length) noHazard++;
  check(noHazard <= 4, "circuitos: casi todos tienen peligros", `sin peligros ${noHazard}/40`);

  // Espacio: salirse del asfalto es caer; Lakitu devuelve el kart a la pista.
  const t = space!;
  const i = Math.floor(t.n / 3);
  const k = put(t, i, 120);
  k.x += -Math.sin(t.dir[i]) * 50;
  k.y += Math.cos(t.dir[i]) * 50;
  let fell = false, minZ = 0;
  for (let f = 0; f < 60 * 6; f++) {
    stepKart(k, NO_INPUT, t, 1 / 60, true);
    if (k.fall) fell = true;
    minZ = Math.min(minZ, k.z);
  }
  check(fell && minZ < -100, "espacio: fuera del asfalto el kart cae", `z mínima ${minZ.toFixed(0)}`);
  check(!k.fall && k.z === 0 && k.dist < TRACK_W / 2, "espacio: Lakitu lo devuelve a la pista", `z ${k.z}, dist ${k.dist.toFixed(1)}, caída ${k.fall}`);

  // Peligros: un chomp golpea a un kart parado en su camino; un thwomp, solo cuando está abajo.
  const race = new Race(5, ["local"], null, true);
  race.phase = 1;
  const s0 = race.slots[0];
  const hz = { kind: "chomp" as const, i: 100, phase: 0 };
  race.track.hazards.length = 0;
  race.track.hazards.push(hz);
  race.time = 0.3;
  const st = hazardAt(race.track, hz, race.time);
  s0.kart.x = st.x;
  s0.kart.y = st.y;
  s0.kart.z = 0;
  check(hazardHits(race.track, hz, st, st.x, st.y, 0), "chomp: golpea a un kart que está en él");
  const th = { kind: "thwomp" as const, i: 120, phase: 0 };
  const up = hazardAt(race.track, th, 1);
  const down = hazardAt(race.track, th, 2.9);
  check(!up.deadly && down.deadly, "thwomp: solo hace daño cuando está abajo", `arriba ${up.z.toFixed(0)}, abajo ${down.z.toFixed(0)}`);
  check(!hazardHits(race.track, th, down, down.x, down.y, 30), "thwomp: un kart que salta por encima no se aplasta");
}

// Carreras de IA en todos los temas, incluido el vacío (la IA no se cae para siempre).
{
  let open = 0, nan = 0;
  const seen = new Set<string>();
  for (let seed = 1; seed <= 24; seed++) {
    const r = new Race(seed, ["ai"], null, true);
    seen.add(r.track.theme.name);
    let f = 0;
    while (r.phase !== 2 && f < 60 * 420) {
      r.update(1 / 60);
      f++;
    }
    if (r.phase !== 2) open++;
    if (r.slots.some((s) => !Number.isFinite(s.kart.x + s.kart.y + s.kart.z))) nan++;
  }
  check(open === 0 && nan === 0, "IA: 24 carreras en todos los temas acaban", `temas ${[...seen].join("/")}, sin acabar ${open}, NaN ${nan}`);
}

// Red: el invitado entiende el estado del anfitrión (rayo, estrella, bombas...) y su mensaje llega.
{
  const idle = { poll() {}, steer: 0, throttle: 1, drift: false, takeItem: () => false };
  const host = new KartsHost(idle, 1, "host", true);
  host.race.phase = 1;
  const guest = new KartsGuest(1, idle);
  for (let f = 0; f < 60 * 3; f++) {
    host.update(1 / 60);
    if (f % 2 === 0) guest.onSnap(host.frame().snap);
    guest.update(1 / 60);
    const msg = guest.outgoing("relay");
    if (msg) host.onMessage(1, msg);
  }
  check(guest.ready, "red: el invitado queda listo");
  // El anfitrión le tira un rayo y una bomba cae en la pista: el invitado lo ve en el siguiente estado.
  const slot = host.race.slots[1];
  host.race.slots[0].item = ITEM_BOLT;
  slot.kart.progress = host.race.slots[0].kart.progress + 50;
  host.race.useItem(0, ITEM_BOLT);
  host.race.slots[0].item = ITEM_BOMB;
  host.race.useItem(0, ITEM_BOMB);
  const snap = host.frame().snap as unknown as { k: number[][]; bm: number[] };
  guest.onSnap(snap);
  check(snap.k[1].length >= 13 && snap.bm.length === 3, "red: la fila de kart y las bombas llevan los campos nuevos", `campos ${snap.k[1].length}, bombas ${snap.bm.length}`);
  guest.update(1 / 60);
  check((guest as unknown as { me: Kart }).me.shrink > 0, "red: el rayo llega al invitado");
}
