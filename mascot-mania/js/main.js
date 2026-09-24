import * as THREE from 'three';
import { World, arenaCenter, ARENA_RADIUS, APPROACH } from './world.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { MASCOTS } from './mascots.js';
import { FX } from './fx.js';
import { Projectiles, Shockwaves, flatDist, angleDiff } from './combat.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { sfx, initAudio, toggleMute } from './audio.js';

const SAVE_KEY = 'mascotMania.stage';
const TOTAL = MASCOTS.length;
const ENEMY_DAMAGE_SCALE = 0.9; // difficulty: enemies deal 10% less damage

// ---------- Renderer & scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const world = new World(scene, MASCOTS);
const player = new Player(scene);
const fx = new FX(scene);
const projectiles = new Projectiles(scene);
const shockwaves = new Shockwaves();
const ui = new UI();
const input = new Input(canvas);

// ---------- Game state ----------
let mode = 'title'; // title | travel | intro | fight | cleared | defeat | victory
let paused = false;
let stage = 0;
let boss = null;
let modeT = 0;
let hitstopT = 0;
let shakeAmt = 0;
let camPitch = 0.38;
const camTarget = new THREE.Vector3();

// Shared context handed to the player, enemies, abilities and projectiles.
const g = {
  scene, world, player, fx, ui, input, projectiles, shockwaves,
  audio: sfx,
  enemies: [],
  camYaw: 0,
  controlsEnabled: false,
  arena: null,
  arenaRadius: ARENA_RADIUS,
  lockTarget: null,

  hitPlayer(atk) {
    atk = { ...atk, damage: atk.damage * ENEMY_DAMAGE_SCALE };
    const res = player.receiveHit(atk);
    const chest = player.pos.clone();
    chest.y = 1.4;
    if (res === 'parried') {
      sfx.parry();
      chest.x += Math.sin(player.facing) * 0.6;
      chest.z += Math.cos(player.facing) * 0.6;
      fx.burst(chest, 0xffe066, 16, 7, 0.1, 0.4);
      ui.float(player.pos, 'PARRY!', 'parry', 2.9);
      g.hitstop(0.09);
      g.shake(0.2);
      player.addSpecial(22);
      if (atk.source && atk.source.alive && !atk.projectile) atk.source.stagger(1.3, g);
    } else if (res === 'hit') {
      sfx.hurt();
      fx.burst(chest, 0xff3030, 8, 4, 0.1, 0.4);
      ui.float(player.pos, `-${Math.round(atk.damage)}`, 'hurt', 2.6);
      if (!atk.noFlinch) {
        g.shake(0.3);
        g.hitstop(0.05);
      }
      if (player.dead) sfx.ko();
    } else if (res === 'dodged' && player.state === 'dodge' && !player.dodgeCredited) {
      player.dodgeCredited = true;
      ui.float(player.pos, 'DODGE', 'dodge', 2.6);
      player.addSpecial(6);
    }
    return res;
  },

  hitEnemy(e, atk) {
    const res = e.receiveHit(atk, g);
    const top = e.pos.clone();
    top.y += e.height * 0.6;
    if (res === 'hit') {
      if (atk.heavy) sfx.heavy(); else sfx.hit();
      fx.burst(top, 0xffffff, 8, 5, 0.1, 0.35);
      fx.burst(top, e.def.colors.primary, 6, 4, 0.1, 0.5);
      ui.float(e.pos, `${e.lastDamage}`, atk.heavy ? 'big' : 'dmg', e.height + 0.3);
      g.hitstop(atk.heavy ? 0.08 : 0.045);
      g.shake(atk.heavy ? 0.25 : 0.1);
      if (!atk.special) player.addSpecial(e.lastDamage * 0.7);
      if (!e.alive) sfx.ko();
    } else if (res === 'blocked') {
      sfx.block();
      fx.burst(top, 0xdddddd, 6, 4, 0.08, 0.3);
      ui.float(e.pos, 'BLOCKED', 'block', e.height + 0.3);
      const dx = player.pos.x - e.pos.x;
      const dz = player.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      player.knock.set((dx / d) * 6, 0, (dz / d) * 6);
    } else if (res === 'immune') {
      sfx.block();
      ui.float(e.pos, 'IMMUNE', 'block', e.height + 0.3);
    }
    return res;
  },

  shake(a) { shakeAmt = Math.max(shakeAmt, a); },
  hitstop(t) { hitstopT = Math.max(hitstopT, t); },

  spawnMinion(def, pos) {
    const m = new Enemy(def, scene, { minion: true });
    m.pos.copy(pos);
    m.facing = boss ? boss.facing : 0;
    m.start();
    g.enemies.push(m);
    return m;
  },
};

// ---------- Save data (optional; the game works without it) ----------
function loadStage() {
  try {
    const n = parseInt(localStorage.getItem(SAVE_KEY), 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(TOTAL - 1, n)) : 0;
  } catch (e) {
    return 0;
  }
}
function saveStage(n) {
  try { localStorage.setItem(SAVE_KEY, String(n)); } catch (e) { /* storage unavailable */ }
}

const params = new URLSearchParams(location.search);
const debugStage = parseInt(params.get('stage'), 10);
let savedStage = Number.isFinite(debugStage) ? Math.max(0, Math.min(TOTAL - 1, debugStage - 1)) : loadStage();

// ---------- Flow ----------
function clearCombat() {
  for (const e of g.enemies) e.remove();
  g.enemies = [];
  boss = null;
  projectiles.clear();
  shockwaves.clear();
  fx.clear();
  ui.clearFloats();
  g.lockTarget = null;
  g.arena = null;
  world.arenas.forEach((a, i) => world.setArenaActive(i, false));
  ui.hideEnemy();
}

function setMode(m) {
  mode = m;
  modeT = 0;
}

function hideScreens() {
  for (const id of ['screen-title', 'screen-pause', 'screen-defeat', 'screen-victory']) ui.hide(id);
}

function beginRun(i) {
  initAudio();
  hideScreens();
  clearCombat();
  stage = i;
  const c = arenaCenter(i);
  player.reset(new THREE.Vector3(c.x, 0, c.z + APPROACH));
  g.camYaw = 0;
  camTarget.set(player.pos.x, 1.9, player.pos.z);
  paused = false;
  ui.setHud(true);
  ui.hideIntro();
  startTravel();
  input.lock();
}

function startTravel() {
  setMode('travel');
  g.controlsEnabled = true;
  const def = MASCOTS[stage];
  ui.setProgress(stage, TOTAL);
  ui.objective(`Head up the field. Next up: ${def.name} (${def.school}).`);
}

function enterArena() {
  const c = arenaCenter(stage);
  const def = MASCOTS[stage];
  setMode('intro');
  g.controlsEnabled = false;
  g.arena = c;
  world.setArenaActive(stage, true);
  boss = new Enemy(def, scene);
  boss.pos.set(c.x, 0, c.z - 7);
  boss.facing = 0;
  g.enemies = [boss];
  g.lockTarget = null;
  ui.showIntro(def, stage, TOTAL);
  ui.setEnemy(boss);
  ui.objective('');
}

function startFight() {
  setMode('fight');
  ui.hideIntro();
  boss.start();
  g.controlsEnabled = true;
  sfx.whistle();
  ui.callout('FIGHT!', 'good', 0.9);
}

function winFight() {
  setMode('cleared');
  const def = MASCOTS[stage];
  for (const e of g.enemies) if (e.alive) e.die(g);
  projectiles.clear();
  shockwaves.clear();
  sfx.cheer();
  ui.callout(`${def.name} is down!`, 'good', 2.2);
  const heal = Math.round((player.maxHp - player.hp) * 0.5);
  if (heal > 0 && stage < TOTAL - 1) {
    player.hp += heal;
    ui.float(player.pos, `+${heal} HP`, 'dodge', 2.8);
  }
  player.stamina = 100;
  saveStage(Math.min(stage + 1, TOTAL - 1));
  if (stage + 1 < TOTAL) savedStage = stage + 1;
}

function retryFight() {
  initAudio();
  hideScreens();
  clearCombat();
  const c = arenaCenter(stage);
  player.reset(new THREE.Vector3(c.x, 0, c.z + ARENA_RADIUS - 3));
  g.camYaw = 0;
  paused = false;
  ui.setHud(true);
  ui.setProgress(stage, TOTAL);
  enterArena();
  input.lock();
}

function toTitle() {
  clearCombat();
  hideScreens();
  ui.hideIntro();
  ui.setHud(false);
  paused = false;
  g.controlsEnabled = false;
  setMode('title');
  player.reset(new THREE.Vector3(0, 0, APPROACH + 2));
  input.unlock();
  refreshTitle();
  ui.show('screen-title');
}

function refreshTitle() {
  const btn = document.getElementById('btn-continue');
  if (savedStage > 0) {
    btn.textContent = `Continue: ${MASCOTS[savedStage].name} (${savedStage + 1}/${TOTAL})`;
    btn.classList.remove('hidden');
    document.getElementById('btn-new').classList.remove('primary');
  } else {
    btn.classList.add('hidden');
    document.getElementById('btn-new').classList.add('primary');
  }
}

const active = () => ['travel', 'intro', 'fight', 'cleared'].includes(mode);

function pause() {
  if (!active() || paused) return;
  paused = true;
  ui.show('screen-pause');
}

function resume() {
  paused = false;
  ui.hide('screen-pause');
  initAudio();
  input.lock();
}

let lockSeen = false;
input.onLockChange = (locked) => {
  if (locked) lockSeen = true;
  else if (lockSeen) pause();
};

canvas.addEventListener('mousedown', () => {
  if (active() && !paused && !input.locked) input.lock();
});

const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
on('btn-new', () => { savedStage = 0; saveStage(0); beginRun(0); });
on('btn-continue', () => beginRun(savedStage));
on('btn-resume', resume);
on('btn-quit', toTitle);
on('btn-retry', retryFight);
on('btn-defeat-quit', toTitle);
on('btn-again', () => { savedStage = 0; saveStage(0); beginRun(0); });
on('btn-mute', (e) => { e.target.textContent = toggleMute() ? 'Sound: off' : 'Sound: on'; });

if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) {
  document.getElementById('no-mouse').classList.remove('hidden');
}

// ---------- Per-frame ----------
function keepInArena(obj, r) {
  if (!g.arena) return;
  const dx = obj.pos.x - g.arena.x;
  const dz = obj.pos.z - g.arena.z;
  const d = Math.hypot(dx, dz);
  const max = ARENA_RADIUS - r;
  if (d > max) {
    obj.pos.x = g.arena.x + (dx / d) * max;
    obj.pos.z = g.arena.z + (dz / d) * max;
  }
}

function separate() {
  for (const e of g.enemies) {
    if (!e.alive || e.hidden || e.pos.y > 1.5 || player.grabbedBy === e) continue;
    const dx = player.pos.x - e.pos.x;
    const dz = player.pos.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    const min = player.radius + e.radius;
    if (d < min && d > 1e-4) {
      const push = min - d;
      player.pos.x += (dx / d) * push * 0.6;
      player.pos.z += (dz / d) * push * 0.6;
      e.pos.x -= (dx / d) * push * 0.4;
      e.pos.z -= (dz / d) * push * 0.4;
    }
  }
  for (let i = 0; i < g.enemies.length; i++) {
    for (let j = i + 1; j < g.enemies.length; j++) {
      const a = g.enemies[i];
      const b = g.enemies[j];
      if (!a.alive || !b.alive || a.hidden || b.hidden) continue;
      const dx = a.pos.x - b.pos.x;
      const dz = a.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (d < min && d > 1e-4) {
        const push = (min - d) / 2;
        a.pos.x += (dx / d) * push; a.pos.z += (dz / d) * push;
        b.pos.x -= (dx / d) * push; b.pos.z -= (dz / d) * push;
      }
    }
  }
}

function updateCamera(dt, realDt) {
  if (active() && !paused) {
    g.camYaw -= input.dx * 0.0026;
    camPitch = Math.max(0.08, Math.min(1.1, camPitch + input.dy * 0.002));
  }
  const t = g.lockTarget && g.lockTarget.alive ? g.lockTarget : (mode === 'intro' ? boss : null);
  if (t && !t.hidden) {
    const want = Math.atan2(-(t.pos.x - player.pos.x), -(t.pos.z - player.pos.z));
    g.camYaw += angleDiff(g.camYaw, want) * Math.min(1, (mode === 'intro' ? 3 : 6) * realDt);
  }
  if (mode === 'title') g.camYaw += realDt * 0.12;

  const dist = mode === 'title' ? 9 : 7.5;
  camTarget.lerp(new THREE.Vector3(player.pos.x, 1.9, player.pos.z), 1 - Math.exp(-12 * realDt));
  camera.position.set(
    camTarget.x + Math.sin(g.camYaw) * Math.cos(camPitch) * dist,
    Math.max(0.6, camTarget.y + Math.sin(camPitch) * dist),
    camTarget.z + Math.cos(g.camYaw) * Math.cos(camPitch) * dist,
  );
  if (shakeAmt > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shakeAmt;
    camera.position.y += (Math.random() - 0.5) * shakeAmt;
    camera.position.z += (Math.random() - 0.5) * shakeAmt;
    shakeAmt *= Math.exp(-10 * realDt);
  }
  camera.lookAt(camTarget);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let dt = realDt;

  if (active() && !paused) {
    if (input.hit('Escape') && !input.locked) pause();
    if (input.hit('KeyF')) {
      g.lockTarget = g.lockTarget ? null : g.enemies.find((e) => e.alive && !e.minion) ?? null;
      ui.float(player.pos, g.lockTarget ? 'LOCK ON' : 'LOCK OFF', 'block', 2.6);
    }
  }

  if (!paused) {
    if (hitstopT > 0) {
      hitstopT -= realDt;
      dt *= 0.08;
    }
    modeT += realDt;

    if (mode !== 'title') {
      player.update(dt, g);
      for (const e of g.enemies) {
        e.update(dt, g);
        if (mode === 'fight' || mode === 'intro') keepInArena(e, e.radius);
      }
      separate();
      projectiles.update(dt, g);
      shockwaves.update(dt, g);
    } else {
      player.animate(realDt);
    }
    fx.update(dt);

    if (mode === 'travel') {
      const c = arenaCenter(stage);
      player.pos.x = Math.max(-24, Math.min(24, player.pos.x));
      player.pos.z = Math.min(player.pos.z, c.z + APPROACH + 10);
      if (player.pos.z < c.z + ARENA_RADIUS - 2) enterArena();
    } else if (mode === 'intro') {
      keepInArena(player, player.radius);
      if (modeT > 2.8) startFight();
    } else if (mode === 'fight') {
      keepInArena(player, player.radius);
      if (boss && !boss.alive) winFight();
      else if (player.dead) {
        setMode('defeat');
        g.controlsEnabled = false;
      }
    } else if (mode === 'cleared') {
      keepInArena(player, player.radius);
      if (modeT > 1.6) ui.hideEnemy();
      if (modeT > 2.6) {
        world.setArenaActive(stage, false);
        g.arena = null;
        g.lockTarget = null;
        ui.setEnraged(false);
        for (const e of g.enemies) if (e.minion) e.remove();
        g.enemies = g.enemies.filter((e) => !e.minion);
        if (stage >= TOTAL - 1) {
          setMode('victory');
          g.controlsEnabled = false;
          savedStage = 0;
          saveStage(0);
          ui.setHud(false);
          input.unlock();
          ui.show('screen-victory');
        } else {
          stage++;
          startTravel();
        }
      }
    } else if (mode === 'defeat' && modeT > 1.8 && document.getElementById('screen-defeat').classList.contains('hidden')) {
      input.unlock();
      document.getElementById('defeat-text').textContent =
        `${MASCOTS[stage].name} got the better of Herbie this time. Tip: ${MASCOTS[stage].tip}`;
      ui.show('screen-defeat');
    }

    // Tidy up knocked-out pups once they've faded.
    g.enemies = g.enemies.filter((e) => {
      if (e.minion && !e.alive && e.t > 4.5) { e.remove(); return false; }
      return true;
    });
  }

  world.update(realDt, player.pos);
  updateCamera(dt, realDt);
  ui.updatePlayer(player);
  if (boss) ui.updateEnemy(boss);
  ui.update(realDt, camera);
  renderer.render(scene, camera);
  input.endFrame();
}

toTitle();
requestAnimationFrame(frame);

if (params.has('debug') || Number.isFinite(debugStage)) {
  window.mascotMania = { g, MASCOTS, beginRun, retryFight, get mode() { return mode; }, get stage() { return stage; } };
}
