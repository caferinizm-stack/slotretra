// ─── RTP simülasyonu ────────────────────────────────────────────────────────
// `node tools/simulate.mjs [tur] [bahis]`
//
// Oyunun **matematiğini** (spin-model.js) milyonlarca tur oynatıp gerçek
// geri ödeme oranını ölçer. Sunucudaki SQL aynı tabloyu kullandığı için bu
// ölçüm canlı RTP'yi temsil eder; tablo değişince burada yeniden bakılır.

import { mulberry32 } from '../js/core/utils.js';
import { playSpin } from '../js/engine/spin-model.js';

const spins = Number(process.argv[2] ?? 200000);
const bet = Number(process.argv[3] ?? 1000);
const random = mulberry32(20261026);

let wagered = 0;
let paid = 0;
let baseSpins = 0;
let freeSpinsPlayed = 0;
let bonusTriggers = 0;
let maxWin = 0;
let wins = 0;
let stepCount = 0;

let free = { left: 0, bet: 0, multiplier: 0 };

for (let i = 0; i < spins; i += 1) {
  const inFree = free.left > 0;
  const result = playSpin(bet, { free, random });

  if (!inFree) {
    baseSpins += 1;
    wagered += result.cost;
  } else {
    freeSpinsPlayed += 1;
  }

  if (result.freeAwarded > 0) bonusTriggers += 1;

  paid += result.totalWin;
  if (result.totalWin > 0) wins += 1;
  maxWin = Math.max(maxWin, result.totalWin / result.bet);
  stepCount += result.steps.length;

  free = {
    left: result.free.left,
    bet: result.free.bet,
    multiplier: result.free.left > 0 ? result.free.multiplier : 0,
  };
  // Bahis değişirse bonus da yeni bahisle oynanır.
  if (free.left > 0 && free.bet !== bet) free.bet = bet;
}

const pct = (n) => `${(n * 100).toFixed(2)}%`;
console.log(`Tur (bahisli)      : ${baseSpins.toLocaleString('tr-TR')}`);
console.log(`Ücretsiz tur       : ${freeSpinsPlayed.toLocaleString('tr-TR')}`);
console.log(`Bonus tetikleme    : ${bonusTriggers.toLocaleString('tr-TR')} ` +
  `(${(bonusTriggers / Math.max(1, baseSpins) * 100).toFixed(2)}%)`);
console.log(`Ortalama cascade   : ${(stepCount / Math.max(1, spins)).toFixed(2)}`);
console.log(`Kazanan tur oranı  : ${pct(wins / Math.max(1, spins))}`);
console.log(`Yatırılan          : ${wagered.toLocaleString('tr-TR')}`);
console.log(`Ödenen             : ${paid.toLocaleString('tr-TR')}`);
console.log(`RTP                : ${pct(paid / Math.max(1, wagered))}`);
console.log(`En yüksek kazanç   : ${maxWin.toFixed(2)}x bahis`);
