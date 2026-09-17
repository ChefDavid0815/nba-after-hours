import type { GameEvent, GameState, Settings } from './types';

type AudioWindow = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

/** Small, sample-free arena sound engine. Nothing starts before an explicit user gesture. */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowd: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private settings: Pick<Settings, 'volume' | 'sfx' | 'music'> = { volume: 0.55, music: true, sfx: true };
  private disposed = false;
  private inMenu = true;
  private nextBeat = 0;
  private beat = 0;
  private bounceClock = 0;
  private shoeClock = 0;
  private energy = 0;
  private eventIds = new Set<number>();
  private sources = new Set<AudioScheduledSourceNode>();
  private nodes = new Set<AudioNode>();

  unlock(): void {
    if (this.disposed) return;
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      return;
    }
    const AudioCtor = (globalThis as AudioWindow).AudioContext ?? (globalThis as AudioWindow).webkitAudioContext;
    if (!AudioCtor) return;
    try {
      const ctx = new AudioCtor({ latencyHint: 'interactive' });
      this.context = ctx;
      this.master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -15; compressor.knee.value = 14;
      compressor.ratio.value = 5; compressor.attack.value = 0.008; compressor.release.value = 0.22;
      this.master.connect(compressor); compressor.connect(ctx.destination);
      this.nodes.add(compressor);
      this.effects = ctx.createGain(); this.effects.connect(this.master);
      this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
      this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0;
      this.crowdGain.connect(this.effects);
      this.noiseBuffer = this.makeNoise(2.5);
      this.startCrowd();
      this.nextBeat = ctx.currentTime + 0.12;
      this.setSettings(this.settings as Settings);
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    } catch {
      // Browsers without available audio hardware can still play the complete game.
      if (this.context) void this.context.close().catch(() => {});
      this.context = null;
    }
  }

  setSettings(settings: Settings): void {
    this.settings = {
      volume: Number.isFinite(settings.volume) ? Math.max(0, Math.min(1, settings.volume)) : 0.55,
      music: settings.music !== false, sfx: settings.sfx !== false,
    };
    const now = this.context?.currentTime ?? 0;
    this.ramp(this.master?.gain, this.settings.volume * 0.7, now, 0.035);
    this.ramp(this.effects?.gain, this.settings.sfx ? 1 : 0, now, 0.025);
    this.ramp(this.musicBus?.gain, this.settings.music ? (this.inMenu ? 0.32 : 0.11) : 0, now, 0.16);
  }

  menu(active: boolean): void {
    // Every match starts a fresh simulation event sequence, including consecutive tournament rounds.
    this.eventIds.clear();
    this.bounceClock = 0; this.shoeClock = 0;
    this.inMenu = active;
    this.ramp(this.musicBus?.gain, this.settings.music ? (active ? 0.32 : 0.11) : 0, this.context?.currentTime ?? 0, 0.3);
    if (active) this.ramp(this.crowdGain?.gain, 0, this.context?.currentTime ?? 0, 0.4);
  }

  update(dt: number, state?: GameState): void {
    const ctx = this.context;
    if (!ctx || this.disposed || ctx.state !== 'running') return;
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    const now = ctx.currentTime;
    if (this.nextBeat < now - 0.5) this.nextBeat = now + 0.03;
    if (this.settings.music && this.settings.volume > 0) {
      while (this.nextBeat < now + 0.16) {
        this.scheduleBeat(this.beat++, this.nextBeat);
        this.nextBeat += 60 / 94 / 2;
      }
    } else this.nextBeat = now + 0.12;
    this.energy = Math.max(0, this.energy - dt * 0.35);
    const live = !!state && !this.inMenu && (state.phase === 'playing' || state.phase === 'inbound');
    const crowdLevel = live ? 0.026 + this.energy * 0.06 : state && !this.inMenu ? 0.018 : 0;
    this.ramp(this.crowdGain?.gain, crowdLevel, now, 0.18);
    if (!live || !this.settings.sfx || this.settings.volume === 0) return;

    this.bounceClock -= dt; this.shoeClock -= dt;
    const owner = state!.players.find(player => player.id === state!.ball.owner);
    if (owner && state!.ball.state === 'held' && !state!.charging) {
      const speed = Math.hypot(owner.vx, owner.vz);
      if (this.bounceClock <= 0) {
        this.bounce(now, owner.x / 20, 0.7 + Math.min(speed / 15, 0.3));
        this.bounceClock = speed > 1 ? 0.36 : 0.62;
      }
      if (speed > 4 && this.shoeClock <= 0) {
        this.squeak(now, owner.x / 20, 0.025);
        this.shoeClock = 0.7 + Math.random() * 0.75;
      }
    }
  }

  play(event: GameEvent): void {
    if (!this.context || this.disposed || this.context.state !== 'running' || !this.settings.sfx || this.settings.volume === 0) return;
    if (this.eventIds.has(event.id)) return;
    this.eventIds.add(event.id);
    if (this.eventIds.size > 128) this.eventIds.delete(this.eventIds.values().next().value!);
    const t = this.context.currentTime + 0.005;
    const pan = event.side === 0 ? 0.18 : -0.18;
    switch (event.type) {
      case 'pass': this.noise(t, 0.12, 0.025, 900, 'bandpass', pan); break;
      case 'shot': this.squeak(t, pan, 0.035); break;
      case 'miss': this.rim(t, pan); this.energy = Math.max(this.energy, 0.15); break;
      case 'score': {
        this.noise(t, 0.18, 0.07, 2400, 'highpass', pan);
        this.energy = 0.6;
        this.cheer(t, event.value === 3 ? 0.12 : 0.08);
        this.chime(t + 0.05, event.value === 3 ? [659.25, 783.99, 987.77] : [523.25, 659.25], 0.034);
        break;
      }
      case 'dunk':
        this.rim(t, pan, true); this.noise(t, 0.28, 0.17, 180, 'lowpass', pan);
        this.energy = 1; this.cheer(t, 0.17); break;
      case 'perfect': this.chime(t, [1046.5, 1318.51, 1567.98], 0.042); break;
      case 'steal': this.squeak(t, pan, 0.05); this.tone(640, 0.07, t + 0.03, 0.025, 'sine', this.effects!, 850); break;
      case 'block': this.noise(t, 0.065, 0.12, 750, 'lowpass', pan); this.bounce(t + 0.08, pan, 1); this.energy = 0.6; break;
      case 'rebound': this.noise(t, 0.075, 0.055, 520, 'lowpass', pan); break;
      case 'crossover': this.bounce(t, pan, 1.2); this.squeak(t + 0.09, pan, 0.05); break;
      case 'whistle': this.whistle(t); break;
      case 'buzzer': this.buzzer(t); break;
      case 'quarter': this.whistle(t); this.energy = 0.3; break;
      case 'tip': this.whistle(t); this.energy = 0.6; break;
      case 'gameover':
        this.buzzer(t); this.cheer(t + 0.18, 0.14); this.energy = 1;
        if (event.side === 0) this.chime(t + 0.48, [523.25, 659.25, 783.99, 1046.5], 0.048);
        break;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.sources) { try { source.stop(); source.disconnect(); } catch { /* already finished */ } }
    this.sources.clear();
    try { this.crowd?.stop(); this.crowd?.disconnect(); } catch { /* already finished */ }
    for (const node of this.nodes) node.disconnect();
    this.nodes.clear();
    this.master?.disconnect(); this.effects?.disconnect(); this.musicBus?.disconnect(); this.crowdGain?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = null; this.noiseBuffer = null; this.eventIds.clear();
  }

  private ramp(param: AudioParam | undefined, value: number, time: number, constant: number): void {
    if (!param) return;
    param.setTargetAtTime(value, time, constant);
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.context!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private startCrowd(): void {
    const ctx = this.context!;
    this.crowd = ctx.createBufferSource(); this.crowd.buffer = this.noiseBuffer; this.crowd.loop = true;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 1500; low.Q.value = 0.2;
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 260; high.Q.value = 0.2;
    this.nodes.add(low); this.nodes.add(high);
    this.crowd.connect(low); low.connect(high); high.connect(this.crowdGain!); this.crowd.start();
  }

  private track(source: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
    this.sources.add(source);
    source.onended = () => { source.disconnect(); nodes.forEach(node => node.disconnect()); this.sources.delete(source); };
  }

  private tone(frequency: number, duration: number, start: number, level: number, type: OscillatorType, bus: AudioNode, endFrequency?: number, pan = 0): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator(); const env = ctx.createGain();
    const stereo = ctx.createStereoPanner(); stereo.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    osc.type = type; osc.frequency.setValueAtTime(frequency, start);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, start + duration * 0.85);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), start + Math.min(0.012, duration * 0.1));
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env); env.connect(stereo); stereo.connect(bus);
    this.track(osc, env, stereo); osc.start(start); osc.stop(start + duration + 0.03);
  }

  private noise(start: number, duration: number, level: number, frequency: number, type: BiquadFilterType, pan = 0, bus?: AudioNode): void {
    const ctx = this.context!;
    const source = ctx.createBufferSource(); source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.7;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), start + Math.min(0.025, duration * 0.15));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    const stereo = ctx.createStereoPanner(); stereo.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    source.connect(filter); filter.connect(gain); gain.connect(stereo); stereo.connect(bus ?? this.effects!);
    this.track(source, filter, gain, stereo); source.start(start, Math.random() * 0.5); source.stop(start + duration + 0.03);
  }

  private bounce(start: number, pan = 0, force = 1): void {
    this.tone(155, 0.15, start, 0.1 * force, 'sine', this.effects!, 63, pan);
    this.tone(330, 0.045, start, 0.025 * force, 'triangle', this.effects!, 130, pan);
    this.noise(start, 0.026, 0.06 * force, 650, 'lowpass', pan);
  }

  private squeak(start: number, pan = 0, level = 0.03): void {
    const pitch = 1450 + Math.random() * 350;
    this.tone(pitch, 0.075, start, level, 'sine', this.effects!, pitch * 0.77, pan);
    this.noise(start + 0.02, 0.09, level * 0.5, 2100, 'bandpass', pan);
  }

  private rim(start: number, pan = 0, strong = false): void {
    const scale = strong ? 1.25 : 0.75;
    this.tone(280, 0.23, start, 0.11 * scale, 'sine', this.effects!, 190, pan);
    this.tone(691, 0.13, start, 0.036 * scale, 'sine', this.effects!, 615, pan);
    this.noise(start, 0.055, 0.08 * scale, 1700, 'bandpass', pan);
  }

  private whistle(start: number): void {
    this.tone(2450, 0.14, start, 0.047, 'sine', this.effects!, 2700);
    this.tone(2890, 0.12, start + 0.025, 0.023, 'sine', this.effects!, 2820);
    this.noise(start, 0.15, 0.012, 3100, 'bandpass');
  }

  private buzzer(start: number): void {
    this.tone(130.81, 0.52, start, 0.035, 'sawtooth', this.effects!);
    this.tone(196, 0.52, start, 0.025, 'triangle', this.effects!);
  }

  private chime(start: number, notes: number[], volume: number): void {
    notes.forEach((note, i) => {
      this.tone(note, 0.5, start + i * 0.075, volume, 'sine', this.effects!);
      this.tone(note * 2, 0.22, start + i * 0.075, volume * 0.18, 'sine', this.effects!);
    });
  }

  private cheer(start: number, level: number): void {
    this.noise(start, 1.25, level, 1150, 'bandpass', -0.28);
    this.noise(start + 0.14, 1.45, level * 0.65, 780, 'bandpass', 0.28);
    this.noise(start + 0.25, 0.65, level * 0.15, 2600, 'highpass');
  }

  private scheduleBeat(step: number, start: number): void {
    const bus = this.musicBus!;
    const eighth = step % 8;
    const bar = Math.floor(step / 8) % 4;
    // A warm D minor / Bb / F / C loop, with sparse electric keys and a mellow halftime groove.
    const roots = [73.416, 58.270, 87.307, 65.406];
    const chords = [[293.665, 349.228, 440, 523.251], [233.082, 293.665, 349.228, 440], [261.626, 349.228, 440, 523.251], [261.626, 329.628, 391.995, 493.883]];
    if (eighth === 0 || eighth === 3 || eighth === 6) {
      this.tone(95, 0.19, start, 0.16, 'sine', bus, 40);
      this.noise(start, 0.017, 0.023, 500, 'lowpass', 0, bus);
    }
    if (eighth === 2 || eighth === 6) {
      this.noise(start, 0.12, 0.059, 2200, 'bandpass', -0.08, bus);
      this.tone(175, 0.065, start, 0.032, 'triangle', bus, 100);
    }
    this.noise(start + (eighth % 2 ? 0.02 : 0), eighth === 7 ? 0.12 : 0.045, eighth % 2 ? 0.023 : 0.033, 6200, 'highpass', 0.22, bus);
    if (eighth === 0 || eighth === 4) {
      this.tone(roots[bar] * (eighth === 4 ? 1.5 : 1), 0.54, start, 0.09, 'sine', bus);
    }
    if (eighth === 0 || eighth === 5) {
      chords[bar].forEach((note, index) => {
        this.tone(note, 1.05, start + index * 0.014, 0.023, 'sine', bus, undefined, index % 2 ? 0.24 : -0.24);
        this.tone(note * 2, 0.42, start + index * 0.014, 0.0045, 'sine', bus);
      });
    }
    if (bar % 2 === 1 && (eighth === 3 || eighth === 7)) {
      this.tone(chords[bar][eighth === 3 ? 2 : 3] * 2, 0.32, start, 0.012, 'sine', bus, undefined, -0.2);
    }
  }
}
