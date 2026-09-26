// Unbiased randomness. Every "who loses" decision goes through here.

const buf = new Uint32Array(1);
const RANGE = 0x100000000;

// Uniform integer in [0, n). Rejection sampling removes modulo bias.
export function randInt(n) {
  if (!(n >= 1)) throw new RangeError('randInt needs n >= 1');
  const limit = RANGE - (RANGE % n);
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}

// Fisher–Yates: every ordering equally likely. Returns a new array.
export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = list => list[randInt(list.length)];

export const rand = (lo = 0, hi = 1) => lo + (hi - lo) * (randInt(0x1000000) / 0x1000000);
