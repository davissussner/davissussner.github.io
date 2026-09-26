// Horse Race: everyone gets a horse. Last across the line orders the Uber and
// second to last takes a shot.
// Fairness: names are shuffled into lanes and every horse runs on the same
// random rules (form swings, surges, stumbles, and a pack pull that slows
// runaway leaders and helps stragglers), none of which know who is riding.

import { shuffle } from '../fair.js?v=6';
import { fit, runSim, simulateHeadless, throttle, tag, short, clamp, ease, banner, setHud, esc } from '../stage.js?v=6';

const FINISH = 2600;
const LANE = 46;
const GATE = 180;          // countdown steps
const BASE = 2.6;          // units per step
const TIMEOUT = 45 * 60;
const STANDS = 130;        // height of the grandstand above the track

export function createSim(players, { headless = false } = {}) {
  const start = headless ? 0 : GATE;
  const horses = shuffle(players).map((player, lane) => ({
    player, lane, pos: 0, v: 0, form: 1, formNext: 0,
    surge: 0, stumble: 0, finished: false, place: 0, phase: Math.random() * 6,
  }));
  const sim = {
    t: 0, start, horses, finished: [], done: false, loser: null, shot: null, events: [],
    stretchCalled: false, battle: false,
  };

  sim.step = () => {
    sim.t++;
    if (sim.t <= start) {
      if (sim.t % 60 === 1) sim.events.push({ type: 'count' });
      if (sim.t === start) sim.events.push({ type: 'go' });
      return;
    }
    const running = horses.filter(h => !h.finished);
    const mid = running.reduce((a, h) => a + h.pos, 0) / running.length;

    for (const h of running) {
      // Form drifts every couple of seconds
      if (sim.t >= h.formNext) {
        h.form = 0.93 + Math.random() * 0.14;
        h.formNext = sim.t + 90 + Math.random() * 90;
      }
      if (h.surge > 0) h.surge--;
      else if (h.stumble === 0 && Math.random() < 0.004) {
        h.surge = 50 + Math.floor(Math.random() * 50);
        sim.events.push({ type: 'surge' });
      }
      if (h.stumble > 0) h.stumble--;
      else if (h.surge === 0 && Math.random() < 0.0016) {
        h.stumble = 30;
        sim.events.push({ type: 'stumble' });
      }
      // Pack pull: keeps the race close without caring who's where
      const pull = 1 - clamp((h.pos - mid) / 500, -0.3, 0.3) * 0.5;
      const target = BASE * h.form * pull * (h.surge ? 1.35 : 1) * (h.stumble ? 0.45 : 1);
      h.v += (target - h.v) * 0.05;
      h.pos += h.v;
      h.phase += h.v * 0.09;
    }

    // Horses crossing on the same step are placed by how far past the line they got
    const crossed = running.filter(h => h.pos >= FINISH).sort((a, b) => b.pos - a.pos);
    for (const h of crossed) {
      h.finished = true;
      sim.finished.push(h);
      h.place = sim.finished.length;
      sim.events.push({ type: 'finish', place: h.place });
    }

    const lead = Math.max(...horses.map(h => h.pos));
    if (!sim.stretchCalled && lead > FINISH * 0.72) {
      sim.stretchCalled = true;
      sim.events.push({ type: 'stretch' });
    }

    const left = horses.filter(h => !h.finished).sort((a, b) => b.pos - a.pos);
    // Battle for last: the last two still running, close together, near the line
    sim.battle = left.length === 2 && left[0].pos > FINISH * 0.8 && left[0].pos - left[1].pos < 70;

    if (left.length <= 1 || sim.t - start > TIMEOUT) {
      const ranking = [...sim.finished, ...left];
      sim.loserHorse = ranking[ranking.length - 1];
      sim.loser = sim.loserHorse.player;
      sim.shot = ranking.length > 1 ? ranking[ranking.length - 2].player : null;
      sim.done = true;
      sim.events.push({ type: 'last' });
    }
  };

  return sim;
}

function renderer(canvas, sim, view) {
  const ctx = canvas.getContext('2d');
  const n = sim.horses.length;
  const trackH = n * LANE;
  const cam = { x: 0, s: 0 };
  const crowdColors = ['#ff4d6d', '#ffd23f', '#3de0ff', '#7ae582', '#b388ff', '#ff8c42', '#f4f1ff'];
  const dust = [];

  return (dt, now) => {
    const { w, h, dpr } = fit(canvas);
    view.speed += ((sim.battle && !sim.done ? 0.35 : 1) - view.speed) * ease(dt, 0.01);
    if (sim.battle && !sim.done) view.onBattle();

    // Camera: frame the whole pack when it fits, otherwise favor the back of the pack
    const running = sim.horses.filter(hh => !hh.finished);
    const pack = running.length ? running : sim.horses;
    let lo = Math.min(...pack.map(hh => hh.pos));
    let hi = Math.max(...pack.map(hh => hh.pos));
    if (sim.done) lo = hi = sim.loserHorse.pos;
    const sH = h / (trackH + STANDS + 110);
    const spanW = clamp(hi - lo + 260, 420, 1000);
    const s = Math.min(w / spanW, sH);
    const viewW = w / s;
    let cx = (lo + hi) / 2 + 40;
    if (hi - lo + 260 > viewW) cx = lo - 80 + viewW / 2;
    cx = clamp(cx, -60 + viewW / 2 - 100, FINISH + 160);
    if (!cam.s) Object.assign(cam, { x: cx, s });
    cam.x += (cx - cam.x) * ease(dt, 0.006);
    cam.s += (s - cam.s) * ease(dt, 0.004);
    const S = cam.s;
    const top = -STANDS - 20;
    const oy = (h - (trackH + STANDS + 60) * S) / 2 - top * S;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1d4d2f';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(S, 0, 0, S, w / 2 - cam.x * S, oy);
    const viewL = cam.x - w / 2 / S - 40;
    const viewR = cam.x + w / 2 / S + 40;

    // Grandstand with a crowd that jumps when the finish is close
    ctx.fillStyle = '#2b2358';
    ctx.fillRect(viewL, -STANDS, viewR - viewL, STANDS - 14);
    ctx.fillStyle = '#3b3170';
    for (let y = -STANDS + 10; y < -20; y += 26) ctx.fillRect(viewL, y + 18, viewR - viewL, 3);
    const excited = Math.max(...sim.horses.map(hh => hh.pos)) > FINISH * 0.7;
    for (let col = Math.floor(viewL / 16); col * 16 < viewR; col++) {
      for (let row = 0; row < 4; row++) {
        const hash = Math.abs(Math.sin(col * 12.9898 + row * 78.233) * 43758.5453) % 1;
        const x = col * 16 + (row % 2) * 8;
        const jump = excited ? Math.max(0, Math.sin(now * 0.012 + hash * 20)) * 5 : 0;
        const y = -STANDS + 14 + row * 26 - jump;
        ctx.fillStyle = crowdColors[Math.floor(hash * crowdColors.length)];
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Track
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#8b5e3c' : '#946443';
      ctx.fillRect(viewL, i * LANE, viewR - viewL, LANE);
    }
    ctx.fillStyle = '#f4f1ff';
    ctx.fillRect(viewL, -6, viewR - viewL, 6);
    ctx.fillRect(viewL, trackH, viewR - viewL, 6);
    for (let x = Math.floor(viewL / 100) * 100; x < viewR; x += 100) {
      ctx.fillRect(x - 2, -18, 4, 14);
      ctx.fillRect(x - 2, trackH + 6, 4, 14);
    }

    // Quarter poles
    const fs = clamp(12 * dpr / S, 11, 40);
    for (const [frac, label] of [[0.25, '¼'], [0.5, '½'], [0.75, '¾']]) {
      const x = FINISH * frac;
      if (x < viewL || x > viewR) continue;
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(x - 1.5, 0, 3, trackH);
      tag(ctx, label, x, trackH + 40, fs * 1.3, '#ffd23f');
    }

    // Finish line
    if (FINISH > viewL && FINISH < viewR + 40) {
      const sq = 10;
      for (let y = 0; y < trackH; y += sq) {
        for (let c = 0; c < 2; c++) {
          ctx.fillStyle = ((y / sq + c) % 2) ? '#f4f1ff' : '#15112b';
          ctx.fillRect(FINISH + c * sq, y, sq, sq);
        }
      }
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(FINISH + 6, -40, 8, 40);
      tag(ctx, 'FINISH', FINISH + 10, -46, fs * 1.2, '#ffd23f');
    }

    // Starting gate: stalls around each horse, front doors open on GO
    const size = LANE * 0.95;
    if (viewL < 40) {
      ctx.fillStyle = '#b8b3d6';
      for (let i = 0; i <= n; i++) ctx.fillRect(-size - 8, i * LANE - 3, size + 14, 6);
      if (sim.t <= sim.start) {
        ctx.fillStyle = 'rgba(184,179,214,.85)';
        for (let i = 0; i < n; i++) ctx.fillRect(2, i * LANE + 4, 5, LANE - 8);
      }
    }

    // Dust puffs behind galloping horses
    if (sim.t > sim.start && !sim.done) {
      for (const hh of sim.horses) {
        if (!hh.finished && Math.random() < 0.35) dust.push({ x: hh.pos - size, y: hh.lane * LANE + LANE - 8, life: 1, r: 3 + Math.random() * 4 });
      }
    }
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life -= dt * 0.002;
      d.r += dt * 0.01;
      if (d.life <= 0) { dust.splice(i, 1); continue; }
      ctx.globalAlpha = d.life * 0.4;
      ctx.fillStyle = '#d8b48a';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Horses (nose at pos, so crossing the line looks like it counts).
    // 🏇 faces left in most emoji fonts, so mirror it to run right.
    for (const hh of sim.horses) {
      const x = hh.pos - size / 2;
      const y = hh.lane * LANE + LANE / 2;
      const moving = sim.t > sim.start && !hh.finished;
      const bob = moving ? Math.abs(Math.sin(hh.phase)) * 4 : 0;
      // Saddle cloth in the rider's color
      ctx.fillStyle = hh.player.color;
      ctx.fillRect(x - 12, y - 2 - bob, 16, 10);
      ctx.save();
      ctx.translate(x, y - bob);
      ctx.scale(-1, 1);
      ctx.rotate(moving ? Math.sin(hh.phase * 2) * 0.06 : 0);
      ctx.font = `${size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      ctx.fillText('🏇', 0, 0);
      ctx.restore();
      if (hh.surge && moving) tag(ctx, '💨', x - size * 0.75, y + 6, size * 0.5);
      if (hh.stumble && moving) tag(ctx, '💫', x, y - size * 0.45, size * 0.45);
      if (sim.done && hh === sim.loserHorse) {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - size * 0.6, y - LANE / 2 + 2, size * 1.2, LANE - 4);
      }
    }
    // Names trail behind each horse, clear of the lane lines
    const ns = clamp(11 * dpr / S, 10, 26);
    ctx.font = `800 ${ns}px Inter, system-ui, sans-serif`;
    for (const hh of sim.horses) {
      const label = hh.finished ? `${hh.place}. ${short(hh.player.name)}` : short(hh.player.name);
      const half = ctx.measureText(label).width / 2;
      tag(ctx, label, hh.pos - size * 1.1 - half - 6, hh.lane * LANE + LANE / 2 + ns * 0.35, ns, hh.player.color);
    }

    // Overlays
    if (sim.t <= sim.start) {
      banner(ctx, w, h, dpr, String(Math.max(1, 3 - Math.floor(sim.t / 60))), { y: 0.5 });
    } else if (sim.t < sim.start + 70) {
      banner(ctx, w, h, dpr, "AND THEY'RE OFF!", { color: '#7ae582', y: 0.9 });
    }
    if (sim.done) {
      banner(ctx, w, h, dpr, `${short(sim.loser.name)} finishes last!`, { color: sim.loser.color, y: 0.9 });
    } else if (sim.battle) {
      banner(ctx, w, h, dpr, 'BATTLE FOR LAST!', { color: '#ff4d6d', y: 0.9 });
    } else if (sim.stretchCalled && Math.max(...sim.horses.map(hh => hh.pos)) < FINISH * 0.85) {
      banner(ctx, w, h, dpr, 'FINAL STRETCH!', { color: '#ffd23f', y: 0.9 });
    }
  };
}

function hudUpdater(hud, sim) {
  return () => {
    // Finished horses first (by place), then the rest by how far along they are
    const order = [...sim.horses].sort((a, b) => (b.finished - a.finished) || (a.finished ? a.place - b.place : b.pos - a.pos));
    const rows = order.map((hh, i) => {
      const hot = sim.done ? hh === sim.loserHorse : i === order.length - 1 && sim.t > sim.start;
      return `<div class="hud-row${hot ? ' hot' : ''}" style="--c:${hh.player.color}"><span class="v">${i + 1}.</span><span class="d"></span><span class="n">${hh.finished ? '🏁 ' : ''}${esc(hh.player.name)}</span></div>`;
    });
    setHud(hud, `<div class="hud-box"><div class="hud-title">Standings</div>${rows.join('')}</div>`);
  };
}

export default {
  id: 'horse',
  title: 'Horse Race',
  emoji: '🏇',
  blurb: 'Surges, stumbles, photo finishes. Last across the line orders.',
  simulate: players => simulateHeadless(createSim, players),
  play({ canvas, hud, players, signal, sfx }) {
    const sim = createSim(players);
    const view = { speed: 1, onBattle: throttle(sfx.drum, 90) };
    const draw = renderer(canvas, sim, view);
    const updateHud = hudUpdater(hud, sim);
    const gallop = throttle(sfx.thud, 230);
    return runSim(signal, sim, (dt, now) => {
      draw(dt, now);
      updateHud();
      if (sim.t > sim.start && !sim.done) gallop();
    }, e => {
      if (e.type === 'count') sfx.count();
      else if (e.type === 'go') sfx.go();
      else if (e.type === 'stretch') sfx.fanfare();
      else if (e.type === 'finish') sfx.ding(e.place);
      else if (e.type === 'last') sfx.womp();
    }, 2200, () => view.speed);
  },
};
