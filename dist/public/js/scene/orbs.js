// ─── Çarpanlar (hücre içinde sayı) ─────────────────────────────────────────
//
// Dede'nin elinden çıkıp tahtadaki bir hücrenin **içine** konan `x2` … `x500`
// yazıları. Küre/madalyon yok: karenin içinde modern bir sayı durur.
//
// Sunucu hangi değerin hangi hücreye geleceğini söyler; burada yalnız **uçuş**,
// **bekleme** ve **bakiyeye toplanma** animasyonu oynar. Sayı kameraya bakar,
// derinlik testi kapalıdır (hiçbir sembol onu kapatmaz).

import * as THREE from 'three';
import { glowTexture, multiplierTexture } from './textures.js';
import { easeInOutQuad, easeOutCubic } from '../core/utils.js';
import { Tweens } from '../core/tween.js';

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

    // Uçuş: bezier yayı + büyüme + hafif dönüş.
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
        orb.baseZ = to.z;
        this.onLand?.();
        // Konduğunda kısa bir "pop".
        this.tweens.add({
          duration: 0.26,
          ease: (t) => 1 - (1 - t) ** 2,
          onUpdate: (k) => {
            const s = 1 + Math.sin(k * Math.PI) * 0.18;
            orb.group.scale.setScalar(s);
          },
          onDone: () => orb.group.scale.setScalar(1),
        });
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
    group.add(glow);

    return {
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
