// Banco de red de Bloques: anfitrión + invitado con entradas al azar, por canal directo o por un relé que
// retrasa, desordena y pierde mensajes. Al final se quedan quietos unos segundos y se comprueba el resultado.
import { BlocksGuest, BlocksHost, type BlocksMode } from "../src/game/blocks/game";
import { DAY_LENGTH } from "../src/game/blocks/daycycle";
import type { WalkSource } from "../src/game/blocks/input";
import { blocksInput, check, rng, tickClock } from "./lib";

export function runBlocksNet(mode: BlocksMode, transport: "p2p" | "relay", seconds: number, seed: number) {
  const rnd = rng(seed);
  const fake = () => {
    const s = blocksInput({
      quiet: false,
      poll() {
        if (s.quiet) return Object.assign(s, { forward: 0, right: 0, jump: false, lookX: 0, lookY: 0, digMouse: false, digHeld: false });
        if (rnd() < 0.05) {
          s.forward = Math.round(rnd() * 2 - 1); s.right = Math.round(rnd() * 2 - 1);
          s.lookX = rnd() * 2 - 1; s.lookY = rnd() * 2 - 1.3; s.jump = rnd() < 0.3;
        }
        if (rnd() < (s.digMouse ? 0.004 : 0.03)) s.digMouse = !s.digMouse;
        if (rnd() < 0.01) s.digHeld = !s.digHeld;
        if (rnd() < 0.04) s._dig++;
        if (rnd() < 0.03) s._place++;
        if (rnd() < 0.02) { s._throw++; s._throwAll = rnd() < 0.3; }
        if (rnd() < 0.02) s._slot = Math.floor(rnd() * 9);
        if (mode === "blocks" && rnd() < 0.002) s._fly = true;
      },
    }) as ReturnType<typeof blocksInput> & { quiet: boolean };
    return s;
  };
  const hi = fake(), gi = fake();
  const host: any = new BlocksHost(hi as unknown as WalkSource, 1, "host", mode, seed);
  const guest: any = new BlocksGuest(1, gi as unknown as WalkSource, mode);
  if (mode === "survival") host.clock = DAY_LENGTH * 0.75; // medianoche: con monstruos

  // Contadores de objetos: lo soltado al romper los crea; poner y caducar los gasta.
  let created = 0, placed = 0, gone = 0;
  const spawn = host.drops.spawn.bind(host.drops);
  host.drops.spawn = (item: number, n: number, ...rest: any[]) => {
    if ((rest[6] ?? -1) === -1) created += n;
    spawn(item, n, ...rest);
  };
  const apply = host.apply.bind(host);
  host.apply = (e: number[]) => { const ok = apply(e); if (ok && e[3] !== 0) placed++; return ok; };
  const sum = () => host.drops.list.reduce((a: number, d: any) => a + d.n, 0);
  const upd = host.drops.update.bind(host.drops);
  host.drops.update = (dt: number, w: unknown) => { const a = sum(); upd(dt, w); gone += a - sum(); };

  const queue: string[] = [];
  let lastBase = -1, maxMsg = 0, lost = 0, deaths = 0, hurts = 0;
  let wasDead = [false, false];
  const tick = (f: number, lossy: boolean, kill = false) => {
    tickClock(1000 / 60);
    // De vez en cuando alguien muere (y suelta todo): lo soltado también tiene que cuadrar.
    if (kill && rnd() < 0.002) host.pilot.vitals.damage(99);
    if (kill && rnd() < 0.002) guest.pilot?.vitals.damage(99);
    host.update(1 / 60);
    guest.update(1 / 60);
    [host.pilot, guest.pilot].forEach((p: any, i: number) => {
      if (!p) return;
      if (p.dead && !wasDead[i]) deaths++;
      if (!p.dead && p.vitals.hurt === 0.5) hurts++;
      wasDead[i] = p.dead;
    });
    if (f % 2 === 0) {
      const { snap, base } = host.frame();
      const drop = lossy && rnd() < 0.3;
      if (base && base.seq !== lastBase && !drop) { guest.onBase(JSON.parse(JSON.stringify(base))); lastBase = base.seq; }
      if (!drop) guest.onSnap(JSON.parse(JSON.stringify(snap)));
    }
    if (transport === "p2p" || f % 6 === 0) {
      const m = guest.outgoing(transport);
      if (m) { const j = JSON.stringify({ ...m, nm: "Invitado12" }); maxMsg = Math.max(maxMsg, j.length); queue.push(j); }
    }
    while (queue.length > (lossy ? 3 : 0)) {
      const [j] = queue.splice(lossy && rnd() < 0.3 ? Math.min(1, queue.length - 1) : 0, 1);
      if (lossy && rnd() < 0.1) { lost++; continue; }
      host.onMessage(1, JSON.parse(j));
    }
  };
  for (let f = 0; f < 60 * seconds; f++) tick(f, transport === "relay", mode === "survival");
  hi.quiet = gi.quiet = true;
  for (let f = 0; f < 60 * 8; f++) tick(f, false);

  const hw: Uint8Array = host.world.data, gw: Uint8Array = guest.world.data;
  let diff = 0;
  for (let i = 0; i < hw.length; i++) if (hw[i] !== gw[i]) diff++;
  const label = `${mode} ${transport}`;
  check(diff === 0, `${label}: mismo mundo en anfitrión e invitado`, `${host.n} cambios, ${diff} bloques distintos`);
  check(guest.pending.length === 0, `${label}: el invitado no tiene cambios sin confirmar`, `${guest.pending.length}`);
  check(maxMsg <= 300, `${label}: mensajes del invitado ≤ 300 car.`, `máx. ${maxMsg}, perdidos ${lost}`);
  if (mode === "survival") {
    const total = (inv: any) => inv.slots.reduce((a: number, s: any) => a + (s ? s.n : 0), 0);
    const hInv = total(host.pilot.inventory), gInv = total(guest.pilot.inventory), ground = sum();
    check(created === placed + hInv + gInv + ground + gone, `${label}: no se crean ni pierden objetos`,
      `soltados ${created} = puestos ${placed} + inventarios ${hInv}+${gInv} + suelo ${ground} + caducados ${gone}`);
    check(host.remotes[0].grants.length === 0 && host.remotes[0].hurts.length === 0, `${label}: todas las entregas y golpes confirmados`, `${hurts} golpes, ${deaths} muertes, ${host.mobs.list.filter((m: any) => m.kind >= 4).length} monstruos`);
    const ids = (l: any[]) => l.map((m) => `${m.id}:${m.kind}`).join(" ");
    check(ids(guest.mobs) === ids(host.mobs.list) && guest.mobs.length > 0, `${label}: el invitado ve los mismos animales`,
      `${guest.mobs.length} animales, estado ${JSON.stringify(host.frame().snap).length} car.`);
  }
}
