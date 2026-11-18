import type { SfxName } from './sfxMap';

/**
 * 효과음 합성기 (Web Audio API). 소리 파일 없이 발진기(톤)와 잡음(노이즈)으로 만든다.
 *
 * 브라우저는 사용자가 키를 누르거나 클릭하기 전에는 소리를 막는다 → 첫 입력 때 깨운다.
 * 소리 장치를 쓸 수 없는 환경에서도 게임은 그대로 돌아가도록 모든 실패를 조용히 무시한다.
 */
type Wave = OscillatorType;

const NOISE_BOOST = 2.5;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private _muted = false;
  /** 사용자가 키·클릭으로 한 번이라도 입력했는가 (그 전에는 소리 장치를 만들지 않음) */
  private unlocked = false;

  constructor(private readonly volume = 0.35) {
    const unlock = () => {
      this.unlocked = true;
      this.ensure();
      void this.ctx?.resume().catch(() => undefined);
    };
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
  }

  get muted(): boolean {
    return this._muted;
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.master) this.master.gain.value = this._muted ? 0 : this.volume;
    return this._muted;
  }

  play(names: readonly SfxName[]): void {
    if (!this.unlocked || this._muted || names.length === 0 || !this.ensure()) return;
    for (const n of names) {
      try {
        this.recipes[n]();
      } catch {
        /* 소리 실패는 무시 */
      }
    }
  }

  // ───────────────────────── 소리 조합법 ─────────────────────────

  private readonly recipes: Record<SfxName, () => void> = {
    swing: () => this.noise(0.12, 1800, 700, 0.35),
    swingHeavy: () => {
      this.noise(0.26, 900, 300, 0.5);
      this.tone(90, 60, 0.22, 'sine', 0.3);
    },
    thrust: () => this.noise(0.08, 3000, 1500, 0.3),
    dash: () => this.noise(0.15, 1200, 2500, 0.22),
    denied: () => this.tone(160, 140, 0.08, 'square', 0.12),
    hit: () => {
      this.tone(140, 60, 0.12, 'sine', 0.6);
      this.noise(0.05, 2500, 2500, 0.35);
    },
    parry: () => {
      // 금속성: 높은 두 음 + 짧은 잡음
      this.tone(1800, 1750, 0.25, 'triangle', 0.3);
      this.tone(2700, 2650, 0.18, 'sine', 0.18);
      this.noise(0.04, 5000, 5000, 0.4);
    },
    dodge: () => this.noise(0.06, 4000, 4000, 0.12),
    stagger: () => this.tone(400, 120, 0.4, 'triangle', 0.3),
    death: () => {
      this.tone(90, 40, 0.5, 'sawtooth', 0.35);
      this.noise(0.4, 600, 100, 0.45);
    },
    victory: () => {
      this.tone(523, 523, 0.12, 'triangle', 0.25, 0);
      this.tone(659, 659, 0.12, 'triangle', 0.25, 0.12);
      this.tone(784, 784, 0.25, 'triangle', 0.25, 0.24);
    },
    bossSwing: () => this.noise(0.18, 700, 300, 0.35),
    lock: () => this.tone(1200, 1200, 0.04, 'sine', 0.12),
    swap: () => {
      // 글리치: 짧은 사각파 세 번
      this.tone(600, 600, 0.03, 'square', 0.08, 0);
      this.tone(900, 900, 0.03, 'square', 0.08, 0.05);
      this.tone(450, 450, 0.03, 'square', 0.08, 0.1);
    },
    gunshot: () => {
      this.noise(0.1, 3000, 800, 0.6);
      this.tone(200, 80, 0.08, 'sine', 0.3);
    },
    slamGround: () => {
      this.tone(70, 35, 0.4, 'sine', 0.7);
      this.noise(0.3, 400, 120, 0.4);
    },
    rewind: () => this.tone(200, 1200, 0.3, 'sine', 0.2),
    checkpoint: () => {
      this.tone(660, 660, 0.1, 'sine', 0.2, 0);
      this.tone(990, 990, 0.16, 'sine', 0.2, 0.1);
    },
    hint: () => {
      this.tone(880, 880, 0.06, 'sine', 0.15, 0);
      this.tone(1320, 1320, 0.08, 'sine', 0.15, 0.07);
    },
  };

  // ───────────────────────── 재료 ─────────────────────────

  /** 소리 장치 준비 (안 되면 false) */
  private ensure(): boolean {
    if (this.ctx) return true;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      // 1초짜리 흰 잡음 (매번 재사용)
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  /** 음높이가 from → to로 미끄러지는 톤, 빠르게 줄어드는 소리 크기 */
  private tone(from: number, to: number, dur: number, type: Wave, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** 대역 필터를 통과한 잡음 (중심 주파수가 from → to로 이동) = 휘두르는 바람 소리·충격음 */
  private noise(dur: number, from: number, to: number, vol: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    const gain = ctx.createGain();
    // 대역 필터가 잡음 에너지 대부분을 걸러내므로 톤과 비슷한 크기가 되도록 키운다 (측정: 오프라인 렌더링 최대치)
    gain.gain.setValueAtTime(vol * NOISE_BOOST, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }
}
