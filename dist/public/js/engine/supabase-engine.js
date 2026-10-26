// ─── Supabase motoru (gerçek hesap) ─────────────────────────────────────────
//
// Bakiye ve bonus durumu **sunucuda** durur: her çeviriş `dede_spin`,
// bonus satın alma `dede_buy_bonus` RPC'sine gider. Sunucu sonucu (düşen
// semboller, çarpanlar, kazanç) hazır bir **senaryo** olarak döndürür; istemci
// yalnız oynatır. Böylece tarayıcıdan hile yapılamaz.
//
// Oturum kaynağı sırası (at yarışı ile aynı):
//   1) adresteki access_token/refresh_token (uygulama WebView'i ekler),
//   2) `window.__RETRA_SUPABASE_SESSION__`,
//   3) supabase-js'in kaydettiği oturum (localStorage).

const SUPABASE_VERSION = '2.45.4';
const CDN_URL = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SUPABASE_VERSION}/+esm`;

const ERROR_MESSAGES = {
  AUTH_REQUIRED: 'Oturum bulunamadı, tekrar giriş yap.',
  PROFILE_MISSING: 'Bu hesabın oyun profili yok. Uygulamadan kayıt olman gerekiyor.',
  BALANCE: 'Kristal bakiyen bu bahis için yetersiz.',
  BAD_BET: 'Geçersiz bahis miktarı.',
  BONUS_ACTIVE: 'Bonus turun bitmeden yeni bonus alamazsın.',
  TOO_FAST: 'Çok hızlı çevirdin, bir an bekle.',
};

export function translateSupabaseError(error) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;
  for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
    if (text.includes(code)) return message;
  }
  if (text.includes('Could not find the function')) {
    return 'Sunucu fonksiyonları eksik. supabase_dede_slot.sql dosyasını çalıştır.';
  }
  if (/jwt|invalid claim|pgrst30/i.test(text)) return 'Oturum yenileniyor…';
  if (/failed to fetch|networkerror|load failed|network request failed|timeout|aborted/i.test(text)) {
    return 'Bağlantı yeniden kuruluyor…';
  }
  const raw = String(error?.message ?? '').trim();
  if (raw && raw.length <= 120) return `Sunucu hatası: ${raw}`;
  return 'Sunucuya ulaşılamadı. Bağlantını kontrol et.';
}

function readInjectedSession() {
  const direct =
    typeof window !== 'undefined' ? window.__RETRA_SUPABASE_SESSION__ : null;
  if (direct?.access_token && direct?.refresh_token) return direct;
  if (typeof window === 'undefined') return null;

  for (const raw of [window.location.hash.slice(1), window.location.search.slice(1)]) {
    if (!raw) continue;
    const params = new URLSearchParams(raw);
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (access && refresh) return { access_token: access, refresh_token: refresh };
  }
  return null;
}

function clearTokensFromUrl() {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of ['access_token', 'refresh_token', 'expires_in', 'token_type', 'type']) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (url.hash.includes('access_token')) {
      url.hash = '';
      changed = true;
    }
    if (changed) window.history.replaceState(null, '', url.toString());
  } catch {
    /* yoksay */
  }
}

export class SupabaseEngine {
  constructor(client) {
    this.client = client;
    this.mode = 'live';
    this.listeners = new Set();
    this.session = null;
    this.email = '';
    this.needsLogin = true;
    this.connected = false;
    this.lastError = '';
    this.balance = 0;
    this.free = { left: 0, bet: 0, multiplier: 0 };
    this.busy = false;
    this.failures = 0;
    this.timer = null;
    this.refreshMs = 4000;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    const snapshot = {
      mode: 'live',
      connected: this.connected,
      needsLogin: this.needsLogin,
      email: this.email,
      balance: this.balance,
      free: { ...this.free },
      error: this.lastError || undefined,
    };
    for (const fn of this.listeners) {
      try {
        fn(snapshot);
      } catch (error) {
        console.error('[dede/supabase] dinleyici hatası', error);
      }
    }
  }

  async connect() {
    await this._restoreSession();
    if (this.needsLogin) {
      this._emit();
      return this;
    }
    this._startPolling();
    await this.refresh();
    return this;
  }

  disconnect() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async _restoreSession() {
    let session = null;

    const injected = readInjectedSession();
    if (injected) {
      try {
        const { data, error } = await this.client.auth.setSession(injected);
        if (!error) {
          session = data.session ?? null;
          clearTokensFromUrl();
        }
      } catch {
        session = null;
      }
    }

    if (!session) {
      try {
        const { data } = await this.client.auth.getSession();
        session = data.session ?? null;
      } catch {
        session = null;
      }
    }

    this.session = session;
    this.email = session?.user?.email ?? '';
    this.needsLogin = !session;
  }

  _startPolling() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this.refresh();
    }, this.refreshMs);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.failures = 0;
        this.refresh();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        this.failures = 0;
        this.refresh();
      });
    }
  }

  async _recoverAuth(error) {
    const text = `${error?.message ?? ''} ${error?.code ?? ''}`.toLowerCase();
    if (!/jwt|token|401|pgrst30/.test(text)) return false;
    try {
      const { error: refreshError } = await this.client.auth.refreshSession();
      return !refreshError;
    } catch {
      return false;
    }
  }

  /** Bakiye + bonus durumunu tazeler (oyun sırasında sessiz). */
  async refresh() {
    if (this.needsLogin || this.busy) return;
    this.busy = true;
    try {
      let { data, error } = await this.client.rpc('dede_state');
      if (error && (await this._recoverAuth(error))) {
        ({ data, error } = await this.client.rpc('dede_state'));
      }
      if (error) throw error;
      this._apply(data);
      this.connected = true;
      this.failures = 0;
      this.lastError = '';
    } catch (error) {
      this.failures += 1;
      this.connected = false;
      if (this.failures >= 2) this.lastError = translateSupabaseError(error);
    } finally {
      this.busy = false;
      this._emit();
    }
  }

  _apply(payload) {
    if (!payload || typeof payload !== 'object') return;
    this.needsLogin = false;
    if (payload.balance != null) this.balance = Number(payload.balance) || 0;
    if (payload.free) {
      this.free = {
        left: Number(payload.free.left ?? 0) || 0,
        bet: Number(payload.free.bet ?? 0) || 0,
        multiplier: Number(payload.free.multiplier ?? 0) || 0,
      };
    }
  }

  /** Sunucudan senaryoyu ister: `{ script, balance }` — hata varsa `{ error }`. */
  async _call(fn, params) {
    let { data, error } = await this.client.rpc(fn, params);
    if (error && (await this._recoverAuth(error))) {
      ({ data, error } = await this.client.rpc(fn, params));
    }
    if (error) {
      return { error: translateSupabaseError(error) };
    }
    if (!data || typeof data !== 'object' || !data.script) {
      return { error: 'Sunucu beklenmeyen bir yanıt döndü.' };
    }
    this.connected = true;
    this.lastError = '';
    this._apply(data);
    this._emit();
    return { script: data.script, balance: this.balance };
  }

  /** Bir çeviriş yapar (bonus turundaysa bahis **sunucudaki** bonus bahsidir). */
  spin(bet) {
    return this._call('dede_spin', { p_bet: Math.round(bet) });
  }

  /** Bahsin 100 katına 15 ücretsiz tur satın alır. */
  buyBonus(bet) {
    return this._call('dede_buy_bonus', { p_bet: Math.round(bet) });
  }
}

/** Yapılandırılmışsa Supabase motorunu kurar; değilse `null`. */
export async function createSupabaseEngine(config) {
  if (!config?.url || !config?.anonKey) return null;
  const { createClient } = await import(/* @vite-ignore */ CDN_URL);
  const client = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return new SupabaseEngine(client);
}
