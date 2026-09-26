// "NAME is ordering the Uber" overlay with confetti.

const overlay = document.getElementById('result');
const nameEl = document.getElementById('result-name');
const card = overlay.querySelector('.result-card');
const cv = document.getElementById('confetti');
const again = document.getElementById('again');
const change = document.getElementById('change');
const COLORS = ['#ffd23f', '#ff4d8d', '#3de0ff', '#7ae582', '#b388ff', '#ff8c42'];
let raf = 0;

export function showResult(player, { onAgain, onChange }) {
  nameEl.textContent = player.name;
  overlay.style.setProperty('--c', player.color);
  overlay.classList.remove('hidden');
  // Shrink long names to fit on one line instead of wrapping mid-word
  nameEl.style.fontSize = '';
  const fits = nameEl.clientWidth / ([...player.name].length * 0.82);
  nameEl.style.fontSize = `${Math.min(58, fits, parseFloat(getComputedStyle(nameEl).fontSize))}px`;
  // Restart the pop/shake animation
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  again.onclick = onAgain;
  change.onclick = onChange;
  again.focus({ preventScroll: true });
  confetti(player.color);
}

export function hideResult() {
  overlay.classList.add('hidden');
  cancelAnimationFrame(raf);
}

function confetti(main) {
  cancelAnimationFrame(raf);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = cv.clientWidth * dpr;
  cv.height = cv.clientHeight * dpr;
  const ctx = cv.getContext('2d');
  const bits = Array.from({ length: 180 }, (_, i) => ({
    x: Math.random() * cv.width,
    y: -Math.random() * cv.height * 0.6,
    vx: (Math.random() - 0.5) * 3 * dpr,
    vy: (2 + Math.random() * 4) * dpr,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    s: (5 + Math.random() * 6) * dpr,
    c: i % 3 === 0 ? main : COLORS[i % COLORS.length],
  }));
  const start = performance.now();
  const tick = now => {
    const age = now - start;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalAlpha = Math.max(0, Math.min(1, (5000 - age) / 1000));
    for (const b of bits) {
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.04 * dpr;
      b.vx *= 0.99;
      b.r += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      ctx.restore();
    }
    if (age < 5000) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  };
  raf = requestAnimationFrame(tick);
}
