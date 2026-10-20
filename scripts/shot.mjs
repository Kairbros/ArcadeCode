// Capturas del juego en Edge sin ventana, guiadas por un escenario: `npm run shot -- test/browser/survival.mjs [carpeta]`.
// Abre el juego con ?test (el reloj no corre solo: ver main.ts) y el escenario avanza la simulación, dibuja y captura.
// Intenta WebGL por la GPU (rápido); si no hay, cae a SwiftShader (por software, más lento pero igual de fiable).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [scenarioArg, outArg = ".cache/shots"] = process.argv.slice(2);
if (!scenarioArg) {
  console.log("Uso: npm run shot -- <escenario.mjs> [carpeta de salida]");
  process.exit(1);
}
const scenario = (await import(pathToFileURL(path.resolve(scenarioArg)).href)).default;
const out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const EDGE = process.env.EDGE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 8123, DEBUG = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
const quit = (code) => { for (const c of children) c.kill(); process.exit(code); };

// Servidor local (el mismo de `npm run serve`).
const server = spawn(process.execPath, ["scripts/serve.mjs", String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
children.push(server);
await new Promise((resolve) => server.stdout.on("data", (d) => String(d).includes("Arcade en") && resolve()));

async function launch(gl) {
  const edge = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${DEBUG}`, "--window-size=960,720", "--hide-scrollbars",
    `--user-data-dir=${path.resolve(".cache/edge-profile")}`, ...gl, `http://localhost:${PORT}/?test&seed=777`,
  ]);
  children.push(edge);
  let page;
  for (let i = 0; i < 80 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()).find((t) => t.type === "page"); } catch {}
    if (!page) await sleep(100);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown") console.log("EXCEPCIÓN:", m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    else if (m.method === "Runtime.consoleAPICalled") console.log("consola:", m.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable");
  return { edge, send };
}

/** Evalúa en la página y devuelve el valor (las excepciones se imprimen y lanzan). */
const evaluator = (send) => async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result.result.value;
};

let { edge, send } = await launch(["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]);
let js = evaluator(send);
for (let i = 0; i < 100 && !(await js("!!window.__arcade").catch(() => false)); i++) await sleep(100);
let gpu = await js(`(() => { const g = document.createElement("canvas").getContext("webgl2");
  const d = g && g.getExtension("WEBGL_debug_renderer_info"); return g ? g.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : g.RENDERER) : ""; })()`);
if (!gpu || /swiftshader/i.test(gpu)) {
  edge.kill();
  await sleep(500);
  ({ edge, send } = await launch(["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]));
  js = evaluator(send);
  for (let i = 0; i < 100 && !(await js("!!window.__arcade").catch(() => false)); i++) await sleep(100);
  gpu = "SwiftShader (por software)";
}
console.log("WebGL:", gpu);

const t0 = Date.now();
const api = {
  js,
  sleep,
  /** Empieza un juego en local (id del hub: "survival", "karts"...). */
  start: (id) => js(`__arcade.start(${JSON.stringify(id)})`),
  /** Avanza segundos de juego con pasos de 1/60 (instantáneo, no depende de los fps). */
  step: (seconds) => js(`__arcade.step(${Math.round(seconds * 60)})`),
  draw: (n = 1) => js(`__arcade.draw(${n})`),
  /** Mantiene una tecla durante `seconds` de juego. */
  hold: async (code, seconds) => { await js(`__arcade.key("${code}")`); await api.step(seconds); await js(`__arcade.key("${code}", false)`); },
  press: (code) => js(`__arcade.key("${code}"); __arcade.step(1); __arcade.key("${code}", false)`),
  /** Ratón real (CDP) en el centro o en (x, y): "down" / "up" / "click"; button "left" o "right". El primer clic captura el puntero. */
  mouse: async (action, button = "left", x = 480, y = 360) => {
    for (const type of action === "click" ? ["mousePressed", "mouseReleased"] : [action === "down" ? "mousePressed" : "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x, y, button, clickCount: 1 });
    }
  },
  /** Dibuja y guarda <carpeta>/<nombre>.png. */
  shot: async (name) => {
    await api.draw();
    const r = await send("Page.captureScreenshot", { format: "png" });
    const file = path.join(out, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    console.log("captura:", file);
  },
};
try {
  await scenario(api);
  console.log(`escenario terminado en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  quit(0);
} catch (err) {
  console.log("FALLO:", err.message);
  quit(1);
}
