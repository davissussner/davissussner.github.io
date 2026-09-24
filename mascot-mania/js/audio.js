// Every sound is synthesized with Web Audio, so there are no audio files to host.
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.45;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) {
    ctx = null;
  }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.45;
  return muted;
}

function envelope(gain, t, vol, dur, attack = 0.005) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone({ type = 'sine', freq = 440, freqEnd = null, dur = 0.2, vol = 0.3, delay = 0, attack }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  envelope(g, t, vol, dur, attack);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.3, type = 'lowpass', freq = 1000, freqEnd = null, q = 1, delay = 0, attack }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  envelope(g, t, vol, dur, attack);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export const sfx = {
  swing() { noise({ type: 'bandpass', freq: 2400, freqEnd: 700, dur: 0.13, vol: 0.18, q: 0.8 }); },
  hit() {
    tone({ freq: 170, freqEnd: 55, dur: 0.16, vol: 0.5 });
    noise({ freq: 1400, freqEnd: 300, dur: 0.08, vol: 0.3 });
  },
  heavy() {
    tone({ freq: 120, freqEnd: 35, dur: 0.3, vol: 0.7 });
    noise({ freq: 900, freqEnd: 120, dur: 0.22, vol: 0.45 });
  },
  hurt() {
    tone({ type: 'sawtooth', freq: 320, freqEnd: 110, dur: 0.2, vol: 0.18 });
    noise({ freq: 700, dur: 0.12, vol: 0.3 });
  },
  parry() {
    tone({ type: 'square', freq: 1320, dur: 0.18, vol: 0.12 });
    tone({ type: 'square', freq: 1980, dur: 0.25, vol: 0.08 });
    tone({ type: 'triangle', freq: 880, freqEnd: 660, dur: 0.35, vol: 0.2 });
  },
  whiff() { tone({ type: 'triangle', freq: 300, freqEnd: 200, dur: 0.1, vol: 0.1 }); },
  block() { tone({ type: 'square', freq: 220, freqEnd: 180, dur: 0.12, vol: 0.15 }); noise({ freq: 3000, dur: 0.05, vol: 0.15 }); },
  dodge() { noise({ type: 'bandpass', freq: 500, freqEnd: 1600, dur: 0.2, vol: 0.14, q: 1.2 }); },
  throw() { noise({ type: 'highpass', freq: 1200, freqEnd: 3000, dur: 0.15, vol: 0.12 }); },
  boom() {
    noise({ freq: 700, freqEnd: 90, dur: 0.6, vol: 0.6 });
    tone({ freq: 90, freqEnd: 30, dur: 0.5, vol: 0.6 });
  },
  roar() {
    tone({ type: 'sawtooth', freq: 120, freqEnd: 70, dur: 1.1, vol: 0.25, attack: 0.08 });
    tone({ type: 'sawtooth', freq: 181, freqEnd: 90, dur: 1.0, vol: 0.15, attack: 0.08 });
    noise({ freq: 500, freqEnd: 200, dur: 1.1, vol: 0.4, attack: 0.08 });
  },
  howl() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(380, t);
    o.frequency.linearRampToValueAtTime(720, t + 0.5);
    o.frequency.linearRampToValueAtTime(520, t + 1.3);
    envelope(g, t, 0.22, 1.4, 0.2);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 1.5);
  },
  quack() {
    tone({ type: 'square', freq: 620, freqEnd: 340, dur: 0.12, vol: 0.12 });
    tone({ type: 'square', freq: 600, freqEnd: 330, dur: 0.12, vol: 0.12, delay: 0.16 });
  },
  screech() {
    tone({ type: 'sawtooth', freq: 1800, freqEnd: 900, dur: 0.6, vol: 0.14 });
    noise({ type: 'bandpass', freq: 3000, dur: 0.5, vol: 0.2, q: 3 });
  },
  dig() { noise({ freq: 300, freqEnd: 150, dur: 0.4, vol: 0.35 }); },
  whistle() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const g = ctx.createGain();
    o.frequency.value = 2300;
    lfo.frequency.value = 38;
    lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    envelope(g, t, 0.14, 0.7, 0.02);
    o.connect(g).connect(master);
    o.start(t); lfo.start(t);
    o.stop(t + 0.75); lfo.stop(t + 0.75);
  },
  cheer() { noise({ type: 'bandpass', freq: 1100, dur: 2.2, vol: 0.35, q: 0.5, attack: 0.4 }); },
  special() {
    tone({ type: 'sawtooth', freq: 80, freqEnd: 40, dur: 0.6, vol: 0.4 });
    noise({ freq: 2000, freqEnd: 100, dur: 0.7, vol: 0.5 });
  },
  ko() {
    tone({ type: 'triangle', freq: 660, freqEnd: 110, dur: 0.9, vol: 0.25 });
  },
};
