/* =====================================================
   TREE: the object model of a map.
   nodes = [{ id, type, name, parent, ... }]
   type:   part | model | folder | script | localscript | gui | btn | lbl
   parent: null = Workspace, 'SS' = ServerScript, 'SP' = StarterPack,
           'SG' = StarterGui, or the id of ANY other node (a Part can hold Parts)
   ===================================================== */
function num(v, a, b, d) { const n = +v; return isFinite(n) ? clamp(n, a, b) : d; }
const isItemName = n => /^item-/i.test(String(n || ''));
const SPECIAL = ['SS', 'SP', 'SG'];
const GUI_T = ['gui', 'btn', 'lbl'];
const NODE_T = ['part', 'model', 'folder', 'script', 'localscript', 'gui', 'btn', 'lbl'];

// Special part names. "Jump pad-3" = 3x normal jump height.
function nameKind(name) {
  const n = String(name || '').trim().toLowerCase();
  if (n === 'water' || n === 'lava' || n === 'ladder') return { kind: n };
  if (/^sit(ting)?[\s_]?place$/.test(n)) return { kind: 'seat' };
  const m = n.match(/^jump[\s_]?pad(?:\s*-\s*(\d+(?:\.\d+)?))?$/);
  if (m) return { kind: 'pad', pow: clamp(m[1] ? parseFloat(m[1]) : 2, 0.1, 20) };
  return null;
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

  // effective kind of a part: the part's own name, or the TOP-most Model/Folder above it
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
      const x0 = n.x - n.w / 2, x1 = n.x + n.w / 2, y0 = n.y - n.h / 2, y1 = n.y + n.h / 2, z0 = n.z - n.d / 2, z1 = n.z + n.d / 2;
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
  }
};