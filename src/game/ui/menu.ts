// Menú HTML superpuesto al lienzo: elegir juego, crear sala, unirse, sala de espera.
// Pensado para la barra lateral de VS Code: se adapta a anchos y altos muy pequeños.
import { GAMES, type GameId } from "../hub";
import { MAX_NAME } from "../core/settings";
import type { RGB } from "../core/config";
import { titleText, titleWidth } from "../core/draw";

// Estilo de recreativa: letra monoespaciada en mayúsculas, esquinas rectas, sombras duras, neón
// y líneas de barrido. (La CSP del webview no deja cargar fuentes: el logo se dibuja con la fuente
// de píxeles de los juegos y va como imagen.)
const STYLE = `
.bm-gray canvas, .bm-gray .bm-menu { filter: grayscale(1); }
.bm-menu { position: fixed; inset: 0; display: flex; align-items: safe center; justify-content: center;
  overflow-y: auto; padding: 6px; box-sizing: border-box; z-index: 10; color: #ebebf5;
  font-family: "Lucida Console", "Courier New", ui-monospace, monospace; font-weight: bold;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px),
    radial-gradient(ellipse at center, rgba(40,20,90,0.9), rgba(4,4,14,0.96) 75%); }
.bm-menu[hidden] { display: none; }
.bm-card { box-sizing: border-box; width: min(340px, 100%); margin: auto 0; background: #0b0b1e;
  border: 3px solid #ff3d8b; box-shadow: 0 0 0 3px #000, 0 0 0 5px #3df2ff, 0 0 22px rgba(61,242,255,0.35);
  padding: clamp(8px, 5vw, 20px); display: flex; flex-direction: column; gap: clamp(6px, 2.5vw, 10px);
  text-align: center; text-transform: uppercase; }
.bm-logo { display: block; margin: 0 auto; width: min(100%, 250px); image-rendering: pixelated; }
.bm-card h1 { margin: 0; }
.bm-card h2 { margin: 0; font-size: clamp(13px, 5.5vw, 17px); letter-spacing: 2px; color: #ffcf50;
  text-shadow: 2px 2px 0 #b2223f, 0 0 8px rgba(255,207,80,0.45); }
.bm-card p { margin: 0; color: #9fa0c8; font-size: clamp(10px, 3.3vw, 12px); line-height: 1.4; letter-spacing: 1px; }
.bm-blink { color: #3df2ff !important; animation: bm-blink 1.1s steps(1) infinite; }
@keyframes bm-blink { 50% { visibility: hidden; } }
.bm-card button { font: inherit; font-size: clamp(11px, 3.8vw, 14px); letter-spacing: 1px; text-transform: uppercase;
  padding: clamp(6px, 2.4vw, 9px) 10px; border-radius: 0; border: 2px solid #000; background: #2b4fe0; color: #fff;
  cursor: pointer; min-height: 30px; box-shadow: inset 0 -3px 0 rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.25), 3px 3px 0 #000;
  text-shadow: 1px 1px 0 #000; }
.bm-card button:hover:not(:disabled), .bm-card button:focus-visible { filter: brightness(1.18); }
.bm-card button:hover:not(:disabled)::before, .bm-card button:focus-visible::before { content: "▶ "; color: #ffcf50; }
.bm-card button.bm-game:hover:not(:disabled)::before, .bm-card button.bm-game:focus-visible::before { content: none; }
.bm-card button:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: inset 0 -3px 0 rgba(0,0,0,0.35), 1px 1px 0 #000; }
.bm-card button:focus-visible, .bm-row input:focus-visible { outline: 2px solid #ffcf50; outline-offset: 2px; }
.bm-card button:disabled { opacity: 0.4; cursor: default; }
.bm-card button.bm-secondary { background: #3a3a5c; }
.bm-card button.bm-small { font-size: clamp(10px, 3.2vw, 12px); min-height: 26px; padding: 5px 8px; }
.bm-row { display: flex; gap: 6px; }
.bm-row input { flex: 1; min-width: 0; font: inherit; font-size: clamp(14px, 5vw, 18px); text-transform: uppercase;
  letter-spacing: 3px; text-align: center; padding: clamp(5px, 2vw, 8px); border-radius: 0;
  border: 2px solid #3df2ff; background: #000; color: #6cff8f; text-shadow: 0 0 6px rgba(108,255,143,0.6);
  box-shadow: inset 2px 2px 0 rgba(255,255,255,0.08); }
.bm-row input::placeholder { color: #2f6b45; text-shadow: none; }
.bm-row input.bm-name { letter-spacing: 1px; font-size: clamp(12px, 4vw, 15px); }
.bm-sep { border: 0; height: 2px; margin: 2px 0; width: 100%;
  background: repeating-linear-gradient(90deg, #ff3d8b 0 6px, transparent 6px 10px); }
.bm-code { font-size: clamp(24px, 13vw, 42px); letter-spacing: 0.2em; color: #6cff8f;
  text-shadow: 3px 3px 0 #0b5b2a, 0 0 12px rgba(108,255,143,0.6); }
.bm-players { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; text-align: left; }
.bm-players li { display: flex; align-items: center; gap: 8px; padding: clamp(4px, 1.6vw, 7px) 8px; background: #16163a;
  border-left: 4px solid #3df2ff; font-size: clamp(11px, 3.4vw, 13px); overflow-wrap: anywhere; }
.bm-dot { width: 14px; height: 14px; flex: none; display: inline-flex; align-items: center;
  justify-content: center; font-size: 10px; color: #000; box-shadow: 1px 1px 0 #000; }
.bm-error { color: #ff6b6b !important; }
.bm-card button.bm-game { display: flex; flex-direction: column; gap: 3px; text-align: left; background: #14143a;
  border: 2px solid var(--accent, #3df2ff); box-shadow: 3px 3px 0 #000, inset 6px 0 0 var(--accent, #3df2ff); padding-left: 16px; }
.bm-card button.bm-game b { font-size: clamp(12px, 4.4vw, 15px); color: var(--accent, #ffcf50); }
.bm-card button.bm-game span { font-weight: normal; text-transform: none; font-size: clamp(10px, 3.1vw, 12px); color: #c8c8e6; letter-spacing: 0; }
/* Muy estrecho: código y botón apilados. */
@media (max-width: 230px) {
  .bm-row { flex-direction: column; }
}
/* Muy bajo: fuera textos secundarios. */
@media (max-height: 300px) {
  .bm-optional { display: none; }
}
`;

/** Color de acento de cada juego en el selector. */
const GAME_ACCENTS = ["#ff5f5f", "#ffcf50", "#3df2ff", "#6edc6e", "#ff3d8b", "#c77dff"];
const LOGO_COLORS: RGB[] = [[255, 95, 95], [255, 207, 80], [110, 220, 110], [61, 242, 255], [199, 125, 255], [255, 61, 139]];

/** Logo "ARCADE" con la fuente de píxeles: cada letra de un color, con contorno y sombra. */
let logoUrl = "";
function logo(): string {
  if (logoUrl) return logoUrl;
  const word = "ARCADE";
  const font = "18px";
  const gap = 2;
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const widths = [...word].map((ch) => titleWidth(g, ch, font));
  c.width = Math.ceil(widths.reduce((a, b) => a + b, 0) + gap * (word.length - 1) + 12);
  c.height = 28;
  let x = 5;
  [...word].forEach((ch, i) => {
    titleText(g, ch, x, 3, LOGO_COLORS[i % LOGO_COLORS.length], font, "left");
    x += widths[i] + gap;
  });
  logoUrl = c.toDataURL();
  return logoUrl;
}

const COLORS = ["#50aaff", "#ff5f5f", "#6edc6e", "#ffd246"];

/** Los bots existen en Karts, Sumo de bolas y Monigotes (no en Bomberman). */
const botsLabel = (on: boolean) => `Bots: ${on ? "Sí" : "No"}`;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export interface MainHandlers {
  local(): void;
  host(): void;
  join(code: string): void;
  toggleGray(): void;
  rename(name: string): void;
  /** Cambia los bots y devuelve el nuevo valor. */
  toggleBots(): boolean;
  /** Cambia el efecto de pantalla de tubo y devuelve el nuevo valor. */
  toggleCrt(): boolean;
}

const crtLabel = (on: boolean) => `Efecto CRT: ${on ? "Sí" : "No"}`;

export class Menu {
  private root: HTMLDivElement;

  constructor() {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);
    this.root = document.createElement("div");
    this.root.className = "bm-menu";
    document.body.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  hide() {
    this.root.hidden = true;
  }

  private render(html: string): HTMLDivElement {
    this.root.hidden = false;
    this.root.innerHTML = `<div class="bm-card">${html}</div>`;
    this.root.scrollTop = 0;
    return this.root.firstElementChild as HTMLDivElement;
  }

  /** onlineError: si no es null, el modo en red está desactivado y se explica el motivo. */
  showMain(
    h: MainHandlers, onlineError: string | null, gray: boolean, name: string, bots: boolean, crt: boolean, lastError = "",
  ) {
    const off = onlineError !== null;
    const card = this.render(`
      <h1><img class="bm-logo" src="${logo()}" alt="ARCADE"></h1>
      <p class="bm-blink bm-optional">— Elige modo —</p>
      <div class="bm-row">
        <input data-a="name" class="bm-name" maxlength="${MAX_NAME}" placeholder="Tu nombre" aria-label="Tu nombre"
          autocomplete="off" spellcheck="false" value="${esc(name)}">
      </div>
      <button data-a="local">Jugar en este equipo</button>
      <hr class="bm-sep">
      <p class="bm-optional">En red (hasta 4)</p>
      <button data-a="host" ${off ? "disabled" : ""}>Crear sala</button>
      <div class="bm-row">
        <input maxlength="4" placeholder="CÓDIGO" aria-label="Código de sala" autocomplete="off" spellcheck="false" ${off ? "disabled" : ""}>
        <button data-a="join" ${off ? "disabled" : ""}>Unirse</button>
      </div>
      ${off ? `<p>${esc(onlineError)}</p>` : ""}
      ${lastError ? `<p class="bm-error">${esc(lastError)}</p>` : ""}
      <hr class="bm-sep">
      <button data-a="bots" class="bm-secondary bm-small" aria-pressed="${bots}">${botsLabel(bots)}</button>
      <button data-a="gray" class="bm-secondary bm-small" aria-pressed="${gray}">Escala de grises: ${gray ? "Sí" : "No"}</button>
      <button data-a="crt" class="bm-secondary bm-small" aria-pressed="${crt}">${crtLabel(crt)}</button>
      <p class="bm-optional">Tecla G en partida · Esc vuelve al menú</p>
    `);
    const nameInput = card.querySelector<HTMLInputElement>('[data-a="name"]')!;
    // "change" salta al salir del campo (también al pulsar un botón): se guarda una vez, no por tecla.
    nameInput.addEventListener("change", () => h.rename(nameInput.value));
    const input = card.querySelector<HTMLInputElement>('input:not([data-a="name"])')!;
    const join = () => {
      const code = input.value.trim().toUpperCase();
      if (code.length === 4) h.join(code);
      else input.focus();
    };
    card.querySelector<HTMLButtonElement>('[data-a="local"]')!.onclick = () => h.local();
    card.querySelector<HTMLButtonElement>('[data-a="host"]')!.onclick = () => h.host();
    card.querySelector<HTMLButtonElement>('[data-a="join"]')!.onclick = join;
    card.querySelector<HTMLButtonElement>('[data-a="gray"]')!.onclick = () => h.toggleGray();
    const botsBtn = card.querySelector<HTMLButtonElement>('[data-a="bots"]')!;
    botsBtn.onclick = () => {
      const on = h.toggleBots();
      botsBtn.textContent = botsLabel(on);
      botsBtn.setAttribute("aria-pressed", String(on));
    };
    const crtBtn = card.querySelector<HTMLButtonElement>('[data-a="crt"]')!;
    crtBtn.onclick = () => {
      const on = h.toggleCrt();
      crtBtn.textContent = crtLabel(on);
      crtBtn.setAttribute("aria-pressed", String(on));
    };
    // Ojo: un manejador on* que devuelve false cancela la tecla; por eso no se devuelve nada.
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") join();
    });
  }

  /** Elegir juego del hub. */
  showPicker(title: string, onPick: (id: GameId) => void, onBack: () => void) {
    const options = GAMES.map(
      (g, i) => `<button data-game="${g.id}" class="bm-game" style="--accent:${GAME_ACCENTS[i % GAME_ACCENTS.length]}"><b>${esc(g.name)}</b><span class="bm-optional">${esc(g.desc)}</span></button>`,
    ).join("");
    const card = this.render(`
      <h2>${esc(title)}</h2>
      ${options}
      <button data-a="back" class="bm-secondary bm-small">Volver</button>
    `);
    card.querySelectorAll<HTMLButtonElement>("[data-game]").forEach((b) => {
      b.onclick = () => onPick(b.dataset.game as GameId);
    });
    card.querySelector<HTMLButtonElement>('[data-a="back"]')!.onclick = onBack;
  }

  showLobby(code: string, game: string, players: string[], onStart: () => void, onCancel: () => void) {
    const items = players
      .map((name, i) => `<li><span class="bm-dot" style="background:${COLORS[i]}">${i + 1}</span>${esc(name)}</li>`)
      .join("");
    const card = this.render(`
      <h2>Sala de ${esc(game)}</h2>
      <p class="bm-optional">Comparte el código:</p>
      <div class="bm-code">${esc(code)}</div>
      <ul class="bm-players">${items}</ul>
      <p>${players.length < 2 ? "Esperando jugadores..." : `${players.length} jugadores listos`}</p>
      <button data-a="start" ${players.length < 2 ? "disabled" : ""}>Empezar partida</button>
      <button data-a="cancel" class="bm-secondary">Cancelar</button>
    `);
    card.querySelector<HTMLButtonElement>('[data-a="start"]')!.onclick = onStart;
    card.querySelector<HTMLButtonElement>('[data-a="cancel"]')!.onclick = onCancel;
  }

  showMessage(title: string, body: string, button?: { label: string; onClick: () => void }) {
    const card = this.render(`
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
      ${button ? `<button data-a="btn" class="bm-secondary">${esc(button.label)}</button>` : ""}
    `);
    if (button) card.querySelector<HTMLButtonElement>('[data-a="btn"]')!.onclick = button.onClick;
  }
}
