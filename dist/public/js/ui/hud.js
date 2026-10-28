// ─── Arayüz (DOM) ───────────────────────────────────────────────────────────
//
// 3D sahnenin üstünde duran HTML katmanı: bakiye, bahis, çevir düğmesi, bonus
// satın alma, ücretsiz tur rozeti, çarpan kutusu, bonus kazancı havuzu, bonus
// sonu ekranı, kazanç baloncukları, onay paneli, "nasıl oynanır" tablosu ve
// açılış çubuğu. Oyun akışı (`main.js`) yalnızca bu API'yi çağırır.
//
// Kazanç ayrı bir "son kazanç" alanında tutulmaz: doğrudan **ana bakiyeye**
// eklenir (sayaç animasyonuyla) ve yanında yalnız kısa süreli "+N" baloncuğu
// belirir. **Bonus kazancı** ise bonus bitene kadar burada birikir.

import { BETS, BONUS_BUY_X, CRYSTAL_ASSET, FREE_SPINS, SCATTER_TRIGGER } from '../config.js';
import { formatCoins, shortCoins, clamp } from '../core/utils.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor({ onSpin, onBet, onBuy, onSound, onLeaderboard, payRows }) {
    this.el = {
      balance: $('balance'),
      balancePill: $('balance-pill'),
      balanceGain: $('balance-gain'),
      bet: $('bet'),
      betDown: $('bet-down'),
      betUp: $('bet-up'),
      spin: $('spin'),
      spinLabel: document.querySelector('.spin-label'),
      buy: $('buy'),
      buyCost: $('buy-cost'),
      freeBadge: $('free-badge'),
      freeLeft: $('free-left'),
      multBox: $('mult-box'),
      multBoxTotal: $('mult-box-total'),
      bonusPool: $('bonus-pool'),
      bonusPoolValue: $('bonus-pool-value'),
      bonusEnd: $('bonus-end'),
      bonusEndValue: $('bonus-end-value'),
      scatterHint: $('scatter-hint'),
      scatterText: $('scatter-text'),
      bigWin: $('big-win'),
      bigWinValue: $('big-win-value'),
      freeIntro: $('free-intro'),
      freeIntroCount: $('free-intro-count'),
      toasts: $('toasts'),
      overlay: $('overlay'),
      sheet: $('overlay-sheet'),
      sheetTitle: $('overlay-title'),
      sheetBody: $('overlay-body'),
      ok: $('overlay-ok'),
      cancel: $('overlay-cancel'),
      helpButton: $('help'),
      helpOverlay: $('help-overlay'),
      helpBody: document.querySelector('.help-body'),
      helpSymbols: $('help-symbols'),
      helpBet: $('help-bet'),
      helpClose: $('help-close'),
      sound: $('sound'),
      boardButton: $('board'),
      boardOverlay: $('board-overlay'),
      boardList: $('board-list'),
      boardMe: $('board-me'),
      boardClose: $('board-close'),
      boardRefresh: $('board-refresh'),
      boardSub: document.querySelector('.board-sub'),
      boardTimer: $('board-timer'),
      boardTimerValue: $('board-timer-value'),
      boot: $('stage-loading'),
      bootFill: $('boot-fill'),
      bootNote: $('boot-note'),
    };

    this.payRows = payRows ?? null;
    this._onLeaderboard = onLeaderboard ?? null;
    this.bet = BETS[3] ?? 1000;
    this.balance = 0;
    this._shownBalance = 0;
    this._countRaf = 0;
    this._toasts = [];
    this._busy = false;

    this._bind(onSpin, onBet, onBuy, onSound);
    this.setBet(this.bet);
    this.setBalance(0, false);
  }

  // ── Kurulum ─────────────────────────────────────────────────────────────

  _bind(onSpin, onBet, onBuy, onSound) {
    this.el.spin.addEventListener('click', () => {
      if (this._busy) return;
      onSpin?.();
    });
    this.el.buy.addEventListener('click', () => {
      if (this._busy) return;
      onBuy?.();
    });
    this.el.betDown.addEventListener('click', () => {
      if (this._busy) return;
      onBet?.(-1);
    });
    this.el.betUp.addEventListener('click', () => {
      if (this._busy) return;
      onBet?.(1);
    });

    this.el.sound?.addEventListener('click', () => {
      const on = onSound?.();
      this.setSound(on);
    });

    // Liderlik tablosu: açılınca veri sunucudan istenir.
    this.el.boardButton?.addEventListener('click', () => {
      this.openLeaderboard();
      this._onLeaderboard?.();
    });
    this.el.boardRefresh?.addEventListener('click', () => {
      this.openLeaderboard();
      this._onLeaderboard?.();
    });
    this.el.boardClose?.addEventListener('click', () => {
      this._stopBoardTimer();
      this.el.boardOverlay.hidden = true;
    });
    this.el.boardOverlay?.addEventListener('click', (event) => {
      if (event.target === this.el.boardOverlay) {
        this._stopBoardTimer();
        this.el.boardOverlay.hidden = true;
      }
    });

    // Yardım: oyun ortasında açılır, oyunu duraklatmaz.
    this.el.helpButton?.addEventListener('click', () => {
      this.el.helpOverlay.hidden = false;
      // Panel **baştan** okunsun (önceki kaydırma konumu kalmasın).
      if (this.el.helpBody) this.el.helpBody.scrollTop = 0;
    });
    this.el.helpClose?.addEventListener('click', () => {
      this.el.helpOverlay.hidden = true;
    });
    this.el.helpOverlay?.addEventListener('click', (event) => {
      if (event.target === this.el.helpOverlay) this.el.helpOverlay.hidden = true;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      this.el.helpOverlay.hidden = true;
      this.el.boardOverlay.hidden = true;
    });
  }

  /** Ses düğmesinin görünümü (açık/kapalı). */
  setSound(on) {
    if (!this.el.sound) return;
    this.el.sound.classList.toggle('off', !on);
    this.el.sound.textContent = on ? '♪' : '♪̸';
    this.el.sound.title = on ? 'Sesi kapat' : 'Sesi aç';
  }

  // ── Bahis ───────────────────────────────────────────────────────────────

  setBet(value) {
    const index = BETS.indexOf(value);
    this.bet = index >= 0 ? value : clamp(value, BETS[0], BETS[BETS.length - 1]);
    this.el.bet.textContent = shortCoins(this.bet);
    this.el.buyCost.textContent = shortCoins(this.bet * BONUS_BUY_X);
    // Ödeme tablosu bahse göre **matematiksel** ölçeklenir.
    if (this.payRows) this.setPaytable(this.payRows(this.bet));
  }

  stepBet(direction) {
    const index = BETS.indexOf(this.bet);
    const next = clamp(index + direction, 0, BETS.length - 1);
    this.setBet(BETS[next]);
    return this.bet;
  }

  // ── Bakiye ──────────────────────────────────────────────────────────────

  setBalance(value, animate = true) {
    const target = Math.max(0, Math.round(Number(value) || 0));
    this.balance = target;
    if (!animate) {
      this._shownBalance = target;
      this.el.balance.textContent = formatCoins(target);
      return;
    }
    this._animateBalance(target);
  }

  _animateBalance(target) {
    cancelAnimationFrame(this._countRaf);
    const from = this._shownBalance;
    const delta = target - from;
    if (!delta) {
      this.el.balance.textContent = formatCoins(target);
      return;
    }
    const duration = Math.min(680, 240 + Math.abs(delta) * 0.04);
    const started = performance.now();
    const tick = (now) => {
      const k = clamp((now - started) / duration, 0, 1);
      const eased = 1 - (1 - k) ** 3;
      this._shownBalance = from + delta * eased;
      this.el.balance.textContent = formatCoins(this._shownBalance);
      if (k < 1) this._countRaf = requestAnimationFrame(tick);
      else this._shownBalance = target;
    };
    this._countRaf = requestAnimationFrame(tick);
  }

  /**
   * Kazancı ana bakiyeye işler: bakiye sayaçla artar, pil nabız atar ve
   * yanında kısa süreli "+N" baloncuğu yükselip kaybolur.
   */
  credit(amount, nextBalance) {
    const gain = Math.round(Number(amount) || 0);
    this.setBalance(nextBalance ?? this.balance + gain);
    if (gain <= 0) return;
    this.bumpBalance();
    const bubble = this.el.balanceGain;
    if (!bubble) return;
    bubble.textContent = `+${formatCoins(gain)}`;
    bubble.hidden = false;
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');
    clearTimeout(this._gainTimer);
    this._gainTimer = setTimeout(() => {
      bubble.classList.remove('show');
      this._gainTimer = setTimeout(() => {
        bubble.hidden = true;
      }, 320);
    }, 1200);
  }

  /** Bakiye güncellendiğinde kısa bir nabız. */
  bumpBalance() {
    const pill = this.el.balancePill;
    pill.classList.remove('bump');
    // Yeniden başlatmak için okuma zorunlu (reflow).
    void pill.offsetWidth;
    pill.classList.add('bump');
  }

  // ── Bonus / çarpan ──────────────────────────────────────────────────────

  setFree(state) {
    const left = Math.max(0, state?.left ?? 0);
    this.el.freeBadge.hidden = left <= 0;
    if (left > 0) this.el.freeLeft.textContent = String(left);
    if (left <= 0) {
      this.setMultiplier(0);
      this.showBonusPool(false);
    }
  }

  /**
   * Bonus çarpanı: **tek sabit rakam**. Yeni çarpan geldikçe rakam büyür;
   * altta kırılım listesi tutulmaz (yer kaplamaz).
   * @param {number} value toplam çarpan
   * @param {Array<number>} [_values] eski çağrılarla uyum (kullanılmaz)
   * @param {boolean} [persistent] true → bonus boyunca kutu **hep görünür**
   */
  setMultiplier(value, _values = null, persistent = false) {
    const multiplier = Math.max(0, Math.round(Number(value) || 0));
    this.el.multBox.hidden = !persistent && multiplier <= 1;
    if (multiplier <= 1) {
      if (persistent) this.el.multBoxTotal.textContent = 'x1';
      return;
    }
    this.el.multBoxTotal.textContent = `x${multiplier}`;
    const box = this.el.multBox;
    box.classList.remove('bump');
    void box.offsetWidth;
    box.classList.add('bump');
  }

  /** Bonus kazancı havuzu (bonus boyunca birikir). */
  setBonusPool(amount) {
    const value = Math.max(0, Math.round(Number(amount) || 0));
    if (this.el.bonusPoolValue) this.el.bonusPoolValue.textContent = formatCoins(value);
    if (!this.el.bonusPool) return;
    this.el.bonusPool.classList.remove('bump');
    void this.el.bonusPool.offsetWidth;
    this.el.bonusPool.classList.add('bump');
  }

  showBonusPool(show) {
    if (this.el.bonusPool) this.el.bonusPool.hidden = !show;
  }

  setScatter(count) {
    if (count <= 0) {
      this.el.scatterHint.hidden = true;
      return;
    }
    this.el.scatterHint.hidden = false;
    this.el.scatterText.textContent = `${count} / ${SCATTER_TRIGGER}`;
  }

  /** Sahnenin ortasında büyük kazanç etiketi (kısa süreli). */
  flashBigWin(amount, label = 'BÜYÜK KAZANÇ') {
    const box = this.el.bigWin;
    box.querySelector('small').textContent = label;
    this.el.bigWinValue.textContent = shortCoins(amount);
    box.hidden = false;
    box.classList.add('show');
    clearTimeout(this._bigWinTimer);
    this._bigWinTimer = setTimeout(() => {
      box.classList.remove('show');
      this._bigWinTimer = setTimeout(() => {
        box.hidden = true;
      }, 260);
    }, 1500);
  }

  /**
   * Bonus girişi: sahnenin ortasında "15 FREE SPIN" yazar.
   * @param {number} spins kaç tur
   * @param {number} hold  ekranda kalma süresi (ms)
   */
  async showFreeIntro(spins = FREE_SPINS, hold = 3000) {
    this.el.freeIntroCount.textContent = String(spins);
    this.el.freeIntro.hidden = false;
    void this.el.freeIntro.offsetWidth;
    this.el.freeIntro.classList.add('show');
    await new Promise((resolve) => setTimeout(resolve, hold));
    this.el.freeIntro.classList.remove('show');
    await new Promise((resolve) => setTimeout(resolve, 320));
    this.el.freeIntro.hidden = true;
  }

  /**
   * Bonus sonu: ortada "KAZANDIN" + bonus kazancı.
   * @param {number} amount bonus boyunca toplanan kristal
   * @param {number} hold   ekranda kalma süresi (ms)
   */
  async showBonusEnd(amount, hold = 3000) {
    if (!this.el.bonusEnd) return;
    this.el.bonusEndValue.textContent = formatCoins(amount);
    this.el.bonusEnd.hidden = false;
    void this.el.bonusEnd.offsetWidth;
    this.el.bonusEnd.classList.add('show');
    await new Promise((resolve) => setTimeout(resolve, hold));
    this.el.bonusEnd.classList.remove('show');
    await new Promise((resolve) => setTimeout(resolve, 320));
    this.el.bonusEnd.hidden = true;
  }

  // ── Durum ───────────────────────────────────────────────────────────────

  setBusy(busy, label) {
    this._busy = busy;
    this.el.spin.disabled = busy;
    this.el.buy.disabled = busy;
    this.el.spin.classList.toggle('spinning', busy);
    if (this.el.spinLabel) this.el.spinLabel.textContent = label ?? (busy ? '…' : 'ÇEVİR');
  }

  get busy() {
    return this._busy;
  }

  // ── Bildirimler ─────────────────────────────────────────────────────────

  toast(text, kind = '') {
    if (!text) return;
    const node = document.createElement('div');
    node.className = `toast ${kind}`.trim();
    node.textContent = text;
    this.el.toasts.appendChild(node);
    const entry = { node };
    this._toasts.push(entry);
    // Aynı anda en çok 3 bildirim: yenisi gelince eskisi çıkar.
    while (this._toasts.length > 3) {
      const old = this._toasts.shift();
      old.node.remove();
    }
    setTimeout(() => {
      node.classList.add('leaving');
      setTimeout(() => {
        node.remove();
        this._toasts = this._toasts.filter((t) => t !== entry);
      }, 260);
    }, 2600);
  }

  // ── Onay paneli ─────────────────────────────────────────────────────────

  /**
   * Alttan açılan onay paneli.
   * @returns {Promise<boolean>} "Tamam" seçildiyse `true`.
   */
  ask({ title, body, ok = 'Tamam', cancel = 'Vazgeç' }) {
    return new Promise((resolve) => {
      const el = this.el;
      el.sheetTitle.textContent = title;
      el.sheetBody.textContent = body;
      el.ok.textContent = ok;
      el.cancel.textContent = cancel;
      el.cancel.hidden = !cancel;
      el.overlay.hidden = false;

      const finish = (result) => {
        el.overlay.hidden = true;
        el.ok.removeEventListener('click', onOk);
        el.cancel.removeEventListener('click', onCancel);
        el.overlay.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = (event) => {
        if (event.target === el.overlay) finish(false);
      };
      const onKey = (event) => {
        if (event.key === 'Escape') finish(false);
      };

      el.ok.addEventListener('click', onOk);
      el.cancel.addEventListener('click', onCancel);
      el.overlay.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
    });
  }

  /** Sade bilgi paneli (tek düğme). */
  info({ title, body, ok = 'Devam' }) {
    return this.ask({ title, body, ok, cancel: '' });
  }

  // ── Liderlik tablosu ────────────────────────────────────────────────────

  /** Paneli açar ve "yükleniyor" durumuna alır. */
  openLeaderboard() {
    if (!this.el.boardOverlay) return;
    this.el.boardOverlay.hidden = false;
    this.el.boardMe.hidden = true;
    this.el.boardList.innerHTML = '<div class="board-empty">Yükleniyor…</div>';
  }

  /** Sunucudan gelen satırları çizer. */
  /** Günlük sıfırlanmaya kalan süre (her saniye yenilenir). */
  _startBoardTimer(resetsAt, offset = 0) {
    this._stopBoardTimer();
    const box = this.el.boardTimer;
    const value = this.el.boardTimerValue;
    if (!box || !value || !resetsAt) {
      if (box) box.hidden = true;
      return;
    }
    box.hidden = false;
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const left = Math.max(0, resetsAt - (Date.now() + offset));
      const total = Math.floor(left / 1000);
      value.textContent = `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
      box.classList.toggle('soon', total <= 600);
      // Süre dolunca tablo sıfırlanmış olur: yeniden yükle.
      if (left <= 0) {
        this._stopBoardTimer();
        setTimeout(() => this._onLeaderboard?.(), 1500);
      }
    };
    tick();
    this._boardTimer = setInterval(tick, 1000);
  }

  _stopBoardTimer() {
    if (this._boardTimer) clearInterval(this._boardTimer);
    this._boardTimer = 0;
  }

  setLeaderboard({ rows = [], me = null, demo = false, resetsAt = 0, offset = 0 } = {}) {
    const list = this.el.boardList;
    if (!list) return;
    list.textContent = '';
    list.scrollTop = 0;
    this._startBoardTimer(resetsAt, offset);

    if (this.el.boardSub) {
      this.el.boardSub.textContent = demo
        ? 'Demo sıralama — yayında gerçek oyuncular görünür.'
        : "Bugün en çok kazanan oyuncular. Tablo her gün 00:00'da sıfırlanır.";
    }

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'board-empty';
      empty.textContent = 'Bugün henüz kazanan yok. İlk sırayı sen kap! ';
      empty.append(Object.assign(document.createElement('b'), { textContent: '🏆' }));
      list.appendChild(empty);
    }

    for (const row of rows) {
      const rank = Number(row.rank) || 0;
      const line = document.createElement('div');
      line.className = `board-row top${rank}`;
      if (row.is_me) line.classList.add('me');

      const rankCell = document.createElement('div');
      rankCell.className = 'board-rank';
      rankCell.textContent = String(rank);
      line.appendChild(rankCell);

      // Avatar: varsa resim, yoksa baş harf (kullanıcı adı güvenli yazılır).
      const avatar = document.createElement('div');
      avatar.className = 'board-avatar';
      const name = String(row.username ?? '').trim() || 'Oyuncu';
      if (row.avatar_url) {
        const img = document.createElement('img');
        img.src = String(row.avatar_url);
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        avatar.appendChild(img);
      } else {
        avatar.textContent = name.slice(0, 1).toLocaleUpperCase('tr-TR');
      }
      line.appendChild(avatar);

      const who = document.createElement('div');
      who.className = 'board-who';
      who.append(
        Object.assign(document.createElement('b'), { textContent: name }),
        Object.assign(document.createElement('small'), {
          textContent: `${shortCoins(Number(row.spins) || 0)} tur · ${shortCoins(
            Number(row.won) || 0,
          )} kristal kazandı`,
        }),
      );
      line.appendChild(who);

      const net = document.createElement('div');
      net.className = 'board-net';
      const coin = document.createElement('img');
      coin.className = 'coin';
      coin.src = CRYSTAL_ASSET;
      coin.alt = '';
      net.append(coin, document.createTextNode(`+${shortCoins(Number(row.net) || 0)}`));
      line.appendChild(net);

      list.appendChild(line);
    }

    // Kendi özetin (sunucu yalnız giriş yapmışken verir).
    const box = this.el.boardMe;
    if (box) {
      const spins = Number(me?.spins) || 0;
      const net = Number(me?.net) || 0;
      if (me && spins > 0) {
        box.hidden = false;
        box.textContent = '';
        const left = document.createElement('span');
        left.textContent = me.rank > 0 ? `Sıran #${me.rank}` : 'Sıralamada değilsin';
        const right = document.createElement('b');
        right.textContent = `${net >= 0 ? '+' : ''}${shortCoins(net)} · ${shortCoins(spins)} tur`;
        box.append(left, right);
      } else {
        box.hidden = true;
      }
    }
  }

  /** Tablo yüklenemediğinde. */
  failLeaderboard(text) {
    const list = this.el.boardList;
    if (!list) return;
    list.textContent = '';
    const box = document.createElement('div');
    box.className = 'board-empty';
    box.textContent = text || 'Liderlik tablosu yüklenemedi.';
    list.appendChild(box);
  }

  // ── Ödeme tablosu ───────────────────────────────────────────────────────

  /**
   * Yardım ekranındaki sembol listesini kurar.
   * @param {{rows: Array<{icon: string, name: string, pay: string, extra?: string}>, note?: string}} table
   */
  setPaytable(table) {
    if (!this.el.helpSymbols) return;
    const rows = table?.rows ?? [];
    if (this.el.helpBet) this.el.helpBet.textContent = table?.note ?? '';
    this.el.helpSymbols.innerHTML = '';
    for (const row of rows) {
      const cell = document.createElement('div');
      cell.className = 'help-symbol';
      const img = document.createElement('img');
      img.src = row.icon;
      img.alt = row.name;
      img.loading = 'lazy';
      const name = document.createElement('span');
      name.textContent = row.name;
      const pay = document.createElement('b');
      pay.textContent = row.pay;
      if (row.extra) pay.title = row.extra;
      cell.append(img, name, pay);
      this.el.helpSymbols.appendChild(cell);
    }
  }

  // ── Açılış ──────────────────────────────────────────────────────────────

  boot(percent, note) {
    const value = clamp(Math.round(percent), 0, 100);
    this.el.bootFill.style.width = `${value}%`;
    this.el.boot.setAttribute('aria-valuenow', String(value));
    if (note) this.el.bootNote.textContent = note;
  }

  bootError(text) {
    this.el.bootNote.textContent = text;
    this.el.bootFill.style.width = '100%';
    this.el.bootFill.style.background = 'linear-gradient(90deg, #ff6b6b, #ff9d2e)';
  }

  hideBoot() {
    const boot = this.el.boot;
    boot.classList.add('done');
    setTimeout(() => {
      boot.hidden = true;
    }, 520);
  }

  freeSpinsLabel() {
    return `${FREE_SPINS} ÜCRETSİZ TUR`;
  }
}
