// ─── Çarpanlar (hücre içinde sayı) ─────────────────────────────────────────
//
// Dede'nin elinden çıkıp tahtadaki bir hücrenin **içine** konan `x2` … `x500`
// yazıları. Küre/madalyon yok: karenin içinde modern bir sayı durur.
//
// Sunucu hangi değerin hangi hücreye geleceğini söyler; burada yalnız **uçuş**,
// **bekleme** ve **bakiyeye toplanma** animasyonu oynar. Sayı kameraya bakar,
// derinlik testi kapalıdır (hiçbir sembol onu kapatmaz).

import * as THREE from 'three';
import { glowTexture, multiplierTexture, ringTexture } from './textures.js';
import { easeInOutQuad, easeOutCubic } from '../core/utils.js';
import { Tweens } from '../core/tween.js';

/** Çarpan kademesinin rengi (iz ve halka). */
const tierColor = (value) =>
  value >= 500 ? 0xff5cf0 : value >= 50 ? 0xff6a3d : value >= 10 ? 0xc06bff : 0x3de0ff;

const TRAIL = 8;

export class Orbs {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'orbs';
    scene.add(this.group);
    this.tweens = new Tweens();
    this.items = [];
    this.time = 0;
    /** Küre hücreye konduğunda çağrılır (ses efekti için). */
    this.onLand = null;
  }

  /**
   * Elden hedefe çarpan sayısı fırlatır.
   *
   * @param {number} value  çarpan (2 … 500)
   * @param {THREE.Vector3} from  çıkış noktası (Dede'nin avucu)
   * @param {THREE.Vector3} to    hedef (hücrenin önü)
   * @param {number} delay        sıra gecikmesi (sn)
   */
  async fly(value, from, to, delay = 0) {
    const orb = this._build(value);
    orb.group.position.copy(from);
    orb.group.scale.setScalar(0.001);
    this.group.add(orb.group);
    this.items.push(orb);

    const mid = from.clone().lerp(to, 0.5);
    mid.y += 2.6;
    mid.z += 1.4;

    // Uçuş: bezier yayı + büyüme + dönüş; arkasında renkli ışık izi.
    orb.flying = true;
    await this.tweens.add({
      duration: 0.62,
      delay,
      ease: easeInOutQuad,
      onUpdate: (k) => {
        const inv = 1 - k;
        orb.group.position.set(
          inv * inv * from.x + 2 * inv * k * mid.x + k * k * to.x,
          inv * inv * from.y + 2 * inv * k * mid.y + k * k * to.y,
          inv * inv * from.z + 2 * inv * k * mid.z + k * k * to.z,
        );
        orb.group.scale.setScalar(0.001 + 0.999 * easeOutCubic(k));
        orb.group.rotation.z = (1 - k) * -0.6;
      },
      onDone: () => {
        orb.group.position.copy(to);
        orb.group.scale.setScalar(1);
        orb.group.rotation.z = 0;
        orb.settled = true;
        orb.flying = false;
        orb.baseZ = to.z;
        this.onLand?.();
        // İnişte: genişleyen renkli halka + ışık + sayının "yumruk" büyümesi.
        orb.ring.position.copy(to);
        orb.ring.position.z += 0.3;
        orb.ring.visible = true;
        this.tweens.add({
          duration: 0.5,
          onUpdate: (k) => {
            orb.ring.scale.setScalar(0.4 + k * 2.4);
            orb.ring.material.opacity = 1 - k;
          },
          onDone: () => {
            orb.ring.visible = false;
          },
        });
        this.tweens.add({
          duration: 0.46,
          ease: (t) => t,
          onUpdate: (k) => {
            // 1.7 → 1 arası yaylı sönüm.
            const s = 1 + 0.7 * Math.exp(-6 * k) * Math.cos(k * 14);
            orb.group.scale.setScalar(s);
            orb.glow.material.opacity = 0.5 + 0.5 * (1 - k);
          },
          onDone: () => {
            orb.group.scale.setScalar(1);
            orb.glow.material.opacity = 0.5;
          },
        });
        for (const ghost of orb.trail) ghost.visible = false;
      },
    });

    return orb;
  }

  _build(value) {
    const group = new THREE.Group();

    // Hücre içindeki sayı.
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.92),
      new THREE.MeshBasicMaterial({
        map: multiplierTexture(value),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    );
    quad.position.z = 0.16;
    quad.renderOrder = 20;
    group.add(quad);

    // Arkada hafif altın parıltı (sayı "ışıldasın", sembolü boğmasın).
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0xffc857,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    glow.scale.set(1.05, 1.05, 1);
    glow.renderOrder = 19;
    glow.material.color.set(tierColor(value)).lerp(new THREE.Color(0xffc857), 0.35);
    group.add(glow);

    // Uçuş izi (dünya uzayında, kürenin arkasında).
    const trail = [];
    for (let i = 0; i < TRAIL; i += 1) {
      const ghost = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: tierColor(value),
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        }),
      );
      ghost.renderOrder = 18;
      ghost.visible = false;
      this.group.add(ghost);
      trail.push(ghost);
    }
    const ring = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ringTexture(),
        color: tierColor(value),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    );
    ring.renderOrder = 21;
    ring.visible = false;
    this.group.add(ring);

    return {
      trail,
      ring,
      history: [],
      flying: false,
      group,
      quad,
      glow,
      value,
      settled: false,
      collecting: false,
      baseZ: 0.45,
      phase: Math.random() * 6.28,
    };
  }

  /**
   * Çarpanları **bakiyeye / bonus havuzuna** uçurur: küçülüp kaybolurlar.
   *
   * @param {THREE.Vector3} target hedefin dünya karşılığı
   * @param {Array} [items] yalnız bu çarpanlar (boşsa hepsi)
   */
  async collect(target, items = null) {
    const list = (items ?? this.items).filter((orb) => orb && orb.group.parent);
    if (!list.length) return;

    const jobs = list.map((orb, index) => {
      orb.collecting = true;
      orb.history.length = 0;
      const from = orb.group.position.clone();
      const arc = 0.9 + Math.random() * 0.5;
      return this.tweens.add({
        duration: 0.5,
        delay: index * 0.05,
        ease: easeInOutQuad,
        onUpdate: (k) => {
          orb.group.position.set(
            from.x + (target.x - from.x) * k,
            from.y + (target.y - from.y) * k + Math.sin(k * Math.PI) * arc,
            from.z + (target.z - from.z) * k,
          );
          const s = 1 - easeOutCubic(k) * 0.8;
          orb.group.scale.setScalar(Math.max(0.02, s));
          orb.glow.material.opacity = 0.5 * (1 - k);
          orb.quad.material.opacity = 1 - k * 0.9;
        },
        onDone: () => this._dispose(orb),
      });
    });
    await Promise.all(jobs);
  }

  _dispose(orb) {
    for (const ghost of orb.trail) {
      ghost.removeFromParent();
      ghost.material.dispose();
    }
    orb.ring.removeFromParent();
    orb.ring.material.dispose();
    orb.group.removeFromParent();
    orb.quad.geometry.dispose();
    orb.quad.material.dispose();
    orb.glow.material.dispose();
    this.items = this.items.filter((item) => item !== orb);
  }

  /** Uygulandıktan sonra kalanları söndürür. */
  async fadeOut() {
    const items = this.items.slice();
    if (!items.length) return;
    const jobs = items.map((orb) => {
      orb.collecting = true;
      orb.history.length = 0;
      return this.tweens.add({
        duration: 0.3,
        onUpdate: (k) => {
          orb.group.scale.setScalar(1 - k);
          orb.glow.material.opacity = 0.5 * (1 - k);
          orb.quad.material.opacity = 1 - k;
        },
        onDone: () => this._dispose(orb),
      });
    });
    await Promise.all(jobs);
  }

  /** Anında temizlik (yeni tur / bonus girişinde). */
  clear() {
    for (const orb of this.items.slice()) this._dispose(orb);
    this.items = [];
  }

  update(dt) {
    this.time += dt;
    this.tweens.update(dt);
    for (const orb of this.items) {
      // Uçarken / toplanırken iz: son konumlar, giderek küçülen ışıklar.
      if (orb.flying || orb.collecting) {
        orb.history.unshift(orb.group.position.clone());
        if (orb.history.length > TRAIL * 2) orb.history.length = TRAIL * 2;
        orb.trail.forEach((ghost, i) => {
          const point = orb.history[i * 2 + 1];
          if (!point) {
            ghost.visible = false;
            return;
          }
          ghost.visible = true;
          ghost.position.copy(point);
          const fade = 1 - i / TRAIL;
          ghost.scale.setScalar(0.75 * fade * Math.max(0.2, orb.group.scale.x));
          ghost.material.opacity = 0.7 * fade;
        });
      }
      if (!orb.settled || orb.collecting) continue;
      const t = this.time;
      // Hafif nefes: sayı okunur kalır, arkadaki ışıma nabız atar.
      orb.glow.scale.setScalar(1.05 + Math.sin(t * 3 + orb.phase) * 0.07);
      orb.group.position.z = (orb.baseZ ?? 0.45) + Math.sin(t * 2.2 + orb.phase) * 0.015;
      const pulse = 1 + Math.sin(t * 4 + orb.phase) * 0.04;
      orb.quad.scale.set(pulse, pulse, 1);
    }
  }
}
