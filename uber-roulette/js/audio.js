// Tiny WebAudio synth: no sound files needed.

const MUTE_KEY = 'uber-roulette:muted';
let ac = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked */ }

function ctx() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = new C();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

export const unlock = () => { if (!muted) ctx(); };
export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

function tone({ freq = 440, type = 'sine', dur = 0.1, vol = 0.15, slide = 0, delay = 0 }) {
  if (muted) return;
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.3, freq = 1200, slide = 0, delay = 0 }) {
  if (muted) return;
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + delay;
  const len = Math.ceil(a.sampleRate * dur);
  const buffer = a.createBuffer(1, len, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  tick: () => tone({ freq: 1500, type: 'square', dur: 0.025, vol: 0.05 }),
  peg: () => tone({ freq: 1800 + Math.random() * 900, type: 'sine', dur: 0.04, vol: 0.035 }),
  beep: (p = 0) => tone({ freq: 520 + p * 700, type: 'square', dur: 0.07, vol: 0.07 }),
  count: () => tone({ freq: 660, type: 'triangle', dur: 0.18, vol: 0.18 }),
  go: () => tone({ freq: 990, type: 'triangle', dur: 0.35, vol: 0.2, slide: 300 }),
  boing: () => tone({ freq: 180 + Math.random() * 80, type: 'sine', dur: 0.22, vol: 0.2, slide: 420 }),
  thud: () => noise({ dur: 0.12, vol: 0.25, freq: 400 }),
  ding: (p = 0) => tone({ freq: 880 + p * 60, type: 'sine', dur: 0.3, vol: 0.14 }),
  creak: () => tone({ freq: 90, type: 'sawtooth', dur: 0.35, vol: 0.06, slide: 60 }),
  whoosh: () => noise({ dur: 0.45, vol: 0.3, freq: 3000, slide: -2600 }),
  drum: () => noise({ dur: 0.06, vol: 0.18, freq: 500 }),
  buzz: () => tone({ freq: 140, type: 'square', dur: 0.4, vol: 0.09, slide: -40 }),
  clink() {
    tone({ freq: 2100, type: 'sine', dur: 0.25, vol: 0.12 });
    tone({ freq: 2650, type: 'sine', dur: 0.3, vol: 0.09, delay: 0.06 });
  },
  roar() {
    tone({ freq: 120, type: 'sawtooth', dur: 0.9, vol: 0.12, slide: -60 });
    noise({ dur: 0.9, vol: 0.2, freq: 700, slide: -500 });
  },
  chomp() {
    noise({ dur: 0.12, vol: 0.5, freq: 1800 });
    noise({ dur: 0.18, vol: 0.5, freq: 900, delay: 0.16 });
    tone({ freq: 80, type: 'square', dur: 0.3, vol: 0.15, delay: 0.05 });
  },
  hiss: () => noise({ dur: 0.9, vol: 0.08, freq: 6000 }),
  boom() {
    noise({ dur: 1.2, vol: 0.9, freq: 900, slide: -820 });
    tone({ freq: 90, type: 'sine', dur: 0.8, vol: 0.5, slide: -60 });
  },
  womp() {
    [392, 370, 349, 330].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: i === 3 ? 0.7 : 0.28, vol: 0.14, delay: i * 0.3, slide: i === 3 ? -40 : 0 }));
  },
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: i === 3 ? 0.5 : 0.14, vol: 0.14, delay: i * 0.11 }));
  },
};
