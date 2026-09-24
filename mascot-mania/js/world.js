import * as THREE from 'three';

export const ARENA_SPACING = 72;
export const ARENA_RADIUS = 16;
export const APPROACH = 30; // how far before an arena's center each stage starts

export function arenaCenter(i) {
  return new THREE.Vector3(0, 0, -i * ARENA_SPACING);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Cover pieces. Colliders are axis-aligned boxes; `h` is how tall the cover is,
// which decides whether it stops projectiles, roars and shockwaves.
const BARRIERS = {
  hay: { w: 2.8, d: 1.4, h: 1.5 },
  roundHay: { w: 1.9, d: 1.9, h: 1.8 },
  fence: { w: 4.4, d: 0.4, h: 1.5 },
  tires: { w: 1.8, d: 1.8, h: 1.35 },
  crate: { w: 1.7, d: 1.7, h: 1.7 },
};

const MATS = {
  straw: new THREE.MeshStandardMaterial({ color: 0xd8b350, roughness: 1 }),
  strawDark: new THREE.MeshStandardMaterial({ color: 0xb08a2e, roughness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x5e3b1a, roughness: 0.9 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x1f1f22, roughness: 0.8 }),
  red: new THREE.MeshStandardMaterial({ color: 0xd00000, roughness: 0.6 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xf5f1e7, roughness: 0.6 }),
};

function shadow(m) {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildBarrierMesh(type) {
  const g = new THREE.Group();
  const s = BARRIERS[type];
  if (type === 'hay') {
    const b = shadow(new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), MATS.straw));
    b.position.y = s.h / 2;
    g.add(b);
    for (const x of [-0.7, 0.7]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, s.h + 0.02, s.d + 0.02), MATS.strawDark);
      t.position.set(x, s.h / 2, 0);
      g.add(t);
    }
  } else if (type === 'roundHay') {
    const b = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.9, 20), MATS.straw));
    b.rotation.z = Math.PI / 2;
    b.position.y = 0.95;
    g.add(b);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.05, 6, 24), MATS.strawDark);
    ring.rotation.y = Math.PI / 2;
    ring.position.y = 0.95;
    g.add(ring);
  } else if (type === 'fence') {
    for (let i = 0; i < 4; i++) {
      const p = shadow(new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.34, 0.14), MATS.wood));
      p.position.y = 0.22 + i * 0.36;
      g.add(p);
    }
    for (const x of [-s.w / 2 + 0.1, 0, s.w / 2 - 0.1]) {
      const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.2, s.h + 0.15, 0.24), MATS.woodDark));
      post.position.set(x, (s.h + 0.15) / 2, 0);
      g.add(post);
    }
  } else if (type === 'tires') {
    const geo = new THREE.TorusGeometry(0.62, 0.28, 10, 20);
    for (let i = 0; i < 2; i++) {
      const t = shadow(new THREE.Mesh(geo, MATS.rubber));
      t.rotation.x = Math.PI / 2;
      t.position.y = 0.3 + i * 0.58;
      g.add(t);
    }
  } else if (type === 'crate') {
    const b = shadow(new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), MATS.wood));
    b.position.y = s.h / 2;
    g.add(b);
    const band = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.04, 0.18, s.d + 0.04), MATS.woodDark);
    band.position.y = s.h / 2;
    g.add(band);
  }
  return g;
}

export class World {
  constructor(scene, opponents) {
    this.scene = scene;
    this.barriers = [];
    this.arenas = [];
    this.count = opponents.length;

    const sky = 0x9fd3f2;
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(sky, 70, 170);

    scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x4b6b2a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    this.sun = sun;

    this.buildGround();
    this.buildCorn();
    this.buildStartArch();
    opponents.forEach((o, i) => this.buildArena(i, o));
    this.buildPathCover();
  }

  get length() { return this.count * ARENA_SPACING + 160; }

  buildGround() {
    const len = this.length;
    const tex = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#4f9437';
      ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = '#5aa23f';
      ctx.fillRect(0, h / 2, w, h / 2);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.repeat.set(1, len / 16);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, len),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -(this.count * ARENA_SPACING) / 2 + 40;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Dirt path running up the middle of the field.
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(7, len),
      new THREE.MeshStandardMaterial({ color: 0x9c7a4a, roughness: 1, transparent: true, opacity: 0.55 })
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, ground.position.z);
    path.receiveShadow = true;
    this.scene.add(path);
  }

  buildCorn() {
    const rows = 6;
    const step = 1.5;
    const zStart = 80;
    const zEnd = -this.count * ARENA_SPACING - 60;
    const perRow = Math.floor((zStart - zEnd) / step);
    const geo = new THREE.ConeGeometry(0.4, 2.8, 5);
    geo.translate(0, 1.4, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), rows * 2 * perRow);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    const rand = mulberry32(7);
    let n = 0;
    for (const side of [-1, 1]) {
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < perRow; k++) {
          const x = side * (27 + r * 1.8 + rand() * 0.5);
          const z = zStart - k * step + rand() * 0.6;
          const s = 0.8 + rand() * 0.5;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
          m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
          mesh.setMatrixAt(n, m);
          col.setHSL(0.2 + rand() * 0.05, 0.55, 0.3 + rand() * 0.12);
          mesh.setColorAt(n, col);
          n++;
        }
      }
    }
    this.scene.add(mesh);
  }

  buildStartArch() {
    const z = APPROACH - 9;
    const g = new THREE.Group();
    for (const x of [-5, 5]) {
      const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 12), MATS.red));
      post.position.set(x, 3, 0);
      g.add(post);
    }
    const tex = canvasTexture(1024, 192, (ctx, w, h) => {
      ctx.fillStyle = '#d00000';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f5f1e7';
      ctx.fillRect(0, 12, w, 6);
      ctx.fillRect(0, h - 18, w, 6);
      ctx.font = 'bold 110px Bungee, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('MASCOT MANIA', w / 2, h / 2 + 6);
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 2), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.y = 5.2;
    g.add(banner);
    g.position.z = z;
    this.scene.add(g);
  }

  buildArena(i, opp) {
    const c = arenaCenter(i);
    const R = ARENA_RADIUS;
    const group = new THREE.Group();
    group.position.copy(c);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(R - 0.35, R, 72),
      new THREE.MeshBasicMaterial({ color: opp.colors.primary })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);

    const logo = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = hex(opp.colors.primary);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = hex(opp.colors.secondary);
      ctx.stroke();
      ctx.fillStyle = hex(opp.colors.secondary);
      ctx.font = `bold ${opp.abbr.length > 3 ? 64 : 92}px Bungee, Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opp.abbr, w / 2, h / 2 + 4);
    });
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 48),
      new THREE.MeshStandardMaterial({ map: logo, transparent: true, opacity: 0.85, roughness: 1 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.025;
    disc.receiveShadow = true;
    group.add(disc);

    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8);
    const capGeo = new THREE.SphereGeometry(0.2, 10, 8);
    const capMat = new THREE.MeshStandardMaterial({ color: opp.colors.primary });
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const x = Math.sin(a) * (R + 0.7);
      const z = Math.cos(a) * (R + 0.7);
      if (Math.abs(x) < 3.5) continue; // gaps where the path enters and leaves
      const post = shadow(new THREE.Mesh(postGeo, MATS.cream));
      post.position.set(x, 0.6, z);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(x, 1.25, z);
      group.add(post, cap);
    }

    // Glowing wall that closes the arena during a fight.
    const wallMat = new THREE.MeshBasicMaterial({
      color: opp.colors.primary, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.7, R + 0.7, 3, 72, 1, true), wallMat);
    wall.position.y = 1.5;
    wall.visible = false;
    group.add(wall);

    this.scene.add(group);
    this.arenas.push({ center: c, wall, active: false });

    // Four pieces of cover on the diagonals, leaving the lane between Herbie and the mascot open.
    const rand = mulberry32(1000 + i * 17);
    const types = Object.keys(BARRIERS);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2 + (rand() - 0.5) * 0.5;
      const r = 6.5 + rand() * 3.5;
      const type = types[Math.floor(rand() * types.length)];
      this.addBarrier(type, c.x + Math.sin(a) * r, c.z + Math.cos(a) * r, rand() < 0.5);
    }
  }

  buildPathCover() {
    const rand = mulberry32(99);
    const types = Object.keys(BARRIERS);
    for (let i = -1; i < this.count - 1; i++) {
      const zFrom = i < 0 ? APPROACH - 4 : arenaCenter(i).z - ARENA_RADIUS - 6;
      const zTo = arenaCenter(i + 1).z + ARENA_RADIUS + 6;
      const n = i < 0 ? 1 : 3;
      for (let k = 0; k < n; k++) {
        const z = zFrom + (zTo - zFrom) * ((k + 0.5) / n);
        const side = rand() < 0.5 ? -1 : 1;
        const x = side * (5 + rand() * 11);
        this.addBarrier(types[Math.floor(rand() * types.length)], x, z, rand() < 0.5);
      }
    }
  }

  addBarrier(type, x, z, turned) {
    const s = BARRIERS[type];
    const mesh = buildBarrierMesh(type);
    mesh.position.set(x, 0, z);
    if (turned) mesh.rotation.y = Math.PI / 2;
    this.scene.add(mesh);
    const hw = (turned ? s.d : s.w) / 2;
    const hd = (turned ? s.w : s.d) / 2;
    this.barriers.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, h: s.h, x, z, mesh });
  }

  setArenaActive(i, active) {
    const a = this.arenas[i];
    if (!a) return;
    a.active = active;
    a.wall.visible = true;
  }

  update(dt, focus) {
    this.sun.position.set(focus.x + 16, 30, focus.z + 14);
    this.sun.target.position.set(focus.x, 0, focus.z);
    for (const a of this.arenas) {
      if (!a.wall.visible) continue;
      const target = a.active ? 0.22 : 0;
      const m = a.wall.material;
      m.opacity += (target - m.opacity) * Math.min(1, dt * 5);
      if (!a.active && m.opacity < 0.01) a.wall.visible = false;
    }
  }

  // Push a circle (x/z of `pos`, radius r) out of every barrier. Returns true if it touched one.
  resolveCircle(pos, r) {
    let touched = false;
    for (const b of this.barriers) {
      if (pos.x < b.minX - r || pos.x > b.maxX + r || pos.z < b.minZ - r || pos.z > b.maxZ + r) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      touched = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d);
        pos.z += (dz / d) * (r - d);
      } else {
        // Center is inside the box: leave by the shortest side.
        const pens = [pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z];
        const k = pens.indexOf(Math.min(...pens));
        if (k === 0) pos.x = b.minX - r;
        else if (k === 1) pos.x = b.maxX + r;
        else if (k === 2) pos.z = b.minZ - r;
        else pos.z = b.maxZ + r;
      }
    }
    return touched;
  }

  overlapsCircle(pos, r) {
    for (const b of this.barriers) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  pointBlocked(p) {
    for (const b of this.barriers) {
      if (p.y < b.h && p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) return true;
    }
    return false;
  }

  // True if a barrier at least `minH` tall sits on the ground between a and b.
  segmentBlocked(a, b, minH = 1.1) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    for (const box of this.barriers) {
      if (box.h < minH) continue;
      let tmin = 0;
      let tmax = 1;
      let hit = true;
      for (const [o, d, lo, hi] of [[a.x, dx, box.minX + 0.05, box.maxX - 0.05], [a.z, dz, box.minZ + 0.05, box.maxZ - 0.05]]) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) { hit = false; break; }
        } else {
          let t1 = (lo - o) / d;
          let t2 = (hi - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { hit = false; break; }
        }
      }
      if (hit) return true;
    }
    return false;
  }
}
