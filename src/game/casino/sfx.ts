// Sonidos del casino: tonos sintetizados con WebAudio (sin ficheros). En Node, sin audio o antes del primer gesto del
// usuario no hacen nada; cualquier fallo se traga (el sonido nunca debe romper la partida).
import {
  EVT_ALARM, EVT_ALARM_END, EVT_ALARM_OFF, EVT_BOSS, EVT_DEPOSIT, EVT_DEPOSIT_FAIL, EVT_DRUNK_LOSS, EVT_DRUNK_SAT, EVT_JAIL_CROUPIER,
  EVT_JAIL_GUARD, EVT_JAIL_ROB, EVT_LEVER, EVT_LURE, EVT_PUSH_FAIL, EVT_PUSH_OK, EVT_ROUND_LOSE, EVT_ROUND_START, EVT_ROUND_WIN,
  EVT_SEQ_OK, EVT_SEQ_WRONG,
} from "./events";

/** Una nota: frecuencia (Hz), inicio (s), duración (s), onda y volumen. */
type Note = [number, number, number, OscillatorType?, number?];

const SOUNDS: Record<string, Note[]> = {
  coin: [[880, 0, 0.08, "square", 0.08], [1320, 0.07, 0.16, "square", 0.08]],
  deny: [[160, 0, 0.18, "sawtooth", 0.1], [120, 0.12, 0.2, "sawtooth", 0.1]],
  jail: [[440, 0, 0.12, "sawtooth", 0.12], [330, 0.1, 0.12, "sawtooth", 0.12], [220, 0.2, 0.3, "sawtooth", 0.12]],
  clunk: [[90, 0, 0.14, "square", 0.14], [70, 0.08, 0.2, "triangle", 0.12]],
  bell: [[1568, 0, 0.5, "sine", 0.1], [2093, 0, 0.4, "sine", 0.06], [1568, 0.25, 0.4, "sine", 0.08]],
  alarm: [[880, 0, 0.18, "square", 0.1], [660, 0.2, 0.18, "square", 0.1], [880, 0.4, 0.18, "square", 0.1], [660, 0.6, 0.18, "square", 0.1]],
  quiet: [[660, 0, 0.1, "sine", 0.08], [880, 0.1, 0.2, "sine", 0.08]],
  drunk: [[130, 0, 0.3, "triangle", 0.12], [98, 0.15, 0.4, "triangle", 0.12]],
  pop: [[500, 0, 0.05, "square", 0.1], [250, 0.04, 0.16, "triangle", 0.1]],
  tick: [[1000, 0, 0.05, "square", 0.06]],
  win: [[523, 0, 0.12, "square", 0.08], [659, 0.1, 0.12, "square", 0.08], [784, 0.2, 0.12, "square", 0.08], [1047, 0.3, 0.3, "square", 0.08]],
  lose: [[392, 0, 0.2, "sawtooth", 0.1], [330, 0.2, 0.2, "sawtooth", 0.1], [262, 0.4, 0.4, "sawtooth", 0.1]],
  round: [[392, 0, 0.1, "triangle", 0.08], [523, 0.1, 0.18, "triangle", 0.08]],
};

/** Sonido de cada suceso (los que no están, no suenan). */
const BY_EVENT: Record<number, string> = {
  [EVT_JAIL_GUARD]: "jail", [EVT_JAIL_CROUPIER]: "jail", [EVT_JAIL_ROB]: "jail",
  [EVT_DEPOSIT]: "coin", [EVT_DEPOSIT_FAIL]: "deny",
  [EVT_DRUNK_SAT]: "drunk", [EVT_DRUNK_LOSS]: "deny", [EVT_PUSH_OK]: "pop", [EVT_PUSH_FAIL]: "deny",
  [EVT_LEVER]: "clunk", [EVT_LURE]: "bell", [EVT_ALARM]: "alarm", [EVT_ALARM_OFF]: "quiet", [EVT_ALARM_END]: "quiet",
  [EVT_SEQ_OK]: "tick", [EVT_SEQ_WRONG]: "deny",
  [EVT_ROUND_WIN]: "win", [EVT_BOSS]: "win", [EVT_ROUND_LOSE]: "lose", [EVT_ROUND_START]: "round",
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

/** Reproduce un sonido por nombre. */
export function playSound(name: string): void {
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

/** Suena el aviso de un suceso (si tiene sonido). */
export function playEvent(kind: number): void {
  const name = BY_EVENT[kind];
  if (name) playSound(name);
}
