// ─── 3D ızgara (6 sütun × 5 satır) ──────────────────────────────────────────
//
// Her hücre bir "karo": arkada koyu cam blok, önde 3B sembol, arkada vurgu
// ışıması. Semboller sunucudan hazır gelir; burada yalnız **oynatılır**:
//   * `dropOut` → çevirince eski semboller tablonun **içinde** aşağı düşüp
//                 alttan çıkar (sunucu cevabı beklenirken),
//   * `dropIn`  → yeniler tablonun **üst kenarından** içeri düşer,
//   * `pop`     → eşleşenler parlayıp **patlar** (halka, kıvılcım, yıldız),
//   * `tumble`  → kalanlar aşağı kayar, yeniler üst kenardan düşer.
//
// **Kırpma**: semboller yalnız tablonun içinde görünür (üst ve alt kenarda
// kesilir); ekranın tepesinden uçarak gelmezler.

import * as THREE from 'three';
import { GRID, SYMBOL_BY_ID } from '../config.js';
import { Tweens } from '../core/tween.js';
import { easeOutCubic } from '../core/utils.js';
import {
  glowTexture,
  ringTexture,
  sparkTexture,
  starTexture,
  stoneTexture,
  symbolColor,
  symbolTexture,
} from './textures.js';

const ROWS = GRID.rows;
const COLS = GRID.cols;

const cellIndex = (c, r) => c * ROWS + r;

const PARTICLE_COUNT = 520;
const FX_POOL = 36;

/** Düşüşün sonunda hafif yaylanma (abartısız, modern). */
const easeLand = (t) => {
  if (t < 0.78) return easeOutCubic(t / 0.78) * 1.035;
  const k = (t - 0.78) / 0.22;
  return 1.035 - 0.035 * Math.sin(k * Math.PI * 0.5);
};

const easeIn = (t) => t * t * t;

export class Grid {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'grid';
    scene.add(this.group);

    this.tweens = new Tweens();
    this.step = 1;
    this.tiles = new Array(COLS * ROWS);
    this.time = 0;

    // Tablonun üst/alt kesim düzlemleri (dünya uzayı; `layout` günceller).
    this.clipTop = new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.62);
    this.clipBottom = new THREE.Plane(new THREE.Vector3(0, 1, 0), 2.62);
    this.clipping = [this.clipTop, this.clipBottom];

    this._buildTiles();
    this._buildParticles();
    this._buildFx();

    this.layout({ step: 1, x: 0, y: 0 });
  }

  // ── Kurulum ─────────────────────────────────────────────────────────────

  _buildTiles() {
    // Tüm karolar **tek** taş materyalini paylaşır (30 ayrı materyal yerine:
    // daha az GPU durum değişimi, daha akıcı kare).
    const stone = new THREE.MeshStandardMaterial({
      map: stoneTexture(),
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.2,
      emissive: new THREE.Color(0x24184a),
      emissiveIntensity: 0.35,
      clippingPlanes: this.clipping,
    });

    const box = new THREE.BoxGeometry(0.95, 0.95, 0.16);
    const plane = new THREE.PlaneGeometry(0.92, 0.92);
    const glowPlane = new THREE.PlaneGeometry(1.08, 1.08);

    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const tile = new THREE.Group();

        const back = new THREE.Mesh(box, stone);
        back.position.z = -0.04;
        tile.add(back);

        const face = new THREE.Mesh(
          plane,
          new THREE.MeshBasicMaterial({
            map: symbolTexture('gem_blue'),
            transparent: true,
            depthWrite: false,
            // Renkler **canlı** kalsın (ton eşlemesi parlak sembolleri soldurur).
            toneMapped: false,
            clippingPlanes: this.clipping,
          }),
        );
        face.position.z = 0.1;
        tile.add(face);

        // Eşleşme vurgusu: yumuşak ışıma (renk sembolden gelir).
        const glow = new THREE.Mesh(
          glowPlane,
          new THREE.MeshBasicMaterial({
            map: glowTexture(),
            color: 0xffd166,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            clippingPlanes: this.clipping,
          }),
        );
        glow.position.z = 0.04;
        tile.add(glow);

        const entry = { group: tile, back, face, glow, symbol: 'gem_blue' };
        this.tiles[cellIndex(c, r)] = entry;
        this.group.add(tile);
      }
    }
  }

  _buildParticles() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i += 1) positions[i * 3 + 1] = -999;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.particles = {
      positions,
      colors,
      velocity: new Float32Array(PARTICLE_COUNT * 3),
      life: new Float32Array(PARTICLE_COUNT),
      alive: 0,
      cursor: 0,
      geometry,
      points: new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          size: 0.2,
          map: sparkTexture(),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexColors: true,
          sizeAttenuation: true,
        }),
      ),
    };
    this.particles.points.frustumCulled = false;
    this.particles.points.renderOrder = 8;
    this.scene.add(this.particles.points);
  }

  /** Patlama efektleri için **önceden kurulmuş** havuz (anlık nesne üretimi yok). */
  _buildFx() {
    this.fx = [];
    for (let i = 0; i < FX_POOL; i += 1) {
      const ring = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: ringTexture(),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        }),
      );
      const flash = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        }),
      );
      const star = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: starTexture(),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        }),
      );
      for (const sprite of [ring, flash, star]) {
        sprite.visible = false;
        sprite.renderOrder = 9;
        this.scene.add(sprite);
      }
      this.fx.push({ ring, flash, star, t: -1, color: new THREE.Color() });
    }
    this.fxCursor = 0;
  }

  /** Ölçek/konum: sahne boyutuna göre. */
  layout({ step, x = 0, y = 0 }) {
    this.step = step;
    this.group.position.set(x, y, this.group.position.z);
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const tile = this.tiles[cellIndex(c, r)];
        tile.group.position.set(this._colX(c), this._rowY(r), 0);
        tile.group.scale.setScalar(1);
        tile.group.rotation.set(0, 0, 0);
      }
    }
    // Kesim: tablonun iç kenarı (karoların biraz dışı).
    const half = (ROWS / 2) * step + 0.1;
    this.clipTop.constant = y + half;
    this.clipBottom.constant = -(y - half);
  }

  /** Hücrenin **dünya** konumu (küreler buraya uçar). */
  cellWorld(c, r, target = new THREE.Vector3()) {
    this.group.updateMatrixWorld();
    return target
      .set(this._colX(c), this._rowY(r), 0.3)
      .applyMatrix4(this.group.matrixWorld);
  }

  _rowY(r) {
    return ((ROWS - 1) / 2 - r) * this.step;
  }

  _colX(c) {
    return (c - (COLS - 1) / 2) * this.step;
  }

  // ── Semboller ───────────────────────────────────────────────────────────

  _setSymbol(tile, id) {
    if (tile.symbol === id) return;
    tile.symbol = id;
    // Yalnız doku değişir: `needsUpdate` **gerekmez** (gölgelendirici yeniden
    // derlenmesin; eskiden her düşüşte 30 materyal güncelleniyor, takılıyordu).
    tile.face.material.map = symbolTexture(id);
  }

  _resetTile(tile, c, r) {
    tile.group.position.set(this._colX(c), this._rowY(r), 0);
    tile.group.rotation.set(0, 0, 0);
    tile.group.scale.setScalar(1);
    tile.group.visible = true;
    tile.glow.material.opacity = 0;
    tile.face.material.opacity = 1;
  }

  /** Şu anki tahta (sütun sütun). */
  currentGrid() {
    return this.tiles.map((tile) => tile.symbol);
  }

  show(grid) {
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const tile = this.tiles[cellIndex(c, r)];
        this._setSymbol(tile, grid[cellIndex(c, r)]);
        this._resetTile(tile, c, r);
      }
    }
  }

  /**
   * Çevirince: eski semboller tablonun içinde **aşağı düşer** ve alt kenardan
   * çıkar (sütun sütun, alttan üste). Sunucu cevabı bu sırada gelir.
   */
  async dropOut() {
    this.resetGlow();
    this._dropOutJob = true;
    const jobs = [];
    const fall = this.step * (ROWS + 0.6);
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const tile = this.tiles[cellIndex(c, r)];
        if (!tile.group.visible) continue;
        const fromY = this._rowY(r);
        jobs.push(
          this.tweens.add({
            duration: 0.3,
            delay: c * 0.035 + (ROWS - 1 - r) * 0.02,
            ease: easeIn,
            onUpdate: (k) => {
              tile.group.position.y = fromY - fall * k;
            },
            onDone: () => {
              tile.group.visible = false;
            },
          }),
        );
      }
    }
    await Promise.all(jobs);
    this._dropOutJob = false;
  }

  /** Yeni tahta tablonun **üst kenarından** içeri düşer. */
  async dropIn(grid) {
    const jobs = [];
    const drop = this.step * (ROWS + 0.4);
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const tile = this.tiles[cellIndex(c, r)];
        this._setSymbol(tile, grid[cellIndex(c, r)]);
        this._resetTile(tile, c, r);
        const targetY = this._rowY(r);
        const fromY = targetY + drop;
        tile.group.position.y = fromY;
        jobs.push(
          this.tweens.add({
            duration: 0.42,
            // Sütun sütun, her sütunda **alttaki önce** iner.
            delay: c * 0.06 + (ROWS - 1 - r) * 0.035,
            ease: easeLand,
            onUpdate: (k) => {
              tile.group.position.y = fromY + (targetY - fromY) * k;
            },
            onDone: () => {
              tile.group.position.y = targetY;
            },
          }),
        );
      }
    }
    await Promise.all(jobs);
  }

  // ── Eşleşme vurgusu ─────────────────────────────────────────────────────

  highlight(clusters) {
    for (const cluster of clusters) {
      for (const [c, r] of cluster.cells) {
        const tile = this.tiles[cellIndex(c, r)];
        tile.glow.material.color.set(symbolColor(tile.symbol)).lerp(new THREE.Color(0xffffff), 0.35);
        this.tweens.add({
          duration: 0.26,
          onUpdate: (k) => {
            tile.glow.material.opacity = 0.95 * k;
            tile.group.scale.setScalar(1 + 0.08 * k);
          },
        });
      }
    }
  }

  // ── Patlama ─────────────────────────────────────────────────────────────

  async pop(cells) {
    const jobs = [];
    cells.forEach(([c, r], order) => {
      const tile = this.tiles[cellIndex(c, r)];
      const color = symbolColor(tile.symbol);
      const delay = order * 0.012;
      jobs.push(
        this.tweens.add({
          duration: 0.34,
          delay,
          onUpdate: (k, raw) => {
            // Önce şişer ve parlar, sonra dönerek içine çöker.
            if (raw < 0.35) {
              const a = raw / 0.35;
              tile.group.scale.setScalar(1.08 + 0.2 * a);
              tile.glow.material.opacity = 0.95 + 0.05 * a;
            } else {
              const b = (raw - 0.35) / 0.65;
              const s = (1.28 * (1 - b * b));
              tile.group.scale.setScalar(Math.max(0.001, s));
              tile.group.rotation.z = b * 0.9;
              tile.glow.material.opacity = 1 - b;
            }
          },
          onDone: () => {
            tile.group.visible = false;
            tile.group.scale.setScalar(1);
            tile.group.rotation.z = 0;
          },
        }),
      );
      // Patlama efekti şişmenin tepesinde.
      setTimeout(() => this._burst(c, r, color), (delay + 0.11) * 1000);
    });
    await Promise.all(jobs);
  }

  /**
   * Tumble: patlayanların yerine kalanlar aşağı kayar, yeniler tablonun üst
   * kenarından düşer.
   *
   * @param {Array<[number,number]>} cleared patlayan hücreler [c, r]
   * @param {string[]} nextGrid sunucunun yeni tahtası (sütun sütun)
   */
  async tumble(cleared, nextGrid) {
    const clearedSet = new Set(cleared.map(([c, r]) => cellIndex(c, r)));
    const jobs = [];

    for (let c = 0; c < COLS; c += 1) {
      const survivors = [];
      const popped = [];
      for (let r = 0; r < ROWS; r += 1) {
        const tile = this.tiles[cellIndex(c, r)];
        if (clearedSet.has(cellIndex(c, r))) popped.push(tile);
        else survivors.push(tile);
      }

      // Kalanlar dibe iner (sıra korunur).
      const survivorsCount = survivors.length;
      const fill = ROWS - survivorsCount;
      survivors.forEach((tile, i) => {
        const targetRow = ROWS - survivorsCount + i;
        const targetY = this._rowY(targetRow);
        const fromY = tile.group.position.y;
        if (Math.abs(targetY - fromY) < 0.001) return;
        jobs.push(
          this.tweens.add({
            duration: 0.34,
            delay: c * 0.03,
            ease: easeLand,
            onUpdate: (k) => {
              tile.group.position.y = fromY + (targetY - fromY) * k;
            },
            onDone: () => {
              tile.group.position.y = targetY;
            },
          }),
        );
      });

      // Boşalan üst hücrelere yeniler: tablonun **hemen üstünde** dizilip
      // kenardan içeri kayarlar.
      for (let j = 0; j < fill; j += 1) {
        const tile = popped[j];
        if (!tile) continue;
        const targetY = this._rowY(j);
        const fromY = targetY + this.step * fill + 0.15;
        this._setSymbol(tile, nextGrid[cellIndex(c, j)]);
        tile.group.visible = true;
        tile.group.scale.setScalar(1);
        tile.group.rotation.set(0, 0, 0);
        tile.glow.material.opacity = 0;
        tile.group.position.y = fromY;
        jobs.push(
          this.tweens.add({
            duration: 0.4,
            delay: 0.06 + c * 0.03 + (fill - 1 - j) * 0.03,
            ease: easeLand,
            onUpdate: (k) => {
              tile.group.position.y = fromY + (targetY - fromY) * k;
            },
            onDone: () => {
              tile.group.position.y = targetY;
            },
          }),
        );
      }

      // Yeni dizilim: üstte yeniler, altta hayatta kalanlar (sıra korunur).
      const column = [...popped, ...survivors];
      for (let r = 0; r < ROWS; r += 1) {
        this.tiles[cellIndex(c, r)] = column[r];
        this._setSymbol(column[r], nextGrid[cellIndex(c, r)]);
      }
    }

    await Promise.all(jobs);

    // Son hâli **kesin** uygula: animasyon yuvarlaması kalmasın.
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const tile = this.tiles[cellIndex(c, r)];
        this._setSymbol(tile, nextGrid[cellIndex(c, r)]);
        this._resetTile(tile, c, r);
      }
    }
  }

  /** Patlama: renkli ışık + genişleyen halka + yıldız + kıvılcımlar. */
  _burst(c, r, color) {
    const origin = this.cellWorld(c, r);
    const fx = this.fx[this.fxCursor];
    this.fxCursor = (this.fxCursor + 1) % FX_POOL;
    fx.t = 0;
    fx.color.set(color);
    for (const sprite of [fx.ring, fx.flash, fx.star]) {
      sprite.position.copy(origin);
      sprite.position.z += 0.25;
      sprite.visible = true;
    }
    fx.ring.material.color.copy(fx.color).lerp(new THREE.Color(0xffffff), 0.3);
    fx.flash.material.color.copy(fx.color).lerp(new THREE.Color(0xffffff), 0.55);
    fx.star.material.color.set(0xffffff);
    fx.star.material.rotation = Math.random() * Math.PI;

    const p = this.particles;
    const tint = new THREE.Color(color);
    for (let i = 0; i < 16; i += 1) {
      const index = p.cursor;
      p.cursor = (p.cursor + 1) % PARTICLE_COUNT;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.6 + Math.random() * 2.4;
      p.positions[index * 3] = origin.x;
      p.positions[index * 3 + 1] = origin.y;
      p.positions[index * 3 + 2] = origin.z + 0.2;
      p.velocity[index * 3] = Math.cos(angle) * speed;
      p.velocity[index * 3 + 1] = Math.sin(angle) * speed + 0.8;
      p.velocity[index * 3 + 2] = Math.random() * 1.2;
      p.life[index] = 0.35 + Math.random() * 0.4;
      // Yarısı sembol renginde, yarısı beyaz-altın.
      const white = i % 2 === 0;
      p.colors[index * 3] = white ? 1 : tint.r;
      p.colors[index * 3 + 1] = white ? 0.92 : tint.g;
      p.colors[index * 3 + 2] = white ? 0.7 : tint.b;
    }
    p.alive = PARTICLE_COUNT;
    p.geometry.attributes.color.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this.tweens.update(dt);

    // Patlama efektleri.
    for (const fx of this.fx) {
      if (fx.t < 0) continue;
      fx.t += dt;
      const k = fx.t / 0.5;
      if (k >= 1) {
        fx.t = -1;
        fx.ring.visible = fx.flash.visible = fx.star.visible = false;
        continue;
      }
      const out = easeOutCubic(k);
      fx.ring.scale.setScalar(0.3 + out * 1.9);
      fx.ring.material.opacity = (1 - k) * 0.95;
      fx.flash.scale.setScalar(1.4 + out * 0.8);
      fx.flash.material.opacity = Math.max(0, 1 - k * 2.2) * 0.9;
      fx.star.scale.setScalar(0.4 + Math.sin(Math.min(1, k * 1.6) * Math.PI) * 1.3);
      fx.star.material.opacity = Math.max(0, 1 - k * 1.5);
    }

    // Kıvılcımlar: yalnız canlı parçacık varken güncellenir.
    const p = this.particles;
    if (p.alive > 0) {
      let alive = 0;
      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        if (p.life[i] <= 0) continue;
        p.life[i] -= dt;
        if (p.life[i] <= 0) {
          p.positions[i * 3 + 1] = -999;
          continue;
        }
        alive += 1;
        p.positions[i * 3] += p.velocity[i * 3] * dt;
        p.positions[i * 3 + 1] += p.velocity[i * 3 + 1] * dt;
        p.positions[i * 3 + 2] += p.velocity[i * 3 + 2] * dt;
        p.velocity[i * 3] *= 1 - dt * 1.8;
        p.velocity[i * 3 + 1] -= 6.5 * dt;
      }
      p.alive = alive;
      p.geometry.attributes.position.needsUpdate = true;
    }
  }

  /**
   * Bonus tetiklendiğinde: tahtadaki **Dede** (scatter) sembolleri sırayla
   * yanıp söner (modern "bonus geliyor" kutlaması).
   */
  async celebrateScatters() {
    const indexes = [];
    this.tiles.forEach((tile, index) => {
      if (SYMBOL_BY_ID.get(tile.symbol)?.scatter) indexes.push(index);
    });
    if (!indexes.length) return;

    const jobs = indexes.map((index, order) => {
      const tile = this.tiles[index];
      tile.glow.material.color.set(0x9fd8ff);
      return this.tweens.add({
        duration: 1.15,
        delay: order * 0.13,
        onUpdate: (k) => {
          const pulse = Math.abs(Math.sin(k * Math.PI * 3));
          tile.glow.material.opacity = 0.35 + pulse * 0.65;
          tile.group.scale.setScalar(1 + pulse * 0.14);
          tile.group.rotation.z = Math.sin(k * Math.PI * 6) * 0.07;
        },
        onDone: () => {
          tile.group.scale.setScalar(1);
          tile.group.rotation.z = 0;
          tile.glow.material.opacity = 0.9;
        },
      });
    });

    await Promise.all(jobs);

    // Hepsi bir arada sönsün.
    await this.tweens.add({
      duration: 0.35,
      onUpdate: (k) => {
        for (const index of indexes) {
          this.tiles[index].glow.material.opacity = 0.9 * (1 - k);
        }
      },
      onDone: () => this.resetGlow(),
    });
  }

  resetGlow() {
    for (const tile of this.tiles) tile.glow.material.opacity = 0;
  }
}
