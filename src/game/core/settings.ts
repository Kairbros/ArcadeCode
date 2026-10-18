// Preferencias visuales. En VS Code se guardan en los ajustes (vía la extensión);
// en el navegador, en localStorage.

interface VsCodeApi {
  postMessage(msg: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const injected = (window as { ARCADE_CONFIG?: { grayscale?: boolean; playerName?: string; bots?: boolean; crt?: boolean } })
  .ARCADE_CONFIG;
const vscodeApi: VsCodeApi | null = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
const STORAGE_KEY = "bomberman.grayscale";
const NAME_KEY = "bomberman.playerName";
const BOTS_KEY = "bomberman.bots";
const CRT_KEY = "arcade.crt";
export const MAX_NAME = 12;

/** Nombre de jugador seguro: sin caracteres de control y como mucho MAX_NAME caracteres. */
export function cleanName(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME) : "";
}

function loadName(): string {
  if (injected?.playerName !== undefined) return cleanName(injected.playerName);
  try {
    return cleanName(localStorage.getItem(NAME_KEY));
  } catch {
    return "";
  }
}

function loadGrayscale(): boolean {
  if (injected?.grayscale !== undefined) return injected.grayscale;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function loadBots(): boolean {
  if (injected?.bots !== undefined) return injected.bots;
  try {
    return localStorage.getItem(BOTS_KEY) !== "0";
  } catch {
    return true;
  }
}

function loadCrt(): boolean {
  if (injected?.crt !== undefined) return injected.crt;
  try {
    return localStorage.getItem(CRT_KEY) !== "0";
  } catch {
    return true;
  }
}

export const settings = { grayscale: loadGrayscale(), name: loadName(), bots: loadBots(), crt: loadCrt() };

/** Efecto de pantalla de tubo (líneas de barrido y bordes oscuros) encima del juego. */
export function setCrt(on: boolean) {
  settings.crt = on;
  if (vscodeApi) {
    vscodeApi.postMessage({ type: "setCrt", value: on });
  } else {
    try {
      localStorage.setItem(CRT_KEY, on ? "1" : "0");
    } catch {
      // sin almacenamiento: solo dura esta sesión
    }
  }
}

/** Bots (IA) que rellenan los huecos en Karts, Sumo y Monigotes (y el crupier de la Ruleta). En red vale el del anfitrión. */
export function setBots(on: boolean) {
  settings.bots = on;
  if (vscodeApi) {
    vscodeApi.postMessage({ type: "setBots", value: on });
  } else {
    try {
      localStorage.setItem(BOTS_KEY, on ? "1" : "0");
    } catch {
      // sin almacenamiento: solo dura esta sesión
    }
  }
}

/** Guarda el nombre elegido (vacío = el nombre por defecto, "Jugador N"). */
export function setPlayerName(raw: string) {
  const name = cleanName(raw);
  if (name === settings.name) return;
  settings.name = name;
  if (vscodeApi) {
    vscodeApi.postMessage({ type: "setPlayerName", value: name });
  } else {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // sin almacenamiento: solo dura esta sesión
    }
  }
}
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
