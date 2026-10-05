// Balloon Pop: kids sit at desks; a balloon bounces from desk to desk, growing with
// every pass, until it pops over whoever gets picked.
// Fairness: the picked kid is drawn uniformly up front, then the passes are built
// backward so the balloon ends on them. Seating is shuffled too.

import { randInt, shuffle, rand } from '../../../uber-roulette/js/fair.js?v=7';
import { TAU, fit, loop, banner, tag, short, clamp, initial, textOn } from '../../../uber-roulette/js/stage.js?v=7';

const INTRO = 1100;
const POP_HOLD = 2300;
const BALLOON_COLORS = ['#ff4d6d', '#3de0ff', '#ffd23f', '#7ae582', '#b388ff', '#ff8c42'];

// Desk grid that makes each cell as big as possible for this many kids
function layout(n, w, h) {
  let best = { cols: 1, rows: n, cell: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cell = Math.min(w / cols, h / rows);
    if (cell > best.cell) best = { cols, rows, cell };
  }
  return best;
}

export default {
  id: 'balloon',
  title: 'Balloon Pop',
  emoji: '🎈',
  blurb: 'The balloon bounces desk to desk and pops on someone!',
  simulate(players) {
    const order = shuffle(players);
    return order[randInt(order.length)];
  },
  play({ canvas, players, signal, sfx }) {
    const ctx = canvas.getContext('2d');
    const order = shuffle(players);
    const n = order.length;
    const winner = randInt(n);

    const K = n > 1 ? 12 + randInt(8) : 0;
    const seq = [winner];
    for (let i = 0; i < K; i++) {
      const r = randInt(n - 1);
      seq.unshift(r >= seq[0] ? r + 1 : r);
    }
    const durs = Array.from({ length: K }, (_, i) => Math.max(170, 560 * Math.pow(0.9, i)));
    const ends = [];
    let acc = INTRO;
    for (const d of durs) ends.push(acc += d);
    const inflateFor = rand(900, 1700);
    const popAt = acc + inflateFor;

    let t = 0;
    let caught = -1;
    let popped = false;
    let squeak = 0;
    const confetti = [];

    return loop(signal, dt => {
      t += dt;
      const { w, h, dpr } = fit(canvas);
      const top = h * 0.16;
      const { cols, rows, cell } = layout(n, w * 0.96, h - top - 10 * dpr);
      const gx = (w - cols * cell) / 2;
      const gy = top + (h - top - rows * cell) / 2;
      const seat = i => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        return { x: gx + (c + 0.5) * cell, y: gy + (r + 0.42) * cell };
      };

      // Where's the balloon, and how big is it?
      let holder = seq[0];
      let pos = seat(seq[0]);
      let lift = 0;
      const pass = t < INTRO ? -1 : ends.findIndex(e => t < e);
      if (pass >= 0) {
        const start = pass === 0 ? INTRO : ends[pass - 1];
        const u = Math.min(1, (t - start) / (durs[pass] * 0.75));
        const a = seat(seq[pass]);
        const b = seat(seq[pass + 1]);
        pos = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
        lift = Math.sin(Math.PI * u) * cell * 0.9;
        holder = u < 1 ? null : seq[pass + 1];
        if (u >= 1 && caught < pass) {
          caught = pass;
          sfx.beep(pass / Math.max(1, K));
        }
      } else if (t >= INTRO) {
        holder = seq[K];
        pos = seat(seq[K]);
      }
      const passed = pass === -1 ? (t < INTRO ? 0 : K) : pass;
      const inflating = !popped && t >= acc;
      const swell = inflating ? clamp((t - acc) / inflateFor, 0, 1) : 0;
      const size = cell * (0.2 + 0.22 * (passed / Math.max(1, K)) + 0.25 * swell);
      if (inflating && t > squeak) {
        squeak = t + 260;
        sfx.beep(1 + swell);
      }

      if (!popped && t >= popAt) {
        popped = true;
        sfx.pop();
        const p = seat(winner);
        for (let i = 0; i < 90; i++) {
          const a = Math.random() * TAU;
          const v = (2 + Math.random() * 8) * dpr;
          confetti.push({ x: p.x, y: p.y - cell * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3 * dpr, life: 1, c: BALLOON_COLORS[i % BALLOON_COLORS.length], r: Math.random() * TAU });
        }
      }

      // Classroom
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#f7ecd7';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e9d9b8';
      for (let y = 0; y < h; y += 28 * dpr) ctx.fillRect(0, y, w, 1.5 * dpr);
      // Chalkboard strip along the top
      ctx.fillStyle = '#2f5d50';
      ctx.fillRect(w * 0.08, 6 * dpr, w * 0.84, top - 16 * dpr);
      ctx.strokeStyle = '#a0703c';
      ctx.lineWidth = 5 * dpr;
      ctx.strokeRect(w * 0.08, 6 * dpr, w * 0.84, top - 16 * dpr);

      // Desks and kids
      for (let i = 0; i < n; i++) {
        const p = order[i];
        const { x, y } = seat(i);
        const picked = popped && i === winner;
        const holding = holder === i && !popped;
        const r = cell * 0.2;
        ctx.fillStyle = picked ? '#ffd23f' : '#c8925a';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - cell * 0.38, y + r * 0.9, cell * 0.76, cell * 0.22, cell * 0.04);
        else ctx.rect(x - cell * 0.38, y + r * 0.9, cell * 0.76, cell * 0.22);
        ctx.fill();
        ctx.save();
        if (picked || holding) {
          ctx.shadowColor = '#ffd23f';
          ctx.shadowBlur = (picked ? 30 : 16) * dpr;
        }
        const bounce = picked ? Math.abs(Math.sin(t * 0.012)) * r * 0.4 : 0;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y - bounce, r, 0, TAU);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = textOn(p.color);
        ctx.font = `800 ${r * 0.95}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial(p.name), x, y - bounce + r * 0.05);
        const fs = clamp(cell * 0.14, 9 * dpr, 20 * dpr);
        tag(ctx, short(p.name), x, y + r * 0.9 + cell * 0.22 + fs * 1.05, fs, picked ? '#ffd23f' : '#fff');
      }

      // Balloon on a string
      if (!popped && n > 0) {
        const bx = pos.x + (inflating ? (Math.random() - 0.5) * 4 * dpr * (1 + swell * 2) : 0);
        const by = pos.y - cell * 0.35 - lift - size;
        const color = BALLOON_COLORS[passed % BALLOON_COLORS.length];
        ctx.strokeStyle = '#7a6e8f';
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(bx, by + size * 1.1);
        ctx.quadraticCurveTo(bx + size * 0.3, by + size * 1.5, bx, pos.y - cell * 0.12 - lift * 0.6);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(bx, by, size * 0.85, size, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx - size * 0.15, by + size * 1.12);
        ctx.lineTo(bx + size * 0.15, by + size * 1.12);
        ctx.lineTo(bx, by + size * 0.95);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.45)';
        ctx.beginPath();
        ctx.ellipse(bx - size * 0.35, by - size * 0.35, size * 0.18, size * 0.28, -0.5, 0, TAU);
        ctx.fill();
      }

      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i];
        c.x += c.vx * dt * 0.06;
        c.y += c.vy * dt * 0.06;
        c.vy += 0.25 * dpr * dt * 0.06;
        c.r += 0.1;
        c.life -= dt * 0.0006;
        if (c.life <= 0) { confetti.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = Math.min(1, c.life * 2);
        ctx.translate(c.x, c.y);
        ctx.rotate(c.r);
        ctx.fillStyle = c.c;
        ctx.fillRect(-4 * dpr, -2 * dpr, 8 * dpr, 4 * dpr);
        ctx.restore();
      }

      // Chalkboard headline
      const board = top / h * 0.5;
      if (popped) {
        banner(ctx, w, h, dpr, 'POP! 🎉', { color: '#ffd23f', y: board });
        if (t - popAt > POP_HOLD) return { loser: order[winner], shot: null };
      } else if (t < INTRO) {
        banner(ctx, w, h, dpr, 'Pass the balloon!', { color: '#fff', y: board });
      } else if (inflating) {
        banner(ctx, w, h, dpr, 'It’s getting BIG…', { color: '#ffd23f', y: board });
      } else if (holder !== null) {
        banner(ctx, w, h, dpr, `${short(order[holder].name)}!`, { color: order[holder].color, y: board });
      }
    });
  },
};
