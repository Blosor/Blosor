/* =====================================================
   TREE: the object model of a map.
   nodes = [{ id, type, name, parent, ... }]
   type:   part | model | folder | script | localscript | module | gui | btn | lbl | remote | rfunc
   parent: null = Workspace, 'SS' ServerScript, 'SP' StarterPack, 'SG' StarterGui,
           'ST' StoreServer, or the id of ANY other node
   Parts: shape (block|ball|cyl), rx/ry/rz rotation in degrees (order YXZ), t = transparency 0..1
   ===================================================== */
function num(v, a, b, d) { const n = +v; return isFinite(n) ? clamp(n, a, b) : d; }
const isItemName = n => /^item-/i.test(String(n || ''));
const SPECIAL = ['SS', 'SP', 'SG', 'ST'];
const GUI_T = ['gui', 'btn', 'lbl'];
const NODE_T = ['part', 'model', 'folder', 'script', 'localscript', 'module', 'gui', 'btn', 'lbl', 'remote', 'rfunc'];
const SHAPES = ['block', 'ball', 'cyl'];
const D2 = Math.PI / 180;

function nameKind(name) {
  const n = String(name || '').trim().toLowerCase();
  if (n === 'water' || n === 'lava' || n === 'ladder') return { kind: n };
  if (/^sit(ting)?[\s_]?place$/.test(n)) return { kind: 'seat' };
  const m = n.match(/^jump[\s_]?pad(?:\s*-\s*(\d+(?:\.\d+)?))?$/);
  if (m) return { kind: 'pad', pow: clamp(m[1] ? parseFloat(m[1]) : 2, 0.1, 20) };
  return null;
}

/* ----- rotation helpers (shared by editor, renderer and physics) ----- */
const isRot = n => !!((n.rx || 0) || (n.ry || 0) || (n.rz || 0));
function partQ(n) { return new THREE.Quaternion().setFromEuler(new THREE.Euler((n.rx || 0) * D2, (n.ry || 0) * D2, (n.rz || 0) * D2, 'YXZ')); }
function setRot(n, q) {
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  n.rx = +(e.x / D2).toFixed(2) || 0; n.ry = +(e.y / D2).toFixed(2) || 0; n.rz = +(e.z / D2).toFixed(2) || 0;
}
function rotMat(n) { // 3x3 row-major
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((n.rx || 0) * D2, (n.ry || 0) * D2, (n.rz || 0) * D2, 'YXZ')).elements;
  return [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
}
// half extents of the world axis-aligned box around a (rotated) part
function partHalf(n) {
  const h = [n.w / 2, n.h / 2, n.d / 2];
  if (!isRot(n)) return h;
  const R = rotMat(n);
  return [0, 1, 2].map(i => Math.abs(R[i][0]) * h[0] + Math.abs(R[i][1]) * h[1] + Math.abs(R[i][2]) * h[2]);
}

const Tree = {
  _n: 0,
  nid() { return uid() + (++this._n).toString(36); },

  norm(arr) {
    const seen = {};
    return (Array.isArray(arr) ? arr : []).map(n => {
      const o = Object.assign({}, n);
      if (!NODE_T.includes(o.type)) o.type = 'part';
      if (!o.id || seen[o.id]) o.id = this.nid();
      seen[o.id] = 1;
      o.name = String(o.name || (o.type === 'part' ? 'Part' : o.type)).slice(0, 30);
      o.parent = o.parent || null;
      return o;
    });
  },
  map(nodes) { const m = {}; nodes.forEach(n => { m[n.id] = n; }); return m; },
  up(m, n) { return n && n.parent && !SPECIAL.includes(n.parent) ? m[n.parent] : null; },

  root(m, n) {
    let c = n, g = 0;
    while (c && g++ < 80) {
      if (SPECIAL.includes(c.parent)) return c.parent;
      if (!c.parent) return 'WS';
      c = m[c.parent];
    }
    return 'WS';
  },

  info(m, n) {
    const chain = []; let c = n, g = 0;
    while (c && g++ < 80) { chain.push(c); c = this.up(m, c); }
    for (let i = chain.length - 1; i >= 0; i--) {
      const x = chain[i];
      if (x !== n && x.type !== 'model' && x.type !== 'folder') continue;
      const k = nameKind(x.name);
      if (k) return k;
    }
    return {};
  },

  itemOf(m, n) {
    let c = n, g = 0;
    while (c && g++ < 80) { if (c.type === 'model' && isItemName(c.name)) return c; c = this.up(m, c); }
    return null;
  },
  tools(nodes) { return nodes.filter(n => n.type === 'model' && n.parent === 'SP' && isItemName(n.name)); },

  sub(nodes, ids) {
    const s = new Set(ids); let add = true;
    while (add) {
      add = false;
      for (const n of nodes) if (n.parent && !s.has(n.id) && s.has(n.parent)) { s.add(n.id); add = true; }
    }
    return s;
  },

  topModel(m, n) {
    let best = n, c = n, g = 0;
    while (c && g++ < 80) { if (c.type === 'model') best = c; c = this.up(m, c); }
    return best;
  },

  bbox(nodes, ids) {
    const s = this.sub(nodes, ids); let b = null;
    nodes.forEach(n => {
      if (n.type !== 'part' || !s.has(n.id)) return;
      const h = partHalf(n);
      const x0 = n.x - h[0], x1 = n.x + h[0], y0 = n.y - h[1], y1 = n.y + h[1], z0 = n.z - h[2], z1 = n.z + h[2];
      b = b ? { x0: Math.min(b.x0, x0), x1: Math.max(b.x1, x1), y0: Math.min(b.y0, y0), y1: Math.max(b.y1, y1), z0: Math.min(b.z0, z0), z1: Math.max(b.z1, z1) }
            : { x0, x1, y0, y1, z0, z1 };
    });
    return b;
  },

  clone(nodes, ids) {
    const s = this.sub(nodes, ids), idm = {};
    nodes.forEach(n => { if (s.has(n.id)) idm[n.id] = this.nid(); });
    const list = [], roots = [];
    nodes.forEach(n => {
      if (!s.has(n.id)) return;
      const c = JSON.parse(JSON.stringify(n));
      c.id = idm[n.id];
      if (idm[n.parent]) c.parent = idm[n.parent]; else roots.push(c.id);
      list.push(c);
    });
    return { list, roots };
  },

  // never trust map data that came from another device
  cleanMap(d) {
    d = d || {};
    const parts = (Array.isArray(d.parts) ? d.parts : []).slice(0, 20000).map(n => {
      n = n || {};
      const t = NODE_T.includes(n.type) ? n.type : 'part';
      const o = { id: String(n.id || '').slice(0, 24), type: t, name: String(n.name || 'Part').slice(0, 30), parent: n.parent ? String(n.parent).slice(0, 24) : null };
      if (t === 'part') {
        o.x = num(n.x, -5000, 5000, 0); o.y = num(n.y, -5000, 5000, 0); o.z = num(n.z, -5000, 5000, 0);
        o.w = num(n.w, 0.2, 2000, 1); o.h = num(n.h, 0.2, 2000, 1); o.d = num(n.d, 0.2, 2000, 1);
        o.color = hexOk(n.color, '#a3a2a5'); o.spawn = !!n.spawn; o.anch = n.anch !== false; o.col = n.col !== false;
        o.shape = SHAPES.includes(n.shape) ? n.shape : 'block';
        o.rx = num(n.rx, -360, 360, 0); o.ry = num(n.ry, -360, 360, 0); o.rz = num(n.rz, -360, 360, 0);
        o.t = num(n.t, 0, 1, 0);
      } else if (t === 'script' || t === 'localscript' || t === 'module') {
        o.code = String(n.code || '').slice(0, 300000); o.off = !!n.off;
      } else if (t === 'btn' || t === 'lbl') {
        o.text = Filter.mask(String(n.text || '').slice(0, 60));
        o.gx = num(n.gx, 0, 100, 50); o.gy = num(n.gy, 0, 100, 50);
        o.gw = num(n.gw, 10, 800, 100); o.gh = num(n.gh, 10, 600, 40);
        o.color = hexOk(n.color, '#d94545'); o.tc = hexOk(n.tc, '#ffffff');
      }
      return o;
    });
    const sp = d.spawn && typeof d.spawn === 'object' ? { x: num(d.spawn.x, -5000, 5000, 0), y: num(d.spawn.y, -5000, 5000, 8), z: num(d.spawn.z, -5000, 5000, 0) } : null;
    const mt = d.meta && typeof d.meta === 'object' ? { name: String(d.meta.name || '').slice(0, 40), max: num(d.meta.max, 1, CONFIG.MAX_PLAYERS_LIMIT, 8), author: String(d.meta.author || '').slice(0, 20) } : null;
    return { parts, env: Env.clean(d.env), spawn: sp, meta: mt };
  }
};
