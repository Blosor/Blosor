/* =====================================================
   RENDER HELPERS, SHARED RENDERER, ENVIRONMENT, MATERIALS
   ===================================================== */
const PIX = () => Math.min(window.devicePixelRatio || 1, 1.5);
const SHADOW = () => (Math.min(innerWidth, innerHeight) >= 700 ? 2048 : 1024);

/* One WebGL renderer shared by Studio and Game. */
const Gfx = {
  r: null, lost: false,
  init() {
    if (this.r) return this.r;
    const st = document.createElement('style');
    st.textContent = '#gameCanvas canvas,#stCanvas canvas{width:100%;height:100%;display:block;touch-action:none}';
    document.head.appendChild(st);
    const cv = document.createElement('canvas');
    let r;
    try { r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' }); }
    catch (e) { r = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: false }); }
    r.setPixelRatio(PIX());
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); Gfx.lost = true; toast('Graphics interrupted, restoring...'); });
    r.domElement.addEventListener('webglcontextrestored', () => { Gfx.lost = false; toast('Graphics restored'); });
    return this.r = r;
  },
  mount(host) {
    const r = this.init(), cv = r.domElement;
    if (cv.parentNode !== host) host.insertBefore(cv, host.firstChild);
    return r;
  },
  size(host) {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    this.r.setSize(w, h, false);
    return [w, h];
  }
};

function skyTexture(top, bot) {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top || '#3d7fd6'); g.addColorStop(1, bot || '#bfe3ff');
  x.fillStyle = g; x.fillRect(0, 0, 2, 256);
  return new THREE.CanvasTexture(c);
}

/* Lighting / sky settings of a map */
const DEF_ENV = { time: 13, bright: 1, skyTop: '#3d7fd6', skyBot: '#bfe3ff', fog: 450, shadows: true };
const hexOk = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) ? v : d;
const Env = {
  // only the keys that are present and valid (used for script / network input)
  part(e) {
    const o = {};
    if (!e || typeof e !== 'object') return o;
    if (e.time !== undefined) o.time = num(e.time, 0, 24, 13);
    if (e.bright !== undefined) o.bright = num(e.bright, 0.1, 2, 1);
    if (e.skyTop !== undefined) o.skyTop = hexOk(e.skyTop, DEF_ENV.skyTop);
    if (e.skyBot !== undefined) o.skyBot = hexOk(e.skyBot, DEF_ENV.skyBot);
    if (e.fog !== undefined) o.fog = num(e.fog, 60, 3000, 450);
    if (e.shadows !== undefined) o.shadows = !!e.shadows;
    return o;
  },
  clean(e) { return Object.assign({}, DEF_ENV, this.part(e)); },
  day(env) { return Math.max(0, Math.sin((env.time - 6) / 12 * Math.PI)); },
  sunOff(env) { const a = (env.time - 6) / 12 * Math.PI; return [Math.cos(a) * 70, 25 + Math.max(0, Math.sin(a)) * 85, 40]; },
  apply(scene, dl, env) {
    const d = this.day(env), night = new THREE.Color('#0a0e1f');
    const t = new THREE.Color(env.skyTop).lerp(night, (1 - d) * 0.88);
    const b = new THREE.Color(env.skyBot).lerp(night, (1 - d) * 0.88);
    if (scene.background && scene.background.dispose) scene.background.dispose();
    scene.background = skyTexture(t.getStyle(), b.getStyle());
    scene.fog = new THREE.Fog(b, env.fog * 0.3, env.fog);
    dl.intensity = 0.55 * env.bright * (0.08 + 0.92 * d);
    dl.castShadow = env.shadows && d > 0.02;
    if (dl.userData.hemi) dl.userData.hemi.intensity = 0.62 * env.bright * (0.3 + 0.7 * d);
  }
};

function addLights(s) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b0b0, 0.62);
  s.add(hemi);
  const dl = new THREE.DirectionalLight(0xffffff, 0.55);
  dl.castShadow = true;
  dl.shadow.mapSize.set(SHADOW(), SHADOW());
  const c = dl.shadow.camera;
  c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 400;
  dl.shadow.bias = -0.0004; dl.shadow.normalBias = 0.04;
  dl.userData.hemi = hemi;
  s.add(dl); s.add(dl.target);
  return dl;
}

const Tex = {
  _s: null, _l: null,
  studs() {
    if (this._s) return this._s;
    const S = 256, c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 3; x.strokeRect(0, 0, S, S);
    x.fillStyle = 'rgba(0,0,0,0.28)';
    x.beginPath(); x.arc(S / 2 + 7, S / 2 + 9, 70, 0, Math.PI * 2); x.fill();
    const g = x.createRadialGradient(S / 2 - 20, S / 2 - 24, 8, S / 2, S / 2, 72);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d2d2d2');
    x.fillStyle = g;
    x.beginPath(); x.arc(S / 2, S / 2, 66, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 4; x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return this._s = t;
  },
  ladder() {
    if (this._l) return this._l;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = '#fff';
    x.fillRect(2, 0, 9, 64); x.fillRect(53, 0, 9, 64); x.fillRect(2, 24, 60, 12);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return this._l = t;
  }
};

const Mats = {
  c: {}, fl: {},
  water: new THREE.MeshLambertMaterial({ color: 0x2e86de, transparent: true, opacity: 0.55, depthWrite: false }),
  lava: new THREE.MeshLambertMaterial({ color: 0xff5a00, emissive: 0xaa2200 }),
  get(col) {
    if (!this.c[col]) {
      const side = new THREE.MeshLambertMaterial({ color: col });
      const top = new THREE.MeshLambertMaterial({ color: col, map: Tex.studs() });
      this.c[col] = [side, side, top, side, side, side]; // +x -x +y(top) -y +z -z
    }
    return this.c[col];
  },
  ladder(col) {
    const k = 'L' + col;
    return this.c[k] || (this.c[k] = new THREE.MeshLambertMaterial({ color: col, map: Tex.ladder(), alphaTest: 0.5, side: THREE.DoubleSide }));
  },
  flat(col) { return this.fl[col] || (this.fl[col] = new THREE.MeshLambertMaterial({ color: col })); },
  forPart(p, kind) {
    return kind === 'water' ? this.water : kind === 'lava' ? this.lava : kind === 'ladder' ? this.ladder(p.color) : this.get(p.color);
  }
};

function partGeo(p, kind) {
  const g = new THREE.BoxGeometry(p.w, p.h, p.d), uv = g.attributes.uv;
  if (kind === 'ladder') {
    const vs = [p.h, p.h, p.d, p.d, p.h, p.h];
    for (let f = 0; f < 6; f++) for (let j = 0; j < 4; j++) uv.setY(f * 4 + j, uv.getY(f * 4 + j) * vs[f]);
  } else {
    for (let i = 8; i < 12; i++) uv.setXY(i, uv.getX(i) * p.w, uv.getY(i) * p.d); // 1 stud per unit on top
  }
  uv.needsUpdate = true;
  return g;
}

// flat = accessory mode (no studs, no special kinds)
function partMesh(p, flat, kind) {
  kind = flat ? '' : (kind || '');
  const m = new THREE.Mesh(partGeo(p, kind), flat ? Mats.flat(p.color) : Mats.forPart(p, kind));
  m.position.set(p.x, p.y, p.z);
  m.castShadow = kind !== 'water' && kind !== 'ladder';
  m.receiveShadow = kind !== 'water';
  return m;
}

function spawnOf(parts) {
  const s = (parts || []).find(p => p.spawn && (!p.type || p.type === 'part'));
  return s ? { x: s.x, y: s.y + s.h / 2 + 0.1, z: s.z } : null;
}