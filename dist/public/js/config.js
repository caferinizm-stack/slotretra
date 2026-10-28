// ─── Oyun sabitleri ─────────────────────────────────────────────────────────
//
// **Tek doğru kaynak**: sunucudaki `dede_spin` fonksiyonu (supabase SQL) ile
// buradaki tablo **aynı** olmalıdır. `tools/smoke.mjs` SQL dosyasındaki
// ağırlık/ödeme sayılarını bu dosyayla karşılaştırır (biri değişip diğeri
// unutulursa test kırılır).
//
// Ödeme "her yerde" (pay anywhere): hat yok; tahtada aynı sembolden **8 veya
// daha fazla** varsa kazanır. Ödeme, bahsin `pay` katının `adet/8` ile
// ölçeklenmiş hâlidir (12 sembol = 1.5×, 16 = 2× …).

// Node (test/simülasyon) için `window` yok: uygulama modu yalnız tarayıcıda.
export const APP_MODE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('app');

/**
 * Supabase bağlantısı — at yarışı ile **aynı** proje.
 *
 * Yerelde (localhost) demo motor çalışır: hesap açmadan oyun denenebilir.
 * Yayında veya `?live=1` ile gerçek hesap (uygulamadan aktarılan oturum)
 * kullanılır; bakiye `profiles.crystals` olduğu için uygulamayla ortaktır.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '']);
const host = typeof window === 'undefined' ? '' : window.location.hostname;
const wantsLive =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('live');

export const SUPABASE = {
  url: 'https://mwjyppehzqobmcrsmxlj.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13anlwcGVoenFvYm1jcnNteGxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxODYxOTksImV4cCI6MjEwNTc2MjE5OX0.OWXeMWkfzwftIJXGR4Pkr66mBq4IB5u6vM9T7I7Nx-0',
  enabled: !LOCAL_HOSTS.has(host) || wantsLive,
};

/** Demo motorun başlangıç bakiyesi (yalnız yerel/test). */
export const DEMO_BALANCE = 500000;

/** Bu tutarın üstündeki kazanç uygulamada duyurulur (`win:` mesajı). */
export const WIN_NOTICE_MIN = 10000;

export const GRID = { cols: 6, rows: 5 };
export const CELLS = GRID.cols * GRID.rows;

/** Kazanç için gereken en az sembol sayısı (aynı sembol, herhangi bir yerde). */
export const MIN_CLUSTER = 8;

/** Bir spin içinde en fazla kaç kez düşüp yenilenebilir (cascade). */
export const MAX_CASCADES = 6;

/**
 * Bahis adımları (kristal). Sunucu da bu listeyi doğrular
 * (`supabase_dede_slot.sql` ▸ `p_bet not in (...)`).
 */
export const BETS = [
  100,
  250,
  500,
  1000,
  2500,
  5000,
  10000,
  25000,
  50000,
  100000,
  250000,
  500000,
  1000000,
];

/** Bonus satın alma: bahsin kaç katı. */
export const BONUS_BUY_X = 100;

/** Bonus turu: kaç ücretsiz tur ve tetikleyen scatter sayısı. */
export const FREE_SPINS = 15;
export const SCATTER_TRIGGER = 4;
export const FREE_RETRIGGER = 5;

/** Bahis başına en fazla kazanç (kristal) — aşırı uçları kırpar. */
export const MAX_WIN_X = 10000;

/**
 * Semboller: `weight` toplamı **100** olmalı (yüzde).
 * `pay` = 8 sembolde bahsin kaç katı (adet/8 ile ölçeklenir).
 */
export const SYMBOLS = [
  { id: 'gem_blue', name: 'Mavi Mücevher', weight: 25, pay: 0.125, tier: 1 },
  { id: 'gem_green', name: 'Yeşil Mücevher', weight: 21, pay: 0.173, tier: 2 },
  { id: 'gem_red', name: 'Kırmızı Mücevher', weight: 16, pay: 0.248, tier: 3 },
  { id: 'gem_purple', name: 'Mor Mücevher', weight: 12, pay: 0.36, tier: 4 },
  { id: 'scarab', name: 'Altın Böcek', weight: 9, pay: 0.563, tier: 5 },
  { id: 'ring', name: 'Yüzük', weight: 7, pay: 0.9, tier: 6 },
  { id: 'hourglass', name: 'Kum Saati', weight: 5, pay: 1.5, tier: 7 },
  { id: 'crown', name: 'Taç', weight: 2, pay: 2.55, tier: 8 },
  // Scatter: kazancı yok; 4+ tanesi bonus turu açar.
  { id: 'zeus', name: 'Şanslı Dede', weight: 3, pay: 0, tier: 9, scatter: true },
];

export const SYMBOL_BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));

/** Çarpan küresi değerleri (ağırlıklar toplamı 1000). */
export const ORB_VALUES = [
  { value: 2, weight: 550 },
  { value: 3, weight: 250 },
  { value: 5, weight: 100 },
  { value: 10, weight: 50 },
  { value: 25, weight: 30 },
  { value: 50, weight: 15 },
  { value: 100, weight: 4 },
  { value: 500, weight: 1 },
];

/** Çarpan küresi çıkma olasılığı (tur başına). */
export const ORB_CHANCE = { base: 0.05, free: 0.045 };

/** Animasyon süreleri (ms) — sunucu sonucu hazır gelir, akış istemcide. */
export const TIMING = {
  dropStagger: 55,
  dropDuration: 420,
  popDuration: 260,
  burstDuration: 380,
  orbFlight: 620,
  countUp: 520,
  nextCascadeDelay: 160,
  freeSpinsIntro: 2200,
};

/** Bahis/adet metinleri. */
export const CRYSTAL_ASSET = './assets/kristal.png';
