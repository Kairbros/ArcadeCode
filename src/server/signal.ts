// Emparejamiento WebRTC + relé HTTP de respaldo, independiente del servidor (Vercel o servidor local).
//
// - Emparejamiento: el invitado deja su oferta SDP, el anfitrión responde. Si la red permite
//   conexión directa, la partida no vuelve a pasar por aquí.
// - Relé: si la conexión directa falla (p. ej. red corporativa), el estado de la partida y las
//   entradas viajan por este endpoint, guardados unos segundos en Redis.

/** Comando Redis: ["SET", clave, valor, "EX", 60] */
export type Cmd = (string | number)[];

/** Ejecuta comandos Redis en bloque y devuelve sus resultados en orden. */
export interface RedisLike {
  exec(cmds: Cmd[]): Promise<unknown[]>;
}

/** Redis mínimo en memoria (servidor local). Implementa solo los comandos que se usan aquí. */
export class MemoryRedis implements RedisLike {
  private data = new Map<string, { value: string | string[]; expires: number }>();

  private live(key: string) {
    const item = this.data.get(key);
    if (item && item.expires < Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return item;
  }

  private run([name, ...args]: Cmd): unknown {
    const key = String(args[0]);
    switch (String(name).toUpperCase()) {
      case "GET": {
        const v = this.live(key)?.value;
        return typeof v === "string" ? v : null;
      }
      case "MGET":
        return args.map((k) => {
          const v = this.live(String(k))?.value;
          return typeof v === "string" ? v : null;
        });
      case "SET": {
        const opts = args.slice(2).map(String);
        if (opts.includes("NX") && this.live(key)) return null;
        const ex = opts.indexOf("EX");
        const ttl = ex >= 0 ? Number(opts[ex + 1]) : 86_400;
        this.data.set(key, { value: String(args[1]), expires: Date.now() + ttl * 1000 });
        return "OK";
      }
      case "DEL":
        return this.data.delete(key) ? 1 : 0;
      case "EXPIRE": {
        const item = this.live(key);
        if (!item) return 0;
        item.expires = Date.now() + Number(args[1]) * 1000;
        return 1;
      }
      case "RPUSH": {
        const item = this.live(key);
        const list = Array.isArray(item?.value) ? item.value : [];
        list.push(...args.slice(1).map(String));
        this.data.set(key, { value: list, expires: item?.expires ?? Date.now() + 86_400_000 });
        return list.length;
      }
      case "LRANGE": {
        const v = this.live(key)?.value;
        return Array.isArray(v) ? [...v] : [];
      }
      case "LPOP": {
        const v = this.live(key)?.value;
        if (!Array.isArray(v) || !v.length) return null;
        const out = v.splice(0, Number(args[1] ?? 1));
        if (!v.length) this.data.delete(key);
        return args[1] === undefined ? out[0] : out;
      }
      default:
        throw new Error(`Comando no soportado: ${name}`);
    }
  }

  async exec(cmds: Cmd[]) {
    return cmds.map((c) => this.run(c));
  }
}

/** Upstash Redis por su API REST (sin dependencias). Cada bloque es una transacción. */
export class UpstashRedis implements RedisLike {
  constructor(private url: string, private token: string) {}

  async exec(cmds: Cmd[]) {
    const res = await fetch(this.url.replace(/\/$/, "") + "/multi-exec", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(cmds),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    return out.map((r) => {
      if (r.error) throw new Error(`Upstash: ${r.error}`);
      return r.result ?? null;
    });
  }
}

/** Upstash si hay credenciales (nombres de Upstash o de la integración de Vercel), si no memoria. */
export function redisFromEnv(env: Record<string, string | undefined>): RedisLike {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return url && token ? new UpstashRedis(url, token) : new MemoryRedis();
}

// --- Límites y formatos ---
const ROOM_TTL = 30 * 60; // sala abierta esperando jugadores
const HOST_TTL = 10 * 60; // clave del anfitrión: se renueva mientras publica
const OFFER_TTL = 5 * 60;
const RELAY_TTL = 60; // estado/entradas del relé: si nadie publica, caduca solo
const MAX_SDP = 20_000;
const MAX_STATE = 200_000;
const MAX_INPUT = 300;
const MAX_INPUT_BATCH = 200;
// Cada comando Redis cuenta para la cuota de Upstash: la clave del anfitrión se valida en memoria
// de la instancia (Vercel reutiliza instancias) y su caducidad se renueva solo de vez en cuando.
const HOST_CHECK_MS = 30_000;
const HOST_REFRESH_MS = 10_000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;
const ID_RE = /^[a-f0-9-]{36}$/;

export interface SignalResult {
  status: number;
  data: Record<string, unknown>;
}

const ok = (data: Record<string, unknown>): SignalResult => ({ status: 200, data });
const fail = (status: number, error: string): SignalResult => ({ status, data: { error } });

const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

function newCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

const hostCache = new Map<string, { key: string; checkedAt: number; refreshedAt: number }>();

/** Valida la clave del anfitrión. Devuelve si toca renovar la caducidad de sus claves. */
async function checkHost(r: RedisLike, code: string, hostKey: string): Promise<{ ok: boolean; refresh: boolean }> {
  const now = Date.now();
  const cached = hostCache.get(code);
  if (cached && cached.key === hostKey && now - cached.checkedAt < HOST_CHECK_MS) {
    const refresh = now - cached.refreshedAt > HOST_REFRESH_MS;
    if (refresh) cached.refreshedAt = now;
    return { ok: true, refresh };
  }
  const [stored] = await r.exec([["GET", `room:${code}:host`]]);
  if (stored !== hostKey) {
    hostCache.delete(code);
    return { ok: false, refresh: false };
  }
  if (hostCache.size > 1000) hostCache.clear();
  hostCache.set(code, { key: hostKey, checkedAt: now, refreshedAt: now });
  return { ok: true, refresh: true };
}

function parseList(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    try {
      return [JSON.parse(String(s))];
    } catch {
      return [];
    }
  });
}

export async function handleSignal(r: RedisLike, body: unknown): Promise<SignalResult> {
  if (!body || typeof body !== "object") return fail(400, "Petición inválida");
  const b = body as Record<string, unknown>;
  const action = b.action;

  if (action === "create") {
    const hostKey = crypto.randomUUID();
    for (let i = 0; i < 10; i++) {
      const code = newCode();
      const [created] = await r.exec([["SET", `room:${code}`, "open", "EX", ROOM_TTL, "NX"]]);
      if (created === "OK") {
        await r.exec([["SET", `room:${code}:host`, hostKey, "EX", HOST_TTL]]);
        return ok({ code, hostKey });
      }
    }
    return fail(503, "No hay códigos libres, inténtalo de nuevo");
  }

  const code = typeof b.code === "string" ? b.code.toUpperCase() : "";
  if (!CODE_RE.test(code)) return fail(400, "Código de sala inválido");
  const k = (suffix: string) => `room:${code}:${suffix}`;

  // --- Acciones de invitado ---
  switch (action) {
    case "join": {
      // offer null = el invitado no puede usar WebRTC: va directo al relé.
      if (b.offer !== null && !isStr(b.offer, MAX_SDP)) return fail(400, "Oferta inválida");
      const [state] = await r.exec([["GET", `room:${code}`]]);
      if (state !== "open") return fail(404, "Sala no encontrada o partida ya empezada");
      const guestId = crypto.randomUUID();
      if (b.offer === null) {
        await r.exec([["RPUSH", k("relays"), JSON.stringify(guestId)], ["EXPIRE", k("relays"), OFFER_TTL]]);
      } else {
        await r.exec([
          ["RPUSH", k("offers"), JSON.stringify({ guestId, offer: b.offer })],
          ["EXPIRE", k("offers"), OFFER_TTL],
        ]);
      }
      return ok({ guestId });
    }
    case "poll": {
      if (!isId(b.guestId)) return fail(400, "Invitado inválido");
      const [answer] = await r.exec([["GET", k(`answer:${b.guestId}`)]]);
      return ok({ answer: answer ?? null });
    }
    case "relay": {
      if (!isId(b.guestId)) return fail(400, "Invitado inválido");
      const [state] = await r.exec([["GET", `room:${code}`]]);
      if (state !== "open") return fail(404, "Sala no encontrada o partida ya empezada");
      await r.exec([["RPUSH", k("relays"), JSON.stringify(b.guestId)], ["EXPIRE", k("relays"), OFFER_TTL]]);
      return ok({ ok: true });
    }
    case "guest-sync": {
      // Envía la entrada del invitado (si hay) y devuelve el último estado publicado.
      if (!isId(b.guestId)) return fail(400, "Invitado inválido");
      const cmds: Cmd[] = [];
      if (b.m !== undefined) {
        const m = JSON.stringify(b.m);
        if (m.length > MAX_INPUT) return fail(400, "Entrada demasiado grande");
        cmds.push(["RPUSH", k("in"), JSON.stringify({ g: b.guestId, m: b.m })], ["EXPIRE", k("in"), RELAY_TTL]);
      }
      cmds.push(["MGET", k("snap"), k(`w:${b.guestId}`)]);
      const res = await r.exec(cmds);
      const [snap, index] = res[res.length - 1] as (string | null)[];
      // El delta indica sobre qué base se calculó; solo se manda la base si el invitado no la tiene.
      let base: unknown = null;
      let snapBase = -1;
      try {
        snapBase = snap ? Number((JSON.parse(snap) as { base?: unknown }).base) : -1;
      } catch {
        // estado corrupto: se ignora
      }
      if (snapBase >= 0 && snapBase !== Number(b.baseSeq)) [base] = await r.exec([["GET", k("base")]]);
      return ok({ snap, base, index: index === null ? null : Number(index) });
    }
  }

  // --- Acciones de anfitrión: requieren su clave secreta ---
  if (!isId(b.hostKey)) return fail(403, "Falta la clave del anfitrión");
  const host = await checkHost(r, code, b.hostKey);
  if (!host.ok) return fail(403, "Clave del anfitrión incorrecta o sala caducada");

  switch (action) {
    case "offers": {
      const [offers, , relays] = await r.exec([
        ["LRANGE", k("offers"), 0, -1],
        ["DEL", k("offers")],
        ["LRANGE", k("relays"), 0, -1],
        ["DEL", k("relays")],
        ["EXPIRE", `room:${code}`, ROOM_TTL],
        ["EXPIRE", k("host"), HOST_TTL],
      ]);
      return ok({ offers: parseList(offers), relays: parseList(relays) });
    }
    case "answer": {
      if (!isId(b.guestId) || !isStr(b.answer, MAX_SDP)) return fail(400, "Respuesta inválida");
      await r.exec([["SET", k(`answer:${b.guestId}`), b.answer, "EX", OFFER_TTL]]);
      return ok({ ok: true });
    }
    case "close": {
      await r.exec([["DEL", `room:${code}`]]);
      return ok({ ok: true });
    }
    case "host-sync": {
      // Publica el estado para los invitados por relé y recoge sus entradas.
      // Lo habitual son 2 comandos: guardar el delta y recoger las entradas.
      if (!isStr(b.snap, MAX_STATE)) return fail(400, "Estado inválido");
      const cmds: Cmd[] = [["SET", k("snap"), b.snap, "EX", RELAY_TTL]];
      if (b.base !== undefined) {
        if (!isStr(b.base, MAX_STATE)) return fail(400, "Base inválida");
        cmds.push(["SET", k("base"), b.base, "EX", RELAY_TTL]);
      }
      if (b.welcomes && typeof b.welcomes === "object") {
        for (const [gid, idx] of Object.entries(b.welcomes as Record<string, unknown>)) {
          if (isId(gid) && Number.isInteger(idx)) cmds.push(["SET", k(`w:${gid}`), Number(idx), "EX", HOST_TTL]);
        }
      }
      if (host.refresh) cmds.push(["EXPIRE", k("base"), RELAY_TTL], ["EXPIRE", k("host"), HOST_TTL]);
      cmds.push(["LPOP", k("in"), MAX_INPUT_BATCH]);
      const res = await r.exec(cmds);
      return ok({ msgs: parseList(res[res.length - 1]) });
    }
    default:
      return fail(400, "Acción desconocida");
  }
}
