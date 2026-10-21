// Mensajes por el canal directo (WebRTC). El relé HTTP transporta los mismos estados.

export type HostMessage =
  | { t: "welcome"; index: number }
  | { t: "base"; b: { seq: number } }
  | { t: "snap"; d: { g: string; seq: number } };

export type Transport = "p2p" | "relay";

export const TRANSPORT_LABEL: Record<Transport, string> = {
  p2p: "directo",
  relay: "vía Vercel",
};
