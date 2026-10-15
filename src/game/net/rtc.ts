// Ayudantes WebRTC. Señalización sin "trickle": se espera a reunir todos los candidatos ICE
// y se envía el SDP completo en un solo mensaje (más simple de transportar por HTTP).

const RTC_CONFIG: RTCConfiguration = {
  // En la misma red basta con los candidatos locales; STUN es respaldo si mDNS está bloqueado.
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// En LAN los candidatos locales llegan al instante; no merece la pena esperar mucho al STUN.
function waitIceGathering(pc: RTCPeerConnection, timeoutMs = 2000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/** Invitado: crea la conexión, el canal de datos y la oferta. */
export async function createOffer(): Promise<{ pc: RTCPeerConnection; channel: RTCDataChannel; offer: string }> {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channel = pc.createDataChannel("game", { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await waitIceGathering(pc);
  return { pc, channel, offer: pc.localDescription!.sdp };
}

export async function applyAnswer(pc: RTCPeerConnection, answer: string) {
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
}

/** Anfitrión: acepta una oferta y genera la respuesta. El canal llega cuando el invitado conecta. */
export async function acceptOffer(
  offer: string,
): Promise<{ pc: RTCPeerConnection; answer: string; channel: Promise<RTCDataChannel> }> {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channel = new Promise<RTCDataChannel>((resolve) => {
    pc.addEventListener("datachannel", (ev) => resolve(ev.channel), { once: true });
  });
  await pc.setRemoteDescription({ type: "offer", sdp: offer });
  await pc.setLocalDescription(await pc.createAnswer());
  await waitIceGathering(pc);
  return { pc, answer: pc.localDescription!.sdp, channel };
}

export function isClosedState(pc: RTCPeerConnection): boolean {
  return pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected";
}
