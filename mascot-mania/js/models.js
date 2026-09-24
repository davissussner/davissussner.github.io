import * as THREE from 'three';

// Shared building blocks for every character. Characters face +Z.
// Hierarchy: root (at the feet) > pivot (y=1, rotates for rolls/falls) > rig (y=-1, parts at absolute heights).

export function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...o });
}

export function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Small shorthands used all over the character builders.
export const sphere = (r, color, x, y, z, sx = 1, sy = 1, sz = 1, o) => {
  const m = mesh(new THREE.SphereGeometry(r, 16, 12), mat(color, o), x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};
export const box = (w, h, d, color, x, y, z, o) => mesh(new THREE.BoxGeometry(w, h, d), mat(color, o), x, y, z);
export const cone = (r, h, color, x, y, z, seg = 8, o) => mesh(new THREE.ConeGeometry(r, h, seg), mat(color, o), x, y, z);
export const cyl = (rt, rb, h, color, x, y, z, seg = 14, o) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, o), x, y, z);
export const capsule = (r, len, color, x, y, z, o) => mesh(new THREE.CapsuleGeometry(r, len, 5, 10), mat(color, o), x, y, z);
// A flat ring lying horizontally (collars, cuffs, belts, bands).
export const band = (r, tube, color, x, y, z, o) => {
  const m = mesh(new THREE.TorusGeometry(r, tube, 8, 28), mat(color, o), x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
};

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function letterPlane(text, color, size = 0.55, bg = null, outline = null) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (bg !== null) {
    ctx.fillStyle = hex(bg);
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = `bold ${text.length > 2 ? 48 : text.length > 1 ? 64 : 100}px Bungee, Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (outline !== null) {
    ctx.lineWidth = 10;
    ctx.strokeStyle = hex(outline);
    ctx.strokeText(text, 64, 70);
  }
  ctx.fillStyle = hex(color);
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 })
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

function glove(hand, color, cuff) {
  hand.add(sphere(0.15, color, 0, 0.02, 0, 1, 1.05, 0.8));
  for (let i = -1; i <= 1; i++) {
    const f = capsule(0.045, 0.11, color, i * 0.062, -0.12, 0.035);
    f.rotation.x = 0.25;
    hand.add(f);
  }
  const thumb = capsule(0.05, 0.1, color, 0, -0.02, 0.13);
  thumb.rotation.x = 1.1;
  hand.add(thumb);
  if (cuff !== null) hand.add(band(0.13, 0.045, cuff, 0, 0.14, 0));
}

function sneaker(parent, color, sole, laces) {
  parent.add(sphere(0.19, color, 0, -0.73, 0.07, 0.85, 0.62, 1.35));
  parent.add(box(0.31, 0.07, 0.5, sole, 0, -0.81, 0.07));
  parent.add(sphere(0.12, sole, 0, -0.76, 0.28, 1.1, 0.5, 0.7));
  parent.add(box(0.12, 0.03, 0.18, laces, 0, -0.63, 0.14));
}

export function buildBiped(o = {}) {
  const c = {
    skin: 0xf0c49a, head: null, shirt: 0xcc0000, sleeve: null, sleeves: 'long', arms: null,
    pants: 0x223355, shorts: false, legs: null, shoes: 0x1e1e1e, sole: 0xf2f2f2, laces: 0xffffff,
    trim: 0xffffff, socks: null, hands: null, gloveCuff: null,
    headR: 0.55, eyes: true, eyeY: 0.1, iris: 0x4a3222, lids: false, bulk: 1,
    number: null, mouth: 'smile', mouthColor: 0x4a1a1a, brows: null, belt: 0x2a2a2a, buckle: 0xd4af37,
    neck: null, humanEars: false, collar: true, feet: null, ...o,
  };
  const headColor = c.head ?? c.skin;
  const handColor = c.hands ?? c.skin;
  const b = c.bulk;

  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 1;
  root.add(pivot);
  const rig = new THREE.Group();
  rig.position.y = -1;
  pivot.add(rig);

  // Legs: pants (or shorts over bare legs), socks with a stripe, sneakers.
  const makeLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(0.22 * side * b, 0.85, 0);
    if (c.shorts) {
      g.add(cyl(0.2 * b, 0.19 * b, 0.36, c.pants, 0, -0.14, 0));
      g.add(capsule(0.15 * b, 0.42, c.legs ?? c.skin, 0, -0.4, 0));
    } else {
      g.add(capsule(0.17 * b, 0.44, c.pants, 0, -0.36, 0));
      g.add(sphere(0.12 * b, c.pants, 0, -0.34, 0.1, 1, 0.8, 0.6)); // knee
    }
    const sock = c.socks ?? c.trim;
    g.add(cyl(0.155 * b, 0.15 * b, 0.16, sock, 0, -0.6, 0));
    g.add(cyl(0.157 * b, 0.157 * b, 0.035, c.pants === sock ? 0xffffff : c.pants, 0, -0.56, 0));
    if (c.feet) c.feet(g, side);
    else sneaker(g, c.shoes, c.sole, c.laces);
    rig.add(g);
    return g;
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // Hips, belt and buckle.
  const hips = cyl(0.42 * b, 0.38 * b, 0.34, c.pants, 0, 0.98, 0);
  hips.scale.z = 0.8;
  rig.add(hips);
  if (c.belt !== null) {
    const belt = band(0.405 * b, 0.05, c.belt, 0, 1.1, 0);
    belt.scale.y = 0.8;
    rig.add(belt, box(0.16, 0.12, 0.05, c.buckle, 0, 1.1, 0.33 * b, { metalness: 0.6, roughness: 0.3 }));
  }

  // Torso with a shaped chest, collar and hem trim.
  const torso = capsule(0.42 * b, 0.5, c.shirt, 0, 1.38, 0);
  torso.scale.z = 0.8;
  rig.add(torso);
  rig.add(sphere(0.3 * b, c.shirt, 0, 1.55, 0.1, 1.35, 0.8, 0.8));
  const hem = band(0.42 * b, 0.035, c.trim, 0, 1.16, 0);
  hem.scale.y = 0.8;
  rig.add(hem);
  if (c.collar) {
    const collar = band(0.2, 0.055, c.trim, 0, 1.93, 0.02);
    rig.add(collar);
  }
  rig.add(cyl(0.15, 0.17, 0.22, c.neck ?? headColor, 0, 1.98, 0));
  if (c.number) {
    const n = letterPlane(c.number, c.trim, 0.6, null, 0x000000);
    n.position.set(0, 1.42, -0.35 * b);
    n.rotation.y = Math.PI;
    rig.add(n);
  }

  // Arms: shoulder, sleeve with cuff (or short sleeve over bare arm), and a gloved hand.
  const sleeveColor = c.sleeve ?? c.shirt;
  const makeArm = (side) => {
    const g = new THREE.Group();
    g.position.set(0.6 * side * b, 1.74, 0);
    g.add(sphere(0.19 * b, sleeveColor, 0, -0.02, 0));
    if (c.sleeves === 'short') {
      g.add(capsule(0.12 * b, 0.46, c.arms ?? c.skin, 0, -0.34, 0));
      g.add(cyl(0.17 * b, 0.16 * b, 0.3, sleeveColor, 0, -0.14, 0));
      g.add(band(0.16 * b, 0.03, c.trim, 0, -0.28, 0));
    } else {
      g.add(capsule(0.13 * b, 0.46, sleeveColor, 0, -0.32, 0));
      g.add(band(0.135 * b, 0.035, c.trim, 0, -0.53, 0));
    }
    const hand = new THREE.Group();
    hand.position.set(0, -0.72, 0);
    const gl = new THREE.Group();
    gl.scale.setScalar(b);
    glove(gl, handColor, c.gloveCuff);
    hand.add(gl);
    g.add(hand);
    rig.add(g);
    return { g, hand };
  };
  const L = makeArm(1);
  const R = makeArm(-1);

  // Head.
  const head = new THREE.Group();
  head.position.set(0, 1.95 + c.headR * 0.85, 0);
  const headMesh = mesh(new THREE.SphereGeometry(c.headR, 28, 20), mat(headColor));
  headMesh.scale.set(1, 0.97, 0.98);
  head.add(headMesh);
  rig.add(head);
  const r = c.headR;
  if (c.eyes) addEyes(head, r, c.eyeY, c.iris, 0.36, c.lids ? headColor : null);
  if (c.brows !== null) brows(head, r, c.brows, c.lids ? 0.3 : 0.12);
  if (c.mouth) mouth(head, r, c.mouth, c.mouthColor);
  if (c.humanEars) {
    for (const s of [-1, 1]) {
      head.add(sphere(r * 0.18, c.skin, s * r * 0.97, 0, 0, 0.5, 1, 0.8));
    }
    head.add(sphere(r * 0.12, c.skin, 0, -r * 0.05, r * 0.98, 1, 0.9, 0.8)); // nose
  }

  return {
    root, pivot, rig, head, headMesh, torso, hips,
    armL: L.g, armR: R.g, handL: L.hand, handR: R.hand, legL, legR,
    headR: r, top: head.position.y + r, bulk: b,
  };
}

// ---------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------

// Cartoon eyes: sclera, colored iris, pupil, highlight, and optional half-lid for a determined look.
export function addEyes(head, r, y = 0.1, iris = 0x4a3222, spread = 0.36, lidColor = null) {
  const ey = r * y * 2;
  for (const s of [-1, 1]) {
    const x = s * r * spread;
    const z = r * 0.84;
    head.add(sphere(r * 0.21, 0xffffff, x, ey, z, 0.9, 1.15, 0.6, { roughness: 0.2 }));
    head.add(sphere(r * 0.12, iris, x, ey - r * 0.02, z + r * 0.1, 1, 1.1, 0.4, { roughness: 0.2 }));
    head.add(sphere(r * 0.065, 0x0a0a0a, x, ey - r * 0.02, z + r * 0.14, 1, 1.1, 0.4, { roughness: 0.1 }));
    head.add(sphere(r * 0.035, 0xffffff, x + r * 0.04, ey + r * 0.05, z + r * 0.17, 1, 1, 0.5, { emissive: 0xffffff, emissiveIntensity: 0.4 }));
    if (lidColor !== null) {
      const lid = mesh(new THREE.SphereGeometry(r * 0.225, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(lidColor), x, ey + r * 0.02, z + r * 0.01);
      lid.scale.set(0.95, 0.9, 0.65);
      lid.rotation.x = 0.5;
      lid.rotation.z = -s * 0.35;
      head.add(lid);
    }
  }
}

export function brows(head, r, color = 0x111111, angle = 0.3, y = 0.47) {
  for (const s of [-1, 1]) {
    const b = capsule(r * 0.05, r * 0.28, color, s * r * 0.36, r * y, r * 0.88);
    b.rotation.z = Math.PI / 2 + s * angle;
    head.add(b);
  }
}

export function mouth(head, r, type = 'smile', color = 0x4a1a1a, y = -0.32, z = 0.92) {
  if (type === 'none') return;
  if (type === 'grin') {
    const m = sphere(r * 0.26, color, 0, r * y, r * (z - 0.06), 1.3, 0.55, 0.4);
    const teeth = box(r * 0.42, r * 0.07, r * 0.05, 0xffffff, 0, r * (y + 0.07), r * (z + 0.02));
    head.add(m, teeth);
    return;
  }
  const arc = mesh(new THREE.TorusGeometry(r * 0.22, r * 0.035, 6, 16, Math.PI), mat(color), 0, r * y, r * z);
  if (type === 'smile') arc.rotation.z = Math.PI;
  head.add(arc);
}

export function whiskers(head, r, color = 0x222222, y = -0.2, z = 1.02) {
  for (const s of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      const w = cyl(0.008, 0.008, r * 0.7, color, s * r * 0.42, r * y + i * r * 0.07, r * z * 0.95, 4);
      w.rotation.z = Math.PI / 2 + s * i * 0.18;
      head.add(w);
    }
  }
}

export function fangs(head, r, y = -0.36, z = 1.0, color = 0xffffff) {
  for (const s of [-1, 1]) {
    const f = cone(r * 0.05, r * 0.16, color, s * r * 0.1, r * y, r * z, 6);
    f.rotation.x = Math.PI;
    head.add(f);
  }
}

export function tongue(head, r, y = -0.42, z = 0.98) {
  const t = sphere(r * 0.1, 0xe0607a, 0, r * y, r * z, 1, 1.3, 0.5);
  head.add(t);
}

// ---------------------------------------------------------------------------
// Animal parts
// ---------------------------------------------------------------------------

export function earsCat(head, r, color, inner = 0xffc0cb, tufts = null) {
  for (const s of [-1, 1]) {
    const e = cone(r * 0.3, r * 0.55, color, s * r * 0.55, r * 0.8, 0, 4);
    e.rotation.z = -s * 0.35;
    const i = cone(r * 0.17, r * 0.35, inner, s * r * 0.55, r * 0.78, r * 0.08, 4);
    i.rotation.z = -s * 0.35;
    head.add(e, i);
    if (tufts !== null) {
      const t = cone(r * 0.06, r * 0.25, tufts, s * r * 0.68, r * 1.12, 0, 5);
      t.rotation.z = -s * 0.35;
      head.add(t);
    }
  }
}

export function earsRound(head, r, color, inner = null, size = 0.28) {
  for (const s of [-1, 1]) {
    head.add(sphere(r * size, color, s * r * 0.68, r * 0.72, 0, 1, 1, 0.55));
    if (inner) head.add(sphere(r * size * 0.6, inner, s * r * 0.68, r * 0.72, r * size * 0.3, 1, 1, 0.4));
  }
}

export function earsPointy(head, r, color, inner = 0xffffff) {
  for (const s of [-1, 1]) {
    const e = cone(r * 0.26, r * 0.8, color, s * r * 0.5, r * 0.95, -r * 0.05, 4);
    e.rotation.z = -s * 0.2;
    const i = cone(r * 0.13, r * 0.5, inner, s * r * 0.5, r * 0.9, r * 0.06, 4);
    i.rotation.z = -s * 0.2;
    head.add(e, i);
  }
}

// Muzzle with nose, mouth line and optional fangs/whiskers.
export function snout(head, r, color, nose = 0x111111, len = 0.45, o = {}) {
  const s = sphere(r * 0.42, color, 0, -r * 0.2, r * 0.75, 1, 0.75, len / 0.45);
  const tip = r * (0.75 + len * 0.95);
  const n = sphere(r * 0.13, nose, 0, -r * 0.06, tip, 1.2, 0.8, 0.8, { roughness: 0.2 });
  head.add(s, n);
  // Nostril highlight and the mouth split under the nose.
  head.add(sphere(r * 0.035, 0xffffff, r * 0.04, -r * 0.01, tip + r * 0.08, 1, 1, 1, { emissive: 0xffffff, emissiveIntensity: 0.3 }));
  const split = box(r * 0.03, r * 0.14, r * 0.03, 0x2a1a12, 0, -r * 0.2, tip - r * 0.03);
  const m = mesh(new THREE.TorusGeometry(r * 0.16, r * 0.025, 6, 12, Math.PI), mat(0x2a1a12), 0, -r * 0.26, tip - r * 0.08);
  m.rotation.z = Math.PI;
  head.add(split, m);
  if (o.fangs) fangs(head, r, -0.36, (tip / r) - 0.12);
  if (o.tongue) tongue(head, r, -0.4, (tip / r) - 0.12);
  if (o.whiskers !== undefined) whiskers(head, r, o.whiskers, -0.18, tip / r);
}

export function beak(head, r, color, len = 0.8, hooked = false) {
  const b = cone(r * 0.28, r * len, color, 0, -r * 0.1, r * (0.85 + len * 0.4), 12);
  b.rotation.x = Math.PI / 2 + (hooked ? 0.35 : 0);
  head.add(b);
  const lower = cone(r * 0.2, r * len * 0.55, color, 0, -r * 0.24, r * (0.85 + len * 0.22), 10, { roughness: 0.5 });
  lower.rotation.x = Math.PI / 2 + 0.25;
  head.add(lower);
  for (const s of [-1, 1]) head.add(sphere(r * 0.03, 0x222222, s * r * 0.08, -r * 0.02, r * (0.9 + len * 0.45)));
  if (hooked) {
    const tip = cone(r * 0.12, r * 0.3, color, 0, -r * 0.42, r * (0.85 + len * 0.75), 8);
    tip.rotation.x = Math.PI;
    head.add(tip);
  }
  return b;
}

export function duckBill(head, r, color) {
  const top = sphere(r * 0.45, color, 0, -r * 0.14, r * 1.02, 1.05, 0.28, 1, { roughness: 0.45 });
  const bottom = sphere(r * 0.4, color, 0, -r * 0.26, r * 0.98, 1, 0.22, 0.95, { roughness: 0.45 });
  head.add(top, bottom);
  for (const s of [-1, 1]) head.add(sphere(r * 0.035, 0x7a4a10, s * r * 0.1, -r * 0.07, r * 1.3));
}

export function tail(p, color, len = 0.8, y = 0.95, thick = 0.1, tip = null) {
  const t = capsule(thick, len, color, 0, y, -0.45);
  t.rotation.x = -0.9;
  p.rig.add(t);
  if (tip !== null) {
    const off = (len / 2 + thick) * 0.95;
    p.rig.add(sphere(thick * 1.8, tip, 0, y + Math.cos(0.9) * off, -0.45 - Math.sin(0.9) * off));
  }
  return t;
}

export function claws(hand, color = 0xf2f2f2) {
  for (let i = -1; i <= 1; i++) {
    const c = cone(0.035, 0.28, color, i * 0.065, -0.3, 0.08, 5);
    c.rotation.x = Math.PI - 0.3;
    hand.add(c);
  }
}

export function stripes(p, heights, color, r = 0.43) {
  for (const y of heights) {
    const b = cyl(r, r, 0.08, color, 0, y, 0, 18);
    b.scale.z = 0.82;
    p.rig.add(b);
  }
}

// Ring of fur tufts around the neck (lions, wolverines).
export function ruff(p, color, count = 12, y = 1.9, radius = 0.4) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const t = cone(0.12, 0.32, color, Math.sin(a) * radius, y, Math.cos(a) * radius * 0.85, 5);
    t.rotation.x = Math.cos(a) * 0.9;
    t.rotation.z = -Math.sin(a) * 0.9;
    p.rig.add(t);
  }
}

// Tuft of hair or feathers on top of the head.
export function tuft(head, r, color, count = 4, len = 0.35) {
  for (let i = 0; i < count; i++) {
    const t = cone(r * 0.09, r * len, color, (i - (count - 1) / 2) * r * 0.12, r * 0.98, -r * 0.1, 5);
    t.rotation.z = (i - (count - 1) / 2) * -0.3;
    t.rotation.x = -0.35;
    head.add(t);
  }
}

// ---------------------------------------------------------------------------
// Hats & helmets
// ---------------------------------------------------------------------------

export function cowboyHat(head, r, color, bandColor = 0xffffff) {
  const brim = cyl(r * 1.45, r * 1.45, 0.06, color, 0, r * 0.62, 0, 28);
  brim.scale.z = 1.15;
  const crown = cyl(r * 0.72, r * 0.85, r * 0.7, color, 0, r * 0.95, 0, 20);
  const dent = sphere(r * 0.4, color, 0, r * 1.28, 0, 1.4, 0.3, 1);
  const b = cyl(r * 0.86, r * 0.86, r * 0.12, bandColor, 0, r * 0.68, 0, 20);
  head.add(brim, crown, dent, b);
  return crown;
}

export function cap(head, r, color, brimColor = color, button = null) {
  const top = mesh(new THREE.SphereGeometry(r * 1.03, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(color), 0, r * 0.12, 0);
  const brim = sphere(r * 0.62, brimColor, 0, r * 0.2, r * 0.92, 1, 0.08, 0.75);
  head.add(top, brim, sphere(r * 0.08, button ?? brimColor, 0, r * 1.14, 0));
}

export function hardHat(head, r, color, logo = null) {
  const o = { roughness: 0.25 };
  const top = mesh(new THREE.SphereGeometry(r * 1.06, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, o), 0, r * 0.15, 0);
  const brim = cyl(r * 1.25, r * 1.25, 0.05, color, 0, r * 0.16, 0, 24, o);
  const ridge = box(0.1, r * 0.2, r * 1.8, color, 0, r * 1.1, 0, o);
  head.add(top, brim, ridge);
  if (logo) {
    const l = letterPlane(logo, 0x111111, r * 0.6);
    l.position.set(0, r * 0.6, r * 1.02);
    head.add(l);
  }
}

export function helmet(head, r, color, plume = null, faceGap = true) {
  const o = { roughness: 0.3, metalness: 0.5 };
  head.add(mesh(new THREE.SphereGeometry(r * 1.08, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(color, o)));
  head.add(band(r * 1.02, 0.04, color, 0, r * 0.2, 0, o));
  if (!faceGap) {
    // Closed visor with breathing slits.
    const visor = mesh(new THREE.SphereGeometry(r * 1.07, 20, 10, -Math.PI / 2.4, Math.PI / 1.2, Math.PI * 0.55, Math.PI * 0.3), mat(color, o));
    head.add(visor);
    head.add(box(r * 1.3, r * 0.1, 0.08, 0x111111, 0, r * 0.12, r * 1.0));
    for (let i = -2; i <= 2; i++) head.add(box(0.03, r * 0.22, 0.04, 0x111111, i * r * 0.14, -r * 0.3, r * 1.03));
  } else {
    for (const s of [-1, 1]) head.add(box(r * 0.08, r * 0.55, r * 0.35, color, s * r * 0.82, -r * 0.2, r * 0.45, o)); // cheek guards
  }
  if (plume !== null) {
    // Crest made of fanned segments.
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (i / 6) * 2.4;
      const seg = box(r * 0.2, r * 0.5, r * 0.3, plume, 0, r * 1.05 + Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.85);
      seg.rotation.x = a;
      head.add(seg);
    }
  }
}

export function hair(head, r, color) {
  const h = mesh(new THREE.SphereGeometry(r * 1.04, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(color), 0, 0.02, -r * 0.06);
  h.rotation.x = -0.25;
  head.add(h);
  return h;
}

// ---------------------------------------------------------------------------
// Weapons & props (attach to a hand group)
// ---------------------------------------------------------------------------

export function lance(hand, color = 0xc0c4ca, grip = 0xcc0033) {
  const g = new THREE.Group();
  const metal = { metalness: 0.6, roughness: 0.3 };
  g.add(cone(0.14, 3.2, color, 0, 1.6, 0, 12, metal));
  g.add(cone(0.3, 0.4, grip, 0, 0.05, 0, 14));
  for (let i = 0; i < 3; i++) g.add(band(0.12 - i * 0.025, 0.02, grip, 0, 0.6 + i * 0.6, 0));
  g.add(cyl(0.06, 0.06, 0.5, 0x5a3a1a, 0, -0.3, 0));
  g.rotation.x = Math.PI / 2;
  hand.add(g);
  return g;
}

export function sword(hand, blade = 0xd8dde3, hilt = 0xffc72c) {
  const g = new THREE.Group();
  const metal = { metalness: 0.7, roughness: 0.25 };
  g.add(box(0.12, 1.2, 0.03, blade, 0, 0.72, 0, metal));
  const tip = cone(0.085, 0.2, blade, 0, 1.42, 0, 4, metal);
  tip.rotation.y = Math.PI / 4;
  tip.scale.z = 0.3;
  g.add(tip);
  g.add(box(0.45, 0.07, 0.1, hilt, 0, 0.1, 0, metal));
  g.add(cyl(0.04, 0.04, 0.25, 0x5a2a1a, 0, -0.05, 0));
  g.add(sphere(0.06, hilt, 0, -0.2, 0, 1, 1, 1, metal));
  g.rotation.x = Math.PI / 2;
  hand.add(g);
  return g;
}

export function spear(hand, tipColor = 0xd8dde3) {
  const g = new THREE.Group();
  g.add(cyl(0.04, 0.04, 2.6, 0x6b4423, 0, 0.6, 0, 8));
  g.add(cone(0.1, 0.35, tipColor, 0, 2.05, 0, 8, { metalness: 0.7, roughness: 0.3 }));
  g.add(band(0.05, 0.02, 0xd4af37, 0, 1.85, 0));
  g.rotation.x = Math.PI / 2;
  hand.add(g);
  return g;
}

export function hammer(hand, head = 0x333333, handle = 0xcfb991) {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.06, 1.5, handle, 0, 0.55, 0, 8));
  g.add(box(0.75, 0.38, 0.38, head, 0, 1.3, 0, { metalness: 0.5 }));
  for (const s of [-1, 1]) g.add(box(0.06, 0.42, 0.42, 0x555555, s * 0.4, 1.3, 0, { metalness: 0.6 }));
  g.add(band(0.075, 0.025, 0x111111, 0, 0.1, 0));
  g.rotation.x = Math.PI / 2;
  hand.add(g);
  return g;
}

export function shield(hand, color, rim = 0xffffff, round = true, size = 0.75, emblem = null, emblemColor = 0xffffff) {
  const g = new THREE.Group();
  const geo = round ? new THREE.CylinderGeometry(size, size, 0.1, 28) : new THREE.BoxGeometry(size * 1.5, 0.1, size * 2);
  const face = mesh(geo, mat(color));
  face.rotation.x = Math.PI / 2;
  g.add(face);
  if (round) {
    g.add(mesh(new THREE.TorusGeometry(size, 0.06, 8, 28), mat(rim, { metalness: 0.4 })));
    g.add(sphere(size * 0.18, rim, 0, 0, 0.06, 1, 1, 0.5, { metalness: 0.5, roughness: 0.3 }));
  } else {
    g.add(box(size * 1.5 + 0.06, 0.08, 0.12, rim, 0, size, 0));
    g.add(box(size * 1.5 + 0.06, 0.08, 0.12, rim, 0, -size, 0));
  }
  if (emblem) {
    const e = letterPlane(emblem, emblemColor, size * 1.2);
    e.position.z = 0.07;
    g.add(e);
  }
  g.position.set(0.1, 0.15, 0.28);
  hand.add(g);
  return g;
}

export function ball(hand, color = 0xe06a1b) {
  const g = new THREE.Group();
  g.add(sphere(0.3, color, 0, 0, 0));
  const s1 = mesh(new THREE.TorusGeometry(0.302, 0.012, 4, 24), mat(0x111111));
  const s2 = mesh(new THREE.TorusGeometry(0.302, 0.012, 4, 24), mat(0x111111));
  s2.rotation.y = Math.PI / 2;
  g.add(s1, s2);
  g.position.y = -0.2;
  hand.add(g);
  return g;
}

export function cape(p, color, len = 1.3, width = 1.0) {
  const c = mesh(new THREE.PlaneGeometry(width, len, 1, 4), mat(color, { side: THREE.DoubleSide }), 0, 1.9 - len / 2, -0.4);
  c.rotation.x = 0.12;
  p.rig.add(c);
  return c;
}

export function chestLetter(p, text, color, bg = null, size = 0.5, outline = null) {
  const l = letterPlane(text, color, size, bg, outline);
  l.position.set(0, 1.5, 0.12 + 0.25 * (p.bulk ?? 1));
  p.rig.add(l);
  return l;
}

// Collect every material under a model so it can be flashed (hit, telegraph).
export function collectMaterials(root) {
  const out = new Set();
  root.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive) out.add(o.material);
  });
  return [...out];
}
