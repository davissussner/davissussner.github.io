import * as THREE from 'three';

// Characters are built from primitives. Every character faces +Z.
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

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function letterPlane(text, color, size = 0.55, bg = null) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (bg !== null) {
    ctx.fillStyle = hex(bg);
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = hex(color);
  ctx.font = `bold ${text.length > 1 ? 64 : 100}px Bungee, Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 })
  );
}

export function buildBiped(o = {}) {
  const c = {
    skin: 0xf0c49a, head: null, shirt: 0xcc0000, sleeve: null, pants: 0x223355, shoes: 0x1e1e1e,
    hands: null, headR: 0.55, eyes: true, eyeY: 0.1, bulk: 1, ...o,
  };
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 1;
  root.add(pivot);
  const rig = new THREE.Group();
  rig.position.y = -1;
  pivot.add(rig);

  const legGeo = new THREE.CapsuleGeometry(0.17 * c.bulk, 0.42, 4, 8);
  const shoeGeo = new THREE.BoxGeometry(0.3, 0.16, 0.44);
  const makeLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(0.22 * side * c.bulk, 0.85, 0);
    g.add(mesh(legGeo, mat(c.pants), 0, -0.36, 0));
    g.add(mesh(shoeGeo, mat(c.shoes), 0, -0.77, 0.07));
    rig.add(g);
    return g;
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  const hips = mesh(new THREE.CylinderGeometry(0.42 * c.bulk, 0.38 * c.bulk, 0.34, 14), mat(c.pants), 0, 0.98, 0);
  hips.scale.z = 0.8;
  const torso = mesh(new THREE.CapsuleGeometry(0.42 * c.bulk, 0.5, 6, 14), mat(c.shirt), 0, 1.38, 0);
  torso.scale.z = 0.8;
  rig.add(hips, torso);

  const armGeo = new THREE.CapsuleGeometry(0.13 * c.bulk, 0.48, 4, 8);
  const handGeo = new THREE.SphereGeometry(0.16 * c.bulk, 10, 8);
  const makeArm = (side) => {
    const g = new THREE.Group();
    g.position.set(0.6 * side * c.bulk, 1.74, 0);
    g.add(mesh(armGeo, mat(c.sleeve ?? c.shirt), 0, -0.32, 0));
    g.add(mesh(handGeo, mat(c.hands ?? c.skin), 0, -0.7, 0));
    const hand = new THREE.Group();
    hand.position.set(0, -0.72, 0);
    g.add(hand);
    rig.add(g);
    return { g, hand };
  };
  const L = makeArm(1);
  const R = makeArm(-1);

  const head = new THREE.Group();
  head.position.set(0, 1.95 + c.headR * 0.85, 0);
  const headMesh = mesh(new THREE.SphereGeometry(c.headR, 22, 16), mat(c.head ?? c.skin));
  head.add(headMesh);
  rig.add(head);
  if (c.eyes) addEyes(head, c.headR, c.eyeY, c.eyeColor ?? 0x111111);

  return {
    root, pivot, rig, head, headMesh, torso, hips,
    armL: L.g, armR: R.g, handL: L.hand, handR: R.hand, legL, legR,
    headR: c.headR, top: head.position.y + c.headR,
  };
}

export function addEyes(head, r, y = 0.1, pupil = 0x111111, spread = 0.36) {
  const white = mat(0xffffff, { roughness: 0.3 });
  const black = mat(pupil, { roughness: 0.3 });
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(r * 0.2, 10, 8), white, s * r * spread, r * y * 2, r * 0.86);
    const p = mesh(new THREE.SphereGeometry(r * 0.1, 8, 6), black, s * r * spread, r * y * 2, r * 1.02);
    head.add(e, p);
  }
}

export function chestLetter(p, text, color, bg = null, size = 0.5) {
  const l = letterPlane(text, color, size, bg);
  l.position.set(0, 1.5, 0.35);
  p.rig.add(l);
  return l;
}

// ---- Heads & hats ----

export function earsCat(head, r, color, inner = 0xffc0cb) {
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.ConeGeometry(r * 0.3, r * 0.55, 4), mat(color), s * r * 0.55, r * 0.8, 0);
    e.rotation.z = -s * 0.35;
    const i = mesh(new THREE.ConeGeometry(r * 0.17, r * 0.35, 4), mat(inner), s * r * 0.55, r * 0.78, r * 0.08);
    i.rotation.z = -s * 0.35;
    head.add(e, i);
  }
}

export function earsRound(head, r, color, inner = null, size = 0.28) {
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(r * size, 10, 8), mat(color), s * r * 0.68, r * 0.72, 0);
    e.scale.z = 0.55;
    head.add(e);
    if (inner) {
      const i = mesh(new THREE.SphereGeometry(r * size * 0.6, 8, 6), mat(inner), s * r * 0.68, r * 0.72, r * size * 0.3);
      i.scale.z = 0.4;
      head.add(i);
    }
  }
}

export function earsPointy(head, r, color, inner = 0xffffff) {
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.ConeGeometry(r * 0.26, r * 0.8, 4), mat(color), s * r * 0.5, r * 0.95, -r * 0.05);
    e.rotation.z = -s * 0.2;
    const i = mesh(new THREE.ConeGeometry(r * 0.13, r * 0.5, 4), mat(inner), s * r * 0.5, r * 0.9, r * 0.06);
    i.rotation.z = -s * 0.2;
    head.add(e, i);
  }
}

export function snout(head, r, color, nose = 0x111111, len = 0.45) {
  const s = mesh(new THREE.SphereGeometry(r * 0.42, 14, 10), mat(color), 0, -r * 0.2, r * 0.75);
  s.scale.set(1, 0.75, len / 0.45);
  const n = mesh(new THREE.SphereGeometry(r * 0.12, 8, 6), mat(nose), 0, -r * 0.08, r * (0.75 + len * 0.95));
  head.add(s, n);
}

export function beak(head, r, color, len = 0.8, hooked = false) {
  const b = mesh(new THREE.ConeGeometry(r * 0.28, r * len, 10), mat(color), 0, -r * 0.1, r * (0.85 + len * 0.4));
  b.rotation.x = Math.PI / 2 + (hooked ? 0.35 : 0);
  head.add(b);
  if (hooked) {
    const tip = mesh(new THREE.ConeGeometry(r * 0.12, r * 0.3, 8), mat(color), 0, -r * 0.42, r * (0.85 + len * 0.75));
    tip.rotation.x = Math.PI;
    head.add(tip);
  }
  return b;
}

export function duckBill(head, r, color) {
  const b = mesh(new THREE.BoxGeometry(r * 0.8, r * 0.18, r * 0.8), mat(color), 0, -r * 0.2, r * 1.05);
  b.scale.x = 1;
  head.add(b);
}

export function cowboyHat(head, r, color, band = 0xffffff) {
  const brim = mesh(new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.06, 24), mat(color), 0, r * 0.62, 0);
  brim.scale.z = 1.15;
  const crown = mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.85, r * 0.7, 16), mat(color), 0, r * 0.95, 0);
  const b = mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, r * 0.12, 16), mat(band), 0, r * 0.68, 0);
  head.add(brim, crown, b);
  return crown;
}

export function cap(head, r, color, brimColor = color) {
  const top = mesh(new THREE.SphereGeometry(r * 1.03, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(color), 0, r * 0.12, 0);
  const brim = mesh(new THREE.BoxGeometry(r * 1.1, 0.05, r * 0.8), mat(brimColor), 0, r * 0.18, r * 0.95);
  head.add(top, brim);
}

export function hardHat(head, r, color) {
  const top = mesh(new THREE.SphereGeometry(r * 1.06, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, { roughness: 0.3 }), 0, r * 0.15, 0);
  const brim = mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.05, 20), mat(color, { roughness: 0.3 }), 0, r * 0.16, 0);
  const ridge = mesh(new THREE.BoxGeometry(0.1, r * 0.2, r * 1.8), mat(color, { roughness: 0.3 }), 0, r * 1.1, 0);
  head.add(top, brim, ridge);
}

export function helmet(head, r, color, plume = null, faceGap = true) {
  const h = mesh(new THREE.SphereGeometry(r * 1.08, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(color, { roughness: 0.3, metalness: 0.5 }), 0, 0, 0);
  head.add(h);
  if (!faceGap) {
    const visor = mesh(new THREE.BoxGeometry(r * 1.2, r * 0.12, 0.08), mat(0x111111), 0, r * 0.1, r * 1.02);
    head.add(visor);
  }
  if (plume !== null) {
    const p = mesh(new THREE.BoxGeometry(r * 0.22, r * 0.55, r * 1.9), mat(plume), 0, r * 1.2, -r * 0.1);
    head.add(p);
  }
  return h;
}

export function hair(head, r, color) {
  const h = mesh(new THREE.SphereGeometry(r * 1.04, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(color), 0, 0.02, -r * 0.06);
  h.rotation.x = -0.25;
  head.add(h);
}

// ---- Weapons & props (attach to a hand group) ----

export function lance(hand, color = 0xc0c4ca, grip = 0xcc0033) {
  const g = new THREE.Group();
  const shaft = mesh(new THREE.ConeGeometry(0.14, 3.2, 10), mat(color, { metalness: 0.6, roughness: 0.3 }), 0, 1.6, 0);
  const guard = mesh(new THREE.ConeGeometry(0.3, 0.4, 12), mat(grip), 0, 0.05, 0);
  g.add(shaft, guard);
  g.rotation.x = Math.PI / 2;
  hand.add(g);
  return g;
}

export function sword(hand, blade = 0xd8dde3, hilt = 0xffc72c) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.1, 1.2, 0.03), mat(blade, { metalness: 0.7, roughness: 0.25 }), 0, 0.7, 0));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.07, 0.1), mat(hilt), 0, 0.1, 0));
  g.rotation.x = Math.PI / 2;
  hand.add(g);
  return g;
}

export function spear(hand, tipColor = 0xd8dde3) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), mat(0x6b4423), 0, 0.6, 0));
  g.add(mesh(new THREE.ConeGeometry(0.1, 0.35, 8), mat(tipColor, { metalness: 0.7, roughness: 0.3 }), 0, 2.05, 0));
  g.rotation.x = Math.PI / 2;
  hand.add(g);
  return g;
}

export function hammer(hand, head = 0x333333, handle = 0xcfb991) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8), mat(handle), 0, 0.55, 0));
  g.add(mesh(new THREE.BoxGeometry(0.75, 0.38, 0.38), mat(head, { metalness: 0.5 }), 0, 1.3, 0));
  g.rotation.x = Math.PI / 2;
  hand.add(g);
  return g;
}

export function shield(hand, color, rim = 0xffffff, round = true, size = 0.75) {
  const g = new THREE.Group();
  const geo = round ? new THREE.CylinderGeometry(size, size, 0.1, 24) : new THREE.BoxGeometry(size * 1.5, 0.1, size * 2);
  const face = mesh(geo, mat(color));
  face.rotation.x = Math.PI / 2;
  g.add(face);
  if (round) {
    const r = mesh(new THREE.TorusGeometry(size, 0.06, 8, 24), mat(rim, { metalness: 0.4 }));
    g.add(r);
  }
  g.position.set(0.1, 0.15, 0.28);
  hand.add(g);
  return g;
}

export function ball(hand, color = 0xe06a1b) {
  const b = mesh(new THREE.SphereGeometry(0.3, 14, 10), mat(color));
  b.position.y = -0.2;
  hand.add(b);
  return b;
}

export function tail(p, color, len = 0.8, y = 0.95, thick = 0.1) {
  const t = mesh(new THREE.CapsuleGeometry(thick, len, 4, 8), mat(color), 0, y, -0.45);
  t.rotation.x = -0.9;
  p.rig.add(t);
  return t;
}

// ---- Herbie Husker ----

export function buildHerbie() {
  const p = buildBiped({ shirt: 0xd00000, pants: 0x2f5fa8, shoes: 0x4a2c16, headR: 0.6 });
  hair(p.head, p.headR, 0xf3c948);
  const crown = cowboyHat(p.head, p.headR, 0xb3121b, 0xf5f1e7);
  const n = letterPlane('N', 0xf5f1e7, 0.42);
  n.position.set(0, 0, p.headR * 0.86);
  crown.add(n);
  // Denim bib and straps over the red shirt.
  const bib = mesh(new THREE.BoxGeometry(0.62, 0.55, 0.12), mat(0x2f5fa8), 0, 1.35, 0.3);
  p.rig.add(bib);
  for (const s of [-1, 1]) {
    const strap = mesh(new THREE.BoxGeometry(0.1, 0.55, 0.64), mat(0x2f5fa8), s * 0.24, 1.72, 0);
    p.rig.add(strap);
  }
  const smile = mesh(new THREE.TorusGeometry(p.headR * 0.28, 0.03, 6, 12, Math.PI), mat(0x5a1a1a), 0, -p.headR * 0.28, p.headR * 0.92);
  smile.rotation.z = Math.PI;
  p.head.add(smile);
  return p;
}

// Collect every material under a model so it can be flashed (hit, telegraph).
export function collectMaterials(root) {
  const out = new Set();
  root.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive) out.add(o.material);
  });
  return [...out];
}
