// Servidor local: recompila el juego al vuelo, sirve web/ y la API /api/signal en memoria.
// Accesible desde otros equipos de la misma red. Puerto: `npm run serve -- 3000` o PORT. Por defecto 8000.
import * as esbuild from "esbuild";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const argPort = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const port = Number(argPort ?? process.env.PORT ?? 8000);

// Misma lógica de señalización que la función de Vercel.
const serverOut = path.resolve(".cache/signal.mjs");
await esbuild.build({
  entryPoints: ["src/server/signal.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: serverOut,
  logLevel: "warning",
});
const { handleSignal, redisFromEnv } = await import(pathToFileURL(serverOut).href);
const store = redisFromEnv(process.env);

const ctx = await esbuild.context({
  entryPoints: ["src/game/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  outdir: "web/dist",
  logLevel: "warning",
});
const internal = await ctx.serve({ servedir: "web", host: "127.0.0.1", port: 0 });

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 500_000) reject(new Error("too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleApi(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS).end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, CORS).end();
    return;
  }
  let status = 400;
  let data = { error: "JSON inválido" };
  try {
    const body = JSON.parse(await readBody(req));
    ({ status, data } = await handleSignal(store, body));
  } catch {
    // se responde con el error por defecto
  }
  res.writeHead(status, { ...CORS, "content-type": "application/json" }).end(JSON.stringify(data));
}

function proxy(req, res) {
  const upstream = http.request(
    { host: "127.0.0.1", port: internal.port, path: req.url, method: req.method, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => res.writeHead(502).end());
  req.pipe(upstream);
}

http
  .createServer((req, res) => (req.url?.startsWith("/api/signal") ? handleApi(req, res) : proxy(req, res)))
  .listen(port, "0.0.0.0", () => {
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === "IPv4" && !i.internal)
      .map((i) => `http://${i.address}:${port}`);
    console.log(`\n  Arcade en http://localhost:${port}`);
    for (const url of lan) console.log(`  En tu red:   ${url}`);
    console.log("");
  });
