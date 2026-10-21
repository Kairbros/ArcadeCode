// Función serverless de Vercel: POST /api/signal
// El proyecto es ESM ("type": "module"): las importaciones relativas llevan extensión .js.
import { handleSignal, redisFromEnv } from "../src/server/signal.js";

const store = redisFromEnv(process.env);

// Permite llamadas desde el webview de VS Code (origen vscode-webview://).
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export function GET() {
  return Response.json({ ok: true, info: "Usa POST" }, { headers: CORS });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400, headers: CORS });
  }
  try {
    const { status, data } = await handleSignal(store, body);
    return Response.json(data, { status, headers: CORS });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500, headers: CORS });
  }
}
