import * as THREE from 'three';
import { mat } from './models.js';

const tmp = new THREE.Vector3();

// Is `target` within `range` of `from` and inside an arc of `arcDeg` around `facing` (radians, model yaw)?
export function inCone(from, facing, target, range, arcDeg = 140) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d < 0.4) return true;
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  const cos = (dx * fx + dz * fz) / d;
  return cos >= Math.cos((arcDeg / 2) * (Math.PI / 180));
}

export function yawTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function flatDist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  // opts: mesh, pos, vel, radius, damage, owner ('enemy'|'player'), parryable, gravity, life,
  //       explode {radius, damage}, rolling, source (enemy), color (spark color)
  spawn(opts) {
    const p = {
      radius: 0.3, damage: 8, owner: 'enemy', parryable: true, gravity: 0, life: 4,
      explode: null, rolling: false, color: 0xffffff, spin: 8, ...opts,
    };
    p.pos = opts.pos.clone();
    p.vel = opts.vel.clone();
    if (!p.mesh) p.mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 12, 8), mat(p.color));
    p.mesh.castShadow = true;
    p.mesh.position.copy(p.pos);
    this.scene.add(p.mesh);
    this.list.push(p);
    return p;
  }

  remove(p) {
    this.scene.remove(p.mesh);
    p.dead = true;
  }

  reflect(p, g) {
    const target = p.source && p.source.alive ? p.source : g.enemies.find((e) => e.alive);
    const speed = Math.max(16, p.vel.length() * 1.3);
    if (target) {
      tmp.set(target.pos.x, p.rolling ? p.pos.y : target.pos.y + 1.1, target.pos.z).sub(p.pos).normalize();
    } else {
      tmp.copy(p.vel).multiplyScalar(-1).normalize();
    }
    p.vel.copy(tmp).multiplyScalar(speed);
    p.gravity = 0;
    p.owner = 'player';
    p.life = 3;
  }

  explode(p, g, skipPlayer = false) {
    const e = p.explode;
    g.fx.burst(p.pos, 0xff8a1f, 22, 7, 0.18, 0.6);
    g.fx.burst(p.pos, 0x333333, 10, 4, 0.25, 0.8, 2);
    g.fx.ring(p.pos, e.radius, 0xffa040, 0.4);
    g.audio.boom();
    g.shake(0.35);
    if (p.owner === 'enemy') {
      if (!skipPlayer && flatDist(p.pos, g.player.pos) < e.radius) {
        g.hitPlayer({ damage: e.damage, parryable: false, from: p.pos, knockback: 9, source: p.source, projectile: true });
      }
    } else {
      for (const en of g.enemies) {
        if (en.alive && !en.hidden && flatDist(p.pos, en.pos) < e.radius + en.radius) {
          g.hitEnemy(en, { damage: e.damage * 1.5, from: p.pos, knockback: 6 });
        }
      }
    }
    this.remove(p);
  }

  finish(p, g, skipPlayer = false) {
    if (p.explode) this.explode(p, g, skipPlayer);
    else {
      g.fx.burst(p.pos, p.color, 6, 3, 0.08, 0.3);
      this.remove(p);
    }
  }

  update(dt, g) {
    for (const p of this.list) {
      if (p.dead) continue;
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.rolling) {
        p.pos.y = p.radius;
        p.mesh.rotation.x += (p.vel.length() / p.radius) * dt * 0.5;
      } else {
        p.mesh.rotation.x += p.spin * dt;
        if (p.orient) p.mesh.lookAt(tmp.copy(p.pos).add(p.vel));
      }
      p.mesh.position.copy(p.pos);

      if (p.life <= 0 || (!p.rolling && p.pos.y < 0.05) || g.world.pointBlocked(p.pos)) {
        this.finish(p, g);
        continue;
      }
      if (g.arena && flatDist(p.pos, g.arena) > g.arenaRadius + 2) {
        this.remove(p);
        continue;
      }

      if (p.owner === 'enemy') {
        const pl = g.player;
        if (p.passed || pl.dead) continue;
        tmp.set(pl.pos.x, 1.1, pl.pos.z);
        if (tmp.distanceTo(p.pos) < p.radius + 0.6) {
          const res = g.hitPlayer({
            damage: p.explode ? p.explode.damage : p.damage,
            parryable: p.parryable, from: p.pos, source: p.source, projectile: true, knockback: 3,
          });
          if (res === 'parried') this.reflect(p, g);
          else if (res === 'dodged') p.passed = true;
          else this.finish(p, g, true);
        }
      } else {
        for (const e of g.enemies) {
          if (!e.alive || e.hidden) continue;
          tmp.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
          if (tmp.distanceTo(p.pos) < p.radius + e.radius + 0.3) {
            if (p.explode) this.explode(p, g);
            else {
              g.hitEnemy(e, { damage: p.damage * 1.5, from: p.pos, knockback: 4 });
              this.finish(p, g);
            }
            break;
          }
        }
      }
    }
    this.list = this.list.filter((p) => !p.dead);
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list.length = 0;
  }
}

// Expanding rings along the ground. Dodge through them or put cover between you and the center.
export class Shockwaves {
  constructor() {
    this.list = [];
  }

  spawn(g, { center, maxR = 8, speed = 14, damage = 12, source = null, color = 0xffffff }) {
    const c = center.clone();
    g.fx.ring(c, maxR, color, maxR / speed, 0.95);
    g.fx.burst(c, 0x8a6a3a, 14, 6, 0.16, 0.6);
    this.list.push({ center: c, r: 0, maxR, speed, damage, source, done: false });
  }

  update(dt, g) {
    const pl = g.player;
    for (const w of this.list) {
      w.r += w.speed * dt;
      if (w.done || pl.dead) continue;
      const d = flatDist(w.center, pl.pos);
      if (Math.abs(d - w.r) < 0.8 && d < w.maxR) {
        w.done = true;
        if (!g.world.segmentBlocked(w.center, pl.pos, 0.9)) {
          g.hitPlayer({ damage: w.damage, parryable: false, from: w.center, knockback: 8, source: w.source });
        }
      }
    }
    this.list = this.list.filter((w) => w.r < w.maxR);
  }

  clear() {
    this.list.length = 0;
  }
}
