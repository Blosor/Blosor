/* =====================================================
   BOOT CHECK + STAGE 2 OVERRIDES + STAGE 3
   Stage 3: timeline animations, emotes, drawn faces, custom body models,
   limited packs/faces/emotes. Everything here is loaded last.
   ===================================================== */
(function () {
  const need = [
    ['THREE', 'three.min.js (needs internet, or use a local copy)'],
    ['DB', 'data.js'], ['Ui', 'ui.js'], ['Tree.cleanMap', 'tree.js (stage 2 version)'], ['partMat', 'render.js (stage 2 version)'],
    ['makeAvatar', 'avatar.js'], ['Packs', 'wear.js'], ['ScriptHost', 'gscript.js'], ['Net', 'net.js'],
    ['Game', 'game.js'], ['Game.netSnapshot', 'gx.js'], ['Studio', 'studio.js'], ['St', 'stui.js'],
    ['render', 'app.js'], ['Play', 'play.js']
  ];
  const missing = [];
  need.forEach(n => {
    let ok = true;
    try { ok = eval('typeof ' + n[0]) !== 'undefined'; } catch (e) { ok = false; }
    if (!ok) missing.push(n[1]);
  });

  let msg = '';
  if (missing.length) msg += 'These files are missing or failed to load:\n\n- ' + missing.join('\n- ') + '\n\n';
  if (typeof Peer === 'undefined') msg += 'Multiplayer library (PeerJS) did not load. Games will run offline.\n';
  try {
    const c = document.createElement('canvas');
    if (!(c.getContext('webgl') || c.getContext('experimental-webgl'))) msg += 'WebGL is not available on this device/browser.\n';
  } catch (e) { msg += 'WebGL check failed.\n'; }
  if (msg && window.dbgShow) window.dbgShow('BOOT CHECK\n\n' + msg);

  // stage 2: map data from other devices is cleaned by the new rules
  try {
    if (typeof Play !== 'undefined') Play.cleanMap = d => Tree.cleanMap(d);
    if (typeof Lobby !== 'undefined') Lobby.MAXMAP = 2500000;
  } catch (e) {}

  if (!missing.length) {
    try { stage3(); } catch (e) { console.error(e); if (window.dbgShow) window.dbgShow('stage3: ' + (e && (e.stack || e.message) || e)); }
  }

  if (typeof render === 'function') {
    const orig = render;
    window.render = function () {
      try { orig(); }
      catch (e) {
        console.error(e);
        if (window.dbgShow) window.dbgShow('render(): ' + (e && (e.stack || e.message) || e));
        const m = document.getElementById('main');
        if (m && !m.innerHTML.trim()) m.innerHTML = '<div class="card"><h3>This page failed to load</h3><p class="muted">' +
          String(e && e.message || e).replace(/</g, '&lt;') + '</p></div>';
      }
    };
  }

  /* =====================================================
     STAGE 3
     ===================================================== */
  function stage3() {
    const st = document.createElement('style');
    st.textContent = '#emBtn{position:absolute;right:30px;bottom:136px;width:46px;height:46px;border-radius:50%;background:#ffffff66;font-size:22px;padding:0;z-index:3}' +
      '.sheetBox .chip,.dlg .chip{width:auto;margin-top:0}.sheetBox .row2 button{margin-top:0}input[type=range]{padding:0;height:28px;margin:2px 0}';
    document.head.appendChild(st);

    /* ---------- keyframe sampling (poses: joint -> [x,y,z] degrees) ---------- */
    function sampleKeys(keys, t, loop, len) {
      if (!keys || !keys.length) return null;
      let arr = keys;
      if (loop && keys[keys.length - 1].t < len - 1e-3) arr = keys.concat({ t: len, j: keys[0].j });
      if (t <= arr[0].t) return arr[0].j;
      for (let i = 1; i < arr.length; i++) {
        const a = arr[i - 1], b = arr[i];
        if (t <= b.t) {
          let f = (t - a.t) / Math.max(b.t - a.t, 1e-4); f = f * f * (3 - 2 * f);
          const o = {};
          JOINTS.forEach(n => {
            const x = a.j[n], y = b.j[n];
            if (x && y) o[n] = [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f];
            else if (x || y) o[n] = x || y;
          });
          return o;
        }
      }
      return arr[arr.length - 1].j;
    }

    /* ---------- emotes (made by the owner) ---------- */
    const Emotes = {
      clean(e) {
        if (!e || typeof e !== 'object') return null;
        const len = num(e.len, 0.5, 60, 2);
        const keys = (Array.isArray(e.keys) ? e.keys : []).slice(0, 120).map(k => {
          const j = {};
          JOINTS.forEach(n => { const v = k && k.j && k.j[n]; if (Array.isArray(v)) j[n] = [num(v[0], -360, 360, 0), num(v[1], -360, 360, 0), num(v[2], -360, 360, 0)]; });
          return { t: num(k && k.t, 0, len, 0), j };
        }).sort((a, b) => a.t - b.t);
        return { id: String(e.id || '').slice(0, 24), name: String(e.name || 'Emote').slice(0, 24), len, loop: !!e.loop, keys };
      },
      all() { return DB.get('emotes', []); },
      list() { return this.all().filter(x => !x.down); },
      get(id) { return this.list().find(x => x.id === id) || null; },
      owned(k, id) { const e = this.get(id); return !!e && (Auth.isAdmin() || e.price <= 0 || DB.get('emoteown_' + k, []).includes(id)); },
      mine() { const k = Auth.key(); return this.list().filter(e => this.owned(k, e.id)).map(e => this.clean(e)); },
      buy(k, id) {
        const l = this.all(), e = l.find(x => x.id === id && !x.down);
        if (!e) return 'Not available';
        if (this.owned(k, id)) return 'You already own this emote';
        if (e.limited && (e.sold || 0) >= e.stock) return 'Sold out';
        if (!Wallet.spend(k, e.price)) return 'Not enough ' + GV + '. Top up in your wallet.';
        e.sold = (e.sold || 0) + 1; DB.set('emotes', l);
        const o = DB.get('emoteown_' + k, []); o.push(id); DB.set('emoteown_' + k, o);
        return null;
      },
      save(rec) {
        if (!Auth.isAdmin()) return 'Only the owner can create emotes';
        const name = String(rec.name || '').trim();
        if (name.length < 3 || name.length > 24) return 'Name must be 3-24 characters';
        if (Filter.has(name)) return 'That name is not allowed';
        const c = this.clean(rec);
        if (!c || !c.keys.length) return 'Add at least one key';
        const l = this.all(), old = l.find(x => x.id === rec.id);
        const r = {
          id: rec.id, name, price: clamp(Math.floor(+rec.price || 0), 0, CONFIG.MAX_PRICE),
          limited: !!rec.limited, stock: clamp(Math.floor(+rec.stock || 1), 1, CONFIG.MAX_STOCK),
          sold: old ? old.sold || 0 : 0, down: old ? !!old.down : false, downNote: old ? old.downNote || '' : '',
          len: c.len, loop: c.loop, keys: c.keys
        };
        const i = l.findIndex(x => x.id === r.id);
        if (i < 0) l.push(r); else l[i] = r;
        return DB.set('emotes', l) ? null : 'Could not save (storage is full)';
      }
    };
    window.Emotes = Emotes;

    /* ---------- avatar wrapper: timelines, emotes, custom body model ---------- */
    const mk0 = makeAvatar;
    makeAvatar = function (col, items, pack, face) {
      const av = mk0(col, items, pack, face);
      const c = Object.assign({}, DEFAULT_COLORS, col || {});
      const rig = av.g.children[0], P = av.parts;
      const J = { la: P.la.parent, ra: P.ra.parent, ll: P.ll.parent, rl: P.rl.parent, head: P.head.parent, torso: P.torso.parent.parent };
      let ov = null, clock = 0, mm = [], curPk = pack, lastSt = '', st0 = 0;
      const applyPose = p => { for (const k in p) { const r = p[k], jn = J[k]; if (jn && r) jn.rotation.set(r[0] * D2R, r[1] * D2R, r[2] * D2R); } };

      const applyModel = pk => {
        mm.forEach(o => { if (o.m.parent) o.m.parent.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); });
        mm = [];
        Object.values(P).forEach(p => { p.visible = true; });
        const md = pk && pk.model; if (!md) return;
        Object.keys(md.hide || {}).forEach(k => { if (md.hide[k] && P[k]) P[k].visible = false; });
        (md.parts || []).forEach(p => {
          const key = ATTACH.includes(p.attach) ? p.attach : '', o = ATTACH_ORIGIN[key];
          const host = key === '' ? rig : key === 'torso' ? P.torso.parent : P[key].parent;
          const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), new THREE.MeshLambertMaterial({ color: p.body && c[key] ? c[key] : p.color }));
          m.position.set(p.x - o[0], p.y - o[1], p.z - o[2]); m.castShadow = true;
          host.add(m); mm.push({ m, key, body: !!p.body });
        });
      };
      applyModel(pack);

      const an = av.anim, sp0 = av.setPack, sc0 = av.setColors;
      av.anim = function (t, state, dt, sp) {
        an(t, state, dt, sp);
        clock += dt || 0.016;
        const A = curPk && curPk.anims && curPk.anims[state];
        if (state !== lastSt) { lastSt = state; st0 = clock; }
        if (A && A.kf && A.kf.keys && A.kf.keys.length) {
          let tt = clock - st0; const L = A.kf.len || 1;
          tt = A.kf.loop ? tt % L : Math.min(tt, L);
          const p = sampleKeys(A.kf.keys, tt, !!A.kf.loop, L); if (p) applyPose(p);
        }
        if (ov) { const p = ov(clock); if (p) applyPose(p); }
      };
      av.setPack = function (p) { curPk = p; sp0(p); applyModel(p); };
      av.setColors = function (n) { Object.assign(c, n); sc0(n); mm.forEach(o => { if (o.body && n[o.key]) o.m.material.color.set(n[o.key]); }); };
      av.setOverride = f => { ov = f; };
      av.playEmote = function (em, onEnd) {
        const e = Emotes.clean(em); if (!e || !e.keys.length) return;
        const t0 = clock;
        ov = ct => {
          let t = ct - t0;
          if (t > e.len) { if (e.loop) t = t % e.len; else { ov = null; if (onEnd) onEnd(); return null; } }
          return sampleKeys(e.keys, t, e.loop, e.len);
        };
      };
      av.stopEmote = () => { ov = null; };
      return av;
    };

    /* ---------- drawn faces ---------- */
    const cleanDraw = d => {
      if (!d || !Array.isArray(d.rows) || d.rows.length !== 16) return null;
      const pal = (Array.isArray(d.pal) ? d.pal : []).slice(0, 36).map(h => hexOk(h, '#000000'));
      return { pal, rows: d.rows.map(r => String(r).padEnd(16, '.').slice(0, 16).replace(/[^0-9a-z.]/g, '.')) };
    };
    const ft0 = faceTexture;
    faceTexture = function (skin, spec) {
      if (!spec || !spec.draw) return ft0(skin, spec);
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const x = cv.getContext('2d'); x.fillStyle = skin; x.fillRect(0, 0, 256, 256);
      const d = spec.draw;
      for (let r = 0; r < 16; r++) for (let q = 0; q < 16; q++) {
        const ch = d.rows[r][q]; if (ch === '.') continue;
        const col = d.pal[parseInt(ch, 36)]; if (col) { x.fillStyle = col; x.fillRect(q * 16, r * 16, 16, 16); }
      }
      const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.anisotropy = 4;
      return t;
    };
    const fc0 = Faces.clean.bind(Faces);
    Faces.clean = function (s) { const o = fc0(s); const d = cleanDraw(s && s.draw); if (d) o.draw = d; return o; };

    /* ---------- packs: timelines + custom model ---------- */
    Packs.cleanModel = function (m) {
      m = m || {};
      const hide = {}; BODY_KEYS.forEach(k => { if (m.hide && m.hide[k]) hide[k] = true; });
      const parts = (Array.isArray(m.parts) ? m.parts : []).slice(0, 60).map(p => Object.assign(Subs.cleanParts([p], 1)[0], { body: !!(p && p.body) }));
      return { hide, parts };
    };
    const pc0 = Packs.clean.bind(Packs);
    Packs.clean = function (an) {
      const out = pc0(an);
      ANIM_STATES.forEach(s => {
        const kf = an && an[s] && an[s].kf;
        if (kf) { const e = Emotes.clean(kf); if (e && e.keys.length) out[s].kf = { len: e.len, loop: e.loop, keys: e.keys }; }
      });
      return out;
    };
    const ps0 = Packs.save.bind(Packs);
    Packs.save = function (rec) {
      const old = DB.get('packs', []).find(x => x.id === rec.id) || {};
      const err = ps0(rec); if (err) return err;
      const l = DB.get('packs', []), r = l.find(x => x.id === rec.id);
      if (r) { r.limited = !!rec.limited; r.stock = clamp(Math.floor(+rec.stock || 1), 1, CONFIG.MAX_STOCK); r.sold = old.sold || 0; r.model = Packs.cleanModel(rec.model); DB.set('packs', l); }
      return null;
    };
    Packs.buy = function (k, id) {
      const l = DB.get('packs', []), p = l.find(x => x.id === id && !x.down);
      if (!p) return 'Not available';
      if (this.owned(k, id)) return 'You already own this pack';
      if (p.limited && (p.sold || 0) >= p.stock) return 'Sold out';
      if (!Wallet.spend(k, p.price)) return 'Not enough ' + GV + '. Top up in your wallet.';
      p.sold = (p.sold || 0) + 1; DB.set('packs', l);
      const o = DB.get('packown_' + k, []); o.push(id); DB.set('packown_' + k, o);
      return null;
    };
    const fs0 = Faces.save.bind(Faces);
    Faces.save = function (rec) {
      const old = DB.get('faces', []).find(x => x.id === rec.id) || {};
      const err = fs0(rec); if (err) return err;
      const l = DB.get('faces', []), r = l.find(x => x.id === rec.id);
      if (r) { r.limited = !!rec.limited; r.stock = clamp(Math.floor(+rec.stock || 1), 1, CONFIG.MAX_STOCK); r.sold = old.sold || 0; DB.set('faces', l); }
      return null;
    };
    Faces.buy = function (k, id) {
      const l = DB.get('faces', []), f = l.find(x => x.id === id && !x.down);
      if (!f) return 'Not available';
      if (this.owned(k, id)) return 'You already own this face';
      if (f.limited && (f.sold || 0) >= f.stock) return 'Sold out';
      if (!Wallet.spend(k, f.price)) return 'Not enough ' + GV + '. Top up in your wallet.';
      f.sold = (f.sold || 0) + 1; DB.set('faces', l);
      const o = DB.get('faceown_' + k, []); o.push(id); DB.set('faceown_' + k, o);
      return null;
    };

    // custom model travels with the avatar to other players
    const ca0 = Net.cleanAv.bind(Net);
    Net.cleanAv = function (a) { const o = ca0(a); if (a && a.pack && a.pack.model) o.pack.model = Packs.cleanModel(a.pack.model); return o; };
    const pp0 = Play.payload.bind(Play);
    Play.payload = function (r) { const o = pp0(r); if (r.pack && r.pack.model) o.pack.model = r.pack.model; return o; };

    /* ---------- timeline editor (used for emotes and pack animations) ---------- */
    function tlEditor(init, o) {
      const E = Emotes.clean(init) || { len: 2, loop: true, keys: [] }, M = o.meta;
      const LB = { la: 'L Arm', ra: 'R Arm', ll: 'L Leg', rl: 'R Leg', torso: 'Torso', head: 'Head' };
      let t = 0, jn = 'la', playing = false, P = {};
      JOINTS.forEach(k => { P[k] = [0, 0, 0]; });
      const sh = Ui.sheet(`<h3>${esc(o.title)}</h3>` +
        (M ? `<input id="tmN" maxlength="24" placeholder="Name" value="${esc(M.name)}"><input id="tmP" type="number" min="0" placeholder="Price" value="${M.price}">
          <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="tmL" ${M.limited ? 'checked' : ''}> Limited</label>
          <input id="tmS" type="number" min="1" placeholder="Stock" value="${M.stock}">` : '') +
        `<div style="text-align:center"><canvas id="tlc" width="240" height="300"></canvas></div>
        <label class="lbl">Length in seconds (0.5 - 60)</label><input id="tlL" type="number" min="0.5" max="60" step="0.5" value="${E.len}">
        <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="tlLp" ${E.loop ? 'checked' : ''}> Loop</label>
        <label class="lbl">Time: <b id="tlTv">0.00</b>s</label><input type="range" id="tlT" min="0" max="${E.len}" step="0.05" value="0">
        <div class="chips" id="tlJ">${JOINTS.map(k => `<button class="chip ${k === jn ? 'on' : ''}" data-j="${k}">${LB[k]}</button>`).join('')}</div>
        ${['X', 'Y', 'Z'].map((a, i) => `<label class="lbl">${a} <b id="tv${i}">0</b>°</label><input type="range" id="ts${i}" min="-180" max="180" step="1" value="0">`).join('')}
        <div class="row2"><button id="tlSet">⏺ Set key</button><button class="gray" id="tlDel">Delete key</button></div>
        <label class="lbl">Keys (tap to jump)</label><div class="chips" id="tlK"></div>
        <div class="row2"><button class="gray" id="tlPlay">▶ Play</button><button id="tlSave">💾 Save</button></div>
        <button class="gray" id="tlClose">Close</button>`);
      const q = i => sh.querySelector('#' + i);
      sh.onclose = () => { AvatarView.stop(); if (o.onClose) o.onClose(); };
      AvatarView.start(q('tlc'), DEFAULT_COLORS, [], null, null, DEF_FACE);
      const av = () => AvatarView.av;
      const pose = () => { const s = sampleKeys(E.keys, t, false, E.len) || {}; const p = {}; JOINTS.forEach(k => { p[k] = s[k] ? s[k].slice() : [0, 0, 0]; }); return p; };
      const prev = () => { if (!playing && av()) av().setOverride(() => P); };
      const sliders = () => { for (let i = 0; i < 3; i++) { q('ts' + i).value = P[jn][i]; q('tv' + i).textContent = Math.round(P[jn][i]); } };
      const goT = v => { t = v; q('tlT').value = t; q('tlTv').textContent = t.toFixed(2); P = pose(); sliders(); prev(); };
      const keysUi = () => {
        const b = q('tlK');
        b.innerHTML = E.keys.map((k, i) => `<button class="chip" data-k="${i}">${k.t.toFixed(2)}s</button>`).join('') || '<span class="muted">No keys yet</span>';
        b.querySelectorAll('[data-k]').forEach(x => { x.onclick = () => goT(E.keys[+x.dataset.k].t); });
      };
      if (E.keys.length) P = pose();
      sliders(); keysUi(); prev();

      q('tlT').oninput = e => goT(+e.target.value);
      q('tlL').onchange = e => { E.len = clamp(+e.target.value || 2, 0.5, 60); q('tlT').max = E.len; if (t > E.len) goT(E.len); };
      q('tlLp').onchange = e => { E.loop = e.target.checked; };
      q('tlJ').querySelectorAll('[data-j]').forEach(b => {
        b.onclick = () => { jn = b.dataset.j; q('tlJ').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b)); sliders(); };
      });
      for (let i = 0; i < 3; i++) q('ts' + i).oninput = e => { P[jn][i] = +e.target.value; q('tv' + i).textContent = Math.round(P[jn][i]); prev(); };
      q('tlSet').onclick = () => {
        if (E.keys.length >= 120 && !E.keys.some(x => Math.abs(x.t - t) < 0.03)) return toast('Maximum 120 keys');
        const k = { t: +t.toFixed(2), j: JSON.parse(JSON.stringify(P)) }, i = E.keys.findIndex(x => Math.abs(x.t - k.t) < 0.03);
        if (i >= 0) E.keys[i] = k; else E.keys.push(k);
        E.keys.sort((a, b) => a.t - b.t); keysUi(); toast('Key set at ' + k.t.toFixed(2) + 's');
      };
      q('tlDel').onclick = () => {
        const i = E.keys.findIndex(x => Math.abs(x.t - t) < 0.06);
        if (i < 0) return toast('No key at this time');
        E.keys.splice(i, 1); keysUi();
      };
      q('tlPlay').onclick = () => {
        if (!playing) {
          if (!E.keys.length) return toast('Set at least one key');
          playing = true; q('tlPlay').textContent = '■ Stop';
          av().playEmote({ len: E.len, loop: true, keys: E.keys });
        } else { playing = false; q('tlPlay').textContent = '▶ Play'; av().stopEmote(); prev(); }
      };
      q('tlSave').onclick = () => {
        E.keys = E.keys.filter(k => k.t <= E.len);
        if (!E.keys.length) return toast('Set at least one key');
        const meta = M ? { name: q('tmN').value.trim(), price: q('tmP').value, limited: q('tmL').checked, stock: q('tmS').value } : null;
        const err = o.onSave({ len: E.len, loop: E.loop, keys: E.keys }, meta);
        if (err) return toast(err);
        Ui.close(sh);
      };
      q('tlClose').onclick = () => Ui.close(sh);
    }

    /* ---------- emote use in the game ---------- */
    Game.doEmote = function (em) {
      if (!this.running || this.dead) return;
      if (!this.animOK) return toast('Emotes are disabled in this game');
      if (this.seat || this.climbing || this.lay || this.lastState !== 'idle') return toast('Stand still to emote');
      const e = Emotes.clean(em); if (!e || !e.keys.length) return;
      this.emoting = true;
      this.av.playEmote(e, () => { this.emoting = false; });
      if (this.net) Net.send({ t: 'em', id: Net.isHost ? 'h' : undefined, e });
    };
    Game.stopEmote = function () {
      if (!this.emoting) return;
      this.emoting = false; this.av.stopEmote();
      if (this.net) Net.send({ t: 'em', id: Net.isHost ? 'h' : undefined, e: null });
    };
    const on0 = Game.onNet;
    Game.onNet = function (m, from) {
      if (m && m.t === 'em') {
        if (!this.running) return;
        const host = Net.isHost, id = host ? from : String(m.id || ''), r = this.remote[id];
        if (r) {
          const e = m.e ? Emotes.clean(m.e) : null;
          if (e && e.keys.length && this.animOK) r.av.playEmote(e); else r.av.stopEmote();
          if (host) Net.relay({ t: 'em', id, e: e && e.keys.length ? e : null }, from);
        }
        return;
      }
      return on0.call(this, m, from);
    };
    const ns0 = Game.netStep;
    Game.netStep = function (dt) {
      if (this.emoting && (this.lastState !== 'idle' || this.dead)) this.stopEmote();
      return ns0.call(this, dt);
    };
    const gs0 = Game.start;
    Game.start = function (m, a, o) { this.emoting = false; return gs0.call(this, m, a, o); };
    const sc0 = Game.sendChat;
    Game.sendChat = function () {
      const i = byId('chatIn'), m = /^\/e(?:mote)?\s+(.+)$/i.exec(i.value.trim());
      if (m) {
        i.value = '';
        const em = Emotes.mine().find(e => e.name.toLowerCase() === m[1].trim().toLowerCase());
        if (em) this.doEmote(em); else this.addMsg('', 'Emote not found. Open the 😀 menu.', true);
        return;
      }
      return sc0.call(this);
    };
    const eb = document.createElement('button');
    eb.id = 'emBtn'; eb.textContent = '😀';
    byId('gameUI').appendChild(eb);
    eb.onclick = () => {
      const l = Emotes.mine();
      const sh = Ui.sheet('<h3>Emotes</h3>' + (l.length ? l.map(e => `<button class="opt" data-e="${e.id}">${esc(e.name)} ${e.loop ? '🔁' : ''}</button>`).join('')
        : '<p class="muted">You have no emotes yet. Buy some in the Shop.</p>') + '<button class="gray" id="emX">Close</button>');
      sh.querySelectorAll('[data-e]').forEach(b => { b.onclick = () => { Ui.close(sh); Game.doEmote(l.find(e => e.id === b.dataset.e)); }; });
      sh.querySelector('#emX').onclick = () => Ui.close(sh);
    };

    /* ---------- shop (packs, faces, emotes, accessories, with Limited) ---------- */
    viewShop = function (el, me) {
      const items = DB.items().filter(i => !i.down).reverse();
      const packs = Packs.list().filter(p => p.id !== 'classic'), faces = Faces.list().filter(f => f.id !== 'classic'), ems = Emotes.list();
      const ltd = o => o.limited ? `<span class="badge">LIMITED · ${Math.max(0, o.stock - (o.sold || 0))} left</span> ` : '';
      const sold = o => o.limited && (o.sold || 0) >= o.stock;
      const row = (o, owned, buy, prev) => `<div class="part"><span><b>${esc(o.name)}</b><br>${ltd(o)}<span class="muted">${o.price > 0 ? GV + ' ' + o.price : 'Free'}</span></span>
        <span><button class="sm gray" onclick="${prev}('${o.id}')">👁</button>${owned ? '<button class="sm gray" disabled>Owned</button>'
        : sold(o) ? '<button class="sm gray" disabled>Sold out</button>' : `<button class="sm" onclick="${buy}('${o.id}')">Buy</button>`}</span></div>`;
      el.innerHTML = `
      <div class="card"><h3>Animation / body packs</h3>${packs.map(p => row(p, Packs.owned(me.key, p.id), 'buyPack', 'previewPack')).join('') || '<div class="muted">No packs yet.</div>'}</div>
      <div class="card"><h3>Faces</h3>${faces.map(f => row(f, Faces.owned(me.key, f.id), 'buyFace', 'previewFace')).join('') || '<div class="muted">No official faces yet.</div>'}</div>
      <div class="card"><h3>Emotes</h3>${ems.map(e => row(e, Emotes.owned(me.key, e.id), 'buyEmote', 'previewEmote')).join('') || '<div class="muted">No emotes yet.</div>'}
        <div class="muted" style="margin-top:6px">Use emotes in a game with the 😀 button or /e name.</div></div>
      <h3 style="margin-top:14px">Accessories</h3>` + (items.length
        ? `<div class="grid">${items.map(it => {
            const owned = Inv.has(me.key, it.id), left = it.limited ? it.stock - (it.sold || 0) : null, so = it.limited && left <= 0;
            return `<div class="gcard"><img src="${Thumb.get(it)}" alt=""><div class="info"><h4>${esc(it.name)}</h4>
              <div class="muted">by ${esc(it.creator)} · ${esc(it.slot)}</div>
              ${it.limited ? `<span class="badge">LIMITED · ${Math.max(0, left)} left</span>` : ''}
              <div style="margin-top:4px;font-weight:bold;color:#ffd24d">${it.price > 0 ? GV + ' ' + it.price : 'Free'}</div>
              <button ${owned || so ? 'class="gray" disabled' : ''} onclick="buyItem('${it.id}')">${owned ? 'Owned' : so ? 'Sold out' : 'Buy'}</button></div></div>`;
          }).join('')}</div>`
        : '<div class="card muted">The shop is empty. Creators can submit accessories from the Create tab.</div>');
    };
    window.buyEmote = function (id) {
      const me = Auth.me(), e = Emotes.get(id); if (!e) return;
      uiConfirm(`Buy emote "${e.name}" for ${e.price} ${GV}?`, () => {
        const err = Emotes.buy(me.key, id);
        if (err) { uiAlert(err); return; }
        toast('Purchased! Use it in a game with the 😀 button.'); render();
      }, 'Buy', '');
    };
    window.previewEmote = function (id) {
      const e = Emotes.get(id); if (!e) return;
      modal('Preview: ' + e.name, '<div style="text-align:center"><canvas id="pev" width="240" height="300"></canvas></div>', [{ label: 'Close', cls: 'gray', fn: () => AvatarView.stop() }]);
      AvatarView.start(byId('pev'), Avatar.get(Auth.key()).colors, [], null, null, Faces.equipped(Auth.key()));
      AvatarView.av.playEmote(Object.assign({}, Emotes.clean(e), { loop: true }));
    };

    /* ---------- admin: emotes ---------- */
    window.adminEmote = function (id) {
      if (!Auth.isAdmin()) return;
      const ex = id ? Emotes.all().find(x => x.id === id) : null;
      tlEditor(ex || null, {
        title: ex ? 'Edit emote' : 'New emote',
        meta: { name: ex ? ex.name : '', price: ex ? ex.price : 0, limited: ex ? !!ex.limited : false, stock: ex ? ex.stock : 100 },
        onSave: (res, meta) => {
          const err = Emotes.save({ id: ex ? ex.id : uid(), name: meta.name, price: meta.price, limited: meta.limited, stock: meta.stock, len: res.len, loop: res.loop, keys: res.keys });
          if (!err) render();
          return err;
        }
      });
    };
    window.adminTdEmote = function (id, on) {
      adminTd(on, 'Takedown reason', (o, r) => {
        const l = Emotes.all(), e = l.find(x => x.id === id);
        if (e) { e.down = !!o; e.downNote = o ? r : ''; DB.set('emotes', l); }
      });
    };
    window.adminEmoteDel = function (id) {
      uiConfirm('Delete this emote?', () => { DB.set('emotes', Emotes.all().filter(x => x.id !== id)); render(); }, 'Delete');
    };
    const va2 = viewAdmin;
    viewAdmin = function (el, me) {
      va2(el, me);
      if (!Auth.isAdmin()) return;
      const ems = Emotes.all(), d = document.createElement('div');
      d.innerHTML = `<div class="card"><h3>Emotes (${ems.length})</h3>` + ems.map(e => `<div class="part"><span><b>${esc(e.name)}</b><br>
        <span class="muted">${e.price} ${GV} · ${e.len}s${e.loop ? ' · loop' : ''}${e.limited ? ' · LTD ' + e.stock : ''}${e.down ? ' · DOWN' : ''}</span></span>
        <span><button class="sm" onclick="adminEmote('${e.id}')">Edit</button>
        ${e.down ? `<button class="sm" onclick="adminTdEmote('${e.id}',false)">Restore</button>` : `<button class="sm red" onclick="adminTdEmote('${e.id}',true)">Takedown</button>`}
        <button class="sm red" onclick="adminEmoteDel('${e.id}')">🗑</button></span></div>`).join('') +
        '<button onclick="adminEmote()">➕ New emote (timeline)</button></div>';
      el.appendChild(d);
    };

    /* ---------- admin: animation / body / model pack editor ---------- */
    adminPack = function (id) {
      if (!Auth.isAdmin()) return;
      const ex = id ? DB.get('packs', []).find(p => p.id === id) : null;
      const an = ex ? ex.anims : Packs.template('classic');
      const body = Packs.cleanBody(ex ? ex.body : null), md = Packs.cleanModel(ex ? ex.model : null);
      const drafts = Drafts.list(Auth.key());
      modal(ex ? 'Edit pack' : 'New pack', `
        <input id="pkN" maxlength="24" placeholder="Pack name" value="${esc(ex ? ex.name : '')}">
        <input id="pkP" type="number" min="0" placeholder="Price" value="${ex ? ex.price : 0}">
        <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="pkLt" ${ex && ex.limited ? 'checked' : ''}> Limited</label>
        <input id="pkSt" type="number" min="1" placeholder="Stock" value="${ex && ex.stock ? ex.stock : 100}">
        <div style="text-align:center"><canvas id="pkc" width="240" height="300"></canvas></div>
        <select id="pkS">${ANIM_STATES.map(s => `<option>${s}</option>`).join('')}</select>
        <label class="lbl">Body shape: scale X, Y, Z per part (0.3 - 3)</label>${bodyGrid(body)}
        <label class="lbl">Custom model: hide the default parts you replace</label>
        ${BODY_KEYS.map(k => `<label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="mh_${k}" ${md.hide[k] ? 'checked' : ''}> ${PART_LABELS[k]}</label>`).join('')}
        <select id="pmD"><option value="">Load model from an accessory draft...</option>${drafts.map(d => `<option value="${d.id}">${esc(d.name || 'Untitled')}</option>`).join('')}</select>
        <textarea id="pkM" class="code" rows="4" spellcheck="false" autocapitalize="off">${esc(JSON.stringify(md.parts))}</textarea>
        <label class="lbl">Animations (timelines are stored here too)</label>
        <textarea id="pkJ" class="code" rows="6" spellcheck="false" autocapitalize="off">${esc(JSON.stringify(an, null, 1))}</textarea>
        <p class="muted">Tip: design the model in Studio (Avatar mode), Save it as a draft, then load it above.</p>`, [
        { label: '👁 Preview', fn: () => { pkPrev(); return false; } },
        {
          label: '⏱ Timeline for the selected state', fn: () => {
            const s = byId('pkS').value; let a;
            try { a = JSON.parse(byId('pkJ').value); } catch (e) { toast('Invalid animations JSON'); return false; }
            tlEditor(a[s] && a[s].kf, {
              title: 'Timeline: ' + s,
              onSave: res => { a[s] = a[s] || {}; a[s].kf = res; byId('pkJ').value = JSON.stringify(a, null, 1); return null; },
              onClose: restore
            });
            return false;
          }
        },
        {
          label: 'Remove timeline of the selected state', cls: 'gray', fn: () => {
            const s = byId('pkS').value; let a;
            try { a = JSON.parse(byId('pkJ').value); } catch (e) { toast('Invalid animations JSON'); return false; }
            if (a[s]) delete a[s].kf;
            byId('pkJ').value = JSON.stringify(a, null, 1); pkPrev(); return false;
          }
        },
        { label: 'Template: Zombie anims', cls: 'gray', fn: () => { byId('pkJ').value = JSON.stringify(Packs.template('zombie'), null, 1); pkPrev(); return false; } },
        { label: 'Template: Chibi body', cls: 'gray', fn: () => { setBodyInputs(Packs.bodyTemplate('chibi')); pkPrev(); return false; } },
        { label: 'Template: Giant body', cls: 'gray', fn: () => { setBodyInputs(Packs.bodyTemplate('giant')); pkPrev(); return false; } },
        { label: 'Reset body', cls: 'gray', fn: () => { setBodyInputs(Packs.cleanBody(null)); pkPrev(); return false; } },
        {
          label: '💾 Save', fn: () => {
            let a, m;
            try { a = JSON.parse(byId('pkJ').value); } catch (e) { toast('Invalid animations JSON'); return false; }
            try { m = readModel(); } catch (e) { toast(e.message); return false; }
            const err = Packs.save({ id: ex ? ex.id : uid(), name: byId('pkN').value, price: byId('pkP').value, anims: a, body: readBody(), model: m, limited: byId('pkLt').checked, stock: byId('pkSt').value });
            if (err) { toast(err); return false; }
            AvatarView.stop(); toast('Pack saved'); render();
          }
        },
        { label: 'Close', cls: 'gray', fn: () => AvatarView.stop() }]);

      const readModel = () => {
        const hide = {}; BODY_KEYS.forEach(k => { hide[k] = byId('mh_' + k).checked; });
        let parts = [];
        try { parts = JSON.parse(byId('pkM').value || '[]'); } catch (e) { throw new Error('Invalid model JSON'); }
        return Packs.cleanModel({ hide, parts });
      };
      const cur = () => ({ anims: Packs.clean(JSON.parse(byId('pkJ').value)), body: readBody(), model: readModel() });
      const pkPrev = () => { try { AvatarView.av.setPack(cur()); } catch (e) { toast(e.message || 'Invalid JSON'); } };
      const restore = () => {
        const old = byId('pkc'); if (!old) return;
        const nc = old.cloneNode(false); old.replaceWith(nc);
        try { AvatarView.start(nc, DEFAULT_COLORS, [], null, cur(), DEF_FACE); AvatarView.state = byId('pkS').value; } catch (e) {}
      };
      AvatarView.start(byId('pkc'), DEFAULT_COLORS, [], null, { anims: Packs.clean(an), body, model: md }, DEF_FACE);
      byId('pkS').onchange = e => { AvatarView.state = e.target.value; };
      byId('pmD').addEventListener('change', e => {
        const d = Drafts.get(Auth.key(), e.target.value); if (!d) return;
        const parts = (d.parts || []).filter(p => p.type === 'part').map(p => ({ attach: p.attach || '', x: p.x, y: p.y, z: p.z, w: p.w, h: p.h, d: p.d, color: p.color }));
        byId('pkM').value = JSON.stringify(parts); pkPrev(); toast('Model loaded (' + parts.length + ' parts)');
      });
    };

    /* ---------- admin: face editor (draw it yourself) ---------- */
    const FPAL = ['#000000', '#ffffff', '#7a3b12', '#c4281c', '#e8a317', '#f9d62e', '#2ee66b', '#13a538', '#0d99ff', '#0d69ac', '#8e24aa', '#ff98dc'];
    adminFace = function (id) {
      if (!Auth.isAdmin()) return;
      const ex = id ? DB.get('faces', []).find(f => f.id === id) : null;
      const sp = Faces.clean(ex ? ex.spec : null);
      const rows = sp.draw ? sp.draw.rows.map(r => r.split('')) : Array.from({ length: 16 }, () => Array(16).fill('.'));
      const pal = sp.draw ? sp.draw.pal.slice(0, 12) : FPAL.slice();
      while (pal.length < 12) pal.push('#000000');
      let sel = 0, down = false;
      modal(ex ? 'Edit face' : 'New face (draw it)', `
        <input id="fcN" maxlength="24" placeholder="Face name" value="${esc(ex ? ex.name : '')}">
        <input id="fcP" type="number" min="0" placeholder="Price" value="${ex ? ex.price : 0}">
        <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="fcLt" ${ex && ex.limited ? 'checked' : ''}> Limited</label>
        <input id="fcSt" type="number" min="1" placeholder="Stock" value="${ex && ex.stock ? ex.stock : 100}">
        <div style="text-align:center"><canvas id="fcg" width="256" height="256" style="touch-action:none;width:256px;height:256px;border-radius:6px"></canvas></div>
        <div class="chips" id="fcPal"></div>
        <label class="lbl">Edit the selected color</label><input type="color" id="fcCol" value="${pal[0]}">
        <div class="row2"><button class="gray" id="fcEr">Eraser</button><button class="gray" id="fcCl">Clear</button><button class="gray" id="fcSm">Smile</button></div>
        <div style="text-align:center"><canvas id="fcc" width="240" height="300"></canvas></div>`, [
        {
          label: '💾 Save', fn: () => {
            const err = Faces.save({ id: ex ? ex.id : uid(), name: byId('fcN').value, price: byId('fcP').value, spec: spec(), limited: byId('fcLt').checked, stock: byId('fcSt').value });
            if (err) { toast(err); return false; }
            AvatarView.stop(); toast('Face saved'); render();
          }
        },
        { label: 'Close', cls: 'gray', fn: () => AvatarView.stop() }]);

      const g = byId('fcg'), cx = g.getContext('2d');
      const redraw = () => {
        cx.fillStyle = '#f5cd30'; cx.fillRect(0, 0, 256, 256);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const ch = rows[y][x]; if (ch === '.') continue;
          cx.fillStyle = pal[parseInt(ch, 36)] || '#000'; cx.fillRect(x * 16, y * 16, 16, 16);
        }
        cx.strokeStyle = 'rgba(0,0,0,.12)';
        for (let i = 0; i <= 16; i++) { cx.beginPath(); cx.moveTo(i * 16, 0); cx.lineTo(i * 16, 256); cx.moveTo(0, i * 16); cx.lineTo(256, i * 16); cx.stroke(); }
      };
      const spec = () => {
        const any = rows.some(r => r.some(ch => ch !== '.'));
        return Faces.clean({ draw: any ? { pal, rows: rows.map(r => r.join('')) } : null });
      };
      const pv = () => { if (AvatarView.av) AvatarView.av.setFace(spec()); };
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
      byId('fcSm').onclick = () => {
        rows.forEach(r => r.fill('.'));
        [[4, 5], [5, 5], [10, 5], [11, 5], [4, 6], [5, 6], [10, 6], [11, 6], [4, 9], [5, 10], [6, 11], [7, 11], [8, 11], [9, 11], [10, 10], [11, 9]].forEach(p => { rows[p[1]][p[0]] = '0'; });
        redraw(); pv();
      };
      chips(); redraw();
      AvatarView.start(byId('fcc'), DEFAULT_COLORS, [], null, null, spec());
    };
  }
})();
