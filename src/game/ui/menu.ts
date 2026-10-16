// Menú HTML superpuesto al lienzo: elegir juego, crear sala, unirse, sala de espera.
// Pensado para la barra lateral de VS Code: se adapta a anchos y altos muy pequeños.
import { GAMES, type GameId } from "../hub";
import { MAX_NAME } from "../core/settings";

const STYLE = `
.bm-gray canvas, .bm-gray .bm-menu { filter: grayscale(1); }
.bm-menu { position: fixed; inset: 0; display: flex; align-items: safe center; justify-content: center;
  overflow-y: auto; padding: 6px; box-sizing: border-box;
  background: rgba(10,10,16,0.86); font-family: Arial, sans-serif; color: #ebebf5; z-index: 10; }
.bm-menu[hidden] { display: none; }
.bm-card { box-sizing: border-box; width: min(340px, 100%); margin: auto 0; background: #1c1c28;
  border: 1px solid #46465f; border-radius: 10px; padding: clamp(8px, 5vw, 22px);
  display: flex; flex-direction: column; gap: clamp(6px, 2.5vw, 11px); text-align: center; }
.bm-card h1 { margin: 0; font-size: clamp(16px, 9vw, 28px); letter-spacing: 2px; color: #ffcf50; }
.bm-card h2 { margin: 0; font-size: clamp(14px, 6vw, 19px); }
.bm-card p { margin: 0; color: #a5a5bd; font-size: clamp(11px, 3.6vw, 14px); line-height: 1.35; }
.bm-card button { font: bold clamp(12px, 4vw, 15px) Arial, sans-serif; padding: clamp(6px, 2.4vw, 10px) 10px;
  border-radius: 7px; border: 0; background: #3a6fd8; color: #fff; cursor: pointer; min-height: 30px; }
.bm-card button:hover:not(:disabled) { filter: brightness(1.12); }
.bm-card button:focus-visible, .bm-row input:focus-visible { outline: 2px solid #ffcf50; outline-offset: 1px; }
.bm-card button:disabled { opacity: 0.45; cursor: default; }
.bm-card button.bm-secondary { background: #34344a; }
.bm-card button.bm-small { font-size: clamp(11px, 3.4vw, 13px); min-height: 26px; padding: 5px 8px; }
.bm-row { display: flex; gap: 6px; }
.bm-row input { flex: 1; min-width: 0; font: bold clamp(14px, 5vw, 18px) Arial, sans-serif; text-transform: uppercase;
  letter-spacing: 3px; text-align: center; padding: clamp(5px, 2vw, 8px); border-radius: 7px;
  border: 1px solid #46465f; background: #12121a; color: #fff; }
.bm-row input.bm-name { text-transform: none; letter-spacing: 0; font-size: clamp(12px, 4vw, 15px); }
.bm-sep { border: 0; border-top: 1px solid #34344a; margin: 0; width: 100%; }
.bm-code { font: bold clamp(24px, 13vw, 42px) monospace; letter-spacing: 0.2em; color: #ffcf50; }
.bm-players { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; text-align: left; }
.bm-players li { display: flex; align-items: center; gap: 8px; padding: clamp(4px, 1.6vw, 7px) 8px; background: #252534;
  border-radius: 6px; font-size: clamp(11px, 3.6vw, 14px); overflow-wrap: anywhere; }
.bm-dot { width: 12px; height: 12px; border-radius: 50%; flex: none; display: inline-flex; align-items: center;
  justify-content: center; font: bold 9px Arial, sans-serif; color: #000; }
.bm-error { color: #ff7b7b !important; }
.bm-card button.bm-game { display: flex; flex-direction: column; gap: 2px; text-align: left; background: #2a3550; }
.bm-card button.bm-game b { font-size: clamp(13px, 4.6vw, 16px); color: #ffcf50; }
.bm-card button.bm-game span { font-weight: normal; font-size: clamp(10px, 3.2vw, 12px); color: #c8c8dc; }
/* Muy estrecho: código y botón apilados. */
@media (max-width: 230px) {
  .bm-row { flex-direction: column; }
  .bm-card h1 { letter-spacing: 1px; }
}
/* Muy bajo: fuera textos secundarios. */
@media (max-height: 300px) {
  .bm-optional { display: none; }
}
`;

const COLORS = ["#50aaff", "#ff5f5f", "#6edc6e", "#ffd246"];

/** Los bots solo existen en Karts y Sumo de bolas. */
const botsLabel = (on: boolean) => `Bots (Karts y Sumo): ${on ? "Sí" : "No"}`;

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
}

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
  showMain(h: MainHandlers, onlineError: string | null, gray: boolean, name: string, bots: boolean, lastError = "") {
    const off = onlineError !== null;
    const card = this.render(`
      <h1>ARCADE</h1>
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
    // Ojo: un manejador on* que devuelve false cancela la tecla; por eso no se devuelve nada.
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") join();
    });
  }

  /** Elegir juego del hub. */
  showPicker(title: string, onPick: (id: GameId) => void, onBack: () => void) {
    const options = GAMES.map(
      (g) => `<button data-game="${g.id}" class="bm-game"><b>${esc(g.name)}</b><span class="bm-optional">${esc(g.desc)}</span></button>`,
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
