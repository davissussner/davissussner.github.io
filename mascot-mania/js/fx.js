import * as THREE from 'three';

const sphereGeo = new THREE.SphereGeometry(1, 6, 4);
const ringGeo = new THREE.RingGeometry(0.86, 1, 48);
const discGeo = new THREE.CircleGeometry(1, 32);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  burst(pos, color, count = 10, speed = 5, size = 0.12, life = 0.5, gravity = 9) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(pos);
      m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5)
        .normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      this.scene.add(m);
      this.items.push({ kind: 'particle', m, v, life, max: life, gravity });
    }
  }

  // Flat ring on the ground that expands to `radius`.
  ring(pos, radius, color, life = 0.45, opacity = 0.9) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.08, pos.z);
    m.scale.setScalar(0.2);
    this.scene.add(m);
    this.items.push({ kind: 'ring', m, radius, life, max: life, opacity });
  }

  // Ground marker that stays until removed. Used for dive targets, gopher tunnels, etc.
  marker(radius, color, opacity = 0.45) {
    const m = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.06;
    m.scale.setScalar(radius);
    this.scene.add(m);
    return {
      mesh: m,
      set(x, z) { m.position.x = x; m.position.z = z; },
      remove: () => { this.scene.remove(m); m.material.dispose(); },
    };
  }

  // Fading copy of a position, used for dash afterimages.
  ghost(pos, color, scale = 0.9, life = 0.35) {
    const m = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }));
    m.position.set(pos.x, 1.3, pos.z);
    m.scale.set(scale * 0.7, scale * 1.4, scale * 0.7);
    this.scene.add(m);
    this.items.push({ kind: 'ghost', m, life, max: life });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      if (it.kind === 'particle') {
        it.v.y -= it.gravity * dt;
        it.m.position.addScaledVector(it.v, dt);
        if (it.m.position.y < 0.05) { it.m.position.y = 0.05; it.v.multiplyScalar(0.5); }
        it.m.material.opacity = k;
      } else if (it.kind === 'ring') {
        it.m.scale.setScalar(0.2 + (1 - k) * (it.radius - 0.2));
        it.m.material.opacity = it.opacity * k;
      } else if (it.kind === 'ghost') {
        it.m.material.opacity = 0.45 * k;
      }
      if (it.life <= 0) {
        this.scene.remove(it.m);
        it.m.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const it of this.items) {
      this.scene.remove(it.m);
      it.m.material.dispose();
    }
    this.items.length = 0;
  }
}
