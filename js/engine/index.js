// ─── Motor seçimi ───────────────────────────────────────────────────────────
//
// * **Yayında** (veya `?live=1`) → Supabase motoru: gerçek hesap ve kristal.
// * **Yerelde** → demo motoru: hesapla uğraşmadan oyun denenir.
//
// İki motor da aynı API'yi sunar: `on(fn) · connect() · refresh() ·
// spin(bet) · buyBonus(bet)` ve her ikisi de `{ script, balance }` döndürür.

import { SUPABASE } from '../config.js';
import { DemoEngine } from './demo-engine.js';
import { createSupabaseEngine } from './supabase-engine.js';

export async function createEngine() {
  if (SUPABASE.enabled) {
    try {
      const engine = await createSupabaseEngine(SUPABASE);
      if (engine) return engine;
    } catch (error) {
      console.error('[dede] Supabase motoru kurulamadı', error);
    }
  }
  return new DemoEngine();
}
