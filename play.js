/* =====================================================
   PLAY + SOCIAL + EXTRAS
   - Play     : game page with server list, join a server, quick play
   - Social   : friends (requests, presence, join friend), profile, settings
   - Sfx      : basic sounds (WebAudio, no files)
   - Patches  : AFK kick, one player per seat, owner admin tools, pay-once publish
   ===================================================== */
const AFK_MS = 20 * 60 * 1000;

const Play = {
  busy: false,

  payload(r) {
    return { colors: r.colors, items: r.items.map(i => ({ parts: i.parts })), face: r.face, pack: { anims: r.pack.anims, body: r.pack.body } };
  },

  cleanMap(d) {
    d = d || {};
    const parts = (Array.isArray(d.parts) ? d.parts : []).slice(0, 3000).map(n => {
      n = n || {};
      const t = NODE_T.includes(n.type) ? n.type : 'part';
      const o = { id: String(n.id || '').slice(0, 24), type: t, name: String(n.name || 'Part').slice(0, 30), parent: n.parent ? String(n.parent).slice(0, 24) : null };
      if (t === 'part') {
        o.x = num(n.x, -5000, 5000, 0); o.y = num(n.y, -5000, 5000, 0); o.z = num(n.z, -5000, 5000, 0);
        o.w = num(n.w, 0.2, 2000, 1); o.h = num(n.h, 0.2, 2000, 1); o.d = num(n.d, 0.2, 2000, 1);
        o.color = hexOk(n.color, '#a3a2a5'); o.spawn = !!n.spawn; o.anch = n.anch !== false; o.col = n.col !== false;
      } else if (t === 'script' || t === 'localscript') {
        o.code = String(n.code || '').slice(0, 30000); o.off = !!n.off;
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
  },

  // entry points used by the menus: they open the game page
  open(id) { this.page(String(id)); },
  openRecent(id) { this.page(String(id)); },
  join(code) { this.page(String(code).trim().toLowerCase()); },

  metaOf(id) {
    const g = DB.games().find(x => x.id === id), rc = DB.get('rc_' + id, null), lm = Lobby.list.find(x => x.id === id);
    if (g) return { id, name: g.name, desc: g.desc || '', author: g.author, max: g.maxPlayers || 8, owner: g.authorKey };
    if (lm) return { id, name: lm.name, desc: lm.desc, author: lm.author, max: lm.max, owner: lm.owner };
    if (rc) return { id, name: rc.meta.name, desc: '', author: rc.meta.author || '', max: rc.meta.maxPlayers || 8, owner: '' };
    return { id, name: 'Game ' + id, desc: '', author: '', max: 8, owner: '' };
  },

  // Roblox-style game page with a server list
  page(id) {
    if (!/^[a-z0-9]{4,24}$/.test(id)) return toast('Invalid code');
    const why = Mod.blocked(id); if (why) return toast(why);
    const m = this.metaOf(id);
    modal(m.name, `<p class="muted">by ${esc(m.author || 'unknown')} ${m.owner && Auth.isVerified(m.owner) ? '<span class="vb">✔</span>' : ''} · Max ${m.max} players</p>
      <p>${esc(m.desc || '')}</p><h3 style="margin-top:8px">Servers</h3><div id="svl" class="muted">Looking for servers...</div>`, [
      { label: '▶ Quick play', fn: () => { Play.launch(id, 0); } },
      { label: '＋ New server', cls: 'gray', fn: () => { Play.launch(id, Play.newSlot || 1); } },
      { label: 'Close', cls: 'gray' }]);
    this.newSlot = 1;
    Net.probe(id, res => {
      const box = byId('svl'); if (!box) return;
      const used = res.filter(r => !r.empty).map(r => r.slot);
      let s = 1; while (used.includes(s)) s++;
      this.newSlot = s;
      const live = res.filter(r => !r.empty);
      box.innerHTML = live.length ? live.map(r => `<div class="part"><span>Server ${r.slot} · ${r.n}/${r.max} players</span>
        <span><button class="sm" data-j="${r.slot}" ${r.n >= r.max ? 'disabled' : ''}>Join</button></span></div>`).join('')
        : 'No server is running yet. Press New server or Quick play.';
      box.querySelectorAll('button[data-j]').forEach(b => { b.onclick = () => { closeModal(); Play.launch(id, +b.dataset.j); }; });
    });
  },

  // start a game: find the map (own game, recent, lobby), then connect
  launch(id, slot) {
    const why = Mod.blocked(id); if (why) return toast(why);
    const g = DB.games().find(x => x.id === id);
    if (g) {
      const data = GameData.get(id);
      if (!data) return toast('Game data is missing');
      const me = Auth.me();
      if (!(g.visitors || []).includes(me.key)) { const gs = DB.games(), x = gs.find(q => q.id === id); x.visitors = x.visitors || []; x.visitors.push(me.key); DB.set('games', gs); }
      return this.go(g, data, slot);
    }
    const r = DB.get('rc_' + id, null);
    if (r) return this.go(r.meta, r.data, slot);
    toast('Looking for the game...');
    Lobby.fetch(id, data => {
      const lm = Lobby.list.find(x => x.id === id);
      const meta = { id, name: lm ? lm.name : 'Game ' + id, maxPlayers: lm ? lm.max : 8, author: lm ? lm.author : '' };
      if (data) { const m = this.cleanMap(data); this.remember(id, meta, m); return this.go(meta, m, slot); }
      this.go(meta, null, slot);   // no map: only works when a live server exists
    });
  },

  remember(id, meta, m) {
    const l = DB.get('recent', []).filter(x => x !== id);
    l.unshift(id);
    while (l.length > 15) DB.del('rc_' + l.pop());
    DB.set('recent', l);
    DB.set('rc_' + id, { meta, data: m });
  },

  go(meta, data, slot) {
    if (this.busy) return;
    this.busy = true;
    const me = Auth.me(), r = Wear.resolve(me.key);
    const map = data ? Object.assign({}, this.cleanMap(data), { meta: { name: meta.name, max: meta.maxPlayers || 8, author: meta.author || '' } }) : null;
    let fin = false, tm = null;

    const begin = (info, net) => {
      const m = this.cleanMap(info.map), mt = m.meta || {};
      const name = String(mt.name || meta.name || 'Game').slice(0, 40);
      const max = clamp(+mt.max || meta.maxPlayers || 8, 1, CONFIG.MAX_PLAYERS_LIMIT);
      if (!data) this.remember(meta.id, { id: meta.id, name, maxPlayers: max, author: mt.author || '' }, m);
      Game.start(m, r, {
        onExit: () => { render(); }, name: me.name, gname: name, max, test: false,
        net, id: info.id, players: info.players, dyn: info.dyn, watch: info.watch
      });
      if (net) {
        if (Game.running) { Net.release(); Lobby.pres = { gid: meta.id, slot: Net.slot, gname: name }; Lobby.last = 0; }
        else Net.leave();
      }
    };

    tm = setTimeout(() => {
      if (fin) return;
      fin = true; this.busy = false;
      Net.leave();
      if (map) { toast('Multiplayer unavailable, playing offline'); begin({ host: true, id: 'h', map, players: [] }, false); }
      else toast('Could not connect. Check the code and your internet.');
    }, 25000);

    Net.enter({
      gid: meta.id, slot: slot || 0, max: meta.maxPlayers || 8, name: me.name, av: this.payload(r), map,
      snapshot: () => Game.netSnapshot(), watch: () => Game.netWatch(),
      onMsg: (m, from) => Game.onNet(m, from),
      onJoin: p => Game.onJoin(p), onLeft: id => Game.onLeft(id), onClosed: () => Game.onClosed(),
      onKick: reason => Game.onKick(reason),
      done: (err, info) => {
        if (fin) return;
        fin = true; clearTimeout(tm); this.busy = false;
        if (err) { toast(err); return; }
        if (info.solo && info.reason) toast('Playing offline: ' + info.reason);
        begin(info, !info.solo);
      }
    });
  }
};

/* =====================================================
   SFX: basic sounds made with WebAudio (no files)
   ===================================================== */
const Sfx = {
  c: null,
  on() { return !DB.get('mute', false); },
  ctx() {
    if (!this.c) { try { this.c = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (this.c && this.c.state === 'suspended') this.c.resume();
    return this.c;
  },
  tone(f0, f1, dur, type, vol) {
    if (!this.on()) return;
    const c = this.ctx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  jump() { this.tone(300, 620, 0.12, 'square', 0.04); },
  hit() { this.tone(220, 90, 0.16, 'sawtooth', 0.07); },
  die() { this.tone(420, 40, 0.6, 'sawtooth', 0.09); },
  sit() { this.tone(520, 380, 0.08, 'triangle', 0.06); }
};

/* =====================================================
   SOCIAL: friends, presence, profile, settings
   ===================================================== */
const Social = {
  d() { return DB.get('fr_' + Auth.key(), { list: [], req: [] }); },
  save(d) { DB.set('fr_' + Auth.key(), d); },
  names() { return this.d().list; },
  inbox(x) {
    if (!x || typeof x !== 'object' || !Auth.key()) return;
    const f = String(x.from || '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(f) || f === Auth.key()) return;
    const d = this.d();
    if (x.k === 'req') { if (!d.list.includes(f) && !d.req.includes(f)) { d.req.push(f); this.save(d); toast(f + ' sent you a friend request'); } }
    else if (x.k === 'acc') { if (!d.list.includes(f)) { d.list.push(f); d.req = d.req.filter(r => r !== f); this.save(d); toast(f + ' is now your friend'); } }
    Lobby.draw();
  },
  add(name) {
    name = String(name || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(name)) return toast('Invalid username');
    if (name === Auth.key()) return toast('That is you');
    if (this.d().list.includes(name)) return toast('Already friends');
    Lobby.send({ t: 'fr', k: 'req', from: Auth.key(), to: name });
    toast('Request sent to ' + name);
  },
  accept(f) {
    const d = this.d(); d.req = d.req.filter(x => x !== f);
    if (!d.list.includes(f)) d.list.push(f);
    this.save(d); Lobby.send({ t: 'fr', k: 'acc', from: Auth.key(), to: f }); Lobby.draw();
  },
  decline(f) { const d = this.d(); d.req = d.req.filter(x => x !== f); this.save(d); Lobby.draw(); },
  remove(f) { const d = this.d(); d.list = d.list.filter(x => x !== f); this.save(d); Lobby.draw(); },

  mount(el) { const d = document.createElement('div'); d.id = 'flist'; el.appendChild(d); this.draw(); },
  draw() {
    const box = byId('flist'); if (!box || !Auth.key()) return;
    const me = Auth.me(), d = this.d(), gfx = DB.get('gfx', 'low');
    box.innerHTML = `<div class="card"><h3>👥 Friends</h3>
      ${d.req.map(f => `<div class="part"><span>${esc(f)} wants to be your friend</span><span>
        <button class="sm" onclick="Social.accept('${f}')">Accept</button><button class="sm gray" onclick="Social.decline('${f}')">✕</button></span></div>`).join('')}
      ${d.list.map(f => { const p = Lobby.fpres[f]; return `<div class="part"><span>${esc(f)} ${Auth.isVerified(f) ? '<span class="vb">✔</span>' : ''}<br><span class="muted">${p ? '🟢 Playing ' + esc(p.gname) : 'Not in a game'}</span></span><span>
        ${p ? `<button class="sm" onclick="Play.launch('${p.gid}',${p.slot})">Join</button>` : ''}<button class="sm gray" onclick="Social.remove('${f}')">🗑</button></span></div>`; }).join('') || '<div class="muted">No friends yet.</div>'}
      <div class="row2"><input id="frN" placeholder="Add friend by username" maxlength="20"><button onclick="Social.add(byId('frN').value)">Add</button></div></div>
      <div class="card"><h3>Profile & settings</h3>
      <div class="part"><span><b>${esc(me.name)}</b> ${Auth.isVerified(me.key) ? '<span class="vb">✔</span>' : ''}<br><span class="muted">Joined ${new Date(me.created || Date.now()).toLocaleDateString()}</span></span></div>
      <div class="part"><span>Sound</span><span><button class="sm ${Sfx.on() ? '' : 'gray'}" onclick="DB.set('mute',${Sfx.on()});Social.draw()">${Sfx.on() ? 'On' : 'Off'}</button></span></div>
      <div class="part"><span>Graphics (High can lag on phones)</span><span><button class="sm ${gfx === 'high' ? 'gray' : ''}" onclick="DB.set('gfx','low');Social.draw()">Low</button>
        <button class="sm ${gfx === 'high' ? '' : 'gray'}" onclick="DB.set('gfx','high');Social.draw()">High</button></span></div></div>`;
  }
};

/* =====================================================
   PATCHES (wrap existing functions, app.js stays untouched)
   ===================================================== */
(function () {
  const st = document.createElement('style');
  st.textContent = '.vb{display:inline-flex;width:15px;height:15px;border-radius:50%;background:#1d9bf0;color:#fff;font-size:10px;align-items:center;justify-content:center;font-weight:900;vertical-align:middle}';
  document.head.appendChild(st);

  // Games tab: online games + friends under the list
  const hv = viewHome;
  viewHome = function (el, me) { hv(el, me); Lobby.mount(el); Social.mount(el); };

  // render: show ban message, enforce deductions, verified badge in header
  const rd = window.render;
  window.render = function () {
    Auth.me();
    if (Auth.flash) { authErr = Auth.flash; Auth.flash = ''; }
    rd();
    const me = Auth.me();
    if (me) {
      Mod.deducts();
      const hr = document.querySelector('.hr');
      if (hr && Auth.isVerified(me.key) && !hr.querySelector('.vb')) { const s = document.createElement('span'); s.className = 'vb'; s.textContent = '✔'; hr.insertBefore(s, hr.firstChild); }
    }
  };

  // graphics quality: default Low (pixel ratio 1) so phones do not lag
  const mt = Gfx.mount.bind(Gfx);
  Gfx.mount = function (host) { const r = mt(host); r.setPixelRatio(DB.get('gfx', 'low') === 'high' ? PIX() : 1); return r; };

  // activity tracking for the AFK kick
  const act = () => { Game.lastAct = Date.now(); };
  ['keydown', 'pointerdown', 'pointermove', 'touchstart'].forEach(ev => addEventListener(ev, act, { passive: true }));
  addEventListener('pointerdown', () => { Sfx.ctx(); }, { passive: true });
  Game.lastAct = Date.now();

  const gs = Game.start;
  Game.start = function (m, a, o) { this.lastAct = Date.now(); this._ps = null; this._ph = undefined; this._pd = false; return gs.call(this, m, a, o); };

  // every frame: AFK kick, one player per seat, sounds
  const ns = Game.netStep;
  Game.netStep = function (dt) {
    if (this.running) {
      if (!this.test && Date.now() - this.lastAct > AFK_MS && !this._afk) {
        this._afk = 1;
        setTimeout(() => { this._afk = 0; if (this.running) { this.leave(); uiAlert('You were removed from the game after 20 minutes of inactivity.'); } }, 0);
      }
      if (this.seat && this.net) {
        for (const r of Object.values(this.remote)) {
          if (r.seat === this.seat.id && r.id < this.myId) { this.leaveSeat(false); break; }
        }
      }
      const s = this.lastState;
      if (this._ps !== s) { if (s === 'jump' && this._ps !== 'climb' && this._ps !== 'swim') Sfx.jump(); if (s === 'sit') Sfx.sit(); this._ps = s; }
      if (this._ph !== undefined && this.hp < this._ph - 1) Sfx.hit();
      this._ph = this.hp;
      if (this.dead && !this._pd) Sfx.die();
      this._pd = this.dead;
    }
    return ns.call(this, dt);
  };

  // publishing is paid once per place: edits, takedowns and republishing are free
  const dp = St.doPublish;
  St.doPublish = function () {
    const c = this.cur, old = CONFIG.MAP_PRICE;
    if (c && c.paid) CONFIG.MAP_PRICE = 0;
    let r;
    try { r = dp.call(this); } finally { CONFIG.MAP_PRICE = old; }
    if (c && c.gameId && r !== false) { c.paid = true; const me = Auth.me(); if (me) Places.save(me.key, c); }
    return r;
  };

  // deleting a game also removes it from other players' devices (signed list)
  window.adminRemoveGame = function (id) {
    uiConfirm('Delete this game permanently? It also disappears for other players.', () => {
      DB.set('games', DB.games().filter(g => g.id !== id)); GameData.del(id);
      const l = DB.get('modgone', []); l.push(id); DB.set('modgone', l.slice(-500));
      Lobby.last = 0; Lobby.sync(); render();
    }, 'Delete');
  };

  // Admin tab: moderation tools under the existing cards
  const va = viewAdmin;
  viewAdmin = function (el, me) {
    va(el, me);
    if (!Auth.isAdmin()) return;
    const hasKey = !!DB.get('modkey', null), pub = !!CONFIG.OWNER_PUB;
    const d = document.createElement('div');
    d.innerHTML = `<div class="card"><h3>🛡 Moderation (spreads to all players)</h3>
      <p class="muted">Signing key: ${hasKey ? 'on this device ✅' : 'not created ❌'} · OWNER_PUB in data.js: ${pub ? 'set ✅' : 'empty ❌'}.
      Takedowns, deleted games, bans, verified marks, GV deductions and bad words are signed with your private key and downloaded by other devices through the lobby.</p>
      <button onclick="adminGenKey()">🔑 Generate moderation key</button>
      <button class="gray" onclick="Lobby.last=0;Lobby.sync();toast('Publishing moderation...')">📡 Publish now</button>
      <label class="lbl">Username</label><input id="mdU" placeholder="username" maxlength="20">
      <label class="lbl">Amount (GV) / temporary password</label><input id="mdA" placeholder="amount or new password">
      <button class="red" onclick="adminDeduct()">➖ Deduct GV</button>
      <button onclick="adminVerify()">✔ Toggle verified badge</button>
      <button class="gray" onclick="adminTempPass()">🔐 Set temporary password</button>
      <label class="lbl">Add a banned word</label><div class="row2"><input id="mdW" placeholder="word" maxlength="20"><button onclick="adminWord()">Add</button></div>
      <button class="red" onclick="adminWipe()">🗑 Wipe ALL data on this device</button></div>`;
    el.appendChild(d);
  };
})();

function adminGenKey() {
  if (!Mod.ok()) return uiAlert('This browser has no WebCrypto (needs https or localhost).');
  const go = () => Mod.genKey().then(pub => showText('Public key', 'Paste this JSON into CONFIG.OWNER_PUB in data.js (replace null), then use that data.js on your website.', JSON.stringify(pub))).catch(e => uiAlert('Failed: ' + e.message));
  if (DB.get('modkey', null)) uiConfirm('A key already exists. A new key invalidates the old OWNER_PUB. Continue?', go, 'Generate');
  else go();
}
function adminUser() {
  const k = byId('mdU').value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(k)) { toast('Enter a valid username'); return null; }
  return k;
}
function adminDeduct() {
  const k = adminUser(), a = Math.floor(+byId('mdA').value); if (!k) return;
  if (!(a > 0)) return toast('Enter an amount');
  const id = uid(), l = DB.get('moddeduct', []); l.push({ id, k, a });
  DB.set('moddeduct', l.slice(-300));
  if (DB.users()[k]) { const t = Wallet.deduct(k, a); const done = DB.get('dedone', []); done.push(id); DB.set('dedone', done); toast('Deducted ' + t + ' ' + GV + ' from ' + k); }
  else toast('Queued. It applies when ' + k + ' is online.');
  Lobby.last = 0; Lobby.sync(); render();
}
function adminVerify() {
  const k = adminUser(); if (!k) return;
  let l = DB.get('modver', []);
  l = l.includes(k) ? l.filter(x => x !== k) : l.concat(k);
  DB.set('modver', l);
  Lobby.last = 0; Lobby.sync(); toast(l.includes(k) ? k + ' is verified' : 'Badge removed'); render();
}
function adminTempPass() {
  const k = adminUser(), p = byId('mdA').value; if (!k) return;
  if (!DB.users()[k]) return toast('That account is not on this device');
  if (p.length < 6) return toast('Password must be at least 6 characters');
  Auth.setPass(k, p); toast('Temporary password set for ' + k);
}
function adminWord() {
  const w = byId('mdW').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w.length < 3) return toast('At least 3 letters');
  const l = DB.get('badwords', []); if (!l.includes(w)) l.push(w);
  DB.set('badwords', l); Filter.add([w]); byId('mdW').value = '';
  Lobby.last = 0; Lobby.sync(); toast('Word added');
}
function adminWipe() {
  uiConfirm('Delete ALL accounts, games, wallets and settings on this device? This cannot be undone.', () => {
    uiConfirm('Really wipe everything?', () => { DB.wipe(); location.reload(); }, 'Wipe everything');
  }, 'Continue');
}

Lobby.start();
