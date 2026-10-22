// Sonidos de «Mazo Loco»: tonos sintetizados con WebAudio (sin ficheros), disparados por el aviso de la
// mesa, así suenan igual en el anfitrión y en los invitados. En Node o sin audio no hacen nada y nunca
// rompen la partida.

type Note = [number, number, number, OscillatorType?, number?];

const SOUNDS: Record<string, Note[]> = {
  /** Carta sobre el tapete. */
  flick: [[620, 0, 0.05, "square", 0.07], [380, 0.03, 0.07, "triangle", 0.06]],
  /** Carta que castiga (+2 / +4). */
  heavy: [[180, 0, 0.12, "sawtooth", 0.11], [120, 0.08, 0.22, "sawtooth", 0.1]],
  /** Robar del mazo. */
  swish: [[300, 0, 0.06, "triangle", 0.07], [460, 0.05, 0.09, "triangle", 0.06]],
  /** Aviso de UNO. */
  uno: [[880, 0, 0.09, "square", 0.09], [1175, 0.09, 0.16, "square", 0.08]],
  /** Castigo por no cantar UNO. */
  bad: [[220, 0, 0.12, "sawtooth", 0.1], [160, 0.1, 0.2, "sawtooth", 0.1]],
  /** Ronda ganada. */
  round: [[523, 0, 0.1, "square", 0.08], [659, 0.1, 0.1, "square", 0.08], [784, 0.2, 0.18, "square", 0.08]],
  /** Partida ganada. */
  win: [[523, 0, 0.12, "square", 0.09], [659, 0.11, 0.12, "square", 0.09], [784, 0.22, 0.12, "square", 0.09], [1047, 0.33, 0.34, "square", 0.09]],
};

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function playSound(name: keyof typeof SOUNDS): void {
  const notes = SOUNDS[name];
  const a = notes ? audio() : null;
  if (!a || !notes) return;
  try {
    const t0 = a.currentTime;
    for (const [freq, at, dur, type = "square", vol = 0.08] of notes) {
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain).connect(a.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.02);
    }
  } catch {
    // Sin sonido: no pasa nada.
  }
}

/** Qué suena para cada aviso de la mesa. */
function soundFor(msg: string): keyof typeof SOUNDS | null {
  const m = msg.toUpperCase();
  if (m.includes("GANA LA PARTIDA")) return "win";
  if (m.includes("SIN UNO")) return "bad";
  if (m.includes("UNO")) return "uno";
  if (m.includes("+4") || m.includes("+2 PARA")) return "heavy";
  if (m.includes("NO LIGA")) return "bad";
  if (m.includes("ROBAS")) return "swish";
  if (m.includes("BLOQUEO") || m.includes("REVERSA")) return "flick";
  if (m.startsWith("GANA") || m.includes("RONDA")) return "round";
  if (m.includes("JUEGA") || m.includes("PASA")) return "flick";
  return null;
}

/** Sigue los avisos de la mesa: cada cambio de `mv` suena una vez (el primero, al entrar, no). */
export class TableSfx {
  private mv = -1;

  /** Vuelve a empezar (partida nueva): el primer aviso no suena. */
  reset(): void {
    this.mv = -1;
  }

  update(mv: number, msg: string): void {
    if (mv === this.mv) return;
    const first = this.mv < 0;
    this.mv = mv;
    if (first || !msg) return;
    const name = soundFor(msg);
    if (name) playSound(name);
  }
}
