// Cliente de /api/signal: emparejamiento WebRTC y relé HTTP de respaldo.

export interface GuestSyncResult {
  snap: string | null; // SnapshotDelta en JSON
  base: string | null; // SnapshotBase en JSON (solo si cambió)
  index: number | null; // índice de jugador asignado al empezar
}

export class SignalClient {
  constructor(private url: string) {}

  private async call<T>(body: object): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("No se pudo contactar con el servidor");
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Error del servidor (${res.status})`);
    return data as T;
  }

  // --- invitado ---
  /** offer null: sin WebRTC, va directo al relé. */
  join(code: string, offer: string | null) {
    return this.call<{ guestId: string }>({ action: "join", code, offer });
  }

  poll(code: string, guestId: string) {
    return this.call<{ answer: string | null }>({ action: "poll", code, guestId });
  }

  relay(code: string, guestId: string) {
    return this.call<{ ok: true }>({ action: "relay", code, guestId });
  }

  guestSync(code: string, guestId: string, baseSeq: number, m?: object) {
    return this.call<GuestSyncResult>({ action: "guest-sync", code, guestId, baseSeq, m });
  }

  // --- anfitrión ---
  create() {
    return this.call<{ code: string; hostKey: string }>({ action: "create" });
  }

  offers(code: string, hostKey: string) {
    return this.call<{ offers: { guestId: string; offer: string }[]; relays: string[] }>({
      action: "offers", code, hostKey,
    });
  }

  answer(code: string, hostKey: string, guestId: string, answer: string) {
    return this.call<{ ok: true }>({ action: "answer", code, hostKey, guestId, answer });
  }

  close(code: string, hostKey: string) {
    return this.call<{ ok: true }>({ action: "close", code, hostKey });
  }

  hostSync(code: string, hostKey: string, snap: string, baseSeq: number, base?: string, welcomes?: Record<string, number>) {
    return this.call<{ msgs: { g: string; m: unknown }[] }>({
      action: "host-sync", code, hostKey, snap, baseSeq, base, welcomes,
    });
  }
}
