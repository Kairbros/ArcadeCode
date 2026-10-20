// DOM mínimo para cargar los módulos del juego en Node (nada de esto dibuja de verdad).
const ctx2d = new Proxy({}, {
  get: (t, k) => (k === "getImageData" || k === "createImageData" ? () => ({ data: new Uint8ClampedArray(4 * 64 * 64) }) : k in t ? t[k] : () => ({ addColorStop() {} })),
  set: (t, k, v) => ((t[k] = v), true),
});
const el = () => ({ getContext: () => ctx2d, width: 0, height: 0, style: {}, classList: { toggle() {}, add() {} }, addEventListener() {} });
globalThis.window = { addEventListener() {}, location: { search: "" } };
globalThis.document = { createElement: el, documentElement: el(), body: el(), getElementById: el, addEventListener() {}, pointerLockElement: null };
globalThis.OffscreenCanvas = class { constructor(w, h) { Object.assign(this, el(), { width: w, height: h }); } };
globalThis.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
// Reloj controlable: las pruebas de red avanzan `clock` a mano.
globalThis.__clock = 0;
Object.defineProperty(globalThis, "performance", { value: { now: () => globalThis.__clock }, configurable: true });
