// ─── Demo motoru (yerel / hesapsız) ─────────────────────────────────────────
//
// Yalnız geliştirmede ve yerelde çalışır: gerçek kristale dokunmaz. Matematik
// `spin-model.js`'in aynısıdır (sunucudaki `dede_spin` ile aynı kurallar),
// böylece oyunu hesap açmadan denemek mümkün.

import { BONUS_BUY_X, BETS, DEMO_BALANCE, FREE_SPINS } from '../config.js';
import { playSpin } from './spin-model.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class DemoEngine {
  constructor() {
    this.mode = 'demo';
    this.listeners = new Set();
    this.balance = DEMO_BALANCE;
    this.free = { left: 0, bet: 0, multiplier: 0 };
    this.connected = true;
    this.needsLogin = false;
    this.error = '';
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    const snapshot = {
      mode: 'demo',
      connected: true,
      needsLogin: false,
      balance: this.balance,
      free: { ...this.free },
    };
    for (const fn of this.listeners) {
      try {
        fn(snapshot);
      } catch (error) {
        console.error('[dede/demo] dinleyici hatası', error);
      }
    }
  }

  async connect() {
    await wait(120);
    this._emit();
    return this;
  }

  disconnect() {}

  async refresh() {
    this._emit();
  }

  async spin(bet) {
    const inFree = this.free.left > 0;
    const amount = BETS.includes(bet) ? bet : BETS[0];
    if (!inFree && this.balance < amount) {
      return { error: 'Kristal bakiyen bu bahis için yetersiz.' };
    }
    await wait(160);

    const script = playSpin(amount, {
      free: inFree ? { ...this.free } : undefined,
    });

    if (!inFree) this.balance -= script.cost;
    this.balance += script.totalWin;
    this.free = {
      left: script.free.left,
      bet: script.free.bet,
      multiplier: script.free.left > 0 ? script.free.multiplier : 0,
    };
    this._emit();
    return { script, balance: this.balance };
  }

  async buyBonus(bet) {
    const amount = BETS.includes(bet) ? bet : BETS[0];
    if (this.free.left > 0) {
      return { error: 'Bonus turun bitmeden yeni bonus alamazsın.' };
    }
    const cost = amount * BONUS_BUY_X;
    if (this.balance < cost) {
      return { error: 'Kristal bakiyen bu bonus için yetersiz.' };
    }
    await wait(200);

    this.balance -= cost;
    this.free = { left: FREE_SPINS, bet: amount, multiplier: 0 };
    const script = playSpin(amount, { free: { ...this.free } });
    this.balance += script.totalWin;
    this.free = {
      left: script.free.left,
      bet: script.free.bet,
      multiplier: script.free.multiplier,
    };
    this._emit();
    return { script, balance: this.balance, bought: true };
  }
}
