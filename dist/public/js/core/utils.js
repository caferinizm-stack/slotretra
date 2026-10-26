// ─── Küçük yardımcılar ──────────────────────────────────────────────────────
// Bağımlılık yok: hem tarayıcıda hem Node testlerinde çalışır.

/** 1000 → "1.000" (Türkçe ayraç). */
export function formatCoins(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Büyük kazançları kısaltır: 12.500 → "12.5K", 1.200.000 → "1.2M". */
export function shortCoins(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n < 10000) return formatCoins(n);
  if (n < 1000000) return `${(n / 1000).toFixed(n < 100000 ? 1 : 0)}K`;
  return `${(n / 1000000).toFixed(1)}M`;
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const lerp = (a, b, t) => a + (b - a) * t;

/** Yumuşak giriş/çıkış. */
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
export const easeInOutQuad = (t) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

/** Deterministik RNG (mulberry32): testler aynı tohumla aynı sonucu alır. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ağırlıklı seçim: `items` = [{ weight }] (veya value/weight). */
export function weightedPick(items, random = Math.random) {
  let total = 0;
  for (const item of items) total += item.weight;
  let roll = random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** ms bekler (animasyon akışı için). */
export const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
