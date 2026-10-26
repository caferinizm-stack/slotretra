# Retra · Şanslı Dede (3D Slot)

Olympos kapılarında geçen, **uygulamanın gerçek kristalleriyle** oynanan 3D slot.
Three.js ile çizilen 6×5 tahta, "her yerde öde" (pay anywhere) mantığı, Dede'nin
fırlattığı çarpan küreleri ve 15 turluk ücretsiz tur bonusu.

- **Bakiye:** `public.profiles.crystals` — uygulamadaki cüzdanla **aynı**.
- **Kullanıcı:** uygulama hesabı (oturum WebView'den aktarılır). Anonim giriş yok.
- Derleme adımı yok: saf ES modülleri + tek CSS dosyası. CDN'den yalnız `three`
  yüklenir; tüm modeller/dokular tarayıcıda üretilir.
- **RTP:** %95,9 (300 bin tur simülasyonu, bahis 1.000 · `tools/simulate.mjs`).
- **Liderlik:** son **24 saat**in en çok kazananları (gerçek `game_results`
  defteri · `supabase_dede_slot_liderlik.sql`).

**Yayındaki adres:** <https://caferinizm-stack.github.io/slotretra/>
(GitHub Pages · `slot_web/` klasörünün kökü doğrudan servis edilir.)

Uygulama bu sayfayı at yarışı gibi **yarım ekran panelde** açar:
Şans Oyunları ▸ **Şanslı Dede** kartı ya da odadaki **Şans oyunları** menüsü.
Sayfanın kendi giriş ekranı yoktur; kimlik uygulamadan gelir, 3 saniyelik
açılış animasyonundan sonra oyun doğrudan başlar.

➡️ [`lib/screens/dede_slot_screen.dart`](../lib/screens/dede_slot_screen.dart)
(`DedeSlotView` · WebView + açılış animasyonu + `win:` köprüsü)

## Nasıl çalışır?

1. **Sunucu senaryoyu üretir.** `dede_spin` (PostgreSQL) tahtayı, çarpanları,
   kazançları ve bonus durumunu hesaplar; istemciye **hazır bir senaryo** döner.
2. **İstemci yalnız oynatır.** `js/engine/spin-model.js` aynı kuralları
   (demo/yerel mod için) uygular; `js/main.js` senaryoyu adım adım canlandırır.
3. **Bakiye anında düşer/eklenir.** Bahis `profiles.crystals`'ten `for update`
   kilidiyle düşer, kazanç aynı fonksiyon içinde eklenir.
4. **Sıralama:** her tur `record_game_result(..., 'dede', ...)` ile oyun
   defterine yazılır (at yarışı ile aynı 24 saatlik sıralama).

### Mekanikler

| Kural | Değer |
| --- | --- |
| Tahta | 6 sütun × 5 satır |
| Ödeme | 8+ aynı sembol (her yerde), `bahis × pay × adet/8` |
| Maks. zincir | 6 düşüş (cascade) |
| Çarpan küreleri | 2× · 3× · 5× · 10× · 25× · 50× · 100× · 500× (ağırlıklı) |
| Çarpan kuralı | Temel oyunda **adım** çarpanı, bonus turunda **birikir** |
| Bonus | 4+ Zeus (scatter) → 15 ücretsiz tur (tur içinde +5) |
| Bonus satın alma | Bahsin **100 katı** |
| Bahis adımları | 100 · 250 · 500 · 1.000 · 2.500 · 5.000 · 10.000 · 25.000 · 50.000 |
| Kazanç tavanı | Bahis × 10.000 |

### Görsel tasarım

Semboller ve **Dede portresi** kodla (canvas) çizilir; harici görsel dosyası
yoktur. Bu sayede her çözünürlükte net görünür ve paket küçük kalır.

| Sembol | Görünüm |
| --- | --- |
| `gem_blue` · `gem_green` · `gem_red` · `gem_purple` | kesim yüzeyli mücevherler |
| `scarab` | altın bok böceği madalyonu (güneş motifi) |
| `ring` | altın yüzük + mavi elmas |
| `hourglass` | altın kum saati (akan kum) |
| `crown` | kızıl kadife üzerinde altın taç |
| `zeus` (scatter) | defne çemberinde Zeus büstü |

Dede, tahtanın **arkasında ortada** duran resmedilmiş bir büsttür: beyaz saç/
sakal, defne tacı, altın zırh. **İki eli tahtanın üst kenarını kavrar** (ayrı
kaplamalar; parmaklar kenardan aşağı sarkar). Rölantide nefes alır; çarpan
küresi fırlatırken **sağ eli kalkar**, avucunda ışık patlar ve küreler o
noktadan tahtaya uçar.

Karo zemini mor mermer plakadır (altın ince kenar); eşleşen semboller yumuşak
altın ışımayla vurgulanır, patlarken kıvılcım saçar.

### Arayüz akışı

- **Kazanç gecikmeli yazılır:** sunucu bakiyeyi anında günceller ama oyun
  oynarken HUD’a **yansıtılmaz**; önce semboller patlar, zincir biter, sonra
  çarpanlar uçar ve kazanç **ana bakiyeye** sayaç animasyonuyla eklenir (yanında
  kısa süreli `+N` baloncuğu).
- **Bahis:** yalnız `−` / `+` düğmeleri (hızlı çip satırı kaldırıldı). Ödeme
  tablosu bahse göre **yeniden hesaplanır** (`×0,08` → 1.000 bahis = 80 kristal).
- **Bonus girişi:** 4+ Zeus gelince sembollü dedeler sırayla **yanıp söner**;
  satın alınca ya da tetiklenince ortada **15 FREE SPIN** yazar, 3 saniye sonra
  turlar başlar.
- **Bonusta kazanç ayrı havuzda:** bakiye değişmez, sağ üstte **BONUS KAZANCI**
  birikir; çarpanlar sol üstteki **ÇARPAN kutusunda** toplanır (x2 + x5 = x7).
  Bonus bitince ortada **KAZANDIN** + tutar 3 saniye durur, sonra bakiyeye eklenir.
- **Yardım (?)**: üst şeritteki düğme “nasıl oynanır” panelini açar; sembollerin
  ödeme tablosunu (bahis katı + kristal karşılığı) ikonlarıyla birlikte gösterir.
- **Çarpanlar** küre değil, **karenin içinde sayı** olarak durur (x2 … x500);
  derinlik testi kapalı olduğu için hiçbir sembol onları kapatmaz.
- **Ses:** arka fon müziği + çevirme/patlama/çarpan/kazanç/bonus efektleri
  WebAudio ile sentezlenir (dosya yok). Üst şeritteki `♪` düğmesiyle kapanır,
  tercih `localStorage`’da saklanır. Zincirleme patlamalarda ses tizleşir.

> Not: referans oyunun ekran görüntüsündeki birebir görseller kullanılmaz —
telif hakkı ve çözünürlük nedeniyle **aynı tarzda yeniden çizilir**.

## Dosya düzeni

```
slot_web/
├─ index.html            arayüz iskeleti (sahne + alt panel + onay katmanı)
├─ css/styles.css        koyu/altın tema, mobil öncelikli düzen
├─ js/
│  ├─ config.js          sembol ağırlıkları, ödemeler, bahisler, Supabase
│  ├─ main.js            oyun akışı: çevir → oynat → bonus zinciri
│  ├─ core/              tween motoru, ses sentezi (audio.js), yardımcılar
│  ├─ engine/
│  │  ├─ index.js        mod seçimi (canlı Supabase / yerel demo)
│  │  ├─ supabase-engine.js  oturum, `dede_state`, `dede_spin`, `dede_buy_bonus`
│  │  ├─ demo-engine.js  yerel demo (gerçek kristale dokunmaz)
│  │  └─ spin-model.js   matematik: çekiliş, eşleşme, cascade, çarpan
│  ├─ scene/
│  │  ├─ stage.js        renderer, ışıklar, kamera, tapınak, Dede yerleşimi
│  │  ├─ grid.js         6×5 karo ızgarası: düşme, vurgu, patlama, tumble
│  │  ├─ orbs.js         çarpan küreleri: uçuş, bakiyeye toplanma, sönüm
│  │  ├─ zeus.js         Dede portresi + çerçeveyi kavrayan eller + fırlatma
│  │  └─ textures.js     canvas'ta üretilen sembol/ışıma/yazı dokuları
│  └─ ui/hud.js          bakiye, bahis, bildirimler, onay paneli, açılış çubuğu
├─ assets/               uygulama simgesi + kristal görseli
├─ tools/serve.mjs       bağımlılıksız yerel sunucu
├─ tools/simulate.mjs    RTP simülasyonu
└─ dist/                 yayın paketi (worker + public + deploy.json)
```

## Yerel geliştirme

```bash
cd slot_web
node tools/serve.mjs
# → http://127.0.0.1:5174  (demo motor: 500.000 kristal, hesap gerekmez)
```

Canlıyı yerelde denemek için adrese `?live=1` ekle (gerçek oturum gerekir).

```bash
node tools/simulate.mjs 1000000 1000   # RTP / bonus sıklığı ölçümü
```

## Supabase kurulumu (sıra önemli)

1. `public.profiles` tablosu mevcut olmalı (`id`, `username`, `crystals`) —
   uygulamanın kendi şeması.
2. [`supabase_faz63_at_yarisi_siralama.sql`](../supabase_faz63_at_yarisi_siralama.sql)
   → `game_results` defteri (oyun sıralaması). At yarışı için zaten çalıştırıldıysa atla.
3. [`supabase_dede_slot.sql`](../supabase_dede_slot.sql) → slot motoru:
   - `public.dede_players` (bonus turu durumu),
   - `public.dede_spins` (denetim kaydı),
   - `public.dede_state()`, `public.dede_spin(bigint)`, `public.dede_buy_bonus(bigint)`.
   - **Ödeme tablosu / çarpan sıklığı değiştiyse bu dosya yeniden çalıştırılır**
     (`create or replace`, veri silmez).
4. [`supabase_dede_slot_liderlik.sql`](../supabase_dede_slot_liderlik.sql)
   → 24 saatlik liderlik: `public.dede_leaderboard(int)`,
   `public.dede_leaderboard_me()`.

> **Bu SQL çalıştırılmadan oyun açılmaz:** istemci `dede_state` bulamayınca
> "Sunucu fonksiyonları eksik. supabase_dede_slot.sql dosyasını çalıştır."
> mesajını gösterir. Bahis/kazanç yalnız bu fonksiyonların içinde yapılır;
> `profiles.crystals` istemci rollerine karşı korumalı kalır.

### Güvenlik notları

- Üç RPC de `SECURITY DEFINER`; `dede_players` / `dede_spins` tablolarında
  **RLS açık, politika yok** (yalnız fonksiyonlar dokunur).
- Bahis listesi sunucuda da doğrulanır (`BAD_BET`), bakiye satırı kilitlenir.
- Kazanç tavanı (`bahis × 10.000`) aşırı uçları kırpar.
- `dede_pay` / `dede_draw_grid` gibi yardımcılar dışarıya **kapalıdır**.

## Yayınlama

```bash
cd slot_web
cp -r index.html css js assets dist/public/
# dist/deploy.json Sites manifestidir (worker + public)
```

Sites ▸ **Retra Şanslı Dede** ▸ preview ortamına `dist/deploy.json` ile deploy
edilir. `worker.js` HTML'i `no-store`, diğer dosyaları `no-cache` sunar: telefon
WebView'i eski JS'i tutup eski sürümü çalıştırmaz.

## Bilinen sınırlar

- WebGL gerekir; WebGL kapalıysa Flutter tarafı sade bir "tekrar dene" katmanı
  gösterir.
- Masaüstü tarayıcıda oturum yoksa oyun çevirişe izin vermez (giriş ekranı
  bilinçli olarak yok; kimlik uygulamadan gelir).
- Bahis/kazanç muhasebesi `dede_spins` tablosunda; kristal hareket defterine
  (`crystal_ledger`) ayrıca yazılmıyor.
