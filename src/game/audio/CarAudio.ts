export type CarAudioFrame = {
  speedMph: number;
  throttle: number; // -1..1 (negative = reverse/brake)
  slip: number; // m/s lateral slip magnitude
};

export class CarAudio {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private started = false;

  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engine1: OscillatorNode | null = null;
  private engine2: OscillatorNode | null = null;
  private skidGain: GainNode | null = null;
  private skidSrc: AudioBufferSourceNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;

  arm(): void {
    const start = async () => {
      await this.ensureUnlocked();
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start, { once: true, passive: true });
    window.addEventListener("keydown", start, { once: true, passive: true });
  }

  stop(): void {
    this.started = false;
    this.unlocked = false;
    try {
      this.engine1?.stop();
      this.engine2?.stop();
      this.skidSrc?.stop();
    } catch {
      // ignore
    }
    this.engine1 = null;
    this.engine2 = null;
    this.skidSrc = null;
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  update(frame: CarAudioFrame): void {
    if (!this.ctx || !this.unlocked) return;

    const mph = clamp(frame.speedMph, 0, 160);
    const throttle01 = clamp(Math.abs(frame.throttle), 0, 1);
    const wantsAudio = mph > 1 || throttle01 > 0.04 || frame.slip > 6;
    if (!wantsAudio) {
      this.engineGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.skidGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      return;
    }

    if (!this.started) this.startNodes();
    if (!this.started || !this.engineGain || !this.engine1 || !this.engine2 || !this.skidGain) return;

    const rpm = 900 + (mph / 160) * 6900;
    const wobble = 0.5 + 0.5 * Math.sin(this.ctx.currentTime * 9.0);
    const targetHz = (rpm / 60) * (0.85 + 0.25 * throttle01) * (0.96 + wobble * 0.03);

    this.engine1.frequency.setTargetAtTime(targetHz, this.ctx.currentTime, 0.03);
    this.engine2.frequency.setTargetAtTime(targetHz * 2.01, this.ctx.currentTime, 0.03);
    this.engineGain.gain.setTargetAtTime(0.01 + 0.12 * throttle01 + 0.035 * (mph / 160), this.ctx.currentTime, 0.05);

    const skid = clamp((frame.slip - 3.2) / 10.5, 0, 1) * clamp(mph / 40, 0, 1);
    this.skidGain.gain.setTargetAtTime(0.0 + skid * 0.32, this.ctx.currentTime, 0.06);
    this.skidFilter?.frequency.setTargetAtTime(250 + skid * 2600, this.ctx.currentTime, 0.08);
  }

  private async ensureUnlocked(): Promise<void> {
    if (this.unlocked) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    // Always try to resume in case it was suspended
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.unlocked = true;
  }

  private startNodes(): void {
    if (!this.ctx || this.started) return;
    const ctx = this.ctx;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(ctx.destination);
    this.engineGain = engineGain;

    const engine1 = ctx.createOscillator();
    engine1.type = "sawtooth";
    engine1.frequency.value = 80;
    engine1.connect(engineGain);
    engine1.start();
    this.engine1 = engine1;

    const engine2 = ctx.createOscillator();
    engine2.type = "triangle";
    engine2.frequency.value = 160;
    engine2.connect(engineGain);
    engine2.start();
    this.engine2 = engine2;

    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidGain.connect(ctx.destination);
    this.skidGain = skidGain;

    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = "bandpass";
    skidFilter.frequency.value = 1200;
    skidFilter.Q.value = 0.8;
    skidFilter.connect(skidGain);
    this.skidFilter = skidFilter;

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.connect(skidFilter);
    src.start();
    this.skidSrc = src;

    this.started = true;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
