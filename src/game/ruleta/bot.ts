// IA del crupier (y de quien se desconecta): cuenta los cartuchos que han salido y decide con lo que
// sabe, sin mirar el orden de la carga. Devuelve una acción por llamada; el árbitro la vuelve a
// llamar tras cada animación, así encadena objetos antes de disparar.
import { I_ADRENALINE, I_BEER, I_CIGS, I_CUFFS, I_INVERTER, I_LUPA, I_MEDS, I_PHONE, I_SAW } from "./config";
import type { Action, Match, Seat } from "./match";

export function decide(m: Match, p: number): Action {
  const me = m.seats[p];
  const { live, blank } = m.remaining();
  const total = live + blank;
  const known = me.known.get(m.pos);
  const pLive = known !== undefined ? Number(known) : total ? live / total : 0;
  const use = (item: number, b = -1): Action | null => {
    const i = me.items.indexOf(item);
    return i >= 0 && m.canUse(item, p, b) ? { k: 1, a: i, b } : null;
  };
  const rivals = m.alive().filter((s) => s.index !== p);
  const victim = weakest(rivals, m) ?? me;
  const shootRival: Action = { k: 0, a: victim.index };
  const shootSelf: Action = { k: 0, a: p };

  if (me.lives < me.max && !m.noHeal(me)) {
    const a = use(I_CIGS);
    if (a) return a;
  }
  // Averiguar qué hay en la recámara (con su lupa o robando la de otro).
  if (known === undefined && live > 0 && blank > 0) {
    const a = use(I_LUPA);
    if (a) return a;
    const adr = me.items.indexOf(I_ADRENALINE);
    if (adr >= 0) {
      for (const r of rivals) {
        const j = r.items.indexOf(I_LUPA);
        if (j >= 0) return { k: 1, a: adr, b: r.index, c: j };
      }
    }
  }
  if (pLive === 1) {
    const saw = use(I_SAW);
    if (saw) return saw;
    const cuffable = rivals.find((s) => s.cuffed === 0);
    const cuffs = cuffable && use(I_CUFFS, cuffable.index);
    if (cuffs) return cuffs;
    return shootRival;
  }
  if (pLive === 0) {
    // Fogueo seguro: si sabe cuál es, lo invierte para disparar al rival; si no, se dispara y repite.
    if (known === false) {
      const inv = use(I_INVERTER);
      if (inv) return inv;
    }
    return shootSelf;
  }
  // Con dudas: más información, quitarse el cartucho de encima o arriesgar.
  if (total > 1 && m.rng.next() < 0.5) {
    const a = use(I_PHONE);
    if (a) return a;
  }
  if (pLive < 0.5) {
    const a = use(I_BEER);
    if (a) return a;
  }
  if (me.lives <= me.max - 2 && me.lives > 1 && !m.noHeal(me)) {
    const a = use(I_MEDS);
    if (a) return a;
  }
  if (pLive > 0.5 || (pLive === 0.5 && m.rng.next() < 0.6)) {
    if (pLive >= 0.66) {
      const saw = use(I_SAW);
      if (saw) return saw;
    }
    return shootRival;
  }
  return shootSelf;
}

/** Rival con menos vidas (al azar entre los empatados). */
function weakest(rivals: Seat[], m: Match): Seat | undefined {
  if (!rivals.length) return undefined;
  const min = Math.min(...rivals.map((s) => s.lives));
  return m.rng.choice(rivals.filter((s) => s.lives === min));
}
