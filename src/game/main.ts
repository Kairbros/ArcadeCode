// Punto de entrada en el navegador / webview de VS Code: menú del hub, partidas locales y en red.
import { SCREEN_H, SCREEN_W } from "./bomberman/config";
import { BG_COLOR, DEFAULT_SIZE, PLAYER_CONTROLS } from "./core/config";
import { Game } from "./bomberman/game";
import { gameName, type GameId } from "./hub";
import { LocalController } from "./bomberman/input";
import { KartsHost } from "./karts/game";
import { KartsInput } from "./karts/input";
import { BallsHost } from "./balls/game";
import { BallsInput } from "./balls/input";
import { StickHost } from "./stick/game";
import { StickInput } from "./stick/input";
import { RuletaHost } from "./ruleta/game";
import { RuletaInput } from "./ruleta/input";
import { BlocksHost } from "./blocks/game";
import { BlocksInput, releasePointer } from "./blocks/input";
import { PoolHost } from "./pool/game";
import { PoolInput } from "./pool/input";
import { CasinoHost } from "./casino/game";
import { CasinoInput } from "./casino/input";
import { Keyboard, isTyping } from "./core/keyboard";
import { GuestSession } from "./net/guest";
import { HostSession } from "./net/host";
import { TRANSPORT_LABEL } from "./net/protocol";
import { SignalClient } from "./net/signaling";
import { css } from "./core/draw";
import { drawCrt } from "./core/crt";
import { onSettingsChange, setBots, setCrt, setGrayscale, setPlayerName, settings } from "./core/settings";
import { defaultName, myName, resetNames, setName } from "./core/names";
import { Menu } from "./ui/menu";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// Teclas cuyo comportamiento por defecto (scroll, etc.) se anula mientras se juega.
const captured = new Set([
  ...PLAYER_CONTROLS.flatMap((s) => [...s.up, ...s.down, ...s.left, ...s.right, ...s.bomb]),
  "ShiftRight", "KeyC", "KeyE", "Backspace", "KeyQ", "KeyF", "Tab",
]);
const keyboard = new Keyboard(window, captured);
const menu = new Menu();

// --- Servidor de emparejamiento ---
// En la web se usa la propia URL; en VS Code la inyecta la extensión (ajuste arcade.serverUrl).
const injected = (window as { ARCADE_CONFIG?: { serverUrl?: string } }).ARCADE_CONFIG;
let signalUrl: string | null = null;
let onlineError: string | null = null;
if (injected) {
  if (injected.serverUrl) signalUrl = injected.serverUrl.replace(/\/$/, "") + "/api/signal";
  else onlineError = "Configura el ajuste «arcade.serverUrl» de VS Code con la URL de tu despliegue.";
} else if (location.protocol.startsWith("http")) {
  signalUrl = new URL("api/signal", location.href).href;
} else {
  onlineError = "Abre el juego desde el servidor (npm run serve) para jugar en red.";
}
const signal = signalUrl ? new SignalClient(signalUrl) : null;

// --- Pantalla activa ---
interface Screen {
  /** Tamaño lógico del juego (el lienzo se escala para que quepa). */
  readonly size: readonly [number, number];
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, pixelScale: number): void;
  key?(code: string): void;
  /** Partida terminada: con J se puede cambiar de juego (solo local y anfitrión). */
  readonly finished?: boolean;
  switchGame?(id: GameId): void;
  /** Esc dentro del juego (cerrar un inventario); true = no salir al menú. */
  escape?(): boolean;
}
const MENU_SIZE = DEFAULT_SIZE;
const BOMBER_SIZE = [SCREEN_W, SCREEN_H] as const;
let screen: Screen | null = null;
/** Objeto del juego en curso (local) o la sesión en red: solo lo usan las pruebas (?test). */
let current: unknown = null;
let host: HostSession | null = null;
let guest: GuestSession | null = null;
/** El selector de "Cambiar de juego" está abierto sobre la partida. */
let switching = false;

function showMain(error = "") {
  host?.close();
  guest?.close();
  host = guest = null;
  screen = current = null;
  switching = false;
  releasePointer(); // el menú se maneja con el ratón
  resetNames();
  menu.showMain(
    {
      local: () => menu.showPicker("Jugar en este equipo", startLocal, () => showMain()),
      host: () => menu.showPicker("¿A qué jugáis?", startHost, () => showMain()),
      join: startJoin,
      toggleGray,
      rename: setPlayerName,
      toggleBots: () => {
        setBots(!settings.bots);
        return settings.bots;
      },
      toggleCrt: () => {
        setCrt(!settings.crt);
        return settings.crt;
      },
    },
    onlineError,
    settings.grayscale,
    settings.name,
    settings.bots,
    settings.crt,
    error,
  );
}

function toggleGray() {
  setGrayscale(!settings.grayscale);
}

// Mantiene el botón del menú al día si se cambia con la tecla G o desde los ajustes de VS Code.
onSettingsChange(() => {
  const btn = document.querySelector<HTMLButtonElement>('[data-a="gray"]');
  if (!btn) return;
  btn.textContent = `Escala de grises: ${settings.grayscale ? "Sí" : "No"}`;
  btn.setAttribute("aria-pressed", String(settings.grayscale));
});

function play(s: Screen, game: unknown) {
  screen = s;
  current = game;
  resume();
}

function resume() {
  switching = false;
  menu.hide();
  canvas.focus();
}

/** Selector de juego sobre la partida terminada; la sala (si la hay) sigue abierta. */
function showSwitch(s: Screen) {
  switching = true;
  releasePointer();
  menu.showPicker("Cambiar de juego", (id) => {
    s.switchGame!(id);
    resume();
  }, resume);
}

/** Arranca un juego en este equipo; si algo falla, vuelve al menú en vez de dejar la pantalla en negro. */
function startLocal(id: GameId) {
  try {
    startGame(id);
  } catch (err) {
    console.error(`No se pudo empezar "${id}":`, err);
    showMain(`No se pudo empezar ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function startGame(id: GameId) {
  setName(0, myName(0));
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get("seed")) || undefined;
  if (id === "karts") {
    // Un jugador contra la IA; vale WASD o flechas.
    const game = new KartsHost(new KartsInput(keyboard), 0, "local", settings.bots);
    play({
      size: game.size, update: (dt) => game.update(dt), draw: (c, s) => game.draw(c, s), key: (code) => game.key(code),
      get finished() { return game.finished; }, switchGame: startLocal,
    }, game);
    return;
  }
  if (id === "stick") {
    // Un jugador contra los bots (o solo, si están desactivados).
    const game = new StickHost(new StickInput(keyboard), 0, "local", settings.bots);
    play({
      size: game.size, update: (dt) => game.update(dt), draw: (c) => game.draw(c), key: (code) => game.key(code),
      get finished() { return game.finished; }, switchGame: startLocal,
    }, game);
    return;
  }
  if (id === "ruleta") {
    // Tú contra el crupier, como en el original.
    const game = new RuletaHost(new RuletaInput(keyboard), 0, "local", settings.bots);
    play({
      size: game.size, update: (dt) => game.update(dt), draw: (c, s) => game.draw(c, s), key: (code) => game.key(code),
      get finished() { return game.finished; }, switchGame: startLocal,
    }, game);
    return;
  }
  if (id === "blocks" || id === "survival") {
    // Mundo propio, creativo o de supervivencia (en red se comparte el del anfitrión). ?seed=N fija el mundo.
    const game = new BlocksHost(new BlocksInput(keyboard), 0, "local", id, seed);
    play({
      size: game.size, update: (dt) => game.update(dt), draw: (c, s) => game.draw(c, s), key: () => game.key(),
      get finished() { return game.finished; }, switchGame: startLocal, escape: () => game.escape(),
    }, game);
    return;
  }
  if (id === "casino") {
    // El salón lo lleva este equipo: se anda hasta las mesas y se apuesta en ellas.
    const game = new CasinoHost(new CasinoInput(keyboard), 0, "local");
    play({
      size: game.size, update: (dt) => game.update(dt), draw: (c, s) => game.draw(c, s), key: (code) => game.key(code),
      get finished() { return game.finished; }, switchGame: startLocal,
    }, game);
    return;
  }
  if (id === "pool") {
    // Tú contra la CPU; sin bots, dos jugadores por turnos en este equipo.
    const game = new PoolHost(new PoolInput(keyboard), 0, "local", settings.bots);
    play({
      size: game.size, update: (dt) => game.update(dt), draw: (c, s) => game.draw(c, s), key: (code) => game.key(code),
      get finished() { return game.finished; }, switchGame: startLocal,
    }, game);
    return;
  }
  if (id === "balls") {
    // Un jugador contra tres bolas de la IA.
    const game = new BallsHost(new BallsInput(keyboard), 0, "local", settings.bots);
    play({
      size: game.size, update: (dt) => game.update(dt), draw: (c, s) => game.draw(c, s), key: (code) => game.key(code),
      get finished() { return game.finished; }, switchGame: startLocal,
    }, game);
    return;
  }
  const players = params.get("players") === "1" ? 1 : 2;
  const sources = PLAYER_CONTROLS.map((scheme) => new LocalController(keyboard, scheme));
  const game = new Game(sources, players, seed, "local");
  play({
    size: BOMBER_SIZE, update: (dt) => game.update(dt), draw: (c, s) => game.draw(c, s), key: (code) => game.handleKey(code),
    get finished() { return game.over; }, switchGame: startLocal,
  }, game);
}

async function startHost(id: GameId) {
  if (!signal) return;
  const session = new HostSession(signal, id);
  host = session;
  menu.showMessage("Creando sala...", "Contactando con el servidor de emparejamiento.");
  const refresh = () => {
    if (host !== session || session.game) return;
    const names = [
      `${myName(0)} (tú, anfitrión)`,
      ...session.readyPeers.map((p, i) => `${p.name || defaultName(i + 1)} · ${TRANSPORT_LABEL[p.transport]}`),
    ];
    menu.showLobby(session.code, gameName(id), names, start, () => showMain());
  };
  const start = () => {
    session.start(keyboard);
    // session.game cambia al cambiar de juego: se consulta en cada uso.
    play({
      get size() { return session.game!.size; },
      update: (dt) => session.update(dt),
      draw: (c, s) => session.game!.draw(c, s),
      key: (code) => session.game!.key(code),
      get finished() { return session.game!.finished; },
      switchGame: (next) => session.switchGame(next),
      escape: () => !!session.game?.escape?.(),
    }, session);
  };
  session.onChange = refresh;
  session.onError = (msg) => host === session && !session.game && showMain(msg);
  try {
    await session.open();
    refresh();
  } catch (err) {
    if (host === session) showMain((err as Error).message);
  }
}

async function startJoin(code: string) {
  if (!signal) return;
  const session = new GuestSession(signal, keyboard);
  guest = session;
  screen = current = session;
  menu.showMessage("Conectando...", `Uniéndose a la sala ${code}. Probando conexión directa...`, {
    label: "Cancelar",
    onClick: () => showMain(),
  });
  session.onStatus = (status) => {
    if (guest !== session) return;
    if (status === "relay-fallback") {
      menu.showMessage("Usando Vercel como puente", "La red no permite conexión directa entre equipos. Conectando por Vercel...", {
        label: "Cancelar",
        onClick: () => showMain(),
      });
    } else if (status === "waiting") {
      const how = session.transport === "relay" ? "vía Vercel" : "directa";
      menu.showMessage(`Conectado (${how})`, "Esperando a que el anfitrión empiece la partida...", {
        label: "Salir",
        onClick: () => showMain(),
      });
    } else if (status === "playing") {
      menu.hide();
      canvas.focus();
    } else if (status === "lost") {
      menu.showMessage("Conexión perdida", "Se ha cortado la conexión con el anfitrión.", {
        label: "Volver al menú",
        onClick: () => showMain(),
      });
    }
  };
  try {
    await session.connect(code);
  } catch (err) {
    if (guest === session) showMain((err as Error).message);
  }
}

window.addEventListener("keydown", (ev) => {
  if (ev.repeat || isTyping(ev)) return;
  if (ev.code === "Escape" && switching) resume();
  else if (ev.code === "Escape" && screen?.escape?.()) return;
  else if (ev.code === "Escape" && screen) showMain();
  else if (ev.code === "KeyG") toggleGray();
  else if (ev.code === "KeyJ" && !menu.visible && screen?.switchGame && screen.finished) showSwitch(screen);
  else if (!menu.visible) screen?.key?.(ev.code);
});

// --- Lienzo: escala a la ventana manteniendo proporción y nitidez ---
let pixelScale = 1;
let fitted: readonly [number, number] = [0, 0];
function fit(size: readonly [number, number]) {
  const [w, h] = size;
  const scale = Math.max(0.1, Math.min(window.innerWidth / w, window.innerHeight / h));
  const dpr = window.devicePixelRatio || 1;
  pixelScale = scale * dpr;
  canvas.style.width = `${Math.floor(w * scale)}px`;
  canvas.style.height = `${Math.floor(h * scale)}px`;
  canvas.width = Math.floor(w * pixelScale);
  canvas.height = Math.floor(h * pixelScale);
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  fitted = size;
}
window.addEventListener("resize", () => fit(fitted));
canvas.addEventListener("pointerdown", () => canvas.focus());

function render() {
  // Cada juego tiene su tamaño: se reajusta el lienzo al cambiar de juego.
  const size = screen?.size ?? MENU_SIZE;
  if (size[0] !== fitted[0] || size[1] !== fitted[1]) fit(size);
  if (screen) {
    screen.draw(ctx, pixelScale);
    if (settings.crt) drawCrt(ctx, pixelScale);
  } else {
    ctx.fillStyle = css(BG_COLOR);
    ctx.fillRect(0, 0, size[0], size[1]);
  }
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  screen?.update(dt);
  render();
  requestAnimationFrame(frame);
}

// --- Modo prueba (?test): el reloj no corre solo; las pruebas del navegador (scripts/shot.mjs)
// avanzan la simulación con dt fijo y dibujan cuando quieren, sin depender de los fps. ---
if (new URLSearchParams(location.search).has("test")) {
  (window as unknown as { __arcade: object }).__arcade = {
    /** Empieza un juego en local, como desde el menú. */
    start: (id: GameId) => startLocal(id),
    /** Avanza `n` pasos de simulación de `dt` segundos. */
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) screen?.update(dt);
    },
    /** Dibuja `n` veces (Bloques construye unos pocos chunks por dibujo). */
    draw(n = 1) {
      for (let i = 0; i < n; i++) render();
    },
    /** Pulsa o suelta una tecla (código como "KeyE"). */
    key(code: string, down = true) {
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code }));
    },
    /** Juego en curso (p. ej. BlocksHost) para leer o preparar su estado. */
    get game() {
      return current;
    },
  };
  showMain();
  render();
} else {
  showMain();
  requestAnimationFrame(frame);
}
