import * as THREE from 'three';
import {
  buildBiped, mesh, mat, chestLetter, earsCat, earsRound, earsPointy, snout, beak, duckBill,
  cap, hardHat, helmet, lance, sword, spear, hammer, shield, ball, tail,
} from './models.js';
import { inCone, yawTo, flatDist } from './combat.js';

const v3 = new THREE.Vector3();
const val = (x, e) => (typeof x === 'function' ? x(e) : x);

function handPos(e, out = new THREE.Vector3()) {
  e.parts.handR.getWorldPosition(out);
  if (out.y < 0.5) out.y = 1.4 * e.scale;
  return out;
}

// ======================================================================
// Abilities. Each factory returns { canUse, start, update -> done, abort? }.
// `e.t` is the time since the ability (or its current phase) started.
// ======================================================================

function pounce({ windup = 0.6, air = 0.6, height = 3, damage = 14, radius = 2.3, parryable = true, label = 'POUNCE' } = {}) {
  let phase, from, to;
  return {
    canUse: (e, g) => { const d = flatDist(e.pos, g.player.pos); return d > 3.5 && d < 13; },
    start(e, g) {
      phase = 'crouch';
      g.ui.callout(`${e.def.short}: ${label}!`, '', 1.1);
    },
    update(e, dt, g) {
      const pl = g.player;
      if (phase === 'crouch') {
        e.face(pl.pos, dt, 10);
        e.warn(Math.min(1, e.t / windup), parryable);
        Object.assign(e.pose, { pivotY: 0.72, pivotX: 0.35, armRx: -2, armLx: -2 });
        if (e.t >= windup) {
          phase = 'air';
          e.t = 0;
          from = e.pos.clone();
          to = pl.pos.clone();
          const d = flatDist(from, to);
          if (d > 1.2) to.lerp(from, 1 / d);
          g.audio.dodge();
        }
      } else if (phase === 'air') {
        const k = Math.min(1, e.t / air);
        e.pos.x = from.x + (to.x - from.x) * k;
        e.pos.z = from.z + (to.z - from.z) * k;
        e.pos.y = 4 * height * k * (1 - k);
        e.warn(1, parryable);
        Object.assign(e.pose, { armRx: -2.5, armLx: -2.5, pivotX: 0.5 });
        if (k >= 1) {
          e.pos.y = 0;
          phase = 'land';
          e.t = 0;
          g.fx.ring(e.pos, radius, e.def.colors.primary, 0.35);
          g.shake(0.25);
          g.audio.hit();
          if (flatDist(e.pos, pl.pos) < radius) {
            const res = g.hitPlayer({ damage: damage * e.dmgMul, parryable, from: e.pos, source: e, knockback: 8 });
            if (res === 'parried') return true;
          }
        }
      } else if (e.t > 0.45) return true;
      return false;
    },
  };
}

function charge({ windup = 0.85, speed = 17, maxTime = 1.3, damage = 16, homing = 0, passes = 1, label = 'CHARGE' } = {}) {
  let phase, left, hit;
  return {
    canUse: (e, g) => { const d = flatDist(e.pos, g.player.pos); return d > 5 && d < 22; },
    start(e, g) {
      phase = 'aim';
      left = passes;
      g.ui.callout(`${e.def.short}: ${label}! Sidestep or hide behind cover!`, 'danger', 1.6);
    },
    update(e, dt, g) {
      const pl = g.player;
      if (phase === 'aim') {
        const wu = left === passes ? windup : windup * 0.6;
        e.face(pl.pos, dt, 6);
        e.warn(Math.min(1, e.t / wu), false);
        Object.assign(e.pose, { pivotX: 0.35, armRx: -1.5 });
        if (e.t >= wu) {
          phase = 'run';
          e.t = 0;
          hit = false;
          g.audio.dodge();
        }
      } else if (phase === 'run') {
        if (homing) e.face(pl.pos, dt, homing);
        e.stepForward(speed, dt);
        e.moveSpeed = speed;
        e.warn(1, false);
        Object.assign(e.pose, { pivotX: 0.35, armRx: -1.5 });
        if (Math.random() < dt * 20) g.fx.burst(e.pos, 0x9c7a4a, 2, 2, 0.12, 0.4);
        if (!hit && flatDist(e.pos, pl.pos) < e.radius + 0.9) {
          hit = true;
          g.hitPlayer({ damage: damage * e.dmgMul, parryable: false, from: e.pos, source: e, knockback: 14 });
        }
        if (g.world.overlapsCircle(e.pos, e.radius + 0.05)) {
          g.world.resolveCircle(e.pos, e.radius);
          g.shake(0.45);
          g.audio.heavy();
          g.ui.callout(`${e.def.short} crashed into the cover!`, 'good', 1.3);
          e.stagger(1.8, g);
          return true;
        }
        const outside = g.arena && flatDist(e.pos, g.arena) > g.arenaRadius - 1;
        if (outside || e.t >= maxTime) {
          left--;
          phase = left > 0 ? 'aim' : 'stop';
          e.t = 0;
        }
      } else {
        e.pose.pivotX = -0.2;
        if (e.t > 0.55) return true;
      }
      return false;
    },
  };
}

function volley({
  windup = 0.55, shots = 3, interval = 0.35, perShot = 1, spread = 0, speed = 16, damage = 7, gravity = 0,
  radius = 0.3, makeMesh = null, color = 0xffffff, parryable = true, label = 'THROW', sfx = 'throw',
  minDist = 3, rolling = false, explode = null, fuse = 4, orient = false, spin = 8,
} = {}) {
  let fired;
  return {
    canUse: (e, g) => {
      const d = flatDist(e.pos, g.player.pos);
      return d > minDist && d < 18 && !g.world.segmentBlocked(e.pos, g.player.pos, 1.2);
    },
    start(e, g) {
      fired = 0;
      g.ui.callout(`${e.def.short}: ${label}!`, '', 1.1);
    },
    update(e, dt, g) {
      const pl = g.player;
      e.face(pl.pos, dt, 8);
      const n = val(shots, e);
      if (e.t < windup) {
        e.warn(e.t / windup, parryable);
        e.pose.armRx = -2.7;
        return false;
      }
      e.pose.armRx = -1.2;
      if (fired < n && e.t >= windup + fired * interval) {
        fired++;
        const from = handPos(e);
        const target = v3.set(pl.pos.x, rolling ? radius : 1.1, pl.pos.z);
        if (rolling) from.y = radius;
        const count = val(perShot, e);
        for (let j = 0; j < count; j++) {
          const off = (j - (count - 1) / 2) * spread;
          const dx = target.x - from.x;
          const dz = target.z - from.z;
          const h = Math.hypot(dx, dz) || 1;
          const yaw = Math.atan2(dx, dz) + off;
          let vel;
          if (gravity > 0) {
            const time = h / speed;
            vel = new THREE.Vector3(Math.sin(yaw) * speed, (target.y - from.y) / time + 0.5 * gravity * time, Math.cos(yaw) * speed);
          } else {
            const dy = rolling ? 0 : target.y - from.y;
            const dir = new THREE.Vector3(Math.sin(yaw) * h, dy, Math.cos(yaw) * h).normalize();
            vel = dir.multiplyScalar(speed);
          }
          g.projectiles.spawn({
            mesh: makeMesh ? makeMesh() : null, pos: from, vel, radius, damage: damage * e.dmgMul, parryable,
            gravity, source: e, color, rolling, explode: explode && { ...explode, damage: explode.damage * e.dmgMul },
            life: fuse, orient, spin,
          });
        }
        g.audio[sfx]();
      }
      return fired >= n && e.t >= windup + n * interval + 0.3;
    },
  };
}

function lungeStrike({ windup = 0.4, speed = 13, dur = 0.3, damage = 10, parryable = true, label = null } = {}) {
  let struck;
  return {
    canUse: (e, g) => flatDist(e.pos, g.player.pos) < 8,
    start(e, g) {
      struck = false;
      if (label) g.ui.callout(`${e.def.short}: ${label}!`, parryable ? '' : 'danger', 1);
    },
    update(e, dt, g) {
      const pl = g.player;
      if (e.t < windup) {
        e.face(pl.pos, dt, 8);
        e.warn(e.t / windup, parryable);
        Object.assign(e.pose, { armLx: -1.6, pivotX: -0.15 });
        return false;
      }
      Object.assign(e.pose, { armLx: -1.6, pivotX: 0.3 });
      if (e.t < windup + dur) {
        e.stepForward(speed, dt);
        e.moveSpeed = speed;
        if (!struck && flatDist(e.pos, pl.pos) < e.radius + 1.2) {
          struck = true;
          const res = g.hitPlayer({ damage: damage * e.dmgMul, parryable, from: e.pos, source: e, knockback: 9 });
          if (res === 'parried') return true;
        }
        return false;
      }
      return e.t > windup + dur + 0.35;
    },
  };
}

function shieldWall({ dur = 3.2, damage = 12 } = {}) {
  let phase, struck;
  return {
    canUse: (e, g) => flatDist(e.pos, g.player.pos) < 7,
    start(e, g) {
      phase = 'wall';
      struck = false;
      e.frontBlock = true;
      g.ui.callout(`${e.def.short}: SHIELD WALL! Get around behind it!`, '', 1.6);
    },
    update(e, dt, g) {
      const pl = g.player;
      if (phase === 'wall') {
        e.face(pl.pos, dt, 1.9);
        if (flatDist(e.pos, pl.pos) > 2.2) {
          e.stepForward(e.speed * 0.3, dt);
          e.moveSpeed = e.speed * 0.3;
        }
        Object.assign(e.pose, { armLx: -1.5, armLz: -0.3, pivotX: 0.1 });
        if (e.t >= dur) { phase = 'bash'; e.t = 0; }
        return false;
      }
      Object.assign(e.pose, { armLx: -1.6, pivotX: e.t < 0.45 ? -0.15 : 0.35 });
      if (e.t < 0.45) {
        e.face(pl.pos, dt, 6);
        e.warn(e.t / 0.45, true);
        return false;
      }
      if (!struck) {
        struck = true;
        e.frontBlock = false;
        g.audio.swing();
        if (inCone(e.pos, e.facing, pl.pos, 3, 120)) {
          const res = g.hitPlayer({ damage: damage * e.dmgMul, parryable: true, from: e.pos, source: e, knockback: 10 });
          if (res === 'parried') return true;
        }
      }
      if (e.t < 0.6) e.stepForward(10, dt);
      return e.t > 0.9;
    },
  };
}

function shellSpin({ shell = 1.0, spin = 3.0, speed = 9, damage = 9 } = {}) {
  let phase, heading, tick;
  const restore = (e) => e.parts.head.scale.setScalar(1);
  return {
    canUse: (e, g) => flatDist(e.pos, g.player.pos) < 12,
    start(e, g) {
      phase = 'shell';
      e.invuln = true;
      g.ui.callout(`${e.def.short} pulls into his shell...`, '', 1);
    },
    update(e, dt, g) {
      const pl = g.player;
      Object.assign(e.pose, { pivotY: 0.6, pivotX: 0.9, armRz: -1.3, armLz: 1.3 });
      if (phase === 'shell') {
        e.parts.head.scale.setScalar(Math.max(0.05, 1 - e.t * 2));
        e.warn(e.t / shell, false);
        if (e.t >= shell) {
          phase = 'spin';
          e.t = 0;
          tick = 0;
          heading = yawTo(e.pos, pl.pos);
          g.ui.callout('SHELL SPIN! Dodge it!', 'danger', 1.2);
        }
        return false;
      }
      e.warn(1, false);
      e.pose.spin = 20;
      const want = yawTo(e.pos, pl.pos);
      let d = want - heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      heading += Math.sign(d) * Math.min(Math.abs(d), 1.7 * dt);
      e.facing = heading;
      e.pos.x += Math.sin(heading) * speed * dt;
      e.pos.z += Math.cos(heading) * speed * dt;
      if (g.world.overlapsCircle(e.pos, e.radius)) {
        g.world.resolveCircle(e.pos, e.radius);
        heading += Math.PI * (0.7 + Math.random() * 0.6);
        g.audio.block();
      }
      if (Math.random() < dt * 15) g.fx.burst(e.pos, 0x9c7a4a, 2, 3, 0.1, 0.3);
      tick -= dt;
      if (tick <= 0 && flatDist(e.pos, pl.pos) < e.radius + 0.75) {
        tick = 0.6;
        g.hitPlayer({ damage: damage * e.dmgMul, parryable: false, from: e.pos, source: e, knockback: 10 });
      }
      if (e.t >= spin) {
        restore(e);
        g.ui.callout(`${e.def.short} is dizzy. Hit him!`, 'good', 1.2);
        e.stagger(1.9, g);
        return true;
      }
      return false;
    },
    abort: restore,
  };
}

function groundPound({ windup = 0.9, maxR = 9, speed = 13, damage = 15, slams = 1 } = {}) {
  let phase, left;
  return {
    canUse: (e, g) => flatDist(e.pos, g.player.pos) < 9,
    start(e, g) {
      phase = 'wind';
      left = slams;
      g.ui.callout(`${e.def.short}: HAMMER TIME! Dodge the shockwave or duck behind cover!`, 'danger', 1.6);
    },
    update(e, dt, g) {
      const wu = left === slams ? windup : windup * 0.6;
      if (phase === 'wind') {
        e.face(g.player.pos, dt, 5);
        e.warn(e.t / wu, false);
        Object.assign(e.pose, { armRx: -3, armLx: -3, pivotX: -0.25 });
        if (e.t >= wu) {
          phase = 'after';
          e.t = 0;
          const c = e.pos.clone();
          c.x += Math.sin(e.facing) * 1.3;
          c.z += Math.cos(e.facing) * 1.3;
          g.shockwaves.spawn(g, { center: c, maxR, speed, damage: damage * e.dmgMul, source: e, color: e.def.colors.primary });
          g.shake(0.55);
          g.audio.heavy();
        }
        return false;
      }
      Object.assign(e.pose, { armRx: -0.8, armLx: -0.8, pivotX: 0.45 });
      if (e.t > 0.75) {
        left--;
        if (left <= 0) return true;
        phase = 'wind';
        e.t = 0;
      }
      return false;
    },
  };
}

function burrow({ tunnel = 2.2, speed = 7.5, rumble = 0.55, damage = 16, radius = 2 } = {}) {
  let phase, marker;
  const cleanup = () => { marker?.remove(); marker = null; };
  return {
    canUse: (e, g) => flatDist(e.pos, g.player.pos) > 3,
    start(e, g) {
      phase = 'dig';
      g.ui.callout(`${e.def.short} is digging underground... keep moving!`, 'danger', 1.5);
      g.audio.dig();
    },
    update(e, dt, g) {
      const pl = g.player;
      if (phase === 'dig') {
        e.pos.y = -2.6 * Math.min(1, e.t / 0.6);
        if (Math.random() < dt * 30) g.fx.burst(v3.set(e.pos.x, 0.2, e.pos.z), 0x6b4a26, 2, 4, 0.14, 0.5);
        if (e.t >= 0.6) {
          phase = 'tunnel';
          e.t = 0;
          e.hidden = true;
          e.invuln = true;
          e.root.visible = false;
          marker = g.fx.marker(1.1, 0x5a3a1a, 0.85);
        }
      } else if (phase === 'tunnel') {
        const dx = pl.pos.x - e.pos.x;
        const dz = pl.pos.z - e.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.1) {
          e.pos.x += (dx / d) * Math.min(d, speed * dt);
          e.pos.z += (dz / d) * Math.min(d, speed * dt);
        }
        marker.set(e.pos.x, e.pos.z);
        if (Math.random() < dt * 14) g.fx.burst(v3.set(e.pos.x, 0.1, e.pos.z), 0x6b4a26, 1, 3, 0.14, 0.4);
        if (e.t >= tunnel) {
          phase = 'rumble';
          e.t = 0;
          marker.mesh.material.color.setHex(0xff3b30);
          g.audio.dig();
        }
      } else if (phase === 'rumble') {
        marker.mesh.scale.setScalar(radius * (0.85 + 0.15 * Math.sin(e.t * 40)));
        if (e.t >= rumble) {
          cleanup();
          phase = 'exposed';
          e.t = 0;
          e.hidden = false;
          e.invuln = false;
          e.root.visible = true;
          e.pos.y = 0;
          g.fx.burst(v3.set(e.pos.x, 0.3, e.pos.z), 0x6b4a26, 24, 8, 0.18, 0.8);
          g.fx.ring(e.pos, radius, 0x6b4a26, 0.4);
          g.shake(0.4);
          g.audio.hit();
          if (flatDist(e.pos, pl.pos) < radius) {
            g.hitPlayer({ damage: damage * e.dmgMul, parryable: false, from: e.pos, source: e, knockback: 10 });
          }
        }
      } else {
        Object.assign(e.pose, { armRx: -2.9, armLx: -2.9 });
        if (e.t > 0.9) return true;
      }
      return false;
    },
    abort: cleanup,
  };
}

function frenzy({ windup = 0.5, swipes = 5, gap = 0.26, damage = 5, label = 'FRENZY' } = {}) {
  let n;
  return {
    canUse: (e, g) => flatDist(e.pos, g.player.pos) < 6,
    start(e, g) {
      n = 0;
      g.ui.callout(`${e.def.short}: ${label}! Parry a swipe to shut it down!`, '', 1.3);
    },
    update(e, dt, g) {
      const pl = g.player;
      e.face(pl.pos, dt, 12);
      if (e.t < windup) {
        e.warn(e.t / windup, true);
        Object.assign(e.pose, { armRx: -2.6, armLx: -2.6 });
        return false;
      }
      const idx = Math.floor((e.t - windup) / gap);
      if (idx >= swipes) return e.t > windup + swipes * gap + 0.3;
      e.warn(1, true);
      if (flatDist(e.pos, pl.pos) > 1.4) {
        e.stepForward(e.speed * 1.2, dt);
        e.moveSpeed = e.speed;
      }
      Object.assign(e.pose, idx % 2 ? { armRx: -1.5, armLx: -2.6 } : { armLx: -1.5, armRx: -2.6 });
      if (idx >= n) {
        n = idx + 1;
        g.audio.swing();
        if (inCone(e.pos, e.facing, pl.pos, 2.5, 120)) {
          const res = g.hitPlayer({ damage: damage * e.dmgMul, parryable: true, from: e.pos, source: e, knockback: 2, stun: 0.2 });
          if (res === 'parried') return true;
        }
      }
      return false;
    },
  };
}

function bearHug({ windup = 0.7, lunge = 0.45, speed = 12, dur = 1.8, tickDmg = 4 } = {}) {
  let phase, tick;
  return {
    canUse: (e, g) => { const d = flatDist(e.pos, g.player.pos); return d < 8 && d > 1; },
    start(e, g) {
      phase = 'wind';
      g.ui.callout(`${e.def.short} wants a BEAR HUG! Dodge it!`, 'danger', 1.3);
    },
    update(e, dt, g) {
      const pl = g.player;
      const open = { armRx: -1.4, armLx: -1.4, armRz: -1.1, armLz: 1.1 };
      if (phase === 'wind') {
        e.face(pl.pos, dt, 8);
        e.warn(e.t / windup, false);
        Object.assign(e.pose, open);
        if (e.t >= windup) { phase = 'lunge'; e.t = 0; }
      } else if (phase === 'lunge') {
        e.stepForward(speed, dt);
        e.moveSpeed = speed;
        e.warn(1, false);
        Object.assign(e.pose, open);
        if (flatDist(e.pos, pl.pos) < e.radius + 0.9 && pl.grab(e, dur)) {
          phase = 'hug';
          e.t = 0;
          tick = 0.3;
          g.audio.hurt();
          g.ui.callout('GRABBED! Mash to break free!', 'danger', 1.2);
        } else if (e.t >= lunge) {
          phase = 'whiff';
          e.t = 0;
        }
      } else if (phase === 'hug') {
        Object.assign(e.pose, { armRx: -1.4, armLx: -1.4, armRz: -0.2, armLz: 0.2 });
        pl.pos.x = e.pos.x + Math.sin(e.facing) * (e.radius + 0.45);
        pl.pos.z = e.pos.z + Math.cos(e.facing) * (e.radius + 0.45);
        pl.facing = e.facing + Math.PI;
        tick -= dt;
        if (tick <= 0) {
          tick = 0.35;
          g.hitPlayer({ damage: tickDmg * e.dmgMul, parryable: false, source: e, noFlinch: true });
        }
        if (pl.state !== 'grabbed') return true;
      } else {
        e.pose.pivotX = 0.5;
        if (e.t > 1.0) return true;
      }
      return false;
    },
    abort(e, g) {
      if (g.player.grabbedBy === e) g.player.releaseGrab();
    },
  };
}

function howl({ pups = 2 } = {}) {
  let spawned;
  return {
    canUse: (e, g) => !g.enemies.some((x) => x.minion && x.alive),
    start(e, g) {
      spawned = false;
      g.ui.callout(`${e.def.short} HOWLS for backup!`, '', 1.3);
      g.audio.howl();
    },
    update(e, dt, g) {
      Object.assign(e.pose, { headX: -0.8, pivotX: -0.25 });
      if (!spawned && e.t > 1.0) {
        spawned = true;
        for (let i = 0; i < pups; i++) {
          const side = i % 2 ? 1 : -1;
          const p = e.pos.clone();
          p.x += Math.cos(e.facing) * 2 * side;
          p.z -= Math.sin(e.facing) * 2 * side;
          g.fx.ring(p, 1.5, 0xb7a57a, 0.4);
          g.spawnMinion(PUP, p);
        }
      }
      return e.t > 1.4;
    },
  };
}

function duckDash({ dashes = 3, aim = 0.4, dash = 0.26, damage = 8, overshoot = 3 } = {}) {
  let phase, n, from, to, hit;
  return {
    canUse: (e, g) => { const d = flatDist(e.pos, g.player.pos); return d > 2.5 && d < 14; },
    start(e, g) {
      phase = 'aim';
      n = 0;
      g.ui.callout(`${e.def.short}: AFTERBURNER DASH!`, '', 1.1);
      g.audio.quack();
    },
    update(e, dt, g) {
      const pl = g.player;
      if (phase === 'aim') {
        const a = n === 0 ? aim : aim * 0.8;
        e.face(pl.pos, dt, 12);
        e.warn(e.t / a, true);
        e.pose.pivotX = 0.3;
        if (e.t >= a) {
          phase = 'dash';
          e.t = 0;
          hit = false;
          from = e.pos.clone();
          const dx = pl.pos.x - from.x;
          const dz = pl.pos.z - from.z;
          const d = Math.hypot(dx, dz) || 1;
          to = new THREE.Vector3(pl.pos.x + (dx / d) * overshoot, 0, pl.pos.z + (dz / d) * overshoot);
          g.audio.dodge();
        }
      } else if (phase === 'dash') {
        let k = Math.min(1, e.t / dash);
        e.pos.x = from.x + (to.x - from.x) * k;
        e.pos.z = from.z + (to.z - from.z) * k;
        e.moveSpeed = 16;
        e.pose.pivotX = 0.5;
        e.warn(1, true);
        g.fx.ghost(e.pos, e.def.colors.secondary);
        if (!hit && flatDist(e.pos, pl.pos) < e.radius + 0.8) {
          hit = true;
          const res = g.hitPlayer({ damage: damage * e.dmgMul, parryable: true, from: e.pos, source: e, knockback: 7 });
          if (res === 'parried') return true;
        }
        if (g.world.overlapsCircle(e.pos, e.radius) || (g.arena && flatDist(e.pos, g.arena) > g.arenaRadius - 0.8)) k = 1;
        if (k >= 1) {
          n++;
          phase = n >= dashes ? 'end' : 'aim';
          e.t = 0;
        }
      } else if (e.t > 0.5) return true;
      return false;
    },
  };
}

function roar({ windup = 1.0, radius = 14, damage = 6, stun = 1.6 } = {}) {
  let roared;
  return {
    canUse: (e, g) => flatDist(e.pos, g.player.pos) < 12,
    start(e, g) {
      roared = false;
      g.ui.callout(`${e.def.short} is about to ROAR! Get behind cover!`, 'danger', 1.5);
    },
    update(e, dt, g) {
      const pl = g.player;
      if (e.t < windup) {
        e.face(pl.pos, dt, 5);
        e.warn(e.t / windup, false);
        Object.assign(e.pose, { pivotX: -0.3, headX: -0.5, armRz: -0.5, armLz: 0.5 });
        return false;
      }
      Object.assign(e.pose, { pivotX: 0.25, headX: 0.2, armRz: -1, armLz: 1 });
      if (!roared) {
        roared = true;
        g.audio.roar();
        g.shake(0.6);
        g.fx.ring(e.pos, radius, 0xffffff, 0.6, 0.6);
        g.fx.ring(e.pos, radius * 0.7, e.def.colors.primary, 0.5);
        if (flatDist(e.pos, pl.pos) < radius && !pl.dead) {
          if (g.world.segmentBlocked(e.pos, pl.pos, 1.1)) {
            g.ui.callout('The cover blocked the roar!', 'good', 1.2);
          } else {
            const res = g.hitPlayer({ damage: damage * e.dmgMul, parryable: false, from: e.pos, source: e, knockback: 3, stun });
            if (res === 'hit') {
              g.ui.callout('STUNNED!', 'danger', 1);
              e.followUp = true;
            }
          }
        }
      }
      return e.t > windup + 0.7;
    },
  };
}

function diveBomb({ rise = 0.8, hunt = 1.4, lock = 0.45, dive = 0.25, damage = 20, radius = 2.8, height = 11 } = {}) {
  let phase, marker, dives, target;
  const cleanup = () => { marker?.remove(); marker = null; };
  return {
    canUse: () => true,
    start(e, g) {
      phase = 'rise';
      dives = e.rage ? 2 : 1;
      e.invuln = true;
      target = e.pos.clone();
      g.ui.callout(`${e.def.short} takes flight! Watch the shadow!`, 'danger', 1.4);
      g.audio.screech();
    },
    update(e, dt, g) {
      const pl = g.player;
      const flap = Math.sin(performance.now() / 70);
      const wings = { armRz: -1.5 - flap * 0.4, armLz: 1.5 + flap * 0.4 };
      if (phase === 'rise') {
        const k = Math.min(1, e.t / rise);
        e.pos.y = height * (1 - (1 - k) * (1 - k));
        Object.assign(e.pose, wings);
        if (k >= 1) {
          phase = 'hunt';
          e.t = 0;
          target.set(e.pos.x, 0, e.pos.z);
          marker = g.fx.marker(radius, 0x111111, 0.35);
        }
      } else if (phase === 'hunt') {
        const follow = e.rage ? 5 : 3.5;
        target.x += (pl.pos.x - target.x) * Math.min(1, follow * dt);
        target.z += (pl.pos.z - target.z) * Math.min(1, follow * dt);
        marker.set(target.x, target.z);
        e.pos.x += (target.x - e.pos.x) * Math.min(1, 5 * dt);
        e.pos.z += (target.z - e.pos.z) * Math.min(1, 5 * dt);
        e.pos.y = height + Math.sin(e.t * 4) * 0.4;
        e.face(pl.pos, dt, 6);
        Object.assign(e.pose, wings);
        if (e.t >= (e.rage ? 1.0 : hunt)) {
          phase = 'lock';
          e.t = 0;
          marker.mesh.material.color.setHex(0xff3b30);
        }
      } else if (phase === 'lock') {
        marker.mesh.material.opacity = 0.4 + 0.35 * Math.sin(e.t * 40);
        e.pos.x += (target.x - e.pos.x) * Math.min(1, 10 * dt);
        e.pos.z += (target.z - e.pos.z) * Math.min(1, 10 * dt);
        Object.assign(e.pose, { armRz: -0.3, armLz: 0.3, pivotX: 0.8 });
        if (e.t >= lock * (e.rage ? 0.7 : 1)) {
          phase = 'dive';
          e.t = 0;
          g.audio.screech();
        }
      } else if (phase === 'dive') {
        const k = Math.min(1, e.t / dive);
        e.pos.set(target.x, height * (1 - k), target.z);
        Object.assign(e.pose, { armRz: -0.2, armLz: 0.2, pivotX: 1.3 });
        if (k >= 1) {
          e.pos.y = 0;
          cleanup();
          g.shake(0.7);
          g.audio.boom();
          g.fx.ring(target, radius, 0xffcd00, 0.45);
          g.fx.burst(v3.set(target.x, 0.3, target.z), 0x6b4a26, 22, 8, 0.18, 0.7);
          if (flatDist(pl.pos, target) < radius) {
            g.hitPlayer({ damage: damage * e.dmgMul, parryable: false, from: target, source: e, knockback: 12 });
          }
          dives--;
          phase = 'stuck';
          e.t = 0;
          e.invuln = false;
        }
      } else {
        Object.assign(e.pose, { pivotX: 1.0, armRz: -1, armLz: 1 });
        if (dives > 0 && e.t > 0.5) {
          phase = 'rise';
          e.t = 0;
          e.invuln = true;
        } else if (dives <= 0 && e.t > 1.2) return true;
      }
      return false;
    },
    abort: cleanup,
  };
}

function sequence(...abs) {
  let i;
  return {
    canUse: (e, g) => abs[0].canUse(e, g),
    start(e, g) { i = 0; abs[0].start(e, g); },
    update(e, dt, g) {
      if (!abs[i].update(e, dt, g)) return false;
      if (e.state !== 'ability') return true;
      i++;
      if (i >= abs.length) return true;
      e.t = 0;
      abs[i].start(e, g);
      return false;
    },
    abort(e, g) { abs[i]?.abort?.(e, g); },
  };
}

function choice(...abs) {
  let cur;
  return {
    canUse: (e, g) => abs.some((a) => a.canUse(e, g)),
    start(e, g) {
      const ok = abs.filter((a) => a.canUse(e, g));
      cur = ok[Math.floor(Math.random() * ok.length)];
      cur.start(e, g);
    },
    update: (e, dt, g) => cur.update(e, dt, g),
    abort(e, g) { cur?.abort?.(e, g); },
  };
}

// ---- Projectile meshes ----

function pointed(len, r, color, tipColor = null) {
  const g = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(r, r, len, 6), mat(color));
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  if (tipColor !== null) {
    const tip = mesh(new THREE.ConeGeometry(r * 3, len * 0.18, 8), mat(tipColor, { metalness: 0.6, roughness: 0.3 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = len / 2;
    g.add(tip);
  }
  return g;
}
const spearMesh = () => pointed(2.2, 0.05, 0x6b4423, 0xd8dde3);
function featherMesh() {
  const g = new THREE.Group();
  const f = mesh(new THREE.ConeGeometry(0.14, 0.9, 6), mat(0xffcd00));
  f.rotation.x = Math.PI / 2;
  f.scale.x = 0.4;
  const q = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 4), mat(0x111111));
  q.rotation.x = Math.PI / 2;
  g.add(f, q);
  return g;
}
function basketballMesh() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.32, 14, 10), mat(0xe06a1b)));
  const seam = mesh(new THREE.TorusGeometry(0.325, 0.015, 4, 20), mat(0x111111));
  g.add(seam);
  return g;
}
function buckeyeMesh() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.45, 14, 10), mat(0x5b3416, { roughness: 0.35 })));
  const eye = mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(0xc9a26b));
  eye.position.z = 0.3;
  eye.scale.z = 0.4;
  g.add(eye);
  return g;
}

// ======================================================================
// Models
// ======================================================================

function claws(hand) {
  for (let i = -1; i <= 1; i++) {
    const c = mesh(new THREE.ConeGeometry(0.04, 0.3, 5), mat(0xf2f2f2), i * 0.08, -0.2, 0.08);
    c.rotation.x = Math.PI;
    hand.add(c);
  }
}

// Horizontal bands around the torso (striped sweaters).
function stripes(p, heights, color) {
  for (const y of heights) {
    const b = mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.08, 16), mat(color), 0, y, 0);
    b.scale.z = 0.82;
    p.rig.add(b);
  }
}

function brows(head, r, color = 0x111111, angle = 0.35) {
  for (const s of [-1, 1]) {
    const b = mesh(new THREE.BoxGeometry(r * 0.4, r * 0.09, r * 0.1), mat(color), s * r * 0.36, r * 0.42, r * 0.9);
    b.rotation.z = s * angle;
    head.add(b);
  }
}

function buildHorseRider(o) {
  const p = buildBiped(o);
  const horse = new THREE.Group();
  horse.position.y = -1;
  p.pivot.add(horse);
  const coat = mat(0xf2efe6);
  const dark = mat(0x222222);
  const body = mesh(new THREE.CapsuleGeometry(0.55, 1.5, 6, 12), coat, 0, 1.45, 0);
  body.rotation.x = Math.PI / 2;
  const neck = mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), coat, 0, 2.05, 1.05);
  neck.rotation.x = 0.6;
  const head = mesh(new THREE.BoxGeometry(0.4, 0.4, 0.8), coat, 0, 2.45, 1.5);
  const mane = mesh(new THREE.BoxGeometry(0.1, 0.25, 0.9), dark, 0, 2.3, 0.9);
  mane.rotation.x = 0.6;
  const tailM = mesh(new THREE.CapsuleGeometry(0.1, 0.7, 4, 6), dark, 0, 1.4, -1.25);
  tailM.rotation.x = -0.5;
  const blanket = mesh(new THREE.BoxGeometry(1.2, 0.08, 1.1), mat(0x990000), 0, 2.0, 0.05);
  horse.add(body, neck, head, mane, tailM, blanket);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.05, 6, 4), dark, s * 0.21, 2.55, 1.7);
    horse.add(eye);
  }
  p.quadLegs = [];
  for (const [x, z] of [[-0.3, 0.75], [0.3, 0.75], [-0.3, -0.75], [0.3, -0.75]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 1.15, z);
    leg.add(mesh(new THREE.CapsuleGeometry(0.12, 0.85, 4, 6), coat, 0, -0.55, 0));
    leg.add(mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.15, 8), dark, 0, -1.08, 0));
    horse.add(leg);
    p.quadLegs.push(leg);
  }
  // Seat the rider on the horse with legs astride; the rider's own legs don't walk.
  p.rig.position.y = -1 + 1.05;
  p.legL.rotation.z = 0.9;
  p.legR.rotation.z = -0.9;
  p.legL = new THREE.Object3D();
  p.legR = new THREE.Object3D();
  p.top += 1.05;
  return p;
}

// ======================================================================
// The Big Ten gauntlet, easiest to hardest.
// ======================================================================

function tier(i) {
  const k = i / 16;
  return {
    hp: Math.round(80 + 180 * k),
    speed: 3.6 + 1.9 * k,
    damage: Math.round(8 + 7 * k),
    windup: 0.72 - 0.26 * k,
    interval: 2.3 - 1.2 * k,
    parryMult: 1.2 - 0.45 * k,
    poise: Math.round(20 + 32 * k),
    combo: k < 0.3 ? 1 : k < 0.7 ? 2 : 3,
    abilityCd: 8 - 2.5 * k,
    range: 2.0,
    recover: 0.6 - 0.2 * k,
  };
}

const ROSTER = [
  {
    id: 'northwestern', school: 'Northwestern Wildcats', name: 'Willie the Wildcat', short: 'Willie', abbr: 'NU',
    colors: { primary: 0x4e2a84, secondary: 0xffffff },
    abilityName: 'Pounce', tip: 'Leaps at you from range. Parry right as he lands.',
    ability: () => pounce(),
    build() {
      const p = buildBiped({ head: 0xa87945, hands: 0xa87945, shirt: 0x4e2a84, pants: 0x4e2a84, headR: 0.58 });
      earsCat(p.head, p.headR, 0xa87945, 0xf5d7b0);
      snout(p.head, p.headR, 0xf5e6cc, 0x3a2a1e, 0.35);
      chestLetter(p, 'N', 0xffffff);
      tail(p, 0xa87945);
      return p;
    },
  },
  {
    id: 'rutgers', school: 'Rutgers Scarlet Knights', name: 'The Scarlet Knight', short: 'The Knight', abbr: 'RU',
    colors: { primary: 0xcc0033, secondary: 0xc0c4ca },
    abilityName: 'Lance Charge', tip: "Can't be parried. Sidestep, or make him crash into cover.",
    ability: () => charge({ label: 'LANCE CHARGE' }),
    build() {
      const steel = 0xb8bcc2;
      const p = buildBiped({ head: steel, hands: steel, shirt: steel, sleeve: steel, pants: 0xcc0033, eyes: false, headR: 0.5 });
      helmet(p.head, p.headR, steel, 0xcc0033, false);
      lance(p.handR);
      const s = shield(p.handL, 0xcc0033, steel, false, 0.45);
      s.rotation.y = Math.PI / 2;
      chestLetter(p, 'R', 0xcc0033);
      return p;
    },
  },
  {
    id: 'indiana', school: 'Indiana Hoosiers', name: 'The Hoosier', short: 'The Hoosier', abbr: 'IU',
    colors: { primary: 0x990000, secondary: 0xeeedeb },
    abilityName: 'Fast Break', tip: 'Lobs basketballs. Parry to send them back, or hide behind cover.',
    ability: () => volley({ label: 'FAST BREAK', gravity: 14, speed: 14, damage: 7, shots: 3, interval: 0.4, radius: 0.32, makeMesh: basketballMesh, color: 0xe06a1b }),
    build() {
      const p = buildBiped({ shirt: 0x990000, pants: 0xeeedeb, sleeve: 0xf0c49a, shoes: 0xffffff });
      cap(p.head, p.headR, 0x990000, 0x990000);
      ball(p.handR);
      chestLetter(p, 'IU', 0xeeedeb);
      return p;
    },
  },
  {
    id: 'illinois', school: 'Illinois Fighting Illini', name: 'The Illini Guardian', short: 'The Guardian', abbr: 'ILL',
    colors: { primary: 0xff5f05, secondary: 0x13294b },
    abilityName: 'Shield Wall', tip: 'Blocks every hit from the front. Circle behind him, or use the Haymaker.',
    ability: () => shieldWall(),
    build() {
      const p = buildBiped({ shirt: 0x13294b, sleeve: 0xff5f05, pants: 0x13294b, bulk: 1.1 });
      helmet(p.head, p.headR, 0xff5f05, 0x13294b);
      const s = shield(p.handL, 0xff5f05, 0x13294b, true, 0.8);
      const letter = chestLetter(p, 'I', 0xff5f05);
      letter.position.z = 0.38;
      s.add(mesh(new THREE.BoxGeometry(0.2, 0.7, 0.02), mat(0x13294b), 0, 0, 0.07));
      return p;
    },
  },
  {
    id: 'maryland', school: 'Maryland Terrapins', name: 'Testudo', short: 'Testudo', abbr: 'UMD',
    colors: { primary: 0xe03a3e, secondary: 0xffd520 },
    abilityName: 'Shell Spin', tip: "Invincible in his shell. Dodge the spin, then punish him while he's dizzy.",
    ability: () => shellSpin(),
    build() {
      const p = buildBiped({ head: 0x7a8c5a, hands: 0x7a8c5a, shirt: 0xe03a3e, pants: 0x1a1a1a, headR: 0.52 });
      snout(p.head, p.headR, 0x8fa36a, 0x333333, 0.3);
      const sh = mesh(new THREE.SphereGeometry(0.75, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6b5a2e, { roughness: 0.4 }), 0, 1.35, -0.3);
      sh.rotation.x = -Math.PI / 2;
      sh.scale.set(1, 1, 0.9);
      const rim = mesh(new THREE.TorusGeometry(0.74, 0.07, 6, 24), mat(0xffd520), 0, 1.35, -0.3);
      p.rig.add(sh, rim);
      chestLetter(p, 'M', 0xffd520);
      return p;
    },
  },
  {
    id: 'purdue', school: 'Purdue Boilermakers', name: 'Purdue Pete', short: 'Purdue Pete', abbr: 'PUR',
    colors: { primary: 0xcfb991, secondary: 0x1a1a1a },
    abilityName: 'Hammer Time', tip: 'Slams the ground. Roll through the shockwave, or duck behind cover.',
    ability: () => groundPound(),
    build() {
      const p = buildBiped({ shirt: 0xcfb991, pants: 0x1a1a1a, bulk: 1.1 });
      hardHat(p.head, p.headR, 0xcfb991);
      hammer(p.handR);
      chestLetter(p, 'P', 0x1a1a1a);
      const chin = mesh(new THREE.BoxGeometry(0.5, 0.2, 0.25), mat(0xf0c49a), 0, -0.42, 0.35);
      p.head.add(chin);
      return p;
    },
  },
  {
    id: 'minnesota', school: 'Minnesota Golden Gophers', name: 'Goldy Gopher', short: 'Goldy', abbr: 'UMN',
    colors: { primary: 0x7a0019, secondary: 0xffcc33 },
    abilityName: 'Tunnel Ambush', tip: 'Burrows toward you. When the mound turns red, roll away!',
    ability: () => burrow(),
    build() {
      const p = buildBiped({ head: 0xc79a3a, hands: 0xc79a3a, shirt: 0x7a0019, pants: 0xffcc33, headR: 0.6 });
      earsRound(p.head, p.headR, 0xc79a3a, 0xe8c07a, 0.22);
      snout(p.head, p.headR, 0xe8c07a, 0x3a2a1e, 0.35);
      for (const s of [-1, 1]) p.head.add(mesh(new THREE.BoxGeometry(0.1, 0.16, 0.05), mat(0xffffff), s * 0.055, -0.36, 0.62));
      chestLetter(p, 'M', 0xffcc33);
      return p;
    },
  },
  {
    id: 'wisconsin', school: 'Wisconsin Badgers', name: 'Bucky Badger', short: 'Bucky', abbr: 'WIS',
    colors: { primary: 0xc5050c, secondary: 0xffffff },
    abilityName: 'Badger Frenzy', tip: 'A flurry of fast swipes. Parry any one of them to stagger him.',
    ability: () => frenzy({ label: 'BADGER FRENZY' }),
    build() {
      const p = buildBiped({ head: 0x3a2a1e, hands: 0x3a2a1e, shirt: 0xc5050c, pants: 0x1a1a1a, headR: 0.58 });
      p.head.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 1.0), mat(0xffffff), 0, 0.5, 0.05));
      for (const s of [-1, 1]) {
        const cheek = mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0xffffff), s * 0.32, -0.12, 0.38);
        p.head.add(cheek);
      }
      earsRound(p.head, p.headR, 0x3a2a1e, 0xffffff, 0.2);
      snout(p.head, p.headR, 0xf2e8da, 0x111111, 0.4);
      stripes(p, [1.2, 1.55], 0xffffff);
      chestLetter(p, 'W', 0xffffff);
      claws(p.handR);
      claws(p.handL);
      return p;
    },
  },
  {
    id: 'ucla', school: 'UCLA Bruins', name: 'Joe Bruin', short: 'Joe Bruin', abbr: 'UCLA',
    colors: { primary: 0x2d68c4, secondary: 0xf2a900 },
    abilityName: 'Bear Hug', tip: "Can't be parried. Dodge the lunge, and he's wide open after.",
    ability: () => bearHug(),
    scale: 1.1,
    build() {
      const p = buildBiped({ head: 0x7a4e2d, hands: 0x7a4e2d, shirt: 0x2d68c4, sleeve: 0xf2a900, pants: 0x7a4e2d, bulk: 1.2, headR: 0.62 });
      earsRound(p.head, p.headR, 0x7a4e2d, 0xc79a6b);
      snout(p.head, p.headR, 0xc79a6b, 0x111111, 0.4);
      chestLetter(p, 'B', 0xf2a900);
      return p;
    },
  },
  {
    id: 'washington', school: 'Washington Huskies', name: 'Harry the Husky', short: 'Harry', abbr: 'WASH',
    colors: { primary: 0x4b2e83, secondary: 0xb7a57a },
    abilityName: 'Call the Pack', tip: 'Howls to summon two pups. Knock them out fast.',
    ability: () => howl(),
    build: () => buildHusky(1),
  },
  {
    id: 'oregon', school: 'Oregon Ducks', name: 'The Duck', short: 'The Duck', abbr: 'UO',
    colors: { primary: 0x154733, secondary: 0xfee123 },
    abilityName: 'Afterburner Dash', tip: 'Three lightning dashes through you. Parry each one as it arrives.',
    ability: () => duckDash(),
    build() {
      const p = buildBiped({ head: 0xffffff, hands: 0xffffff, shirt: 0x154733, sleeve: 0xfee123, pants: 0x154733, shoes: 0xf29b24, headR: 0.58 });
      duckBill(p.head, p.headR, 0xf29b24);
      cap(p.head, p.headR, 0x154733, 0xfee123);
      chestLetter(p, 'O', 0xfee123);
      return p;
    },
  },
  {
    id: 'michigan-state', school: 'Michigan State Spartans', name: 'Sparty', short: 'Sparty', abbr: 'MSU',
    colors: { primary: 0x18453b, secondary: 0xffffff },
    abilityName: 'Spear & Shield', tip: 'Throws a spear, then charges in with a shield bash. Parry both.',
    ability: () => sequence(
      volley({ label: 'SPEAR THROW', shots: 1, speed: 24, damage: 12, windup: 0.6, makeMesh: spearMesh, orient: true, radius: 0.35, color: 0xd8dde3 }),
      lungeStrike({ label: 'SHIELD BASH', damage: 11 }),
    ),
    build() {
      const p = buildBiped({ shirt: 0x18453b, pants: 0x18453b, sleeve: 0xf0c49a, bulk: 1.15 });
      helmet(p.head, p.headR, 0x18453b, 0xffffff);
      p.head.add(mesh(new THREE.BoxGeometry(0.5, 0.28, 0.3), mat(0xf0c49a), 0, -0.45, 0.32));
      brows(p.head, p.headR, 0x3a2a1e, 0.25);
      spear(p.handR);
      shield(p.handL, 0x18453b, 0xffffff, true, 0.65);
      chestLetter(p, 'S', 0xffffff);
      return p;
    },
  },
  {
    id: 'usc', school: 'USC Trojans', name: 'Tommy Trojan & Traveler', short: 'Traveler', abbr: 'USC',
    colors: { primary: 0x990000, secondary: 0xffc72c },
    abilityName: 'Cavalry Charge', tip: 'Two charges that steer toward you. Dodge late, or bait him into cover.',
    ability: () => charge({ label: 'CAVALRY CHARGE', windup: 0.7, speed: 21, maxTime: 1.4, damage: 20, homing: 1.1, passes: 2 }),
    radius: 1.1,
    build() {
      const p = buildHorseRider({ shirt: 0x990000, sleeve: 0xf0c49a, pants: 0x990000 });
      helmet(p.head, p.headR, 0xffc72c, 0x990000);
      sword(p.handR);
      return p;
    },
  },
  {
    id: 'penn-state', school: 'Penn State Nittany Lions', name: 'The Nittany Lion', short: 'The Nittany Lion', abbr: 'PSU',
    colors: { primary: 0x041e42, secondary: 0xffffff },
    abilityName: 'Mountain Roar', tip: "Stuns you if you're in the open. Put cover between you and him.",
    ability: () => roar(),
    build() {
      const p = buildBiped({ head: 0xe8dcc0, hands: 0xe8dcc0, shirt: 0x041e42, sleeve: 0xffffff, pants: 0x041e42, bulk: 1.1 });
      earsRound(p.head, p.headR, 0xe8dcc0, 0x3a2a1e, 0.22);
      snout(p.head, p.headR, 0xf6efe0, 0x3a2a1e, 0.4);
      brows(p.head, p.headR, 0x8a7a5a, 0.3);
      chestLetter(p, 'PS', 0xffffff);
      tail(p, 0xe8dcc0, 1);
      return p;
    },
  },
  {
    id: 'michigan', school: 'Michigan Wolverines', name: 'The Wolverine', short: 'The Wolverine', abbr: 'MICH',
    colors: { primary: 0x00274c, secondary: 0xffcb05 },
    abilityName: 'Berserker', tip: 'Gets faster and hits harder as he loses health. Claw combo, then a leaping slash.',
    ability: () => sequence(
      frenzy({ label: 'CLAW COMBO', swipes: 3, gap: 0.22, damage: 7, windup: 0.4 }),
      pounce({ label: 'LEAPING SLASH', windup: 0.35, air: 0.45, height: 1.8, damage: 14 }),
    ),
    passive(e, dt, g) {
      const missing = 1 - e.hp / e.maxHp;
      e.dmgMul = 1 + 0.8 * missing;
      e.speedMul = 1 + 0.4 * missing;
      if (!e.rage && missing > 0.5) {
        e.rage = true;
        g.ui.callout('The Wolverine goes BERSERK!', 'danger', 1.5);
        g.ui.setEnraged(true);
      }
    },
    build() {
      const p = buildBiped({ head: 0x4a3222, hands: 0x4a3222, shirt: 0x00274c, sleeve: 0xffcb05, pants: 0x00274c, headR: 0.56 });
      const band = mesh(new THREE.TorusGeometry(0.5, 0.07, 6, 20), mat(0xc9a26b), 0, 0.15, 0);
      band.rotation.x = Math.PI / 2;
      p.head.add(band);
      earsRound(p.head, p.headR, 0x4a3222, null, 0.18);
      snout(p.head, p.headR, 0x2e1f15, 0x111111, 0.4);
      brows(p.head, p.headR, 0x111111, 0.45);
      claws(p.handR);
      claws(p.handL);
      chestLetter(p, 'M', 0xffcb05);
      return p;
    },
  },
  {
    id: 'ohio-state', school: 'Ohio State Buckeyes', name: 'Brutus Buckeye', short: 'Brutus', abbr: 'OSU',
    colors: { primary: 0xbb0000, secondary: 0x666666 },
    abilityName: 'Buckeye Bombs', tip: 'Rolls exploding buckeyes. Parry them back, or let cover soak them up.',
    ability: () => volley({
      label: 'BUCKEYE BOMBS', shots: 2, interval: 0.8, perShot: 3, spread: 0.4, speed: 8.5, rolling: true,
      radius: 0.45, explode: { radius: 2.4, damage: 14 }, fuse: 2.8, makeMesh: buckeyeMesh, color: 0x5b3416, windup: 0.6,
    }),
    build() {
      const p = buildBiped({ head: 0x5b3416, shirt: 0xbb0000, pants: 0x666666, headR: 0.75, eyeY: 0.02 });
      const patch = mesh(new THREE.SphereGeometry(0.45, 16, 10), mat(0xc9a26b), 0, 0.38, 0.35);
      patch.scale.set(1, 0.7, 0.6);
      p.head.add(patch);
      stripes(p, [1.15, 1.4, 1.65], 0x888888);
      const smile = mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 12, Math.PI), mat(0x2a1508), 0, -0.25, 0.7);
      smile.rotation.z = Math.PI;
      p.head.add(smile);
      return p;
    },
  },
  {
    id: 'iowa', school: 'Iowa Hawkeyes', name: 'Herky the Hawk', short: 'Herky', abbr: 'IOWA',
    colors: { primary: 0xffcd00, secondary: 0x111111 },
    abilityName: 'Dive Bomb & Feather Volley', tip: 'Final boss. Watch the shadow and roll when it turns red. Parry the feathers. He gets furious at half health.',
    boss: true,
    scale: 1.25,
    ability: () => choice(
      diveBomb(),
      volley({
        label: 'FEATHER VOLLEY', shots: (e) => (e.rage ? 4 : 3), perShot: (e) => (e.rage ? 7 : 5), spread: 0.16,
        speed: 17, damage: 6, windup: 0.5, interval: 0.45, makeMesh: featherMesh, orient: true, color: 0xffcd00, minDist: 2.5, sfx: 'screech',
      }),
    ),
    passive(e, dt, g) {
      if (!e.rage && e.hp < e.maxHp * 0.5) {
        e.rage = true;
        e.speedMul = 1.3;
        e.windupMul = 0.75;
        e.dmgMul = 1.15;
        e.abilityCd = Math.min(e.abilityCd, 1);
        g.audio.screech();
        g.shake(0.6);
        g.ui.callout('HERKY IS FURIOUS!', 'danger', 2);
        g.ui.setEnraged(true);
      }
    },
    build() {
      const p = buildBiped({ head: 0x111111, hands: 0xffcd00, shirt: 0xffcd00, sleeve: 0x111111, pants: 0x111111, shoes: 0xffcd00, headR: 0.6, eyeY: 0.14 });
      beak(p.head, p.headR, 0xffcd00, 0.9, true);
      brows(p.head, p.headR, 0xffffff, 0.5);
      p.head.add(mesh(new THREE.BoxGeometry(0.12, 0.3, 0.6), mat(0x111111), 0, 0.65, -0.2));
      for (const [arm, s] of [[p.armL, 1], [p.armR, -1]]) {
        for (let i = 0; i < 3; i++) {
          const f = mesh(new THREE.BoxGeometry(0.05, 0.7 - i * 0.12, 0.35), mat(i % 2 ? 0xffcd00 : 0x111111), s * (0.12 + i * 0.03), -0.3 - i * 0.18, -0.05);
          arm.add(f);
        }
      }
      chestLetter(p, 'I', 0x111111);
      return p;
    },
  },
];

function buildHusky(size) {
  const p = buildBiped({ head: 0x9aa0a8, hands: 0x9aa0a8, shirt: 0x4b2e83, sleeve: 0xb7a57a, pants: 0x4b2e83, headR: 0.58 });
  earsPointy(p.head, p.headR, 0x9aa0a8, 0xffffff);
  p.head.add(mesh(new THREE.SphereGeometry(0.4, 12, 10), mat(0xffffff), 0, -0.12, 0.3));
  snout(p.head, p.headR, 0xffffff, 0x111111, 0.45);
  chestLetter(p, 'W', 0xb7a57a);
  tail(p, 0x9aa0a8, 0.6);
  return p;
}

export const PUP = {
  id: 'pup', school: 'Washington Huskies', name: 'Husky Pup', short: 'Pup', colors: { primary: 0x4b2e83, secondary: 0xb7a57a },
  hp: 20, speed: 6.3, damage: 4, windup: 0.5, interval: 1.6, parryMult: 1.3, poise: 5, combo: 1, range: 1.5, recover: 0.5,
  scale: 0.55, build: () => buildHusky(0.55),
};

const ENEMY_HP_SCALE = 0.9; // difficulty: enemies have 10% less health

export const MASCOTS = ROSTER.map((m, i) => {
  const base = tier(i);
  const def = { ...base, ...m, index: i };
  if (m.boss) {
    Object.assign(def, {
      hp: 420, damage: 16, speed: 5.8, windup: 0.44, interval: 1.0, parryMult: 0.65,
      poise: 75, combo: 3, abilityCd: 5, range: 2.4, recover: 0.4,
    });
  }
  def.hp = Math.round(def.hp * ENEMY_HP_SCALE);
  return def;
});
