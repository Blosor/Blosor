/* =====================================================
   BLOSOR STUDIO ENGINE (modes: 'map' and 'avatar')
   Works on a node tree (see tree.js). Selection = list of ids.
   Free camera: unlimited distance, no fog. Shift = fast fly.
   ===================================================== */
const Studio = {
  inited: false, active: false, mode: 'map', nodes: [], sel: [], multi: false, tool: 'select', snap: 1,
  meshes: new Map(), undoS: [], redoS: [], keys: {}, drag: null, rid: 0, dirty: false, clip: null, bb: null, env: null,
  yaw: 0.7, pitch: 0.55, dist: 45, onList: null, onProps: null, onDirty: null,
  MAXD: 20000,

  init() {
    if (this.inited) return;
    this.inited = true;
    this.cv = byId('stCanvas');
    Gfx.init();
    const s = this.s = new THREE.Scene();
    this.sun = addLights(s);
    this.env = Env.clean(null);
    this.applyEnv();
    this.cam = new THREE.PerspectiveCamera(60, 1, 0.3, 200000);
    this.tgt = new THREE.Vector3(0, 3, 0);
    this.grp = new THREE.Group(); s.add(this.grp);
    this.rc = new THREE.Raycaster();

    const stage = this.stage = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.2, 48), new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
    disc.position.y = -0.1; disc.receiveShadow = true;
    stage.add(disc, makeAvatar(DEFAULT_COLORS).g);
    stage.visible = false; s.add(stage);

    const sb = this.selBox = new THREE.Group();
    sb.add(
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x0d99ff, transparent: true, opacity: 0.22, depthWrite: false })),
      new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x0d99ff, depthTest: false })));
    sb.visible = false; s.add(sb);

    this.buildGizmo();
    this.bind();
    addEventListener('keydown', e => this.key(e, true));
    addEventListener('keyup', e => this.key(e, false));
  },

  applyEnv() { Env.apply(this.s, this.sun, this.env); this.s.fog = null; }, // no fog in the editor

  maxParts() { return this.mode === 'avatar' ? CONFIG.MAX_ACC_PARTS : CONFIG.MAX_PARTS; },
  count() { return this.nodes.filter(n => n.type === 'part').length; },
  node(id) { return this.nodes.find(n => n.id === id) || null; },
  prim() { return this.node(this.sel[this.sel.length - 1]); },
  single() { const n = this.sel.length === 1 ? this.prim() : null; return n && n.type === 'part' ? n : null; },
  isScriptType(t) { return t === 'script' || t === 'localscript'; },
  setEnv(e) { this.env = Env.clean(e); this.applyEnv(); this.markDirty(); },

  limit(p) {
    if (this.mode !== 'avatar') return p;
    p.w = clamp(p.w, 0.2, 6); p.h = clamp(p.h, 0.2, 6); p.d = clamp(p.d, 0.2, 6);
    p.x = clamp(p.x, -6, 6); p.y = clamp(p.y, -1, 12); p.z = clamp(p.z, -6, 6);
    return p;
  },

  /* ---------- gizmo ---------- */
  buildGizmo() {
    const gz = this.gz = new THREE.Group(); gz.visible = false; this.s.add(gz);
    this.handles = [];
    const cols = [0xff4d4d, 0x4dff4d, 0x4d9bff];
    const hitM = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const Y = new THREE.Vector3(0, 1, 0);
    for (let ax = 0; ax < 3; ax++) for (const sg of [1, -1]) {
      const dir = new THREE.Vector3(); dir.setComponent(ax, sg);
      const mat = new THREE.MeshBasicMaterial({ color: cols[ax], depthTest: false, transparent: true });
      const mv = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8), mat); shaft.position.y = 0.6;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 12), mat); cone.position.y = 1.35;
      const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.8, 6), hitM); hb.position.y = 0.9;
      mv.add(shaft, cone, hb);
      mv.quaternion.setFromUnitVectors(Y, dir);
      mv.userData = { kind: 'move', ax, sg, dir };
      const sc = new THREE.Group();
      sc.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat), new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), hitM));
      sc.userData = { kind: 'scale', ax, sg, dir };
      [mv, sc].forEach(h => {
        h.traverse(o => { o.userData = h.userData; o.renderOrder = 999; });
        gz.add(h); this.handles.push(h);
      });
    }
  },
  gizmoOn() { return !!this.bb && this.tool !== 'select' && !(this.tool === 'scale' && !this.single()); },
  updateGizmo() {
    if (!this.gizmoOn()) { this.gz.visible = false; return; }
    this.gz.visible = true;
    const b = this.bb, c = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    const fac = Math.max(0.3, this.cam.position.distanceTo(c) * 0.07);
    const half = [(b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, (b.z1 - b.z0) / 2];
    for (const h of this.handles) {
      const u = h.userData;
      h.visible = u.kind === this.tool;
      if (!h.visible) continue;
      h.position.copy(c).addScaledVector(u.dir, half[u.ax] + (u.kind === 'scale' ? fac * 0.9 : 0));
      h.scale.setScalar(fac);
    }
  },

  /* ---------- data ---------- */
  load(nodes, mode, env) {
    this.init();
    this.mode = mode || 'map';
    const av = this.mode === 'avatar';
    this.nodes = Tree.norm(JSON.parse(JSON.stringify(nodes)));
    if (av) this.nodes = this.nodes.filter(n => n.type === 'part').map(n => Object.assign(n, { parent: null }));
    this.sel = []; this.undoS = []; this.redoS = []; this.dirty = false; this.multi = false;
    this.env = Env.clean(env); this.applyEnv();
    this.stage.visible = av;
    this.tgt.set(0, 3, 0);
    this.yaw = av ? 0.5 : 0.7; this.pitch = av ? 0.25 : 0.55; this.dist = av ? 17 : 45;
    this.rebuildAll(); this.changed(true);
  },
  rebuildAll() {
    const flat = this.mode === 'avatar', m = Tree.map(this.nodes);
    this.grp.children.slice().forEach(c => { c.geometry.dispose(); this.grp.remove(c); });
    this.meshes.clear();
    this.nodes.forEach(n => {
      if (n.type !== 'part' || Tree.root(m, n) !== 'WS') return;
      const me = partMesh(n, flat, Tree.info(m, n).kind);
      me.userData.id = n.id; this.grp.add(me); this.meshes.set(n.id, me);
    });
    this.updateSelVis();
  },
  refreshMesh(n) {
    const me = this.meshes.get(n.id); if (!me) return;
    const flat = this.mode === 'avatar', k = flat ? '' : (Tree.info(Tree.map(this.nodes), n).kind || '');
    me.geometry.dispose(); me.geometry = partGeo(n, k);
    me.material = flat ? Mats.flat(n.color) : Mats.forPart(n, k);
    me.castShadow = k !== 'water' && k !== 'ladder'; me.receiveShadow = k !== 'water';
    me.position.set(n.x, n.y, n.z);
  },
  updateSelVis() {
    const b = this.bb = this.sel.length ? Tree.bbox(this.nodes, this.sel) : null;
    if (!b) { this.selBox.visible = false; return; }
    this.selBox.visible = true;
    this.selBox.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    this.selBox.scale.set(b.x1 - b.x0 + 0.06, b.y1 - b.y0 + 0.06, b.z1 - b.z0 + 0.06);
  },
  changed(list) {
    this.updateSelVis();
    if (list) { if (this.onList) this.onList(); } else if (this.onProps) this.onProps();
  },
  markDirty() { this.dirty = true; if (this.onDirty) this.onDirty(); },

  /* ---------- undo / redo ---------- */
  push() {
    this.undoS.push(JSON.stringify(this.nodes));
    if (this.undoS.length > 40) this.undoS.shift();
    this.redoS = []; this.markDirty();
  },
  undo() {
    if (!this.undoS.length) return;
    this.redoS.push(JSON.stringify(this.nodes));
    this.nodes = JSON.parse(this.undoS.pop()); this.fix();
  },
  redo() {
    if (!this.redoS.length) return;
    this.undoS.push(JSON.stringify(this.nodes));
    this.nodes = JSON.parse(this.redoS.pop()); this.fix();
  },
  fix() {
    this.sel = this.sel.filter(id => this.node(id));
    this.rebuildAll(); this.changed(true); this.markDirty();
  },

  /* ---------- selection ---------- */
  tap(id) {
    if (id === null) { if (!this.multi) this.sel = []; }
    else if (this.multi) { const i = this.sel.indexOf(id); if (i >= 0) this.sel.splice(i, 1); else this.sel.push(id); }
    else this.sel = [id];
    this.changed(true);
  },
  pick(e) {
    this.rc.setFromCamera(this.ndc(e), this.cam);
    const hit = this.rc.intersectObjects([...this.meshes.values()], false)[0];
    if (!hit) return this.tap(null);
    const m = Tree.map(this.nodes), n = m[hit.object.userData.id];
    this.tap(n ? Tree.topModel(m, n).id : null); // a part inside a Model selects the whole Model
  },
  setTool(t) { this.tool = t; },

  /* ---------- create ---------- */
  home(root) {
    const m = Tree.map(this.nodes), p = this.prim();
    let par = null;
    if (p) par = (p.type === 'model' || p.type === 'folder') ? p.id : p.parent;
    const r = par == null ? 'WS' : (SPECIAL.includes(par) ? par : Tree.root(m, m[par]));
    if (r !== root) par = root === 'SS' ? 'SS' : root === 'SG' ? 'SG' : null;
    return par;
  },
  // scripts go inside the selected Item / ServerScript folder / GUI element, otherwise ServerScript
  scriptHome() {
    const m = Tree.map(this.nodes), p = this.prim();
    if (p) {
      const c = ['model', 'folder', 'gui', 'btn', 'lbl'].includes(p.type) ? p : m[p.parent];
      if (c) { const r = Tree.root(m, c); if (Tree.itemOf(m, c) || r === 'SS' || r === 'SG') return c.id; }
    }
    return 'SS';
  },
  addNode(o, root) {
    const type = o.type || 'part';
    if (type === 'part' && this.count() >= this.maxParts()) return uiAlert('Part limit reached (' + this.maxParts() + ').');
    if (this.nodes.length >= 3000) return uiAlert('Too many objects.');
    if (this.isScriptType(type) && this.nodes.filter(n => this.isScriptType(n.type)).length >= 40) return uiAlert('Script limit reached (40).');
    this.push();
    const n = Object.assign({ id: Tree.nid(), type: 'part', parent: this.home(root) }, o);
    this.nodes.push(n); this.sel = [n.id];
    this.rebuildAll(); this.changed(true);
    return n;
  },
  add(o) {
    const c = this.tgt, av = this.mode === 'avatar';
    const base = av
      ? { name: 'Part', x: 0, y: 5.6, z: 0, w: 1.5, h: 0.5, d: 1.5, color: '#a3a2a5', attach: 'head' }
      : { name: 'Part', x: Math.round(c.x), y: Math.max(1, Math.round(c.y)), z: Math.round(c.z), w: 4, h: 1, d: 2, color: '#a3a2a5' };
    return this.addNode(this.limit(Object.assign(base, o || {})), 'WS');
  },
  addContainer(type) { return this.addNode({ type, name: type === 'model' ? 'Model' : 'Folder', open: true }, 'WS'); },
  addScript(type, code) {
    return this.addNode({ type, name: type === 'script' ? 'Script' : 'LocalScript', code: code || '', open: true, parent: this.scriptHome() }, 'SS');
  },
  // StarterGui: ScreenGui (container) with Buttons / Labels inside
  addGui(kind) {
    if (this.nodes.filter(n => GUI_T.includes(n.type)).length >= 60) return uiAlert('GUI limit reached (60).');
    if (kind === 'gui') return this.addNode({ type: 'gui', name: 'ScreenGui', parent: 'SG', open: true }, 'SG');
    const m = Tree.map(this.nodes);
    let c = this.prim(), g = 0;
    while (c && c.type !== 'gui' && g++ < 80) c = Tree.up(m, c);
    let gid = c && c.type === 'gui' ? c.id : null;
    if (!gid) { const ng = this.addGui('gui'); if (!ng) return null; gid = ng.id; }
    const base = kind === 'btn'
      ? { type: 'btn', name: 'Button', text: 'Attack', gx: 85, gy: 70, gw: 110, gh: 56, color: '#d94545', tc: '#ffffff', parent: gid }
      : { type: 'lbl', name: 'Label', text: 'Hello', gx: 50, gy: 10, gw: 160, gh: 36, color: '#000000', tc: '#ffffff', parent: gid };
    return this.addNode(base, 'SG');
  },
  addItem() {
    if (this.count() >= this.maxParts()) return uiAlert('Part limit reached.');
    this.push();
    const c = this.tgt, md = { id: Tree.nid(), type: 'model', name: 'Item-Tool', parent: null, open: true };
    const h = { id: Tree.nid(), type: 'part', name: 'Handle', parent: md.id, x: Math.round(c.x), y: Math.max(2, Math.round(c.y)), z: Math.round(c.z), w: 1, h: 4, d: 1, color: '#a3a2a5' };
    this.nodes.push(md, h); this.sel = [md.id];
    this.rebuildAll(); this.changed(true);
    toast('Build it here, then press → StarterPack');
  },
  toSP() {
    const ns = this.sel.map(id => this.node(id)).filter(n => n && n.type === 'model' && isItemName(n.name));
    if (!ns.length) return uiAlert('Select a Model named "Item-Something" first.');
    this.push(); ns.forEach(n => { n.parent = 'SP'; }); this.sel = ns.map(n => n.id);
    this.rebuildAll(); this.changed(true); toast('Moved to StarterPack');
  },
  toWS() {
    const ns = this.sel.map(id => this.node(id)).filter(n => n && n.parent === 'SP');
    if (!ns.length) return uiAlert('Select something inside StarterPack first.');
    this.push(); ns.forEach(n => { n.parent = null; }); this.sel = ns.map(n => n.id);
    this.rebuildAll(); this.changed(true); toast('Moved to Workspace');
  },
  addTpl(key) {
    const t = TEMPLATES[key]; if (!t) return null;
    if (this.count() + t.parts.length > this.maxParts()) return uiAlert('Part limit reached.');
    this.push(); this.sel = [];
    t.parts.forEach(p => { const n = Object.assign({ id: Tree.nid(), type: 'part', parent: null }, p); this.nodes.push(n); this.sel.push(n.id); });
    this.rebuildAll(); this.changed(true);
    return t;
  },

  /* ---------- organize ---------- */
  group(type) {
    const sel = this.sel.filter(id => this.node(id));
    if (!sel.length) return uiAlert('Select something first.');
    const all = Tree.sub(this.nodes, sel);
    const top = this.nodes.filter(n => sel.includes(n.id) && !all.has(n.parent));
    const m = Tree.map(this.nodes), r0 = Tree.root(m, top[0]);
    if (top.some(n => Tree.root(m, n) !== r0)) return uiAlert('Items from different services cannot be grouped together.');
    if (r0 === 'SG') return uiAlert('Use ScreenGui to group GUI elements.');
    this.push();
    const c = { id: Tree.nid(), type: r0 === 'SS' ? 'folder' : type, name: type === 'model' && r0 !== 'SS' ? 'Model' : 'Folder', parent: top[0].parent, open: true };
    this.nodes.push(c); top.forEach(n => { n.parent = c.id; });
    this.sel = [c.id]; this.rebuildAll(); this.changed(true);
  },
  ungroup() { // everything inside the selected object moves up one level
    const cs = this.sel.map(id => this.node(id)).filter(n => n && this.nodes.some(k => k.parent === n.id));
    if (!cs.length) return uiAlert('Select an object that has things inside it.');
    this.push(); const out = [];
    cs.forEach(c => this.nodes.forEach(n => { if (n.parent === c.id) { n.parent = c.parent; out.push(n.id); } }));
    this.nodes = this.nodes.filter(n => !(['model', 'folder'].includes(n.type) && cs.includes(n)));
    this.sel = out; this.rebuildAll(); this.changed(true);
  },
  // Into: put the selected items inside the item that was selected LAST (a Part can hold Parts)
  into() {
    if (this.sel.length < 2) return uiAlert('Turn on Multi, select the items to move, then select the TARGET last.');
    const tid = this.sel[this.sel.length - 1], t = this.node(tid);
    const moving = this.sel.slice(0, -1).map(id => this.node(id)).filter(Boolean);
    if (!t || !moving.length) return;
    if (Tree.sub(this.nodes, moving.map(n => n.id)).has(tid)) return uiAlert('Cannot move something into itself.');
    if (this.isScriptType(t.type)) return uiAlert('A script cannot hold other objects.');
    const m = Tree.map(this.nodes), tr = Tree.root(m, t);
    for (const n of moving) {
      const isG = GUI_T.includes(n.type);
      if (isG && !(tr === 'SG' && GUI_T.includes(t.type))) return uiAlert('GUI elements can only go inside a ScreenGui.');
      if (!isG && !this.isScriptType(n.type) && (tr === 'SG' || tr === 'SS')) return uiAlert('That target cannot hold ' + n.name + '.');
    }
    this.push(); moving.forEach(n => { n.parent = tid; }); this.sel = moving.map(n => n.id);
    this.rebuildAll(); this.changed(true); toast('Moved inside ' + t.name);
  },
  out() { // Out: one level up
    const ns = this.sel.map(id => this.node(id)).filter(n => n && n.parent && !SPECIAL.includes(n.parent));
    if (!ns.length) return uiAlert('Select something that is inside another object.');
    this.push();
    ns.forEach(n => { const pn = this.node(n.parent); n.parent = pn ? pn.parent : null; });
    this.rebuildAll(); this.changed(true);
  },

  /* ---------- delete / cut / copy / paste / duplicate ---------- */
  del() {
    if (!this.sel.length) return;
    this.push();
    const s = Tree.sub(this.nodes, this.sel);
    this.nodes = this.nodes.filter(n => !s.has(n.id));
    this.sel = []; this.rebuildAll(); this.changed(true);
  },
  copy() {
    if (!this.sel.length) { toast('Select something first'); return false; }
    this.clip = Tree.clone(this.nodes, this.sel);
    toast('Copied');
    return true;
  },
  cut() { if (this.copy()) { this.del(); toast('Cut. Use Paste to put it back.'); } },
  // dup = exact copy in the SAME place (same parent, same position)
  paste(dup) {
    const cl = this.clip;
    if (!cl) return toast('Nothing to paste');
    const c = Tree.clone(cl.list, cl.roots);
    const roots = c.list.filter(n => c.roots.includes(n.id));
    const kind = c.list.every(n => this.isScriptType(n.type)) ? 'script' : c.list.some(n => GUI_T.includes(n.type)) ? 'gui' : 'ws';
    const newParts = c.list.filter(n => n.type === 'part').length;
    if (this.count() + newParts > this.maxParts()) return uiAlert('Part limit reached (' + this.maxParts() + ').');
    if (this.nodes.length + c.list.length > 3000) return uiAlert('Too many objects.');
    const m = Tree.map(this.nodes);
    if (!dup && this.sel.length) { // paste INTO the selected object (Part -> Part works)
      let t = this.prim();
      if (t && this.isScriptType(t.type)) t = t.parent && !SPECIAL.includes(t.parent) ? m[t.parent] : null;
      let par;
      if (t) {
        const tr = Tree.root(m, t);
        if (kind === 'script') par = t.id;
        else if (kind === 'gui') par = tr === 'SG' && GUI_T.includes(t.type) ? t.id : 'SG';
        else par = (tr === 'WS' || tr === 'SP') ? t.id : null;
      } else par = kind === 'script' ? 'SS' : kind === 'gui' ? 'SG' : null;
      roots.forEach(n => { n.parent = par; });
    } else if (!dup) { // nothing selected: back to the original place when it still exists
      roots.forEach(n => {
        const op = n.parent, ok = SPECIAL.includes(op) || (op && m[op]);
        n.parent = ok ? op : (kind === 'script' ? 'SS' : kind === 'gui' ? 'SG' : null);
      });
    }
    if (this.nodes.some(n => n.spawn)) c.list.forEach(n => { n.spawn = false; });
    this.push();
    c.list.forEach(n => this.nodes.push(n));
    this.sel = c.roots.slice();
    this.rebuildAll(); this.changed(true);
  },
  dup() {
    if (!this.sel.length) return;
    const keep = this.clip;
    this.clip = Tree.clone(this.nodes, this.sel);
    this.paste(true);
    this.clip = keep;
  },

  /* ---------- rotate / flip ---------- */
  xform(fn) {
    if (!this.sel.length) return toast('Select something first');
    const ids = Tree.sub(this.nodes, this.sel), b = Tree.bbox(this.nodes, this.sel);
    if (!b) return toast('Nothing to transform');
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    this.push();
    this.nodes.forEach(n => { if (n.type === 'part' && ids.has(n.id)) { fn(n, cx, cz); this.limit(n); this.refreshMesh(n); } });
    this.changed(true);
  },
  rotate() { // 90 degrees around Y, around the middle of the selection
    this.xform((n, cx, cz) => { const dx = n.x - cx, dz = n.z - cz; n.x = +(cx + dz).toFixed(3); n.z = +(cz - dx).toFixed(3); const w = n.w; n.w = n.d; n.d = w; });
  },
  flip(axis) { // mirror across the middle of the selection
    this.xform((n, cx, cz) => { if (axis === 'x') n.x = +(2 * cx - n.x).toFixed(3); else n.z = +(2 * cz - n.z).toFixed(3); });
  },

  focus() {
    const b = this.bb; if (!b) return;
    this.tgt.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    this.dist = clamp(Math.max(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0) * 2.2, 8, this.MAXD);
  },
  patch(pt, undo = true, list = true) {
    const p = this.prim(); if (!p) return;
    if (undo) this.push();
    Object.assign(p, pt);
    if (p.type === 'part') {
      this.limit(p);
      if (pt.spawn) this.nodes.forEach(q => { if (q !== p) q.spawn = false; });
      this.refreshMesh(p);
    } else if (pt.name !== undefined && (p.type === 'model' || p.type === 'folder')) this.rebuildAll();
    this.changed(list);
  },

  nudge(k, dir) {
    const a = (this.snap > 0 ? this.snap : 1) * dir;
    if ('xyz'.includes(k)) {
      if (!this.sel.length) return toast('Select something first');
      this.push();
      const ids = Tree.sub(this.nodes, this.sel);
      this.nodes.forEach(n => {
        if (n.type === 'part' && ids.has(n.id)) { n[k] = +(n[k] + a).toFixed(3); this.limit(n); this.refreshMesh(n); }
      });
    } else {
      const p = this.single();
      if (!p) return toast('Select one part to resize');
      this.push();
      p[k] = Math.max(0.2, +(p[k] + a).toFixed(3));
      this.limit(p); this.refreshMesh(p);
    }
    this.changed(true);
  },

  /* ---------- camera (free) ---------- */
  updateCam() {
    const cp = Math.cos(this.pitch), t = this.tgt, d = this.dist;
    this.cam.position.set(t.x + Math.sin(this.yaw) * cp * d, t.y + Math.sin(this.pitch) * d, t.z + Math.cos(this.yaw) * cp * d);
    this.cam.lookAt(t);
  },
  pan(dx, dy) {
    const f = 2 * this.dist * Math.tan(this.cam.fov * Math.PI / 360) / (this.cv.clientHeight || innerHeight);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cam.quaternion);
    this.tgt.addScaledVector(right, -dx * f).addScaledVector(up, dy * f);
  },
  resize() {
    if (!this.inited || !Gfx.r) return;
    const sz = Gfx.size(this.cv);
    this.cam.aspect = sz[0] / sz[1]; this.cam.updateProjectionMatrix();
  },
  show() {
    this.init();
    Gfx.mount(this.cv);
    this.active = true; this.resize();
    this.last = performance.now();
    const id = ++this.rid;
    requestAnimationFrame(t => this.loop(id, t));
  },
  hide() { this.active = false; this.keys = {}; },

  loop(id, t) {
    if (!this.active || id !== this.rid) return;
    requestAnimationFrame(t2 => this.loop(id, t2));
    const dt = clamp((t - this.last) / 1000, 0, 0.05); this.last = t;
    const k = this.keys;
    if (k.w || k.a || k.s || k.d || k.q || k.e) {
      const sp = Math.max(10, this.dist) * dt * 1.2 * (k.sh ? 4 : 1);
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const f = (k.w ? 1 : 0) - (k.s ? 1 : 0), r = (k.d ? 1 : 0) - (k.a ? 1 : 0), u = (k.e ? 1 : 0) - (k.q ? 1 : 0);
      this.tgt.x += (-sy * f + cy * r) * sp;
      this.tgt.z += (-cy * f - sy * r) * sp;
      this.tgt.y += u * sp;
    }
    this.updateCam(); this.updateGizmo();
    const o = Env.sunOff(this.env);
    this.sun.target.position.copy(this.tgt);
    this.sun.position.set(this.tgt.x + o[0], this.tgt.y + o[1], this.tgt.z + o[2]);
    Gfx.r.render(this.s, this.cam);
  },

  key(e, down) {
    if (!this.active) return;
    const tg = e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === 'shift') { this.keys.sh = down; return; }
    if (down && (e.ctrlKey || e.metaKey)) {
      const a = { z: () => this.undo(), y: () => this.redo(), d: () => this.dup(), x: () => this.cut(), c: () => this.copy(), v: () => this.paste() }[k];
      if (a) { e.preventDefault(); a(); }
      return;
    }
    if (down && k === 'delete') { this.del(); return; }
    if (k.length === 1 && 'wasdqe'.includes(k)) this.keys[k] = down;
  },

  /* ---------- gizmo dragging ---------- */
  ndc(e) {
    const b = this.cv.getBoundingClientRect();
    return new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
  },
  pickGizmo(e) {
    if (!this.gizmoOn()) return null;
    this.rc.setFromCamera(this.ndc(e), this.cam);
    const hits = this.rc.intersectObjects(this.handles.filter(h => h.userData.kind === this.tool), true);
    return hits.length ? hits[0].object.userData : null;
  },
  axisT(e, ax, o) {
    this.rc.setFromCamera(this.ndc(e), this.cam);
    const ray = this.rc.ray, a = new THREE.Vector3(); a.setComponent(ax, 1);
    const w0 = new THREE.Vector3(o.x, o.y, o.z).sub(ray.origin);
    const b = a.dot(ray.direction), d = a.dot(w0), ee = ray.direction.dot(w0), den = 1 - b * b;
    if (den < 1e-4) return null;
    return (b * ee - d) / den;
  },
  sn(v) { return this.snap > 0 ? +(Math.round(v / this.snap) * this.snap).toFixed(3) : +v.toFixed(2); },
  startDrag(u, e) {
    const b = this.bb; if (!b) return false;
    const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 };
    const t0 = this.axisT(e, u.ax, c); if (t0 === null) return false;
    const ids = u.kind === 'move' ? Tree.sub(this.nodes, this.sel) : new Set(this.single() ? [this.single().id] : []);
    const items = this.nodes.filter(n => n.type === 'part' && ids.has(n.id)).map(n => ({ n, x: n.x, y: n.y, z: n.z, w: n.w, h: n.h, d: n.d }));
    if (!items.length) return false;
    this.push();
    this.drag = { u, t0, c, items };
    return true;
  },
  dragTo(e) {
    const d = this.drag; if (!d) return;
    const u = d.u, t = this.axisT(e, u.ax, d.c); if (t === null) return;
    const delta = t - d.t0, k = ['x', 'y', 'z'][u.ax], dm = ['w', 'h', 'd'][u.ax];
    if (u.kind === 'move') {
      const dd = this.sn(d.c[k] + delta) - d.c[k];
      d.items.forEach(s => {
        s.n[k] = +(s[k] + dd).toFixed(3); this.limit(s.n);
        const me = this.meshes.get(s.n.id); if (me) me.position.set(s.n.x, s.n.y, s.n.z);
      });
    } else {
      const s = d.items[0], p = s.n;
      const ns = Math.max(this.snap > 0 ? this.snap : 0.2, this.sn(s[dm] + u.sg * delta));
      p[dm] = ns; p[k] = +(s[k] + u.sg * (ns - s[dm]) / 2).toFixed(3);
      this.limit(p); this.refreshMesh(p);
    }
    this.changed(false);
  },
  endDrag() { if (this.drag) { this.drag = null; this.changed(true); } },

  bind() {
    const cv = this.cv, ptr = new Map();
    let mode = null, down = null, moved = false;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => { e.preventDefault(); this.dist = clamp(this.dist * (e.deltaY > 0 ? 1.12 : 0.89), 1, this.MAXD); }, { passive: false });

    cv.addEventListener('pointerdown', e => {
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptr.size === 1) {
        moved = false; down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button };
        const u = e.button === 0 ? this.pickGizmo(e) : null;
        if (u && this.startDrag(u, e)) mode = 'drag';
        else mode = (e.button === 1 || e.shiftKey) ? 'pan' : 'orbit';
      } else { if (mode === 'drag') this.drag = null; mode = 'pinch'; moved = true; }
    });

    cv.addEventListener('pointermove', e => {
      const p = ptr.get(e.pointerId); if (!p) return;
      const prev = [...ptr.values()].map(q => ({ x: q.x, y: q.y }));
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (mode === 'pinch') {
        if (ptr.size < 2) return;
        const cur = [...ptr.values()];
        const d0 = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y);
        const d1 = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
        if (d0 > 0 && d1 > 0) this.dist = clamp(this.dist * d0 / d1, 1, this.MAXD);
        this.pan((cur[0].x + cur[1].x) / 2 - (prev[0].x + prev[1].x) / 2, (cur[0].y + cur[1].y) / 2 - (prev[0].y + prev[1].y) / 2);
      } else if (mode === 'drag') this.dragTo(e);
      else if (mode === 'orbit' || mode === 'pan') {
        if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) return;
        moved = true;
        if (mode === 'pan') this.pan(dx, dy);
        else { this.yaw -= dx * 0.008; this.pitch = clamp(this.pitch + dy * 0.008, -1.5, 1.5); }
      }
    });

    const up = e => {
      if (!ptr.has(e.pointerId)) return;
      ptr.delete(e.pointerId);
      if (mode === 'drag') { this.endDrag(); mode = null; return; }
      if (ptr.size === 0) {
        if ((mode === 'orbit' || mode === 'pan') && !moved && e.type === 'pointerup' && down.b === 0 && performance.now() - down.t < 700) this.pick(e);
        mode = null;
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }
};

addEventListener('resize', () => {
  if (Game.running) Game.resize();
  if (Studio.active) Studio.resize();
});