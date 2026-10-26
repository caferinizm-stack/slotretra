// ─── 3D ızgara (6 sütun × 5 satır) ──────────────────────────────────────────
//
// Her hücre bir "karo": arkada koyu taş blok, önde sembol yüzeyi, arkada
// vurgu ışıması. Semboller sunucudan hazır gelir; burada yalnız **oynatılır**:
//   * `dropIn`  → yukarıdan yerçekimiyle düşme,
//   * `pop`     → eşleşenlerin patlaması + parçacıklar,
//   * `tumble`  → kalanların aşağı kayması, yenilerin üstten düşmesi.

import * as THREE from 'three';
import { GRID, SYMBOL_BY_ID } from '../config.js';
import { Tweens } from '../core/tween.js';
import { easeOutBack, easeOutCubic } from '../core/utils.js';
import {
  glowTexture,
  sparkTexture,
  stoneTexture,
  symbolTexture,
} from './textures.js';

const ROWS = GRID.rows;
const COLS = GRID.cols;

const cellIndex = (c, r) => c * ROWS + r;

const PARTICLE_COUNT = 420;

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

    this._buildTiles();
    this._buildParticles();

    this.layout({ step: 1, x: 0, y: 0 });
  }

  // ── Kurulum ─────────────────────────────────────────────────────────────

  _buildTiles() {
    // Karonun zemini: mor mermer plaka (textures.js ▸ `stoneTexture`).
    const stone = new THREE.MeshStandardMaterial({
      map: stoneTexture(),
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0.26,
      emissive: new THREE.Color(0x2b1d55),
      emissiveIntensity: 0.18,
    });

    const box = new THREE.BoxGeometry(0.94, 0.94, 0.2);
    const plane = new THREE.PlaneGeometry(0.84, 0.84);
    const glowPlane = new THREE.PlaneGeometry(1.02, 1.02);

    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const tile = new THREE.Group();

        const back = new THREE.Mesh(box, stone.clone());
        back.position.z = -0.04;
        tile.add(back);

        const face = new THREE.Mesh(
          plane,
          new THREE.MeshBasicMaterial({
            map: symbolTexture('gem_blue'),
            transparent: true,
            depthWrite: false,
            // Renkler **canlı** kalsın: ACES ton eşlemesi parlak sembolleri
            // solduruyordu (mücevherler beyaza kaçıyordu).
            toneMapped: false,
          }),
        );
        face.position.z = 0.09;
        tile.add(face);

        // Eşleşme vurgusu: **yumuşak** altın ışıma (düz kare değil).
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
          }),
        );
        glow.position.z = 0.02;
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
      cursor: 0,
      geometry,
      points: new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          size: 0.26,
          map: sparkTexture(),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexColors: true,
          sizeAttenuation: true,
        }),
      ),
    };
    this.scene.add(this.particles.points);
  }

  /** Ölçek/konum: sahne boyutuna göre. */
  layout({ step, x = 0, y = 0 }) {
    this.step = step;
    this.group.position.set(x, y, 0);
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const tile = this.tiles[cellIndex(c, r)];
        tile.group.position.set(
          (c - (COLS - 1) / 2) * step,
          ((ROWS - 1) / 2 - r) * step,
          0,
        );
        tile.group.scale.setScalar(1);
        tile.group.rotation.set(0, 0, 0);
      }
    }
  }

  /** Hücrenin **dünya** konumu (küreler buraya uçar). */
  cellWorld(c, r, target = new THREE.Vector3()) {
    const tile = this.tiles[cellIndex(c, r)];
    return tile.group.getWorldPosition(target).add(new THREE.Vector3(0, 0, 0.3));
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
    tile.face.material.map = symbolTexture(id);
    tile.face.material.needsUpdate = true;
    // Sembolün rengine göre taş hafif kızarsın (derinlik hissi).
    const tint = new THREE.Color(0xffd98a);
    tile.back.material.emissive.copy(tint).multiplyScalar(0.06);
  }

  show(grid) {
    for (let i = 0; i < grid.length; i += 1) this._setSymbol(this.tiles[i], grid[i]);
    for (const tile of this.tiles) {
      tile.group.visible = true;
      tile.group.scale.setScalar(1);
      tile.group.rotation.set(0, 0, 0);
      tile.glow.material.opacity = 0;
    }
  }

  /** Yukarıdan düşerek giriş (ilk spin). */
  async dropIn(grid) {
    this.show(grid);
    const jobs = [];
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const tile = this.tiles[cellIndex(c, r)];
        const targetY = this._rowY(r);
        const fromY = targetY + this.step * (6 + r * 0.4);
        tile.group.position.y = fromY;
        tile.group.rotation.x = -0.8;
        tile.group.scale.setScalar(0.86);
        jobs.push(
          this.tweens.add({
            duration: 0.44,
            delay: c * 0.055 + r * 0.012,
            ease: easeOutBack,
            onUpdate: (k) => {
              tile.group.position.y = fromY + (targetY - fromY) * k;
              tile.group.rotation.x = -0.8 * (1 - k);
              tile.group.scale.setScalar(0.86 + 0.14 * k);
            },
            onDone: () => {
              tile.group.position.y = targetY;
              tile.group.rotation.x = 0;
              tile.group.scale.setScalar(1);
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
        this.tweens.add({
          duration: 0.22,
          onUpdate: (k) => {
            tile.glow.material.opacity = 0.85 * k;
            tile.group.scale.setScalar(1 + 0.06 * k);
          },
        });
      }
    }
  }

  // ── Patlama ─────────────────────────────────────────────────────────────

  async pop(cells) {
    const jobs = [];
    for (const [c, r] of cells) {
      const tile = this.tiles[cellIndex(c, r)];
      this._burst(c, r);
      jobs.push(
        this.tweens.add({
          duration: 0.26,
          onUpdate: (k) => {
            const s = 1 - k;
            tile.group.scale.setScalar(Math.max(0.001, s));
            tile.glow.material.opacity = 0.9 * s;
          },
          onDone: () => {
            tile.group.visible = false;
            tile.group.scale.setScalar(1);
          },
        }),
      );
    }
    await Promise.all(jobs);
  }

  /**
   * Tumble: patlayanların yerine kalanlar aşağı kayar, üstten yeniler düşer.
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
      survivors.forEach((tile, i) => {
        const targetRow = ROWS - survivorsCount + i;
        const targetY = this._rowY(targetRow);
        const fromY = tile.group.position.y;
        jobs.push(
          this.tweens.add({
            duration: 0.34,
            delay: 0.02 * i,
            onUpdate: (k) => {
              tile.group.position.y = fromY + (targetY - fromY) * k;
            },
            onDone: () => {
              tile.group.position.y = targetY;
              tile.group.rotation.z = 0;
            },
          }),
        );
      });

      // Boşalan üst hücrelere yeni semboller.
      const fill = ROWS - survivorsCount;
      for (let j = 0; j < fill; j += 1) {
        const tile = popped[j];
        if (!tile) continue;
        const targetY = this._rowY(j);
        const fromY = targetY + this.step * (4.4 + j * 0.35);
        this._setSymbol(tile, nextGrid[cellIndex(c, j)]);
        tile.group.visible = true;
        tile.group.position.y = fromY;
        tile.group.rotation.x = -0.7;
        jobs.push(
          this.tweens.add({
            duration: 0.42,
            delay: 0.05 + j * 0.03,
            ease: easeOutCubic,
            onUpdate: (k) => {
              tile.group.position.y = fromY + (targetY - fromY) * k;
              tile.group.rotation.x = -0.7 * (1 - k);
            },
            onDone: () => {
              tile.group.position.y = targetY;
              tile.group.rotation.x = 0;
            },
          }),
        );
      }

      // Yeni dizilim: üstte yeniler, altta hayatta kalanlar (sıra korunur).
      const column = [...popped, ...survivors];
      for (let r = 0; r < ROWS; r += 1) {
        this.tiles[cellIndex(c, r)] = column[r];
        column[r].symbol = nextGrid[cellIndex(c, r)];
        column[r].face.material.map = symbolTexture(nextGrid[cellIndex(c, r)]);
        column[r].face.material.needsUpdate = true;
      }
    }

    await Promise.all(jobs);

    // Son hâli **kesin** uygula: animasyon yuvarlaması kalmasın.
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const tile = this.tiles[cellIndex(c, r)];
        tile.group.position.set(this._colX(c), this._rowY(r), 0);
        tile.group.rotation.set(0, 0, 0);
        tile.group.scale.setScalar(1);
        tile.group.visible = true;
        tile.glow.material.opacity = 0;
        this._setSymbol(tile, nextGrid[cellIndex(c, r)]);
      }
    }
  }

  /** Eşleşen hücrelerde kıvılcım patlaması. */
  _burst(c, r) {
    const p = this.particles;
    const origin = this.cellWorld(c, r);
    for (let i = 0; i < 14; i += 1) {
      const index = p.cursor;
      p.cursor = (p.cursor + 1) % PARTICLE_COUNT;
      p.positions[index * 3] = origin.x + (Math.random() - 0.5) * 0.4;
      p.positions[index * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.4;
      p.positions[index * 3 + 2] = origin.z + 0.1;
      const spread = 2.6;
      p.velocity[index * 3] = (Math.random() - 0.5) * spread;
      p.velocity[index * 3 + 1] = (Math.random() - 0.5) * spread + 0.6;
      p.velocity[index * 3 + 2] = (Math.random() - 0.5) * spread * 0.5;
      p.life[index] = 0.45 + Math.random() * 0.35;
      const warm = 0.7 + Math.random() * 0.3;
      p.colors[index * 3] = 1;
      p.colors[index * 3 + 1] = 0.82 * warm;
      p.colors[index * 3 + 2] = 0.36 * warm;
    }
    p.geometry.attributes.position.needsUpdate = true;
    p.geometry.attributes.color.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this.tweens.update(dt);

    const p = this.particles;
    let dirty = false;
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      if (p.life[i] <= 0) continue;
      p.life[i] -= dt;
      dirty = true;
      if (p.life[i] <= 0) {
        p.positions[i * 3 + 1] = -999;
        continue;
      }
      p.positions[i * 3] += p.velocity[i * 3] * dt;
      p.positions[i * 3 + 1] += p.velocity[i * 3 + 1] * dt;
      p.positions[i * 3 + 2] += p.velocity[i * 3 + 2] * dt;
      p.velocity[i * 3 + 1] -= 5.2 * dt;
    }
    if (dirty) p.geometry.attributes.position.needsUpdate = true;

    // Boştaki karolar hafifçe nefes alsın (canlı görünüm, CPU ucuz).
    for (const tile of this.tiles) {
      if (!tile.group.visible) continue;
      const wobble = Math.sin(this.time * 1.4 + tile.group.position.x) * 0.004;
      tile.group.rotation.z = wobble;
    }
  }

  /**
   * Bonus tetiklendiğinde: tahtadaki **Zeus** sembolleri sırayla yanıp söner
   * (modern "bonus geliyor" kutlaması).
   */
  async celebrateScatters() {
    const indexes = [];
    this.tiles.forEach((tile, index) => {
      if (SYMBOL_BY_ID.get(tile.symbol)?.scatter) indexes.push(index);
    });
    if (!indexes.length) return;

    const jobs = indexes.map((index, order) => {
      const tile = this.tiles[index];
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
