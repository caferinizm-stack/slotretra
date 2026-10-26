// ─── Ses (WebAudio, dosyasız) ───────────────────────────────────────────────
//
// Oyunun tüm sesleri **tarayıcıda sentezlenir**: arka fon müziği, çevirme
// uğultusu, sembol patlamaları, çarpan fırlatma, kazanç ve bonus fanfarı.
// Harici ses dosyası yoktur (paket küçük kalır, telif sorunu olmaz).
//
// Tarayıcılar kullanıcı etkileşimi olmadan ses başlatmaz: `unlock()` ilk
// dokunuş/klavye olayında çağrılır. Ses kapalıysa hiçbir düğüm kurulmaz.

const STORAGE_KEY = 'dede_sound';

/** Küçük yardımcı: nota çalar. */
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.enabled = true;
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
      this.enabled = true;
    }
    this._musicTimer = 0;
    this._chord = 0;
    this._noise = null;
    this._started = false;
  }

  /** İlk kullanıcı etkileşiminde çağrılır (AudioContext açar). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch {
      this.ctx = null;
      return;
    }

    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.85 : 0;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);

    this._noise = this._noiseBuffer();
    if (this.enabled) this.startMusic();
  }

  /** Sesi açar/kapatır; durumu hatırlar. */
  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? '1' : '0');
    } catch {
      /* yok sayılır */
    }
    this.unlock();
    if (!this.master) return this.enabled;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.linearRampToValueAtTime(this.enabled ? 0.85 : 0, now + 0.18);
    if (this.enabled) this.startMusic();
    else this.stopMusic();
    return this.enabled;
  }

  // ── Müzik ───────────────────────────────────────────────────────────────

  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    // Am · F · C · G — sakin, "tapınak" havası.
    this.chords = [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 329.63],
      [196.0, 246.94, 293.66],
    ];
    this._chord = 0;
    this._playChord();
    this._musicTimer = window.setInterval(() => this._playChord(), 2600);
  }

  stopMusic() {
    if (this._musicTimer) window.clearInterval(this._musicTimer);
    this._musicTimer = 0;
  }

  _playChord() {
    if (!this.ctx || !this.enabled) return;
    const chord = this.chords[this._chord % this.chords.length];
    this._chord += 1;
    const t = this.ctx.currentTime;

    // Yumuşak pad (üç ses, uzun atak).
    chord.forEach((freq, index) => {
      this._tone(freq, 2.9, {
        type: index === 0 ? 'sine' : 'triangle',
        gain: 0.05,
        attack: 0.8,
        release: 1.3,
        when: t,
        target: this.musicGain,
        filter: 1200,
      });
      // Oktav üstü ince parıltı.
      this._tone(freq * 2, 2.2, {
        type: 'sine',
        gain: 0.012,
        attack: 1.1,
        release: 1.0,
        when: t,
        target: this.musicGain,
      });
    });

    // Kısa arpej (merdiven gibi yükselen üç nota).
    for (let i = 0; i < 3; i += 1) {
      this._tone(chord[i] * 2, 0.34, {
        type: 'triangle',
        gain: 0.018,
        attack: 0.02,
        release: 0.3,
        when: t + 0.55 + i * 0.34,
        target: this.musicGain,
      });
    }
  }

  // ── Efektler ────────────────────────────────────────────────────────────

  /** Çevirme: kısa uğultu + tık. */
  spin() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    this._noiseSweep(t, 0.55, 380, 2600, 0.06);
    this._tone(180, 0.16, { type: 'square', gain: 0.05, when: t });
    this._tone(90, 0.22, { type: 'sine', gain: 0.06, when: t + 0.02 });
  }

  /**
   * Sembol patlaması. Üst üste (zincirleme) patlamalarda **tizleşir**.
   * @param {number} level kaçıncı zincir (0, 1, 2 …)
   */
  pop(level = 0) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const pitch = 320 * 1.22 ** Math.min(6, level);
    this._noiseSweep(t, 0.16, pitch * 1.4, pitch * 0.5, 0.05);
    this._tone(pitch, 0.16, { type: 'triangle', gain: 0.05, when: t });
    this._tone(pitch * 1.5, 0.12, { type: 'sine', gain: 0.03, when: t + 0.02 });
  }

  /** Çarpan küresi fırlatma: heyecan verici yükselen süpürme. */
  cast() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.42);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.075, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.linearRampToValueAtTime(5200, t + 0.4);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.6);
    this._noiseSweep(t + 0.1, 0.3, 2600, 5200, 0.03);
  }

  /** Küre hücreye konduğunda kısa "tık". */
  land() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    this._tone(720, 0.08, { type: 'sine', gain: 0.04, when: t });
  }

  /** Küçük kazanç / bakiye artışı. */
  win(big = false) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const notes = big ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    notes.forEach((freq, index) => {
      this._tone(freq, big ? 0.5 : 0.3, {
        type: 'triangle',
        gain: 0.06,
        when: t + index * (big ? 0.11 : 0.08),
      });
    });
    if (big) this._noiseSweep(t, 0.5, 2000, 6000, 0.03);
  }

  /** Bonus başlangıcı: kısa fanfar + parıltı. */
  bonus() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const notes = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, index) => {
      this._tone(freq, 0.6, {
        type: index % 2 ? 'sine' : 'triangle',
        gain: 0.055,
        when: t + index * 0.13,
      });
    });
    this._noiseSweep(t, 0.9, 1200, 7000, 0.035);
  }

  /** Bonus sonu: sıcak bir akor. */
  bonusEnd() {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
      this._tone(freq, 1.1, {
        type: 'sine',
        gain: 0.05,
        attack: 0.05,
        release: 0.9,
        when: t + index * 0.05,
      });
    });
  }

  /** Bakiye sayaçı: hızlı para tıkırtısı. */
  coins(count = 8) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < count; i += 1) {
      this._tone(900 + (i % 4) * 120, 0.06, {
        type: 'square',
        gain: 0.02,
        when: t + i * 0.05,
      });
    }
  }

  click() {
    if (!this._ready()) return;
    this._tone(520, 0.06, { type: 'sine', gain: 0.035, when: this.ctx.currentTime });
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────────

  _ready() {
    return Boolean(this.ctx && this.enabled && this.master);
  }

  _noiseBuffer() {
    const length = Math.floor(this.ctx.sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _tone(freq, duration, options = {}) {
    const ctx = this.ctx;
    const when = options.when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, when);

    const peak = options.gain ?? 0.05;
    const attack = options.attack ?? 0.008;
    const release = options.release ?? Math.max(0.08, duration * 0.6);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    let node = osc;
    if (options.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = options.filter;
      node = node.connect(filter);
    }
    node.connect(gain);
    gain.connect(options.target ?? this.master);
    osc.start(when);
    osc.stop(when + duration + release * 0.2);
    return { osc, gain };
  }

  _noiseSweep(when, duration, from, to, gainValue) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this._noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(from, when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, to), when + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(gainValue, when + duration * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    source.connect(filter).connect(gain).connect(this.master);
    source.start(when);
    source.stop(when + duration + 0.05);
  }
}
