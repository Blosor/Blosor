/* rbx.js - stage 4: shapes, collision, catalog sync, ServerStorage, Roblox-style UI. Loaded last. */
(function () {
  'use strict';
  const dbg = (n, e) => { console.error(e); if (window.dbgShow) window.dbgShow('rbx ' + n + ': ' + (e && (e.stack || e.message) || e)); };
  const S = (n, f) => { try { f(); } catch (e) { dbg(n, e); } };
  const g0 = DB.get.bind(DB);
  const EM = () => window.Emotes;
  const $q = s => document.querySelector(s);
  const V = {};

  /* ---------- styles ---------- */
  S('css', () => {
    const st = document.createElement('style');
    st.textContent = `
.top{position:fixed;top:0;left:0;right:0;height:52px;background:#232527;border-bottom:1px solid #000;display:flex;align-items:center;gap:8px;padding:0 12px;z-index:20}
.bn{position:fixed;bottom:0;left:0;right:0;height:58px;background:#232527;border-top:1px solid #000;display:flex;z-index:20}
.bn button{flex:1;background:none;border:0;color:#8f939a;font-size:10px;font-weight:600;padding:4px 0;border-radius:0;position:relative}
.bn button i{display:block;font-style:normal;font-size:20px}.bn button.on{color:#fff}
.bd{position:absolute;top:2px;right:18%;background:#e04444;color:#fff;border-radius:8px;font-size:10px;padding:0 5px}
#main{padding:62px 12px 72px!important;max-width:900px;margin:auto}
.hrow{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px}
.gc{width:140px;flex-shrink:0;background:#232527;border-radius:10px;overflow:hidden}.grid .gc{width:auto}
.gc .th{height:120px;display:flex;align-items:center;justify-content:center;font-size:46px;color:#fffc;font-weight:900}
.gc .gi{padding:6px 8px}.gc b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sec{margin:14px 0 6px;font-size:17px;font-weight:800}
.pd{display:inline-block;width:10px;height:10px;border-radius:50%;background:#6b6f76;vertical-align:middle}.pd.on{background:#2ee66b}.pd.st{background:#e04444}
.fa{width:64px;flex-shrink:0;text-align:center}.fa .av{position:relative;width:56px;height:56px;margin:auto;border-radius:50%;background:#44474d;font-size:22px;font-weight:800;line-height:56px}
.fa .av .pd{position:absolute;right:0;bottom:2px;width:14px;height:14px;border:2px solid #191a1c}.fn{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hello{display:flex;gap:12px;align-items:center}.hs{width:64px;height:80px;object-fit:contain;background:#2a2d31;border-radius:10px}
.tabs{display:flex;background:#2a2d31;border-radius:8px;overflow:hidden;margin:8px 0}
.tabs button{flex:1;background:none;color:#9a9da3;border-radius:0;padding:10px 4px;font-size:12px;margin:0!important;width:auto!important}.tabs button.on{background:#0d99ff;color:#fff}
.banner{height:110px;border-radius:12px}.pcard{display:flex;gap:12px;align-items:flex-end;margin:-40px 10px 8px}
.pcard .ph{width:90px;height:112px;object-fit:contain;background:#2a2d31;border-radius:12px;border:3px solid #191a1c}
.stat{display:flex;gap:6px;margin:8px 0}.stat div{flex:1;background:#232527;border-radius:10px;padding:8px;text-align:center}.stat b{display:block;font-size:18px}
.gbanner{height:130px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:56px;font-weight:900;color:#fffc;margin-bottom:6px}
.gcard.worn{outline:2px solid #0d99ff}.pr{color:#ffd24d;font-weight:800;margin:4px 0}.thumb2{height:90px;display:flex;align-items:center;justify-content:center;font-size:40px;background:#2a2d31}
#ldg{position:fixed;inset:0;z-index:99990;background:#191a1c;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:20px}
#ldg .lgo{font-size:64px;color:#0d99ff}#ldg .lnm{font-size:22px;font-weight:800}#ldg .lbar{width:min(260px,70vw);height:6px;background:#333;border-radius:3px;overflow:hidden}
#ldg .lbar i{display:block;height:100%;width:0;background:#0d99ff;transition:width .3s}#ldg .ltip{color:#9a9da3;font-size:13px;max-width:280px}
#fpsb{position:fixed;left:6px;bottom:6px;z-index:99;font:11px monospace;color:#7f7;background:#0008;padding:2px 6px;border-radius:4px}
body.lh #joy{left:auto;right:24px}body.lh #jumpBtn{right:auto;left:24px}input[type=range]{accent-color:#0d99ff}`;
    document.head.appendChild(st);
    document.body.classList.toggle('lh', !!DB.get('lh', false));
  });

  /* ---------- shapes: triangle, cylinder, step-up ---------- */
  S('shapes', () => {
    if (!SHAPES.includes('wedge')) SHAPES.push('wedge');
    const pg0 = partGeo;
    partGeo = function (p, kind) {
      if (p.shape === 'wedge') {
        const w = p.w / 2, h = p.h / 2, d = p.d / 2, A = [-w, -h, -d], B = [w, -h, -d], C = [-w, -h, d], E = [w, -h, d], F = [-w, h, -d], G = [w, h, -d];
        const t = [A, C, F, B, G, E, A, B, E, A, E, C, A, F, G, A, G, B, F, C, E, F, E, G];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(...t), 3));
        g.computeVertexNormals();
        return g;
      }
      return pg0(p, kind);
    };
    const pm0 = partMat;
    partMat = function (p, flat, kind) { return pm0(p, p.shape === 'wedge' ? true : flat, kind); };

    const fit0 = Game.fit;
    Game.fit = function (o) {
      fit0.call(this, o);
      const p = o.p, b = o.box, R = rotMat(p);
      if (p.shape === 'cyl') b.ex = { t: 'c', c: [p.x, p.y, p.z], a: [R[0][0], R[1][0], R[2][0]], hh: p.w / 2, r: (p.h + p.d) / 4 };
      else if (p.shape === 'wedge') b.ex = { t: 'w', c: [p.x, p.y, p.z], A: [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]], e: [p.w / 2, p.h / 2, p.d / 2] };
    };

    const hx0 = hitEx;
    hitEx = function (c, px, py, pz, W, H) {
      if (c.t === 'c') { // cylinder: three sample spheres along the player's body
        const a = c.a; let best = null;
        for (const sy of [W, H / 2, H - W]) {
          const sx = px, y = py + sy, sz = pz;
          const dx = sx - c.c[0], dy = y - c.c[1], dz = sz - c.c[2], ax = dx * a[0] + dy * a[1] + dz * a[2];
          const rx = dx - ax * a[0], ry = dy - ax * a[1], rz = dz - ax * a[2], rl = Math.hypot(rx, ry, rz);
          const axc = clamp(ax, -c.hh, c.hh), k = rl > c.r ? c.r / rl : 1;
          const vx = sx - (c.c[0] + a[0] * axc + rx * k), vy = y - (c.c[1] + a[1] * axc + ry * k), vz = sz - (c.c[2] + a[2] * axc + rz * k);
          const L = Math.hypot(vx, vy, vz); if (L >= W) continue;
          let n, d;
          if (L < 1e-5) { n = rl > 1e-5 ? [rx / rl, ry / rl, rz / rl] : [0, 1, 0]; d = W + (c.r - rl); } else { n = [vx / L, vy / L, vz / L]; d = W - L; }
          if (!best || d > best.d) best = { n, d };
        }
        return best;
      }
      if (c.t === 'w') { // triangle prism: walkable slope, solid back and sides
        const A = c.A, e = c.e, d = [px - c.c[0], py - c.c[1], pz - c.c[2]], L = A.map(v => d[0] * v[0] + d[1] * v[1] + d[2] * v[2]);
        if (Math.abs(L[0]) > e[0] + W || Math.abs(L[2]) > e[2] + W) return null;
        const lz = clamp(L[2], -e[2], e[2]), ys = e[1] - e[1] * (lz + e[2]) / e[2];
        if (L[1] > ys || L[1] + H <= -e[1]) return null;
        const depth = ys - L[1], lim = Math.max(1.4, (Game.vy < 0 ? -Game.vy * 0.055 : 0) + 0.5);
        if (depth <= lim) return { n: [A[1][0], A[1][1], A[1][2]], d: depth };
        const o = [[L[2] + e[2] + W, [-A[2][0], -A[2][1], -A[2][2]]], [L[0] + e[0] + W, [-A[0][0], -A[0][1], -A[0][2]]], [e[0] + W - L[0], A[0]]];
        o.sort((a, b) => a[0] - b[0]);
        return { n: o[0][1], d: Math.max(0.001, o[0][0]) };
      }
      return hx0(c, px, py, pz, W, H);
    };

    // walking into a block up to 1.3 high steps up onto it
    Game.solidAt = function () {
      const p = this.p, W = this.W, H = this.H;
      return this.solid.some(b => !b.off && !b.ex && p.x + W > b.x0 && p.x - W < b.x1 && p.y + H > b.y0 && p.y < b.y1 && p.z + W > b.z0 && p.z - W < b.z1);
    };
    const mv0 = Game.move;
    Game.move = function (ax, d) {
      if (ax === 'y' || (this.lastState !== 'idle' && this.lastState !== 'walk')) return mv0.call(this, ax, d);
      const p = this.p, o = p[ax], oy = p.y, vx = this.vx, vz = this.vz;
      mv0.call(this, ax, d);
      if (Math.abs(p[ax] - (o + d)) < 1e-5) return;
      const bp = p[ax], bvx = this.vx, bvz = this.vz;
      p[ax] = o; p.y = oy + 1.3; this.vx = vx; this.vz = vz;
      mv0.call(this, ax, d);
      let ok = Math.abs(p[ax] - (o + d)) < 1e-5 && !this.solidAt();
      if (ok) { const g = this.groundAt(p.x, oy + 1.3, p.z); if (g > oy + 0.01 && g <= oy + 1.31) p.y = g; else ok = false; }
      if (!ok) { p[ax] = bp; p.y = oy; this.vx = bvx; this.vz = bvz; }
    };
    Game.MAX_DYN = 1000;

    // accessories keep shape + rotation
    const cp0 = Subs.cleanParts.bind(Subs);
    Subs.cleanParts = function (parts, max) {
      const r = cp0(parts, max);
      (Array.isArray(parts) ? parts : []).slice(0, max).forEach((p, i) => {
        r[i].shape = SHAPES.includes(p && p.shape) ? p.shape : 'block';
        r[i].rx = num(p && p.rx, -360, 360, 0); r[i].ry = num(p && p.ry, -360, 360, 0); r[i].rz = num(p && p.rz, -360, 360, 0);
        r[i].t = num(p && p.t, 0, 1, 0);
      });
      return r;
    };
    const mk1 = makeAvatar;
    makeAvatar = function (col, items, pack, face) {
      const av = mk1(col, items, pack, face);
      try {
        const P = av.parts, rig = av.g.children[0], host = k => k === '' ? rig : k === 'torso' ? P.torso.parent : P[k].parent;
        av.itemMeshes.forEach(m => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); });
        av.itemMeshes.length = 0;
        (items || []).forEach(it => (it.parts || []).forEach(p => {
          const key = ATTACH.includes(p.attach) ? p.attach : '', o = ATTACH_ORIGIN[key];
          const m = new THREE.Mesh(partGeo({ w: p.w, h: p.h, d: p.d, shape: p.shape || 'block' }, ''), new THREE.MeshLambertMaterial({ color: p.color }));
          m.position.set(p.x - o[0], p.y - o[1], p.z - o[2]);
          m.rotation.order = 'YXZ'; m.rotation.set((p.rx || 0) * D2, (p.ry || 0) * D2, (p.rz || 0) * D2); m.castShadow = true;
          host(key).add(m); av.itemMeshes.push(m);
        }));
      } catch (e) { dbg('items', e); }
      return av;
    };
  });

  /* ---------- Studio additions ---------- */
  S('studio', () => {
    if (!SPECIAL.includes('SV')) SPECIAL.push('SV');
    const rp0 = Studio.rootPar.bind(Studio);
    Studio.rootPar = r => r === 'SV' ? 'SV' : rp0(r);
    Studio.toSV = function () {
      const ns = this.sel.map(id => this.node(id)).filter(n => n && ['model', 'part', 'folder'].includes(n.type));
      if (!ns.length) return uiAlert('Select a Model or Part first.');
      this.push(); ns.forEach(n => { n.parent = 'SV'; }); this.sel = ns.map(n => n.id);
      this.rebuildAll(); this.changed(true); toast('Moved to ServerStorage');
    };
    Studio.toWS = function () {
      const ns = this.sel.map(id => this.node(id)).filter(n => n && (n.parent === 'SP' || n.parent === 'SV'));
      if (!ns.length) return uiAlert('Select something inside StarterPack or ServerStorage first.');
      this.push(); ns.forEach(n => { n.parent = null; }); this.sel = ns.map(n => n.id);
      this.rebuildAll(); this.changed(true); toast('Moved to Workspace');
    };
    ['[data-tool=rotate]', '[data-act=addBall]', '[data-act=addCyl]'].forEach(s => { const e = $q('#stRibbon ' + s); if (e) e.classList.remove('only-map'); });
    const ps = $q('#pshape');
    if (ps) {
      if (![...ps.options].some(o => o.value === 'wedge')) ps.add(new Option('Triangle (wedge)', 'wedge'));
      const w = ps.closest('.only-map'); if (w) w.classList.remove('only-map');
    }
    const cyl = $q('#stRibbon [data-act=addCyl]');
    if (cyl) cyl.insertAdjacentHTML('afterend', '<button data-act="addWedge"><i>◣</i>Triangle</button>');
    const tw = $q('#stRibbon [data-act=toWS]');
    if (tw) tw.insertAdjacentHTML('afterend', '<button data-act="toSV" class="only-map"><i>🗄</i>→ ServerStorage</button>');
    const bw = $q('#stRibbon [data-act=addWedge]'), bs = $q('#stRibbon [data-act=toSV]');
    if (bw) bw.onclick = () => Studio.add(St.type === 'avatar' ? { name: 'Wedge', shape: 'wedge', w: 1.5, h: 1.5, d: 1.5, color: '#fbc02d' } : { name: 'Wedge', shape: 'wedge', w: 4, h: 4, d: 4, y: 3, color: '#fbc02d' });
    if (bs) bs.onclick = () => Studio.toSV();
    $q('#propForm').addEventListener('change', e => {
      if (St.type !== 'avatar' || !['pshape', 'prx', 'pry', 'prz', 'ptr'].includes(e.target.id)) return;
      const p = Studio.prim(); if (!p || p.type !== 'part') return;
      const n = (id, d) => { const v = parseFloat($q('#' + id).value); return isNaN(v) ? d : v; };
      Studio.patch({ shape: $q('#pshape').value, rx: clamp(n('prx', p.rx || 0), -360, 360), ry: clamp(n('pry', p.ry || 0), -360, 360), rz: clamp(n('prz', p.rz || 0), -360, 360), t: clamp(n('ptr', p.t || 0), 0, 1) });
    });
    // Explorer with ServerStorage
    St.explorer = function () {
      const s = Studio, N = s.nodes, m = Tree.map(N), by = { WS: [], SS: [], SP: [], SG: [], ST: [], SV: [] };
      N.forEach(n => { const k = n.parent || 'WS'; (by[k] = by[k] || []).push(n); });
      const icon = n => {
        if (n.type === 'model') return isItemName(n.name) ? '🗡' : '📦';
        const t = { folder: '📁', gui: '🖼', btn: '🔘', lbl: '🏷', remote: '📡', rfunc: '🔁' }[n.type]; if (t) return t;
        if (n.type === 'module') return n.off ? '⛔' : '📚'; if (n.type === 'script') return n.off ? '⛔' : '📜'; if (n.type === 'localscript') return n.off ? '⛔' : '🖥';
        if (this.type === 'avatar') return n.shape === 'ball' ? '⚽' : n.shape === 'cyl' ? '🛢' : n.shape === 'wedge' ? '◣' : '🧱';
        const k = Tree.info(m, n).kind;
        return n.spawn ? '🏁' : k === 'water' ? '💧' : k === 'lava' ? '🔥' : k === 'ladder' ? '🪜' : k === 'pad' ? '⏫' : k === 'seat' ? '🪑' : n.shape === 'ball' ? '⚽' : n.shape === 'cyl' ? '🛢' : n.shape === 'wedge' ? '◣' : '🧱';
      };
      const row = (n, d) => {
        const kids = by[n.id] || [], has = kids.length > 0, open = n.open !== false;
        let h = `<div class="tr ${s.sel.includes(n.id) ? 'sel' : ''}" style="padding-left:${6 + d * 14}px" data-i="${n.id}"><span class="tg" ${has ? `data-t="${n.id}"` : ''}>${has ? (open ? '▾' : '▸') : ''}</span>${icon(n)} ${esc(n.name)}</div>`;
        if (has && open) kids.forEach(k => { h += row(k, d + 1); });
        return h;
      };
      const sec = (t, k) => `<div class="tr hd">${t}</div>` + (by[k] || []).map(n => row(n, 1)).join('');
      const el = $q('#stExpBody'), top = el.scrollTop;
      el.innerHTML = this.type === 'map' ? sec('🌐 Workspace', 'WS') + sec('📜 ServerScript', 'SS') + sec('🎒 StarterPack', 'SP') + sec('🖼 StarterGui', 'SG') + sec('📡 StoreServer', 'ST') + sec('🗄 ServerStorage', 'SV') : sec('🎩 Accessory', 'WS');
      el.scrollTop = top;
    };
  });

  /* ---------- ServerStorage, Items module, give items ---------- */
  S('sv', () => {
    const gs1 = Game.start;
    Game.start = function (m, a, o) {
      this.tpl = {}; this.tplItems = [];
      try {
        const nodes = Tree.norm(m.parts);
        nodes.filter(n => n.parent === 'SV').forEach(top => {
          const sub = Tree.sub(nodes, [top.id]), ps = nodes.filter(n => n.type === 'part' && sub.has(n.id));
          if (top.type === 'model' && isItemName(top.name)) this.tplItems.push({ name: top.name.replace(/^item-/i, '') || 'Item', parts: ps });
          else this.tpl[top.name] = ps;
        });
      } catch (e) { dbg('tpl', e); }
      const was = !LD.classList.contains('hidden');
      if (!was) showLoad((o && o.gname) || 'Game', '');
      const r = gs1.call(this, m, a, o);
      setTimeout(hideLoad, was ? 0 : 700);
      return r;
    };
    const svCode = G => {
      const T = {};
      Object.keys(G.tpl || {}).forEach(k => { T[k] = G.tpl[k].map(p => ({ name: p.name, x: p.x, y: p.y, z: p.z, w: p.w, h: p.h, d: p.d, color: p.color, shape: p.shape, rx: p.rx, ry: p.ry, rz: p.rz, t: p.t, anch: p.anch, col: p.col })); });
      return `const TPL=${JSON.stringify(T)};const SS={};SS.list=()=>Object.keys(TPL);
SS.spawn=(name,pos)=>{const t=TPL[name];if(!t)throw new Error('ServerStorage: no template named '+name);pos=pos||{};
let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9;t.forEach(p=>{x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);});
const cx=(x0+x1)/2,cy=(y0+y1)/2,cz=(z0+z1)/2;
return t.map(p=>workspace.spawn({name:p.name,x:(pos.x||0)+p.x-cx,y:(pos.y||0)+p.y-cy,z:(pos.z||0)+p.z-cz,w:p.w,h:p.h,d:p.d,color:p.color,shape:p.shape,rx:p.rx,ry:p.ry,rz:p.rz,transparency:p.t,anchored:p.anch!==false,canCollide:p.col!==false}));};
return SS;`;
    };
    const itemsCode = "const I={};I.give=(p,n)=>remote.fireClient(p,'__give',{item:String(n)});I.remove=(p,n)=>remote.fireClient(p,'__take',{item:String(n)});return I;";
    [ScriptHost, LocalHost].forEach(H => {
      const s0 = H.start;
      H.start = function (G, scripts, snap, mods) {
        return s0.call(this, G, scripts, snap, (mods || []).concat([{ name: 'ServerStorage', code: svCode(G) }, { name: 'Items', code: itemsCode }]));
      };
    });
    const ro0 = Game.remoteOp;
    Game.remoteOp = function (mode, m) {
      if (mode === 'server' && m.op === 'remc' && (m.n === '__give' || m.n === '__take')) {
        const d = cleanD(m.d) || {}, item = String(d.item || '').slice(0, 30), to = String(m.to || '*'), t = m.n === '__give' ? 'give' : 'take';
        if (to === '*' || to === this.myId) this.itemOp(t, item);
        if (this.net && Net.isHost) { if (to === '*') Net.send({ t, item }); else if (this.remote[to]) Net.sendTo(to, { t, item }); }
        return;
      }
      return ro0.call(this, mode, m);
    };
    Game.itemOp = function (t, name) {
      if (this.dead) return;
      if (t === 'give') {
        if (this.tools.some(x => x.name === name) || this.tools.length >= 8) return;
        const it = (this.tplItems || []).find(x => x.name === name); if (!it) return;
        this.tools.push(it); this.buildHotbar(); if (this.tool >= 0) [...byId('hotbar').children].forEach((b, j) => b.classList.toggle('on', j === this.tool));
      } else {
        const i = this.tools.findIndex(x => x.name === name); if (i < 0) return;
        if (this.tool === i) this.dropTool(); else if (this.tool > i) this.tool--;
        this.tools.splice(i, 1); this.buildHotbar(); if (this.tool >= 0) [...byId('hotbar').children].forEach((b, j) => b.classList.toggle('on', j === this.tool));
      }
    };
    const on1 = Game.onNet;
    Game.onNet = function (m, from) {
      if (m && (m.t === 'give' || m.t === 'take')) { if (this.running && !Net.isHost) this.itemOp(m.t, String(m.item || '').slice(0, 30)); return; }
      return on1.call(this, m, from);
    };
    const gs0 = Game.stop;
    Game.stop = function () { try { hideLoad(); if (this.menuSh) Ui.close(this.menuSh); } catch (e) {} return gs0.call(this); };
  });

  /* ---------- catalog: shop items shared through the lobby (signed by the owner) ---------- */
  const Catalog = {
    busy: false, t: 0,
    kick() { this.t = 0; },
    cleanItem(i) {
      if (!i || typeof i !== 'object' || !/^[a-z0-9]{3,30}$/i.test(String(i.id))) return null;
      return { id: String(i.id), subId: String(i.subId || '').slice(0, 30), name: String(i.name || '').slice(0, 30), desc: String(i.desc || '').slice(0, 120), creator: String(i.creator || '').slice(0, 20), creatorKey: String(i.creatorKey || '').slice(0, 20), slot: SLOTS.includes(i.slot) ? i.slot : 'Hat', parts: Subs.cleanParts(i.parts, CONFIG.MAX_ACC_PARTS), price: clamp(Math.floor(+i.price || 0), 0, CONFIG.MAX_PRICE), limited: !!i.limited, stock: clamp(Math.floor(+i.stock || 1), 1, CONFIG.MAX_STOCK), sold: clamp(Math.floor(+i.sold || 0), 0, CONFIG.MAX_STOCK), recolor: !!i.recolor, down: !!i.down, downNote: String(i.downNote || '').slice(0, 80), time: +i.time || 0 };
    },
    lim(o, i) { return Object.assign(o, { id: String(i.id).slice(0, 24), name: String(i.name || '').slice(0, 24), price: clamp(Math.floor(+i.price || 0), 0, CONFIG.MAX_PRICE), limited: !!i.limited, stock: clamp(Math.floor(+i.stock || 1), 1, CONFIG.MAX_STOCK), sold: clamp(Math.floor(+i.sold || 0), 0, CONFIG.MAX_STOCK), down: !!i.down, downNote: String(i.downNote || '').slice(0, 80) }); },
    cleanPack(p) { return p && p.id ? this.lim({ anims: Packs.clean(p.anims), body: Packs.cleanBody(p.body), model: Packs.cleanModel(p.model) }, p) : null; },
    cleanFace(f) { return f && f.id ? this.lim({ spec: Faces.clean(f.spec) }, f) : null; },
    cleanEmote(e) { const c = EM() && EM().clean(e); return c && e.id ? this.lim({ len: c.len, loop: c.loop, keys: c.keys }, e) : null; },
    async build() {
      if (!Mod.ok() || !Auth.isAdmin() || !g0('modkey', null)) return null;
      const cat = { items: g0('items', []), packs: g0('packs', []), faces: g0('faces', []), emotes: g0('emotes', []), rej: g0('modrej', []).slice(-100) };
      const h = JSON.stringify(cat);
      if (h === g0('cathash', '') && g0('catpack', null)) return g0('catpack', null);
      const s = JSON.stringify(Object.assign({ v: Date.now() }, cat));
      if (s.length > 900000) { toast('Catalog is too large'); return null; }
      const sig = await Mod.sign(s); if (!sig) return null;
      DB.set('catpack', { s, sig }); DB.set('cathash', h);
      return { s, sig };
    },
    async take(p) {
      if (!p || !(await Mod.verify(p))) return false;
      let l; try { l = JSON.parse(p.s); } catch (e) { return false; }
      const cur = g0('catalog', null); if (cur && cur.v >= l.v) return false;
      const arr = (a, f) => (Array.isArray(a) ? a : []).slice(0, 400).map(f).filter(Boolean);
      const c = {
        v: +l.v || 0, items: arr(l.items, x => this.cleanItem(x)), packs: arr(l.packs, x => this.cleanPack(x)), faces: arr(l.faces, x => this.cleanFace(x)), emotes: arr(l.emotes, x => this.cleanEmote(x)),
        rej: arr(l.rej, r => r && /^[a-z0-9]+$/i.test(String(r.id)) ? { id: String(r.id), k: String(r.k || '').slice(0, 20), r: String(r.r || '').slice(0, 60), code: String(r.code || '').slice(0, 400) } : null)
      };
      DB.set('catalog', c); if (!Auth.isAdmin()) DB.set('catpack', p);
      this.after(c);
      if (['shop', 'avatar'].includes(tab) && !Game.running && !Studio.active && byId('modal').classList.contains('hidden')) render();
      return true;
    },
    after(c) {
      const me = Auth.key(); if (!me) return;
      const pend = DB.pending(); let ch = false;
      pend.forEach(s => {
        if (s.creatorKey !== me || s.status !== 'pending') return;
        if (c.items.some(i => i.subId === s.id)) { s.status = 'approved'; ch = true; Subs.mark(s, 'approved', ''); toast('Your accessory "' + s.name + '" was approved!'); }
        const r = c.rej.find(x => x.id === s.id);
        if (r) { s.status = 'rejected'; s.note = r.r; ch = true; Voucher.redeem(r.code, me); Subs.mark(s, 'rejected', r.r); toast('"' + s.name + '" was rejected. Fee refunded.'); }
      });
      if (ch) DB.set('pending', pend);
    },
    addSub(s) {
      if (!s || typeof s !== 'object' || !/^[a-z0-9]{3,30}$/i.test(String(s.id)) || !s.name || !s.creatorKey) return;
      try { if (JSON.stringify(s).length > 60000) return; } catch (e) { return; }
      if (Lobby.subq.some(x => x.id === s.id) || Lobby.subq.length >= 40) return;
      Lobby.subq.push(s);
    },
    post(m) {
      if (Lobby.role === 'dir') { if (m.t === 'sub') this.addSub(m.sub); return; }
      Lobby.talk(m, (r, c, f) => { if (r.t === 'ok') f('ok'); }, res => { if (res === 'none' && typeof Peer !== 'undefined') Lobby.claim(ok => { if (ok && m.t === 'sub') this.addSub(m.sub); }); });
    },
    pull() {
      if (!Auth.isAdmin()) return;
      const go = list => {
        let n = 0;
        (list || []).slice(0, 40).forEach(s => { try { if (s && s.id && !DB.pending().some(x => x.id === s.id) && !DB.items().some(i => i.subId === s.id) && !Subs.importCode(Subs.exportCode(s))) n++; } catch (e) {} });
        if (n) { toast(n + ' new accessory submission' + (n > 1 ? 's' : '')); if (tab === 'admin') render(); }
      };
      if (Lobby.role === 'dir') { const l = Lobby.subq; Lobby.subq = []; return go(l); }
      Lobby.talk({ t: 'getsubs' }, (m, c, f) => { if (m.t === 'subs') { go(m.list); f('ok'); } }, () => {});
    },
    sync(mine) {
      const have = (g0('catalog', null) || { v: 0 }).v;
      if (Lobby.role === 'dir') { if (!Auth.isAdmin()) { const cp = g0('catpack', null); if (cp) this.take(cp); } return; }
      Lobby.talk({ t: 'cat', have: Auth.isAdmin() ? Number.MAX_SAFE_INTEGER : have, pack: mine || undefined }, (m, c, f) => { if (m.t === 'catr') { if (m.pack && !Auth.isAdmin()) this.take(m.pack); f('ok'); } }, () => {});
    },
    resend() {
      const me = Auth.key(); let n = 0;
      DB.pending().forEach(s => { if (s.creatorKey === me && s.status === 'pending' && n < 4) { n++; this.post({ t: 'sub', sub: s }); } });
    },
    async run() {
      if (this.busy) return; this.busy = true;
      try { if (Auth.isAdmin()) { const p = await this.build(); this.sync(p); this.pull(); } else { this.sync(null); this.resend(); } } catch (e) { dbg('catalog', e); }
      this.busy = false;
    }
  };
  window.Catalog = Catalog;

  S('catalog', () => {
    DB.get = function (k, d) {
      const v = g0(k, d);
      if ((k === 'items' || k === 'packs' || k === 'faces' || k === 'emotes') && !Auth.isAdmin()) {
        const c = g0('catalog', null), l = c && c[k];
        if (Array.isArray(l) && l.length) {
          const m = new Map(); (Array.isArray(v) ? v : []).forEach(x => m.set(x.id, x));
          l.forEach(x => { const o = m.get(x.id); m.set(x.id, o ? Object.assign({}, x, { sold: Math.max(o.sold || 0, x.sold || 0) }) : x); });
          return [...m.values()];
        }
      }
      return v;
    };
    Lobby.subq = [];
    const sv0 = Lobby.serve;
    Lobby.serve = function (c) {
      sv0.call(this, c);
      c.on('data', m => {
        if (!m || typeof m !== 'object') return;
        const send = x => { try { c.send(x); } catch (_) {} };
        if (m.t === 'cat') {
          (async () => {
            if (m.pack && await Mod.verify(m.pack)) {
              let cv = 0, nv = 0; try { cv = JSON.parse(g0('catpack', null).s).v; } catch (e) {} try { nv = JSON.parse(m.pack.s).v; } catch (e) {}
              if (nv > cv) { DB.set('catpack', m.pack); if (!Auth.isAdmin()) Catalog.take(m.pack); }
            }
            const cp = g0('catpack', null); let v = 0; try { v = cp ? JSON.parse(cp.s).v : 0; } catch (e) {}
            send(cp && v > (+m.have || 0) ? { t: 'catr', pack: cp } : { t: 'catr' });
          })();
        } else if (m.t === 'sub') { Catalog.addSub(m.sub); send({ t: 'ok' }); }
        else if (m.t === 'getsubs') { send({ t: 'subs', list: this.subq }); this.subq = []; }
      });
    };
    const sb0 = Subs.submit.bind(Subs);
    Subs.submit = function (me, d, meta) {
      const r = sb0(me, d, meta);
      if (r && typeof r === 'object' && !Auth.isAdmin()) Catalog.post({ t: 'sub', sub: r });
      return r;
    };
    const rj0 = Subs.reject.bind(Subs);
    Subs.reject = function (id, reason) {
      const s = DB.pending().find(x => x.id === id), r = rj0(id, reason);
      if (s && r && !r.err && r.code) { const l = g0('modrej', []); l.push({ id: s.id, k: s.creatorKey, r: String(reason).slice(0, 60), code: r.code }); DB.set('modrej', l.slice(-100)); }
      Catalog.kick(); return r;
    };
    ['approve', 'takedown', 'restore'].forEach(k => { const f = Subs[k].bind(Subs); Subs[k] = function () { const r = f.apply(null, arguments); Catalog.kick(); return r; }; });
    setInterval(() => {
      if (!Auth.key() || typeof Peer === 'undefined' || Game.running) return;
      const now = Date.now(); if (now - Catalog.t < (Auth.isAdmin() ? 25000 : 60000)) return;
      Catalog.t = now; Catalog.run();
    }, 5000);
  });

  /* ---------- presence: online / in studio / playing ---------- */
  S('presence', () => {
    setInterval(() => {
      if (!Auth.key()) return;
      if (Game.running && Net.live) return;
      Lobby.pres = DB.get('priv_' + Auth.key(), false) ? null : Studio.active ? { gid: 'studio', slot: 1, gname: 'Studio' } : { gid: 'online', slot: 1, gname: '' };
      if (!Game.running && ['home', 'profile'].includes(tab) && Date.now() - Lobby.last > 25000) Lobby.sync();
    }, 3000);
  });

  /* ---------- helpers ---------- */
  const hue2 = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const favs = () => DB.get('fav_' + Auth.key(), []);
  const prof = k => Object.assign({ bio: '', status: '', c1: '#0d99ff', c2: '#8e24aa' }, DB.get('prof_' + k, {}));
  const pdot = c => '<span class="pd ' + c + '"></span>';
  function status(name) {
    const k = String(name).toLowerCase();
    if (k === Auth.key()) return { c: 'on', t: 'Online' };
    const p = Lobby.fpres[k];
    if (!p) return { c: '', t: 'Offline' };
    if (p.gid === 'studio') return { c: 'st', t: 'In Studio' };
    if (p.gid === 'online') return { c: 'on', t: 'Online' };
    return { c: 'on', t: 'Playing ' + p.gname, p };
  }
  function allGames() {
    const m = new Map();
    DB.games().forEach(g => { if (g.listed === false || g.down || Mod.blocked(g.id)) return; m.set(g.id, { id: g.id, name: g.name, author: g.author, owner: g.authorKey, max: g.maxPlayers || 8, visits: (g.visitors || []).length, desc: g.desc || '', time: g.time || 0 }); });
    Lobby.list.forEach(g => { if (!m.has(g.id) && !Mod.blocked(g.id)) m.set(g.id, { id: g.id, name: g.name, author: g.author, owner: g.owner, max: g.max, visits: 0, desc: g.desc, time: g.v || 0 }); });
    DB.get('recent', []).forEach(id => { const r = DB.get('rc_' + id, null); if (r && !m.has(id) && !Mod.blocked(id)) m.set(id, { id, name: r.meta.name, author: r.meta.author || '', owner: '', max: r.meta.maxPlayers || 8, visits: 0, desc: '', time: 0 }); });
    return [...m.values()];
  }
  const gcard = g => { const h = hue2(g.id); return `<div class="gc" data-g="${g.id}"><div class="th" style="background:linear-gradient(135deg,hsl(${h},60%,48%),hsl(${(h + 45) % 360},60%,26%))">${esc((g.name || '?')[0].toUpperCase())}</div><div class="gi"><b>${esc(g.name)}</b><div class="muted">${g.visits ? '👤 ' + g.visits + ' · ' : ''}${esc(g.author || '')}</div></div></div>`; };
  const bindCards = el => { el.querySelectorAll('[data-g]').forEach(c => { c.onclick = () => Play.page(c.dataset.g); }); el.querySelectorAll('[data-u]').forEach(c => { c.onclick = () => window.openUser(c.dataset.u); }); };
  const hrow = (t, l) => l.length ? `<div class="sec">${t}</div><div class="hrow">${l.map(gcard).join('')}</div>` : '';
  const shotCache = {};
  function shot(av, head) {
    const ck = (head ? 'h' : 'f') + JSON.stringify([av.colors, (av.items || []).map(i => i.id + (i.parts && i.parts[0] ? i.parts[0].color : '')), av.pack && av.pack.id, av.face]);
    if (shotCache[ck]) return shotCache[ck];
    try {
      if (!Thumb.r) Thumb.get({ id: '__init', parts: [] });
      const r = Thumb.r, s = new THREE.Scene();
      s.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.95)); const dl = new THREE.DirectionalLight(0xffffff, 0.5); dl.position.set(5, 10, 8); s.add(dl);
      const cam = new THREE.PerspectiveCamera(head ? 28 : 40, 0.8, 0.1, 100);
      if (head) { cam.position.set(0, 4.7, 6.5); cam.lookAt(0, 4.6, 0); } else { cam.position.set(0, 3, 13); cam.lookAt(0, 2.8, 0); }
      const a = makeAvatar(av.colors, av.items || [], av.pack, av.face); s.add(a.g); a.anim(0, 'idle', 0.016, 0);
      r.render(s, cam);
      return shotCache[ck] = r.domElement.toDataURL('image/png');
    } catch (e) { return ''; }
  }
  const myShot = (me, head) => shot(Wear.resolve(me.key), head);
  const faceShot = spec => shot({ colors: DEFAULT_COLORS, items: [], pack: null, face: spec }, true);
  function reportTo(name, reason) {
    const l = DB.reports(); l.push({ id: uid(), name: String(name), game: Game.gname || '-', reason: reason + ' (by ' + ((Auth.me() || {}).name || '?') + ')', time: Date.now() });
    DB.set('reports', l.slice(-100)); toast('Report sent');
  }

  /* ---------- loading screen ---------- */
  const LD = document.createElement('div');
  LD.id = 'ldg'; LD.className = 'hidden';
  LD.innerHTML = '<div class="lgo">✷</div><div class="lnm" id="ldgN"></div><div class="muted" id="ldgB"></div><div class="lbar"><i id="ldgF"></i></div><div class="ltip" id="ldgT"></div>';
  document.body.appendChild(LD);
  const TIPS = ['Tap the screen while holding an item to use it.', 'Jump to stand up from a seat.', 'Add friends from the Profile tab.', 'Press the ✷ button to open the menu.', 'Water slows you down. Lava is dangerous!', 'Press 😀 to play an emote.'];
  let ldI = null;
  function showLoad(name, by) {
    byId('ldgN').textContent = name || 'Loading'; byId('ldgB').textContent = by ? 'by ' + by : '';
    byId('ldgT').textContent = 'Tip: ' + TIPS[Math.floor(Math.random() * TIPS.length)];
    const f = byId('ldgF'); f.style.width = '5%'; LD.classList.remove('hidden');
    clearInterval(ldI); let w = 5; ldI = setInterval(() => { w = Math.min(92, w + 4); f.style.width = w + '%'; }, 400);
  }
  function hideLoad() {
    clearInterval(ldI); const f = byId('ldgF'); if (f) f.style.width = '100%';
    setTimeout(() => LD.classList.add('hidden'), 150);
  }
  S('play', () => {
    const go0 = Play.go;
    Play.go = function (meta, data, slot) {
      showLoad(meta && meta.name, meta && meta.author);
      const r = go0.call(this, meta, data, slot);
      const w = setInterval(() => { if (Game.running || !Play.busy) { clearInterval(w); hideLoad(); } }, 250);
      return r;
    };
    const l0 = Play.launch;
    Play.launch = function (id, slot) {
      try { const k = Auth.key(); const l = DB.get('played_' + k, []).filter(x => x !== id); l.unshift(id); DB.set('played_' + k, l.slice(0, 20)); } catch (e) {}
      return l0.call(this, id, slot);
    };

    // game page
    Play.page = function (id) {
      if (!/^[a-z0-9]{4,24}$/.test(id)) return toast('Invalid code');
      const why = Mod.blocked(id); if (why) return toast(why);
      const m = this.metaOf(id), h = hue2(id); let fav = favs().includes(id);
      modal(m.name, `<div class="gbanner" style="background:linear-gradient(135deg,hsl(${h},60%,48%),hsl(${(h + 45) % 360},60%,26%))">${esc((m.name || '?')[0].toUpperCase())}</div>
        <p class="muted">by ${esc(m.author || 'unknown')} ${m.owner && Auth.isVerified(m.owner) ? '<span class="vb">✔</span>' : ''} · Max ${m.max} players</p><p>${esc(m.desc || '')}</p>
        <div class="row2"><button id="gpP" style="flex:3">▶ Play</button><button class="gray" id="gpF">${fav ? '♥' : '♡'}</button><button class="gray" id="gpS">🔗</button><button class="gray" id="gpR">⚠</button></div>
        <h3 style="margin-top:8px">Servers</h3><div id="svl" class="muted">Looking for servers...</div>`, [{ label: 'Close', cls: 'gray' }]);
      byId('gpP').onclick = () => { closeModal(); Play.launch(id, 0); };
      byId('gpF').onclick = () => { let l = favs(); fav = !fav; l = fav ? l.concat(id) : l.filter(x => x !== id); DB.set('fav_' + Auth.key(), l); byId('gpF').textContent = fav ? '♥' : '♡'; };
      byId('gpS').onclick = () => showText('Game code', 'Friends press "Join by code" and paste this.', id);
      byId('gpR').onclick = () => reportTo('Game: ' + m.name, 'Game reported');
      this.newSlot = 1;
      Net.probe(id, res => {
        const box = byId('svl'); if (!box) return;
        const used = res.filter(r => !r.empty).map(r => r.slot); let s = 1; while (used.includes(s)) s++; Play.newSlot = s;
        const live = res.filter(r => !r.empty);
        box.innerHTML = (live.length ? live.map(r => `<div class="part"><span>Server ${r.slot} · ${r.n}/${r.max}</span><span><button class="sm" data-j="${r.slot}" ${r.n >= r.max ? 'disabled' : ''}>Join</button></span></div>`).join('') : 'No server is running yet.') + '<button class="gray sm" id="gpN" style="margin-top:6px">＋ New server</button>';
        box.querySelectorAll('[data-j]').forEach(b => { b.onclick = () => { closeModal(); Play.launch(id, +b.dataset.j); }; });
        byId('gpN').onclick = () => { closeModal(); Play.launch(id, Play.newSlot || 1); };
      });
    };
  });

  /* ---------- pause menu in game, FPS counter, volume ---------- */
  S('ingame', () => {
    Game.askLeave = function () {
      if (this.menuSh) { Ui.close(this.menuSh); return; }
      const G = this, fr = Social.d().list;
      const sh = Ui.sheet(`<h3>${esc(G.gname)}</h3><div class="tabs"><button class="on" data-t="pl">Players</button><button data-t="st">Settings</button></div><div id="pmB"></div><button id="pmRes">Resume</button><button class="gray" id="pmRst">Reset character</button><button class="red" id="pmLv">Leave game</button>`);
      G.menuSh = sh; sh.onclose = () => { G.menuSh = null; };
      const B = sh.querySelector('#pmB');
      const players = () => {
        const l = [{ n: G.pname, me: 1 }].concat(Object.values(G.remote).map(r => ({ n: r.name })));
        B.innerHTML = l.map(p => { const k = p.n.toLowerCase(); return `<div class="part"><span>${esc(p.n)} ${Auth.isVerified(k) ? '<span class="vb">✔</span>' : ''}${p.me ? ' <span class="muted">(you)</span>' : ''}</span><span>${p.me ? '' : (fr.includes(k) ? '' : `<button class="sm" data-a="${esc(p.n)}">＋ Friend</button>`) + `<button class="sm gray" data-r="${esc(p.n)}">⚠</button>`}</span></div>`; }).join('');
        B.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => { Social.add(b.dataset.a); b.disabled = true; }; });
        B.querySelectorAll('[data-r]').forEach(b => { b.onclick = () => { reportTo(b.dataset.r, 'Reported in game'); b.disabled = true; }; });
      };
      const sets = () => {
        B.innerHTML = `<div class="part"><span>Sound</span><input type="checkbox" id="pmS" ${Sfx.on() ? 'checked' : ''}></div><div class="part"><span>Volume</span><input type="range" id="pmV" min="0" max="100" value="${Math.round(DB.get('vol', 1) * 100)}"></div><div class="part"><span>Show FPS</span><input type="checkbox" id="pmF" ${DB.get('fps', false) ? 'checked' : ''}></div>`;
        byId('pmS').onchange = e => DB.set('mute', !e.target.checked); byId('pmV').oninput = e => DB.set('vol', e.target.value / 100); byId('pmF').onchange = e => DB.set('fps', e.target.checked);
      };
      sh.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => { sh.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); if (b.dataset.t === 'pl') players(); else sets(); }; });
      players();
      sh.querySelector('#pmRes').onclick = () => Ui.close(sh);
      sh.querySelector('#pmRst').onclick = () => { Ui.close(sh); G.die(); };
      sh.querySelector('#pmLv').onclick = () => { Ui.close(sh); G.leave(); };
    };
    const t0 = Sfx.tone;
    Sfx.tone = function (a, b, c, d, v) { return t0.call(this, a, b, c, d, (v || 0.06) * DB.get('vol', 1)); };
    const fp = document.createElement('div'); fp.id = 'fpsb'; fp.style.display = 'none'; document.body.appendChild(fp);
    let n = 0, last = performance.now();
    const tick = t => { n++; if (t - last > 500) { if (DB.get('fps', false) && Game.running) { fp.style.display = 'block'; fp.textContent = Math.round(n * 1000 / (t - last)) + ' FPS'; } else fp.style.display = 'none'; n = 0; last = t; } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });

  /* ---------- views ---------- */
  let dq = '', dsort = 'pop', avTab = 'items', avP = 'head', shopCat = 'all';

  V.home = (el, me) => {
    const g = allGames(), f = Social.names(), fv = favs(), pl = DB.get('played_' + me.key, []);
    const by = ids => ids.map(i => g.find(x => x.id === i)).filter(Boolean);
    const own = new Set(DB.games().map(x => x.id));
    el.innerHTML = `<div class="card hello"><img id="hsImg" class="hs" alt=""><div><h3>Hello, ${esc(me.name)} ${Auth.isVerified(me.key) ? '<span class="vb">✔</span>' : ''}</h3><div class="muted">${pdot('on')} Online</div></div></div>` +
      `<div class="sec">Friends</div>` + (f.length ? `<div class="hrow">${f.map(n => { const s = status(n); return `<div class="fa" data-u="${esc(n)}"><div class="av">${esc(n[0].toUpperCase())}${pdot(s.c)}</div><div class="fn">${esc(n)}</div></div>`; }).join('')}</div>` : '<div class="muted">Add friends from your Profile.</div>') +
      hrow('Continue playing', by(pl)) + hrow('Favorites', by(fv)) + hrow('Popular', g.slice().sort((a, b) => b.visits - a.visits).slice(0, 12)) +
      hrow('New', g.slice().sort((a, b) => b.time - a.time).slice(0, 12)) + hrow('Online games', g.filter(x => !own.has(x.id)).slice(0, 12)) +
      (g.length ? '' : '<div class="card muted">No games yet. Publish one from the Create tab, or press Join by code in Discover.</div>');
    byId('hsImg').src = myShot(me, true); bindCards(el);
  };

  V.discover = (el, me) => {
    el.innerHTML = `<div class="row2"><input id="dq" placeholder="🔍 Search games or players" value="${esc(dq)}"><button class="gray" onclick="joinCode()">🔗 Code</button></div>
      <div class="chips">${[['pop', 'Popular'], ['new', 'New'], ['fav', 'Favorites'], ['mine', 'Mine']].map(s => `<button class="chip ${dsort === s[0] ? 'on' : ''}" data-s="${s[0]}">${s[1]}</button>`).join('')}</div><div id="dres"></div>`;
    const draw = () => {
      const q = dq.toLowerCase(), fv = favs();
      let l = allGames().filter(x => !q || x.name.toLowerCase().includes(q) || (x.author || '').toLowerCase().includes(q));
      if (dsort === 'fav') l = l.filter(x => fv.includes(x.id)); if (dsort === 'mine') l = l.filter(x => x.owner === me.key);
      l.sort(dsort === 'new' ? (a, b) => b.time - a.time : (a, b) => b.visits - a.visits);
      let pl = '';
      if (q.length >= 2) {
        const names = new Set(Social.names().concat(Object.values(DB.users()).map(u => u.name)));
        const m = [...names].filter(n => n.toLowerCase().includes(q)).slice(0, 8);
        pl = m.length ? `<div class="sec">Players</div>` + m.map(n => { const s = status(n); return `<div class="part" data-u="${esc(n)}"><span>${pdot(s.c)} <b>${esc(n)}</b> ${Auth.isVerified(n) ? '<span class="vb">✔</span>' : ''}<br><span class="muted">${esc(s.t)}</span></span></div>`; }).join('') : '';
      }
      byId('dres').innerHTML = pl + `<div class="sec">Games</div>` + (l.length ? `<div class="grid">${l.map(gcard).join('')}</div>` : '<div class="muted">Nothing found.</div>');
      bindCards(byId('dres'));
    };
    byId('dq').oninput = e => { dq = e.target.value; draw(); };
    el.querySelectorAll('[data-s]').forEach(b => { b.onclick = () => { dsort = b.dataset.s; V.discover(el, me); }; });
    draw();
  };

  V.avatar = (el, me) => {
    const st = Avatar.get(me.key), res = Wear.resolve(me.key), all = DB.items(), owned = Inv.list(me.key);
    const T = [['items', 'Items'], ['colors', 'Colors'], ['face', 'Face'], ['anim', 'Animations'], ['emote', 'Emotes']];
    el.innerHTML = `<div class="card" style="text-align:center"><canvas id="avc" width="240" height="300"></canvas><div class="chips" style="justify-content:center">${ANIM_STATES.map(s => `<button class="chip ${s === 'idle' ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')}</div></div>
      <div class="tabs">${T.map(t => `<button class="${avTab === t[0] ? 'on' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="avB"></div>`;
    const B = byId('avB');
    const pick = k => { avP = k; if (avTab === 'colors') { B.querySelectorAll('.chip[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === k)); const c = byId('avCol'); if (c) c.value = st.colors[k]; } AvatarView.select(k); };
    AvatarView.start(byId('avc'), st.colors, res.items, pick, res.pack, res.face);
    el.querySelectorAll('.chip[data-s]').forEach(b => { b.onclick = () => { AvatarView.state = b.dataset.s; el.querySelectorAll('.chip[data-s]').forEach(x => x.classList.toggle('on', x === b)); }; });
    el.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => { avTab = b.dataset.t; render(); }; });
    if (avTab === 'items') {
      const list = owned.map(o => ({ o, it: all.find(x => x.id === o.id) })).filter(x => x.it && !x.it.down);
      const worn = list.filter(x => st.equipped.includes(x.it.id) && x.it.recolor);
      B.innerHTML = (list.length ? `<div class="grid">${list.map(({ o, it }) => `<div class="gcard ${st.equipped.includes(it.id) ? 'worn' : ''}" data-i="${it.id}"><img src="${Thumb.get(it)}" alt=""><div class="info"><h4>${esc(it.name)}</h4><div class="muted">${esc(it.slot)}${o.serial ? ' · #' + o.serial : ''}</div></div></div>`).join('')}</div>` : '<div class="card muted">No accessories yet. Visit the Shop!</div>') +
        worn.map(x => `<label class="lbl">${esc(x.it.name)} color</label><input type="color" data-ic="${x.it.id}" value="${esc(st.itemColors[x.it.id] || (x.it.parts[0] && x.it.parts[0].color) || '#a3a2a5')}">`).join('');
      Ui.enhance(B);
      B.querySelectorAll('[data-i]').forEach(c => { c.onclick = () => { Avatar.toggle(me.key, c.dataset.i); render(); }; });
      B.querySelectorAll('input[data-ic]').forEach(i => i.addEventListener('change', () => { st.itemColors[i.dataset.ic] = i.value; Avatar.set(me.key, st); render(); }));
    } else if (avTab === 'colors') {
      B.innerHTML = `<div class="chips">${Object.keys(PART_LABELS).map(k => `<button class="chip ${k === avP ? 'on' : ''}" data-p="${k}"><i style="background:${st.colors[k]}"></i>${PART_LABELS[k]}</button>`).join('')}</div><input type="color" id="avCol" value="${st.colors[avP]}"><button class="gray" id="avR">Reset to classic</button>`;
      Ui.enhance(B);
      B.querySelectorAll('.chip[data-p]').forEach(b => { b.onclick = () => pick(b.dataset.p); });
      byId('avCol').addEventListener('input', e => { st.colors[avP] = e.target.value; AvatarView.av.setColors(st.colors); const d = B.querySelector('.chip[data-p="' + avP + '"] i'); if (d) d.style.background = e.target.value; Avatar.set(me.key, st); });
      byId('avR').onclick = () => { st.colors = Object.assign({}, DEFAULT_COLORS); Avatar.set(me.key, st); render(); };
      AvatarView.select(avP);
    } else if (avTab === 'face') {
      const cur = Faces.equippedId(me.key);
      B.innerHTML = Faces.list().filter(f => Faces.owned(me.key, f.id)).map(f => `<div class="part"><span style="display:flex;align-items:center;gap:8px"><img src="${faceShot(f.spec)}" style="width:44px;height:55px;object-fit:contain;background:#2a2d31;border-radius:6px"> ${esc(f.name)}</span><span><button class="sm ${f.id === cur ? 'gray' : ''}" data-f="${f.id}">${f.id === cur ? 'Equipped' : 'Equip'}</button></span></div>`).join('') + '<div class="muted">More faces in the Shop.</div>';
      B.querySelectorAll('[data-f]').forEach(b => { b.onclick = () => { Faces.equip(me.key, b.dataset.f); render(); }; });
    } else if (avTab === 'anim') {
      const cur = Packs.equipped(me.key);
      B.innerHTML = Packs.list().filter(p => Packs.owned(me.key, p.id)).map(p => `<div class="part"><span>${esc(p.name)}</span><span><button class="sm ${p.id === cur.id ? 'gray' : ''}" data-k="${p.id}">${p.id === cur.id ? 'Equipped' : 'Equip'}</button></span></div>`).join('') + '<div class="muted">More packs in the Shop. Use the state buttons above to preview.</div>';
      B.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => { Packs.equip(me.key, b.dataset.k); render(); }; });
    } else {
      const l = EM() ? EM().mine() : [];
      B.innerHTML = (l.length ? l.map(e => `<div class="part"><span>${esc(e.name)} ${e.loop ? '🔁' : ''}</span><span><button class="sm" data-e="${e.id}">▶ Preview</button></span></div>`).join('') : '<div class="card muted">No emotes yet. Buy some in the Shop.</div>') + '<div class="muted">In a game press 😀 or type /e name.</div>';
      B.querySelectorAll('[data-e]').forEach(b => { b.onclick = () => AvatarView.av.playEmote(Object.assign({}, l.find(e => e.id === b.dataset.e), { loop: true })); });
    }
    pick(avP);
  };

  V.shop = (el, me) => {
    const items = DB.items().filter(i => !i.down).reverse(), packs = Packs.list().filter(p => p.id !== 'classic'), faces = Faces.list().filter(f => f.id !== 'classic'), ems = EM() ? EM().list() : [];
    const so = o => o.limited && (o.sold || 0) >= o.stock;
    const card = (img, o, owned, buy, prev) => `<div class="gcard">${img}<div class="info"><h4>${esc(o.name)}</h4>${o.creator ? `<div class="muted">by ${esc(o.creator)}</div>` : ''}${o.limited ? `<span class="badge">LIMITED · ${Math.max(0, o.stock - (o.sold || 0))} left</span>` : ''}<div class="pr">${o.price > 0 ? GV + ' ' + o.price : 'Free'}</div><div class="row2"><button class="sm gray" onclick="${prev}('${o.id}')">👁</button><button ${owned || so(o) ? 'class="gray sm" disabled' : 'class="sm"'} onclick="${buy}('${o.id}')">${owned ? 'Owned' : so(o) ? 'Sold out' : 'Buy'}</button></div></div></div>`;
    const ic = e => `<div class="thumb2">${e}</div>`;
    const parts = [];
    if (['all', 'items'].includes(shopCat)) items.forEach(it => parts.push(card(`<img src="${Thumb.get(it)}" alt="">`, it, Inv.has(me.key, it.id), 'buyItem', 'previewItem')));
    if (['all', 'faces'].includes(shopCat)) faces.forEach(f => parts.push(card(`<img src="${faceShot(f.spec)}" alt="">`, f, Faces.owned(me.key, f.id), 'buyFace', 'previewFace')));
    if (['all', 'emotes'].includes(shopCat)) ems.forEach(e => parts.push(card(ic('🎭'), e, EM().owned(me.key, e.id), 'buyEmote', 'previewEmote')));
    if (['all', 'packs'].includes(shopCat)) packs.forEach(p => parts.push(card(ic('🏃'), p, Packs.owned(me.key, p.id), 'buyPack', 'previewPack')));
    el.innerHTML = `<div class="chips">${[['all', 'All'], ['items', 'Accessories'], ['faces', 'Faces'], ['emotes', 'Emotes'], ['packs', 'Packs']].map(c => `<button class="chip ${shopCat === c[0] ? 'on' : ''}" data-c="${c[0]}">${c[1]}</button>`).join('')}</div>` +
      (parts.length ? `<div class="grid">${parts.join('')}</div>` : '<div class="card muted">Nothing here yet.</div>');
    el.querySelectorAll('[data-c]').forEach(b => { b.onclick = () => { shopCat = b.dataset.c; V.shop(el, me); }; });
  };
  window.previewItem = id => {
    const it = DB.items().find(x => x.id === id); if (!it) return;
    modal(it.name, '<div style="text-align:center"><canvas id="pit" width="240" height="300"></canvas></div>', [{ label: 'Close', cls: 'gray', fn: () => AvatarView.stop() }]);
    AvatarView.start(byId('pit'), DEFAULT_COLORS, [it]);
  };

  /* friends / profile */
  const frRow = n => { const s = status(n); return `<div class="part"><span>${pdot(s.c)} <b>${esc(n)}</b> ${Auth.isVerified(n) ? '<span class="vb">✔</span>' : ''}<br><span class="muted">${esc(s.t)}</span></span><span>${s.p ? `<button class="sm" data-j="${s.p.gid}" data-sl="${s.p.slot}">Join</button>` : ''}<button class="sm gray" data-u="${esc(n)}">👤</button><button class="sm gray" data-x="${esc(n)}">🗑</button></span></div>`; };
  V.profile = (el, me) => {
    const pr = prof(me.key), games = DB.games().filter(g => g.authorKey === me.key), visits = games.reduce((a, g) => a + (g.visitors || []).length, 0), d = Social.d(), s = status(me.name);
    const gl = allGames();
    el.innerHTML = `<div class="banner" style="background:linear-gradient(135deg,${pr.c1},${pr.c2})"></div>
      <div class="pcard"><img class="ph" src="${myShot(me, false)}" alt=""><div><h2>${esc(me.name)} ${Auth.isVerified(me.key) ? '<span class="vb">✔</span>' : ''}</h2><div class="muted">${pdot(s.c)} ${esc(s.t)}</div><div class="muted">${esc(pr.status)}</div></div></div>
      <button onclick="editProfile()">✎ Edit profile</button>
      <div class="stat"><div><b>${d.list.length}</b>Friends</div><div><b>${favs().length}</b>Favorites</div><div><b>${games.length}</b>Games</div><div><b>${visits}</b>Visits</div></div>
      ${pr.bio ? `<div class="card"><h3>About</h3><p>${esc(pr.bio)}</p></div>` : ''}
      ${hrow('Favorite games', favs().map(i => gl.find(x => x.id === i)).filter(Boolean))}
      <div class="card"><h3>Friends (${d.list.length})</h3>${d.req.map(f => `<div class="part"><span>${esc(f)} sent a request</span><span><button class="sm" data-ac="${esc(f)}">Accept</button><button class="sm gray" data-dc="${esc(f)}">✕</button></span></div>`).join('')}${d.list.map(frRow).join('') || '<div class="muted">No friends yet.</div>'}
        <div class="row2"><input id="frN" placeholder="Add friend by username" maxlength="20"><button id="frA">Add</button></div></div>
      <div class="card"><h3>Settings</h3>
        <div class="part"><span>Sound</span><input type="checkbox" id="sS" ${Sfx.on() ? 'checked' : ''}></div>
        <div class="part"><span>Volume</span><input type="range" id="sV" min="0" max="100" value="${Math.round(DB.get('vol', 1) * 100)}"></div>
        <div class="part"><span>High graphics (can lag)</span><input type="checkbox" id="sG" ${DB.get('gfx', 'low') === 'high' ? 'checked' : ''}></div>
        <div class="part"><span>Show FPS</span><input type="checkbox" id="sF" ${DB.get('fps', false) ? 'checked' : ''}></div>
        <div class="part"><span>Left-handed controls</span><input type="checkbox" id="sL" ${DB.get('lh', false) ? 'checked' : ''}></div>
        <div class="part"><span>Appear offline</span><input type="checkbox" id="sP" ${DB.get('priv_' + me.key, false) ? 'checked' : ''}></div>
        <button class="gray" onclick="changePass()">🔑 Change password</button><button class="red" onclick="doLogout()">Log out</button></div>`;
    const on = (id, f) => { byId(id).onchange = e => f(e.target.checked); };
    on('sS', v => DB.set('mute', !v)); on('sG', v => DB.set('gfx', v ? 'high' : 'low')); on('sF', v => DB.set('fps', v));
    on('sL', v => { DB.set('lh', v); document.body.classList.toggle('lh', v); }); on('sP', v => { DB.set('priv_' + me.key, v); Lobby.pres = null; });
    byId('sV').oninput = e => DB.set('vol', e.target.value / 100);
    byId('frA').onclick = () => Social.add(byId('frN').value);
    el.querySelectorAll('[data-j]').forEach(b => { b.onclick = () => Play.launch(b.dataset.j, +b.dataset.sl); });
    el.querySelectorAll('[data-ac]').forEach(b => { b.onclick = () => { Social.accept(b.dataset.ac); render(); }; });
    el.querySelectorAll('[data-dc]').forEach(b => { b.onclick = () => { Social.decline(b.dataset.dc); render(); }; });
    el.querySelectorAll('[data-x]').forEach(b => { b.onclick = () => uiConfirm('Remove ' + b.dataset.x + ' from friends?', () => { Social.remove(b.dataset.x); render(); }, 'Remove'); });
    bindCards(el);
  };
  window.editProfile = () => {
    const k = Auth.key(), p = prof(k);
    modal('Edit profile', `<label class="lbl">Status</label><input id="epS" maxlength="40" value="${esc(p.status)}"><label class="lbl">About me</label><textarea id="epB" rows="3" maxlength="200">${esc(p.bio)}</textarea><label class="lbl">Banner color 1</label><input type="color" id="epC1" value="${p.c1}"><label class="lbl">Banner color 2</label><input type="color" id="epC2" value="${p.c2}">`, [
      { label: 'Save', fn: () => { const s = byId('epS').value.trim(), b = byId('epB').value.trim(); if (Filter.has(s) || Filter.has(b)) { toast('Inappropriate words are not allowed'); return false; } DB.set('prof_' + k, { status: s, bio: b, c1: byId('epC1').value, c2: byId('epC2').value }); render(); } },
      { label: 'Cancel', cls: 'gray' }]);
  };
  window.changePass = () => {
    modal('Change password', '<input id="cpO" type="password" placeholder="Current password"><input id="cpN" type="password" placeholder="New password (min 6)">', [
      { label: 'Save', fn: () => { const k = Auth.key(), u = DB.users()[k]; if (!u || u.pass !== Auth.hash(k + ':' + byId('cpO').value)) { toast('Current password is wrong'); return false; } if (!Auth.setPass(k, byId('cpN').value)) { toast('Min 6 characters'); return false; } toast('Password changed'); } },
      { label: 'Cancel', cls: 'gray' }]);
  };
  window.openUser = name => {
    const k = String(name).toLowerCase(), s = status(name), isF = Social.d().list.includes(k), me = Auth.key() === k;
    modal(name, `<div style="text-align:center"><div class="fa" style="width:auto"><div class="av" style="width:80px;height:80px;line-height:80px;font-size:34px">${esc(name[0].toUpperCase())}${pdot(s.c)}</div></div><h3>${esc(name)} ${Auth.isVerified(k) ? '<span class="vb">✔</span>' : ''}</h3><div class="muted">${esc(s.t)}</div></div>`, [
      s.p ? { label: 'Join game', fn: () => { Play.launch(s.p.gid, s.p.slot); } } : null,
      !me && !isF ? { label: '＋ Add friend', fn: () => { Social.add(name); } } : null,
      { label: 'Close', cls: 'gray' }].filter(Boolean));
  };

  /* ---------- shell ---------- */
  const TABS = [['home', '🏠', 'Home'], ['discover', '🔍', 'Discover'], ['avatar', '🧍', 'Avatar'], ['shop', '🛍', 'Shop'], ['create', '🛠', 'Create'], ['profile', '👤', 'Profile']];
  function shell() {
    AvatarView.stop();
    Auth.me(); if (Auth.flash) { authErr = Auth.flash; Auth.flash = ''; }
    const me = Auth.me(), app = $q('#app');
    if (!me) { renderAuth(app); Ui.enhance(app); return; }
    Mod.deducts();
    const tabs = TABS.slice(); if (Auth.isAdmin()) tabs.push(['admin', '🛡', 'Admin']);
    if (!tabs.some(t => t[0] === tab)) tab = 'home';
    const reqs = Social.d().req.length, subs = Auth.isAdmin() ? DB.pending().filter(s => s.status === 'pending').length : 0;
    app.innerHTML = `<div class="top"><div class="logo"><span>✷</span> Blosor</div><span style="flex:1"></span>${Auth.isVerified(me.key) ? '<span class="vb">✔</span>' : ''}<button class="gv" onclick="openWallet()">${GV} ${me.gv || 0}</button></div><main id="main"></main>
      <div class="bn">${tabs.map(t => `<button class="${tab === t[0] ? 'on' : ''}" onclick="setTab('${t[0]}')"><i>${t[1]}</i>${t[2]}${t[0] === 'profile' && reqs ? `<span class="bd">${reqs}</span>` : ''}${t[0] === 'admin' && subs ? `<span class="bd">${subs}</span>` : ''}</button>`).join('')}</div>`;
    const views = { home: V.home, discover: V.discover, avatar: V.avatar, shop: V.shop, profile: V.profile, create: (e, m) => viewCreate(e, m), admin: (e, m) => viewAdmin(e, m) };
    views[tab]($q('#main'), me); Ui.enhance(app);
  }
  window.render = function () {
    try { shell(); } catch (e) {
      dbg('render', e);
      const m = $q('#main'); if (m && !m.innerHTML.trim()) m.innerHTML = '<div class="card"><h3>This page failed to load</h3><p class="muted">' + esc(e && e.message || e) + '</p></div>';
    }
  };

  /* ---------- Admin extras ---------- */
  S('admin', () => {
    const QE = {
      Wave: { len: 1.2, loop: true, keys: [{ t: 0, j: { ra: [-160, 0, 0] } }, { t: 0.3, j: { ra: [-160, 0, -30] } }, { t: 0.6, j: { ra: [-160, 0, 30] } }, { t: 0.9, j: { ra: [-160, 0, -30] } }, { t: 1.2, j: { ra: [-160, 0, 0] } }] },
      Cheer: { len: 1, loop: true, keys: [{ t: 0, j: { la: [-170, 0, 0], ra: [-170, 0, 0], head: [-10, 0, 0] } }, { t: 0.5, j: { la: [-150, 0, -20], ra: [-150, 0, 20], head: [-20, 0, 0] } }, { t: 1, j: { la: [-170, 0, 0], ra: [-170, 0, 0], head: [-10, 0, 0] } }] },
      Dance: { len: 1.6, loop: true, keys: [{ t: 0, j: { la: [-90, 0, 0], ra: [0, 0, 0], torso: [0, -25, 0] } }, { t: 0.4, j: { la: [0, 0, 0], ra: [-90, 0, 0], torso: [0, 25, 0], head: [0, 0, 10] } }, { t: 0.8, j: { la: [-90, 0, 0], ra: [0, 0, 0], torso: [0, -25, 0], ll: [-30, 0, 0] } }, { t: 1.2, j: { la: [0, 0, 0], ra: [-90, 0, 0], torso: [0, 25, 0], rl: [-30, 0, 0] } }, { t: 1.6, j: { la: [-90, 0, 0], ra: [0, 0, 0], torso: [0, -25, 0] } }] },
      Point: { len: 1.5, loop: false, keys: [{ t: 0, j: { ra: [0, 0, 0] } }, { t: 0.3, j: { ra: [-90, 0, 0] } }, { t: 1.2, j: { ra: [-90, 0, 0] } }, { t: 1.5, j: { ra: [0, 0, 0] } }] },
      Bow: { len: 1.6, loop: false, keys: [{ t: 0, j: { torso: [0, 0, 0], head: [0, 0, 0] } }, { t: 0.5, j: { torso: [50, 0, 0], head: [10, 0, 0] } }, { t: 1.1, j: { torso: [50, 0, 0], head: [10, 0, 0] } }, { t: 1.6, j: { torso: [0, 0, 0], head: [0, 0, 0] } }] },
      Twist: { len: 1.2, loop: true, keys: [{ t: 0, j: { torso: [0, 0, 0], la: [-30, 0, 0], ra: [-30, 0, 0] } }, { t: 1.2, j: { torso: [0, 360, 0], la: [-30, 0, 0], ra: [-30, 0, 0] } }] }
    };
    const mkEm = k => {
      const q = QE[k], jn = new Set(); q.keys.forEach(x => Object.keys(x.j).forEach(j => jn.add(j)));
      return { id: uid(), name: k, price: 0, limited: false, stock: 1, len: q.len, loop: q.loop, keys: q.keys.map(x => { const j = {}; jn.forEach(n => { j[n] = x.j[n] || [0, 0, 0]; }); return { t: x.t, j }; }) };
    };
    const mkPk = k => {
      const a = Packs.template(k === 'Zombie' ? 'zombie' : 'classic');
      if (k === 'Ninja') { a.idle.j.torso = { x: [12, 0, 0] }; a.walk.f = 12; a.walk.j.torso = { x: [28, 0, 0] }; a.walk.j.la = { x: [-40, 0, 0] }; a.walk.j.ra = { x: [-40, 0, 0] }; }
      if (k === 'Bouncy') { a.walk.bob = 0.35; a.walk.f = 13; a.walk.j.la.x = [0, 65, 0]; a.walk.j.ra.x = [0, 65, 3.14]; a.idle.f = 3; a.idle.bob = 0.12; }
      return { id: uid(), name: k + ' pack', price: 0, anims: a, body: Packs.cleanBody(null) };
    };
    const va = viewAdmin;
    viewAdmin = function (el, me) {
      va(el, me);
      if (!Auth.isAdmin()) return;
      const d = document.createElement('div');
      d.innerHTML = `<div class="card"><h3>⚡ Quick create</h3><p class="muted">One tap makes a ready emote or pack. Edit it afterwards with the timeline.</p>
        <div class="chips">${Object.keys(QE).map(k => `<button class="chip" data-e="${k}">😀 ${k}</button>`).join('')}</div>
        <div class="chips">${['Zombie', 'Ninja', 'Bouncy'].map(k => `<button class="chip" data-p="${k}">🏃 ${k}</button>`).join('')}</div>
        <button class="gray" id="qfi">🖼 New face from an image</button><button class="gray" id="qsub">📥 Check new accessory submissions</button><button class="gray" id="qcat">📡 Publish shop catalog now</button></div>`;
      el.appendChild(d);
      d.querySelectorAll('[data-e]').forEach(b => { b.onclick = () => { const e = EM() && EM().save(mkEm(b.dataset.e)); toast(e || b.dataset.e + ' created'); render(); }; });
      d.querySelectorAll('[data-p]').forEach(b => { b.onclick = () => { const e = Packs.save(mkPk(b.dataset.p)); toast(e || b.dataset.p + ' pack created'); render(); }; });
      byId('qsub').onclick = () => { Catalog.pull(); toast('Checking...'); };
      byId('qcat').onclick = () => { Catalog.kick(); toast('Publishing...'); };
      byId('qfi').onclick = () => {
        let res = null;
        modal('Face from image', '<input id="fiN" maxlength="24" placeholder="Face name"><input id="fiP" type="number" min="0" placeholder="Price" value="0"><button class="gray" id="fiPick">Choose image...</button><input type="file" id="fiF" accept="image/*" style="display:none"><canvas id="fiC" width="160" height="160" style="width:160px;height:160px;background:#f5cd30;border-radius:6px;margin-top:6px"></canvas>', [
          { label: '💾 Save', fn: () => { if (!res) { toast('Choose an image first'); return false; } const err = Faces.save({ id: uid(), name: byId('fiN').value, price: byId('fiP').value, spec: { draw: res } }); if (err) { toast(err); return false; } toast('Face saved'); render(); } },
          { label: 'Close', cls: 'gray' }]);
        byId('fiPick').onclick = () => byId('fiF').click();
        byId('fiF').onchange = e => {
          const f = e.target.files[0]; if (!f) return;
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'), s = Math.min(img.width, img.height);
            x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 16, 16);
            const px = x.getImageData(0, 0, 16, 16).data, cnt = {};
            for (let i = 0; i < 256; i++) { if (px[i * 4 + 3] < 128) continue; const k = ((px[i * 4] >> 5) << 6) | ((px[i * 4 + 1] >> 5) << 3) | (px[i * 4 + 2] >> 5); cnt[k] = (cnt[k] || 0) + 1; }
            const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 35).map(Number);
            if (!top.length) return toast('The image is empty');
            const rgb = k => [clamp(((k >> 6) & 7) * 36 + 18, 0, 255), clamp(((k >> 3) & 7) * 36 + 18, 0, 255), clamp((k & 7) * 36 + 18, 0, 255)];
            const pal = top.map(k => '#' + rgb(k).map(v => v.toString(16).padStart(2, '0')).join(''));
            const rows = [], pv = byId('fiC').getContext('2d'); pv.fillStyle = '#f5cd30'; pv.fillRect(0, 0, 160, 160);
            for (let y = 0; y < 16; y++) {
              let r = '';
              for (let xx = 0; xx < 16; xx++) {
                const i = y * 16 + xx; if (px[i * 4 + 3] < 128) { r += '.'; continue; }
                let bi = 0, bd = 1e9;
                top.forEach((k, j) => { const q = rgb(k), d = (q[0] - px[i * 4]) ** 2 + (q[1] - px[i * 4 + 1]) ** 2 + (q[2] - px[i * 4 + 2]) ** 2; if (d < bd) { bd = d; bi = j; } });
                r += bi.toString(36); pv.fillStyle = pal[bi]; pv.fillRect(xx * 10, y * 10, 10, 10);
              }
              rows.push(r);
            }
            res = { pal, rows };
          };
          img.src = URL.createObjectURL(f);
        };
      };
    };
  });

  /* ---------- start ---------- */
  S('start', () => { Lobby.start(); if (Auth.key()) render(); });
})();
