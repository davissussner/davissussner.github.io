import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const tmp = new THREE.Vector3();

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), playerHp: $('player-hp'), stamina: $('player-stamina'), special: $('player-special'),
      specialBar: $('player-special').parentElement, enemyPanel: $('enemy-panel'), enemyName: $('enemy-name'),
      enemySchool: $('enemy-school'), enemyHp: $('enemy-hp'), progress: $('progress'), objective: $('objective'),
      callout: $('callout'), floatLayer: $('float-layer'), intro: $('intro-card'),
    };
    this.floats = [];
    this.calloutT = 0;
  }

  show(id) { $(id).classList.remove('hidden'); }
  hide(id) { $(id).classList.add('hidden'); }
  setHud(on) { this.el.hud.classList.toggle('hidden', !on); }

  updatePlayer(p) {
    this.el.playerHp.style.width = `${(p.hp / p.maxHp) * 100}%`;
    this.el.stamina.style.width = `${p.stamina}%`;
    this.el.special.style.width = `${p.special}%`;
    const ready = p.special >= 100;
    this.el.specialBar.classList.toggle('ready', ready);
    $('special-label').textContent = ready ? 'HAYMAKER READY — Q' : 'HAYMAKER';
  }

  setEnemy(e) {
    const p = this.el.enemyPanel;
    p.classList.remove('hidden', 'enraged');
    p.classList.toggle('boss', !!e.def.boss);
    p.style.setProperty('--enemy-color', hex(e.def.colors.primary === 0x111111 ? 0xffcd00 : e.def.colors.primary));
    this.el.enemyName.textContent = e.def.name;
    this.el.enemySchool.textContent = e.def.school.toUpperCase() + (e.def.boss ? ' · FINAL BOSS' : '');
    this.updateEnemy(e);
  }

  updateEnemy(e) {
    this.el.enemyHp.style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
  }

  hideEnemy() { this.el.enemyPanel.classList.add('hidden'); }
  setEnraged(on) { this.el.enemyPanel.classList.toggle('enraged', on); }

  setProgress(i, total) { this.el.progress.textContent = `OPPONENT ${i + 1} / ${total}`; }
  objective(text) { this.el.objective.textContent = text; }

  callout(text, cls = '', dur = 1.2) {
    const c = this.el.callout;
    c.textContent = text;
    c.className = 'show ' + cls;
    this.calloutT = dur;
  }

  // Floating text anchored to a world position (damage numbers, PARRY!, etc.).
  float(pos, text, cls = 'dmg', yOff = 2.4) {
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = text;
    this.el.floatLayer.appendChild(el);
    this.floats.push({
      el, life: 0.9, max: 0.9,
      pos: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.6, pos.y + yOff, pos.z),
    });
  }

  showIntro(def, i, total) {
    const c = this.el.intro;
    c.classList.remove('hidden');
    c.classList.toggle('boss', !!def.boss);
    // Re-trigger the slam animation.
    c.style.animation = 'none';
    void c.offsetWidth;
    c.style.animation = '';
    c.style.setProperty('--intro-color', hex(def.colors.primary === 0x111111 ? 0xffcd00 : def.colors.primary));
    $('intro-count').textContent = def.boss ? '· FINAL BOSS' : `· ${i + 1} OF ${total}`;
    $('intro-school').textContent = def.school.toUpperCase();
    $('intro-name').textContent = def.name;
    $('intro-ability').textContent = `Ability: ${def.abilityName}`;
    $('intro-tip').textContent = def.tip;
  }

  hideIntro() { this.el.intro.classList.add('hidden'); }

  clearFloats() {
    for (const f of this.floats) f.el.remove();
    this.floats.length = 0;
  }

  update(dt, camera) {
    if (this.calloutT > 0) {
      this.calloutT -= dt;
      if (this.calloutT <= 0) this.el.callout.classList.remove('show');
    }
    const w = innerWidth;
    const h = innerHeight;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.pos.y += dt * 1.4;
      tmp.copy(f.pos).project(camera);
      const k = f.life / f.max;
      if (f.life <= 0 || tmp.z > 1) {
        f.el.remove();
        this.floats.splice(i, 1);
        continue;
      }
      f.el.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`;
      f.el.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
      f.el.style.opacity = Math.min(1, k * 2.5);
    }
  }
}
