import * as THREE from 'three';
import { collectMaterials, mesh, mat } from './models.js';
import { inCone, yawTo, angleDiff, flatDist } from './combat.js';

function alertMaterial(text, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 100px Bungee, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, 64, 70);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
}
const ALERT_PARRY = alertMaterial('!', '#ffd23a');
const ALERT_DODGE = alertMaterial('!!', '#ff3b30');
const TELE_PARRY = new THREE.Color(0xffc400);
const TELE_DODGE = new THREE.Color(0xff1a00);
const WHITE = new THREE.Color(0xffffff);
const RAGE = new THREE.Color(0xff2200);

export class Enemy {
  constructor(def, scene, opts = {}) {
    this.def = def;
    this.scene = scene;
    this.parts = def.build();
    this.root = this.parts.root;
    this.scale = def.scale ?? 1;
    this.root.scale.setScalar(this.scale);
    scene.add(this.root);
    this.mats = collectMaterials(this.root);
    this.pos = this.root.position;
    this.radius = def.radius ?? 0.6 * this.scale;
    this.height = (this.parts.top ?? 2.6) * this.scale;

    this.maxHp = def.hp;
    this.hp = def.hp;
    this.minion = !!opts.minion;
    this.ability = def.ability ? def.ability() : null;
    this.facing = 0;
    this.state = 'idle';
    this.t = 0;
    this.attackCd = def.interval * 0.5;
    this.abilityCd = (def.abilityCd ?? 8) * 0.55;
    this.comboLeft = 0;
    this.struck = false;
    this.telegraph = 0;
    this.teleParryable = true;
    this.flash = 0;
    this.poiseDmg = 0;
    this.speedMul = 1;
    this.dmgMul = 1;
    this.windupMul = 1;
    this.invuln = false;
    this.frontBlock = false;
    this.hidden = false;
    this.rage = false;
    this.hideUsed = false;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.stuckT = 0;
    this.detourT = 0;
    this.spinAngle = 0;
    this.knock = new THREE.Vector3();
    this.walkPhase = Math.random() * 6;
    this.moveSpeed = 0;
    this.pose = {};
    this.tmpColor = new THREE.Color();

    this.alert = new THREE.Sprite(ALERT_PARRY);
    this.alert.scale.setScalar(0.9 / this.scale);
    this.alert.position.y = (this.parts.top ?? 2.6) + 0.7;
    this.alert.visible = false;
    this.alert.renderOrder = 10;
    this.root.add(this.alert);

    this.stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = mesh(new THREE.OctahedronGeometry(0.13), mat(0xffe14a, { emissive: 0xffc800, emissiveIntensity: 0.7 }));
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      this.stars.add(s);
    }
    this.stars.position.y = (this.parts.top ?? 2.6) + 0.3;
    this.stars.visible = false;
    this.root.add(this.stars);
  }

  get alive() { return this.state !== 'dead'; }
  get speed() { return this.def.speed * this.speedMul; }
  get damage() { return this.def.damage * this.dmgMul; }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  start() {
    this.setState('chase');
  }

  update(dt, g) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.telegraph = 0;
    this.poiseDmg = Math.max(0, this.poiseDmg - this.def.poise * 0.2 * dt);
    this.pose = {};
    this.moveSpeed = 0;
    const pl = g.player;

    if (this.alive && this.state !== 'idle') this.def.passive?.(this, dt, g);

    switch (this.state) {
      case 'idle':
        this.face(pl.pos, dt, 4);
        break;
      case 'chase':
        this.updateChase(dt, g);
        break;
      case 'windup': {
        const dur = this.windupTime;
        this.face(pl.pos, dt, 9);
        this.telegraph = Math.min(1, this.t / dur);
        this.teleParryable = true;
        this.pose.armRx = -2.6 * this.telegraph;
        this.pose.pivotX = -0.15 * this.telegraph;
        if (this.t >= dur) {
          this.struck = false;
          this.setState('strike');
          g.audio.swing();
        }
        break;
      }
      case 'strike': {
        this.pose.armRx = -1.3;
        this.pose.pivotX = 0.2;
        if (this.t < 0.14) this.stepForward(7 * this.speedMul, dt);
        if (!this.struck && this.t >= 0.08) {
          this.struck = true;
          if (!pl.dead && inCone(this.pos, this.facing, pl.pos, this.def.range + 0.75, 110)) {
            const res = g.hitPlayer({ damage: this.damage, parryable: true, from: this.pos, source: this, knockback: 5 });
            if (res === 'parried') break;
          }
        }
        if (this.t >= 0.3) {
          if (this.comboLeft > 1) {
            this.comboLeft--;
            this.windupTime = this.def.windup * this.windupMul * 0.55;
            this.setState('windup');
          } else this.setState('recover');
        }
        break;
      }
      case 'recover':
        this.face(pl.pos, dt, 3);
        if (this.t >= (this.recoverTime ?? this.def.recover)) {
          this.recoverTime = null;
          this.attackCd = this.followUp ? 0 : this.def.interval * (0.7 + Math.random() * 0.5) * (this.rage ? 0.7 : 1);
          this.followUp = false;
          this.setState('chase');
        }
        break;
      case 'stagger':
        this.pose.pivotX = -0.2;
        this.pose.armRz = -0.6;
        this.pose.armLz = 0.6;
        this.root.rotation.z = Math.sin(this.t * 12) * 0.08;
        if (this.t >= this.staggerDur) {
          this.root.rotation.z = 0;
          this.attackCd = Math.min(this.attackCd, 0.4);
          this.setState('chase');
        }
        break;
      case 'ability': {
        const done = this.ability.update(this, dt, g);
        if (this.state === 'ability' && done) {
          this.endAbility(g);
          this.abilityCd = this.def.abilityCd * (this.rage ? 0.6 : 1) * (0.85 + Math.random() * 0.3);
          this.setState('recover');
          if (this.followUp) this.recoverTime = 0.1;
        }
        break;
      }
      case 'hide':
        this.updateHide(dt, g);
        break;
      case 'dead':
        this.pose.pivotX = -Math.PI / 2;
        this.pose.pivotY = 0.35 * (this.parts.lieHeight ?? 1);
        if (this.t > 2.5) this.pos.y -= dt * 0.6;
        if (this.t > 4.5) this.root.visible = false;
        break;
    }

    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-7 * dt));
    if (this.state !== 'ability' && this.state !== 'dead') this.pos.y = 0;
    if (!this.hidden && this.pos.y < 1.5 && this.state !== 'dead') g.world.resolveCircle(this.pos, this.radius);

    this.animate(dt);
  }

  updateChase(dt, g) {
    const pl = g.player;
    const dist = flatDist(this.pos, pl.pos);
    if (pl.dead) {
      this.face(pl.pos, dt, 3);
      return;
    }
    this.attackCd -= dt;
    if (this.ability) this.abilityCd -= dt;
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = 1.5 + Math.random() * 2;
      if (Math.random() < 0.5) this.strafeDir *= -1;
    }

    if (this.ability && this.abilityCd <= 0 && this.ability.canUse(this, g)) {
      this.setState('ability');
      this.ability.start(this, g);
      return;
    }
    if (!this.minion && !this.hideUsed && !this.def.boss && this.hp < this.maxHp * 0.3) {
      this.hideUsed = true;
      this.coverSpot = this.findCover(g);
      if (this.coverSpot) {
        g.ui.callout(`${this.def.short} runs for cover!`, '', 1.4);
        this.setState('hide');
        return;
      }
    }

    const range = this.def.range;
    if (dist > range + 0.2) {
      this.moveToward(pl.pos, this.speed, dt, g);
    } else {
      // In range: circle a little, then attack.
      this.face(pl.pos, dt, 8);
      const px = pl.pos.x - this.pos.x;
      const pz = pl.pos.z - this.pos.z;
      const d = Math.hypot(px, pz) || 1;
      const sx = (-pz / d) * this.strafeDir;
      const sz = (px / d) * this.strafeDir;
      const back = dist < range * 0.6 ? -0.6 : 0;
      this.pos.x += (sx * 0.35 + (px / d) * back) * this.speed * dt;
      this.pos.z += (sz * 0.35 + (pz / d) * back) * this.speed * dt;
      this.moveSpeed = this.speed * 0.35;
      if (this.attackCd <= 0) this.beginAttack();
    }
  }

  beginAttack() {
    this.comboLeft = this.def.combo;
    this.windupTime = this.def.windup * this.windupMul;
    this.setState('windup');
  }

  // Walk toward a point, detouring sideways when a barrier is in the way.
  moveToward(target, speed, dt, g) {
    const before = this.pos.clone();
    let dx = target.x - this.pos.x;
    let dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    if (this.detourT > 0) {
      this.detourT -= dt;
      const sx = -dz * this.strafeDir;
      const sz = dx * this.strafeDir;
      dx = sx * 0.85 + dx * 0.15;
      dz = sz * 0.85 + dz * 0.15;
    }
    this.pos.x += dx * speed * dt;
    this.pos.z += dz * speed * dt;
    this.turnTo(Math.atan2(dx, dz), dt, 10);
    this.moveSpeed = speed;
    g.world.resolveCircle(this.pos, this.radius);
    const moved = flatDist(before, this.pos);
    if (moved < speed * dt * 0.35) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.25 && this.detourT <= 0) {
      this.detourT = 0.9;
      this.stuckT = 0;
    }
  }

  findCover(g) {
    let best = null;
    let bestD = 14;
    for (const b of g.world.barriers) {
      if (b.h < 1.2) continue;
      if (g.arena && flatDist(b, g.arena) > g.arenaRadius - 2) continue;
      const d = flatDist(b, this.pos);
      if (d >= bestD) continue;
      // Stand on the far side of the barrier from Herbie.
      const ax = b.x - g.player.pos.x;
      const az = b.z - g.player.pos.z;
      const al = Math.hypot(ax, az) || 1;
      const off = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + this.radius + 0.6;
      best = new THREE.Vector3(b.x + (ax / al) * off, 0, b.z + (az / al) * off);
      bestD = d;
    }
    return best;
  }

  updateHide(dt, g) {
    const d = flatDist(this.pos, this.coverSpot);
    if (d > 0.6 && this.t < 3) {
      this.moveToward(this.coverSpot, this.speed * 1.15, dt, g);
    } else {
      this.face(g.player.pos, dt, 4);
      this.pose.pivotY = 0.85;
      if (!this.healed && this.t > 1.2) {
        this.healed = true;
        const heal = Math.round(this.maxHp * 0.08);
        this.hp = Math.min(this.maxHp, this.hp + heal);
        g.ui.float(this.pos, `+${heal}`, 'dodge', this.height);
      }
    }
    if (this.t > 3.6 || (d <= 0.6 && flatDist(this.pos, g.player.pos) < 2.5)) {
      this.attackCd = 0;
      this.setState('chase');
    }
  }

  stepForward(speed, dt) {
    this.pos.x += Math.sin(this.facing) * speed * dt;
    this.pos.z += Math.cos(this.facing) * speed * dt;
  }

  face(target, dt, rate) {
    this.turnTo(yawTo(this.pos, target), dt, rate);
  }

  turnTo(yaw, dt, rate) {
    const d = angleDiff(this.facing, yaw);
    this.facing += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }

  // Shows the attack warning. Yellow ! = parry it, red !! = dodge or take cover.
  warn(level, parryable = true) {
    this.telegraph = Math.max(this.telegraph, level);
    this.teleParryable = parryable;
  }

  endAbility(g) {
    if (this.state === 'ability') this.ability?.abort?.(this, g);
    this.invuln = false;
    this.frontBlock = false;
    this.hidden = false;
    this.root.visible = true;
    this.spinAngle = 0;
    if (this.state !== 'dead') this.pos.y = 0;
  }

  stagger(dur, g) {
    if (!this.alive) return;
    this.endAbility(g);
    this.staggerDur = dur;
    this.comboLeft = 0;
    this.setState('stagger');
  }

  // Herbie hits this enemy. Returns 'hit' | 'blocked' | 'immune' | 'none'.
  receiveHit(atk, g) {
    if (!this.alive || this.hidden) return 'none';
    if (this.invuln) return 'immune';
    if (this.frontBlock && !atk.special && Math.abs(angleDiff(this.facing, yawTo(this.pos, atk.from))) < 1.25) {
      return 'blocked';
    }
    let dmg = atk.damage;
    if (this.state === 'stagger') dmg *= 1.5; // riposte bonus
    dmg = Math.round(dmg);
    this.lastDamage = dmg;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 1;
    if (atk.from && atk.knockback) {
      const dx = this.pos.x - atk.from.x;
      const dz = this.pos.z - atk.from.z;
      const d = Math.hypot(dx, dz) || 1;
      const k = atk.knockback * (this.def.boss ? 0.45 : 1) / this.scale;
      this.knock.set((dx / d) * k, 0, (dz / d) * k);
    }
    if (this.hp <= 0) {
      this.die(g);
      return 'hit';
    }
    this.poiseDmg += dmg;
    if (this.state !== 'stagger' && (atk.special || this.poiseDmg >= this.def.poise)) {
      this.poiseDmg = 0;
      this.stagger(atk.special ? 1.5 : 0.7, g);
    }
    return 'hit';
  }

  die(g) {
    this.endAbility(g);
    this.root.rotation.z = 0;
    this.telegraph = 0;
    this.setState('dead');
  }

  remove() {
    this.scene.remove(this.root);
  }

  animate(dt) {
    const p = this.parts;
    const ps = this.pose;
    const lerp = (obj, key, target, rate = 18) => {
      obj[key] += (target - obj[key]) * Math.min(1, rate * dt);
    };
    this.spinAngle += (ps.spin ?? 0) * dt;
    this.root.rotation.y = this.facing + this.spinAngle;

    let legAmt = 0;
    let swing = 0;
    if (this.moveSpeed > 0) {
      this.walkPhase += dt * this.moveSpeed * 1.8;
      legAmt = Math.min(1, 0.5 + this.moveSpeed / 12);
      swing = Math.sin(this.walkPhase);
    }
    lerp(p.armR.rotation, 'x', ps.armRx ?? swing * 0.7 * legAmt, 20);
    lerp(p.armL.rotation, 'x', ps.armLx ?? -swing * 0.7 * legAmt, 20);
    lerp(p.armR.rotation, 'z', ps.armRz ?? 0, 20);
    lerp(p.armL.rotation, 'z', ps.armLz ?? 0, 20);
    lerp(p.pivot.rotation, 'x', ps.pivotX ?? 0, 10);
    lerp(p.pivot.position, 'y', ps.pivotY ?? 1, 10);
    lerp(p.head.rotation, 'x', ps.headX ?? 0, 10);
    p.legL.rotation.x = swing * 0.8 * legAmt;
    p.legR.rotation.x = -swing * 0.8 * legAmt;
    if (p.quadLegs) {
      p.quadLegs.forEach((l, i) => { l.rotation.x = Math.sin(this.walkPhase + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * 0.7 * legAmt; });
    }

    const showAlert = this.telegraph > 0.05 && this.alive;
    this.alert.visible = showAlert;
    if (showAlert) {
      this.alert.material = this.teleParryable ? ALERT_PARRY : ALERT_DODGE;
      this.alert.scale.setScalar((0.7 + this.telegraph * 0.5) / this.scale);
    }
    this.stars.visible = this.state === 'stagger';
    if (this.stars.visible) this.stars.rotation.y += dt * 6;

    let color = null;
    let intensity = 0;
    if (this.flash > 0) {
      color = WHITE;
      intensity = this.flash * 0.9;
    } else if (this.telegraph > 0) {
      color = this.teleParryable ? TELE_PARRY : TELE_DODGE;
      intensity = this.telegraph * (0.45 + 0.25 * Math.sin(performance.now() / 45));
    } else if (this.rage) {
      color = RAGE;
      intensity = 0.25 + 0.1 * Math.sin(performance.now() / 120);
    }
    for (const m of this.mats) {
      if (color) m.emissive.copy(color);
      else m.emissive.setHex(0x000000);
      m.emissiveIntensity = intensity;
    }
  }
}
