// Fling: each player is launched from a catapult as a floppy ragdoll.
// Shortest distance orders. Launch order and launch power/angle are drawn
// independently of who's who, so every player has exactly a 1/N chance.

import { shuffle, rand } from '../fair.js?v=6';
import { STEP, fit, runSim, simulateHeadless, throttle, poly, tag, short, clamp, ease, banner, shade, initial, textOn, setHud, esc } from '../stage.js?v=6';

const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;

const DEG = Math.PI / 180;
const GROUND = 600;
const PIVOT = { x: 90, y: 556 };
const ARM = 80;
const LAUNCH_X = 110;
const REST_A = 200 * DEG;
const RELEASE_A = 75 * DEG;
const LOAD = 100;
const LOAD_FINAL = 160;
const VERDICT_STEPS = 60;
const SWING = 22;
const REST_STEPS = 40;
const MAX_FLY = 18 * 60;
const FINAL = 80;
const FIELD_END = 6400;
const BAR_X = FIELD_END - 260;

// Ground zones. Mud stops you dead, boost pads relaunch you, the lake sinks you
// (unless you land on the boat, which ferries you to the far shore).
const ZONES = [
  { type: 'mud', x1: 700, x2: 950 },
  { type: 'boost', x1: 1150, x2: 1260 },
  { type: 'mud', x1: 1700, x2: 1900 },
  { type: 'boost', x1: 2080, x2: 2190 },
  { type: 'lake', x1: 2500, x2: 3500 },
  { type: 'boost', x1: 3800, x2: 3910 },
  { type: 'mud', x1: 4300, x2: 4560 },
  { type: 'boost', x1: 4950, x2: 5060 },
  { type: 'mud', x1: 5450, x2: 5700 },
];
const zoneAt = x => ZONES.find(z => x >= z.x1 && x <= z.x2);
const WATER_Y = GROUND - 30;
const BOAT_PATROL = [2640, 3120]; // drifts back and forth here waiting for a passenger
const BOAT_DOCK = 3360;
const BOAT_Y = GROUND - 28;
const BOAT_W = 190;

const armTip = a => ({ x: PIVOT.x + ARM * Math.cos(a), y: PIVOT.y - ARM * Math.sin(a) });

function buildField() {
  const S = { isStatic: true };
  const statics = [
    Bodies.rectangle(FIELD_END / 2 - 100, GROUND + 60, FIELD_END + 600, 120, { ...S, label: 'ground', friction: 0.9, restitution: 0.1 }),
    Bodies.rectangle(-180, GROUND - 600, 60, 1400, { ...S, label: 'wall' }),
    Bodies.rectangle(FIELD_END + 30, GROUND - 600, 60, 1400, { ...S, label: 'wall' }),
  ];
  for (const x of [520, 1480, 4150]) statics.push(Bodies.circle(x, GROUND + 12, 48, { ...S, label: 'mushroom', restitution: 1.05, friction: 0.2 }));
  for (const [x, y] of [[900, 380], [1550, 330], [2300, 420], [3050, 300], [4700, 380]]) statics.push(Bodies.circle(x, y, 28, { ...S, label: 'bumper', restitution: 1 }));
  for (const x of [1350, 5250]) statics.push(Bodies.rectangle(x, GROUND - 7, 120, 14, { ...S, label: 'tramp', restitution: 1.25, friction: 0.3 }));
  const boat = Bodies.rectangle(BOAT_PATROL[0], BOAT_Y, BOAT_W, 18, { ...S, label: 'boat', friction: 1, chamfer: { radius: 6 } });
  statics.push(boat);
  return { statics, boat };
}

function makeDoll(x, y, group) {
  const o = { collisionFilter: { group }, friction: 0.8, frictionAir: 0.0015, restitution: 0.35, density: 0.0016 };
  const torso = Bodies.rectangle(x, y, 16, 28, { ...o, label: 'torso', chamfer: { radius: 5 } });
  const head = Bodies.circle(x, y - 24, 10, { ...o, label: 'head' });
  const legL = Bodies.rectangle(x - 5, y + 23, 7, 20, { ...o, chamfer: { radius: 3 } });
  const legR = Bodies.rectangle(x + 5, y + 23, 7, 20, { ...o, chamfer: { radius: 3 } });
  const armL = Bodies.rectangle(x - 16, y - 9, 18, 6, { ...o, chamfer: { radius: 3 } });
  const armR = Bodies.rectangle(x + 16, y - 9, 18, 6, { ...o, chamfer: { radius: 3 } });
  const joint = (a, pa, b, pb) => Constraint.create({ bodyA: a, pointA: pa, bodyB: b, pointB: pb, length: 0, stiffness: 0.7, damping: 0.05 });
  return {
    torso, head,
    limbs: [legL, legR, armL, armR],
    parts: [torso, head, legL, legR, armL, armR],
    constraints: [
      joint(torso, { x: 0, y: -14 }, head, { x: 0, y: 10 }),
      joint(torso, { x: -5, y: 13 }, legL, { x: 0, y: -10 }),
      joint(torso, { x: 5, y: 13 }, legR, { x: 0, y: -10 }),
      joint(torso, { x: -7, y: -9 }, armL, { x: 9, y: 0 }),
      joint(torso, { x: 7, y: -9 }, armR, { x: -9, y: 0 }),
    ],
  };
}

export function createSim(players, { headless = false } = {}) {
  const engine = Engine.create();
  engine.positionIterations = 8;
  engine.velocityIterations = 6;
  const { statics, boat: boatBody } = buildField();
  Composite.add(engine.world, statics);
  const boat = { body: boatBody, x: BOAT_PATROL[0], dir: 1, state: 'idle', rider: null };

  const slots = shuffle(players).map(player => ({
    player,
    v: rand(15, 25),
    angle: rand(35, 62) * DEG,
    spin: rand(-0.3, 0.3),
    doll: null,
    x: null,
    trail: [],
  }));

  const sim = {
    t: 0, idx: 0, phase: 'load', phaseT: 0, armA: REST_A, restFor: 0,
    slots, statics, boat, done: false, loser: null, loserSlot: null, events: [], lastLanded: null,
  };

  Events.on(engine, 'collisionStart', e => {
    for (const { bodyA: a, bodyB: b } of e.pairs) {
      const o = a.collisionFilter.group < 0 ? b : b.collisionFilter.group < 0 ? a : null;
      if (!o) continue;
      if (o.label === 'bumper' || o.label === 'mushroom' || o.label === 'tramp') {
        o.flash = 1;
        sim.events.push({ type: 'boing' });
      } else if (Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y) > 4) {
        sim.events.push({ type: 'thud' });
      }
    }
  });

  function launch(s, index) {
    const tip = armTip(RELEASE_A);
    const doll = makeDoll(tip.x, tip.y - 6, -(index + 1));
    const vel = { x: s.v * Math.cos(s.angle), y: -s.v * Math.sin(s.angle) };
    for (const b of doll.parts) Body.setVelocity(b, vel);
    Body.setAngularVelocity(doll.torso, s.spin);
    Composite.add(engine.world, [...doll.parts, ...doll.constraints]);
    s.doll = doll;
    sim.phase = 'fly';
    sim.phaseT = 0;
    sim.restFor = 0;
    sim.events.push({ type: 'launch' });
  }

  const damp = (doll, k) => {
    for (const b of doll.parts) {
      Body.setVelocity(b, { x: b.velocity.x * k, y: b.velocity.y * k });
      Body.setAngularVelocity(b, b.angularVelocity * k);
    }
  };

  function moveBoat() {
    if (boat.state === 'ride') {
      const dx = 2.6;
      boat.x += dx;
      for (const b of boat.rider.doll.parts) Body.translate(b, { x: dx, y: 0 });
      if (boat.x >= BOAT_DOCK) {
        // Toss the passenger onto the far shore
        for (const b of boat.rider.doll.parts) Body.setVelocity(b, { x: 9, y: -8 });
        boat.rider = null;
        boat.state = 'return';
        sim.events.push({ type: 'launch' });
      }
    } else if (boat.state === 'return') {
      boat.x -= 3.5;
      if (boat.x <= BOAT_PATROL[1]) {
        boat.state = 'idle';
        boat.dir = -1;
      }
    } else {
      boat.x += boat.dir * 1.2;
      if (boat.x >= BOAT_PATROL[1]) boat.dir = -1;
      if (boat.x <= BOAT_PATROL[0]) boat.dir = 1;
    }
    Body.setPosition(boat.body, { x: boat.x, y: BOAT_Y + Math.sin(sim.t * 0.05) * 2 });
  }

  sim.step = () => {
    sim.t++;
    sim.phaseT++;
    moveBoat();
    Engine.update(engine, STEP);

    for (const s of slots) {
      if (!s.doll) continue;
      const d = s.doll;
      const p = d.torso.position;
      if (p.y > GROUND + 200) {
        // Tunneled through the ground: pop the whole doll back on top.
        for (const b of d.parts) Body.translate(b, { x: 0, y: GROUND - 60 - p.y });
      }
      const zone = zoneAt(p.x);
      const low = p.y > GROUND - 45;
      if (zone && low && zone.type === 'mud') {
        damp(d, 0.82);
        if (!s.inMud) sim.events.push({ type: 'mud' });
        s.inMud = true;
      } else {
        s.inMud = false;
      }
      if (zone && low && zone.type === 'boost' && sim.t - (s.boostAt ?? -99) > 40) {
        s.boostAt = sim.t;
        zone.flash = 1;
        const vx = Math.max(d.torso.velocity.x, 2) + 8;
        for (const b of d.parts) Body.setVelocity(b, { x: vx, y: -9 });
        sim.events.push({ type: 'boost' });
      }
      if (zone && zone.type === 'lake' && p.y > WATER_Y - 2 && boat.rider !== s) {
        damp(d, 0.9);
        if (!s.inWater) sim.events.push({ type: 'splash' });
        s.inWater = true;
      } else {
        s.inWater = false;
      }
      // Landed on the boat? All aboard for the far shore.
      if (boat.state === 'idle' && Math.abs(p.x - boat.x) < BOAT_W / 2 - 8 && p.y < BOAT_Y - 9 && p.y > BOAT_Y - 70 && d.torso.velocity.y > -1) {
        boat.state = 'ride';
        boat.rider = s;
        sim.events.push({ type: 'boat' });
      }
      s.x = d.torso.position.x;
    }

    const cur = slots[sim.idx];
    if (sim.phase === 'load') {
      sim.armA += (REST_A - sim.armA) * 0.15;
      const wait = sim.idx === slots.length - 1 ? LOAD_FINAL : LOAD;
      if (sim.phaseT >= (headless ? 1 : wait)) {
        sim.phase = 'swing';
        sim.phaseT = 0;
        sim.events.push({ type: 'creak' });
      }
    } else if (sim.phase === 'swing') {
      const k = sim.phaseT / SWING;
      sim.armA = REST_A + (RELEASE_A - REST_A) * k * k;
      if (sim.phaseT >= SWING) launch(cur, sim.idx);
    } else if (sim.phase === 'fly') {
      sim.armA += (REST_A - sim.armA) * 0.04;
      const tor = cur.doll.torso;
      if (!headless) {
        cur.trail.push({ x: tor.position.x, y: tor.position.y });
        if (cur.trail.length > 36) cur.trail.shift();
      }
      const still = tor.speed < 0.3 && tor.angularSpeed < 0.05 && boat.rider !== cur;
      sim.restFor = still ? sim.restFor + 1 : 0;
      if (sim.restFor >= REST_STEPS || sim.phaseT >= MAX_FLY) {
        cur.trail.length = 0;
        const mark = dangerSlot(sim);
        const verdict = !mark ? 'first' : cur.x < mark.x ? 'shortest' : 'safe';
        sim.lastLanded = { slot: cur, t: sim.t, verdict };
        sim.events.push({ type: 'land', verdict });
        sim.idx++;
        sim.phase = sim.idx < slots.length ? 'load' : 'final';
        sim.phaseT = 0;
      }
    } else if (sim.phase === 'final' && sim.phaseT >= (headless ? 30 : FINAL)) {
      // Raw x (not clamped at 0) so two players bouncing backwards can't tie.
      const ranked = [...slots].sort((a, b) => b.x - a.x);
      sim.loserSlot = ranked[ranked.length - 1];
      sim.loser = sim.loserSlot.player;
      sim.shot = ranked.length > 1 ? ranked[ranked.length - 2].player : null;
      sim.done = true;
      sim.events.push({ type: 'last' });
    }
  };

  return sim;
}

const feet = x => Math.max(0, Math.round((x - LAUNCH_X) / 10));

// Shortest fling so far among players who've landed (the "danger line").
function dangerSlot(sim) {
  const landed = sim.slots.slice(0, sim.idx);
  return landed.length ? landed.reduce((a, b) => (b.x < a.x ? b : a)) : null;
}

// Close call: the flyer is coming down, or rolling, right around the danger line.
function closeCall(sim) {
  if (sim.phase !== 'fly' || sim.done) return false;
  const d = dangerSlot(sim);
  if (!d) return false;
  const t = sim.slots[sim.idx].doll.torso;
  const { x, y } = t.position;
  return Math.abs(x - d.x) < 130 && y > GROUND - 220 && (t.velocity.y > 0 || y > GROUND - 60);
}

function renderer(canvas, sim, view) {
  const ctx = canvas.getContext('2d');
  const cam = { x: 0, y: 0, s: 0 };
  const stars = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.3 + 0.3 }));
  const skyline = [];
  for (let x = -1400; x < 4200; x += 70 + Math.random() * 60) {
    const bw = 60 + Math.random() * 70;
    const bh = 90 + Math.random() * 260;
    const lights = [];
    for (let wy = 14; wy < bh - 10; wy += 18) {
      for (let wx = 10; wx < bw - 10; wx += 16) if (Math.random() < 0.28) lights.push([wx, wy]);
    }
    skyline.push({ x, w: bw, h: bh, lights });
  }

  return dt => {
    const { w, h, dpr } = fit(canvas);
    const base = Math.min(w / 520, h / 480);
    const cur = sim.slots[sim.idx];
    const slow = closeCall(sim);
    view.speed += ((slow ? 0.3 : 1) - view.speed) * ease(dt, 0.01);
    if (slow) view.onSlow();
    let s = base;
    let cx;
    let cy;
    let rate = 0.006;

    if (sim.done) {
      s = base * 1.25;
      cx = sim.loserSlot.x;
      cy = GROUND - (h / s) * 0.18;
    } else if (sim.phase === 'final') {
      const xs = sim.slots.map(sl => sl.x);
      const lo = Math.min(PIVOT.x, ...xs) - 150;
      const hi = Math.max(...xs) + 150;
      s = Math.min(base, w / (hi - lo));
      cx = (lo + hi) / 2;
      cy = GROUND - (h / s) * 0.18;
    } else if (sim.phase === 'fly') {
      const p = cur.doll.torso.position;
      cx = p.x + (w / s) * 0.12;
      if (slow) s = base * 1.4;
      cy = Math.min(p.y + (h / s) * 0.1, GROUND - (h / s) * 0.18);
      rate = 0.012;
    } else {
      cx = PIVOT.x + (w / s) * 0.25;
      cy = GROUND - (h / s) * 0.18;
    }
    if (!cam.s) Object.assign(cam, { x: cx, y: cy, s });
    const k = ease(dt, rate);
    cam.x += (cx - cam.x) * k;
    cam.y += (cy - cam.y) * k;
    cam.s += (s - cam.s) * ease(dt, 0.004);
    const S = cam.s;
    const groundY = h / 2 + (GROUND - cam.y) * S;

    // Sky
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0b0820');
    sky.addColorStop(0.7, '#2a1650');
    sky.addColorStop(1, '#4a1f5e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (const st of stars) {
      const sx = ((st.x * w - cam.x * 0.02 * S) % w + w) % w;
      ctx.fillRect(sx, st.y * h, st.r * dpr, st.r * dpr);
    }

    // Parallax city skyline
    for (const b of skyline) {
      const bx = w / 2 + (b.x - cam.x * 0.4) * S * 0.8;
      const bw = b.w * S * 0.8;
      if (bx + bw < 0 || bx > w) continue;
      const bh = b.h * S * 0.8;
      ctx.fillStyle = '#1a1235';
      ctx.fillRect(bx, groundY - bh, bw, bh);
      ctx.fillStyle = 'rgba(255, 210, 63, .55)';
      for (const [wx, wy] of b.lights) ctx.fillRect(bx + wx * S * 0.8, groundY - bh + wy * S * 0.8, 6 * S * 0.8, 8 * S * 0.8);
    }

    // World
    ctx.setTransform(S, 0, 0, S, w / 2 - cam.x * S, h / 2 - cam.y * S);
    const viewL = cam.x - w / 2 / S - 50;
    const viewR = cam.x + w / 2 / S + 50;

    // The bar, waiting at the far end
    if (BAR_X + 200 > viewL && BAR_X - 200 < viewR) {
      ctx.fillStyle = '#2b1b4f';
      ctx.fillRect(BAR_X - 120, GROUND - 260, 240, 260);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(BAR_X - 30, GROUND - 90, 60, 90);
      ctx.save();
      ctx.shadowColor = '#ff4d8d';
      ctx.shadowBlur = 24;
      ctx.font = '400 64px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff4d8d';
      ctx.fillText('BAR', BAR_X, GROUND - 170);
      ctx.restore();
    }

    const grass = ctx.createLinearGradient(0, GROUND, 0, GROUND + 300);
    grass.addColorStop(0, '#1f6b4a');
    grass.addColorStop(1, '#0c2a22');
    ctx.fillStyle = grass;
    ctx.fillRect(viewL, GROUND, viewR - viewL, 2000);
    ctx.fillStyle = '#34a36f';
    ctx.fillRect(viewL, GROUND, viewR - viewL, 4);

    // Mud pits and boost pads
    for (const z of ZONES) {
      if (z.x2 < viewL || z.x1 > viewR) continue;
      z.flash = Math.max(0, (z.flash || 0) - dt * 0.003);
      const mid = (z.x1 + z.x2) / 2;
      if (z.type === 'mud') {
        ctx.fillStyle = '#4a3222';
        ctx.beginPath();
        ctx.ellipse(mid, GROUND + 2, (z.x2 - z.x1) / 2, 16, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(z.x1, GROUND, z.x2 - z.x1, 14);
        ctx.fillStyle = '#6b4a33';
        for (let i = 0; i < 5; i++) {
          const bx = z.x1 + (z.x2 - z.x1) * (0.15 + i * 0.17);
          const br = 3 + ((sim.t * 0.05 + i * 1.7) % 4);
          ctx.beginPath();
          ctx.arc(bx, GROUND - 4, br, 0, Math.PI * 2);
          ctx.fill();
        }
        tag(ctx, 'MUD', mid, GROUND + 40, 16, '#c69a6d');
      } else if (z.type === 'boost') {
        ctx.save();
        ctx.shadowColor = '#3de0ff';
        ctx.shadowBlur = 16 + z.flash * 30;
        ctx.fillStyle = z.flash ? shade('#3de0ff', z.flash * 0.6) : '#1e8fb0';
        ctx.fillRect(z.x1, GROUND - 6, z.x2 - z.x1, 8);
        ctx.restore();
        ctx.fillStyle = '#bff6ff';
        const off = (sim.t * 1.5) % 30;
        for (let x = z.x1 + off; x < z.x2 - 10; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, GROUND - 5);
          ctx.lineTo(x + 10, GROUND - 2);
          ctx.lineTo(x, GROUND + 1);
          ctx.closePath();
          ctx.fill();
        }
        tag(ctx, 'BOOST', mid, GROUND + 40, 16, '#3de0ff');
      } else if (z.type === 'lake') {
        ctx.fillStyle = '#0d3b66';
        ctx.fillRect(z.x1, WATER_Y, z.x2 - z.x1, GROUND + 60 - WATER_Y);
        ctx.fillStyle = '#34a36f';
        for (const sx of [z.x1, z.x2]) {
          for (let i = -2; i <= 2; i++) ctx.fillRect(sx + i * 9 - 1.5, WATER_Y - 22 - Math.abs(i) * -4, 3, 26 - Math.abs(i) * 4);
        }
      }
    }

    // Boat
    {
      const b = sim.boat.body;
      const { x, y } = b.position;
      if (x + 100 > viewL && x - 100 < viewR) {
        ctx.fillStyle = '#e76f51';
        ctx.beginPath();
        ctx.moveTo(x - BOAT_W / 2 - 10, y - 9);
        ctx.lineTo(x + BOAT_W / 2 + 10, y - 9);
        ctx.lineTo(x + BOAT_W / 2 - 14, y + 14);
        ctx.lineTo(x - BOAT_W / 2 + 14, y + 14);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f4f1ff';
        ctx.fillRect(x - BOAT_W / 2 + 4, y - 2, BOAT_W - 8, 4);
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(x - 2, y - 70, 4, 61);
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(x + 2, y - 70);
        ctx.lineTo(x + 34, y - 58);
        ctx.lineTo(x + 2, y - 46);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Distance markers every 25 ft
    const markSize = clamp(11 * dpr / S, 10, 60);
    for (let d = 250; d < FIELD_END - 300; d += 250) {
      const x = LAUNCH_X + d;
      if (x < viewL || x > viewR) continue;
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillRect(x - 1.5, GROUND, 3, 18);
      tag(ctx, `${d / 10} ft`, x, GROUND + 22 + markSize, markSize, 'rgba(255,255,255,.75)');
    }

    // Danger line: beat it or you're the new Uber orderer
    const danger = sim.done ? null : dangerSlot(sim);
    if (danger) {
      const dx = Math.max(danger.x, LAUNCH_X);
      ctx.fillStyle = 'rgba(255, 77, 109, .22)';
      ctx.fillRect(LAUNCH_X, GROUND, dx - LAUNCH_X, 30);
      ctx.strokeStyle = 'rgba(255, 77, 109, .5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 12]);
      ctx.beginPath();
      ctx.moveTo(dx, GROUND);
      ctx.lineTo(dx, GROUND - 900);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f4f1ff';
      ctx.fillRect(dx - 2, GROUND - 130, 4, 130);
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.moveTo(dx + 2, GROUND - 130);
      ctx.lineTo(dx + 50, GROUND - 115);
      ctx.lineTo(dx + 2, GROUND - 100);
      ctx.closePath();
      ctx.fill();
      const fs = clamp(12 * dpr / S, 10, 60);
      tag(ctx, `🚕 ${short(danger.player.name)} · ${feet(danger.x)} ft`, dx, GROUND - 140, fs, '#ff8fa3');
    }

    for (const b of sim.statics) {
      if (b.bounds.max.x < viewL || b.bounds.min.x > viewR) continue;
      b.flash = Math.max(0, (b.flash || 0) - dt * 0.004);
      const f = b.flash;
      if (b.label === 'mushroom') {
        const { x, y } = b.position;
        ctx.fillStyle = '#f4e9d8';
        ctx.fillRect(x - 12, GROUND - 16, 24, 16);
        ctx.fillStyle = f ? shade('#e63946', f * 0.5) : '#e63946';
        ctx.beginPath();
        ctx.arc(x, y, b.circleRadius * (1 + f * 0.08), Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#fff';
        for (const [dx, dy, r] of [[-22, -18, 6], [4, -34, 7], [24, -14, 5]]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (b.label === 'bumper') {
        const { x, y } = b.position;
        ctx.shadowColor = '#3de0ff';
        ctx.shadowBlur = 14 + f * 24;
        ctx.fillStyle = f ? shade('#3de0ff', f * 0.5) : '#3de0ff';
        ctx.beginPath();
        ctx.arc(x, y, b.circleRadius * (1 + f * 0.15), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.beginPath();
        ctx.arc(x, y, b.circleRadius * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.label === 'tramp') {
        ctx.fillStyle = f ? shade('#b388ff', f * 0.5) : '#b388ff';
        poly(ctx, b);
        ctx.fill();
        ctx.strokeStyle = '#6c4bb8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = -50; i <= 50; i += 25) {
          ctx.moveTo(b.position.x + i, GROUND - 7);
          ctx.lineTo(b.position.x + i, GROUND);
        }
        ctx.stroke();
      }
    }

    // Catapult
    ctx.fillStyle = '#6b4423';
    ctx.beginPath();
    ctx.moveTo(PIVOT.x - 40, GROUND - 14);
    ctx.lineTo(PIVOT.x, PIVOT.y - 6);
    ctx.lineTo(PIVOT.x + 40, GROUND - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(PIVOT.x - 50, GROUND - 22, 100, 10);
    ctx.fillStyle = '#3b2412';
    for (const dx of [-34, 34]) {
      ctx.beginPath();
      ctx.arc(PIVOT.x + dx, GROUND - 12, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    const tip = armTip(sim.armA);
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(PIVOT.x, PIVOT.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = '#3b2412';
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 13, 0, Math.PI * 2);
    ctx.fill();
    if (!sim.done && (sim.phase === 'load' || sim.phase === 'swing')) {
      ctx.fillStyle = cur.player.color;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y - 8, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = textOn(cur.player.color);
      ctx.font = '800 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initial(cur.player.name), tip.x, tip.y - 7.5);
    }

    // Ragdolls
    const labelSize = clamp(12 * dpr / S, 10, 60);
    for (const sl of sim.slots) {
      if (!sl.doll) continue;
      const c = sl.player.color;
      if (sl.trail.length > 1) {
        ctx.strokeStyle = c;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(sl.trail[0].x, sl.trail[0].y);
        for (const p of sl.trail) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = shade(c, -0.15);
      for (const limb of sl.doll.limbs) { poly(ctx, limb); ctx.fill(); }
      ctx.fillStyle = c;
      poly(ctx, sl.doll.torso);
      ctx.fill();
      const hd = sl.doll.head;
      ctx.fillStyle = shade(c, 0.45);
      ctx.beginPath();
      ctx.arc(hd.position.x, hd.position.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#15112b';
      const ca = Math.cos(hd.angle);
      const sa = Math.sin(hd.angle);
      for (const ex of [-3.5, 3.5]) {
        ctx.beginPath();
        ctx.arc(hd.position.x + ex * ca + 2 * sa, hd.position.y + ex * sa - 2 * ca, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const lake = ZONES.find(z => z.type === 'lake');
    if (lake.x2 > viewL && lake.x1 < viewR) {
      ctx.fillStyle = 'rgba(40, 140, 220, .55)';
      ctx.beginPath();
      ctx.moveTo(lake.x1, GROUND + 60);
      for (let x = lake.x1; x <= lake.x2; x += 20) ctx.lineTo(x, WATER_Y + Math.sin(x * 0.03 + sim.t * 0.08) * 3);
      ctx.lineTo(lake.x2, GROUND + 60);
      ctx.closePath();
      ctx.fill();
      tag(ctx, 'LAKE', (lake.x1 + lake.x2) / 2, GROUND + 40, 16, '#8fd3ff');
    }
    for (const sl of sim.slots) {
      if (!sl.doll) continue;
      const hd = sl.doll.head.position;
      tag(ctx, short(sl.player.name), hd.x, hd.y - 16, labelSize);
    }

    // Screen overlays
    if (slow) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(255, 30, 70, 0)');
      vg.addColorStop(1, 'rgba(255, 30, 70, .35)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      if (Math.floor(performance.now() / 250) % 2 === 0) banner(ctx, w, h, dpr, 'CLOSE CALL…', { color: '#ff4d6d', y: 0.3 });
    }
    if (sim.done) {
      banner(ctx, w, h, dpr, `${short(sim.loser.name)}: ${feet(sim.loserSlot.x)} ft`, { color: sim.loser.color, sub: 'Shortest fling!', y: 0.3 });
    } else if (sim.phase === 'load' || sim.phase === 'swing') {
      const landed = sim.lastLanded;
      const final = sim.idx === sim.slots.length - 1;
      if (landed && sim.t - landed.t < VERDICT_STEPS) {
        const { name } = landed.slot.player;
        const ft = feet(landed.slot.x);
        if (landed.verdict === 'safe') banner(ctx, w, h, dpr, `SAFE! ${ft} ft`, { color: '#7ae582', sub: `${name} clears the line`, y: 0.3 });
        else if (landed.verdict === 'shortest') banner(ctx, w, h, dpr, 'NEW SHORTEST!', { color: '#ff4d6d', sub: `${ft} ft. ${name} is on Uber duty… for now`, y: 0.3 });
        else banner(ctx, w, h, dpr, `${ft} ft`, { color: landed.slot.player.color, sub: `${name} sets the mark`, y: 0.3 });
      } else if (final && danger) {
        banner(ctx, w, h, dpr, 'FINAL FLING', { color: cur.player.color, sub: `${cur.player.name} must beat ${feet(danger.x)} ft`, y: 0.3 });
      } else {
        banner(ctx, w, h, dpr, `${short(cur.player.name)} is up`, { color: cur.player.color, sub: danger ? `Beat ${feet(danger.x)} ft to stay safe` : 'First fling sets the mark', y: 0.3 });
      }
    }
  };
}

function hudUpdater(hud, sim) {
  return () => {
    const launched = sim.slots.filter(s => s.doll).sort((a, b) => b.x - a.x);
    const waiting = sim.slots.filter(s => !s.doll);
    const current = sim.phase === 'fly' ? sim.slots[sim.idx] : null;
    const danger = sim.done ? sim.loserSlot : dangerSlot(sim);
    const rows = launched.map(s => {
      const icon = s === current ? '🚀 ' : s === danger ? '🚕 ' : '';
      return `<div class="hud-row${s === danger ? ' hot' : ''}" style="--c:${s.player.color}"><span class="d"></span><span class="n">${icon}${esc(s.player.name)}</span><span class="v">${feet(s.x)} ft</span></div>`;
    });
    const wait = waiting.map(s =>
      `<div class="hud-row dim" style="--c:${s.player.color}"><span class="d"></span><span class="n">${esc(s.player.name)}</span><span class="v">…</span></div>`);
    setHud(hud, `<div class="hud-box"><div class="hud-title">Distance</div>${rows.join('')}${wait.join('')}</div>`);
  };
}

export default {
  id: 'fling',
  title: 'Human Catapult',
  emoji: '🪃',
  blurb: 'Everyone gets launched across the field. Shortest fling orders.',
  simulate: players => simulateHeadless(createSim, players),
  play({ canvas, hud, players, signal, sfx }) {
    const sim = createSim(players);
    const view = { speed: 1, onSlow: throttle(sfx.drum, 70) };
    const draw = renderer(canvas, sim, view);
    const updateHud = hudUpdater(hud, sim);
    const boing = throttle(sfx.boing, 100);
    const thud = throttle(sfx.thud, 120);
    return runSim(signal, sim, dt => { draw(dt); updateHud(); }, e => {
      if (e.type === 'creak') sfx.creak();
      else if (e.type === 'launch') sfx.whoosh();
      else if (e.type === 'boing') boing();
      else if (e.type === 'thud') thud();
      else if (e.type === 'land') (e.verdict === 'shortest' ? sfx.buzz : e.verdict === 'safe' ? sfx.fanfare : sfx.ding)();
      else if (e.type === 'boost') sfx.go();
      else if (e.type === 'mud') thud();
      else if (e.type === 'splash') sfx.whoosh();
      else if (e.type === 'boat') sfx.ding(4);
      else if (e.type === 'last') sfx.womp();
    }, 2400, () => view.speed);
  },
};
