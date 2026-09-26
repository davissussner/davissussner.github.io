// Bear Chase: everyone runs from a bear in a forest clearing, ducking behind trees
// and rocks. Whoever gets eaten orders the Uber.
// Fairness: every runner uses the same AI and names are shuffled into spawn spots,
// so any advantage of a spot or of the layout lands on a random person.
// Timing: the bear only swipes (knockback, no catch) during a grace period whose
// length is random each game, keeps getting faster, and goes into a frenzy a few
// seconds after grace ends, so a chase lasts ~10–20s (about 15 on average).

import { shuffle, rand } from '../fair.js?v=5';
import { fit, runSim, simulateHeadless, throttle, tag, short, clamp, ease, banner, initial, textOn, setHud, esc } from '../stage.js?v=5';

const W = 400;
const H = 600;
const PR = 11;          // runner radius
const BR = 20;          // bear radius
const VP = 2.3;         // runner top speed (units per step)
const ACCEL = 0.22;
const INTRO = 60;       // bear roars before charging
const GRACE_MIN = 9.5 * 60; // bear can only swipe until a random time in this range
const GRACE_MAX = 17 * 60;
const FRENZY_AFTER = 4.5 * 60; // then it goes all-out
const BEAR_START = { x: W / 2, y: 60 };

const OBSTACLES = [
  { x: 90, y: 180, r: 26, type: 'tree' },
  { x: 310, y: 180, r: 26, type: 'tree' },
  { x: 200, y: 270, r: 30, type: 'tree' },
  { x: 60, y: 340, r: 20, type: 'rock' },
  { x: 340, y: 340, r: 20, type: 'rock' },
  { x: 135, y: 420, r: 28, type: 'tree' },
  { x: 265, y: 420, r: 28, type: 'tree' },
  { x: 200, y: 520, r: 22, type: 'rock' },
  { x: 60, y: 520, r: 24, type: 'tree' },
  { x: 340, y: 520, r: 24, type: 'tree' },
];

const SPAWNS = [
  [200, 350], [120, 300], [280, 300], [100, 470], [300, 470], [200, 460],
  [40, 420], [360, 420], [130, 560], [270, 560], [200, 400], [40, 250],
  [360, 250], [150, 220], [250, 220], [200, 575],
];

const len = (x, y) => Math.hypot(x, y) || 1e-6;

// --- Bear pathfinding: a coarse grid over the clearing, with cells the bear
// can't fit through marked blocked. A BFS flow field from the target's cell
// always leads the bear around obstacles (no getting stuck on a tree).
const CELL = 20;
const GW = W / CELL;
const GH = H / CELL;
const cellOf = (x, y) => clamp(Math.floor(y / CELL), 0, GH - 1) * GW + clamp(Math.floor(x / CELL), 0, GW - 1);
const BLOCKED = new Uint8Array(GW * GH);
for (let cy = 0; cy < GH; cy++) {
  for (let cx = 0; cx < GW; cx++) {
    const x = (cx + 0.5) * CELL;
    const y = (cy + 0.5) * CELL;
    if (OBSTACLES.some(o => len(x - o.x, y - o.y) < o.r + BR - 4)) BLOCKED[cy * GW + cx] = 1;
  }
}
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function flowField(target) {
  const dist = new Int16Array(GW * GH).fill(-1);
  const start = cellOf(target.x, target.y);
  const queue = [start];
  dist[start] = 0;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const cx = c % GW;
    const cy = (c - cx) / GW;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (dist[n] !== -1 || BLOCKED[n]) continue;
      if (dx && dy && (BLOCKED[cy * GW + nx] || BLOCKED[ny * GW + cx])) continue; // no corner cutting
      dist[n] = dist[c] + 1;
      queue.push(n);
    }
  }
  return dist;
}

function segClear(ax, ay, bx, by, pad) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  return OBSTACLES.every(o => {
    const t = clamp(((o.x - ax) * dx + (o.y - ay) * dy) / l2, 0, 1);
    return len(o.x - (ax + t * dx), o.y - (ay + t * dy)) > o.r + pad;
  });
}

function pushOut(e, r) {
  for (const o of OBSTACLES) {
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const d = len(dx, dy);
    const min = o.r + r;
    if (d < min) {
      e.x = o.x + (dx / d) * min;
      e.y = o.y + (dy / d) * min;
      // Slide along the obstacle instead of sticking to it
      const n = (e.vx * dx + e.vy * dy) / d;
      if (n < 0) {
        e.vx -= (n * dx) / d;
        e.vy -= (n * dy) / d;
      }
    }
  }
  if (e.x < r) { e.x = r; e.vx = Math.max(0, e.vx); }
  if (e.x > W - r) { e.x = W - r; e.vx = Math.min(0, e.vx); }
  if (e.y < r) { e.y = r; e.vy = Math.max(0, e.vy); }
  if (e.y > H - r) { e.y = H - r; e.vy = Math.min(0, e.vy); }
}

export function createSim(players, { headless = false } = {}) {
  const runners = shuffle(players).map((player, i) => {
    const [x, y] = SPAWNS[i % SPAWNS.length];
    return {
      player, x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: 0, vy: 0,
      wander: Math.random() * Math.PI * 2, alive: true, panic: 0, face: 1,
    };
  });
  const bear = { x: BEAR_START.x, y: BEAR_START.y, vx: 0, vy: 0, target: null, pause: 0, face: 1, field: null, fieldAt: -99 };
  const grace = Math.round(rand(GRACE_MIN, GRACE_MAX));
  const sim = { t: 0, grace, frenzy: grace + FRENZY_AFTER, runners, bear, done: false, loser: null, victim: null, events: [], headless };
  sim.events.push({ type: 'roar' });

  const bearSpeed = () => {
    if (sim.t < INTRO) return 0;
    if (sim.t >= sim.frenzy) return VP * 2.4;
    return VP * (0.6 + 0.85 * clamp((sim.t - INTRO) / (15 * 60), 0, 1));
  };

  sim.step = () => {
    sim.t++;
    if (sim.t === sim.grace) sim.events.push({ type: 'hungry' });
    if (sim.t === sim.frenzy) sim.events.push({ type: 'frenzy' });

    // --- Bear: chase the nearest runner (sticky target), steer around obstacles
    const live = runners.filter(r => r.alive);
    if (sim.t % 20 === 1 || !bear.target) {
      const dist = r => len(r.x - bear.x, r.y - bear.y);
      const nearest = live.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      if (!bear.target || dist(nearest) < dist(bear.target) * 0.75) bear.target = nearest;
    }
    if (bear.pause > 0) {
      bear.pause--;
      bear.vx *= 0.8;
      bear.vy *= 0.8;
    } else {
      // Straight at the target when there's a clear line, otherwise follow the flow field
      let gx = bear.target.x;
      let gy = bear.target.y;
      if (!segClear(bear.x, bear.y, gx, gy, BR - 2)) {
        if (sim.t - bear.fieldAt >= 8) {
          bear.field = flowField(bear.target);
          bear.fieldAt = sim.t;
        }
        const f = bear.field;
        const c = cellOf(bear.x, bear.y);
        const cx = c % GW;
        const cy = (c - cx) / GW;
        let best = -1;
        let bestD = f[c] >= 0 ? f[c] : 1e9;
        for (const [dx, dy] of NEIGHBORS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const n = ny * GW + nx;
          if (f[n] >= 0 && f[n] < bestD) { bestD = f[n]; best = n; }
        }
        if (best >= 0) {
          gx = ((best % GW) + 0.5) * CELL;
          gy = (Math.floor(best / GW) + 0.5) * CELL;
        }
      }
      const dx = gx - bear.x;
      const dy = gy - bear.y;
      const dl = len(dx, dy);
      const v = bearSpeed();
      bear.vx += ((dx / dl) * v - bear.vx) * 0.18;
      bear.vy += ((dy / dl) * v - bear.vy) * 0.18;
    }
    bear.x += bear.vx;
    bear.y += bear.vy;
    pushOut(bear, BR);
    if (Math.abs(bear.vx) > 0.2) bear.face = Math.sign(bear.vx);

    // --- Runners: flee, hide behind cover, avoid walls and each other, wander a bit
    for (const r of live) {
      const bx = r.x - bear.x;
      const by = r.y - bear.y;
      const bd = len(bx, by);
      let ax = (bx / bd) * clamp(160 / bd, 0, 3);
      let ay = (by / bd) * clamp(160 / bd, 0, 3);

      // Cover: the point directly behind the nearest obstacle, from the bear's view
      let best = null;
      let bestD = Infinity;
      for (const o of OBSTACLES) {
        const d = len(o.x - r.x, o.y - r.y);
        if (d < bestD && len(o.x - bear.x, o.y - bear.y) > bd * 0.6) { best = o; bestD = d; }
      }
      if (best && bestD < 170) {
        const ox = best.x - bear.x;
        const oy = best.y - bear.y;
        const ol = len(ox, oy);
        const hx = best.x + (ox / ol) * (best.r + PR + 6) - r.x;
        const hy = best.y + (oy / ol) * (best.r + PR + 6) - r.y;
        const hl = len(hx, hy);
        const w = 1.1 * clamp(1 - bd / 320, 0.15, 1);
        ax += (hx / hl) * w;
        ay += (hy / hl) * w;
      }

      // Walls (corners are death traps) and a mild pull toward open ground
      const m = 55;
      if (r.x < m) ax += (m - r.x) / m * 1.6;
      if (r.x > W - m) ax -= (r.x - (W - m)) / m * 1.6;
      if (r.y < m) ay += (m - r.y) / m * 1.6;
      if (r.y > H - m) ay -= (r.y - (H - m)) / m * 1.6;
      ax += (W / 2 - r.x) * 0.0015;
      ay += (H * 0.55 - r.y) * 0.0015;

      for (const o of live) {
        if (o === r) continue;
        const sx = r.x - o.x;
        const sy = r.y - o.y;
        const sd = len(sx, sy);
        if (sd < PR * 2.6) {
          ax += (sx / sd) * 0.8;
          ay += (sy / sd) * 0.8;
        }
      }

      r.wander += (Math.random() - 0.5) * 0.5;
      ax += Math.cos(r.wander) * 0.35;
      ay += Math.sin(r.wander) * 0.35;

      const al = len(ax, ay);
      r.panic = clamp(1 - (bd - 40) / 120, 0, 1);
      const speed = VP * (0.7 + 0.3 * r.panic) * (sim.t < INTRO ? 0.5 : 1);
      const wx = (ax / al) * speed - r.vx;
      const wy = (ay / al) * speed - r.vy;
      const wl = len(wx, wy);
      const k = Math.min(1, ACCEL / wl);
      r.vx += wx * k;
      r.vy += wy * k;
      r.x += r.vx;
      r.y += r.vy;
      pushOut(r, PR);
      if (Math.abs(r.vx) > 0.2) r.face = Math.sign(r.vx);
    }

    // Runners don't overlap each other
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = len(dx, dy);
        if (d < PR * 2) {
          const push = (PR * 2 - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    }

    // --- Contact: swipe during the grace period, CHOMP after it
    for (const r of live) {
      const dx = r.x - bear.x;
      const dy = r.y - bear.y;
      const d = len(dx, dy);
      if (d > BR + PR - 2) continue;
      if (sim.t < sim.grace) {
        if (bear.pause === 0) {
          r.vx = (dx / d) * 6;
          r.vy = (dy / d) * 6;
          bear.pause = 28;
          bear.target = null;
          sim.events.push({ type: 'swipe' });
        }
      } else {
        r.alive = false;
        sim.victim = r;
        sim.loser = r.player;
        const others = runners.filter(o => o.alive);
        sim.shot = others.length
          ? others.reduce((a, b) => (len(b.x - bear.x, b.y - bear.y) < len(a.x - bear.x, a.y - bear.y) ? b : a)).player
          : null;
        sim.done = true;
        sim.events.push({ type: 'chomp' });
        return;
      }
    }
  };

  return sim;
}

function renderer(canvas, sim, view) {
  const ctx = canvas.getContext('2d');
  const tufts = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 2 + Math.random() * 3 }));
  let doneAt = null;

  return (dt, now) => {
    const { w, h, dpr } = fit(canvas);
    const s = Math.min(w / (W + 16), h / (H + 16));
    const ox = (w - W * s) / 2;
    const oy = (h - H * s) / 2;
    const { bear } = sim;

    // Slow motion when the bear is right on someone after the grace period
    const closest = Math.min(...sim.runners.filter(r => r.alive).map(r => len(r.x - bear.x, r.y - bear.y)));
    const tense = !sim.done && sim.t >= sim.grace && closest < 70;
    view.speed += ((tense ? 0.45 : 1) - view.speed) * ease(dt, 0.01);
    if (tense) view.onTense();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c1f16';
    ctx.fillRect(0, 0, w, h);
    const shake = sim.done && doneAt !== null && now - doneAt < 500 ? (Math.random() - 0.5) * 8 * dpr : 0;
    ctx.setTransform(s, 0, 0, s, ox + shake, oy);

    // Clearing
    ctx.fillStyle = '#3a7d44';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#48944f';
    for (const t of tufts) {
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, t.s * 1.6, t.s * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cave the bear comes out of
    ctx.fillStyle = '#2b2118';
    ctx.beginPath();
    ctx.ellipse(BEAR_START.x, 0, 60, 45, 0, 0, Math.PI);
    ctx.fill();
    // Fence
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);

    // Shadows, then obstacles
    for (const o of OBSTACLES) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.ellipse(o.x + 6, o.y + 8, o.r, o.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const o of OBSTACLES) {
      if (o.type === 'tree') {
        ctx.fillStyle = '#1b4d2b';
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#27693a';
        ctx.beginPath();
        ctx.arc(o.x - o.r * 0.25, o.y - o.r * 0.25, o.r * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#34824a';
        ctx.beginPath();
        ctx.arc(o.x - o.r * 0.35, o.y - o.r * 0.38, o.r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#7d8590';
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a3abb5';
        ctx.beginPath();
        ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Runners
    const labelSize = clamp(12 * dpr / s, 9, 22);
    for (const r of sim.runners) {
      if (!r.alive && sim.victim !== r) continue;
      if (sim.victim === r && doneAt !== null && now - doneAt > 350) continue; // eaten
      const bob = Math.abs(Math.sin(sim.t * 0.35 + r.wander)) * 2 * (len(r.vx, r.vy) > 0.5 ? 1 : 0);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      ctx.ellipse(r.x + 2, r.y + 4, PR, PR * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = r.player.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y - bob, PR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,8,24,.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = textOn(r.player.color);
      ctx.font = '800 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initial(r.player.name), r.x, r.y - bob + 0.5);
    }
    for (const r of sim.runners) {
      if (!r.alive) continue;
      const scared = r.panic > 0.6 && !sim.done;
      tag(ctx, (scared ? '❗' : '') + short(r.player.name), r.x, r.y - PR - 5, labelSize, scared ? '#ffd23f' : '#fff');
    }

    // Bear
    const bs = BR * 2.5 * (sim.t >= sim.frenzy && !sim.done ? 1 + Math.sin(sim.t * 0.5) * 0.06 : 1);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(bear.x + 4, bear.y + 8, BR, BR * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (sim.t >= sim.frenzy || sim.done) {
      ctx.save();
      ctx.shadowColor = '#ff2d55';
      ctx.shadowBlur = 24;
      ctx.fillStyle = 'rgba(255,45,85,.25)';
      ctx.beginPath();
      ctx.arc(bear.x, bear.y, BR + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(bear.x, bear.y - Math.abs(Math.sin(sim.t * 0.25)) * 2);
    ctx.scale(bear.face < 0 ? -1 : 1, 1);
    ctx.font = `${bs}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; // emoji inherit fillStyle alpha
    ctx.fillText('🐻', 0, 0);
    ctx.restore();
    if (bear.pause > 0) tag(ctx, '💢', bear.x + BR, bear.y - BR, 18);

    // Overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (tense) {
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(255,30,70,0)');
      vg.addColorStop(1, 'rgba(255,30,70,.3)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }
    if (sim.done) {
      doneAt ??= now;
      banner(ctx, w, h, dpr, 'CHOMP!', { color: '#ff4d6d', sub: `${sim.loser.name} got eaten`, y: 0.93 });
    } else if (sim.t < INTRO + 60) {
      banner(ctx, w, h, dpr, 'RUN!', { color: '#ffd23f', y: 0.93 });
    } else if (sim.t >= sim.frenzy) {
      banner(ctx, w, h, dpr, 'FRENZY!', { color: '#ff4d6d', y: 0.93 });
    } else if (sim.t >= sim.grace && sim.t < sim.grace + 100) {
      banner(ctx, w, h, dpr, 'The bear is hungry…', { color: '#ff8c42', y: 0.93 });
    }
  };
}

function hudUpdater(hud, sim) {
  return () => {
    const secs = (sim.t / 60).toFixed(0);
    const rows = sim.runners.map(r =>
      `<div class="hud-row${r.alive ? '' : ' hot'}" style="--c:${r.player.color}"><span class="d"></span><span class="n">${r.alive ? '' : '🍖 '}${esc(r.player.name)}</span></div>`);
    setHud(hud, `<div class="hud-box"><div class="hud-title">Survived ${secs}s</div>${rows.join('')}</div>`);
  };
}

export default {
  id: 'bear',
  title: 'Bear Chase',
  emoji: '🐻',
  blurb: 'Run! Duck behind trees and rocks. Whoever gets eaten orders.',
  simulate: players => simulateHeadless(createSim, players),
  play({ canvas, hud, players, signal, sfx }) {
    const sim = createSim(players);
    const view = { speed: 1, onTense: throttle(sfx.drum, 380) };
    const draw = renderer(canvas, sim, view);
    const updateHud = hudUpdater(hud, sim);
    return runSim(signal, sim, (dt, now) => { draw(dt, now); updateHud(); }, e => {
      if (e.type === 'roar') sfx.roar();
      else if (e.type === 'swipe') sfx.thud();
      else if (e.type === 'hungry') sfx.roar();
      else if (e.type === 'frenzy') sfx.roar();
      else if (e.type === 'chomp') sfx.chomp();
    }, 2200, () => view.speed);
  },
};
