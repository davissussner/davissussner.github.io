// Pass the Beer: a beer gets passed around the circle. Whoever's holding it when
// the music stops keeps it and is safe. Repeat until one person is left without
// a beer: they order the Uber.
// Fairness: the order people win beers is a uniform shuffle drawn up front, so
// the person left over at the end is uniformly random. Each round's passes are
// built backward to end on that round's winner.

import { randInt, shuffle, rand } from '../fair.js?v=3';
import { TAU, fit, loop, banner, tag, short, clamp, ease, initial, textOn, shade } from '../stage.js?v=3';

const INTRO = 1000;
const CHEERS = 1700;
const FINAL_HOLD = 2300;

function planRound(remaining, winner) {
  const n = remaining.length;
  const target = remaining.indexOf(winner);
  const passes = (n > 5 ? 5 : 7) + randInt(6);
  const seq = [target];
  for (let i = 0; i < passes; i++) {
    const r = randInt(n - 1);
    seq.unshift(r >= seq[0] ? r + 1 : r);
  }
  const durs = seq.slice(1).map((_, i) => Math.max(150, 560 * Math.pow(0.88, i)));
  const ends = [];
  let acc = INTRO;
  for (const d of durs) ends.push(acc += d);
  return { seq, durs, ends, stopAt: acc + rand(350, 1300), winner };
}

export default {
  id: 'beer',
  title: 'Pass the Beer',
  emoji: '🍺',
  blurb: "Holding the beer when the music stops? You keep it. Last one without a beer orders.",
  simulate(players) {
    const beerOrder = shuffle(players);
    return beerOrder[beerOrder.length - 1];
  },
  play({ canvas, players, signal, sfx }) {
    const ctx = canvas.getContext('2d');
    const beerOrder = shuffle(players); // round i's winner is beerOrder[i]; the last one orders
    let remaining = shuffle(players);   // seating around the circle
    const safe = [];
    const pos = new Map();
    let round = 0;
    let plan = planRound(remaining, beerOrder[0]);
    let rt = 0;
    let caught = -1;
    let cheered = false;
    let finalAt = null;
    let elapsed = 0;
    const bubbles = [];
    const notes = [];
    let nextNote = 0;

    return loop(signal, dt => {
      elapsed += dt;
      const { w, h, dpr } = fit(canvas);
      const cx = w / 2;
      const cy = h * 0.42;
      const Rc = Math.min(w * 0.34, h * 0.26);
      const n = remaining.length;
      const r = clamp(Rc * Math.sin(Math.PI / Math.max(n, 3)) * 0.72, 18 * dpr, 44 * dpr);
      const seat = i => {
        if (n === 1) return { x: cx, y: cy };
        const a = -Math.PI / 2 + (i / n) * TAU;
        return { x: cx + Math.cos(a) * Rc, y: cy + Math.sin(a) * Rc };
      };
      // Dance floor along the bottom; people with beers stand (feet) on floorY
      const floorY = h - 40 * dpr;
      const gap = Math.min(64 * dpr, (w - 40 * dpr) / Math.max(safe.length, 1));
      const room = floorY - (cy + Rc + r + 40 * dpr); // space between the circle and the floor
      const ds = clamp(Math.min(room / 4.2, gap * 0.34), 9 * dpr, 26 * dpr);
      const barSeat = i => ({ x: cx + (i - (safe.length - 1) / 2) * gap, y: floorY });

      // Everyone glides toward their seat (the circle closes up as people leave)
      const k = ease(dt, 0.008);
      remaining.forEach((p, i) => {
        const t = seat(i);
        const c = pos.get(p) ?? t;
        pos.set(p, { x: c.x + (t.x - c.x) * k, y: c.y + (t.y - c.y) * k });
      });
      safe.forEach((p, i) => {
        const t = barSeat(i);
        const c = pos.get(p) ?? t;
        pos.set(p, { x: c.x + (t.x - c.x) * k, y: c.y + (t.y - c.y) * k });
      });
      const hand = i => {
        const p = pos.get(remaining[i]);
        return { x: p.x + (cx - p.x) * 0.3, y: p.y + (cy - p.y) * 0.3 };
      };

      // Round logic
      let holder = null;
      let beer = null;
      let tilt = 0;
      if (finalAt === null) {
        rt += dt;
        const { seq, durs, ends, stopAt } = plan;
        const pass = rt < INTRO ? -1 : ends.findIndex(e => rt < e);
        if (rt < INTRO) {
          holder = seq[0];
        } else if (pass >= 0) {
          const start = pass === 0 ? INTRO : ends[pass - 1];
          const u = Math.min(1, (rt - start) / (durs[pass] * 0.7));
          const a = hand(seq[pass]);
          const b = hand(seq[pass + 1]);
          beer = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - Math.sin(Math.PI * u) * Rc * 0.3 };
          tilt = Math.sin(Math.PI * u) * 0.6 * (b.x > a.x ? 1 : -1);
          if (u >= 1) holder = seq[pass + 1];
          if (u >= 1 && caught < pass) {
            caught = pass;
            sfx.beep(pass / durs.length);
          }
        } else {
          holder = seq[seq.length - 1];
        }
        if (holder !== null) beer = hand(holder);

        if (rt >= stopAt && !cheered) {
          cheered = true;
          sfx.clink();
          const p = pos.get(plan.winner);
          for (let i = 0; i < 40; i++) {
            bubbles.push({ x: p.x + (Math.random() - 0.5) * r, y: p.y, vx: (Math.random() - 0.5) * 2 * dpr, vy: -(1 + Math.random() * 3) * dpr, life: 1 });
          }
        }
        if (cheered && rt >= stopAt + CHEERS) {
          // Winner takes their beer to the bar; the circle closes up.
          safe.push(plan.winner);
          remaining = remaining.filter(p => p !== plan.winner);
          round++;
          caught = -1;
          cheered = false;
          rt = 0;
          holder = null;
          beer = null;
          if (remaining.length === 1) {
            finalAt = elapsed;
            sfx.womp();
          } else {
            plan = planRound(remaining, beerOrder[round]);
          }
        }
      }

      // Draw
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
      bg.addColorStop(0, '#3a2a14');
      bg.addColorStop(0.55, '#1c1433');
      bg.addColorStop(1, '#0e0b1f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Dance floor: tiles that cycle color on the beat
      const beatN = Math.floor(elapsed / 420);
      const tile = 26 * dpr;
      const disco = ['#ff4d8d', '#3de0ff', '#ffd23f', '#b388ff', '#7ae582'];
      for (let x = 0, i = 0; x < w; x += tile, i++) {
        ctx.fillStyle = safe.length ? disco[(i + beatN) % disco.length] : '#3a2a52';
        ctx.globalAlpha = safe.length ? ((i + beatN) % 2 ? 0.28 : 0.5) : 0.4;
        ctx.fillRect(x, floorY, tile - 2 * dpr, h - floorY);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(0, floorY - 2 * dpr, w, 4 * dpr);
      if (safe.length) {
        // Spotlights sweeping over the dancers
        for (let i = 0; i < 3; i++) {
          const sx = w * (0.2 + 0.3 * i) + Math.sin(elapsed * 0.0012 + i * 2) * w * 0.12;
          const g = ctx.createRadialGradient(sx, floorY - ds * 1.5, 0, sx, floorY - ds * 1.5, ds * 5);
          g.addColorStop(0, disco[(i + beatN) % disco.length] + '55');
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.fillRect(sx - ds * 5, floorY - ds * 6.5, ds * 10, ds * 10);
        }
        tag(ctx, 'HAS A BEER 🍻', cx, floorY - ds * 3.6 - 14 * dpr, 11 * dpr, '#ffd23f');
      }

      if (n > 1) {
        ctx.strokeStyle = 'rgba(255,255,255,.08)';
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 10 * dpr]);
        ctx.beginPath();
        ctx.arc(cx, cy, Rc, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const avatar = (p, x, y, rad, { glow = false, dim = false } = {}) => {
        ctx.globalAlpha = dim ? 0.9 : 1;
        ctx.shadowColor = glow ? '#ffd23f' : 'transparent';
        ctx.shadowBlur = glow ? 26 * dpr : 0;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = textOn(p.color);
        ctx.font = `800 ${rad * 0.9}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial(p.name), x, y + rad * 0.04);
        ctx.globalAlpha = 1;
      };

      const winnerNow = cheered ? plan.winner : null;
      remaining.forEach((p, i) => {
        let { x, y } = pos.get(p);
        const holding = holder === i && !cheered && finalAt === null;
        if (holding) {
          x += (Math.random() - 0.5) * 3 * dpr;
          y += (Math.random() - 0.5) * 3 * dpr;
        }
        const last = finalAt !== null;
        const rad = last ? r * 1.6 : r;
        avatar(p, x, y, rad, { glow: p === winnerNow || holding });
        const below = y > cy + 1 && !last;
        tag(ctx, short(p.name), x, below ? y + rad + 17 * dpr : y - rad - 8 * dpr, (last ? 16 : 13) * dpr);
        if (last) {
          ctx.font = `${rad}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🚕', x + rad * 0.95, y + rad * 0.75);
        }
      });
      // People with beers dance: hop, sway, wave one arm, pump the beer with the other
      const dancer = (p, x, y, u, ph) => {
        const beat = elapsed * 0.0105 + ph;
        const hop = Math.abs(Math.sin(beat)) * u * 0.45;
        const kick = Math.sin(beat) * u * 0.35;
        ctx.save();
        ctx.translate(x, y);
        ctx.lineCap = 'round';
        ctx.lineWidth = u * 0.28;
        ctx.strokeStyle = shade(p.color, -0.35);
        const hipY = -u - hop;
        ctx.beginPath();
        ctx.moveTo(-u * 0.2, hipY);
        ctx.lineTo(-u * 0.35 - kick * 0.5, -hop * 0.3);
        ctx.moveTo(u * 0.2, hipY);
        ctx.lineTo(u * 0.35 + kick * 0.5, -hop * 0.3);
        ctx.stroke();
        ctx.translate(0, hipY);
        ctx.rotate(Math.sin(beat / 2) * 0.22);
        const arm = (sx, a) => {
          const hx = sx + Math.cos(a) * u * 0.85;
          const hy = -u * 0.8 + Math.sin(a) * u * 0.85;
          ctx.beginPath();
          ctx.moveTo(sx, -u * 0.8);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          return { hx, hy };
        };
        arm(-u * 0.32, -2.3 + Math.sin(beat) * 0.6);
        const { hx, hy } = arm(u * 0.32, -0.9 + Math.sin(beat * 2) * 0.45);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-u * 0.38, -u * 0.95, u * 0.76, u, u * 0.3);
        else ctx.rect(-u * 0.38, -u * 0.95, u * 0.76, u);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -u * 1.45, u * 0.52, 0, TAU);
        ctx.fill();
        ctx.fillStyle = textOn(p.color);
        ctx.font = `800 ${u * 0.6}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial(p.name), 0, -u * 1.43);
        ctx.font = `${u * 0.95}px sans-serif`;
        ctx.fillText('🍺', hx + u * 0.1, hy - u * 0.15);
        ctx.restore();
      };
      safe.forEach((p, i) => {
        const { x, y } = pos.get(p);
        dancer(p, x, y, ds, i * 1.7);
        tag(ctx, short(p.name), x, floorY + 16 * dpr, 10 * dpr);
      });

      // Music notes drifting up off the dance floor
      if (safe.length && elapsed > nextNote) {
        nextNote = elapsed + 380;
        const from = pos.get(safe[randInt(safe.length)]);
        notes.push({ x: from.x, y: from.y - ds * 2.5, vx: (Math.random() - 0.5) * 0.6 * dpr, life: 1, ch: Math.random() < 0.5 ? '♪' : '♫', c: disco[randInt(disco.length)] });
      }
      for (let i = notes.length - 1; i >= 0; i--) {
        const m = notes[i];
        m.x += m.vx * dt * 0.06;
        m.y -= 0.9 * dpr * dt * 0.06;
        m.life -= dt * 0.0009;
        if (m.life <= 0) { notes.splice(i, 1); continue; }
        ctx.globalAlpha = m.life;
        ctx.fillStyle = m.c;
        ctx.font = `800 ${15 * dpr}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(m.ch, m.x, m.y);
      }
      ctx.globalAlpha = 1;

      // The beer
      if (beer && finalAt === null) {
        const size = clamp(r * 1.1, 26 * dpr, 46 * dpr);
        const bob = cheered ? -Math.min(1, (rt - plan.stopAt) / 300) * r * 0.9 : 0;
        ctx.save();
        ctx.translate(beer.x, beer.y + bob);
        ctx.rotate(tilt);
        ctx.font = `${size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🍺', 0, 0);
        ctx.restore();
      }

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.x += b.vx * dt * 0.06;
        b.y += b.vy * dt * 0.06;
        b.life -= dt * 0.0012;
        if (b.life <= 0) { bubbles.splice(i, 1); continue; }
        ctx.globalAlpha = b.life;
        ctx.strokeStyle = '#ffe9a8';
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.5 * dpr, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Headlines
      if (finalAt !== null) {
        const loser = remaining[0];
        banner(ctx, w, h, dpr, 'NO BEER LEFT', { color: '#ff4d6d', sub: `${loser.name} is the last one standing`, y: 0.1 });
        if (elapsed - finalAt > FINAL_HOLD) return loser;
      } else if (cheered) {
        banner(ctx, w, h, dpr, 'CHEERS! 🍻', { color: '#ffd23f', sub: `${plan.winner.name} gets a beer`, y: 0.1 });
      } else if (rt < INTRO) {
        const title = round === 0 ? 'Pass the beer!' : `Round ${round + 1}`;
        banner(ctx, w, h, dpr, title, { color: '#ffd23f', sub: `${n} still thirsty`, y: 0.1 });
      } else if (holder !== null) {
        tag(ctx, `${remaining[holder].name} has it…`, w / 2, h * 0.1, 17 * dpr, '#ffd23f');
      }
    });
  },
};
