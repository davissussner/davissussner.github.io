// Marble Race: everyone's marble drops down a course. Last one across the line orders.
// Fairness: names are shuffled into start slots, so any bias in the course
// lands on a random person. Each player loses with probability exactly 1/N.

import { shuffle } from '../fair.js';
import { STEP, fit, runSim, simulateHeadless, throttle, poly, tag, short, clamp, ease, banner, shade, setHud, esc } from '../stage.js';

const { Engine, Bodies, Body, Composite, Events } = Matter;

const W = 400;
const R = 9;
const FINISH_Y = 2400;
const FLOOR_Y = 2520;
const COUNTDOWN = 180;
const STUCK_STEPS = 150;
const TIMEOUT = 90 * 60;

const MARBLE = 0x0001;
const STATIC = 0x0002;
const PADDLE = 0x0004;

function buildCourse() {
  const S = { isStatic: true, collisionFilter: { category: STATIC } };
  const statics = [];
  const paddles = [];

  const rect = (x, y, w, h, o = {}) => statics.push(Bodies.rectangle(x, y, w, h, { ...S, label: 'wall', friction: 0.02, ...o }));
  const peg = (x, y) => statics.push(Bodies.circle(x, y, 4, { ...S, label: 'peg', restitution: 0.5, friction: 0.01 }));
  const bumper = (x, y, r = 20) => statics.push(Bodies.circle(x, y, r, { ...S, label: 'bumper', restitution: 1.05, friction: 0 }));
  const ramp = (x1, y1, x2, y2) => statics.push(Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1), 12, {
    ...S, label: 'ramp', angle: Math.atan2(y2 - y1, x2 - x1), friction: 0.005, restitution: 0.2,
  }));
  const paddle = (cx, cy, len, w) => paddles.push({
    cx, cy, w,
    body: Bodies.rectangle(cx, cy, len, 10, {
      label: 'paddle', density: 0.05, frictionAir: 0, friction: 0.05, restitution: 0.5,
      collisionFilter: { category: PADDLE, mask: MARBLE },
    }),
  });

  // Walls, ceiling, collection tray floor
  rect(-15, FLOOR_Y / 2, 30, FLOOR_Y + 200);
  rect(W + 15, FLOOR_Y / 2, 30, FLOOR_Y + 200);
  rect(W / 2, -75, W + 60, 30);
  rect(W / 2, FLOOR_Y + 15, W + 60, 30, { label: 'floor', friction: 0.3 });

  // A: peg field
  for (let row = 0, y = 140; y <= 620; row++, y += 40) {
    const x0 = row % 2 ? 51.25 : 30;
    for (let x = x0; x <= 370; x += 42.5) peg(x, y);
  }

  // B: zigzag ramps (steep enough that marbles keep moving)
  for (let i = 0; i < 4; i++) {
    const y = 700 + i * 150;
    if (i % 2 === 0) ramp(-10, y - 55, 330, y + 55);
    else ramp(410, y - 55, 70, y + 55);
  }

  // C: bumpers around a big spinner
  for (const [x, y] of [[70, 1330], [200, 1320], [330, 1330], [130, 1420], [270, 1420], [60, 1570], [340, 1570]]) bumper(x, y);
  bumper(200, 1655, 22);
  paddle(200, 1525, 170, 0.05);

  // D: dense pegs with twin spinners
  const spinners = [[110, 1900, 0.06], [290, 1900, -0.06]];
  for (let row = 0, y = 1720; y <= 2080; row++, y += 36) {
    const x0 = row % 2 ? 49 : 30;
    for (let x = x0; x <= 370; x += 38) {
      if (spinners.some(([sx, sy]) => Math.hypot(x - sx, y - sy) < 75)) continue;
      peg(x, y);
    }
  }
  for (const [x, y, w] of spinners) paddle(x, y, 120, w);

  // E: funnel to the finish
  ramp(-10, 2140, 165, 2300);
  ramp(410, 2140, 235, 2300);

  return { statics, paddles };
}

export function createSim(players, { headless = false } = {}) {
  const engine = Engine.create();
  engine.positionIterations = 8;
  engine.velocityIterations = 6;

  const { statics, paddles } = buildCourse();
  Composite.add(engine.world, statics);
  Composite.add(engine.world, paddles.map(p => p.body));

  const raceStart = headless ? 0 : COUNTDOWN;
  const slots = shuffle(players);
  const n = slots.length;
  const marbles = slots.map((player, i) => {
    const row = Math.floor(i / 8);
    const inRow = Math.min(8, n - row * 8);
    const x = (W / (inRow + 1)) * ((i % 8) + 1) + (Math.random() - 0.5) * 4;
    const y = 62 - row * 24;
    const body = Bodies.circle(x, y, R, {
      label: 'marble', restitution: 0.45, friction: 0.02, frictionAir: 0.0008, density: 0.004,
      collisionFilter: { category: MARBLE },
    });
    return { player, body, finished: false, place: 0, best: y, bestAt: raceStart };
  });
  Composite.add(engine.world, marbles.map(m => m.body));

  let gate = null;
  if (!headless) {
    gate = Bodies.rectangle(W / 2, 84, W, 10, { isStatic: true, label: 'gate', collisionFilter: { category: STATIC } });
    Composite.add(engine.world, gate);
  }

  const sim = {
    t: 0, raceStart, marbles, statics, paddles, gate,
    finished: [], done: false, loser: null, loserMarble: null, events: [],
  };

  Events.on(engine, 'collisionStart', e => {
    for (const { bodyA: a, bodyB: b } of e.pairs) {
      const m = a.label === 'marble' ? a : b.label === 'marble' ? b : null;
      if (!m) continue;
      const o = m === a ? b : a;
      const rel = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (o.label === 'bumper') { o.flash = 1; sim.events.push({ type: 'bump' }); }
      else if (o.label === 'peg' && rel > 2) sim.events.push({ type: 'peg' });
      else if (o.label === 'paddle' && rel > 3) sim.events.push({ type: 'whack' });
    }
  });

  sim.step = () => {
    sim.t++;
    for (const p of paddles) {
      Body.setPosition(p.body, { x: p.cx, y: p.cy });
      Body.setVelocity(p.body, { x: 0, y: 0 });
      Body.setAngularVelocity(p.body, p.w);
    }
    Engine.update(engine, STEP);

    if (sim.t <= raceStart) {
      if (sim.t % 60 === 1) sim.events.push({ type: 'count', n: 3 - Math.floor(sim.t / 60) });
      if (sim.t === raceStart) {
        Composite.remove(engine.world, gate);
        sim.gate = null;
        sim.events.push({ type: 'go' });
      }
      return;
    }

    // Marbles crossing on the same step are placed by how far past the line they got.
    const crossed = marbles.filter(m => !m.finished && m.body.position.y > FINISH_Y)
      .sort((a, b) => b.body.position.y - a.body.position.y);
    for (const m of crossed) {
      m.finished = true;
      sim.finished.push(m);
      m.place = sim.finished.length;
      sim.events.push({ type: 'finish', place: m.place });
    }

    for (const m of marbles) {
      if (m.finished) continue;
      const { x, y } = m.body.position;
      if (x < -20 || x > W + 20 || y < -110) {
        // Escaped the course somehow: drop it back in the middle.
        Body.setPosition(m.body, { x: W / 2, y: Math.max(y, 100) });
        Body.setVelocity(m.body, { x: 0, y: 0 });
      }
      if (y > m.best + 2) {
        m.best = y;
        m.bestAt = sim.t;
      } else if (sim.t - m.bestAt > STUCK_STEPS) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        Body.setVelocity(m.body, { x: dir * (2 + Math.random() * 2), y: -2 });
        m.bestAt = sim.t;
      }
    }

    const left = marbles.filter(m => !m.finished);
    if (left.length <= 1 || sim.t - raceStart > TIMEOUT) {
      // Last to finish loses; on timeout, least progress (highest up the course) loses.
      sim.loserMarble = left.length
        ? left.reduce((a, b) => (b.body.position.y < a.body.position.y ? b : a))
        : sim.finished[sim.finished.length - 1];
      sim.loser = sim.loserMarble.player;
      sim.done = true;
      sim.events.push({ type: 'last' });
    }
  };

  return sim;
}

function renderer(canvas, sim) {
  const ctx = canvas.getContext('2d');
  let camTop = -60;
  const pegs = sim.statics.filter(b => b.label === 'peg');
  const solids = sim.statics.filter(b => b.label === 'ramp');
  const bumpers = sim.statics.filter(b => b.label === 'bumper');

  return dt => {
    const { w, h, dpr } = fit(canvas);
    const s = Math.min(w / W, h / 520);
    const ox = (w - W * s) / 2;
    const viewH = h / s;

    // Camera: keep the trailing marble in view, centered on the pack when it fits.
    let target = -60;
    const live = sim.marbles.filter(m => !m.finished);
    if (sim.done) {
      target = sim.loserMarble.body.position.y - viewH / 2;
    } else if (sim.t > sim.raceStart && live.length) {
      const ys = live.map(m => m.body.position.y);
      const trailing = Math.min(...ys);
      const leading = Math.max(...ys);
      target = Math.min((trailing + leading) / 2, trailing + viewH * 0.3) - viewH / 2;
    }
    target = clamp(target, -60, FLOOR_Y + 40 - viewH);
    camTop += (target - camTop) * ease(dt, 0.005);
    const top = camTop;
    const bottom = camTop + viewH;
    const visible = b => b.bounds.max.y > top - 20 && b.bounds.min.y < bottom + 20;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0818';
    ctx.fillRect(0, 0, w, h);

    ctx.setTransform(s, 0, 0, s, ox, -top * s);
    const bg = ctx.createLinearGradient(0, top, 0, bottom);
    bg.addColorStop(0, '#191336');
    bg.addColorStop(1, '#120e28');
    ctx.fillStyle = bg;
    ctx.fillRect(0, top, W, viewH);

    // Neon side rails
    ctx.strokeStyle = '#3de0ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#3de0ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, top); ctx.lineTo(0, bottom);
    ctx.moveTo(W, top); ctx.lineTo(W, bottom);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Finish line
    if (FINISH_Y > top && FINISH_Y < bottom + 20) {
      const sq = 10;
      for (let x = 0; x < W; x += sq) {
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = ((x / sq + r) % 2) ? '#f4f1ff' : '#15112b';
          ctx.fillRect(x, FINISH_Y + r * sq - sq, sq, sq);
        }
      }
      tag(ctx, 'FINISH', W / 2, FINISH_Y - 16, 16, '#ffd23f');
    }
    if (sim.gate) {
      ctx.fillStyle = '#ff4d8d';
      poly(ctx, sim.gate);
      ctx.fill();
    }

    // Pegs in one path
    ctx.fillStyle = '#8f86c9';
    ctx.beginPath();
    for (const p of pegs) {
      if (!visible(p)) continue;
      ctx.moveTo(p.position.x + 4, p.position.y);
      ctx.arc(p.position.x, p.position.y, 4, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.fillStyle = '#4a3f8f';
    ctx.strokeStyle = '#8f86c9';
    ctx.lineWidth = 1.5;
    for (const b of solids) {
      if (!visible(b)) continue;
      poly(ctx, b);
      ctx.fill();
      ctx.stroke();
    }

    for (const b of bumpers) {
      if (!visible(b)) continue;
      b.flash = Math.max(0, (b.flash || 0) - dt * 0.004);
      const r = b.circleRadius;
      ctx.fillStyle = b.flash > 0 ? shade('#ff4d8d', b.flash * 0.6) : '#ff4d8d';
      ctx.shadowColor = '#ff4d8d';
      ctx.shadowBlur = 8 + b.flash * 20;
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, r * (1 + b.flash * 0.12), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ffd23f';
    ctx.shadowColor = '#ffd23f';
    ctx.shadowBlur = 10;
    for (const { body } of sim.paddles) {
      if (!visible(body)) continue;
      poly(ctx, body);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Marbles, then names on top so labels never hide under another marble
    for (const m of sim.marbles) {
      const { x, y } = m.body.position;
      if (y < top - 30 || y > bottom + 30) continue;
      const c = m.player.color;
      const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, R);
      g.addColorStop(0, shade(c, 0.6));
      g.addColorStop(1, c);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
      if (sim.done && m === sim.loserMarble) {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, R + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const labelSize = clamp(12 * dpr / s, 9, 18);
    for (const m of sim.marbles) {
      const { x, y } = m.body.position;
      if (y < top - 30 || y > bottom + 30) continue;
      const label = short(m.player.name);
      ctx.font = `800 ${labelSize}px Inter, system-ui, sans-serif`;
      const half = ctx.measureText(label).width / 2 + 2;
      tag(ctx, label, clamp(x, half, W - half - 14 * dpr / s), y - R - 4, labelSize);
    }

    // Screen-space overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const trackX = w - 12 * dpr;
    const trackTop = 20 * dpr;
    const trackH = h - 40 * dpr;
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(trackX - 2 * dpr, trackTop, 4 * dpr, trackH);
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = dpr;
    ctx.strokeRect(trackX - 6 * dpr, trackTop + ((top + 60) / (FLOOR_Y + 100)) * trackH, 12 * dpr, (viewH / (FLOOR_Y + 100)) * trackH);
    for (const m of sim.marbles) {
      const p = clamp((m.body.position.y + 60) / (FLOOR_Y + 100), 0, 1);
      ctx.fillStyle = m.player.color;
      ctx.beginPath();
      ctx.arc(trackX, trackTop + p * trackH, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    if (sim.t <= sim.raceStart) {
      banner(ctx, w, h, dpr, String(Math.max(1, 3 - Math.floor(sim.t / 60))), { y: 0.42 });
    } else if (sim.t < sim.raceStart + 45) {
      banner(ctx, w, h, dpr, 'GO!', { y: 0.42, color: '#7ae582' });
    }
    if (sim.done) banner(ctx, w, h, dpr, `${short(sim.loser.name)} is last!`, { color: sim.loser.color, y: 0.3 });
  };
}

function hudUpdater(hud, sim) {
  return () => {
    const done = sim.finished.map(m =>
      `<div class="hud-row" style="--c:${m.player.color}"><span class="v">${m.place}.</span><span class="d"></span><span class="n">${esc(m.player.name)}</span></div>`);
    const rolling = sim.marbles.filter(m => !m.finished).map(m =>
      `<div class="hud-row dim${sim.done ? ' hot' : ''}" style="--c:${m.player.color}"><span class="d"></span><span class="n">${esc(m.player.name)}</span></div>`);
    setHud(hud, `<div class="hud-box">
      ${done.length ? `<div class="hud-title">Finished</div>${done.join('')}` : ''}
      ${rolling.length ? `<div class="hud-title">${sim.done ? 'Last place' : 'Still rolling'}</div>${rolling.join('')}` : ''}
    </div>`);
  };
}

export default {
  id: 'marble',
  title: 'Marble Race',
  emoji: '🔮',
  blurb: 'Pegs, bumpers, spinners. Last marble across the line orders.',
  simulate: players => simulateHeadless(createSim, players),
  play({ canvas, hud, players, signal, sfx }) {
    const sim = createSim(players);
    const draw = renderer(canvas, sim);
    const updateHud = hudUpdater(hud, sim);
    const peg = throttle(sfx.peg, 70);
    const bump = throttle(sfx.boing, 90);
    const whack = throttle(sfx.thud, 120);
    return runSim(signal, sim, dt => { draw(dt); updateHud(); }, e => {
      if (e.type === 'count') sfx.count();
      else if (e.type === 'go') sfx.go();
      else if (e.type === 'peg') peg();
      else if (e.type === 'bump') bump();
      else if (e.type === 'whack') whack();
      else if (e.type === 'finish') sfx.ding(e.place);
      else if (e.type === 'last') sfx.womp();
    });
  },
};
