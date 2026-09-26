// Hot Potato: a lit bomb gets tossed around the circle. Whoever holds it at BOOM orders.
// The loser is drawn uniformly first; the pass sequence is built backward to end on them.

import { randInt, shuffle, rand } from '../fair.js';
import { TAU, fit, loop, banner, tag, short, clamp, initial, textOn } from '../stage.js';

const LIT = 1100;

export default {
  id: 'potato',
  title: 'Hot Potato',
  emoji: '💣',
  blurb: "A lit bomb gets passed around. Whoever's holding it at BOOM orders.",
  simulate(players) {
    const order = shuffle(players);
    return order[randInt(order.length)];
  },
  play({ canvas, players, signal, sfx }) {
    const ctx = canvas.getContext('2d');
    const order = shuffle(players);
    const n = order.length;
    const loser = randInt(n);

    const K = 14 + randInt(10);
    const seq = [loser];
    for (let i = 0; i < K; i++) {
      const r = randInt(n - 1);
      seq.unshift(r >= seq[0] ? r + 1 : r);
    }
    const durs = Array.from({ length: K }, (_, i) => Math.max(140, 620 * Math.pow(0.9, i)));
    const ends = [];
    let acc = LIT;
    for (const d of durs) ends.push(acc += d);
    const boomAt = acc + rand(700, 1600);

    let t = 0;
    let caught = -1;
    let boomed = false;
    let shake = 0;
    let flash = 0;
    const sparks = [];
    const debris = [];
    sfx.hiss();

    return loop(signal, dt => {
      t += dt;
      const { w, h, dpr } = fit(canvas);
      const cx = w / 2;
      const cy = h / 2;
      const Rc = Math.min(w, h) * 0.33;
      const r = clamp(Rc * Math.sin(Math.PI / n) * 0.72, 16 * dpr, 44 * dpr);
      const seat = i => {
        const a = -Math.PI / 2 + (i / n) * TAU;
        return { x: cx + Math.cos(a) * Rc, y: cy + Math.sin(a) * Rc };
      };
      const hand = i => {
        const p = seat(i);
        return { x: p.x + (cx - p.x) * 0.28, y: p.y + (cy - p.y) * 0.28 };
      };

      // Where is the bomb?
      let holder = seq[0];
      let bomb = hand(seq[0]);
      const pass = t < LIT ? -1 : ends.findIndex(e => t < e);
      if (pass >= 0) {
        const from = seq[pass];
        const to = seq[pass + 1];
        const start = pass === 0 ? LIT : ends[pass - 1];
        const u = Math.min(1, (t - start) / (durs[pass] * 0.7));
        const a = hand(from);
        const b = hand(to);
        bomb = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - Math.sin(Math.PI * u) * Rc * 0.35 };
        holder = u < 1 ? null : to;
        if (u >= 1 && caught < pass) {
          caught = pass;
          sfx.beep(pass / K);
        }
      } else if (t >= LIT) {
        holder = seq[K];
        bomb = hand(seq[K]);
      }

      if (!boomed && t >= boomAt) {
        boomed = true;
        shake = 1;
        flash = 1;
        sfx.boom();
        for (let i = 0; i < 70; i++) {
          const a = Math.random() * TAU;
          const v = (2 + Math.random() * 9) * dpr;
          debris.push({ x: bomb.x, y: bomb.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: ['#ffd23f', '#ff8c42', '#ff4d6d', '#f4f1ff'][i % 4] });
        }
      }

      // Background, with screen shake
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
      bg.addColorStop(0, '#2a1d5c');
      bg.addColorStop(1, '#0e0b1f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      shake = Math.max(0, shake - dt * 0.0015);
      const sx = (Math.random() - 0.5) * shake * 30 * dpr;
      const sy = (Math.random() - 0.5) * shake * 30 * dpr;
      ctx.setTransform(1, 0, 0, 1, sx, sy);

      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([6 * dpr, 10 * dpr]);
      ctx.beginPath();
      ctx.arc(cx, cy, Rc, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      // Players
      const heat = clamp((t - LIT) / (boomAt - LIT), 0, 1);
      for (let i = 0; i < n; i++) {
        const p = order[i];
        let { x, y } = seat(i);
        if (!boomed && holder === i) {
          x += (Math.random() - 0.5) * (2 + heat * 8) * dpr;
          y += (Math.random() - 0.5) * (2 + heat * 8) * dpr;
        }
        const burnt = boomed && i === loser;
        ctx.fillStyle = burnt ? '#2b2530' : p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = holder === i && !boomed ? 22 * dpr : 0;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = burnt ? '#f4f1ff' : textOn(p.color);
        ctx.font = `800 ${r * 0.9}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(burnt ? '💥' : initial(p.name), x, y + r * 0.04);
        const below = y > cy + 1;
        tag(ctx, short(p.name), x, below ? y + r + 17 * dpr : y - r - 7 * dpr, 13 * dpr);
      }

      // Bomb
      if (!boomed) {
        const br = clamp(r * 0.62, 12 * dpr, 24 * dpr);
        ctx.fillStyle = '#15112b';
        ctx.strokeStyle = '#4a3f8f';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, br, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        ctx.beginPath();
        ctx.arc(bomb.x - br * 0.35, bomb.y - br * 0.35, br * 0.25, 0, TAU);
        ctx.fill();
        const fuse = br * (1.1 - heat * 0.8);
        const fx = bomb.x + br * 0.5 + fuse * 0.5;
        const fy = bomb.y - br * 0.7 - fuse * 0.6;
        ctx.strokeStyle = '#c9a36b';
        ctx.lineWidth = 2.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(bomb.x + br * 0.4, bomb.y - br * 0.8);
        ctx.quadraticCurveTo(bomb.x + br * 0.4 + fuse * 0.6, bomb.y - br * 0.8 - fuse * 0.1, fx, fy);
        ctx.stroke();
        for (let i = 0; i < 2 + heat * 3; i++) {
          sparks.push({ x: fx, y: fy, vx: (Math.random() - 0.5) * 3 * dpr, vy: (Math.random() - 0.8) * 3 * dpr, life: 1 });
        }
      }
      for (const list of [sparks, debris]) {
        for (let i = list.length - 1; i >= 0; i--) {
          const s = list[i];
          s.x += s.vx * dt * 0.06;
          s.y += s.vy * dt * 0.06;
          s.vy += 0.15 * dpr * dt * 0.06;
          s.life -= dt * (list === sparks ? 0.004 : 0.0009);
          if (s.life <= 0) { list.splice(i, 1); continue; }
          ctx.globalAlpha = s.life;
          ctx.fillStyle = s.c || '#ffd23f';
          ctx.fillRect(s.x, s.y, (list === sparks ? 2.5 : 5) * dpr, (list === sparks ? 2.5 : 5) * dpr);
        }
      }
      ctx.globalAlpha = 1;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 240, 200, ${flash})`;
        ctx.fillRect(0, 0, w, h);
        flash = Math.max(0, flash - dt * 0.003);
      }
      if (boomed) {
        banner(ctx, w, h, dpr, 'BOOM!', { color: '#ff8c42', sub: `${order[loser].name} was holding it`, y: 0.1 });
        if (t - boomAt > 1900) return order[loser];
      } else if (t < LIT) {
        banner(ctx, w, h, dpr, 'Fuse lit!', { color: '#ff8c42', y: 0.1 });
      } else if (holder !== null) {
        tag(ctx, `${order[holder].name} has it!`, w / 2, h * 0.1, 18 * dpr, '#ffd23f');
      }
    });
  },
};
