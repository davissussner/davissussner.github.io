// Shared canvas, loop and drawing helpers for the game modes.

export const STEP = 1000 / 60;
export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const ease = (dt, rate) => 1 - Math.exp(-dt * rate);

// Match the canvas backing store to its CSS size. Returns device-pixel size.
export function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr };
}

// rAF loop. `frame` returns a non-null value to finish; abort resolves null.
export function loop(signal, frame) {
  return new Promise(resolve => {
    let last = null;
    const tick = now => {
      if (signal.aborted) return resolve(null);
      const dt = last === null ? STEP : Math.min(64, now - last);
      last = now;
      const out = frame(dt, now);
      if (out !== undefined && out !== null) return resolve(out);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// Drive a physics sim at a fixed 60Hz step, render every frame, and resolve
// with the sim's loser once it's done and the "last place" moment has played.
// `speed` only changes playback rate (slow motion), never the physics itself.
export function runSim(signal, sim, draw, onEvent, holdMs = 1900, speed = () => 1) {
  let acc = 0;
  let doneAt = null;
  return loop(signal, (dt, now) => {
    acc += dt * speed();
    let n = 0;
    while (acc >= STEP && !sim.done && n < 4) {
      sim.step();
      acc -= STEP;
      n++;
    }
    if (n === 4) acc = 0;
    for (const e of sim.events.splice(0)) onEvent(e);
    draw(dt, now);
    if (sim.done) {
      doneAt ??= now;
      if (now - doneAt >= holdMs) return sim.loser;
    }
  });
}

// Run a physics sim to completion with no rendering (fairness testing).
export function simulateHeadless(createSim, players) {
  const sim = createSim(players, { headless: true });
  let guard = 0;
  while (!sim.done && guard++ < 60000) {
    sim.step();
    sim.events.length = 0;
  }
  return sim.loser;
}

export function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const t = performance.now();
    if (t - last >= ms) {
      last = t;
      fn(...args);
    }
  };
}

export function poly(ctx, body) {
  const v = body.vertices;
  ctx.beginPath();
  ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
}

export const short = name => (name.length > 9 ? name.slice(0, 8) + '…' : name);
export const initial = name => [...name.trim()][0]?.toUpperCase() ?? '?';

// Outlined label, centered at x, sitting on baseline y.
export function tag(ctx, text, x, y, size, color = '#fff') {
  ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.3;
  ctx.strokeStyle = 'rgba(10, 8, 24, .9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Big centered headline in screen space.
export function banner(ctx, w, h, dpr, text, { sub = '', color = '#ffd23f', y = 0.2 } = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const size = Math.min(w * 0.09, 44 * dpr);
  ctx.font = `400 ${size}px Bungee, Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = 'rgba(10, 8, 24, .92)';
  ctx.strokeText(text, w / 2, h * y);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h * y);
  if (sub) tag(ctx, sub, w / 2, h * y + size * 0.95, size * 0.42, '#f4f1ff');
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// amt > 0 lightens toward white, < 0 darkens toward black.
export function shade(hex, amt) {
  const [r, g, b] = rgb(hex).map(c => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)));
  return `rgb(${r},${g},${b})`;
}

export function textOn(hex) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#15112b' : '#ffffff';
}

// Replace HUD markup only when it changed (avoids DOM churn every frame).
export function setHud(hud, html) {
  if (hud._html !== html) {
    hud._html = html;
    hud.innerHTML = html;
  }
}

export const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
