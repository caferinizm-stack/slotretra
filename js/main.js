// ─── Şanslı Dede · oyun akışı ───────────────────────────────────────────────
//
// Sunucu (veya demo motoru) bir tur için **hazır senaryo** döndürür:
//   steps[] = her düşüş/patlama adımının tahtası, eşleşmeleri, çarpanları ve
//   kazancı. Bu dosya o senaryoyu **oynatır** — zar atma/hesap yapma yoktur.
//
// Akış:
//   çevir → tahta düşer → eşleşmeler parlar → semboller **patlar** → Dede
//   çarpanları fırlatır → … zincir biter → çarpanlar uçar → kazanç **ana
//   bakiyeye** animasyonla eklenir.
//
// **Bonus** ayrı bir havuzda toplanır: bonus boyunca bakiye değişmez; 15 tur
// bitince ortada "KAZANDIN" + bonus kazancı görünür, 3 saniye sonra bakiyeye
// eklenir.

import {
  BONUS_BUY_X,
  FREE_SPINS,
  SYMBOLS,
  SYMBOL_BY_ID,
  WIN_NOTICE_MIN,
} from './config.js';
import { formatCoins, wait } from './core/utils.js';
import { Sound } from './core/audio.js';
import { createEngine } from './engine/index.js';
import { Stage } from './scene/stage.js';
import { symbolDataURL } from './scene/textures.js';
import { Hud } from './ui/hud.js';

const canvas = document.getElementById('scene');

/** Uygulama köprüsü (Flutter WebView). Yoksa sessizce yok sayılır. */
function notifyApp(message) {
  try {
    window.RetraGame?.postMessage(message);
  } catch {
    /* köprü yok */
  }
}

const scatterCount = (grid) =>
  grid.reduce((count, id) => count + (SYMBOL_BY_ID.get(id)?.scatter ? 1 : 0), 0);

/** Ödeme tablosu metni: 0.083 → "0,08". */
const payText = (value) => value.toFixed(2).replace('.', ',');

/**
 * Açılışta tahta **dolu** görünsün diye rastgele bir dizilim.
 *
 * Yalnız görseldir: bahis, kazanç veya sunucu durumu **etkilenmez**. İlk
 * çevirişte sunucunun gerçek tahtası bunun üzerine düşer.
 */
function randomBoard() {
  const total = SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
  const pick = () => {
    let roll = Math.random() * total;
    for (const symbol of SYMBOLS) {
      roll -= symbol.weight;
      if (roll <= 0) return symbol.id;
    }
    return SYMBOLS[0].id;
  };
  return Array.from({ length: 30 }, pick);
}

class Game {
  constructor() {
    this.stage = new Stage(canvas);
    this.sound = new Sound();
    this.engine = null;
    this.playing = false;
    /** Bonus boyunca toplanan kristal (ana bakiyeye karışmaz). */
    this.bonusPool = 0;
    /** Bonus boyunca gelen çarpanların kırılımı. */
    this.multValues = [];

    this.hud = new Hud({
      onSpin: () => {
        this.sound.unlock();
        this.sound.click();
        this.runSession();
      },
      onBuy: () => {
        this.sound.unlock();
        this.sound.click();
        this.buyBonus();
      },
      onBet: (direction) => {
        this.sound.unlock();
        this.sound.click();
        this.changeBet(direction);
      },
      onSound: () => this.sound.toggle(),
      onLeaderboard: () => this.refreshLeaderboard(),
      payRows: (bet) => this.payRows(bet),
    });
    this.hud.setSound(this.sound.enabled);
    this.hud.setBalance(0, false);
    this.stage.orbs.onLand = () => this.sound.land();
    this.bindSoundUnlock();
  }

  /** Son 24 saatin liderlik tablosu (gerçek Supabase verisi). */
  async refreshLeaderboard() {
    const engine = this.engine;
    if (!engine?.leaderboard) {
      this.hud.failLeaderboard('Liderlik tablosu yüklenemedi.');
      return;
    }
    try {
      const result = await engine.leaderboard(10);
      if (result?.error) this.hud.failLeaderboard(result.error);
      else this.hud.setLeaderboard(result);
    } catch (error) {
      console.error('[dede] liderlik hatası', error);
      this.hud.failLeaderboard('Sunucuya ulaşılamadı. Tekrar dene.');
    }
  }

  /** Tarayıcı sesi ilk dokunuşta açar. */
  bindSoundUnlock() {
    const unlock = () => this.sound.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  async boot() {
    const hud = this.hud;
    hud.boot(10, 'Olympos kapıları açılıyor…');
    await wait(60);
    hud.boot(42, 'Tahta hazırlanıyor…');

    // Yardım ekranı (sembol ödemeleri) — sahne kurulurken hazırlanır.
    hud.setPaytable(this.payRows(this.hud.bet));

    this.engine = await createEngine();
    this.engine.on((snapshot) => {
      // **Önemli:** oyun oynarken bakiye sunucudan *anında* gelir; kazanç
      // semboller patlamadan bakiyeye yazılmasın diye yalnız boştayken uygula.
      if (!this.playing) {
        this.hud.setBalance(snapshot.balance);
        this.hud.setFree(snapshot.free);
      }
      if (snapshot.error) this.hud.toast(snapshot.error, 'warn');
    });

    hud.boot(68, 'Hesap bağlanıyor…');
    await this.engine.connect();
    hud.boot(88, 'Küreler ısınıyor…');

    // Gerçek modda oturum yoksa: kristalle oynanamaz, demo ile kandırmıyoruz.
    if (this.engine.mode === 'live' && this.engine.needsLogin) {
      this.hud.setBusy(true, 'KAPALI');
      this.hud.toast('Oturum bulunamadı. Uygulamaya dönüp oyunu tekrar aç.', 'error');
    }

    // Tahta açılışta dolu ve canlı görünsün.
    this.stage.grid.show(randomBoard());

    hud.boot(100, 'Hazır');
    this.syncState();
    setTimeout(() => hud.hideBoot(), 180);
    notifyApp('ready');

    this.startLoop();
    this.bindKeys();
  }

  /**
   * Ödeme tablosu: **bahis katı** ve o bahisteki kristal karşılığı.
   * Bahis değişince tablo yeniden hesaplanır (matematiksel ölçek).
   */
  payRows(bet) {
    const rows = SYMBOLS.map((symbol) => ({
      icon: symbolDataURL(symbol.id),
      name: symbol.name,
      pay: symbol.scatter ? 'BONUS' : `×${payText(symbol.pay)}`,
      extra: symbol.scatter
        ? '4+ Zeus 15 ücretsiz tur açar'
        : `${formatCoins(Math.floor(bet * symbol.pay))} kristal (8 sembol)`,
    }));
    const top = SYMBOLS.filter((s) => !s.scatter).reduce(
      (best, s) => (s.pay > best.pay ? s : best),
      SYMBOLS[0],
    );
    return {
      rows,
      note: `Bahis ${formatCoins(bet)} · 8 sembolde en yüksek ödeme ${top.name}: ${formatCoins(
        Math.floor(bet * top.pay),
      )} kristal`,
    };
  }

  syncState() {
    if (!this.engine) return;
    this.hud.setBalance(this.engine.balance);
    this.hud.setFree(this.engine.free);
    if ((this.engine.free?.left ?? 0) <= 0) {
      this.hud.setMultiplier(0);
      this.hud.showBonusPool(false);
    }
  }

  changeBet(direction) {
    if (this.playing) return;
    if ((this.engine?.free?.left ?? 0) > 0) {
      this.hud.toast('Bonus turunda bahis değişmez.', 'warn');
      return;
    }
    this.hud.stepBet(direction);
  }

  /**
   * Ekrandaki bir DOM öğesinin merkezinin 3B karşılığı.
   * Çarpanlar buraya uçar (bakiye / bonus havuzu).
   */
  elementWorldPoint(id, planeZ = 1.6) {
    const host = this.stage.canvas.getBoundingClientRect();
    const rect = document.getElementById(id)?.getBoundingClientRect();
    if (!rect || !host.width) return this.stage.screenPointToWorld(0, 0, planeZ);
    const x = rect.left + rect.width / 2 - host.left;
    const y = rect.top + rect.height / 2 - host.top;
    return this.stage.screenPointToWorld(x, y, planeZ);
  }

  balanceWorldPoint() {
    return this.elementWorldPoint('balance-pill');
  }

  bonusPoolWorldPoint() {
    return this.elementWorldPoint('bonus-pool');
  }

  // ── Oturum: çeviriş(ler) + otomatik bonus turu ──────────────────────────

  async runSession({ buy = false } = {}) {
    if (this.playing || !this.engine) return;
    if (this.engine.mode === 'live' && this.engine.needsLogin) {
      this.hud.toast('Oturum bulunamadı. Uygulamaya dönüp tekrar aç.', 'error');
      return;
    }

    this.playing = true;
    this.hud.setBusy(true, buy ? 'BONUS' : 'ÇEVİR');
    this.stage.orbs.clear();
    this.stage.grid.resetGlow();
    this.multValues = [];
    this.sound.spin();

    let bonusStarted = false;

    try {
      let response = buy
        ? await this.engine.buyBonus(this.hud.bet)
        : await this.engine.spin(this.hud.bet);

      if (response.error) {
        this.hud.toast(response.error, 'error');
        return;
      }

      // Bonus satın alındı: para düştü, ortada "15 FREE SPIN" (3 sn).
      if (buy) {
        this.hud.setBalance(response.balance, false);
        this.hud.setFree(response.script.free);
        this.beginBonus();
        bonusStarted = true;
        await this.hud.showFreeIntro(FREE_SPINS, 3000);
      }

      await this.playScript(response.script, response.balance, true, buy ? 'bonus' : 'base');

      // Doğal tetikleme (4+ Zeus): sembollü dedeler yanıp sönsün, sonra bonus.
      const award = response.script.freeAwarded ?? 0;
      if (!buy && award > 0) {
        this.sound.bonus();
        await this.stage.grid.celebrateScatters();
        this.stage.zeus.cast(2);
        this.stage.lightning();
        this.hud.toast(`${award} ücretsiz tur!`, 'success');
        this.beginBonus();
        bonusStarted = true;
        await this.hud.showFreeIntro(award, 3000);
      }

      let guard = 0;
      const wasFree = response.script.free.left > 0;
      while (response.script.free.left > 0 && guard < 80) {
        guard += 1;
        this.hud.setBusy(true, 'BONUS');
        await wait(620);

        this.sound.spin();
        response = await this.engine.spin(response.script.free.bet);
        if (response.error) {
          this.hud.toast(response.error, 'error');
          break;
        }
        await this.playScript(response.script, response.balance, false, 'bonus');
      }

      // Bonus bitti: ortada "KAZANDIN" + bonus kazancı (3 sn), sonra bakiyeye.
      if (bonusStarted && wasFree) {
        this.hud.setBusy(true, 'BONUS');
        await wait(320);
        await this.hud.showBonusEnd(this.bonusPool, 3000);
        this.sound.bonusEnd();
        const target = this.engine.balance;
        this.hud.credit(this.bonusPool, target);
        this.sound.coins();
        this.hud.toast(`Bonus kazancı +${formatCoins(this.bonusPool)} kristal`, 'success');
        if (this.bonusPool >= WIN_NOTICE_MIN) notifyApp(`win:${this.bonusPool}`);
        this.bonusPool = 0;
        this.multValues = [];
        this.hud.setMultiplier(0);
        this.hud.showBonusPool(false);
        this.hud.setFree({ left: 0, bet: 0, multiplier: 0 });
      }
    } catch (error) {
      console.error('[dede] tur hatası', error);
      this.hud.toast('Bir sorun oldu, tekrar dene.', 'error');
    } finally {
      this.playing = false;
      this.hud.setBusy(false);
      await this.stage.orbs.fadeOut();
      this.stage.grid.resetGlow();
      this.syncState();
    }
  }

  /** Bonus başlangıcı: havuzu sıfırla, göstergeleri aç. */
  beginBonus() {
    this.bonusPool = 0;
    this.multValues = [];
    this.hud.setBonusPool(0);
    this.hud.showBonusPool(true);
    this.hud.setMultiplier(1, [], true);
  }

  // ── Senaryoyu oynat ─────────────────────────────────────────────────────

  async playScript(script, balanceAfter, isNewSpin, mode = 'base') {
    const hud = this.hud;
    const stage = this.stage;
    const steps = script.steps ?? [];
    const inBonus = mode === 'bonus';

    // Bakiye: temel oyunda bahis düşmüş gibi gösterilir; bonus boyunca
    // **hiç dokunulmaz** (kazanç ayrı havuzda birikir).
    if (!inBonus) {
      hud.setBalance(Math.max(0, balanceAfter - script.totalWin), false);
    }
    hud.setFree(script.free);
    if (isNewSpin) hud.setScatter(0);

    let cleared = [];

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];

      // Tahta: ilk adım yukarıdan düşer, sonrakiler kayarak yenilenir.
      if (index === 0) {
        stage.grid.resetGlow();
        await stage.grid.dropIn(step.grid);
      } else {
        await stage.grid.tumble(cleared, step.grid);
      }

      cleared = [];
      hud.setScatter(scatterCount(step.grid));

      if (!step.clusters.length) break;

      // Eşleşenler parlar.
      stage.grid.highlight(step.clusters);
      await wait(280);

      // Dede çarpanları elinden fırlatır (bonus: birikmiş toplam).
      if (step.orbs.length) await this.launchOrbs(step.orbs);
      if (inBonus) {
        this.multValues.push(...step.orbs.map((orb) => orb.value));
        hud.setMultiplier(step.multiplier, this.multValues, true);
      } else {
        hud.setMultiplier(step.multiplier);
      }

      // Kazanç yazısı. **Bonus'ta** adım kazancı çarpansız toplanır; o
      // yüzden büyük etiket yalnız tur sonunda (settle) gösterilir.
      if (step.appliedWin >= script.bet * 10) {
        hud.flashBigWin(step.appliedWin, 'KAZANÇ');
        stage.shake(0.55);
      } else if (step.appliedWin > 0 || (inBonus && step.stepWin > 0)) {
        stage.shake(0.22);
      }

      // Patlama (zincirleme patlamalarda ses tizleşir).
      this.sound.pop(index);
      for (const cluster of step.clusters) {
        for (const cell of cluster.cells) cleared.push(cell);
      }
      // Aynı hücre iki kümede olamaz; yine de tekilleştir.
      const unique = new Map(cleared.map((cell) => [`${cell[0]}:${cell[1]}`, cell]));
      cleared = [...unique.values()];

      await stage.grid.pop(cleared);
    }

    hud.setScatter(0);

    if (inBonus) {
      // Çarpanlar bonus havuzuna uçar; kazanç havuzda toplanır (bakiye değişmez).
      await stage.orbs.collect(this.bonusPoolWorldPoint());

      // **Tur kapanışı:** semboller bitti → ham toplam × toplam çarpan.
      const settle = script.settle;
      if (settle && settle.total > 0) {
        hud.flashBigWin(settle.total, `×${settle.multiplier} ÇARPAN`);
        stage.shake(settle.total >= script.bet * 20 ? 0.5 : 0.3);
        await wait(560);
      }

      this.bonusPool += script.totalWin;
      this.hud.setBonusPool(this.bonusPool);
      if (script.totalWin > 0) this.sound.win(script.totalWin >= script.bet * 10);
      if (script.free.left > 0) hud.setFree(script.free);
      return;
    }

    // **Temel oyun**: semboller bittikten sonra çarpanlar bakiyeye uçar.
    await stage.orbs.collect(this.balanceWorldPoint());

    if (script.totalWin > 0) {
      hud.credit(script.totalWin, balanceAfter);
      this.sound.win(script.totalWin >= script.bet * 10);
      this.sound.coins();
      hud.toast(`+${formatCoins(script.totalWin)} kristal`, 'success');
      // At yarışındaki gibi: büyük kazanç uygulamada duyurulur.
      if (script.totalWin >= WIN_NOTICE_MIN) notifyApp(`win:${script.totalWin}`);
    } else {
      hud.setBalance(balanceAfter);
    }

    if (script.free.left > 0) {
      hud.setFree(script.free);
    } else {
      hud.setFree({ left: 0, bet: 0, multiplier: 0 });
      hud.setMultiplier(0);
    }
  }

  /** Dede'nin avucundan çarpanların uçuşu. */
  async launchOrbs(orbs) {
    const stage = this.stage;
    const hand = await new Promise((resolve) => {
      stage.zeus.cast(orbs.length, resolve);
    });
    this.sound.cast();
    stage.lightning();
    stage.shake(0.4);

    const flights = orbs.map((orb, index) =>
      stage.orbs.fly(
        orb.value,
        hand,
        stage.cellWorld(orb.c, orb.r),
        index * 0.14,
      ),
    );
    await Promise.all(flights);
    await wait(200);
  }

  // ── Bonus satın alma ────────────────────────────────────────────────────

  async buyBonus() {
    if (this.playing || !this.engine) return;
    if ((this.engine.free?.left ?? 0) > 0) {
      this.hud.toast('Bonus turun bitmeden yenisini alamazsın.', 'warn');
      return;
    }
    const cost = this.hud.bet * BONUS_BUY_X;
    if (this.engine.balance < cost) {
      this.hud.toast(
        `Bonus için ${formatCoins(cost)} kristal gerekiyor. Bahsi küçült.`,
        'warn',
      );
      return;
    }
    const sure = await this.hud.ask({
      title: '15 TUR BONUS',
      body: `${formatCoins(cost)} kristal karşılığında 15 ücretsiz tur. Tur boyunca toplanan çarpanlar birikir.`,
      ok: 'Satın al',
    });
    if (!sure) return;
    await this.runSession({ buy: true });
  }

  // ── Döngü ───────────────────────────────────────────────────────────────

  bindKeys() {
    document.addEventListener('keydown', (event) => {
      if (event.code !== 'Space') return;
      // Buton odaklıysa tarayıcının kendi tetiklemesi yeterli.
      if (event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') return;
      event.preventDefault();
      this.sound.unlock();
      this.runSession();
    });
  }

  startLoop() {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      this.stage.update(dt);
      this.stage.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

const game = new Game();

// Hata ayıklama köprüsü: WebView'de hata olursa konsoldan görülebilsin
// (sahne ve oyun akışı `__dede` üzerinden incelenebilir).
window.__dedeErrors = [];
window.addEventListener('error', (event) => {
  window.__dedeErrors.push(String(event.message ?? event.error));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__dedeErrors.push(String(event.reason));
});
window.__dede = game;

game.boot().catch((error) => {
  console.error('[dede] açılış hatası', error);
  game.hud.bootError('Oyun açılamadı. İnternetini kontrol edip tekrar dene.');
});
