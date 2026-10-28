// ─── Dokular (canvas ile üretilir, harici dosya yok) ────────────────────────
//
// Oyunun görsel kimliği burada çizilir:
//   * **mücevherler** — mavi · yeşil · kırmızı · mor, kesim yüzeyli,
//   * **madalyonlar** — altın çember içinde taç · yüzük · kum saati · bok böceği,
//   * **scatter** — Zeus'un yüzü (altın defne çemberi),
//   * **taş plaka** — tahtadaki her karonun mor mermer zemini,
//   * **Zeus portresi** — tahtanın arkasında duran tanrı figürü.
//
// Hepsi 512–1024 px tuvale çizilir: telefonda da net görünür, indirme beklemez.

import * as THREE from 'three';

const SIZE = 512;

const PALETTE = {
  gem_blue: ['#eafcff', '#7fe4ff', '#2f9bf0', '#0a3f86'],
  gem_green: ['#e8fff0', '#7dffc0', '#25c977', '#075c35'],
  gem_red: ['#fff0f2', '#ff9db1', '#f43b5f', '#7d0d26'],
  gem_purple: ['#fbeeff', '#d29bff', '#9b4dff', '#3d1580'],
  scarab: ['#fff3cf', '#ffd166', '#e08a12', '#5c3404'],
  ring: ['#eaffff', '#a8f0ff', '#33b8f0', '#0a4a7a'],
  hourglass: ['#fff6dd', '#ffd98a', '#e29a2b', '#5e3305'],
  crown: ['#fff8e2', '#ffdc8a', '#e6a52a', '#6b3a05'],
  zeus: ['#fffdf5', '#ffe3a8', '#e2a63c', '#5a3203'],
};

function canvas2d(width = SIZE, height = SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const cache = new Map();

function cached(key, factory) {
  if (cache.has(key)) return cache.get(key);
  const value = factory();
  cache.set(key, value);
  return value;
}

// ── Ortak yardımcılar ───────────────────────────────────────────────────────

/** Altın yüzey: koyu kenardan parlak tepeye. */
function goldGradient(ctx, x0, y0, x1, y1, bright = 1) {
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, `rgba(255, 249, 214, ${bright})`);
  grad.addColorStop(0.28, `rgba(255, 214, 122, ${bright})`);
  grad.addColorStop(0.55, `rgba(226, 158, 33, ${bright})`);
  grad.addColorStop(0.78, `rgba(255, 214, 122, ${bright})`);
  grad.addColorStop(1, `rgba(140, 82, 6, ${bright})`);
  return grad;
}

/** Şekli yol olarak kurar: `points` = [[x,y], …] (0..1 oranında). */
function polygon(ctx, cx, cy, scale, points, close = true) {
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    const px = cx + x * scale;
    const py = cy + y * scale;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  if (close) ctx.closePath();
}

/** Yumuşak elips gölge. */
function ellipseShadow(ctx, cx, cy, rx, ry, alpha = 0.35) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / Math.max(rx, ry));
  ctx.translate(-cx, -cy);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Yıldız parlaması (4 uçlu). */
function sparkle(ctx, x, y, r, color = 'rgba(255,255,255,0.95)') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.16, y - r * 0.16, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.16, y + r * 0.16, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.16, y + r * 0.16, x - r, y);
  ctx.quadraticCurveTo(x - r * 0.16, y - r * 0.16, x, y - r);
  ctx.fill();
  ctx.restore();
}

// ── Mücevher ────────────────────────────────────────────────────────────────

const GEM_OUTLINE = [
  [0, -0.52],
  [0.46, -0.14],
  [0.34, 0.26],
  [0, 0.52],
  [-0.34, 0.26],
  [-0.46, -0.14],
];

const GEM_TABLE = [
  [0, -0.52],
  [0.2, -0.2],
  [0.12, 0.1],
  [-0.12, 0.1],
  [-0.2, -0.2],
];

function drawGem(ctx, colors, seed = 0) {
  const cx = 256;
  const cy = 262;
  const scale = 372;

  ellipseShadow(ctx, cx, cy + 190, 150, 40, 0.45);

  // Dış ışıma.
  ctx.save();
  ctx.shadowColor = `${colors[2]}dd`;
  ctx.shadowBlur = 46;
  ctx.fillStyle = `${colors[2]}55`;
  polygon(ctx, cx, cy, scale, GEM_OUTLINE);
  ctx.fill();
  ctx.restore();

  // Gövde: kesim yüzeyi.
  const bodyGrad = ctx.createLinearGradient(cx - 180, cy - 220, cx + 170, cy + 220);
  bodyGrad.addColorStop(0, colors[0]);
  bodyGrad.addColorStop(0.32, colors[1]);
  bodyGrad.addColorStop(0.72, colors[2]);
  bodyGrad.addColorStop(1, colors[3]);
  polygon(ctx, cx, cy, scale, GEM_OUTLINE);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Üst tabla: rengin açık tonu (beyaza kaçmadan).
  const tableGrad = ctx.createLinearGradient(cx, cy - 200, cx, cy + 40);
  tableGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
  tableGrad.addColorStop(0.4, colors[0]);
  tableGrad.addColorStop(1, 'rgba(255,255,255,0.12)');
  polygon(ctx, cx, cy, scale, GEM_TABLE);
  ctx.fillStyle = tableGrad;
  ctx.fill();

  // Kesim çizgileri (tabla köşelerinden dış köşelere).
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2.4;
  for (let i = 0; i < GEM_OUTLINE.length; i += 1) {
    const [ox, oy] = GEM_OUTLINE[i];
    const [tx, ty] = GEM_TABLE[i % GEM_TABLE.length];
    ctx.beginPath();
    ctx.moveTo(cx + tx * scale, cy + ty * scale);
    ctx.lineTo(cx + ox * scale * 0.98, cy + oy * scale * 0.98);
    ctx.stroke();
  }

  // İç ışık kırılması (alt yarıda koyu yansıma).
  ctx.globalAlpha = 0.28;
  polygon(ctx, cx, cy, scale, [
    [0, 0.52],
    [0.34, 0.26],
    [0.2, 0.06],
    [-0.2, 0.06],
    [-0.34, 0.26],
  ]);
  ctx.fillStyle = colors[3];
  ctx.fill();
  ctx.restore();

  // Kenar: ince beyaz parlama.
  polygon(ctx, cx, cy, scale, GEM_OUTLINE);
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Speküler parlama + yıldız.
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.ellipse(cx - 58, cy - 96, 22, 62, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
  ctx.restore();
  sparkle(ctx, cx - 96 + (seed % 3) * 10, cy - 120, 30);
  sparkle(ctx, cx + 92, cy + 74, 16, 'rgba(255,255,255,0.75)');
}

// ── Madalyon çerçevesi ──────────────────────────────────────────────────────

function medallion(ctx, inner) {
  const cx = 256;
  const cy = 258;
  const r = 196;

  ellipseShadow(ctx, cx, cy + 200, 170, 40, 0.5);

  // Altın çember.
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, '#fff8d8');
  ring.addColorStop(0.22, '#ffd97a');
  ring.addColorStop(0.5, '#c98510');
  ring.addColorStop(0.72, '#ffe49b');
  ring.addColorStop(1, '#8d5104');
  ctx.save();
  ctx.shadowColor = 'rgba(255, 190, 70, 0.65)';
  ctx.shadowBlur = 38;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.restore();

  // İç çukur.
  const innerGrad = ctx.createRadialGradient(cx - 40, cy - 50, 20, cx, cy, r - 22);
  innerGrad.addColorStop(0, '#4a2a7a');
  innerGrad.addColorStop(0.55, '#2c1550');
  innerGrad.addColorStop(1, '#170a2c');
  ctx.beginPath();
  ctx.arc(cx, cy, r - 20, 0, Math.PI * 2);
  ctx.fillStyle = innerGrad;
  ctx.fill();

  // İç kenar parlaması.
  ctx.beginPath();
  ctx.arc(cx, cy, r - 21, Math.PI * 0.9, Math.PI * 2.1);
  ctx.strokeStyle = 'rgba(255, 226, 150, 0.42)';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Sembolü çemberin içine biraz daha yakın çiz (hücreyi doldursun).
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1.34, 1.34);
  ctx.translate(-cx, -cy);
  inner(cx, cy);
  ctx.restore();

  // Çember üzerinde küçük boncuklar.
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    const bx = cx + Math.cos(angle) * (r - 9);
    const by = cy + Math.sin(angle) * (r - 9);
    ctx.beginPath();
    ctx.arc(bx, by, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? 'rgba(255, 240, 190, 0.85)' : 'rgba(160, 96, 12, 0.85)';
    ctx.fill();
  }
}

// ── Taç ─────────────────────────────────────────────────────────────────────

function drawCrown(ctx) {
  medallion(ctx, (cx, cy) => {
    // Kızıl kadife arka.
    const velvet = ctx.createRadialGradient(cx, cy - 20, 20, cx, cy, 150);
    velvet.addColorStop(0, '#b81f3c');
    velvet.addColorStop(1, '#5d0a1c');
    ctx.beginPath();
    ctx.arc(cx, cy, 148, 0, Math.PI * 2);
    ctx.fillStyle = velvet;
    ctx.fill();

    ctx.save();
    ctx.shadowColor = 'rgba(255, 205, 90, 0.75)';
    ctx.shadowBlur = 30;
    const base = cy + 78;
    // Taç gövdesi.
    ctx.beginPath();
    ctx.moveTo(cx - 120, base);
    ctx.lineTo(cx - 128, cy - 46);
    ctx.lineTo(cx - 70, cy + 6);
    ctx.lineTo(cx - 28, cy - 92);
    ctx.lineTo(cx + 6, cy - 6);
    ctx.lineTo(cx + 56, cy - 96);
    ctx.lineTo(cx + 104, cy + 2);
    ctx.lineTo(cx + 128, cy - 44);
    ctx.lineTo(cx + 120, base);
    ctx.closePath();
    ctx.fillStyle = goldGradient(ctx, cx - 120, cy - 96, cx + 120, base);
    ctx.fill();
    ctx.restore();

    // Bant + taşlar.
    ctx.beginPath();
    ctx.rect(cx - 122, base - 44, 244, 52);
    ctx.fillStyle = goldGradient(ctx, cx - 120, base - 44, cx + 120, base + 8, 0.95);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 50, 0, 0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const jewels = [
      [cx - 74, base - 18, '#4fa3ff'],
      [cx, base - 18, '#ff5c7a'],
      [cx + 74, base - 18, '#7dffc0'],
    ];
    for (const [jx, jy, color] of jewels) {
      ctx.beginPath();
      ctx.arc(jx, jy, 16, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
      sparkle(ctx, jx - 28, jy - 26, 14, 'rgba(255,255,255,0.85)');
    }

    // Uçlardaki inciler.
    for (const [px, py] of [
      [cx - 128, cy - 58],
      [cx - 28, cy - 104],
      [cx + 56, cy - 108],
      [cx + 128, cy - 56],
    ]) {
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#fff6dd';
      ctx.fill();
    }
  });
}

// ── Yüzük ───────────────────────────────────────────────────────────────────

function drawRing(ctx) {
  medallion(ctx, (cx, cy) => {
    ctx.save();
    ctx.shadowColor = 'rgba(120, 220, 255, 0.8)';
    ctx.shadowBlur = 36;
    ctx.beginPath();
    ctx.arc(cx, cy + 34, 108, Math.PI * 0.12, Math.PI * 0.88);
    ctx.strokeStyle = goldGradient(ctx, cx - 110, cy - 70, cx + 110, cy + 130);
    ctx.lineWidth = 34;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Yüzük taşı (mavi elmas).
    const gemCy = cy - 62;
    ctx.save();
    ctx.shadowColor = 'rgba(90, 220, 255, 0.95)';
    ctx.shadowBlur = 40;
    polygon(ctx, cx, gemCy, 168, [
      [0, -0.5],
      [0.4, -0.06],
      [0, 0.52],
      [-0.4, -0.06],
    ]);
    const grad = ctx.createLinearGradient(cx - 60, gemCy - 70, cx + 60, gemCy + 70);
    grad.addColorStop(0, '#f2ffff');
    grad.addColorStop(0.45, '#7fe6ff');
    grad.addColorStop(1, '#1e7fd0');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    polygon(ctx, cx, gemCy, 168, [
      [0, -0.5],
      [0.4, -0.06],
      [0, 0.52],
      [-0.4, -0.06],
    ]);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Taş yuvası.
    ctx.beginPath();
    ctx.arc(cx, gemCy + 58, 20, 0, Math.PI * 2);
    ctx.fillStyle = goldGradient(ctx, cx - 20, gemCy + 38, cx + 20, gemCy + 78);
    ctx.fill();
    sparkle(ctx, cx - 66, gemCy - 46, 22);
  });
}

// ── Kum saati ───────────────────────────────────────────────────────────────

function drawHourglass(ctx) {
  medallion(ctx, (cx, cy) => {
    // Cam gövde.
    ctx.beginPath();
    ctx.moveTo(cx - 78, cy - 108);
    ctx.lineTo(cx + 78, cy - 108);
    ctx.lineTo(cx + 26, cy);
    ctx.lineTo(cx + 78, cy + 108);
    ctx.lineTo(cx - 78, cy + 108);
    ctx.lineTo(cx - 26, cy);
    ctx.closePath();
    const glass = ctx.createLinearGradient(cx - 78, cy - 108, cx + 78, cy + 108);
    glass.addColorStop(0, 'rgba(150, 226, 255, 0.55)');
    glass.addColorStop(0.5, 'rgba(70, 110, 210, 0.35)');
    glass.addColorStop(1, 'rgba(170, 240, 255, 0.55)');
    ctx.fillStyle = glass;
    ctx.fill();

    // Kum (üst ve alt hazne).
    ctx.save();
    ctx.shadowColor = 'rgba(255, 200, 90, 0.9)';
    ctx.shadowBlur = 26;
    ctx.fillStyle = goldGradient(ctx, cx - 60, cy - 100, cx + 60, cy + 100);
    ctx.beginPath();
    ctx.moveTo(cx - 64, cy - 100);
    ctx.lineTo(cx + 64, cy - 100);
    ctx.lineTo(cx + 12, cy - 22);
    ctx.lineTo(cx - 12, cy - 22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 62, cy + 102);
    ctx.quadraticCurveTo(cx, cy + 22, cx + 62, cy + 102);
    ctx.closePath();
    ctx.fill();
    // Akan kum.
    ctx.fillRect(cx - 4, cy - 26, 8, 58);
    ctx.restore();

    // Altın çerçeve çubukları.
    ctx.strokeStyle = goldGradient(ctx, cx - 84, cy - 112, cx + 84, cy + 112);
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 84, cy - 112);
    ctx.lineTo(cx + 84, cy - 112);
    ctx.moveTo(cx - 84, cy + 112);
    ctx.lineTo(cx + 84, cy + 112);
    ctx.stroke();

    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(255, 236, 170, 0.9)';
    ctx.beginPath();
    ctx.moveTo(cx - 76, cy - 106);
    ctx.lineTo(cx + 76, cy - 106);
    ctx.stroke();
  });
}

// ── Bok böceği (scarab) ─────────────────────────────────────────────────────

function drawScarab(ctx) {
  medallion(ctx, (cx, cy) => {
    const gold = (x0, y0, x1, y1) => goldGradient(ctx, x0, y0, x1, y1);

    ctx.save();
    ctx.shadowColor = 'rgba(255, 200, 70, 0.75)';
    ctx.shadowBlur = 26;

    // Kanat zırhları (iki büyük oval).
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * 54, cy + 22, 58, 104, side * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = gold(cx - 110, cy - 80, cx + 110, cy + 130);
      ctx.fill();
      ctx.strokeStyle = 'rgba(110, 60, 4, 0.45)';
      ctx.lineWidth = 3.4;
      ctx.stroke();
    }
    ctx.restore();

    // Kanat içi damarlar.
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 68, 4, 0.35)';
    ctx.lineWidth = 2.6;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(cx + side * 42, cy - 40 + i * 34);
        ctx.quadraticCurveTo(
          cx + side * 96,
          cy - 10 + i * 38,
          cx + side * 82,
          cy + 74 + i * 10,
        );
        ctx.stroke();
      }
    }
    ctx.restore();

    // Orta gövde çatlağı.
    ctx.beginPath();
    ctx.moveTo(cx, cy - 62);
    ctx.lineTo(cx, cy + 122);
    ctx.strokeStyle = 'rgba(96, 52, 2, 0.6)';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Baş.
    const headGrad = gold(cx - 60, cy - 150, cx + 60, cy - 70);
    ctx.beginPath();
    ctx.moveTo(cx - 52, cy - 76);
    ctx.quadraticCurveTo(cx - 42, cy - 138, cx, cy - 146);
    ctx.quadraticCurveTo(cx + 42, cy - 138, cx + 52, cy - 76);
    ctx.closePath();
    ctx.fillStyle = headGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(110, 60, 4, 0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Duyargalar.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 34, cy - 132);
      ctx.quadraticCurveTo(cx + side * 92, cy - 180, cx + side * 76, cy - 208);
      ctx.stroke();
    }

    // Bacaklar.
    ctx.strokeStyle = 'rgba(214, 145, 20, 0.9)';
    ctx.lineWidth = 9;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(cx + side * 78, cy - 20 + i * 50);
        ctx.quadraticCurveTo(
          cx + side * 132,
          cy - 36 + i * 56,
          cx + side * 140,
          cy + 8 + i * 58,
        );
        ctx.stroke();
      }
    }

    // Sırttaki güneş motifi.
    const sun = ctx.createRadialGradient(cx - 10, cy + 6, 4, cx, cy + 14, 52);
    sun.addColorStop(0, '#fff6d0');
    sun.addColorStop(0.5, '#f4b53a');
    sun.addColorStop(1, '#8a1c28');
    ctx.beginPath();
    ctx.arc(cx, cy + 14, 46, 0, Math.PI * 2);
    ctx.fillStyle = sun;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 190, 0.85)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Işınlar.
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 236, 170, 0.75)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 54, cy + 14 + Math.sin(a) * 54);
      ctx.lineTo(cx + Math.cos(a) * 68, cy + 14 + Math.sin(a) * 68);
      ctx.stroke();
    }
    ctx.restore();

    sparkle(ctx, cx - 108, cy - 96, 20);
  });
}

// ── Zeus (scatter) ──────────────────────────────────────────────────────────

function drawZeusFace(ctx) {
  const cx = 256;
  const cy = 258;

  // Defne çemberi.
  ctx.save();
  ctx.shadowColor = 'rgba(255, 196, 60, 0.85)';
  ctx.shadowBlur = 34;
  ctx.beginPath();
  ctx.arc(cx, cy, 206, 0, Math.PI * 2);
  ctx.strokeStyle = goldGradient(ctx, cx - 200, cy - 200, cx + 200, cy + 200);
  ctx.lineWidth = 26;
  ctx.stroke();
  ctx.restore();

  // **Beyaz saç**: yalnız üst/yan yayda (yüzü örtmez), dalgalı tutamlar.
  const hair = ctx.createLinearGradient(cx, cy - 190, cx, cy + 60);
  hair.addColorStop(0, '#ffffff');
  hair.addColorStop(1, '#ccd5ee');
  for (let i = 0; i < 9; i += 1) {
    const a = Math.PI * (1.02 + (i / 8) * 0.96);
    const hx = cx + Math.cos(a) * 118;
    const hy = cy - 4 + Math.sin(a) * 110;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 18, 0, 0, Math.PI * 2);
    ctx.fillStyle = hair;
    ctx.fill();
    ctx.restore();
  }

  // Yüz.
  const face = ctx.createRadialGradient(cx - 28, cy - 60, 20, cx, cy, 150);
  face.addColorStop(0, '#ffe9d2');
  face.addColorStop(0.55, '#f3cba6');
  face.addColorStop(1, '#c99473');
  ctx.beginPath();
  ctx.ellipse(cx, cy - 12, 96, 112, 0, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();

  // Sakal (katmanlı).
  const beard = ctx.createLinearGradient(cx, cy + 10, cx, cy + 190);
  beard.addColorStop(0, '#ffffff');
  beard.addColorStop(1, '#cfd6f0');
  ctx.beginPath();
  ctx.moveTo(cx - 92, cy + 6);
  ctx.quadraticCurveTo(cx - 96, cy + 130, cx, cy + 186);
  ctx.quadraticCurveTo(cx + 96, cy + 130, cx + 92, cy + 6);
  ctx.quadraticCurveTo(cx + 40, cy + 62, cx, cy + 58);
  ctx.quadraticCurveTo(cx - 40, cy + 62, cx - 92, cy + 6);
  ctx.closePath();
  ctx.fillStyle = beard;
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 175, 210, 0.55)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Kaşlar + gözler (parlayan).
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * 16, cy - 44);
    ctx.quadraticCurveTo(cx + side * 46, cy - 62, cx + side * 70, cy - 40);
    ctx.strokeStyle = '#f4f7ff';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.stroke();

    // **Küçük, sert bakışlı göz** (iri bebek gözü değil).
    ctx.beginPath();
    ctx.ellipse(cx + side * 40, cy - 14, 13, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f7fdff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + side * 40, cy - 14, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = '#5fe0ff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + side * 40, cy - 14, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#08243a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 60, 40, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx + side * 40, cy - 14, 13, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Burun.
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy - 22);
  ctx.lineTo(cx + 6, cy + 18);
  ctx.lineTo(cx - 16, cy + 22);
  ctx.strokeStyle = 'rgba(150, 96, 66, 0.55)';
  ctx.lineWidth = 5;
  ctx.stroke();

  // **Defne tacı**: alın çizgisi boyunca yapraklar + altın bant.
  ctx.save();
  ctx.shadowColor = 'rgba(255, 210, 90, 0.75)';
  ctx.shadowBlur = 24;
  for (let i = 0; i < 11; i += 1) {
    const angle = Math.PI * (1.04 + i * 0.092);
    const lx = cx + Math.cos(angle) * 116;
    const ly = cy - 66 + Math.sin(angle) * 104;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = goldGradient(ctx, -24, -10, 24, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 70, 0, 0.35)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Alın bandı + mücevher.
  ctx.beginPath();
  ctx.arc(cx, cy - 12, 104, Math.PI * 1.08, Math.PI * 1.92);
  ctx.strokeStyle = goldGradient(ctx, cx - 104, cy - 120, cx + 104, cy - 20);
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy - 118, 16, 20, 0, 0, Math.PI * 2);
  const gem = ctx.createRadialGradient(cx - 4, cy - 124, 1, cx, cy - 118, 20);
  gem.addColorStop(0, '#ffffff');
  gem.addColorStop(0.5, '#ff7d98');
  gem.addColorStop(1, '#8c0f2a');
  ctx.fillStyle = gem;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 240, 190, 0.8)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Omuzlar (scatter kartında alt kısım).
  ctx.beginPath();
  ctx.moveTo(cx - 186, 512);
  ctx.quadraticCurveTo(cx - 120, 372, cx, 366);
  ctx.quadraticCurveTo(cx + 120, 372, cx + 186, 512);
  ctx.closePath();
  ctx.fillStyle = '#2a1550';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 214, 122, 0.7)';
  ctx.lineWidth = 6;
  ctx.stroke();
}

// ── Dışa açılan dokular ─────────────────────────────────────────────────────

const DRAW = {
  gem_blue: (ctx) => drawGem(ctx, PALETTE.gem_blue, 0),
  gem_green: (ctx) => drawGem(ctx, PALETTE.gem_green, 1),
  gem_red: (ctx) => drawGem(ctx, PALETTE.gem_red, 2),
  gem_purple: (ctx) => drawGem(ctx, PALETTE.gem_purple, 3),
  scarab: drawScarab,
  ring: drawRing,
  hourglass: drawHourglass,
  crown: drawCrown,
  zeus: drawZeusFace,
};

// ── 3B semboller ────────────────────────────────────────────────────────────
//
// Semboller **3B işlenmiş görsellerdir** (`assets/sym/*.png` · Microsoft
// Fluent Emoji 3D, MIT lisansı: `assets/sym/FLUENT_LICENSE.txt`; mücevher
// renkleri ve altın böcek/yüzük bu görsellerden türetildi). Görsel yüklenene
// kadar (ya da yüklenemezse) eski çizim kullanılır; yüklenince aynı doku
// yerinde yenilenir — tahta hiç boş kalmaz.

const SYMBOL_IDS = Object.keys(DRAW);
const symbolImages = new Map();

/** Sembolün vurgu rengi (patlama kıvılcımları, ışıma). */
export function symbolColor(id) {
  return (PALETTE[id] ?? PALETTE.gem_blue)[2];
}

function drawSymbolImage(ctx, id, img) {
  const S = SIZE;
  ctx.clearRect(0, 0, S, S);
  // Arkada sembol renginde yumuşak hâle (derinlik).
  const halo = ctx.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S * 0.46);
  halo.addColorStop(0, `${symbolColor(id)}66`);
  halo.addColorStop(1, `${symbolColor(id)}00`);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);
  // Gölge: sembol karodan "kalkmış" görünsün.
  const size = id === 'zeus' ? S * 0.86 : S * 0.8;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 16;
  ctx.drawImage(img, (S - size) / 2, (S - size) / 2 - 6, size, size);
  ctx.restore();
}

/** Sembol tuvali (doku ve yardım ekranı aynı çizimi paylaşır). */
function symbolCanvas(id) {
  return cached(`symcanvas_${id}`, () => {
    const canvas = canvas2d();
    const ctx = canvas.getContext('2d');
    const img = symbolImages.get(id);
    if (img) drawSymbolImage(ctx, id, img);
    else (DRAW[id] ?? DRAW.gem_blue)(ctx);
    return canvas;
  });
}

/** Sembol dokusu (aynı sembol için tek kez üretilir). */
export function symbolTexture(id) {
  return cached(`sym_${id}`, () => toTexture(symbolCanvas(id)));
}

/** Yardım/ödeme tablosu için PNG data URL'i (tarayıcıda bir kez üretilir). */
export function symbolDataURL(id) {
  return cached(`symurl_${id}`, () => symbolCanvas(id).toDataURL('image/png'));
}

/**
 * 3B sembol görsellerini yükler; yüklenen her sembolün tuvali ve dokusu
 * yerinde yenilenir. En geç [timeoutMs] sonra çözülür (yavaş ağda oyun
 * beklemez, eski çizimle açılır ve görsel gelince değişir).
 */
export function loadSymbolImages(timeoutMs = 2500) {
  const jobs = SYMBOL_IDS.map(
    (id) =>
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          symbolImages.set(id, img);
          const canvas = cache.get(`symcanvas_${id}`);
          if (canvas) drawSymbolImage(canvas.getContext('2d'), id, img);
          const texture = cache.get(`sym_${id}`);
          if (texture) texture.needsUpdate = true;
          cache.delete(`symurl_${id}`);
          resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = `./assets/sym/${id}.png`;
      }),
  );
  return Promise.race([
    Promise.all(jobs),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** Patlamada genişleyen ışık halkası (beyaz; renk materyalden gelir). */
export function ringTexture() {
  return cached('ring_fx', () => {
    const canvas = canvas2d(256);
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 60, 128, 128, 126);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0.08)');
    grad.addColorStop(0.82, 'rgba(255,255,255,1)');
    grad.addColorStop(0.9, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return toTexture(canvas);
  });
}

/** Patlamada saçılan yıldız parıltısı (dört kollu). */
export function starTexture() {
  return cached('star_fx', () => {
    const canvas = canvas2d(128);
    const ctx = canvas.getContext('2d');
    const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 40);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (const rot of [0, Math.PI / 2]) {
      ctx.save();
      ctx.translate(64, 64);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(-62, 0);
      ctx.quadraticCurveTo(0, -5, 62, 0);
      ctx.quadraticCurveTo(0, 5, -62, 0);
      ctx.fill();
      ctx.restore();
    }
    return toTexture(canvas);
  });
}

/** Tahtadaki karonun mor mermer plakası (altın ince kenarlı). */
export function stoneTexture() {
  return cached('stone', () => {
    // **Modern cam karo**: koyu mor zemin, üstten yumuşak ışık, ince parlak
    // kenar (eski mermer/altın çerçeve yerine sade ve derin görünüm).
    const S = 256;
    const canvas = canvas2d(S);
    const ctx = canvas.getContext('2d');
    const r = 34;
    const rounded = (x, y, w, h, rad) => {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    };
    ctx.fillStyle = '#0d0820';
    ctx.fillRect(0, 0, S, S);
    const base = ctx.createLinearGradient(0, 0, 0, S);
    base.addColorStop(0, '#3a2a78');
    base.addColorStop(0.5, '#241850');
    base.addColorStop(1, '#160e34');
    rounded(6, 6, S - 12, S - 12, r);
    ctx.fillStyle = base;
    ctx.fill();
    // Üst parlama.
    const sheen = ctx.createRadialGradient(S / 2, -20, 10, S / 2, 40, S * 0.75);
    sheen.addColorStop(0, 'rgba(190, 160, 255, 0.35)');
    sheen.addColorStop(1, 'rgba(190, 160, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fill();
    // İç gölge (alt).
    const inner = ctx.createLinearGradient(0, S * 0.6, 0, S);
    inner.addColorStop(0, 'rgba(0,0,0,0)');
    inner.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = inner;
    ctx.fill();
    // İnce kenar: üstte parlak, altta koyu.
    const edge = ctx.createLinearGradient(0, 0, 0, S);
    edge.addColorStop(0, 'rgba(214, 196, 255, 0.75)');
    edge.addColorStop(0.5, 'rgba(150, 120, 230, 0.28)');
    edge.addColorStop(1, 'rgba(255, 200, 110, 0.35)');
    ctx.lineWidth = 4;
    ctx.strokeStyle = edge;
    rounded(8, 8, S - 16, S - 16, r - 2);
    ctx.stroke();
    return toTexture(canvas);
  });
}

/** Çarpan küresi için ışıma dokusu (beyaz; renk materyalden gelir). */
export function glowTexture() {
  return cached('glow', () => {
    const canvas = canvas2d(128);
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,236,180,0.55)');
    grad.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return toTexture(canvas);
  });
}

/** Parçacık dokusu (yumuşak nokta). */
export function sparkTexture() {
  return cached('spark', () => {
    const canvas = canvas2d(64);
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,226,160,0.7)');
    grad.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return toTexture(canvas);
  });
}

/** Çarpan değeri yazısı (`x2` … `x500`). */
export function multiplierTexture(value) {
  return cached(`mult_${value}`, () => {
    const S = 512;
    const canvas = canvas2d(S, S);
    const ctx = canvas.getContext('2d');
    // Yalnız **sayı**: karenin içinde modern bir çarpan yazısı (küre/madalyon
    // yok). Kalın koyu kontur + altın dolgu her sembolün üzerinde okunur.
    const label = `x${value}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let size = 300;
    do {
      ctx.font = `900 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
      if (ctx.measureText(label).width <= 420) break;
      size -= 12;
    } while (size > 96);

    // Değer kademesine göre renkli ışıma + arkada cam rozet.
    const tier =
      value >= 500 ? ['#ff3df2', '#ffd23d'] :
      value >= 50 ? ['#ff4d4d', '#ff9a3d'] :
      value >= 10 ? ['#b44dff', '#ff5cc8'] :
      ['#2fd1ff', '#3dff9a'];
    const badge = ctx.createRadialGradient(256, 256, 30, 256, 256, 230);
    badge.addColorStop(0, `${tier[0]}55`);
    badge.addColorStop(0.7, `${tier[1]}22`);
    badge.addColorStop(1, `${tier[1]}00`);
    ctx.fillStyle = badge;
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.shadowColor = tier[0];
    ctx.shadowBlur = 54;
    ctx.fillStyle = `${tier[1]}aa`;
    ctx.fillText(label, 256, 268);
    ctx.restore();

    // Koyu kontur (okunabilirlik).
    ctx.lineJoin = 'round';
    ctx.lineWidth = 46;
    ctx.strokeStyle = 'rgba(26, 10, 40, 0.96)';
    ctx.strokeText(label, 256, 268);
    ctx.lineWidth = 20;
    ctx.strokeStyle = 'rgba(12, 4, 22, 0.9)';
    ctx.strokeText(label, 256, 268);

    // Altın dolgu.
    const grad = ctx.createLinearGradient(0, 120, 0, 410);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#ffe9a6');
    grad.addColorStop(0.78, '#ffc247');
    grad.addColorStop(1, '#ff8a1f');
    ctx.fillStyle = grad;
    ctx.fillText(label, 256, 268);

    return toTexture(canvas);
  });
}

/** Sahne yazıları ("BÜYÜK KAZANÇ"). */
export function labelTexture(text, colors = ['#fff6d8', '#ffd166', '#ff8a3d']) {
  return cached(`label_${text}`, () => {
    const canvas = canvas2d(1024, 256);
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 96;
    do {
      ctx.font = `900 ${size}px system-ui, "Segoe UI", Roboto, sans-serif`;
      if (ctx.measureText(text).width <= 940) break;
      size -= 6;
    } while (size > 40);

    const grad = ctx.createLinearGradient(0, 60, 0, 190);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.55, colors[1]);
    grad.addColorStop(1, colors[2]);
    ctx.shadowColor = 'rgba(255, 180, 60, 0.85)';
    ctx.shadowBlur = 34;
    ctx.fillStyle = grad;
    ctx.fillText(text, 512, 128);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeText(text, 512, 128);

    return toTexture(canvas);
  });
}

// ── Zeus portresi (tahtanın arkasındaki tanrı) ──────────────────────────────
//
// 1024×1280 tuvale **ressam işi** bir büst çizilir: mor pelerin, altın zırh,
// beyaz sakal, defne tacı ve elinde yıldırım. Tahtanın arkasında durur; yavaşça
// nefes alır, küre fırlatırken asası parlar.

export function zeusPortraitTexture() {
  return cached('zeus_portrait', () => {
    const W = 1024;
    const H = 1280;
    const canvas = canvas2d(W, H);
    const ctx = canvas.getContext('2d');
    const cx = W * 0.5;

    const SKIN_LIGHT = '#ffe2c6';
    const SKIN = '#f0c39c';
    const SKIN_MID = '#d69f78';
    const SKIN_DARK = '#a9714c';

    // ── Işıma ───────────────────────────────────────────────────────────────
    const halo = ctx.createRadialGradient(cx, 430, 40, cx, 470, 470);
    halo.addColorStop(0, 'rgba(255, 208, 120, 0.30)');
    halo.addColorStop(0.45, 'rgba(146, 92, 255, 0.18)');
    halo.addColorStop(1, 'rgba(40, 12, 80, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, 460, 470, 0, Math.PI * 2);
    ctx.fill();

    // ── Pelerin ─────────────────────────────────────────────────────────────
    const cloak = ctx.createLinearGradient(0, 600, 0, H);
    cloak.addColorStop(0, '#4c2c8a');
    cloak.addColorStop(0.5, '#2c1656');
    cloak.addColorStop(1, '#120820');
    ctx.beginPath();
    ctx.moveTo(cx - 430, H);
    ctx.quadraticCurveTo(cx - 400, 760, cx - 170, 640);
    ctx.lineTo(cx + 170, 640);
    ctx.quadraticCurveTo(cx + 400, 760, cx + 430, H);
    ctx.closePath();
    ctx.fillStyle = cloak;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 122, 0.35)';
    ctx.lineWidth = 5;
    ctx.stroke();

    // ── Gövde: altın zırh ──────────────────────────────────────────────────
    const armor = ctx.createLinearGradient(cx - 330, 700, cx + 330, 1200);
    armor.addColorStop(0, '#fff0bd');
    armor.addColorStop(0.3, '#f4c65c');
    armor.addColorStop(0.62, '#c98c18');
    armor.addColorStop(1, '#6f3f03');
    ctx.beginPath();
    ctx.moveTo(cx - 300, H);
    ctx.quadraticCurveTo(cx - 340, 880, cx - 250, 770);
    ctx.quadraticCurveTo(cx - 150, 690, cx, 676);
    ctx.quadraticCurveTo(cx + 150, 690, cx + 250, 770);
    ctx.quadraticCurveTo(cx + 340, 880, cx + 300, H);
    ctx.closePath();
    ctx.fillStyle = armor;
    ctx.fill();

    // Göğüs plakaları.
    ctx.save();
    ctx.strokeStyle = 'rgba(110, 62, 4, 0.55)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cx, 700);
    ctx.lineTo(cx, 1000);
    ctx.moveTo(cx - 200, 800);
    ctx.quadraticCurveTo(cx - 90, 900, cx - 12, 860);
    ctx.moveTo(cx + 200, 800);
    ctx.quadraticCurveTo(cx + 90, 900, cx + 12, 860);
    ctx.stroke();
    ctx.restore();

    // Göğüs ortasında altın madalyon.
    const crest = ctx.createRadialGradient(cx, 880, 10, cx, 880, 96);
    crest.addColorStop(0, '#fff3c4');
    crest.addColorStop(0.6, '#f0b53c');
    crest.addColorStop(1, '#8a5306');
    ctx.beginPath();
    ctx.arc(cx, 880, 86, 0, Math.PI * 2);
    ctx.fillStyle = crest;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 70, 4, 0.6)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, 880, 46, 0, Math.PI * 2);
    ctx.fillStyle = '#7d1024';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 236, 170, 0.75)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // ── Omuz zırhları ──────────────────────────────────────────────────────
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + side * 300, 800);
      ctx.rotate(side * 0.18);
      const pad = ctx.createLinearGradient(-150, -110, 150, 130);
      pad.addColorStop(0, '#fff1c2');
      pad.addColorStop(0.45, '#eab648');
      pad.addColorStop(1, '#7d4a04');
      ctx.beginPath();
      ctx.ellipse(0, 0, 152, 116, 0, 0, Math.PI * 2);
      ctx.fillStyle = pad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(110, 62, 4, 0.5)';
      ctx.lineWidth = 6;
      ctx.stroke();
      // Perçinler.
      for (let i = 0; i < 5; i += 1) {
        const a = -0.5 + i * 0.5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 96, Math.sin(a) * 70, 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 246, 200, 0.9)';
        ctx.fill();
      }
      ctx.restore();
    }

    // ── Boyun ──────────────────────────────────────────────────────────────
    const neck = ctx.createLinearGradient(cx - 80, 600, cx + 80, 760);
    neck.addColorStop(0, SKIN_MID);
    neck.addColorStop(0.5, SKIN);
    neck.addColorStop(1, SKIN_DARK);
    ctx.beginPath();
    ctx.moveTo(cx - 82, 586);
    ctx.lineTo(cx + 82, 586);
    ctx.lineTo(cx + 102, 740);
    ctx.quadraticCurveTo(cx, 786, cx - 102, 740);
    ctx.closePath();
    ctx.fillStyle = neck;
    ctx.fill();

    // ── Saç (arka) ─────────────────────────────────────────────────────────
    const hair = ctx.createLinearGradient(cx, 200, cx, 900);
    hair.addColorStop(0, '#ffffff');
    hair.addColorStop(0.55, '#eef3ff');
    hair.addColorStop(1, '#c2cbe6');
    for (let i = 0; i < 11; i += 1) {
      const a = Math.PI * (0.86 + (i / 10) * 1.28);
      const hx = cx + Math.cos(a) * 232;
      const hy = 400 + Math.sin(a) * 200;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, 60, 120, 0, 0, Math.PI * 2);
      ctx.fillStyle = hair;
      ctx.fill();
      ctx.restore();
    }

    // ── Yüz ────────────────────────────────────────────────────────────────
    const faceY = 430;
    const face = ctx.createRadialGradient(cx - 40, faceY - 70, 30, cx, faceY + 20, 210);
    face.addColorStop(0, SKIN_LIGHT);
    face.addColorStop(0.5, SKIN);
    face.addColorStop(0.82, SKIN_MID);
    face.addColorStop(1, SKIN_DARK);
    ctx.beginPath();
    ctx.ellipse(cx, faceY, 168, 200, 0, 0, Math.PI * 2);
    ctx.fillStyle = face;
    ctx.fill();

    // Elmacık kemikleri + şakak gölgesi.
    ctx.save();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * 108, faceY + 34, 52, 34, side * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 232, 210, 0.35)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + side * 140, faceY - 40, 26, 78, side * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150, 92, 60, 0.18)';
      ctx.fill();
    }
    ctx.restore();

    // Kulaklar.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * 168, faceY + 20, 24, 42, side * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = SKIN_MID;
      ctx.fill();
    }

    // Kaşlar (sert bakış).
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 26, faceY - 58);
      ctx.quadraticCurveTo(cx + side * 84, faceY - 96, cx + side * 138, faceY - 44);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 30;
      ctx.lineCap = 'round';
      ctx.stroke();
      // Kaş altı gölgesi.
      ctx.beginPath();
      ctx.moveTo(cx + side * 34, faceY - 40);
      ctx.quadraticCurveTo(cx + side * 88, faceY - 62, cx + side * 132, faceY - 26);
      ctx.strokeStyle = 'rgba(120, 76, 50, 0.25)';
      ctx.lineWidth = 12;
      ctx.stroke();
    }

    // Gözler.
    for (const side of [-1, 1]) {
      const ex = cx + side * 78;
      const ey = faceY - 12;
      // Göz yuvası gölgesi.
      ctx.beginPath();
      ctx.ellipse(ex, ey - 4, 44, 30, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(126, 78, 52, 0.22)';
      ctx.fill();

      // Göz akı.
      ctx.beginPath();
      ctx.moveTo(ex - 34, ey);
      ctx.quadraticCurveTo(ex, ey - 26, ex + 34, ey - 2);
      ctx.quadraticCurveTo(ex, ey + 20, ex - 34, ey);
      ctx.fillStyle = '#fbfdff';
      ctx.fill();

      // İris.
      const iris = ctx.createRadialGradient(ex, ey, 2, ex, ey, 18);
      iris.addColorStop(0, '#ffffff');
      iris.addColorStop(0.4, '#9ff0ff');
      iris.addColorStop(1, '#1b6f9c');
      ctx.beginPath();
      ctx.arc(ex, ey, 17, 0, Math.PI * 2);
      ctx.fillStyle = iris;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex, ey, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#081f30';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex - 5, ey - 5, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();

      // Üst kapak.
      ctx.beginPath();
      ctx.moveTo(ex - 36, ey - 2);
      ctx.quadraticCurveTo(ex, ey - 30, ex + 36, ey - 4);
      ctx.strokeStyle = 'rgba(90, 60, 44, 0.55)';
      ctx.lineWidth = 5;
      ctx.stroke();
    }

    // Burun.
    ctx.beginPath();
    ctx.moveTo(cx - 14, faceY - 16);
    ctx.quadraticCurveTo(cx + 22, faceY + 54, cx - 16, faceY + 86);
    ctx.strokeStyle = 'rgba(160, 104, 70, 0.45)';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 22, faceY + 88);
    ctx.quadraticCurveTo(cx - 4, faceY + 100, cx + 16, faceY + 82);
    ctx.strokeStyle = 'rgba(120, 70, 44, 0.5)';
    ctx.lineWidth = 7;
    ctx.stroke();

    // ── Bıyık + sakal ──────────────────────────────────────────────────────
    const beard = ctx.createLinearGradient(cx, faceY + 100, cx, faceY + 560);
    beard.addColorStop(0, '#ffffff');
    beard.addColorStop(0.55, '#eef3ff');
    beard.addColorStop(1, '#bcc6e2');
    ctx.beginPath();
    ctx.moveTo(cx - 150, faceY + 96);
    ctx.quadraticCurveTo(cx - 226, faceY + 300, cx - 168, faceY + 430);
    ctx.quadraticCurveTo(cx - 90, faceY + 540, cx, faceY + 556);
    ctx.quadraticCurveTo(cx + 90, faceY + 540, cx + 168, faceY + 430);
    ctx.quadraticCurveTo(cx + 226, faceY + 300, cx + 150, faceY + 96);
    ctx.quadraticCurveTo(cx + 70, faceY + 180, cx, faceY + 180);
    ctx.quadraticCurveTo(cx - 70, faceY + 180, cx - 150, faceY + 96);
    ctx.closePath();
    ctx.fillStyle = beard;
    ctx.fill();

    // Sakal telleri.
    ctx.strokeStyle = 'rgba(168, 184, 218, 0.6)';
    ctx.lineWidth = 4;
    for (let i = -5; i <= 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 24, faceY + 210);
      ctx.quadraticCurveTo(
        cx + i * 30,
        faceY + 350,
        cx + i * 16,
        faceY + 500 - Math.abs(i) * 12,
      );
      ctx.stroke();
    }

    // Bıyık (iki kıvrım).
    ctx.fillStyle = '#ffffff';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, faceY + 118);
      ctx.quadraticCurveTo(cx + side * 92, faceY + 96, cx + side * 120, faceY + 156);
      ctx.quadraticCurveTo(cx + side * 74, faceY + 140, cx, faceY + 152);
      ctx.closePath();
      ctx.fill();
    }

    // ── Saç (ön tutamlar) ──────────────────────────────────────────────────
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(cx + side * (120 + i * 22), 300 + i * 10);
        ctx.quadraticCurveTo(
          cx + side * (250 + i * 12),
          470 + i * 40,
          cx + side * (206 + i * 20),
          800 + i * 30,
        );
        ctx.quadraticCurveTo(
          cx + side * (150 + i * 20),
          520,
          cx + side * (96 + i * 20),
          330,
        );
        ctx.closePath();
        ctx.fillStyle = hair;
        ctx.fill();
      }
    }

    // ── Defne tacı ─────────────────────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = 'rgba(255, 196, 60, 0.65)';
    ctx.shadowBlur = 26;
    for (let i = 0; i < 13; i += 1) {
      const a = Math.PI * (1.1 + (i / 12) * 0.8);
      const lx = cx + Math.cos(a) * 196;
      const ly = 306 + Math.sin(a) * 82;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, 40, 16, 0, 0, Math.PI * 2);
      ctx.fillStyle = goldGradient(ctx, -40, -16, 40, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 70, 0, 0.4)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // Alın bandı.
    ctx.beginPath();
    ctx.ellipse(cx, 342, 186, 74, 0, Math.PI * 0.02, Math.PI * 0.98);
    ctx.strokeStyle = goldGradient(ctx, cx - 186, 300, cx + 186, 380);
    ctx.lineWidth = 12;
    ctx.stroke();

    // Taç mücevheri.
    const gem = ctx.createRadialGradient(cx - 8, 292, 2, cx, 302, 34);
    gem.addColorStop(0, '#ffffff');
    gem.addColorStop(0.45, '#ff718f');
    gem.addColorStop(1, '#8c0f2a');
    ctx.beginPath();
    ctx.ellipse(cx, 302, 32, 26, 0, 0, Math.PI * 2);
    ctx.fillStyle = gem;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 190, 0.85)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // ── Kollar ─────────────────────────────────────────────────────────────
    // Sol kol (aşağıda).
    ctx.save();
    ctx.translate(cx - 320, 940);
    ctx.rotate(0.14);
    const armL = ctx.createLinearGradient(-90, -200, 90, 260);
    armL.addColorStop(0, SKIN_LIGHT);
    armL.addColorStop(0.6, SKIN);
    armL.addColorStop(1, SKIN_DARK);
    ctx.beginPath();
    ctx.ellipse(0, 120, 86, 230, 0, 0, Math.PI * 2);
    ctx.fillStyle = armL;
    ctx.fill();
    // Bilezik.
    ctx.beginPath();
    ctx.ellipse(0, 300, 84, 34, 0, 0, Math.PI * 2);
    ctx.fillStyle = goldGradient(ctx, -84, 266, 84, 334);
    ctx.fill();
    ctx.restore();

    // Sağ kol (aşağıda; elleri ayrı kaplama tutar — bkz. zeusHandTexture).
    ctx.save();
    ctx.translate(cx + 320, 940);
    ctx.rotate(-0.14);
    const armR = ctx.createLinearGradient(-90, -200, 90, 260);
    armR.addColorStop(0, SKIN_LIGHT);
    armR.addColorStop(0.6, SKIN);
    armR.addColorStop(1, SKIN_DARK);
    ctx.beginPath();
    ctx.ellipse(0, 120, 86, 230, 0, 0, Math.PI * 2);
    ctx.fillStyle = armR;
    ctx.fill();
    // Bilezik.
    ctx.beginPath();
    ctx.ellipse(0, 300, 84, 34, 0, 0, Math.PI * 2);
    ctx.fillStyle = goldGradient(ctx, -84, 266, 84, 334);
    ctx.fill();
    ctx.restore();

    return toTexture(canvas);
  });
}

// ── Zeus'un elleri (tahtanın üst kenarını kavrar) ───────────────────────────
//
// Tek kol + el çizilir (384×256). Sağ elde bu çizim, sol elde **X'te aynası**
// kullanılır; iki el de tahtanın üst kenarını içeriden kavrar. Avuç kenarın
// üstünde, parmaklar kenardan aşağı sarkar; altta temas gölgesi vardır.

export function zeusHandTexture() {
  return cached('zeus_hand', () => {
    const W = 384;
    const H = 256;
    const canvas = canvas2d(W, H);
    const ctx = canvas.getContext('2d');
    const cx = W * 0.5;

    const SKIN_LIGHT = '#ffe6cd';
    const SKIN = '#f2c49d';
    const SKIN_MID = '#d39468';
    const SKIN_DARK = '#9c6440';

    // ── Ön kol ─────────────────────────────────────────────────────────────
    // Kol bilekten yukarı **gövdeye doğru** eğilir: omuzla bütünleşir, tahtanın
    // üstünde bağımsız bir sütun gibi durmaz.
    ctx.save();
    ctx.translate(cx, 152);
    ctx.rotate(-0.21);
    ctx.translate(-cx, -152);

    // Ön kol artık 3B tüp olarak çizilir (zeus.js ▸ kollar); burada yalnız
    // bilezik ve el kalır, kol omuza kesintisiz bağlanır.

    // ── Bilezik ────────────────────────────────────────────────────────────
    const bracer = ctx.createLinearGradient(cx - 58, 116, cx + 58, 156);
    bracer.addColorStop(0, '#7d4802');
    bracer.addColorStop(0.26, '#e8b64a');
    bracer.addColorStop(0.5, '#fff4ca');
    bracer.addColorStop(0.76, '#dfa128');
    bracer.addColorStop(1, '#6d3f02');
    ctx.beginPath();
    ctx.moveTo(cx - 58, 118);
    ctx.lineTo(cx + 58, 118);
    ctx.lineTo(cx + 54, 156);
    ctx.lineTo(cx - 54, 156);
    ctx.closePath();
    ctx.fillStyle = bracer;
    ctx.fill();
    ctx.strokeStyle = 'rgba(84, 48, 3, 0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();

    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(cx - 32 + i * 32, 137, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 250, 216, 0.95)';
      ctx.fill();
    }

    ctx.restore();

    // ── El sırtı (avuç) ────────────────────────────────────────────────────
    const palm = ctx.createRadialGradient(cx - 18, 172, 10, cx, 188, 82);
    palm.addColorStop(0, SKIN_LIGHT);
    palm.addColorStop(0.55, SKIN);
    palm.addColorStop(1, SKIN_MID);
    ctx.beginPath();
    ctx.ellipse(cx, 184, 64, 48, 0, 0, Math.PI * 2);
    ctx.fillStyle = palm;
    ctx.fill();

    // Parmak kökleri (boğum kabartısı).
    for (let i = 0; i < 4; i += 1) {
      const x = cx - 45 + i * 30;
      ctx.beginPath();
      ctx.ellipse(x, 172, 15, 13, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 240, 224, 0.32)';
      ctx.fill();
    }

    // ── Temas gölgesi (kenarın üstünde) ────────────────────────────────────
    const contact = ctx.createLinearGradient(0, 208, 0, 252);
    contact.addColorStop(0, 'rgba(24, 10, 44, 0)');
    contact.addColorStop(0.5, 'rgba(24, 10, 44, 0.4)');
    contact.addColorStop(1, 'rgba(24, 10, 44, 0.05)');
    ctx.fillStyle = contact;
    ctx.fillRect(cx - 96, 206, 192, 46);

    // ── Parmaklar (kenardan aşağı sarkan) ──────────────────────────────────
    const fingerX = [-45, -15, 16, 46];
    const fingerLen = [58, 62, 60, 52];
    for (let i = 0; i < fingerX.length; i += 1) {
      const x = cx + fingerX[i];
      const top = 190;
      const bottom = top + fingerLen[i];

      const grad = ctx.createLinearGradient(x - 15, top, x + 15, bottom);
      grad.addColorStop(0, SKIN_LIGHT);
      grad.addColorStop(0.5, SKIN);
      grad.addColorStop(1, SKIN_MID);

      ctx.beginPath();
      ctx.moveTo(x - 14, top);
      ctx.lineTo(x - 13, bottom - 12);
      ctx.quadraticCurveTo(x, bottom + 9, x + 13, bottom - 12);
      ctx.lineTo(x + 14, top);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 70, 44, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Boğum çizgisi.
      ctx.beginPath();
      ctx.moveTo(x - 10, top + fingerLen[i] * 0.45);
      ctx.quadraticCurveTo(x, top + fingerLen[i] * 0.52, x + 10, top + fingerLen[i] * 0.45);
      ctx.strokeStyle = 'rgba(150, 94, 62, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Tırnak.
      ctx.beginPath();
      ctx.ellipse(x, bottom - 16, 7, 8.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 245, 235, 0.9)';
      ctx.fill();
    }

    // ── Başparmak (tahtanın ortasına bakar) ────────────────────────────────
    ctx.save();
    ctx.translate(cx - 60, 176);
    ctx.rotate(-0.55);
    const thumb = ctx.createLinearGradient(-18, -10, 18, 60);
    thumb.addColorStop(0, SKIN_LIGHT);
    thumb.addColorStop(0.6, SKIN);
    thumb.addColorStop(1, SKIN_MID);
    ctx.beginPath();
    ctx.ellipse(0, 26, 17, 40, 0, 0, Math.PI * 2);
    ctx.fillStyle = thumb;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 56, 8, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 245, 235, 0.82)';
    ctx.fill();
    ctx.restore();

    // Üst kenarı yumuşakça sil: kol gövdenin arkasından geliyormuş gibi görünür
    // (düz kesik "kova" görüntüsü olmaz).
    ctx.globalCompositeOperation = 'destination-out';
    const fade = ctx.createLinearGradient(0, -4, 0, 128);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0.98)');
    fade.addColorStop(0.35, 'rgba(0, 0, 0, 0.68)');
    fade.addColorStop(0.72, 'rgba(0, 0, 0, 0.28)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, 128);
    ctx.globalCompositeOperation = 'source-over';

    return toTexture(canvas);
  });
}
