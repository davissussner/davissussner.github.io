import * as THREE from 'three';
import {
  buildBiped, mesh, mat, sphere, box, cone, cyl, capsule, band, letterPlane, chestLetter,
  brows, mouth, whiskers, fangs, tongue, earsCat, earsRound, earsPointy, snout, beak, duckBill,
  tail, claws, stripes, ruff, tuft, cowboyHat, cap, hardHat, helmet, hair,
  lance, sword, spear, hammer, shield, ball, cape,
} from './models.js';

const SKIN = 0xf0c49a;

// Metal/armor pieces worn on the body.
function pauldrons(p, color, size = 0.26) {
  const o = { metalness: 0.55, roughness: 0.3 };
  for (const arm of [p.armL, p.armR]) {
    const d = mesh(new THREE.SphereGeometry(size, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, o), 0, 0.02, 0);
    d.scale.set(1.1, 0.9, 1);
    arm.add(d);
    arm.add(band(size * 0.95, 0.03, color, 0, -0.08, 0, o));
  }
}

function breastplate(p, color, trim = null) {
  const o = { metalness: 0.55, roughness: 0.3 };
  const plate = sphere(0.36, color, 0, 1.5, 0.12, 1.25, 1.05, 0.75, o);
  p.rig.add(plate);
  p.rig.add(box(0.05, 0.5, 0.05, trim ?? color, 0, 1.5, 0.39, o));
}

function bracers(p, color) {
  for (const arm of [p.armL, p.armR]) arm.add(cyl(0.15, 0.16, 0.22, color, 0, -0.45, 0, 12, { metalness: 0.5, roughness: 0.35 }));
}

function kneePads(p, color) {
  for (const leg of [p.legL, p.legR]) leg.add(sphere(0.13, color, 0, -0.34, 0.12, 1, 0.9, 0.6, { metalness: 0.5, roughness: 0.35 }));
}

function sandals(color = 0x7a4a22) {
  return (leg) => {
    leg.add(sphere(0.16, SKIN, 0, -0.74, 0.08, 0.9, 0.55, 1.3));
    leg.add(box(0.28, 0.05, 0.46, color, 0, -0.81, 0.07));
    for (let i = 0; i < 3; i++) leg.add(band(0.155, 0.02, color, 0, -0.44 - i * 0.1, 0));
  };
}

function pawFeet(color, clawColor = 0xeeeeee) {
  return (leg) => {
    leg.add(sphere(0.2, color, 0, -0.74, 0.08, 0.95, 0.6, 1.3));
    for (let i = -1; i <= 1; i++) {
      const c = cone(0.03, 0.12, clawColor, i * 0.07, -0.78, 0.33, 5);
      c.rotation.x = Math.PI / 2;
      leg.add(c);
    }
  };
}

function webbedFeet(color) {
  return (leg) => {
    const f = sphere(0.24, color, 0, -0.8, 0.14, 1, 0.22, 1.5, { roughness: 0.45 });
    leg.add(f, sphere(0.12, color, 0, -0.72, 0, 1, 0.8, 1));
  };
}

function talons(color) {
  return (leg) => {
    leg.add(sphere(0.13, color, 0, -0.74, 0.02, 1, 0.9, 1));
    for (const a of [-0.45, 0, 0.45]) {
      const t = capsule(0.045, 0.22, color, Math.sin(a) * 0.12, -0.8, 0.14 + Math.cos(a) * 0.08);
      t.rotation.x = Math.PI / 2;
      t.rotation.y = a;
      leg.add(t);
      const claw = cone(0.03, 0.1, 0x222222, Math.sin(a) * 0.22, -0.8, 0.28 + Math.cos(a) * 0.1, 5);
      claw.rotation.x = Math.PI / 2;
      leg.add(claw);
    }
    const back = capsule(0.04, 0.15, color, 0, -0.8, -0.14);
    back.rotation.x = Math.PI / 2;
    leg.add(back);
  };
}

function boots(color, sole = 0x2a1a0e) {
  return (leg) => {
    leg.add(cyl(0.17, 0.18, 0.28, color, 0, -0.62, 0));
    leg.add(sphere(0.19, color, 0, -0.74, 0.08, 0.9, 0.6, 1.35));
    leg.add(box(0.32, 0.08, 0.5, sole, 0, -0.81, 0.07));
    leg.add(box(0.3, 0.05, 0.12, sole, 0, -0.8, -0.14));
  };
}

// ---------------------------------------------------------------------------
// Herbie Husker
// ---------------------------------------------------------------------------

export function buildHerbie() {
  const denim = 0x2f5fa8;
  const p = buildBiped({
    shirt: 0xd00000, pants: denim, headR: 0.6, trim: 0xd00000, belt: null, collar: false,
    brows: 0xc99a22, mouth: 'grin', iris: 0x3a6fbf, humanEars: true, number: '1', hands: SKIN,
    feet: boots(0x6b3f1e),
  });
  const r = p.headR;
  hair(p.head, r, 0xf3c948);
  // Blond tufts poking out under the hat.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const t = cone(0.07, 0.22, 0xf3c948, s * (0.42 + i * 0.07), 0.25 - i * 0.05, -0.15 - i * 0.12, 5);
      t.rotation.z = s * 1.2;
      p.head.add(t);
    }
  }
  const crown = cowboyHat(p.head, r, 0xb3121b, 0xf5f1e7);
  const n = letterPlane('N', 0xf5f1e7, 0.42);
  n.position.set(0, 0, r * 0.86);
  crown.add(n);
  // Freckles and rosy cheeks.
  for (const s of [-1, 1]) {
    p.head.add(sphere(r * 0.12, 0xf29a8a, s * r * 0.5, -r * 0.15, r * 0.8, 1, 0.7, 0.4));
    for (let i = 0; i < 3; i++) p.head.add(sphere(0.012, 0xb86a3a, s * (0.18 + i * 0.05), -0.02 - (i % 2) * 0.03, r * 0.97));
  }
  // Western shirt collar points.
  for (const s of [-1, 1]) {
    const pt = box(0.18, 0.04, 0.2, 0xd00000, s * 0.14, 1.9, 0.22);
    pt.rotation.z = s * 0.4;
    pt.rotation.y = s * 0.3;
    p.rig.add(pt);
  }
  // Denim overalls: bib, pocket, straps, brass buttons, rolled cuffs.
  p.rig.add(box(0.64, 0.58, 0.12, denim, 0, 1.36, 0.32));
  p.rig.add(box(0.3, 0.2, 0.03, 0x24508f, 0, 1.4, 0.39));
  p.rig.add(box(0.3, 0.02, 0.035, 0xf2c14e, 0, 1.5, 0.395));
  for (const s of [-1, 1]) {
    p.rig.add(box(0.1, 0.6, 0.66, denim, s * 0.24, 1.72, 0));
    p.rig.add(sphere(0.045, 0xd4af37, s * 0.24, 1.6, 0.39, 1, 1, 0.6, { metalness: 0.7, roughness: 0.3 }));
  }
  for (const leg of [p.legL, p.legR]) leg.add(band(0.19, 0.05, 0x5b86c7, 0, -0.5, 0));
  // Rolled-up shirt sleeves.
  for (const arm of [p.armL, p.armR]) arm.add(band(0.15, 0.05, 0xb00000, 0, -0.42, 0));
  // Corn cob tucked in the back pocket.
  const cob = capsule(0.07, 0.22, 0xf2c94c, 0.18, 1.02, -0.33);
  cob.rotation.x = 0.3;
  p.rig.add(cob);
  for (const s of [-1, 1]) {
    const husk = cone(0.05, 0.25, 0x7aa33a, 0.18 + s * 0.05, 1.22, -0.36, 4);
    husk.rotation.z = s * 0.4;
    p.rig.add(husk);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Big Ten mascots
// ---------------------------------------------------------------------------

function buildHusky() {
  const fur = 0x9aa0a8;
  const p = buildBiped({
    head: fur, hands: fur, shirt: 0x4b2e83, sleeve: 0xb7a57a, pants: 0x4b2e83, headR: 0.58,
    trim: 0xb7a57a, mouth: 'none', lids: true, iris: 0x58a8e8, number: '12', feet: pawFeet(fur),
  });
  const r = p.headR;
  earsPointy(p.head, r, fur, 0xffffff);
  // Classic husky mask: white face, dark cap, markings above the eyes.
  p.head.add(sphere(0.4, 0xffffff, 0, -0.12, 0.3, 1, 0.9, 1));
  p.head.add(sphere(r * 0.9, 0x5a5f66, 0, r * 0.3, -r * 0.05, 1, 0.7, 1));
  for (const s of [-1, 1]) p.head.add(sphere(r * 0.08, 0xffffff, s * r * 0.3, r * 0.5, r * 0.78, 1.2, 0.8, 0.5));
  snout(p.head, r, 0xffffff, 0x111111, 0.45, { tongue: true });
  tail(p, fur, 0.7, 1.0, 0.13, 0xffffff);
  // Spiked collar.
  p.rig.add(band(0.19, 0.06, 0x222222, 0, 2.0, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const s = cone(0.035, 0.1, 0xd8dde3, Math.sin(a) * 0.25, 2.0, Math.cos(a) * 0.25, 5, { metalness: 0.7 });
    s.rotation.x = Math.cos(a) * Math.PI / 2;
    s.rotation.z = -Math.sin(a) * Math.PI / 2;
    p.rig.add(s);
  }
  chestLetter(p, 'W', 0xb7a57a, null, 0.5, 0x2a1a4a);
  return p;
}

function buildHorseRider(o) {
  const p = buildBiped(o);
  const horse = new THREE.Group();
  horse.position.y = -1;
  p.pivot.add(horse);
  const coat = 0xf2efe6;
  const dark = 0x222222;
  const body = capsule(0.55, 1.5, coat, 0, 1.45, 0);
  body.rotation.x = Math.PI / 2;
  horse.add(body);
  horse.add(sphere(0.5, coat, 0, 1.55, 0.7, 1, 1.05, 0.9)); // chest
  horse.add(sphere(0.52, coat, 0, 1.5, -0.7, 1.05, 1, 0.9)); // rump
  const neck = capsule(0.28, 0.75, coat, 0, 2.08, 1.05);
  neck.rotation.x = 0.6;
  horse.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 2.45, 1.48);
  head.rotation.x = 0.35;
  horse.add(head);
  head.add(box(0.36, 0.38, 0.62, coat, 0, 0, 0));
  head.add(sphere(0.2, 0xe8e2d4, 0, -0.08, 0.34, 1, 0.9, 0.9)); // muzzle
  for (const s of [-1, 1]) {
    head.add(sphere(0.045, dark, s * 0.08, -0.08, 0.52)); // nostrils
    head.add(sphere(0.055, dark, s * 0.19, 0.08, 0.05)); // eyes
    const ear = cone(0.07, 0.2, coat, s * 0.11, 0.27, -0.2, 5);
    ear.rotation.z = -s * 0.2;
    head.add(ear);
    head.add(box(0.02, 0.05, 0.5, 0x7a1a1a, s * 0.19, -0.02, 0.1)); // bridle
  }
  head.add(band(0.2, 0.025, 0x7a1a1a, 0, 0.02, 0.28));
  // Reins to the rider's hands.
  const rein = cyl(0.015, 0.015, 1.1, 0x7a1a1a, 0, 2.3, 0.95, 4);
  rein.rotation.x = 1.2;
  horse.add(rein);
  // Mane in segments, and a flowing tail.
  for (let i = 0; i < 6; i++) {
    const m = box(0.1, 0.28, 0.22, dark, 0, 2.3 - i * 0.1, 1.45 - i * 0.16);
    m.rotation.x = 0.6;
    horse.add(m);
  }
  for (let i = -1; i <= 1; i++) {
    const t = capsule(0.07, 0.7, dark, i * 0.07, 1.35, -1.3);
    t.rotation.x = -0.45 - Math.abs(i) * 0.1;
    horse.add(t);
  }
  // Saddle and blanket.
  horse.add(box(1.25, 0.08, 1.15, 0x990000, 0, 2.0, 0.05));
  horse.add(box(1.28, 0.1, 0.06, 0xffc72c, 0, 1.97, 0.63));
  horse.add(box(1.28, 0.1, 0.06, 0xffc72c, 0, 1.97, -0.53));
  horse.add(sphere(0.3, 0x5a2a1a, 0, 2.08, 0.05, 1.1, 0.35, 1.2));
  p.quadLegs = [];
  for (const [x, z] of [[-0.3, 0.75], [0.3, 0.75], [-0.3, -0.75], [0.3, -0.75]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 1.15, z);
    leg.add(capsule(0.14, 0.4, coat, 0, -0.25, 0));
    leg.add(capsule(0.1, 0.45, coat, 0, -0.72, 0));
    leg.add(cyl(0.12, 0.12, 0.12, 0xe0dccf, 0, -0.95, 0));
    leg.add(cyl(0.13, 0.15, 0.14, dark, 0, -1.08, 0));
    horse.add(leg);
    p.quadLegs.push(leg);
  }
  // Seat the rider on the horse with legs astride; the rider's own legs don't walk.
  p.rig.position.y = -1 + 1.05;
  p.legL.rotation.z = 0.9;
  p.legR.rotation.z = -0.9;
  p.legL = new THREE.Object3D();
  p.legR = new THREE.Object3D();
  p.top += 1.05;
  return p;
}

export const BUILDERS = {
  northwestern() {
    const fur = 0xa87945;
    const p = buildBiped({
      head: fur, hands: fur, shirt: 0x4e2a84, pants: 0x4e2a84, headR: 0.58, trim: 0xffffff,
      mouth: 'none', lids: true, iris: 0x7bc043, number: '21', feet: pawFeet(fur),
    });
    const r = p.headR;
    earsCat(p.head, r, fur, 0xf5d7b0, 0x3a2a1e);
    // Wildcat stripes on the forehead and cheeks.
    for (let i = -1; i <= 1; i++) {
      const s = box(0.05, 0.2, 0.05, 0x5a3a1e, i * 0.13, r * 0.7, r * 0.58);
      s.rotation.x = -0.8;
      p.head.add(s);
    }
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const s = box(0.18, 0.04, 0.04, 0x5a3a1e, sd * r * 0.8, -i * 0.12, r * 0.45);
        s.rotation.y = sd * 1.0;
        p.head.add(s);
      }
    }
    snout(p.head, r, 0xf5e6cc, 0xd9707a, 0.35, { fangs: true, whiskers: 0x3a2a1e });
    tail(p, fur, 0.9, 0.95, 0.1, 0x3a2a1e);
    for (const arm of [p.armL, p.armR]) arm.add(band(0.14, 0.04, 0x4e2a84, 0, -0.44, 0));
    chestLetter(p, 'N', 0xffffff, null, 0.5, 0x2a1450);
    return p;
  },

  rutgers() {
    const steel = 0xb8bcc2;
    const scarlet = 0xcc0033;
    const p = buildBiped({
      head: steel, hands: 0x8a8f96, shirt: 0x7a7e84, sleeve: steel, pants: scarlet, eyes: false,
      headR: 0.5, trim: steel, mouth: 'none', collar: false, belt: 0x3a2a1a, buckle: 0xd4af37,
      feet: boots(steel, 0x555555), number: null,
    });
    helmet(p.head, p.headR, steel, scarlet, false);
    pauldrons(p, steel);
    breastplate(p, steel);
    bracers(p, steel);
    kneePads(p, steel);
    // Scarlet tabard over the armor.
    const tabard = box(0.5, 0.75, 0.03, scarlet, 0, 1.2, 0.42);
    p.rig.add(tabard);
    const r = letterPlane('R', 0xffffff, 0.38);
    r.position.set(0, 1.35, 0.44);
    p.rig.add(r);
    cape(p, scarlet, 1.25, 0.9);
    lance(p.handR);
    shield(p.handL, scarlet, steel, false, 0.45, 'R').rotation.y = Math.PI / 2;
    return p;
  },

  indiana() {
    const crimson = 0x990000;
    const cream = 0xeeedeb;
    const p = buildBiped({
      shirt: crimson, pants: cream, shorts: true, sleeves: 'short', trim: cream, socks: 0xffffff,
      shoes: 0xffffff, sole: crimson, laces: crimson, brows: 0x4a2a1a, humanEars: true, number: '23',
      mouth: 'grin', iris: 0x4a6a3a,
    });
    cap(p.head, p.headR, crimson, crimson, cream);
    const logo = letterPlane('IU', cream, 0.32);
    logo.position.set(0, p.headR * 0.6, p.headR * 0.98);
    p.head.add(logo);
    // Candy-stripe warm-up pants → candy-stripe shorts.
    for (const leg of [p.legL, p.legR]) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const s = box(0.05, 0.36, 0.02, crimson, Math.sin(a) * 0.2, -0.14, Math.cos(a) * 0.2);
        s.rotation.y = a;
        leg.add(s);
      }
    }
    // Headband and wristbands.
    p.head.add(band(p.headR * 1.0, 0.04, 0xffffff, 0, p.headR * 0.08, 0));
    for (const arm of [p.armL, p.armR]) arm.add(cyl(0.14, 0.14, 0.12, 0xffffff, 0, -0.56, 0));
    ball(p.handR);
    chestLetter(p, 'IU', cream, null, 0.5, 0x4a0000);
    return p;
  },

  illinois() {
    const orange = 0xff5f05;
    const navy = 0x13294b;
    const p = buildBiped({
      shirt: navy, sleeve: orange, pants: navy, bulk: 1.1, trim: orange, brows: 0x3a2a1a,
      humanEars: true, mouth: 'frown', lids: true, iris: 0x3a5a8a, feet: boots(0x5a3a1e),
    });
    helmet(p.head, p.headR, orange, navy);
    pauldrons(p, orange, 0.28);
    breastplate(p, navy, orange);
    bracers(p, orange);
    kneePads(p, orange);
    cape(p, orange, 1.35, 1.1);
    shield(p.handL, orange, navy, true, 0.8, 'I', navy);
    chestLetter(p, 'I', orange, null, 0.46, 0x000000).position.z = 0.44;
    return p;
  },

  maryland() {
    const skin = 0x7a8c5a;
    const p = buildBiped({
      head: skin, hands: skin, arms: skin, legs: skin, shirt: 0xe03a3e, sleeves: 'short', pants: 0x1a1a1a,
      shorts: true, headR: 0.52, trim: 0xffd520, mouth: 'none', iris: 0x2a2a1a, number: '4',
      feet: pawFeet(skin, 0x333333),
    });
    const r = p.headR;
    // Terrapin face: flat beak-mouth and spotted skin.
    p.head.add(sphere(r * 0.5, 0x8fa36a, 0, -r * 0.22, r * 0.62, 1.1, 0.7, 0.8));
    p.head.add(box(r * 0.7, 0.025, 0.03, 0x2a2a1a, 0, -r * 0.35, r * 1.02));
    for (const s of [-1, 1]) p.head.add(sphere(0.02, 0x2a2a1a, s * 0.05, -r * 0.12, r * 1.03));
    for (let i = 0; i < 8; i++) {
      const a = i * 2.3;
      p.head.add(sphere(0.045, 0x4e5e36, Math.sin(a) * r * 0.9, Math.cos(i) * r * 0.5 + 0.1, Math.cos(a) * r * 0.5 - r * 0.3));
    }
    // Shell: dome, scutes, gold rim, and a pale plastron on the belly.
    const sh = mesh(new THREE.SphereGeometry(0.78, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6b5a2e, { roughness: 0.4 }), 0, 1.35, -0.3);
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(1, 1, 0.9);
    p.rig.add(sh);
    const scutes = [[0, 1.35], [0, 1.72], [0, 0.98], [-0.38, 1.18], [0.38, 1.18], [-0.38, 1.54], [0.38, 1.54]];
    for (const [x, y] of scutes) {
      const depth = Math.sqrt(Math.max(0, 0.78 * 0.78 - x * x - (y - 1.35) ** 2)) * 0.9;
      const sc = sphere(0.17, 0x8a7438, x, y, -0.3 - depth, 1, 1, 0.35, { roughness: 0.35 });
      p.rig.add(sc);
    }
    const rim = mesh(new THREE.TorusGeometry(0.76, 0.07, 8, 28), mat(0xffd520), 0, 1.35, -0.3);
    p.rig.add(rim);
    p.rig.add(sphere(0.34, 0xe8d8a0, 0, 1.3, 0.3, 1.1, 1.3, 0.3));
    // Maryland flag belt pattern.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = box(0.12, 0.1, 0.02, i % 2 ? 0x111111 : 0xffd520, Math.sin(a) * 0.4, 1.1, Math.cos(a) * 0.33);
      b.rotation.y = a;
      p.rig.add(b);
    }
    chestLetter(p, 'M', 0xffd520, null, 0.4, 0x000000).position.set(0, 1.62, 0.4);
    return p;
  },

  purdue() {
    const gold = 0xcfb991;
    const p = buildBiped({
      shirt: gold, pants: 0x1a1a1a, bulk: 1.1, trim: 0x1a1a1a, brows: 0x2a1a0e, humanEars: true,
      mouth: 'grin', lids: true, iris: 0x4a3222, hands: 0x2a2a2a, gloveCuff: gold, number: '1869',
      feet: boots(0x3a2a1a),
    });
    const r = p.headR;
    hardHat(p.head, r, gold, 'P');
    // Pete's big square chin, sideburns and five-o'clock shadow.
    p.head.add(box(0.52, 0.22, 0.28, SKIN, 0, -0.44, 0.33));
    p.head.add(sphere(0.2, 0xd8a880, 0, -0.44, 0.44, 1.3, 0.5, 0.3));
    for (const s of [-1, 1]) p.head.add(box(0.08, 0.25, 0.12, 0x2a1a0e, s * r * 0.92, 0, 0.1));
    // Suspenders and tool belt.
    for (const s of [-1, 1]) p.rig.add(box(0.08, 0.72, 0.7, 0x1a1a1a, s * 0.2, 1.5, 0));
    for (let i = 0; i < 3; i++) p.rig.add(box(0.14, 0.18, 0.1, 0x6b4a2a, -0.3 + i * 0.3, 0.98, 0.34));
    hammer(p.handR);
    chestLetter(p, 'P', 0x1a1a1a, null, 0.46, gold);
    return p;
  },

  minnesota() {
    const fur = 0xc79a3a;
    const p = buildBiped({
      head: fur, hands: fur, shirt: 0x7a0019, pants: 0xffcc33, headR: 0.62, trim: 0xffcc33,
      mouth: 'none', iris: 0x3a2a1a, number: '10', feet: pawFeet(fur),
    });
    const r = p.headR;
    earsRound(p.head, r, fur, 0xe8c07a, 0.22);
    // Chubby cheeks, buck teeth, whiskers.
    for (const s of [-1, 1]) p.head.add(sphere(r * 0.3, 0xe8c07a, s * r * 0.35, -r * 0.25, r * 0.7, 1, 0.9, 0.8));
    snout(p.head, r, 0xe8c07a, 0x3a2a1e, 0.32, { whiskers: 0x3a2a1e });
    for (const s of [-1, 1]) p.head.add(box(0.1, 0.18, 0.05, 0xffffff, s * 0.055, -0.4, 0.66));
    tuft(p.head, r, fur, 3, 0.3);
    // Varsity sweater stripes on the sleeves, and a fluffy tail.
    for (const arm of [p.armL, p.armR]) for (let i = 0; i < 2; i++) arm.add(band(0.14, 0.03, 0xffcc33, 0, -0.2 - i * 0.1, 0));
    tail(p, fur, 0.5, 0.9, 0.16);
    chestLetter(p, 'M', 0xffcc33, null, 0.55, 0x3a000c);
    return p;
  },

  wisconsin() {
    const fur = 0x3a2a1e;
    const p = buildBiped({
      head: fur, hands: fur, shirt: 0xc5050c, pants: 0x1a1a1a, headR: 0.58, trim: 0xffffff,
      mouth: 'none', lids: true, iris: 0x3a2a1a, number: '33', feet: pawFeet(fur),
    });
    const r = p.headR;
    p.head.add(box(0.16, 0.08, 1.0, 0xffffff, 0, 0.5, 0.05));
    for (const s of [-1, 1]) {
      p.head.add(sphere(0.2, 0xffffff, s * 0.32, -0.12, 0.38));
      p.head.add(box(0.07, 0.04, 0.5, 0xffffff, s * 0.25, 0.35, 0.3)); // side stripes
    }
    earsRound(p.head, r, fur, 0xffffff, 0.2);
    snout(p.head, r, 0xf2e8da, 0x111111, 0.4, { fangs: true });
    brows(p.head, r, 0xffffff, 0.35, 0.52);
    stripes(p, [1.22, 1.55], 0xffffff);
    for (const arm of [p.armL, p.armR]) for (let i = 0; i < 3; i++) arm.add(band(0.14, 0.03, i % 2 ? 0xc5050c : 0xffffff, 0, -0.18 - i * 0.1, 0));
    chestLetter(p, 'W', 0xffffff, null, 0.5, 0x5a0000);
    claws(p.handR);
    claws(p.handL);
    tail(p, fur, 0.35, 0.95, 0.12);
    return p;
  },

  ucla() {
    const fur = 0x7a4e2d;
    const p = buildBiped({
      head: fur, hands: fur, legs: fur, shirt: 0x2d68c4, sleeve: 0xf2a900, pants: 0x2d68c4, shorts: true,
      bulk: 1.2, headR: 0.62, trim: 0xf2a900, mouth: 'none', lids: true, iris: 0x2a1a0e, number: '88',
      feet: pawFeet(fur, 0x222222),
    });
    const r = p.headR;
    earsRound(p.head, r, fur, 0xc79a6b);
    snout(p.head, r, 0xc79a6b, 0x111111, 0.4, { fangs: true });
    brows(p.head, r, 0x4a2a14, 0.3, 0.5);
    // Belly patch peeking under the jersey, and paw pads.
    p.rig.add(sphere(0.28, 0xc79a6b, 0, 1.0, 0.3, 1.2, 0.6, 0.5));
    for (const arm of [p.armL, p.armR]) arm.add(sphere(0.08, 0x3a2a1a, 0, -0.72, 0.13, 1, 1, 0.4));
    chestLetter(p, 'B', 0xf2a900, null, 0.55, 0x0a2a6a);
    tail(p, fur, 0.2, 1.0, 0.14);
    return p;
  },

  washington: buildHusky,

  oregon() {
    const green = 0x154733;
    const yellow = 0xfee123;
    const p = buildBiped({
      head: 0xffffff, hands: 0xffffff, shirt: green, sleeve: yellow, pants: green, headR: 0.58,
      trim: yellow, mouth: 'none', lids: true, iris: 0x2a1a0a, number: '0', feet: webbedFeet(0xf29b24),
    });
    const r = p.headR;
    duckBill(p.head, r, 0xf29b24);
    cap(p.head, r, green, yellow, yellow);
    const o = letterPlane('O', yellow, 0.34);
    o.position.set(0, r * 0.62, r * 0.98);
    p.head.add(o);
    // Feathery tuft poking out the back of the cap and a tail.
    for (let i = 0; i < 4; i++) {
      const f = cone(0.06, 0.25, 0xffffff, (i - 1.5) * 0.08, 0.25, -r * 0.95, 5);
      f.rotation.x = -2.2;
      p.head.add(f);
    }
    for (let i = -1; i <= 1; i++) {
      const f = cone(0.07, 0.3, 0xffffff, i * 0.1, 1.0, -0.42, 5);
      f.rotation.x = -2.3;
      p.rig.add(f);
    }
    // Wing feathers along the sleeves.
    for (const [arm, s] of [[p.armL, 1], [p.armR, -1]]) {
      for (let i = 0; i < 3; i++) arm.add(box(0.03, 0.3, 0.2, 0xffffff, s * 0.14, -0.2 - i * 0.14, -0.05));
    }
    chestLetter(p, 'O', yellow, null, 0.55, 0x05281a);
    return p;
  },

  'michigan-state'() {
    const green = 0x18453b;
    const p = buildBiped({
      shirt: 0xf0c49a, sleeve: SKIN, sleeves: 'short', pants: green, bulk: 1.15, trim: 0xd4af37,
      brows: 0x2a1a0e, humanEars: true, mouth: 'frown', lids: true, iris: 0x2a5a3a, collar: false,
      feet: sandals(), belt: 0x5a3a1a,
    });
    const r = p.headR;
    helmet(p.head, r, green, 0xffffff);
    p.head.add(box(0.55, 0.3, 0.32, SKIN, 0, -0.45, 0.32)); // heroic chin
    p.head.add(box(0.04, 0.12, 0.03, 0xc89a7a, 0, -0.46, 0.49)); // chin dimple
    // Bare muscular chest: pecs and abs.
    for (const s of [-1, 1]) p.rig.add(sphere(0.2, SKIN, s * 0.17, 1.6, 0.3, 1.1, 0.8, 0.5));
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) p.rig.add(sphere(0.08, 0xe8b88a, s * 0.08, 1.38 - i * 0.12, 0.34, 1, 0.8, 0.4));
    // Green Spartan skirt (pteruges) and cape.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = box(0.14, 0.32, 0.03, i % 2 ? green : 0x0e2e26, Math.sin(a) * 0.42, 0.9, Math.cos(a) * 0.36);
      s.rotation.y = a;
      p.rig.add(s);
    }
    bracers(p, 0xd4af37);
    cape(p, green, 1.4, 1.0);
    spear(p.handR);
    shield(p.handL, green, 0xffffff, true, 0.65, 'S');
    return p;
  },

  usc() {
    const p = buildHorseRider({
      shirt: 0x990000, sleeve: SKIN, sleeves: 'short', pants: 0x990000, trim: 0xffc72c, brows: 0x2a1a0e,
      humanEars: true, mouth: 'frown', lids: true, iris: 0x3a2a1a, feet: sandals(0x7a4a22),
    });
    helmet(p.head, p.headR, 0xffc72c, 0x990000);
    breastplate(p, 0xffc72c, 0x990000);
    bracers(p, 0xffc72c);
    cape(p, 0x990000, 1.2, 0.9);
    sword(p.handR);
    return p;
  },

  'penn-state'() {
    const fur = 0xe8dcc0;
    const p = buildBiped({
      head: fur, hands: fur, shirt: 0x041e42, sleeve: 0xffffff, pants: 0x041e42, bulk: 1.1, trim: 0xffffff,
      mouth: 'none', lids: true, iris: 0xb8862b, number: '1', feet: pawFeet(fur),
    });
    const r = p.headR;
    earsRound(p.head, r, fur, 0x3a2a1e, 0.22);
    snout(p.head, r, 0xf6efe0, 0x3a2a1e, 0.4, { fangs: true, whiskers: 0x8a7a5a });
    brows(p.head, r, 0x8a7a5a, 0.3);
    // Mountain lion markings: dark tear lines and a chest ruff.
    for (const s of [-1, 1]) {
      const m = box(0.03, 0.18, 0.03, 0x6a5a3a, s * r * 0.25, -r * 0.05, r * 0.9);
      m.rotation.z = s * 0.3;
      p.head.add(m);
    }
    ruff(p, 0xd8ccb0, 12, 1.92, 0.36);
    tail(p, fur, 1.0, 0.95, 0.09, 0x3a2a1e);
    chestLetter(p, 'PSU', 0xffffff, null, 0.55, 0x000000);
    return p;
  },

  michigan() {
    const fur = 0x4a3222;
    const p = buildBiped({
      head: fur, hands: fur, shirt: 0x00274c, sleeve: 0xffcb05, pants: 0x00274c, headR: 0.56,
      trim: 0xffcb05, mouth: 'none', lids: true, iris: 0x1a1a1a, number: '1', feet: pawFeet(fur),
    });
    const r = p.headR;
    const bandMesh = mesh(new THREE.TorusGeometry(0.5, 0.08, 8, 24), mat(0xc9a26b), 0, 0.12, 0);
    bandMesh.rotation.x = Math.PI / 2;
    bandMesh.scale.set(1.05, 1, 1);
    p.head.add(bandMesh);
    earsRound(p.head, r, fur, 0xc9a26b, 0.18);
    snout(p.head, r, 0x2e1f15, 0x111111, 0.4, { fangs: true });
    brows(p.head, r, 0x111111, 0.5);
    // Shaggy fur: ruff and scruffy tufts on the head.
    ruff(p, fur, 10, 1.92, 0.34);
    tuft(p.head, r, fur, 5, 0.3);
    claws(p.handR);
    claws(p.handL);
    // Winged-helmet style stripes on the sleeves.
    for (const arm of [p.armL, p.armR]) arm.add(band(0.14, 0.04, 0x00274c, 0, -0.3, 0));
    tail(p, fur, 0.5, 0.95, 0.14);
    chestLetter(p, 'M', 0xffcb05, null, 0.55, 0x000000);
    return p;
  },

  'ohio-state'() {
    const p = buildBiped({
      head: 0x5b3416, shirt: 0xbb0000, pants: 0x666666, headR: 0.75, eyeY: 0.02, trim: 0x888888,
      mouth: 'none', iris: 0x2a1a0a, number: '00', hands: 0xffffff, gloveCuff: 0xbb0000,
    });
    const r = p.headR;
    // Shiny buckeye: tan "eye" cap and a highlight.
    p.headMesh.material.roughness = 0.25;
    p.head.add(sphere(0.47, 0xc9a26b, 0, 0.36, 0.33, 1, 0.7, 0.62));
    p.head.add(sphere(0.12, 0xffffff, -0.3, 0.3, 0.55, 1, 1.4, 0.4, { transparent: true, opacity: 0.35, roughness: 0.1 }));
    stripes(p, [1.2, 1.4, 1.6], 0x888888);
    for (const arm of [p.armL, p.armR]) for (let i = 0; i < 3; i++) arm.add(band(0.14, 0.03, 0x888888, 0, -0.18 - i * 0.12, 0));
    mouth(p.head, r, 'grin', 0x2a1508, -0.35, 0.9);
    brows(p.head, r, 0x2a1508, 0.1, 0.35);
    return p;
  },

  iowa() {
    const black = 0x111111;
    const gold = 0xffcd00;
    const p = buildBiped({
      head: black, hands: gold, shirt: gold, sleeve: black, pants: black, headR: 0.6, eyeY: 0.14,
      trim: black, mouth: 'none', lids: true, iris: 0xffcd00, number: '1', feet: talons(gold),
    });
    const r = p.headR;
    beak(p.head, r, gold, 0.9, true);
    brows(p.head, r, 0xffffff, 0.55, 0.5);
    // Gold eye rings and a swept-back feather crest.
    for (const s of [-1, 1]) p.head.add(mesh(new THREE.TorusGeometry(r * 0.2, 0.025, 6, 16), mat(gold), s * r * 0.36, r * 0.28, r * 0.9));
    for (let i = 0; i < 5; i++) {
      const f = box(0.08, 0.35 - i * 0.03, 0.12, i % 2 ? gold : black, 0, 0.55 - i * 0.02, -0.1 - i * 0.12);
      f.rotation.x = -0.5 - i * 0.2;
      p.head.add(f);
    }
    // Layered wing feathers on both arms.
    for (const [arm, s] of [[p.armL, 1], [p.armR, -1]]) {
      for (let i = 0; i < 5; i++) {
        const f = box(0.05, 0.75 - i * 0.1, 0.32, i % 2 ? gold : black, s * (0.12 + i * 0.025), -0.3 - i * 0.12, -0.05 - i * 0.02);
        f.rotation.z = s * 0.1;
        arm.add(f);
      }
    }
    // Tail fan and a white chest bib.
    for (let i = -2; i <= 2; i++) {
      const f = box(0.14, 0.6, 0.04, i % 2 ? gold : black, i * 0.12, 1.0, -0.4);
      f.rotation.x = -0.6;
      f.rotation.z = i * 0.2;
      p.rig.add(f);
    }
    p.rig.add(sphere(0.25, 0xf5f1e7, 0, 1.8, 0.28, 1.1, 0.7, 0.5));
    chestLetter(p, 'I', black, null, 0.5, gold);
    return p;
  },
};

export const buildPup = buildHusky;
