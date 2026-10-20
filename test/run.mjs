// Ejecuta las pruebas de lógica en Node: `npm test` (todas) o `npm test -- drops red` (las que contengan esas palabras).
// Cada test/*.test.ts se empaqueta con esbuild (con el DOM falso de stubs.js) y corre en su propio proceso, en paralelo.
import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const filters = process.argv.slice(2);
const files = fs
  .readdirSync("test")
  .filter((f) => f.endsWith(".test.ts") && (!filters.length || filters.some((w) => f.includes(w))))
  .sort();
if (!files.length) {
  console.log("Ninguna prueba coincide con:", filters.join(" "));
  process.exit(1);
}

const outdir = path.resolve(".cache/test");
await esbuild.build({
  entryPoints: files.map((f) => `test/${f}`),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outdir,
  outExtension: { ".js": ".mjs" },
  inject: ["test/stubs.js"],
  logLevel: "warning",
});

const run = (file) =>
  new Promise((resolve) => {
    const start = Date.now();
    const out = [];
    const child = spawn(process.execPath, [path.join(outdir, file.replace(/\.ts$/, ".mjs"))]);
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => out.push(d));
    child.on("close", (code) => resolve({ file, code, ms: Date.now() - start, out: Buffer.concat(out).toString() }));
  });

const results = await Promise.all(files.map(run));
let bad = 0;
for (const r of results) {
  if (r.code !== 0) bad++;
  console.log(`${r.code === 0 ? "✓" : "✗"} ${r.file} (${(r.ms / 1000).toFixed(1)} s)`);
  console.log(r.out.trimEnd());
}
console.log(`\n${results.length - bad}/${results.length} pruebas correctas`);
process.exit(bad ? 1 : 0);
