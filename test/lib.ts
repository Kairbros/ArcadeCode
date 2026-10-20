// Utilidades de las pruebas: comprobaciones, rng determinista y entradas falsas.

let failed = 0;

/** Comprueba una condición; imprime ✓/✗ con el detalle y marca la prueba como fallida si no se cumple. */
export function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` · ${detail}` : ""}`);
  if (!ok) {
    failed++;
    process.exitCode = 1;
  }
}

export const failures = () => failed;

/** Avanza el reloj de `performance.now()` (ver stubs.js). */
export function tickClock(ms: number): void {
  (globalThis as unknown as { __clock: number }).__clock += ms;
}

/** Generador de Park-Miller: mismas tiradas en cada ejecución. */
export function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Entrada de Bloques quieta; las pruebas tocan sus campos o los contadores `_*`. */
export function blocksInput(over: Record<string, unknown> = {}) {
  const s = {
    forward: 0, right: 0, jump: false, down: false, lookX: 0, lookY: 0,
    digHeld: false, digMouse: false, placeHeld: false, cursor: [0, 0] as [number, number], ui: false,
    _dig: 0, _place: 0, _inv: 0, _throw: 0, _throwAll: false, _slot: -1, _fly: false, _clicks: [] as unknown[],
    poll() {},
    takeMouse: () => [0, 0] as [number, number],
    takeDig: () => s._dig > 0 && s._dig-- > 0,
    takePlace: () => s._place > 0 && s._place-- > 0,
    takeSlot: () => { const v = s._slot; s._slot = -1; return v; },
    takeScroll: () => 0,
    takeFly: () => { const v = s._fly; s._fly = false; return v; },
    takeInventory: () => s._inv > 0 && s._inv-- > 0,
    takeThrow: () => (s._throw > 0 && s._throw-- > 0 ? (s._throwAll ? 2 : 1) : 0) as 0 | 1 | 2,
    takeClicks: () => { const c = s._clicks; s._clicks = []; return c; },
    setUi(open: boolean) { s.ui = open; },
    ...over,
  };
  return s;
}
