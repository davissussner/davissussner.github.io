import * as THREE from 'three';
import { buildHerbie, collectMaterials, mesh, mat } from './models.js';
import { inCone, yawTo, angleDiff, flatDist } from './combat.js';

const COMBO = [
  { dur: 0.36, hit: 0.13, damage: 8, range: 2.3, arc: 150, lunge: 3.5, arm: 'R', stamina: 10 },
  { dur: 0.36, hit: 0.13, damage: 9, range: 2.3, arc: 150, lunge: 3.5, arm: 'L', stamina: 10 },
  { dur: 0.58, hit: 0.26, damage: 16, range: 2.7, arc: 170, lunge: 6, arm: 'R', stamina: 14, heavy: true },
];
const BASE_PARRY = 0.2;
const DODGE_TIME = 0.42;
const PARRY_TIME = 0.45;
const SPECIAL_TIME = 0.8;

export class Player {
  constructor(scene) {
    this.parts = buildHerbie();
    this.root = this.parts.root;
    scene.add(this.root);
    this.mats = collectMaterials(this.root);
    this.pos = this.root.position;
    this.knock = new THREE.Vector3();
    this.dodgeDir = new THREE.Vector3();
    this.flashColor = new THREE.Color();

    this.stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = mesh(new THREE.OctahedronGeometry(0.12), mat(0xffe14a, { emissive: 0xffc800, emissiveIntensity: 0.6 }));
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
      this.stars.add(s);
    }
    this.stars.position.y = this.parts.top + 0.35;
    this.stars.visible = false;
    this.root.add(this.stars);

    this.reset(new THREE.Vector3());
  }

  reset(pos) {
    this.pos.copy(pos);
    this.maxHp = 100;
    this.hp = 100;
    this.stamina = 100;
    this.special = 0;
    this.state = 'free';
    this.t = 0;
    this.iframe = 0;
    this.staminaDelay = 0;
    this.flash = 0;
    this.combo = 0;
    this.attackBuf = 0;
    this.hitDone = false;
    this.stunDur = 0;
    this.grabbedBy = null;
    this.grabT = 0;
    this.moveSpeed = 0;
    this.walkPhase = 0;
    this.dodgeCredited = false;
    this.facing = Math.PI; // face up the field (-Z)
    this.knock.set(0, 0, 0);
    this.parts.pivot.rotation.set(0, 0, 0);
    this.parts.pivot.position.y = 1;
    this.root.visible = true;
  }

  get dead() { return this.state === 'dead'; }
  get radius() { return 0.55; }
  get invulnerable() {
    return this.iframe > 0 || this.state === 'special' || (this.state === 'dodge' && this.t > 0.02 && this.t < 0.36);
  }

  spend(n) {
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = 0.6;
  }

  addSpecial(n) {
    this.special = Math.min(100, this.special + n);
  }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  update(dt, g) {
    const inp = g.input;
    const enabled = g.controlsEnabled && !this.dead;
    this.t += dt;
    this.iframe -= dt;
    this.staminaDelay -= dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.attackBuf -= dt;
    if (this.staminaDelay <= 0 && this.state !== 'dodge') this.stamina = Math.min(100, this.stamina + 34 * dt);

    // Camera-relative movement input.
    const f = enabled ? (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0) : 0;
    const r = enabled ? (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0) : 0;
    const yaw = g.camYaw;
    const move = new THREE.Vector3(-Math.sin(yaw) * f + Math.cos(yaw) * r, 0, -Math.cos(yaw) * f - Math.sin(yaw) * r);
    const moving = move.lengthSq() > 0.01;
    if (moving) move.normalize();

    const attackPressed = enabled && inp.hit('KeyP', 'Mouse0');
    const parryPressed = enabled && inp.hit('KeyO', 'Mouse2');
    const dodgePressed = enabled && inp.hit('KeyL');
    const specialPressed = enabled && inp.hit('KeyQ');
    if (attackPressed) this.attackBuf = 0.3;

    this.moveSpeed = 0;
    switch (this.state) {
      case 'free': {
        if (dodgePressed && this.stamina >= 18) this.startDodge(move, moving, g);
        else if (parryPressed && this.stamina >= 6) this.startParry(g);
        else if (specialPressed && this.special >= 100) this.startSpecial(g);
        else if (specialPressed) g.ui.float(this.pos, 'NOT READY', 'block', 2.6);
        else if (this.attackBuf > 0 && this.stamina >= 6) this.startAttack(0, g, move, moving);
        else if (moving) {
          const sprint = inp.down('ShiftLeft', 'ShiftRight') && this.stamina > 1;
          const speed = sprint ? 9.2 : 6.2;
          if (sprint) {
            this.stamina -= 24 * dt;
            this.staminaDelay = 0.4;
          }
          this.pos.addScaledVector(move, speed * dt);
          this.moveSpeed = speed;
          this.turnToward(Math.atan2(move.x, move.z), dt, 14);
        }
        break;
      }
      case 'attack': {
        const a = COMBO[this.combo];
        if (this.t < a.hit) {
          this.pos.x += Math.sin(this.facing) * a.lunge * dt;
          this.pos.z += Math.cos(this.facing) * a.lunge * dt;
        }
        if (!this.hitDone && this.t >= a.hit) {
          this.hitDone = true;
          this.doHit(a, g);
        }
        if (this.hitDone) {
          if (dodgePressed && this.stamina >= 18) { this.startDodge(move, moving, g); break; }
          if (parryPressed && this.stamina >= 6) { this.startParry(g); break; }
          if (this.t >= a.hit + 0.06 && this.attackBuf > 0 && this.combo < 2 && this.stamina >= 6) {
            this.startAttack(this.combo + 1, g, move, moving);
            break;
          }
        }
        if (this.t >= a.dur) {
          this.combo = 0;
          this.setState('free');
        }
        break;
      }
      case 'dodge': {
        const k = this.t / DODGE_TIME;
        this.pos.addScaledVector(this.dodgeDir, (15 * (1 - k) + 3) * dt);
        if (this.t >= DODGE_TIME) this.setState('free');
        break;
      }
      case 'parry':
        if (this.t >= PARRY_TIME) this.setState('free');
        break;
      case 'special':
        if (!this.hitDone && this.t >= 0.35) {
          this.hitDone = true;
          this.doSpecial(g);
        }
        if (this.t >= SPECIAL_TIME) this.setState('free');
        break;
      case 'hitstun':
        if (this.t >= this.stunDur) this.setState('free');
        break;
      case 'grabbed':
        if (attackPressed || parryPressed || dodgePressed) {
          this.grabT -= 0.18;
          g.ui.float(this.pos, 'MASH!', 'dodge', 2.8);
        }
        this.grabT -= dt;
        if (this.grabT <= 0 || !this.grabbedBy || !this.grabbedBy.alive) this.releaseGrab(g);
        break;
      case 'dead':
        break;
    }

    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-7 * dt));
    this.pos.y = 0;
    g.world.resolveCircle(this.pos, this.radius);

    this.animate(dt);
  }

  turnToward(target, dt, rate) {
    const d = angleDiff(this.facing, target);
    this.facing += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }

  // Face the nearest enemy unless the player is clearly steering somewhere else.
  aim(g, move, moving) {
    let best = null;
    let bestD = 7.5;
    for (const e of g.enemies) {
      if (!e.alive || e.hidden) continue;
      const d = flatDist(this.pos, e.pos);
      if (d < bestD) { best = e; bestD = d; }
    }
    if (g.lockTarget && g.lockTarget.alive && !g.lockTarget.hidden) best = g.lockTarget;
    const moveYaw = moving ? Math.atan2(move.x, move.z) : null;
    if (best) {
      const ey = yawTo(this.pos, best.pos);
      if (moveYaw === null || Math.abs(angleDiff(moveYaw, ey)) < 1.9 || best === g.lockTarget) {
        this.facing = ey;
        return;
      }
    }
    if (moveYaw !== null) this.facing = moveYaw;
  }

  startAttack(i, g, move, moving) {
    const a = COMBO[i];
    this.combo = i;
    this.attackBuf = 0;
    this.hitDone = false;
    this.spend(a.stamina);
    this.aim(g, move, moving);
    this.setState('attack');
    g.audio.swing();
  }

  doHit(a, g) {
    let any = false;
    for (const e of g.enemies) {
      if (!e.alive || e.hidden || e.pos.y > 2.2) continue;
      if (inCone(this.pos, this.facing, e.pos, a.range + e.radius, a.arc)) {
        any = true;
        g.hitEnemy(e, { damage: a.damage, from: this.pos, knockback: a.heavy ? 6 : 2.5, heavy: a.heavy });
      }
    }
    if (!any) g.audio.whiff();
  }

  startDodge(move, moving, g) {
    this.spend(22);
    this.dodgeCredited = false;
    if (moving) this.dodgeDir.copy(move);
    else this.dodgeDir.set(-Math.sin(this.facing), 0, -Math.cos(this.facing)); // hop backward
    this.facing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    this.combo = 0;
    this.setState('dodge');
    g.audio.dodge();
  }

  startParry(g) {
    this.spend(8);
    this.combo = 0;
    // Turn to face the nearest threat so the parry reads correctly.
    const e = g.enemies.find((en) => en.alive && !en.hidden && flatDist(en.pos, this.pos) < 6);
    if (e) this.facing = yawTo(this.pos, e.pos);
    this.setState('parry');
  }

  startSpecial(g) {
    this.special = 0;
    this.hitDone = false;
    this.aim(g, new THREE.Vector3(), false);
    this.setState('special');
    g.ui.callout('CORN-FED HAYMAKER!', 'good', 1.2);
  }

  doSpecial(g) {
    const center = this.pos.clone();
    center.x += Math.sin(this.facing) * 1.2;
    center.z += Math.cos(this.facing) * 1.2;
    g.fx.ring(center, 6, 0xffcd00, 0.5);
    g.fx.ring(center, 4, 0xd00000, 0.4);
    g.fx.burst(center, 0xffe066, 30, 9, 0.16, 0.7);
    g.audio.special();
    g.shake(0.6);
    g.hitstop(0.12);
    for (const e of g.enemies) {
      if (!e.alive || e.hidden) continue;
      if (flatDist(center, e.pos) < 5.5 + e.radius) {
        g.hitEnemy(e, { damage: 34, from: center, knockback: 14, heavy: true, special: true });
      }
    }
  }

  // Called by anything that damages Herbie. Returns 'parried' | 'dodged' | 'hit' | 'none'.
  receiveHit(atk) {
    if (this.dead) return 'none';
    if (this.invulnerable) return 'dodged';
    if (this.state === 'parry') {
      const mult = atk.source?.def?.parryMult ?? 1;
      const window = BASE_PARRY * mult * (atk.projectile ? 1.4 : 1);
      if (atk.parryable !== false && this.t <= window) {
        this.flashColor.setHex(0xffd84a);
        this.flash = 1;
        this.setState('free');
        return 'parried';
      }
    }
    this.hp = Math.max(0, this.hp - atk.damage);
    this.flashColor.setHex(0xff2020);
    this.flash = 1;
    if (atk.from && atk.knockback) {
      const dx = this.pos.x - atk.from.x;
      const dz = this.pos.z - atk.from.z;
      const d = Math.hypot(dx, dz) || 1;
      this.knock.set((dx / d) * atk.knockback, 0, (dz / d) * atk.knockback);
    }
    if (this.hp <= 0) {
      this.state = 'dead';
      this.t = 0;
      this.grabbedBy = null;
      return 'hit';
    }
    if (!atk.noFlinch && this.state !== 'grabbed') {
      this.combo = 0;
      this.stunDur = atk.stun ?? 0.28;
      this.setState('hitstun');
    }
    this.iframe = atk.noFlinch ? 0 : 0.35;
    return 'hit';
  }

  stun(dur) {
    if (this.dead || this.invulnerable) return false;
    this.stunDur = dur;
    this.combo = 0;
    this.setState('hitstun');
    return true;
  }

  grab(enemy, dur) {
    if (this.dead || this.invulnerable) return false;
    this.grabbedBy = enemy;
    this.grabT = dur;
    this.combo = 0;
    this.setState('grabbed');
    return true;
  }

  releaseGrab() {
    const e = this.grabbedBy;
    this.grabbedBy = null;
    if (this.dead) return;
    if (e) {
      const dx = this.pos.x - e.pos.x;
      const dz = this.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.knock.set((dx / d) * 10, 0, (dz / d) * 10);
    }
    this.stunDur = 0.35;
    this.iframe = 0.6;
    this.setState('hitstun');
  }

  animate(dt) {
    const p = this.parts;
    const lerp = (obj, key, target, rate = 18) => {
      obj[key] += (target - obj[key]) * Math.min(1, rate * dt);
    };
    this.root.rotation.y = this.facing;

    let armRx = 0, armLx = 0, armRz = 0, armLz = 0, legAmt = 0, pivotX = 0, pivotY = 1;
    if (this.moveSpeed > 0) {
      this.walkPhase += dt * this.moveSpeed * 1.7;
      legAmt = this.moveSpeed > 7 ? 1 : 0.75;
      armRx = Math.sin(this.walkPhase) * 0.7 * legAmt;
      armLx = -armRx;
    }
    switch (this.state) {
      case 'attack': {
        const a = COMBO[this.combo];
        const k = this.t / a.hit;
        const reach = a.heavy ? (k < 1 ? -2.8 : -1.2) : (k < 1 ? 0.5 : -1.6);
        if (a.arm === 'R') { armRx = reach; armLx = 0.3; } else { armLx = reach; armRx = 0.3; }
        break;
      }
      case 'parry':
        armRx = -1.9; armLx = -1.9; armRz = 0.5; armLz = -0.5;
        break;
      case 'dodge':
        pivotX = (this.t / DODGE_TIME) * Math.PI * 2;
        break;
      case 'special':
        armRx = this.t < 0.35 ? -3 : -1.4;
        armLx = this.t < 0.35 ? -3 : 0.4;
        break;
      case 'hitstun':
        pivotX = -0.25;
        armRz = -0.4; armLz = 0.4;
        break;
      case 'grabbed':
        armRz = -0.1; armLz = 0.1; pivotX = -0.1;
        legAmt = 0.4;
        this.walkPhase += dt * 20;
        break;
      case 'dead':
        pivotX = -Math.PI / 2;
        pivotY = 0.35;
        break;
    }
    if (this.state === 'dodge') p.pivot.rotation.x = pivotX;
    else lerp(p.pivot.rotation, 'x', pivotX, 10);
    lerp(p.pivot.position, 'y', pivotY, 8);
    lerp(p.armR.rotation, 'x', armRx, 22);
    lerp(p.armL.rotation, 'x', armLx, 22);
    lerp(p.armR.rotation, 'z', armRz, 22);
    lerp(p.armL.rotation, 'z', armLz, 22);
    p.legL.rotation.x = Math.sin(this.walkPhase) * 0.8 * legAmt;
    p.legR.rotation.x = -Math.sin(this.walkPhase) * 0.8 * legAmt;

    const stunned = this.state === 'hitstun' && this.stunDur > 0.6;
    this.stars.visible = stunned;
    if (stunned) this.stars.rotation.y += dt * 6;

    for (const m of this.mats) {
      m.emissive.copy(this.flashColor);
      m.emissiveIntensity = this.flash * 0.8;
    }
    // Blink while invulnerable after a hit.
    this.root.visible = !(this.iframe > 0 && this.state !== 'dodge' && Math.floor(this.iframe * 20) % 2 === 0);
  }
}
