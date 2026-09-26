// Wheel Spin: equal slices, tap to spin. The loser is drawn uniformly first,
// then the wheel is animated to land on a random spot inside their slice.

import { randInt, shuffle, rand } from '../fair.js?v=3';
import { TAU, fit, loop, banner, short, textOn, shade } from '../stage.js?v=3';

const POINTER = -Math.PI / 2;
const mod = (a, m) => ((a % m) + m) % m;

export default {
  id: 'wheel',
  title: 'Wheel Spin',
  emoji: '🎡',
  blurb: 'The classic. Tap to spin, pray it skips you.',
  simulate(players) {
    const order = shuffle(players);
    return order[randInt(order.length)];
  },
  play({ canvas, players, signal, sfx }) {
    const ctx = canvas.getContext('2d');
    const order = shuffle(players);
    const n = order.length;
    const slice = TAU / n;
    const loserIdx = randInt(n);

    let rot = rand(0, TAU);
    let spin = null;
    let lastSeg = null;
    let flap = 0;
    let doneAt = null;
    let elapsed = 0;

    const start = () => {
      if (spin) return;
      const f = rand(0.12, 0.88);
      const landing = POINTER - (loserIdx + f) * slice;
      const total = mod(landing - rot, TAU) + (5 + randInt(3)) * TAU;
      spin = { from: rot, total, dur: rand(5200, 6800), t: 0 };
      sfx.whoosh();
    };
    canvas.addEventListener('pointerdown', start);
    signal.addEventListener('abort', () => canvas.removeEventListener('pointerdown', start));

    return loop(signal, dt => {
      elapsed += dt;
      const { w, h, dpr } = fit(canvas);
      let settled = false;

      if (spin) {
        spin.t += dt;
        const k = Math.min(1, spin.t / spin.dur);
        rot = spin.from + spin.total * (1 - Math.pow(1 - k, 4));
        settled = k >= 1;
      } else {
        rot += dt * 0.0004;
      }
      const seg = Math.floor(mod(POINTER - rot, TAU) / slice);
      if (spin && lastSeg !== null && seg !== lastSeg) {
        sfx.tick();
        flap = 1;
      }
      lastSeg = seg;
      flap = Math.max(0, flap - dt * 0.012);

      const R = Math.min(w * 0.42, h * 0.36);
      const cx = w / 2;
      const cy = h * 0.47;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const bg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.max(w, h));
      bg.addColorStop(0, '#2a1d5c');
      bg.addColorStop(1, '#0e0b1f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Slices
      for (let i = 0; i < n; i++) {
        const a0 = rot + i * slice;
        const c = order[i].color;
        const lit = settled && i === loserIdx && Math.floor(elapsed / 180) % 2 === 0;
        ctx.fillStyle = lit ? shade(c, 0.5) : c;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a0 + slice);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#15112b';
        ctx.lineWidth = 3 * dpr;
        ctx.stroke();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a0 + slice / 2);
        const size = Math.min(R * 0.11, R * slice * 0.42, 26 * dpr);
        ctx.font = `800 ${size}px Inter, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = textOn(c);
        ctx.fillText(short(order[i].name), R - 14 * dpr, 0);
        ctx.restore();
      }

      // Rim lights
      ctx.lineWidth = 8 * dpr;
      ctx.strokeStyle = '#2b2358';
      ctx.beginPath();
      ctx.arc(cx, cy, R + 4 * dpr, 0, TAU);
      ctx.stroke();
      const bulbs = 24;
      for (let i = 0; i < bulbs; i++) {
        const a = (i / bulbs) * TAU;
        const on = (i + Math.floor(elapsed / (spin && !settled ? 90 : 400))) % 2 === 0;
        ctx.fillStyle = on ? '#ffd23f' : '#6b5a1f';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (R + 4 * dpr), cy + Math.sin(a) * (R + 4 * dpr), 3.2 * dpr, 0, TAU);
        ctx.fill();
      }

      // Hub
      ctx.fillStyle = '#15112b';
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.16, 0, TAU);
      ctx.fill();
      ctx.font = `${R * 0.16}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚕', cx, cy + R * 0.01);

      // Pointer (flaps back on each tick)
      ctx.save();
      ctx.translate(cx, cy - R - 6 * dpr);
      ctx.rotate(-flap * 0.35);
      ctx.fillStyle = '#f4f1ff';
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 6 * dpr;
      ctx.beginPath();
      ctx.moveTo(-14 * dpr, -18 * dpr);
      ctx.lineTo(14 * dpr, -18 * dpr);
      ctx.lineTo(0, 16 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (!spin) {
        const pulse = 0.92 + Math.sin(elapsed * 0.006) * 0.08;
        banner(ctx, w, h, dpr * pulse, 'Tap to spin', { y: 0.93 });
      }
      if (settled) {
        if (doneAt === null) {
          doneAt = elapsed;
          sfx.womp();
        }
        const loser = order[loserIdx];
        banner(ctx, w, h, dpr, short(loser.name), { color: loser.color, y: 0.93 });
        if (elapsed - doneAt > 1600) return loser;
      }
    });
  },
};
