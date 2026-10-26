// ─── Spin modeli (tek doğru kaynak) ─────────────────────────────────────────
//
// Bu dosya oyunun **matematiğini** tanımlar: tahta çekilişi, "her yerde"
// eşleşme, ödeme, çarpan küreleri, düşüp yenilenme (cascade) ve bonus turu.
//
// Sunucudaki `dede_spin` (PostgreSQL) fonksiyonu **aynı** kuralları uygular ve
// sonucu hazır bir "senaryo" (script) olarak döndürür; istemci yalnız oynatır.
// Demo/test modunda bu model doğrudan çalışır (aynı çıktı biçimi).
//
// Script biçimi (hem sunucu hem istemci):
// {
//   bet, cost, scatters, freeAwarded,
//   free: { left, bet, multiplier },
//   steps: [{
//     grid: string[30],                       // satır sırası: c*rows + r
//     clusters: [{ symbol, cells: [[c,r]], count, win }],
//     stepWin, orbs: [{ value, c, r }], multiplier, appliedWin
//   }],
//   totalWin, multiplierTotal
// }

import {
  CELLS,
  GRID,
  MAX_CASCADES,
  MAX_WIN_X,
  MIN_CLUSTER,
  ORB_CHANCE,
  ORB_VALUES,
  SCATTER_TRIGGER,
  SYMBOLS,
  SYMBOL_BY_ID,
} from '../config.js';
import { weightedPick } from '../core/utils.js';

/** Tahtadaki hücre sırası: sütun sütun (c * rows + r). */
export const cellIndex = (c, r) => c * GRID.rows + r;
export const cellCol = (index) => Math.floor(index / GRID.rows);
export const cellRow = (index) => index % GRID.rows;

/** Tek sembol çeker (ağırlıklı). */
export function drawSymbol(random) {
  return weightedPick(SYMBOLS, random).id;
}

/** Boş tahtayı doldurur. */
export function drawGrid(random) {
  const grid = new Array(CELLS);
  for (let i = 0; i < CELLS; i += 1) grid[i] = drawSymbol(random);
  return grid;
}

/**
 * 8+ aynı sembol var mı? (pay anywhere)
 * Dönen: `[{ symbol, cells: [[c,r]], count, win }]` — kazanç sırası: yüksek önce.
 */
export function clustersOf(grid, bet) {
  const bySymbol = new Map();
  for (let i = 0; i < grid.length; i += 1) {
    const id = grid[i];
    const def = SYMBOL_BY_ID.get(id);
    if (!def || def.scatter || !def.pay) continue;
    const list = bySymbol.get(id);
    if (list) list.push(i);
    else bySymbol.set(id, [i]);
  }

  const out = [];
  for (const [symbol, indexes] of bySymbol) {
    if (indexes.length < MIN_CLUSTER) continue;
    out.push({
      symbol,
      cells: indexes.map((i) => [cellCol(i), cellRow(i)]),
      count: indexes.length,
      win: payFor(symbol, indexes.length, bet),
    });
  }
  out.sort((a, b) => b.win - a.win);
  return out;
}

/** Ödeme: `bet × pay × (adet / 8)`, aşağı yuvarlanır. */
export function payFor(symbol, count, bet) {
  const def = SYMBOL_BY_ID.get(symbol);
  if (!def || !def.pay || count < MIN_CLUSTER) return 0;
  return Math.max(0, Math.floor(bet * def.pay * (count / MIN_CLUSTER)));
}

/** Patlayan hücreleri temizler, yer çekimi uygular ve üstten yeni sembol düşürür. */
export function collapse(grid, cleared, random) {
  const next = new Array(CELLS);
  for (let c = 0; c < GRID.cols; c += 1) {
    const survivors = [];
    for (let r = 0; r < GRID.rows; r += 1) {
      const index = cellIndex(c, r);
      if (!cleared.has(index)) survivors.push(grid[index]);
    }
    // Alttan yukarı yerleşir: kalanlar dibe iner.
    let slot = survivors.length - 1;
    for (let r = GRID.rows - 1; r >= 0; r -= 1) {
      const index = cellIndex(c, r);
      next[index] = slot >= 0 ? survivors[slot] : drawSymbol(random);
      slot -= 1;
    }
  }
  return next;
}

/** Bir tur için çarpan küreleri: değer + hücre. */
export function rollOrbs(random, chance) {
  if (random() >= chance) return [];
  const count = random() < 0.12 ? 2 : 1;
  const orbs = [];
  for (let i = 0; i < count; i += 1) {
    const cell = Math.floor(random() * CELLS);
    orbs.push({
      value: weightedPick(ORB_VALUES, random).value,
      c: cellCol(cell),
      r: cellRow(cell),
    });
  }
  return orbs;
}

export function countScatters(grid) {
  let n = 0;
  for (const id of grid) if (SYMBOL_BY_ID.get(id)?.scatter) n += 1;
  return n;
}

/**
 * Tek bir spin senaryosu üretir.
 *
 * @param {number} bet      bahis (kristal)
 * @param {object} opts     { free: {left, bet, multiplier}, cost, random }
 */
export function playSpin(bet, opts = {}) {
  const random = opts.random ?? Math.random;
  const inFree = (opts.free?.left ?? 0) > 0;
  const spinBet = inFree ? opts.free.bet : bet;
  let multiplier = inFree ? Math.max(0, opts.free.multiplier ?? 0) : 0;
  let freeLeft = inFree ? opts.free.left - 1 : 0;

  let grid = drawGrid(random);
  const scatters = countScatters(grid);
  let freeAwarded = 0;
  if (scatters >= SCATTER_TRIGGER) {
    freeAwarded = inFree ? 5 : 15;
    freeLeft += freeAwarded;
  }

  const steps = [];
  let totalWin = 0;

  for (let index = 0; index < MAX_CASCADES; index += 1) {
    const clusters = clustersOf(grid, spinBet);
    const orbs = clusters.length
      ? rollOrbs(random, inFree ? ORB_CHANCE.free : ORB_CHANCE.base)
      : [];

    const orbSum = orbs.reduce((sum, orb) => sum + orb.value, 0);
    if (inFree) {
      // Bonus turunda küreler **birikir** (global çarpan).
      multiplier += orbSum;
    }

    const stepWin = clusters.reduce((sum, cluster) => sum + cluster.win, 0);
    const factor = inFree ? multiplier : orbSum;
    const appliedWin = stepWin > 0 ? stepWin * Math.max(1, factor) : 0;

    steps.push({
      grid: [...grid],
      clusters,
      stepWin,
      orbs,
      multiplier: inFree ? multiplier : orbSum,
      appliedWin,
    });

    totalWin += appliedWin;
    if (!clusters.length) break;

    const cleared = new Set();
    for (const cluster of clusters) {
      for (const [c, r] of cluster.cells) cleared.add(cellIndex(c, r));
    }
    grid = collapse(grid, cleared, random);
  }

  const cap = spinBet * MAX_WIN_X;
  if (totalWin > cap) totalWin = cap;

  return {
    bet: spinBet,
    cost: inFree ? 0 : spinBet,
    scatters,
    freeAwarded,
    free: { left: freeLeft, bet: inFree ? opts.free.bet : bet, multiplier },
    steps,
    totalWin,
    multiplierTotal: multiplier,
  };
}
