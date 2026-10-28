// ─── 3D sahne ───────────────────────────────────────────────────────────────
//
// Oyunun görsel dünyası: Olympos tapınağının önünde duran 6×5 slot tahtası,
// sağda **Şanslı Dede** (Zeus figürü), altın sütunlar, arkada ışıklı kapı ve
// havada süzülen toz. Tüm geometri ilkel şekillerden üretilir (harici model
// yok) — bu yüzden ilk kare çok hızlı açılır ve paket küçük kalır.
//
// Kamera tahtayı **her ekranda** çerçeveler: dar telefonda Dede kenardan
// görünür, geniş panelde tam boyu çıkar.

import * as THREE from 'three';
import { Grid } from './grid.js';
import { Orbs } from './orbs.js';
import { Zeus } from './zeus.js';
import { glowTexture, sparkTexture } from './textures.js';
import { clamp } from '../core/utils.js';

const GOLD = 0xffc857;
const STONE = 0x241a44;

function standard(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.62,
    metalness: options.metalness ?? 0.18,
    emissive: new THREE.Color(options.emissive ?? 0x000000),
    emissiveIntensity: options.emissiveIntensity ?? 0,
    side: options.side ?? THREE.FrontSide,
  });
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    // Semboller yalnız tablonun **içinde** görünür (üst/alt kenarda kesilir).
    this.renderer.localClippingEnabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080512);
    this.scene.fog = new THREE.Fog(0x0a0618, 26, 46);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);

    this._buildLights();
    this._buildTemple();

    this.grid = new Grid(this.boardGroup);
    // Küreler dünya uzayında uçar (hedef koordinatlar dünya koordinatıdır).
    this.orbs = new Orbs(this.scene);

    // **Dede**: tahtanın arkasında duran portre (see scene/zeus.js).
    this.zeus = new Zeus();
    this.scene.add(this.zeus.group);
    // Elleri tahtanın üst kenarını kavrar; dünya uzayında durur.
    this.scene.add(this.zeus.hands);

    this._buildDust();
    this._buildFlash();

    this.time = 0;
    this.shakeAmount = 0;

    this.resize();
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement ?? canvas);
    } else {
      window.addEventListener('resize', () => this.resize());
    }
  }

  // ── Kurulum ─────────────────────────────────────────────────────────────

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x6a5a9c, 0.85));

    // Ana ışık: tahtanın sol üstünden sıcak altın.
    const key = new THREE.DirectionalLight(0xffe2ac, 1.5);
    key.position.set(-6, 8, 9);
    this.scene.add(key);

    // Dolgu: soğuk mor, sağdan.
    const fill = new THREE.PointLight(0x8a5cff, 22, 26, 2);
    fill.position.set(7, 2.4, 5.5);
    this.scene.add(fill);

    // Tahtanın arkasından altın hâle.
    const rim = new THREE.PointLight(0xffb020, 26, 22, 2);
    rim.position.set(0, 1.4, -4.2);
    this.scene.add(rim);

    // Dede'yi aydınlatan sıcak nokta.
    const zeusLight = new THREE.PointLight(0xffd98a, 12, 12, 2);
    zeusLight.position.set(4.4, 3.4, 3);
    this.scene.add(zeusLight);
  }

  _buildTemple() {
    // Zemin: koyu mermer + altın çizgiler (doku canvas'tan gelir).
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 40),
      standard(0x14102a, { roughness: 0.85, metalness: 0.1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -3.35, -2);
    this.scene.add(floor);

    // Arkadaki ışıklı kapı (Olympos'un kapıları).
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(6.4, 0.32, 12, 48, Math.PI),
      standard(GOLD, { metalness: 0.85, roughness: 0.28, emissive: 0x5a3200, emissiveIntensity: 0.4 }),
    );
    // Kemer **tahtanın arkasında** kalır: yalnız kenarlarından ışıması görünür.
    arch.position.set(0, -4.1, -5.4);
    this.scene.add(arch);

    const archGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 12),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: 0x8a4bff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    archGlow.position.set(0, -1.2, -5.6);
    this.scene.add(archGlow);

    // Sütunlar (iki yanda, arkada).
    for (const x of [-6.6, -4.6, 4.6, 6.6]) {
      const column = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.42, 7, 14),
        standard(STONE, { roughness: 0.7, metalness: 0.2 }),
      );
      shaft.position.y = 0;
      column.add(shaft);

      for (const y of [-3.4, 3.4]) {
        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14),
          standard(GOLD, { metalness: 0.85, roughness: 0.3 }),
        );
        ring.position.y = y;
        column.add(ring);
      }

      column.position.set(x, -0.2, -4.6);
      this.scene.add(column);
    }

    // Tahtanın arkasındaki altın çerçeve.
    const frame = new THREE.Group();
    const width = 6.9;
    const height = 5.9;
    const bar = 0.16;
    const edges = [
      [width, bar, 0, height / 2 - bar / 2],
      [width, bar, 0, -height / 2 + bar / 2],
      [bar, height, -width / 2 + bar / 2, 0],
      [bar, height, width / 2 - bar / 2, 0],
    ];
    for (const [w, h, x, y] of edges) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.16),
        standard(GOLD, { metalness: 0.9, roughness: 0.24, emissive: 0x6a3d00, emissiveIntensity: 0.55 }),
      );
      edge.position.set(x, y, 0.02);
      frame.add(edge);
    }

    // Çerçevenin içi: koyu cam panel.
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(width - bar, height - bar, 0.12),
      standard(0x100b22, { roughness: 0.55, metalness: 0.35, emissive: 0x1a0f3a, emissiveIntensity: 0.6 }),
    );
    panel.position.z = -0.06;
    frame.add(panel);

    // Arka ışıma.
    const backGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0xffb020,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    backGlow.scale.set(11, 9.4, 1);
    backGlow.position.z = -0.5;
    frame.add(backGlow);

    // Köşe süsleri + üst ortada madalyon (profesyonel çerçeve görünümü).
    const ornament = standard(GOLD, {
      metalness: 0.92,
      roughness: 0.22,
      emissive: 0x6a3d00,
      emissiveIntensity: 0.5,
    });
    for (const [ox, oy] of [
      [-width / 2, height / 2],
      [width / 2, height / 2],
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
    ]) {
      const rosette = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), ornament);
      rosette.position.set(ox, oy, 0.06);
      frame.add(rosette);
    }

    const crest = new THREE.Mesh(new THREE.CircleGeometry(0.34, 28), ornament);
    crest.position.set(0, height / 2, 0.07);
    frame.add(crest);
    const crestGem = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 20),
      standard(0xff4d6d, {
        metalness: 0.4,
        roughness: 0.2,
        emissive: 0x8a0f28,
        emissiveIntensity: 0.8,
      }),
    );
    crestGem.position.set(0, height / 2, 0.09);
    frame.add(crestGem);

    this.boardFrame = frame;
    this.boardGroup.add(frame);

    // Çerçeve ölçüsü: eller ve küre hedefleri buna göre hizalanır.
    this.frameWidth = width;
    this.frameHeight = height;
  }

  _buildDust() {
    const COUNT = 90;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
      positions[i * 3 + 2] = -1 + Math.random() * 5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.1,
        map: sparkTexture(),
        color: 0xffd98a,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.dust);
  }

  /** Yıldırım anında ekranı kaplayan ışık. */
  _buildFlash() {
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0xfff0c0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flash.scale.set(30, 30, 1);
    this.flash.position.z = -1.4;
    this.camera.add(this.flash);
    this.scene.add(this.camera);
  }

  // ── Yerleşim ────────────────────────────────────────────────────────────

  resize() {
    const host = this.canvas.parentElement ?? this.canvas;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);

    // Telefonda akıcılık: çözünürlük en fazla 1,75× (fark görünmez, kare
    // başına çizilen piksel ~%25 azalır).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.layout();
  }

  /** Tahta, Dede ve kamera ekrana göre yerleşir. */
  layout() {
    const aspect = this.camera.aspect;
    const compact = aspect < 0.95;

    const step = 1;
    this.grid.layout({ step, x: 0, y: 0 });
    this.grid.group.position.z = 0.5;

    const boardW = 6 * step;

    // Dede'nin elleri çerçevenin üst kenarını kavrar (parmaklar kenardan taşar).
    this.zeus.placeHands({
      topY: (this.frameHeight ?? 5.9) / 2,
      x: Math.min(1.95, boardW / 2 - 0.4),
      z: 0.62,
    });

    // **Dede tahtanın arkasında, ortada** (referanstaki gibi): beli çerçevenin
    // üst kenarında kalır, göğsü/başı yukarıda görünür.
    const zeusScale = compact ? 0.7 : 0.72;
    this.zeus.group.scale.setScalar(zeusScale);
    this.zeus.group.position.set(0, compact ? 3.62 : 3.75, -1.7);
    this.zeus.baseY = this.zeus.group.position.y;
    this.zeus.group.rotation.y = 0;

    // **Kamera çerçevesi**: tahta + Dede'nin tacı birlikte sığsın.
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const needW = boardW + 0.95;
    // Telefonda tahta **daha büyük** görünsün: dikey çerçeve daraltılır,
    // Dede biraz küçültülüp tahtaya yaklaştırılır (tepesi kesilmez).
    const needH = compact ? 9.0 : 10.1;
    const distW = needW / (2 * tan * Math.max(0.25, aspect));
    const distH = needH / (2 * tan);
    const distance = clamp(Math.max(distW, distH), 9.2, 36);

    this.camera.position.set(0, 1.75, distance);
    this.camera.lookAt(0, 1.2, 0);
    this.camera.updateProjectionMatrix();
    // Sarsıntı bu konumdan hesaplanır (kamera kaymaz).
    this._baseX = this.camera.position.x;
    this._baseY = this.camera.position.y;
  }

  // ── Oynatma yardımcıları ────────────────────────────────────────────────

  /** Kazanç anında tahtayı hafifçe sarsar. */
  shake(amount = 0.25) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Yıldırım çaktığında tam ekran ışık. */
  lightning() {
    this.flash.material.opacity = 0.85;
  }

  /** Hücrenin dünya konumu (küreler buraya konar). */
  cellWorld(c, r) {
    return this.grid.cellWorld(c, r);
  }

  /**
   * Ekrandaki bir noktanın (CSS px, sahne kutusuna göre) dünya karşılığı.
   *
   * Kazanç kürelerinin **bakiye rozetine** uçması için kullanılır: DOM'daki
   * rozetin merkezi bu yöntemle 3B uzaya taşınır.
   */
  screenPointToWorld(x, y, planeZ = 1.4) {
    const host = this.canvas.getBoundingClientRect();
    if (!host.width || !host.height) return new THREE.Vector3(0, 1.4, planeZ);
    const ndcX = (x / host.width) * 2 - 1;
    const ndcY = -(y / host.height) * 2 + 1;
    const point = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = point.sub(this.camera.position).normalize();
    const distance = (planeZ - this.camera.position.z) / (dir.z || -1);
    return this.camera.position.clone().add(dir.multiplyScalar(distance));
  }

  update(dt) {
    this.time += dt;
    this.grid.update(dt);
    this.orbs.update(dt);
    this.zeus.update(dt);

    // Toz: yavaş yukarı süzülme.
    const positions = this.dust.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      let y = positions.getY(i) + dt * 0.09;
      if (y > 4.5) y = -4.5;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;

    // Sarsıntı sönümü.
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 0.9);
      const s = this.shakeAmount * 0.22;
      this.camera.position.x = (this._baseX ?? 0) + (Math.random() - 0.5) * s;
      this.camera.position.y = (this._baseY ?? 0) + (Math.random() - 0.5) * s;
      if (this.shakeAmount === 0) {
        this.camera.position.x = this._baseX ?? 0;
        this.camera.position.y = this._baseY ?? 0;
      }
    }

    // Işık patlaması söner.
    if (this.flash.material.opacity > 0) {
      this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 2.6);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
  }
}
