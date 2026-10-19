// Guardado del mundo local de Bloques: la semilla y los bloques distintos de los generados, en
// localStorage (en la webview de VS Code cada vista tiene el suyo). Si el navegador no deja usarlo, el
// mundo solo dura la sesión: nada de esto es imprescindible.
import { SAVE_MAX_BLOCKS } from "./config";
import type { World } from "./world";

const SEED_KEY = "arcade.blocks.seed";
const DIFF_KEY = "arcade.blocks.diff";
const PLAYER_KEY = "arcade.blocks.player";

interface Saved {
  seed: number;
  /** Bloques distintos de los generados, en plano: x, y, z, bloque... */
  d: number[];
}

/** Lo guardado del jugador en supervivencia (vida, hambre y mochila). */
export interface PlayerSaved {
  seed: number;
  hp: number;
  hunger?: number;
  inv: unknown;
}

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Semilla del último mundo guardado (null si no hay ninguno). */
export function savedSeed(): number | null {
  try {
    const n = Number(store()?.getItem(SEED_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Aplica al mundo lo que se guardó de esa semilla (si hay algo y es de ese mundo). */
export function loadSaved(world: World) {
  const raw = store()?.getItem(DIFF_KEY);
  if (!raw) return;
  try {
    const s = JSON.parse(raw) as Partial<Saved> | null;
    if (!s || s.seed !== world.seed || !Array.isArray(s.d)) return;
    world.loadDiff(s.d.slice(0, SAVE_MAX_BLOCKS * 4));
  } catch {
    // guardado corrupto: se ignora (y se reemplazará al volver a guardar)
  }
}

/** Guarda la semilla y los cambios del mundo. Devuelve false si no se pudo. */
export function saveWorld(world: World): boolean {
  const st = store();
  if (!st) return false;
  if (world.diff.size > SAVE_MAX_BLOCKS) return false;
  const saved: Saved = { seed: world.seed, d: world.diffList() };
  try {
    st.setItem(SEED_KEY, String(world.seed));
    st.setItem(DIFF_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false; // sin espacio (o sin permiso): se sigue jugando igual
  }
}

/** Olvida el mundo guardado (al empezar uno nuevo). */
export function clearSaved() {
  const st = store();
  if (!st) return;
  try {
    st.removeItem(DIFF_KEY);
    st.removeItem(PLAYER_KEY);
  } catch {
    // nada que hacer
  }
}

/** Vida, hambre y mochila guardadas de ese mundo (null si no hay o son de otro). */
export function loadPlayer(seed: number): { hp: number; hunger: number; inv: unknown } | null {
  const raw = store()?.getItem(PLAYER_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PlayerSaved> | null;
    if (!p || p.seed !== seed || typeof p.hp !== "number") return null;
    return { hp: p.hp, hunger: typeof p.hunger === "number" ? p.hunger : 20, inv: p.inv };
  } catch {
    return null;
  }
}

/** Guarda vida, hambre y mochila de ese mundo. */
export function savePlayer(seed: number, hp: number, inv: unknown, hunger = 20) {
  const st = store();
  if (!st) return;
  try {
    st.setItem(PLAYER_KEY, JSON.stringify({ seed, hp, hunger, inv } satisfies PlayerSaved));
  } catch {
    // sin espacio: se sigue jugando igual
  }
}
