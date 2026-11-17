/* =====================================================
   AVATAR R6 CLASSIC
   Items attach to body parts and follow their movement.
   The owner's avatar packs can also change the body shape.
   ===================================================== */
const D2R = Math.PI / 180;
const JOINTS = ['la', 'ra', 'll', 'rl', 'torso', 'head'];
const ANIM_STATES = ['idle', 'walk', 'jump', 'fall', 'climb', 'swim', 'sit', 'lay'];
const ATTACH = ['', 'head', 'torso', 'la', 'ra', 'll', 'rl'];
const ATTACH_ORIGIN = { '': [0, 0, 0], head: [0, 4, 0], torso: [0, 2, 0], la: [-1.5, 4, 0], ra: [1.5, 4, 0], ll: [-0.5, 2, 0], rl: [0.5, 2, 0] };

/* Animation format (degrees): joint -> axis -> [base, amplitude, phase]
   angle = base + amplitude * sin(time * f + phase). s = 1 scales speed with movement. */
const DEFAULT_PACK = {
  anims: {
    idle:  { f: 0, j: { la: { z: [-3, 0, 0] }, ra: { z: [3, 0, 0] } } },
    walk:  { f: 10, s: 1, j: { la: { x: [0, 40, 0] }, ra: { x: [0, 40, 3.14] }, ll: { x: [0, 40, 3.14] }, rl: { x: [0, 40, 0] } } },
    jump:  { f: 0, j: { la: { x: [-150, 0, 0] }, ra: { x: [-150, 0, 0] }, ll: { x: [-8, 0, 0] }, rl: { x: [8, 0, 0] } } },
    fall:  { f: 0, j: { la: { x: [-30, 0, 0], z: [-40, 0, 0] }, ra: { x: [-30, 0, 0], z: [40, 0, 0] }, ll: { x: [-10, 0, 0] }, rl: { x: [10, 0, 0] } } },
    climb: { f: 8, s: 1, j: { la: { x: [-150, 25, 0] }, ra: { x: [-150, 25, 3.14] }, ll: { x: [-20, 25, 3.14] }, rl: { x: [-20, 25, 0] } } },
    swim:  { f: 7, j: { la: { x: [-100, 30, 0] }, ra: { x: [-100, 30, 3.14] }, ll: { x: [0, 25, 0] }, rl: { x: [0, 25, 3.14] } } },
    sit:   { f: 0, j: { ll: { x: [-90, 0, 0] }, rl: { x: [-90, 0, 0] }, la: { x: [-20, 0, 0] }, ra: { x: [-20, 0, 0] } } },
    lay:   { f: 0, j: { la: { z: [-3, 0, 0] }, ra: { z: [3, 0, 0] } } }
  }
};

/* ---------- faces (official faces are made by the owner) ---------- */
const FACE_EYES = ['oval', 'round', 'happy', 'wink', 'angry', 'big'];
const FACE_MOUTHS = ['smile', 'grin', 'open', 'flat', 'frown', 'tongue'];
const DEF_FACE = { eye: 'oval', mouth: 'smile', brow: 0, blush: 0, ink: '#000000' };

function faceTexture(skin, spec) {
  spec = spec || DEF_FACE;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d'), ink = spec.ink || '#000000';
  x.fillStyle = skin; x.fillRect(0, 0, 256, 256);
  x.fillStyle = ink; x.strokeStyle = ink; x.lineCap = 'round'; x.lineWidth = 12;
  const oval = (cx, rx, ry) => { x.beginPath(); x.ellipse(cx, 104, rx, ry, 0, 0, Math.PI * 2); x.fill(); };
  if (spec.blush) {
    x.fillStyle = 'rgba(255,100,120,.45)';
    x.beginPath(); x.ellipse(58, 142, 22, 12, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(198, 142, 22, 12, 0, 0, 7); x.fill();
    x.fillStyle = ink;
  }
  switch (spec.eye) {
    case 'round': oval(92, 16, 16); oval(164, 16, 16); break;
    case 'big': oval(92, 18, 32); oval(164, 18, 32); break;
    case 'happy':
      x.lineWidth = 10;
      x.beginPath(); x.arc(92, 118, 22, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
      x.beginPath(); x.arc(164, 118, 22, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
      x.lineWidth = 12; break;
    case 'wink':
      oval(92, 13, 26);
      x.lineWidth = 10; x.beginPath(); x.moveTo(144, 104); x.lineTo(184, 104); x.stroke(); x.lineWidth = 12; break;
    case 'angry':
      oval(92, 13, 24); oval(164, 13, 24);
      x.lineWidth = 9;
      x.beginPath(); x.moveTo(68, 62); x.lineTo(112, 80); x.stroke();
      x.beginPath(); x.moveTo(188, 62); x.lineTo(144, 80); x.stroke();
      x.lineWidth = 12; break;
    default: oval(92, 13, 26); oval(164, 13, 26);
  }
  if (spec.brow && spec.eye !== 'angry') {
    x.lineWidth = 9;
    x.beginPath(); x.moveTo(72, 62); x.lineTo(112, 62); x.stroke();
    x.beginPath(); x.moveTo(144, 62); x.lineTo(184, 62); x.stroke();
    x.lineWidth = 12;
  }
  switch (spec.mouth) {
    case 'grin':
      x.fillStyle = '#fff'; x.beginPath(); x.arc(128, 128, 52, 0, Math.PI); x.closePath(); x.fill();
      x.lineWidth = 8; x.stroke(); x.fillStyle = ink; break;
    case 'open': x.beginPath(); x.ellipse(128, 168, 22, 28, 0, 0, Math.PI * 2); x.fill(); break;
    case 'flat': x.beginPath(); x.moveTo(94, 170); x.lineTo(162, 170); x.stroke(); break;
    case 'frown': x.beginPath(); x.arc(128, 206, 46, Math.PI * 1.2, Math.PI * 1.8); x.stroke(); break;
    case 'tongue':
      x.fillStyle = '#e0556a'; x.beginPath(); x.ellipse(128, 172, 16, 22, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(128, 120, 58, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke(); break;
    default: x.beginPath(); x.arc(128, 120, 58, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.font = 'bold 54px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(text, 256, 48, 480);
  x.fillStyle = '#fff'; x.fillText(text, 256, 48, 480);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sp.scale.set(8, 1.5, 1); sp.position.y = 6.6;
  return sp;
}

function makeBubble(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,.96)';
  if (x.roundRect) { x.beginPath(); x.roundRect(6, 6, 500, 100, 26); x.fill(); }
  else x.fillRect(6, 6, 500, 100);
  x.fillStyle = '#111'; x.font = 'bold 44px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 56, 470);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sp.scale.set(9, 2.25, 1); sp.position.y = 8.4;
  return sp;
}

function makeAvatar(col, items, pack, face) {
  const c = Object.assign({}, DEFAULT_COLORS, col || {});
  const M = {};
  Object.keys(DEFAULT_COLORS).forEach(k => { M[k] = new THREE.MeshLambertMaterial({ color: c[k] }); });
  let curFace = face || DEF_FACE, curHead = c.head;
  const faceM = new THREE.MeshLambertMaterial({ map: faceTexture(curHead, curFace) });
  const mesh = (w, h, d, m, part) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.userData.part = part; return o;
  };

  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const upper = new THREE.Group(); upper.position.y = 2; rig.add(upper);
  const tg = new THREE.Group(); upper.add(tg);               // torso group (scaled by body shape)
  const N = { '': rig, torso: upper }, IN = { '': rig, torso: tg }, parts = {}, piv = {};

  parts.torso = mesh(2, 2, 1, M.torso, 'torso'); parts.torso.position.y = 1; tg.add(parts.torso);
  const headP = new THREE.Group(); headP.position.y = 2; upper.add(headP); N.head = headP; IN.head = headP; piv.head = headP;
  parts.head = mesh(1.2, 1.2, 1.2, [M.head, M.head, M.head, M.head, faceM, M.head], 'head');
  parts.head.position.y = 0.6; headP.add(parts.head);

  const limb = (key, x, y, par) => {
    const pv = new THREE.Group(); pv.position.set(x, y, 0); par.add(pv);
    const m = mesh(1, 2, 1, M[key], key); m.position.y = -1; pv.add(m);
    parts[key] = m; N[key] = pv; IN[key] = pv; piv[key] = pv;
  };
  limb('la', -1.5, 2, upper); limb('ra', 1.5, 2, upper); limb('ll', -0.5, 2, rig); limb('rl', 0.5, 2, rig);

  // accessories: each part follows the body part it is attached to
  const itemMeshes = [];
  (items || []).forEach(it => (it.parts || []).forEach(p => {
    const key = ATTACH.includes(p.attach) ? p.attach : '', o = ATTACH_ORIGIN[key];
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), new THREE.MeshLambertMaterial({ color: p.color }));
    m.position.set(p.x - o[0], p.y - o[1], p.z - o[2]);
    IN[key].add(m); itemMeshes.push(m);
  }));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // body shape from the animation pack (scale per body part)
  const applyBody = b => {
    const one = [1, 1, 1];
    const B = Object.assign({ head: one, torso: one, la: one, ra: one, ll: one, rl: one }, b || {});
    const t = B.torso, hip = 2 * Math.max(B.ll[1], B.rl[1]);
    upper.position.y = hip; tg.scale.set(t[0], t[1], t[2]);
    headP.position.y = 2 * t[1]; headP.scale.set(B.head[0], B.head[1], B.head[2]);
    piv.la.position.set(-(t[0] + B.la[0] * 0.5), 2 * t[1], 0); piv.la.scale.set(B.la[0], B.la[1], B.la[2]);
    piv.ra.position.set(t[0] + B.ra[0] * 0.5, 2 * t[1], 0); piv.ra.scale.set(B.ra[0], B.ra[1], B.ra[2]);
    piv.ll.position.set(-0.5 * t[0], hip, 0); piv.ll.scale.set(B.ll[0], B.ll[1], B.ll[2]);
    piv.rl.position.set(0.5 * t[0], hip, 0); piv.rl.scale.set(B.rl[0], B.rl[1], B.rl[2]);
  };

  let PK = pack || DEFAULT_PACK, ph = 0, bob = 0, holding = null;
  applyBody(PK.body);
  const cur = {}; JOINTS.forEach(j => { cur[j] = [0, 0, 0]; });
  const redraw = () => { if (faceM.map) faceM.map.dispose(); faceM.map = faceTexture(curHead, curFace); faceM.needsUpdate = true; };

  return {
    g, parts, itemMeshes,
    setPack(p) { PK = p || DEFAULT_PACK; applyBody(PK.body); },
    setFace(f) { curFace = f || DEF_FACE; redraw(); },
    // tool in the right hand
    setHold(grp) {
      if (holding) N.ra.remove(holding);
      holding = grp || null;
      if (holding) { holding.position.set(0, -2.1, 0.2); holding.rotation.x = Math.PI / 2; N.ra.add(holding); }
    },
    setColors(n) {
      Object.keys(DEFAULT_COLORS).forEach(k => { if (n[k]) M[k].color.set(n[k]); });
      curHead = n.head || curHead; redraw();
    },
    // state: idle | walk | jump | fall | climb | swim | sit | lay. sp = movement speed 0..1.3
    anim(t, state, dt, sp) {
      dt = dt || 0.016;
      const A = (PK.anims && PK.anims[state]) || DEFAULT_PACK.anims[state] || {};
      ph += (A.f || 0) * (A.s ? clamp(sp == null ? 1 : sp, 0, 1.3) : 1) * dt;
      if (ph > 6283) ph = 0;
      const k = 1 - Math.exp(-dt * 16);
      const armUp = holding && state !== 'climb' && state !== 'swim' && state !== 'lay';
      JOINTS.forEach(j => {
        const d = (A.j && A.j[j]) || {}, cj = cur[j];
        for (let i = 0; i < 3; i++) {
          const v = d['xyz'[i]];
          let tg2 = v ? (v[0] + v[1] * Math.sin(ph + v[2])) * D2R : 0;
          if (armUp && j === 'ra' && i === 0) tg2 = -90 * D2R;
          cj[i] += (tg2 - cj[i]) * k;
        }
        N[j].rotation.set(cj[0], cj[1], cj[2]);
      });
      bob += ((A.bob || 0) * Math.abs(Math.sin(ph)) - bob) * k;
      rig.position.y = bob;
    }
  };
}

/* Death effect: every body part and accessory part becomes a loose brick */
const Burst = {
  list: [],
  start(av, scene, vx, vz) {
    this.clear(scene);
    av.g.updateMatrixWorld(true);
    Object.values(av.parts).concat(av.itemMeshes).forEach(o => {
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      o.matrixWorld.decompose(pos, q, sc);
      const m = new THREE.Mesh(o.geometry, o.material);
      m.position.copy(pos); m.quaternion.copy(q); m.scale.copy(sc); m.castShadow = true;
      scene.add(m);
      const gp = o.geometry.parameters || {}, r = Math.max(gp.width || 1, gp.height || 1, gp.depth || 1) * 0.35;
      const a = Math.random() * 6.283, s = 6 + Math.random() * 12;
      this.list.push({
        m, r,
        v: new THREE.Vector3(Math.cos(a) * s + (vx || 0) * 0.5, 18 + Math.random() * 22, Math.sin(a) * s + (vz || 0) * 0.5),
        w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14)
      });
    });
  },
  step(dt, groundAt) {
    if (!this.list.length) return;
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    this.list.forEach(b => {
      b.v.y -= 100 * dt;
      b.m.position.addScaledVector(b.v, dt);
      const gy = groundAt(b.m.position.x, b.m.position.y, b.m.position.z);
      if (b.m.position.y - b.r < gy) {
        b.m.position.y = gy + b.r;
        if (b.v.y < 0) b.v.y = -b.v.y * 0.35;
        if (b.v.y < 4) b.v.y = 0;
        b.v.x *= 0.8; b.v.z *= 0.8; b.w.multiplyScalar(0.8);
      }
      e.set(b.w.x * dt, b.w.y * dt, b.w.z * dt); q.setFromEuler(e);
      b.m.quaternion.premultiply(q);
    });
  },
  clear(scene) { this.list.forEach(b => scene.remove(b.m)); this.list = []; }
};

/* Shop thumbnails: one shared hidden renderer, cached per item */
const Thumb = {
  cache: {},
  get(item) {
    if (this.cache[item.id]) return this.cache[item.id];
    if (!this.r) {
      const c = document.createElement('canvas');
      this.r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.r.setPixelRatio(1); this.r.setSize(160, 200);
    }
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.5); dl.position.set(5, 10, 8); s.add(dl);
    const cam = new THREE.PerspectiveCamera(40, 0.8, 0.1, 100);
    cam.position.set(0, 3, 13); cam.lookAt(0, 2.8, 0);
    const av = makeAvatar(DEFAULT_COLORS, [item]); s.add(av.g);
    this.r.render(s, cam);
    return this.cache[item.id] = this.r.domElement.toDataURL('image/png');
  }
};

/* Rotating avatar preview. Tap a body part to select it. */
const AvatarView = {
  run: false, outline: null, state: 'idle',
  start(canvas, col, items, onPick, pack, face) {
    this.stop();
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(PIX());
    r.setSize(240, 300);
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.8));
    const dl = new THREE.DirectionalLight(0xffffff, 0.5); dl.position.set(5, 10, 8); s.add(dl);
    const cam = this.cam = new THREE.PerspectiveCamera(45, 240 / 300, 0.1, 100);
    cam.position.set(0, 3, 12); cam.lookAt(0, 2.8, 0);
    this.cv = canvas; this.onPick = onPick; this.rc = new THREE.Raycaster(); this.state = 'idle';
    this.av = makeAvatar(col, items, pack, face); s.add(this.av.g);

    let pd = null, last = 0;
    canvas.onpointerdown = e => { pd = { x: e.clientX, y: e.clientY }; };
    canvas.onpointerup = e => {
      if (!pd || Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 8) return;
      this.pick(e);
    };

    this.run = true;
    const loop = t => {
      if (!this.run) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      this.av.g.rotation.y = t / 1500;
      this.av.anim(t / 1000, this.state, dt, 1);
      r.render(s, cam);
    };
    requestAnimationFrame(loop);
  },
  pick(e) {
    if (!this.onPick) return;
    const b = this.cv.getBoundingClientRect();
    this.rc.setFromCamera(new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), this.cam);
    const h = this.rc.intersectObject(this.av.g, true).find(x => x.object.userData.part);
    if (h) this.onPick(h.object.userData.part);
  },
  select(part) {
    if (this.outline && this.outline.parent) this.outline.parent.remove(this.outline);
    this.outline = null;
    const m = this.av && this.av.parts[part];
    if (!m) return;
    const o = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x0d99ff, depthTest: false }));
    o.scale.setScalar(1.04); o.renderOrder = 10;
    m.add(o); this.outline = o;
  },
  stop() {
    this.run = false;
    if (this.cv) { this.cv.onpointerdown = null; this.cv.onpointerup = null; this.cv = null; }
    if (this.r) { this.r.dispose(); this.r.forceContextLoss(); this.r = null; }
    this.outline = null;
  }
};