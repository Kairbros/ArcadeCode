// Audio 100 % procedural con Web Audio API: ni un archivo de sonido, todo síntesis.
// El contexto se crea al primer gesto del usuario (política de autoplay de los navegadores).

import type { WeaponId } from "../weapons/defs";

type Ctor = typeof AudioContext;

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;
  volume = 0.8;

  /** Debe llamarse desde un evento de usuario (clic en JUGAR). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx: Ctor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise(2);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private noise(dur: number, gain: number, filterType: BiquadFilterType, freq: number, q = 1, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    const now = this.t + delay;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  private tone(
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType = "sine",
    freqEnd?: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const now = this.t + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /** Disparo: chasquido de ruido + cuerpo grave, distinto por arma. La mejorada suma un destello metálico. */
  shot(kind: WeaponId, upgraded = false): void {
    switch (kind) {
      case "pistol":
        this.noise(0.14, 0.5, "bandpass", 1800, 0.9);
        this.tone(150, 0.12, 0.35, "square", 60);
        break;
      case "revolver":
        this.noise(0.26, 0.7, "bandpass", 1100, 0.8);
        this.tone(95, 0.22, 0.5, "square", 38);
        this.tone(300, 0.05, 0.2, "sawtooth", 120);
        break;
      case "smg":
        this.noise(0.08, 0.35, "highpass", 1200);
        this.tone(220, 0.06, 0.2, "square", 110);
        break;
      case "shotgun":
        this.noise(0.32, 0.75, "lowpass", 900, 0.6);
        this.tone(90, 0.28, 0.5, "sawtooth", 40);
        break;
      case "rifle":
        this.noise(0.18, 0.6, "bandpass", 1400, 0.7);
        this.tone(120, 0.16, 0.4, "square", 50);
        break;
      case "lmg":
        this.noise(0.13, 0.62, "bandpass", 900, 0.7);
        this.tone(80, 0.12, 0.45, "square", 42);
        break;
      case "sniper":
        this.noise(0.45, 0.85, "lowpass", 1500, 0.5);
        this.tone(70, 0.4, 0.55, "sawtooth", 28);
        this.tone(1400, 0.1, 0.12, "sine", 500, 0.05);
        break;
      case "pulse":
        this.tone(880, 0.22, 0.3, "sine", 120);
        this.noise(0.12, 0.3, "highpass", 3000);
        break;
    }
    if (upgraded) {
      this.tone(1760, 0.16, 0.08, "sine", 880, 0.01);
      this.tone(2640, 0.1, 0.05, "triangle", 1320, 0.03);
    }
  }

  dryFire(): void {
    this.tone(1100, 0.04, 0.12, "square", 700);
  }

  reload(): void {
    this.noise(0.05, 0.16, "highpass", 2500);
    this.tone(320, 0.05, 0.1, "square", 240, 0.02);
  }

  reloadDone(): void {
    this.noise(0.05, 0.2, "highpass", 1800);
    this.tone(520, 0.06, 0.12, "square", 380);
  }

  swap(): void {
    this.noise(0.06, 0.14, "bandpass", 1200);
    this.tone(440, 0.05, 0.08, "triangle", 660);
  }

  hit(): void {
    this.tone(1500, 0.05, 0.16, "square", 900);
  }

  headshot(): void {
    this.tone(2100, 0.07, 0.2, "square", 1200);
    this.tone(1400, 0.05, 0.12, "sine", 700, 0.03);
  }

  kill(): void {
    this.tone(280, 0.18, 0.18, "sawtooth", 90);
    this.noise(0.18, 0.2, "lowpass", 700);
  }

  growl(pitch = 1): void {
    this.tone(85 * pitch, 0.5, 0.11, "sawtooth", 55 * pitch);
    this.noise(0.4, 0.06, "lowpass", 400);
  }

  attack(): void {
    this.noise(0.22, 0.3, "lowpass", 500, 0.7);
    this.tone(70, 0.2, 0.22, "sawtooth", 40);
  }

  hurt(): void {
    this.tone(180, 0.3, 0.3, "sawtooth", 60);
    this.noise(0.2, 0.18, "lowpass", 900);
  }

  /** Nota larga con ataque lento (colchón de sintetizador para los toques de ronda). */
  private pad(freq: number, dur: number, gain: number, type: OscillatorType, delay = 0, attack = 0.3, detune = 0, freqEnd?: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const now = this.t + delay;
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + Math.min(attack, dur * 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  /** Empieza la ronda: zumbido grave que crece, segunda menor disonante, barrido de ruido y un golpe sordo con latido. */
  roundStart(special = false): void {
    this.pad(55, 3.4, 0.2, "sawtooth", 0, 1.5);
    this.pad(82.4, 3.4, 0.12, "sawtooth", 0, 1.5, 7);
    this.pad(220, 3.0, 0.08, "triangle", 0.2, 1.3);
    this.pad(233.1, 3.0, 0.07, "triangle", 0.2, 1.3, -5);
    this.pad(311, 2.8, 0.05, "triangle", 0.5, 1.1);
    this.noise(1.5, 0.28, "bandpass", 1400, 1.4, 0);
    this.tone(70, 0.6, 0.45, "sine", 30, 1.45);
    this.noise(0.4, 0.5, "lowpass", 700, 1, 1.45);
    this.tone(64, 0.35, 0.3, "sine", 30, 1.9);
    this.tone(64, 0.35, 0.25, "sine", 30, 2.15);
    if (special) {
      this.tone(160, 1.8, 0.16, "sawtooth", 60, 0.5);
      this.pad(880, 2.2, 0.05, "sine", 0.9, 0.8, 0, 420);
      this.noise(2, 0.4, "lowpass", 1800, 0.8, 0.2);
    }
  }

  /** Acaba la ronda: motivo descendente en menor con órgano y campana lejana, trueno y zumbido que se apaga. */
  roundEnd(): void {
    [330, 293.7, 246.9, 220, 196].forEach((f, i) => {
      this.pad(f, 1.5, 0.11, "triangle", i * 0.48, 0.06);
      this.pad(f / 2, 1.5, 0.08, "square", i * 0.48, 0.08, 4);
    });
    this.pad(1318.5, 2.6, 0.04, "sine", 0.2, 0.02);
    this.pad(98, 3.6, 0.1, "sawtooth", 2.0, 0.8);
    this.noise(2.6, 0.22, "lowpass", 320, 1, 0.1);
  }

  /** Pausa: golpe seco al abrir y al cerrar el menú. */
  pause(on: boolean): void {
    this.tone(on ? 330 : 440, 0.12, 0.12, "square", on ? 220 : 660);
  }

  buy(): void {
    this.tone(660, 0.1, 0.15, "square", 880);
    this.tone(990, 0.12, 0.12, "square", 1320, 0.08);
  }

  deny(): void {
    this.tone(180, 0.16, 0.2, "square", 120);
  }

  repair(): void {
    this.noise(0.12, 0.2, "bandpass", 700, 1.5);
    this.tone(260, 0.1, 0.1, "square", 200);
  }

  boxOpen(): void {
    for (let i = 0; i < 5; i++) this.tone(440 + i * 110, 0.18, 0.1, "triangle", 660 + i * 110, i * 0.11);
  }

  /** Mejorador: arranca (zumbido y golpes) y termina (campanilla). */
  papStart(): void {
    for (let i = 0; i < 8; i++) this.tone(120 + (i % 2) * 40, 0.16, 0.14, "sawtooth", 80, i * 0.4);
    this.noise(3.2, 0.12, "lowpass", 500);
  }

  papDone(): void {
    this.tone(880, 0.3, 0.16, "triangle", 880);
    this.tone(1320, 0.4, 0.14, "triangle", 1320, 0.14);
    this.tone(1760, 0.6, 0.12, "sine", 1760, 0.3);
  }

  /** Interruptor de la energía: golpe grave y zumbido que sube. */
  power(): void {
    this.noise(0.2, 0.5, "lowpass", 300);
    this.tone(60, 1.2, 0.3, "sawtooth", 220);
    this.tone(110, 1.5, 0.12, "square", 440, 0.2);
  }

  /** La ruleta de la caja se detiene. */
  boxTick(): void {
    this.tone(1100, 0.08, 0.14, "square", 1100);
    this.tone(1650, 0.18, 0.14, "triangle", 1650, 0.08);
  }

  /** Empieza una ronda de perros: trueno y aullido grave. */
  houndStart(): void {
    this.noise(1.8, 0.7, "lowpass", 1800, 0.8);
    this.tone(60, 1.5, 0.45, "sawtooth", 28);
    this.tone(220, 1.2, 0.18, "sawtooth", 130, 0.3);
    this.tone(330, 1.0, 0.14, "triangle", 160, 0.7);
  }

  /** El oso de la caja: carcajada musical burlona. */
  teddy(): void {
    [659, 523, 659, 523, 784, 659, 523].forEach((f, i) => this.tone(f, 0.16, 0.12, "square", f * 0.97, i * 0.14));
  }

  /** La caja se va a otro sitio: zumbido eléctrico que sube y se apaga. */
  boxMove(): void {
    this.tone(180, 0.7, 0.2, "sawtooth", 1400);
    this.noise(0.8, 0.35, "bandpass", 3000, 1.2);
    this.tone(1400, 0.4, 0.12, "triangle", 300, 0.55);
  }

  /** Compañero revivido: acorde cálido ascendente. */
  revive(): void {
    [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.5, 0.12, "triangle", f * 1.02, i * 0.09));
  }

  /** Tajo del cuchillo: silbido del filo. */
  melee(): void {
    this.noise(0.16, 0.22, "bandpass", 2600);
    this.tone(1400, 0.12, 0.06, "sawtooth", 500);
  }

  /** Cae un poder: campanilla clara. */
  powerDrop(): void {
    this.tone(1568, 0.25, 0.14, "triangle", 1568);
    this.tone(2093, 0.4, 0.12, "triangle", 2093, 0.14);
  }

  /** Se recoge un poder: arpegio ascendente. */
  powerPick(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 0.14, "square", f, i * 0.07));
  }

  /** El efecto de un poder se acaba. */
  powerEnd(): void {
    this.tone(440, 0.4, 0.13, "triangle", 160);
  }

  /** Katabum: estallido grave con cola de ruido. */
  nuke(): void {
    this.noise(1.6, 0.9, "lowpass", 2200, 0.7);
    this.tone(70, 1.3, 0.5, "sawtooth", 24);
    this.tone(45, 1.8, 0.45, "sine", 20);
    this.noise(0.3, 0.4, "highpass", 2500);
  }

  /** Trueno lejano (retumbo largo y grave). */
  thunder(): void {
    this.noise(2.2, 0.5, "lowpass", 160, 0.6);
    this.tone(48, 1.8, 0.35, "sawtooth", 26);
    this.noise(1.2, 0.3, "lowpass", 380, 0.4);
  }

  death(): void {
    this.tone(160, 1.4, 0.26, "sawtooth", 40);
    this.noise(1.2, 0.2, "lowpass", 300);
  }

  step(run: boolean): void {
    this.noise(0.06, run ? 0.09 : 0.05, "lowpass", run ? 500 : 400);
  }
}
