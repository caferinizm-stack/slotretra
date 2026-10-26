// ─── Zeus (Şanslı Dede) ─────────────────────────────────────────────────────
//
// Tahtanın arkasında duran tanrı: **resmedilmiş portre** (textures.js ▸
// `zeusPortraitTexture`) düz bir sahne kaplaması (billboard) olarak durur.
//
// **Eller**: iki ayrı el/kol kaplaması tahtanın **üst kenarını kavrar** — avuçlar
// çerçevenin üstünde, parmaklar kenardan aşağı sarkar. Rölantide nefes alırlar;
// çarpan küresi fırlatırken **sağ el** kalkar, avucunda ışık patlar ve küreler
// o noktadan tahtaya uçar.
//
// `cast()` bir **zaman çizelgesi** başlatır; `onCast` tam fırlatma anında
// avucun dünya konumuyla çağrılır.

import * as THREE from 'three';
import { glowTexture, zeusHandTexture, zeusPortraitTexture } from './textures.js';
import { clamp, easeOutCubic } from '../core/utils.js';

/** Portre kaplamasının dünya ölçüsü (yükseklik birimi). */
export const ZEUS_WIDTH = 4.6;
export const ZEUS_HEIGHT = 5.75;

/** Tek el kaplamasının dünya ölçüsü. */
const HAND_W = 1.78;
const HAND_H = 1.19;

export class Zeus {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'zeus';

    // **Portre**: kenarları yumuşak (alphaTest) kaplama.
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(ZEUS_WIDTH, ZEUS_HEIGHT),
      new THREE.MeshBasicMaterial({
        map: zeusPortraitTexture(),
        transparent: true,
        alphaTest: 0.02,
        depthWrite: true,
        toneMapped: false,
      }),
    );
    this.group.add(this.plane);

    // Arkadaki ışıma (portreyi tahtadan ayırır).
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0x9b6bff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.halo.scale.set(8.2, 8.6, 1);
    this.halo.position.set(0, 0.5, -0.35);
    this.group.add(this.halo);

    // ── Eller (dünya uzayında: sahneye doğrudan eklenir) ────────────────────
    this.hands = new THREE.Group();
    this.hands.name = 'zeus-hands';

    const handMaterial = new THREE.MeshBasicMaterial({
      map: zeusHandTexture(),
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      toneMapped: false,
    });

    this.handRight = new THREE.Group();
    const rightMesh = new THREE.Mesh(new THREE.PlaneGeometry(HAND_W, HAND_H), handMaterial);
    rightMesh.renderOrder = 6;
    this.handRight.add(rightMesh);

    this.handLeft = new THREE.Group();
    const leftMesh = new THREE.Mesh(new THREE.PlaneGeometry(HAND_W, HAND_H), handMaterial);
    leftMesh.scale.x = -1; // aynalanmış kopya: başparmak tahtanın ortasına bakar
    leftMesh.renderOrder = 6;
    this.handLeft.add(leftMesh);
    // Kollar omuzdan kenara doğru açılır (dik „masa ayağı“ görünmez).
    this.handLeft.rotation.z = -0.18;
    this.handTilt = 0.18;

    this.hands.add(this.handLeft, this.handRight);

    // Avuçtaki ışık (fırlatma anında parlar).
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0xffe6a8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flash.scale.set(1.6, 1.6, 1);
    this.flash.position.set(0, -0.34, 0.16);
    this.flash.renderOrder = 7;
    this.handRight.add(this.flash);

    // Kürelerin çıkış noktası (sağ avuç).
    this.anchor = new THREE.Object3D();
    this.anchor.position.set(0, -0.36, 0.24);
    this.handRight.add(this.anchor);

    this.time = 0;
    this.baseY = 0;
    this.handBaseY = 3.45;
    this.handX = 2.35;
    this.casting = 0;
    this.castDuration = 1.0;
    this.onCast = null;
    this._castFired = false;
    this._handWorld = new THREE.Vector3();
  }

  /**
   * Elleri tahtanın üst kenarına yerleştirir.
   * @param {{topY:number, x:number, z:number, centerY?:number}} options
   */
  placeHands({ topY = 2.95, x = 1.95, z = 0.62, centerY } = {}) {
    this.hands.position.z = z;
    this.handX = x;
    // Avuç çerçevenin üst kenarında, parmaklar kenardan içeri sarkar.
    this.handBaseY = centerY ?? topY + HAND_H / 2 - 0.32;
    this.handLeft.position.set(-x, this.handBaseY, 0);
    this.handRight.position.set(x, this.handBaseY, 0);
  }

  /** Avucun dünya konumu (küreler buradan fırlar). */
  handWorld() {
    this.anchor.getWorldPosition(this._handWorld);
    return this._handWorld;
  }

  /**
   * Yıldırım/ışık topu fırlatma animasyonu.
   * @param {number} count kaç küre fırlatılacak (süreyi hafifçe uzatır)
   * @param {function} onCast fırlatma anında çağrılır (dünya konumu verir)
   */
  cast(count = 1, onCast = null) {
    this.casting = 0.0001;
    this._castFired = false;
    this.onCast = onCast;
    this._castCount = Math.max(1, count);
  }

  update(dt) {
    this.time += dt;
    const t = this.time;

    // **Rölanti**: nefes + çok hafif salınım (abartısız).
    const breath = Math.sin(t * 1.5);
    this.plane.scale.set(1 + breath * 0.006, 1 + breath * 0.012, 1);
    this.group.rotation.z = Math.sin(t * 0.8) * 0.006;
    this.halo.material.opacity = 0.42 + Math.sin(t * 1.9) * 0.08;

    let lift = 0;
    let glow = 0;
    let lean = 0;

    if (this.casting) {
      this.casting += dt / this.castDuration;
      const p = clamp(this.casting, 0, 1);

      // 0 → 0.42 el kalkar, 0.42 → 0.62 fırlatma, sonra toparlanma.
      lift =
        p < 0.42
          ? easeOutCubic(p / 0.42)
          : 1 - easeOutCubic(clamp((p - 0.55) / 0.45, 0, 1));
      glow = p < 0.42 ? Math.sin((p / 0.42) * Math.PI * 0.5) : Math.max(0, 1 - (p - 0.42) / 0.3);
      lean = lift;

      if (!this._castFired && p >= 0.4) {
        this._castFired = true;
        this.onCast?.(this.handWorld().clone());
      }

      if (p >= 1) {
        this.casting = 0;
        this.onCast = null;
      }
    }

    // Ellerin duruşu: nefesle hafifçe oynar, fırlatırken sağ el kalkar.
    const bob = breath * 0.012;
    this.handLeft.position.y = this.handBaseY + bob;
    this.handRight.position.y = this.handBaseY + bob + lift * 0.42;
    this.handRight.position.z = lift * 0.2;
    this.handRight.rotation.z = this.handTilt - lift * 0.14;

    this.flash.material.opacity = glow * 0.95;
    this.flash.scale.setScalar(1.6 + glow * 1.5 + Math.sin(t * 6) * 0.05 * glow);

    // Portre: fırlatırken öne eğilir.
    this.plane.rotation.x = -lean * 0.06;
    this.plane.position.y = -lean * 0.12 + (this.casting ? 0 : breath * 0.02);
    this.halo.material.opacity = 0.42 + lean * 0.45;
  }
}
