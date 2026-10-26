// ─── Tween yöneticisi ───────────────────────────────────────────────────────
// Animasyonlar `requestAnimationFrame` döngüsünden `dt` (saniye) alır. Söz
// tabanlı API (`await tweens.add(...)`) akışı okunur kılar.

import { easeOutCubic } from './utils.js';

export class Tweens {
  constructor() {
    this.list = [];
  }

  /** @returns {Promise<void>} animasyon bitince çözülür. */
  add({ duration = 0.3, delay = 0, ease = easeOutCubic, onUpdate, onDone }) {
    return new Promise((resolve) => {
      this.list.push({
        t: -delay,
        duration: Math.max(0.001, duration),
        ease,
        onUpdate,
        onDone,
        resolve,
      });
    });
  }

  update(dt) {
    if (!this.list.length) return;
    // `onDone` içinde yeni tween eklenebilir (ör. kürenin "pop" animasyonu).
    // Bu yüzden aktif liste alınır, yeniler sonuna eklenir — böylece aynı
    // karede iki kez işlenmez ve kaybolmaz.
    const active = this.list;
    this.list = [];
    const keep = [];
    for (const tween of active) {
      tween.t += dt;
      if (tween.t < 0) {
        keep.push(tween);
        continue;
      }
      const raw = Math.min(1, tween.t / tween.duration);
      tween.onUpdate?.(tween.ease(raw), raw);
      if (raw >= 1) {
        tween.onDone?.();
        tween.resolve?.();
      } else {
        keep.push(tween);
      }
    }
    this.list = keep.concat(this.list);
  }

  clear() {
    for (const tween of this.list) tween.resolve?.();
    this.list = [];
  }
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
