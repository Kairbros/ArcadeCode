import * as vscode from "vscode";

const SECTION = "arcade"; // prefijo de la vista, el comando y los ajustes en package.json
const VIEW_ID = `${SECTION}.view`;

export function activate(context: vscode.ExtensionContext) {
  const provider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    // Vista dentro del Explorador (debajo de los archivos).
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    // Pestaña grande en el editor.
    vscode.commands.registerCommand(`${SECTION}.play`, () => GamePanel.show(context.extensionUri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      // Si cambia la URL del servidor, se recarga el juego con la nueva.
      if (e.affectsConfiguration(`${SECTION}.serverUrl`)) {
        provider.refresh();
        GamePanel.refresh();
      }
      // La escala de grises se aplica en caliente, sin recargar la partida.
      if (e.affectsConfiguration(`${SECTION}.grayscale`)) {
        const msg = { type: "grayscale", value: readGrayscale() };
        provider.post(msg);
        GamePanel.post(msg);
      }
    }),
  );
}

export function deactivate() {}

function setupWebview(webview: vscode.Webview, extensionUri: vscode.Uri): vscode.Disposable {
  const distUri = vscode.Uri.joinPath(extensionUri, "dist");
  webview.options = { enableScripts: true, localResourceRoots: [distUri] };
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "game.js"));
  webview.html = renderHtml(webview, scriptUri, readServerUrl(), readGrayscale(), readPlayerName(), readBots(), readCrt());
  // El juego pide guardar sus preferencias (escala de grises, nombre) en los ajustes del usuario.
  return webview.onDidReceiveMessage((msg: { type?: string; value?: unknown }) => {
    const config = vscode.workspace.getConfiguration(SECTION);
    if (msg?.type === "setGrayscale" && typeof msg.value === "boolean" && msg.value !== readGrayscale()) {
      void config.update("grayscale", msg.value, vscode.ConfigurationTarget.Global);
    } else if (msg?.type === "setBots" && typeof msg.value === "boolean" && msg.value !== readBots()) {
      void config.update("bots", msg.value, vscode.ConfigurationTarget.Global);
    } else if (msg?.type === "setCrt" && typeof msg.value === "boolean" && msg.value !== readCrt()) {
      void config.update("crt", msg.value, vscode.ConfigurationTarget.Global);
    } else if (msg?.type === "setPlayerName" && typeof msg.value === "string" && msg.value !== readPlayerName()) {
      void config.update("playerName", msg.value.slice(0, 12), vscode.ConfigurationTarget.Global);
    }
  });
}

function readCrt(): boolean {
  return vscode.workspace.getConfiguration(SECTION).get<boolean>("crt", true);
}

function readBots(): boolean {
  return vscode.workspace.getConfiguration(SECTION).get<boolean>("bots", true);
}

function readPlayerName(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>("playerName", "");
}

function readGrayscale(): boolean {
  return vscode.workspace.getConfiguration(SECTION).get<boolean>("grayscale", false);
}

class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private listener: vscode.Disposable | undefined;

  constructor(private extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    this.listener = setupWebview(view.webview, this.extensionUri);
    view.onDidDispose(() => {
      this.listener?.dispose();
      this.view = undefined;
    });
  }

  refresh() {
    if (!this.view) return;
    this.listener?.dispose();
    this.listener = setupWebview(this.view.webview, this.extensionUri);
  }

  post(msg: unknown) {
    void this.view?.webview.postMessage(msg);
  }
}

class GamePanel {
  private static current: vscode.WebviewPanel | undefined;
  private static listener: vscode.Disposable | undefined;
  private static extensionUri: vscode.Uri;

  static show(extensionUri: vscode.Uri) {
    GamePanel.extensionUri = extensionUri;
    if (GamePanel.current) {
      GamePanel.current.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(SECTION, "Arcade", vscode.ViewColumn.Active, {
      retainContextWhenHidden: true,
    });
    GamePanel.listener = setupWebview(panel.webview, extensionUri);
    panel.onDidDispose(() => {
      GamePanel.listener?.dispose();
      GamePanel.current = undefined;
    });
    GamePanel.current = panel;
  }

  static refresh() {
    if (!GamePanel.current) return;
    GamePanel.listener?.dispose();
    GamePanel.listener = setupWebview(GamePanel.current.webview, GamePanel.extensionUri);
  }

  static post(msg: unknown) {
    void GamePanel.current?.webview.postMessage(msg);
  }
}

/** URL del servidor de emparejamiento (Vercel o local). Vacía si no es una URL http(s) válida. */
function readServerUrl(): string {
  const raw = vscode.workspace.getConfiguration(SECTION).get<string>("serverUrl", "").trim();
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

function renderHtml(
  webview: vscode.Webview, scriptUri: vscode.Uri, serverUrl: string, grayscale: boolean, playerName: string,
  bots: boolean, crt: boolean,
): string {
  const nonce = makeNonce();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    serverUrl ? `connect-src ${serverUrl}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  const config = JSON.stringify({ serverUrl, grayscale, playerName, bots, crt }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #14141c; overflow: hidden; }
    body { display: flex; align-items: center; justify-content: center; }
    canvas { display: block; outline: none; }
  </style>
</head>
<body>
  <canvas id="game" tabindex="0"></canvas>
  <script nonce="${nonce}">window.ARCADE_CONFIG = ${config};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
