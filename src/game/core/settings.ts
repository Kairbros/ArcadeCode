// Preferencias visuales. En VS Code se guardan en los ajustes (vía la extensión);
// en el navegador, en localStorage.

interface VsCodeApi {
  postMessage(msg: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const injected = (window as { BOMBERMAN_CONFIG?: { grayscale?: boolean } }).BOMBERMAN_CONFIG;
const vscodeApi: VsCodeApi | null = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
const STORAGE_KEY = "bomberman.grayscale";

function loadGrayscale(): boolean {
  if (injected?.grayscale !== undefined) return injected.grayscale;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export const settings = { grayscale: loadGrayscale() };
const listeners: (() => void)[] = [];

export function onSettingsChange(fn: () => void) {
  listeners.push(fn);
}

function apply(on: boolean) {
  settings.grayscale = on;
  document.documentElement.classList.toggle("bm-gray", on);
  for (const fn of listeners) fn();
}

export function setGrayscale(on: boolean) {
  apply(on);
  if (vscodeApi) {
    vscodeApi.postMessage({ type: "setGrayscale", value: on });
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch {
      // sin almacenamiento: solo dura esta sesión
    }
  }
}

// La extensión avisa si el ajuste cambia desde otra ventana o desde los ajustes de VS Code.
window.addEventListener("message", (ev) => {
  const msg = ev.data as { type?: string; value?: unknown };
  if (msg?.type === "grayscale") apply(msg.value === true);
});

apply(settings.grayscale);
