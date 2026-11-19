/* rbx2.js - stage 5. Loaded after rbx.js. */
(function () {
  'use strict';
  const dbg = (n, e) => { console.error(e); if (window.dbgShow) window.dbgShow('rbx2 ' + n + ': ' + (e && (e.stack || e.message) || e)); };
  const S = (n, f) => { try { f(); } catch (e) { dbg(n, e); } };
  const $q = s => document.querySelector(s);
  const EM = () => window.Emotes;

  /* ---------- CSS ---------- */
  S('css', () => {
    const st = document.createElement('style');
    st.textContent = `
body{background:#121316}
.top{background:#1b1d21;border-bottom:1px solid #2a2d32}
.bn{background:#1b1d21;border-top:1px solid #2a2d32;height:60px}
.bn button{color:#8b8f97;font-size:10px;letter-spacing:.2px}
.bn button.on{color:#fff}.bn button.on::before{content:"";position:absolute;top:0;left:30%;right:30%;height:3px;border-radius:0 0 3px 3px;background:#335fff}
.bn button i{font-size:21px;margin-bottom:1px}
button{background:#00b06f;border-radius:8px;font-weight:700;letter-spacing:.2px}
button.gray{background:#393b41}
.card{background:#1e2024;border:1px solid #2a2d32;border-radius:14px}
.gc,.gcard{background:#1e2024;border:1px solid #2a2d32;border-radius:12px;transition:transform .12s}
.gc:active,.gcard:active{transform:scale(.97)}
.gc .th{border-radius:0}.sec{font-size:18px;font-weight:800;margin:18px 0 8px}
input,textarea{background:#1e2024;border:1px solid #34373d;border-radius:8px}
input:focus,textarea:focus{border-color:#335fff}
.tabs{background:transparent;border-bottom:1px solid #2a2d32;border-radius:0}
.tabs button{background:none;color:#8b8f97;border-bottom:3px solid transparent;border-radius:0;padding:10px 4px}
.tabs button.on{background:none;color:#fff;border-bottom-color:#335fff}
.chip{border-radius:18px;background:#2a2d32}.chip.on{background:#335fff22;border-color:#335fff}
#modal .dlg,.sheetBox{background:#1e2024;border:1px solid #2a2d32;border-radius:16px}
.part{border-bottom:1px solid #2a2d32}
.pd{border:2px solid #121316}
#stTabs{display:flex;gap:4px;padding:5px 6px;background:#2d2d2d;overflow-x:auto;flex-shrink:0}
#stTabs button{background:#3a3a3a;padding:6px 14px;font-size:12px;font-weight:600;border-radius:14px;flex-shrink:0}
#stTabs button.on{background:#0d99ff}
#stDock{position:absolute;left:6px;right:6px;bottom:6px;display:flex;gap:2px;overflow-x:auto;background:#252525f2;border:1px solid #000;border-radius:14px;padding:4px;z-index:4}
#stDock button{flex:1 0 auto;min-width:46px;height:44px;background:transparent;font-size:19px;padding:0 6px;border-radius:10px;color:#eee}
#stDock button.on{background:#0d99ff44;outline:1px solid #0d99ff}#stDock button:active{background:#ffffff22}
#stDock .ds{width:1px;background:#444;margin:6px 2px;flex:0 0 1px}
#exQ{margin:4px 6px;width:calc(100% - 12px);padding:6px;font-size:12px;background:#1a1a1a}
.aeNote{font-size:12px;color:#9a9da3;margin:4px 0}
@media(max-width:899px){
 #stExp,#stProp{top:auto;bottom:62px;height:42%;width:calc(50% - 9px)}
 #stProp{left:auto;right:6px}
 #stRibbon{padding-top:2px}
}`;
    document.head.appendChild(st);
  });

  /* ---------- 1. facing bug (angle grew past +-10 and was clamped on the network) ---------- */
  S('face', () => {
    const ns = Game.netStep;
    Game.netStep = function (dt) {
      if (this.running) {
        this.face = Math.atan2(Math.sin(this.face), Math.cos(this.face));
        this.tFace = Math.atan2(Math.sin(this.tFace), Math.cos(this.tFace));
      }
      return ns.call(this, dt);
    };
  });

  /* ---------- 2. Studio: tabs, dock, search, drop, autosave ---------- */
  S('studio', () => {
    const stu = $q('#studio'), rib = $q('#stRibbon'), view = $q('#stView');
    if (!stu || !rib || !view) return;
    const TAB = { Home: ['Tools', 'History'], Insert: ['Insert', 'StarterGui', 'Templates'], Edit: ['Edit', 'Organize'], View: ['View'], File: ['File'] };
    const tb = document.createElement('div'); tb.id = 'stTabs';
    tb.innerHTML = Object.keys(TAB).map((k, i) => `<button class="${i ? '' : 'on'}" data-tb="${k}">${k}</button>`).join('');
    rib.parentNode.insertBefore(tb, rib);
    const showTab = n => {
      tb.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tb === n));
      rib.querySelectorAll('.grp').forEach(g => { const l = g.querySelector('.gl'); g.style.display = l && TAB[n].includes(l.textContent.trim()) ? '' : 'none'; });
    };
    tb.querySelectorAll('button').forEach(b => { b.onclick = () => showTab(b.dataset.tb); });
    showTab('Home');

    // Drop to ground
    const fo = rib.querySelector('[data-act=focus]');
    if (fo) fo.insertAdjacentHTML('afterend', '<button data-act="drop"><i>⤓</i>Drop</button>');
    const db = rib.querySelector('[data-act=drop]'); if (db) db.onclick = () => Studio.drop();
    Studio.drop = function () {
      const b = this.bb; if (!b) return toast('Select something first');
      const ids = Tree.sub(this.nodes, this.sel), m = Tree.map(this.nodes); let top = -Infinity;
      this.nodes.forEach(n => {
        if (n.type !== 'part' || ids.has(n.id) || Tree.root(m, n) !== 'WS') return;
        const h = partHalf(n);
        if (n.x + h[0] <= b.x0 || n.x - h[0] >= b.x1 || n.z + h[2] <= b.z0 || n.z - h[2] >= b.z1) return;
        const t = n.y + h[1]; if (t <= b.y0 + 0.5 && t > top) top = t;
      });
      if (top === -Infinity) return toast('Nothing below to land on');
      const dy = +(top - b.y0).toFixed(3); if (Math.abs(dy) < 0.001) return toast('Already on the ground');
      this.push();
      this.nodes.forEach(n => { if (n.type === 'part' && ids.has(n.id)) { n.y = +(n.y + dy).toFixed(3); this.limit(n); this.refreshMesh(n); } });
      this.changed(true);
    };

    // bottom dock
    const D = [['tool:select', '🖱'], ['tool:move', '✥'], ['tool:scale', '⤡'], ['tool:rotate', '⟲'], '|', ['act:undo', '↶'], ['act:redo', '↷'], ['act:dup', '⧉'], ['act:del', '🗑'], '|', ['act:exp', '📁'], ['act:prop', '📋'], '|', ['act:play', '▶', 'only-map'], ['act:save', '💾']];
    const dock = document.createElement('div'); dock.id = 'stDock';
    dock.innerHTML = D.map(x => x === '|' ? '<div class="ds"></div>' : `<button data-d="${x[0]}" class="${x[2] || ''}">${x[1]}</button>`).join('');
    view.appendChild(dock);
    dock.querySelectorAll('[data-d]').forEach(b => {
      b.onclick = () => {
        const [k, v] = b.dataset.d.split(':');
        const src = rib.querySelector(k === 'tool' ? `[data-tool="${v}"]` : `[data-act="${v}"]`) || stu.querySelector(`[data-act="${v}"]`);
        if (src) src.click();
      };
    });
    setInterval(() => {
      if (stu.classList.contains('hidden')) return;
      dock.querySelectorAll('[data-d^="tool:"]').forEach(b => {
        const s = rib.querySelector(`[data-tool="${b.dataset.d.slice(5)}"]`); b.classList.toggle('on', !!s && s.classList.contains('on'));
      });
    }, 400);

    // Explorer search
    const ph = $q('#stExp .ph');
    if (ph) ph.insertAdjacentHTML('afterend', '<input id="exQ" placeholder="🔍 Search objects...">');
    const filt = () => {
      const q = (byId('exQ').value || '').toLowerCase();
      document.querySelectorAll('#stExpBody .tr[data-i]').forEach(r => { r.style.display = !q || r.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    };
    const q = byId('exQ'); if (q) q.oninput = filt;
    const ex0 = St.explorer; St.explorer = function () { ex0.call(this); filt(); };

    // autosave every 60 s
    setInterval(() => {
      try {
        if (stu.classList.contains('hidden') || !St.cur || !Studio.dirty || !St.cur.name || Game.running) return;
        const me = Auth.me(); if (!me) return;
        const c = St.cur, map = St.type === 'map';
        c.parts = JSON.parse(JSON.stringify(Studio.nodes)); if (map) c.env = Studio.env; c.time = Date.now();
        const err = (map ? Places : Drafts).save(me.key, c); if (err) return;
        St.isNew = false; St.lastId[St.type] = c.id; Studio.dirty = false; St.dirtyUi(); toast('Autosaved');
      } catch (e) { dbg('autosave', e); }
    }, 60000);
  });

  /* ---------- 3. faces: pixel + image ---------- */
  S('faces', () => {
    const fc = Faces.clean.bind(Faces);
    Faces.clean = function (s) {
      const o = fc(s), im = s && s.img;
      if (typeof im === 'string' && im.length <= 60000 && /^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(im)) { o.img = im; delete o.draw; }
      return o;
    };
    const IC = {}, ft = faceTexture;
    faceTexture = function (skin, spec) {
      if (!spec || !spec.img) return ft(skin, spec);
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const x = cv.getContext('2d'); x.fillStyle = skin; x.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(cv); t.anisotropy = 4;
      if (Object.keys(IC).length > 30) Object.keys(IC).forEach(k => delete IC[k]);
      let im = IC[spec.img];
      if (!im) { im = IC[spec.img] = new Image(); im.src = spec.img; }
      const paint = () => { x.drawImage(im, 0, 0, 256, 256); t.needsUpdate = true; };
      if (im.complete && im.naturalWidth) paint(); else im.addEventListener('load', paint);
      return t;
    };

    const FPAL = ['#000000', '#ffffff', '#7a3b12', '#c4281c', '#e8a317', '#f9d62e', '#2ee66b', '#13a538', '#0d99ff', '#0d69ac', '#8e24aa', '#ff98dc'];
    window.adminFace = function (id) {
      if (!Auth.isAdmin()) return;
      const ex = id ? DB.get('faces', []).find(f => f.id === id) : null, sp = Faces.clean(ex ? ex.spec : null);
      let mode = sp.img ? 'img' : 'pix';
      const rows = sp.draw ? sp.draw.rows.map(r => r.split('')) : Array.from({ length: 16 }, () => Array(16).fill('.'));
      const pal = sp.draw ? sp.draw.pal.slice(0, 12) : FPAL.slice(); while (pal.length < 12) pal.push('#000000');
      let sel = 0, brush = '#000000', size = 8, erase = false, imgData = sp.img || '';
      modal(ex ? 'Edit face' : 'New face', `<input id="fcN" maxlength="24" placeholder="Face name" value="${esc(ex ? ex.name : '')}">
        <input id="fcP" type="number" min="0" placeholder="Price" value="${ex ? ex.price : 0}">
        <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="fcLt" ${ex && ex.limited ? 'checked' : ''}> Limited</label>
        <input id="fcSt" type="number" min="1" placeholder="Stock" value="${ex && ex.stock ? ex.stock : 100}">
        <div class="chips"><button class="chip ${mode === 'pix' ? 'on' : ''}" id="fmP">▦ Pixel</button><button class="chip ${mode === 'img' ? 'on' : ''}" id="fmI">🖼 Image</button></div>
        <div id="fcA"></div><div style="text-align:center"><canvas id="fcc" width="240" height="300"></canvas></div>`, [
        {
          label: '💾 Save', fn: () => {
            const sx = spec(); if (!sx) return false;
            const err = Faces.save({ id: ex ? ex.id : uid(), name: byId('fcN').value, price: byId('fcP').value, spec: sx, limited: byId('fcLt').checked, stock: byId('fcSt').value });
            if (err) { toast(err); return false; }
            AvatarView.stop(); toast('Face saved'); render();
          }
        },
        { label: 'Close', cls: 'gray', fn: () => AvatarView.stop() }]);
      const area = byId('fcA');
      const pv = () => { const s = spec(true); if (AvatarView.av && s) AvatarView.av.setFace(s); };
      function spec(quiet) {
        if (mode === 'pix') {
          const any = rows.some(r => r.some(c => c !== '.'));
          return Faces.clean({ draw: any ? { pal, rows: rows.map(r => r.join('')) } : null });
        }
        const c = byId('fiC'); if (!c) return null;
        let d = c.toDataURL('image/png');
        if (d.length > 60000) { const t = document.createElement('canvas'); t.width = t.height = 96; t.getContext('2d').drawImage(c, 0, 0, 96, 96); d = t.toDataURL('image/png'); }
        if (d.length > 60000) { if (!quiet) toast('Image is too detailed, simplify it'); return null; }
        imgData = d; return Faces.clean({ img: d });
      }
      function drawPix() {
        area.innerHTML = `<div style="text-align:center"><canvas id="fcg" width="256" height="256" style="touch-action:none;width:256px;height:256px;border-radius:6px"></canvas></div><div class="chips" id="fcPal"></div>
          <input type="color" id="fcCol" value="${pal[sel] || '#000000'}"><div class="row2"><button class="gray" id="fcEr">Eraser</button><button class="gray" id="fcCl">Clear</button></div>`;
        Ui.enhance(area);
        const g = byId('fcg'), cx = g.getContext('2d'); let down = false;
        const redraw = () => {
          cx.fillStyle = '#f5cd30'; cx.fillRect(0, 0, 256, 256);
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const ch = rows[y][x]; if (ch === '.') continue; cx.fillStyle = pal[parseInt(ch, 36)] || '#000'; cx.fillRect(x * 16, y * 16, 16, 16); }
          cx.strokeStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i <= 16; i++) { cx.beginPath(); cx.moveTo(i * 16, 0); cx.lineTo(i * 16, 256); cx.moveTo(0, i * 16); cx.lineTo(256, i * 16); cx.stroke(); }
        };
        const chips = () => {
          const b = byId('fcPal');
          b.innerHTML = pal.map((c, i) => `<button class="chip ${i === sel ? 'on' : ''}" data-i="${i}"><i style="background:${c}"></i>${i + 1}</button>`).join('');
          b.querySelectorAll('[data-i]').forEach(x => { x.onclick = () => { sel = +x.dataset.i; byId('fcCol').value = pal[sel]; chips(); }; });
        };
        const cell = e => { const r = g.getBoundingClientRect(); return [clamp(Math.floor((e.clientX - r.left) / r.width * 16), 0, 15), clamp(Math.floor((e.clientY - r.top) / r.height * 16), 0, 15)]; };
        const paint = e => { const c = cell(e); rows[c[1]][c[0]] = sel < 0 ? '.' : sel.toString(36); redraw(); };
        g.onpointerdown = e => { down = true; try { g.setPointerCapture(e.pointerId); } catch (_) {} paint(e); };
        g.onpointermove = e => { if (down) paint(e); };
        g.onpointerup = g.onpointercancel = () => { if (down) { down = false; pv(); } };
        byId('fcCol').addEventListener('input', e => { if (sel >= 0) { pal[sel] = e.target.value; chips(); redraw(); } });
        byId('fcCol').addEventListener('change', pv);
        byId('fcEr').onclick = () => { sel = -1; chips(); };
        byId('fcCl').onclick = () => { rows.forEach(r => r.fill('.')); redraw(); pv(); };
        chips(); redraw();
      }
      function drawImg() {
        area.innerHTML = `<div style="text-align:center"><canvas id="fiC" width="128" height="128" style="touch-action:none;width:256px;height:256px;border-radius:6px;background:#f5cd30"></canvas></div>
          <label class="lbl">Brush color</label><input type="color" id="fiCol" value="${brush}">
          <label class="lbl">Brush size: <b id="fiSv">${size}</b></label><input type="range" id="fiS" min="2" max="24" value="${size}">
          <div class="row2"><button class="gray" id="fiEr">${erase ? '✏ Brush' : '🧽 Eraser'}</button><button class="gray" id="fiCl">Clear</button><button class="gray" id="fiUp">📁 Upload</button></div>
          <input type="file" id="fiF" accept="image/*" style="display:none">`;
        Ui.enhance(area);
        const c = byId('fiC'), x = c.getContext('2d'); let last = null;
        if (imgData) { const im = new Image(); im.onload = () => { x.drawImage(im, 0, 0, 128, 128); }; im.src = imgData; }
        const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 128, (e.clientY - r.top) / r.height * 128]; };
        const stroke = (a, b) => {
          x.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; x.strokeStyle = brush; x.fillStyle = brush; x.lineWidth = size; x.lineCap = x.lineJoin = 'round';
          x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
        };
        c.onpointerdown = e => { try { c.setPointerCapture(e.pointerId); } catch (_) {} last = pt(e); stroke(last, [last[0] + 0.01, last[1]]); };
        c.onpointermove = e => { if (!last) return; const p = pt(e); stroke(last, p); last = p; };
        c.onpointerup = c.onpointercancel = () => { if (last) { last = null; pv(); } };
        byId('fiCol').addEventListener('input', e => { brush = e.target.value; erase = false; byId('fiEr').textContent = '🧽 Eraser'; });
        byId('fiS').oninput = e => { size = +e.target.value; byId('fiSv').textContent = size; };
        byId('fiEr').onclick = e => { erase = !erase; e.target.textContent = erase ? '✏ Brush' : '🧽 Eraser'; };
        byId('fiCl').onclick = () => { x.clearRect(0, 0, 128, 128); pv(); };
        byId('fiUp').onclick = () => byId('fiF').click();
        byId('fiF').onchange = e => {
          const f = e.target.files[0]; if (!f) return; const im = new Image();
          im.onload = () => { const s = Math.min(im.width, im.height); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, 128, 128); x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 128, 128); pv(); };
          im.src = URL.createObjectURL(f);
        };
      }
      const setMode = m => {
        if (mode === 'img') spec(true);
        mode = m; byId('fmP').classList.toggle('on', m === 'pix'); byId('fmI').classList.toggle('on', m === 'img');
        if (m === 'pix') drawPix(); else drawImg(); pv();
      };
      byId('fmP').onclick = () => setMode('pix'); byId('fmI').onclick = () => setMode('img');
      if (mode === 'pix') drawPix(); else drawImg();
      AvatarView.start(byId('fcc'), DEFAULT_COLORS, [], null, null, Faces.clean(sp));
    };
  });

  /* ---------- 4. Animation Studio (pose by dragging, no code) ---------- */
  S('anim', () => {
    const LB = { la: 'L Arm', ra: 'R Arm', ll: 'L Leg', rl: 'R Leg', torso: 'Torso', head: 'Head' };
    const samp = (keys, t, loop, len) => {
      if (!keys.length) return null;
      let arr = keys; if (loop && keys[keys.length - 1].t < len - 1e-3) arr = keys.concat({ t: len, j: keys[0].j });
      if (t <= arr[0].t) return arr[0].j;
      for (let i = 1; i < arr.length; i++) {
        const a = arr[i - 1], b = arr[i];
        if (t <= b.t) {
          let f = (t - a.t) / Math.max(b.t - a.t, 1e-4); f = f * f * (3 - 2 * f); const o = {};
          JOINTS.forEach(n => { const x = a.j[n], y = b.j[n]; if (x && y) o[n] = [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f]; else if (x || y) o[n] = x || y; });
          return o;
        }
      }
      return arr[arr.length - 1].j;
    };

    function animStudio(o) {
      const isE = o.kind === 'emote'; let ex = null, E = { len: 2, loop: true, keys: [] }, store = {}, st = 'walk';
      const cp = x => JSON.parse(JSON.stringify(x));
      if (isE) { ex = o.id ? EM().all().find(x => x.id === o.id) : null; if (ex) E = cp(EM().clean(ex) || E); }
      else {
        ex = o.id ? DB.get('packs', []).find(x => x.id === o.id) : null;
        ANIM_STATES.forEach(s => { const kf = ex && ex.anims && ex.anims[s] && ex.anims[s].kf; if (kf) store[s] = { len: kf.len, loop: !!kf.loop, keys: cp(kf.keys) }; });
        if (store[st]) E = cp(store[st]);
      }
      const meta = isE
        ? `<input id="aeN" maxlength="24" placeholder="Emote name" value="${esc(ex ? ex.name : '')}">`
        : `<input id="aeN" maxlength="24" placeholder="Pack name" value="${esc(ex ? ex.name : '')}"><label class="lbl">Animation state to edit</label><select id="aeSt">${ANIM_STATES.map(s => `<option ${s === st ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
      const sh = Ui.sheet(`<h3>${isE ? (ex ? 'Edit emote' : 'New emote') : (ex ? 'Edit animations' : 'New animation pack')}</h3>${meta}
        <input id="aeP" type="number" min="0" placeholder="Price (0 = free)" value="${ex ? ex.price : 0}">
        <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="aeLt" ${ex && ex.limited ? 'checked' : ''}> Limited</label>
        <input id="aeS" type="number" min="1" placeholder="Stock" value="${ex && ex.stock ? ex.stock : 100}">
        <div style="text-align:center"><canvas id="aeC" width="240" height="300" style="touch-action:none"></canvas></div>
        <div class="aeNote">Tap a body part, then drag on the character to rotate it.</div>
        <div class="chips" id="aeAx"><button class="chip on" data-a="0">Rotate X</button><button class="chip" data-a="1">Rotate Y</button><button class="chip" data-a="2">Rotate Z</button></div>
        <div class="aeNote" id="aeV"></div>
        <div class="row2"><button class="gray" id="aeM">−5°</button><button class="gray" id="aeP5">+5°</button><button class="gray" id="aeRs">Reset part</button><button class="gray" id="aeMi">Mirror</button></div>
        <div class="row2"><button class="gray" id="aeVl">⟲ View</button><button class="gray" id="aeVr">⟳ View</button></div>
        <label class="lbl">Time: <b id="aeTv">0.00</b>s</label><input type="range" id="aeT" min="0" max="${E.len}" step="0.05" value="0">
        <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="aeAk" checked> Auto key after each move</label>
        <div class="row2"><button id="aeSet">⏺ Set key</button><button class="gray" id="aeDel">Delete key</button></div>
        <div class="chips" id="aeK"></div>
        <label class="lbl">Length in seconds (0.5 - 60)</label><input id="aeL" type="number" min="0.5" max="60" step="0.5" value="${E.len}">
        <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="aeLp" ${E.loop ? 'checked' : ''}> Loop</label>
        <div class="row2"><button class="gray" id="aePl">▶ Play</button><button id="aeSv">💾 Save</button></div><button class="gray" id="aeX">Close</button>`);
      Ui.enhance(sh);
      const q = i => sh.querySelector('#' + i);
      let t = 0, jn = 'la', ax = 0, playing = false, view = 0.5, P = {}, drag = null;
      JOINTS.forEach(k => { P[k] = [0, 0, 0]; });
      sh.onclose = () => AvatarView.stop();
      AvatarView.start(q('aeC'), DEFAULT_COLORS, [], part => { jn = part; AvatarView.select(part); vals(); }, null, DEF_FACE);
      const av = AvatarView.av;
      Object.defineProperty(av.g.rotation, 'y', { get: () => view, set: () => {}, configurable: true });
      const prev = () => { if (!playing) av.setOverride(() => P); };
      const vals = () => { q('aeV').textContent = LB[jn] + ':  X ' + Math.round(P[jn][0]) + '°   Y ' + Math.round(P[jn][1]) + '°   Z ' + Math.round(P[jn][2]) + '°'; };
      const poseAt = tt => { const s = samp(E.keys, tt, false, E.len) || {}, p = {}; JOINTS.forEach(k => { p[k] = s[k] ? s[k].slice() : [0, 0, 0]; }); return p; };
      const goT = v => { t = v; q('aeT').value = t; q('aeTv').textContent = t.toFixed(2); P = poseAt(t); vals(); prev(); };
      const keysUi = () => {
        const b = q('aeK');
        b.innerHTML = E.keys.map((k, i) => `<button class="chip" data-k="${i}">${k.t.toFixed(2)}s</button>`).join('') || '<span class="muted">No keys yet. Pose the character, then Set key.</span>';
        b.querySelectorAll('[data-k]').forEach(x => { x.onclick = () => goT(E.keys[+x.dataset.k].t); });
      };
      const setKey = () => {
        if (E.keys.length >= 120 && !E.keys.some(x => Math.abs(x.t - t) < 0.03)) return toast('Maximum 120 keys');
        const k = { t: +t.toFixed(2), j: cp(P) }, i = E.keys.findIndex(x => Math.abs(x.t - k.t) < 0.03);
        if (i >= 0) E.keys[i] = k; else E.keys.push(k);
        E.keys.sort((a, b) => a.t - b.t); keysUi();
      };
      const auto = () => { if (q('aeAk').checked) setKey(); };
      const turn = d => { P[jn][ax] = clamp(P[jn][ax] + d, -360, 360); vals(); prev(); };

      const cv = q('aeC');
      cv.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, m: false }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} };
      cv.onpointermove = e => {
        if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.m && Math.hypot(dx, dy) < 6) return;
        drag.m = true; drag.x = e.clientX; drag.y = e.clientY; turn((dx - dy) * 0.6);
      };
      cv.onpointerup = cv.onpointercancel = e => {
        if (!drag) return;
        if (!drag.m) AvatarView.pick(e); else auto();
        drag = null;
      };
      q('aeAx').querySelectorAll('[data-a]').forEach(b => { b.onclick = () => { ax = +b.dataset.a; q('aeAx').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b)); }; });
      q('aeM').onclick = () => { turn(-5); auto(); }; q('aeP5').onclick = () => { turn(5); auto(); };
      q('aeRs').onclick = () => { P[jn] = [0, 0, 0]; vals(); prev(); auto(); };
      q('aeMi').onclick = () => {
        const N = {}; JOINTS.forEach(k => { const m = { la: 'ra', ra: 'la', ll: 'rl', rl: 'll' }[k] || k, s = P[m]; N[k] = [s[0], -s[1], -s[2]]; });
        P = N; vals(); prev(); auto();
      };
      q('aeVl').onclick = () => { view -= 0.6; }; q('aeVr').onclick = () => { view += 0.6; };
      q('aeT').oninput = e => goT(+e.target.value);
      q('aeL').onchange = e => { E.len = clamp(+e.target.value || 2, 0.5, 60); q('aeT').max = E.len; if (t > E.len) goT(E.len); };
      q('aeLp').onchange = e => { E.loop = e.target.checked; };
      q('aeSet').onclick = () => { setKey(); toast('Key set at ' + t.toFixed(2) + 's'); };
      q('aeDel').onclick = () => { const i = E.keys.findIndex(x => Math.abs(x.t - t) < 0.06); if (i < 0) return toast('No key at this time'); E.keys.splice(i, 1); keysUi(); };
      q('aePl').onclick = () => {
        if (!playing) {
          if (!E.keys.length) return toast('Set at least one key');
          playing = true; q('aePl').textContent = '■ Stop'; av.playEmote({ len: E.len, loop: true, keys: E.keys });
        } else { playing = false; q('aePl').textContent = '▶ Play'; av.stopEmote(); prev(); }
      };
      if (!isE) {
        q('aeSt').addEventListener('change', e => {
          if (E.keys.length) store[st] = cp(E); else delete store[st];
          st = e.target.value; E = store[st] ? cp(store[st]) : { len: 2, loop: true, keys: [] };
          q('aeL').value = E.len; q('aeLp').checked = E.loop; q('aeT').max = E.len; keysUi(); goT(0);
        });
      }
      q('aeSv').onclick = () => {
        const name = q('aeN').value.trim(), price = q('aeP').value, lim = q('aeLt').checked, stock = q('aeS').value;
        if (isE) {
          if (!E.keys.length) return toast('Set at least one key');
          const err = EM().save({ id: ex ? ex.id : uid(), name, price, limited: lim, stock, len: E.len, loop: E.loop, keys: E.keys });
          if (err) return toast(err);
        } else {
          if (E.keys.length) store[st] = cp(E); else delete store[st];
          const anims = ex ? cp(ex.anims) : Packs.template('classic');
          ANIM_STATES.forEach(s => {
            if (store[s] && store[s].keys.length) { anims[s] = anims[s] || { f: 0, j: {} }; anims[s].kf = { len: store[s].len, loop: store[s].loop, keys: store[s].keys }; }
            else if (anims[s]) delete anims[s].kf;
          });
          const err = Packs.save({ id: ex ? ex.id : uid(), name, price, anims, body: ex ? ex.body : null, model: ex ? ex.model : null, limited: lim, stock });
          if (err) return toast(err);
        }
        toast('Saved'); Ui.close(sh); render();
      };
      q('aeX').onclick = () => Ui.close(sh);
      keysUi(); goT(0); AvatarView.select(jn);
    }

    window.adminEmote = id => animStudio({ kind: 'emote', id });
    window.adminPackAnim = id => animStudio({ kind: 'pack', id });

    const va = viewAdmin;
    viewAdmin = function (el, me) {
      va(el, me);
      if (!Auth.isAdmin()) return;
      const packs = DB.get('packs', []), d = document.createElement('div');
      d.innerHTML = `<div class="card"><h3>🎬 Animation Studio</h3><p class="muted">Pose the character by dragging. No code needed.</p>
        <button id="asE">➕ New emote</button><button class="gray" id="asP">➕ New animation pack</button>` +
        packs.map(p => `<div class="part"><span>${esc(p.name)}</span><span><button class="sm" data-pa="${p.id}">Edit animations</button></span></div>`).join('') + '</div>';
      el.appendChild(d);
      byId('asE').onclick = () => adminEmote(); byId('asP').onclick = () => adminPackAnim();
      d.querySelectorAll('[data-pa]').forEach(b => { b.onclick = () => adminPackAnim(b.dataset.pa); });
    };
  });
})();
